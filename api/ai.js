'use strict';
// Chat e ferramentas de texto. Valida sessão, plano, quotas e limites ANTES de chamar a IA.
const core = require('./_lib/core');
const { send, methodGuard, parseBody, requireUser, effectivePlanId, getPlan, getSettings, checkQuota, reserveUsage, releaseUsage, finishUsage, db, enc, UUID_RE, cfg, timedFetch } = core;

const BASE = 'Responde sempre no idioma do utilizador (por defeito português claro, adaptado a Moçambique). Sê útil, correto e conciso. Não inventes factos; se não souberes, diz. Valores monetários em metical (MT) quando fizer sentido.';
const TOOLS = {
  chat: `És a FLORA AI, assistente de inteligência artificial criada para ajudar pessoas em Moçambique e no mundo lusófono. ${BASE} Usa listas e passos quando ajudar.`,
  carta: `És um redator profissional de candidaturas. Cria uma carta de apresentação a partir dos dados fornecidos, em português natural e tom profissional. Não inventes empresas, diplomas ou experiências; se faltarem dados usa marcadores como [Nome da empresa]. Entrega apenas a carta. ${BASE}`,
  texto: `És um redator e especialista em comunicação. Cria o texto pedido com qualidade e adequação ao público indicado. Não inventes resultados, promoções ou garantias. ${BASE}`,
  traducao: 'És um tradutor profissional. Traduz o texto para o idioma de destino indicado, mantendo significado, tom e nomes próprios. Entrega apenas a tradução.',
  entrevista: `És um orientador de carreira. Cria um exercício de preparação para entrevista adequado à vaga: perguntas prováveis, ideias de resposta adaptáveis e conselhos práticos. Não inventes experiência do candidato. ${BASE}`,
  cv: `És um especialista em currículos. Reescreve o texto do perfil profissional de forma clara, objetiva e profissional (3 a 5 linhas), sem inventar factos. Entrega apenas o texto melhorado. ${BASE}`
};

module.exports = async function handler(req, res) {
  if (!methodGuard(req, res, ['POST'])) return;
  if (!core.isConfigured({ needAI: true })) return send(res, 503, { error: 'A IA ainda não está configurada no servidor.', code: 'not_configured' });
  const ctx = await requireUser(req, res);
  if (!ctx) return;
  const { user, profile } = ctx;

  const body = parseBody(req);
  if (!body) return send(res, 400, { error: 'Pedido inválido.' });
  const tool = typeof body.tool === 'string' ? body.tool : 'chat';
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  const convId = body.conversation_id || null;
  if (!Object.prototype.hasOwnProperty.call(TOOLS, tool)) return send(res, 400, { error: 'Ferramenta desconhecida.' });
  if (message.length < 2 || message.length > 4000) return send(res, 400, { error: 'A mensagem deve ter entre 2 e 4000 caracteres.' });
  if (convId && !UUID_RE.test(convId)) return send(res, 400, { error: 'Conversa inválida.' });

  const [settings, plan] = await Promise.all([getSettings(), getPlan(effectivePlanId(profile))]);
  const q = await checkQuota({ userId: user.id, kind: 'text', plan, settings });
  if (!q.ok) return send(res, q.status, { error: q.error, code: q.code });

  const persist = tool !== 'cv';
  let conv = null;
  let history = [];
  if (persist && convId) {
    const r = await db(`conversations?id=eq.${enc(convId)}&user_id=eq.${enc(user.id)}&select=id,tool,title&limit=1`);
    conv = r.ok ? r.data?.[0] : null;
    if (!conv) return send(res, 404, { error: 'Conversa não encontrada.' });
    const h = await db(`messages?conversation_id=eq.${enc(conv.id)}&kind=eq.text&select=role,content&order=created_at.desc&limit=10`);
    history = (h.ok ? h.data : []).reverse().map(m => ({ role: m.role, content: String(m.content).slice(0, 4000) }));
  }
  const activeTool = conv ? conv.tool : tool;

  const usageId = await reserveUsage(user.id, 'text');
  const c = cfg();
  let out;
  try {
    const P = c.text;
    const r = await timedFetch(`${P.base}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${P.key}` },
      body: JSON.stringify({
        model: P.model,
        messages: [{ role: 'system', content: TOOLS[activeTool] }, ...history, { role: 'user', content: message }],
        max_tokens: plan.max_output_tokens || 700
      })
    }, 50000);
    const result = await r.json().catch(() => ({}));
    if (!r.ok) {
      console.error('IA erro', P.name, r.status, JSON.stringify(result.error || result).slice(0, 200));
      await releaseUsage(usageId);
      if (r.status === 429) return send(res, 429, { error: 'O serviço de IA está ocupado. Tenta novamente daqui a instantes.', code: 'upstream' });
      return send(res, 502, { error: 'A IA não conseguiu responder agora. Tenta novamente.', code: 'upstream' });
    }
    const text = String(result.choices?.[0]?.message?.content || '').trim();
    if (!text) { await releaseUsage(usageId); return send(res, 502, { error: 'A IA respondeu sem texto. Tenta novamente.' }); }
    out = { text, tin: result.usage?.prompt_tokens || 0, tout: result.usage?.completion_tokens || 0 };
  } catch (e) {
    await releaseUsage(usageId);
    return send(res, e.name === 'AbortError' ? 504 : 502, { error: 'Falha na ligação ao serviço de IA. Tenta novamente.' });
  }
  await finishUsage(usageId, out.tin, out.tout);

  let msg = { id: null, role: 'assistant', kind: 'text', content: out.text, created_at: new Date().toISOString() };
  if (persist) {
    if (!conv) {
      const title = message.replace(/\s+/g, ' ').slice(0, 60);
      const cr = await db('conversations', { method: 'POST', body: { user_id: user.id, title, tool: activeTool }, prefer: 'return=representation' });
      conv = cr.ok ? cr.data?.[0] : null;
    }
    if (conv) {
      const ins = await db('messages', { method: 'POST', prefer: 'return=representation', body: [
        { conversation_id: conv.id, user_id: user.id, role: 'user', content: message, created_at: new Date(Date.now() - 1000).toISOString() },
        { conversation_id: conv.id, user_id: user.id, role: 'assistant', content: out.text }
      ] });
      if (ins.ok && ins.data?.[1]) msg = ins.data[1];
      await db(`conversations?id=eq.${enc(conv.id)}`, { method: 'PATCH', body: { updated_at: new Date().toISOString() } });
    }
  }
  return send(res, 200, { conversation_id: conv ? conv.id : null, title: conv?.title || null, message: msg, usage: { used: q.used + 1, limit: q.limit } });
};
