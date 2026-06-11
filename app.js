/* ════════════════════════════════════════════════════════════════
   Visão e Funcionamento — app.js
   SPA em arquivo único com hash-routing (DEC-014).
   Fase 2 do plano (seção 23): B4 Wizard · B5 CRUDs · B6 Score+Agora.
   T-04 (B8), T-08 (B9) e T-09 (B7) chegam na Fase 3.
   ════════════════════════════════════════════════════════════════ */

'use strict';

/* ─── Configuração ───────────────────────────────────────────── */
const SUPABASE_URL = 'https://kzngniipufuiizaxewjb.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_v0U6a3FJGzqOGwrvtt7fZg_Lk_cqAOH';

/* F-18/J1: o wizard só aparece se não existirem projetos além do seed. */
const SEED_PROJETO_NOME = 'Sprint de Caixa — 3 fechamentos em 20 dias';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ─── Constantes de domínio ─── */
const PALETA = ['#C9A86B', '#6BA8C9', '#C98B9B', '#7BC98F', '#6BC9B8',
  '#9B8BC9', '#B0B8C4', '#C97B7B', '#C9C16B', '#8FA3B8'];
const QUADRANTES = {
  Q1: 'Q1 — Urgente e importante',
  Q2: 'Q2 — Importante, não urgente',
  Q3: 'Q3 — Urgente, não importante',
  Q4: 'Q4 — Nem urgente, nem importante'
};
const BLOCO_LABEL = { manha: 'Manhã', tarde: 'Tarde', noite: 'Noite' };
const STATUS_PROJETO_LABEL = { ativo: 'Ativo', pausado: 'Pausado', concluido: 'Concluído', arquivado: 'Arquivado' };
const STATUS_META_LABEL = { ativa: 'Ativa', concluida: 'Concluída', abandonada: 'Abandonada' };
/* 11.4e — projetos pré-nomeados do passo 2 do wizard */
const PROJETOS_WIZARD = ['AchaSobra', 'App Casamento', 'App Financeiro do Casal',
  'Visualizador de Tipologias', 'Site com Quiz The Best', 'Skills de IA',
  'Cliente ativo do planejado', 'Painel de Orçamento', 'Portfólio Planejado'];

/* ─── Estado global ─── */
const estado = {
  sessao: null,
  pulos: { data: null, ids: [] },   // RN-10: Pular = fim da fila de hoje (sessão)
  acordeao: null                     // áreas abertas no Panorama
};

/* ─── DOM ─── */
const $ = (sel, raiz) => (raiz || document).querySelector(sel);
const $$ = (sel, raiz) => Array.from((raiz || document).querySelectorAll(sel));
const elView = $('#view');
const elNav = $('#nav');
const elMaisMenu = $('#mais-menu');
const elToast = $('#toast');
const elFab = $('#btn-mais-rapida');

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ─── Toast (sucesso = toast 2s) ─── */
let toastTimer = null;
function toast(msg) {
  elToast.textContent = msg;
  elToast.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => elToast.classList.add('hidden'), 2000);
}

/* ─── Modal genérico (nunca alert() nativo) ─── */
function abrirModal(html) {
  const raiz = $('#modal-raiz');
  raiz.innerHTML = `<div class="modal-fundo"><div class="modal-card" role="dialog" aria-modal="true">${html}</div></div>`;
  raiz.classList.remove('hidden');
  $('.modal-fundo', raiz).addEventListener('click', (ev) => {
    if (ev.target.classList.contains('modal-fundo')) fecharModal();
  });
  return raiz;
}
function fecharModal() {
  const raiz = $('#modal-raiz');
  raiz.classList.add('hidden');
  raiz.innerHTML = '';
}
function modalConfirmar(msgHtml, rotuloSim, rotuloNao, aoSim) {
  const raiz = abrirModal(`
    <h2 class="modal-titulo">${msgHtml}</h2>
    <div class="modal-acoes">
      <button class="btn" data-m="nao">${esc(rotuloNao)}</button>
      <button class="btn btn-primario" data-m="sim">${esc(rotuloSim)}</button>
    </div>`);
  $('[data-m=nao]', raiz).addEventListener('click', fecharModal);
  $('[data-m=sim]', raiz).addEventListener('click', async () => { fecharModal(); await aoSim(); });
}
function modalInfo(msgHtml) {
  const raiz = abrirModal(`
    <h2 class="modal-titulo">${msgHtml}</h2>
    <div class="modal-acoes"><button class="btn btn-primario" data-m="ok">Entendi</button></div>`);
  $('[data-m=ok]', raiz).addEventListener('click', fecharModal);
}

/* ─── Erro padrão (inline + retry — seções 9/12/16) ─── */
function renderErro(titulo, tentarDeNovo) {
  elView.innerHTML = `<h1>${esc(titulo)}</h1>
    <div class="estado-erro">
      <p>Não foi possível carregar os dados. Verifique sua conexão.</p>
      <button class="btn" data-acao="retry">Tentar novamente</button>
    </div>`;
  $('[data-acao=retry]').addEventListener('click', tentarDeNovo);
}

/* === LOGICA PURA INICIO ===
   Datas em America/Sao_Paulo, score (RN-01/05/06), desempate (DEC-024),
   composição da fila do dia (RN-09) e formatações. Sem dependência de DOM. */

function hojeISO() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}
function horaSP() {
  return Number(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false
  }).format(new Date()));
}
/* RN-09: manhã 05:00–11:59 · tarde 12:00–17:59 · noite 18:00–04:59 */
function blocoDoHorario(h) {
  if (h >= 5 && h < 12) return 'manha';
  if (h >= 12 && h < 18) return 'tarde';
  return 'noite';
}
function blocoAtual() { return blocoDoHorario(horaSP()); }

