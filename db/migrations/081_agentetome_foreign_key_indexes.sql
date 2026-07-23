-- Cover Agentetome audit foreign keys used by cleanup and investigation paths.

create index if not exists agentetome_operation_runs_source_id_idx
  on public.agentetome_operation_runs (source_id)
  where source_id is not null;

create index if not exists agentetome_operation_runs_requested_by_idx
  on public.agentetome_operation_runs (requested_by)
  where requested_by is not null;
