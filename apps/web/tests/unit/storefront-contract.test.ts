import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import fixtureCatalog from "../../mock-server/fixtures/catalog.json";
import {
  catalogResponse,
  productResponse,
  recipeResponse,
  recipesResponse,
  inquiryResponse,
} from "@/server/backend/storefront";
import { backendError } from "@/server/backend/transport";

describe("public storefront adapters shared by RSC and BFF", () => {
  it("keeps the existing catalog DTO, optional fields and null prices", () => {
    expect(catalogResponse(fixtureCatalog)).toEqual(fixtureCatalog);
    const product = {
      ...fixtureCatalog.products[0],
      price: null,
      stock: 0,
      internalCost: 1,
      passwordHash: "private",
    };
    expect(productResponse(product)).toEqual({
      ...fixtureCatalog.products[0],
      price: null,
      stock: 0,
    });
    expect(productResponse({ ...product, noteImages: undefined })).not.toHaveProperty("noteImages");
  });

  it("filters extra fields at every catalog nesting level", () => {
    const catalog = structuredClone(fixtureCatalog);
    const value = {
      ...catalog,
      token: "private",
      products: catalog.products.map((product) => ({ ...product, internalCost: "private" })),
      home: {
        ...catalog.home,
        memberPromotions: catalog.home.memberPromotions.map((promotion) => ({
          ...promotion,
          account: "private",
        })),
      },
    };
    expect(catalogResponse(value)).toEqual(fixtureCatalog);
  });

  it("returns only public recipe and inquiry fields", () => {
    const recipe = {
      id: "recipe-1",
      name: "향",
      version: 2,
      parent: "parent-1",
      label: "paper",
      counts: { bergamot: 3 },
      color: "#e8d36b",
      created: "2026-10-26T00:00:00Z",
    };
    expect(recipeResponse({ ...recipe, ownerId: "private", token: "private" })).toEqual(recipe);
    expect(recipesResponse([recipe])).toEqual([recipe]);
    expect(inquiryResponse({ id: "inquiry-1", email: "private", memo: "private" })).toEqual({
      id: "inquiry-1",
    });
  });

  it("rejects malformed backend DTOs without returning their contents", () => {
    for (const [decode, data] of [
      [catalogResponse, { products: [] }],
      [
        catalogResponse,
        {
          ...fixtureCatalog,
          ingredients: [{ ...fixtureCatalog.ingredients[0], stage: "private" }],
        },
      ],
      [productResponse, { ...fixtureCatalog.products[0], price: "private" }],
      [productResponse, { ...fixtureCatalog.products[0], stock: 1.5 }],
      [recipesResponse, {}],
      [recipeResponse, { passwordHash: "private" }],
      [inquiryResponse, { id: 5 }],
    ] as const) {
      expect(() => decode(data)).toThrow(
        expect.objectContaining({ status: 502, code: "INVALID_BACKEND_RESPONSE" }),
      );
    }
  });

  it("preserves safe domain codes and masks FastAPI validation details", () => {
    expect(
      backendError(409, { error: { code: "OWNER_CHANGED", message: "계정이 변경되었어요." } }),
    ).toMatchObject({ status: 409, code: "OWNER_CHANGED" });
    for (const code of ["private\nvalue", "x".repeat(100), "camelCode", 5]) {
      expect(backendError(404, { error: { code, message: "없어요." } }).code).toBe("HTTP_404");
    }

    expect(
      backendError(422, {
        error: { code: "PRIVATE_CODE", message: "private" },
        detail: [{ input: "password" }],
      }),
    ).toMatchObject({ code: "VALIDATION_ERROR", message: "입력 항목을 확인해 주세요." });
  });
});
