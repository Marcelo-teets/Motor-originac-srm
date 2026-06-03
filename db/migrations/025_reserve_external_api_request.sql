create or replace function public.reserve_external_api_request(
  p_provider text,
  p_month_key text,
  p_monthly_quota integer default 500,
  p_soft_target integer default 500,
  p_source_code text default null,
  p_purpose text default null
) returns jsonb
language plpgsql
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