function addDiasISO(iso, n) {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/* RN-01: bonus_prazo — vencida(35) > hoje(30) > ≤+3(20) > ≤+7(10) > 0 */
function bonusPrazo(prazo, hoje) {
  if (!prazo) return 0;
  if (prazo < hoje) return 35;            /* RN-06: vencida */
  if (prazo === hoje) return 30;
  if (prazo <= addDiasISO(hoje, 3)) return 20;
  if (prazo <= addDiasISO(hoje, 7)) return 10;
  return 0;
}
const PESO_QUADRANTE = { Q1: 40, Q2: 25, Q3: 10, Q4: 0 };

/* RN-01 + RN-05: componente_caixa só em área profissional */
function scoreTarefa(t, areaProfissional, hoje) {
  const caixa = areaProfissional ? t.impacto_caixa * (6 - t.esforco) : 0;
  return PESO_QUADRANTE[t.quadrante] + caixa + bonusPrazo(t.prazo, hoje);
}
function ehVencida(prazo, hoje) { return !!prazo && prazo < hoje; }

/* DEC-024: desempate determinístico — 1º prazo mais próximo (nulls por
   último), 2º created_at mais antigo. Pressupõe t._score calculado. */
function cmpTarefas(a, b) {
  if (b._score !== a._score) return b._score - a._score;
  if (a.prazo !== b.prazo) {
    if (!a.prazo) return 1;
    if (!b.prazo) return -1;
    return a.prazo < b.prazo ? -1 : 1;
  }
  if (a.created_at !== b.created_at) return a.created_at < b.created_at ? -1 : 1;
  return 0;
}

/* RN-09: 1º pins do dia (pin_ordem) → 2º alocadas no bloco atual (score)
   → 3º demais alocadas hoje (score). Sem alocação hoje (e sem pin) = fora.
   `tarefas` = abertas com _score; `alocs` = alocações da data.          */
function comporFila(tarefas, alocs, hoje, blocoAgora) {
  const blocosPorTarefa = new Map();
  alocs.forEach((al) => {
    if (!blocosPorTarefa.has(al.tarefa_id)) blocosPorTarefa.set(al.tarefa_id, []);
    blocosPorTarefa.get(al.tarefa_id).push(al.bloco);
  });
  const pins = tarefas
    .filter((t) => t.pin_data === hoje)
    .sort((a, b) => (a.pin_ordem || 0) - (b.pin_ordem || 0));
  const idsPin = new Set(pins.map((t) => t.id));
  const alocadas = tarefas.filter((t) => !idsPin.has(t.id) && blocosPorTarefa.has(t.id));
  const noBloco = alocadas.filter((t) => blocosPorTarefa.get(t.id).includes(blocoAgora)).sort(cmpTarefas);
  const demais = alocadas.filter((t) => !blocosPorTarefa.get(t.id).includes(blocoAgora)).sort(cmpTarefas);
  return [...pins, ...noBloco, ...demais];
}

function fmtMin(min) {
  min = Number(min) || 0;
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h}h`;
  return `${h}h${String(m).padStart(2, '0')}`;
}
function fmtData(iso) {
  if (!iso) return '—';
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}
/* === LOGICA PURA FIM === */

/* ─── Pular (RN-10): fim da fila de hoje, mantém alocação. Memória de sessão. ─── */
function registrarPulo(id) {
  const h = hojeISO();
  if (estado.pulos.data !== h) estado.pulos = { data: h, ids: [] };
  estado.pulos.ids = estado.pulos.ids.filter((x) => x !== id);
  estado.pulos.ids.push(id);
}
function aplicarPulos(fila) {
  if (estado.pulos.data !== hojeISO() || estado.pulos.ids.length === 0) return fila;
  const puladasSet = new Set(estado.pulos.ids);
  const frente = fila.filter((t) => !puladasSet.has(t.id));
  const fim = estado.pulos.ids.map((id) => fila.find((t) => t.id === id)).filter(Boolean);
  return [...frente, ...fim];
}

/* ════════════════════════════════════════════════════════════════
   ACESSO A DADOS
   ════════════════════════════════════════════════════════════════ */

async function obter(consulta) {
  const { data, error } = await consulta;
  if (error) throw error;
  return data || [];
}
const qAreas = () => obter(sb.from('areas').select('*').order('ordem'));
const qProjetos = () => obter(sb.from('projetos').select('*').order('created_at'));
const qMetas = () => obter(sb.from('metas').select('*').order('created_at'));
const qTarefasAbertas = () => obter(sb.from('tarefas').select('*').eq('status', 'aberta'));

function indexar(lista) {
  const m = new Map();
  lista.forEach((x) => m.set(x.id, x));
  return m;
}
/* Anota _proj, _area, _score e _vencida nas tarefas */
function enriquecer(tarefas, projetos, areas) {
  const mp = indexar(projetos);
  const ma = indexar(areas);
  const hoje = hojeISO();
  tarefas.forEach((t) => {
    t._proj = mp.get(t.projeto_id) || null;
    t._area = t._proj ? (ma.get(t._proj.area_id) || null) : null;
    t._score = scoreTarefa(t, !!(t._area && t._area.profissional), hoje);
    t._vencida = ehVencida(t.prazo, hoje);
  });
  return tarefas;
}

/* Concluir tarefa: status, concluida_em, limpa pin (11.1) + RN-08 */
async function concluirTarefa(t, aoAtualizar) {
  const { error } = await sb.from('tarefas')
    .update({ status: 'concluida', concluida_em: new Date().toISOString(), pin_data: null, pin_ordem: null })
    .eq('id', t.id);
  if (error) throw error;
  const abertas = await obter(sb.from('tarefas').select('id')
    .eq('projeto_id', t.projeto_id).eq('status', 'aberta'));
  if (abertas.length === 0) {
    const ps = await obter(sb.from('projetos').select('*').eq('id', t.projeto_id));
    const p = ps[0];
    if (p && p.status === 'ativo') {
      modalConfirmar(`Concluir o projeto “${esc(p.nome)}”?`, 'Sim', 'Agora não', async () => {
        const { error: e2 } = await sb.from('projetos').update({ status: 'concluido' }).eq('id', p.id);
        if (e2) { modalInfo('Não foi possível concluir o projeto. Tente novamente.'); return; }
        toast('Projeto concluído ✓');
        if (aoAtualizar) aoAtualizar();
      });
    }
  }
}

/* ════════════════════════════════════════════════════════════════
   ROTEADOR — hash-routing (DEC-014) + guard de sessão
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

function rotaAtual() { return location.hash || '#/agora'; }

async function navegar() {
  fecharMais();
  fecharModal();
  const hash = rotaAtual();
  const rota = ROTAS.find((r) => r.padrao.test(hash));
  if (!rota) { location.hash = '#/agora'; return; }

  if (!rota.publica && !estado.sessao) { location.hash = '#/login'; return; }
  if (rota.publica && estado.sessao) { location.hash = await destinoInicial(); return; }

  elNav.classList.toggle('hidden', !estado.sessao);
  elFab.classList.toggle('hidden', !estado.sessao);
  marcarNavAtiva(rota.nav);

  const params = hash.match(rota.padrao);
  await rota.tela(params ? params.slice(1) : []);
  elView.focus({ preventScroll: true });
}

function marcarNavAtiva(navHash) {
  $$('.nav-item[data-rota]').forEach((b) => b.classList.toggle('ativa', b.dataset.rota === navHash));
}

/* J1/F-18 */
async function destinoInicial() {
  try {
    const projetos = await obter(sb.from('projetos').select('id, nome'));
    const naoSeed = projetos.filter((p) => p.nome !== SEED_PROJETO_NOME);
    return naoSeed.length === 0 ? '#/wizard' : '#/agora';
  } catch (e) {
    return '#/agora';
  }
}

/* ════════════════════════════════════════════════════════════════
   T-01 — LOGIN
   ════════════════════════════════════════════════════════════════ */

function telaLogin() {
  elNav.classList.add('hidden');
  elFab.classList.add('hidden');
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

  const btn = $('#login-entrar');
  async function entrar() {
    $('#login-erro').classList.add('hidden');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner" aria-hidden="true"></span> Entrando…';
    const { data, error } = await sb.auth.signInWithPassword({
      email: $('#login-email').value.trim(),
      password: $('#login-senha').value
    });
    if (error) {
      btn.disabled = false;
      btn.textContent = 'Entrar';
      const e = $('#login-erro');
      e.textContent = 'E-mail ou senha incorretos';
      e.classList.remove('hidden');
      return;
    }
    estado.sessao = data.session;
    location.hash = await destinoInicial();
  }
  btn.addEventListener('click', entrar);
  ['#login-email', '#login-senha'].forEach((sel) =>
    $(sel).addEventListener('keydown', (ev) => { if (ev.key === 'Enter') entrar(); }));
  $('#login-email').focus();
}

/* ════════════════════════════════════════════════════════════════
   FORMULÁRIOS REUTILIZÁVEIS
   ════════════════════════════════════════════════════════════════ */

/* RN-04: estimativa obrigatória via presets 30/60/120/240 + custom (mín. 5) */
function htmlEstimativa(valor) {
  const presets = [30, 60, 120, 240];
  return `<div class="campo" data-bloco-est>
    <label>Estimativa — obrigatória</label>
    <div class="presets">${presets.map((p) =>
      `<button type="button" class="preset${valor === p ? ' sel' : ''}" data-est="${p}">${fmtMin(p)}</button>`).join('')}
    </div>
    <input type="number" min="5" step="5" inputmode="numeric"
      placeholder="Outro valor em minutos (mín. 5)" data-est-custom
      value="${valor && ![30, 60, 120, 240].includes(valor) ? valor : ''}">
    <div class="erro-inline hidden" data-erro-est>Informe a estimativa (mínimo 5 minutos)</div>
  </div>`;
}
function ligarEstimativa(raiz) {
  $$('.preset', raiz).forEach((b) => b.addEventListener('click', () => {
    $$('.preset', raiz).forEach((x) => x.classList.remove('sel'));
    b.classList.add('sel');
    $('[data-est-custom]', raiz).value = '';
  }));
  $('[data-est-custom]', raiz).addEventListener('input', () =>
    $$('.preset', raiz).forEach((x) => x.classList.remove('sel')));
}
function lerEstimativa(raiz) {
  const sel = $('.preset.sel', raiz);
  const custom = $('[data-est-custom]', raiz).value;
  const v = sel ? Number(sel.dataset.est) : (custom ? Number(custom) : null);
  const erro = $('[data-erro-est]', raiz);
  if (!v || v < 5) { erro.classList.remove('hidden'); return null; }
  erro.classList.add('hidden');
  return v;
}

/* F-03 + RN-05: impacto/esforço ocultos fora de área profissional (default 0/1) */
function htmlFormTarefa(t, areaProfissional) {
  t = t || {};
  return `
    <div class="campo">
      <label>Título</label>
      <input type="text" data-f="titulo" value="${esc(t.titulo || '')}">
      <div class="erro-inline hidden" data-erro-titulo>Informe o título</div>
    </div>
    ${htmlEstimativa(t.estimativa_min || null)}
    <div class="campo">
      <label>Quadrante</label>
      <select data-f="quadrante">${Object.entries(QUADRANTES).map(([k, l]) =>
        `<option value="${k}"${(t.quadrante || 'Q1') === k ? ' selected' : ''}>${l}</option>`).join('')}</select>
    </div>
    ${areaProfissional ? `
    <div class="campo">
      <label>Impacto no caixa (0–5)</label>
      <select data-f="impacto">${[0, 1, 2, 3, 4, 5].map((n) =>
        `<option value="${n}"${(t.impacto_caixa ?? 0) === n ? ' selected' : ''}>${n}</option>`).join('')}</select>
    </div>
    <div class="campo">
      <label>Esforço (1–5)</label>
      <select data-f="esforco">${[1, 2, 3, 4, 5].map((n) =>
        `<option value="${n}"${(t.esforco ?? 1) === n ? ' selected' : ''}>${n}</option>`).join('')}</select>
    </div>` : ''}
    <div class="campo">
      <label>Prazo (opcional)</label>
      <input type="date" data-f="prazo" value="${t.prazo || ''}">
    </div>
    <div class="erro-inline hidden" data-erro-geral></div>`;
}
function lerFormTarefa(raiz, areaProfissional) {
  const titulo = $('[data-f=titulo]', raiz).value.trim();
  const erroT = $('[data-erro-titulo]', raiz);
  let ok = true;
  if (!titulo) { erroT.classList.remove('hidden'); ok = false; } else erroT.classList.add('hidden');
  const est = lerEstimativa(raiz);
  if (!est) ok = false;
  if (!ok) return null;
  return {
    titulo,
    estimativa_min: est,
    quadrante: $('[data-f=quadrante]', raiz).value,
    impacto_caixa: areaProfissional ? Number($('[data-f=impacto]', raiz).value) : 0,
    esforco: areaProfissional ? Number($('[data-f=esforco]', raiz).value) : 1,
    prazo: $('[data-f=prazo]', raiz).value || null
  };
}
function erroGeral(raiz, msg) {
  const e = $('[data-erro-geral]', raiz);
  if (e) { e.textContent = msg; e.classList.remove('hidden'); }
}

function htmlSwatches(corSel) {
  return `<div class="swatches">${PALETA.map((c) =>
    `<button type="button" class="swatch${c === corSel ? ' sel' : ''}" style="background:${c}" data-cor="${c}" aria-label="Cor ${c}"></button>`).join('')}</div>`;
}

/* ════════════════════════════════════════════════════════════════
   F-01 — LINHAS DE ÁREA (compartilhado: wizard passo 1 + modal do Panorama)
   criar · renomear · recolorir · marcar profissional · reordenar · arquivar
   (+ excluir, com bloqueio da seção 16 / CA-14)
   ════════════════════════════════════════════════════════════════ */

function htmlLinhasAreas(areas) {
  if (areas.length === 0) return '<p class="meta-texto">Nenhuma área.</p>';
  return areas.map((a) => `
    <div class="linha-area${a.arquivada ? ' arquivada' : ''}" data-area-id="${a.id}">
      <button type="button" class="swatch" style="background:${a.cor}" data-abrir-cores aria-label="Mudar cor da área ${esc(a.nome)}"></button>
      <input type="text" value="${esc(a.nome)}" data-area-nome aria-label="Nome da área">
      <label class="meta-texto check-prof"><input type="checkbox" data-area-prof ${a.profissional ? 'checked' : ''}> profissional</label>
      <span class="linha-acoes">
        <button type="button" class="btn btn-fantasma btn-mini" data-area-sobe aria-label="Subir">↑</button>
        <button type="button" class="btn btn-fantasma btn-mini" data-area-desce aria-label="Descer">↓</button>
        <button type="button" class="btn btn-fantasma btn-mini" data-area-arquiva>${a.arquivada ? 'Restaurar' : 'Arquivar'}</button>
        <button type="button" class="btn btn-fantasma btn-mini" data-area-excluir>Excluir</button>
      </span>
      <div class="hidden bloco-cores" data-cores>${htmlSwatches(a.cor)}</div>
    </div>`).join('') ;
}

function htmlNovaArea() {
  return `
    <div class="linha-area" data-nova-area>
      <input type="text" placeholder="Nova área" data-novo-nome aria-label="Nome da nova área">
      <button type="button" class="btn" data-add-area>Adicionar</button>
      <div class="erro-inline hidden" data-erro-area>Informe o nome da área</div>
    </div>`;
}

function ligarLinhasAreas(raiz, areas, projetos, recarregar) {
  $$('.linha-area[data-area-id]', raiz).forEach((linha) => {
    const id = linha.dataset.areaId;
    const area = areas.find((a) => a.id === id);

    $('[data-area-nome]', linha).addEventListener('change', async (ev) => {
      const nome = ev.target.value.trim();
      if (!nome || nome === area.nome) { ev.target.value = area.nome; return; }
      const { error } = await sb.from('areas').update({ nome }).eq('id', id);
      if (error) { modalInfo('Não foi possível renomear. Tente novamente.'); return; }
      area.nome = nome;
      toast('Área renomeada ✓');
    });

    $('[data-area-prof]', linha).addEventListener('change', async (ev) => {
      const { error } = await sb.from('areas').update({ profissional: ev.target.checked }).eq('id', id);
      if (error) { ev.target.checked = !ev.target.checked; modalInfo('Não foi possível salvar. Tente novamente.'); return; }
      toast('Área atualizada ✓');
    });

    $('[data-abrir-cores]', linha).addEventListener('click', () =>
      $('[data-cores]', linha).classList.toggle('hidden'));
    $$('[data-cor]', linha).forEach((sw) => sw.addEventListener('click', async () => {
      const { error } = await sb.from('areas').update({ cor: sw.dataset.cor }).eq('id', id);
      if (error) { modalInfo('Não foi possível mudar a cor.'); return; }
      toast('Cor atualizada ✓');
      recarregar();
    }));

    $('[data-area-sobe]', linha).addEventListener('click', () => reordenarArea(areas, id, -1, recarregar));
    $('[data-area-desce]', linha).addEventListener('click', () => reordenarArea(areas, id, +1, recarregar));

    $('[data-area-arquiva]', linha).addEventListener('click', async () => {
      const { error } = await sb.from('areas').update({ arquivada: !area.arquivada }).eq('id', id);
      if (error) { modalInfo('Não foi possível salvar.'); return; }
      toast(area.arquivada ? 'Área restaurada ✓' : 'Área arquivada ✓');
      recarregar();
    });

    /* Seção 16 / CA-14: excluir área com projetos → bloqueio */
    $('[data-area-excluir]', linha).addEventListener('click', async () => {
      const comProjetos = projetos.filter((p) => p.area_id === id);
      if (comProjetos.length > 0) {
        modalInfo(`Mova ou arquive os projetos antes.<br><span class="meta-texto">A área “${esc(area.nome)}” tem ${comProjetos.length} projeto(s) vinculado(s).</span>`);
        return;
      }
      modalConfirmar(`Excluir a área “${esc(area.nome)}”?`, 'Excluir', 'Cancelar', async () => {
        const { error } = await sb.from('areas').delete().eq('id', id);
        if (error) { modalInfo('Não foi possível excluir: há registros vinculados a esta área (ex.: metas).'); return; }
        toast('Área excluída ✓');
        recarregar();
      });
    });
  });

  const nova = $('[data-nova-area]', raiz);
  if (nova) {
    $('[data-add-area]', nova).addEventListener('click', async () => {
      const nome = $('[data-novo-nome]', nova).value.trim();
      const erro = $('[data-erro-area]', nova);
      if (!nome) { erro.classList.remove('hidden'); return; }
      erro.classList.add('hidden');
      const maxOrdem = areas.reduce((m, a) => Math.max(m, a.ordem), 0);
      const usadas = new Set(areas.map((a) => a.cor));
      const cor = PALETA.find((c) => !usadas.has(c)) || PALETA[0];
      const { error } = await sb.from('areas').insert({ nome, cor, ordem: maxOrdem + 1, profissional: false });
      if (error) { modalInfo('Não foi possível criar a área.'); return; }
      toast('Área criada ✓');
      recarregar();
    });
  }
}

async function reordenarArea(areas, id, delta, recarregar) {
  const ordenadas = [...areas].sort((a, b) => a.ordem - b.ordem);
  const i = ordenadas.findIndex((a) => a.id === id);
  const j = i + delta;
  if (j < 0 || j >= ordenadas.length) return;
  const a = ordenadas[i], b = ordenadas[j];
  const e1 = await sb.from('areas').update({ ordem: b.ordem }).eq('id', a.id);
  const e2 = await sb.from('areas').update({ ordem: a.ordem }).eq('id', b.id);
  if (e1.error || e2.error) { modalInfo('Não foi possível reordenar.'); return; }
  recarregar();
}

/* ════════════════════════════════════════════════════════════════
   B4 — T-10 WIZARD DE PRIMEIRA CARGA (J1, F-18)
   4 passos · barra de progresso · voltar sempre disponível ·
   estado salvo a cada passo (dados gravados direto no banco;
   o passo corrente fica em localStorage — recarregar não perde).
   ════════════════════════════════════════════════════════════════ */

const CHAVE_WIZARD = 'vf_wizard_passo';

function htmlProgresso(passo) {
  return `<div class="progresso" aria-label="Passo ${passo} de 4">` +
    [1, 2, 3, 4].map((n) => `<span class="${n <= passo ? 'feita' : ''}"></span>`).join('') + '</div>';
}

async function telaWizard() {
  const passo = Math.min(4, Math.max(1, Number(localStorage.getItem(CHAVE_WIZARD) || '1')));
  elView.innerHTML = `<h1>Primeira carga</h1>${htmlProgresso(passo)}<div class="skeleton skeleton-card"></div>`;
  try {
    if (passo === 1) await wizardPasso1();
    else if (passo === 2) await wizardPasso2();
    else if (passo === 3) await wizardPasso3();
    else await wizardPasso4();
  } catch (e) {
    renderErro('Primeira carga', telaWizard);
  }
}
function irPasso(n) {
  localStorage.setItem(CHAVE_WIZARD, String(n));
  telaWizard();
}

/* Passo 1 — confirmar as 7 áreas do seed */
async function wizardPasso1() {
  const [areas, projetos] = await Promise.all([qAreas(), qProjetos()]);
  elView.innerHTML = `
    <h1>Primeira carga</h1>${htmlProgresso(1)}
    <h2>1 · Suas áreas da vida</h2>
    <p class="meta-texto">Renomeie, recolora, remova ou adicione áreas. Tudo é salvo na hora.</p>
    <div class="card" id="wiz-areas">${htmlLinhasAreas(areas)}${htmlNovaArea()}</div>
    <div class="modal-acoes">
      <button class="btn" disabled>Voltar</button>
      <button class="btn btn-primario" id="wiz-continuar">Continuar</button>
    </div>`;
  ligarLinhasAreas($('#wiz-areas'), areas, projetos, telaWizard);
  $('#wiz-continuar').addEventListener('click', () => irPasso(2));
}

/* Passo 2 — projetos pré-nomeados (11.4e): marcar ativos, definir área e prazo */
async function wizardPasso2() {
  const [areas, projetos] = await Promise.all([qAreas(), qProjetos()]);
  const ativas = areas.filter((a) => !a.arquivada);
  const linhas = PROJETOS_WIZARD.map((nome, i) => {
    const existente = projetos.find((p) => p.nome === nome);
    if (existente) {
      return `<div class="linha-area" data-wp="${i}">
        <label class="check-prof"><input type="checkbox" checked disabled> ${esc(nome)}</label>
        <span class="meta-texto">já criado ✓</span>
      </div>`;
    }
    return `<div class="linha-area" data-wp="${i}">
      <label class="check-prof"><input type="checkbox" data-wp-marca> ${esc(nome)}</label>
      <select data-wp-area disabled aria-label="Área do projeto">
        <option value="">Área…</option>
        ${ativas.map((a) => `<option value="${a.id}">${esc(a.nome)}</option>`).join('')}
      </select>
      <input type="date" data-wp-prazo disabled aria-label="Prazo do projeto">
      <div class="erro-inline hidden" data-wp-erro>Defina a área deste projeto</div>
    </div>`;
  }).join('');

  elView.innerHTML = `
    <h1>Primeira carga</h1>${htmlProgresso(2)}
    <h2>2 · Seus projetos ativos</h2>
    <p class="meta-texto">Marque os projetos que estão de pé hoje e defina área e prazo de cada um. O Sprint de Caixa já está criado.</p>
    <div class="card">${linhas}</div>
    <div class="modal-acoes">
      <button class="btn" id="wiz-voltar">Voltar</button>
      <button class="btn btn-primario" id="wiz-continuar">Continuar</button>
    </div>`;

  $$('[data-wp-marca]').forEach((cb) => cb.addEventListener('change', (ev) => {
    const linha = ev.target.closest('.linha-area');
    $('[data-wp-area]', linha).disabled = !ev.target.checked;
    $('[data-wp-prazo]', linha).disabled = !ev.target.checked;
  }));

  $('#wiz-voltar').addEventListener('click', () => irPasso(1));
  $('#wiz-continuar').addEventListener('click', async () => {
    const novos = [];
    let valido = true;
    $$('.linha-area[data-wp]').forEach((linha) => {
      const cb = $('[data-wp-marca]', linha);
      if (!cb || !cb.checked) return;
      const areaId = $('[data-wp-area]', linha).value;
      const erro = $('[data-wp-erro]', linha);
      if (!areaId) { erro.classList.remove('hidden'); valido = false; return; }
      erro.classList.add('hidden');
      novos.push({
        nome: PROJETOS_WIZARD[Number(linha.dataset.wp)],
        area_id: areaId,
        prazo: $('[data-wp-prazo]', linha).value || null,
        status: 'ativo'
      });
    });
    if (!valido) return;
    if (novos.length > 0) {
      const { error } = await sb.from('projetos').insert(novos);
      if (error) { modalInfo('Não foi possível criar os projetos. Tente novamente.'); return; }
      toast(`${novos.length} projeto(s) criado(s) ✓`);
    }
    irPasso(3);
  });
}

/* Passo 3 — 1–5 tarefas por projeto ativo (exceto o Sprint, que já tem) */
async function wizardPasso3() {
  const [areas, projetos, tarefas] = await Promise.all([qAreas(), qProjetos(), qTarefasAbertas()]);
  const alvo = projetos.filter((p) => p.status === 'ativo' && p.nome !== SEED_PROJETO_NOME);
  const mapAreas = indexar(areas);

  const cartoes = alvo.length === 0
    ? '<p class="meta-texto">Nenhum projeto ativo além do Sprint de Caixa. Você pode continuar.</p>'
    : alvo.map((p) => {
      const minhas = tarefas.filter((t) => t.projeto_id === p.id);
      const area = mapAreas.get(p.area_id);
      return `<div class="card cartao-projeto-wiz" data-wt="${p.id}">
        <strong>${esc(p.nome)}</strong>
        <span class="meta-texto"><span class="dot" style="background:${area ? area.cor : 'var(--borda)'}"></span>${esc(area ? area.nome : '—')} · ${minhas.length} de 1–5 tarefas</span>
        ${minhas.length ? `<ul class="lista-simples">${minhas.map((t) => `<li>${esc(t.titulo)} <span class="meta-texto">(${fmtMin(t.estimativa_min)})</span></li>`).join('')}</ul>` : ''}
        ${minhas.length < 5 ? `<button class="btn btn-fantasma" data-wt-add="${p.id}">+ Adicionar tarefa</button>` : '<span class="meta-texto">Limite de 5 tarefas no wizard atingido.</span>'}
      </div>`;
    }).join('');

  elView.innerHTML = `
    <h1>Primeira carga</h1>${htmlProgresso(3)}
    <h2>3 · Tarefas iniciais</h2>
    <p class="meta-texto">Adicione de 1 a 5 tarefas em cada projeto ativo. Cada tarefa é salva na hora.</p>
    ${cartoes}
    <div class="modal-acoes">
      <button class="btn" id="wiz-voltar">Voltar</button>
      <button class="btn btn-primario" id="wiz-continuar">Continuar</button>
    </div>`;

  $$('[data-wt-add]').forEach((b) => b.addEventListener('click', () => {
    const p = alvo.find((x) => x.id === b.dataset.wtAdd);
    const area = mapAreas.get(p.area_id);
    abrirFormTarefa(p, !!(area && area.profissional), null, telaWizard);
  }));
  $('#wiz-voltar').addEventListener('click', () => irPasso(2));
  $('#wiz-continuar').addEventListener('click', () => irPasso(4));
}

/* Passo 4 — meta-seed + outras metas */
async function wizardPasso4() {
  const [metas, areas] = await Promise.all([qMetas(), qAreas()]);
  const mapAreas = indexar(areas);
  elView.innerHTML = `
    <h1>Primeira carga</h1>${htmlProgresso(4)}
    <h2>4 · Suas metas</h2>
    <p class="meta-texto">A meta do Sprint já está criada. Adicione outras, se quiser.</p>
    ${metas.map((m) => {
      const a = mapAreas.get(m.area_id);
      return `<div class="card cartao-meta">
        <strong>${esc(m.titulo)}</strong>
        <span class="meta-texto"><span class="dot" style="background:${a ? a.cor : 'var(--borda)'}"></span>${esc(a ? a.nome : '—')} · prazo ${fmtData(m.prazo)}</span>
        <p class="meta-texto">${esc(m.resultado_esperado)}</p>
      </div>`;
    }).join('')}
    <button class="btn btn-fantasma" id="wiz-add-meta">+ Adicionar meta</button>
    <div class="modal-acoes">
      <button class="btn" id="wiz-voltar">Voltar</button>
      <button class="btn btn-sucesso" id="wiz-concluir">Concluir e ver minha próxima ação</button>
    </div>`;
  $('#wiz-add-meta').addEventListener('click', () => abrirFormMeta(null, telaWizard));
  $('#wiz-voltar').addEventListener('click', () => irPasso(3));
  $('#wiz-concluir').addEventListener('click', () => {
    localStorage.removeItem(CHAVE_WIZARD);
    location.hash = '#/agora';            /* CA-07: nunca cai em painel vazio */
  });
}

/* ════════════════════════════════════════════════════════════════
   B5 — T-05 PANORAMA (F-13) + modal de áreas (F-01)
   ════════════════════════════════════════════════════════════════ */

async function telaPanorama() {
  elView.innerHTML = `<h1>Panorama</h1><div class="skeleton skeleton-card"></div><div class="skeleton skeleton-card"></div><div class="skeleton skeleton-card"></div>`;
  let areas, projetos, tarefas;
  try {
    [areas, projetos, tarefas] = await Promise.all([qAreas(), qProjetos(), qTarefasAbertas()]);
  } catch (e) { return renderErro('Panorama', telaPanorama); }

  enriquecer(tarefas, projetos, areas);
  const tempoProj = new Map(), qtdProj = new Map(), qDom = new Map();
  tarefas.forEach((t) => {
    tempoProj.set(t.projeto_id, (tempoProj.get(t.projeto_id) || 0) + t.estimativa_min);  /* RN-03 */
    qtdProj.set(t.projeto_id, (qtdProj.get(t.projeto_id) || 0) + 1);
    const atual = qDom.get(t.projeto_id);
    if (!atual || t.quadrante < atual) qDom.set(t.projeto_id, t.quadrante);  /* quadrante dominante */
  });

  if (estado.acordeao === null) estado.acordeao = new Set(areas.map((a) => a.id));

  const visiveis = areas.filter((a) => !a.arquivada);
  const algumProjeto = projetos.length > 0;

  function htmlCartaoProjeto(p) {
    const partes = [
      `⏱ ${fmtMin(tempoProj.get(p.id) || 0)}`,
      `prazo ${fmtData(p.prazo)}`,
      qDom.get(p.id) ? `prioridade ${qDom.get(p.id)}` : 'sem tarefas abertas',
      `${qtdProj.get(p.id) || 0} tarefa(s)`
    ];
    if (p.status !== 'ativo') partes.push(STATUS_PROJETO_LABEL[p.status]);
    return `<button class="card cartao-projeto" data-abrir-projeto="${p.id}">
      <span class="titulo-trunc"><strong>${esc(p.nome)}</strong></span>
      <span class="meta-texto">${partes.join(' · ')}</span>
    </button>`;
  }

  const corpo = !algumProjeto
    ? `<div class="estado-vazio"><p>Nenhum projeto. Criar primeiro →</p><button class="btn btn-primario" data-novo-projeto>Novo projeto</button></div>`
    : visiveis.map((a) => {
      const meus = projetos.filter((p) => p.area_id === a.id && p.status !== 'arquivado');
      const arquivados = projetos.filter((p) => p.area_id === a.id && p.status === 'arquivado');
      const tempoArea = meus.reduce((s, p) => s + (tempoProj.get(p.id) || 0), 0);
      const aberta = estado.acordeao.has(a.id);
      return `<div class="acordeao-area">
        <button class="acordeao-cab" data-toggle-area="${a.id}" aria-expanded="${aberta}">
          <span class="dot" style="background:${a.cor}"></span>
          <span class="linha-flex titulo-trunc">${esc(a.nome)}</span>
          <span class="meta-texto">${fmtMin(tempoArea)}</span>
        </button>
        <div class="acordeao-corpo${aberta ? '' : ' hidden'}">
          ${meus.length ? meus.map(htmlCartaoProjeto).join('') : '<p class="meta-texto">Sem projetos nesta área.</p>'}
          ${arquivados.length ? `
            <button class="btn btn-fantasma btn-mini" data-toggle-arq="${a.id}">Arquivados (${arquivados.length})</button>
            <div class="hidden" data-lista-arq="${a.id}">${arquivados.map(htmlCartaoProjeto).join('')}</div>` : ''}
        </div>
      </div>`;
    }).join('');

  elView.innerHTML = `
    <div class="tela-cab">
      <h1>Panorama</h1>
      <span class="acoes">
        <button class="btn" id="pan-areas">Gerenciar áreas</button>
        <button class="btn btn-primario" data-novo-projeto>Novo projeto</button>
      </span>
    </div>
    ${corpo}`;

  $$('[data-toggle-area]').forEach((b) => b.addEventListener('click', () => {
    const id = b.dataset.toggleArea;
    if (estado.acordeao.has(id)) estado.acordeao.delete(id); else estado.acordeao.add(id);
    telaPanorama();
  }));
  $$('[data-toggle-arq]').forEach((b) => b.addEventListener('click', () =>
    $(`[data-lista-arq="${b.dataset.toggleArq}"]`).classList.toggle('hidden')));
  $$('[data-abrir-projeto]').forEach((b) => b.addEventListener('click', () => {
    location.hash = `#/projeto/${b.dataset.abrirProjeto}`;
  }));
  $$('[data-novo-projeto]').forEach((b) => b.addEventListener('click', () =>
    abrirFormProjeto(null, areas, qMetasCache(), telaPanorama)));
  $('#pan-areas').addEventListener('click', () => abrirModalAreas());
}

