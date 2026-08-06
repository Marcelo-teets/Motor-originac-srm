# Controle oficial de fontes de dados — DCM

## Documento oficial

- Google Sheet: `Fonte de dados - dcm`
- Spreadsheet ID: `1qSMfIrpAbOmBE9x26WhyGk4Cn4AOLk7lAMKfbd1Msag`
- Aba: `Página1`
- Data da última alteração: `Página1!C1`

A planilha é a lista de controle institucional e legível por humanos. O `source_catalog` do Supabase permanece como fonte operacional para o runtime da plataforma.

## Regra obrigatória

Toda inclusão, remoção, correção, mudança de integração, alteração de saúde ou alteração de status de uma fonte precisa resultar em:

1. atualização do `source_catalog` e da implementação correspondente;
2. execução dos testes/smokes aplicáveis;
3. sincronização da planilha oficial;
4. atualização de `Página1!C1` com a data da sincronização em `America/Sao_Paulo`;
5. registro auditável em `source_control_sheet_sync_runs`.

Uma alteração de fonte não está operacionalmente encerrada enquanto esses cinco pontos não estiverem consistentes.

## Colunas controladas

| Coluna | Conteúdo |
|---|---|
| A | posição na lista |
| B | nome canônico da fonte |
| C | status institucional |
| D | saúde operacional |
| E | categoria |
| F | frequência |
| G | prioridade |
| H | criticidade |
| I | última execução conhecida |
| J | resultado da última execução |
| K | itens coletados na última execução |
| L | próxima ação operacional |

## Semântica dos status

- `Real`: conector e persistência reais, com validação operacional suficiente para produção.
- `Ativa`: fonte utilizada no processo, mas ainda dependente de monitoramento web/manual ou sem telemetria formal completa.
- `Parcial`: integração existente, porém com cobertura, ingestão, saúde ou validação ponta a ponta incompleta.
- `Planejada`: fonte aprovada para o roadmap, mas sem conector produtivo completo.

O status não pode ser promovido apenas porque uma execução terminou. Exemplo: um job `completed` com zero itens não transforma automaticamente uma fonte `Parcial` em `Real`.

## Automação

O workflow `.github/workflows/source-control-sheet-sync.yml`:

- valida o contrato em toda PR que altera o fluxo;
- sincroniza após mudanças relevantes na `main`;
- executa uma reconciliação horária como proteção contra alterações diretas no banco;
- pode ser disparado manualmente;
- não falha quando os secrets ainda não estão cadastrados: registra o skip e mantém o contrato validado.

O script `scripts/source-control-sheet-sync.mjs`:

1. consulta `source_control_sheet_v1` pela Data API do Supabase;
2. ordena as fontes com locale `pt-BR`;
3. normaliza status, saúde, categoria, frequência e criticidade;
4. limpa apenas o retângulo controlado `A3:L1002`;
5. grava tabela, resumo executivo e `C1` com `spreadsheets.values.batchUpdate`;
6. relê células sentinela e valida data, cabeçalho e última linha;
7. registra source count, status counts, health counts e SHA-256 no Supabase.

## Secrets necessários no GitHub

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GOOGLE_DRIVE_CLIENT_ID`
- `GOOGLE_DRIVE_CLIENT_SECRET`
- `GOOGLE_DRIVE_REFRESH_TOKEN`

As credenciais OAuth precisam ter acesso de edição à planilha oficial. Elas nunca devem ser colocadas no frontend, na planilha ou no repositório.

## Execução manual local

```bash
SUPABASE_URL=... \
SUPABASE_SERVICE_ROLE_KEY=... \
GOOGLE_DRIVE_CLIENT_ID=... \
GOOGLE_DRIVE_CLIENT_SECRET=... \
GOOGLE_DRIVE_REFRESH_TOKEN=... \
node scripts/source-control-sheet-sync.mjs
```

Validação sem escrita no Google Sheets:

```bash
SOURCE_CONTROL_SHEET_DRY_RUN=true \
SUPABASE_URL=... \
SUPABASE_SERVICE_ROLE_KEY=... \
node scripts/source-control-sheet-sync.mjs
```

## Referências técnicas

- Supabase Data API: https://supabase.com/docs/guides/api
- Google Sheets values batchUpdate: https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/batchUpdate
- Google OAuth refresh token: https://developers.google.com/identity/protocols/oauth2/web-server
