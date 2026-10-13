#!/usr/bin/env bash
# Starts the pose server and a free Cloudflare quick tunnel, then prints the pairing link.
# Usage: ./start.sh [web app URL]     (default https://nutri-move-ai.vercel.app)
set -euo pipefail
cd "$(dirname "$0")"
APP="${1:-https://nutri-move-ai.vercel.app}"
PORT="${PORT:-8000}"
export NM_TOKEN="${NM_TOKEN:-$(printf '%06d' $((RANDOM * RANDOM % 1000000)))}"
PY="${PYTHON:-python3}"
[ -f models/instanthmr.onnx ] || "$PY" download_model.py
PORT=$PORT "$PY" server.py &
SERVER=$!
trap 'kill $SERVER 2>/dev/null || true' EXIT
for _ in $(seq 1 60); do curl -fs "http://127.0.0.1:$PORT/health" >/dev/null && break; sleep 1; done
echo "pose server up. pairing code: $NM_TOKEN"
echo "starting tunnel (look for the https://....trycloudflare.com line) ..."
cloudflared tunnel --url "http://127.0.0.1:$PORT" 2>&1 | while IFS= read -r line; do
  url=$(printf '%s' "$line" | grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' | head -1 || true)
  if [ -n "$url" ]; then
    echo
    echo "Open this on the phone (type it or scan it as a QR):"
    echo "  $APP/workout/pair?server=${url#https://}&token=$NM_TOKEN"
    echo
  fi
done