let _metasCache = [];
function qMetasCache() { return _metasCache; }

async function abrirModalAreas() {
  let areas, projetos;
  try { [areas, projetos] = await Promise.all([qAreas(), qProjetos()]); }
  catch (e) { modalInfo('Não foi possível carregar as áreas.'); return; }
  const raiz = abrirModal(`
    <h2 class="modal-titulo">Gerenciar áreas</h2>
    <div id="modal-areas">${htmlLinhasAreas(areas)}${htmlNovaArea()}</div>
    <div class="modal-acoes"><button class="btn btn-primario" id="areas-fechar">Fechar</button></div>`);
  ligarLinhasAreas($('#modal-areas', raiz), areas, projetos, abrirModalAreas);
  $('#areas-fechar', raiz).addEventListener('click', () => { fecharModal(); telaPanorama(); });
}

/* Form de projeto (F-02): área, meta opcional, nome, prazo opcional */
async function abrirFormProjeto(projeto, areas, _metas, aoSalvar) {
  let metas;
  try { metas = await qMetas(); _metasCache = metas; } catch (e) { metas = []; }
  const ativas = areas.filter((a) => !a.arquivada);
  const raiz = abrirModal(`
    <h2 class="modal-titulo">${projeto ? 'Editar projeto' : 'Novo projeto'}</h2>
    <div class="campo">
      <label>Nome</label>
      <input type="text" data-f="nome" value="${esc(projeto ? projeto.nome : '')}">
      <div class="erro-inline hidden" data-erro-nome>Informe o nome</div>
    </div>
    <div class="campo">
      <label>Área</label>
      <select data-f="area">${ativas.map((a) =>
        `<option value="${a.id}"${projeto && projeto.area_id === a.id ? ' selected' : ''}>${esc(a.nome)}</option>`).join('')}</select>
    </div>
    <div class="campo">
      <label>Meta vinculada (opcional)</label>
      <select data-f="meta">
        <option value="">— nenhuma —</option>
        ${metas.map((m) => `<option value="${m.id}"${projeto && projeto.meta_id === m.id ? ' selected' : ''}>${esc(m.titulo)}</option>`).join('')}
      </select>
    </div>
    <div class="campo">
      <label>Prazo (opcional)</label>
      <input type="date" data-f="prazo" value="${projeto && projeto.prazo ? projeto.prazo : ''}">
    </div>
    <div class="erro-inline hidden" data-erro-geral></div>
    <div class="modal-acoes">
      <button class="btn" data-m="cancelar">Cancelar</button>
      <button class="btn btn-primario" data-m="salvar">Salvar</button>
    </div>`);
  $('[data-m=cancelar]', raiz).addEventListener('click', fecharModal);
  $('[data-m=salvar]', raiz).addEventListener('click', async () => {
    const nome = $('[data-f=nome]', raiz).value.trim();
    const erroNome = $('[data-erro-nome]', raiz);
    if (!nome) { erroNome.classList.remove('hidden'); return; }
    erroNome.classList.add('hidden');
    const registro = {
      nome,
      area_id: $('[data-f=area]', raiz).value,
      meta_id: $('[data-f=meta]', raiz).value || null,
      prazo: $('[data-f=prazo]', raiz).value || null
    };
    const op = projeto
      ? sb.from('projetos').update(registro).eq('id', projeto.id)
      : sb.from('projetos').insert(registro);
    const { error } = await op;
    if (error) { erroGeral(raiz, 'Não foi possível salvar. Tente novamente.'); return; }
    fecharModal();
    toast(projeto ? 'Projeto atualizado ✓' : 'Projeto criado ✓');
    aoSalvar();
  });
}

