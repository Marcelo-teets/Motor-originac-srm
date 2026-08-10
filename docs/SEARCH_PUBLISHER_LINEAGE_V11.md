# Search Publisher Lineage V11

## Contexto

O smoke real do V10 provou que a combinação recall + entity normalization + relevance gate funciona em produção:

- 15 lentes;
- 69 hits brutos;
- 50 entidades normalizadas;
- 16 entidades rejeitadas;
- 22 resultados rejeitados por irrelevância à tese;
- 28 candidatas finais;
- 4 novas.

O mesmo smoke revelou duas lacunas restantes:

1. `“Escolhida” da John Deere, goFlux lança FIDC...` ainda virava a entidade `“Escolhida” da John Deere`, quando a marca real observada na manchete é `goFlux`.
2. Matérias claramente publicadas por Finsiders continuavam com `source_ref=google-news-rss`, misturando transporte com fonte editorial.

## V11

### 1. Editorial lead → marca real

A normalização passa a reconhecer uma forma estreita e segura de lead editorial entre aspas seguido por marca depois da vírgula:

`“Escolhida” da John Deere, goFlux` → `goFlux`

A regra é deliberadamente estreita para não converter qualquer trecho pós-vírgula em empresa.

### 2. Publisher attribution

Novo `discoveryPublisherAttribution.ts` separa:

- transporte: como o conteúdo chegou ao motor;
- publisher: quem efetivamente publicou a evidência;
- Source Catalog: se esse publisher é uma fonte governada conhecida.

A primeira implementação usa o sufixo de publisher que o Google News inclui no título, por exemplo:

`a55 ... - Finsiders Brasil`

O nome é canonizado e comparado somente com fontes editoriais saudáveis/ativas do `source_catalog`.

Exemplo governado:

`Finsiders Brasil` → `Finsiders RSS` → `src_finsiders_rss`

Nesse caso:

- `sourceRef` passa a ser `src_finsiders_rss`;
- `transportSourceRef` continua `google-news-rss`;
- `publisherAttribution.version=v11` registra método, fonte original, fonte governada e domínio do catálogo;
- `corroboratingSources` incorpora a fonte editorial.

### 3. Publisher desconhecido não é inventado

Se a manchete indicar um publisher que ainda não existe no Source Catalog — por exemplo `AgFeed` — o sistema preserva:

- `publisherName=AgFeed`;
- `publisherAttribution.matched=false`;
- transporte original.

O sistema não cria silenciosamente um `source_ref` fictício. A inclusão de uma nova fonte continua sendo decisão de Source Governance.

## Quality Gate

O contrato de search discovery agora cobre:

- `“Escolhida” da John Deere, goFlux` → `goFlux`;
- versionamento da entity normalization V11;
- Finsiders Brasil → `src_finsiders_rss`;
- preservação de `google-news-rss` como transporte;
- publisher desconhecido preservado sem source code inventado.

## Governança

Nenhuma mudança em qualification, patterns, score ou ranking. Publisher attribution melhora somente lineage/evidência. Promoção para Company Master/Lead continua condicionada à revisão humana e às regras de identidade vigentes.
