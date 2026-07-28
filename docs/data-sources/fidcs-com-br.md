# FIDCS.com.br — contrato de integração

## Papel no sistema

O FIDCS.com.br é uma fonte **secundária e derivada** para validação e enriquecimento de fundos por CNPJ. A CVM permanece a fonte regulatória canônica para cadastro, informes, métricas e documentos.

A integração não cria um segundo cadastro de fundos e não promove dados do FIDCS.com.br automaticamente para score, qualification ou sinais canônicos.

## Runtime

- `GET /api/sources/fidcs/status`: status do conector e última execução.
- `GET /api/sources/fidcs/fund/:cnpj`: valida um fundo público por CNPJ e persiste snapshot leve.
- `POST /api/sources/fidcs/run?limit=3`: execução manual GOD-MODE, limitada a 10 fundos.
- `GET|POST /api/sources/fidcs/cron-run?limit=3`: execução autenticada por `CRON_SECRET`.

O runtime busca CNPJs já conhecidos em `capital_market_events`, consulta somente páginas públicas `https://fidcs.com.br/fundo/{cnpj}` e persiste o resultado em `monitoring_outputs` por `publicRecordKey`.

## Login premium

O runtime público não depende de login. A variável opcional `FIDCS_SESSION_COOKIE` apenas encaminha uma sessão já autorizada; ela não habilita scraping de endpoints internos nem automação de recursos premium não documentados.

## Deduplicação e governança

- Chave de entidade: CNPJ do fundo.
- Chave pública: `fidcs_com_br:{cnpj}`.
- Origem canônica: CVM.
- `sourceConfidenceCap`: 0,75.
- `automaticScoreImpact`: `false`.
- Máximo de 10 fundos por execução.

## Saúde

O conector é saudável quando uma página pública é lida, validada contra o CNPJ solicitado e persistida. Erros da Edge Function exibidos pela página são registrados como aviso; o snapshot só é aceito quando o conteúdo público ainda contém evidências suficientes.
