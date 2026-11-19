'use strict';

const $ = (id) => document.getElementById(id);
$('year').textContent = new Date().getFullYear();

const CV_FIELDS = ['Nome', 'Cargo', 'Email', 'Telefone', 'Local', 'Resumo', 'Experiencia', 'Formacao', 'Competencias'];
function fillText(id, value, fallback) { $(id).textContent = value.trim() || fallback; }
function fillLines(id, value, fallback) {
  const list = $(id);
  list.replaceChildren();
  const lines = value.split('\n').map(s => s.trim()).filter(Boolean);
  for (const line of (lines.length ? lines : [fallback])) {
    const li = document.createElement('li'); li.textContent = line; list.appendChild(li);
  }
}
function updateCV() {
  const data = Object.fromEntries(CV_FIELDS.map(key => [key, $('cv' + key).value]));
  fillText('pvNome', data.Nome, 'O TEU NOME');
  fillText('pvCargo', data.Cargo, 'A tua profissão');
  const contacts = [data.Email.trim(), data.Telefone.trim(), data.Local.trim()].filter(Boolean);
  fillText('pvContacts', contacts.join(' • '), 'Email • Telefone • Localização');
  fillText('pvResumo', data.Resumo, 'Escreve aqui um pequeno resumo sobre quem és e o que procuras profissionalmente.');
  fillLines('pvExperiencia', data.Experiencia, 'Adiciona as tuas experiências profissionais.');
  fillLines('pvFormacao', data.Formacao, 'Indica a tua formação académica.');
  fillText('pvCompetencias', data.Competencias.replace(/\s*,\s*/g, '  •  '), 'Lista as tuas principais competências.');
}
$('cvForm').addEventListener('input', updateCV);
$('cvForm').addEventListener('reset', () => setTimeout(updateCV, 0));
$('printCv').addEventListener('click', () => { updateCV(); window.print(); });
updateCV();

const TOOLS = {
  chat: { title: 'Chat com IA', description: 'Faz perguntas e recebe explicações ou sugestões inteligentes.', label: 'A tua pergunta', placeholder: 'Ex.: Explica de maneira simples como posso organizar um pequeno negócio em Maputo.', icon: '✦' },
  carta: { title: 'Carta de apresentação', description: 'Descreve a vaga e a tua experiência para preparar uma carta profissional.', label: 'Sobre a vaga e o teu perfil', placeholder: 'Ex.: Quero concorrer à vaga de assistente administrativo. Tenho formação em gestão, experiência com atendimento ao cliente e domínio do Excel...', icon: '✉' },
  texto: { title: 'Criador de textos', description: 'Gera publicações, descrições, mensagens e outras ideias de escrita.', label: 'Que texto pretendes criar?', placeholder: 'Ex.: Cria uma publicação curta e convincente para Instagram sobre uma loja de roupa em Maputo. Público: jovens adultos.', icon: '✎' },
  traducao: { title: 'Tradução inteligente', description: 'Indica o idioma de destino e inclui o texto a traduzir.', label: 'Texto e idioma pretendido', placeholder: 'Ex.: Traduz para inglês formal: "Bom dia, gostaria de saber se ainda aceitam candidaturas."', icon: '文' },
  entrevista: { title: 'Preparação para entrevistas', description: 'Treina respostas e conhece perguntas comuns para a vaga que procuras.', label: 'Vaga e experiência', placeholder: 'Ex.: Vou a uma entrevista para técnico agrónomo. Tenho formação técnica em extensão e fomento. Cria 7 perguntas com sugestões de resposta.', icon: '◎' }
};
let activeTool = 'cv';
function openTool(tool) {
  if (tool !== 'cv' && !TOOLS[tool]) return;
  const last = activeTool;
  activeTool = tool;
  document.querySelectorAll('[data-tool]').forEach(b => { const active = b.dataset.tool === tool; b.classList.toggle('active', active); b.setAttribute('aria-pressed', String(active)); });
  $('cvTool').hidden = tool !== 'cv';
  $('aiTool').hidden = tool === 'cv';
  if (tool === 'cv') return;
  const config = TOOLS[tool];
  $('aiTitle').textContent = config.title;
  $('aiDescription').textContent = config.description;
  $('aiIcon').textContent = config.icon;
  $('aiPromptLabel').textContent = config.label;
  $('aiPrompt').placeholder = config.placeholder;
  if (last !== tool) { $('aiPrompt').value = ''; $('aiStatus').textContent = ''; $('aiStatus').classList.remove('error'); $('aiResultBox').hidden = true; }
}
document.querySelectorAll('[data-tool]').forEach(button => button.addEventListener('click', () => openTool(button.dataset.tool)));
document.querySelectorAll('[data-open-tool]').forEach(link => link.addEventListener('click', () => openTool(link.dataset.openTool)));
openTool('cv');

$('generateButton').addEventListener('click', async () => {
  const prompt = $('aiPrompt').value.trim();
  const code = $('betaCode').value.trim();
  const status = $('aiStatus');
  status.classList.remove('error');
  $('aiResultBox').hidden = true;
  if (prompt.length < 8) { status.textContent = 'Escreve um pedido mais detalhado (mínimo de 8 caracteres).'; status.classList.add('error'); return; }
  if (!window.floraAuth) { status.textContent = 'O sistema de contas ainda está a carregar. Tenta novamente.'; status.classList.add('error'); return; }
  const token = await window.floraAuth.getAccessToken();
  if (!token) { status.textContent = 'Precisas de entrar na tua conta para usar as ferramentas de IA.'; status.classList.add('error'); window.floraAuth.open(); return; }
  if (!code) { status.textContent = 'É necessário o código privado beta, fornecido pelo administrador.'; status.classList.add('error'); return; }
  const button = $('generateButton');
  button.disabled = true;
  button.textContent = 'A gerar resultado...';
  status.textContent = 'A comunicar com a IA. A tua mensagem não é publicada no site.';
  try {
    const result = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify({ type: activeTool, prompt, accessCode: code }) });
    let data;
    try { data = await result.json(); } catch { throw new Error('O serviço de IA não está disponível neste alojamento. Publica o projeto na Vercel e configura a API.'); }
    if (!result.ok) throw new Error(data.error || 'Não foi possível processar este pedido.');
    if (!data.text) throw new Error('O serviço respondeu sem texto. Tenta novamente.');
    $('aiResult').textContent = data.text;
    $('aiResultBox').hidden = false;
    status.textContent = 'Resultado gerado. Revê o texto antes de o utilizar.';
  } catch (error) {
    status.textContent = error.message || 'Não foi possível completar o pedido.';
    status.classList.add('error');
  } finally { button.disabled = false; button.innerHTML = 'Gerar com IA <span aria-hidden="true">✦</span>'; }
});
$('copyResult').addEventListener('click', async () => {
  const text = $('aiResult').textContent;
  try { await navigator.clipboard.writeText(text); $('copyResult').textContent = 'Copiado ✓'; }
  catch { $('copyResult').textContent = 'Seleciona o texto para copiar'; }
  setTimeout(() => { $('copyResult').textContent = 'Copiar texto ↗'; }, 2500);
});
