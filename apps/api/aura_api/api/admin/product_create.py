"""Create a product using an existing collection/type, and registered image assets."""

from typing import Annotated

from fastapi import APIRouter
from pydantic import Field, StringConstraints
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from aura_api.api.admin.deps import CurrentAdmin
from aura_api.api.admin.schemas import AdminProductDetailOut, product_detail_out
from aura_api.api.catalog import CamelModel
from aura_api.api.deps import Session
from aura_api.domain import admin as rules
from aura_api.domain.errors import Conflict, InvalidInput
from aura_api.infra.models import Collection, Product, ProductType
from aura_api.infra.repositories import admin as repository
from aura_api.services.admin_products import _detail
from aura_api.services.catalog import LEGACY_PRODUCT_IDS

router = APIRouter()
Text = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]


class ProductCreateIn(CamelModel):
    id: str = Field(min_length=1, max_length=50, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
    collection: str = Field(max_length=50)
    type: str = Field(max_length=30)
    name: Text
    english_name: Text
    volume: str = Field(min_length=1, max_length=30)
    category: str = Field(min_length=1, max_length=50)
    description: str = Field(min_length=1, max_length=1000)
    price: int | None = Field(default=None, ge=0, le=10_000_000, strict=True)
    stock: int = Field(default=0, ge=0, le=99999, strict=True)
    image: str = Field(max_length=255)
    notes: list[str] = Field(default_factory=list)
    details: dict[str, str] = Field(default_factory=dict)
    featured: bool = False
    is_new: bool = False
    is_active: bool = False


@router.post(
    "/products",
    status_code=201,
    response_model=AdminProductDetailOut,
    response_model_exclude_unset=True,
)
async def create_product(body: ProductCreateIn, admin: CurrentAdmin, session: Session):
    try:
        async with session.begin():
            collection = await session.get(Collection, body.collection)
            product_type = await session.get(ProductType, body.type)
            if collection is None or product_type is None or body.id in LEGACY_PRODUCT_IDS:
                raise InvalidInput("PRODUCT_INVALID", "컬렉션·유형·상품 ID를 확인해 주세요.")
            images = await repository.image_options(session)
            raw = body.model_dump(by_alias=True)
            values = rules.product_changes(raw, images)
            if await session.get(Product, body.id) is not None:
                raise Conflict("PRODUCT_ID_TAKEN", "이미 등록된 상품 ID예요.")
            position = (await session.scalar(select(func.max(Product.sort_order))) or 0) + 1
            product = Product(
                id=body.id,
                collection_id=body.collection,
                type_id=body.type,
                image_url=body.image,
                sort_order=position,
                stock=body.stock,
                **values,
            )
            session.add(product)
            await session.flush()
            repository.add_audit(
                session,
                actor_id=admin.id,
                action="product.create",
                target_type="product",
                target_id=product.id,
                changes=[
                    {
                        "field": "product",
                        "from": None,
                        "to": {
                            "name": product.name,
                            "isActive": product.is_active,
                            "stock": product.stock,
                        },
                    }
                ],
            )
            await session.flush()
            return product_detail_out(await _detail(session, product, product_type.name))
    except IntegrityError:
        raise Conflict("PRODUCT_ID_TAKEN", "이미 등록된 상품 ID예요.") from None
