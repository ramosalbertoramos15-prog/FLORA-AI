'use strict';
// Geração de imagens. Guarda no Storage privado do Supabase (cada utilizador só vê as suas).
const crypto = require('node:crypto');
const core = require('./_lib/core');
const { send, methodGuard, parseBody, requireUser, effectivePlanId, getPlan, getSettings, checkQuota, reserveUsage, releaseUsage, finishUsage, db, enc, UUID_RE, cfg, timedFetch, serviceHeaders } = core;

module.exports = async function handler(req, res) {
  if (!methodGuard(req, res, ['POST'])) return;
  if (!core.isConfigured({ needAI: true })) return send(res, 503, { error: 'A geração de imagens ainda não está configurada no servidor.', code: 'not_configured' });
  const ctx = await requireUser(req, res);
  if (!ctx) return;
  const { user, profile } = ctx;
  const body = parseBody(req);
  if (!body) return send(res, 400, { error: 'Pedido inválido.' });
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  const convId = body.conversation_id || null;
  if (prompt.length < 4 || prompt.length > 800) return send(res, 400, { error: 'Descreve a imagem com 4 a 800 caracteres.' });
  if (convId && !UUID_RE.test(convId)) return send(res, 400, { error: 'Conversa inválida.' });

  const [settings, plan] = await Promise.all([getSettings(), getPlan(effectivePlanId(profile))]);
  const q = await checkQuota({ userId: user.id, kind: 'image', plan, settings });
  if (!q.ok) return send(res, q.status, { error: q.error, code: q.code });

  let conv = null;
  if (convId) {
    const r = await db(`conversations?id=eq.${enc(convId)}&user_id=eq.${enc(user.id)}&select=id,title&limit=1`);
    conv = r.ok ? r.data?.[0] : null;
    if (!conv) return send(res, 404, { error: 'Conversa não encontrada.' });
  }

  const usageId = await reserveUsage(user.id, 'image');
  const c = cfg();
  const model = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1';
  const params = model.startsWith('dall-e')
    ? { model, prompt, size: '1024x1024', n: 1, response_format: 'b64_json' }
    : { model, prompt, size: '1024x1024', n: 1, quality: process.env.OPENAI_IMAGE_QUALITY || 'low', output_format: 'jpeg', output_compression: 80 };
  let buffer;
  try {
    const r = await timedFetch(`${c.openaiBase}/images/generations`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${c.openai}` }, body: JSON.stringify(params)
    }, 55000);
    const result = await r.json().catch(() => ({}));
    if (!r.ok) {
      console.error('OpenAI imagem erro', r.status, result.error?.code || result.error?.type || 'desconhecido');
      await releaseUsage(usageId);
      if (result.error?.code === 'moderation_blocked' || result.error?.code === 'content_policy_violation') return send(res, 422, { error: 'Não é possível gerar esta imagem. Tenta descrever de outra forma.', code: 'policy' });
      if (r.status === 429) return send(res, 429, { error: 'O serviço de imagens está ocupado. Tenta daqui a instantes.', code: 'upstream' });
      return send(res, 502, { error: 'Não foi possível gerar a imagem agora. Tenta novamente.', code: 'upstream' });
    }
    const b64 = result.data?.[0]?.b64_json;
    if (!b64) { await releaseUsage(usageId); return send(res, 502, { error: 'O serviço não devolveu imagem. Tenta novamente.' }); }
    buffer = Buffer.from(b64, 'base64');
  } catch (e) {
    await releaseUsage(usageId);
    return send(res, e.name === 'AbortError' ? 504 : 502, { error: 'A geração demorou demasiado. Tenta novamente com uma descrição mais simples.' });
  }

  const path = `${user.id}/${crypto.randomUUID()}.jpg`;
  let up;
  try {
    up = await timedFetch(`${c.url}/storage/v1/object/generated-images/${path}`, {
      method: 'POST', headers: serviceHeaders({ 'Content-Type': 'image/jpeg', 'x-upsert': 'false' }), body: buffer
    }, 20000);
  } catch { up = null; }
  if (!up || !up.ok) {
    console.error('Storage erro', up?.status);
    await releaseUsage(usageId);
    return send(res, 502, { error: 'A imagem foi criada mas não foi possível guardá-la. Confirma a migração SQL (bucket generated-images).', code: 'storage' });
  }
  await finishUsage(usageId, 0, 0);

  if (!conv) {
    const cr = await db('conversations', { method: 'POST', prefer: 'return=representation', body: { user_id: user.id, title: ('🎨 ' + prompt).slice(0, 60), tool: 'chat' } });
    conv = cr.ok ? cr.data?.[0] : null;
  }
  let msg = { id: null, role: 'assistant', kind: 'image', content: prompt, image_path: path, created_at: new Date().toISOString() };
  if (conv) {
    const ins = await db('messages', { method: 'POST', prefer: 'return=representation', body: [
      { conversation_id: conv.id, user_id: user.id, role: 'user', content: '🎨 ' + prompt, created_at: new Date(Date.now() - 1000).toISOString() },
      { conversation_id: conv.id, user_id: user.id, role: 'assistant', kind: 'image', content: prompt, image_path: path }
    ] });
    if (ins.ok && ins.data?.[1]) msg = ins.data[1];
    await db(`conversations?id=eq.${enc(conv.id)}`, { method: 'PATCH', body: { updated_at: new Date().toISOString() } });
  }
  return send(res, 200, { conversation_id: conv ? conv.id : null, title: conv?.title || null, message: msg, usage: { used: q.used + 1, limit: q.limit } });
};
