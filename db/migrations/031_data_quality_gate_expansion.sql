-- Mirror-only Data Platform Fase 2 / Frente D.
-- Apply separately through Supabase MCP. Codex did not execute this DDL.
-- Purpose: consultable data quality violations for completeness, freshness and validity.

create table if not exists public.data_quality_violations (
  id uuid primary key default gen_random_uuid(),
  rule_code text not null,
  entity_table text not null,
  entity_id text not null,
  source_id uuid,
  severity text not null default 'medium',
  status text not null default 'open',
  reason text not null,
  observed_value jsonb not null default '{}'::jsonb,
  detected_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists idx_data_quality_violations_open
  on public.data_quality_violations(entity_table, rule_code, detected_at desc)
  where resolved_at is null;

create index if not exists idx_data_quality_violations_source
  on public.data_quality_violations(source_id, detected_at desc)
  where source_id is not null;

create or replace function public.source_frequency_to_interval(p_frequency text)
returns interval
language sql
immutable
as $$
  select case lower(coalesce(p_frequency, 'weekly'))
    when 'hourly' then interval '6 hours'
    when 'daily' then interval '2 days'
    when 'weekly' then interval '10 days'
    when 'monthly' then interval '45 days'
    when 'on_demand' then interval '90 days'
    else interval '14 days'
  end;
$$;

create or replace function public.record_data_quality_violation(
  p_rule_code text,
  p_entity_table text,
  p_entity_id text,
  p_source_id uuid,
  p_severity text,
  p_reason text,
  p_observed_value jsonb default '{}'::jsonb
) returns void
language plpgsql
as $$
begin
  insert into public.data_quality_violations(rule_code, entity_table, entity_id, source_id, severity, reason, observed_value)
  select p_rule_code, p_entity_table, p_entity_id, p_source_id, p_severity, p_reason, coalesce(p_observed_value, '{}'::jsonb)
  where not exists (
    select 1
    from public.data_quality_violations dq
    where dq.rule_code = p_rule_code
      and dq.entity_table = p_entity_table
      and dq.entity_id = p_entity_id
      and dq.resolved_at is null
  );
end;
$$;

create or replace function public.run_data_platform_quality_gates(p_limit integer default 5000)
returns jsonb
language plpgsql
as $$
declare
  v_before integer;
  v_after integer;
  r record;
begin
  select count(*) into v_before from public.data_quality_violations where resolved_at is null;

  for r in
    select id::text as entity_id, cnpj, regexp_replace(coalesce(cnpj, ''), '\D', '', 'g') as cnpj_digits
    from public.companies
    limit greatest(coalesce(p_limit, 5000), 1)
  loop
    if length(r.cnpj_digits) <> 14 then
      perform public.record_data_quality_violation(
        'company_cnpj_missing_or_invalid', 'companies', r.entity_id, null, 'high',
        'Company must have a 14-digit normalized CNPJ.',
        jsonb_build_object('cnpj', r.cnpj, 'normalized', r.cnpj_digits)
      );
    end if;
  end loop;

  for r in
    select id, name, validation_rule, criticality, health, metadata
    from public.source_catalog
    where status in ('active', 'real')
    limit greatest(coalesce(p_limit, 5000), 1)
  loop
    if nullif(coalesce(r.metadata->>'tier', ''), '') is null then
      perform public.record_data_quality_violation('source_missing_tier', 'source_catalog', r.id::text, r.id, 'medium', 'Active source must have metadata.tier.', to_jsonb(r));
    end if;
    if nullif(coalesce(r.criticality, ''), '') is null then
      perform public.record_data_quality_violation('source_missing_criticality', 'source_catalog', r.id::text, r.id, 'medium', 'Active source must define criticality.', to_jsonb(r));
    end if;
    if nullif(coalesce(r.health, ''), '') is null then
      perform public.record_data_quality_violation('source_missing_health', 'source_catalog', r.id::text, r.id, 'medium', 'Active source must define health.', to_jsonb(r));
    end if;
    if nullif(coalesce(r.validation_rule, ''), '') is null then
      perform public.record_data_quality_violation('source_missing_validation_rule', 'source_catalog', r.id::text, r.id, 'low', 'Active source should define validation_rule.', to_jsonb(r));
    end if;
  end loop;

  for r in
    select sd.id, sd.source_id, sd.observed_at, sc.frequency, sc.name as source_name
    from public.source_documents sd
    left join public.source_catalog sc on sc.id = sd.source_id
    where sd.observed_at < now() - public.source_frequency_to_interval(sc.frequency)
    order by sd.observed_at asc
    limit greatest(coalesce(p_limit, 5000), 1)
  loop
    perform public.record_data_quality_violation(
      'source_document_stale', 'source_documents', r.id, r.source_id, 'medium',
      'Source document is older than the source freshness window.',
      jsonb_build_object('observed_at', r.observed_at, 'frequency', r.frequency, 'source_name', r.source_name)
    );
  end loop;

  for r in
    select cs.id, cs.source_id, cs.company_id, c.cnpj, regexp_replace(coalesce(c.cnpj, ''), '\D', '', 'g') as cnpj_digits
    from public.company_signals cs
    join public.companies c on c.id = cs.company_id
    limit greatest(coalesce(p_limit, 5000), 1)
  loop
    if length(r.cnpj_digits) <> 14 then
      perform public.record_data_quality_violation(
        'signal_company_cnpj_invalid', 'company_signals', r.id::text, r.source_id, 'high',
        'Signal cannot be promoted to gold without a canonical company CNPJ.',
        jsonb_build_object('company_id', r.company_id, 'cnpj', r.cnpj)
      );
    end if;
  end loop;

  select count(*) into v_after from public.data_quality_violations where resolved_at is null;

  return jsonb_build_object(
    'status', 'completed',
    'openBefore', v_before,
    'openAfter', v_after,
    'newOpenViolations', greatest(v_after - v_before, 0),
    'doesNotBreakIngestion', true
  );
end;
$$;

comment on table public.data_quality_violations is 'Consultable DQ failures for data platform gates; ingestion should continue while rows are marked for review.';
