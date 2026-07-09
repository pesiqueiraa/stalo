# Mergulho diferenciado por tipo de insight

Data: 2026-07-09 · Branch: `feat/jornada`

## Problema

O mergulho (mapa de mercado) é idêntico para os três tipos de insight. Cada tipo
faz, na verdade, uma pergunta central diferente — e o mergulho deve refletir isso
com visual e análise próprios, sem quebrar a taxonomia universal.

## Princípio (reconciliação com arquiteturad §7)

A taxonomia dos três tipos é universal (glifos/cores fixos). Mantemos isso
separando dois eixos:
- **Tipo** decide *quais perguntas o mergulho faz* (seções de análise) + o *acento
  visual* (cor da taxonomia) + um *herói animado* próprio. Usa as cores/glifos que
  já existem — reforça a taxonomia, não a embaralha.
- **Lente** (founder/investor/explorer) continua decidindo o *tom/direção* dentro
  das seções (como hoje).

Assim não viramos matriz 3×3 hardcoded: 3 estruturas, cada uma temperada pela lente.

## O que cada tipo é

| Tipo | Cor | Pergunta central | Herói (masthead animado) |
|---|---|---|---|
| ▲ Tendência | verde `#3DDC97` | Isso é real e onde estamos na curva? | curva que se desenha subindo + pulso "você está aqui" |
| ◆ Gap | vermelho `#FF6B6B` | Por que ninguém está aí, e dá pra atravessar? | dois setores nas margens + ponte tracejada cruzando o vão |
| ★ Oportunidade | âmbar `#FFB13D` | Qual o primeiro movimento? | cunha avançando pelos anéis até o alvo (beachhead) pulsando |

(O nome interno da oportunidade na UI é "O alvo".)

## Estrutura do mergulho (por tipo)

Ordem:
1. **Cabeçalho de tese** — acento na cor do tipo.
2. **Herói animado** (masthead decorativo, o "chama atenção" — SVG+CSS, por tipo).
3. **Cobertura ao longo do tempo** — dado real (CoverageChart), em todos.
4. **Análise específica do tipo** (as seções únicas — ver abaixo).
5. **Quem já joga aqui / Onde o valor se acumula / Jogadas análogas** — o mapa
   (espinha comum aos três; especialmente afiado no gap).
6. **Próximos passos** · **Sinais a observar**.
7. **Análise financeira** — 2º nível sob demanda.

### Seções únicas por tipo (geradas pela IA)

Um bloco `typeAnalysis` no `DeepDive`, discriminado por `kind` (= o tipo do insight):

- **tendência** `{ kind:"tendencia", estagio, aceleradores[], freios[] }`
  - estagio: emergente/acelerando/consolidando + 1 frase. **Leitura qualitativa da
    IA, não medida** — rotulada como hipótese, nunca número (mesma disciplina do
    score de confiança removido).
  - aceleradores: 2–3 forças que empurram · freios: 1–2 que seguram.
- **gap** `{ kind:"gap", porqueAberto, cemiterio, aPonte }`
  - porqueAberto: a barreira (técnica/regulatória/incentivo) que manteve o vão.
  - cemiterio: quem tentou e por que falhou (ou "sem tentativas conhecidas").
  - aPonte: o que faria a ponte entre os dois lados.
- **oportunidade** `{ kind:"oportunidade", beachhead, menorTeste }`
  - beachhead: o primeiro alvo/cunha concreto.
  - menorTeste: o menor teste que confirma a hipótese.

## Backend

- `runDeepDive` escolhe schema + prompt pelo `idea.type` (3 variantes que
  compartilham a espinha: market + proximosPassos + sinais). A busca web e a lente
  seguem como no mapa de mercado. Prompts no módulo compartilhado `scanPrompt.ts`.
- Cada variante instrui só o bloco do seu tipo — prompt focado, melhor qualidade
  que um schema com campos vazios.

## Dados / migração

- `DeepDive` ganha `typeAnalysis: TypeAnalysis` (união discriminada por `kind`).
  `market`, `proximosPassos`, `sinais` seguem. Sem mudança de schema SQL (JSONB).
- "Já mergulhado" passa a checar `deepDive?.typeAnalysis` — mergulhos sem ele
  (inclusive os "market-only" desta sessão) re-geram na abertura.

## Frontend

- Novo componente `DiveHero` (3 variantes animadas, SVG+CSS) — masthead por tipo.
- `DeepDiveView` renderiza o bloco `typeAnalysis` conforme `idea.type`, e aplica
  a classe de acento do tipo na folha (`dive-sheet dive-accent-<tipo>`).
- CSS: acento por tipo (cor de eyebrow, número de seção, tags de tese) + estilos do
  herói e dos blocos de análise.
- `toMarkdown` inclui o bloco do tipo na exportação.

## Arquivos afetados

`packages/shared` (tipos), `packages/server` (`scan.ts`: 3 schemas + branch;
`scanPrompt.ts`: prompts por tipo), `apps/web` (`DiveHero.tsx` novo,
`DeepDiveView.tsx`, `globals.css`), `artefatos/arquiteturad.md` §7.

## Fora de escopo

- Mudar o brief, o scan ou o grafo (só o mergulho).
- Layouts totalmente bespoke por tipo (bespoke "total") — mantemos a espinha comum.
- Framework de testes (verificação por dirigir o app).
