// Só disponibiliza valores PÚBLICOS necessários ao cliente Supabase.
// Nunca devolver secret key, service_role ou OPENAI_API_KEY.
module.exports = function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ error: 'Método não permitido.' }); }
  const url = process.env.SUPABASE_URL;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !publishableKey) return res.status(200).json({ configured: false });
  return res.status(200).json({ configured: true, url, publishableKey });
};
