-- 052_open_finance_participants_api_source.sql
-- Registers the official Open Finance Brasil participants directory as an API
-- source. Upgrade over the src_open_finance_participants_rss dork (029):
-- the official directory allows exact CNPJ matching, so it becomes the primary
-- evidence path for financial-infrastructure participation; the dork stays as
-- corroboration. Live schema note: metadata->>'code' is the stable key.

insert into public.source_catalog (name, source_type, category, auth_requirement, status, metadata, rate_limit_notes, health)
select v.name, v.source_type, v.category, v.auth_requirement, v.status,
       jsonb_build_object('code', v.code, 'provider', v.provider, 'baseUrl', v.base_url, 'captureMode', v.capture_mode, 'notes', v.notes),
       v.rate_limit_notes, v.health
from (values
  ('src_open_finance_participants_api','Open Finance Brasil Participants (diretório oficial)','api','embedded_finance','none','real','open_finance_brasil','https://data.directory.openbankingbrasil.org.br/participants','official_directory_api','Diretório público oficial de participantes; matching por CNPJ exato ou nome exato normalizado.','API pública sem chave; 1 busca global por execução do engine (memoizada).','healthy')
) as v(code, name, source_type, category, auth_requirement, status, provider, base_url, capture_mode, notes, rate_limit_notes, health)
where not exists (
  select 1 from public.source_catalog sc where sc.metadata->>'code' = v.code
);

insert into public.source_treatment_rules (
  source_code,
  signal_type,
  signal_family,
  strength_floor,
  confidence_delta,
  structural_score_delta,
  timing_score_delta,
  executability_score_delta,
  pattern_tags,
  treatment_policy
)
values
  ('src_open_finance_participants_api','financial_infrastructure_signal','embedded_finance',80,0.07,9,4,6,array['embedded_finance_pressure','credit_is_core'],'{"output":"company_signals","qualification_use":"structural need up when official directory confirms financial infrastructure role; CNPJ match is authoritative"}'::jsonb)
on conflict (source_code, signal_type) do update set
  signal_family = excluded.signal_family,
  strength_floor = excluded.strength_floor,
  confidence_delta = excluded.confidence_delta,
  structural_score_delta = excluded.structural_score_delta,
  timing_score_delta = excluded.timing_score_delta,
  executability_score_delta = excluded.executability_score_delta,
  pattern_tags = excluded.pattern_tags,
  treatment_policy = excluded.treatment_policy;
