-- ─────────────────────────────────────────────────────────────
-- Migration 013 — Watch List MVP
-- Motor Originação SRM
-- Rodar no Supabase SQL Editor
-- ─────────────────────────────────────────────────────────────

-- Watch lists criadas por usuários
create table if not exists watchlists (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references users(id) on delete set null,
  name text not null,
  description text,
  is_shared boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_watchlists_created_by
  on watchlists(created_by, created_at desc);

-- Itens (empresas) vinculados a cada watch list
create table if not exists watchlist_items (
  id uuid primary key default gen_random_uuid(),
  watchlist_id uuid not null references watchlists(id) on delete cascade,
  company_id text not null references companies(id) on delete cascade,
  added_by uuid references users(id) on delete set null,
  priority_label text,
  notes text,
  added_at timestamptz not null default now(),
  constraint uq_watchlist_company unique(watchlist_id, company_id)
);

create index if not exists idx_watchlist_items_watchlist
  on watchlist_items(watchlist_id, added_at desc);

create index if not exists idx_watchlist_items_company
  on watchlist_items(company_id);

comment on table watchlists is
  'Listas de observação de empresas criadas por usuários para acompanhamento ativo antes do pipeline.';

comment on table watchlist_items is
  'Empresas vinculadas a uma watch list. Uma empresa pode estar em múltiplas listas.';
