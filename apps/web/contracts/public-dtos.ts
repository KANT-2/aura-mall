import type { components, paths } from "@/contracts/generated/fastapi";
import type { Catalog, Product } from "@/features/catalog/model/catalog";
import type { AtelierDraft, Recipe } from "@/features/atelier/model/recipes";
import type { Order } from "@/features/checkout/model/order";
import type { Payment, PaymentConfirmation } from "@/features/payments/model/payment";
import type {
  AdminAccount,
  AdminProduct,
  AdminOrder,
  AdminInquirySummary,
  AdminProductDetail,
  AdminInquiry,
  AdminHistoryEntry,
  AdminOverview,
} from "@/features/admin/model/admin";
import type { Credentials } from "@/features/account/model/account";

import type { ProductQuestion, QuestionPage } from "@/features/questions/model/question";

type Schemas = components["schemas"];
type Assert<T extends true> = T;
type Fits<Actual, Expected> = [Actual] extends [Expected] ? true : false;

// The BFF removes nullable optional fields; these normalizations are deliberate adapters.
type ProductDTO = Omit<Schemas["ProductOut"], "noteImages" | "giftImages"> & {
  noteImages?: Exclude<Schemas["ProductOut"]["noteImages"], null>;
  giftImages?: Exclude<Schemas["ProductOut"]["giftImages"], null>;
};
type RecipeDTO = Omit<Schemas["RecipeOut"], "parent"> & {
  parent?: Exclude<Schemas["RecipeOut"]["parent"], null>;
};
type CatalogDTO = Omit<Schemas["CatalogOut"], "products"> & { products: ProductDTO[] };
type HistoryDTO = Omit<Schemas["HistoryEntryOut"], "reason"> & {
  reason?: Exclude<Schemas["HistoryEntryOut"]["reason"], null>;
};
type ProductDetailDTO = Omit<Schemas["AdminProductDetailOut"], "history"> & {
  history: HistoryDTO[];
};
type InquiryDTO = Omit<Schemas["AdminInquiryOut"], "history"> & { history: HistoryDTO[] };
type OrderItemDTO = Omit<Schemas["OrderItemOut"], "product" | "custom"> & {
  product: ProductDTO;
  custom?: Exclude<Schemas["OrderItemOut"]["custom"], null>;
};
type OrderDTO = Omit<Schemas["OrderOut"], "items"> & { items: OrderItemDTO[] };

export type PublicDTOContract = [
  Assert<Fits<Schemas["QuestionOut"], ProductQuestion>>,
  Assert<Fits<Schemas["AdminPage_QuestionOut_"], QuestionPage>>,
  Assert<Fits<ProductDTO, Product>>,
  Assert<Fits<CatalogDTO, Catalog>>,
  Assert<Fits<RecipeDTO, Recipe>>,
  Assert<Fits<Schemas["DraftOut"], AtelierDraft>>,
  Assert<Fits<Schemas["AdminAccountOut"], AdminAccount>>,
  Assert<Fits<Schemas["AdminProductOut"], AdminProduct>>,
  Assert<Fits<Schemas["AdminOrderOut"], AdminOrder>>,
  Assert<Fits<Schemas["AdminInquirySummaryOut"], AdminInquirySummary>>,
  Assert<Fits<HistoryDTO, AdminHistoryEntry>>,
  Assert<Fits<ProductDetailDTO, AdminProductDetail>>,
  Assert<Fits<InquiryDTO, AdminInquiry>>,
  Assert<Fits<OrderDTO, Order>>,
  Assert<Fits<Schemas["PaymentOut"], Payment>>,
  Assert<Fits<PaymentConfirmation, Schemas["PaymentConfirmIn"]>>,
  Assert<Fits<Schemas["AdminOverviewOut"], AdminOverview>>,
  Assert<Fits<Credentials, Schemas["LoginInput"]>>,
  Assert<Fits<{ name: string; email: string; password: string }, Schemas["AdminCreateIn"]>>,
  Assert<
    Fits<
      paths["/api/v1/orders"]["post"]["responses"][200]["content"]["application/json"],
      Schemas["OrderOut"]
    >
  >,
];
