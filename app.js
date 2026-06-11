/* ════════════════════════════════════════════════════════════════
   Visão e Funcionamento — app.js
   SPA em arquivo único com hash-routing (DEC-014).
   Fase 1 do plano de implementação: B3 — Auth (T-01), shell de
   navegação, hash-routing e guard de sessão.
   As telas T-02..T-10 são implementadas nos blocos B4–B9.
   ════════════════════════════════════════════════════════════════ */

'use strict';

/* ─── Configuração ─────────────────────────────────────────────
   Substitua pelos valores do seu projeto Supabase
   (Settings → API). A anon key é pública por design; a barreira
   de segurança é o RLS (migrations/001_schema.sql).              */
const SUPABASE_URL = 'https://kzngniipufuiizaxewjb.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_v0U6a3FJGzqOGwrvtt7fZg_Lk_cqAOH';

/* Nome do projeto criado pelo seed (migrations/002_seed.sql).
   F-18/J1: o wizard só aparece se não existirem projetos além
   do seed.                                                       */
const SEED_PROJETO_NOME = 'Sprint de Caixa — 3 fechamentos em 20 dias';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ─── Estado global ─── */
const estado = {
  sessao: null
};

/* ─── Atalhos de DOM ─── */
const $ = (sel) => document.querySelector(sel);
const elView = $('#view');
const elNav = $('#nav');
const elMaisMenu = $('#mais-menu');
const elToast = $('#toast');

/* ─── Toast (sucesso = toast 2s, seção 10) ─── */
let toastTimer = null;
function toast(msg) {
  elToast.textContent = msg;
  elToast.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => elToast.classList.add('hidden'), 2000);
}

/* ─── Estado de erro padrão (inline + retry, seções 9/12) ─── */
function htmlErro(mensagem) {
  return `
    <div class="estado-erro">
      <p>${mensagem}</p>
      <button class="btn" data-acao="retry">Tentar novamente</button>
    </div>`;
}

/* ════════════════════════════════════════════════════════════════
   ROTEADOR — hash-routing (DEC-014)
   Rotas: #/agora #/hoje #/semana #/panorama #/projeto/:id
          #/metas #/relatorio #/ritual #/wizard #/login
   ════════════════════════════════════════════════════════════════ */

