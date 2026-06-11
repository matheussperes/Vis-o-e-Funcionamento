/* Testes da lógica pura — extrai o bloco entre marcadores do app.js e valida
   RN-01 (score), RN-05 (caixa só profissional), RN-06 (vencida), RN-09 (fila),
   DEC-024 (desempate) e os critérios CA-08, CA-09, CA-10, CA-11, CT-01. */
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const ini = src.indexOf('/* === LOGICA PURA INICIO ===');
const fim = src.indexOf('/* === LOGICA PURA FIM === */');
if (ini < 0 || fim < 0) { console.error('Marcadores da lógica pura não encontrados'); process.exit(1); }
const bloco = src.slice(ini, fim);

const sandbox = {};
new Function(`
  ${bloco}
  this.api = { hojeISO, blocoDoHorario, addDiasISO, bonusPrazo, PESO_QUADRANTE,
    scoreTarefa, ehVencida, cmpTarefas, comporFila, fmtMin, fmtData };
`).call(sandbox);
const L = sandbox.api;

let total = 0, falhas = 0;
function ok(cond, nome, detalhe) {
  total++;
  if (cond) { console.log(`  ✓ ${nome}`); }
  else { falhas++; console.log(`  ✗ ${nome}${detalhe ? ' — ' + detalhe : ''}`); }
}

const HOJE = '2026-06-11';   // dia de referência fixo (PI-020 usa 11/06/2026)

console.log('\n[1] RN-01 — bonus_prazo (bordas)');
ok(L.bonusPrazo('2026-06-10', HOJE) === 35, 'vencida → 35');
ok(L.bonusPrazo('2026-06-11', HOJE) === 30, 'hoje → 30');
ok(L.bonusPrazo('2026-06-12', HOJE) === 20, 'hoje+1 → 20');
ok(L.bonusPrazo('2026-06-14', HOJE) === 20, 'hoje+3 (borda) → 20');
ok(L.bonusPrazo('2026-06-15', HOJE) === 10, 'hoje+4 → 10');
ok(L.bonusPrazo('2026-06-18', HOJE) === 10, 'hoje+7 (borda) → 10');
ok(L.bonusPrazo('2026-06-19', HOJE) === 0, 'hoje+8 → 0');
ok(L.bonusPrazo(null, HOJE) === 0, 'sem prazo → 0');

console.log('\n[2] RN-01 + RN-05 — score (CA-08 e CT-01/PI-007: 70 > 40 > 26)');
const tPessoal = { quadrante: 'Q1', prazo: HOJE, impacto_caixa: 0, esforco: 1 };
const tProf = { quadrante: 'Q3', prazo: null, impacto_caixa: 4, esforco: 2 };
const tQ1SemPrazo = { quadrante: 'Q1', prazo: null, impacto_caixa: 0, esforco: 1 };
const s1 = L.scoreTarefa(tPessoal, false, HOJE);
const s2 = L.scoreTarefa(tProf, true, HOJE);
const s3 = L.scoreTarefa(tQ1SemPrazo, false, HOJE);
ok(s1 === 70, `pessoal Q1 prazo hoje = 70 (obtido ${s1})`);
ok(s2 === 26, `profissional Q3 imp4/esf2 sem prazo = 10+4×(6−2) = 26 (obtido ${s2})`);
ok(s3 === 40, `Q1 sem prazo, não profissional = 40 (obtido ${s3})`);
ok(s1 > s2, 'CA-08: tarefa pessoal Q1 com prazo hoje SUPERA profissional Q3 4/2 sem prazo');
const sProfComoPessoal = L.scoreTarefa(tProf, false, HOJE);
ok(sProfComoPessoal === 10, `RN-05: mesma tarefa em área NÃO profissional ignora caixa = 10 (obtido ${sProfComoPessoal})`);

console.log('\n[3] CT-01 — ordenação 70 → 40 → 26');
const trio = [
  { id: 'b', _score: 40, prazo: null, created_at: '2026-06-01T10:00:00Z' },
  { id: 'c', _score: 26, prazo: null, created_at: '2026-06-01T10:00:00Z' },
  { id: 'a', _score: 70, prazo: HOJE, created_at: '2026-06-01T10:00:00Z' }
].sort(L.cmpTarefas);
ok(trio.map((t) => t.id).join(',') === 'a,b,c', `fila exata: ${trio.map((t) => t._score).join(' → ')}`);

console.log('\n[4] RN-06 + CA-11 — vencida sobe na fila');
const venc = { quadrante: 'Q1', prazo: '2026-06-10', impacto_caixa: 0, esforco: 1 };
const sv = L.scoreTarefa(venc, false, HOJE);
ok(sv === 75, `Q1 vencida = 75 (obtido ${sv})`);
ok(sv > s1, 'CA-11: vencida (75) acima de prazo hoje (70)');
ok(L.ehVencida('2026-06-10', HOJE) === true && L.ehVencida(HOJE, HOJE) === false, 'ehVencida: ontem sim, hoje não');

