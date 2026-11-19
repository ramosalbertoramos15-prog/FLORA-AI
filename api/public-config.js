'use strict';
// Só devolve valores PÚBLICOS necessários ao cliente Supabase no navegador.
// Nunca devolver chave secreta, service_role ou OPENAI_API_KEY.
const { cfg, send, methodGuard } = require('./_lib/core');

module.exports = function handler(req, res) {
  if (!methodGuard(req, res, ['GET'])) return;
  const c = cfg();
  const missing = [];
  if (!c.url) missing.push('SUPABASE_URL');
  if (!c.publishable) missing.push('SUPABASE_PUBLISHABLE_KEY');
  if (missing.length) return send(res, 200, { configured: false, missing });
  return send(res, 200, {
    configured: true,
    url: c.url,
    publishableKey: c.publishable,
    // Estado (sem valores secretos) para o painel de diagnóstico.
    server: { ai: Boolean(c.openai), admin: Boolean(c.secret) }
  });
};
