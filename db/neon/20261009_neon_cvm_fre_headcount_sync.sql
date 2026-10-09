-- F2-01 (Planejamento V5, decisão D-03, camada 1): headcount oficial da CVM para o gate de ICP.
--
-- O gate comercial (public.company_verified_headcount_floor, db/neon/20261007_neon_origination_decision_gates.sql)
-- lê company_source_metric_snapshots com metric_key='employee_count', observed, confiança >= 0.60 e
-- observed_at nos últimos 365 dias. Nenhum pipeline preenchia esse dado, então nenhuma empresa era elegível.
--
-- Esta função materializa o número de empregados do Formulário de Referência (item 10.1A,
-- arquivo fre_cia_aberta_[posicao_]empregado_declaracao_genero) a partir de capital_market_metrics:
--   * o connector grava uma métrica employee_count por linha (soma das colunas Quantidade_*),
--     com measurement_scope = 'fre_empregado_genero:doc=<ID_Documento>:v=<Versao>';
--   * aqui as linhas do mesmo documento/versão são somadas (o layout por posição tem várias linhas);
--   * por CNPJ vale a data de referência mais recente e, nela, a maior versão;
--   * o vínculo com companies é por CNPJ (só dígitos). Nada é criado para CNPJ sem empresa.
-- observed_at = Data_Referencia do formulário: o gate só aceita formulários do último ano.

create or replace function public.sync_cvm_fre_headcount_metrics()
returns integer
language sql
security invoker
volatile
set search_path = ''
as $$
  with fre as (
    select
      regexp_replace(coalesce(e.issuer_cnpj, ''), '[^0-9]', '', 'g') as cnpj,
      m.reference_date,
      coalesce(substring(m.measurement_scope from 'doc=([^:]+)'), 'na') as document_id,
      coalesce(nullif(substring(m.measurement_scope from 'v=([0-9]+)'), '')::integer, 0) as version,
      m.metric_value
    from public.capital_market_metrics m
    join public.capital_market_events e
      on e.dataset_code = m.dataset_code
     and e.record_key = m.record_key
    where m.dataset_code = 'cvm_company_fre'
      and m.metric_code = 'employee_count'
      and m.measurement_scope like 'fre_empregado_genero:%'
      and m.metric_value is not null
      and m.metric_value >= 0
      and m.reference_date is not null
  ), per_document as (
    select cnpj, reference_date, document_id, version, sum(metric_value) as headcount
    from fre
    where length(cnpj) = 14
    group by cnpj, reference_date, document_id, version
  ), latest as (
    select distinct on (cnpj) cnpj, reference_date, document_id, version, headcount
    from per_document
    order by cnpj, reference_date desc, version desc, headcount desc
  ), fre_source as (
    select id
    from public.source_catalog
    where metadata->>'code' = 'src_cvm_fre_capital_structure'
    order by id
    limit 1
  ), upserted as (
    insert into public.company_source_metric_snapshots (
      company_id, source_id, metric_key, metric_value, metric_unit,
      observed_at, period_end, confidence_score, observed_vs_inferred, raw_payload
    )
    select
      c.id,
      s.id,
      'employee_count',
      l.headcount,
      'employees',
      l.reference_date::timestamptz,
      l.reference_date::timestamptz,
      0.95,
      'observed',
      jsonb_build_object(
        'dataset', 'cvm_company_fre',
        'form_item', '10.1A',
        'cnpj', l.cnpj,
        'document_id', l.document_id,
        'version', l.version,
        'reference_date', l.reference_date
      )
    from latest l
    join public.companies c
      on regexp_replace(coalesce(c.cnpj, ''), '[^0-9]', '', 'g') = l.cnpj
    cross join fre_source s
    where l.headcount > 0
    on conflict (company_id, source_id, metric_key, observed_at)
    do update set
      metric_value = excluded.metric_value,
      metric_unit = excluded.metric_unit,
      period_end = excluded.period_end,
      confidence_score = excluded.confidence_score,
      observed_vs_inferred = excluded.observed_vs_inferred,
      raw_payload = excluded.raw_payload
    returning 1
  )
  select count(*)::integer from upserted;
$$;

comment on function public.sync_cvm_fre_headcount_metrics() is
  'Materializa employee_count (FRE 10.1A, CVM) em company_source_metric_snapshots para o gate de ICP. Idempotente; retorna linhas inseridas/atualizadas.';

revoke all on function public.sync_cvm_fre_headcount_metrics() from public, anon, authenticated;
grant execute on function public.sync_cvm_fre_headcount_metrics() to service_role;
