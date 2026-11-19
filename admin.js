// FLORA AI — painel de administração (acesso verificado no servidor)
import { $, el, api, toast, mt, fmtDate, fmtDateTime, getSession, loadConfig, debounce } from './core.js';
import { initAuthUI, openAuth } from './auth-ui.js';

const root = $('#adm');
let tab = 'resumo';
const TABS = [['resumo', 'Resumo'], ['utilizadores', 'Utilizadores'], ['pagamentos', 'Pagamentos'], ['definicoes', 'Definições']];
const call = (action, extra = {}) => api('/api/admin', { method: 'POST', body: { action, ...extra } });
const msgBox = (text, cls = 'err') => el('div', { class: `msg ${cls}`, text });

function shell(content) {
  root.replaceChildren(el('div', { class: 'tabs' }, TABS.map(([id, l]) => el('button', { class: tab === id ? 'on' : '', onclick: () => { tab = id; show(); } }, l))), content);
}
async function show() {
  const box = el('div', {}, el('span', { class: 'spin' })); shell(box);
  try { await ({ resumo: tResumo, utilizadores: tUsers, pagamentos: tPay, definicoes: tConfig })[tab](box); }
  catch (e) { box.replaceChildren(msgBox(e.message)); }
}

async function tResumo(box) {
  const s = await call('stats');
  const stat = (l, v) => el('div', { class: 'card stat' }, el('div', { class: 'lbl', text: l }), el('b', { text: v }));
  const max = Math.max(1, ...s.days.map(d => d.text + d.image));
  box.replaceChildren(
    el('div', { class: 'stats', style: 'grid-template-columns:repeat(auto-fit,minmax(160px,1fr))' }, stat('Utilizadores', s.users), stat('Novos (7 dias)', s.newWeek), stat('Premium ativos', s.premium), stat('Pagamentos por rever', s.pending), stat('Mensagens hoje', s.textToday), stat('Imagens hoje', s.imageToday), stat('Receita confirmada', mt(s.revenue))),
    s.pending > 0 && el('div', { class: 'msg warn' }, `Tens ${s.pending} pagamento(s) à espera de confirmação. `, el('button', { class: 'linkbtn', onclick: () => { tab = 'pagamentos'; show(); } }, 'Rever agora')),
    el('div', { class: 'card' }, el('b', { text: 'Pedidos de IA — últimos 7 dias' }), el('div', { class: 'small muted', text: 'Azul = mensagens • Claro = imagens' }),
      el('div', { class: 'bars' }, s.days.map(d => el('div', {}, el('span', { text: d.text + d.image }), el('i', { style: `height:${(d.text / max) * 100}%` }), el('i', { class: 'b2', style: `height:${(d.image / max) * 100}%` }), el('span', { text: new Date(d.date).toLocaleDateString('pt-PT', { weekday: 'short' }) }))))),
    el('h3', { class: 'sec', text: 'Mais ativos hoje' }), s.top.length ? el('div', { class: 'list' }, s.top.map(t => el('div', { class: 'li' }, el('div', { class: 't' }, el('b', { text: t.email })), el('span', { class: 'badge', text: t.requests + ' pedidos' })))) : el('p', { class: 'muted small', text: 'Sem atividade hoje.' }),
    el('p', { class: 'small muted', style: 'margin-top:20px', text: 'Por privacidade, o administrador não vê o conteúdo das conversas dos utilizadores.' }));
}

