"""Domain rule violations as HTTP responses in the common error format.

Domain codes and messages are fixed server-side strings (never user input), so they are
safe to show; the web displays `error.message` as-is.
"""

from fastapi import FastAPI, Request
from starlette.responses import JSONResponse

from aura_api.core.errors import ErrorDetail, ErrorResponse
from aura_api.domain.errors import DomainError

STATUS = {
    "invalid": 400,
    "unauthorized": 401,
    "forbidden": 403,
    "not_found": 404,
    "conflict": 409,
}


async def domain_error_handler(request: Request, exc: DomainError) -> JSONResponse:
    body = ErrorResponse(error=ErrorDetail(code=exc.code, message=exc.message))
    return JSONResponse(body.model_dump(), status_code=STATUS[exc.kind])


def register_domain_errors(app: FastAPI) -> None:
    app.add_exception_handler(DomainError, domain_error_handler)
