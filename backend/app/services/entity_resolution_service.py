from urllib.parse import urlparse

from app.schemas.entity_resolution import EntityResolutionRequest, EntityResolutionResponse


class EntityResolutionService:
    def resolve(self, payload: EntityResolutionRequest) -> EntityResolutionResponse:
        canonical = " ".join(part.capitalize() for part in payload.company_name.split())
        domain = None
        if payload.website:
            parsed = urlparse(payload.website)
            domain = parsed.netloc or parsed.path
            domain = domain.lower().removeprefix("www.")
        matched_aliases = [alias for alias in payload.aliases if alias.lower() in payload.company_name.lower()]
        confidence = min(0.99, 0.6 + (0.15 if domain else 0.0) + (0.05 * len(matched_aliases)))
        return EntityResolutionResponse(
            canonical_name=canonical,
            normalized_domain=domain,
            matched_aliases=matched_aliases,
            confidence=round(confidence, 2),
        )
