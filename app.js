/* ════════════════════════════════════════════════════════════════
   Visão e Funcionamento — app.js
   SPA em arquivo único com hash-routing (DEC-014).
   Fase 4 do plano (seção 23): B10 fila de reenvio (seção 16/J4) +
   DEC-025 (SW network-first) · B11 checklist — app completo (B1–B11).
   Pós-entrega · Bloco 1: DEC-026 (fim do seed de dados — wizard com
   criação livre; painel nasce zerado e é preenchido pelo usuário).
   Pós-entrega · Bloco 2: DEC-028 subtarefas (checklist na folha e no
   Agora) · DEC-029 compras extras por projeto · DEC-030 templates
   (T-11, materialização com sequência) · RN-12 sequência por projeto
   (gate de elegibilidade na fila do Agora e na fila sugerida).
   Pós-entrega · Bloco 3: DEC-027 Copiloto IA (score decide, IA explica
   — botão no Agora, modal, payload com fila ordenada, /api/copiloto).
   Pós-entrega · Bloco 4: reestruturação desktop (sidebar + Visão Geral
   como casa: KPIs, Agora-widget, Hoje-painel, projetos c/ progresso,
   matriz, urgentes, compras consolidadas) + DEC-031 histórico do
   Copiloto + tela Áreas. Mobile preserva bottom-nav (CSS responsivo).
   ════════════════════════════════════════════════════════════════ */

'use strict';

/* ─── Configuração ───────────────────────────────────────────── */
const SUPABASE_URL = 'https://kzngniipufuiizaxewjb.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_v0U6a3FJGzqOGwrvtt7fZg_Lk_cqAOH';

/* F-18/J1 (DEC-026): o wizard só aparece se não existir nenhum projeto. */

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

/* ─── Estado global ─── */
const estado = {
  sessao: null,
  pulos: { data: null, ids: [] },   // RN-10: Pular = fim da fila de hoje (sessão)
  acordeao: null,                    // áreas abertas no Panorama
  avisoLogin: null,                  // seção 16: aviso exibido em T-01 (sessão expirada)
  selRitual: null,                   // T-09: tarefa selecionada (toque-toque, DEC-019)
  selSemana: null,                   // T-04: alocação selecionada (toque-toque, DEC-019)
  realceSemana: null                 // T-04: célula destino a realçar após realocar
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

/* RN-07: semana = segunda 00:00 a domingo 23:59 (America/Sao_Paulo) */
function diaSemanaISO(iso) { return new Date(iso + 'T12:00:00Z').getUTCDay(); }  /* 0=domingo */
function segundaDaSemana(iso) {
  const d = diaSemanaISO(iso);
  return addDiasISO(iso, d === 0 ? -6 : 1 - d);
}
/* Data (YYYY-MM-DD) de um timestamptz, no fuso America/Sao_Paulo (RN-11) */
function dataSP(ts) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(ts));
}
const DIAS_SEMANA_LABEL = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

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

/* RN-12 (DEC-030): sequência opcional por projeto. Tarefa aberta com
   sequência fica bloqueada enquanto existir tarefa aberta de sequência
   menor no mesmo projeto. Sem sequência = sempre elegível.
   Importância decide o quê; sequência decide quando pode. */
function marcarBloqueadas(tarefas) {
  const minSeq = new Map();
  tarefas.forEach((t) => {
    if (t.status !== 'aberta' || t.sequencia == null) return;
    const m = minSeq.get(t.projeto_id);
    if (m === undefined || t.sequencia < m) minSeq.set(t.projeto_id, t.sequencia);
  });
  tarefas.forEach((t) => {
    t._bloqueada = t.status === 'aberta' && t.sequencia != null &&
      t.sequencia > (minSeq.has(t.projeto_id) ? minSeq.get(t.projeto_id) : t.sequencia);
  });
  return tarefas;
}
function filtrarElegiveis(tarefas) { return tarefas.filter((t) => !t._bloqueada); }

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
function fmtDataHora(ts) {
  if (!ts) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
  }).format(new Date(ts));
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
/* DEC-028/029/030 */
const qSubtarefas = (tarefaIds) => tarefaIds.length
  ? obter(sb.from('subtarefas').select('*').in('tarefa_id', tarefaIds).order('ordem'))
  : Promise.resolve([]);
const qCompras = (projetoId) => obter(sb.from('compras').select('*').eq('projeto_id', projetoId).order('created_at'));
const qTemplates = () => obter(sb.from('templates').select('*').order('created_at'));
/* DEC-031 (Bloco 4): histórico de sugestões do Copiloto */
const qSugestoes = (n) => obter(sb.from('copiloto_sugestoes').select('*')
  .order('created_at', { ascending: false }).limit(n));

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
  marcarBloqueadas(tarefas);              /* RN-12 */
  return tarefas;
}

/* Concluir tarefa — gravação: status, concluida_em, limpa pin (11.1) */
async function gravarConclusao(t) {
  const { error } = await sb.from('tarefas')
    .update({ status: 'concluida', concluida_em: new Date().toISOString(), pin_data: null, pin_ordem: null })
    .eq('id', t.id);
  if (error) throw error;
}

/* RN-08: ao concluir a última tarefa aberta, pergunta pelo projeto.
   Não-crítico: se a verificação falhar (offline), segue em silêncio —
   o projeto permanece ativo e pode ser concluído manualmente em T-06. */
async function verificarConclusaoProjeto(t, aoAtualizar) {
  try {
    const abertas = await obter(sb.from('tarefas').select('id')
      .eq('projeto_id', t.projeto_id).eq('status', 'aberta'));
    if (abertas.length !== 0) return;
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
  } catch (e) { /* silencioso por design (seção 16) */ }
}

/* ════════════════════════════════════════════════════════════════
   B10 — FILA DE REENVIO EM MEMÓRIA (seção 16 / J4 — CT-12, CT-13, PI-021)
   Guarda SOMENTE conclusões. O replay altera SOMENTE `status` e
   `concluida_em` — nunca outros campos (last-write-wins, CT-13).
   A fila vive em memória: fechar o app descarta a ação pendente —
   perda explícita, nunca silenciosa (o aviso inline deixa isso claro).
   ════════════════════════════════════════════════════════════════ */

const filaReenvio = [];   /* itens: { tarefaId, concluidaEm } */
let reenviando = false;

function comTimeout(promessa, ms) {
  return Promise.race([
    promessa,
    new Promise((_resolve, rejeitar) => setTimeout(() => rejeitar(new Error('timeout')), ms))
  ]);
}

function ehErroSessao(e) {
  const msg = String((e && e.message) || '');
  return !!(e && (e.status === 401 || e.code === 'PGRST301')) || /jwt|token|expired/i.test(msg);
}

/* J4: tenta gravar em até 5s. Sucesso → true. Sessão expirada →
   preserva a ação na fila e redireciona ao login com aviso (seção 16).
   Sem conexão → entra na fila de reenvio. */
async function concluirComReenvio(t) {
  try {
    await comTimeout(gravarConclusao(t), 5000);
    return true;
  } catch (e) {
    filaReenvio.push({ tarefaId: t.id, concluidaEm: new Date().toISOString() });
    if (ehErroSessao(e)) {
      estado.avisoLogin = 'Sessão expirada — entre novamente para reenviar a conclusão pendente.';
      location.hash = '#/login';
    }
    return false;
  }
}

/* Replay ao reconectar (evento 'online'), ao restaurar sessão ou
   pelo botão "Tentar novamente" do aviso inline. */
async function reenviarFila() {
  if (reenviando || filaReenvio.length === 0 || !estado.sessao) return;
  reenviando = true;
  let falhou = false;
  while (filaReenvio.length > 0 && !falhou) {
    const item = filaReenvio[0];
    try {
      const { error } = await comTimeout(
        sb.from('tarefas')
          .update({ status: 'concluida', concluida_em: item.concluidaEm })  /* SOMENTE estes campos (J4) */
          .eq('id', item.tarefaId),
        5000);
      if (error) throw error;
      filaReenvio.shift();
    } catch (e) {
      falhou = true;
      if (ehErroSessao(e)) {
        estado.avisoLogin = 'Sessão expirada — entre novamente para reenviar a conclusão pendente.';
        location.hash = '#/login';
      }
    }
  }
  reenviando = false;
  if (!falhou && filaReenvio.length === 0) {
    const aviso = $('#aviso-reenvio');
    if (aviso) aviso.remove();
    toast('Conclusão reenviada ✓');
  }
}

/* Aviso inline + retry (seção 10: erro de rede = inline + retry) */
function mostrarAvisoReenvio() {
  if (filaReenvio.length === 0) return;
  let el = $('#aviso-reenvio');
  if (!el) {
    el = document.createElement('div');
    el.id = 'aviso-reenvio';
    el.className = 'estado-erro';
    elView.prepend(el);
  }
  el.innerHTML = `<p>Sem conexão — sua conclusão será reenviada ao reconectar.
      Fechar o app descarta a ação pendente.</p>
    <button class="btn" data-acao="reenviar">Tentar novamente</button>`;
  $('[data-acao=reenviar]', el).addEventListener('click', reenviarFila);
}

/* ════════════════════════════════════════════════════════════════
   ROTEADOR — hash-routing (DEC-014) + guard de sessão
   ════════════════════════════════════════════════════════════════ */

