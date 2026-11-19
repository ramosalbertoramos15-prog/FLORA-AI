// FLORA AI — janela de entrar / criar conta / recuperar palavra-passe (Supabase Auth)
import { el, $, initSupabase, getClient, onAuth, getSession, loadConfig, icon } from './core.js';

let dialog, mode = 'login', ready = false;
const CFG = {
  login: ['Bem-vindo de volta', 'Entra para usar a tua conta FLORA AI.', 'Entrar', 'Ainda não tens conta?', 'Criar conta grátis'],
  signup: ['Cria a tua conta', 'É grátis e demora menos de um minuto.', 'Criar conta', 'Já tens conta?', 'Entrar'],
  reset: ['Recuperar acesso', 'Enviamos um link para definires uma nova palavra-passe.', 'Enviar link', 'Lembraste da palavra-passe?', 'Voltar a entrar'],
  update: ['Nova palavra-passe', 'Escolhe uma palavra-passe nova para a tua conta.', 'Guardar palavra-passe', '', '']
};

function say(text = '', kind = 'info') { const m = $('#aMsg'); m.textContent = text; m.className = text ? `msg ${kind}` : ''; m.hidden = !text; }
function humanError(e) {
  const v = (e?.message || '').toLowerCase();
  if (v.includes('invalid login credentials')) return 'Email ou palavra-passe incorretos.';
  if (v.includes('email not confirmed')) return 'Confirma primeiro o email que recebeste (verifica também o spam).';
  if (v.includes('already registered') || v.includes('already been registered')) return 'Este email já tem conta. Experimenta entrar.';
  if (v.includes('password should') || v.includes('weak')) return 'Escolhe uma palavra-passe mais forte (mínimo 8 caracteres).';
  if (v.includes('rate limit') || v.includes('too many') || v.includes('security purposes')) return 'Demasiadas tentativas. Espera um pouco e tenta de novo.';
  if (v.includes('invalid email')) return 'Escreve um email válido.';
  if (v.includes('signup is disabled') || v.includes('signups not allowed')) return 'Novos registos estão temporariamente desativados.';
  if (v.includes('same password')) return 'A nova palavra-passe deve ser diferente da anterior.';
  if (v.includes('fetch') || v.includes('network')) return 'Sem ligação. Verifica a internet e tenta de novo.';
  return 'Não foi possível concluir. Tenta novamente.';
}

function setMode(next) {
  mode = next; const c = CFG[next];
  $('#aTitle').textContent = c[0]; $('#aSub').textContent = c[1]; $('#aSubmit').textContent = c[2];
  $('#aSwitchTxt').textContent = c[3]; $('#aSwitch').textContent = c[4]; $('#aSwitchWrap').hidden = next === 'update';
  $('#fName').hidden = next !== 'signup'; $('#fEmail').hidden = next === 'update'; $('#fPass').hidden = next === 'reset';
  $('#fConf').hidden = next !== 'update'; $('#aTerms').hidden = next !== 'signup'; $('#aForgot').hidden = next !== 'login';
  $('#aPass').autocomplete = next === 'login' ? 'current-password' : 'new-password';
  $('#aPass').value = ''; $('#aConf').value = ''; say();
}

export function openAuth(next = 'login') {
  setMode(next);
  if (!dialog.open) dialog.showModal();
  if (!ready) say('O sistema de contas ainda não está configurado. O administrador deve ligar o Supabase na Vercel.', 'err');
}

