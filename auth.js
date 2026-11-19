// FLORA AI — autenticação Supabase (email + palavra-passe).
// Apenas a URL e a chave PUBLICÁVEL do Supabase chegam ao navegador.
const el = (id) => document.getElementById(id);
const dialog = el('authDialog');
let supabase = null;
let mode = 'login';
let ready = false;
let currentSession = null;

const MODE_CONFIG = {
  login: { title: 'Bem-vindo de volta', detail: 'Entra na tua conta para aceder à IA beta.', button: 'Entrar na minha conta ↗', switchText: 'Ainda não tens conta?', switchButton: 'Criar conta grátis' },
  signup: { title: 'Cria a tua conta', detail: 'Regista-te gratuitamente com email e palavra-passe.', button: 'Criar conta grátis ↗', switchText: 'Já tens uma conta?', switchButton: 'Entrar' },
  reset: { title: 'Recuperar acesso', detail: 'Enviaremos um link para definires uma nova palavra-passe.', button: 'Enviar link de recuperação ↗', switchText: 'Lembraste da palavra-passe?', switchButton: 'Voltar a entrar' },
  update: { title: 'Nova palavra-passe', detail: 'Escolhe uma palavra-passe nova para a tua conta.', button: 'Guardar nova palavra-passe ↗', switchText: 'Já terminaste?', switchButton: 'Voltar ao início' }
};

function message(text = '', kind = '') {
  const target = el('authMessage');
  target.textContent = text;
  target.className = 'auth-message' + (kind ? ' ' + kind : '');
}
function setMode(next) {
  if (!MODE_CONFIG[next]) return;
  mode = next;
  const config = MODE_CONFIG[next];
  el('authDialogTitle').textContent = config.title;
  el('authDescription').textContent = config.detail;
  el('authSubmit').textContent = config.button;
  el('authSwitch').textContent = config.switchButton;
  el('authSwitchWrap').firstChild.textContent = config.switchText + ' ';
  el('authEmailField').hidden = next === 'update';
  el('authPasswordField').hidden = next === 'reset';
  el('authConfirmField').hidden = next !== 'signup' && next !== 'update';
  el('authLinks').hidden = next !== 'login';
  el('authEmail').required = next !== 'update';
  el('authPassword').required = next !== 'reset';
  el('authPassword').autocomplete = next === 'login' ? 'current-password' : 'new-password';
  el('authPassword').value = '';
  el('authConfirm').value = '';
  message();
}
function openDialog(next = 'login') {
  setMode(next);
  if (!dialog.open) dialog.showModal();
  if (!ready) message('O registo ainda não está configurado. O administrador deve ligar o site ao Supabase na Vercel.', 'error');
}
function updateHeader(session) {
  currentSession = session;
  const email = session?.user?.email || '';
  el('authUser').textContent = email;
  el('authUser').title = email;
  el('authUser').hidden = !email;
  el('authLogout').hidden = !email;
  el('authOpen').hidden = !!email;
  el('aiLoginNotice').hidden = !!email;
}
function humanError(error) {
  const value = (error?.message || '').toLowerCase();
  if (value.includes('invalid login credentials')) return 'Email ou palavra-passe incorretos.';
  if (value.includes('email not confirmed')) return 'Confirma o email que recebeste antes de entrares.';
  if (value.includes('already registered')) return 'Este email já está registado. Experimenta entrar.';
  if (value.includes('password should') || value.includes('weak password')) return 'Escolhe uma palavra-passe mais forte.';
  if (value.includes('rate limit') || value.includes('too many requests')) return 'Demasiadas tentativas. Tenta mais tarde.';
  if (value.includes('invalid email')) return 'Introduz um endereço de email válido.';
  if (value.includes('signup is disabled')) return 'Os novos registos estão temporariamente desativados.';
  return 'Não foi possível concluir o pedido. Verifica a ligação e tenta novamente.';
}

window.floraAuth = {
  open: openDialog,
  getAccessToken: async () => {
    if (!supabase) return null;
    try {
      const { data, error } = await supabase.auth.getSession();
      return error ? null : (data.session?.access_token || null);
    } catch { return null; }
  }
};
el('authOpen').addEventListener('click', () => openDialog('login'));
el('aiLoginButton').addEventListener('click', () => openDialog('login'));
el('authClose').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
el('authSwitch').addEventListener('click', () => setMode(mode === 'login' ? 'signup' : 'login'));
el('authForgot').addEventListener('click', () => setMode('reset'));
el('authLogout').addEventListener('click', async () => {
  if (!supabase) return;
  el('authLogout').disabled = true;
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    updateHeader(null);
    el('aiResultBox').hidden = true;
    el('aiStatus').textContent = '';
  } catch { openDialog('login'); message('Não foi possível terminar a sessão. Tenta novamente.', 'error'); }
  finally { el('authLogout').disabled = false; }
});

el('authForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!supabase) { message('O sistema ainda não foi configurado pelo administrador.', 'error'); return; }
  const email = el('authEmail').value.trim();
  const password = el('authPassword').value;
  const confirm = el('authConfirm').value;
  if (mode !== 'update' && (!email || !el('authEmail').checkValidity())) { message('Introduz um email válido.', 'error'); return; }
  if (mode !== 'reset' && password.length < 8) { message('A palavra-passe deve ter pelo menos 8 caracteres.', 'error'); return; }
  if ((mode === 'signup' || mode === 'update') && password !== confirm) { message('As palavras-passe não coincidem.', 'error'); return; }
  const button = el('authSubmit');
  button.disabled = true;
  message('A processar...');
  try {
    const redirectTo = window.location.origin + window.location.pathname;
    if (mode === 'signup') {
      const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo } });
      if (error) throw error;
      if (data.session) { message('Conta criada! Já podes utilizar a tua conta.', 'success'); setTimeout(() => dialog.close(), 1000); }
      else message('Registo recebido. Verifica a caixa de entrada e o spam para confirmar o email. Depois, entra na tua conta.', 'success');
    } else if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      message('Sessão iniciada com sucesso.', 'success');
      setTimeout(() => dialog.close(), 400);
    } else if (mode === 'reset') {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) throw error;
      message('Se este email tiver uma conta, receberás instruções para recuperar o acesso.', 'success');
    } else if (mode === 'update') {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setMode('login');
      message('Palavra-passe alterada com sucesso! Já podes usar a tua conta.', 'success');
    }
  } catch (error) { message(humanError(error), 'error'); }
  finally { button.disabled = false; }
});

async function initializeAuth() {
  try {
    const response = await fetch('/api/public-config', { cache: 'no-store' });
    if (!response.ok) throw new Error('Sem configuração.');
    const config = await response.json();
    if (!config.configured || !config.url || !config.publishableKey) throw new Error('Configuração incompleta.');
    const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
    supabase = createClient(config.url, config.publishableKey, { auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true } });
    ready = true;
    supabase.auth.onAuthStateChange((event, session) => {
      updateHeader(session);
      if (event === 'PASSWORD_RECOVERY') openDialog('update');
    });
    const { data } = await supabase.auth.getSession();
    updateHeader(data.session);
  } catch (error) {
    console.warn('FLORA AI: autenticação indisponível (é necessária configuração de servidor).');
    // Interface de currículo continua acessível, mesmo sem Supabase.
  }
}
initializeAuth();