async function tUsers(box) {
  let page = 0, q = '';
  const table = el('div'); const pager = el('div', { style: 'display:flex;gap:8px;align-items:center;margin-top:12px' });
  const search = el('input', { class: 'in', placeholder: 'Procurar por email…', style: 'max-width:340px;margin:0 0 14px' });
  const load = async () => {
    table.replaceChildren(el('span', { class: 'spin' }));
    const r = await call('users', { page, q });
    table.replaceChildren(el('div', { class: 'tbl-wrap' }, el('table', { class: 'tbl' }, el('thead', {}, el('tr', {}, ['Email', 'Plano', 'Registo', 'Estado', 'Ações'].map(h => el('th', { text: h })))), el('tbody', {}, r.users.map(u => userRow(u, load))))));
    pager.replaceChildren(el('button', { class: 'btn ghost sm', disabled: page === 0, onclick: () => { page--; load(); } }, '← Anterior'), el('span', { class: 'small muted', text: `${r.total} utilizadores • página ${page + 1}` }), el('button', { class: 'btn ghost sm', disabled: (page + 1) * 20 >= r.total, onclick: () => { page++; load(); } }, 'Seguinte →'));
  };
  search.addEventListener('input', debounce(() => { q = search.value; page = 0; load().catch(e => toast(e.message)); }, 350));
  box.replaceChildren(search, table, pager); await load();
}
function userRow(u, reload) {
  const active = u.plan !== 'free' && u.plan_expires_at && new Date(u.plan_expires_at) > new Date();
  const act = (patch, okMsg) => async () => { try { await call('set_user', { id: u.id, ...patch }); toast(okMsg); reload(); } catch (e) { toast(e.message); } };
  return el('tr', {}, el('td', {}, el('b', { text: u.email || '—' }), el('div', { class: 'small muted', text: [u.full_name, u.phone].filter(Boolean).join(' • ') })),
    el('td', {}, el('span', { class: 'badge' + (active ? ' ok' : ''), text: active ? 'Premium' : 'Grátis' }), active && el('div', { class: 'small muted', text: 'até ' + fmtDate(u.plan_expires_at) }), u.role === 'admin' && el('div', {}, el('span', { class: 'badge warn', text: 'admin' }))),
    el('td', { class: 'small', text: fmtDate(u.created_at) }), el('td', {}, el('span', { class: 'badge ' + (u.blocked ? 'err' : 'ok'), text: u.blocked ? 'Bloqueado' : 'Ativo' })),
    el('td', {}, el('div', { style: 'display:flex;gap:6px;flex-wrap:wrap' },
      el('button', { class: 'btn soft sm', onclick: () => { const d = prompt('Ativar Premium por quantos dias?', '30'); if (d) act({ plan: 'premium', days: Number(d) }, 'Premium ativado')(); } }, 'Dar Premium'),
      active && el('button', { class: 'btn ghost sm', onclick: () => confirm('Voltar ao plano Grátis?') && act({ plan: 'free' }, 'Plano alterado')() }, 'Tirar plano'),
      el('button', { class: 'btn danger sm', onclick: () => confirm(u.blocked ? 'Desbloquear?' : 'Bloquear este utilizador?') && act({ blocked: !u.blocked }, u.blocked ? 'Desbloqueado' : 'Bloqueado')() }, u.blocked ? 'Desbloquear' : 'Bloquear'),
      el('button', { class: 'btn ghost sm', onclick: () => confirm(u.role === 'admin' ? 'Remover acesso de administrador?' : 'Tornar administrador?') && act({ role: u.role === 'admin' ? 'user' : 'admin' }, 'Função alterada')() }, u.role === 'admin' ? 'Tirar admin' : 'Tornar admin'))));
}

