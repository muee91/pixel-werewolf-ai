#!/bin/bash

# Navigate to server directory
cd "$(dirname "$0")/../server"

# Check if venv exists, if not create it
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

# Activate venv and install only the Edge TTS API dependencies used by main.py.
source venv/bin/activate
if ! python -c "import edge_tts, fastapi, uvicorn, pydantic" >/dev/null 2>&1; then
    echo "Installing Edge TTS dependencies..."
    pip install -r requirements-edge.txt
fi

# Start the server
echo "Starting Edge TTS Backend on http://localhost:8000..."
python main.py
