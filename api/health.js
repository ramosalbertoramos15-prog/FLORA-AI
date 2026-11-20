'use strict';
const { cfg, db, send } = require('./_lib/core');

function tipo(k) {
  if (!k) return 'AUSENTE: falta a variável SUPABASE_SECRET_KEY';
  if (k.startsWith('sb_secret_')) return 'sb_secret (certa)';
  if (k.startsWith('sb_publishable_')) return 'ERRADA: é a chave publishable';
  if (k.startsWith('eyJ')) {
    try {
      const role = JSON.parse(Buffer.from(k.split('.')[1], 'base64url').toString()).role;
      return role === 'service_role' ? 'jwt service_role (certa)' : `ERRADA: é a chave ${role}`;
    } catch { return 'jwt ilegível (copiada incompleta?)'; }
  }
  return 'formato desconhecido';
}

module.exports = async function handler(req, res) {
  const c = cfg();
  const out = { chave_secreta: tipo(c.secret), espacos_nas_pontas: c.secret !== c.secret.trim(), url_ok: /^https:\/\/[a-z0-9]+\.supabase\.co$/.test(c.url) };
  const r = await db('profiles?select=id&limit=1', { count: true, range: '0-0' });
  out.base_de_dados = { ok: r.ok, estado: r.status, perfis: r.count, erro: r.ok ? null : String(r.error).slice(0, 120) };
  return send(res, 200, out);
};
