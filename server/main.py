import os
import io
import edge_tts
from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

MAX_TEXT_LENGTH = 1500
LAN_ORIGIN_REGEX = (
    r"^http://("
    r"localhost|127\.0\.0\.1|"
    r"10\.\d{1,3}\.\d{1,3}\.\d{1,3}|"
    r"192\.168\.\d{1,3}\.\d{1,3}|"
    r"172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}"
    r"):\d+$"
)

CORS_ORIGINS = [
    origin.strip()
    for origin in os.environ.get("CORS_ORIGINS", "http://localhost:5173,http://localhost:3000").split(",")
    if origin.strip()
]
ENABLE_LAN_CORS = os.environ.get("ENABLE_LAN_CORS", "true").lower() != "false"

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_origin_regex=LAN_ORIGIN_REGEX if ENABLE_LAN_CORS else None,
    allow_methods=["*"],
    allow_headers=["*"],
)

class TTSRequest(BaseModel):
    text: str
    voice: str
    rate: str = "+0%"
    pitch: str = "+0Hz"
    speed: float = 1.0

class PreviewRequest(BaseModel):
    text: str = "你好，我是你的语音助手。"
    engine: str = "edge-tts"
    voice: str
    speed: float = 1.0
    rate: str = "+0%"
    pitch: str = "+0Hz"

@app.get("/engines")
async def get_engines():
    return [
        {
            "id": "edge-tts",
            "name": "Edge TTS (微软)",
            "available": True,
            "installStatus": "installed",
            "installMessage": "",
            "description": "微软 Edge TTS 引擎，支持 500+ 多语言音色",
        }
    ]

@app.post("/engines/{engine_id}/install")
async def install_engine(engine_id: str):
    if engine_id == "edge-tts":
        return {"status": "installed", "message": "Edge TTS 已内置"}
    raise HTTPException(status_code=404, detail=f"Unknown engine: {engine_id}")

@app.post("/preview")
async def preview_tts(request: PreviewRequest):
    if len(request.text) > MAX_TEXT_LENGTH:
        raise HTTPException(status_code=400, detail="文本过长")
    try:
        communicate = edge_tts.Communicate(request.text, request.voice, rate=request.rate, pitch=request.pitch)
        audio_data = b""
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio_data += chunk["data"]
        return Response(content=audio_data, media_type="audio/mpeg")
    except Exception as e:
        print(f"Edge TTS Preview Error: {e}")
        raise HTTPException(status_code=500, detail="语音生成失败")

@app.get("/voices")
async def get_voices():
    try:
        voices_manager = await edge_tts.VoicesManager.create()
        return voices_manager.voices
    except Exception as e:
        print(f"Edge TTS Voices Error: {e}")
        raise HTTPException(status_code=500, detail="获取语音列表失败")

@app.post("/tts")
async def generate_tts(request: TTSRequest):
    if not request.text:
        raise HTTPException(status_code=400, detail="文本不能为空")
    if len(request.text) > MAX_TEXT_LENGTH:
        raise HTTPException(status_code=400, detail="文本过长")
    try:
        communicate = edge_tts.Communicate(request.text, request.voice, rate=request.rate, pitch=request.pitch)
        audio_data = b""
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio_data += chunk["data"]
        return Response(content=audio_data, media_type="audio/mpeg")
    except Exception as e:
        print(f"Edge TTS Error: {e}")
        raise HTTPException(status_code=500, detail="语音生成失败")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
