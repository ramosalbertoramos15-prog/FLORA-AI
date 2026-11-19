'use strict';
// Painel de administração. Só utilizadores com profiles.role = 'admin'. O administrador vê métricas
// e dados de conta, NUNCA o conteúdo das conversas.
const { send, methodGuard, parseBody, requireAdmin, getSettings, clearCaches, getPlans, db, enc, countRows, startOfTodayISO, audit, UUID_RE } = require('./_lib/core');

const SETTING_KEYS = ['ai_enabled', 'payments_enabled', 'global_text_per_day', 'global_image_per_day', 'usdt_rate_mt', 'support_email', 'support_whatsapp', 'payment_methods'];
const int = (v, min, max) => { const n = parseInt(v, 10); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : null; };

module.exports = async function handler(req, res) {
  if (!methodGuard(req, res, ['POST'])) return;
  const ctx = await requireAdmin(req, res);
  if (!ctx) return;
  const admin = ctx.user;
  const b = parseBody(req);
  if (!b || typeof b.action !== 'string') return send(res, 400, { error: 'Pedido inválido.' });

  switch (b.action) {
    case 'stats': {
      const today = enc(startOfTodayISO());
      const weekAgo = new Date(Date.now() - 6 * 86400000);
      const since = enc(new Date(new Date(startOfTodayISO()).getTime() - 6 * 86400000).toISOString());
      const [users, premium, pending, newWeek, textToday, imageToday, usageRows, paid] = await Promise.all([
        countRows('profiles', 'id=not.is.null'),
        countRows('profiles', `plan=eq.premium&plan_expires_at=gt.${enc(new Date().toISOString())}`),
        countRows('payments', 'status=eq.pending'),
        countRows('profiles', `created_at=gte.${since}`),
        countRows('usage_log', `kind=eq.text&created_at=gte.${today}`),
        countRows('usage_log', `kind=eq.image&created_at=gte.${today}`),
        db(`usage_log?select=user_id,kind,created_at&created_at=gte.${since}&order=created_at.desc&limit=10000`),
        db('payments?select=amount_mt&status=eq.approved&limit=5000')
      ]);
      const rows = usageRows.ok ? usageRows.data : [];
      const days = [];
      for (let i = 6; i >= 0; i--) {
        const start = new Date(new Date(startOfTodayISO()).getTime() - i * 86400000);
        days.push({ date: start.toISOString(), text: 0, image: 0 });
      }
      const perUser = {};
      const todayMs = new Date(startOfTodayISO()).getTime();
      for (const r of rows) {
        const t = new Date(r.created_at).getTime();
        const idx = 6 - Math.floor((todayMs + 86400000 - 1 - t) / 86400000);
        if (days[idx]) days[idx][r.kind] += 1;
        if (t >= todayMs) perUser[r.user_id] = (perUser[r.user_id] || 0) + 1;
      }
      const topIds = Object.entries(perUser).sort((a, b2) => b2[1] - a[1]).slice(0, 5);
      let top = [];
      if (topIds.length) {
        const pr = await db(`profiles?id=in.(${topIds.map(([id]) => enc(id)).join(',')})&select=id,email`);
        const map = Object.fromEntries((pr.ok ? pr.data : []).map(p => [p.id, p.email]));
        top = topIds.map(([id, n]) => ({ email: map[id] || id.slice(0, 8), requests: n }));
      }
      const revenue = (paid.ok ? paid.data : []).reduce((s, p) => s + (p.amount_mt || 0), 0);
      void weekAgo;
      return send(res, 200, { users, premium, pending, newWeek, textToday, imageToday, revenue, days, top });
    }

    case 'users': {
      const page = int(b.page, 0, 10000) || 0;
      const q = typeof b.q === 'string' ? b.q.trim().replace(/[^\w@.\-+ ]/g, '').slice(0, 80) : '';
      const filter = q ? `&email=ilike.*${enc(q)}*` : '';
      const r = await db(`profiles?select=id,email,full_name,phone,role,plan,plan_expires_at,blocked,created_at${filter}&order=created_at.desc&limit=20&offset=${page * 20}`, { count: true });
      return send(res, 200, { users: r.ok ? r.data : [], total: r.count || 0, page });
    }

    case 'set_user': {
      if (!UUID_RE.test(b.id || '')) return send(res, 400, { error: 'Utilizador inválido.' });
      const patch = {};
      const plans = await getPlans();
      if (b.plan !== undefined) {
        const plan = plans.find(p => p.id === b.plan);
        if (!plan) return send(res, 400, { error: 'Plano inválido.' });
        patch.plan = plan.id;
        if (plan.id === 'free') patch.plan_expires_at = null;
        else {
          const days = int(b.days, 1, 3650) || plan.duration_days;
          patch.plan_expires_at = new Date(Date.now() + days * 86400000).toISOString();
        }
      }
      if (b.blocked !== undefined) { if (b.id === admin.id) return send(res, 400, { error: 'Não podes bloquear a tua própria conta.' }); patch.blocked = Boolean(b.blocked); }
      if (b.role !== undefined) {
        if (!['user', 'admin'].includes(b.role)) return send(res, 400, { error: 'Função inválida.' });
        if (b.id === admin.id && b.role !== 'admin') return send(res, 400, { error: 'Não podes remover o teu próprio acesso de administrador.' });
        patch.role = b.role;
      }
      if (!Object.keys(patch).length) return send(res, 400, { error: 'Nada para alterar.' });
      const r = await db(`profiles?id=eq.${enc(b.id)}`, { method: 'PATCH', body: patch, prefer: 'return=representation' });
      if (!r.ok || !r.data?.[0]) return send(res, 500, { error: 'Não foi possível atualizar.' });
      await audit(admin.id, 'set_user', b.id, patch);
      return send(res, 200, { ok: true, user: r.data[0] });
    }

    case 'payments': {
      const status = ['pending', 'approved', 'rejected'].includes(b.status) ? b.status : 'pending';
      const r = await db(`payments?select=*,profiles!payments_user_id_fkey(email,full_name,phone)&status=eq.${status}&order=created_at.desc&limit=50`);
      return send(res, 200, { payments: r.ok ? r.data : [] });
    }

    case 'review_payment': {
      if (!UUID_RE.test(b.id || '') || !['approve', 'reject'].includes(b.decision)) return send(res, 400, { error: 'Pedido inválido.' });
      const pr = await db(`payments?id=eq.${enc(b.id)}&select=*&limit=1`);
      const pay = pr.ok ? pr.data?.[0] : null;
      if (!pay) return send(res, 404, { error: 'Pagamento não encontrado.' });
      if (pay.status !== 'pending') return send(res, 409, { error: 'Este pagamento já foi revisto.' });
      const note = typeof b.note === 'string' ? b.note.trim().slice(0, 300) : null;
      if (b.decision === 'approve') {
        const plans = await getPlans();
        const plan = plans.find(p => p.id === pay.plan);
        if (!plan) return send(res, 400, { error: 'O plano deste pagamento já não existe.' });
        const prof = await db(`profiles?id=eq.${enc(pay.user_id)}&select=plan,plan_expires_at&limit=1`);
        const cur = prof.ok ? prof.data?.[0] : null;
        // Renovação: soma ao tempo que ainda resta do mesmo plano.
        let from = Date.now();
        if (cur && cur.plan === plan.id && cur.plan_expires_at && new Date(cur.plan_expires_at).getTime() > from) from = new Date(cur.plan_expires_at).getTime();
        const upd = await db(`profiles?id=eq.${enc(pay.user_id)}`, { method: 'PATCH', body: { plan: plan.id, plan_expires_at: new Date(from + plan.duration_days * 86400000).toISOString() } });
        if (!upd.ok) return send(res, 500, { error: 'Não foi possível ativar o plano. Pagamento mantido em análise.' });
      }
      const r = await db(`payments?id=eq.${enc(b.id)}&status=eq.pending`, { method: 'PATCH', body: { status: b.decision === 'approve' ? 'approved' : 'rejected', note, reviewed_by: admin.id, reviewed_at: new Date().toISOString() } });
      if (!r.ok) return send(res, 500, { error: 'Não foi possível atualizar o pagamento.' });
      await audit(admin.id, 'review_payment', b.id, { decision: b.decision });
      return send(res, 200, { ok: true });
    }

    case 'get_config': {
      const [settings, plans] = await Promise.all([getSettings(true), getPlans(true)]);
      const out = {};
      for (const k of SETTING_KEYS) out[k] = settings[k];
      return send(res, 200, { settings: out, plans });
    }

    case 'save_config': {
      const s = b.settings && typeof b.settings === 'object' ? b.settings : {};
      const rows = [];
      for (const k of SETTING_KEYS) {
        if (!(k in s)) continue;
        let v = s[k];
        if (k === 'ai_enabled' || k === 'payments_enabled') v = Boolean(v);
        else if (k === 'global_text_per_day' || k === 'global_image_per_day') { v = int(v, 0, 1000000); if (v === null) continue; }
        else if (k === 'usdt_rate_mt') { v = int(v, 1, 100000); if (v === null) continue; }
        else if (k === 'support_email' || k === 'support_whatsapp') v = String(v || '').trim().slice(0, 120);
        else if (k === 'payment_methods') {
          if (!Array.isArray(v) || v.length > 10) continue;
          v = v.map(m => ({ id: String(m.id || '').replace(/[^a-z0-9_-]/gi, '').slice(0, 20), name: String(m.name || '').slice(0, 60), currency: m.currency === 'USDT' ? 'USDT' : 'MT', number: String(m.number || '').trim().slice(0, 120), holder: String(m.holder || '').trim().slice(0, 80), instructions: String(m.instructions || '').trim().slice(0, 300) })).filter(m => m.id);
        }
        rows.push({ key: k, value: v, updated_at: new Date().toISOString() });
      }
      if (rows.length) {
        const r = await db('settings?on_conflict=key', { method: 'POST', body: rows, prefer: 'resolution=merge-duplicates' });
        if (!r.ok) return send(res, 500, { error: 'Não foi possível guardar as definições.' });
      }
      if (Array.isArray(b.plans)) {
        for (const p of b.plans) {
          const patch = { price_mt: int(p.price_mt, 0, 10000000), duration_days: int(p.duration_days, 1, 3650), text_per_day: int(p.text_per_day, 0, 100000), image_per_day: int(p.image_per_day, 0, 10000), max_output_tokens: int(p.max_output_tokens, 100, 4000) };
          if (Object.values(patch).some(v => v === null) || !/^[a-z]+$/.test(p.id || '')) continue;
          await db(`plans?id=eq.${enc(p.id)}`, { method: 'PATCH', body: patch });
        }
      }
      clearCaches();
      await audit(admin.id, 'save_config', null, { keys: rows.map(r => r.key) });
      return send(res, 200, { ok: true });
    }

    default:
      return send(res, 400, { error: 'Ação desconhecida.' });
  }
};
