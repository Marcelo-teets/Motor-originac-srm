-- OBSOLETO: substituído pela 039. O id de source_catalog é uuid no banco vivo; este arquivo inseria id texto e falharia.
insert into public.source_catalog(
  id,
  name,
  source_type,
  category,
  auth_requirement,
  status,
  metadata,
  rate_limit_notes,
  health
) values (
  'src_mais_retorno_api',
  'Mais Retorno API',
  'api',
  'Market data',
  'api_key',
  'real',
  jsonb_build_object(
    'code', 'src_mais_retorno_api',
    'provider', 'Mais Retorno',
    'scope', 'fundos, indices, acoes, fiis, etfs, bdrs e tesouro direto',
    'useCase', 'fonte auxiliar de dados de mercado e comparaveis',
    'monthlyQuota', 500,
    'monthlyTarget', 500,
    'quotaPolicy', jsonb_build_object(
      'hardCapMonthlyRequests', 500,
      'useMaximumMonthly', true,
      'requiresReservationBeforeHttpCall', true,
      'reservationFunction', 'reserve_external_api_request'
    )
  ),
  'Hard cap interno: 500 requisicoes por mes. Reservar quota antes de qualquer chamada HTTP.',
  'healthy'
) on conflict (id) do update set
  name = excluded.name,
  source_type = excluded.source_type,
  category = excluded.category,
  auth_requirement = excluded.auth_requirement,
  status = excluded.status,
  metadata = public.source_catalog.metadata || excluded.metadata,
  rate_limit_notes = excluded.rate_limit_notes,
  health = excluded.health,
  updated_at = now();