/* ════════════════════════════════════════════════════════════════
   B5 — T-06 PROJETO (F-02/F-03, RN-03/04/05/08)
   ════════════════════════════════════════════════════════════════ */

async function telaProjeto(params) {
  const id = params[0];
  elView.innerHTML = `<div class="skeleton skeleton-card"></div><div class="skeleton skeleton-linha"></div><div class="skeleton skeleton-linha"></div>`;
  let projeto, areas, metas, tarefas;
  try {
    const ps = await obter(sb.from('projetos').select('*').eq('id', id));
    projeto = ps[0];
    [areas, metas, tarefas] = await Promise.all([qAreas(), qMetas(),
      obter(sb.from('tarefas').select('*').eq('projeto_id', id))]);
    _metasCache = metas;
  } catch (e) { return renderErro('Projeto', () => telaProjeto(params)); }

  if (!projeto) {
    elView.innerHTML = `<h1>Projeto</h1><div class="estado-vazio"><p>Projeto não encontrado.</p><button class="btn" data-rota-pan>Ir ao Panorama</button></div>`;
    $('[data-rota-pan]').addEventListener('click', () => { location.hash = '#/panorama'; });
    return;
  }

  enriquecer(tarefas, [projeto], areas);
  const area = areas.find((a) => a.id === projeto.area_id) || null;
  const meta = metas.find((m) => m.id === projeto.meta_id) || null;
  const abertas = tarefas.filter((t) => t.status === 'aberta').sort(cmpTarefas);
  const concluidas = tarefas.filter((t) => t.status === 'concluida')
    .sort((a, b) => (b.concluida_em || '') < (a.concluida_em || '') ? -1 : 1);
  const tempoRestante = abertas.reduce((s, t) => s + t.estimativa_min, 0);  /* RN-03 */
  const areaProf = !!(area && area.profissional);

  const botoesStatus = {
    ativo: `<button class="btn" data-pst="pausado">Pausar</button>
            <button class="btn" data-pst="concluido">Concluir</button>
            <button class="btn" data-pst="arquivado">Arquivar</button>`,
    pausado: `<button class="btn" data-pst="ativo">Reativar</button>
              <button class="btn" data-pst="arquivado">Arquivar</button>`,
    concluido: `<button class="btn" data-pst="ativo">Reabrir</button>
                <button class="btn" data-pst="arquivado">Arquivar</button>`,
    arquivado: `<button class="btn" data-pst="ativo">Reativar</button>`
  }[projeto.status];

  function htmlLinhaTarefa(t, concluida) {
    return `<button class="linha-tarefa${t._vencida && !concluida ? ' atrasada' : ''}" data-tarefa="${t.id}">
      <span class="linha-flex">
        <span class="titulo-trunc">${esc(t.titulo)}</span>
        <span class="meta-texto">${concluida
          ? `concluída em ${fmtData((t.concluida_em || '').slice(0, 10))}`
          : `score ${t._score} · ${t.quadrante} · ${fmtMin(t.estimativa_min)} · prazo ${fmtData(t.prazo)}`}</span>
      </span>
      ${!concluida && t._vencida ? '<span class="badge badge-atrasada">atrasada</span>' : ''}
    </button>`;
  }

  elView.innerHTML = `
    <button class="btn btn-fantasma" data-voltar>← Panorama</button>
    <div class="card card-elevado" style="border-left:6px solid ${area ? area.cor : 'var(--borda)'}; margin-top:8px;">
      <h2>${esc(projeto.nome)}</h2>
      <p class="meta-texto">
        <span class="dot" style="background:${area ? area.cor : 'var(--borda)'}"></span>${esc(area ? area.nome : '—')}
        · meta: ${esc(meta ? meta.titulo : '—')}
        · prazo ${fmtData(projeto.prazo)}
        · ${STATUS_PROJETO_LABEL[projeto.status]}
        · restam ${fmtMin(tempoRestante)}
      </p>
      <div class="acoes" style="margin-top:12px; display:flex; gap:8px; flex-wrap:wrap;">
        <button class="btn" data-p-editar>Editar</button>
        ${botoesStatus}
        <button class="btn" data-p-excluir>Excluir</button>
      </div>
    </div>

    <div class="tela-cab" style="margin-top:24px;">
      <h2>Tarefas abertas (${abertas.length})</h2>
      <button class="btn btn-primario" data-t-nova>+ Tarefa</button>
    </div>
    ${abertas.length ? abertas.map((t) => htmlLinhaTarefa(t, false)).join('')
      : `<div class="estado-vazio"><p>Sem tarefas. Adicionar →</p></div>`}

    ${concluidas.length ? `
      <button class="btn btn-fantasma" data-toggle-concluidas>Concluídas (${concluidas.length})</button>
      <div class="hidden" data-lista-concluidas>${concluidas.map((t) => htmlLinhaTarefa(t, true)).join('')}</div>` : ''}`;

  const recarregar = () => telaProjeto(params);

  $('[data-voltar]').addEventListener('click', () => { location.hash = '#/panorama'; });
  $('[data-p-editar]').addEventListener('click', () => abrirFormProjeto(projeto, areas, metas, recarregar));

  $$('[data-pst]').forEach((b) => b.addEventListener('click', async () => {
    const { error } = await sb.from('projetos').update({ status: b.dataset.pst }).eq('id', projeto.id);
    if (error) { modalInfo('Não foi possível alterar o status.'); return; }
    toast('Status atualizado ✓');
    recarregar();
  }));

  /* Seção 16: excluir projeto com tarefas → confirmação explícita com contagem; cascade; sem undo */
  $('[data-p-excluir]').addEventListener('click', () => {
    modalConfirmar(
      `Excluir o projeto “${esc(projeto.nome)}”?<br><span class="meta-texto">Isso excluirá ${tarefas.length} tarefa(s) e suas alocações. Não há como desfazer.</span>`,
      'Excluir', 'Cancelar',
      async () => {
        const { error } = await sb.from('projetos').delete().eq('id', projeto.id);
        if (error) { modalInfo('Não foi possível excluir o projeto.'); return; }
        toast('Projeto excluído ✓');
        location.hash = '#/panorama';
      });
  });

  $('[data-t-nova]').addEventListener('click', () => abrirFormTarefa(projeto, areaProf, null, recarregar));

  const elToggleConc = $('[data-toggle-concluidas]');
  if (elToggleConc) elToggleConc.addEventListener('click', () =>
    $('[data-lista-concluidas]').classList.toggle('hidden'));

  $$('[data-tarefa]').forEach((b) => b.addEventListener('click', () => {
    const t = tarefas.find((x) => x.id === b.dataset.tarefa);
    abrirFolhaTarefaProjeto(t, projeto, areaProf, recarregar);
  }));
}

