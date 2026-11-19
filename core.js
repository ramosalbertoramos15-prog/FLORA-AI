// FLORA AI — utilitários partilhados (Supabase, API, UI)
const CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
let client = null, cfg = null, initPromise = null;
const listeners = new Set();

// replaceChildren nativo converte undefined/false em texto; aqui ignora-os.
const _rc = Element.prototype.replaceChildren;
Element.prototype.replaceChildren = function (...nodes) { return _rc.apply(this, nodes.flat().filter(x => x != null && x !== false && x !== true)); };

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export function el(tag, props = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) { if (kid == null || kid === false) continue; n.append(kid.nodeType ? kid : document.createTextNode(String(kid))); }
  return n;
}

const ICONS = {
  home: 'M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z', chat: 'M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-5.4A8 8 0 1 1 21 12z',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z', doc: 'M7 3h8l4 4v14H7zM15 3v4h4M10 12h6M10 16h6',
  clock: 'M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z', star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0', shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  send: 'M5 12l15-8-5 16-3-7z', image: 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M9 9.5h.01', plus: 'M12 5v14M5 12h14',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13', copy: 'M9 9h11v11H9zM5 15V5h10', menu: 'M4 6h16M4 12h16M4 18h16',
  logout: 'M10 4H5v16h5M15 8l4 4-4 4M19 12H9', mail: 'M3 6h18v12H3zM3 7l9 7 9-7', globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18',
  mic: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM6 11a6 6 0 0 0 12 0M12 17v4', pen: 'M4 20l4-1 11-11-3-3L5 16zM14 6l3 3',
  print: 'M7 9V3h10v6M7 17H4v-6h16v6h-3M7 14h10v7H7z', close: 'M6 6l12 12M18 6L6 18', check: 'M5 13l4 4L19 7', lock: 'M6 11h12v10H6zM8 11V8a4 4 0 0 1 8 0v3'
};
export function icon(name, cls = '') {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('class', 'i ' + cls); s.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', ICONS[name] || ICONS.star); s.append(p);
  return s;
}

export async function loadConfig() {
  if (cfg) return cfg;
  try {
    const r = await fetch('/api/public-config', { cache: 'no-store' });
    cfg = r.ok ? await r.json() : { configured: false, error: r.status };
  } catch { cfg = { configured: false, error: 'network' }; }
  return cfg;
}

export function initSupabase() {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const c = await loadConfig();
    if (!c.configured) return null;
    try {
      const { createClient } = await import(CDN);
      client = createClient(c.url, c.publishableKey, { auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true } });
      client.auth.onAuthStateChange((event, session) => listeners.forEach(fn => { try { fn(event, session); } catch (e) { console.error(e); } }));
      return client;
    } catch (e) { console.warn('Supabase indisponível', e); return null; }
  })();
  return initPromise;
}
export const getClient = () => client;
export function onAuth(fn) { listeners.add(fn); }
export async function getSession() {
  const c = await initSupabase();
  if (!c) return null;
  try { const { data } = await c.auth.getSession(); return data.session; } catch { return null; }
}

function apiError(message, status, code, data) { const e = new Error(message); e.status = status; e.code = code; e.data = data; return e; }
export async function api(path, { method = 'GET', body } = {}) {
  const s = await getSession();
  const headers = { 'Content-Type': 'application/json' };
  if (s?.access_token) headers.Authorization = 'Bearer ' + s.access_token;
  let res;
  try { res = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }); }
  catch { throw apiError('Sem ligação à internet. Verifica os dados móveis e tenta novamente.', 0, 'network'); }
  let data = null; try { data = await res.json(); } catch { /* resposta sem JSON */ }
  if (!res.ok) throw apiError(data?.error || (res.status === 404 ? 'Servidor não encontrado. A pasta "api" pode estar mal publicada.' : 'Não foi possível concluir o pedido.'), res.status, data?.code, data);
  return data;
}

let toastTimer;
export function toast(msg) {
  $('.toast')?.remove();
  const t = el('div', { class: 'toast', role: 'status', text: msg }); document.body.append(t);
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.remove(), 3200);
}
export const fmtDate = (d) => d ? new Date(d).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
export const fmtDateTime = (d) => d ? new Date(d).toLocaleString('pt-PT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
export const mt = (n) => `${Number(n || 0).toLocaleString('pt-PT')} MT`;
export function debounce(fn, ms = 250) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

// Markdown seguro e simples (escapa HTML primeiro).
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export function md(text) {
  const blocks = []; let s = esc(String(text || ''));
  s = s.replace(/```(?:\w+)?\n?([\s\S]*?)```/g, (_, c) => { blocks.push(`<pre><code>${c.replace(/\n$/, '')}</code></pre>`); return `\u0000${blocks.length - 1}\u0000`; });
  const inline = (t) => t.replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>').replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  const out = []; let list = null;
  const close = () => { if (list) { out.push(`</${list}>`); list = null; } };
  for (const line of s.split('\n')) {
    let m;
    if ((m = /^\s*[-*•]\s+(.*)/.exec(line))) { if (list !== 'ul') { close(); out.push('<ul>'); list = 'ul'; } out.push(`<li>${inline(m[1])}</li>`); }
    else if ((m = /^\s*\d+[.)]\s+(.*)/.exec(line))) { if (list !== 'ol') { close(); out.push('<ol>'); list = 'ol'; } out.push(`<li>${inline(m[1])}</li>`); }
    else if ((m = /^#{1,4}\s+(.*)/.exec(line))) { close(); out.push(`<h4>${inline(m[1])}</h4>`); }
    else if (!line.trim()) close();
    else { close(); out.push(`<p>${inline(line)}</p>`); }
  }
  close();
  return out.join('').replace(/\u0000(\d+)\u0000/g, (_, i) => blocks[+i]);
}
