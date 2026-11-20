// FLORA AI — aplicação do utilizador (painel, chat, ferramentas, CV, histórico, planos, conta)
import { $, el, icon, api, toast, md, mt, fmtDate, fmtDateTime, getClient, getSession, onAuth, loadConfig } from './core.js';
import { initAuthUI, openAuth } from './auth-ui.js';
import { renderCV } from './cv.js';

const S = { session: null, me: null, meError: null, support: {}, chat: null };
const page = $('#page');

const NAV = [
  ['home', 'Início', 'home'], ['chat', 'Chat IA', 'chat'], ['ferramentas', 'Ferramentas', 'grid'], ['cv', 'Currículo', 'doc'],
  ['historico', 'Histórico', 'clock'], ['planos', 'Planos', 'star'], ['conta', 'Conta', 'user']
];
const BOTTOM = ['home', 'chat', 'ferramentas', 'cv', 'conta'];
const TITLES = { home: 'Início', chat: 'Chat IA', ferramentas: 'Ferramentas', ferramenta: 'Ferramenta', cv: 'Currículo', historico: 'Histórico', planos: 'Planos', conta: 'Conta' };
const TOOLS = {
  carta: { name: 'Carta de apresentação', icon: 'mail', desc: 'Carta profissional para a vaga que procuras.', fields: [
    { k: 'vaga', l: 'Vaga e empresa', ph: 'Ex.: Assistente administrativo — Empresa X', max: 150 },
    { k: 'perfil', l: 'O teu perfil e experiência', ph: 'Formação, experiência, competências…', area: true, max: 1500 },
    { k: 'tom', l: 'Tom', sel: ['Formal', 'Amigável e profissional', 'Direto e curto'] }],
    build: v => `Escreve uma carta de apresentação.\nVaga: ${v.vaga}\nPerfil do candidato: ${v.perfil}\nTom: ${v.tom}` },
  texto: { name: 'Criador de textos', icon: 'pen', desc: 'Publicações, anúncios, descrições e mensagens.', fields: [
    { k: 'tipo', l: 'Tipo de texto', sel: ['Publicação para Instagram/Facebook', 'Descrição de produto', 'Mensagem de WhatsApp', 'Anúncio', 'Email profissional', 'Outro'] },
    { k: 'tema', l: 'Sobre o quê?', ph: 'Ex.: Loja de roupa em Maputo com promoção de fim de semana', area: true, max: 1500 },
    { k: 'publico', l: 'Público', ph: 'Ex.: jovens adultos', max: 100 }],
    build: v => `Cria um texto do tipo: ${v.tipo}.\nAssunto: ${v.tema}\nPúblico: ${v.publico || 'geral'}` },
  traducao: { name: 'Tradução', icon: 'globe', desc: 'Traduz textos com linguagem natural.', fields: [
    { k: 'lang', l: 'Traduzir para', sel: ['Inglês', 'Português', 'Francês', 'Espanhol', 'Chinês', 'Árabe', 'Suaíli'] },
    { k: 'texto', l: 'Texto', ph: 'Cola ou escreve o texto…', area: true, max: 3000, rows: 6 }],
    build: v => `Traduz para ${v.lang}:\n\n${v.texto}` },
  entrevista: { name: 'Preparar entrevista', icon: 'mic', desc: 'Perguntas prováveis e ideias de resposta.', fields: [
    { k: 'vaga', l: 'Vaga', ph: 'Ex.: Técnico tributário', max: 150 },
    { k: 'exp', l: 'A tua experiência', ph: 'Resumo da tua formação e experiência', area: true, max: 1500 },
    { k: 'n', l: 'Número de perguntas', sel: ['5', '7', '10'] }],
    build: v => `Prepara-me para uma entrevista.\nVaga: ${v.vaga}\nA minha experiência: ${v.exp}\nCria ${v.n} perguntas prováveis com sugestões de resposta e dicas finais.` }
};
const TOOL_LABEL = { chat: 'Chat', carta: 'Carta', texto: 'Texto', traducao: 'Tradução', entrevista: 'Entrevista' };
const SUGGEST = ['Explica de forma simples como organizar um pequeno negócio', 'Ajuda-me a preparar uma entrevista de emprego', 'Escreve uma mensagem de WhatsApp para pedir um orçamento', 'Resume em 5 pontos como poupar dinheiro todos os meses'];

