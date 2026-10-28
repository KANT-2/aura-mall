from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException
from starlette.responses import JSONResponse

from aura_api.core.errors import error_body
from aura_api.core.middleware import UUID_PATTERN
from aura_api.core.security import apply_security_headers

# Exception headers are server-authored protocol metadata, not arbitrary output.
PUBLIC_EXCEPTION_HEADERS = {"allow", "www-authenticate", "retry-after"}


async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    headers = {
        name: value
        for name, value in (exc.headers or {}).items()
        if name.lower() in PUBLIC_EXCEPTION_HEADERS
    }
    return JSONResponse(error_body(exc.status_code), status_code=exc.status_code, headers=headers)


async def validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    return JSONResponse(error_body(422), status_code=422)


async def server_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    # ServerErrorMiddleware creates this response outside user middleware.
    # Read the ID established before routing; normal response injection cannot run here.
    request_id = getattr(request.state, "request_id", None)
    if not (
        isinstance(request_id, str) and len(request_id) == 36 and UUID_PATTERN.fullmatch(request_id)
    ):
        # An outer middleware can fail before RequestIDMiddleware stores the ID.
        # In that case retain a valid BFF ID, otherwise mint a new safe ID.
        candidates = request.headers.getlist("x-request-id")
        candidate = candidates[0] if len(candidates) == 1 else ""
        request_id = (
            candidate
            if len(candidate) == 36 and UUID_PATTERN.fullmatch(candidate)
            else str(uuid4())
        )

    response = JSONResponse(
        error_body(500),
        status_code=500,
        headers={"X-Request-ID": request_id},
    )
    apply_security_headers(response.headers)
    return response


def register_exception_handlers(app: FastAPI) -> None:
    app.add_exception_handler(HTTPException, http_exception_handler)
    app.add_exception_handler(RequestValidationError, validation_exception_handler)
    app.add_exception_handler(Exception, server_exception_handler)
