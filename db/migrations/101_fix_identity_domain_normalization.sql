-- Canonical identity domains omit protocol, path and leading www.

create or replace function public.normalize_identity_domain(p_website text)
returns text
language sql
immutable
set search_path = public
as $$
  with normalized as (
    select lower(split_part(regexp_replace(btrim(coalesce(p_website,'')), '^https?://', '', 'i'), '/', 1)) as host
  )
  select nullif(case when left(host,4)='www.' then substring(host from 5) else host end,'')
  from normalized;
$$;

update public.companies
set domain=public.normalize_identity_domain(website_url),updated_at=now()
where origin='candidate_identity_review'
  and website_url is not null
  and domain is distinct from public.normalize_identity_domain(website_url);

update public.discovered_company_candidates
set normalized_domain=public.normalize_identity_domain(website),updated_at=now()
where raw_payload->>'identity_review_status'='approved'
  and website is not null
  and normalized_domain is distinct from public.normalize_identity_domain(website);

update public.candidate_identity_reviews
set normalized_domain=public.normalize_identity_domain(website),updated_at=now()
where review_status='approved'
  and website is not null
  and normalized_domain is distinct from public.normalize_identity_domain(website);

revoke all on function public.normalize_identity_domain(text) from public,anon,authenticated;
grant execute on function public.normalize_identity_domain(text) to service_role;
notify pgrst,'reload schema';
