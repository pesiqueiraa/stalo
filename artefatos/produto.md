# Stalo — o radar de tendências

## 1. Problema

Acompanhar notícias de vários setores de tecnologia ao mesmo tempo é lento e disperso. Ler manualmente não escala, e as conexões mais valiosas — onde dois setores diferentes se cruzam e abrem um gap de mercado — são exatamente as mais fáceis de perder num feed linear de notícias.

## 2. Usuário-alvo

Stalo é um **canal de estratégia** para quem precisa detectar cruzamentos entre setores antes dos outros. Isso é **um único job**, servido em três níveis de disposição a pagar e de sofisticação — não três mercados paralelos. Mirar nos três ao mesmo tempo é o erro clássico: cada um puxa produto, preço e motion de venda para um lado, e o resultado fica morno para todos. Por isso há um **wedge** e um **funil**, não três alvos simultâneos.

- **Wedge (alvo primário, quem paga):** scout de VC / analista / anjo. Tem a dor de forma aguda, tem orçamento próprio, e o output do produto — "esses dois setores estão cruzando e abre um gap" — é literalmente matéria-prima de tese de investimento / deal flow. Motion self-serve, que a arquitetura atual já suporta.
- **Topo do funil (grátis, aquisição + validação):** fundador solo / empreendedor early-stage, uso esporádico. É quem valida a qualidade do insight e alimenta o funil, mas é o mais sensível a preço e o mais churny — por isso vive no tier grátis, não no pago.
- **Expansão (depois):** times de inovação / estratégia / inteligência competitiva em empresas. Orçamento maior, mas motion sales-led (procurement, segurança, seats) — lento demais para agora. Entra quando "times/workspaces" (ver `roadmap.md`) fizer sentido, sobre a tração do wedge.

**Realidade do MVP hoje:** o produto é **100% grátis e sem contas** (decisão de 2026-08: o Supabase Auth no free tier pausava por inatividade e derrubava o app; como o Stalo é peça de portfólio, sem plano de monetização, o login saiu). Cada visitante tem um **workspace anônimo** por cookie (`stalo_wid`, 1 ano): só vê os próprios temas/scans/ideias, e os dados vivem enquanto o cookie durar — limpar cookies ou trocar de aparelho recomeça do zero (trade-off aceito). O freio de custo de IA é **4 scans por janela de 2 horas**, amarrado a IP + cookie (apagar o cookie não renova; trocar de IP não renova) — mitigação invisível, sem fricção de cadastro.

## 3. Proposta de valor

- **Sem esforço de curadoria manual:** o usuário escolhe os temas, o sistema busca e resume.
- **A unidade de valor não é a notícia, é a tese:** o produto prioriza cruzamentos entre setores — tendência, gap, oportunidade — e os entrega como uma tese acionável (o *por que conecta*, o *por que agora* e o *e daí?*), com as fontes que a sustentam. Para o público-alvo (scout/estrategista), uma conexão só vale se for **rastreável até a evidência** e vier com um *so-what* explícito.
- **A saída principal é um brief priorizado, não um grafo:** o público exigente quer o "memo da manhã do analista" — as N oportunidades da semana rankeadas (hoje por evidência), cada uma com tese e fontes. O grafo deixa de ser o protagonista e vira a camada de *explorar o mapa* / evidência visual de como as conexões se ligam (ver `arquiteturad.md`).
- **De insight a ideia salva em um clique:** qualquer tese relevante vira um item guardado, pronto para virar hipótese a ser validada — e, no tier pago, aprofundada em deep dive / análise financeira.

## 4. Histórias de usuário (MVP)

1. Como usuário, quero configurar quais setores/temas eu monitoro, para focar o radar no que me interessa.
2. Como usuário, quero clicar em "atualizar" e receber notícias recentes resumidas sobre esses temas, para não precisar ler tudo manualmente.
3. Como usuário, quero ver as notícias e as conexões entre elas visualmente (grafo), para enxergar padrões que não apareceriam numa lista.
4. Como usuário, quero que o sistema aponte explicitamente quando algo parece uma tendência, um gap de mercado ou uma oportunidade, para não depender só da minha leitura subjetiva.
5. Como usuário, quero salvar essas ideias sinalizadas com um clique, para não perdê-las.
6. Como usuário, quero que meus temas e ideias salvas persistam entre sessões, para o radar funcionar como uma ferramenta de uso contínuo, não descartável.

## 5. Escopo do MVP

