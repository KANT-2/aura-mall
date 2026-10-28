"""Product questions are separate from partner/brand inquiries."""

import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response
from pydantic import Field, StringConstraints

from aura_api.api.admin.deps import CurrentAdmin
from aura_api.api.admin.schemas import AdminPage
from aura_api.api.catalog import CamelModel
from aura_api.api.deps import OptionalMember, Session, member_required
from aura_api.services import questions as service

router = APIRouter(tags=["questions"])
Member = Annotated[uuid.UUID, Depends(member_required("로그인 후 문의할 수 있어요."))]
Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
Content = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=3000)]


class QuestionIn(CamelModel):
    title: Title
    content: Content
    private: bool = True


class QuestionUpdate(QuestionIn):
    version: int = Field(ge=1, strict=True)


class AnswerIn(CamelModel):
    answer: Content
    version: int = Field(ge=1, strict=True)


class QuestionOut(CamelModel):
    id: uuid.UUID
    product_id: str
    title: str
    content: str | None
    private: bool
    mine: bool
    answer: str | None
    answered: bool
    answered_at: datetime | None
    version: int
    created: datetime


def question_out(q, owner=None, *, admin=False):
    visible = admin or q.user_id == owner or not q.private
    return QuestionOut(
        id=q.id,
        product_id=q.product_id,
        title=q.title if visible else "비공개 문의입니다.",
        content=q.content if visible else None,
        private=q.private,
        mine=q.user_id == owner,
        answer=q.answer if visible else None,
        answered=q.answer is not None,
        answered_at=q.answered_at,
        version=q.version,
        created=q.created_at,
    )


@router.get("/products/{product_id}/questions", response_model=AdminPage[QuestionOut])
async def product_questions(
    product_id: str, session: Session, owner: OptionalMember, page: int = Query(1, ge=1, le=10000)
):
    rows, total = await service.listing(session, product_id=product_id, page=page)
    return AdminPage[QuestionOut](
        items=[question_out(q, owner) for q in rows], total=total, page=page, page_size=20
    )


@router.post("/products/{product_id}/questions", response_model=QuestionOut, status_code=201)
async def create_question(product_id: str, body: QuestionIn, owner: Member, session: Session):
    return question_out(await service.create(session, owner, product_id, body.model_dump()), owner)


@router.get("/questions/mine", response_model=AdminPage[QuestionOut])
async def my_questions(owner: Member, session: Session, page: int = Query(1, ge=1, le=10000)):
    rows, total = await service.listing(session, owner=owner, page=page)
    return AdminPage[QuestionOut](
        items=[question_out(q, owner) for q in rows], total=total, page=page, page_size=20
    )


@router.patch("/questions/{question_id}", response_model=QuestionOut)
async def update_question(
    question_id: uuid.UUID, body: QuestionUpdate, owner: Member, session: Session
):
    return question_out(
        await service.change(
            session, owner, question_id, body.version, raw=body.model_dump(exclude={"version"})
        ),
        owner,
    )


@router.delete("/questions/{question_id}", status_code=204)
async def delete_question(
    question_id: uuid.UUID, owner: Member, session: Session, version: int = Query(ge=1)
):
    await service.change(session, owner, question_id, version, delete=True)
    return Response(status_code=204)


@router.get("/admin/questions", response_model=AdminPage[QuestionOut])
async def admin_questions(
    admin: CurrentAdmin,
    session: Session,
    page: int = Query(1, ge=1, le=10000),
    unanswered: bool = False,
):
    rows, total = await service.listing(session, page=page, unanswered=unanswered)
    return AdminPage[QuestionOut](
        items=[question_out(q, admin=True) for q in rows], total=total, page=page, page_size=20
    )


@router.patch("/admin/questions/{question_id}/answer", response_model=QuestionOut)
async def answer_question(
    question_id: uuid.UUID, body: AnswerIn, admin: CurrentAdmin, session: Session
):
    return question_out(
        await service.change(session, admin.id, question_id, body.version, answer=body.answer),
        admin=True,
    )
