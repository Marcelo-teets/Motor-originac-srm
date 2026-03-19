# Backend

## Responsabilidades
- expor contratos HTTP para health, fontes, empresas, sinais, score, thesis e market map;
- concentrar regras de deduplicação e recomputação de score;
- manter rotas finas e serviço forte.

## Módulos
- `app/api/routes.py`: endpoints.
- `app/services/origination.py`: fluxo de negócio.
- `app/repositories/memory.py`: persistência temporária.
- `app/domain/models.py`: modelos e validações.
