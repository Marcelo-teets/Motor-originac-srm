from typing import List

from pydantic import BaseModel


class CopilotContextResponse(BaseModel):
    company_id: str
    company_nome: str
    score_atual: int
    score_faixa: str
    resumo_tese: str
    drivers: List[str]
    riscos: List[str]
    sinais_recentes: List[str]
    perguntas_sugeridas: List[str]
