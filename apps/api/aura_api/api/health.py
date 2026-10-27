from typing import Literal

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import text

router = APIRouter(tags=["health"])


class HealthResponse(BaseModel):
    status: Literal["ok"] = "ok"


@router.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse()


@router.get("/ready", response_model=HealthResponse, include_in_schema=False)
async def ready(request: Request) -> HealthResponse:
    runtime = getattr(request.app.state, "database_runtime", None)
    try:
        if runtime is not None:
            await runtime.ready()
        else:
            sessions = getattr(request.app.state, "sessionmaker", None)
            if sessions is None:
                raise HTTPException(503)
            async with sessions() as session:
                if await session.scalar(text("SHOW transaction_read_only")) != "off":
                    raise HTTPException(503)
    except Exception:
        raise HTTPException(503) from None
    return HealthResponse()
