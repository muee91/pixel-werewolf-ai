#!/usr/bin/env bash
# 构建随 Mac App 分发的精简 TTS 虚拟环境(仅 Edge TTS 所需,约 40MB)。
# 完整引擎(piper/chattts,含 torch)仍用 server/venv,由本地开发场景使用。
set -euo pipefail
cd "$(dirname "$0")/.."

TARGET=server/venv-edge
rm -rf "$TARGET"
python3 -m venv "$TARGET"
"$TARGET/bin/pip" install --quiet --upgrade pip
"$TARGET/bin/pip" install --quiet edge-tts fastapi "uvicorn[standard]" pydantic
"$TARGET/bin/python3" -c "import edge_tts, fastapi, uvicorn; print('venv-edge OK')"
du -sh "$TARGET"
