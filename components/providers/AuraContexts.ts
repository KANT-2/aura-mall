"use client";

import { createContext, useContext } from "react";
import type { Member } from "@/lib/aura/accounts";
import type { Product } from "@/lib/aura/catalog";
import type { CartItem, CustomRecipeItem } from "@/lib/aura/cart";
import type { Recipe } from "@/lib/aura/recipes";

export type SessionState = {
  user: Member | null;
  ready: boolean;
  setUser: (user: Member | null) => void;
};
export type CartState = {
  cart: CartItem[];
  ready: boolean;
  add: (product: Product, quantity: number, selection?: string[]) => void;
  addCustom: (recipe: CustomRecipeItem) => boolean;
  quantity: (key: string, quantity: number) => void;
};
export type RecipesState = {
  recipes: Recipe[];
  save: (recipe: Recipe) => boolean;
};
export type Notify = (message: string) => void;

export const SessionContext = createContext<SessionState | null>(null);
export const CartContext = createContext<CartState | null>(null);
export const RecipesContext = createContext<RecipesState | null>(null);
export const NotifyContext = createContext<Notify | null>(null);

export function useSession() {
  const state = useContext(SessionContext);
  if (!state) throw Error("AuraProvider required");
  return state;
}

export function useCart() {
  const state = useContext(CartContext);
  if (!state) throw Error("AuraProvider required");
  return state;
}

export function useRecipes() {
  const state = useContext(RecipesContext);
  if (!state) throw Error("AuraProvider required");
  return state;
}

export function useNotify() {
  const notify = useContext(NotifyContext);
  if (!notify) throw Error("AuraProvider required");
  return notify;
}
