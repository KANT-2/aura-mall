import catalog from "../../data/catalog.json";

/** Catalog data has no React or browser dependencies. */
export const { products, collections, types } = catalog;
export type Product = (typeof products)[number];

export const MAX_QUANTITY = 15;

const productAliases = new Map([
  ["bergamot-veil", "fresh-eau-de-parfum"],
  ["petal-haze", "soft-eau-de-parfum"],
  ["cedar-trace", "warm-eau-de-parfum"],
  ["soft-skin", "soft-eau-de-parfum"],
  ["fig-reverie", "soft-eau-de-parfum"],
  ["amber-dusk", "warm-eau-de-parfum"],
]);

export function findProduct(id: string): Product | undefined {
  const canonicalId = productAliases.get(id) ?? id;
  return products.find(product => product.id === canonicalId);
}

export type ShopSearchParams = Record<string, string | string[] | undefined>;

/** Repeated query parameters remain scalar before they reach screen state. */
export function readShopSearch(params: ShopSearchParams) {
  const first = (value: string | string[] | undefined) =>
    typeof value === "string" ? value : value?.[0];
  return {
    initialCollection: first(params.collection),
    initialType: first(params.type),
    initialQuery: first(params.q),
  };
}
