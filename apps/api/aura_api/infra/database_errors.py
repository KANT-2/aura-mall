"""DB failures shared by connection creation, live configuration and HTTP handling."""


class DatabaseUnavailable(RuntimeError):
    """Public-safe failure: never include a URL or an underlying driver exception."""
