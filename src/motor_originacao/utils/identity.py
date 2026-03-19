from __future__ import annotations

from hashlib import sha1


def build_deterministic_id(prefix: str, *parts: str) -> str:
    material = "::".join(part.strip().lower() for part in parts if part and part.strip())
    digest = sha1(material.encode("utf-8")).hexdigest()[:12]
    return f"{prefix}_{digest}"
