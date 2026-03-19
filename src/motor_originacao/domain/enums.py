from enum import Enum


class ReliabilityLevel(str, Enum):
    VERY_LOW = "very_low"
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    VERY_HIGH = "very_high"


class SourceCategory(str, Enum):
    REGULATORY = "regulatoria"
    NEWS = "noticias"
    LEGAL = "juridico"
    FINANCIAL = "financeiro"
    REGISTRY = "cadastro"
    MARKET = "mercado"


class SignalType(str, Enum):
    POSITIVE = "positivo"
    NEGATIVE = "negativo"
    NEUTRAL = "neutro"
    ALERT = "alerta"
    GROWTH = "crescimento"
    RISK = "risco"


class Recommendation(str, Enum):
    PRIORITIZE = "priorizar"
    MONITOR = "monitorar"
    CAUTION = "cautela"
    AVOID = "evitar"
