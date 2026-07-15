-- Align CVM-governed candidates with the canonical Capture Inbox promotion contract.

create or replace function public.normalize_cvm_candidate_contract()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(new.dedupe_key, '') like 'cvm:issuer:%' then
    if new.candidate_status = 'new' then
      new.candidate_status := 'captured';
    end if;

    if jsonb_typeof(new.receivables) = 'object' then
      if coalesce(new.receivables -> 'instrumentTypes', '[]'::jsonb) @> '["FIDC"]'::jsonb then
        new.receivables := jsonb_build_array(
          'FIDC identificado em registro CVM — validar carteira, originador e lastro'
        );
      else
        new.receivables := '[]'::jsonb;
      end if;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.normalize_cvm_candidate_contract() from public;

drop trigger if exists trg_normalize_cvm_candidate_contract
  on public.discovered_company_candidates;
create trigger trg_normalize_cvm_candidate_contract
  before insert or update of dedupe_key, candidate_status, receivables
  on public.discovered_company_candidates
  for each row
  execute function public.normalize_cvm_candidate_contract();

update public.discovered_company_candidates
set
  candidate_status = case when candidate_status = 'new' then 'captured' else candidate_status end,
  receivables = case
    when jsonb_typeof(receivables) = 'object'
      and coalesce(receivables -> 'instrumentTypes', '[]'::jsonb) @> '["FIDC"]'::jsonb
      then jsonb_build_array('FIDC identificado em registro CVM — validar carteira, originador e lastro')
    when jsonb_typeof(receivables) = 'object' then '[]'::jsonb
    else receivables
  end,
  updated_at = now()
where coalesce(dedupe_key, '') like 'cvm:issuer:%'
  and (
    candidate_status = 'new'
    or jsonb_typeof(receivables) = 'object'
  );

comment on function public.normalize_cvm_candidate_contract() is
  'Normaliza candidatos CVM para os tipos esperados pelo Capture Inbox e pelo fluxo de promoção.';
