console.log('Running:', __filename);

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
const OLLAMA_URL = 'http://127.0.0.1:11434/api/generate';
const OLLAMA_MODEL = 'llama3.2'; // try 'llama3.1:8b' for more faithful study guides (ollama pull llama3.1:8b)

// Study guide settings
const CHUNK_CHARS = 3500;   // how much PDF text goes into each study-guide section
const MAX_SECTIONS = 40;    // safety cap so a huge PDF can't run forever

// Middleware
app.use(cors());
app.use(express.json());

// Serve static dashboard files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Explicit route to serve index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Setup multer for memory storage (PDF uploads)
const upload = multer({ storage: multer.memoryStorage() });

// -------------------------------------------------------------
// Saved results (style + script) so the video can use them later.
// Files live in /public so Remotion can read them with staticFile().
// -------------------------------------------------------------
const PUBLIC_DIR = path.join(__dirname, 'public');
const STYLE_PATH = path.join(PUBLIC_DIR, 'style.json');
const SCRIPT_PATH = path.join(PUBLIC_DIR, 'script.json');
fs.mkdirSync(PUBLIC_DIR, { recursive: true });

const DEFAULT_STYLE = {
  primaryColor: '#ffffff',
  fontFamily: 'Inter',
  fontSize: 64,
  captionPosition: 'bottom'
};

// Clamp/validate style values so bad input can't break the video
function sanitizeStyle(input = {}) {
  const primaryColor = /^#[0-9a-fA-F]{6}$/.test(input.primaryColor)
    ? input.primaryColor
    : DEFAULT_STYLE.primaryColor;
  const fontFamily =
    String(input.fontFamily || '').replace(/[^a-zA-Z0-9 \-]/g, '').trim() ||
    DEFAULT_STYLE.fontFamily;
  const sizeNum = Number(input.fontSize);
  const fontSize = Number.isFinite(sizeNum)
    ? Math.min(200, Math.max(16, Math.round(sizeNum)))
    : DEFAULT_STYLE.fontSize;
  const captionPosition = ['top', 'center', 'bottom'].includes(input.captionPosition)
    ? input.captionPosition
    : DEFAULT_STYLE.captionPosition;
  return { primaryColor, fontFamily, fontSize, captionPosition };
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return fallback;
  }
}

app.get('/api/style', (req, res) => {
  res.json(sanitizeStyle(readJson(STYLE_PATH, DEFAULT_STYLE)));
});

app.post('/api/save-style', (req, res) => {
  const style = sanitizeStyle(req.body);
  fs.writeFileSync(STYLE_PATH, JSON.stringify(style, null, 2));
  res.json({ success: true, style });
});

app.get('/api/script', (req, res) => {
  res.json(readJson(SCRIPT_PATH, { script: '', segments: [] }));
});

// -------------------------------------------------------------
// Helpers for the study guide generator
// -------------------------------------------------------------