### Dentro do escopo
- Cadastro de até 5 temas monitorados (adicionar/remover), sem necessidade de login.
- Busca sob demanda (botão "Atualizar notícias") que aciona um LLM com acesso à busca web.
- Extração estruturada de notícias (título, resumo curto, fonte, link, palavras-chave) e de insights (tendência / gap / oportunidade), com validação de formato.
- Visualização em grafo: notícias como nós coloridos por tema; insights como nós destacados; conexões baseadas em palavras-chave compartilhadas e em insights relacionados a notícias específicas.
- Interação por clique: notícia abre detalhe com link para a fonte; insight abre detalhe com opção de salvar.
- Persistência de temas monitorados e ideias salvas entre sessões.

### Fora do escopo (MVP)
- Múltiplos usuários e autenticação.
- Atualização automática/agendada (o MVP é 100% sob demanda).
- Notificações (e-mail, push).
- Deduplicação semântica entre notícias parecidas de scans diferentes.
- Pontuação/priorização automática de ideias salvas.
- Exportação para ferramentas externas (Notion, Slack etc.).
- Aplicativo mobile nativo.

Esses itens de fora do escopo estão detalhados como backlog em `ROADMAP.md`.

## 6. Critérios de sucesso do MVP

Não são métricas de produto em escala (o MVP tem um usuário) — são critérios qualitativos de validação pessoal:

- O radar é usado pelo menos 1x por semana sem fricção perceptível de UX.
- Pelo menos 1 ideia salva por semana é considerada "vale a pena investigar mais" pelo usuário.
- Pelo menos 1 ideia salva, dentro de 4-6 semanas de uso, vira o ponto de partida de uma conversa real com um potencial cliente (fechando o loop com o processo de descoberta de cliente).

## 7. Riscos conhecidos

- **Qualidade da busca web do LLM pode variar** — nem toda "tendência" sinalizada será genuinamente nova ou acionável. O produto deve ser tratado como um gerador de hipóteses, não como fonte de verdade.
- **Viés de confirmação:** o usuário pode passar a só validar ideias que o radar sugere, em vez de continuar explorando fontes primárias (conversas com o setor). Vale reforçar isso na UX (ex: nunca apresentar um insight como certeza).
- **Dependência de uma única API de LLM** — decisão consciente para o MVP, revisitar se custo ou disponibilidade virarem problema.

## 8. Monetização (exploração — pós-validação)

Nada aqui é compromisso de escopo. É a estratégia registrada para **não tomar decisão de produto que feche portas de receita** antes da hora. Só faz sentido executar depois que o MVP estiver validado em uso real (ver critérios da §6) e que multi-usuário/autenticação entrem (ver `roadmap.md`).

### Premissas que moldam qualquer modelo

- **O custo é variável por uso, não zero.** Cada scan são duas chamadas de LLM, uma com busca web — isso é COGS real. Plano com "scans ilimitados" sangra a margem. Qualquer modelo precisa de teto de uso (temas, scans/mês) ou créditos. **Pré-requisito de precificação: conhecer o custo por scan** (medir a partir de `packages/server/src/scan.ts`).
- **Quem tem o problema pode não ser quem paga.** O público de validação (founder/estudante early-stage, §2) é o mais sensível a preço e o mais churny. O valor central — detectar cruzamentos entre setores que viram oportunidade — tem ROI direto para outro perfil: **analistas de VC / scouts / anjos, times de inovação/estratégia/inteligência competitiva, consultores e agências de tendência.** Hipótese a testar: manter o early-stage como topo de funil grátis e desenhar o tier pago para o perfil investidor/estrategista.

### Escada de valor (grátis → pago)

O tiering espelha o wedge (§2): **grátis serve o fundador que usa esporadicamente; pago serve o scout/estrategista que usa como ferramenta de trabalho.** A fronteira coincide com o que era "fora do escopo do MVP" (§5) e o backlog do `roadmap.md` — grátis = radar manual; pago = o radar trabalha sozinho e entrega tese, não só conexão.

| Grátis — fundador, uso esporádico | Pro — scout / estrategista |
|---|---|
| Scan manual, sob demanda | Scan manual + agendado/automático (cron) |
| Poucos scans/mês (teto baixo) | Teto alto de scans + créditos para excedente |
| Até 3 temas | Mais temas |
| Brief básico + grafo | Brief com scoring por recorrência (aparece em N scans — ver `notas.md`) |
| — | Deep dive + análise financeira por ideia (IA) |
| — | Notificações / digest por e-mail |
| — | Exportar para Notion/Slack/Docs |
| Lista de ideias | Dedup semântico + priorização/scoring de ideias |
| Uso individual | (Expansão enterprise) Times/workspaces compartilhados |

### Modelo candidato

Freemium com **assinatura + teto de uso** (a assinatura inclui N scans/mês; excedente via créditos). A assinatura dá receita previsível; o teto/crédito casa preço com o COGS. Revisitar contra alternativas (só créditos pré-pagos; por assento em times) quando houver dados reais de uso.