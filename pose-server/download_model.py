"""Downloads the InstantHMR ONNX model into pose-server/models/ (one time, ~81 MB)."""
import sys
import urllib.request
from pathlib import Path

URL = "https://huggingface.co/momolesang/InstantHMR/resolve/main/instanthmr.onnx"
dest = Path(__file__).resolve().parent / "models" / "instanthmr.onnx"
dest.parent.mkdir(exist_ok=True)
if dest.exists() and dest.stat().st_size > 50_000_000:
    print(f"already have {dest}")
    sys.exit(0)
print(f"downloading {URL} ...")
urllib.request.urlretrieve(URL, dest)
print(f"saved {dest} ({dest.stat().st_size / 1e6:.0f} MB)")
