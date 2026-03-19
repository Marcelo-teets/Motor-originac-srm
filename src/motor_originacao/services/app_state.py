from motor_originacao.repositories.in_memory_repository import repository
from motor_originacao.services.copilot_service import CopilotService
from motor_originacao.services.entity_resolution_service import EntityResolutionService
from motor_originacao.services.market_map_service import MarketMapService
from motor_originacao.services.monitoring_service import MonitoringService
from motor_originacao.services.scoring_service import ScoringService
from motor_originacao.services.source_governance_service import SourceGovernanceService
from motor_originacao.services.thesis_service import ThesisService


source_governance_service = SourceGovernanceService(repository)
entity_resolution_service = EntityResolutionService(repository)
scoring_service = ScoringService(repository)
monitoring_service = MonitoringService(repository, scoring_service)
thesis_service = ThesisService(repository, scoring_service)
market_map_service = MarketMapService(repository, thesis_service)
copilot_service = CopilotService(repository, scoring_service, thesis_service)


def reset_state() -> None:
    repository.reset()
    source_governance_service.seed_defaults()