/* Folha de ações da tarefa em T-06 */
function abrirFolhaTarefaProjeto(t, projeto, areaProf, recarregar) {
  const aberta = t.status === 'aberta';
  const raiz = abrirModal(`
    <h2 class="modal-titulo">${esc(t.titulo)}</h2>
    <p class="meta-texto">${aberta ? `score ${t._score} · ` : ''}${t.quadrante} · ${fmtMin(t.estimativa_min)} · prazo ${fmtData(t.prazo)}</p>
    <div class="erro-inline hidden" data-erro-geral></div>
    <div class="modal-acoes">
      ${aberta
        ? `<button class="btn" data-m="editar">Editar</button>
           <button class="btn" data-m="excluir">Excluir</button>
           <button class="btn btn-sucesso" data-m="concluir">Concluir</button>`
        : `<button class="btn" data-m="excluir">Excluir</button>
           <button class="btn btn-primario" data-m="reabrir">Reabrir</button>`}
      <button class="btn btn-fantasma" data-m="fechar">Fechar</button>
    </div>`);
  $('[data-m=fechar]', raiz).addEventListener('click', fecharModal);
  const elEditar = $('[data-m=editar]', raiz);
  if (elEditar) elEditar.addEventListener('click', () => abrirFormTarefa(projeto, areaProf, t, recarregar));
  const elConcluir = $('[data-m=concluir]', raiz);
  if (elConcluir) elConcluir.addEventListener('click', async () => {
    try {
      fecharModal();
      await concluirTarefa(t, recarregar);   /* RN-08 dentro */
      toast('Concluída ✓');
      recarregar();
    } catch (e) { modalInfo('Sem conexão — não foi possível concluir agora. Tente novamente.'); }
  });
  const elReabrir = $('[data-m=reabrir]', raiz);
  if (elReabrir) elReabrir.addEventListener('click', async () => {
    const { error } = await sb.from('tarefas').update({ status: 'aberta', concluida_em: null }).eq('id', t.id);
    if (error) { erroGeral(raiz, 'Não foi possível reabrir.'); return; }
    fecharModal();
    toast('Tarefa reaberta ✓');
    recarregar();
  });
  $('[data-m=excluir]', raiz).addEventListener('click', () => {
    modalConfirmar(`Excluir a tarefa “${esc(t.titulo)}”?`, 'Excluir', 'Cancelar', async () => {
      const { error } = await sb.from('tarefas').delete().eq('id', t.id);
      if (error) { modalInfo('Não foi possível excluir a tarefa.'); return; }
      toast('Tarefa excluída ✓');
      recarregar();
    });
  });
}

