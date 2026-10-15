"""NutriMove laptop pose server (PRD §7.7.3, POSE-18).

The phone finds the person with its own box tracker, crops a square, and sends only that small JPEG
(224 px) here. This server runs the same InstantHMR ONNX model the browser would have run and returns the
same numbers (joints in the crop's [-1, 1] space and metric 3D joints), so the web app's adapter and analyzers
are unchanged. Frames live in memory only: nothing is written to disk and nothing is logged.

Protocol (WebSocket /ws/pose?token=...):
  client -> binary: [uint32 LE frame_id][float32 LE x3 cliff][JPEG bytes]
  server -> text JSON: {"id", "ms", "j2": [140 floats], "j3": [210 floats] | null}, in the order frames arrived,
            or {"id", "error": "dropped" | "bad frame"} for a frame that was skipped.
"""
from __future__ import annotations

import asyncio
import io
import json
import os
import secrets
import struct
import time
from pathlib import Path

import numpy as np
import onnxruntime as ort
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image

HERE = Path(__file__).resolve().parent
MODEL_PATH = Path(os.environ.get("NM_MODEL", HERE / "models" / "instanthmr.onnx"))
TOKEN = os.environ.get("NM_TOKEN") or f"{secrets.randbelow(10**6):06d}"
ALLOWED_ORIGINS = [
    o.strip()
    for o in os.environ.get(
        "NM_ORIGINS", "https://nutri-move-ai.vercel.app,http://localhost:3000"
    ).split(",")
    if o.strip()
]
# Vercel preview URLs (https://nutri-move-ai-git-<branch>-<team>.vercel.app) are allowed too.
ALLOW_VERCEL_PREVIEWS = os.environ.get("NM_ALLOW_PREVIEWS", "1") == "1"
SIZE = 224
MAX_QUEUE = 4  # frames waiting on the laptop before the oldest is dropped
MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32).reshape(3, 1, 1)
STD = np.array([0.229, 0.224, 0.225], dtype=np.float32).reshape(3, 1, 1)


def add_nvidia_dll_dirs() -> None:
    """Windows: cuDNN loads its sub-libraries (cudnn_engines_*.dll, ...) by name at run time, so the folders of the
    nvidia-* pip packages must be on the DLL search path, not just preloaded."""
    if os.name != "nt":
        return
    import site

    roots = [Path(p) / "nvidia" for p in site.getsitepackages() + [site.getusersitepackages()]]
    for root in roots:
        if not root.is_dir():
            continue
        for sub in root.glob("*/bin"):
            os.add_dll_directory(str(sub))
            os.environ["PATH"] = f"{sub}{os.pathsep}{os.environ.get('PATH', '')}"


def make_session(path: Path) -> ort.InferenceSession:
    if not path.exists():
        raise SystemExit(
            f"Model not found at {path}.\n"
            "Download it once:  python download_model.py   (or set NM_MODEL=/path/to/instanthmr.onnx)"
        )
    add_nvidia_dll_dirs()
    if hasattr(ort, "preload_dlls"):
        # Loads CUDA / cuDNN from the nvidia-* pip packages (onnxruntime-gpu[cuda,cudnn]) so no system install is needed.
        try:
            ort.preload_dlls()
        except Exception as e:  # noqa: BLE001 - fall back to CPU below
            print(f"GPU libraries not loaded ({e}); using the CPU")
    wanted = ["CUDAExecutionProvider", "CPUExecutionProvider"]
    providers = [p for p in wanted if p in ort.get_available_providers()]
    opts = ort.SessionOptions()
    opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
    opts.log_severity_level = 3  # errors only; ORT's performance hints are noise here
    sess = ort.InferenceSession(str(path), opts, providers=providers)
    if sess.get_providers()[0] != "CPUExecutionProvider":
        # A GPU that fails on the first real run (e.g. a missing cuDNN file) is replaced by the CPU now, not mid-workout.
        try:
            warm_up(sess)
        except Exception as e:  # noqa: BLE001
            print(f"GPU run failed ({str(e).splitlines()[0][:160]}); using the CPU instead")
            sess = ort.InferenceSession(str(path), opts, providers=["CPUExecutionProvider"])
    warm_up(sess)
    return sess


def warm_up(sess: ort.InferenceSession) -> None:
    ins = sess.get_inputs()
    sess.run(None, {ins[0].name: np.zeros((1, 3, SIZE, SIZE), np.float32), ins[1].name: np.zeros((1, 3), np.float32)})


