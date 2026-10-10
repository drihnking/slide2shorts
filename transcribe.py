import sys
import json
import whisper_timestamped as whisper

def transcribe(audio_path):
    model = whisper.load_model("tiny", device="cpu")
    audio = whisper.load_audio(audio_path)
    result = whisper.transcribe(model, audio)
    text = result.get("text", "").strip()
    print(json.dumps({"text": text}))

if __name__ == "__main__":
    if len(sys.argv) > 1:
        transcribe(sys.argv[1])