create or replace function public.sync_debentures_snd_delivery()
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_event_count integer := 0;
  v_linked_events integer := 0;
  v_signals_written integer := 0;
  v_candidates jsonb := '{}'::jsonb;
  v_candidates_upserted integer := 0;
  v_generated_at timestamptz := now();
begin
  select count(*)::integer,
         count(*) filter (where issuer_company_id is not null)::integer
    into v_event_count, v_linked_events
  from public.capital_market_events
  where dataset_code = 'debentures_snd';

  v_signals_written := coalesce(public.sync_capital_market_company_signals('debentures_snd'), 0);
  v_candidates := coalesce(public.sync_debentures_snd_discovered_candidates(), '{}'::jsonb);
  v_candidates_upserted := coalesce(nullif(v_candidates ->> 'upserted', '')::integer, 0);

  update public.source_catalog
  set status = case when v_event_count > 0 then 'real' else 'partial' end,
      health = case when v_event_count > 0 then 'healthy' else 'degraded' end,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'deliveryState', case when v_event_count > 0 then 'delivered' else 'empty' end,
        'lastDeliveryAt', v_generated_at,
        'lastDeliveryEventCount', v_event_count,
        'lastDeliveryLinkedEvents', v_linked_events,
        'lastDeliverySignalsWritten', v_signals_written,
        'lastDeliveryCandidatesUpserted', v_candidates_upserted
      ),
      updated_at = v_generated_at
  where metadata ->> 'datasetCode' = 'debentures_snd';

  return jsonb_build_object(
    'datasetCode', 'debentures_snd',
    'eventCount', v_event_count,
    'linkedEvents', v_linked_events,
    'signalsWritten', v_signals_written,
    'candidatesUpserted', v_candidates_upserted,
    'generatedAt', v_generated_at
  );
end;
$$;

revoke all on function public.sync_debentures_snd_delivery() from public, anon, authenticated;
grant execute on function public.sync_debentures_snd_delivery() to service_role;
