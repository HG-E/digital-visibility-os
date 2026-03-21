/**
 * DVOS — Claude API Proxy (Cloudflare Worker)
 *
 * Deploy:
 *   1. npm install -g wrangler
 *   2. wrangler login
 *   3. wrangler secret put ANTHROPIC_API_KEY   ← paste your key when prompted
 *   4. (optional) wrangler secret put ALLOWED_ORIGIN  ← restrict to your domain
 *   5. wrangler deploy
 *
 * Your proxy URL will be: https://dvos-proxy.<your-subdomain>.workers.dev
 * Paste that into DVOS when prompted for "Proxy URL".
 */

const ANTHROPIC_API  = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VER  = '2023-06-01';
const MAX_TOKENS_CAP = 2000; // prevent runaway costs

export default {
  async fetch(request, env) {
    // Determine allowed origin — restrict to configured domain or '*' for dev
    const allowedOrigin = env.ALLOWED_ORIGIN || '*';
    const origin = request.headers.get('Origin') || '';

    // If ALLOWED_ORIGIN is set, reject requests from other origins
    if (env.ALLOWED_ORIGIN && origin !== env.ALLOWED_ORIGIN) {
      return new Response(JSON.stringify({ error: 'Origin not allowed' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const corsHeaders = {
      'Access-Control-Allow-Origin':  allowedOrigin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age':       '86400',
    };

    // ── CORS preflight ──────────────────────────────────────────
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405, corsHeaders);
    }

    // ── Parse body ──────────────────────────────────────────────
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Invalid JSON body' }, 400, corsHeaders);
    }

    if (!body.messages) {
      return json({ error: 'Missing messages field' }, 400, corsHeaders);
    }

    // ── Safety cap ──────────────────────────────────────────────
    if (!body.max_tokens || body.max_tokens > MAX_TOKENS_CAP) {
      body.max_tokens = MAX_TOKENS_CAP;
    }

    // ── Forward to Anthropic ────────────────────────────────────
    let upstream;
    try {
      upstream = await fetch(ANTHROPIC_API, {
        method:  'POST',
        headers: {
          'Content-Type':      'application/json',
          'x-api-key':         env.ANTHROPIC_API_KEY,
          'anthropic-version': ANTHROPIC_VER,
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      return json({ error: 'Upstream unreachable', detail: err.message }, 502, corsHeaders);
    }

    // ── Stream response back with CORS header ───────────────────
    return new Response(upstream.body, {
      status:  upstream.status,
      headers: {
        'Content-Type':                upstream.headers.get('Content-Type') || 'application/json',
        'Access-Control-Allow-Origin': allowedOrigin,
      },
    });
  },
};

function json(obj, status = 200, extra = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...extra },
  });
}