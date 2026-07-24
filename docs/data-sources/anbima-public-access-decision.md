# ANBIMA Data — decisão de integração pública

## Resumo executivo

A ANBIMA Data é útil para consulta e corroboracão de informações de mercado de capitais, mas o portal público não será tratado como uma API de integração do Motor Originação.

Decisão:

- manter ANBIMA Data como fonte oficial de pesquisa manual e validação cruzada;
- não consumir endpoints BFF internos como contrato de produção;
- não automatizar datasets marcados como restritos;
- automatizar apenas downloads públicos, explícitos, estáveis e compatíveis com os termos de uso;
- tratar ANBIMA Feed como produto separado, dependente de assinatura/contrato.

## Probe executado

Data: 24/07/2026

Ambiente: GitHub Actions, Chromium headless, sem autenticação, sem credenciais e sem persistência.

Superfícies verificadas:

1. Home ANBIMA Data.
2. Dataset Ofertas públicas — Séries.
3. Dataset Debêntures — Precificação ANBIMA.
4. Busca pública de debêntures.
5. Características de debênture.
6. Preços e PU histórico de debênture.
7. Página pública de FIDC.
8. Dados periódicos do FIDC.

Resultado técnico:

- 8/8 páginas carregadas;
- 25 respostas JSON públicas observadas;
- 46 endpoints relevantes observados;
- zero arquivos de download obtidos;
- zero credenciais utilizadas;
- zero linhas persistidas.

## Classificação das superfícies

### Ofertas públicas — Séries

Classificação: **restrita**.

Evidências:

- o título oficial retornado pela própria página é `Ofertas públicas - Séries (restrito)`;
- a interface exibe amostra e campos, mas não apresentou download público reutilizável no probe;
- endpoints BFF respondem anonimamente para a interface, porém não constituem API oficial documentada para integração.

Decisão: não automatizar.

Alternativa no Motor:

- CVM Ofertas Públicas, já integrada;
- dados públicos B3 quando houver arquivo/download oficialmente disponibilizado.

### Debêntures — Precificação ANBIMA

Classificação: **consulta pública / corroboracão**.

Capacidades observadas:

- data de referência;
- código do ativo;
- emissor;
- remuneração;
- vencimento;
- taxa indicativa;
- PU indicativo;
- intervalos e duration;
- histórico de PU em páginas públicas de ativo.

A interface apresentou botão de download, mas nenhum arquivo foi observado pelo navegador automatizado. Portanto, o Motor não adotará o BFF interno como substituto do download.

Decisão: manter como fonte de pesquisa manual até existir download público estável ou contrato ANBIMA Feed.

### Busca e detalhes de debêntures

Classificação: **consulta pública / validação cruzada**.

Campos observados:

- emissor e CNPJ;
- código B3 e ISIN;
- emissão e série;
- volume e quantidade;
- coordenadores;
- agente fiduciário;
- registro CVM;
- data de emissão;
- vencimento;
- remuneração;
- PU histórico.

Decisão: usar como evidência auxiliar em análise humana, não como conector automático.

### FIDC

Classificação: **consulta pública parcial**.

A página do fundo exibiu dados de cadastro, patrimônio, cota, classe/subclasse e regulamento. A superfície BFF específica de FIDC retornou HTTP 418 durante o probe.

Decisão: não implementar conector baseado nessa superfície.

Alternativas no Motor:

- CVM FIDC cadastro e informes mensais;
- documentos regulatórios do fundo;
- ANBIMA somente para validação manual complementar.

## Regra de governança

Um endpoint observado no navegador não é automaticamente uma fonte aprovada para integração.

Para virar runtime, a fonte deve cumprir todos os critérios:

1. ser oficial;
2. ser gratuita ou contratualmente autorizada;
3. possuir acesso explicitamente público para uso automatizado;
4. ter contrato estável ou download versionado;
5. permitir rastreabilidade e reprocessamento;
6. não depender de contorno de proteção, sessão ou área restrita;
7. ter valor incremental sobre CVM/B3/BCB já integrados.

## Uso permitido no produto

- link de evidência no Company Detail;
- checklist de diligência;
- corroboracão de emissão, vencimento, remuneração e preço;
- pesquisa manual de comparáveis;
- validação por analista antes de reunião ou comitê.

## Uso não permitido

- paginação automática do BFF interno;
- download de dataset restrito;
- tratamento do portal web como API pública documentada;
- integração ANBIMA Feed sem assinatura;
- geração de sinais automáticos exclusivamente a partir de endpoint não documentado.

## Próxima revisão

Reavaliar quando ocorrer uma das situações:

- publicação de API pública/documentada;
- download público estável com licença/termos claros;
- contratação do ANBIMA Feed;
- disponibilização de fonte equivalente oficial na B3 com melhor contrato de dados.
