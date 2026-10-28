from hmac import compare_digest

from starlette.datastructures import Headers, MutableHeaders
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from aura_api.core.errors import error_body
from aura_api.core.security import apply_security_headers, source_origin

SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}
SERVER_KEY_HEADER = "x-aura-bff-key"


class CSRFMiddleware:
    def __init__(self, app: ASGIApp, allowed_origins: list[str], server_key: str | None) -> None:
        self.app = app
        self.allowed_origins = frozenset(allowed_origins)
        self.server_key = server_key

    def permits(self, headers: Headers) -> bool:
        names = ("origin", "referer", "sec-fetch-site", SERVER_KEY_HEADER)
        values = {name: headers.getlist(name) for name in names}
        if any(len(items) > 1 for items in values.values()):
            return False
        site = headers.get("sec-fetch-site")
        if site is not None and site not in {"same-origin", "same-site", "none"}:
            return False
        origins = []
        try:
            for name in ("origin", "referer"):
                if values[name]:
                    origins.append(source_origin(values[name][0], referer=name == "referer"))
        except ValueError:
            return False
        if origins:
            return len(set(origins)) == 1 and origins[0] in self.allowed_origins

        # Headerless BFF calls need an explicitly provisioned server secret.
        # Browser metadata cannot substitute for an actual source or server credential.
        candidate = headers.get(SERVER_KEY_HEADER, "")
        return bool(
            site is None
            and self.server_key
            and 32 <= len(candidate) <= 128
            and candidate.isascii()
            and compare_digest(candidate, self.server_key)
        )

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def send_secure(message: Message) -> None:
            if message["type"] == "http.response.start":
                apply_security_headers(MutableHeaders(scope=message))
            await send(message)

        if scope["method"] not in SAFE_METHODS and not self.permits(Headers(scope=scope)):
            response = JSONResponse(error_body(403), status_code=403)
            await response(scope, receive, send_secure)
            return
        await self.app(scope, receive, send_secure)
