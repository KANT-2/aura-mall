"""A visitor UUID selects a composition draft; it never grants member privileges."""

import uuid
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Header, Request
from pydantic import BaseModel, ConfigDict, Field, StrictInt

from aura_api.api.deps import OptionalMember, Session
from aura_api.domain.errors import InvalidInput
from aura_api.domain.identity import RequestOwner
from aura_api.services import drafts as service

router = APIRouter(prefix="/atelier/draft", tags=["atelier"])


async def draft_guest(
    request: Request,
    member_id: OptionalMember,
    guest_id: Annotated[
        str | None,
        Header(
            alias="X-Guest-ID",
            description="BFF가 발급한 방문자 UUID v4. 회원 인증 수단이 아닙니다.",
        ),
    ] = None,
) -> uuid.UUID:
    values = request.headers.getlist("x-guest-id")
    try:
        guest = uuid.UUID(guest_id) if guest_id else None
    except ValueError:
        guest = None
    if len(values) != 1 or guest is None or guest.version != 4:
        raise InvalidInput("DRAFT_GUEST_INVALID", "조향 초안의 방문자 정보를 확인해 주세요.")
    if member_id is None:
        RequestOwner(guest_id=str(guest)).ensure_expected(request.headers.get("x-account-owner"))
    return guest


DraftGuest = Annotated[uuid.UUID, Depends(draft_guest)]


class DraftIn(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, hide_input_in_errors=True)
    counts: dict[str, StrictInt] = Field(
        description="카탈로그 향료별 방울 수. 합계 1~20, 음수·알 수 없는 향료는 거절합니다.",
        examples=[{"bergamot": 2, "rose": 3}],
    )
    name: str = Field(default="", max_length=30)
    label: str = Field(default="classic", description="classic / paper / minimal. 그 외 classic.")
    step: Literal["select", "result"] = "select"


class DraftOut(BaseModel):
    counts: dict[str, int]
    name: str
    label: str
    step: Literal["select", "result"]


@router.get("", response_model=DraftOut | None, summary="조향 초안 조회")
async def get_draft(guest: DraftGuest, session: Session):
    """초안이 없으면 200 null. 같은 방문자는 로그인·로그아웃 후에도 초안을 유지합니다."""
    return await service.get_draft(session, guest)


@router.put("", response_model=DraftOut, summary="조향 초안 전체 저장")
async def save_draft(body: DraftIn, guest: DraftGuest, session: Session):
    """방문자당 하나를 원자적으로 덮어씁니다. guestId·회원 ID는 본문에서 받지 않습니다."""
    return await service.save_draft(session, guest, body.model_dump())


@router.delete("", response_model=None, summary="조향 초안 삭제")
async def delete_draft(guest: DraftGuest, session: Session) -> None:
    """이미 없는 초안도 200 null을 반환합니다."""
    await service.delete_draft(session, guest)
