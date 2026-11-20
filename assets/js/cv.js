// FLORA AI — criador de currículos: 4 modelos, pré-visualização A4, PDF (impressão do navegador), guardar na conta.
import { el, $, $$, getClient, api, toast, debounce, icon, fmtDate } from './core.js';

const TEMPLATES = [['classico', 'Clássico'], ['moderno', 'Moderno'], ['minimal', 'Minimalista'], ['exec', 'Executivo']];
const COLORS = { azul: '#2f74c9', verde: '#1f8a63', roxo: '#6f55c9', grafite: '#33415a' };
const KEY = 'flora_cv_draft_v1';
const blank = () => ({ template: 'classico', color: 'azul', nome: '', cargo: '', email: '', telefone: '', local: '', resumo: '', exp: [{ cargo: '', empresa: '', periodo: '', desc: '' }], edu: [{ curso: '', inst: '', periodo: '' }], skills: '', langs: '' });
let data = blank(), currentId = null, ctx = null;

function loadDraft() { try { const d = JSON.parse(localStorage.getItem(KEY) || 'null'); if (d && typeof d === 'object') data = { ...blank(), ...d }; } catch { /* sem rascunho */ } }
const saveDraft = debounce(() => { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* ignorar */ } }, 400);

// ---------------------------------------------------------------- Pré-visualização
const tags = (txt) => el('div', { class: 'tags' }, String(txt || '').split(/[,;\n]/).map(s => s.trim()).filter(Boolean).map(s => el('span', { text: s })));
const has = (a, keys) => a.filter(x => keys.some(k => (x[k] || '').trim()));

function sections(d, only) {
  const out = [];
  const exp = has(d.exp, ['cargo', 'empresa', 'desc']), edu = has(d.edu, ['curso', 'inst']);
  const add = (key, node) => { if (!only || only.includes(key)) out.push(node); };
  if (d.resumo.trim()) add('resumo', el('section', {}, el('h2', { text: 'Perfil profissional' }), el('p', { text: d.resumo.trim() })));
  if (exp.length) add('exp', el('section', {}, el('h2', { text: 'Experiência profissional' }), exp.map(x => el('div', { class: 'item' }, el('b', { text: [x.cargo, x.empresa].filter(s => s.trim()).join(' — ') }), x.periodo.trim() && el('div', { class: 'per', text: x.periodo }), x.desc.trim() && el('p', { text: x.desc.trim() })))));
  if (edu.length) add('edu', el('section', {}, el('h2', { text: 'Formação académica' }), edu.map(x => el('div', { class: 'item' }, el('b', { text: x.curso }), el('div', { class: 'per', text: [x.inst, x.periodo].filter(s => s.trim()).join(' • ') })))));
  if (d.skills.trim()) add('skills', el('section', {}, el('h2', { text: 'Competências' }), tags(d.skills)));
  if (d.langs.trim()) add('langs', el('section', {}, el('h2', { text: 'Idiomas' }), tags(d.langs)));
  return out;
}

export function buildSheet(d) {
  const contacts = [d.email, d.telefone, d.local].map(s => s.trim()).filter(Boolean);
  const head = (cls) => el(cls, {}, el('h1', { text: d.nome.trim() || 'O TEU NOME' }), el('div', { class: 'role', text: d.cargo.trim() || 'A tua profissão' }), contacts.length ? el('div', { class: 'contact', text: contacts.join('  •  ') }) : el('div', { class: 'contact', text: 'Email • Telefone • Localização' }));
  let sheet;
  if (d.template === 'moderno') {
    sheet = el('article', { class: 'cv-sheet cv-t-mod' },
      el('aside', {}, el('h1', { text: d.nome.trim() || 'O TEU NOME' }), el('div', { class: 'role', text: d.cargo.trim() || 'A tua profissão' }),
        el('h2', { text: 'Contacto' }), ...(contacts.length ? contacts.map(c => el('div', { class: 'contact', text: c })) : [el('div', { class: 'contact', text: 'Email • Telefone' })]),
        ...sections(d, ['skills', 'langs'])),
      el('main', {}, ...sections(d, ['resumo', 'exp', 'edu'])));
  } else {
    const cls = { classico: 'cv-t-classico', minimal: 'cv-t-minimal', exec: 'cv-t-exec' }[d.template] || 'cv-t-classico';
    sheet = el('article', { class: `cv-sheet ${cls}` }, head('header'), ...sections(d));
  }
  const ac = COLORS[d.color] || COLORS.azul;
  sheet.style.setProperty('--ac', ac); sheet.style.setProperty('--ac-soft', ac + '1f');
  return sheet;
}

