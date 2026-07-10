# Preços e planos (parqueado — não implementado)

> **Status:** desenho parqueado. **Não há pagamento implementado** (sem Stripe/checkout) e não vai ter agora — decisão do Pedro (10/07/2026): não implementar pagamento ainda. Este doc guarda o modelo ideal pra não se perder; a copy correspondente foi **removida da landing** (seção `#planos`) até o pagamento entrar de verdade.
>
> A estratégia por trás disso (por que cobrar, de quem, teto de uso vs. COGS) já vive em [`produto.md` §8](./produto.md) — este doc é só a **materialização em planos** (preços e o que entra em cada um), não repete o racional.

## Por que existe (e por que está parqueado)

O produto tem COGS real por uso (cada scan são duas chamadas de LLM, uma com busca web — ver `produto.md §8`). O modelo precifica isso sem fechar portas de receita cedo demais. Mas cobrar depende de coisas que ainda não existem: **login durável / multi-usuário** (hoje é workspace anônimo por cookie) e **integração de pagamento**. Enquanto isso não entra, os planos ficam aqui, não na UI.

## Os dois planos (como estavam na landing)

Pitch da seção: **"Comece de graça. Assine quando virar rotina."** No grátis você sente o radar ao vivo; no pago ele vira _seu_ (vários temas, boletim do que é seu, histórico acumulando).

### Grátis — R$0
Sentir o produto: um radar ao vivo, um boletim toda semana e um mergulho pra experimentar.

- **Boletim semanal** de uma trilha à escolha no cadastro (IA, SaaS, creator economy…).
- **1 radar** sobre um tema, ao vivo — vê os itens se movendo e o tema monitorado de verdade.
- **1 mergulho completo** pra experimentar (sente o valor uma vez, depois trava).

CTA: "Criar conta grátis".

### Assinatura — R$39/mês _(ou R$390/ano — 2 meses grátis)_
Badge "Recomendado". O radar inteiro, e um boletim que fala do que é seu.

- **Radar cheio:** vários temas, configurados no onboarding.
- **Boletim semanal _personalizado_** sobre o seu radar — "3 coisas mexeram no seu tema essa semana", não uma trilha genérica.
- **Mergulhos à vontade** — até 10 por mês.
- **Histórico e workspace acumulando:** mergulhos salvos, radar crescendo, temas ajustados ao longo do tempo.

CTA: "Assinar o Stalo".

## Como o boletim se encaixa nos planos

O boletim aparece nos DOIS planos, mas são coisas diferentes — e essa distinção importa pro plano da newsletter:

| | Grátis | Pago |
|---|---|---|
| Boletim | Editorial, aquisição, **igual pra todos** (broadcast) | **Personalizado** sobre o radar do próprio usuário |
| Depende de | Só email (mailing list) | Login durável + scan por usuário |
| Papel | Topo de funil, traz gente nova | Retenção / valor de ferramenta de trabalho |

- A **newsletter grátis (broadcast)** é o que está sendo planejado agora (ver a nota "newsletter-plano-de-implem" no Maestri) — não precisa de pagamento nem de login.
- O **digest pago personalizado** é feature futura, entra junto com login + pagamento (este doc).

## Pré-requisitos pra tirar do papel

1. Medir o **custo por scan** a partir de `packages/server/src/scan.ts` (precificar sobre COGS real — `produto.md §8`).
2. **Login durável / multi-usuário** (hoje é cookie anônimo — ver `roadmap.md`).
3. **Integração de pagamento** (gateway, cobrança recorrente, gestão de assinatura).
4. **Teto de uso / créditos** amarrado ao COGS (plano com uso "ilimitado" sangra margem).

## Quando revisitar

Depois do MVP validado em uso real (critérios em `produto.md §6`) e com login/pagamento no escopo. Até lá, isto é referência, não backlog ativo.