const go = (h) => { location.hash = h; };
const isLogged = () => Boolean(S.session);
const firstName = () => (S.me?.profile?.full_name || S.session?.user?.user_metadata?.full_name || S.session?.user?.email || '').split(/[\s@]/)[0];
function needLogin() { openAuth('login'); }

// ------------------------------------------------------------------- Navegação
function drawNav(route) {
  const side = $('#side'), bottom = $('#bottom');
  side.replaceChildren(el('a', { class: 'brand', href: 'index.html' }, el('img', { src: 'favicon.svg', alt: '' }), el('span', {}, 'FLORA ', el('b', { text: 'AI' }))),
    ...NAV.map(([id, lbl, ic]) => el('button', { class: 'nav-i' + (route === id ? ' on' : ''), onclick: () => go('#/' + id) }, icon(ic), lbl)),
    S.me?.isAdmin && el('a', { class: 'nav-i', href: 'admin.html' }, icon('shield'), 'Administração'),
    el('div', { class: 'sp' }),
    isLogged() ? el('button', { class: 'nav-i', onclick: logout }, icon('logout'), 'Sair') : el('button', { class: 'nav-i', onclick: needLogin }, icon('user'), 'Entrar'));
  bottom.replaceChildren(...BOTTOM.map(id => { const n = NAV.find(x => x[0] === id); return el('button', { class: route === id ? 'on' : '', onclick: () => go('#/' + id) }, icon(n[2]), n[1]); }));
  const tr = $('#topRight');
  tr.replaceChildren(...(isLogged()
    ? [S.me && el('span', { class: 'badge' + (S.me.plan.id === 'free' ? '' : ' ok'), text: 'Plano ' + S.me.plan.name }), S.me?.isAdmin && el('a', { class: 'btn ghost sm', href: 'admin.html' }, 'Admin')]
    : [el('button', { class: 'btn sm', onclick: needLogin }, 'Entrar')]));
}
async function logout() { try { await getClient()?.auth.signOut(); } catch { /* ignorar */ } S.me = null; go('#/'); render(); }

function gate(msg) {
  page.className = 'page';
  page.replaceChildren(el('div', { class: 'gate card' }, el('h2', { text: 'Entra para continuar' }), el('p', { class: 'muted', text: msg || 'Cria uma conta grátis ou entra para usar esta área.' }),
    el('button', { class: 'btn block', onclick: () => openAuth('signup') }, 'Criar conta grátis'), el('p', { style: 'margin:12px 0 0' }, el('button', { class: 'linkbtn', onclick: needLogin }, 'Já tenho conta')),
    el('p', { class: 'small muted', style: 'margin-top:14px' }, 'O criador de currículos é gratuito e funciona sem conta.'), el('a', { class: 'btn ghost sm', href: '#/cv', style: 'margin-top:6px' }, 'Abrir criador de currículos')));
}

async function loadMe() {
  S.me = null; S.meError = null;
  if (!isLogged()) return;
  try { S.me = await api('/api/me'); } catch (e) { S.meError = e; }
}

function parseRoute() {
  const h = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  return { name: h[0] || 'home', arg: h[1] };
}

async function render() {
  const { name, arg } = parseRoute();
  const valid = ['home', 'chat', 'ferramentas', 'ferramenta', 'cv', 'historico', 'planos', 'conta'];
  const route = valid.includes(name) ? name : 'home';
  drawNav(route === 'ferramenta' ? 'ferramentas' : route);
  $('#ttl').textContent = TITLES[route];
  document.title = `${TITLES[route]} — FLORA AI`;
  page.className = 'page';
  window.scrollTo(0, 0);
  const cfg = await loadConfig();
  if (!cfg.configured && route !== 'cv') {
    return page.replaceChildren(el('div', { class: 'gate card' }, el('h2', { text: 'Sistema ainda não configurado' }), el('p', { class: 'muted', text: 'O administrador precisa de ligar o Supabase na Vercel (variáveis SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY) e fazer um novo deploy.' }), el('a', { class: 'btn ghost', href: '#/cv' }, 'Usar o criador de currículos')));
  }
  if (route === 'cv') return renderCV(page, { isLogged, isLoggedIn: isLogged, needLogin, userId: () => S.session?.user?.id, refreshUsage: async () => { await loadMe(); drawNav('cv'); } });
  if (!isLogged()) return gate();
  if (S.meError && !S.me) {
    const e = S.meError;
    return page.replaceChildren(el('div', { class: 'gate card' }, el('h2', { text: 'Não foi possível carregar a conta' }), el('p', { class: 'muted', text: e.message }), el('button', { class: 'btn', onclick: async () => { await loadMe(); render(); } }, 'Tentar novamente')));
  }
  ({ home: viewHome, chat: () => viewChat(arg), ferramentas: viewTools, ferramenta: () => viewTool(arg), historico: viewHistory, planos: viewPlans, conta: viewAccount })[route]();
}