const ROTAS = [
  { padrao: /^#\/login$/, tela: telaLogin, publica: true, nav: null },
  { padrao: /^#\/agora$/, tela: telaAgora, nav: '#/agora' },
  { padrao: /^#\/hoje$/, tela: telaHoje, nav: '#/hoje' },
  { padrao: /^#\/semana$/, tela: telaSemana, nav: '#/semana' },
  { padrao: /^#\/panorama$/, tela: telaPanorama, nav: '#/panorama' },
  { padrao: /^#\/projeto\/([0-9a-f-]+)$/, tela: telaProjeto, nav: '#/panorama' },
  { padrao: /^#\/metas$/, tela: telaMetas, nav: null },
  { padrao: /^#\/relatorio$/, tela: telaRelatorio, nav: null },
  { padrao: /^#\/ritual$/, tela: telaRitual, nav: null },
  { padrao: /^#\/wizard$/, tela: telaWizard, nav: null }
];

function rotaAtual() {
  return location.hash || '#/agora';
}

async function navegar() {
  fecharMais();
  const hash = rotaAtual();
  const rota = ROTAS.find((r) => r.padrao.test(hash));

  // Rota desconhecida → destino padrão
  if (!rota) {
    location.hash = '#/agora';
    return;
  }

  // Guard de sessão: rota protegida sem login → T-01 (CA-15)
  if (!rota.publica && !estado.sessao) {
    location.hash = '#/login';
    return;
  }

  // Já logado tentando ver o login → home
  if (rota.publica && estado.sessao) {
    location.hash = await destinoInicial();
    return;
  }

  // Shell visível apenas autenticado
  elNav.classList.toggle('hidden', !estado.sessao);
  marcarNavAtiva(rota.nav);

  const params = hash.match(rota.padrao);
  await rota.tela(params ? params.slice(1) : []);
  elView.focus({ preventScroll: true });
}

function marcarNavAtiva(navHash) {
  document.querySelectorAll('.nav-item[data-rota]').forEach((b) => {
    b.classList.toggle('ativa', b.dataset.rota === navHash);
  });
}

/* J1/F-18: decide entre Agora e Wizard — o wizard só aparece se o
   banco do usuário estiver vazio de projetos além do seed.        */
async function destinoInicial() {
  const { data, error } = await sb
    .from('projetos')
    .select('id, nome');
  if (error) return '#/agora'; // falha de leitura não prende no login; telas tratam erro
  const naoSeed = (data || []).filter((p) => p.nome !== SEED_PROJETO_NOME);
  return naoSeed.length === 0 ? '#/wizard' : '#/agora';
}

/* ════════════════════════════════════════════════════════════════
   T-01 — LOGIN
   E-mail + senha + entrar. Sem link de cadastro (usuário único;
   conta criada via painel do Supabase). Erro inline. Carregando:
   spinner interno no botão.
   ════════════════════════════════════════════════════════════════ */

function telaLogin() {
  elNav.classList.add('hidden');
  elView.innerHTML = `
    <div class="login-wrap">
      <div class="login-card">
        <h1>Visão e Funcionamento</h1>
        <p class="meta-texto">Entre para ver sua próxima ação.</p>
        <div class="campo">
          <label for="login-email">E-mail</label>
          <input id="login-email" type="email" autocomplete="email" inputmode="email">
        </div>
        <div class="campo">
          <label for="login-senha">Senha</label>
          <input id="login-senha" type="password" autocomplete="current-password">
        </div>
        <div id="login-erro" class="erro-inline hidden"></div>
        <button id="login-entrar" class="btn btn-primario btn-bloco">Entrar</button>
      </div>
    </div>`;

  const inEmail = $('#login-email');
  const inSenha = $('#login-senha');
  const elErro = $('#login-erro');
  const btn = $('#login-entrar');

  async function entrar() {
    elErro.classList.add('hidden');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner" aria-hidden="true"></span> Entrando…';

    const { data, error } = await sb.auth.signInWithPassword({
      email: inEmail.value.trim(),
      password: inSenha.value
    });

    if (error) {
      btn.disabled = false;
      btn.textContent = 'Entrar';
      elErro.textContent = 'E-mail ou senha incorretos';
      elErro.classList.remove('hidden');
      return;
    }

    estado.sessao = data.session;
    location.hash = await destinoInicial();
  }

  btn.addEventListener('click', entrar);
  [inEmail, inSenha].forEach((el) =>
    el.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') entrar(); })
  );
  inEmail.focus();
}

/* ════════════════════════════════════════════════════════════════
   TELAS T-02..T-10 — implementadas nos blocos B4–B9 do plano.
   Nesta fase, cada rota protegida informa o bloco que a entrega.
   ════════════════════════════════════════════════════════════════ */

function telaPendente(titulo, bloco) {
  elView.innerHTML = `
    <h1>${titulo}</h1>
    <div class="estado-vazio">
      <p>Esta tela é entregue no bloco ${bloco} do plano de implementação (seção 23).</p>
    </div>`;
}

function telaAgora() { telaPendente('Agora', 'B6'); }
function telaHoje() { telaPendente('Hoje', 'B6'); }
function telaSemana() { telaPendente('Semana', 'B8'); }
function telaPanorama() { telaPendente('Panorama', 'B5'); }
function telaProjeto() { telaPendente('Projeto', 'B5'); }
function telaMetas() { telaPendente('Metas', 'B5'); }
function telaRelatorio() { telaPendente('Relatório', 'B9'); }
function telaRitual() { telaPendente('Planejar Amanhã', 'B7'); }
function telaWizard() { telaPendente('Primeira carga', 'B4'); }

/* ════════════════════════════════════════════════════════════════
   SHELL — menu "Mais" e Sair
   ════════════════════════════════════════════════════════════════ */

function fecharMais() {
  elMaisMenu.classList.add('hidden');
  $('#btn-mais').setAttribute('aria-expanded', 'false');
}

function ligarShell() {
  document.querySelectorAll('[data-rota]').forEach((b) => {
    b.addEventListener('click', () => { location.hash = b.dataset.rota; });
  });

  $('#btn-mais').addEventListener('click', (ev) => {
    ev.stopPropagation();
    const aberto = !elMaisMenu.classList.contains('hidden');
    elMaisMenu.classList.toggle('hidden', aberto);
    $('#btn-mais').setAttribute('aria-expanded', String(!aberto));
  });

  document.addEventListener('click', (ev) => {
    if (!elMaisMenu.contains(ev.target)) fecharMais();
  });

  $('#btn-sair').addEventListener('click', async () => {
    await sb.auth.signOut();
    estado.sessao = null;
    location.hash = '#/login';
  });
}

/* ════════════════════════════════════════════════════════════════
   INICIALIZAÇÃO
   ════════════════════════════════════════════════════════════════ */

async function iniciar() {
  ligarShell();

  const { data } = await sb.auth.getSession();
  estado.sessao = data.session || null;

  sb.auth.onAuthStateChange((_evento, sessao) => {
    const tinha = !!estado.sessao;
    estado.sessao = sessao || null;
    // Sessão expirada no meio do uso → login com aviso (seção 16; J4 completo no B10)
    if (tinha && !sessao) location.hash = '#/login';
  });

  window.addEventListener('hashchange', navegar);
  navegar();
}

iniciar();
