-- Approved third-party public CNPJ lookup, same minimal registry cache.
-- Documentation: https://docs.cnpj.ws/referencia-de-api/api-publica/consultando-cnpj
-- Public API limits <=3 queries/minute/IP. Never store raw partners/contacts.
alter table public.fidc_assignor_registry_identities
  drop constraint if exists fidc_assignor_registry_identities_registry_provider_check,
  drop constraint if exists fidc_assignor_registry_identities_registry_url_check;

alter table public.fidc_assignor_registry_identities
  add constraint fidc_assignor_registry_identities_registry_provider_check
    check (registry_provider in (
      'brasilapi_receita_proxy',
      'minhareceita_receita_proxy',
      'cnpjws_publica_proxy'
    )),
  add constraint fidc_assignor_registry_identities_registry_url_check
    check (
      (registry_provider = 'brasilapi_receita_proxy'
        and registry_url = 'https://brasilapi.com.br/api/cnpj/v1/' || cnpj)
      or
      (registry_provider = 'minhareceita_receita_proxy'
        and registry_url = 'https://minhareceita.org/' || cnpj)
      or
      (registry_provider = 'cnpjws_publica_proxy'
        and registry_url = 'https://publica.cnpj.ws/cnpj/' || cnpj)
    );