// ------------------------------------------------------------------------ Início
async function viewHome() {
  const m = S.me;
  const meter = (lbl, u) => el('div', { class: 'card stat' }, el('div', { class: 'lbl', text: lbl }), el('b', { text: `${u.used} / ${u.limit}` }), el('div', { class: 'meter' }, el('i', { style: `width:${u.limit ? Math.min(100, u.used / u.limit * 100) : 0}%` })));
  const recent = el('div', { class: 'list' }, el('span', { class: 'spin' }));
  page.replaceChildren(
    el('div', { class: 'hello' }, el('h2', { text: `Olá, ${firstName() || 'bem-vindo(a)'} 👋` }), el('p', { class: 'muted', text: 'O que queres criar hoje?' })),
    el('div', { class: 'stats' }, meter('Mensagens hoje', m.usage.text), meter('Imagens hoje', m.usage.image),
      el('div', { class: 'card stat' }, el('div', { class: 'lbl', text: 'O teu plano' }), el('b', { text: m.plan.name }), el('div', { class: 'small muted', style: 'margin-top:8px' }, m.plan.id === 'free' ? el('a', { href: '#/planos' }, 'Ver Premium →') : 'Válido até ' + fmtDate(m.profile.plan_expires_at)))),
    m.plan.expired && el('div', { class: 'msg warn', text: 'O teu plano Premium expirou. Renova em Planos para recuperar os limites maiores.' }),
    !m.aiEnabled && el('div', { class: 'msg warn', text: 'A IA está temporariamente em manutenção.' }),
    el('div', { class: 'tool-grid' },
      toolCard('chat', 'Chat IA', 'Conversa e faz perguntas.', '#/chat'), toolCard('image', 'Gerar imagens', 'Descreve e a IA cria.', '#/chat?image'),
      ...Object.entries(TOOLS).map(([id, t]) => toolCard(t.icon, t.name, t.desc, '#/ferramenta/' + id)), toolCard('doc', 'Currículo', 'Cria e guarda em PDF.', '#/cv')),
    el('h3', { class: 'sec', text: 'Conversas recentes' }), recent);
  const { data } = await getClient().from('conversations').select('id,title,tool,updated_at').order('updated_at', { ascending: false }).limit(5);
  recent.replaceChildren(...(data?.length ? data.map(convRow) : [el('p', { class: 'muted small', text: 'Ainda não tens conversas. Começa com o chat!' })]));
}
function toolCard(ic, title, desc, href) {
  const hash = href.split('?')[0];
  return el('button', { class: 'tool', onclick: () => { if (href.includes('?image')) S.startImage = true; go(hash); } }, el('div', { class: 'ic' }, icon(ic === 'image' ? 'image' : ic)), el('b', { text: title }), el('span', { class: 'd', text: desc }));
}
function convRow(c) {
  return el('div', { class: 'li' }, el('div', { class: 't' }, el('b', { text: c.title }), el('small', { text: `${TOOL_LABEL[c.tool] || 'Chat'} • ${fmtDateTime(c.updated_at)}` })), el('button', { class: 'btn soft sm', onclick: () => go('#/chat/' + c.id) }, 'Abrir'));
}

// ------------------------------------------------------------------------- Chat
const imgCache = new Map();
async function signed(path) {
  if (imgCache.has(path)) return imgCache.get(path);
  const { data } = await getClient().storage.from('generated-images').createSignedUrl(path, 3600);
  if (data?.signedUrl) imgCache.set(path, data.signedUrl);
  return data?.signedUrl || null;
}
function bubble(m) {
  if (m.role === 'user') return el('div', { class: 'm u' }, el('div', { class: 'bd', text: m.content }));
  const bd = el('div', { class: 'bd' });
  if (m.kind === 'image') {
    const img = el('img', { class: 'gen', alt: m.content, loading: 'lazy' }); bd.append(img);
    signed(m.image_path).then(u => { if (u) { img.src = u; bd.append(el('div', { class: 'acts' }, el('a', { class: 'btn soft sm', href: u, target: '_blank', rel: 'noopener' }, 'Abrir / guardar imagem'))); } else img.replaceWith(el('p', { class: 'muted', text: 'Não foi possível carregar a imagem.' })); });
  } else {
    bd.innerHTML = md(m.content);
    bd.append(el('div', { class: 'acts' }, el('button', { class: 'btn ghost sm', onclick: async () => { try { await navigator.clipboard.writeText(m.content); toast('Copiado ✓'); } catch { toast('Seleciona o texto para copiar.'); } } }, icon('copy'), 'Copiar')));
  }
  return el('div', { class: 'm a' }, el('div', { class: 'av', text: 'F' }), bd);
}

