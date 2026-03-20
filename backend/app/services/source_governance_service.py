from app.schemas.source_governance import SourceGovernanceRequest, SourceGovernanceResponse


class SourceGovernanceService:
    APPROVED_TYPES = {"news", "filing", "research", "proprietary"}

    def validate(self, payload: SourceGovernanceRequest) -> SourceGovernanceResponse:
        base_score = payload.reliability_hint if payload.reliability_hint is not None else 65.0
        bonus = 15.0 if payload.source_type in self.APPROVED_TYPES else -10.0
        url_bonus = 5.0 if payload.url and payload.url.startswith("https://") else 0.0
        score = max(0.0, min(100.0, base_score + bonus + url_bonus))
        approved = score >= 60.0 and payload.source_type in self.APPROVED_TYPES
        rationale = (
            "Source approved for downstream ranking signals"
            if approved
            else "Source requires manual review before impacting ranking"
        )
        return SourceGovernanceResponse(
            source_name=payload.source_name,
            source_type=payload.source_type,
            confidence_score=round(score, 2),
            is_approved=approved,
            rationale=rationale,
        )
