# Search Precision & Relevance V10

## Problema observado em produção

O V8 resolveu o gargalo de recall: buscas que antes retornavam poucos resultados passaram a abrir cerca de 15 lentes e, em execuções reais, chegaram a 29–79 correspondências.

O V9 endureceu entity resolution e impediu auto-link fuzzy incorreto ao Company Master, mas a inspeção do lote imediatamente anterior ao rollout revelou um segundo gargalo: uma parte relevante do recall alto ainda era composta por manchetes ou empresas reais sem evidência relacionada à tese de crédito pesquisada.

Exemplos de ruído observado:

- `Antecipação de recebíveis`;
- `Fintech de recebíveis públicos`;
- `Crescimento dos FIDCs`;
- `Crédito privado ganha espaço e`;
- `Banco Central`;
- `Indicium` em matéria sobre prontidão em IA;
- `Uber` em matéria sobre campus corporativo;
- `Caixa de Correio Inteligente` em matéria sobre encomendas em condomínios.

Exemplos de marcas reais que chegavam malformadas e devem ser recuperadas, não descartadas:

- `Antecipação de recebíveis: Stone` → `Stone`;
- `Gigante de recebíveis, fintech Monkey` → `Monkey`;
- `Koin, da Decolar` → `Koin`;
- `CredMei, de antecipação de recebíveis` → `CredMei`;
- `a55 "pivota" e` → `a55`;
- `Portobello "assenta" uma` → `Portobello`.

## Arquitetura V10

O fluxo passa a ser:

Search Profile
→ discovery high-recall
→ entity normalization
→ **profile relevance gate**
→ exact identity resolution
→ dedupe
→ Capture Inbox
→ revisão humana

O novo relevance gate não qualifica crédito e não pontua empresa. Ele apenas impede que uma notícia sem relação material com a tese pesquisada seja persistida como candidata de originação.

## Regras de relevância

O gate usa o `targetStructure` do Search Profile para exigir evidência compatível:

- FIDC: recebíveis, securitização, antecipação, carteira, originação, crédito, financiamento, capital de giro, duplicatas, consignado, parcelamento;
- DCM / Debênture / Nota Comercial: dívida, emissão, captação, funding, mercado de capitais, empréstimo, passivo, debênture;
- Warehouse: funding, carteira, crédito, recebíveis, antecipação, originação;
- CRI/CRA: sinais específicos das respectivas estruturas.

Busca explícita por universo de VC/startups continua podendo usar portfólios como fonte de descoberta, mas portfólio deixa de ser um atalho para transformar qualquer investida em candidata FIDC/DCM.

## Observabilidade

Cada candidato aceito recebe:

`rawPayload.relevanceGate.version = v10`

Cada run passa a registrar:

- hits brutos;
- entidades normalizadas;
- entidades rejeitadas;
- resultados rejeitados por irrelevância à tese;
- candidatas finais;
- nomes reescritos;
- expansões de parceria.

Assim, recall e precision passam a ser auditáveis separadamente.

## Governança preservada

O V10 não altera qualification, patterns, score, ranking ou pipeline. Nenhum resultado é promovido automaticamente. A revisão humana continua obrigatória antes de Company Master / Lead e a qualificação financeira permanece uma etapa posterior à identidade verificada.
