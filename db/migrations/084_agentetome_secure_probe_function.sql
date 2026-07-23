-- Agentetome secure provider probe.
-- Reads the API key exclusively from Supabase Vault and returns only the
-- provider response metadata/payload. The decrypted key is never returned.

create schema if not exists private;

revoke all on schema private from public;
grant usage on schema private to service_role;

create or replace function private.probe_agentetome_admin_manifest(
  p_admin text default 'oliveira trust',
  p_cut text default 'recente',
  p_competence text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions, vault, private
as $$
declare
  v_api_key text;
  v_url text;
  v_response extensions.http_response;
  v_payload jsonb;
  v_started_at timestamptz := clock_timestamp();
begin
  if nullif(trim(p_admin), '') is null then
    raise exception 'admin_required';
  end if;

  if p_cut not in ('recente', 'competencia') then
    raise exception 'invalid_cut';
  end if;

  if p_cut = 'competencia'
     and (p_competence is null or p_competence !~ '^\d{4}-\d{2}$') then
    raise exception 'invalid_competence';
  end if;

  select decrypted_secret
    into v_api_key
  from vault.decrypted_secrets
  where name = 'agentetome_api_key'
  limit 1;

  if v_api_key is null then
    raise exception 'agentetome_secret_missing';
  end if;

  v_url := 'https://www.agentetome.com/api/v1/export/admin/manifest?admin='
    || extensions.urlencode(trim(p_admin)::varchar)
    || '&corte=' || extensions.urlencode(p_cut::varchar);

  if p_competence is not null then
    v_url := v_url
      || '&competencia='
      || extensions.urlencode(p_competence::varchar);
  end if;

  v_response := extensions.http(
    row(
      'GET'::extensions.http_method,
      v_url::varchar,
      array[
        row(
          'Authorization'::varchar,
          ('Bearer ' || v_api_key)::varchar
        )::extensions.http_header,
        row(
          'Accept'::varchar,
          'application/json'::varchar
        )::extensions.http_header
      ]::extensions.http_header[],
      null::varchar,
      null::varchar
    )::extensions.http_request
  );

  begin
    v_payload := coalesce(v_response.content, '{}')::jsonb;
  exception when others then
    v_payload := jsonb_build_object(
      'unparsed_body',
      left(coalesce(v_response.content, ''), 2000)
    );
  end;

  return jsonb_build_object(
    'provider', 'agentetome',
    'operation', 'admin_manifest',
    'admin', trim(p_admin),
    'cut', p_cut,
    'competence', p_competence,
    'http_status', v_response.status,
    'content_type', v_response.content_type,
    'duration_ms', floor(
      extract(epoch from (clock_timestamp() - v_started_at)) * 1000
    ),
    'payload', v_payload
  );
end;
$$;

comment on function private.probe_agentetome_admin_manifest(text, text, text)
is 'Runs an Agentetome admin manifest probe using the API key stored in Supabase Vault. Restricted to service_role.';

revoke all on function private.probe_agentetome_admin_manifest(text, text, text)
  from public, anon, authenticated;
grant execute on function private.probe_agentetome_admin_manifest(text, text, text)
  to service_role;
