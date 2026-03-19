from typing import Any

from pydantic import BaseModel

from app.schemas.common import TimestampedResponse


class MonitoringOutputCreate(BaseModel):
    company_id: int
    source_type: str
    source_name: str
    output_json: dict[str, Any]
    observed_signals_json: list[str]


class MonitoringOutputResponse(TimestampedResponse):
    company_id: int
    source_type: str
    source_name: str
    output_json: dict[str, Any]
    observed_signals_json: list[str]
