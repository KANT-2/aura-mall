from pydantic import BaseModel


class ErrorDetail(BaseModel):
    code: str
    message: str


class ErrorResponse(BaseModel):
    error: ErrorDetail


PUBLIC_MESSAGES = {
    400: "요청 내용을 확인해 주세요.",
    401: "인증이 필요합니다.",
    403: "요청 권한이 없습니다.",
    404: "요청한 경로를 찾을 수 없습니다.",
    405: "지원하지 않는 요청 방식입니다.",
    409: "현재 상태에서는 요청을 처리할 수 없습니다.",
    413: "요청 본문이 너무 큽니다.",
    415: "지원하지 않는 요청 형식입니다.",
    422: "입력 항목을 확인해 주세요.",
    429: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
}


def error_body(status_code: int) -> dict:
    # Never serialize exception details, validation inputs, or exception strings.
    code = "VALIDATION_ERROR" if status_code == 422 else f"HTTP_{status_code}"
    if status_code >= 500:
        code = "INTERNAL_ERROR"
    return ErrorResponse(
        error=ErrorDetail(
            code=code,
            message=PUBLIC_MESSAGES.get(status_code, "요청을 처리하지 못했어요."),
        )
    ).model_dump()
