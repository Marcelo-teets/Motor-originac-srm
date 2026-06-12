-- Aplicada no banco vivo via Supabase MCP em 2026-06-12 (v2 com fix de escala de confiança 0-1→0-100).
-- Espelho de linhagem — não reexecutar.
CREATE OR REPLACE FUNCTION public.run_source_document_quality_gate(p_source_document_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  d record;
  v_source_code text;
  v_gate text := 'allow';
  v_reason text := null;
  v_conf numeric;
begin
  select sd.*, sc.metadata->>'code' as src_code
  into d
  from public.source_documents sd
  left join public.source_catalog sc on sc.id = sd.source_id
  where sd.id = p_source_document_id;

  if not found then
    return jsonb_build_object(
      'source_document_id', p_source_document_id,
      'gate_result', 'quarantine',
      'status', 'quarantine',
      'source_code', null,
      'quarantine_reason', 'document_not_found'
    );
  end if;

  v_source_code := coalesce(d.src_code, d.source_id::text);
  -- Normaliza confianca para escala 0-100 (espelha o helper asPercent do backend)
  v_conf := coalesce(d.confidence, d.confidence_score, 0);
  if v_conf <= 1 then v_conf := v_conf * 100; end if;

  if coalesce(nullif(btrim(coalesce(d.canonical_url, d.evidence_url, '')), ''), null) is null
     and coalesce(nullif(btrim(coalesce(d.title, '')), ''), null) is null then
    v_gate := 'quarantine'; v_reason := 'missing_url_and_title';
  elsif d.content_hash is null and d.payload_hash is null
        and (d.raw_payload is null or d.raw_payload = '{}'::jsonb) then
    v_gate := 'quarantine'; v_reason := 'no_content_fingerprint';
  elsif d.company_id is null then
    v_gate := 'review'; v_reason := 'unresolved_company';
  elsif v_conf > 0 and v_conf < 40 then
    v_gate := 'review'; v_reason := 'low_confidence';
  elsif coalesce(d.published_at, d.observed_at) < now() - interval '180 days' then
    v_gate := 'review'; v_reason := 'stale_evidence';
  end if;

  update public.source_documents
  set quality_status = v_gate
  where id = p_source_document_id;

  if v_gate <> 'allow' then
    perform public.record_data_quality_violation(
      'document_gate_' || v_gate,
      'source_documents',
      p_source_document_id,
      d.source_id,
      case when v_gate = 'quarantine' then 'high' else 'medium' end,
      coalesce(v_reason, v_gate),
      jsonb_build_object('source_code', v_source_code, 'title', d.title, 'confidence', v_conf)
    );
  end if;

  return jsonb_build_object(
    'source_document_id', p_source_document_id,
    'gate_result', v_gate,
    'status', v_gate,
    'source_code', v_source_code,
    'quarantine_reason', v_reason
  );
end;
$function$;
