# FLORA AI

Plataforma de inteligência artificial em português para Moçambique: chat com IA, geração de imagens, criador de currículos (PDF), cartas, textos, traduções, preparação de entrevistas, planos Grátis e Premium, pagamentos manuais confirmados pelo administrador e painel de administração.

**Stack:** HTML/CSS/JS simples (sem build) + funções serverless na Vercel (`api/`) + Supabase (login, base de dados, imagens) + OpenAI (texto e imagens).

## Estrutura

```
index.html            página inicial pública
app.html              aplicação do utilizador (painel, chat, ferramentas, CV, histórico, planos, conta)
admin.html            painel de administração (só administradores)
privacidade.html, termos.html, ajuda.html
assets/css/styles.css tema azul e branco
assets/js/            core, auth-ui, app, cv, admin, landing
api/                  funções da Vercel
  public-config.js    devolve só a URL e a chave PÚBLICA do Supabase
  me.js               perfil, plano e consumo do dia
  ai.js               chat e ferramentas de texto (com quotas)
  image.js            geração de imagens (com quotas)
  payments.js         pagamentos manuais (M-Pesa, e-Mola, BIM, PayPal, Binance)
  admin.js            ações do administrador
  _lib/core.js        código partilhado (não é rota pública)
supabase/001_flora_ai.sql   toda a base de dados + segurança (RLS)
vercel.json, package.json, .env.example
docs/                 guias passo a passo e lista de testes
```

## Como funciona a segurança e os custos

- A chave secreta do Supabase e a chave da OpenAI só existem nas variáveis da Vercel (servidor).
- Cada pedido de IA verifica: sessão válida → conta não bloqueada → IA ligada → limite por minuto → limite diário do plano → limite global diário da plataforma. Só depois chama a IA.
- Os limites são guardados na base de dados (persistentes) e editáveis no painel de administração.
- RLS: cada pessoa só lê/edita os próprios dados. O plano, a função e o bloqueio só o servidor altera.
- O administrador vê métricas e contas, nunca o conteúdo das conversas.

Veja `docs/GUIA_PASSO_A_PASSO.md` para publicar.
