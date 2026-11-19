# FLORA AI — versão 2: contas com email e palavra-passe

Plataforma beta para Moçambique, responsiva, em português, com **registo, login, recuperação de palavra-passe e sessão persistente** através de [Supabase Auth](https://supabase.com/docs/guides/auth). Ideal para publicar na **Vercel**.

## Funciona agora / não funciona sem configurar

- **Já funciona localmente:** interface e criador de currículo, pré-visualização e exportação para PDF através do menu de impressão do navegador.
- **Código implementado mas necessita de conta Supabase e Vercel:** registo por email, autenticação por palavra-passe, confirmação de email (se ativada no Supabase), recuperação de palavra-passe, terminar sessão e validação da identidade no servidor para IA.
- **IA:** adicionalmente requer `OPENAI_API_KEY`, `FLORA_AI_ACCESS_CODE` e créditos da API OpenAI. O registo, por si só, **não** dá acesso automático à IA: continua a exigir o código beta.
- **Não há:** sistema de pagamentos, Premium/VIP ativos, quotas comerciais, perfil do utilizador, gravação de currículos em nuvem ou histórico de chat.

## Publicação e ativação — passo a passo

1. Em **supabase.com**, cria um novo projeto. No painel, vai a **Authentication → Providers → Email** e confirma que o registo por email está ativo. **Mantém a confirmação de email ativa** para reduzir contas falsas. Em **Project Settings → API Keys**, obtém a chave **publishable** (ou chave **anon/public** em projetos antigos) e copia o **Project URL**. **NUNCA uses uma chave `service_role` ou secret no frontend.**
2. Em **vercel.com**, cria/importa um projeto ligado ao repositório GitHub. Envia os ficheiros desta pasta para a **raiz do repositório**. Framework preset **Other**, sem comando de build. Os ficheiros em `api/` funcionam como funções Vercel.
3. Na Vercel, em **Project → Settings → Environment Variables**, adiciona:
   - `SUPABASE_URL` = URL do projeto Supabase, ex. `https://xxxx.supabase.co`
   - `SUPABASE_PUBLISHABLE_KEY` = chave pública `sb_publishable_...` (ou, alternativamente, `SUPABASE_ANON_KEY` para a chave anon antiga).
   - Para IA, também: `OPENAI_API_KEY` (segredo), `FLORA_AI_ACCESS_CODE` (segredo aleatório grande), opcionalmente `OPENAI_MODEL`.
4. Publica novamente (**Redeploy**) depois de configurar as variáveis.
5. Em **Supabase → Authentication → URL Configuration**, define **Site URL** como o endereço principal `https://teu-site.vercel.app` (ou o domínio definitivo) e adiciona nas **Redirect URLs** esse mesmo URL, incluindo a barra final se o painel exigir. Para testes em preview acrescenta só os domínios de preview em que confias. Sem isto, os links de confirmação e recuperação podem abrir o endereço errado.
6. Abre o site publicado, clica em **Entrar / Registar → Criar conta grátis**, introduz email e palavra-passe de 8+ caracteres. Confirma o email caso o Supabase peça, entra, termina sessão, volta a entrar e testa **Esqueci a palavra-passe**.
7. Para testar IA, configura as outras 2 variáveis no passo 3 e, com a conta iniciada, usa a ferramenta e o código beta. **Não publiques o código beta nas redes sociais.**

**Importante sobre emails:** o envio de emails padrão do Supabase tem restrições/quotas de teste. Para utilização pública, configura um fornecedor SMTP próprio no Supabase e valida o domínio de envio.

## Segurança e lançamento

- O endpoint de IA `/api/ai` verifica o token de acesso do utilizador no Supabase Auth (server-to-server) **e** o código beta antes de utilizar a chave secreta OpenAI. Não confia só na interface.
- O endpoint `/api/public-config` divulga somente a URL e a chave publicável do Supabase; são dados **projetados para uso no browser**, não credenciais privadas.
- **Ainda não é seguro abrir IA a milhares de utilizadores:** um utilizador legítimo com o código beta pode gerar consumo ilimitado enquanto houver saldo. Antes de divulgação pública, é obrigatório implementar **rate limiting persistente, quota por conta, monitorização de custos e abuso, e limites de utilização da API**.
- Não guardes `OPENAI_API_KEY`, chaves secretas Supabase ou códigos beta no GitHub, HTML, JavaScript ou repositório público.
- Pagamentos ainda não estão implementados. **Não cobres assinaturas** com base nos preços mostrados no site até implementar verificação de transações e gestão de planos.
- Define termos e política de privacidade apropriados antes de recolher dados do público. O Supabase armazena emails e dados de conta; o currículo continua apenas no dispositivo (a menos que o utilizador o envie a uma ferramenta de IA).

## Estrutura

| Ficheiro | Função |
|---|---|
| `index.html`, `styles.css` | Página, criador de CV e janela de registo/login |
| `app.js` | CV, ferramentas, geração de texto; inclui token nas chamadas IA |
| `auth.js` | Interface de registo, login, confirmação, recuperação e logout Supabase |
| `api/public-config.js` | Expõe somente configuração pública do Supabase |
| `api/ai.js` | Valida token e código beta e chama OpenAI na Vercel |
| `.env.example` | Exemplos das variáveis necessárias (não são credenciais reais) |

Documentação: https://supabase.com/docs/guides/auth/passwords e https://supabase.com/docs/reference/javascript/auth-onauthstatechange
