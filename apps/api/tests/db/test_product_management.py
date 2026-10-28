"""Create, publish, edit, hide and upload images through real API/database boundaries."""

import base64
import io
import uuid

import pytest
from PIL import Image
from test_admin_api import URL, admin_login, bearer, new_admin, new_customer
from test_admin_api import client as client

pytestmark = pytest.mark.skipif(not URL, reason="AURA_TEST_DATABASE_URL is not set")


def upload(client, auth):
    buffer = io.BytesIO()
    image = Image.new("RGB", (32, 24), (130, 160, 90))
    image.save(buffer, format="PNG")
    return client.post(
        "/api/v1/admin/media",
        json={"data": base64.b64encode(buffer.getvalue()).decode()},
        headers=auth,
    )


def test_product_full_lifecycle_and_same_type_variants(client):
    admin = admin_login(client, new_admin()[1])
    member = bearer(new_customer())
    assert upload(client, {}).status_code == 401
    assert upload(client, member).status_code == 403
    uploaded = upload(client, admin)
    assert uploaded.status_code == 201, uploaded.text
    media = uploaded.json()
    assert media["width"] == 32 and media["height"] == 24
    assert upload(client, admin).json()["id"] == media["id"]
    photo = client.get("/api/v1/media/" + media["id"])
    assert photo.status_code == 200 and photo.headers["content-type"] == "image/webp"
    assert photo.headers["x-content-type-options"] == "nosniff"
    with Image.open(io.BytesIO(photo.content)) as img:
        assert img.size == (32, 24)
        assert not img.getexif()
    assert (
        client.post(
            "/api/v1/admin/media",
            json={"data": base64.b64encode(b'<svg onload="alert(1)"/>').decode()},
            headers=admin,
        ).status_code
        == 400
    )
    body = {
        "id": "new-cream-" + uuid.uuid4().hex[:10],
        "collection": "fresh",
        "type": "hand-cream",
        "name": "새로운 핸드 크림",
        "englishName": "New Hand Cream",
        "volume": "50mL",
        "category": "핸드 케어",
        "description": "싱그러운 컬렉션의 새로운 핸드 크림",
        "price": 32000,
        "stock": 20,
        "image": media["url"],
        "notes": ["베르가못", "시더"],
        "details": {"usage": "손에 적당량 발라 주세요.", "shipping": "배송 안내 본문"},
        "isActive": False,
    }
    assert client.post("/api/v1/admin/products", json=body, headers=member).status_code == 403
    created = client.post("/api/v1/admin/products", json=body, headers=admin)
    assert created.status_code == 201, created.text
    product = created.json()
    assert product["isActive"] is False and product["details"] == body["details"]
    assert product["history"][0]["action"] == "product.create"
    assert client.get("/api/v1/catalog/products/" + body["id"]).status_code == 404
    assert body["id"] not in {p["id"] for p in client.get("/api/v1/catalog").json()["products"]}
    denied = client.post(
        "/api/v1/orders",
        json={
            "recipient": "받는 분",
            "address": "서울시",
            "items": [{"productId": body["id"], "quantity": 1}],
        },
        headers=member,
    )
    assert denied.status_code == 400
    assert client.post("/api/v1/admin/products", json=body, headers=admin).status_code == 409
    published = client.patch(
        "/api/v1/admin/products/" + body["id"],
        json={"version": product["version"], "isActive": True},
        headers=admin,
    )
    assert published.status_code == 200, published.text
    public = client.get("/api/v1/catalog/products/" + body["id"])
    assert public.status_code == 200 and public.json()["details"] == body["details"]
    order = client.post(
        "/api/v1/orders",
        json={
            "recipient": "받는 분",
            "address": "서울시",
            "items": [{"productId": body["id"], "quantity": 2}],
        },
        headers=member,
    )
    assert order.status_code == 201 and order.json()["total"] == 64000
    hidden = client.patch(
        "/api/v1/admin/products/" + body["id"],
        json={
            "version": published.json()["version"],
            "isActive": False,
            "details": {"returns": "교환 접수 안내"},
        },
        headers=admin,
    )
    assert hidden.status_code == 200
    assert client.get("/api/v1/catalog/products/" + body["id"]).status_code == 404
    old_order = client.get("/api/v1/orders", headers=member).json()[0]
    assert old_order["items"][0]["product"]["name"] == body["name"] and old_order["total"] == 64000
    # Hiding does not destroy history, and a stale edit cannot accidentally publish again.
    assert (
        client.patch(
            "/api/v1/admin/products/" + body["id"],
            json={"version": 1, "isActive": True},
            headers=admin,
        ).status_code
        == 409
    )
