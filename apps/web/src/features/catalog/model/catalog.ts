export type Product = {
  id: string;
  collection: string;
  type: string;
  typeName: string;
  name: string;
  englishName: string;
  volume: string;
  price: number | null;
  stock: number;
  image: string;
  description: string;
  notes: string[];
  featured: boolean;
  noteImages?: Partial<Record<string, string>>;
  giftImages?: string[];
  imageUrl: string;
  category: string;
  isNew: boolean;
};
export type Collection = {
  id: string;
  name: string;
  title: string;
  description: string;
  color: string;
  notes: string[];
};
export type ProductType = { id: string; name: string; label: string };
export type Ingredient = {
  id: string;
  name: string;
  stage: "top" | "middle" | "base";
  color: string;
  description: string;
};
export type ScentFamily = {
  id: string;
  name: string;
  english: string;
  asset: string;
  description: string;
  notes: string[];
};
export type Promotion = { title: string; copy: string; cta: string; url: string; image: string };
export type Catalog = {
  products: Product[];
  collections: Collection[];
  types: ProductType[];
  ingredients: Ingredient[];
  scentFamilies: ScentFamily[];
  atelier: { suggestedNames: Record<"fresh" | "soft" | "warm", string[]> };
  home: { bestsellerIds: string[]; guestPromotions: Promotion[]; memberPromotions: Promotion[] };
};
export type ShopSearchParams = Record<string, string | string[] | undefined>;
export function readShopSearch(params: ShopSearchParams) {
  const first = (value: string | string[] | undefined) =>
    typeof value === "string" ? value : value?.[0];
  return {
    initialCollection: first(params.collection),
    initialType: first(params.type),
    initialQuery: first(params.q),
  };
}
