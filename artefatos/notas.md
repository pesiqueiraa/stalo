# Notas — ajustes pendentes e ideias futuras

Duas coisas vivem aqui, em seções separadas:

- **Pendentes**: ajustes concretos de produto/UX identificados no dia a dia de uso, dentro do que já é MVP — diferente do `roadmap.md` (que é sobre features novas fora do escopo do MVP). Cada item: o problema, a proposta de ajuste e o status. Ao implementar, marque como feito e mova um resumo pra o changelog do git (não precisa manter histórico longo aqui).
- **Ideias para depois**: anotações soltas que não são nem ajuste ao MVP atual nem item maduro o suficiente pra `roadmap.md` — só pra não esquecer.

## Pendentes

### 1. Ideia salva perde contexto com o tempo

**Problema:** hoje uma ideia salva (`SavedIdea`) guarda só `id`, `type`, `title`, `description` e `savedAt`. Se o usuário salva um gap/tendência/oportunidade e volta meses depois, não tem como lembrar quais notícias embasaram aquele insight — o resumo/descrição é curto demais pra reconstituir o contexto, e as notícias relacionadas (`related_items` do insight) não são persistidas junto. Como o grafo mostra sempre o *último* scan, o vínculo com as notícias originais se perde assim que um novo scan roda.

**Ajuste aplicado:** `SavedIdea` ganhou `relatedItems: NewsItem[]` — um retrato das notícias relacionadas (título, resumo, fonte, link, data de publicação) tirado no momento do save, dentro de `saveIdea` (`apps/web/src/app/page.tsx`). O card em `IdeasPanel` mostra essas notícias numa lista expansível (`<details>`). Ideias salvas antes dessa mudança continuam funcionando, só sem a lista (tratadas como se não tivessem notícias relacionadas). O schema proposto em `arquiteturad.md` seção 4 já reflete isso (`news_items.published_at`, `saved_ideas.related_items`).

De quebra, notícias no grafo (nós, tooltip, painel de detalhe) agora também mostram a data de publicação (`publishedAt`), então dá pra situar uma notícia no tempo mesmo antes de salvar a ideia.

**Status:** implementado.

## Ideias para depois (ainda não faz sentido priorizar)

Coisas que vale registrar pra não esquecer, mas que não devem ser implementadas agora — nem são ajustes ao MVP atual, nem estão maduras o suficiente pra virar item de `roadmap.md`. Servem como matéria-prima pra decisão futura.

### Aba de recap semanal de notícias

Uma aba separada do grafo interativo, com um resumo consolidado das notícias/insights da semana entre os temas monitorados — algo mais parecido com um digest de leitura rápida do que com a exploração visual do grafo.

Depende de coisas que ainda não existem: histórico de scans navegável (hoje só guardamos o último scan) e algum tipo de agregação entre múltiplos scans ao longo da semana — ambos já aparecem como backlog separado em `roadmap.md` ("Histórico de scans navegável" e "Scan agendado"). Faz sentido revisitar essa ideia depois que essas peças existirem.

### Score de confiança do cruzamento

A ideia: cada insight do brief carregaria um nível de confiança (quão sólido é aquele cruzamento entre setores), usado para ranquear o memo e dar um sinal de trust ao público exigente (scout/estrategista). Chegou a ser implementado como um campo `confidence` (`alta`/`media`/`baixa`) preenchido pelo próprio Analista, com medidor visual no brief — e foi **removido**.

Por que adiar: a versão que veio (autoavaliação do LLM num scan único) é **subjetiva demais** para ser exibida como sinal — o modelo tende a inflar a própria confiança, e o número não corresponde a nada mensurável. A versão que valeria a pena é **objetiva**: confiança derivada de **recorrência** — "esse mesmo cruzamento apareceu em N scans ao longo do tempo". Isso é sinal medido, não opinião, e casa com o público profissional (amplitude + tempo; ver `produto.md` §2-3).

Depende de peças que ainda não existem: **histórico de scans** e **deduplicação/matching semântico** entre insights de scans diferentes (para saber que dois cruzamentos são "o mesmo") — ambos já no `roadmap.md`. O ranqueamento do brief hoje é por evidência (nº de notícias que sustentam a tese), o que segura o lugar até lá. Revisitar quando o histórico acumular volume suficiente para a recorrência significar algo.

### Aba dedicada só para ideias salvas

Hoje "Minhas ideias salvas" é uma sidebar fixa e compacta ao lado do grafo — funciona como lembrete rápido, mas não como um lugar pra de fato trabalhar em cima das ideias (revisar, comparar, filtrar por tipo/tema, ler o contexto completo sem o espaço apertado da coluna lateral). Uma aba própria (fora do grafo) daria mais espaço pra isso, especialmente depois que a ideia salva passou a carregar mais contexto (notícias relacionadas, seção "Pendentes" item 1).

Ainda não está claro o suficiente pra virar tarefa: falta decidir se é uma aba de verdade (navegação por rota) ou um modo de visualização alternado na mesma tela, e o que exatamente merece destaque nessa visão que a sidebar não dá conta (filtro por tipo? por tema monitorado? busca?). Revisitar quando o volume de ideias salvas no uso real deixar a sidebar claramente insuficiente.

> **Nota:** o "Deep dive num insight salvo" (Mergulhar nessa/nesse …) que ficava aqui como ideia futura **já foi implementado** e saiu desta lista. Hoje é uma feature real: o botão do card dispara `POST /api/ideas/:id/dive`, que roda uma análise fundo via IA no servidor, persiste em `saved_ideas.deep_dive` (com cache pra não re-gastar a IA) e renderiza em `DeepDiveView`. Ver `artefatos/arquiteturad.md` para o fluxo.
