# Search Metasearch V8 — catálogo real + universo persistido

## Problema observado em produção

A busca simplificada melhorou a UX, mas o recall continuou insuficiente. O diagnóstico no Supabase mostrou que o problema não era apenas de interface:

- perfis recentes ainda retornavam `source_count` entre 0 e 1;
- buscas de Embedded Finance, DCM e Healthtech podiam terminar com zero candidatas;
- a tela mostrava principalmente candidatas recém-inseridas, escondendo empresas relevantes já presentes na base;
- o projeto já possui um universo muito maior do que o Quick Search estava consumindo.

Snapshot observado antes desta versão:

- `capital_market_events`: ~285 mil registros;
- `discovered_company_candidates`: ~1,3 mil registros;
- `monitoring_outputs`: ~24,6 mil registros;
- `source_documents`: ~12,8 mil registros;
- Source Catalog com fontes reais e saudáveis como Finsiders, Startups.com.br, Brazil Journal, NeoFeed, InfoMoney, Exame, Bloomberg Línea e Valor.

## Objetivo V8

Transformar o Quick Search de uma busca centrada em Google News em um **metabuscador de originação**, usando o patrimônio de dados já construído pelo projeto e preservando a governança do cérebro mestre.

Fluxo:

`linguagem natural -> tese estruturada -> fontes do catálogo + web + universos conhecidos -> dedupe/corroboracao -> resultados -> revisao humana -> Company Master/Lead`

## 1. Catálogo real de fontes

`backend/src/lib/discoverySourceCatalog.ts` consulta o `source_catalog` real no Supabase e seleciona fontes públicas/ativas/saudáveis apropriadas para descoberta.

As fontes RSS implementadas sobre Google News preservam duas identidades distintas:

- **transporte:** `google-news-rss`;
- **fonte editorial:** código real do Source Catalog, por exemplo `src_finsiders_rss`.

Isso evita transformar o agregador em fonte de verdade e mantém lineage até a publicação que gerou a correspondência.

## 2. Lentes source-specific

Além das lentes gerais, cada fonte elegível recebe uma consulta `site:<domain>` orientada à tese, crédito, recebíveis, funding e estrutura.

As consultas são executadas em paralelo com `Promise.allSettled`, de forma que uma fonte lenta ou indisponível não derruba a busca inteira.

## 3. Universo persistido

A busca passa a consultar também `discovered_company_candidates`.

Isso resolve dois problemas:

1. conhecimento já capturado deixa de ficar invisível em uma nova busca;
2. uma empresa não precisa ser inserida novamente para aparecer como resultado relevante.

A seleção do universo persistido é ranqueada por aderência ao perfil e à tese. Veículos regulatórios oriundos de `capital_market_event:*` ficam fora por padrão para não inundar buscas de originação com nomes de fundos; eles entram quando a consulta explicitamente pede histórico de emissões/FIDC existente.

## 4. Novas vs. já mapeadas

O endpoint de execução passa a devolver todas as correspondências encontradas naquela execução:

- `new`: nova candidata persistida;
- `existing_candidate`: já existe na fila/base de descoberta;
- `company_master`: já existe como empresa canônica.

A idempotência do banco é preservada: somente novas `dedupe_key`s são inseridas.

O frontend mostra os três estados de forma explícita. Portanto `candidates_inserted = 0` não significa mais “nenhum resultado”.

## 5. Corroboração

Quando a mesma empresa aparece em várias lentes/fontes, o merge mantém:

- `discoveryLanes`;
- `corroboratingSources`;
- `corroboratingEvidence`;
- contador de hits corroborantes.

A confiança pode subir moderadamente, com cap, sem transformar recorrência editorial em prova de qualificação financeira.

## 6. Governança preservada

Esta versão não altera:

- RLS;
- schema do banco;
- qualification;
- pattern engine;
- score;
- ranking;
- regra de promoção.

A revisão humana continua obrigatória antes de uma candidata se tornar Company Master/Lead. Nenhuma evidência de mídia cria automaticamente uma conclusão de crédito.

## Critério de aceite pós-deploy

Reexecutar as mesmas teses que apresentaram baixo recall e comparar com o baseline:

1. `Embedded finance com pressão de capital e necessidade de funding`;
2. `Empresas com sinais de prontidão para DCM`;
3. `Healthtechs com potencial de Debêntures`;
4. `Empresas com recebíveis que podem ter fit para FIDC`;
5. `Fintechs com potencial para FIDCs`.

Esperado:

- `source_count` materialmente acima de 0–1 quando as fontes estiverem saudáveis;
- `candidates_found` maior e menos dependente de manchete literal;
- resultados já mapeados visíveis mesmo quando `candidates_inserted = 0`;
- `source_ref` identificando fontes do catálogo quando aplicável;
- nenhuma promoção automática;
- tempo de resposta limitado pelo maior timeout paralelo, e não pela soma das fontes.
