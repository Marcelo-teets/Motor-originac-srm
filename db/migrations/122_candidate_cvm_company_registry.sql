-- Candidate CVM open-company registry enrichment.
-- Persists official registry evidence without promoting candidates or changing
-- qualification / score / pipeline eligibility.

create table if not exists public.candidate_official_enrichments (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.discovered_company_candidates(id) on delete cascade,
  source_id uuid references public.source_catalog(id) on delete set null,
  dataset_code text not null,
  source_record_key text not null,
  entity_cnpj text not null,
  enrichment_type text not null,
  effective_date date,
  source_url text not null,
  content_hash text not null,
  data jsonb not null default '{}'::jsonb,
  observed_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint candidate_official_enrichment_unique
    unique(candidate_id, dataset_code, source_record_key)
);

create index if not exists idx_candidate_official_enrichments_candidate
  on public.candidate_official_enrichments(candidate_id, observed_at desc);
create index if not exists idx_candidate_official_enrichments_cnpj
  on public.candidate_official_enrichments(entity_cnpj, dataset_code, observed_at desc);
create index if not exists idx_candidate_official_enrichments_type
  on public.candidate_official_enrichments(enrichment_type, effective_date desc);

alter table public.candidate_official_enrichments enable row level security;

drop policy if exists service_role_all_candidate_official_enrichments
  on public.candidate_official_enrichments;
create policy service_role_all_candidate_official_enrichments
  on public.candidate_official_enrichments
  for all to service_role
  using (true)
  with check (true);

revoke all on public.candidate_official_enrichments from public, anon, authenticated;
grant all on public.candidate_official_enrichments to service_role;

do $$
declare
  v_source_id uuid;
begin
  select id into v_source_id
  from public.source_catalog
  where metadata->>'code' = 'src_cvm_open_company_registry'
  order by created_at
  limit 1;

  if v_source_id is null then
    insert into public.source_catalog (
      name, url, category, scope, priority, criticality, frequency, status,
      validation_rule, metadata, source_type, auth_requirement,
      rate_limit_notes, health, created_at, updated_at
    ) values (
      'CVM Cadastro de Companhias Abertas',
      'https://dados.cvm.gov.br/dataset/cia_aberta-cad',
      'regulatory',
      'candidate_enrichment',
      1,
      'high',
      'daily',
      'partial',
      'CNPJ válido e correspondência exata com candidata canônica',
      jsonb_build_object(
        'code', 'src_cvm_open_company_registry',
        'tier', 'tier_1_official_regulatory',
        'datasetCode', 'cvm_open_company_registry_candidates',
        'resourceUrl', 'https://dados.cvm.gov.br/dados/CIA_ABERTA/CAD/DADOS/cad_cia_aberta.csv',
        'license', 'ODbL',
        'coverageScope', 'canonical_reviewable_candidates',
        'implementedRuntime', false,
        'fullCoverageAchieved', false
      ),
      'official_csv',
      'none',
      'Arquivo oficial diário; uma varredura por execução e persistência apenas de CNPJs-alvo.',
      'unknown',
      now(),
      now()
    );
  else
    update public.source_catalog
    set url = 'https://dados.cvm.gov.br/dataset/cia_aberta-cad',
        category = 'regulatory',
        scope = 'candidate_enrichment',
        priority = 1,
        criticality = 'high',
        frequency = 'daily',
        source_type = 'official_csv',
        auth_requirement = 'none',
        validation_rule = 'CNPJ válido e correspondência exata com candidata canônica',
        rate_limit_notes = 'Arquivo oficial diário; uma varredura por execução e persistência apenas de CNPJs-alvo.',
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
          'code', 'src_cvm_open_company_registry',
          'tier', 'tier_1_official_regulatory',
          'datasetCode', 'cvm_open_company_registry_candidates',
          'resourceUrl', 'https://dados.cvm.gov.br/dados/CIA_ABERTA/CAD/DADOS/cad_cia_aberta.csv',
          'license', 'ODbL',
          'coverageScope', 'canonical_reviewable_candidates'
        ),
        updated_at = now()
    where id = v_source_id;
  end if;
end;
$$;

comment on table public.candidate_official_enrichments is
  'Evidências cadastrais oficiais por candidata; não representa decisão de crédito ou promoção.';

notify pgrst, 'reload schema';
