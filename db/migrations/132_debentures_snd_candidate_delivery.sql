create or replace function public.sync_debentures_snd_discovered_candidates()
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_upserted integer := 0;
begin
  with issuer_base as (
    select
      event.issuer_cnpj as cnpj,
      max(event.issuer_name) as company_name,
      count(*)::integer as security_count,
      max(event.event_date) as latest_event_date,
      min(event.maturity_date) filter (where event.maturity_date >= current_date) as next_maturity_date,
      sum(coalesce(event.volume,0)) as observed_issue_volume,
      max(event.source_url) as source_url,
      max(event.observed_at) as observed_at
    from public.capital_market_events event
    where event.dataset_code='debentures_snd'
      and event.issuer_company_id is null
      and event.issuer_cnpj ~ '^[0-9]{14}$'
      and nullif(trim(event.issuer_name),'') is not null
    group by event.issuer_cnpj
  )
  insert into public.discovered_company_candidates (
    company_name,legal_name,cnpj,geography,segment,company_type,
    credit_product,target_structure,source_ref,source_url,evidence_summary,
    confidence,candidate_status,dedupe_key,raw_payload,captured_at,updated_at
  )
  select
    issuer.company_name,issuer.company_name,issuer.cnpj,'BR','DCM / Emissor de dívida','operating_company',
    'Crédito estruturado / mercado de capitais — validar necessidade atual',
    'Debênture / DCM / refinanciamento','src_debentures_snd',issuer.source_url,
    concat_ws(' · ',concat(issuer.security_count,' debênture(s) observada(s) no SND'),
      case when issuer.next_maturity_date is not null then concat('próximo vencimento: ',issuer.next_maturity_date::text) end,
      case when issuer.latest_event_date is not null then concat('evento mais recente: ',issuer.latest_event_date::text) end),
    0.98,'new',concat('debentures_snd:issuer:',issuer.cnpj),
    jsonb_build_object('origin','debentures_snd','datasetCode','debentures_snd','sourceCode','src_debentures_snd',
      'securityCount',issuer.security_count,'nextMaturityDate',issuer.next_maturity_date,
      'latestEventDate',issuer.latest_event_date,'observedIssueVolume',issuer.observed_issue_volume,
      'identityEvidence','issuer_cnpj_exact','autoPromote',false),
    issuer.observed_at,now()
  from issuer_base issuer
  on conflict (dedupe_key) where dedupe_key is not null do update set
    company_name=excluded.company_name,legal_name=excluded.legal_name,cnpj=excluded.cnpj,
    source_url=excluded.source_url,evidence_summary=excluded.evidence_summary,
    confidence=greatest(coalesce(public.discovered_company_candidates.confidence,0),excluded.confidence),
    candidate_status=case when public.discovered_company_candidates.candidate_status in ('promoted','rejected','ignored')
      then public.discovered_company_candidates.candidate_status else excluded.candidate_status end,
    raw_payload=excluded.raw_payload,captured_at=excluded.captured_at,updated_at=now();

  get diagnostics v_upserted = row_count;
  return jsonb_build_object('datasetCode','debentures_snd','upserted',v_upserted,'generatedAt',now());
end;
$$;

revoke all on function public.sync_debentures_snd_discovered_candidates() from public, anon, authenticated;
grant execute on function public.sync_debentures_snd_discovered_candidates() to service_role;
