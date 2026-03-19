# Plano de evolução da solução SRM para originação DCM

## Diagnóstico do estado atual

O repositório ainda está em estágio inicial e hoje não materializa a proposta de valor descrita para o produto. No momento há apenas um `README.md` mínimo e um `tsconfig.json`, sem código de aplicação, sem modelagem de dados, sem integrações externas e sem processos de ingestão, enriquecimento ou monitoramento.

Isso significa que a oportunidade principal não é apenas “melhorar o que já existe”, mas transformar o projeto em uma plataforma de inteligência comercial e de mercado para DCM com base em dados proprietários + dados públicos + automação analítica.

## Objetivo de produto

Construir uma plataforma web que permita:

1. mapear startups, scale-ups e empresas de base tecnológica brasileiras e middle market;
2. identificar empresas com potencial para operações de mercado de capitais, especialmente DCM;
3. enriquecer continuamente a base com sinais financeiros, societários, operacionais e de mercado;
4. acompanhar mudanças relevantes em tempo quase real;
5. priorizar contas usando scoring, alertas e copilotos com LLM.

---

## O que precisa existir na arquitetura

## 1. Camada de coleta de dados

### Fontes prioritárias

**Dados cadastrais e societários**
- Receita Federal / CNPJ e quadro societário;
- juntas comerciais e diários oficiais;
- CVM, B3 e sites de RI para emissores comparáveis;
- bases públicas de licitações, processos e sanções para risco reputacional.

**Sinais de mercado e negócio**
- LinkedIn company signals (headcount growth via fornecedor autorizado ou parceiro de dados);
- vagas abertas em páginas de carreira;
- notícias, press releases e clipping setorial;
- tráfego web (quando houver fornecedor);
- app ranking / presença digital / marketplaces / redes sociais.

**Dados financeiros indiretos**
- balanços publicados quando disponíveis;
- protestos, recuperações, rating, debêntures comparáveis, emissões passadas;
- fornecedores pagos de crédito e risco, quando aprovados.

### Mecanismos de coleta
- **APIs oficiais e comerciais** como fonte principal para reduzir fragilidade operacional;
- **scrapers modulares** para fontes sem API;
- **jobs agendados** para atualização recorrente;
- **fila de eventos** para reprocessamento e monitoramento.

### Recomendação técnica
- orquestração com **Temporal**, **Airflow** ou **Prefect**;
- scrapers em **Python** (Playwright, httpx, BeautifulSoup, selectolax);
- serviços de API e produto em **TypeScript/NestJS** ou **Next.js + API routes**;
- mensageria com **SQS**, **RabbitMQ** ou **Kafka** conforme volume.

---

## 2. Camada de tratamento e normalização de dados

Esse é o ponto mais crítico. Sem isso, enrichment e tracking viram ruído.

### Entidades principais
- `company`
- `company_alias`
- `company_identifier` (CNPJ, domínio, LinkedIn, app id, ticker, CVM code)
- `founder_executive`
- `funding_event`
- `debt_signal`
- `legal_event`
- `news_event`
- `monitoring_signal`
- `relationship_note`
- `source_record`

### Regras de tratamento necessárias
- padronização de razão social, nome fantasia e domínio;
- deduplicação por CNPJ + domínio + similaridade de nome;
- entity resolution para empresas do mesmo grupo;
- versionamento de atributos (ex.: headcount, receita estimada, estágio, status operacional);
- score de confiança por atributo e por fonte;
- trilha de auditoria para saber “quem disse o quê e quando”.

### Melhorias recomendadas
- criar pipeline `raw -> staged -> curated -> analytics`;
- armazenar payload bruto da coleta antes de transformar;
- usar chaves imutáveis por fonte e uma chave canônica por empresa;
- aplicar testes de qualidade com Great Expectations ou dbt tests.

---

## 3. Camada de data enrichment

O diferencial do produto estará no enrichment orientado a tese de DCM.

### Enriquecimentos com alto valor comercial
- setor, subsetor e tese de investimento;
- estágio de maturidade e momento de capital;
- sinais de necessidade de funding;
- capacidade potencial de emissão e faixa indicativa;
- perfil de governança e prontidão para mercado de capitais;
- comparáveis de dívida e equity;
- histórico de captações, M&A e expansão;
- intensidade tecnológica e relevância de software/IP;
- crescimento do time, expansão geográfica e abertura de novas unidades.

