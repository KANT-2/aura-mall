import { products, type Product } from "./Shared";

export const FREE_SHIPPING_MIN = 50000;
export const BASIC_SHIPPING_FEE = 3000;
export const PRODUCT_TYPE_PRICES: Record<string, number> = {
  "eau-de-parfum": 98000, diffuser: 68000, candle: 62000,
  "perfume-oil": 48000, "hair-mist": 45000, "body-lotion": 42000,
  "body-wash": 36000, "hand-wash": 32000, "hand-cream": 28000,
};
export const isGiftSelectionValid = (gift: Product, selection: string[]): boolean =>
  gift.type === "gift-set" && selection.length === 3 &&
  new Set(selection).size === 3 && selection.every(id =>
    products.some(p => p.id === id && p.collection === gift.collection && p.type !== "gift-set" && p.stock > 0));

export function itemPrice(item: {product: Product; selection: string[]; custom?: {productType?: string}}): number | null {
  if(item.custom && item.product.type !== "eau-de-parfum") return null;
  if(item.product.type === "gift-set") {
    if(!isGiftSelectionValid(item.product, item.selection)) return null;
    const chosen = item.selection.map(id=>products.find(p=>p.id===id));
    return chosen.every(Boolean) && chosen.every(p=>p!.price !== null)
      ? chosen.reduce((sum,p)=>sum+(p!.price ?? 0),0) : null;
  }
  return item.product.price;
}
export const shippingFee = (subtotal: number, hasCoupon: boolean): number =>
  subtotal >= FREE_SHIPPING_MIN || hasCoupon ? 0 : BASIC_SHIPPING_FEE;
export const amountUntilFreeShipping = (subtotal: number): number => Math.max(0, FREE_SHIPPING_MIN-subtotal);