session = make_session(MODEL_PATH)
INPUTS = [i.name for i in session.get_inputs()]
OUTPUTS = [o.name for o in session.get_outputs()]
PROVIDER = session.get_providers()[0]


def infer(jpeg: bytes, cliff: np.ndarray) -> tuple[np.ndarray, np.ndarray | None]:
    img = Image.open(io.BytesIO(jpeg)).convert("RGB")
    if img.size != (SIZE, SIZE):
        img = img.resize((SIZE, SIZE), Image.BILINEAR)
    x = np.asarray(img, dtype=np.float32).transpose(2, 0, 1) / 255.0
    x = ((x - MEAN) / STD)[None]
    out = session.run(None, {INPUTS[0]: x, INPUTS[1]: cliff.reshape(1, 3).astype(np.float32)})
    by_name = dict(zip(OUTPUTS, out))
    j2 = by_name.get("joints_2d", out[3])
    j3 = by_name.get("joints_3d", out[4] if len(out) > 4 else None)
    return np.asarray(j2, dtype=np.float32).reshape(-1), (
        None if j3 is None else np.asarray(j3, dtype=np.float32).reshape(-1)
    )


app = FastAPI(title="NutriMove pose server", docs_url=None, redoc_url=None, openapi_url=None)
app.add_middleware(CORSMiddleware, allow_origins=ALLOWED_ORIGINS, allow_origin_regex=r"https://nutri-move-ai.*\.vercel\.app" if ALLOW_VERCEL_PREVIEWS else None, allow_methods=["GET"])
busy = asyncio.Lock()  # one client at a time


def origin_ok(origin: str | None) -> bool:
    if not origin:
        return False
    if origin in ALLOWED_ORIGINS:
        return True
    return ALLOW_VERCEL_PREVIEWS and origin.startswith("https://nutri-move-ai") and origin.endswith(".vercel.app")


@app.get("/health")
def health():
    return {"ok": True, "provider": PROVIDER, "busy": busy.locked()}


@app.websocket("/ws/pose")
async def pose(ws: WebSocket):
    if not origin_ok(ws.headers.get("origin")) or not secrets.compare_digest(
        ws.query_params.get("token", ""), TOKEN
    ):
        await ws.close(code=4401)
        return
    if busy.locked():
        await ws.close(code=4409)  # someone else is connected
        return
    async with busy:
        await ws.accept()
        loop = asyncio.get_running_loop()
        # Frames are answered in order. The phone keeps at most a few in flight; if more pile up (slow laptop),
        # the oldest are dropped with an "error: dropped" reply so latency never builds up.
        queue: asyncio.Queue[bytes | None] = asyncio.Queue()

        async def reader():
            try:
                while True:
                    msg = await ws.receive_bytes()
                    while queue.qsize() >= MAX_QUEUE:
                        old = queue.get_nowait()
                        if old is not None and len(old) >= 4:
                            await ws.send_text(json.dumps({"id": struct.unpack_from("<I", old, 0)[0], "error": "dropped"}))
                    queue.put_nowait(msg)
            except (WebSocketDisconnect, RuntimeError):
                pass
            finally:
                queue.put_nowait(None)

        task = asyncio.create_task(reader())
        try:
            while True:
                msg = await queue.get()
                if msg is None:
                    break
                if len(msg) < 17:
                    continue
                fid = struct.unpack_from("<I", msg, 0)[0]
                cliff = np.frombuffer(msg, dtype="<f4", count=3, offset=4)
                t0 = time.perf_counter()
                try:
                    j2, j3 = await loop.run_in_executor(None, infer, msg[16:], cliff)
                except Exception:
                    await ws.send_text(json.dumps({"id": fid, "error": "bad frame"}))
                    continue
                await ws.send_text(
                    json.dumps(
                        {
                            "id": fid,
                            "ms": round((time.perf_counter() - t0) * 1000, 1),
                            "j2": [round(float(v), 5) for v in j2],
                            "j3": None if j3 is None else [round(float(v), 5) for v in j3],
                        }
                    )
                )
        except (WebSocketDisconnect, RuntimeError):
            pass
        finally:
            task.cancel()


if __name__ == "__main__":
    import uvicorn

    print(f"provider: {PROVIDER}  token: {TOKEN}")
    uvicorn.run(app, host="127.0.0.1", port=int(os.environ.get("PORT", "8000")), log_level="warning")
