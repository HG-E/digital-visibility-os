/**
 * DVOS — Claude API Proxy (Node.js / Express)
 *
 * Alternative to the Cloudflare Worker — run on any VPS or PaaS.
 *
 * Setup:
 *   npm install
 *   cp .env.example .env     ← add your ANTHROPIC_API_KEY
 *   npm start
 *
 * Then set your DVOS Proxy URL to: http://localhost:3001  (or your server URL)
 *
 * Optional env vars:
 *   ALLOWED_ORIGIN=https://yoursite.com   ← restrict CORS (defaults to '*' for dev)
 *   RATE_LIMIT=30                         ← max requests per IP per minute (default 30)
 */

require('dotenv').config();
const express = require('express');
const cors    = require('cors');

const app  = express();
const PORT = process.env.PORT || 3001;

const ANTHROPIC_API  = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VER  = '2023-06-01';
const MAX_TOKENS_CAP = 2000;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || null; // null = '*'
const RATE_LIMIT     = parseInt(process.env.RATE_LIMIT || '30', 10);

// ── CORS ────────────────────────────────────────────────────────
app.use(cors({
  origin: ALLOWED_ORIGIN || '*',
  methods: ['POST', 'OPTIONS'],
}));

app.use(express.json({ limit: '64kb' }));

// ── Per-IP rate limiting (in-memory, resets each minute) ────────
const ipCounters = new Map();
setInterval(() => ipCounters.clear(), 60_000);

function rateLimitMiddleware(req, res, next) {
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
  const count = (ipCounters.get(ip) || 0) + 1;
  ipCounters.set(ip, count);
  if (count > RATE_LIMIT) {
    return res.status(429).json({ error: 'Too many requests — try again in a minute' });
  }
  next();
}

// ── Route ───────────────────────────────────────────────────────
app.post('/', rateLimitMiddleware, async (req, res) => {
  const body = req.body;

  if (!body || !body.messages) {
    return res.status(400).json({ error: 'Missing messages field' });
  }

  // Safety cap
  if (!body.max_tokens || body.max_tokens > MAX_TOKENS_CAP) {
    body.max_tokens = MAX_TOKENS_CAP;
  }

  try {
    const upstream = await fetch(ANTHROPIC_API, {
      method:  'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         process.env.ANTHROPIC_API_KEY,
        'anthropic-version': ANTHROPIC_VER,
      },
      body: JSON.stringify(body),
    });

    res.status(upstream.status);
    res.setHeader('Content-Type', upstream.headers.get('Content-Type') || 'application/json');

    // Pipe stream directly to client (works for both streaming and non-streaming)
    const reader = upstream.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) { res.end(); break; }
        const flushed = res.write(Buffer.from(value));
        if (!flushed) { reader.cancel(); break; } // client disconnected
      }
    } catch (streamErr) {
      console.error('Stream error:', streamErr.message);
      res.end(); // headers already sent — close cleanly, do not attempt to write again
    }

  } catch (err) {
    console.error('Proxy error:', err.message);
    if (!res.headersSent) {
      res.status(502).json({ error: 'Upstream request failed', detail: err.message });
    }
  }
});

app.listen(PORT, () => {
  console.log(`DVOS proxy listening on http://localhost:${PORT}`);
  if (ALLOWED_ORIGIN) console.log(`  CORS restricted to: ${ALLOWED_ORIGIN}`);
  else console.log(`  CORS: open (set ALLOWED_ORIGIN= to restrict)`);
});