#!/usr/bin/env python3
"""Local Kokoro TTS + whisper_timestamped word captions."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
import soundfile as sf
import whisper_timestamped as whisper
from kokoro import KPipeline

ROOT = Path(__file__).resolve().parent
PUBLIC_DIR = ROOT / "public"
AUDIO_PATH = PUBLIC_DIR / "audio.wav"
CAPTIONS_PATH = PUBLIC_DIR / "captions.json"
SAMPLE_RATE = 24000
VOICES = ("af_heart", "af_sarah")
WHISPER_MODEL = "tiny"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate local TTS audio and word timestamps.")
    parser.add_argument("text", nargs="+", help="Narration text to synthesize")
    parser.add_argument("--voice", default=VOICES[0], help="Kokoro voice (af_heart or af_sarah)")
    return parser.parse_args()


def synthesize(text: str, preferred_voice: str) -> None:
    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
    pipeline = KPipeline(lang_code="a")
    voices = [preferred_voice] + [v for v in VOICES if v != preferred_voice]
    last_error = None
    audio_chunks: list[np.ndarray] = []

    for voice in voices:
        audio_chunks = []
        try:
            for _, _, audio in pipeline(text, voice=voice):
                audio_chunks.append(np.asarray(audio, dtype=np.float32))
            if audio_chunks:
                break
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            continue

    if not audio_chunks:
        raise RuntimeError(f"Kokoro produced no audio: {last_error}")

    waveform = np.concatenate(audio_chunks)
    sf.write(str(AUDIO_PATH), waveform, SAMPLE_RATE)


def extract_captions() -> list[dict]:
    model = whisper.load_model(WHISPER_MODEL, device="cpu")
    result = whisper.transcribe(model, str(AUDIO_PATH), language="en")
    captions: list[dict] = []
    for segment in result.get("segments") or []:
        for word in segment.get("words") or []:
            token = str(word.get("text") or "").strip()
            if not token:
                continue
            captions.append(
                {
                    "text": token,
                    "startMs": int(round(float(word["start"]) * 1000)),
                    "endMs": int(round(float(word["end"]) * 1000)),
                }
            )
    return captions


def main() -> int:
    args = parse_args()
    text = " ".join(args.text).strip()
    if not text:
        print("Text is required", file=sys.stderr)
        return 1

    synthesize(text, args.voice)
    captions = extract_captions()
    CAPTIONS_PATH.write_text(json.dumps(captions, ensure_ascii=False), encoding="utf-8")
    print(json.dumps({"audio": str(AUDIO_PATH), "captions": str(CAPTIONS_PATH), "wordCount": len(captions)}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
