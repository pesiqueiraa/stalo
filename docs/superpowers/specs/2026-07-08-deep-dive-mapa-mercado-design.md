# Deep dive como mapa de mercado + gráfico de cobertura

Data: 2026-07-08 · Branch: `feat/jornada`

## Problema

O deep dive (mergulho) ficou parecido demais com o brief. Mapeando seção a seção,
~5 das 8 seções do mergulho re-apresentam a tese que o brief já entrega
(Panorama ≈ description+rationale; "O que cruza" = as mesmas notícias; "Por que
conecta" e "E daí?" são idênticos ao brief; "Por que agora" ocupa o mesmo slot).
Só "Próximos passos", "Sinais" e o "Financeiro" são conteúdo novo. Daí a sensação
de déjà vu.

## Decisão de produto

O mergulho vira um **mapa de mercado**: onde o brief diz "aqui está o gap", o
mergulho diz "aqui está quem já está perto dele e onde o dinheiro se acumula". É
o segundo andar de valor para o público-alvo (scout/analista de VC, `produto.md`
§2), não um eco. Escopo escolhido: **mapa como protagonista, mantendo os pedaços
que já eram bons** (próximos passos, sinais, financeiro); cortando a repetição.

## O que construir

### 1. Layout do novo mergulho

Cabeçalho de tese enxuto (tipo, título, frase de efeito, e um "relembrar a tese"
recolhível com `rationale`/`whyNow` que já vêm da ideia salva — **sem regenerar**).
Depois, a sequência:

1. **📈 Cobertura ao longo do tempo** — gráfico (§2)
2. **🗺 Quem já joga aqui** — players diretos/adjacentes (IA + busca)
3. **🔗 Onde o valor se acumula** — quem captura valor na cadeia (IA + busca)
4. **📊 Jogadas análogas** — plays parecidos em outros mercados + a lição (IA)
5. **☐ Próximos passos** — mantido
6. **⚠ Sinais a observar** — mantido
7. **💰 Análise financeira** — mantida como 2º nível sob demanda

Cortadas como seções: Panorama, O que cruza, Por que conecta, Por que agora,
E daí?. Narrativa: **cenário → o que fazer → o que observar**.

### 2. Gráfico de cobertura (escopo honesto)

Componente novo `CoverageChart`, **puro cliente, zero IA**, construído das datas
(`publishedAt`) das notícias que sustentam a ideia (`idea.relatedItems`).
**Histograma por período** (barras = nº de notícias por janela), não linha suave:
com 2–8 notícias, curva sugere precisão falsa; barras mostram honestamente o
*formato* da cobertura (pico isolado, onda, gotejar).

Rótulo: "Cobertura ao longo do tempo · N notícias que sustentam esta ideia".
**Nunca** "em alta"/"tendência" — a regra do `notas.md`/`roadmap.md` (tendência
real exige recorrência entre múltiplos scans, que não existe). É o formato da
evidência que temos, não alegação sobre o mundo.

Binning: escolher a largura da janela pelo span total (ex.: ≤ ~21 dias → por dia;
até ~3 meses → por semana; acima → por mês), pra 3–8 barras legíveis. Notícias
sem `publishedAt` válido ficam fora do gráfico (mas continuam na lista de fontes).

### 3. Mapa de mercado (IA + busca web)

**Uma única chamada** `responses.parse` com `web_search` habilitado + saída
estruturada (mesmo padrão do Coletor em `scan.ts`), produzindo mapa + passos +
sinais juntos (um round-trip; passos/sinais se beneficiam da mesma pesquisa).

Travas de honestidade **no prompt** (reintroduzimos busca, então anti-alucinação
migra do "sem busca" para a instrução):
- só nomear players que realmente encontrou, **com link/fonte** por player
  (rastreável, como as notícias — princípio "rastreável até a evidência");
- quando achar pouco, dizer "cenário ainda aberto" em vez de inventar nomes;
- continua sendo hipótese, nunca certeza; PT-BR, alfabeto latino, prosa (sem
  citar notícias por id).

Schema novo (dentro de `DeepDive`):
```
market: {
  players: { nome, oQueFaz, relacao: "direto" | "adjacente", url }[]
  ondeValor: string
  analogas: { nome, licao }[]
}
```

**Risco técnico (a resolver na implementação):** o Coletor usa `gpt-4.1-mini`
porque suporta `web_search`; o mergulho atual usa `gpt-5.4` (sem busca, melhor
síntese). O mapa precisa das duas coisas. Testar qual modelo com busca dá
qualidade aceitável; se o mini for fraco pra síntese, avaliar modelo de busca
mais forte (mais custo). Reforça o mergulho como feature de tier pago
(`produto.md` §8), o que está alinhado. Rate limiting do endpoint de dive já
existe.

### 4. Dados, schema e migração

`DeepDive` (em `@stalo/shared`) ganha `market: MarketMap | null` e mantém
`proximosPassos`/`sinais`; `panorama`/`porQueAgora` continuam no tipo (opcionais)
só pra não quebrar JSON antigo, mas **saem do render**. Persistência continua em
`saved_ideas.deep_dive` (JSONB) — **sem mudança de schema SQL**.

**Migração:** mergulhos já salvos não têm `market`. O "já mergulhado" passa a
checar `deepDive?.market` (em vez de `deepDive != null`), então uma ideia antiga
re-gera na próxima abertura — uma chamada única, custo pontual. Aceitável para
app early-stage.

### 5. Arquivos afetados

- `packages/shared/src/types.ts` — tipo `DeepDive` + `MarketMap`.
- `packages/server/src/scan.ts` — `DeepDiveSchema` + `runDeepDive` com busca.
- `packages/server/src/scanPrompt.ts` — prompt do mapa com as travas (módulo
  compartilhado, regra 4 do CLAUDE.md).
- `apps/web/src/components/DeepDiveView.tsx` — reestruturado.
- `apps/web/src/components/CoverageChart.tsx` — novo.
- `apps/web/src/app/globals.css` — estilos do mapa + gráfico.
- Lógica de "já mergulhado" (IdeasPanel / radar page) → checar `deepDive?.market`.
- `artefatos/arquiteturad.md` §7 — decisão durável (regra 3 do CLAUDE.md).

## Fora de escopo

- Histórico entre scans / tendência real de cobertura (roadmap).
- Framework de testes (projeto não tem; verificação por dirigir o app).
- Mudança no brief, no scan ou no grafo.
