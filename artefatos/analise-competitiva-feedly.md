# Análise competitiva — Stalo vs. Feedly (posicionamento e pivot)

> Análise fria de posicionamento registrada em 2026-07-07, em resposta ao questionamento sobre competir com o Feedly. Não é compromisso de escopo — é um raio-x estratégico para orientar decisão. Ancorada em `produto.md` (wedge/funil, tese não-notícia, evidência rastreável, COGS por scan).

## Enquadramento

**Stalo e Feedly não fazem o mesmo job.** Tratar isso como "eu vs. Feedly" já é meio caminho pro erro estratégico.

- **Feedly** resolve o problema de **volume**: agregar e filtrar o que você já escolheu seguir (RSS + Leo prioriza/deduplica/resumo *dentro das suas fontes*).
- **Stalo** se propõe a resolver o problema de **sentido**: a conexão não-óbvia entre setores, virada em **tese acionável**.

## 1. Competitividade — diferenças estratégicas

| | Feedly | Stalo |
|---|---|---|
| **Job** | "O que está saindo nas fontes que sigo?" | "Onde está a oportunidade no cruzamento entre setores?" |
| **Natureza** | Ferramenta de *input* (agrega, filtra, resume) | Ferramenta de *output* (sintetiza, gera tese) |
| **Unidade de valor** | A notícia priorizada | A tese acionável (por que conecta / por que agora / e daí) |
| **Setup** | Usuário traz e cura as fontes (RSS) | LLM descobre via busca web, zero curadoria |
| **Garantia** | Determinístico — não perde nada do que segue | Probabilístico — gera hipóteses, pode alucinar |

**Onde o Feedly é imbatível (não competir aqui):**
- **Cobertura e recall** — pipeline de ingestão maduro; não se perde uma fonte seguida. O Stalo é amostral e enviesado pelo que o LLM achou.
- **Confiança/determinismo** — analista sério desconfia de output generativo; Feedly mostra artigos reais de feeds reais.
- **Fosso B2B real** — o motor de receita deles é **Feedly for Threat Intelligence / Market Intelligence**: vertical, sales-led, sticky, com compliance, integrações e colaboração de time.
- **Hábito e lock-in** — feeds curados por anos + Leo treinado + integrações plugadas.

**As brechas (onde o Stalo joga):**
- **Leo filtra, não raciocina entre domínios.** Síntese cross-setorial em tese acionável **não é o produto deles** — é explicitamente o do Stalo.
- **Fricção de cold-start** — Feedly exige montar/curar feeds; o Stalo entrega valor sem o usuário trazer nada.
- **Genérico pro job de "me ache um ângulo investível"** — Feedly dá uma mangueira pra ler; não dá um brief rankeado de interseções com por-que-agora.

**Ressalva crítica:** a brecha é **rasa de defender**. Síntese sobre busca web é, no fundo, *um bom prompt*. O concorrente perigoso **não é o Feedly** — é o **ChatGPT/Claude com deep research** (faz a síntese cross-setorial quase de graça) e um eventual update do Leo.

## 2. Custo de mudança — dá pra fazer um usuário Feedly migrar?

**Não, e não se deveria querer isso.** Migração é o lente errado:

1. **O lock-in do Feedly é alto e o Stalo não o reduz — contorna.** O diferencial (tese cross-setorial) é forte como *valor distinto*, fraco como gatilho de *rip-and-replace* (é outro workflow). O analista racional roda **os dois**: Feedly pra cobertura, Stalo pra síntese. Logo o alvo natural **não** é o power-user do Feedly — é quem **não** usa Feedly (acha pesado/ruidoso): founder, anjo, scout júnior, quem quer o *so-what*.
2. **O lock-in do próprio Stalo hoje é ~zero.** Workspace por cookie, sem conta, sem dado acumulado, sem preferência aprendida. Esse é o problema estratégico maior que o Feedly. Pré-requisito antes de sonhar com migração: **razão pra alguém voltar na semana 2** — biblioteca de teses acumuladas, preferências aprendidas, histórico de "o que virou verdade".