async function viewChat(convId) {
  page.className = 'page chat-page';
  const st = S.chat = { id: convId || null, mode: S.startImage ? 'image' : 'text', busy: false };
  S.startImage = false;
  const side = el('div', { class: 'chat-side' }), msgs = el('div', { class: 'msgs', 'aria-live': 'polite' });
  const ta = el('textarea', { rows: 1, maxlength: 4000, placeholder: 'Escreve a tua mensagem…', 'aria-label': 'Mensagem' });
  const sendBtn = el('button', { class: 'send', 'aria-label': 'Enviar' }, icon('send'));
  const meta = el('span');
  const modeBtn = (id, lbl, ic) => el('button', { type: 'button', class: st.mode === id ? 'on' : '', onclick: () => { st.mode = id; updMode(); } }, icon(ic), lbl);
  const modeBox = el('div', { class: 'mode' });
  function updMode() {
    modeBox.replaceChildren(modeBtn('text', 'Texto', 'chat'), modeBtn('image', 'Imagem', 'image'));
    ta.placeholder = st.mode === 'image' ? 'Descreve a imagem que queres criar…' : 'Escreve a tua mensagem…';
    const u = S.me.usage[st.mode];
    meta.textContent = `${st.mode === 'image' ? 'Imagens' : 'Mensagens'} hoje: ${u.used}/${u.limit}`;
  }
  const empty = () => el('div', { class: 'empty' }, el('img', { src: 'favicon.svg', width: 56, height: 56, alt: '' }), el('h2', { text: 'Como posso ajudar?' }), el('p', { class: 'muted', text: 'Conversa com a FLORA AI ou muda para «Imagem» para criar ilustrações.' }),
    el('div', { class: 'chips' }, SUGGEST.map(s => el('button', { class: 'chip', onclick: () => { ta.value = s; ta.focus(); } }, s))));
  const toBottom = () => { msgs.scrollTop = msgs.scrollHeight; };
  const grow = () => { ta.style.height = 'auto'; ta.style.height = Math.min(160, ta.scrollHeight) + 'px'; };
  ta.addEventListener('input', grow);
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && matchMedia('(hover:hover)').matches) { e.preventDefault(); sendMsg(); } });
  sendBtn.onclick = sendMsg;

  async function sendMsg() {
    const text = ta.value.trim(); if (!text || st.busy) return;
    if (st.mode === 'image' && text.length < 4) return toast('Descreve melhor a imagem.');
    st.busy = true; sendBtn.disabled = true; ta.value = ''; grow();
    msgs.querySelector('.empty')?.remove();
    msgs.append(bubble({ role: 'user', content: (st.mode === 'image' ? '🎨 ' : '') + text }));
    const wait = el('div', { class: 'm a' }, el('div', { class: 'av', text: 'F' }), el('div', { class: 'bd' }, el('span', { class: 'typing' }, el('i'), el('i'), el('i')), st.mode === 'image' ? el('div', { class: 'small muted', text: 'A criar a imagem… pode demorar até 30 segundos.' }) : null));
    msgs.append(wait); toBottom();
    try {
      const r = st.mode === 'image'
        ? await api('/api/image', { method: 'POST', body: { prompt: text, conversation_id: st.id } })
        : await api('/api/ai', { method: 'POST', body: { message: text, conversation_id: st.id, tool: 'chat' } });
      wait.replaceWith(bubble(r.message));
      if (r.conversation_id && r.conversation_id !== st.id) { st.id = r.conversation_id; history.replaceState(null, '', '#/chat/' + st.id); }
      S.me.usage[st.mode].used = r.usage.used; updMode(); loadList();
    } catch (e) {
      const bd = el('div', { class: 'bd', style: 'border-color:#f2c4c8;background:#fff6f7' }, el('p', { text: e.message }));
      if (e.code === 'quota') bd.append(el('button', { class: 'btn sm', onclick: () => go('#/planos') }, 'Ver planos'));
      if (e.code === 'auth') bd.append(el('button', { class: 'btn sm', onclick: needLogin }, 'Entrar'));
      wait.replaceWith(el('div', { class: 'm a' }, el('div', { class: 'av', text: '!' }), bd));
      ta.value = text; grow();
    } finally { st.busy = false; sendBtn.disabled = false; toBottom(); }
  }

  async function loadList() {
    const { data } = await getClient().from('conversations').select('id,title,tool,updated_at').order('updated_at', { ascending: false }).limit(60);
    side.replaceChildren(el('button', { class: 'btn sm', onclick: () => { go('#/chat'); if (!convId) viewChat(); } }, icon('plus'), 'Nova conversa'), el('button', { class: 'btn ghost sm only-m', onclick: () => side.classList.remove('open') }, 'Fechar'),
      ...(data || []).map(c => el('button', { class: 'conv' + (c.id === st.id ? ' on' : ''), onclick: () => { side.classList.remove('open'); go('#/chat/' + c.id); } }, c.title)));
  }

  page.replaceChildren(el('div', { class: 'chat' }, side,
    el('div', { class: 'chat-main' }, el('div', { style: 'padding:8px 14px 0;display:flex;gap:8px' }, el('button', { class: 'btn ghost sm only-m', onclick: () => side.classList.add('open') }, icon('menu'), 'Conversas')), msgs,
      el('div', { class: 'composer' }, el('div', { class: 'composer-in' }, modeBox, el('div', { class: 'box' }, ta, sendBtn), el('div', { class: 'cmeta' }, meta, el('span', { text: 'A IA pode errar. Confirma informações importantes.' })))))));
  updMode(); loadList();
  if (st.id) {
    msgs.append(el('div', { class: 'gate' }, el('span', { class: 'spin' })));
    const { data, error } = await getClient().from('messages').select('role,kind,content,image_path,created_at').eq('conversation_id', st.id).order('created_at');
    msgs.replaceChildren();
    if (error || !data?.length) { msgs.append(el('div', { class: 'empty' }, el('p', { class: 'muted', text: 'Conversa não encontrada.' }))); st.id = null; }
    else data.forEach(m => msgs.append(bubble(m)));
    toBottom();
  } else msgs.append(empty());
}