### Como gerar enrichment
- regras determinísticas para atributos objetivos;
- modelos supervisionados para probabilidade de fit com DCM;
- LLM para extrair fatos de documentos, notícias e sites;
- embeddings + busca semântica para agrupar empresas por tese;
- inferência baseada em sinais agregados quando não houver dado financeiro explícito.

### Padrão recomendado
Cada atributo enriquecido deve ter:
- valor;
- explicação resumida;
- fonte(s);
- timestamp;
- score de confiança;
- método de geração (`rule`, `model`, `llm`, `manual`).

---

## 4. Camada de scoring e priorização comercial

A plataforma deve sair do “cadastro rico” para “motor de originação”.

### Scores recomendados

**Fit DCM Score**
Combina:
- porte da empresa;
- previsibilidade de receita;
- governança percebida;
- intensidade de expansão;
- necessidade potencial de funding;
- comparáveis de mercado;
- histórico de dívida/captação.

**Momentum Score**
Combina:
- notícias recentes;
- contratações;
- mudanças societárias;
- lançamento de produto;
- rodada recente;
- expansão geográfica;
- novas certificações, contratos ou clientes âncora.

**Readiness Score**
Combina:
- documentação disponível;
- presença de demonstrações financeiras;
- clareza societária;
- maturidade de gestão;
- sinais de compliance e governança.

**Relationship Score**
Combina:
- interações do time comercial;
- temperatura do pipeline;
- existência de sponsors internos;
- introduções via fundos, advisors ou ecossistema.

---

## 5. Camada de monitoramento e tracking

Sem monitoramento contínuo a base envelhece muito rápido.

### Eventos que devem disparar alertas
- alteração de quadro societário;
- mudança de diretoria;
- notícias sobre captação, dívida, M&A ou expansão;
- crescimento ou queda abrupta de headcount;
- publicação de demonstrações financeiras;
- protestos, ações judiciais relevantes ou recuperação judicial;
- nova emissão comparável no setor;
- mudanças no site institucional, landing pages ou página de RI.

### Estratégia recomendada
- monitoramento diário para notícias e sinais digitais;
- monitoramento semanal para sites, perfis institucionais e carreira;
- monitoramento mensal para bases cadastrais e societárias;
- política de TTL por atributo para forçar refresh automático.

### Saídas de monitoramento
- feed por empresa;
- alertas por carteira/watchlist;
- resumos semanais por segmento;
- tarefas automáticas para o CRM.

---

## 6. Uso de LLM de forma prática

LLM não deve substituir a base estruturada; deve acelerar análise, extração e navegação.

### Casos de uso recomendados

**Extração estruturada**
- extrair fatos de notícias, PDFs, releases e páginas institucionais;
- resumir eventos e mapear impacto potencial em DCM;
- identificar menção a capex, expansão, dívida, funding ou reestruturação.

**Copiloto do banker / analista**
- “por que essa empresa entrou no radar?”;
- “quais sinais nos últimos 90 dias sugerem fit para dívida?”;
- “quais comparáveis de emissões existem no setor?”;
- “gere um briefing executivo antes de uma reunião”.

**Pesquisa e navegação**
- busca semântica por teses (“empresas SaaS B2B lucrativas com expansão internacional”);
- clustering de empresas por similaridade;
- sumarização de carteira e watchlists.

### Guardrails importantes
- sempre mostrar fontes e evidências;
- não permitir que o LLM invente atributos financeiros sem confiança explícita;
- persistir extrações estruturadas separadas do texto livre;
- usar revisão humana em fluxos críticos.

---

## 7. APIs internas e externas

### APIs internas que o produto deve expor
- `GET /companies`
- `GET /companies/:id`
- `GET /companies/:id/timeline`
- `GET /companies/:id/signals`
- `GET /companies/:id/scores`
- `POST /companies/:id/refresh`
- `POST /watchlists`
- `GET /alerts`
- `POST /copilot/query`

### Integrações externas desejáveis
- CRM (HubSpot, Salesforce, Pipedrive);
- data warehouse / BI;
- provedor de e-mail e alertas;
- fornecedores de crédito e dados corporativos;
- serviços de observabilidade.

---

## 8. Banco de dados e analytics

### Stack recomendada

**Transacional**
- PostgreSQL com modelagem relacional para entidades canônicas.

