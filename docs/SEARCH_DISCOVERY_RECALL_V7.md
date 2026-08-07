# Search Discovery Recall V7

## Problema observado em produção

Após a publicação da busca em linguagem natural, o fluxo passou a persistir UUIDs reais e executar discovery de forma correta, mas o recall ficou baixo e a experiência ainda parecia travada.

Evidência operacional observada em 2026-08-07:

- buscas reais de Quick Search retornaram apenas 0 a 5 candidatas em vários casos;
- `source_count` aparecia como 0/1 mesmo quando o produto conceitualmente deveria explorar múltiplas fontes/lentes;
- cada clique em `Buscar empresas` criava um novo `search_profile`, gerando perfis duplicados para a mesma sessão de busca;
- a tela aguardava `GET /search-profiles` antes de renderizar o formulário, apesar de a listagem histórica não ser necessária para iniciar uma nova busca;
- o discovery dependia de uma única consulta literal ao Google News RSS para buscas rápidas que não pediam explicitamente universo VC;
- o parser ainda aceitava fragmentos de manchete como nomes de empresa em padrões como `FIDCs no agronegócio: Basf` e `Fintech de energia solar, Solfácil`.

## Mudança de produto

Princípio aplicado: **descobrir amplamente primeiro; qualificar depois**.

A frase do usuário representa uma tese de originação, não uma expressão que precisa existir literalmente em uma manchete. A busca agora abre essa tese em até cinco lentes paralelas:

1. `direct`: frase original;
2. `universe`: universo de empresas relacionado ao tema;
3. `credit`: crédito, financiamento, antecipação e recebíveis;
4. `funding`: captação, dívida, funding, capital e crescimento;
5. `structure`: termos específicos da estrutura sugerida (FIDC, debênture/DCM, warehouse, nota comercial, CRI/CRA).

As lentes rodam em paralelo com timeout individual limitado. O resultado é consolidado, deduplicado e limitado antes de entrar na fila de revisão.

## Recall sem perder governança

- máximo consolidado: 60 candidatas por execução;
- máximo por lente de notícias: 25 itens;
- timeout por lente: 4,5 segundos;
- portfólios VC continuam condicionados a intenção explícita de startup/venture/portfolio para não poluir buscas não relacionadas;
- nenhum hit vira Company Master ou Lead automaticamente;
- Capture Inbox e revisão humana continuam obrigatórios;
- hits corroborados por mais de uma lente recebem pequeno aumento de confiança, limitado a 0,78, com lineage das lentes no `raw_payload`.

## Qualidade de entity extraction

O parser foi ampliado para tratar:

- novos verbos de manchete, incluindo `conclui/concluiu`, `obtém/obteve`, `garante`, `cria`, `planeja` e `contrata`;
- prefixos temáticos com dois-pontos: `FIDCs no agronegócio: Basf capta...` → `Basf`;
- descritores antes do nome: `Fintech de energia solar, Solfácil levanta...` → `Solfácil`;
- aliases: `Provu, ex-Lendico, capta...` → `Provu`;
- rejeição adicional de títulos genéricos e chamadas editoriais.

## Performance percebida

A Quick Search deixa de bloquear a tela enquanto carrega o catálogo de buscas anteriores. O formulário aparece imediatamente; o status histórico é carregado em background.

Durante a execução o usuário recebe fases reais do processo:

- `Preparando busca...`;
- `Consultando fontes em paralelo...`;
- `Consolidando e removendo duplicatas...`.

O UUID do perfil passa a ser estável durante a sessão de busca. Reexecuções refinam/upsertam o mesmo perfil. Um novo UUID só é criado ao clicar em `Nova busca`.

## Métricas

`search_profile_runs.source_count` passa a representar o número de lentes/fontes que responderam com sucesso, e não apenas `1` quando existia qualquer hit.

A interface exibe:

- correspondências encontradas;
- candidatas novas;
- quantidade de lentes que responderam;
- estado de dedupe/revisão.

## Arquivos impactados

- `backend/src/lib/discoveryCapture.ts`
- `backend/src/services/searchProfileCaptureService.ts`
- `frontend/src/pages/QuickSearchPage.tsx`
- `scripts/frontend-quality-contract.test.mjs`

Não há migration de banco nesta entrega.
