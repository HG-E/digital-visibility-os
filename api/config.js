/**
 * /api/config — returns Supabase public credentials to the SPA.
 * The anon key is safe to expose (Row Level Security controls access).
 * Set SUPABASE_URL and SUPABASE_ANON_KEY in Vercel Dashboard → Settings → Environment Variables.
 */
export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json');
  // Only serve to same origin
  const origin = req.headers.origin || req.headers.referer || '';
  if (origin && !origin.includes('digital-visibility-os.vercel.app') && !origin.includes('localhost')) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const url = process.env.SUPABASE_URL || null;
  const key = process.env.SUPABASE_ANON_KEY || null;
  res.status(200).json({ url, key });
}
