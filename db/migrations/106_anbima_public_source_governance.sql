-- ANBIMA Data governance after public browser/network probe.
-- Public consultation does not imply permission to use undocumented BFF endpoints
-- as a production integration API. ANBIMA Feed remains a separate subscriber product.

update public.source_catalog
set status = 'partial',
    health = 'healthy',
    validation_rule = 'Usar ANBIMA Data para consulta e corroboracao. Automatizar somente downloads publicos, explicitos e estaveis; nao consumir endpoints BFF internos como API de producao. Ofertas Publicas - Series permanece restrito.',
    metadata = coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
      'code','src_anbima_dados',
      'provider','anbima',
      'official',true,
      'freeConsultation',true,
      'implementedRuntime',false,
      'implementationPhase','public_reference_only_pending_explicit_download_contract',
      'integrationDecision','do_not_automate_undocumented_web_bff',
      'allowedUse',jsonb_build_array(
        'manual_research',
        'analyst_corroboration',
        'explicit_public_download_when_stable'
      ),
      'disallowedUse',jsonb_build_array(
        'undocumented_bff_as_production_api',
        'restricted_dataset_automation',
        'subscriber_feed_without_contract'
      ),
      'probeEvidence',jsonb_build_object(
        'executedAt','2026-07-24',
        'targetsLoaded',8,
        'publicJsonSurfacesObserved',25,
        'downloadsObserved',0,
        'offersSeriesRestricted',true,
        'debenturePricingPublicConsultation',true,
        'fidcWebBffStatusObserved',418
      ),
      'paidIntegrationProduct','ANBIMA Feed',
      'reviewRequiredBeforeRuntime',true
    ),
    updated_at = now()
where metadata->>'code' = 'src_anbima_dados';

update public.source_catalog
set status = 'partial',
    health = 'healthy',
    validation_rule = 'Consulta publica para caracteristicas, precos e comparaveis. Nao usar endpoints internos do portal como API oficial; aguardar download publico estavel ou contrato ANBIMA Feed.',
    metadata = coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
      'code','src_anbima_debentures',
      'provider','anbima',
      'official',true,
      'freeConsultation',true,
      'implementedRuntime',false,
      'implementationPhase','manual_corroboration_public_ui',
      'integrationDecision','public_reference_no_automated_connector',
      'publicCapabilitiesObserved',jsonb_build_array(
        'debenture_search',
        'instrument_characteristics',
        'issuer_identity',
        'maturity',
        'remuneration',
        'historical_pu',
        'indicative_pricing_dataset_sample'
      ),
      'runtimeAlternativeSources',jsonb_build_array(
        'CVM ofertas publicas',
        'CVM formulario de referencia',
        'B3 public data when explicitly downloadable'
      ),
      'reviewRequiredBeforeRuntime',true
    ),
    updated_at = now()
where metadata->>'code' = 'src_anbima_debentures';

comment on table public.source_catalog is
'Governed source registry. A public website surface is not automatically an approved machine-to-machine connector; metadata.integrationDecision controls operational adoption.';
