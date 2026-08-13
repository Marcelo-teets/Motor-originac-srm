insert into public.data_archive_policies (
  table_name, dataset_code, retention_mode, hot_retention_days, date_column,
  enabled, allow_prune, excel_sheet_prefix, notes
)
values (
  'capital_market_events', 'debentures_snd', 'payload_only', 1, 'observed_at',
  true, true, 'CM_debentures_snd',
  'Archive heavy SND event payloads after one day; keep normalized event columns, metrics and entity links online.'
)
on conflict (table_name, dataset_code) do update set
  retention_mode = excluded.retention_mode,
  hot_retention_days = excluded.hot_retention_days,
  date_column = excluded.date_column,
  enabled = excluded.enabled,
  allow_prune = excluded.allow_prune,
  excel_sheet_prefix = excluded.excel_sheet_prefix,
  notes = excluded.notes,
  updated_at = now();