// ------------------------------------------------------------------ Ferramentas
function viewTools() {
  page.replaceChildren(el('div', { class: 'hello' }, el('h2', { text: 'Ferramentas' }), el('p', { class: 'muted', text: 'Escolhe o que queres criar. Tudo fica guardado no teu histórico.' })),
    el('div', { class: 'tool-grid' }, ...Object.entries(TOOLS).map(([id, t]) => toolCard(t.icon, t.name, t.desc, '#/ferramenta/' + id)), toolCard('doc', 'Criador de currículos', 'Vários modelos, exporta em PDF.', '#/cv'), toolCard('image', 'Gerar imagens', 'Cria imagens a partir de texto.', '#/chat?image')));
}
function viewTool(id) {
  const t = TOOLS[id]; if (!t) return go('#/ferramentas');
  const vals = {}; const out = el('div'); const btn = el('button', { class: 'btn', type: 'submit' }, 'Gerar com IA');
  const form = el('form', { class: 'card' }, ...t.fields.map(f => {
    vals[f.k] = f.sel ? f.sel[0] : '';
    const inp = f.sel ? el('select', { class: 'in' }, f.sel.map(o => el('option', { value: o, text: o }))) : el(f.area ? 'textarea' : 'input', { class: 'in', maxlength: f.max || 200, placeholder: f.ph || '', rows: f.area ? (f.rows || 4) : null });
    inp.addEventListener('input', () => { vals[f.k] = inp.value; });
    return el('label', { class: 'f' }, f.l, inp);
  }), btn, el('p', { class: 'small muted', style: 'margin-top:12px', text: 'Não escrevas palavras-passe nem dados bancários.' }));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const required = t.fields.filter(f => !f.sel && f.k !== 'publico');
    if (required.some(f => !(vals[f.k] || '').trim())) return toast('Preenche todos os campos obrigatórios.');
    btn.disabled = true; btn.textContent = 'A gerar…'; out.replaceChildren(el('div', { style: 'padding:18px;text-align:center' }, el('span', { class: 'spin' })));
    try {
      const r = await api('/api/ai', { method: 'POST', body: { tool: id, message: t.build(vals) } });
      S.me.usage.text.used = r.usage.used;
      out.replaceChildren(el('div', { class: 'result', text: r.message.content }), el('div', { style: 'display:flex;gap:8px;margin-top:10px;flex-wrap:wrap' },
        el('button', { class: 'btn ghost sm', type: 'button', onclick: async () => { try { await navigator.clipboard.writeText(r.message.content); toast('Copiado ✓'); } catch { toast('Seleciona o texto para copiar.'); } } }, icon('copy'), 'Copiar'),
        r.conversation_id && el('button', { class: 'btn soft sm', type: 'button', onclick: () => go('#/chat/' + r.conversation_id) }, 'Continuar no chat para ajustar')));
    } catch (er) { out.replaceChildren(el('div', { class: 'msg err', text: er.message }), er.code === 'quota' ? el('button', { class: 'btn sm', type: 'button', onclick: () => go('#/planos') }, 'Ver planos') : null); }
    finally { btn.disabled = false; btn.textContent = 'Gerar com IA'; }
  });
  page.replaceChildren(el('button', { class: 'linkbtn', onclick: () => go('#/ferramentas') }, '← Ferramentas'), el('div', { class: 'hello', style: 'margin:8px 0 16px' }, el('h2', { text: t.name }), el('p', { class: 'muted', text: t.desc })), form, out);
}

