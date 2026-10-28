"""POST /partner: brand inquiry submission (BFF contract)."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from aura_api.core.errors import ErrorResponse
from aura_api.infra.database import get_session
from aura_api.services import partner as service

router = APIRouter(tags=["partner"])


class InquiryIn(BaseModel):
    # Presence, length and format are domain rules (PT-01~04), so every field is optional here.
    brand: str | None = None
    name: str | None = None
    email: str | None = None
    introduction: str | None = None
    message: str | None = None
    type: str | None = None
    consent: str | None = None
    website: str | None = None


class InquiryCreated(BaseModel):
    id: uuid.UUID


@router.post(
    "/partner",
    status_code=201,
    response_model=InquiryCreated,
    responses={400: {"model": ErrorResponse}, 429: {"model": ErrorResponse}},
)
async def submit_inquiry(
    body: InquiryIn, session: Annotated[AsyncSession, Depends(get_session)]
) -> InquiryCreated:
    return InquiryCreated(id=await service.submit_inquiry(session, body.model_dump()))
