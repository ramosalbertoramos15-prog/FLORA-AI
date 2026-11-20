'use strict';
// FLORA AI — núcleo partilhado das funções da Vercel.
// Ficheiros com "_" na pasta api/ NÃO viram rotas públicas.
// Segredos só existem aqui (servidor). Nunca devolver chaves ao navegador.

const TZ_OFFSET_MS = 2 * 60 * 60 * 1000; // Africa/Maputo = UTC+2 (sem horário de verão)
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const cfg = () => ({
  url: (process.env.SUPABASE_URL || '').replace(/\/$/, ''),
  publishable: process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '',
  secret: process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  openai: process.env.OPENAI_API_KEY || '',
  openaiBase: (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, ''),
  text: textProvider()
});

// Fornecedor de texto: AI_PROVIDER (groq|gemini|openai) ou, por defeito, o primeiro grátis com chave (groq, gemini) e só depois openai.
function textProvider() {
  const e = process.env;
  const all = {
    groq: { name: 'groq', key: e.GROQ_API_KEY || '', base: 'https://api.groq.com/openai/v1', model: e.AI_MODEL || 'llama-3.3-70b-versatile' },
    gemini: { name: 'gemini', key: e.GEMINI_API_KEY || '', base: 'https://generativelanguage.googleapis.com/v1beta/openai', model: e.AI_MODEL || 'gemini-2.0-flash' },
    openai: { name: 'openai', key: e.OPENAI_API_KEY || '', base: (e.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, ''), model: e.OPENAI_MODEL || e.AI_MODEL || 'gpt-4.1-mini' }
  };
  const forced = (e.AI_PROVIDER || '').toLowerCase();
  if (all[forced] && all[forced].key) return all[forced];
  return all.groq.key ? all.groq : all.gemini.key ? all.gemini : all.openai;
}

function isConfigured({ needAI = false } = {}) {
  const c = cfg();
  if (!c.url || !c.publishable || !c.secret) return false;
  if (needAI === true && !c.text.key) return false;
  if (needAI === 'image' && !c.openai) return false;
  return true;
}

function send(res, status, body) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.status(status).json(body);
}

function methodGuard(req, res, allowed) {
  if (!allowed.includes(req.method)) {
    res.setHeader('Allow', allowed.join(', '));
    send(res, 405, { error: 'Método não permitido.' });
    return false;
  }
  return true;
}

function parseBody(req) {
  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { return null; } }
  if (!b || typeof b !== 'object' || Array.isArray(b)) return null;
  return b;
}

// ------------------------------------------------------------ Supabase REST --
