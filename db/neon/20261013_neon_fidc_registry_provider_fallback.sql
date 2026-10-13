-- Allows the existing registry identity cache to record which public proxy
-- actually corroborated the company. No new table/credentials/raw payload.
alter table public.fidc_assignor_registry_identities
  drop constraint if exists fidc_assignor_registry_identities_registry_provider_check,
  drop constraint if exists fidc_assignor_registry_identities_registry_url_check;

alter table public.fidc_assignor_registry_identities
  add constraint fidc_assignor_registry_identities_registry_provider_check
    check (registry_provider in ('brasilapi_receita_proxy', 'minhareceita_receita_proxy')),
  add constraint fidc_assignor_registry_identities_registry_url_check
    check (
      (registry_provider = 'brasilapi_receita_proxy'
        and registry_url = 'https://brasilapi.com.br/api/cnpj/v1/' || cnpj)
      or
      (registry_provider = 'minhareceita_receita_proxy'
        and registry_url = 'https://minhareceita.org/' || cnpj)
    );
