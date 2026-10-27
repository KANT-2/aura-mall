"""Import every area's tables so Base.metadata is complete (Alembic, tests)."""

from aura_api.infra.database import Base
from aura_api.infra.models.admin import AdminAuditLog, StockAdjustment
from aura_api.infra.models.atelier import AtelierDraft, Recipe, RecipeIngredient
from aura_api.infra.models.catalog import (
    Collection,
    Ingredient,
    Product,
    ProductType,
    Promotion,
    ScentFamily,
    ScentFamilyIngredient,
    SuggestedName,
)
from aura_api.infra.models.identity import (
    Admin,
    AdminSession,
    AuthTokenFamily,
    LoginFailure,
    MemberDeletionRun,
    RefreshToken,
    RevokedToken,
    User,
    UserCoupon,
)
from aura_api.infra.models.ordering import (
    Order,
    OrderItem,
    OrderItemSelection,
    OrderStatusHistory,
)
from aura_api.infra.models.partner import PartnerInquiry
from aura_api.infra.models.payment import Payment, Refund

__all__ = [
    "Admin",
    "AdminAuditLog",
    "AdminSession",
    "AtelierDraft",
    "AuthTokenFamily",
    "LoginFailure",
    "MemberDeletionRun",
    "Base",
    "Collection",
    "Ingredient",
    "Order",
    "OrderItem",
    "OrderItemSelection",
    "OrderStatusHistory",
    "PartnerInquiry",
    "Payment",
    "Product",
    "ProductType",
    "Promotion",
    "Recipe",
    "RecipeIngredient",
    "RefreshToken",
    "Refund",
    "RevokedToken",
    "ScentFamily",
    "ScentFamilyIngredient",
    "StockAdjustment",
    "SuggestedName",
    "User",
    "UserCoupon",
]
