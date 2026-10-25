import type { AtelierDraft, Recipe } from "@/features/atelier/model/recipes";
import type { Member } from "@/features/account/model/account";

export const member = {
  id: "layout-member",
  email: "layout@example.com",
  name: "AURA",
  coupon: true,
} satisfies Member;
export const savedRecipe = {
  id: "layout",
  name: "느린 오후",
  counts: { bergamot: 3, rose: 2 },
  version: 1,
  label: "paper",
  color: "#d5b575",
  created: "2026-01-01T00:00:00.000Z",
} satisfies Recipe;
export const resumedDraft = {
  counts: { rose: 2 },
  name: "이어 만들 향",
  label: "paper",
  step: "result",
} satisfies AtelierDraft;
export const originalRecipe = {
  id: "original",
  name: "원본 조합",
  counts: { bergamot: 2 },
  version: 2,
};
export const composition = { ingredientId: "bergamot", name: "나의 첫 향", revisedName: "새 이름" };
export const cart = [
  { product: { id: "fresh-eau-de-parfum" }, quantity: 2, selection: [] },
  {
    product: { id: "fresh-gift-set" },
    quantity: 1,
    selection: ["fresh-hand-cream", "fresh-hand-wash", "fresh-candle"],
  },
];
export const routes = {
  home: "/",
  shop: "/shop",
  atelier: "/atelier",
  product: "/shop/fresh-eau-de-parfum",
  gift: "/shop/fresh-gift-set",
  cart: "/cart",
  checkout: "/checkout",
  login: "/login",
  register: "/register",
  mypage: "/mypage",
  partner: "/partner",
} as const;
export const layoutCases = Object.entries(routes)
  .filter(([name]) => name !== "atelier")
  .map(([name, path]) => ({ name, path }));
