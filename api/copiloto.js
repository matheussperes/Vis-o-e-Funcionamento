/* ════════════════════════════════════════════════════════════════
   api/copiloto.js — Vercel Serverless Function (DEC-027 · Bloco 3)
   Proxy seguro: ANTHROPIC_API_KEY só em variável de ambiente.

   Desenho: O SCORE DECIDE, A IA EXPLICA.
   O frontend envia a fila JÁ ORDENADA pelo motor determinístico
   (RN-01/05/06/09/12). A IA não re-prioriza: explica a nº 1, dá o
   primeiro passo concreto e só desvia se o contexto do usuário
   tornar a nº 1 inviável — dizendo explicitamente que desviou.
   Resposta: UMA ação principal (nunca 3 opções).
   ════════════════════════════════════════════════════════════════ */

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ erro: 'Método não permitido' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ erro: 'ANTHROPIC_API_KEY não configurada nas variáveis de ambiente do Vercel.' });
  }

  const { agora, contextoUsuario, fila, bloqueadas, vencidas, comprasPendentes, prazosProjetos } = req.body || {};
  if (!Array.isArray(fila) || fila.length === 0) {
    return res.status(400).json({ erro: 'Payload inválido: fila ausente ou vazia.' });
  }

  const systemPrompt = `Você é o Copiloto do "Visão e Funcionamento", o painel pessoal de Matheus — empreendedor solo (móveis planejados + projetos digitais) com TDAH combinado; a dor central dele é paralisia de decisão.

A FILA QUE VOCÊ RECEBE JÁ ESTÁ ORDENADA por um score determinístico (quadrante de Eisenhower + impacto no caixa/esforço + proximidade de prazo + sequência de dependências). VOCÊ NÃO RE-PRIORIZA.

SEU PAPEL:
1. A ação principal DEVE ser a tarefa na posição 1 da fila — exceto se o contexto do usuário a tornar inviável agora (ex.: pouca energia e ela é pesada; 30 min livres e ela exige 2h). Nesse caso, escolha a PRIMEIRA da fila que caiba no contexto e declare no motivo que está desviando do score e por quê.
2. Responda com UMA ação principal. Nunca apresente opções equivalentes.
3. "primeiro_passo": a menor ação física e concreta para destravar o início (use os passos pendentes da tarefa, se enviados; senão, deduza um início óbvio e pequeno).
4. "plano_b": opcional, no máximo 1, apenas como rota de escape ("se travar na principal, faça X"). Pode ser null.
5. "alertas": somente riscos reais — projeto com prazo em ≤7 dias com trabalho pendente relevante, ou tarefas vencidas. Array vazio se nada crítico. Não invente urgência.
6. Tom: direto, concreto, sem filosofia, sem elogios vazios. Português do Brasil.

FORMATO — responda SOMENTE com JSON válido, sem texto antes/depois, sem markdown:
{
  "acao": {
    "titulo": "tarefa exata da fila",
    "projeto": "projeto dela",
    "motivo": "por que ela é a ação de agora (1-2 frases; se desviou do score, diga e justifique)",
    "primeiro_passo": "menor ação concreta para começar",
    "tempo": "estimativa (ex: 45 min)"
  },
  "plano_b": { "titulo": "...", "projeto": "...", "quando": "em que situação recorrer a ela" } ou null,
  "alertas": [ { "projeto": "...", "descricao": "o que está crítico e em quanto tempo" } ],
  "observacao": "1 frase opcional se houver algo importante além da ação" ou null
}`;

  const userMessage = `AGORA: ${JSON.stringify(agora || {})}
CONTEXTO LIVRE DO USUÁRIO: ${contextoUsuario ? `"${contextoUsuario}"` : '(nenhum)'}

FILA ORDENADA PELO SCORE (posição 1 = prioridade do motor):
${JSON.stringify(fila, null, 1)}

TAREFAS BLOQUEADAS POR SEQUÊNCIA (contexto, não elegíveis agora): ${JSON.stringify(bloqueadas || [])}
TAREFAS VENCIDAS NO TOTAL: ${vencidas || 0}
COMPRAS PENDENTES: ${JSON.stringify(comprasPendentes || [])}
PRAZOS DOS PROJETOS: ${JSON.stringify(prazosProjetos || [])}

Qual é a ação de agora?`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 800,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Anthropic API error:', response.status, errorText);
      return res.status(502).json({ erro: `Erro na API do Claude (${response.status}).` });
    }

    const anthropicData = await response.json();
    const texto = (anthropicData?.content || [])
      .filter((b) => b.type === 'text').map((b) => b.text).join('') || '';
    if (!texto) return res.status(502).json({ erro: 'Resposta vazia. Tente novamente.' });

    let parsed;
    try {
      parsed = JSON.parse(texto.replace(/```json\n?/gi, '').replace(/```\n?/gi, '').trim());
    } catch (e) {
      console.error('JSON parse error:', e, '\nResposta:', texto);
      return res.status(502).json({ erro: 'Resposta inválida do Copiloto. Tente novamente.' });
    }

    if (!parsed.acao || !parsed.acao.titulo) {
      return res.status(502).json({ erro: 'Estrutura de resposta inválida. Tente novamente.' });
    }

    return res.status(200).json({
      acao: parsed.acao,
      plano_b: parsed.plano_b || null,
      alertas: Array.isArray(parsed.alertas) ? parsed.alertas : [],
      observacao: parsed.observacao || null
    });
  } catch (err) {
    console.error('Copiloto handler error:', err);
    return res.status(500).json({ erro: 'Erro interno. Tente novamente.' });
  }
}
