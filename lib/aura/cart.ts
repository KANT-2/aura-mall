import { MAX_QUANTITY, products, type Product } from "./catalog";
import { isGiftSelectionValid } from "./pricing";
import { recipeColor, recipeLabel, validCounts } from "./recipes";
import { isRecord } from "./validation";

export type CustomRecipeItem = {
  name:string;
  label:string;
  color:string;
  counts:Record<string,number>;
  recipeKey?:string;
  productType?:string;
};
export type CartItem = {
  key: string;
  product: Product;
  quantity: number;
  selection: string[];
  custom?: CustomRecipeItem;
};

/** Placeholder product identity for a custom composition: no invented sale price. */
export function customProduct(name:string, productType="eau-de-parfum"):Product {
  const base=products.find(p=>p.type===productType && p.type!=="gift-set");
  const safe=base ?? products.find(p=>p.type==="eau-de-parfum")!;
  return {
    id:"custom-atelier",collection:"atelier",type:safe.type,typeName:safe.typeName,name:name||"나만의 조향 향수",
    englishName:"AURA Personal Composition",volume:safe.volume,price:safe.price,stock:15,
    image:"/assets/editorial/custom-bottle.svg",description:"내가 고른 향료로 완성한 커스텀 조합",
    notes:[],featured:false,imageUrl:"/assets/editorial/custom-bottle.svg",category:"커스텀 향",isNew:false
  };
}
export const clampQuantity = (v: unknown) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.min(MAX_QUANTITY, Math.max(1, n)) : 1;
};
export const productKey = (id: string, selection: string[]) => id + ":" + [...selection].sort().join(",");
// Identical saved composition is consolidated; edited compositions remain separate.
export function customKey(recipe: CustomRecipeItem) {
  const signature=JSON.stringify([recipe.name.trim(),recipe.label,recipe.productType || "eau-de-parfum",Object.entries(recipe.counts).sort()]);
  return "custom:"+Array.from(signature).reduce((h,c)=>((h*31+c.charCodeAt(0))>>>0),2166136261).toString(36);
}

/** Rebuild stored cart rows from the catalog; drops corrupt rows and merges duplicate keys. */
export function restoreCart(raw: unknown): CartItem[] {
  if (!Array.isArray(raw)) return [];
  const merged = new Map<string, CartItem>();
  for (const i of raw) {
    if (!isRecord(i) || !isRecord(i.product)) continue;
    const stored = i.product, id = stored.id;
    if (typeof id !== "string") continue;
    const quantity = clampQuantity(i.quantity);
    let item: CartItem;
    if (id === "custom-atelier") {
      const c = i.custom;
      const counts = isRecord(c) ? validCounts(c.counts) : null;
      if (!isRecord(c) || typeof c.name !== "string" || !c.name.trim() || !counts) continue;
      const custom: CustomRecipeItem = {
        name: c.name.trim(),
        label: recipeLabel(c.label),
        color: recipeColor(c.color),
        counts,
        recipeKey: typeof c.recipeKey === "string" ? c.recipeKey : undefined,
        productType: typeof c.productType === "string" ? c.productType
          : typeof stored.type === "string" ? stored.type : undefined,
      };
      item = { key: customKey(custom), product: customProduct(custom.name, custom.productType), quantity, selection: [], custom };
    } else {
      const product = products.find((p) => p.id === id);
      if (!product) continue;
      const gift = product.type === "gift-set";
      const selection = gift && Array.isArray(i.selection) ? i.selection.filter((s): s is string => typeof s === "string") : [];
      if (gift && !isGiftSelectionValid(product, selection)) continue;
      item = { key: productKey(product.id, selection), product, quantity, selection };
    }
    const existing = merged.get(item.key);
    merged.set(item.key, existing ? { ...existing, quantity: Math.min(MAX_QUANTITY, existing.quantity + item.quantity) } : item);
  }
  return [...merged.values()];
}
