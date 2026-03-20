from app.schemas.common import ORMModel


class CompanyResponse(ORMModel):
    id: int
    name: str
    sector: str
    current_ors_v2: float
    source_confidence_score: float
    market_fit_score: float
    trigger_strength: float
