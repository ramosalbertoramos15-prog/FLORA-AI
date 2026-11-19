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
  openaiBase: (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '')
});

function isConfigured({ needAI = false } = {}) {
  const c = cfg();
  if (!c.url || !c.publishable || !c.secret) return false;
  if (needAI && !c.openai) return false;
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
function serviceHeaders(extra = {}) {
  const { secret } = cfg();
  const h = { apikey: secret, 'Content-Type': 'application/json', ...extra };
  // Chaves novas (sb_secret_...) só vão em "apikey". Chaves JWT antigas também em Authorization.
  if (secret.startsWith('eyJ')) h.Authorization = `Bearer ${secret}`;
  return h;
}

async function timedFetch(url, options = {}, ms = 15000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  try { return await fetch(url, { ...options, signal: controller.signal }); }
  finally { clearTimeout(t); }
}

// db('tabela?select=*&id=eq.1', { method, body, prefer, count })
async function db(path, { method = 'GET', body, prefer, count = false, range } = {}) {
  const { url } = cfg();
  const headers = serviceHeaders();
  const pref = [];
  if (prefer) pref.push(prefer);
  if (count) pref.push('count=exact');
  if (pref.length) headers.Prefer = pref.join(',');
  if (range) headers.Range = range;
  let res;
  try {
    res = await timedFetch(`${url}/rest/v1/${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch (e) {
    return { ok: false, status: 0, data: null, count: null, error: 'network' };
  }
  let data = null;
  const text = await res.text();
  if (text) { try { data = JSON.parse(text); } catch { data = text; } }
  let total = null;
  const cr = res.headers.get('content-range');
  if (cr && cr.includes('/')) { const n = parseInt(cr.split('/')[1], 10); if (!Number.isNaN(n)) total = n; }
  return { ok: res.ok, status: res.status, data, count: total, error: res.ok ? null : (data?.message || 'db_error') };
}

const enc = encodeURIComponent;

async function countRows(table, filters) {
  const r = await db(`${table}?select=id&${filters}`, { count: true, range: '0-0' });
  return r.ok ? (r.count ?? 0) : 0;
}

// --------------------------------------------------------------- Autenticação
async function getUser(req) {
  const m = /^Bearer\s+([A-Za-z0-9._-]+)$/i.exec(req.headers?.authorization || '');
  if (!m || m[1].length > 4096) return null;
  const { url, publishable } = cfg();
  try {
    const r = await timedFetch(`${url}/auth/v1/user`, { headers: { apikey: publishable, Authorization: `Bearer ${m[1]}` } }, 8500);
    if (!r.ok) return null;
    const u = await r.json();
    return u?.id ? { id: u.id, email: u.email || '', confirmed: Boolean(u.email_confirmed_at || u.confirmed_at) } : null;
  } catch { return null; }
}

async function getProfile(id) {
  const r = await db(`profiles?id=eq.${enc(id)}&select=*&limit=1`);
  if (r.ok && Array.isArray(r.data) && r.data[0]) return r.data[0];
  if (r.ok) {
    // Conta antiga sem perfil: cria agora.
    const ins = await db('profiles', { method: 'POST', body: { id }, prefer: 'return=representation,resolution=ignore-duplicates' });
    if (ins.ok && ins.data?.[0]) return ins.data[0];
    const again = await db(`profiles?id=eq.${enc(id)}&select=*&limit=1`);
    if (again.ok && again.data?.[0]) return again.data[0];
  }
  return null;
}

function effectivePlanId(profile) {
  if (!profile || profile.plan === 'free') return 'free';
  if (profile.plan_expires_at && new Date(profile.plan_expires_at).getTime() > Date.now()) return profile.plan;
  return 'free';
}

// Devolve { user, profile } ou envia resposta de erro e devolve null.
async function requireUser(req, res) {
  if (!isConfigured()) { send(res, 503, { error: 'O servidor ainda não está configurado. O administrador deve definir as variáveis na Vercel.', code: 'not_configured' }); return null; }
  const user = await getUser(req);
  if (!user) { send(res, 401, { error: 'Sessão inválida ou expirada. Entra novamente na tua conta.', code: 'auth' }); return null; }
  const profile = await getProfile(user.id);
  if (!profile) { send(res, 503, { error: 'Não foi possível carregar o teu perfil. Confirma que a migração SQL foi executada no Supabase.', code: 'no_profile' }); return null; }
  if (profile.blocked) { send(res, 403, { error: 'Esta conta está suspensa. Contacta o suporte.', code: 'blocked' }); return null; }
  return { user, profile };
}

async function requireAdmin(req, res) {
  const ctx = await requireUser(req, res);
  if (!ctx) return null;
  if (ctx.profile.role !== 'admin') { send(res, 403, { error: 'Sem permissão de administrador.', code: 'forbidden' }); return null; }
  return ctx;
}

// ------------------------------------------------------------ Planos/definições
let settingsCache = { at: 0, data: null };
let plansCache = { at: 0, data: null };

async function getSettings(force = false) {
  if (!force && settingsCache.data && Date.now() - settingsCache.at < 20000) return settingsCache.data;
  const r = await db('settings?select=key,value');
  const out = {};
  if (r.ok && Array.isArray(r.data)) for (const row of r.data) out[row.key] = row.value;
  settingsCache = { at: Date.now(), data: out };
  return out;
}
function clearCaches() { settingsCache = { at: 0, data: null }; plansCache = { at: 0, data: null }; }

async function getPlans(force = false) {
  if (!force && plansCache.data && Date.now() - plansCache.at < 20000) return plansCache.data;
  const r = await db('plans?select=*&order=sort.asc');
  const list = r.ok && Array.isArray(r.data) ? r.data : [];
  plansCache = { at: Date.now(), data: list };
  return list;
}
async function getPlan(id) {
  const plans = await getPlans();
  return plans.find(p => p.id === id) || plans.find(p => p.id === 'free') || { id: 'free', name: 'Grátis', text_per_day: 10, image_per_day: 0, max_output_tokens: 600, price_mt: 0, duration_days: 30 };
}

// ------------------------------------------------------------------- Quotas --
function startOfTodayISO(now = Date.now()) {
  const local = now + TZ_OFFSET_MS;
  const dayStartLocal = local - (local % 86400000);
  return new Date(dayStartLocal - TZ_OFFSET_MS).toISOString();
}

async function usageToday(userId) {
  const since = enc(startOfTodayISO());
  const [text, image] = await Promise.all([
    countRows('usage_log', `user_id=eq.${enc(userId)}&kind=eq.text&created_at=gte.${since}`),
    countRows('usage_log', `user_id=eq.${enc(userId)}&kind=eq.image&created_at=gte.${since}`)
  ]);
  return { text, image };
}

// Verifica todas as barreiras ANTES de gastar dinheiro com a IA.
async function checkQuota({ userId, kind, plan, settings }) {
  if (settings.ai_enabled === false) return { ok: false, status: 503, code: 'ai_off', error: 'A IA está temporariamente desativada pelo administrador.' };
  // Anti-rajada: máximo de pedidos por minuto (persistente na base de dados).
  const burstLimit = kind === 'image' ? 3 : 8;
  const burst = await countRows('usage_log', `user_id=eq.${enc(userId)}&kind=eq.${kind}&created_at=gte.${enc(new Date(Date.now() - 60000).toISOString())}`);
  if (burst >= burstLimit) return { ok: false, status: 429, code: 'burst', error: 'Estás a enviar pedidos demasiado depressa. Espera um minuto e tenta novamente.' };
  const used = await countRows('usage_log', `user_id=eq.${enc(userId)}&kind=eq.${kind}&created_at=gte.${enc(startOfTodayISO())}`);
  const limit = kind === 'image' ? plan.image_per_day : plan.text_per_day;
  if (used >= limit) {
    const what = kind === 'image' ? 'imagens' : 'mensagens';
    return { ok: false, status: 429, code: 'quota', error: limit === 0 ? `O teu plano não inclui ${what}.` : `Atingiste o limite diário de ${what} do plano ${plan.name} (${limit}). Volta amanhã ou melhora o teu plano.`, used, limit };
  }
  // Limite global diário (proteção de custos da plataforma).
  const globalLimit = Number(kind === 'image' ? settings.global_image_per_day : settings.global_text_per_day);
  if (globalLimit > 0) {
    const g = await countRows('usage_log', `kind=eq.${kind}&created_at=gte.${enc(startOfTodayISO())}`);
    if (g >= globalLimit) return { ok: false, status: 503, code: 'global_cap', error: 'A plataforma atingiu a capacidade diária de IA. Tenta novamente amanhã.' };
  }
  return { ok: true, used, limit };
}

// Reserva o uso ANTES de chamar a IA (evita abuso com pedidos paralelos).
async function reserveUsage(userId, kind) {
  const r = await db('usage_log', { method: 'POST', body: { user_id: userId, kind }, prefer: 'return=representation' });
  return r.ok && r.data?.[0] ? r.data[0].id : null;
}
async function releaseUsage(id) { if (id) await db(`usage_log?id=eq.${id}`, { method: 'DELETE' }); }
async function finishUsage(id, tokensIn, tokensOut) {
  if (id) await db(`usage_log?id=eq.${id}`, { method: 'PATCH', body: { tokens_in: tokensIn | 0, tokens_out: tokensOut | 0 } });
}

async function audit(actor, action, target, detail) {
  await db('audit_log', { method: 'POST', body: { actor, action, target: target ? String(target) : null, detail: detail || null } });
}

module.exports = {
  UUID_RE, cfg, isConfigured, send, methodGuard, parseBody, serviceHeaders, timedFetch, db, enc, countRows,
  getUser, getProfile, effectivePlanId, requireUser, requireAdmin, getSettings, clearCaches, getPlans, getPlan,
  startOfTodayISO, usageToday, checkQuota, reserveUsage, releaseUsage, finishUsage, audit
};