/* Form de tarefa (criar/editar) — F-03, RN-04, RN-05 */
function abrirFormTarefa(projeto, areaProf, tarefa, aoSalvar) {
  const raiz = abrirModal(`
    <h2 class="modal-titulo">${tarefa ? 'Editar tarefa' : `Nova tarefa em “${esc(projeto.nome)}”`}</h2>
    ${htmlFormTarefa(tarefa, areaProf)}
    <div class="modal-acoes">
      <button class="btn" data-m="cancelar">Cancelar</button>
      <button class="btn btn-primario" data-m="salvar">Salvar</button>
    </div>`);
  ligarEstimativa(raiz);
  $('[data-m=cancelar]', raiz).addEventListener('click', fecharModal);
  $('[data-m=salvar]', raiz).addEventListener('click', async () => {
    const dados = lerFormTarefa(raiz, areaProf);
    if (!dados) return;                    /* CT-04: bloqueio com validação inline */
    const op = tarefa
      ? sb.from('tarefas').update(dados).eq('id', tarefa.id)
      : sb.from('tarefas').insert({ ...dados, projeto_id: projeto.id });
    const { error } = await op;
    if (error) { erroGeral(raiz, 'Não foi possível salvar. Tente novamente.'); return; }
    fecharModal();
    toast(tarefa ? 'Tarefa atualizada ✓' : 'Tarefa criada ✓');
    aoSalvar();
  });
}

/* ════════════════════════════════════════════════════════════════
   B5 — T-07 METAS (F-14)
   ════════════════════════════════════════════════════════════════ */

async function telaMetas() {
  elView.innerHTML = `<h1>Metas</h1><div class="skeleton skeleton-card"></div><div class="skeleton skeleton-card"></div>`;
  let metas, areas, vereditos, relatorios;
  try {
    [metas, areas, vereditos, relatorios] = await Promise.all([
      qMetas(), qAreas(),
      obter(sb.from('vereditos').select('*')),
      obter(sb.from('relatorios').select('*'))
    ]);
    _metasCache = metas;
  } catch (e) { return renderErro('Metas', telaMetas); }

  const mapAreas = indexar(areas);
  const mapRel = indexar(relatorios);
  const ultimoVeredito = new Map();
  vereditos.forEach((v) => {
    const rel = mapRel.get(v.relatorio_id);
    if (!rel) return;
    const atual = ultimoVeredito.get(v.meta_id);
    if (!atual || rel.semana_inicio > atual.semana) {
      ultimoVeredito.set(v.meta_id, { semana: rel.semana_inicio, veredito: v.veredito });
    }
  });
  const ROTULO_VEREDITO = { no_caminho: '🟢 no caminho', em_risco: '🟡 em risco', fora_da_rota: '🔴 fora da rota' };

  elView.innerHTML = `
    <div class="tela-cab">
      <h1>Metas</h1>
      <button class="btn btn-primario" id="meta-nova">+ Meta</button>
    </div>
    ${metas.length === 0
      ? `<div class="estado-vazio"><p>Nenhuma meta. Criar →</p></div>`
      : metas.map((m) => {
        const a = mapAreas.get(m.area_id);
        const uv = ultimoVeredito.get(m.id);
        return `<button class="card cartao-meta" data-meta="${m.id}" style="display:block;width:100%;text-align:left;margin-bottom:8px;">
          <strong>${esc(m.titulo)}</strong>
          <span class="meta-texto"><span class="dot" style="background:${a ? a.cor : 'var(--borda)'}"></span>${esc(a ? a.nome : '—')}
            · prazo ${fmtData(m.prazo)} · ${STATUS_META_LABEL[m.status]}
            · último veredito: ${uv ? ROTULO_VEREDITO[uv.veredito] : '—'}</span>
          <p class="meta-texto">${esc(m.resultado_esperado)}</p>
        </button>`;
      }).join('')}`;

  $('#meta-nova').addEventListener('click', () => abrirFormMeta(null, telaMetas));
  $$('[data-meta]').forEach((b) => b.addEventListener('click', () => {
    const m = metas.find((x) => x.id === b.dataset.meta);
    abrirFolhaMeta(m, telaMetas);
  }));
}

function abrirFolhaMeta(m, recarregar) {
  const ativa = m.status === 'ativa';
  const raiz = abrirModal(`
    <h2 class="modal-titulo">${esc(m.titulo)}</h2>
    <p class="meta-texto">${STATUS_META_LABEL[m.status]} · prazo ${fmtData(m.prazo)}</p>
    <div class="erro-inline hidden" data-erro-geral></div>
    <div class="modal-acoes">
      <button class="btn" data-m="editar">Editar</button>
      ${ativa ? `<button class="btn" data-m="concluir">Marcar concluída</button>
                 <button class="btn" data-m="abandonar">Abandonar</button>` : ''}
      <button class="btn" data-m="excluir">Excluir</button>
      <button class="btn btn-fantasma" data-m="fechar">Fechar</button>
    </div>`);
  $('[data-m=fechar]', raiz).addEventListener('click', fecharModal);
  $('[data-m=editar]', raiz).addEventListener('click', () => abrirFormMeta(m, recarregar));
  async function mudarStatus(status) {
    const { error } = await sb.from('metas').update({ status }).eq('id', m.id);
    if (error) { erroGeral(raiz, 'Não foi possível salvar.'); return; }
    fecharModal();
    toast('Meta atualizada ✓');
    recarregar();
  }
  const elC = $('[data-m=concluir]', raiz);
  if (elC) elC.addEventListener('click', () => mudarStatus('concluida'));
  const elA = $('[data-m=abandonar]', raiz);
  if (elA) elA.addEventListener('click', () => mudarStatus('abandonada'));
  $('[data-m=excluir]', raiz).addEventListener('click', () => {
    modalConfirmar(`Excluir a meta “${esc(m.titulo)}”?`, 'Excluir', 'Cancelar', async () => {
      const { error } = await sb.from('metas').delete().eq('id', m.id);
      if (error) { modalInfo('Não foi possível excluir: desvincule esta meta dos projetos antes.'); return; }
      toast('Meta excluída ✓');
      recarregar();
    });
  });
}

