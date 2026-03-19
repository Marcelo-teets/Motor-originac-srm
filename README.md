# Motor-originac-srm

Backend inicial do **Motor Originação SRM**, estruturado para servir como fundação de um motor de originação com foco em clareza, evolução incremental e facilidade de manutenção.

## Visão geral

Este repositório contém a base inicial de uma API em **FastAPI** para suportar a evolução de um motor de originação. Nesta primeira etapa, o objetivo é disponibilizar uma estrutura limpa, funcional e pronta para crescer sem antecipar complexidades desnecessárias.

## Objetivo

Construir uma fundação backend simples e profissional para suportar, nas próximas etapas:

- recebimento de propostas;
- análise de regras de negócio;
- persistência de dados;
- integrações com sistemas externos;
- observabilidade e operação em ambientes reais.

## Stack utilizada

- **Python 3.10+**
- **FastAPI**
- **Uvicorn**
- **Pydantic**
- **Pytest**
- **Docker / Docker Compose**

## Estrutura de pastas

```text
.
├── .env.example
├── .gitignore
├── Dockerfile
├── README.md
├── docker-compose.yml
├── docs/
│   ├── arquitetura.md
│   └── roadmap.md
├── requirements.txt
├── src/
│   └── motor_originacao/
│       ├── __init__.py
│       ├── config.py
│       ├── main.py
│       ├── api/
│       │   ├── __init__.py
│       │   └── routes.py
│       ├── core/
│       │   ├── __init__.py
│       │   └── logger.py
│       ├── models/
│       │   ├── __init__.py
│       │   └── proposta.py
│       └── services/
│           ├── __init__.py
│           └── analise_service.py
└── tests/
    ├── __init__.py
    └── test_healthcheck.py
```

## Como criar o ambiente virtual

### Linux / macOS

```bash
python3 -m venv .venv
source .venv/bin/activate
```

### Windows (PowerShell)

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

## Como instalar as dependências

```bash
pip install --upgrade pip
pip install -r requirements.txt
```

## Como rodar localmente

1. Opcionalmente, copie o arquivo de exemplo de variáveis de ambiente para customizar a execução local:

```bash
cp .env.example .env
```

2. Inicie a aplicação:

```bash
uvicorn motor_originacao.main:app --reload --app-dir src --port 8000
```

3. Acesse:

- API: `http://localhost:8000`
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

## Como rodar com Docker

```bash
docker compose up --build
```

> A aplicação já possui valores padrão e pode subir com Docker mesmo sem criar um `.env` local.


## Como testar

```bash
PYTHONPATH=src python -m pytest
```

## Endpoint disponível

### Healthcheck

**Requisição**

```http
GET /health
```

**Resposta esperada**

```json
{
  "status": "ok"
}
```

Exemplo com `curl`:

```bash
curl http://localhost:8000/health
```

## Documentação complementar

- Arquitetura: `docs/arquitetura.md`
- Roadmap: `docs/roadmap.md`

## Próximos passos sugeridos

- criar endpoint para recebimento de propostas;
- adicionar validações de domínio mais específicas;
- evoluir o serviço de análise com regras de negócio reais;
- introduzir persistência em banco de dados;
- adicionar autenticação e autorização;
- incluir observabilidade com métricas, tracing e logs estruturados.
