import type { CartItem } from "@/features/cart/model/cart";
export type Order = {
  id: string;
  items: CartItem[];
  total: number;
  recipient: string;
  address: string;
  created: string;
};
