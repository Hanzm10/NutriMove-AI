# NutriMove laptop pose server (PRD §7.7.3, POSE-18/19/20)

Runs the InstantHMR ONNX model on a laptop so phones that can't run it in the browser (iPhones with little memory)
can still use the camera coach. The phone sends a **224 × 224 JPEG crop** of the person (about 8 KB) ten-ish times a
second; the server replies with joints. Frames are processed in memory: nothing is written to disk or logged.

```
phone (Vercel app) ── wss ──► Cloudflare quick tunnel ──► cloudflared ──► 127.0.0.1:8000 (this server, ONNX Runtime)
```

## One-time setup (laptop)

1. Python 3.10+ and `cloudflared` (https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/).
2. In the `pose-server` folder: `python -m venv .venv`, then `.venv\Scripts\pip install -r requirements.txt`
   (macOS / Linux: `.venv/bin/pip install -r requirements.txt`).
   - NVIDIA GPU (RTX 3060): keep `onnxruntime-gpu` (needs the CUDA 12 + cuDNN 9 runtime; `pip install nvidia-cudnn-cu12` helps).
   - No GPU: replace it with `onnxruntime` in `requirements.txt` (about 90 ms per frame on 4 CPU cores).
3. `python download_model.py` downloads `models/instanthmr.onnx` (81 MB). Starting the server also does this if it's missing.

## Each session

```bash
./start.sh            # macOS / Linux
```

On **Windows**, double-click `start.cmd` in the `pose-server` folder (or run `start.cmd` from Command Prompt or
PowerShell). It runs `start.ps1` through PowerShell; typing `.\start.ps1` in Command Prompt just opens it in Notepad.
Both scripts use `.venv` automatically if it exists, so you don't need to activate it.

It starts the server, opens a free `trycloudflare.com` tunnel, and prints a link like
`https://nutri-move-ai.vercel.app/workout/pair?server=abc-def.trycloudflare.com&token=123456`.
Open it on the phone (type it, or paste it into any QR generator and scan it), read the notice, tap **Connect**. The
camera coach then uses the laptop. The link changes every time the tunnel restarts. Use the same Wi-Fi/hotspot as
the laptop only if you want; the tunnel works over any internet connection.

Laptop browser instead of a phone? You don't need this: the browser runs the model itself.
To test locally without a tunnel: `python server.py`, then pair with `localhost:8000` and the printed code.

## Safety

- A random 6-digit **token** is required, and only the web app's origins may connect (`NM_ORIGINS`, default
  `https://nutri-move-ai.vercel.app,http://localhost:3000`; Vercel preview URLs are allowed, switch off with
  `NM_ALLOW_PREVIEWS=0`).
- One phone at a time; stale frames are dropped so latency doesn't build up.
- The tunnel URL is public but useless without the token. Stop the script when you're done.
- The web app only accepts `*.trycloudflare.com` or `localhost` servers, so a crafted link can't point it elsewhere,
  and nothing is saved until the user taps **Connect**.

## Settings (environment variables)

`NM_MODEL` model path · `NM_TOKEN` fixed pairing code · `NM_ORIGINS` allowed origins · `PORT` (8000).

## Protocol

`/ws/pose?token=…` · client → server binary `[uint32 LE frame id][float32 LE ×3 CLIFF condition][JPEG]` · server →
client JSON `{id, ms, j2: 140 floats in crop space [-1,1], j3: 210 floats (metres, Y down)}`. `/health` returns the provider.
