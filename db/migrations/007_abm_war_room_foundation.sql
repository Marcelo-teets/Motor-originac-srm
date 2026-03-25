-- ABM War Room foundation: commercial operational layer integrated with companies/pipeline/intelligence.

alter table companies
  add column if not exists account_tier text,
  add column if not exists estimated_ticket_size numeric,
  add column if not exists commercial_owner_id uuid references users(id),
  add column if not exists commercial_owner_name text,
  add column if not exists next_step text,
  add column if not exists next_step_due_at timestamptz,
  add column if not exists last_touchpoint_at timestamptz,
  add column if not exists momentum_status text,
  add column if not exists priority_reason text,
  add column if not exists mapped_pains jsonb not null default '[]'::jsonb,
  add column if not exists competitors_context jsonb not null default '[]'::jsonb,
  add column if not exists entry_angle text,
  add column if not exists weekly_focus_flag boolean not null default false;

create table if not exists account_stakeholders (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references companies(id) on delete cascade,
  name text not null,
  title text,
  email text,
  phone text,
  linkedin_url text,
  role_in_buying_committee text,
  seniority text,
  influence_score integer not null default 0,
  champion_score integer not null default 0,
  blocker_score integer not null default 0,
  relationship_strength integer not null default 0,
  what_they_care_about text,
  known_objections text,
  last_contact_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_account_stakeholders_company on account_stakeholders(company_id, updated_at desc);

create table if not exists touchpoints (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references companies(id) on delete cascade,
  stakeholder_id uuid references account_stakeholders(id) on delete set null,
  owner_id uuid references users(id),
  owner_name text,
  channel text not null,
  direction text,
  occurred_at timestamptz not null,
  summary text not null,
  raw_notes text,
  sentiment text,
  objection_raised boolean not null default false,
  agreed_next_step text,
  next_step_due_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_touchpoints_company_occurred on touchpoints(company_id, occurred_at desc);

create table if not exists objection_playbook (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  objection_label text not null,
  objection_text text not null,
  recommended_response text not null,
  credit_angle text,
  escalation_rule text,
  created_at timestamptz not null default now()
);

create table if not exists objection_instances (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references companies(id) on delete cascade,
  stakeholder_id uuid references account_stakeholders(id) on delete set null,
  touchpoint_id uuid references touchpoints(id) on delete set null,
  playbook_id uuid references objection_playbook(id) on delete set null,
  objection_text text not null,
  status text not null default 'open',
  severity text,
  resolution_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_objection_instances_company_status on objection_instances(company_id, status, updated_at desc);

create table if not exists account_momentum_snapshots (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references companies(id) on delete cascade,
  momentum_score integer not null,
  momentum_status text not null,
  rationale text,
  created_at timestamptz not null default now()
);
create index if not exists idx_momentum_company_created on account_momentum_snapshots(company_id, created_at desc);

create table if not exists commercial_priority_snapshots (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references companies(id) on delete cascade,
  priority_score integer not null,
  priority_band text not null,
  rationale text,
  created_at timestamptz not null default now()
);
create index if not exists idx_priority_company_created on commercial_priority_snapshots(company_id, created_at desc);

create table if not exists deal_outcomes (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references companies(id) on delete cascade,
  outcome_type text not null,
  reason text,
  decisive_objection text,
  learning_notes text,
  created_at timestamptz not null default now()
);

-- minimal operational seeds aligned with fintech/receivables/funding context.
insert into objection_playbook (category, objection_label, objection_text, recommended_response, credit_angle, escalation_rule)
values
  ('pricing', 'FIDC setup cost', 'Estruturar FIDC agora vai elevar demais o custo de funding.', 'Propor desenho faseado com warehouse transitório e meta clara de migração para FIDC.', 'Estrutura reduz custo marginal no médio prazo e protege crescimento.', 'Escalar para structuring lead quando ticket > 30M e objeção persistir > 14 dias.'),
  ('timing', 'Not now', 'Prioridade do trimestre está no crescimento comercial, não em funding.', 'Conectar risco de descasamento de capital ao plano comercial e propor sprint de readiness de 2 semanas.', 'Preservar capacidade de originação sem pressionar balanço.', 'Escalar para diretor comercial quando houver atraso em next step > 7 dias.'),
  ('governance', 'Data readiness', 'Ainda não temos pacote de dados para comitê de crédito externo.', 'Usar trilha de qualification + data intelligence para montar data room mínimo em ondas.', 'Ganhar previsibilidade de captação e reduzir fricção com investidores.', 'Escalar para data intelligence owner quando faltarem mais de 3 evidências críticas.')
on conflict do nothing;

insert into account_stakeholders (company_id, name, title, email, role_in_buying_committee, seniority, influence_score, champion_score, blocker_score, relationship_strength, what_they_care_about, known_objections, last_contact_at, notes)
values
  ('cmp_neon_receivables', 'Marina Costa', 'Head de Tesouraria', 'marina.costa@neonreceivables.com.br', 'economic_buyer', 'director', 88, 76, 8, 72, 'Alongar duration de funding e reduzir custo de capital.', 'Teme complexidade operacional de estrutura dedicada.', now() - interval '3 days', 'Campeã potencial para desenho de FIDC faseado.'),
  ('cmp_neon_receivables', 'Eduardo Lima', 'CFO', 'eduardo.lima@neonreceivables.com.br', 'decision_maker', 'c_level', 93, 45, 30, 55, 'Preservar velocidade de expansão com disciplina de risco.', 'Questiona timing para captação estruturada.', now() - interval '6 days', 'Precisa de briefing objetivo com cenário de risco de não agir.'),
  ('cmp_orbit_pay', 'Camila Prado', 'Diretora de Crédito', 'camila.prado@orbitpay.com.br', 'champion', 'director', 82, 84, 4, 78, 'Aumentar capacidade de funding para sellers recorrentes.', 'Receio de custo de implementação inicial.', now() - interval '2 days', 'Bem receptiva a plano incremental com quick wins.')
on conflict do nothing;

insert into touchpoints (company_id, owner_name, channel, direction, occurred_at, summary, raw_notes, sentiment, objection_raised, agreed_next_step, next_step_due_at)
values
  ('cmp_neon_receivables', 'Origination Squad', 'meeting', 'outbound', now() - interval '2 days', 'Reunião de diagnóstico de funding gap com tesouraria.', 'Discutido cenário de crescimento 2026 e limitação de balanço próprio.', 'positive', true, 'Enviar proposta de trilha warehouse->FIDC', now() + interval '4 days'),
  ('cmp_neon_receivables', 'Coverage Lead', 'whatsapp', 'outbound', now() - interval '1 day', 'Follow-up com CFO sobre timing de comitê interno.', 'CFO pediu material de risco de atraso.', 'neutral', true, 'Compartilhar pre-mortem e riscos de cooling', now() + interval '2 days'),
  ('cmp_orbit_pay', 'Origination Squad', 'email', 'outbound', now() - interval '3 days', 'Envio de one-pager de estrutura de crédito para expansão SMB.', 'Retorno positivo da diretoria de crédito.', 'positive', false, 'Agendar call técnica de dados', now() + interval '5 days')
on conflict do nothing;

insert into objection_instances (company_id, objection_text, status, severity, resolution_notes)
values
  ('cmp_neon_receivables', 'Timing para iniciar estrutura dedicada em meio à expansão comercial.', 'open', 'high', 'Preparar pre-mortem com evidências de risco de descasamento.'),
  ('cmp_orbit_pay', 'Custo inicial de implantação da estrutura.', 'open', 'medium', 'Responder com plano de implantação em ondas e quick wins operacionais.')
on conflict do nothing;
