# Slide2Shorts Studio 🎬

Slide2Shorts Studio is a fully local, AI-driven automated video generation platform built for Windows. It transforms raw text or slide decks into short-form vertical videos (9:16 format for Instagram Reels, TikTok, and YouTube Shorts) complete with AI narration, synchronized captions, and customizable visual styles.

---

## 🛠️ Tech Stack & Architecture

- **Backend Framework:** Node.js / Express
- **Video Rendering Engine:** Remotion
- **Local LLM & Style Engine:** Ollama (`llama3.2`)
- **Text-to-Speech (TTS):** Kokoro Python engine (`generate_audio_local.py`)
- **Audio Transcription & Captions:** OpenAI Whisper (`transcribe.py`)
- **Media Ingestion:** `yt-dlp` (`yt-dlp-exec`)
- **Frontend Dashboard:** React / HTML5 single-page application served directly via Express (`public/index.html`)

---

## 🚀 Key Features

1. **PDF & Script Analysis:** Upload slide presentations or text prompts to generate concise, high-converting 30–60 second video scripts using Ollama (`llama3.2`).
2. **Local TTS & Timestamped Captions:** Generate speech audio natively and extract precise word-level subtitle timing via Whisper.
3. **Style Profile Extraction:** Download reference media via `yt-dlp` and extract layout rules (fonts, color schemes, pacing, hook types).
4. **Automated Remotion Rendering:** Compile audio, dynamically placed captions, and visual slides directly into vertical MP4 outputs.
5. **One-Click Local Launcher:** Launch the entire application and Web UI seamlessly using `start.bat`.

---

## 📁 Folder Structure

```text
slide2shorts/
├── public/
│   ├── index.html        # Web Dashboard UI
│   ├── audio.wav         # Output TTS audio
│   ├── captions.json     # Generated subtitle timestamps
│   └── output.mp4        # Rendered Remotion video output
├── src/
│   ├── Composition.tsx   # Core Remotion composition styling
│   └── index.ts          # Remotion entry point
├── temp/                 # Temporary media processing folder
├── venv/                 # Python virtual environment (Whisper / Kokoro)
├── generate_audio_local.py
├── transcribe.py
├── server.js             # Express API backend & static file server
├── start.bat             # One-click Windows launch script
└── package.json
```
## ⚡ Prerequisites & Setup

### 1. Requirements
- **Node.js:** v18+ (verified on Node v24)
- **Python:** 3.10+ with standard audio libraries installed inside `.\venv`
- **Ollama:** Installed locally running the `llama3.2` model
  ```bash
  ollama run llama3.2
  ```
## 🖥️ Running the Application

### Option A: Quick Launch (Recommended)
Double-click `start.bat` in the project root directory. This automatically starts the Express server and opens the dashboard at `http://localhost:5000` in your default web browser.

### Option B: Manual Launch
Run the server directly via PowerShell:

```
powershell
node server.js
```
Then navigate to http://localhost:5000.

## 📡 API Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/parse-pdf` | Uploads PDF slides and generates a video narration script. |
| `POST` | `/api/generate-voice` | Triggers Python TTS and Whisper caption timestamp generation. |
| `POST` | `/api/extract-style` | Downloads reference videos via `yt-dlp` and extracts style parameters[cite: 10]. |
| `GET` | `/api/render-video` | Triggers Remotion CLI rendering to produce `public/output.mp4`[cite: 10]. |