async function tPay(box) {
  let status = 'pending';
  const list = el('div'); const sel = el('div', { class: 'tabs' });
  const load = async () => {
    sel.replaceChildren(...[['pending', 'Por rever'], ['approved', 'Confirmados'], ['rejected', 'Recusados']].map(([id, l]) => el('button', { class: status === id ? 'on' : '', onclick: () => { status = id; load(); } }, l)));
    list.replaceChildren(el('span', { class: 'spin' }));
    const r = await call('payments', { status });
    list.replaceChildren(r.payments.length ? el('div', { class: 'list' }, r.payments.map(p => el('div', { class: 'card' },
      el('div', { style: 'display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap' }, el('b', { text: p.profiles?.email || 'Utilizador' }), el('span', { class: 'small muted', text: fmtDateTime(p.created_at) })),
      el('p', { style: 'margin:6px 0' }, `Plano ${p.plan} • `, el('b', { text: mt(p.amount_mt) }), ` • ${p.method}`),
      el('div', { class: 'small' }, 'Referência: ', el('b', { text: p.reference })), p.payer_phone && el('div', { class: 'small', text: 'Número: ' + p.payer_phone }), p.proof && el('div', { class: 'small muted', style: 'margin-top:4px;white-space:pre-wrap', text: p.proof }), p.note && el('div', { class: 'small', text: 'Nota: ' + p.note }),
      status === 'pending' && el('div', { style: 'display:flex;gap:8px;margin-top:12px;flex-wrap:wrap' },
        el('button', { class: 'btn sm', onclick: () => review(p, 'approve') }, 'Confirmar e ativar plano'), el('button', { class: 'btn danger sm', onclick: () => review(p, 'reject') }, 'Recusar'))))) : el('p', { class: 'muted', text: 'Nada para mostrar.' }));
  };
  const review = async (p, decision) => {
    const note = decision === 'reject' ? prompt('Motivo da recusa (o utilizador vai ver):', '') : '';
    if (decision === 'reject' && note === null) return;
    if (decision === 'approve' && !confirm(`Confirma que recebeste ${mt(p.amount_mt)} (ref. ${p.reference}) por ${p.method}?`)) return;
    try { await call('review_payment', { id: p.id, decision, note }); toast(decision === 'approve' ? 'Plano ativado ✓' : 'Pagamento recusado'); load(); } catch (e) { toast(e.message); }
  };
  box.replaceChildren(sel, list); await load();
}