function refreshPreview() {
  const holder = $('#cvHolder'); if (!holder) return;
  const scale = el('div', { class: 'cv-scale' }, buildSheet(data));
  holder.replaceChildren(scale);
  fit();
}
function fit() {
  const holder = $('#cvHolder'), scale = holder?.firstElementChild; if (!scale) return;
  const avail = holder.clientWidth - 24, w = 793.7;
  const k = Math.min(1, avail / w);
  scale.style.transform = `scale(${k})`;
  holder.style.height = `${scale.offsetHeight * k + 24}px`;
}

export function printCV() {
  let root = $('#printRoot'); if (!root) { root = el('div', { id: 'printRoot' }); document.body.append(root); }
  root.replaceChildren(buildSheet(data));
  const old = document.title; document.title = `Curriculo-${(data.nome || 'FLORA-AI').trim().replace(/\s+/g, '-')}`;
  window.print();
  setTimeout(() => { document.title = old; }, 500);
}

// --------------------------------------------------------------------- Formulário
function field(label, key, props = {}, target = data, area = false) {
  const inp = el(area ? 'textarea' : 'input', { class: 'in', maxlength: props.max || 120, placeholder: props.ph || '', rows: area ? (props.rows || 3) : null, inputmode: props.mode, autocomplete: props.ac, type: props.type });
  inp.value = target[key] || '';
  inp.addEventListener('input', () => { target[key] = inp.value; refreshPreview(); saveDraft(); });
  return el('label', { class: 'f' }, label, props.hint && el('span', { class: 'hint' }, ' ' + props.hint), inp);
}

function repeater(listKey, title, blankItem, fields, addLabel) {
  const wrap = el('div');
  const draw = () => {
    wrap.replaceChildren(...data[listKey].map((item, i) => el('div', { class: 'rep' },
      ...fields.map(f => field(f.label, f.key, { max: f.max || 120, ph: f.ph, rows: f.rows }, item, f.area)),
      data[listKey].length > 1 && el('button', { type: 'button', class: 'btn danger sm', onclick: () => { data[listKey].splice(i, 1); draw(); refreshPreview(); saveDraft(); } }, icon('trash'), 'Remover'))),
      el('button', { type: 'button', class: 'btn soft sm', onclick: () => { if (data[listKey].length >= 8) return toast('Máximo de 8 entradas.'); data[listKey].push({ ...blankItem }); draw(); refreshPreview(); saveDraft(); } }, icon('plus'), addLabel));
  };
  draw();
  return wrap;
}

