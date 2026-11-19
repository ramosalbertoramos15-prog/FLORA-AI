// FLORA AI — endpoint para testes beta privados na Vercel.
// NUNCA coloques a chave OpenAI no frontend ou num repositório público.
// A autenticação é validada no servidor via Supabase. Antes do lançamento
// público: rate limiting persistente, quotas, monitorização e pagamentos verificados.
const crypto = require('node:crypto');

const TASKS = {
  chat: 'És o assistente FLORA AI, criado para ajudar pessoas em Moçambique e outros países lusófonos. Responde em português claro, de forma útil, cuidadosa e concisa. Se a pergunta for noutra língua, podes responder nessa língua. Não inventes factos.',
  carta: 'És um redator profissional. Cria uma carta de apresentação para candidatura a emprego a partir dos dados fornecidos. Usa português natural, estrutura adequada e tom profissional. Não inventes nomes de empresas, diplomas, experiências ou competências que não tenham sido fornecidos. Se faltarem dados, usa marcadores explícitos como [Nome da empresa]. Entrega apenas a carta.',
  texto: 'És um redator e especialista em comunicação. Cria o texto pedido em português, com qualidade, boa legibilidade e adequação ao público indicado. Não inventes resultados, promoções ou garantias não fornecidas.',
  traducao: 'És um tradutor profissional. Traduz o texto no idioma de destino indicado pelo utilizador, mantendo o significado, o tom e os nomes próprios. Entrega apenas a tradução; se não estiver claro o idioma de destino, pede-o.',
  entrevista: 'És um orientador de carreira. Cria um exercício prático de preparação para entrevista adequado à vaga e aos dados fornecidos. Inclui perguntas prováveis, ideias de respostas adaptáveis e conselhos práticos. Não inventes experiência do candidato.'
};

function safeEqual(a, b) {
  const x = Buffer.from(a, 'utf8'); const y = Buffer.from(b, 'utf8');
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

async function verifyAuthenticatedUser(req) {
  const match = /^(?:Bearer)\s+([A-Za-z0-9._-]+)$/i.exec(req.headers?.authorization || '');
  if (!match || match[1].length > 4096) return false;
  const supabaseUrl = process.env.SUPABASE_URL;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !publishableKey) return false;
  let response;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8500);
    try {
      response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/user`, {
        method: 'GET',
        headers: { apikey: publishableKey, Authorization: `Bearer ${match[1]}` },
        signal: controller.signal
      });
    } finally { clearTimeout(timeout); }
  } catch { return false; }
  if (!response.ok) return false;
  const user = await response.json().catch(() => null);
  return Boolean(user?.id);
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'Método não permitido.' }); }
  if (!process.env.OPENAI_API_KEY || !process.env.FLORA_AI_ACCESS_CODE || !process.env.SUPABASE_URL || !(process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY)) {
    return res.status(503).json({ error: 'A IA ainda não está configurada. O criador de CV continua disponível gratuitamente.' });
  }
  const body = req.body || {};
  if (typeof body !== 'object' || Array.isArray(body)) return res.status(400).json({ error: 'Pedido inválido.' });
  const { type, prompt, accessCode } = body;
  if (!(await verifyAuthenticatedUser(req))) {
    return res.status(401).json({ error: 'Sessão inválida ou expirada. Entra novamente na tua conta.' });
  }
  if (typeof accessCode !== 'string' || !safeEqual(accessCode, process.env.FLORA_AI_ACCESS_CODE)) {
    return res.status(403).json({ error: 'Código beta inválido. Contacta o administrador.' });
  }
  if (typeof type !== 'string' || !Object.prototype.hasOwnProperty.call(TASKS, type)) {
    return res.status(400).json({ error: 'Ferramenta desconhecida.' });
  }
  if (typeof prompt !== 'string' || prompt.trim().length < 8 || prompt.length > 6500) {
    return res.status(400).json({ error: 'A mensagem deve ter entre 8 e 6500 caracteres.' });
  }
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000);
  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
        instructions: TASKS[type],
        input: prompt.trim(),
        max_output_tokens: 950,
        store: false
      })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error('OpenAI API error status:', response.status, 'error type:', result.error?.type || 'unknown');
      if (response.status === 429) return res.status(429).json({ error: 'Limite temporário do serviço de IA. Tenta mais tarde.' });
      return res.status(502).json({ error: 'A IA não conseguiu responder neste momento. Verifica a configuração e os créditos da API.' });
    }
    const text = (result.output || []).flatMap(item => item.content || []).filter(part => part.type === 'output_text').map(part => part.text || '').join('\n').trim();
    if (!text) return res.status(502).json({ error: 'A IA respondeu sem texto utilizável.' });
    return res.status(200).json({ text });
  } catch (error) {
    console.error('Request failed:', error.name || 'Error');
    return res.status(error.name === 'AbortError' ? 504 : 502).json({ error: 'Falha na ligação ao serviço de IA. Tenta novamente.' });
  } finally { clearTimeout(timeoutId); }
};
