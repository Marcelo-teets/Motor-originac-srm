# Checklist de Definition of Done — MVP de Originação

Use esta lista antes de declarar o projeto funcional.

## Infra e segurança

- [ ] Produção serve SHA da `main`.
- [ ] `/api/health` expõe SHA e ambiente.
- [ ] Security Advisor sem ERROR.
- [ ] Nenhuma função administrativa executável por `anon`.
- [ ] RLS/policies revisadas.
- [ ] Secrets configurados sem exposição.
- [ ] Monitores usam `/api/health` para uptime público.
- [ ] Endpoint de diagnóstico protegido retorna 401 sem bearer.

## Dados e conectores

- [ ] Monitoring diário verde.
- [ ] CVM diário/semanal verde conforme recurso.
- [ ] Nenhuma fonte `real` sem run persistido.
- [ ] `metadata.code` único.
- [ ] Lineage de sinais acima de 95%.
- [ ] Quotas e uso persistidos.
- [ ] Erro/resultado vazio não vira sinal.

## Descoberta

- [ ] Search profile ativo.
- [ ] Run persistido.
- [ ] 50+ candidatos.
- [ ] Dedupe validado.
- [ ] 20+ empresas promovidas.
- [ ] Link candidato→empresa persistido.

## Inteligência

- [ ] Qualification atual.
- [ ] Patterns atuais.
- [ ] Lead score atual.
- [ ] Ranking atual.
- [ ] Trigger events reais.
- [ ] Thesis para top 20.
- [ ] Market map para top 20.
- [ ] Evidências visíveis.

## Operação comercial

- [ ] Owner em 100% dos top leads.
- [ ] Next action em 100% dos top leads.
- [ ] Tasks com prazo.
- [ ] Activities recentes.
- [ ] Pipeline navegável.
- [ ] War room semanal.

## Paper Clip

- [ ] Comando persistido.
- [ ] Auth aplicada.
- [ ] Worker executa.
- [ ] Task/activity gerada.
- [ ] Retry idempotente.
- [ ] Falhas visíveis.
- [ ] Audit trail.
- [ ] Status `real` validado end-to-end.

## Qualidade

- [ ] Typecheck.
- [ ] Testes.
- [ ] Build.
- [ ] Migration check.
- [ ] Smoke Supabase.
- [ ] Smoke Vercel.
- [ ] Rollback documentado.
- [ ] Documentação atualizada.