function drawForm() {
  const f = $('#cvForm'); if (!f) return;
  const tplBtns = TEMPLATES.map(([id, nm]) => el('button', { type: 'button', class: 'tpl' + (data.template === id ? ' on' : ''), onclick: () => { data.template = id; drawForm(); refreshPreview(); saveDraft(); } }, nm));
  const sw = Object.entries(COLORS).map(([id, c]) => el('button', { type: 'button', class: 'sw' + (data.color === id ? ' on' : ''), style: `background:${c}`, 'aria-label': 'Cor ' + id, onclick: () => { data.color = id; drawForm(); refreshPreview(); saveDraft(); } }));
  f.replaceChildren(
    el('div', { class: 'tpls' }, tplBtns), el('div', { class: 'swatches' }, sw),
    el('details', { open: true }, el('summary', { text: '1. Dados pessoais' }), el('div', { class: 'body' },
      el('div', { class: 'row2' }, field('Nome completo', 'nome', { ph: 'Ex.: Ana Manuel', ac: 'name' }), field('Profissão / área', 'cargo', { ph: 'Ex.: Assistente administrativa' })),
      el('div', { class: 'row2' }, field('Email', 'email', { ph: 'exemplo@email.com', type: 'email', mode: 'email', ac: 'email' }), field('Telefone', 'telefone', { ph: '+258 ...', mode: 'tel', ac: 'tel', max: 40 })),
      field('Localização', 'local', { ph: 'Ex.: Maputo, Moçambique' }))),
    el('details', {}, el('summary', { text: '2. Perfil profissional' }), el('div', { class: 'body' },
      field('Resumo', 'resumo', { max: 900, rows: 4, ph: 'Quem és, o que sabes fazer e o que procuras.' }, data, true),
      el('button', { type: 'button', class: 'btn soft sm', id: 'cvAI', onclick: improveSummary }, icon('star'), 'Melhorar com IA'), el('p', { class: 'small muted', style: 'margin-top:8px', text: 'Usa 1 mensagem da tua quota diária de IA. Revê sempre o texto.' }))),
    el('details', {}, el('summary', { text: '3. Experiência profissional' }), el('div', { class: 'body' },
      repeater('exp', 'Experiência', { cargo: '', empresa: '', periodo: '', desc: '' }, [
        { label: 'Cargo', key: 'cargo', ph: 'Ex.: Assistente de loja' }, { label: 'Empresa', key: 'empresa', ph: 'Ex.: Empresa X' }, { label: 'Período', key: 'periodo', ph: '2024 – 2026' },
        { label: 'O que fizeste', key: 'desc', area: true, max: 600, rows: 3, ph: 'Tarefas e resultados principais.' }], 'Adicionar experiência'))),
    el('details', {}, el('summary', { text: '4. Formação' }), el('div', { class: 'body' },
      repeater('edu', 'Formação', { curso: '', inst: '', periodo: '' }, [
        { label: 'Curso / nível', key: 'curso', ph: 'Ex.: Técnico Médio em Contabilidade' }, { label: 'Instituição', key: 'inst', ph: 'Ex.: Instituto Industrial' }, { label: 'Período', key: 'periodo', ph: '2021 – 2023' }], 'Adicionar formação'))),
    el('details', {}, el('summary', { text: '5. Competências e idiomas' }), el('div', { class: 'body' },
      field('Competências', 'skills', { hint: '(separadas por vírgula)', max: 500, rows: 2, ph: 'Excel, Atendimento ao cliente, Trabalho em equipa' }, data, true),
      field('Idiomas', 'langs', { hint: '(separados por vírgula)', max: 200, ph: 'Português (nativo), Inglês (intermédio)' })))
  );
}

async function improveSummary() {
  if (!ctx.isLoggedIn()) return ctx.needLogin();
  const text = (data.resumo || '').trim();
  const base = text || `Profissão: ${data.cargo}. Experiência: ${data.exp.map(e => `${e.cargo} ${e.empresa}`).join('; ')}. Formação: ${data.edu.map(e => e.curso).join('; ')}.`;
  if (base.length < 12) return toast('Escreve primeiro a profissão ou um pequeno resumo.');
  const b = $('#cvAI'); b.disabled = true; b.textContent = 'A melhorar…';
  try {
    const r = await api('/api/ai', { method: 'POST', body: { tool: 'cv', message: `Escreve/melhora o perfil profissional para um currículo:\n${base}` } });
    data.resumo = r.message.content.slice(0, 900); drawForm(); refreshPreview(); saveDraft(); toast('Resumo atualizado. Revê o texto.');
    ctx.refreshUsage?.();
  } catch (e) { toast(e.message); b.disabled = false; b.textContent = 'Melhorar com IA'; }
}

