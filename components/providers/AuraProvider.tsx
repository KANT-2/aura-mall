"use client";

// Browser state is restored only after hydration.
/* eslint-disable react-hooks/set-state-in-effect */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import * as accounts from "@/lib/aura/accounts";
import { browserStore, cartKey, recipesKey } from "@/lib/aura/browser-store";
import { MAX_QUANTITY, products, type Product } from "@/lib/aura/catalog";
import { clampQuantity, customProduct, productKey, restoreCart, type CartItem, type CustomRecipeItem } from "@/lib/aura/cart";
import { type Recipe } from "@/lib/aura/recipes";
import { isGiftSelectionValid } from "@/lib/aura/pricing";
import { CartContext, NotifyContext, RecipesContext, SessionContext } from "./AuraContexts";

export function AuraProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<accounts.Member | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartStore, setCartStore] = useState(cartKey(null));
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [ready, setReady] = useState(false);
  const [toast, setToast] = useState("");
  const email = user?.email;

  // Keep account switching in one coordinator: owner and data change together.
  const setUser = useCallback((next: accounts.Member | null) => {
    setUserState(next);
    setCartStore(cartKey(next?.email));
    setCart(browserStore.loadCart(next?.email));
    setRecipes(browserStore.loadRecipes(next?.email));
  }, []);

  useEffect(() => {
    setUser(accounts.current());
    setReady(true);
  }, [setUser]);

  useEffect(() => {
    if (!ready) return;
    try {
      browserStore.persistCart(cartStore, cart);
    } catch {
      setToast("저장 공간을 확인해 주세요.");
    }
  }, [cart, cartStore, ready]);

  useEffect(() => {
    if (!ready) return;
    const onStorage = (event: StorageEvent) => {
      if (event.storageArea !== window.localStorage) return;
      if (event.key === null || event.key === accounts.SESSION) {
        const next = accounts.current();
        if ((next?.email ?? null) !== (email ?? null)) {
          setUser(next);
          return;
        }
      }
      if (event.key === null || event.key === cartStore) setCart(browserStore.loadCart(email));
      if (event.key === null || event.key === recipesKey(email)) setRecipes(browserStore.loadRecipes(email));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [ready, email, cartStore, setUser]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 3200);
    return () => clearTimeout(timer);
  }, [toast]);

  const save = useCallback((recipe: Recipe) => {
    try {
      setRecipes(browserStore.saveRecipe(email, recipe));
      setToast("내가 만든 향에 저장했어요.");
      return true;
    } catch {
      setToast("저장하지 못했어요. 향료 조합과 저장 공간을 확인해 주세요.");
      return false;
    }
  }, [email]);

  const addCustom = useCallback((recipe: CustomRecipeItem) => {
    if (recipe.productType && recipe.productType !== "eau-de-parfum") {
      setToast("맞춤 조향은 현재 오 드 퍼퓸 50mL만 제공해요.");
      return false;
    }
    const [item] = restoreCart([{
      product: customProduct(recipe.name, recipe.productType),
      quantity: 1,
      custom: recipe,
    }]);
    if (!item) {
      setToast("향 이름과 향료 조합을 확인해 주세요.");
      return false;
    }
    setCart(previous => previous.some(row => row.key === item.key)
      ? previous.map(row => row.key === item.key ? { ...row, quantity: Math.min(MAX_QUANTITY, row.quantity + 1) } : row)
      : [...previous, item]);
    setToast("나만의 향을 장바구니에 담았어요.");
    return true;
  }, []);

  const add = useCallback((input: Product, quantity: number, selected: string[] = []) => {
    const product = products.find(item => item.id === input.id);
    if (!product || product.stock < 1) {
      setToast("현재 선택할 수 없는 상품이에요.");
      return;
    }
    if (product.type === "gift-set" && !isGiftSelectionValid(product, selected)) {
      setToast("같은 컬렉션의 제품 3개를 선택해 주세요.");
      return;
    }
    const selection = product.type === "gift-set" ? [...selected] : [];
    const count = clampQuantity(quantity);
    const key = productKey(product.id, selection);
    setCart(previous => previous.some(item => item.key === key)
      ? previous.map(item => item.key === key ? { ...item, quantity: clampQuantity(item.quantity + count) } : item)
      : [...previous, { key, product, quantity: count, selection }]);
    setToast("장바구니에 담았어요.");
  }, []);

  const quantity = useCallback((key: string, count: number) => {
    if (!Number.isFinite(count)) return;
    setCart(previous => count < 1
      ? previous.filter(item => item.key !== key)
      : previous.map(item => item.key === key ? { ...item, quantity: clampQuantity(count) } : item));
  }, []);

  // Stable values keep a toast or recipe update from broadcasting to cart consumers.
  const session = useMemo(() => ({ user, ready, setUser }), [user, ready, setUser]);
  const cartState = useMemo(() => ({ cart, ready, add, addCustom, quantity }), [cart, ready, add, addCustom, quantity]);
  const recipesState = useMemo(() => ({ recipes, save }), [recipes, save]);

  return (
    <NotifyContext.Provider value={setToast}>
      <SessionContext.Provider value={session}>
        <CartContext.Provider value={cartState}>
          <RecipesContext.Provider value={recipesState}>
            {children}
            <div className={"toast " + (toast ? "visible" : "")} role="status">{toast}</div>
          </RecipesContext.Provider>
        </CartContext.Provider>
      </SessionContext.Provider>
    </NotifyContext.Provider>
  );
}