async function tConfig(box) {
  const { settings: s, plans } = await call('get_config');
  const methods = JSON.parse(JSON.stringify(s.payment_methods || []));
  const inp = (v, props = {}) => el('input', { class: 'in', value: v ?? '', ...props });
  const aiOn = el('input', { type: 'checkbox', checked: s.ai_enabled !== false, style: 'width:20px;height:20px' }), payOn = el('input', { type: 'checkbox', checked: s.payments_enabled === true, style: 'width:20px;height:20px' });
  const gText = inp(s.global_text_per_day, { type: 'number', inputmode: 'numeric' }), gImg = inp(s.global_image_per_day, { type: 'number', inputmode: 'numeric' }), rate = inp(s.usdt_rate_mt, { type: 'number', inputmode: 'numeric' });
  const sEmail = inp(s.support_email, { type: 'email' }), sWa = inp(s.support_whatsapp, { placeholder: '25884xxxxxxx' });
  const planRows = plans.map(p => ({ id: p.id, name: p.name, price_mt: inp(p.price_mt, { type: 'number' }), duration_days: inp(p.duration_days, { type: 'number' }), text_per_day: inp(p.text_per_day, { type: 'number' }), image_per_day: inp(p.image_per_day, { type: 'number' }), max_output_tokens: inp(p.max_output_tokens, { type: 'number' }) }));
  const mBox = el('div');
  const drawM = () => mBox.replaceChildren(...methods.map((m, i) => el('div', { class: 'rep' },
    el('b', { text: m.name }), el('label', { class: 'f', style: 'margin-top:8px' }, m.currency === 'USDT' ? 'Endereço da carteira' : 'Número / conta', inp(m.number, { oninput: (e) => { m.number = e.target.value; } })),
    el('label', { class: 'f' }, 'Nome do titular', inp(m.holder, { oninput: (e) => { m.holder = e.target.value; } })),
    el('label', { class: 'f' }, 'Instruções para o cliente', inp(m.instructions, { oninput: (e) => { m.instructions = e.target.value; } })),
    el('p', { class: 'small muted', text: 'Só aparece aos clientes se o número/conta estiver preenchido.' }))));
  drawM();
  const out = el('div');
  const save = async (e) => {
    e.target.disabled = true; out.replaceChildren();
    try {
      await call('save_config', { settings: { ai_enabled: aiOn.checked, payments_enabled: payOn.checked, global_text_per_day: gText.value, global_image_per_day: gImg.value, usdt_rate_mt: rate.value, support_email: sEmail.value, support_whatsapp: sWa.value, payment_methods: methods },
        plans: planRows.map(p => ({ id: p.id, price_mt: p.price_mt.value, duration_days: p.duration_days.value, text_per_day: p.text_per_day.value, image_per_day: p.image_per_day.value, max_output_tokens: p.max_output_tokens.value })) });
      out.replaceChildren(msgBox('Definições guardadas ✓', 'ok'));
    } catch (er) { out.replaceChildren(msgBox(er.message)); }
    e.target.disabled = false;
  };
  const row = (label, input) => el('label', { class: 'f' }, label, input);
  const check = (label, input) => el('label', { style: 'display:flex;gap:10px;align-items:center;font-weight:600;margin-bottom:12px' }, input, label);
  box.replaceChildren(
    el('div', { class: 'card' }, el('h3', { style: 'margin-top:0', text: 'Controlo geral' }), check('IA ligada (desliga para parar todos os custos de IA)', aiOn), check('Pagamentos ativos (mostra «Assinar» aos clientes)', payOn),
      el('div', { class: 'row2' }, row('Limite global de mensagens por dia', gText), row('Limite global de imagens por dia', gImg)), el('p', { class: 'small muted', text: 'Os limites globais protegem-te de custos inesperados: quando são atingidos, a IA pára até ao dia seguinte.' })),
    el('div', { class: 'card', style: 'margin-top:14px' }, el('h3', { style: 'margin-top:0', text: 'Planos e limites' }), ...planRows.map(p => el('div', { class: 'rep' }, el('b', { text: p.name }),
      el('div', { class: 'row2', style: 'margin-top:8px' }, row('Preço (MT)', p.price_mt), row('Duração (dias)', p.duration_days)), el('div', { class: 'row2' }, row('Mensagens por dia', p.text_per_day), row('Imagens por dia', p.image_per_day)), row('Tamanho máx. da resposta (tokens)', p.max_output_tokens)))),
    el('div', { class: 'card', style: 'margin-top:14px' }, el('h3', { style: 'margin-top:0', text: 'Métodos de pagamento' }), mBox, row('Taxa: MT por 1 USDT', rate)),
    el('div', { class: 'card', style: 'margin-top:14px' }, el('h3', { style: 'margin-top:0', text: 'Contactos de suporte' }), el('div', { class: 'row2' }, row('Email', sEmail), row('WhatsApp (com código do país)', sWa))),
    out, el('button', { class: 'btn block', style: 'margin-top:14px', onclick: save }, 'Guardar definições'));
}

(async function boot() {
  const cfg = await loadConfig();
  if (!cfg.configured) return root.replaceChildren(el('div', { class: 'gate card' }, el('h2', { text: 'Sistema não configurado' }), el('p', { class: 'muted', text: 'Define as variáveis do Supabase na Vercel.' })));
  await initAuthUI();
  const entry = async () => {
    const s = await getSession();
    if (!s) return root.replaceChildren(el('div', { class: 'gate card' }, el('h2', { text: 'Área do administrador' }), el('p', { class: 'muted', text: 'Entra com a conta de administrador.' }), el('button', { class: 'btn block', onclick: () => openAuth('login') }, 'Entrar')));
    try { const me = await api('/api/me'); if (!me.isAdmin) return root.replaceChildren(el('div', { class: 'gate card' }, el('h2', { text: 'Sem permissão' }), el('p', { class: 'muted', text: 'Esta conta não é administradora.' }), el('a', { class: 'btn ghost', href: 'app.html' }, 'Voltar'))); show(); }
    catch (e) { root.replaceChildren(el('div', { class: 'gate card' }, msgBox(e.message))); }
  };
  const { onAuth } = await import('./core.js'); onAuth((ev) => { if (ev === 'SIGNED_IN' || ev === 'SIGNED_OUT') entry(); });
  entry();
})();
