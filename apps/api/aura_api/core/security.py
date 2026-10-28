import re
from html import escape
from unicodedata import category
from urllib.parse import unquote, urlsplit

from starlette.datastructures import MutableHeaders

AUTHORITY = re.compile(r"(?:[a-zA-Z0-9.-]+|\[[a-fA-F0-9:]+\])(?::[0-9]{1,5})?")
JSON_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'"


def source_origin(value: str, *, referer: bool = False) -> str:
    """Parse a single HTTP origin, or the origin of an absolute Referer URL."""
    if not value or any(ord(char) <= 32 or ord(char) >= 127 for char in value):
        raise ValueError("Invalid source URL")
    if "\\" in value or "," in value:
        raise ValueError("Invalid source URL")
    try:
        parts = urlsplit(value)
        if (
            parts.scheme not in {"http", "https"}
            or not AUTHORITY.fullmatch(parts.netloc)
            or parts.fragment
            or (not referer and (parts.path or parts.query or "?" in value or "#" in value))
            or (parts.port is not None and not 1 <= parts.port <= 65535)
        ):
            raise ValueError("Invalid source URL")
        port = parts.port
        host = parts.hostname
    except ValueError:
        raise ValueError("Invalid source URL") from None
    if not host:
        raise ValueError("Invalid source URL")
    host = f"[{host}]" if ":" in host else host
    suffix = "" if port is None or port == {"http": 80, "https": 443}[parts.scheme] else f":{port}"
    return f"{parts.scheme}://{host}{suffix}"


def escape_html_text(value: str) -> str:
    """Escape plain text for HTML text/quoted attributes, never JS/CSS/URLs."""
    return escape(value, quote=True)


def validate_public_url(value: str) -> str:
    """Validate raw and decoded URLs, preserving the original output string."""
    candidate = value
    # Bound repeated decoding and fail closed on excessive encoding layers.
    for _ in range(8):
        if not candidate or any(
            char.isspace() or category(char) in {"Cc", "Cf", "Cs"} for char in candidate
        ):
            raise ValueError("Invalid public URL")
        if "\\" in candidate:
            raise ValueError("Invalid public URL")
        try:
            parts = urlsplit(candidate)
            if candidate.startswith("/"):
                if candidate.startswith("//") or parts.netloc:
                    raise ValueError("Invalid public URL")
            elif (
                parts.scheme not in {"http", "https"}
                or not AUTHORITY.fullmatch(parts.netloc)
                or (parts.port is not None and not 1 <= parts.port <= 65535)
            ):
                raise ValueError("Invalid public URL")
            decoded = unquote(candidate, errors="strict")
        except ValueError:
            raise ValueError("Invalid public URL") from None
        if decoded == candidate:
            return value
        candidate = decoded
    raise ValueError("Invalid public URL")


def apply_security_headers(headers: MutableHeaders) -> None:
    headers["X-Content-Type-Options"] = "nosniff"
    headers["Referrer-Policy"] = "no-referrer"
    headers["X-Frame-Options"] = "DENY"
    headers["Cache-Control"] = "private, no-store"
    content_type = headers.get("content-type", "").split(";", 1)[0].lower()
    if content_type == "application/json" or (
        content_type.startswith("application/") and content_type.endswith("+json")
    ):
        headers["Content-Security-Policy"] = JSON_CSP
    vary = {value.strip().lower() for value in headers.get("vary", "").split(",")}
    if "*" not in vary:
        existing = headers.get("vary", "")
        additions = [
            name for name in ("Origin", "Referer", "Sec-Fetch-Site") if name.lower() not in vary
        ]
        headers["Vary"] = ", ".join(filter(None, [existing, *additions]))
