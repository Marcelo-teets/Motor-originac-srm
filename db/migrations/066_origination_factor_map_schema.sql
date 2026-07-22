create table if not exists public.origination_factor_catalog (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  dimension text not null,
  description text,
  hypothesis text not null,
  positive_direction boolean not null default true,
  default_weight numeric(8,4) not null default 1,
  decay_days integer not null default 180,
  version integer not null default 1,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint origination_factor_dimension_check check (dimension in ('funding_need','fidc_fit','dcm_fit','timing','executability','risk')),
  constraint origination_factor_decay_check check (decay_days between 1 and 3650)
);

create table if not exists public.source_factor_rules (
  id uuid primary key default gen_random_uuid(),
  signal_type text not null,
  factor_id uuid not null references public.origination_factor_catalog(id) on delete cascade,
  source_code text not null default '*',
  base_contribution numeric(8,4) not null,
  min_strength numeric(8,4) not null default 0,
  confidence_floor numeric(8,4) not null default 0,
  rule_version integer not null default 1,
  rationale text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint source_factor_rule_unique unique (signal_type,factor_id,source_code,rule_version),
  constraint source_factor_rule_strength_check check (min_strength between 0 and 100),
  constraint source_factor_rule_confidence_check check (confidence_floor between 0 and 1)
);
create index if not exists idx_source_factor_rules_signal on public.source_factor_rules(signal_type,source_code) where active;

create table if not exists public.company_factor_observations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  signal_id uuid not null references public.company_signals(id) on delete cascade,
  factor_id uuid not null references public.origination_factor_catalog(id) on delete cascade,
  rule_id uuid not null references public.source_factor_rules(id) on delete restrict,
  contribution numeric(10,4) not null,
  signal_strength numeric(8,4) not null,
  confidence_score numeric(8,6) not null,
  observed_at timestamptz not null,
  expires_at timestamptz,
  evidence_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_factor_observation_unique unique(signal_id,factor_id,rule_id),
  constraint company_factor_observation_confidence_check check (confidence_score between 0 and 1)
);
create index if not exists idx_company_factor_observations_company on public.company_factor_observations(company_id,factor_id,observed_at desc);
create index if not exists idx_company_factor_observations_expiry on public.company_factor_observations(company_id,expires_at);

create table if not exists public.company_factor_snapshots (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  factor_id uuid not null references public.origination_factor_catalog(id) on delete cascade,
  snapshot_date date not null default current_date,
  score numeric(8,4) not null,
  net_contribution numeric(10,4) not null,
  trend numeric(10,4) not null default 0,
  evidence_count integer not null default 0,
  latest_observed_at timestamptz,
  confidence_score numeric(8,6) not null default 0,
  evidence_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_factor_snapshot_unique unique(company_id,factor_id,snapshot_date),
  constraint company_factor_snapshot_score_check check (score between 0 and 100),
  constraint company_factor_snapshot_confidence_check check (confidence_score between 0 and 1)
);
create index if not exists idx_company_factor_snapshots_company on public.company_factor_snapshots(company_id,snapshot_date desc,score desc);
create index if not exists idx_company_factor_snapshots_factor on public.company_factor_snapshots(factor_id,snapshot_date desc,score desc);

alter table public.origination_factor_catalog enable row level security;
alter table public.source_factor_rules enable row level security;
alter table public.company_factor_observations enable row level security;
alter table public.company_factor_snapshots enable row level security;