const ROTAS = [
  { padrao: /^#\/login$/, tela: telaLogin, publica: true, nav: null },
  { padrao: /^#\/visao$/, tela: telaVisao, nav: '#/visao' },
  { padrao: /^#\/agora$/, tela: telaAgora, nav: '#/agora' },
  { padrao: /^#\/hoje$/, tela: telaHoje, nav: '#/hoje' },
  { padrao: /^#\/semana$/, tela: telaSemana, nav: '#/semana' },
  { padrao: /^#\/areas$/, tela: telaAreas, nav: '#/areas' },
  { padrao: /^#\/panorama$/, tela: telaPanorama, nav: '#/panorama' },
  { padrao: /^#\/projeto\/([0-9a-f-]+)$/, tela: telaProjeto, nav: '#/panorama' },
  { padrao: /^#\/metas$/, tela: telaMetas, nav: '#/metas' },
  { padrao: /^#\/templates$/, tela: telaTemplates, nav: '#/templates' },
  { padrao: /^#\/relatorio$/, tela: telaRelatorio, nav: '#/relatorio' },
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
  elView.classList.toggle('view-larga', hash === '#/visao');   /* dashboard usa a largura toda */
  marcarNavAtiva(rota.nav);

  const params = hash.match(rota.padrao);
  await rota.tela(params ? params.slice(1) : []);
  elView.focus({ preventScroll: true });
}

function marcarNavAtiva(navHash) {
  $$('.nav-item[data-rota]').forEach((b) => b.classList.toggle('ativa', b.dataset.rota === navHash));
}

/* J1/F-18 (DEC-026) + Bloco 4: no desktop a casa é a Visão Geral;
   no mobile permanece o Agora (emendas v1.1, pendências de UX). */
function ehDesktop() { return window.matchMedia('(min-width: 768px)').matches; }

async function destinoInicial() {
  try {
    const projetos = await obter(sb.from('projetos').select('id'));
    if (projetos.length === 0) return '#/wizard';
    return ehDesktop() ? '#/visao' : '#/agora';
  } catch (e) {
    return ehDesktop() ? '#/visao' : '#/agora';
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

  /* Seção 16: sessão expirada no meio de ação → aviso; a ação ficou
     preservada na fila e é reexecutada após o login. */
  if (estado.avisoLogin) {
    const e = $('#login-erro');
    e.textContent = estado.avisoLogin;
    e.classList.remove('hidden');
    estado.avisoLogin = null;
  }

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
    <div class="campo">
      <label>Sequência no projeto (opcional)</label>
      <input type="number" min="1" step="1" inputmode="numeric" data-f="sequencia"
        value="${t.sequencia != null ? t.sequencia : ''}" placeholder="ex.: 1, 2, 3…">
      <p class="meta-texto">RN-12: só entra na fila quando as de número menor estiverem concluídas.</p>
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
    prazo: $('[data-f=prazo]', raiz).value || null,
    sequencia: (() => { const v = $('[data-f=sequencia]', raiz).value.trim(); return v === '' ? null : Math.max(1, Math.floor(Number(v)) || 1); })()
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
   BLOCO 4 — TELA ÁREAS (#/areas, sidebar desktop)
   Mesma capacidade do modal do Panorama, como página: o componente
   compartilhado de linhas de área (F-01) é reutilizado sem duplicação.
   ════════════════════════════════════════════════════════════════ */

async function telaAreas() {
  elView.innerHTML = `<h1>Áreas</h1><div class="skeleton skeleton-linha"></div><div class="skeleton skeleton-linha"></div><div class="skeleton skeleton-linha"></div>`;
  let areas, projetos;
  try { [areas, projetos] = await Promise.all([qAreas(), qProjetos()]); }
  catch (e) { return renderErro('Áreas', telaAreas); }

  elView.innerHTML = `
    <h1>Áreas</h1>
    <p class="meta-texto">As áreas organizam projetos e metas. Renomeie, mude a cor, marque como profissional (habilita impacto × esforço no score), reordene ou arquive.</p>
    <div class="card" id="areas-pagina">
      ${htmlLinhasAreas(areas)}
      ${htmlNovaArea()}
    </div>`;
  ligarLinhasAreas($('#areas-pagina'), areas, projetos, telaAreas);
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

/* Passo 2 (DEC-026) — criação livre de projetos: nome, área e prazo definidos pelo usuário */
async function wizardPasso2() {
  const [areas, projetos] = await Promise.all([qAreas(), qProjetos()]);
  const mapAreas = indexar(areas);
  const ativos = projetos.filter((p) => p.status === 'ativo');

  const lista = ativos.length === 0
    ? '<p class="meta-texto">Nenhum projeto ainda. Crie o primeiro — você define o nome, a área e o prazo.</p>'
    : ativos.map((p) => {
      const a = mapAreas.get(p.area_id);
      return `<div class="linha-area">
        <span class="titulo-trunc"><span class="dot" style="background:${a ? a.cor : 'var(--borda)'}"></span> <strong>${esc(p.nome)}</strong></span>
        <span class="meta-texto">${esc(a ? a.nome : '—')} · prazo ${fmtData(p.prazo)}</span>
      </div>`;
    }).join('');

  elView.innerHTML = `
    <h1>Primeira carga</h1>${htmlProgresso(2)}
    <h2>2 · Seus projetos ativos</h2>
    <p class="meta-texto">Crie os projetos que estão de pé hoje. Tudo é salvo na hora — você pode adicionar outros depois, pelo Panorama.</p>
    <div class="card" id="wiz-projetos">${lista}</div>
    <button class="btn btn-fantasma" id="wiz-add-projeto">+ Criar projeto</button>
    <div class="modal-acoes">
      <button class="btn" id="wiz-voltar">Voltar</button>
      <button class="btn btn-primario" id="wiz-continuar">Continuar</button>
    </div>`;

  $('#wiz-add-projeto').addEventListener('click', () => abrirFormProjeto(null, areas, null, telaWizard));
  $('#wiz-voltar').addEventListener('click', () => irPasso(1));
  $('#wiz-continuar').addEventListener('click', () => irPasso(3));
}

/* Passo 3 (DEC-026) — 1–5 tarefas por projeto ativo */
async function wizardPasso3() {
  const [areas, projetos, tarefas] = await Promise.all([qAreas(), qProjetos(), qTarefasAbertas()]);
  const alvo = projetos.filter((p) => p.status === 'ativo');
  const mapAreas = indexar(areas);

  const cartoes = alvo.length === 0
    ? '<p class="meta-texto">Nenhum projeto ativo — volte ao passo 2 para criar o primeiro, ou continue e crie tudo depois pelo Panorama.</p>'
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

/* Passo 4 (DEC-026) — metas definidas pelo usuário (opcional) */
async function wizardPasso4() {
  const [metas, areas] = await Promise.all([qMetas(), qAreas()]);
  const mapAreas = indexar(areas);
  elView.innerHTML = `
    <h1>Primeira carga</h1>${htmlProgresso(4)}
    <h2>4 · Suas metas</h2>
    <p class="meta-texto">Metas dão direção aos projetos — ex.: um resultado com prazo. Opcional: você pode criar agora ou depois, em Mais → Metas.</p>
    ${metas.length === 0 ? '<p class="meta-texto">Nenhuma meta ainda.</p>' : ''}
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
    location.hash = '#/agora';            /* CA-07 emendado (DEC-026): estados vazios guiam o preenchimento */
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
  let templates = [];
  if (!projeto) {                            /* DEC-030: só na criação */
    try { templates = (await qTemplates()).filter((tp) => tp.ativo && (tp.conteudo || []).length); }
    catch (e) { templates = []; }
  }
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
    ${templates.length ? `
    <div class="campo">
      <label>Criar a partir de template (opcional)</label>
      <select data-f="template">
        <option value="">— nenhum —</option>
        ${templates.map((tp) => `<option value="${tp.id}">${esc(tp.nome)} · ${(tp.conteudo || []).length} etapas</option>`).join('')}
      </select>
      <p class="meta-texto">As etapas viram tarefas numeradas (RN-12). Impacto e esforço você ajusta depois.</p>
    </div>` : ''}
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
    if (projeto) {
      const { error } = await sb.from('projetos').update(registro).eq('id', projeto.id);
      if (error) { erroGeral(raiz, 'Não foi possível salvar. Tente novamente.'); return; }
      fecharModal();
      toast('Projeto atualizado ✓');
      aoSalvar();
      return;
    }
    const { data: novo, error } = await sb.from('projetos').insert(registro).select().single();
    if (error || !novo) { erroGeral(raiz, 'Não foi possível salvar. Tente novamente.'); return; }
    const selTpl = $('[data-f=template]', raiz);
    const tpl = selTpl && selTpl.value ? templates.find((x) => x.id === selTpl.value) : null;
    if (tpl) {
      try { await materializarTemplate(novo.id, tpl.conteudo); }
      catch (e) {
        erroGeral(raiz, 'Projeto criado, mas houve falha ao gerar as tarefas do template. Abra o projeto e tente de novo, ou crie as tarefas manualmente.');
        toast('Projeto criado ✓');
        aoSalvar();
        return;
      }
    }
    fecharModal();
    toast(tpl ? `Projeto criado com ${tpl.conteudo.length} tarefas do template ✓` : 'Projeto criado ✓');
    aoSalvar();
  });
}

/* ════════════════════════════════════════════════════════════════
   B5 — T-06 PROJETO (F-02/F-03, RN-03/04/05/08)
   ════════════════════════════════════════════════════════════════ */

async function telaProjeto(params) {
  const id = params[0];
  elView.innerHTML = `<div class="skeleton skeleton-card"></div><div class="skeleton skeleton-linha"></div><div class="skeleton skeleton-linha"></div>`;
  let projeto, areas, metas, tarefas, subs, compras;
  try {
    const ps = await obter(sb.from('projetos').select('*').eq('id', id));
    projeto = ps[0];
    [areas, metas, tarefas, compras] = await Promise.all([qAreas(), qMetas(),
      obter(sb.from('tarefas').select('*').eq('projeto_id', id)),
      qCompras(id)]);
    subs = await qSubtarefas(tarefas.map((t) => t.id));
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
  /* No projeto, sequência manda na exibição (RN-12); sem sequência, ordem RN-01 */
  const abertas = tarefas.filter((t) => t.status === 'aberta').sort((a, b) => {
    if (a.sequencia != null || b.sequencia != null) {
      if (a.sequencia == null) return 1;
      if (b.sequencia == null) return -1;
      if (a.sequencia !== b.sequencia) return a.sequencia - b.sequencia;
    }
    return cmpTarefas(a, b);
  });
  const concluidas = tarefas.filter((t) => t.status === 'concluida')
    .sort((a, b) => (b.concluida_em || '') < (a.concluida_em || '') ? -1 : 1);
  const tempoRestante = abertas.reduce((s, t) => s + t.estimativa_min, 0);  /* RN-03 */
  const areaProf = !!(area && area.profissional);

  /* DEC-028: progresso x/n de subtarefas por tarefa */
  const subsPorTarefa = new Map();
  subs.forEach((s) => {
    if (!subsPorTarefa.has(s.tarefa_id)) subsPorTarefa.set(s.tarefa_id, []);
    subsPorTarefa.get(s.tarefa_id).push(s);
  });
  const comprasPend = compras.filter((c) => c.status === 'pendente');

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
    const meus = subsPorTarefa.get(t.id) || [];
    const feitos = meus.filter((s) => s.concluida).length;
    return `<button class="linha-tarefa${t._vencida && !concluida ? ' atrasada' : ''}${t._bloqueada ? ' bloqueada' : ''}" data-tarefa="${t.id}">
      <span class="linha-flex">
        <span class="titulo-trunc">${t.sequencia != null ? `<span class="seq-num">${t.sequencia}</span> ` : ''}${esc(t.titulo)}</span>
        <span class="meta-texto">${concluida
          ? `concluída em ${fmtData((t.concluida_em || '').slice(0, 10))}`
          : `score ${t._score} · ${t.quadrante} · ${fmtMin(t.estimativa_min)}${meus.length ? ` · passos ${feitos}/${meus.length}` : ''} · prazo ${fmtData(t.prazo)}`}</span>
      </span>
      ${!concluida && t._bloqueada ? '<span class="badge">⏸ aguarda anterior</span>' : ''}
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
      <div class="hidden" data-lista-concluidas>${concluidas.map((t) => htmlLinhaTarefa(t, true)).join('')}</div>` : ''}

    <div class="tela-cab" style="margin-top:24px;">
      <h2>Compras extras${comprasPend.length ? ` (${comprasPend.length} pendente${comprasPend.length > 1 ? 's' : ''})` : ''}</h2>
    </div>
    <div class="card" id="bloco-compras">
      ${compras.length === 0 ? '<p class="meta-texto">Nada a comprar ou assinar neste projeto.</p>'
        : compras.map((c) => `
        <div class="linha-area" data-compra="${c.id}">
          <label class="check-prof${c.status === 'comprado' ? ' sub-riscada' : ''}">
            <input type="checkbox" data-c-toggle ${c.status === 'comprado' ? 'checked' : ''}> ${esc(c.descricao)}
          </label>
          <span class="linha-acoes"><button class="btn btn-fantasma btn-mini" data-c-excluir aria-label="Excluir item">✕</button></span>
        </div>`).join('')}
      <div class="linha-area">
        <input type="text" id="compra-nova" placeholder="Item a comprar ou assinar…" aria-label="Novo item de compra">
        <button class="btn btn-mini" id="compra-add">Adicionar</button>
      </div>
    </div>`;

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
    abrirFolhaTarefaProjeto(t, projeto, areaProf, recarregar, subsPorTarefa.get(t.id) || []);
  }));

  /* DEC-029 — compras extras: alternar, excluir, adicionar */
  $$('[data-compra]').forEach((linha) => {
    const cid = linha.dataset.compra;
    const c = compras.find((x) => x.id === cid);
    $('[data-c-toggle]', linha).addEventListener('change', async (ev) => {
      const { error } = await sb.from('compras')
        .update({ status: ev.target.checked ? 'comprado' : 'pendente' }).eq('id', cid);
      if (error) { modalInfo('Não foi possível atualizar o item.'); return; }
      recarregar();
    });
    $('[data-c-excluir]', linha).addEventListener('click', () => {
      modalConfirmar(`Excluir o item “${esc(c.descricao)}”?`, 'Excluir', 'Cancelar', async () => {
        const { error } = await sb.from('compras').delete().eq('id', cid);
        if (error) { modalInfo('Não foi possível excluir o item.'); return; }
        toast('Item excluído ✓');
        recarregar();
      });
    });
  });
  async function adicionarCompra() {
    const inp = $('#compra-nova');
    const desc = inp.value.trim();
    if (!desc) { inp.focus(); return; }
    const { error } = await sb.from('compras').insert({ projeto_id: projeto.id, descricao: desc, status: 'pendente' });
    if (error) { modalInfo('Não foi possível adicionar o item.'); return; }
    toast('Item adicionado ✓');
    recarregar();
  }
  $('#compra-add').addEventListener('click', adicionarCompra);
  $('#compra-nova').addEventListener('keydown', (ev) => { if (ev.key === 'Enter') adicionarCompra(); });
}

/* ─── DEC-028: checklist de subtarefas (reutilizado na folha e no Agora) ─── */
function htmlChecklist(subs, idWrap) {
  return `<div id="${idWrap}">
    ${subs.length === 0 ? '<p class="meta-texto">Sem passo a passo. Adicione abaixo, se ajudar.</p>'
      : subs.map((s) => `
      <div class="linha-area" data-sub="${s.id}">
        <label class="check-prof${s.concluida ? ' sub-riscada' : ''}">
          <input type="checkbox" data-s-toggle ${s.concluida ? 'checked' : ''}> ${esc(s.titulo)}
        </label>
        <span class="linha-acoes"><button class="btn btn-fantasma btn-mini" data-s-excluir aria-label="Excluir passo">✕</button></span>
      </div>`).join('')}
    <div class="linha-area">
      <input type="text" data-s-nova placeholder="Novo passo…" aria-label="Novo passo">
      <button class="btn btn-mini" data-s-add>Adicionar</button>
    </div>
  </div>`;
}
function ligarChecklist(raiz, tarefaId, subs, aoMudar) {
  $$('[data-sub]', raiz).forEach((linha) => {
    const sid = linha.dataset.sub;
    $('[data-s-toggle]', linha).addEventListener('change', async (ev) => {
      const { error } = await sb.from('subtarefas').update({ concluida: ev.target.checked }).eq('id', sid);
      if (error) { modalInfo('Não foi possível atualizar o passo.'); return; }
      const s = subs.find((x) => x.id === sid);
      if (s) s.concluida = ev.target.checked;
      $('label', linha).classList.toggle('sub-riscada', ev.target.checked);
      if (aoMudar) aoMudar();
    });
    $('[data-s-excluir]', linha).addEventListener('click', async () => {
      const { error } = await sb.from('subtarefas').delete().eq('id', sid);
      if (error) { modalInfo('Não foi possível excluir o passo.'); return; }
      const i = subs.findIndex((x) => x.id === sid);
      if (i >= 0) subs.splice(i, 1);
      linha.remove();
      if (aoMudar) aoMudar();
    });
  });
  async function add() {
    const inp = $('[data-s-nova]', raiz);
    const titulo = inp.value.trim();
    if (!titulo) { inp.focus(); return; }
    const ordem = subs.length ? Math.max(...subs.map((s) => s.ordem || 0)) + 1 : 1;
    const { data, error } = await sb.from('subtarefas')
      .insert({ tarefa_id: tarefaId, titulo, ordem, concluida: false }).select().single();
    if (error || !data) { modalInfo('Não foi possível adicionar o passo.'); return; }
    subs.push(data);
    if (aoMudar) aoMudar(true);
  }
  $('[data-s-add]', raiz).addEventListener('click', add);
  $('[data-s-nova]', raiz).addEventListener('keydown', (ev) => { if (ev.key === 'Enter') add(); });
}

/* Folha de ações da tarefa em T-06 */
function abrirFolhaTarefaProjeto(t, projeto, areaProf, recarregar, subs) {
  subs = subs || [];
  const aberta = t.status === 'aberta';
  const raiz = abrirModal(`
    <h2 class="modal-titulo">${t.sequencia != null ? `<span class="seq-num">${t.sequencia}</span> ` : ''}${esc(t.titulo)}</h2>
    <p class="meta-texto">${aberta ? `score ${t._score} · ` : ''}${t.quadrante} · ${fmtMin(t.estimativa_min)} · prazo ${fmtData(t.prazo)}${t._bloqueada ? ' · ⏸ aguarda anterior (RN-12)' : ''}</p>
    ${aberta ? `<h3 style="margin:12px 0 4px;">Passo a passo</h3><div id="folha-subs-wrap"></div>` : ''}
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
  let mexeuSubs = false;
  if (aberta) {
    const wrap = $('#folha-subs-wrap', raiz);
    const render = () => {
      wrap.innerHTML = htmlChecklist(subs, 'folha-subs');
      ligarChecklist(wrap, t.id, subs, (recriou) => { mexeuSubs = true; if (recriou) render(); });
    };
    render();
  }
  $('[data-m=fechar]', raiz).addEventListener('click', () => {
    fecharModal();
    if (mexeuSubs) recarregar();
  });
  const elEditar = $('[data-m=editar]', raiz);
  if (elEditar) elEditar.addEventListener('click', () => abrirFormTarefa(projeto, areaProf, t, recarregar));
  const elConcluir = $('[data-m=concluir]', raiz);
  if (elConcluir) elConcluir.addEventListener('click', async (ev) => {
    const btn = ev.currentTarget;
    btn.disabled = true;
    btn.textContent = 'Tentando…';            /* J4 passo 1 */
    const ok = await concluirComReenvio(t);
    fecharModal();
    if (ok) {
      toast('Concluída ✓');
      await verificarConclusaoProjeto(t, recarregar);   /* RN-08 */
      recarregar();
    } else if (estado.sessao) {
      mostrarAvisoReenvio();                  /* J4 passo 2 — inline + retry */
    }
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
   DEC-030 — T-11 TEMPLATES DE PROJETO
   Template = tarefas-modelo com sequência (RN-12), estimativa,
   quadrante e subtarefas. Conteúdo 100% do usuário (não é seed).
   ════════════════════════════════════════════════════════════════ */

async function telaTemplates() {
  elView.innerHTML = `<h1>Templates</h1><div class="skeleton skeleton-card"></div>`;
  let templates;
  try { templates = await qTemplates(); }
  catch (e) { return renderErro('Templates', telaTemplates); }

  elView.innerHTML = `
    <div class="tela-cab">
      <h1>Templates</h1>
      <button class="btn btn-primario" data-tpl-novo>+ Template</button>
    </div>
    <p class="meta-texto">Fluxos padrão de projeto (ex.: Móvel Planejado). Ao criar um projeto a partir de um template, as tarefas nascem numeradas — a RN-12 garante a ordem na fila.</p>
    ${templates.length === 0
      ? '<div class="estado-vazio"><p>Nenhum template. Crie o primeiro com o fluxo que você sempre repete.</p></div>'
      : templates.map((tp) => `
      <div class="card" data-tpl="${tp.id}">
        <strong>${esc(tp.nome)}</strong>${tp.ativo ? '' : ' <span class="badge">inativo</span>'}
        <p class="meta-texto">${(tp.conteudo || []).length} etapa(s) · ${fmtMin((tp.conteudo || []).reduce((s, e) => s + (Number(e.estimativa_min) || 0), 0))} no total</p>
        <div class="acoes" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;">
          <button class="btn btn-mini" data-tpl-editar>Editar</button>
          <button class="btn btn-mini" data-tpl-ativo>${tp.ativo ? 'Desativar' : 'Ativar'}</button>
          <button class="btn btn-fantasma btn-mini" data-tpl-excluir>Excluir</button>
        </div>
      </div>`).join('')}`;

  $('[data-tpl-novo]').addEventListener('click', () => abrirFormTemplate(null, telaTemplates));
  $$('[data-tpl]').forEach((card) => {
    const tp = templates.find((x) => x.id === card.dataset.tpl);
    $('[data-tpl-editar]', card).addEventListener('click', () => abrirFormTemplate(tp, telaTemplates));
    $('[data-tpl-ativo]', card).addEventListener('click', async () => {
      const { error } = await sb.from('templates').update({ ativo: !tp.ativo }).eq('id', tp.id);
      if (error) { modalInfo('Não foi possível alterar o template.'); return; }
      telaTemplates();
    });
    $('[data-tpl-excluir]', card).addEventListener('click', () => {
      modalConfirmar(`Excluir o template “${esc(tp.nome)}”?<br><span class="meta-texto">Projetos já criados a partir dele não são afetados.</span>`,
        'Excluir', 'Cancelar', async () => {
          const { error } = await sb.from('templates').delete().eq('id', tp.id);
          if (error) { modalInfo('Não foi possível excluir o template.'); return; }
          toast('Template excluído ✓');
          telaTemplates();
        });
    });
  });
}

/* Editor de template: nome + etapas (título, estimativa, quadrante, passos) */
function abrirFormTemplate(tp, aoSalvar) {
  const etapas = (tp && Array.isArray(tp.conteudo)) ? JSON.parse(JSON.stringify(tp.conteudo)) : [];

  function htmlEtapa(e, i) {
    return `<div class="card" data-et="${i}" style="padding:12px;">
      <p class="meta-texto"><span class="seq-num">${i + 1}</span> sequência ${i + 1}</p>
      <div class="campo"><label>Título da etapa</label>
        <input type="text" data-et-titulo value="${esc(e.titulo || '')}"></div>
      <div class="campo"><label>Estimativa (minutos)</label>
        <input type="number" min="5" step="5" inputmode="numeric" data-et-min value="${e.estimativa_min || 30}"></div>
      <div class="campo"><label>Quadrante</label>
        <select data-et-q>${Object.entries(QUADRANTES).map(([k, l]) =>
          `<option value="${k}"${(e.quadrante || 'Q2') === k ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="campo"><label>Passo a passo (um por linha, opcional)</label>
        <textarea data-et-subs rows="3">${esc((e.subtarefas || []).join('\n'))}</textarea></div>
      <div style="display:flex;gap:8px;">
        <button type="button" class="btn btn-fantasma btn-mini" data-et-sobe>↑</button>
        <button type="button" class="btn btn-fantasma btn-mini" data-et-desce>↓</button>
        <button type="button" class="btn btn-fantasma btn-mini" data-et-remove>Remover etapa</button>
      </div>
    </div>`;
  }

  const raiz = abrirModal(`
    <h2 class="modal-titulo">${tp ? 'Editar template' : 'Novo template'}</h2>
    <div class="campo">
      <label>Nome do template</label>
      <input type="text" data-f="tpl-nome" value="${esc(tp ? tp.nome : '')}" placeholder="ex.: Móvel Planejado — padrão">
      <div class="erro-inline hidden" data-erro-nome>Informe o nome</div>
    </div>
    <h3 style="margin:12px 0 4px;">Etapas (em ordem de execução)</h3>
    <div id="tpl-etapas"></div>
    <button type="button" class="btn btn-fantasma" data-et-add>+ Etapa</button>
    <div class="erro-inline hidden" data-erro-geral></div>
    <div class="modal-acoes">
      <button class="btn" data-m="cancelar">Cancelar</button>
      <button class="btn btn-primario" data-m="salvar">Salvar</button>
    </div>`);

  function colher() {
    $$('[data-et]', raiz).forEach((card) => {
      const i = Number(card.dataset.et);
      etapas[i] = {
        titulo: $('[data-et-titulo]', card).value.trim(),
        estimativa_min: Math.max(5, Number($('[data-et-min]', card).value) || 30),
        quadrante: $('[data-et-q]', card).value,
        subtarefas: $('[data-et-subs]', card).value.split('\n').map((s) => s.trim()).filter(Boolean)
      };
    });
  }
  function render() {
    $('#tpl-etapas', raiz).innerHTML = etapas.length === 0
      ? '<p class="meta-texto">Nenhuma etapa ainda.</p>'
      : etapas.map(htmlEtapa).join('');
    $$('[data-et]', raiz).forEach((card) => {
      const i = Number(card.dataset.et);
      $('[data-et-remove]', card).addEventListener('click', () => { colher(); etapas.splice(i, 1); render(); });
      $('[data-et-sobe]', card).addEventListener('click', () => {
        if (i === 0) return;
        colher(); [etapas[i - 1], etapas[i]] = [etapas[i], etapas[i - 1]]; render();
      });
      $('[data-et-desce]', card).addEventListener('click', () => {
        if (i === etapas.length - 1) return;
        colher(); [etapas[i + 1], etapas[i]] = [etapas[i], etapas[i + 1]]; render();
      });
    });
  }
  render();

  $('[data-et-add]', raiz).addEventListener('click', () => {
    colher();
    etapas.push({ titulo: '', estimativa_min: 30, quadrante: 'Q2', subtarefas: [] });
    render();
  });
  $('[data-m=cancelar]', raiz).addEventListener('click', fecharModal);
  $('[data-m=salvar]', raiz).addEventListener('click', async () => {
    colher();
    const nome = $('[data-f=tpl-nome]', raiz).value.trim();
    const erroNome = $('[data-erro-nome]', raiz);
    if (!nome) { erroNome.classList.remove('hidden'); return; }
    erroNome.classList.add('hidden');
    const validas = etapas.filter((e) => e.titulo);
    if (validas.length === 0) { erroGeral(raiz, 'Adicione ao menos uma etapa com título.'); return; }
    const registro = { nome, conteudo: validas, ativo: tp ? tp.ativo : true };
    const op = tp
      ? sb.from('templates').update(registro).eq('id', tp.id)
      : sb.from('templates').insert(registro);
    const { error } = await op;
    if (error) { erroGeral(raiz, 'Não foi possível salvar o template.'); return; }
    fecharModal();
    toast(tp ? 'Template atualizado ✓' : 'Template criado ✓');
    aoSalvar();
  });
}

/* Materializar template em tarefas (DEC-030 + RN-12): sequência = posição */
async function materializarTemplate(projetoId, conteudo) {
  for (let i = 0; i < conteudo.length; i++) {
    const e = conteudo[i];
    const { data: tarefa, error } = await sb.from('tarefas').insert({
      projeto_id: projetoId,
      titulo: e.titulo,
      estimativa_min: Math.max(5, Number(e.estimativa_min) || 30),
      quadrante: e.quadrante || 'Q2',
      impacto_caixa: 0,
      esforco: 1,
      prazo: null,
      sequencia: i + 1,
      status: 'aberta'
    }).select().single();
    if (error || !tarefa) throw (error || new Error('insert tarefa'));
    const subs = (e.subtarefas || []).map((titulo, j) => ({ tarefa_id: tarefa.id, titulo, ordem: j + 1, concluida: false }));
    if (subs.length) {
      const { error: e2 } = await sb.from('subtarefas').insert(subs);
      if (e2) throw e2;
    }
  }
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
  /* RN-12: bloqueadas por sequência ficam fora da fila do Agora */
  const fila = aplicarPulos(comporFila(filtrarElegiveis(tarefas), alocs, hoje, blocoAtual()));
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
      <div class="tela-cab"><h1>Agora</h1><span style="display:inline-flex;gap:8px;align-items:center;">${htmlBadgePlanejamento(ctx)}<button class="btn btn-mini" data-ag="copiloto">✦ Copiloto</button></span></div>
      <div class="estado-vazio">
        <p>${nadaPlanejado ? 'Nada planejado para hoje' : 'Dia cumprido. 🎯'}</p>
        <button class="btn btn-primario" data-ir-ritual>${nadaPlanejado ? 'Planejar agora' : 'Planejar amanhã'}</button>
      </div>`;
    $('[data-ir-ritual]').addEventListener('click', () => { location.hash = '#/ritual'; });
    $('[data-ag=copiloto]').addEventListener('click', () => abrirCopiloto(ctx));
    return;
  }

  const t = ctx.fila[0];
  const cor = t._area ? t._area.cor : 'var(--borda)';
  elView.innerHTML = `
    <div class="tela-cab"><h1>Agora</h1><span style="display:inline-flex;gap:8px;align-items:center;">${htmlBadgePlanejamento(ctx)}<button class="btn btn-mini" data-ag="copiloto">✦ Copiloto</button></span></div>
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
      <div id="agora-subs" style="margin-top:12px;"></div>
    </div>
    <p style="margin-top:16px;"><button class="btn btn-fantasma" data-ag="fila">ver fila de hoje →</button></p>`;

  /* DEC-028: passo a passo da tarefa atual, direto no cartão */
  qSubtarefas([t.id]).then((subs) => {
    const wrap = $('#agora-subs');
    if (!wrap) return;                       /* usuário já navegou */
    const render = () => {
      const feitos = subs.filter((s) => s.concluida).length;
      wrap.innerHTML = `<h3 style="margin:0 0 4px;">Passo a passo${subs.length ? ` (${feitos}/${subs.length})` : ''}</h3>` +
        htmlChecklist(subs, 'agora-checklist');
      ligarChecklist(wrap, t.id, subs, () => render());
    };
    render();
  }).catch(() => {});

  $('[data-ag=fila]').addEventListener('click', () => { location.hash = '#/hoje'; });
  $('[data-ag=copiloto]').addEventListener('click', () => abrirCopiloto(ctx));   /* DEC-027 */

  /* Pular: fim da fila de hoje, mantém alocação (RN-10) */
  $('[data-ag=pular]').addEventListener('click', () => {
    registrarPulo(t.id);
    ctx.fila.push(ctx.fila.shift());
    desenharAgora(ctx);
  });

  /* Concluir: UI otimista (J2) — toast, próxima aparece; gravação em
     segundo plano. Falha → fila de reenvio + aviso inline (J4). */
  $('[data-ag=concluir]').addEventListener('click', () => {
    ctx.fila.shift();
    toast('Concluída ✓');
    desenharAgora(ctx);
    concluirComReenvio(t).then((ok) => {
      if (ok) { verificarConclusaoProjeto(t, telaAgora); return; }
      if (location.hash === '#/agora') mostrarAvisoReenvio();
    });
  });
}

/* ════════════════════════════════════════════════════════════════
   DEC-027 (Bloco 3) — COPILOTO IA
   O score decide, a IA explica. O payload leva a fila JÁ ordenada
   pelo motor (RN-01/05/06/09/12); a resposta é UMA ação principal.
   ════════════════════════════════════════════════════════════════ */

function htmlSugestaoCopiloto(s) {
  /* s: { acao, plano_b, alertas, observacao } — resposta da API ou linha do histórico */
  if (!s || !s.acao) return '';
  return `
      <div class="cp-acao card card-elevado">
        <p class="meta-texto">${esc(s.acao.projeto || '')}</p>
        <h3 style="margin:4px 0 8px;">${esc(s.acao.titulo)}</h3>
        <p>${esc(s.acao.motivo || '')}</p>
        ${s.acao.primeiro_passo ? `<p style="margin-top:8px;"><strong>Comece por:</strong> ${esc(s.acao.primeiro_passo)}</p>` : ''}
        ${s.acao.tempo ? `<p class="meta-texto" style="margin-top:8px;">⏱ ${esc(s.acao.tempo)}</p>` : ''}
      </div>
      ${s.plano_b ? `<p class="meta-texto" style="margin-top:8px;"><strong>Plano B</strong> (${esc(s.plano_b.quando || 'se travar')}): ${esc(s.plano_b.titulo)}${s.plano_b.projeto ? ` · ${esc(s.plano_b.projeto)}` : ''}</p>` : ''}
      ${(s.alertas || []).length ? `<div class="cp-alertas">${s.alertas.map((a) =>
        `<p class="meta-texto">⚠ <strong>${esc(a.projeto)}</strong> — ${esc(a.descricao)}</p>`).join('')}</div>` : ''}
      ${s.observacao ? `<p class="meta-texto" style="margin-top:8px;">${esc(s.observacao)}</p>` : ''}`;
}

/* DEC-031: histórico é conveniência — falha na gravação não bloqueia o uso */
async function salvarSugestaoCopiloto(contexto, data) {
  try {
    await sb.from('copiloto_sugestoes').insert({
      contexto: contexto || null,
      acao: data.acao,
      plano_b: data.plano_b || null,
      alertas: data.alertas || [],
      observacao: data.observacao || null
    });
  } catch (e) { /* silencioso por design */ }
}

function abrirCopiloto(ctx) {
  const raiz = abrirModal(`
    <h2 class="modal-titulo">✦ Copiloto</h2>
    <p class="meta-texto">O score já ordenou a fila. O Copiloto explica o porquê da próxima ação — e ajusta se seu momento pedir.</p>
    <div class="campo">
      <label>Como você está agora? (opcional)</label>
      <textarea data-cp-ctx rows="2" placeholder="ex.: pouca energia · só 40 min entre instalações · preciso de algo leve"></textarea>
    </div>
    <div id="cp-resultado"></div>
    <div id="cp-historico"></div>
    <div class="modal-acoes">
      <button class="btn" data-m="fechar">Fechar</button>
      <button class="btn btn-primario" data-cp-ir>O que faço agora?</button>
    </div>`);
  $('[data-m=fechar]', raiz).addEventListener('click', fecharModal);
  $('[data-cp-ir]', raiz).addEventListener('click', () => consultarCopiloto(raiz, ctx));

  /* DEC-031: ao reabrir, a última sugestão volta a aparecer (fechou sem
     querer? está aqui) + as anteriores em uma linha cada. */
  qSugestoes(5).then((sugs) => {
    if (!sugs.length) return;
    const out = $('#cp-resultado', raiz);
    if (out && out.innerHTML === '') {
      out.innerHTML = `<p class="meta-texto" style="margin-top:12px;">Última sugestão · ${fmtDataHora(sugs[0].created_at)}${sugs[0].contexto ? ` · contexto: “${esc(sugs[0].contexto)}”` : ''}</p>` +
        htmlSugestaoCopiloto(sugs[0]);
    }
    const hist = $('#cp-historico', raiz);
    if (hist && sugs.length > 1) {
      hist.innerHTML = `<p class="meta-texto" style="margin-top:12px;"><strong>Anteriores</strong></p>` +
        sugs.slice(1).map((s) => `<p class="meta-texto cp-hist-linha">· ${fmtDataHora(s.created_at)} — ${esc(s.acao.titulo)}${s.acao.primeiro_passo ? ` <span class="cp-hist-passo">(começar: ${esc(s.acao.primeiro_passo)})</span>` : ''}</p>`).join('');
    }
  }).catch(() => { /* tabela pode ainda não existir antes do 005_bloco4.sql */ });
}

async function consultarCopiloto(raiz, ctx) {
  const btn = $('[data-cp-ir]', raiz);
  const out = $('#cp-resultado', raiz);
  btn.disabled = true;
  btn.textContent = 'Analisando…';
  out.innerHTML = '<div class="skeleton skeleton-card" style="height:120px;margin-top:12px;"></div>';

  try {
    /* Quando fila vazia (nada planejado hoje), usa todas as tarefas abertas
       ordenadas por score — o Copiloto vira "o que devo planejar primeiro" */
    const filaBase = ctx.fila.length > 0
      ? ctx.fila
      : filtrarElegiveis(ctx.tarefas).sort(cmpTarefas);
    const filaVazia = ctx.fila.length === 0;

    /* Passos pendentes das 10 primeiras + compras pendentes */
    const top = filaBase.slice(0, 10);
    let subs = [], compras = [];
    try { subs = await qSubtarefas(top.map((t) => t.id)); } catch (e) { subs = []; }
    try {
      compras = await obter(sb.from('compras')
        .select('descricao, projetos(nome)').eq('status', 'pendente').limit(12));
    } catch (e) { compras = []; }
    const subsPor = new Map();
    subs.forEach((s) => {
      if (!subsPor.has(s.tarefa_id)) subsPor.set(s.tarefa_id, []);
      subsPor.get(s.tarefa_id).push(s);
    });

    const payload = {
      agora: {
        data: ctx.hoje,
        bloco: BLOCO_LABEL[blocoAtual()],
        diaSemana: DIAS_SEMANA_LABEL[(diaSemanaISO(ctx.hoje) + 6) % 7],
        modo: filaVazia ? 'planejar — nada alocado hoje, sugira o que priorizar' : 'executar — fila do dia ativa'
      },
      contextoUsuario: $('[data-cp-ctx]', raiz).value.trim() || null,
      fila: top.map((t, i) => {
        const meus = subsPor.get(t.id) || [];
        return {
          posicao: i + 1,
          titulo: t.titulo,
          projeto: t._proj ? t._proj.nome : null,
          area: t._area ? t._area.nome : null,
          score: t._score,
          quadrante: t.quadrante,
          estimativa_min: t.estimativa_min,
          prazo: t.prazo,
          vencida: !!t._vencida,
          fixada: t.pin_data === ctx.hoje,
          passosPendentes: meus.filter((s) => !s.concluida).slice(0, 5).map((s) => s.titulo),
          passosFeitos: meus.filter((s) => s.concluida).length,
          passosTotal: meus.length
        };
      }),
      bloqueadas: ctx.tarefas.filter((t) => t._bloqueada).slice(0, 5)
        .map((t) => ({ titulo: t.titulo, projeto: t._proj ? t._proj.nome : null, sequencia: t.sequencia })),
      vencidas: ctx.tarefas.filter((t) => t._vencida).length,
      comprasPendentes: compras.map((c) => ({ item: c.descricao, projeto: c.projetos ? c.projetos.nome : null })),
      prazosProjetos: ctx.projetos
        .filter((p) => p.status === 'ativo' && p.prazo)
        .map((p) => ({
          projeto: p.nome,
          prazo: p.prazo,
          diasRestantes: Math.round((new Date(p.prazo + 'T12:00:00Z') - new Date(ctx.hoje + 'T12:00:00Z')) / 86400000),
          tarefasAbertas: ctx.tarefas.filter((t) => t.projeto_id === p.id).length
        }))
    };

    const resp = await fetch('/api/copiloto', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!resp.ok) {
      const e = await resp.json().catch(() => ({}));
      throw new Error(e.erro || `Erro ${resp.status} no Copiloto.`);
    }
    const data = await resp.json();
    if (!data.acao) throw new Error('Resposta inválida do Copiloto.');

    out.innerHTML = htmlSugestaoCopiloto(data);
    const hist = $('#cp-historico', raiz);
    if (hist) hist.innerHTML = '';
    salvarSugestaoCopiloto(payload.contextoUsuario, data);   /* DEC-031 */
  } catch (e) {
    out.innerHTML = `<div class="erro-inline" style="margin-top:12px;">${esc(e.message || 'Não foi possível consultar o Copiloto. Verifique a conexão.')}</div>`;
  } finally {
    btn.disabled = false;
    btn.textContent = 'O que faço agora?';
  }
}

/* ════════════════════════════════════════════════════════════════
   BLOCO 4 — VISÃO GERAL (#/visao) · fase A das emendas v1.1
   A "casa" do desktop (mockup Painel.png): KPIs, Agora como widget,
   Hoje como painel, projetos c/ progresso, matriz de prioridades,
   urgentes, compras pendentes consolidadas (DEC-029) e última
   sugestão do Copiloto (DEC-031). Mobile: acessível via "Mais".
   ════════════════════════════════════════════════════════════════ */

async function carregarContextoVisao() {
  const hoje = hojeISO();
  const amanha = addDiasISO(hoje, 1);
  const segunda = segundaDaSemana(hoje);
  const domingo = addDiasISO(segunda, 6);
  const [areas, projetos, todas, alocsSemana, planos, compras, sugs] = await Promise.all([
    qAreas(), qProjetos(),
    obter(sb.from('tarefas').select('*')),
    obter(sb.from('alocacoes').select('*').gte('data', segunda).lte('data', domingo)),
    obter(sb.from('planejamentos').select('data').in('data', [hoje, amanha])),
    obter(sb.from('compras').select('*, projetos(nome)').eq('status', 'pendente').order('created_at')),
    qSugestoes(1).catch(() => [])    /* tabela chega com o 005_bloco4.sql */
  ]);
  enriquecer(todas, projetos, areas);
  const tarefas = todas.filter((t) => t.status === 'aberta');   /* compatível com abrirCopiloto */
  const alocsHoje = alocsSemana.filter((al) => al.data === hoje);
  const fila = aplicarPulos(comporFila(filtrarElegiveis(tarefas), alocsHoje, hoje, blocoAtual()));
  return {
    hoje, amanha, segunda, domingo, areas, projetos, todas, tarefas,
    alocsSemana, alocsHoje, alocs: alocsHoje, fila, compras,
    sugestao: sugs[0] || null,
    travadoHoje: planos.some((p) => p.data === hoje),
    planejadoAmanha: planos.some((p) => p.data === amanha)
  };
}

async function telaVisao() {
  elView.innerHTML = `<h1>Visão Geral</h1>
    <div class="visao-kpis">${'<div class="skeleton skeleton-card" style="height:84px"></div>'.repeat(5)}</div>
    <div class="skeleton skeleton-card" style="height:280px"></div>`;
  let ctx;
  try { ctx = await carregarContextoVisao(); }
  catch (e) { return renderErro('Visão Geral', telaVisao); }
  desenharVisao(ctx);
}

function desenharVisao(ctx) {
  const mapT = indexar(ctx.todas);
  const ativos = ctx.projetos.filter((p) => p.status === 'ativo');
  const vencidas = ctx.tarefas.filter((t) => t._vencida);

  /* KPIs — calculados dos seus dados reais */
  const restanteTotal = ctx.tarefas.reduce((s, t) => s + t.estimativa_min, 0);                /* RN-03 */
  const idsPlanejadasSemana = [...new Set(ctx.alocsSemana
    .filter((al) => mapT.has(al.tarefa_id)).map((al) => al.tarefa_id))];                       /* RN-11 */
  const minPlanejados = idsPlanejadasSemana.reduce((s, id) => s + (mapT.get(id).estimativa_min || 0), 0);
  const concluidasSemana = ctx.todas.filter((t) =>
    t.concluida_em && dataSP(t.concluida_em) >= ctx.segunda && dataSP(t.concluida_em) <= ctx.domingo);
  const pct = idsPlanejadasSemana.length
    ? Math.round((concluidasSemana.length / idsPlanejadasSemana.length) * 100) : null;

  function kpi(valor, rotulo, sub, classeSub) {
    return `<div class="card kpi">
      <p class="kpi-valor">${valor}</p>
      <p class="meta-texto">${rotulo}</p>
      ${sub ? `<p class="kpi-sub ${classeSub || ''}">${sub}</p>` : ''}
    </div>`;
  }

  /* Widget Agora */
  const t0 = ctx.fila[0] || null;
  const corT0 = t0 && t0._area ? t0._area.cor : 'var(--borda)';
  const htmlAgora = t0 ? `
    <div class="card card-elevado agora-card" style="border-left-color:${corT0}">
      <p class="meta-texto"><span class="dot" style="background:${corT0}"></span>${esc(t0._proj ? t0._proj.nome : '—')}</p>
      <h3 style="margin:6px 0 8px;">${esc(t0.titulo)}</h3>
      <p>
        <span class="badge badge-q">${t0.quadrante}</span>
        <span class="badge">score ${t0._score}</span>
        <span class="badge">${fmtMin(t0.estimativa_min)}</span>
        ${t0.pin_data === ctx.hoje ? '<span class="badge">📌</span>' : ''}
        ${t0._vencida ? '<span class="badge badge-atrasada">atrasada</span>' : ''}
      </p>
      <div class="agora-acoes">
        <button class="btn" data-vg="pular">Pular</button>
        <button class="btn btn-sucesso" data-vg="concluir">Concluir</button>
      </div>
    </div>
    <p style="margin-top:8px;"><button class="btn btn-fantasma btn-mini" data-ir="#/agora">abrir Agora →</button></p>`
    : `<div class="estado-vazio estado-vazio-mini">
        <p>${ctx.alocsHoje.length === 0 && !ctx.travadoHoje ? 'Nada planejado para hoje' : 'Dia cumprido. 🎯'}</p>
        <button class="btn btn-primario" data-ir="#/ritual">${ctx.alocsHoje.length === 0 && !ctx.travadoHoje ? 'Planejar agora' : 'Planejar amanhã'}</button>
      </div>`;

  /* Painel Hoje (fila do dia compacta, ordem RN-09) */
  const htmlHoje = ctx.fila.length ? `
    <ul class="lista-simples">
      ${ctx.fila.slice(0, 7).map((t) => `
        <li class="vg-linha">
          <span class="dot" style="background:${t._area ? t._area.cor : 'var(--borda)'}"></span>
          <span class="titulo-trunc">${esc(t.titulo)}</span>
          <span class="meta-texto">${fmtMin(t.estimativa_min)}</span>
        </li>`).join('')}
    </ul>
    ${ctx.fila.length > 7 ? `<p class="meta-texto">+ ${ctx.fila.length - 7} na fila</p>` : ''}
    <p><button class="btn btn-fantasma btn-mini" data-ir="#/hoje">ver o dia completo →</button></p>`
    : '<p class="meta-texto">Sem fila para hoje.</p>';

  /* Projetos em andamento — progresso por contagem de tarefas */
  const cartoesProjetos = ativos
    .map((p) => {
      const doProj = ctx.todas.filter((t) => t.projeto_id === p.id);
      const abertas = doProj.filter((t) => t.status === 'aberta');
      const total = doProj.length;
      const feitas = total - abertas.length;
      const pctP = total ? Math.round((feitas / total) * 100) : 0;
      const restMin = abertas.reduce((s, t) => s + t.estimativa_min, 0);
      const area = ctx.areas.find((a) => a.id === p.area_id) || null;
      const dias = p.prazo
        ? Math.round((new Date(p.prazo + 'T12:00:00Z') - new Date(ctx.hoje + 'T12:00:00Z')) / 86400000)
        : null;
      return { p, area, total, feitas, pctP, restMin, dias };
    })
    .sort((a, b) => {
      if (a.dias === null && b.dias === null) return 0;
      if (a.dias === null) return 1;
      if (b.dias === null) return -1;
      return a.dias - b.dias;
    });
  const htmlProjetos = cartoesProjetos.length ? cartoesProjetos.slice(0, 6).map(({ p, area, total, feitas, pctP, restMin, dias }) => `
    <button class="vg-projeto" data-ir="#/projeto/${p.id}">
      <span class="vg-projeto-cab">
        <span class="dot" style="background:${area ? area.cor : 'var(--borda)'}"></span>
        <span class="titulo-trunc">${esc(p.nome)}</span>
        <span class="meta-texto">${pctP}%</span>
      </span>
      <span class="barra-prog"><span class="barra-prog-cheia" style="width:${pctP}%; background:${area ? area.cor : 'var(--foco)'}"></span></span>
      <span class="meta-texto">${feitas}/${total} tarefas · ${fmtMin(restMin)} restantes${p.prazo ? ` · até ${fmtData(p.prazo)}` : ''}
        ${dias !== null && dias < 0 ? ' <span class="vg-alerta">vencido</span>' : (dias !== null && dias <= 7 ? ` <span class="vg-alerta">${dias}d</span>` : '')}</span>
    </button>`).join('') + (ativos.length > 6 ? `<p class="meta-texto">+ ${ativos.length - 6} projeto(s)</p>` : '')
    : '<p class="meta-texto">Nenhum projeto ativo.</p>';

  /* Matriz de prioridades (Eisenhower) — tarefas abertas por quadrante */
  const ROTULO_Q = {
    Q1: 'urgente e importante', Q2: 'importante, não urgente',
    Q3: 'urgente, não importante', Q4: 'nem urgente, nem importante'
  };
  const htmlMatriz = `<div class="matriz">` + ['Q1', 'Q2', 'Q3', 'Q4'].map((q) => {
    const doQ = ctx.tarefas.filter((t) => t.quadrante === q).sort(cmpTarefas);
    return `<div class="matriz-q matriz-${q.toLowerCase()}">
      <p class="matriz-cab"><strong>${q}</strong> <span class="meta-texto">${ROTULO_Q[q]}</span></p>
      <p class="kpi-valor">${doQ.length}</p>
      ${doQ.slice(0, 2).map((t) => `<p class="meta-texto titulo-trunc">· ${esc(t.titulo)}</p>`).join('')}
    </div>`;
  }).join('') + `</div>`;

  /* Tarefas urgentes: vencidas + prazo em até 3 dias */
  const limite = addDiasISO(ctx.hoje, 3);
  const urgentes = ctx.tarefas
    .filter((t) => t._vencida || (t.prazo && t.prazo <= limite))
    .sort(cmpTarefas);
  const htmlUrgentes = urgentes.length ? `
    <ul class="lista-simples">${urgentes.slice(0, 6).map((t) => {
      const rot = t._vencida ? 'vencida' : (t.prazo === ctx.hoje ? 'hoje' : `até ${fmtData(t.prazo).slice(0, 5)}`);
      return `<li class="vg-linha">
        <span class="dot" style="background:${t._area ? t._area.cor : 'var(--borda)'}"></span>
        <span class="titulo-trunc">${esc(t.titulo)} <span class="meta-texto">· ${esc(t._proj ? t._proj.nome : '—')}</span></span>
        <span class="badge ${t._vencida ? 'badge-atrasada' : 'badge-pendente'}">${rot}</span>
      </li>`;
    }).join('')}</ul>
    ${urgentes.length > 6 ? `<p class="meta-texto">+ ${urgentes.length - 6} no radar</p>` : ''}`
    : '<p class="meta-texto">Nada vencido nem vencendo em 3 dias. 🟢</p>';

  /* Compras pendentes consolidadas (DEC-029) */
  const htmlCompras = ctx.compras.length ? `
    <ul class="lista-simples">${ctx.compras.slice(0, 8).map((c) => `
      <li class="vg-linha">
        <button class="vg-check" data-comprar="${c.id}" aria-label="Marcar como comprado">✓</button>
        <span class="titulo-trunc">${esc(c.descricao)}</span>
        <span class="meta-texto">${esc(c.projetos ? c.projetos.nome : '—')}</span>
      </li>`).join('')}</ul>
    ${ctx.compras.length > 8 ? `<p class="meta-texto">+ ${ctx.compras.length - 8} item(ns)</p>` : ''}`
    : '<p class="meta-texto">Nenhuma compra pendente.</p>';

  /* Última sugestão do Copiloto (DEC-031) */
  const htmlCopiloto = ctx.sugestao ? `
    <p class="meta-texto">${fmtDataHora(ctx.sugestao.created_at)}${ctx.sugestao.contexto ? ` · “${esc(ctx.sugestao.contexto)}”` : ''}</p>
    <p style="margin:6px 0 2px;"><strong>${esc(ctx.sugestao.acao.titulo)}</strong>${ctx.sugestao.acao.projeto ? ` <span class="meta-texto">· ${esc(ctx.sugestao.acao.projeto)}</span>` : ''}</p>
    ${ctx.sugestao.acao.primeiro_passo ? `<p class="meta-texto">Comece por: ${esc(ctx.sugestao.acao.primeiro_passo)}</p>` : ''}
    <p style="margin-top:10px;"><button class="btn btn-mini" data-vg="copiloto">✦ Nova consulta</button></p>`
    : `<p class="meta-texto">Nenhuma consulta ainda. O Copiloto explica a próxima ação da fila — e ajusta ao seu momento.</p>
       <p style="margin-top:10px;"><button class="btn btn-mini" data-vg="copiloto">✦ Consultar</button></p>`;

  elView.innerHTML = `
    <div class="tela-cab">
      <h1>Visão Geral</h1>
      <span style="display:inline-flex;gap:8px;align-items:center;">
        <button class="badge ${ctx.planejadoAmanha ? 'badge-ok' : 'badge-pendente'} badge-acao" data-ir="#/ritual">${ctx.planejadoAmanha ? 'amanhã planejado ✓' : 'amanhã pendente — planejar'}</button>
        <button class="btn btn-mini" data-vg="copiloto">✦ Copiloto</button>
      </span>
    </div>

    <div class="visao-kpis">
      ${kpi(ativos.length, 'projetos em andamento', fmtMin(restanteTotal) + ' de trabalho aberto')}
      ${kpi(ctx.tarefas.length, 'tarefas pendentes', vencidas.length ? `${vencidas.length} atrasada(s)` : 'nenhuma atrasada', vencidas.length ? 'vg-alerta' : '')}
      ${kpi(fmtMin(minPlanejados), 'planejado nesta semana', `${idsPlanejadasSemana.length} tarefa(s) alocada(s)`)}
      ${kpi(pct === null ? '—' : pct + '%', 'progresso da semana', `${concluidasSemana.length} de ${idsPlanejadasSemana.length || 0} planejadas`)}
      ${kpi(ctx.compras.length, 'compras pendentes', ctx.compras.length ? `em ${new Set(ctx.compras.map((c) => c.projeto_id)).size} projeto(s)` : '')}
    </div>

    <div class="visao-grid">
      <section class="widget"><h2>Agora</h2><div id="vg-agora">${htmlAgora}</div></section>
      <section class="widget"><h2>Hoje</h2>${htmlHoje}</section>
      <section class="widget"><h2>✦ Copiloto</h2>${htmlCopiloto}</section>
      <section class="widget widget-largo"><h2>Projetos em andamento</h2>${htmlProjetos}</section>
      <section class="widget"><h2>Matriz de prioridades</h2>${htmlMatriz}</section>
      <section class="widget"><h2>Tarefas urgentes</h2>${htmlUrgentes}</section>
      <section class="widget"><h2>Compras pendentes</h2>${htmlCompras}</section>
    </div>`;

  /* Navegação dos widgets */
  $$('[data-ir]').forEach((b) => b.addEventListener('click', () => { location.hash = b.dataset.ir; }));
  $$('[data-vg=copiloto]').forEach((b) => b.addEventListener('click', () => abrirCopiloto(ctx)));

  /* Agora-widget: mesmas semânticas da tela Agora (J2/J4, RN-10) */
  const btnPular = $('[data-vg=pular]');
  if (btnPular) btnPular.addEventListener('click', () => {
    registrarPulo(t0.id);
    ctx.fila.push(ctx.fila.shift());
    desenharVisao(ctx);
  });
  const btnConcluir = $('[data-vg=concluir]');
  if (btnConcluir) btnConcluir.addEventListener('click', () => {
    ctx.fila.shift();
    toast('Concluída ✓');
    desenharVisao(ctx);
    concluirComReenvio(t0).then((ok) => {
      if (ok) {
        verificarConclusaoProjeto(t0, telaVisao);             /* RN-08 */
        if (location.hash === '#/visao') telaVisao();         /* KPIs frescos */
        return;
      }
      if (location.hash === '#/visao') mostrarAvisoReenvio();
    });
  });

  /* Compras: marcar comprado direto do widget (DEC-029) */
  $$('[data-comprar]').forEach((b) => b.addEventListener('click', async () => {
    const { error } = await sb.from('compras').update({ status: 'comprado' }).eq('id', b.dataset.comprar);
    if (error) { modalInfo('Não foi possível marcar como comprado.'); return; }
    toast('Comprado ✓');
    ctx.compras = ctx.compras.filter((c) => c.id !== b.dataset.comprar);
    desenharVisao(ctx);
  }));
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
  $('[data-m=concluir]', raiz).addEventListener('click', async (ev) => {
    const btn = ev.currentTarget;
    btn.disabled = true;
    btn.textContent = 'Tentando…';            /* J4 passo 1 */
    const ok = await concluirComReenvio(t);
    fecharModal();
    if (ok) {
      toast('Concluída ✓');
      await verificarConclusaoProjeto(t, recarregar);   /* RN-08 */
      recarregar();
    } else if (estado.sessao) {
      mostrarAvisoReenvio();                  /* J4 passo 2 — inline + retry */
    }
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
   B7 — T-09 PLANEJAR AMANHÃ (F-07, RN-01/02/06, DEC-019/020/021)
   Persistência incremental (CA-13): cada pin e cada alocação grava
   na hora; "Travar o dia" grava separado em `planejamentos`.
   Domingo ≥18h: antepõe o Relatório T-08 enquanto não gerado (DEC-020).
   ════════════════════════════════════════════════════════════════ */

async function carregarContextoRitual() {
  const hoje = hojeISO();
  const amanha = addDiasISO(hoje, 1);
  const [areas, projetos, tarefas, alocs, planos, rels] = await Promise.all([
    qAreas(), qProjetos(), qTarefasAbertas(),
    obter(sb.from('alocacoes').select('*').eq('data', amanha)),
    obter(sb.from('planejamentos').select('*').eq('data', amanha)),
    obter(sb.from('relatorios').select('id').eq('semana_inicio', segundaDaSemana(hoje)))
  ]);
  enriquecer(tarefas, projetos, areas);
  return {
    hoje, amanha, areas, projetos, tarefas, alocs,
    plano: planos[0] || null,
    relatorioGerado: rels.length > 0
  };
}

async function telaRitual() {
  elView.innerHTML = `<h1>Planejar Amanhã</h1>
    <div class="skeleton skeleton-linha"></div><div class="skeleton skeleton-linha"></div>
    <div class="skeleton skeleton-card"></div>`;
  let ctx;
  try { ctx = await carregarContextoRitual(); }
  catch (e) { return renderErro('Planejar Amanhã', telaRitual); }

  /* J3 passo 6 / DEC-020: domingo, com relatório liberado (RN-07) e ainda
     não gerado, o ritual antepõe T-08. "Fechar relatório" volta para cá. */
  if (diaSemanaISO(ctx.hoje) === 0 && horaSP() >= 18 && !ctx.relatorioGerado) {
    location.hash = '#/relatorio';
    return;
  }
  desenharRitual(ctx);
}

function desenharRitual(ctx) {
  estado.selRitual = null;

  if (ctx.tarefas.length === 0) {
    elView.innerHTML = `<h1>Planejar Amanhã</h1>
      <div class="estado-vazio"><p>Nenhuma tarefa aberta — crie tarefas no Panorama.</p>
      <button class="btn btn-primario" data-ir-pan>Ir ao Panorama</button></div>`;
    $('[data-ir-pan]').addEventListener('click', () => { location.hash = '#/panorama'; });
    return;
  }

  /* RN-02: pins de amanhã, por pin_ordem */
  const pins = ctx.tarefas.filter((t) => t.pin_data === ctx.amanha)
    .sort((a, b) => (a.pin_ordem || 0) - (b.pin_ordem || 0));
  const idsPin = new Set(pins.map((t) => t.id));
  const alocPorTarefa = new Map();
  ctx.alocs.forEach((al) => alocPorTarefa.set(al.tarefa_id, al));

  /* Fila sugerida: abertas elegíveis (RN-12) sem pin e sem alocação amanhã, ordem RN-01 */
  const sugeridas = filtrarElegiveis(ctx.tarefas)
    .filter((t) => !idsPin.has(t.id) && !alocPorTarefa.has(t.id))
    .sort(cmpTarefas);

  const porBloco = { manha: [], tarde: [], noite: [] };
  ctx.tarefas.forEach((t) => {
    if (idsPin.has(t.id)) return;
    const al = alocPorTarefa.get(t.id);
    if (al) porBloco[al.bloco].push(t);
  });
  Object.values(porBloco).forEach((l) => l.sort(cmpTarefas));

  const corDe = (t) => (t._area ? t._area.cor : 'var(--borda)');

  function htmlSugerida(t) {
    return `<div class="linha-tarefa arrastavel${t._vencida ? ' atrasada' : ''}" draggable="true" tabindex="0" data-rit-t="${t.id}">
      <span class="dot" style="background:${corDe(t)}"></span>
      <span class="linha-flex">
        <span class="titulo-trunc">${esc(t.titulo)}</span>
        <span class="meta-texto">${esc(t._proj ? t._proj.nome : '—')} · score ${t._score} · ${t.quadrante} · ${fmtMin(t.estimativa_min)} · prazo ${fmtData(t.prazo)}</span>
      </span>
      ${t._vencida ? '<span class="badge badge-atrasada">atrasada</span>' : ''}
    </div>`;
  }

  function htmlPin(t, i) {
    return `<div class="linha-tarefa" data-pin-linha="${t.id}">
      <span class="meta-texto">📌&nbsp;${i + 1}º</span>
      <span class="linha-flex">
        <span class="titulo-trunc">${esc(t.titulo)}</span>
        <span class="meta-texto">${esc(t._proj ? t._proj.nome : '—')} · score ${t._score} · ${fmtMin(t.estimativa_min)}</span>
      </span>
      <span class="linha-acoes">
        <button type="button" class="btn btn-fantasma btn-mini" data-pin-sobe="${t.id}" aria-label="Subir pin">↑</button>
        <button type="button" class="btn btn-fantasma btn-mini" data-pin-desce="${t.id}" aria-label="Descer pin">↓</button>
        <button type="button" class="btn btn-fantasma btn-mini" data-despinar="${t.id}">Desfixar</button>
      </span>
    </div>`;
  }

  function htmlAlocada(t) {
    const al = alocPorTarefa.get(t.id);
    return `<div class="linha-tarefa arrastavel${t._vencida ? ' atrasada' : ''}" draggable="true" tabindex="0" data-rit-t="${t.id}">
      <span class="dot" style="background:${corDe(t)}"></span>
      <span class="linha-flex">
        <span class="titulo-trunc">${esc(t.titulo)}</span>
        <span class="meta-texto">score ${t._score} · ${fmtMin(t.estimativa_min)} · prazo ${fmtData(t.prazo)}</span>
      </span>
      ${t._vencida ? '<span class="badge badge-atrasada">atrasada</span>' : ''}
      <button type="button" class="btn btn-fantasma btn-mini" data-remover-aloc="${al.id}" aria-label="Remover alocação de amanhã">✕</button>
    </div>`;
  }

  elView.innerHTML = `
    <div class="tela-cab">
      <h1>Planejar Amanhã</h1>
      <span class="badge ${ctx.plano ? 'badge-ok' : 'badge-pendente'}">${ctx.plano ? 'amanhã planejado ✓' : 'amanhã pendente'}</span>
    </div>
    <p class="meta-texto">Amanhã: ${fmtData(ctx.amanha)} · toque numa tarefa e depois no destino (📌 fixadas ou um bloco); no desktop, arraste e solte.</p>
    <div class="ritual-grid">
      <section>
        <h2>Fila sugerida (ordem RN-01)</h2>
        ${sugeridas.length ? sugeridas.map(htmlSugerida).join('')
          : '<p class="meta-texto">Todas as tarefas abertas já estão fixadas ou alocadas para amanhã.</p>'}
      </section>
      <section>
        <h2>Amanhã</h2>
        <div class="zona-drop" data-zona="pin">
          <div class="celula-cab"><span>📌 Fixadas — topo da fila (RN-02)</span><span class="meta-texto">${pins.length}</span></div>
          ${pins.length ? pins.map(htmlPin).join('') : '<p class="meta-texto zona-dica">Toque ou solte aqui para fixar.</p>'}
        </div>
        ${['manha', 'tarde', 'noite'].map((b) => `
        <div class="zona-drop" data-zona="${b}">
          <div class="celula-cab"><span>${BLOCO_LABEL[b]}</span><span class="meta-texto">${fmtMin(porBloco[b].reduce((s, t) => s + t.estimativa_min, 0))}</span></div>
          ${porBloco[b].length ? porBloco[b].map(htmlAlocada).join('') : '<p class="meta-texto zona-dica">Toque ou solte aqui para alocar.</p>'}
        </div>`).join('')}
        <button class="btn ${ctx.plano ? '' : 'btn-primario'} btn-bloco" id="rit-travar">${ctx.plano ? 'Atualizar planejamento' : 'Travar o dia'}</button>
      </section>
    </div>`;

  const recarregar = () => telaRitual();

  /* Cada ação persiste imediatamente (DEC-021 / CA-13) */
  async function fixar(id) {
    const maxOrdem = pins.reduce((m, t) => Math.max(m, t.pin_ordem || 0), 0);
    const { error } = await sb.from('tarefas')
      .update({ pin_data: ctx.amanha, pin_ordem: maxOrdem + 1 }).eq('id', id);
    if (error) { modalInfo('Não foi possível fixar. Tente novamente.'); return; }
    toast('Fixada ✓');
    recarregar();
  }
  async function alocar(id, bloco) {
    const al = alocPorTarefa.get(id);
    if (al && al.bloco === bloco) { limparSelecaoRitual(); return; }
    const op = al
      ? sb.from('alocacoes').update({ bloco }).eq('id', al.id)
      : sb.from('alocacoes').insert({ tarefa_id: id, data: ctx.amanha, bloco });
    const { error } = await op;
    if (error) { modalInfo('Não foi possível alocar. Tente novamente.'); return; }
    toast('Alocada ✓');
    recarregar();
  }
  function limparSelecaoRitual() {
    estado.selRitual = null;
    $$('.linha-tarefa.sel').forEach((x) => x.classList.remove('sel'));
  }

  /* Toque-toque (mobile) + drag-and-drop HTML5 (desktop) — DEC-019 */
  $$('[data-rit-t]').forEach((el) => {
    el.addEventListener('click', (ev) => {
      if (ev.target.closest('[data-remover-aloc]')) return;
      ev.stopPropagation();
      const id = el.dataset.ritT;
      if (estado.selRitual === id) { limparSelecaoRitual(); return; }
      limparSelecaoRitual();
      estado.selRitual = id;
      el.classList.add('sel');
    });
    el.addEventListener('dragstart', (ev) => {
      ev.dataTransfer.setData('text/plain', el.dataset.ritT);
      ev.dataTransfer.effectAllowed = 'move';
    });
  });

  $$('.zona-drop').forEach((z) => {
    z.addEventListener('click', (ev) => {
      if (ev.target.closest('[data-rit-t]') || ev.target.closest('[data-pin-linha]')) return;
      const id = estado.selRitual;
      if (!id) return;
      if (z.dataset.zona === 'pin') fixar(id); else alocar(id, z.dataset.zona);
    });
    z.addEventListener('dragover', (ev) => { ev.preventDefault(); z.classList.add('drag-sobre'); });
    z.addEventListener('dragleave', () => z.classList.remove('drag-sobre'));
    z.addEventListener('drop', (ev) => {
      ev.preventDefault();
      z.classList.remove('drag-sobre');
      const id = ev.dataTransfer.getData('text/plain');
      if (!id) return;
      if (z.dataset.zona === 'pin') fixar(id); else alocar(id, z.dataset.zona);
    });
  });

  $$('[data-despinar]').forEach((b) => b.addEventListener('click', async (ev) => {
    ev.stopPropagation();
    const { error } = await sb.from('tarefas')
      .update({ pin_data: null, pin_ordem: null }).eq('id', b.dataset.despinar);
    if (error) { modalInfo('Não foi possível desfixar.'); return; }
    toast('Desfixada ✓');               /* RN-02: volta à ordenação natural */
    recarregar();
  }));

  async function moverPin(id, delta) {
    const i = pins.findIndex((t) => t.id === id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= pins.length) return;
    const a = pins[i], b = pins[j];
    const e1 = await sb.from('tarefas').update({ pin_ordem: b.pin_ordem }).eq('id', a.id);
    const e2 = await sb.from('tarefas').update({ pin_ordem: a.pin_ordem }).eq('id', b.id);
    if (e1.error || e2.error) { modalInfo('Não foi possível reordenar os pins.'); return; }
    recarregar();
  }
  $$('[data-pin-sobe]').forEach((b) => b.addEventListener('click', (ev) => {
    ev.stopPropagation(); moverPin(b.dataset.pinSobe, -1);
  }));
  $$('[data-pin-desce]').forEach((b) => b.addEventListener('click', (ev) => {
    ev.stopPropagation(); moverPin(b.dataset.pinDesce, +1);
  }));

  $$('[data-remover-aloc]').forEach((b) => b.addEventListener('click', async (ev) => {
    ev.stopPropagation();
    const { error } = await sb.from('alocacoes').delete().eq('id', b.dataset.removerAloc);
    if (error) { modalInfo('Não foi possível remover a alocação.'); return; }
    toast('Alocação removida ✓');
    recarregar();
  }));

  /* Travar o dia (seção 16: dia já travado → "Atualizar planejamento") */
  $('#rit-travar').addEventListener('click', async () => {
    const btn = $('#rit-travar');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner" aria-hidden="true"></span> Salvando…';
    const op = ctx.plano
      ? sb.from('planejamentos').update({ travado_em: new Date().toISOString() }).eq('id', ctx.plano.id)
      : sb.from('planejamentos').insert({ data: ctx.amanha });
    const { error } = await op;
    if (error) {
      btn.disabled = false;
      btn.textContent = ctx.plano ? 'Atualizar planejamento' : 'Travar o dia';
      modalInfo('Não foi possível travar o dia. Verifique a conexão e tente novamente.');
      return;
    }
    toast('Dia travado ✓');
    recarregar();
  });
}

/* ════════════════════════════════════════════════════════════════
   B8 — T-04 SEMANA (F-11, DEC-019)
   Grid 7 dias × 3 blocos da semana corrente (RN-07). Mobile: dias em
   colunas com scroll horizontal e realocação toque-toque; desktop:
   grade completa com drag-and-drop HTML5. Σ minutos no cabeçalho.
   ════════════════════════════════════════════════════════════════ */

async function telaSemana() {
  elView.innerHTML = `<h1>Semana</h1><div class="skeleton skeleton-card" style="height:320px"></div>`;
  const hoje = hojeISO();
  const segunda = segundaDaSemana(hoje);
  const dias = Array.from({ length: 7 }, (_, i) => addDiasISO(segunda, i));
  let areas, projetos, tarefas, alocs;
  try {
    [areas, projetos, tarefas, alocs] = await Promise.all([
      qAreas(), qProjetos(), qTarefasAbertas(),
      obter(sb.from('alocacoes').select('*').gte('data', dias[0]).lte('data', dias[6]))
    ]);
  } catch (e) { return renderErro('Semana', telaSemana); }

  enriquecer(tarefas, projetos, areas);
  const mapT = indexar(tarefas);
  estado.selSemana = null;

  function htmlCelula(data, bloco) {
    const itens = alocs
      .filter((al) => al.data === data && al.bloco === bloco && mapT.has(al.tarefa_id))
      .map((al) => ({ al, t: mapT.get(al.tarefa_id) }))
      .sort((x, y) => cmpTarefas(x.t, y.t));
    const total = itens.reduce((s, x) => s + x.t.estimativa_min, 0);
    const realce = estado.realceSemana === `${data}|${bloco}` ? ' realce' : '';
    return `<div class="celula${realce}" data-cel-data="${data}" data-cel-bloco="${bloco}">
      <div class="celula-cab"><span>${BLOCO_LABEL[bloco]}</span><span class="meta-texto">${total ? fmtMin(total) : ''}</span></div>
      ${itens.length ? itens.map(({ al, t }) => `
        <div class="mini-tarefa arrastavel${t._vencida ? ' atrasada' : ''}" draggable="true" tabindex="0" data-sem-aloc="${al.id}" title="${esc(t.titulo)}">
          <span class="dot" style="background:${t._area ? t._area.cor : 'var(--borda)'}"></span>
          <span class="titulo-trunc">${esc(t.titulo)}</span>
          <span class="meta-texto">${fmtMin(t.estimativa_min)}</span>
        </div>`).join('') : '<div class="mais-fantasma" aria-hidden="true">+</div>'}
    </div>`;
  }

  elView.innerHTML = `
    <h1>Semana</h1>
    <p class="meta-texto">${fmtData(dias[0])} a ${fmtData(dias[6])} · toque numa tarefa e depois no bloco destino; no desktop, arraste e solte.</p>
    <div class="semana-wrap">
      ${dias.map((d, i) => `
      <div class="semana-dia${d === hoje ? ' dia-hoje' : ''}">
        <div class="semana-dia-cab"><strong>${DIAS_SEMANA_LABEL[i]}</strong> <span class="meta-texto">${fmtData(d).slice(0, 5)}</span>${d === hoje ? ' <span class="badge badge-ok">hoje</span>' : ''}</div>
        ${['manha', 'tarde', 'noite'].map((b) => htmlCelula(d, b)).join('')}
      </div>`).join('')}
    </div>`;

  estado.realceSemana = null;   /* realce aplicado uma única vez */

  async function realocar(alocId, data, bloco) {
    const al = alocs.find((a) => a.id === alocId);
    if (!al) return;
    if (al.data === data && al.bloco === bloco) {
      estado.selSemana = null;
      $$('.mini-tarefa.sel').forEach((x) => x.classList.remove('sel'));
      return;
    }
    const { error } = await sb.from('alocacoes').update({ data, bloco }).eq('id', alocId);
    if (error) { modalInfo('Não foi possível realocar (talvez a tarefa já esteja nesse bloco).'); return; }
    estado.selSemana = null;
    estado.realceSemana = `${data}|${bloco}`;
    toast('Tarefa realocada ✓');
    telaSemana();
  }

  $$('[data-sem-aloc]').forEach((el) => {
    el.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const id = el.dataset.semAloc;
      if (estado.selSemana === id) {
        estado.selSemana = null;
        el.classList.remove('sel');
        return;
      }
      $$('.mini-tarefa.sel').forEach((x) => x.classList.remove('sel'));
      estado.selSemana = id;
      el.classList.add('sel');
    });
    el.addEventListener('dragstart', (ev) => {
      ev.dataTransfer.setData('text/plain', el.dataset.semAloc);
      ev.dataTransfer.effectAllowed = 'move';
    });
  });

  $$('.celula').forEach((c) => {
    c.addEventListener('click', () => {
      if (estado.selSemana) realocar(estado.selSemana, c.dataset.celData, c.dataset.celBloco);
    });
    c.addEventListener('dragover', (ev) => { ev.preventDefault(); c.classList.add('drag-sobre'); });
    c.addEventListener('dragleave', () => c.classList.remove('drag-sobre'));
    c.addEventListener('drop', (ev) => {
      ev.preventDefault();
      c.classList.remove('drag-sobre');
      const id = ev.dataTransfer.getData('text/plain');
      if (id) realocar(id, c.dataset.celData, c.dataset.celBloco);
    });
  });
}

/* ════════════════════════════════════════════════════════════════
   B9 — T-08 RELATÓRIO SEMANAL (F-15, RN-07, RN-11, DEC-013/020)
   Disponível para a semana corrente a partir de domingo 18:00; o
   relatório gerado fica acessível a qualquer momento depois, sob
   demanda (RN-07). Vereditos: 1 toque por meta, upsert.
   ════════════════════════════════════════════════════════════════ */

async function telaRelatorio() {
  elView.innerHTML = `<h1>Relatório</h1><div class="skeleton skeleton-card"></div><div class="skeleton skeleton-card"></div>`;
  const hoje = hojeISO();
  const liberado = diaSemanaISO(hoje) === 0 && horaSP() >= 18;   /* RN-07 */
  const segundaAtual = segundaDaSemana(hoje);

  let relatorio = null;
  try {
    if (liberado) {
      /* Domingo ≥18h: gera (uma vez) o relatório da semana que termina */
      const existentes = await obter(sb.from('relatorios').select('*').eq('semana_inicio', segundaAtual));
      if (existentes[0]) relatorio = existentes[0];
      else {
        const { data, error } = await sb.from('relatorios').insert({ semana_inicio: segundaAtual }).select();
        if (error) throw error;
        relatorio = data[0];
      }
    } else {
      /* "A qualquer momento depois, sob demanda": exibe o último relatório já gerado */
      const rels = await obter(sb.from('relatorios').select('*')
        .order('semana_inicio', { ascending: false }).limit(1));
      relatorio = rels[0] || null;
    }
  } catch (e) { return renderErro('Relatório', telaRelatorio); }

  if (!relatorio) {
    elView.innerHTML = `<h1>Relatório</h1>
      <div class="estado-vazio">
        <p>O relatório da semana fica disponível a partir de domingo às 18:00 (RN-07).</p>
        <button class="btn btn-primario" data-ir-ritual>Planejar →</button>
      </div>`;
    $('[data-ir-ritual]').addEventListener('click', () => { location.hash = '#/ritual'; });
    return;
  }

  try { await desenharRelatorio(relatorio); }
  catch (e) { renderErro('Relatório', telaRelatorio); }
}

async function desenharRelatorio(rel) {
  const ini = rel.semana_inicio;
  const fim = addDiasISO(ini, 6);
  const [areas, projetos, metas, tarefas, alocs, vereditos] = await Promise.all([
    qAreas(), qProjetos(), qMetas(),
    obter(sb.from('tarefas').select('*')),
    obter(sb.from('alocacoes').select('*').gte('data', ini).lte('data', fim)),
    obter(sb.from('vereditos').select('*').eq('relatorio_id', rel.id))
  ]);
  const mapT = indexar(tarefas);
  const mapP = indexar(projetos);

  /* RN-11: PLANEJADAS = alocação com data na semana; CONCLUÍDAS = concluida_em na semana */
  const idsPlanejadas = [...new Set(alocs.filter((al) => mapT.has(al.tarefa_id)).map((al) => al.tarefa_id))];
  const concluidas = tarefas.filter((t) =>
    t.concluida_em && dataSP(t.concluida_em) >= ini && dataSP(t.concluida_em) <= fim);
  const idsConcluidas = new Set(concluidas.map((t) => t.id));

  /* Agrupamento por meta via projeto.meta_id; sem meta → "Sem meta vinculada" */
  const grupos = new Map();
  function grupoDe(t) {
    const p = mapP.get(t.projeto_id);
    const chave = p && p.meta_id ? p.meta_id : 'sem';
    if (!grupos.has(chave)) grupos.set(chave, { planejadas: [], concluidas: [] });
    return grupos.get(chave);
  }
  idsPlanejadas.forEach((id) => grupoDe(mapT.get(id)).planejadas.push(mapT.get(id)));
  concluidas.forEach((t) => grupoDe(t).concluidas.push(t));

  const blocos = [];
  metas.forEach((m) => { if (grupos.has(m.id)) blocos.push({ meta: m, g: grupos.get(m.id) }); });
  if (grupos.has('sem')) blocos.push({ meta: null, g: grupos.get('sem') });
  const semDados = blocos.length === 0;

  const ROTULO_VEREDITO = { no_caminho: '🟢 no caminho', em_risco: '🟡 em risco', fora_da_rota: '🔴 fora da rota' };
  const verPorMeta = new Map(vereditos.map((v) => [v.meta_id, v.veredito]));

  function htmlGrupo({ meta, g }) {
    const tempoConcl = g.concluidas.reduce((s, t) => s + t.estimativa_min, 0);
    const area = meta ? (areas.find((a) => a.id === meta.area_id) || null) : null;
    const vAtual = meta ? verPorMeta.get(meta.id) : null;
    return `<div class="card cartao-relatorio" style="border-left:6px solid ${area ? area.cor : 'var(--borda)'}">
      <strong>${meta ? esc(meta.titulo) : 'Sem meta vinculada'}</strong>
      <p class="rel-numeros">${g.planejadas.length} planejada(s) × ${g.concluidas.length} concluída(s)
        <span class="meta-texto">· ${fmtMin(tempoConcl)} estimados concluídos</span></p>
      ${g.planejadas.length ? `<p class="meta-texto">Planejadas na semana:</p>
        <ul class="lista-simples">${g.planejadas.map((t) =>
          `<li class="meta-texto">${esc(t.titulo)}${idsConcluidas.has(t.id) ? ' ✓' : ''}</li>`).join('')}</ul>` : ''}
      ${g.concluidas.length ? `<p class="meta-texto">Concluídas na semana:</p>
        <ul class="lista-simples">${g.concluidas.map((t) =>
          `<li class="meta-texto">${esc(t.titulo)} <span class="meta-texto">(${fmtMin(t.estimativa_min)})</span></li>`).join('')}</ul>` : ''}
      ${meta ? `<div class="veredito-grupo" data-meta="${meta.id}">
        ${Object.entries(ROTULO_VEREDITO).map(([k, l]) =>
          `<button type="button" class="btn btn-mini vbtn${vAtual === k ? ' sel' : ''}" data-ver="${k}">${l}</button>`).join('')}
      </div>` : ''}
    </div>`;
  }

  elView.innerHTML = `
    <h1>Relatório</h1>
    <p class="meta-texto">Semana de ${fmtData(ini)} a ${fmtData(fim)} · gerado em ${fmtData(dataSP(rel.gerado_em))}</p>
    ${semDados
      ? `<div class="estado-vazio"><p>Semana sem registro.</p>
          <button class="btn btn-primario" data-ir-ritual>Planejar →</button></div>`
      : blocos.map(htmlGrupo).join('') +
        `<button class="btn btn-primario btn-bloco" id="rel-planejar" style="margin-top:16px;">Fechar relatório e planejar semana</button>`}`;

  const elPlanejar = $('#rel-planejar');
  if (elPlanejar) elPlanejar.addEventListener('click', () => { location.hash = '#/ritual'; });
  const elIrRitual = $('[data-ir-ritual]');
  if (elIrRitual) elIrRitual.addEventListener('click', () => { location.hash = '#/ritual'; });

  /* Veredito 1-toque por meta (DEC-013) — upsert no UNIQUE(relatorio_id, meta_id) */
  $$('.veredito-grupo').forEach((grp) => {
    const metaId = grp.dataset.meta;
    $$('.vbtn', grp).forEach((b) => b.addEventListener('click', async () => {
      const { error } = await sb.from('vereditos').upsert(
        { relatorio_id: rel.id, meta_id: metaId, veredito: b.dataset.ver },
        { onConflict: 'relatorio_id,meta_id' });
      if (error) { modalInfo('Não foi possível salvar o veredito. Tente novamente.'); return; }
      $$('.vbtn', grp).forEach((x) => x.classList.remove('sel'));
      b.classList.add('sel');
      toast('Veredito salvo ✓');
    }));
  });
}

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

  $$('[data-sair]').forEach((b) => b.addEventListener('click', async () => {
    await sb.auth.signOut();
    estado.sessao = null;
    location.hash = '#/login';
  }));

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
    if (sessao && filaReenvio.length > 0) reenviarFila();   /* seção 16: reexecuta pós-login */
  });

  window.addEventListener('online', reenviarFila);          /* J4: replay ao reconectar */

  window.addEventListener('hashchange', navegar);
  navegar();
}

iniciar();
