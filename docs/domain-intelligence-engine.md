# Domain Intelligence Engine

## Objetivo

Resolver e validar o domínio/site oficial de empresas descobertas pelo motor de captura antes da revisão humana de identidade e antes de a companhia entrar no Company Master.

A solução pertence à camada de **Entity Resolution** da Origination Intelligence Platform. Ela não cria uma stack paralela e não substitui o gate humano já existente para promoção de candidatos.

## Problema observado em produção

Baseline de 12/08/2026:

- 1.343 candidatos em status `captured`;
- 1.324 candidatos sem `normalized_domain` e sem website;
- fila comercial: 42 P1, 100 P2 e 211 P3 sem domínio;
- as 9 empresas atuais do Company Master já possuem domínio e website.

O gargalo, portanto, está entre **descoberta/captura** e **resolução de identidade**, não no monitoramento das empresas já promovidas.

## Fluxo

```txt
Search Profile Discovery / CVM enrichment
-> discovered_company_candidates
-> Candidate Domain Intelligence
   -> pistas observadas em dados oficiais
   -> pistas de URL já capturadas
   -> fallback determinístico por nome
   -> proteção de host / SSRF básico
   -> probe HTTP do primeiro domínio
   -> validação CNPJ + nome + alinhamento de domínio
-> website + normalized_domain + evidence trace
-> revisão humana de identidade
-> Company Master
-> company website connector
-> monitoring_outputs
-> signals / enrichment / qualification / patterns / score / ranking
```

## Estratégias de descoberta

### 1. `official_email`

Prioridade mais alta. Extrai domínio corporativo de e-mails observados em enriquecimentos oficiais e ignora caixas gratuitas como Gmail, Outlook e similares.

### 2. `observed_url`

Extrai hosts de URLs e e-mails já presentes no payload do candidato e nos enriquecimentos oficiais. Domínios de governo, redes sociais, mecanismos de busca e plataformas genéricas são descartados antes do probe.

### 3. `name_guess`

Fallback determinístico e limitado. Gera poucas combinações a partir dos tokens significativos do nome da empresa, com TLDs prioritários para o universo alvo (`.com.br`, `.com`, `.io`).

Um domínio adivinhado **não é aceito apenas por responder HTTP**. Para esse tipo de pista, o verificador exige CNPJ explícito ou correspondência forte/exata de identidade.

## Validação

O motor reutiliza o score de identidade do website já existente:

- CNPJ encontrado no site: confiança 0,99;
- nome exato + evidência de domínio/nome: confiança 0,95;
- domínio observado + cobertura suficiente de nome: confiança 0,90;
- evidência insuficiente: rejeitado.

Para `name_guess`, o limiar é mais conservador: somente `cnpj` ou `exact_name` com confiança >= 0,95.

## Segurança e qualidade

- somente HTTPS;
- timeout de 5 segundos por probe;
- concorrência limitada;
- máximo de 8 domínios por candidato;
- rejeição de localhost, IP literal e `.local`;
- rejeição de domínios públicos/terceiros conhecidos (`gov.br`, CVM, BCB, Google, LinkedIn, GitHub, redes sociais etc.);
- nenhuma mudança automática de `candidate_status`;
- nenhuma alteração automática de `company_id`;
- nenhuma promoção automática;
- `humanApprovalRequired: true` em toda evidência verificada;
- cooldown de 7 dias para candidato não resolvido, evitando consumo repetitivo.

## Persistência

Não foi criada nova tabela. O desenho reutiliza a estrutura atual para reduzir custo e complexidade no Supabase.

### Candidato resolvido

Atualiza apenas:

- `discovered_company_candidates.website`;
- `discovered_company_candidates.normalized_domain`;
- `raw_payload.identity_evidence_url`;
- `raw_payload.website_identity_capture`;
- `raw_payload.domain_intelligence`;
- `updated_at`.

### Candidato não resolvido

Mantém website/domínio vazios e grava somente a trilha em `raw_payload.domain_intelligence`:

```json
{
  "version": "domain_intelligence_v1",
  "status": "unresolved",
  "lastAttemptAt": "...",
  "nextRetryAt": "...",
  "strategiesUsed": ["observed_url", "name_guess"],
  "candidateDomains": [],
  "domainsProbed": 6,
  "bestConfidence": 0.62,
  "humanApprovalRequired": true
}
```

## Orquestração

Workflow: `.github/workflows/candidate-domain-intelligence.yml`.

O resolver executa automaticamente:

1. após conclusão com sucesso de `Search Profile Discovery`;
2. após conclusão com sucesso de `Candidate CVM Registry Enrichment`;
3. diariamente às 09:00 UTC para backfill;
4. manualmente via `workflow_dispatch` com `limit`, `tiers` e `force`.

A execução usa exclusivamente os secrets já padronizados do projeto:

- `SUPABASE_URL`;
- `SUPABASE_SERVICE_ROLE_KEY`.

## Operação manual

No diretório `backend`:

```bash
npx tsx src/cli/candidateDomainIntelligence.ts --limit 50 --tiers P1,P2,P3
```

Ignorar cooldown:

```bash
npx tsx src/cli/candidateDomainIntelligence.ts --limit 50 --tiers P1,P2,P3 --force
```

Candidato específico:

```bash
npx tsx src/cli/candidateDomainIntelligence.ts --candidate-id <UUID> --limit 1 --force
```

## Critério de aceite

A implementação é considerada funcional quando:

1. typecheck do backend passa;
2. testes do resolver e do verificador legado passam;
3. workflow executa com secrets válidos;
4. um candidato com evidência forte recebe website/domain e mantém o gate humano;
5. um candidato sem evidência permanece sem website/domain e recebe cooldown auditável;
6. nenhuma execução promove candidato ou altera elegibilidade de decisão automaticamente;
7. após promoção humana, o domínio já resolvido alimenta o conector `src_company_website` e o fluxo normal de monitoring/enrichment.
