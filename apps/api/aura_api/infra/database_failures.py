"""Public-safe DB failures and bounded replay of explicitly read-only catalog GETs."""

import asyncio
import json

import psycopg
from fastapi import Request
from sqlalchemy.exc import DBAPIError
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from aura_api.infra.database_errors import DatabaseUnavailable

TRANSIENT_STATES = {"57P01", "57P02", "57P03", "25006", "28000", "28P01"}


def connection_failure(error: Exception) -> bool:
    if isinstance(error, DatabaseUnavailable):
        return True
    if isinstance(error, DBAPIError):
        state = getattr(error.orig, "sqlstate", None) or getattr(error.orig, "pgcode", None)
        return error.connection_invalidated or (
            isinstance(state, str) and (state.startswith("08") or state in TRANSIENT_STATES)
        )
    if isinstance(error, (psycopg.OperationalError, psycopg.InterfaceError)):
        state = error.sqlstate
        return state is None or state.startswith("08") or state in TRANSIENT_STATES
    return False


def unavailable_response() -> JSONResponse:
    return JSONResponse(
        {"error": {"code": "DATABASE_UNAVAILABLE", "message": "잠시 후 다시 시도해 주세요."}},
        status_code=503,
        headers={"Retry-After": "1"},
    )


async def database_exception_handler(request: Request, error: Exception) -> JSONResponse:
    if connection_failure(error):
        return unavailable_response()
    # Syntax errors, broken schemas, constraints and business errors are not retried.
    from aura_api.core.exception_handlers import server_exception_handler

    return await server_exception_handler(request, error)


class CatalogFailoverMiddleware:
    """Buffer only catalog JSON. A new ASGI invocation gets fresh request DB sessions.

    Writes, arbitrary GETs, streaming bodies and responses already sent are never
    replayed. The budget starts after the first connection failure, and is shorter
    than the BFF's existing ten-second upstream timeout.
    """

    def __init__(self, app: ASGIApp, *, prefix: str, seconds: float = 8):
        self.app = app
        self.path = prefix.rstrip("/") + "/catalog"
        self.seconds = seconds

    async def __call__(self, scope: Scope, receive: Receive, send: Send):
        path = scope.get("path", "")
        if (
            scope["type"] != "http"
            or scope["method"] != "GET"
            or not (path == self.path or path.startswith(self.path + "/products/"))
        ):
            await self.app(scope, receive, send)
            return
        deadline = None
        while True:
            messages: list[Message] = []

            async def collect(message: Message, target=messages):
                target.append(message)

            budget = asyncio.timeout_at(deadline)
            try:
                async with budget:
                    # FastAPI creates and closes dependency exit stacks for each attempt.
                    await self.app(dict(scope), receive, collect)
            except TimeoutError:
                if not budget.expired():
                    raise
                await unavailable_response()(scope, receive, send)
                return
            status = next(
                message["status"]
                for message in messages
                if message["type"] == "http.response.start"
            )
            body = b"".join(
                message.get("body", b"")
                for message in messages
                if message["type"] == "http.response.body"
            )
            retry = False
            if status == 503:
                try:
                    retry = json.loads(body).get("error", {}).get("code") == "DATABASE_UNAVAILABLE"
                except (ValueError, AttributeError):
                    pass
            if not retry:
                for message in messages:
                    await send(message)
                return
            now = asyncio.get_running_loop().time()
            if deadline is None:
                deadline = now + self.seconds
            if now >= deadline:
                for message in messages:
                    await send(message)
                return
            await asyncio.sleep(min(0.2, deadline - now))