async function abrirFormMeta(meta, aoSalvar) {
  let areas;
  try { areas = await qAreas(); } catch (e) { modalInfo('Não foi possível carregar as áreas.'); return; }
  const ativas = areas.filter((a) => !a.arquivada);
  const raiz = abrirModal(`
    <h2 class="modal-titulo">${meta ? 'Editar meta' : 'Nova meta'}</h2>
    <div class="campo">
      <label>Título</label>
      <input type="text" data-f="titulo" value="${esc(meta ? meta.titulo : '')}">
      <div class="erro-inline hidden" data-erro-titulo>Informe o título</div>
    </div>
    <div class="campo">
      <label>Área</label>
      <select data-f="area">${ativas.map((a) =>
        `<option value="${a.id}"${meta && meta.area_id === a.id ? ' selected' : ''}>${esc(a.nome)}</option>`).join('')}</select>
    </div>
    <div class="campo">
      <label>Prazo (opcional)</label>
      <input type="date" data-f="prazo" value="${meta && meta.prazo ? meta.prazo : ''}">
    </div>
    <div class="campo">
      <label>Resultado esperado</label>
      <textarea data-f="resultado">${esc(meta ? meta.resultado_esperado : '')}</textarea>
      <div class="erro-inline hidden" data-erro-resultado>Descreva o resultado esperado</div>
    </div>
    <div class="erro-inline hidden" data-erro-geral></div>
    <div class="modal-acoes">
      <button class="btn" data-m="cancelar">Cancelar</button>
      <button class="btn btn-primario" data-m="salvar">Salvar</button>
    </div>`);
  $('[data-m=cancelar]', raiz).addEventListener('click', fecharModal);
  $('[data-m=salvar]', raiz).addEventListener('click', async () => {
    const titulo = $('[data-f=titulo]', raiz).value.trim();
    const resultado = $('[data-f=resultado]', raiz).value.trim();
    let ok = true;
    const eT = $('[data-erro-titulo]', raiz);
    const eR = $('[data-erro-resultado]', raiz);
    if (!titulo) { eT.classList.remove('hidden'); ok = false; } else eT.classList.add('hidden');
    if (!resultado) { eR.classList.remove('hidden'); ok = false; } else eR.classList.add('hidden');
    if (!ok) return;
    const registro = {
      titulo,
      area_id: $('[data-f=area]', raiz).value,
      prazo: $('[data-f=prazo]', raiz).value || null,
      resultado_esperado: resultado
    };
    const op = meta
      ? sb.from('metas').update(registro).eq('id', meta.id)
      : sb.from('metas').insert(registro);
    const { error } = await op;
    if (error) { erroGeral(raiz, 'Não foi possível salvar. Tente novamente.'); return; }
    fecharModal();
    toast(meta ? 'Meta atualizada ✓' : 'Meta criada ✓');
    aoSalvar();
  });
}

/* ════════════════════════════════════════════════════════════════
   B6 — FILA DO DIA (RN-09) · T-02 AGORA (F-08/F-09) · T-03 HOJE
   ════════════════════════════════════════════════════════════════ */

async function carregarContextoDia() {
  const hoje = hojeISO();
  const amanha = addDiasISO(hoje, 1);
  const [areas, projetos, tarefas, alocs, planos] = await Promise.all([
    qAreas(), qProjetos(), qTarefasAbertas(),
    obter(sb.from('alocacoes').select('*').eq('data', hoje)),
    obter(sb.from('planejamentos').select('data').in('data', [hoje, amanha]))
  ]);
  enriquecer(tarefas, projetos, areas);
  const fila = aplicarPulos(comporFila(tarefas, alocs, hoje, blocoAtual()));
  return {
    hoje, amanha, areas, projetos, tarefas, alocs, fila,
    travadoHoje: planos.some((p) => p.data === hoje),
    planejadoAmanha: planos.some((p) => p.data === amanha)
  };
}

function htmlBadgePlanejamento(ctx) {
  return ctx.planejadoAmanha
    ? '<span class="badge badge-ok">amanhã planejado ✓</span>'
    : '<span class="badge badge-pendente">amanhã pendente</span>';
}

async function telaAgora() {
  elView.innerHTML = `<h1>Agora</h1><div class="skeleton skeleton-card" style="height:220px"></div>`;
  let ctx;
  try { ctx = await carregarContextoDia(); }
  catch (e) { return renderErro('Agora', telaAgora); }
  desenharAgora(ctx);
}

function desenharAgora(ctx) {
  if (ctx.fila.length === 0) {
    const nadaPlanejado = ctx.alocs.length === 0 && !ctx.travadoHoje;
    elView.innerHTML = `
      <div class="tela-cab"><h1>Agora</h1>${htmlBadgePlanejamento(ctx)}</div>
      <div class="estado-vazio">
        <p>${nadaPlanejado ? 'Nada planejado para hoje' : 'Dia cumprido. 🎯'}</p>
        <button class="btn btn-primario" data-ir-ritual>${nadaPlanejado ? 'Planejar agora' : 'Planejar amanhã'}</button>
      </div>`;
    $('[data-ir-ritual]').addEventListener('click', () => { location.hash = '#/ritual'; });
    return;
  }

  const t = ctx.fila[0];
  const cor = t._area ? t._area.cor : 'var(--borda)';
  elView.innerHTML = `
    <div class="tela-cab"><h1>Agora</h1>${htmlBadgePlanejamento(ctx)}</div>
    <div id="agora-erro"></div>
    <div class="card card-elevado agora-card" style="border-left-color:${cor}">
      <p class="meta-texto">
        <span class="dot" style="background:${cor}"></span>${esc(t._proj ? t._proj.nome : '—')} · ${esc(t._area ? t._area.nome : '—')}
      </p>
      <h2 style="margin:8px 0 12px;">${esc(t.titulo)}</h2>
      <p>
        <span class="badge badge-q">${t.quadrante}</span>
        <span class="badge">score ${t._score}</span>
        <span class="badge">${fmtMin(t.estimativa_min)}</span>
        ${t.pin_data === ctx.hoje ? '<span class="badge">📌 fixada</span>' : ''}
        ${t._vencida ? '<span class="badge badge-atrasada">atrasada</span>' : ''}
      </p>
      <div class="agora-acoes">
        <button class="btn" data-ag="pular">Pular</button>
        <button class="btn btn-sucesso" data-ag="concluir">Concluir</button>
      </div>
    </div>
    <p style="margin-top:16px;"><button class="btn btn-fantasma" data-ag="fila">ver fila de hoje →</button></p>`;

  $('[data-ag=fila]').addEventListener('click', () => { location.hash = '#/hoje'; });

  /* Pular: fim da fila de hoje, mantém alocação (RN-10) */
  $('[data-ag=pular]').addEventListener('click', () => {
    registrarPulo(t.id);
    ctx.fila.push(ctx.fila.shift());
    desenharAgora(ctx);
  });

  /* Concluir: UI otimista (J2) — toast, próxima aparece; gravação em segundo plano */
  $('[data-ag=concluir]').addEventListener('click', () => {
    ctx.fila.shift();
    toast('Concluída ✓');
    desenharAgora(ctx);
    concluirTarefa(t, telaAgora).catch(() => {
      ctx.fila.unshift(t);
      desenharAgora(ctx);
      const elErro = $('#agora-erro');
      if (elErro) {
        elErro.innerHTML = `<div class="estado-erro"><p>Sem conexão — a conclusão não foi gravada.</p>
          <button class="btn" data-acao="retry">Tentar novamente</button></div>`;
        $('[data-acao=retry]', elErro).addEventListener('click', () => telaAgora());
      }
    });
  });
}

