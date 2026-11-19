'use strict';
// Devolve o perfil, plano efetivo e consumo de hoje do utilizador autenticado.
const { send, methodGuard, requireUser, effectivePlanId, getPlan, getSettings, usageToday } = require('./_lib/core');

module.exports = async function handler(req, res) {
  if (!methodGuard(req, res, ['GET'])) return;
  const ctx = await requireUser(req, res);
  if (!ctx) return;
  const { user, profile } = ctx;
  const planId = effectivePlanId(profile);
  const [plan, settings, used] = await Promise.all([getPlan(planId), getSettings(), usageToday(user.id)]);
  return send(res, 200, {
    profile: {
      id: profile.id, email: profile.email || user.email, full_name: profile.full_name, phone: profile.phone,
      role: profile.role, plan: profile.plan, plan_expires_at: profile.plan_expires_at, created_at: profile.created_at
    },
    plan: { id: plan.id, name: plan.name, expired: profile.plan !== 'free' && planId === 'free' },
    usage: {
      text: { used: used.text, limit: plan.text_per_day },
      image: { used: used.image, limit: plan.image_per_day }
    },
    isAdmin: profile.role === 'admin',
    aiEnabled: settings.ai_enabled !== false
  });
};
