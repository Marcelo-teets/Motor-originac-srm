from datetime import datetime
from typing import List

from pydantic import BaseModel

from motor_originacao.domain.enums import Recommendation


class ThesisResponse(BaseModel):
    id: str
    company_id: str
    resumo: str
    drivers: List[str]
    riscos: List[str]
    recomendacao: Recommendation
    generated_at: datetime
