# Agentetome — ativação final de produção

## Estado atual

- PR #209 mergeada na `main`.
- Commit de produção: `b71d6425e8e5317e02410b7aa71e92bf1da174f2`.
- Deployment: `dpl_Erz7pqZsBbrKtr7E7EecRQhAFhc2`.
- Domínio canônico: `https://motor-originac-srm.vercel.app`.
- Runtime geral: `real`.
- Rota Agentetome implantada e protegida por Supabase Auth.
- Source Catalog: `partial/degraded` até segredo e probe autenticado.

## Bloqueio operacional

O segredo `AGENTETOME_API_KEY` ainda precisa ser configurado no projeto Vercel `motor-originac-srm` nos ambientes `Preview` e `Production`.

A chave enviada em conversa deve ser rotacionada no Agentetome antes da configuração definitiva.

## Validação após configurar o segredo

1. Autenticar no app e obter um Supabase access token válido.
2. Consultar `GET /api/sources/agentetome/status`.
3. Confirmar `configured=true` e `status=real`.
4. Executar um manifest controlado por administradora.
5. Confirmar registro sanitizado em `agentetome_operation_runs`.
6. Executar um export de teste e verificar que o link assinado não foi persistido.
7. Atualizar `source_catalog` para `real/healthy` somente após sucesso.

## Próxima entrega técnica

Após o primeiro pacote real:

- validar `manifest.schema_versao`;
- baixar e hashear o pacote;
- criar normalização bronze/silver;
- resolver fundo, classe, administradora e originador;
- gerar sinais observados com lineage;
- integrar comparáveis, Market Map e Thesis;
- recalibrar qualification/ranking somente com evidência corroborada por CVM/FNET.
