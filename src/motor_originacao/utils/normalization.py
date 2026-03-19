import re
import unicodedata


NON_ALNUM_PATTERN = re.compile(r"[^a-z0-9]+")
DIGITS_PATTERN = re.compile(r"\D+")
LEGAL_SUFFIX_PATTERN = re.compile(r"\b(s a|sa|ltda|ltda me|eireli|me|s\/a)\b")


def normalize_name(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    normalized = normalized.lower().strip()
    normalized = NON_ALNUM_PATTERN.sub(" ", normalized)
    normalized = " ".join(part for part in normalized.split() if part)
    normalized = LEGAL_SUFFIX_PATTERN.sub("", normalized)
    normalized = " ".join(part for part in normalized.split() if part)
    return normalized


def normalize_cnpj(value: str | None) -> str | None:
    if value is None:
        return None
    digits = DIGITS_PATTERN.sub("", value)
    return digits or None