// Split text into chunks of roughly maxChars, breaking on line boundaries
function chunkText(text, maxChars) {
  const lines = text.split(/\r?\n/);
  const chunks = [];
  let current = '';
  for (const line of lines) {
    if (current && (current.length + line.length + 1) > maxChars) {
      chunks.push(current.trim());
      current = '';
    }
    current += line + '\n';
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

// Remove screenplay/markdown artifacts but keep parentheses (definitions use them)
function cleanSection(raw) {
  let s = (raw || '').trim();
  s = s
    .replace(/^(here('s| is)|sure|okay|certainly)[^\n]*\n+/i, '') // chatty first line
    .replace(/\[\s*\d[^\]]*\]/g, '')          // [0-5 seconds]
    .replace(/\*\*/g, '')                     // bold markers
    .replace(/^#+\s*/gm, '')                  // markdown headings
    .replace(/^\s*[-*•]\s+/gm, '')            // bullet markers
    .replace(/^\s*Narrator:\s*/gim, '')       // speaker labels
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return s;
}

function buildStudyGuidePrompt(chunk, index, total) {
  return `You are writing part ${index + 1} of ${total} of a spoken study guide that a student will listen to while preparing for a midterm or final exam.

Rules:
- Output ONLY plain spoken sentences. No markdown, bullet points, numbered lists, headings, timestamps, scene directions, or speaker labels.
- Begin by naming the topic of this part in one sentence.
- Define every key term precisely, using the wording from the slides.
- State every rule, step, formula, or condition exactly as the slides give it.
- Walk through every example from the slides and explain what it demonstrates.
- Point out common mistakes or distinctions the student should not mix up, but only if the slides support them.
- Use ONLY information in the slide text below. Do not add outside facts, analogies, or examples of your own.
- End with one sentence that starts with "To remember:" summarizing the single most testable idea.
- Length: 200 to 350 words.

Slide text for this part:
${chunk}`;
}

// -------------------------------------------------------------
// Step 1: Style Extractor Endpoint
// -------------------------------------------------------------
app.post('/api/extract-style', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required.' });

    const prompt = `Analyze this vertical video request for style rules: "${url}". 
Return ONLY a valid JSON object matching this schema with no extra text or markdown formatting:
{
  "primaryColor": "#ffffff",
  "fontFamily": "Inter",
  "fontSize": 48,
  "captionPosition": "bottom"
}`;

    const ollamaRes = await axios.post(OLLAMA_URL, {
      model: OLLAMA_MODEL,
      prompt: prompt,
      stream: false
    });

    let rawResponse = ollamaRes.data.response || '';
    rawResponse = rawResponse.replace(/```json/g, '').replace(/```/g, '').trim();

    const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Ollama did not return a valid JSON structure.');
    }

    // Validate, auto-save for the video, and return the cleaned values
    const styleData = sanitizeStyle(JSON.parse(jsonMatch[0]));
    fs.writeFileSync(STYLE_PATH, JSON.stringify(styleData, null, 2));
    res.json(styleData);

  } catch (err) {
    console.error('Style Extraction Error:', err);
    const errorMessage = err.response?.data?.error || err.message || 'Failed to extract style profile.';
    res.status(500).json({ error: String(errorMessage) });
  }
});

// -------------------------------------------------------------
// Step 2: PDF Parsing & Study Guide Script Endpoint
// -------------------------------------------------------------
app.post('/api/parse-pdf', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No PDF file uploaded.' });
    }

    // pdf-parse v2: class-based API, use getText() and destroy()
    const parser = new PDFParse({ data: req.file.buffer });
    const pdfData = await parser.getText();
    await parser.destroy();
    const extractedText = (pdfData.text || '').trim();

    console.log('PDF text length:', extractedText.length);

    if (!extractedText) {
      return res.status(400).json({
        error: 'Failed to extract text from PDF. The file might be image-based or protected.'
      });
    }

    // Split the whole PDF into chunks and write one study-guide section per chunk
    const chunks = chunkText(extractedText, CHUNK_CHARS).slice(0, MAX_SECTIONS);
    console.log(`Generating ${chunks.length} study guide section(s)...`);

    const segments = [];
    for (let i = 0; i < chunks.length; i++) {
      console.log(`Section ${i + 1}/${chunks.length}`);
      const ollamaRes = await axios.post(OLLAMA_URL, {
        model: OLLAMA_MODEL,
        prompt: buildStudyGuidePrompt(chunks[i], i, chunks.length),
        stream: false,
        options: {
          num_ctx: 8192,
          temperature: 0.3
        }
      });
      const cleaned = cleanSection(ollamaRes.data.response);
      if (cleaned) segments.push(cleaned);
    }

    // "script" is for display/copying; "segments" is one entry per clip
    const script = segments
      .map((s, i) => `=== SECTION ${i + 1} ===\n${s}`)
      .join('\n\n\n');

    // Auto-save so the script survives page reloads and can be used later
    fs.writeFileSync(SCRIPT_PATH, JSON.stringify({ script, segments }, null, 2));

    res.json({ script, segments });

  } catch (err) {
    console.error('PDF Processing Error:', err);
    res.status(500).json({ error: err.message || 'Error processing PDF file.' });
  }
});

// -------------------------------------------------------------
// Step 3: Local Python TTS & Whisper Captions Generation
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
// Step 4: Remotion Video Rendering Endpoint
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