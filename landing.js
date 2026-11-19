// FLORA AI — página inicial: estado de sessão e preços reais vindos da base de dados.
import { $, el, getClient, getSession, onAuth, mt } from './core.js';
import { initAuthUI, openAuth } from './auth-ui.js';

$('#yr').textContent = new Date().getFullYear();
$('#hLogin').addEventListener('click', () => openAuth('login'));

function header(session) {
  $('#hLogin').hidden = Boolean(session);
  $('#hApp').textContent = session ? 'Abrir a minha conta' : 'Começar grátis';
}

(async function () {
  await initAuthUI();
  header(await getSession());
  onAuth((_, s) => header(s));
  const c = getClient();
  if (!c) return;
  // Mostra os preços atuais definidos pelo administrador (se disponíveis).
  const { data } = await c.from('plans').select('*').order('sort');
  if (!data?.length) return;
  $('#planBox').replaceChildren(...data.map(p => el('div', { class: 'plan' + (p.price_mt > 0 ? ' pop' : '') },
    el('span', { class: 'badge', text: p.price_mt > 0 ? 'Recomendado' : 'Inicial' }), el('h3', { text: p.name }),
    el('div', { class: 'price' }, mt(p.price_mt), el('small', { text: p.price_mt ? ` / ${p.duration_days} dias` : ' / sempre' })),
    el('ul', {}, (p.features || []).map(f => el('li', { text: f }))),
    p.price_mt > 0 ? el('a', { class: 'btn', href: 'app.html#/planos' }, 'Ver ' + p.name) : el('a', { class: 'btn ghost', href: 'app.html' }, 'Começar grátis'))));
})();