**Busca**
- OpenSearch/Elasticsearch ou Postgres full-text + pgvector no início.

**Analítico**
- BigQuery, Snowflake ou ClickHouse conforme escala.

**Objetos/documentos**
- S3 compatível para HTMLs, PDFs, payloads brutos e snapshots.

### Padrão de modelagem
- banco operacional para jornada do usuário;
- data lake/lakehouse para dados brutos e histórico;
- mart analítico para scores, dashboards e cohorts.

---

## 9. Front-end que realmente ajuda o time comercial

A aplicação web deve ser construída em torno de workflow, não apenas consulta.

### Telas prioritárias
- dashboard com radar de oportunidades;
- search com filtros por tese e score;
- página da empresa com timeline de sinais, score e evidências;
- watchlists por banker/setor;
- fila de validação humana para enrichment sensível;
- cockpit de monitoramento e alertas.

### UX recomendada
- filtros salvos;
- explicabilidade do score;
- comparação entre empresas;
- histórico de mudanças;
- exportação para memo/comitê/CRM.

---

## Roadmap sugerido por fases

## Fase 1 — Fundamentos (4 a 6 semanas)
- definir modelo de dados canônico;
- subir PostgreSQL e object storage;
- criar serviço backend principal;
- implementar ingestão de CNPJ + sites + notícias;
- criar pipeline `raw/staged/curated`;
- tela básica de listagem e detalhe da empresa.

**Resultado esperado:** primeira base navegável com atualização controlada.

## Fase 2 — Enrichment e monitoramento (6 a 10 semanas)
- adicionar scrapers modulares e fila de jobs;
- gerar timeline de eventos;
- implementar scoring inicial por regras;
- criar watchlists, alertas e refresh automático;
- adicionar busca semântica com embeddings.

**Resultado esperado:** plataforma já útil para prospecção e acompanhamento.

## Fase 3 — Copiloto e inteligência comercial (8 a 12 semanas)
- extratores com LLM para notícias/PDFs/sites;
- copiloto por empresa e por carteira;
- score híbrido regra + modelo;
- integração com CRM;
- dashboards de cobertura, conversão e aging da base.

**Resultado esperado:** motor de originação orientado a tese e produtividade.

---

## Backlog técnico inicial sugerido

### Dados
- [ ] criar schema relacional base para `company`, `source_record`, `event`, `score` e `watchlist`;
- [ ] implementar deduplicação por CNPJ/domínio/nome;
- [ ] versionar atributos enriquecidos;
- [ ] adicionar política de qualidade por fonte.

### Coleta
- [ ] criar conector de CNPJ;
- [ ] criar coletor de website institucional;
- [ ] criar coletor de notícias com classificação por relevância;
- [ ] criar framework de scrapers com retries, proxy e observabilidade.

### Enrichment
- [ ] classificar setor e tese;
- [ ] inferir estágio e momento de capital;
- [ ] gerar score de fit com DCM;
- [ ] extrair fatos com LLM e guardar evidência.

### Produto
- [ ] dashboard de oportunidades;
- [ ] detalhe da empresa com timeline;
- [ ] watchlists e alertas;
- [ ] busca semântica e filtros avançados.

### Operação
- [ ] logs estruturados;
- [ ] métricas de coleta e freshness;
- [ ] fila de revisão humana;
- [ ] política de LGPD, auditoria e controle de acesso.

---

## KPIs para saber se a plataforma está funcionando
- cobertura de empresas-alvo por segmento;
- percentual da base com CNPJ, domínio e setor confiáveis;
- freshness média por atributo crítico;
- taxa de deduplicação correta;
- número de sinais novos por semana;
- empresas com score alto adicionadas ao pipeline;
- conversão de empresa monitorada em reunião / mandato / operação;
- tempo economizado por analista na preparação de materiais.

---

## Próximo passo recomendado

Em vez de começar pelo front-end, o projeto deve iniciar pelo **núcleo de dados**. A melhor sequência é:

1. modelagem canônica de empresas e eventos;
2. pipeline de ingestão e normalização;
3. enrichment com evidência e score de confiança;
4. monitoramento com alertas;
5. interface web e copiloto LLM sobre dados já confiáveis.

Se o time quiser, o próximo artefato ideal é um **MVP técnico** com:
- schema inicial do banco;
- arquitetura de serviços;
- fila de jobs;
- contratos de API;
- backlog priorizado em issues.