// ------------------------------------------------------------------ Contas / guardar
async function saveToAccount() {
  if (!ctx.isLoggedIn()) return ctx.needLogin();
  const c = getClient(); const uid = ctx.userId();
  const title = (data.nome || 'O meu currículo').slice(0, 60) + ' — ' + (TEMPLATES.find(t => t[0] === data.template)?.[1] || '');
  const row = { user_id: uid, title, template: data.template, data, updated_at: new Date().toISOString() };
  const r = currentId ? await c.from('cvs').update(row).eq('id', currentId).select('id').single() : await c.from('cvs').insert(row).select('id').single();
  if (r.error) return toast(r.error.message.includes('Limite') ? 'Limite de 10 currículos guardados atingido. Apaga um antigo.' : 'Não foi possível guardar. Tenta novamente.');
  currentId = r.data.id; toast('Currículo guardado na tua conta ✓'); loadSaved();
}
async function loadSaved() {
  const box = $('#cvSaved'); if (!box) return;
  if (!ctx.isLoggedIn()) { box.replaceChildren(el('p', { class: 'small muted', text: 'Entra na tua conta para guardar e abrir os teus currículos em qualquer dispositivo.' })); return; }
  const { data: rows, error } = await getClient().from('cvs').select('id,title,updated_at,data').order('updated_at', { ascending: false });
  if (error) { box.replaceChildren(el('p', { class: 'small muted', text: 'Não foi possível carregar os currículos guardados.' })); return; }
  box.replaceChildren(rows.length ? el('div', { class: 'list' }, rows.map(r => el('div', { class: 'li' },
    el('div', { class: 't' }, el('b', { text: r.title }), el('small', { text: 'Atualizado ' + fmtDate(r.updated_at) })),
    el('button', { class: 'btn soft sm', onclick: () => { data = { ...blank(), ...r.data }; currentId = r.id; drawForm(); refreshPreview(); saveDraft(); toast('Currículo aberto.'); window.scrollTo({ top: 0 }); } }, 'Abrir'),
    el('button', { class: 'icon-btn', 'aria-label': 'Apagar', onclick: async () => { if (!confirm('Apagar este currículo?')) return; await getClient().from('cvs').delete().eq('id', r.id); if (currentId === r.id) currentId = null; loadSaved(); } }, icon('trash'))))) : el('p', { class: 'small muted', text: 'Ainda não guardaste nenhum currículo.' }));
}

// ------------------------------------------------------------------------ Entrada
export function renderCV(root, context) {
  ctx = context; loadDraft();
  root.replaceChildren(
    el('div', { class: 'hello' }, el('h2', { text: 'Criador de currículos' }), el('p', { class: 'muted', text: 'Preenche, escolhe um modelo e guarda em PDF. É grátis e não precisas de conta para criar.' })),
    el('div', { class: 'tabs cv-tabs' }, el('button', { class: 'on', id: 'tEdit', onclick: () => pane('edit') }, 'Editar'), el('button', { id: 'tPrev', onclick: () => pane('prev') }, 'Pré-visualizar')),
    el('div', { class: 'cv-wrap', id: 'cvWrap', 'data-pane': 'edit' },
      el('div', { class: 'cv-edit' }, el('form', { id: 'cvForm', onsubmit: (e) => e.preventDefault() }),
        el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;margin:14px 0' },
          el('button', { class: 'btn', onclick: printCV }, icon('print'), 'Guardar em PDF'),
          el('button', { class: 'btn ghost', onclick: saveToAccount }, icon('check'), 'Guardar na conta'),
          el('button', { class: 'btn danger', onclick: () => { if (confirm('Limpar todos os campos?')) { data = blank(); currentId = null; drawForm(); refreshPreview(); saveDraft(); } } }, 'Limpar')),
        el('p', { class: 'small muted' }, '🔒 O rascunho fica só neste dispositivo. Só é enviado ao servidor se tocares em «Guardar na conta» ou «Melhorar com IA».'),
        el('p', { class: 'small muted' }, 'No telemóvel: toca em «Guardar em PDF» e, na janela de impressão, escolhe «Guardar como PDF».'),
        el('h3', { class: 'sec', text: 'Os meus currículos guardados' }), el('div', { id: 'cvSaved' })),
      el('div', { class: 'cv-prev' }, el('div', { class: 'holder', id: 'cvHolder' }))));
  drawForm(); refreshPreview(); loadSaved();
  window.addEventListener('resize', fit);
}
function pane(p) { $('#cvWrap').dataset.pane = p; $('#tEdit').classList.toggle('on', p === 'edit'); $('#tPrev').classList.toggle('on', p === 'prev'); if (p === 'prev') setTimeout(fit, 30); }
export const cvDestroy = () => window.removeEventListener('resize', fit);
export function __setData(d) { data = { ...blank(), ...d }; }