// ---------------------------------------------------------------------- Histórico
async function viewHistory() {
  const list = el('div', { class: 'list' }, el('span', { class: 'spin' }));
  page.replaceChildren(el('div', { class: 'hello' }, el('h2', { text: 'Histórico' }), el('p', { class: 'muted', text: 'As tuas conversas e criações. Só tu consegues vê-las.' })), list);
  const { data, error } = await getClient().from('conversations').select('id,title,tool,updated_at').order('updated_at', { ascending: false }).limit(100);
  if (error) return list.replaceChildren(el('div', { class: 'msg err', text: 'Não foi possível carregar o histórico.' }));
  if (!data.length) return list.replaceChildren(el('p', { class: 'muted', text: 'Ainda não tens histórico.' }));
  list.replaceChildren(...data.map(c => el('div', { class: 'li' }, el('div', { class: 't' }, el('b', { text: c.title }), el('small', { text: `${TOOL_LABEL[c.tool] || 'Chat'} • ${fmtDateTime(c.updated_at)}` })),
    el('button', { class: 'btn soft sm', onclick: () => go('#/chat/' + c.id) }, 'Abrir'),
    el('button', { class: 'icon-btn', 'aria-label': 'Apagar', onclick: async (ev) => {
      if (!confirm('Apagar esta conversa? Não pode ser recuperada.')) return;
      const imgs = await getClient().from('messages').select('image_path').eq('conversation_id', c.id).eq('kind', 'image');
      const paths = (imgs.data || []).map(x => x.image_path).filter(Boolean);
      if (paths.length) await getClient().storage.from('generated-images').remove(paths);
      const r = await getClient().from('conversations').delete().eq('id', c.id);
      if (r.error) return toast('Não foi possível apagar.');
      ev.target.closest('.li').remove();
    } }, icon('trash')))));
}