drop policy if exists service_role_all_origination_factor_catalog on public.origination_factor_catalog;
create policy service_role_all_origination_factor_catalog on public.origination_factor_catalog for all to service_role using (true) with check (true);
drop policy if exists authenticated_select_origination_factor_catalog on public.origination_factor_catalog;
create policy authenticated_select_origination_factor_catalog on public.origination_factor_catalog for select to authenticated using (true);
drop policy if exists service_role_all_source_factor_rules on public.source_factor_rules;
create policy service_role_all_source_factor_rules on public.source_factor_rules for all to service_role using (true) with check (true);
drop policy if exists authenticated_select_source_factor_rules on public.source_factor_rules;
create policy authenticated_select_source_factor_rules on public.source_factor_rules for select to authenticated using (true);
drop policy if exists service_role_all_company_factor_observations on public.company_factor_observations;
create policy service_role_all_company_factor_observations on public.company_factor_observations for all to service_role using (true) with check (true);
drop policy if exists authenticated_select_company_factor_observations on public.company_factor_observations;
create policy authenticated_select_company_factor_observations on public.company_factor_observations for select to authenticated using (true);
drop policy if exists service_role_all_company_factor_snapshots on public.company_factor_snapshots;
create policy service_role_all_company_factor_snapshots on public.company_factor_snapshots for all to service_role using (true) with check (true);
drop policy if exists authenticated_select_company_factor_snapshots on public.company_factor_snapshots;
create policy authenticated_select_company_factor_snapshots on public.company_factor_snapshots for select to authenticated using (true);

grant all on public.origination_factor_catalog,public.source_factor_rules,public.company_factor_observations,public.company_factor_snapshots to service_role;
grant select on public.origination_factor_catalog,public.source_factor_rules,public.company_factor_observations,public.company_factor_snapshots to authenticated;

insert into public.origination_factor_catalog (code,name,dimension,description,hypothesis,positive_direction,default_weight,decay_days,version,active)
values
('credit_product_intensity','Intensidade do produto de crédito','funding_need','Evidência de crédito como produto ou infraestrutura central.','Quanto mais central o crédito, maior a dependência de funding escalável.',true,1.35,180,1,true),
('embedded_finance_pressure','Pressão de embedded finance','funding_need','Crédito embutido no fluxo comercial da plataforma.','Embedded finance cresce antes da estrutura de funding e cria capital mismatch.',true,1.30,180,1,true),
('receivables_quality','Qualidade e recorrência dos recebíveis','fidc_fit','Evidência de carteira ou fluxo recebível estruturável.','Recebíveis recorrentes, previsíveis e documentados aumentam o fit para FIDC.',true,1.45,365,1,true),
('public_contract_backing','Lastro em contratos públicos','fidc_fit','Recebíveis contra entes públicos ou contratos administrativos.','Contratos públicos podem criar lastro, condicionado à performance, cessibilidade e ciclo de pagamento.',true,1.30,365,1,true),
('funding_gap_pressure','Pressão de funding gap','funding_need','Crescimento ou operação exige capital além do funding atual.','Funding gap explícito ou inferido antecede busca por dívida estruturada.',true,1.55,120,1,true),
('capital_mismatch_pressure','Descasamento de capital','funding_need','Prazo, custo ou natureza do passivo não acompanha o ativo.','Descasamento entre crescimento, ativos e funding cria necessidade de FIDC/DCM.',true,1.45,180,1,true),
('growth_acceleration','Aceleração de crescimento','timing','Expansão, novas verticais ou aumento de demanda.','Aceleração operacional aumenta a necessidade e melhora o timing de abordagem.',true,1.20,120,1,true),
('credit_team_buildout','Formação de time de crédito','timing','Contratação de profissionais de crédito, risco ou cobrança.','A montagem do time antecede lançamento/escala da carteira e necessidade de funding.',true,1.00,180,1,true),
('ownership_change','Mudança societária','timing','Entrada, saída ou troca material de sócios/controladores.','Mudanças societárias indicam reorganização, novo sponsor ou ciclo de capital.',true,1.10,180,1,true),
('sponsor_governance_visibility','Visibilidade de sponsor e governança','executability','Quadro societário e posição acionária identificáveis.','Sponsor claro e governança observável aumentam executabilidade e qualidade da diligência.',true,0.85,365,1,true),
('debt_maturity_concentration','Concentração de vencimentos','funding_need','Obrigações ou dívida concentradas em janelas próximas.','Concentração de maturidade cria pressão de refinanciamento e janela para DCM.',true,1.45,365,1,true),
('dcm_market_access','Acesso e aderência a DCM','dcm_fit','Histórico de instrumentos, ofertas, obrigações ou estrutura corporativa compatível.','Acesso prévio ou estrutura compatível reduz fricção para debênture/nota comercial.',true,1.30,365,1,true),
('existing_public_funding','Funding público existente','dcm_fit','Operações BNDES/Finep ou funding público observado.','Funding público existente cria ângulo de complemento, alongamento ou reperfilamento.',true,1.00,365,1,true),
('capital_cycle_change','Mudança no ciclo de capital','timing','Aumento/redução de capital ou reorganização formal.','Eventos formais de capital geralmente precedem novo plano financeiro ou estratégico.',true,1.10,180,1,true),
('vc_sponsor_signal','Sponsor institucional/VC','executability','Empresa integrante de portfólio institucional.','Sponsor institucional pode aumentar governança, acesso e velocidade de execução.',true,0.90,365,1,true),
('related_party_dependency','Dependência de partes relacionadas','risk','Transações materiais ou dependência financeira de partes relacionadas.','Dependência de partes relacionadas reduz transparência e pode limitar executabilidade.',false,1.20,365,1,true),
('fiscal_stress','Pressão fiscal','risk','Dívida ativa ou evento fiscal material.','Pressão fiscal aumenta urgência, mas reduz executabilidade até regularização.',false,1.35,365,1,true),
('compliance_blocker','Bloqueio de compliance','risk','Sanção ou impedimento oficial.','Sanção vigente bloqueia abordagem padrão e exige diligência reforçada.',false,1.70,730,1,true)
on conflict (code) do update set name=excluded.name,dimension=excluded.dimension,description=excluded.description,hypothesis=excluded.hypothesis,positive_direction=excluded.positive_direction,default_weight=excluded.default_weight,decay_days=excluded.decay_days,version=excluded.version,active=excluded.active,updated_at=now();

