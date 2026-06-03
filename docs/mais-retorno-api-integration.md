# Mais Retorno API — integração governada

## Objetivo

Adicionar a Mais Retorno como fonte auxiliar de dados de mercado para a Origination Intelligence Platform, sem criar stack paralela e sem expor credenciais no código.

A fonte deve apoiar enrichment, comparáveis e leitura de mercado. Ela não substitui CVM, ANBIMA, BCB ou bases oficiais para FIDC, CRI, CRA e debêntures.

## Regras obrigatórias

1. Nunca salvar a chave no GitHub.
2. Usar somente variável de ambiente para a credencial.
3. Reservar quota antes de qualquer chamada externa.
4. Nunca ultrapassar 500 requisições por mês.
5. Buscar usar o máximo possível da quota mensal, priorizando empresas com maior score, triggers recentes e maior fit para FIDC/DCM.

## Variáveis de ambiente

Adicionar no Vercel, ambiente Production e Preview:

```bash
MAIS_RETORNO_API_KEY=<secret>
MAIS_RETORNO_API_BASE_URL=https://developers.maisretorno.com
MAIS_RETORNO_API_PATH=mcp
MAIS_RETORNO_MONTHLY_QUOTA=500
MAIS_RETORNO_MONTHLY_TARGET=500
```

## Controle de quota

A migration cria duas tabelas:

- `external_api_usage_monthly`: contador mensal por provider.
- `external_api_usage_events`: trilha auditável de cada reserva de consumo.

A função `reserve_external_api_request` aplica o hard cap de 500/mês. O cliente `backend/src/lib/maisRetorno.ts` chama essa função antes da chamada HTTP.

## Política para usar o máximo possível

A execução mensal deve seguir esta régua:

1. Dias 1 a 10: consumir com empresas de prioridade alta, bucket `immediate_priority` e `high_priority`.
2. Dias 11 a 20: ampliar para empresas com trigger recente, funding gap ou sinais de mercado.
3. Dias 21 ao fim do mês: consumir saldo remanescente em watchlist qualificada, evitando terminar o mês com quota ociosa.
4. Sempre bloquear quando `used_count = 500`.

## Verificação no Supabase

```sql
select *
from public.external_api_usage_monthly
where provider = 'mais_retorno'
order by month_key desc;

select *
from public.external_api_usage_events
where provider = 'mais_retorno'
order by created_at desc
limit 50;
```

## Resultado esperado no produto

A fonte deve aparecer no catálogo como `src_mais_retorno_api` e seus outputs devem entrar no fluxo oficial:

`Sources -> Monitoring Outputs -> Signals -> Enrichment -> Qualification -> Patterns -> Scores -> Ranking -> Pipeline`
