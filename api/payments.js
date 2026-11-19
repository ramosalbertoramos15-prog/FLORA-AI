'use strict';
// Pagamentos manuais (como na loja anterior): o cliente paga por M-Pesa / e-Mola / BIM / PayPal / Binance,
// envia o ID da transação e o administrador confirma. O plano SÓ é ativado após confirmação.
// Preparado para, no futuro, um webhook de provedor ativar o plano automaticamente.
const { send, methodGuard, parseBody, requireUser, getPlans, getSettings, db, enc } = require('./_lib/core');

const REF_RE = /^[A-Za-z0-9._\-\s]{5,60}$/;

function publicMethods(settings) {
  const rate = Number(settings.usdt_rate_mt) || 74;
  return (Array.isArray(settings.payment_methods) ? settings.payment_methods : [])
    .filter(m => m && m.id && (m.number || '').toString().trim())
    .map(m => ({ id: String(m.id), name: String(m.name || m.id), currency: m.currency === 'USDT' ? 'USDT' : 'MT', number: String(m.number), holder: String(m.holder || ''), instructions: String(m.instructions || ''), rate }));
}

module.exports = async function handler(req, res) {
  if (!methodGuard(req, res, ['GET', 'POST'])) return;
  const ctx = await requireUser(req, res);
  if (!ctx) return;
  const { user } = ctx;
  const settings = await getSettings();
  const enabled = settings.payments_enabled === true;

  if (req.method === 'GET') {
    const [plans, mine] = await Promise.all([getPlans(), db(`payments?user_id=eq.${enc(user.id)}&select=id,plan,amount_mt,method,reference,status,note,created_at&order=created_at.desc&limit=20`)]);
    return send(res, 200, { enabled, methods: enabled ? publicMethods(settings) : [], plans, payments: mine.ok ? mine.data : [] });
  }

  if (!enabled) return send(res, 503, { error: 'Os pagamentos ainda não estão ativos. Volta em breve.', code: 'payments_off' });
  const body = parseBody(req);
  if (!body) return send(res, 400, { error: 'Pedido inválido.' });
  const plans = await getPlans();
  const plan = plans.find(p => p.id === body.plan && p.price_mt > 0);
  if (!plan) return send(res, 400, { error: 'Plano inválido.' });
  const method = publicMethods(settings).find(m => m.id === body.method);
  if (!method) return send(res, 400, { error: 'Método de pagamento indisponível.' });
  const reference = typeof body.reference === 'string' ? body.reference.trim().toUpperCase().replace(/\s+/g, ' ') : '';
  if (!REF_RE.test(reference)) return send(res, 400, { error: 'Escreve o ID/referência da transação (5 a 60 caracteres).' });
  const payer = typeof body.payer_phone === 'string' ? body.payer_phone.trim().slice(0, 40) : '';
  const proof = typeof body.proof === 'string' ? body.proof.trim().slice(0, 500) : '';

  const pending = await db(`payments?user_id=eq.${enc(user.id)}&status=eq.pending&select=id`, { count: true, range: '0-0' });
  if ((pending.count || 0) >= 3) return send(res, 429, { error: 'Já tens 3 pagamentos em análise. Aguarda a confirmação.' });

  const ins = await db('payments', { method: 'POST', prefer: 'return=representation', body: { user_id: user.id, plan: plan.id, amount_mt: plan.price_mt, method: method.id, reference, payer_phone: payer || null, proof: proof || null } });
  if (!ins.ok) {
    if (ins.status === 409) return send(res, 409, { error: 'Esta referência já foi submetida. Verifica o ID da transação.' });
    return send(res, 500, { error: 'Não foi possível registar o pagamento. Tenta novamente.' });
  }
  return send(res, 200, { ok: true, payment: ins.data?.[0] ? { id: ins.data[0].id, status: 'pending' } : null, message: 'Pagamento recebido! O administrador vai confirmar e ativar o teu plano.' });
};