with rules(signal_type,factor_code,source_code,base_contribution,min_strength,confidence_floor,rationale) as (values
('credit_product_detected','credit_product_intensity','*',18.0,55.0,0.45,'Produto de crédito detectado aumenta dependência estrutural de funding.'),
('product_credit_terms','credit_product_intensity','*',14.0,55.0,0.45,'Termos de crédito publicados confirmam produto e intensidade financeira.'),
('embedded_finance','embedded_finance_pressure','*',20.0,50.0,0.40,'Embedded finance cria pressão de balanço/funding à medida que escala.'),
('financial_infrastructure_signal','embedded_finance_pressure','*',12.0,55.0,0.45,'Infraestrutura financeira sugere capacidade de originar ou processar crédito.'),
('receivables_detected','receivables_quality','*',20.0,55.0,0.45,'Recebíveis detectados sustentam hipótese de ativo estruturável.'),
('receivables_strong','receivables_quality','*',18.0,55.0,0.45,'Sinal forte de recebíveis aumenta fit para FIDC.'),
('cross_receivables_strength','receivables_quality','*',20.0,55.0,0.45,'Convergência entre fontes aumenta confiança na qualidade do ativo.'),
('fidc_fit_signal','receivables_quality','*',18.0,55.0,0.45,'Sinal de fit FIDC reforça ativo e estrutura sugerida.'),
('public_contract_receivables','public_contract_backing','*',24.0,60.0,0.70,'Contrato público cria lastro potencial condicionado à elegibilidade.'),
('funding_gap_signal','funding_gap_pressure','*',24.0,55.0,0.45,'Funding gap é evidência direta da necessidade de capital.'),
('growth_without_funding','funding_gap_pressure','*',22.0,55.0,0.45,'Crescimento sem funding adequado eleva necessidade prevista.'),
('growth_without_funding','growth_acceleration','*',14.0,55.0,0.45,'Crescimento observado cria timing comercial.'),
('capital_mismatch','capital_mismatch_pressure','*',22.0,55.0,0.45,'Capital mismatch evidencia inadequação do funding atual.'),
('cross_capital_structure','capital_mismatch_pressure','*',16.0,55.0,0.45,'Convergência de sinais confirma pressão na estrutura de capital.'),
('growth_timing_trigger','growth_acceleration','*',18.0,55.0,0.45,'Trigger recente aumenta urgência e timing.'),
('expansion_signal','growth_acceleration','*',15.0,55.0,0.45,'Expansão operacional tende a consumir capital de giro.'),
('b2b_expansion','growth_acceleration','*',14.0,55.0,0.45,'Expansão B2B aumenta necessidade de giro e execução.'),
('credit_team_hiring','credit_team_buildout','*',18.0,55.0,0.50,'Contratação em crédito antecipa lançamento ou escala da carteira.'),
('vc_portfolio_signal','vc_sponsor_signal','*',14.0,55.0,0.55,'Sponsor institucional melhora governança e acesso.'),
('dcm_fit_signal','dcm_market_access','*',20.0,55.0,0.45,'Sinal DCM indica estrutura corporativa compatível.'),
('public_financing_signal','existing_public_funding','*',18.0,55.0,0.70,'Funding público observado cria janela de complemento/reperfilamento.'),
('corporate_structure_change','ownership_change','*',14.0,55.0,0.70,'Mudança cadastral cria janela de confirmação societária.'),
('fiscal_stress','fiscal_stress','*',-24.0,55.0,0.70,'Pressão fiscal reduz executabilidade e exige regularização.'),
('legal_compliance_risk','compliance_blocker','*',-38.0,55.0,0.70,'Sanção oficial exige bloqueio ou diligência reforçada.'),
('ownership_structure_signal','sponsor_governance_visibility','src_rfb_qsa_bulk',10.0,45.0,0.70,'QSA oficial aumenta visibilidade de sponsor e governança.'),
('ownership_change','ownership_change','src_rfb_qsa_bulk',22.0,55.0,0.75,'Entrada ou saída societária cria novo ciclo de capital e abordagem.'),
('ownership_structure_signal','sponsor_governance_visibility','src_cvm_fre_capital_structure',10.0,45.0,0.70,'Posição acionária no FRE aumenta visibilidade de controle e sponsor.'),
('debt_maturity_pressure','debt_maturity_concentration','src_cvm_fre_capital_structure',26.0,55.0,0.75,'Dívida/obrigação no FRE cria hipótese de refinanciamento.'),
('debt_maturity_pressure','dcm_market_access','src_cvm_fre_capital_structure',18.0,55.0,0.75,'Instrumentos e obrigações formais indicam acesso a DCM.'),
('capital_structure_change','capital_cycle_change','src_cvm_fre_capital_structure',22.0,55.0,0.75,'Aumento/redução de capital cria timing financeiro.'),
('capital_structure_change','dcm_market_access','src_cvm_fre_capital_structure',12.0,55.0,0.70,'Mudança formal de capital indica maturidade societária para DCM.'),
('related_party_dependency','related_party_dependency','src_cvm_fre_capital_structure',-26.0,55.0,0.70,'Transação com parte relacionada exige diligência e pode reduzir executabilidade.'),
('market_access_signal','dcm_market_access','src_cvm_fre_capital_structure',22.0,55.0,0.75,'Posição acionária/distribuição de capital indica maturidade de mercado.')
)
insert into public.source_factor_rules(signal_type,factor_id,source_code,base_contribution,min_strength,confidence_floor,rule_version,rationale,active)
select rules.signal_type,factor.id,rules.source_code,rules.base_contribution,rules.min_strength,rules.confidence_floor,1,rules.rationale,true
from rules join public.origination_factor_catalog factor on factor.code=rules.factor_code
on conflict (signal_type,factor_id,source_code,rule_version) do update set base_contribution=excluded.base_contribution,min_strength=excluded.min_strength,confidence_floor=excluded.confidence_floor,rationale=excluded.rationale,active=excluded.active,updated_at=now();