console.log('\n[5] DEC-024 — desempate determinístico');
const e1 = [
  { id: 'semPrazo', _score: 50, prazo: null, created_at: '2026-06-01T08:00:00Z' },
  { id: 'prazoLonge', _score: 50, prazo: '2026-06-20', created_at: '2026-06-01T08:00:00Z' },
  { id: 'prazoPerto', _score: 50, prazo: '2026-06-12', created_at: '2026-06-05T08:00:00Z' }
].sort(L.cmpTarefas);
ok(e1.map((t) => t.id).join(',') === 'prazoPerto,prazoLonge,semPrazo',
  '1º critério: prazo mais próximo primeiro, sem prazo por último');
const e2 = [
  { id: 'nova', _score: 50, prazo: '2026-06-12', created_at: '2026-06-09T08:00:00Z' },
  { id: 'antiga', _score: 50, prazo: '2026-06-12', created_at: '2026-06-01T08:00:00Z' }
].sort(L.cmpTarefas);
ok(e2[0].id === 'antiga', '2º critério: created_at mais antigo primeiro');

console.log('\n[6] RN-09 — blocos de horário (CA-10)');
ok(L.blocoDoHorario(5) === 'manha' && L.blocoDoHorario(11) === 'manha', 'manhã 05:00–11:59');
ok(L.blocoDoHorario(12) === 'tarde' && L.blocoDoHorario(15) === 'tarde' && L.blocoDoHorario(17) === 'tarde',
  'CA-10: 15h → bloco "tarde" (12:00–17:59)');
ok(L.blocoDoHorario(18) === 'noite' && L.blocoDoHorario(23) === 'noite' &&
   L.blocoDoHorario(0) === 'noite' && L.blocoDoHorario(4) === 'noite', 'noite 18:00–04:59');

console.log('\n[7] RN-09 — composição da fila (CA-09 às 9h: pins → bloco atual → demais; sem alocação fora)');
const tarefas = [
  { id: 'pin2', pin_data: HOJE, pin_ordem: 2, _score: 5, prazo: null, created_at: '1' },
  { id: 'pin1', pin_data: HOJE, pin_ordem: 1, _score: 1, prazo: null, created_at: '2' },
  { id: 'manhaAlta', pin_data: null, _score: 80, prazo: null, created_at: '3' },
  { id: 'manhaBaixa', pin_data: null, _score: 20, prazo: null, created_at: '4' },
  { id: 'tardeAlta', pin_data: null, _score: 99, prazo: null, created_at: '5' },
  { id: 'semAloc', pin_data: null, _score: 100, prazo: null, created_at: '6' }
];
const alocs = [
  { tarefa_id: 'manhaAlta', data: HOJE, bloco: 'manha' },
  { tarefa_id: 'manhaBaixa', data: HOJE, bloco: 'manha' },
  { tarefa_id: 'tardeAlta', data: HOJE, bloco: 'tarde' },
  { tarefa_id: 'pin1', data: HOJE, bloco: 'tarde' }
];
const fila = L.comporFila(tarefas, alocs, HOJE, 'manha');
ok(fila.map((t) => t.id).join(',') === 'pin1,pin2,manhaAlta,manhaBaixa,tardeAlta',
  `fila: ${fila.map((t) => t.id).join(' → ')}`);
ok(!fila.some((t) => t.id === 'semAloc'), 'tarefa sem alocação hoje e sem pin NÃO entra na fila');
ok(fila[0].id === 'pin1' && fila[1].id === 'pin2', 'RN-02: pins por pin_ordem sobrepõem score');
ok(fila.indexOf(fila.find((t) => t.id === 'manhaBaixa')) < fila.indexOf(fila.find((t) => t.id === 'tardeAlta')),
  'CA-09: manhã (bloco atual às 9h) antes de tarde, mesmo com score menor');

console.log('\n[8] Formatações (CA-04 usa "4h")');
ok(L.fmtMin(240) === '4h', '240 → 4h');
ok(L.fmtMin(90) === '1h30', '90 → 1h30');
ok(L.fmtMin(30) === '30 min', '30 → 30 min');
ok(L.fmtMin(1380) === '23h', '1380 (seed) → 23h');
ok(L.fmtData('2026-06-30') === '30/06/2026', 'data dd/mm/aaaa');
ok(L.addDiasISO('2026-06-30', 1) === '2026-07-01', 'virada de mês');

console.log(`\nResultado: ${total - falhas}/${total} testes passaram${falhas ? ' — HÁ FALHAS' : ''}`);
process.exit(falhas ? 1 : 0);
