-- Frente D — D5 minimum quality gates
-- Uses source_catalog.schema_contract to validate source_documents before promotion to curated layers.

create or replace function public.run_source_document_quality_gate(p_source_document_id text)
returns jsonb
language plpgsql
as $$
declare
  doc record;
  doc_json jsonb;
  contract jsonb;
  required_fields jsonb;
  required_count integer := 0;
  missing_count integer := 0;
  missing_fields text[] := array[]::text[];
  field_name text;
  completeness_score numeric(5,2) := 1.00;
  validity_score numeric(5,2) := 1.00;
  freshness_score numeric(5,2) := 1.00;
  consistency_score numeric(5,2) := 1.00;
  uniqueness_score numeric(5,2) := 1.00;
  effective_hash text;
  duplicate_count integer := 0;
  captured_timestamp timestamptz;
  age_hours numeric;
  v_gate_result text := 'allow';
  v_quality_status text := 'passed';
  failure_payload jsonb := '{}'::jsonb;
  drift_detected boolean := false;
  v_quarantine_reason text;
begin
  select
    sd.*,
    coalesce(sc.metadata->>'code', sc.id::text, 'unknown') as source_code,
    coalesce(sc.name, 'Unknown Source') as source_name,
    sc.source_tier as source_tier,
    coalesce(sc.schema_contract, '{}'::jsonb) as source_schema_contract,
    sc.freshness_sla_hours as source_freshness_sla_hours,
    sc.reliability_score as source_reliability_score
  into doc
  from public.source_documents sd
  left join public.source_catalog sc
    on sc.id::text = sd.source_id::text
  where sd.id = p_source_document_id;

  if not found then
    return jsonb_build_object(
      'status', 'not_found',
      'source_document_id', p_source_document_id
    );
  end if;

  doc_json := to_jsonb(doc);
  contract := coalesce(doc.source_schema_contract, '{}'::jsonb);
  required_fields := coalesce(contract->'required', '[]'::jsonb);

  if jsonb_array_length(required_fields) = 0 then
    drift_detected := true;
    v_gate_result := 'review';
    v_quality_status := 'review';
    failure_payload := failure_payload || jsonb_build_object(
      'contract', 'missing_required_fields_contract'
    );
  end if;

  for field_name in select jsonb_array_elements_text(required_fields)
  loop
    required_count := required_count + 1;

    if not (
      (doc_json ? field_name and nullif(doc_json->>field_name, '') is not null)
      or (coalesce(doc.raw_payload, '{}'::jsonb) ? field_name and nullif(doc.raw_payload->>field_name, '') is not null)
      or (coalesce(doc.normalized_payload, '{}'::jsonb) ? field_name and nullif(doc.normalized_payload->>field_name, '') is not null)
    ) then
      missing_count := missing_count + 1;
      missing_fields := array_append(missing_fields, field_name);
    end if;
  end loop;

  if required_count > 0 then
    completeness_score := round(((required_count - missing_count)::numeric / required_count::numeric), 2);
  end if;

  if doc.document_type is null or nullif(doc.document_type, '') is null then
    validity_score := least(validity_score, 0.60);
  end if;

  if doc.canonical_url is not null and doc.canonical_url !~* '^https?://' then
    validity_score := least(validity_score, 0.60);
  end if;

  if doc.source_id is null then
    validity_score := least(validity_score, 0.50);
  end if;

  captured_timestamp := coalesce(doc.captured_at, doc.observed_at, doc.published_at, now());
  if doc.source_freshness_sla_hours is not null and doc.source_freshness_sla_hours > 0 then
    age_hours := extract(epoch from (now() - captured_timestamp)) / 3600.0;
    if age_hours <= doc.source_freshness_sla_hours then
      freshness_score := 1.00;
    else
      freshness_score := round(greatest(0.00, 1.00 - ((age_hours - doc.source_freshness_sla_hours) / doc.source_freshness_sla_hours)), 2);
    end if;
  end if;

  effective_hash := coalesce(nullif(doc.payload_hash, ''), nullif(doc.content_hash, ''));
  if effective_hash is null then
    uniqueness_score := 0.75;
  else
    select count(*)
    into duplicate_count
    from public.source_documents sd
    where coalesce(nullif(sd.payload_hash, ''), nullif(sd.content_hash, '')) = effective_hash;

    if duplicate_count > 1 then
      uniqueness_score := 0.20;
    end if;
  end if;

  if completeness_score < 1.00 then
    failure_payload := failure_payload || jsonb_build_object('missing_fields', to_jsonb(missing_fields));
  end if;

  if completeness_score < 1.00
    or validity_score < 0.70
    or freshness_score < 0.40
    or uniqueness_score < 0.50
  then
    v_gate_result := 'quarantine';
    v_quality_status := 'quarantined';
  elsif v_gate_result <> 'review' and freshness_score < 0.80 then
    v_gate_result := 'review';
    v_quality_status := 'review';
  end if;

  v_quarantine_reason := case
    when v_gate_result = 'quarantine' then concat_ws('; ',
      case when completeness_score < 1.00 then 'missing required fields' end,
      case when validity_score < 0.70 then 'invalid document shape' end,
      case when freshness_score < 0.40 then 'freshness SLA failed' end,
      case when uniqueness_score < 0.50 then 'duplicate payload hash' end
    )
    when v_gate_result = 'review' then 'manual review required'
    else null
  end;

  insert into public.data_quality_runs (
    source_code,
    run_id,
    scope,
    status,
    rows_checked,
    rows_failed,
    completeness_score,
    validity_score,
    freshness_score,
    consistency_score,
    uniqueness_score,
    drift_detected,
    gate_result,
    failure_payload,
    started_at,
    finished_at
  ) values (
    doc.source_code,
    doc.run_id,
    'source_document',
    case when v_gate_result = 'allow' then 'passed' when v_gate_result = 'review' then 'warning' else 'failed' end,
    1,
    case when v_gate_result = 'allow' then 0 else 1 end,
    completeness_score,
    validity_score,
    freshness_score,
    consistency_score,
    uniqueness_score,
    drift_detected,
    v_gate_result,
    failure_payload,
    now(),
    now()
  );

  update public.source_documents sd
  set quality_status = v_quality_status,
      quarantine_reason = v_quarantine_reason,
      payload_hash = coalesce(sd.payload_hash, effective_hash)
  where sd.id = p_source_document_id;

  if v_gate_result = 'quarantine'
    and not exists (
      select 1
      from public.source_quarantine sq
      where sq.source_document_id = p_source_document_id
        and sq.resolved_at is null
    ) then
    insert into public.source_quarantine (
      source_code,
      run_id,
      source_document_id,
      reason,
      severity,
      raw_payload,
      gate_payload
    ) values (
      doc.source_code,
      doc.run_id,
      p_source_document_id,
      coalesce(v_quarantine_reason, 'quality gate failed'),
      case when validity_score < 0.70 or completeness_score < 0.50 then 'high' else 'medium' end,
      coalesce(doc.raw_payload, '{}'::jsonb),
      jsonb_build_object(
        'completeness_score', completeness_score,
        'validity_score', validity_score,
        'freshness_score', freshness_score,
        'consistency_score', consistency_score,
        'uniqueness_score', uniqueness_score,
        'missing_fields', missing_fields
      )
    );
  end if;

  insert into public.source_health (
    source_code,
    source_name,
    source_tier,
    health_status,
    reliability_score,
    freshness_sla_hours,
    last_success_at,
    last_failure_at,
    consecutive_failures,
    last_drift_detected_at,
    updated_at
  ) values (
    doc.source_code,
    doc.source_name,
    doc.source_tier,
    case when v_gate_result = 'allow' then 'healthy' when v_gate_result = 'review' then 'degraded' else 'unhealthy' end,
    coalesce(doc.source_reliability_score, 0.50),
    doc.source_freshness_sla_hours,
    case when v_gate_result = 'allow' then now() else null end,
    case when v_gate_result <> 'allow' then now() else null end,
    case when v_gate_result = 'allow' then 0 else 1 end,
    case when drift_detected then now() else null end,
    now()
  )
  on conflict (source_code) do update set
    source_name = excluded.source_name,
    source_tier = excluded.source_tier,
    health_status = excluded.health_status,
    reliability_score = excluded.reliability_score,
    freshness_sla_hours = excluded.freshness_sla_hours,
    last_success_at = coalesce(excluded.last_success_at, public.source_health.last_success_at),
    last_failure_at = coalesce(excluded.last_failure_at, public.source_health.last_failure_at),
    consecutive_failures = case
      when excluded.health_status = 'healthy' then 0
      else public.source_health.consecutive_failures + 1
    end,
    last_drift_detected_at = coalesce(excluded.last_drift_detected_at, public.source_health.last_drift_detected_at),
    updated_at = now();

  return jsonb_build_object(
    'status', v_quality_status,
    'gate_result', v_gate_result,
    'source_document_id', p_source_document_id,
    'source_code', doc.source_code,
    'scores', jsonb_build_object(
      'completeness', completeness_score,
      'validity', validity_score,
      'freshness', freshness_score,
      'consistency', consistency_score,
      'uniqueness', uniqueness_score
    ),
    'missing_fields', missing_fields,
    'quarantine_reason', v_quarantine_reason,
    'drift_detected', drift_detected
  );
end;
$$;

create or replace function public.run_pending_source_document_quality_gates(p_limit integer default 100)
returns table(source_document_id text, gate_result text, result_payload jsonb)
language plpgsql
as $$
declare
  r record;
  res jsonb;
begin
  for r in
    select id
    from public.source_documents
    where coalesce(quality_status, 'pending') in ('pending', 'review')
    order by coalesce(captured_at, observed_at, published_at, now()) desc
    limit greatest(coalesce(p_limit, 100), 1)
  loop
    res := public.run_source_document_quality_gate(r.id);
    source_document_id := r.id;
    gate_result := coalesce(res->>'gate_result', res->>'status');
    result_payload := res;
    return next;
  end loop;
end;
$$;
