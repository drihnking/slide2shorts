const express = require('express');
const cors = require('cors');
const multer = require('multer');
const axios = require('axios');
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

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