// ------------------------------------------------------------------------- Planos
async function viewPlans() {
  page.replaceChildren(el('div', { class: 'hello' }, el('h2', { text: 'Planos' }), el('p', { class: 'muted', text: 'Começa grátis. Melhora quando precisares de mais.' })), el('div', { id: 'plansBox' }, el('span', { class: 'spin' })));
  let info;
  try { info = await api('/api/payments'); } catch (e) { return $('#plansBox').replaceChildren(el('div', { class: 'msg err', text: e.message })); }
  const cur = S.me.plan.id;
  const cards = info.plans.map(p => el('div', { class: 'plan' + (p.price_mt > 0 ? ' pop' : '') },
    el('span', { class: 'badge', text: cur === p.id ? 'O teu plano' : p.price_mt > 0 ? 'Recomendado' : 'Inicial' }), el('h3', { text: p.name }),
    el('div', { class: 'price' }, mt(p.price_mt), el('small', { text: p.price_mt ? ` / ${p.duration_days} dias` : ' / sempre' })),
    el('ul', {}, (p.features || []).map(f => el('li', { text: f }))),
    p.price_mt === 0 ? el('button', { class: 'btn ghost block', disabled: true }, cur === 'free' ? 'Plano atual' : 'Incluído') :
      info.enabled ? el('button', { class: 'btn block', onclick: () => payModal(p, info) }, cur === p.id ? 'Renovar' : 'Assinar ' + p.name) : el('button', { class: 'btn block', disabled: true }, 'Pagamentos em breve')));
  const box = $('#plansBox');
  box.replaceChildren(el('div', { class: 'plans' }, cards), !info.enabled && el('div', { class: 'msg info', style: 'max-width:760px;margin:16px auto', text: 'Os pagamentos ainda não estão ativos. Nada é cobrado e nenhum plano pago pode ser ativado por agora.' }),
    el('h3', { class: 'sec', text: 'Os meus pagamentos' }), info.payments.length ? el('div', { class: 'tbl-wrap' }, el('table', { class: 'tbl' }, el('thead', {}, el('tr', {}, ['Data', 'Plano', 'Valor', 'Método', 'Estado'].map(h => el('th', { text: h })))),
      el('tbody', {}, info.payments.map(p => el('tr', {}, el('td', { text: fmtDate(p.created_at) }), el('td', { text: p.plan }), el('td', { text: mt(p.amount_mt) }), el('td', { text: p.method }),
        el('td', {}, el('span', { class: 'badge ' + ({ pending: 'warn', approved: 'ok', rejected: 'err' })[p.status], text: ({ pending: 'Em análise', approved: 'Confirmado', rejected: 'Recusado' })[p.status] }), p.note && el('div', { class: 'small muted', text: p.note }))))))) : el('p', { class: 'muted small', text: 'Ainda não fizeste pagamentos.' }));
}
function payModal(plan, info) {
  let method = null, bg;
  const close = () => bg.remove();
  const body = el('div');
  const draw = () => {
    const m = info.methods.find(x => x.id === method);
    const amount = m ? (m.currency === 'USDT' ? `${(Math.ceil(plan.price_mt / m.rate * 100) / 100).toFixed(2)} USDT` : mt(plan.price_mt)) : '';
    const ref = el('input', { class: 'in', maxlength: 60, placeholder: 'Ex.: ID da transação' }), phone = el('input', { class: 'in', maxlength: 40, inputmode: 'tel', placeholder: 'Opcional' }), proof = el('textarea', { class: 'in', rows: 2, maxlength: 500, placeholder: 'Opcional: cola aqui a mensagem de confirmação' });
    const msg = el('div'); const send = el('button', { class: 'btn block', type: 'button' }, 'Enviar comprovativo');
    send.onclick = async () => {
      send.disabled = true; msg.replaceChildren();
      try { const r = await api('/api/payments', { method: 'POST', body: { plan: plan.id, method, reference: ref.value, payer_phone: phone.value, proof: proof.value } }); toast(r.message); close(); viewPlans(); }
      catch (e) { msg.replaceChildren(el('div', { class: 'msg err', text: e.message })); send.disabled = false; }
    };
    body.replaceChildren(el('h3', { style: 'margin:0 0 4px', text: `Assinar ${plan.name}` }), el('p', { class: 'muted small', text: `Valor: ${mt(plan.price_mt)} por ${plan.duration_days} dias.` }),
      el('p', { class: 'small', style: 'font-weight:700', text: '1. Escolhe como pagar' }), ...info.methods.map(x => el('button', { type: 'button', class: 'pm' + (x.id === method ? ' on' : ''), onclick: () => { method = x.id; draw(); } }, x.name)),
      m && el('div', {}, el('div', { class: 'msg info' }, el('div', {}, 'Paga ', el('b', { text: amount }), ' para:'), el('div', { style: 'font-size:18px;font-weight:800;margin:4px 0', text: m.number }), m.holder && el('div', { text: 'Nome: ' + m.holder }), m.instructions && el('div', { class: 'small', style: 'margin-top:6px', text: m.instructions })),
        el('p', { class: 'small', style: 'font-weight:700;margin-top:14px', text: '2. Depois de pagar, envia o comprovativo' }), el('label', { class: 'f' }, 'ID / referência da transação', ref), el('label', { class: 'f' }, 'O teu número usado no pagamento', phone), el('label', { class: 'f' }, 'Mensagem de confirmação', proof), msg, send,
        el('p', { class: 'small muted', style: 'margin-top:10px', text: 'O plano é ativado depois de o administrador confirmar o pagamento. Normalmente em poucas horas.' })),
      el('button', { class: 'btn ghost block', type: 'button', style: 'margin-top:10px', onclick: close }, 'Cancelar'));
  };
  bg = el('div', { class: 'modal', onclick: (e) => { if (e.target === bg) close(); } }, el('div', {}, body)); document.body.append(bg); draw();
}

