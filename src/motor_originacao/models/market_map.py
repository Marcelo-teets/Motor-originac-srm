from datetime import datetime
from typing import List

from pydantic import BaseModel


class MarketMapCardResponse(BaseModel):
    id: str
    company_id: str
    segmento: str
    tese_curta: str
    score_resumo: str
    sinais_chave: List[str]
    updated_at: datetime
