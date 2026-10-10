const express = require('express');
const cors = require('cors');
const multer = require('multer');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { spawn, exec } = require('child_process');
const execYtdlp = require('yt-dlp-exec');
const { PDFParse } = require('pdf-parse');

const app = express();
const PORT = 5000;
const OLLAMA_URL = 'http://localhost:11434/api/generate';
const OLLAMA_MODEL = 'llama3.2';

// Middleware
app.use(cors());
app.use(express.json());

// Serve static dashboard files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Explicit route to serve index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Setup multer for PDF file uploads
const upload = multer({ storage: multer.memoryStorage() });

// -------------------------------------------------------------
// Step 2: PDF Parsing & Narration Script Endpoint
// -------------------------------------------------------------
app.post('/api/parse-pdf', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No PDF file uploaded' });
    }

    const pdfData = await PDFParse(req.file.buffer);
    const pdfText = pdfData.text.trim();

    const prompt = `Convert the following slide deck content into an engaging 30-60 second Short/Reel script. Keep sentences clear and concise:\n\n${pdfText}`;

    const ollamaRes = await axios.post(OLLAMA_URL, {
      model: OLLAMA_MODEL,
      prompt: prompt,
      stream: false
    });

    res.json({ script: ollamaRes.data.response });
  } catch (err) {
    console.error('PDF Processing Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// Step 2: Local Python TTS & Whisper Captions Generation
// -------------------------------------------------------------
app.post('/api/generate-voice', (req, res) => {
  const { text } = req.body;
  if (!text) {
    return res.status(400).json({ error: 'No text provided' });
  }

  const pythonProcess = spawn('.\\venv\\Scripts\\python.exe', ['generate_audio_local.py', text]);

  let stdoutData = '';
  let stderrData = '';

  pythonProcess.stdout.on('data', (data) => {
    stdoutData += data.toString();
  });

  pythonProcess.stderr.on('data', (data) => {
    stderrData += data.toString();
  });

  pythonProcess.on('close', (code) => {
    if (code !== 0) {
      console.error(`Python script exited with code ${code}: ${stderrData}`);
      return res.status(500).json({ error: 'Audio generation failed', details: stderrData });
    }
    res.json({ success: true, message: 'Audio and captions generated successfully!' });
  });
});

// -------------------------------------------------------------
// Step 4: Video Style Extractor Endpoint
// -------------------------------------------------------------
app.post('/api/extract-style', async (req, res) => {
  const { videoUrl, rawText } = req.body;
  let transcriptText = rawText || '';

  try {
    if (videoUrl) {
      // Ensure temp directory exists
      if (!fs.existsSync('temp')) {
        fs.mkdirSync('temp');
      }

      await execYtdlp(videoUrl, {
        extractAudio: true,
        audioFormat: 'wav',
        output: 'temp/sample_audio.wav',
      });

      const { stdout } = await exec(`.\\venv\\Scripts\\python.exe transcribe.py temp/sample_audio.wav`);
      transcriptText = JSON.parse(stdout).text;
    }

    const ollamaResponse = await axios.post(OLLAMA_URL, {
      model: OLLAMA_MODEL,
      prompt: `Analyze this transcript and return ONLY JSON with fields fontFamily, primaryColor, hookType, pacing: "${transcriptText}"`,
      stream: false,
      format: 'json'
    });

    res.json(JSON.parse(ollamaResponse.data.response));
  } catch (err) {
    console.error('Extract Style Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// Step 3: Remotion Video Rendering Endpoint
// -------------------------------------------------------------
app.get('/api/render-video', (req, res) => {
  const cmd = `npx remotion render src/index.ts MainComposition public/output.mp4`;

  exec(cmd, (error, stdout, stderr) => {
    if (error) {
      console.error(`Render error: ${error.message}`);
      return res.status(500).json({ error: error.message });
    }
    res.json({ success: true, videoUrl: '/output.mp4' });
  });
});

// Start Server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});