export async function initAuthUI() {
  dialog = el('dialog', { class: 'auth', 'aria-labelledby': 'aTitle' });
  dialog.innerHTML = `<div class="auth-in">
    <div class="auth-top"><span class="brand"><img src="favicon.svg" alt=""><span>FLORA <b>AI</b></span></span><button type="button" class="icon-btn" id="aClose" aria-label="Fechar"></button></div>
    <h2 id="aTitle"></h2><p class="sub" id="aSub"></p>
    <form id="aForm" novalidate>
      <label class="f" id="fName" hidden>Nome<input class="in" id="aName" maxlength="80" autocomplete="name" placeholder="O teu nome"></label>
      <label class="f" id="fEmail">Email<input class="in" id="aEmail" type="email" maxlength="254" autocomplete="email" inputmode="email" placeholder="teu@email.com"></label>
      <label class="f" id="fPass">Palavra-passe<input class="in" id="aPass" type="password" minlength="8" maxlength="128" placeholder="Mínimo 8 caracteres"></label>
      <label class="f" id="fConf" hidden>Repetir palavra-passe<input class="in" id="aConf" type="password" minlength="8" maxlength="128" autocomplete="new-password"></label>
      <div style="text-align:right;margin:-6px 0 8px"><button type="button" class="linkbtn" id="aForgot">Esqueci a palavra-passe</button></div>
      <label class="chk" id="aTerms" hidden><input type="checkbox" id="aAccept"><span>Li e aceito os <a href="termos.html" target="_blank">Termos</a> e a <a href="privacidade.html" target="_blank">Política de Privacidade</a>.</span></label>
      <p id="aMsg" role="status" aria-live="polite" hidden></p>
      <button class="btn block" id="aSubmit" type="submit"></button>
    </form>
    <p class="small muted" id="aSwitchWrap" style="text-align:center;margin:16px 0 0"><span id="aSwitchTxt"></span> <button type="button" class="linkbtn" id="aSwitch"></button></p>
  </div>`;
  document.body.append(dialog);
  $('#aClose').append(icon('close'));
  $('#aClose').onclick = () => dialog.close();
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
  $('#aSwitch').onclick = () => setMode(mode === 'signup' ? 'login' : mode === 'login' ? 'signup' : 'login');
  $('#aForgot').onclick = () => setMode('reset');

  $('#aForm').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const client = getClient();
    if (!client) return say('O sistema de contas ainda não está configurado.', 'err');
    const email = $('#aEmail').value.trim(), pass = $('#aPass').value, conf = $('#aConf').value, name = $('#aName').value.trim();
    if (mode !== 'update' && !$('#aEmail').checkValidity() || (mode !== 'update' && !email)) return say('Escreve um email válido.', 'err');
    if (mode !== 'reset' && pass.length < 8) return say('A palavra-passe deve ter pelo menos 8 caracteres.', 'err');
    if (mode === 'update' && pass !== conf) return say('As palavras-passe não coincidem.', 'err');
    if (mode === 'signup' && !$('#aAccept').checked) return say('Precisas de aceitar os Termos e a Política de Privacidade.', 'err');
    const btn = $('#aSubmit'); btn.disabled = true; say('A processar…');
    const redirectTo = `${location.origin}/app.html`;
    try {
      if (mode === 'signup') {
        const { data, error } = await client.auth.signUp({ email, password: pass, options: { emailRedirectTo: redirectTo, data: { full_name: name } } });
        if (error) throw error;
        if (data.session) { say('Conta criada! Bem-vindo(a).', 'ok'); setTimeout(() => dialog.close(), 700); }
        else say('Quase pronto! Enviámos um email de confirmação. Abre-o (verifica também o spam), toca no link e depois entra.', 'ok');
      } else if (mode === 'login') {
        const { error } = await client.auth.signInWithPassword({ email, password: pass });
        if (error) throw error;
        dialog.close();
      } else if (mode === 'reset') {
        const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo });
        if (error) throw error;
        say('Se este email tiver conta, vais receber um link para criar nova palavra-passe.', 'ok');
      } else {
        const { error } = await client.auth.updateUser({ password: pass });
        if (error) throw error;
        say('Palavra-passe alterada com sucesso!', 'ok'); setTimeout(() => dialog.close(), 1200);
      }
    } catch (e) { say(humanError(e), 'err'); }
    finally { btn.disabled = false; }
  });

  const c = await initSupabase();
  ready = Boolean(c);
  onAuth((event) => { if (event === 'PASSWORD_RECOVERY') openAuth('update'); });
  return c;
}
export { getSession, loadConfig };
