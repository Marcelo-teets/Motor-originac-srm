-- Mirror-only Data Platform Fase 2 / Frente D.
-- Apply separately through Supabase MCP. Codex did not execute this DDL/DML.
-- Purpose: canonical CNPJ entity resolution and idempotent alias backfill.

create or replace function public.normalize_cnpj_digits(p_cnpj text)
returns text
language sql
immutable
as $$
  select case
    when length(regexp_replace(coalesce(p_cnpj, ''), '\D', '', 'g')) = 14
      then regexp_replace(coalesce(p_cnpj, ''), '\D', '', 'g')
    else null
  end;
$$;

create or replace function public.backfill_company_entity_aliases_from_cnpj()
returns jsonb
language plpgsql
as $$
declare
  v_companies_checked integer := 0;
  v_aliases_planned integer := 0;
  v_aliases_written integer := 0;
begin
  with canonical_companies as (
    select
      id,
      public.normalize_cnpj_digits(cnpj) as cnpj_digits,
      nullif(trim(legal_name), '') as legal_name,
      nullif(trim(trade_name), '') as trade_name,
      nullif(trim(normalized_name), '') as normalized_name,
      nullif(lower(trim(domain)), '') as domain,
      nullif(lower(regexp_replace(coalesce(website_url, website, domain, ''), '^https?://(www\.)?', '')), '') as website_host
    from public.companies
    where public.normalize_cnpj_digits(cnpj) is not null
  ), alias_candidates as (
    select id as company_id, 'cnpj'::text as alias_type, cnpj_digits as alias_value, 1.00::numeric as confidence_score from canonical_companies
    union all select id, 'legal_name', legal_name, 0.95 from canonical_companies where legal_name is not null
    union all select id, 'trade_name', trade_name, 0.90 from canonical_companies where trade_name is not null
    union all select id, 'normalized_name', normalized_name, 0.86 from canonical_companies where normalized_name is not null
    union all select id, 'domain', domain, 0.82 from canonical_companies where domain is not null
    union all select id, 'website_host', split_part(website_host, '/', 1), 0.80 from canonical_companies where website_host is not null
  ), deduped as (
    select distinct company_id, alias_type, alias_value, confidence_score
    from alias_candidates
    where alias_value is not null and alias_value <> ''
  ), inserted as (
    insert into public.company_entity_aliases(company_id, alias_type, alias_value, source_id, confidence_score)
    select company_id, alias_type, alias_value, null::uuid, confidence_score
    from deduped
    on conflict (company_id, alias_type, alias_value) do nothing
    returning 1
  )
  select
    (select count(*) from canonical_companies),
    (select count(*) from deduped),
    (select count(*) from inserted)
  into v_companies_checked, v_aliases_planned, v_aliases_written;

  return jsonb_build_object(
    'mode', 'rpc',
    'companiesChecked', v_companies_checked,
    'aliasesPlanned', v_aliases_planned,
    'aliasesWritten', v_aliases_written,
    'skippedExisting', greatest(v_aliases_planned - v_aliases_written, 0),
    'expectedMinimumAliases', 8,
    'errors', '[]'::jsonb
  );
end;
$$;

comment on function public.backfill_company_entity_aliases_from_cnpj() is
  'Mirror-only backfill: creates canonical company aliases from CNPJ, legal/trade names and domains with ON CONFLICT DO NOTHING.';
