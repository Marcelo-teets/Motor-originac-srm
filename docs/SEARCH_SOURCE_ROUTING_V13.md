# Search Source Routing V13

## Objetivo

Depois de V8–V12, o Quick Search já possui recall amplo, normalização de entidade, relevance gate, publisher lineage e atualização de evidência em rediscovery. O próximo ganho de qualidade vem de escolher fontes diferentes conforme a tese pesquisada, em vez de usar uma prioridade editorial fixa para todas as buscas.

## Novo Source Routing

`discoverySourceCatalog.ts` passa a ordenar as fontes governadas por contexto do Search Profile.

A prioridade considera:

- segmento;
- subsegmento;
- tipo de empresa;
- produto de crédito;
- estrutura alvo;
- consulta em linguagem natural.

Exemplos:

- Agro / AgTech / CRA / crédito rural / frete → mídia especializada de agro recebe prioridade;
- Fintech / embedded finance / consignado / FIDC → Finsiders e mídia fintech recebem prioridade;
- startups / venture / investidas → mídia e universos de startups recebem prioridade;
- DCM / debêntures / mercado de capitais → mídia de negócios generalista governada recebe prioridade.

A regra não remove fontes do catálogo. Ela decide quais entram primeiro no orçamento limitado de lanes source-specific.

## AgFeed

AgFeed foi validado como publisher público especializado em negócios, finanças, inovação e ESG do agro. O próprio site publica conteúdo de finanças e já trouxe casos diretamente úteis à originação, incluindo a goFlux e estruturas de FIDC/antecipação de recebíveis.

A fonte entra no Source Catalog com:

- code: `src_agfeed_rss`;
- domain: `agfeed.com.br`;
- category: `Agro business media`;
- source_type: `rss`;
- provider: `google-news-rss`;
- runtimeScope: `search-discovery`;
- auth: none;
- status: real;
- health: healthy.

Importante: `rss` aqui descreve o transporte público bounded usado pelo motor via Google News RSS. O publisher continua sendo AgFeed e o metadata registra explicitamente `provider=google-news-rss`. Não há scraping autenticado nem atribuição falsa de um feed proprietário.

## Verificação

A migration registra como evidência de verificação:

- homepage pública do AgFeed;
- matéria da goFlux sobre lançamento de FIDC para financiar fretes do agro;
- matéria posterior da goFlux sobre novo FIDC e antecipação de recebíveis.

## Quality Gate

`discoverySourceRouting.test.ts` entra no `test:search-discovery-quality` e protege:

- AgFeed em primeiro lugar numa tese Agro/CRA;
- Finsiders em primeiro numa tese fintech/consignado/FIDC;
- AgFeed não sendo forçado em lanes de uma busca fintech não relacionada;
- mídia geral governada priorizada em DCM.

## Governança

Nenhuma fonte ganha autoridade de qualificação por ser priorizada. Todo conteúdo continua passando por:

Source Catalog → discovery → publisher lineage → entity normalization → relevance gate → exact identity resolution → dedupe/rediscovery → Capture Inbox → revisão humana.

Qualification, patterns, score e ranking continuam posteriores e separados.
