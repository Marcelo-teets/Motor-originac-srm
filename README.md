# Motor Originação SRM

Backend inicial para uma plataforma de originação e inteligência comercial focada em resolução de entidades, governança de fontes brasileiras, monitoramento de sinais, scoring, geração de tese e fundação de market map.

## Objetivo do projeto
Construir uma base funcional e evolutiva para identificar empresas, consolidar sinais de mercado/regulatórios, transformar evidências em score e gerar uma tese operacional de abordagem.

## O que foi implementado nesta rodada
- API FastAPI funcional.
- Entity resolution por CNPJ e nome normalizado.
- Catálogo interno de fontes BR-only com governança básica.
- Ingestão de sinais com histórico por empresa.
- Score determinístico com snapshots históricos.
- Geração de thesis coerente e reutilizável.
- Fundação de market map com card resumido.
- Testes end-to-end cobrindo os fluxos centrais.

## Arquitetura
A aplicação foi organizada em camadas simples:
- `api/`: rotas HTTP.
- `services/`: lógica de negócio.
- `repositories/`: estado em memória.
- `domain/`: enums e entidades internas.
- `models/`: contratos de entrada e saída.
- `utils/`: normalização e tempo.

Mais detalhes em `docs/arquitetura.md`.

## Estrutura de pastas
```text
src/motor_originacao/
  api/
  core/
  domain/
  models/
  repositories/
  services/
  utils/
tests/
docs/
scripts/
```

## Requisitos
- Python 3.12+ recomendado
- pip

## Instalação
```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Configuração
Copie o arquivo de exemplo e ajuste se desejar:
```bash
cp .env.example .env
```

## Como rodar localmente
### Opção 1 — script
```bash
./scripts/run.sh
```

### Opção 2 — uvicorn direto
```bash
uvicorn motor_originacao.main:app --host 0.0.0.0 --port 8000 --app-dir src --reload
```

### Opção 3 — Docker
```bash
docker compose up --build
```

## Como testar
```bash
PYTHONPATH=src pytest -q
```

## Endpoints disponíveis

### Health
- `GET /health`

### Companies
- `POST /companies`
- `GET /companies`
- `GET /companies/{company_id}`
- `GET /companies/{company_id}/signals`

### Sources
- `GET /sources`
- `POST /sources`

### Signals
- `POST /signals`
- `GET /signals`
- `GET /signals/{signal_id}`

### Scores
- `GET /scores/{company_id}`
- `GET /scores/{company_id}/history`

### Thesis
- `GET /thesis/{company_id}`

### Market Map
- `GET /market-map/{company_id}`

## Exemplos de uso

### Criar ou resolver empresa
```bash
curl -X POST http://localhost:8000/companies \
  -H 'Content-Type: application/json' \
  -d '{
    "nome": "Empresa Exemplo LTDA",
    "cnpj": "12.345.678/0001-90"
  }'
```

### Consultar fontes
```bash
curl http://localhost:8000/sources
```

### Registrar sinal
```bash
curl -X POST http://localhost:8000/signals \
  -H 'Content-Type: application/json' \
  -d '{
    "company_id": "cmp_xxx",
    "source_id": "src_xxx",
    "tipo": "positivo",
    "titulo": "Receita sem restrições relevantes",
    "descricao": "Cadastro íntegro e sem pendências.",
    "intensidade": 4
  }'
```

### Consultar score atual
```bash
curl http://localhost:8000/scores/cmp_xxx
```

### Gerar thesis
```bash
curl http://localhost:8000/thesis/cmp_xxx
```

## Regras de score implementadas
- Score base de 50.
- Cada sinal gera delta proporcional à intensidade (`1..5`).
- Sinais positivos/crescimento somam pontos.
- Sinais de risco/alerta/negativos reduzem pontos.
- A confiabilidade da fonte multiplica o impacto do sinal.
- O resultado final é limitado entre 0 e 100.
- Cada ingestão de sinal gera um novo snapshot histórico.

## Catálogo inicial de fontes
Inclui fontes brasileiras plausíveis e úteis para a fase atual:
- Receita Federal do Brasil
- Comissão de Valores Mobiliários
- Banco Central do Brasil
- Jusbrasil Monitor
- Valor Econômico
- B3 Insights

## Limitações atuais
- Persistência apenas em memória.
- Sem autenticação/autorização.
- Sem integrações externas.
- Sem upload de documentos.
- Sem frontend.

## Próximos passos
Veja `docs/roadmap.md` para a evolução sugerida, incluindo persistência real, ingestão externa, observabilidade, copilot e market map avançado.
