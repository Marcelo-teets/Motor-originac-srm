-- Aplicada no banco vivo via Supabase MCP em 2026-06-11. Espelho de linhagem — não reexecutar.
create table if not exists public.external_api_usage_monthly (
  provider text not null,
  month_key text not null,
  monthly_quota integer not null default 500,
  soft_target integer not null default 500,
  used_count integer not null default 0,
  last_reserved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (provider, month_key)
);

create table if not exists public.external_api_usage_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  month_key text not null,
  source_code text,
  purpose text,
  allowed boolean not null,
  used_after integer not null,
  monthly_quota integer not null,
  remaining integer not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_eaue_provider_month on public.external_api_usage_events(provider, month_key, created_at desc);

alter table public.external_api_usage_monthly enable row level security;
alter table public.external_api_usage_events enable row level security;
create policy srv_all_external_api_usage_monthly on public.external_api_usage_monthly as permissive for all to service_role using (true) with check (true);
create policy srv_all_external_api_usage_events on public.external_api_usage_events as permissive for all to service_role using (true) with check (true);
create policy authenticated_select_external_api_usage_monthly on public.external_api_usage_monthly as permissive for select to authenticated using (true);
create policy authenticated_select_external_api_usage_events on public.external_api_usage_events as permissive for select to authenticated using (true);

create or replace function public.reserve_external_api_request(
  p_provider text,
  p_month_key text,
  p_monthly_quota integer default 500,
  p_soft_target integer default 500,
  p_source_code text default null,
  p_purpose text default null
) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_provider text := lower(trim(p_provider));
  v_quota integer := least(500, greatest(1, coalesce(p_monthly_quota, 500)));
  v_target integer := least(least(500, greatest(1, coalesce(p_soft_target, 500))), least(500, greatest(1, coalesce(p_monthly_quota, 500))));
  v_before integer;
  v_after integer;
  v_allowed boolean;
  v_remaining integer;
begin
  insert into public.external_api_usage_monthly(provider, month_key, monthly_quota, soft_target, used_count)
  values (v_provider, p_month_key, v_quota, v_target, 0)
  on conflict (provider, month_key) do nothing;

  select used_count into v_before
  from public.external_api_usage_monthly
  where provider = v_provider and month_key = p_month_key
  for update;

  v_allowed := v_before < v_quota;
  v_after := case when v_allowed then v_before + 1 else v_before end;
  v_remaining := greatest(0, v_quota - v_after);

  if v_allowed then
    update public.external_api_usage_monthly
    set used_count = v_after,
        monthly_quota = v_quota,
        soft_target = v_target,
        last_reserved_at = now(),
        updated_at = now()
    where provider = v_provider and month_key = p_month_key;
  end if;

  insert into public.external_api_usage_events(provider, month_key, source_code, purpose, allowed, used_after, monthly_quota, remaining)
  values (v_provider, p_month_key, p_source_code, p_purpose, v_allowed, v_after, v_quota, v_remaining);

  return jsonb_build_object(
    'provider', v_provider,
    'monthKey', p_month_key,
    'monthlyQuota', v_quota,
    'softTarget', v_target,
    'usedBefore', v_before,
    'usedAfter', v_after,
    'used', v_after,
    'remaining', v_remaining,
    'allowed', v_allowed,
    'warning', v_after >= floor(v_quota * 0.80),
    'reason', case when v_allowed then 'reserved' else 'monthly_quota_exhausted' end
  );
end;
$$;

-- Seed Mais Retorno corrigida (id uuid auto; dedupe por metadata.code)
insert into public.source_catalog(name, source_type, category, auth_requirement, status, metadata, rate_limit_notes, health)
select 'Mais Retorno API', 'api', 'Market data', 'api_key', 'real',
  jsonb_build_object(
    'code', 'src_mais_retorno_api',
    'provider', 'Mais Retorno',
    'scope', 'fundos, indices, acoes, fiis, etfs, bdrs e tesouro direto',
    'useCase', 'fonte auxiliar de dados de mercado e comparaveis',
    'tier', 'tier_5_supplemental_enrichment',
    'monthlyQuota', 500,
    'monthlyTarget', 500,
    'quotaPolicy', jsonb_build_object(
      'hardCapMonthlyRequests', 500,
      'useMaximumMonthly', true,
      'requiresReservationBeforeHttpCall', true,
      'reservationFunction', 'reserve_external_api_request'
    )
  ),
  'Hard cap interno: 500 requisicoes por mes. Reservar quota antes de qualquer chamada HTTP.',
  'healthy'
where not exists (select 1 from public.source_catalog where metadata->>'code' = 'src_mais_retorno_api');