// -------------------------------------------------------------------------- Conta
async function viewAccount() {
  const p = S.me.profile; const c = getClient();
  const name = el('input', { class: 'in', maxlength: 80, value: p.full_name || '' }), phone = el('input', { class: 'in', maxlength: 40, inputmode: 'tel', value: p.phone || '' });
  const pm = el('div'), pw = el('input', { class: 'in', type: 'password', minlength: 8, maxlength: 128, autocomplete: 'new-password' }), pm2 = el('div');
  const { data: sup } = await c.from('settings').select('key,value').in('key', ['support_email', 'support_whatsapp']);
  const support = Object.fromEntries((sup || []).map(r => [r.key, r.value]));
  page.replaceChildren(el('div', { class: 'hello' }, el('h2', { text: 'A minha conta' })),
    el('div', { class: 'card' }, el('h3', { style: 'margin-top:0', text: 'Perfil' }), el('label', { class: 'f' }, 'Email', el('input', { class: 'in', value: p.email, disabled: true })),
      el('label', { class: 'f' }, 'Nome', name), el('label', { class: 'f' }, 'Telefone', phone), pm,
      el('button', { class: 'btn', onclick: async (e) => { e.target.disabled = true; const r = await c.from('profiles').update({ full_name: name.value.trim() || null, phone: phone.value.trim() || null }).eq('id', p.id); e.target.disabled = false; pm.replaceChildren(el('div', { class: 'msg ' + (r.error ? 'err' : 'ok'), text: r.error ? 'Não foi possível guardar.' : 'Perfil guardado ✓' })); if (!r.error) { S.me.profile.full_name = name.value.trim(); } } }, 'Guardar perfil')),
    el('div', { class: 'card', style: 'margin-top:14px' }, el('h3', { style: 'margin-top:0', text: 'Plano' }), el('p', {}, el('span', { class: 'badge ' + (S.me.plan.id === 'free' ? '' : 'ok'), text: S.me.plan.name }), p.plan !== 'free' && S.me.plan.id !== 'free' ? ` válido até ${fmtDate(p.plan_expires_at)}` : ''), el('a', { class: 'btn soft sm', href: '#/planos' }, 'Ver planos e pagamentos')),
    el('div', { class: 'card', style: 'margin-top:14px' }, el('h3', { style: 'margin-top:0', text: 'Mudar palavra-passe' }), el('label', { class: 'f' }, 'Nova palavra-passe', pw), pm2,
      el('button', { class: 'btn ghost', onclick: async (e) => { if (pw.value.length < 8) return pm2.replaceChildren(el('div', { class: 'msg err', text: 'Mínimo 8 caracteres.' })); e.target.disabled = true; const r = await c.auth.updateUser({ password: pw.value }); e.target.disabled = false; pw.value = ''; pm2.replaceChildren(el('div', { class: 'msg ' + (r.error ? 'err' : 'ok'), text: r.error ? 'Não foi possível alterar. Tenta uma palavra-passe diferente.' : 'Palavra-passe alterada ✓' })); } }, 'Alterar')),
    el('div', { class: 'card', style: 'margin-top:14px' }, el('h3', { style: 'margin-top:0', text: 'Privacidade e suporte' }),
      el('p', { class: 'small muted', text: 'Para eliminar a tua conta e dados, contacta o suporte.' }),
      el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' }, support.support_email && el('a', { class: 'btn ghost sm', href: 'mailto:' + support.support_email }, 'Email'), support.support_whatsapp && el('a', { class: 'btn ghost sm', target: '_blank', rel: 'noopener', href: 'https://wa.me/' + String(support.support_whatsapp).replace(/\D/g, '') }, 'WhatsApp'), el('a', { class: 'btn ghost sm', href: 'privacidade.html' }, 'Privacidade'), el('a', { class: 'btn ghost sm', href: 'termos.html' }, 'Termos'))),
    el('button', { class: 'btn danger block', style: 'margin-top:14px', onclick: logout }, icon('logout'), 'Terminar sessão'));
}

// --------------------------------------------------------------------------- Arranque
(async function boot() {
  await initAuthUI();
  S.session = await getSession();
  await loadMe();
  onAuth(async (event, session) => {
    const was = isLogged(); S.session = session;
    if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
      if (event === 'SIGNED_IN' && was) return; // renovação de token
      await loadMe(); render();
    }
  });
  window.addEventListener('hashchange', render);
  render();
})();
