-- Minimal Neon compatibility fields required by Knowledge workspace.
-- Keeps the canonical qualification score while preserving historical readers.

alter table public.qualification_snapshots
  add column if not exists total_score numeric,
  add column if not exists next_action text;

update public.qualification_snapshots
set total_score = qualification_score_total
where total_score is null
  and qualification_score_total is not null;

create or replace function public.sync_neon_qualification_score_alias()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.qualification_score_total := coalesce(new.qualification_score_total, new.total_score);
  new.total_score := coalesce(new.total_score, new.qualification_score_total);
  return new;
end;
$$;

drop trigger if exists trg_sync_neon_qualification_score_alias
  on public.qualification_snapshots;

create trigger trg_sync_neon_qualification_score_alias
before insert or update of qualification_score_total, total_score
on public.qualification_snapshots
for each row execute function public.sync_neon_qualification_score_alias();
