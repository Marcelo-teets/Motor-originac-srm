-- MVP Closure Gate 2: preserve the generic 0.92 name/domain threshold, but allow
-- 0.90 for operating issuers when the same candidate also carries a valid CNPJ
-- and an official CVM registry identity. This combines two independent identity lanes
-- without weakening the generic company gate.

do $$
declare
  v_definition text;
  v_old text := $old$or (c.raw_payload#>>'{website_identity_capture,matchType}'='name_and_domain' and coalesce(nullif(c.raw_payload#>>'{website_identity_capture,confidence}','')::numeric,0)>=0.92))$old$;
  v_new text := $new$or (c.raw_payload#>>'{website_identity_capture,matchType}'='name_and_domain' and (
          coalesce(nullif(c.raw_payload#>>'{website_identity_capture,confidence}','')::numeric,0)>=0.92
          or (
            c.candidate_role='operating_issuer'
            and c.cvm_code is not null
            and nullif(btrim(coalesce(c.cvm_registration_situation,'')),'') is not null
            and coalesce(nullif(c.raw_payload#>>'{website_identity_capture,confidence}','')::numeric,0)>=0.90
          )
        )))$new$;
begin
  select pg_get_functiondef('public.auto_resolve_verified_candidate_entities_v4(integer)'::regprocedure)
    into v_definition;

  if v_definition is null or position(v_old in v_definition)=0 then
    raise exception 'Expected v4 name_and_domain threshold not found';
  end if;

  v_definition:=replace(v_definition,v_old,v_new);
  execute v_definition;
end;
$$;
