"""Real DB privacy/ownership/concurrent answer regression for product Q&A."""

import pytest
from sqlalchemy import func, select
from test_admin_api import URL, admin_login, bearer, db, new_admin, new_customer
from test_admin_api import client as client

from aura_api.infra.models import AdminAuditLog

pytestmark = pytest.mark.skipif(not URL, reason="AURA_TEST_DATABASE_URL is not set")
BASE = "/api/v1/products/fresh-hand-cream/questions"


def test_private_question_ownership_answer_and_delete(client):
    owner, other = new_customer(), new_customer()
    headers = bearer(owner)
    body = {"title": "비밀 제목", "content": "개인 문의 내용", "private": True}
    assert client.post(BASE, json=body).status_code == 401
    created = client.post(BASE, json=body, headers=headers)
    assert created.status_code == 201, created.text
    question = created.json()
    target = f"/api/v1/questions/{question['id']}"
    for auth in ({}, bearer(other)):
        public = client.get(BASE, headers=auth).json()["items"][0]
        assert public["title"] == "비공개 문의입니다."
        assert public["content"] is None and public["answer"] is None
        assert "userId" not in public
    mine = client.get("/api/v1/questions/mine", headers=headers).json()["items"][0]
    assert mine["mine"] and mine["content"] == body["content"]
    assert (
        client.patch(target, json={**body, "version": 1}, headers=bearer(other)).status_code == 404
    )
    edited = client.patch(
        target, json={**body, "title": "수정 제목", "version": 1}, headers=headers
    )
    assert edited.status_code == 200
    assert client.patch(target, json={**body, "version": 1}, headers=headers).status_code == 409
    admin = admin_login(client, new_admin()[1])
    answer_url = f"/api/v1/admin/questions/{question['id']}/answer"
    answer_body = {"version": 2, "answer": "담당자 답변"}
    assert client.patch(answer_url, json=answer_body, headers=headers).status_code == 403
    answered = client.patch(answer_url, json=answer_body, headers=admin)
    assert answered.status_code == 200, answered.text
    assert answered.json()["answer"] == "담당자 답변" and answered.json()["version"] == 3
    assert client.patch(answer_url, json=answer_body, headers=admin).status_code == 409
    assert client.get(BASE).json()["items"][0]["answer"] is None
    assert client.patch(target, json={**body, "version": 3}, headers=headers).status_code == 409
    assert client.delete(target + "?version=3", headers=bearer(other)).status_code == 404
    assert client.delete(target + "?version=2", headers=headers).status_code == 409
    assert client.delete(target + "?version=3", headers=headers).status_code == 204
    assert client.get("/api/v1/questions/mine", headers=headers).json()["items"] == []

    async def audit(factory):
        async with factory() as session:
            return await session.scalar(
                select(func.count())
                .select_from(AdminAuditLog)
                .where(
                    AdminAuditLog.target_id == question["id"],
                    AdminAuditLog.action == "question.answer",
                )
            )

    assert db(audit) == 1


def test_public_question_validation_rate_and_admin_filter(client):
    headers = bearer(new_customer())
    body = {"title": "공개 문의", "content": "성분이 궁금해요.", "private": False}
    assert client.post(BASE, json={**body, "content": " "}, headers=headers).status_code == 422
    assert (
        client.post("/api/v1/products/missing/questions", json=body, headers=headers).status_code
        == 404
    )
    for _ in range(5):
        assert client.post(BASE, json=body, headers=headers).status_code == 201
    assert client.post(BASE, json=body, headers=headers).status_code == 429
    assert client.get(BASE).json()["items"][0]["content"] == body["content"]
    admin = admin_login(client, new_admin()[1])
    assert client.get("/api/v1/admin/questions").status_code == 401
    rows = client.get("/api/v1/admin/questions?unanswered=true", headers=admin).json()["items"]
    assert len(rows) == 5 and all(not row["answered"] for row in rows)
