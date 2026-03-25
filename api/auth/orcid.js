/**
 * /api/auth/orcid — ORCID OAuth 2.0 callback handler
 *
 * Flow:
 *   1. ORCID redirects here with ?code=XXX after user approves
 *   2. We exchange the code for an ORCID access token (server-side — secret never exposed)
 *   3. We create or find the Supabase user keyed on their ORCID iD
 *   4. We generate a Supabase magic link and redirect the user's browser to it
 *   5. Supabase verifies the link and redirects to /app with a session
 *
 * Required env vars (Vercel Dashboard → Settings → Environment Variables):
 *   ORCID_CLIENT_ID       — from https://orcid.org/developer-tools
 *   ORCID_CLIENT_SECRET   — from https://orcid.org/developer-tools
 *   SUPABASE_URL          — Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY — Supabase service role key (NEVER expose to frontend)
 *   SITE_URL              — optional, defaults to production URL
 */

import { createClient } from '@supabase/supabase-js';

const SITE = process.env.SITE_URL || 'https://digital-visibility-os.vercel.app';
const REDIRECT_URI = `${SITE}/api/auth/orcid`;

export default async function handler(req, res) {
  const { code, error: orcidError } = req.query;

  if (orcidError) {
    return res.redirect(307, `${SITE}/app?auth_error=${encodeURIComponent(orcidError)}`);
  }
  if (!code) {
    return res.redirect(307, `${SITE}/app?auth_error=missing_code`);
  }
  if (!process.env.ORCID_CLIENT_ID || !process.env.ORCID_CLIENT_SECRET) {
    return res.redirect(307, `${SITE}/app?auth_error=orcid_not_configured`);
  }

  try {
    // ── 1. Exchange authorization code for ORCID token ──────────────────
    const tokenRes = await fetch('https://orcid.org/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: new URLSearchParams({
        client_id:     process.env.ORCID_CLIENT_ID,
        client_secret: process.env.ORCID_CLIENT_SECRET,
        grant_type:    'authorization_code',
        code,
        redirect_uri:  REDIRECT_URI,
      }),
    });
    const token = await tokenRes.json();
    const orcidId   = token.orcid;
    const orcidName = token.name || '';

    if (!orcidId) throw new Error(`ORCID token exchange failed: ${JSON.stringify(token)}`);

    // ── 2. Create Supabase admin client (service role — server only) ──────
    const sb = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    );

    // ── 3. Deterministic email keyed on ORCID iD (internal — never shown) ─
    const email = `orcid.${orcidId.toLowerCase().replace(/-/g, '')}@internal.dvos`;

    // Try to create user — if already exists the error is benign
    await sb.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: {
        orcid_id:  orcidId,
        full_name: orcidName,
        provider:  'orcid',
      },
    }).catch(() => { /* user already exists — fine */ });

    // ── 4. Generate sign-in magic link (valid once, expires in 1 hour) ───
    const { data: linkData, error: linkErr } = await sb.auth.admin.generateLink({
      type:  'magiclink',
      email,
      options: { redirectTo: `${SITE}/app` },
    });

    if (linkErr || !linkData?.properties?.action_link) {
      throw linkErr || new Error('generateLink returned no action_link');
    }

    // ── 5. Redirect browser to Supabase verification link → /app ─────────
    res.redirect(307, linkData.properties.action_link);

  } catch (err) {
    console.error('[ORCID Auth]', err.message);
    res.redirect(307, `${SITE}/app?auth_error=orcid_failed`);
  }
}
