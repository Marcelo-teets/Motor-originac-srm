# LinkedIn + Media Source Expansion

## Objetivo

Adicionar fontes que aumentam a capacidade do Motor de responder:

- o que mudou na empresa;
- por que isso importa financeiramente;
- qual timing de abordagem;
- qual estrutura de crédito pode fazer sentido.

Esta expansão não cria stack paralela. Tudo fica em GitHub + Node/TypeScript + Supabase.

---

## Fontes adicionadas

### LinkedIn

1. `src_linkedin_company_page` — página da empresa
   - URL da página LinkedIn;
   - número de funcionários;
   - faixa de funcionários;
   - seguidores da página;
   - descrição pública;
   - setor, sede e localizações quando disponíveis.

2. `src_linkedin_credit_roles` — cargos agregados relacionados a crédito/risco
   - funcionários em crédito;
   - risco;
   - underwriting;
   - cobrança/collections;
   - tesouraria/funding;
   - mercado de capitais;
   - FP&A/finance.

3. `src_linkedin_company_posts` — narrativa pública da empresa
   - contratações;
   - expansão;
   - produto novo;
   - funding;
   - parceria;
   - narrativa de crédito/risco.

### Mídias / RSS

Fontes adicionadas via Google News RSS com query templates por empresa:

- Exame;
- Brazil Journal;
- Valor Empresas;
- NeoFeed;
- Finsiders;
- Startups.com.br;
- InfoMoney;
- Bloomberg Línea.

Essas fontes devem capturar eventos de:

- captação;
- dívida;
- FIDC;
- debênture;
- securitização;
- crescimento;
- expansão;
- M&A;
- fintech/crédito/recebíveis.

---

## Novas tabelas

### `company_source_metric_snapshots`

Tabela genérica de série histórica de métricas por fonte.

Uso principal para LinkedIn:

- `linkedin_followers_count`;
- `linkedin_employee_count`;
- `linkedin_employee_count_range`;
- `linkedin_credit_related_keyword_hits`.

Também pode ser usada futuramente por outras fontes que gerem métricas recorrentes.

### `company_linkedin_role_snapshots`

Tabela específica para snapshots agregados de cargos por família.

Famílias previstas:

- `credit`;
- `risk`;
- `underwriting`;
- `collections`;
- `capital_markets`;
- `treasury`;
- `fp&a`;
- `finance`.

A tabela deve armazenar apenas agregados e evidências operacionais, não dados pessoais privados.

---

## Política operacional LinkedIn

LinkedIn entra como fonte de inteligência institucional e histórica, mas com regras:

1. Não armazenar dados pessoais privados.
2. Não depender de scraping autenticado de páginas privadas.
3. Preferir API oficial, export autorizado, parceiro de dados ou snapshot manual verificado.
4. Armazenar agregados por empresa e cargo, não listas pessoais sensíveis.
5. Toda métrica deve ter `observed_at`, `source_id`, `confidence_score` e `raw_payload`.

---

## Como isso melhora a originação

### Sinal de crescimento

Aumento de funcionários e seguidores pode indicar tração, expansão comercial e maior necessidade de capital.

### Sinal de maturidade de crédito

Aumento de cargos de crédito, risco, cobrança, underwriting, tesouraria ou funding indica que a empresa está estruturando operação financeira mais sofisticada.

### Sinal de timing

Contratações, posts e notícias recentes ajudam a priorizar abordagem antes de anúncio público de FIDC/DCM.

### Sinal de estrutura

Cargos em capital markets/treasury/funding sugerem abertura para conversa de estruturação.

---

## Próximos passos técnicos

1. Criar job de captura semanal para LinkedIn aggregate snapshots.
2. Persistir métricas em `company_source_metric_snapshots`.
3. Persistir cargos agregados em `company_linkedin_role_snapshots`.
4. Transformar variações de headcount/followers/cargos em `company_signals`.
5. Incluir esses sinais no qualification/pattern engine.
6. Mostrar histórico LinkedIn no `Company Detail`.
