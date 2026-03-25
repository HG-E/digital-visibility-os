/**
 * /api/config — returns Supabase public credentials to the SPA.
 * The anon key is safe to expose (Row Level Security controls access).
 * Set SUPABASE_URL and SUPABASE_ANON_KEY in Vercel Dashboard → Settings → Environment Variables.
 */
export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json');
  const origin = req.headers.origin || req.headers.referer || '';
  if (origin && !origin.includes('digital-visibility-os.vercel.app') && !origin.includes('localhost')) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  res.status(200).json({
    url:           process.env.SUPABASE_URL           || null,
    key:           process.env.SUPABASE_ANON_KEY       || null,
    // Public ORCID client ID (safe to expose — not a secret)
    orcidClientId: process.env.ORCID_CLIENT_ID         || null,
    // Feature flags — tell the frontend which providers are configured
    hasGoogle:     !!(process.env.GOOGLE_OAUTH_ENABLED  || process.env.SUPABASE_URL),
    hasApple:      !!(process.env.APPLE_OAUTH_ENABLED),
    hasOrcid:      !!(process.env.ORCID_CLIENT_ID),
  });
}
