"""Product image upload and public immutable delivery; shared across API replicas."""

import base64
import hashlib
import io
import json
import uuid
import warnings

from anyio.to_thread import run_sync
from fastapi import APIRouter, HTTPException, Request, Response
from PIL import Image, ImageOps, UnidentifiedImageError
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert

from aura_api.api.admin.deps import CurrentAdmin
from aura_api.api.catalog import CamelModel
from aura_api.api.deps import Session
from aura_api.domain.errors import InvalidInput, NotFound
from aura_api.infra.models import MediaAsset

router = APIRouter(tags=["media"])
MAX_FILE_BYTES = 2 * 1024 * 1024
MAX_JSON_BYTES = 3 * 1024 * 1024


class MediaOut(CamelModel):
    id: uuid.UUID
    url: str
    width: int
    height: int


def canonical_image(raw: bytes) -> tuple[bytes, int, int]:
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(raw), formats=("JPEG", "PNG", "WEBP")) as image:
                if image.width * image.height > 16_000_000 or getattr(image, "n_frames", 1) != 1:
                    raise ValueError
                image.load()
                cleaned = ImageOps.exif_transpose(image).convert(
                    "RGBA" if ("A" in image.getbands() or "transparency" in image.info) else "RGB"
                )
                cleaned.thumbnail((2000, 2000))
                cleaned.info.clear()
                output = io.BytesIO()
                cleaned.save(output, format="WEBP", quality=88, method=4)
                data = output.getvalue()
                if not data or len(data) > MAX_FILE_BYTES:
                    raise ValueError
                return data, cleaned.width, cleaned.height
    except (
        OSError,
        ValueError,
        UnidentifiedImageError,
        Image.DecompressionBombError,
        Image.DecompressionBombWarning,
    ):
        raise InvalidInput(
            "IMAGE_INVALID", "2MB 이하의 JPEG·PNG·WebP 이미지를 선택해 주세요."
        ) from None


@router.post(
    "/admin/media",
    response_model=MediaOut,
    status_code=201,
    openapi_extra={
        "requestBody": {
            "required": True,
            "content": {
                "application/json": {
                    "schema": {
                        "type": "object",
                        "required": ["data"],
                        "properties": {
                            "data": {"type": "string", "description": "2MB 이하 이미지의 Base64"}
                        },
                    }
                }
            },
        }
    },
)
async def upload_image(request: Request, admin: CurrentAdmin, session: Session):
    if request.headers.get("content-type", "").split(";")[0].strip().lower() != "application/json":
        raise HTTPException(415)
    raw = bytearray()
    async for chunk in request.stream():
        raw.extend(chunk)
        if len(raw) > MAX_JSON_BYTES:
            raise HTTPException(413)
    try:
        body = json.loads(raw)
        if not isinstance(body, dict) or set(body) != {"data"} or not isinstance(body["data"], str):
            raise ValueError
        image = base64.b64decode(body["data"], validate=True)
        if not image or len(image) > MAX_FILE_BYTES:
            raise ValueError
    except (ValueError, TypeError):
        raise InvalidInput("IMAGE_INVALID", "이미지 파일을 확인해 주세요.") from None
    data, width, height = await run_sync(canonical_image, image)
    digest = hashlib.sha256(data).hexdigest()
    async with session.begin():
        asset_id = await session.scalar(
            insert(MediaAsset)
            .values(id=uuid.uuid4(), sha256=digest, data=data, uploaded_by=admin.id)
            .on_conflict_do_nothing(index_elements=["sha256"])
            .returning(MediaAsset.id)
        )
        if asset_id is None:
            asset_id = await session.scalar(
                select(MediaAsset.id).where(MediaAsset.sha256 == digest)
            )
    return MediaOut(id=asset_id, url=f"/api/media/{asset_id}", width=width, height=height)


@router.get(
    "/media/{asset_id}",
    response_class=Response,
    responses={200: {"content": {"image/webp": {}}, "description": "상품 이미지"}},
)
async def image_file(asset_id: uuid.UUID, session: Session):
    asset = await session.get(MediaAsset, asset_id)
    if asset is None:
        raise NotFound("IMAGE_NOT_FOUND", "이미지를 찾을 수 없어요.")
    return Response(
        asset.data,
        media_type="image/webp",
        headers={
            "Cache-Control": "public, max-age=31536000, immutable",
            "ETag": f'"{asset.sha256}"',
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": "default-src 'none'; sandbox",
        },
    )