/* T-03 — HOJE: fila do dia agrupada por bloco; folha de detalhe */
async function telaHoje() {
  elView.innerHTML = `<h1>Hoje</h1><div class="skeleton skeleton-linha"></div><div class="skeleton skeleton-linha"></div><div class="skeleton skeleton-linha"></div>`;
  let ctx;
  try { ctx = await carregarContextoDia(); }
  catch (e) { return renderErro('Hoje', telaHoje); }

  const mapTarefas = indexar(ctx.tarefas);
  const porBloco = { manha: [], tarde: [], noite: [] };
  ctx.alocs.forEach((al) => {
    const t = mapTarefas.get(al.tarefa_id);
    if (t) porBloco[al.bloco].push({ tarefa: t, aloc: al });
  });
  Object.values(porBloco).forEach((lista) => lista.sort((x, y) => cmpTarefas(x.tarefa, y.tarefa)));
  const pinsSemAloc = ctx.tarefas
    .filter((t) => t.pin_data === ctx.hoje && !ctx.alocs.some((al) => al.tarefa_id === t.id))
    .sort((a, b) => (a.pin_ordem || 0) - (b.pin_ordem || 0));

  const total = ctx.alocs.filter((al) => mapTarefas.has(al.tarefa_id)).length + pinsSemAloc.length;

  function htmlItem(t, aloc) {
    return `<button class="linha-tarefa${t._vencida ? ' atrasada' : ''}" data-item="${t.id}" data-aloc="${aloc ? aloc.id : ''}">
      <span class="dot" style="background:${t._area ? t._area.cor : 'var(--borda)'}"></span>
      <span class="linha-flex">
        <span class="titulo-trunc">${esc(t.titulo)}</span>
        <span class="meta-texto">score ${t._score} · ${t.quadrante} · ${fmtMin(t.estimativa_min)}${t.pin_data === ctx.hoje ? ' · 📌' : ''}</span>
      </span>
      ${t._vencida ? '<span class="badge badge-atrasada">atrasada</span>' : ''}
    </button>`;
  }

  if (total === 0) {
    elView.innerHTML = `<h1>Hoje</h1>
      <div class="estado-vazio"><p>Nenhuma tarefa para hoje. Planejar agora →</p>
      <button class="btn btn-primario" data-ir-ritual>Planejar agora</button></div>`;
    $('[data-ir-ritual]').addEventListener('click', () => { location.hash = '#/ritual'; });
    return;
  }

  elView.innerHTML = `
    <h1>Hoje</h1>
    ${pinsSemAloc.length ? `<div class="grupo-bloco"><h2>📌 Fixadas</h2>${pinsSemAloc.map((t) => htmlItem(t, null)).join('')}</div>` : ''}
    ${['manha', 'tarde', 'noite'].map((b) => porBloco[b].length
      ? `<div class="grupo-bloco"><h2>${BLOCO_LABEL[b]}${b === blocoAtual() ? ' · agora' : ''}</h2>
          ${porBloco[b].map((x) => htmlItem(x.tarefa, x.aloc)).join('')}</div>` : '').join('')}`;

  $$('[data-item]').forEach((el) => el.addEventListener('click', () => {
    const t = mapTarefas.get(el.dataset.item);
    const aloc = ctx.alocs.find((a) => a.id === el.dataset.aloc) || null;
    abrirFolhaHoje(t, aloc, ctx, telaHoje);
  }));
}

/* Folha de detalhe do Hoje: editar, concluir, realocar (T-03) */
function abrirFolhaHoje(t, aloc, ctx, recarregar) {
  const raiz = abrirModal(`
    <h2 class="modal-titulo">${esc(t.titulo)}</h2>
    <p class="meta-texto">${esc(t._proj ? t._proj.nome : '—')} · score ${t._score} · ${t.quadrante} · ${fmtMin(t.estimativa_min)} · prazo ${fmtData(t.prazo)}</p>
    ${aloc ? `
    <div class="campo">
      <label>Realocar para</label>
      <div style="display:flex; gap:8px; flex-wrap:wrap;">
        <input type="date" data-f="re-data" value="${aloc.data}" style="flex:1; min-width:140px;">
        <select data-f="re-bloco" style="flex:1; min-width:120px;">
          ${['manha', 'tarde', 'noite'].map((b) =>
            `<option value="${b}"${aloc.bloco === b ? ' selected' : ''}>${BLOCO_LABEL[b]}</option>`).join('')}
        </select>
        <button class="btn" data-m="realocar">Realocar</button>
      </div>
    </div>` : ''}
    <div class="erro-inline hidden" data-erro-geral></div>
    <div class="modal-acoes">
      <button class="btn" data-m="editar">Editar</button>
      <button class="btn btn-sucesso" data-m="concluir">Concluir</button>
      <button class="btn btn-fantasma" data-m="fechar">Fechar</button>
    </div>`);

  $('[data-m=fechar]', raiz).addEventListener('click', fecharModal);
  $('[data-m=editar]', raiz).addEventListener('click', () =>
    abrirFormTarefa(t._proj, !!(t._area && t._area.profissional), t, recarregar));
  $('[data-m=concluir]', raiz).addEventListener('click', async () => {
    try {
      fecharModal();
      await concluirTarefa(t, recarregar);
      toast('Concluída ✓');
      recarregar();
    } catch (e) { modalInfo('Sem conexão — não foi possível concluir agora. Tente novamente.'); }
  });
  const elRe = $('[data-m=realocar]', raiz);
  if (elRe) elRe.addEventListener('click', async () => {
    const data = $('[data-f=re-data]', raiz).value;
    const bloco = $('[data-f=re-bloco]', raiz).value;
    if (!data) { erroGeral(raiz, 'Informe a data.'); return; }
    const { error } = await sb.from('alocacoes').update({ data, bloco }).eq('id', aloc.id);
    if (error) { erroGeral(raiz, 'Não foi possível realocar (talvez já exista alocação nesse bloco).'); return; }
    fecharModal();
    toast('Tarefa realocada ✓');
    recarregar();
  });
}

/* ════════════════════════════════════════════════════════════════
   B6 — CRIAÇÃO RÁPIDA "+" GLOBAL (RN-10)
   título + estimativa + projeto + quadrante (+ impacto/esforço se
   profissional) + toggle "fazer hoje" → alocação (hoje, bloco atual)
   ════════════════════════════════════════════════════════════════ */

async function abrirCriacaoRapida() {
  let areas, projetos;
  try { [areas, projetos] = await Promise.all([qAreas(), qProjetos()]); }
  catch (e) { modalInfo('Sem conexão — tente novamente.'); return; }
  const ativos = projetos.filter((p) => p.status === 'ativo');
  if (ativos.length === 0) {
    modalInfo('Crie um projeto primeiro no Panorama.');
    return;
  }
  const mapAreas = indexar(areas);
  const ehProf = (pid) => {
    const p = ativos.find((x) => x.id === pid);
    const a = p ? mapAreas.get(p.area_id) : null;
    return !!(a && a.profissional);
  };

  const raiz = abrirModal(`
    <h2 class="modal-titulo">Criação rápida</h2>
    <div class="campo">
      <label>Projeto</label>
      <select data-f="projeto">${ativos.map((p) =>
        `<option value="${p.id}">${esc(p.nome)}</option>`).join('')}</select>
    </div>
    <div id="cr-form">${htmlFormTarefa(null, ehProf(ativos[0].id))}</div>
    <label class="toggle-linha">
      <span>Fazer hoje</span>
      <input type="checkbox" data-f="fazer-hoje">
    </label>
    <div class="modal-acoes">
      <button class="btn" data-m="cancelar">Cancelar</button>
      <button class="btn btn-primario" data-m="salvar">Salvar</button>
    </div>`);

  ligarEstimativa($('#cr-form', raiz));
  $('[data-f=projeto]', raiz).addEventListener('change', (ev) => {
    $('#cr-form', raiz).innerHTML = htmlFormTarefa(null, ehProf(ev.target.value));
    ligarEstimativa($('#cr-form', raiz));
  });
  $('[data-m=cancelar]', raiz).addEventListener('click', fecharModal);
  $('[data-m=salvar]', raiz).addEventListener('click', async () => {
    const pid = $('[data-f=projeto]', raiz).value;
    const form = $('#cr-form', raiz);
    const dados = lerFormTarefa(form, ehProf(pid));
    if (!dados) return;
    const fazerHoje = $('[data-f=fazer-hoje]', raiz).checked;
    const { data: criadas, error } = await sb.from('tarefas')
      .insert({ ...dados, projeto_id: pid }).select();
    if (error || !criadas || !criadas[0]) { erroGeral(form, 'Não foi possível salvar. Tente novamente.'); return; }
    if (fazerHoje) {
      /* RN-10: alocação (hoje, bloco atual) → entra na fila imediatamente */
      const { error: e2 } = await sb.from('alocacoes')
        .insert({ tarefa_id: criadas[0].id, data: hojeISO(), bloco: blocoAtual() });
      if (e2) { erroGeral(form, 'Tarefa criada, mas a alocação de hoje falhou. Aloque pela tela Hoje.'); return; }
    }
    fecharModal();
    toast('Tarefa criada ✓');
    navegar();
  });
}

/* ════════════════════════════════════════════════════════════════
   TELAS DA FASE 3 (B7–B9) — entregues nos blocos seguintes
   ════════════════════════════════════════════════════════════════ */

function telaPendente(titulo, bloco) {
  elView.innerHTML = `<h1>${titulo}</h1>
    <div class="estado-vazio"><p>Esta tela é entregue no bloco ${bloco} do plano de implementação (seção 23).</p></div>`;
}
function telaSemana() { telaPendente('Semana', 'B8'); }
function telaRelatorio() { telaPendente('Relatório', 'B9'); }
function telaRitual() { telaPendente('Planejar Amanhã', 'B7'); }

/* ════════════════════════════════════════════════════════════════
   SHELL E INICIALIZAÇÃO
   ════════════════════════════════════════════════════════════════ */

function fecharMais() {
  elMaisMenu.classList.add('hidden');
  $('#btn-mais').setAttribute('aria-expanded', 'false');
}

function ligarShell() {
  $$('[data-rota]').forEach((b) =>
    b.addEventListener('click', () => { location.hash = b.dataset.rota; }));

  $('#btn-mais').addEventListener('click', (ev) => {
    ev.stopPropagation();
    const aberto = !elMaisMenu.classList.contains('hidden');
    elMaisMenu.classList.toggle('hidden', aberto);
    $('#btn-mais').setAttribute('aria-expanded', String(!aberto));
  });

  document.addEventListener('click', (ev) => {
    if (!elMaisMenu.contains(ev.target) && ev.target.id !== 'btn-mais') fecharMais();
  });

  $('#btn-sair').addEventListener('click', async () => {
    await sb.auth.signOut();
    estado.sessao = null;
    location.hash = '#/login';
  });

  elFab.addEventListener('click', abrirCriacaoRapida);
}

async function iniciar() {
  ligarShell();
  const { data } = await sb.auth.getSession();
  estado.sessao = data.session || null;

  sb.auth.onAuthStateChange((_evento, sessao) => {
    const tinha = !!estado.sessao;
    estado.sessao = sessao || null;
    if (tinha && !sessao) location.hash = '#/login';
  });

  window.addEventListener('hashchange', navegar);
  navegar();
}

iniciar();