## 3. Termômetro do pivot — 3 sinais de que competir aqui não cola

1. **Retenção/hábito não forma (o mais letal).** Retenção de coortes *ativadas* (rodaram ≥1 scan e salvaram ≥1 ideia) despencando pra perto de zero na semana 4 (~**<15–20% voltando**) = novidade de uma sessão, não ferramenta. É a §6 do `produto.md` ("1x/semana sem fricção") falhando.
2. **Rendimento de insight baixo (qualidade do core).** **Save-rate** (% de teses salvas) ínfimo, ou **taxa de "vale investigar"** das salvas baixa, ou **obvious/false-positive-rate** alto = LLM produzindo "chute bonito" plausível-mas-inútil. Se não acha o não-óbvio, perde a única razão de existir.
3. **Demanda pagante do wedge não fecha a conta.** Cada scan = 2 chamadas de LLM (uma com busca web) = COGS real. Wedge (scout/anjo) que elogia mas **não paga** preço que cubra COGS, ou **CAC do nicho >> LTV**, quebra a unit economics. Sinal composto: scouts elogiam sem adotar **e** founders grátis churnam sem indicar (funil furado, sem loop viral).

**Regra:** se **2 dos 3** acenderem por 6–8 semanas com tráfego real, é pivot.

## 4. Caminhos alternativos — 3 pivots reaproveitando o que existe

Ativo reaproveitável: **pipeline de 2 estágios** (Coletor busca-web + Analista cruza), **extração estruturada** (NewsItem/Insight), **evidência rastreável**, **grafo**, **persistência de ideias**, UI. É um *motor de síntese cross-setorial com evidência*, não um leitor de notícias.

**A. Pivot de nicho — ir fundo em UM vertical (o mais barato de testar).**
Em vez de "quaisquer setores de tech", virar o radar de interseção de **um domínio onde colisão = dinheiro e há comprador** (ex. *Energia/Clima × Compute*, *Saúde × IA*) como ferramenta de **deal-sourcing** pra VCs de tese / corp dev. Profundidade vertical = prompts melhores, fontes curadas, **defensibilidade real** (some a vantagem do LLM genérico), poder de cobrar. Muda o escopo dos temas + tuning do Analista; o resto fica.

**B. Pivot de público — de self-serve pra "analista-em-caixa" B2B.**
Empacotar a síntese como **brief de inteligência gerenciado por firma** (deal-flow/trend memo semanal) vendido a **fundos de VC / times de estratégia**, com humano no loop opcional, entrega via Slack/Notion (já no roadmap). Pipeline vira backend; o produto vira o *brief entregue*. Mata o risco #1 (retenção), pois o valor não depende do usuário voltar ao app.

**C. Pivot de aplicação — reapontar o motor pra inteligência competitiva/de mercado.**
Mesmo motor, outro job **que empresas já orçam**: monitorar concorrentes + setores adjacentes de uma empresa e cuspir **ameaças/oportunidades com evidência e so-what** (o "memo pro board" que a landing já esboça na lente *estratégia corporativa*). Barra de confiança mais baixa que investimento, comprador com budget existente, deliverable = "alguém conecta os pontos por mim".

## Bottom line

Não posicionar como "vencer o Feedly" — nesse frame perde-se (cobertura, confiança, fosso B2B, hábito). O risco real não é o Feedly; é **(a)** não ter lock-in nenhum e **(b)** o diferencial ser um prompt que um LLM genérico replica. Caminho com futuro: **estreitar** (vertical A, ou público B2B B/C) até ter profundidade e um comprador que já paga, e construir a **biblioteca de teses acumuladas** como fosso. Horizontal + consumidor grátis + "melhor que o Feedly" é o cenário morno pra todos que o próprio `produto.md` §2 já alerta.
