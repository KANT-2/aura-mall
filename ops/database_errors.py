"""Shared public-safe operation failures, including importlib-loaded test controllers."""


class OperationError(Exception):
    def __init__(self, message, diagnostics=b""):
        super().__init__(message)
        self.diagnostics = diagnostics


class PrimaryUnavailable(Exception):
    """Abort an operation promptly so the HA controller can recover its journal."""
