const express = require('express');
const cors = require('cors');
const multer = require('multer');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { PDFParse } = require('pdf-parse');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

const PORT = 5000;
const OLLAMA_URL = 'http://localhost:11434/api/generate';
const OLLAMA_MODEL = 'llama3.2';

app.use(cors());
app.use(express.json());

app.post('/api/parse-pdf', upload.single('pdf'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      error: 'No PDF uploaded. Send a multipart file in the "pdf" field.',
    });
  }

  let parser;
  try {
    parser = new PDFParse({ data: req.file.buffer });
    const pdfResult = await parser.getText();
    const extractedText = pdfResult.text || '';

    const prompt = `Turn the following PDF text into a catchy short-form video script.

Return ONLY valid JSON with this exact shape:
{
  "scenes": [
    {
      "sceneNumber": 1,
      "narrationText": "",
      "visualDescription": ""
    }
  ]
}

Rules:
- scenes is an array of scene objects.
- sceneNumber is a 1-based integer.
- narrationText is spoken voiceover for that scene.
- visualDescription describes what should appear on screen.
- Use as many scenes as needed to cover the content.

PDF text:
${extractedText}`;

    const ollamaResponse = await axios.post(
      OLLAMA_URL,
      {
        model: OLLAMA_MODEL,
        prompt,
        format: 'json',
        stream: false,
      },
      { timeout: 120000 }
    );

    let script;
    const raw = ollamaResponse.data && ollamaResponse.data.response;
    try {
      script = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch {
      script = { scenes: [{ sceneNumber: 1, narrationText: '', visualDescription: '' }] };
    }

    if (!script || !Array.isArray(script.scenes)) {
      script = { scenes: [{ sceneNumber: 1, narrationText: '', visualDescription: '' }] };
    }

    return res.json(script);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message || 'Failed to parse PDF' });
  } finally {
    if (parser) {
      await parser.destroy().catch(() => {});
    }
  }
});

app.post('/api/generate-voice', (req, res) => {
  const narrationText = req.body && req.body.narrationText;
  if (!narrationText || !String(narrationText).trim()) {
    return res.status(400).json({ error: 'narrationText is required' });
  }

  const python = path.join(__dirname, 'venv', 'Scripts', 'python.exe');
  const script = path.join(__dirname, 'generate_audio_local.py');
  const captionsPath = path.join(__dirname, 'public', 'captions.json');

  const child = spawn(
    python,
    [script, String(narrationText)],
    { cwd: __dirname, windowsHide: true }
  );

  let stdout = '';
  let stderr = '';
  let responded = false;

  const fail = (status, error) => {
    if (responded) return;
    responded = true;
    res.status(status).json({ error, stderr: stderr.slice(-4000) });
  };

  child.stdout.on('data', (chunk) => {
    stdout += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });
  child.on('error', (err) => {
    fail(500, `Failed to start Python: ${err.message}`);
  });
  child.on('close', (code) => {
    if (responded) return;
    if (code !== 0) {
      return fail(500, `Voice pipeline exited with code ${code}`);
    }
    try {
      const captions = JSON.parse(fs.readFileSync(captionsPath, 'utf8'));
      responded = true;
      return res.json({
        audioPath: 'public/audio.wav',
        captionsPath: 'public/captions.json',
        captions,
        stdout: stdout.trim() || undefined,
      });
    } catch (err) {
      return fail(500, `Pipeline finished but captions were missing: ${err.message}`);
    }
  });
});

const { exec } = require('child_process');

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

const execYtdlp = require('yt-dlp-exec');
const { exec } = require('child_process');
const axios = require('axios');

app.post('/api/extract-style', async (req, res) => {
  const { videoUrl, rawText } = req.body;
  let transcriptText = rawText || '';

  try {
    if (videoUrl) {
      await execYtdlp(videoUrl, {
        extractAudio: true,
        audioFormat: 'wav',
        output: 'temp/sample_audio.wav',
      });

      const { stdout } = await exec(`.\\venv\\Scripts\\python.exe transcribe.py temp/sample_audio.wav`);
      transcriptText = JSON.parse(stdout).text;
    }

    const ollamaResponse = await axios.post('http://localhost:11434/api/generate', {
      model: 'llama3.2',
      prompt: `Analyze this transcript and return ONLY JSON with fields fontFamily, primaryColor, hookType, pacing: "${transcriptText}"`,
      stream: false,
      format: 'json'
    });

    res.json(JSON.parse(ollamaResponse.data.response));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
