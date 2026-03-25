-- Additional ABM seed pack (fintech/receivables/FIDC/DCM scenarios).

insert into account_stakeholders (company_id, name, title, email, role_in_buying_committee, seniority, influence_score, champion_score, blocker_score, relationship_strength, what_they_care_about, known_objections, notes)
values
  ('cmp_safra_shop', 'Rafael Teixeira', 'Head de Funding', 'rafael.teixeira@safrashop.com.br', 'champion', 'director', 79, 82, 5, 75, 'Escalar crédito para sellers sem pressionar caixa.', 'Preocupação com governança de dados para investidores.', 'Aderente a narrativa de FIDC com trilha de readiness.'),
  ('cmp_verde_agro', 'Bianca Faria', 'CFO', 'bianca.faria@verdeagro.com.br', 'economic_buyer', 'c_level', 92, 58, 22, 61, 'Alongar passivo para ciclos de safra.', 'Questiona timing regulatório.', 'Precisa de playbook de objeções por setor agro.')
on conflict do nothing;

insert into touchpoints (company_id, owner_name, channel, direction, occurred_at, summary, sentiment, objection_raised, agreed_next_step, next_step_due_at)
values
  ('cmp_safra_shop', 'Coverage Lead', 'meeting', 'outbound', now() - interval '4 days', 'Discussão de funding need para sellers de maior prazo.', 'positive', true, 'Enviar modelo de elegibilidade de recebíveis', now() + interval '3 days'),
  ('cmp_verde_agro', 'Origination Squad', 'email', 'outbound', now() - interval '5 days', 'Envio de memo sobre estrutura híbrida warehouse + FIDC.', 'neutral', true, 'Agendar comitê de risco com CFO', now() + interval '6 days')
on conflict do nothing;

insert into objection_instances (company_id, objection_text, status, severity, resolution_notes)
values
  ('cmp_safra_shop', 'Dados históricos ainda não estão no padrão de data room.', 'open', 'medium', 'Conectar data intelligence para pacote mínimo de diligência.'),
  ('cmp_verde_agro', 'Timing de mercado para lançamento de estrutura está incerto.', 'open', 'high', 'Montar pre-mortem com cenários de atraso vs execução.')
on conflict do nothing;
