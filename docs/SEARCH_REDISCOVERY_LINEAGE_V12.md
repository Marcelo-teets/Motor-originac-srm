# Search Rediscovery Lineage V12

## Problema

O V11 passou a separar publisher editorial de transporte e a atribuir fontes governadas durante a execução. O smoke real mostrou 23 publishers governados atribuídos em uma rodada de 15 lentes.

Porém, quando uma empresa já existia em `discovered_company_candidates`, a dedupe corretamente evitava novo insert, mas a nova evidência ficava somente na resposta transitória da API. O registro persistido mantinha o `source_ref` e `raw_payload` antigos.

Exemplo observado:

- `a55` foi novamente encontrada em matéria da Finsiders;
- a execução V11 reconheceu publisher governado;
- como `name:a55` já existia, `candidates_inserted=0`;
- o row histórico continuava com `source_ref=google-news-rss`.

Dedupe não pode significar perda de evidência.

## V12

### Rediscovery como evidência incremental

Antes de inserir candidatas novas, o runtime busca as `dedupe_key`s existentes. Para cada candidata já conhecida e não descartada, persiste uma atualização limitada de lineage.

O update não altera:

- `candidate_status`;
- `company_id`;
- `promoted_at`;
- nome canônico;
- decisão humana.

Ele pode atualizar somente:

- `source_ref`, quando a fonte antiga é genérica e a nova observação possui publisher governado comprovado;
- `raw_payload` de lineage;
- `updated_at`.

### Estrutura de auditoria

`raw_payload.rediscovery` registra:

- `version=v12`;
- contador de redescobertas;
- `lastSeenAt`;
- último Search Profile;
- último run;
- última fonte.

`raw_payload.latestObservation` registra:

- fonte e URL atuais;
- evidência atual;
- publisher;
- publisher attribution;
- entity normalization;
- relevance gate.

`corroboratingSources` é unido ao histórico já existente.

### Suppression preservada

Candidatas `discarded/rejected` não são refrescadas e não são reativadas pelo mecanismo. O descarte continua funcionando como suppression record.

## Operação

As atualizações de rediscovery são feitas em lotes concorrentes pequenos para não transformar 20–80 dedupes em uma fila serial de chamadas ao Supabase.

Falha de persistência de lineage não é silenciosa: a captura falha em vez de afirmar que a evidência foi armazenada quando não foi.

## Quality Gate

`test:search-discovery-quality` agora inclui também `candidateRediscoveryLineage.test.ts`, cobrindo:

- promoção de Google News → Finsiders governado;
- publisher desconhecido preservado sem source inventada;
- incremento de contador de rediscovery sem apagar payload histórico;
- suppression de candidatas descartadas;
- ausência de campos de triagem humana no update produzido.

## Governança

V12 continua antes de qualification/patterns/score/ranking e não promove empresas. O objetivo é somente garantir que conhecimento novo sobre uma entidade já conhecida não desapareça por causa da deduplicação.
