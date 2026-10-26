"""Errors raised by domain rules.

Domain code never imports FastAPI. The presentation layer maps `kind` to an HTTP status
(invalid → 400, unauthorized → 401, not_found → 404, conflict → 409).
"""

from typing import Literal

ErrorKind = Literal["invalid", "unauthorized", "not_found", "conflict"]


class DomainError(Exception):
    kind: ErrorKind = "invalid"

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


class InvalidInput(DomainError):
    kind: ErrorKind = "invalid"


class Unauthorized(DomainError):
    kind: ErrorKind = "unauthorized"


class NotFound(DomainError):
    kind: ErrorKind = "not_found"


class Conflict(DomainError):
    kind: ErrorKind = "conflict"
