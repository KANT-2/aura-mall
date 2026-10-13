"use client";
 
// Synchronize browser storage or URL state after hydration.
/* eslint-disable react-hooks/set-state-in-effect */
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import * as accounts from "./accounts";
import { products, type Product } from "./Shared";

export type Recipe = {
  id: string;
  parent?: string;
  version: number;
  name: string;
  label: string;
  counts: Record<string, number>;
  color: string;
  created: string;
};

export type CartItem = {
  key: string;
  product: Product;
  quantity: number;
  selection: string[];
};

export type State = {
  user: accounts.Member | null;
  cart: CartItem[];
  recipes: Recipe[];
  ready: boolean;
  toast: string;
  notify: (s: string) => void;
  setUser: (u: accounts.Member | null) => void;
  add: (p: Product, n: number, s?: string[]) => void;
  quantity: (key: string, n: number) => void;
  save: (r: Recipe) => void;
};

export const Context = createContext<State | null>(null);

export function useAura() {
  const s = useContext(Context);
  if (!s) throw Error("AuraProvider required");
  return s;
}

export function AuraProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<accounts.Member | null>(null),
    [cart, setCart] = useState<CartItem[]>([]),
    [recipes, setRecipes] = useState<Recipe[]>([]),
    [ready, setReady] = useState(false),
    [toast, setToast] = useState("");
  useEffect(() => {
    try {
      setUser(accounts.current());
      const x = JSON.parse(localStorage.getItem("aura_cart_v2") || "[]");
      setCart(
        Array.isArray(x)
          ? x
              .filter(
                (i) =>
                  i?.product && products.some((p) => p.id === i.product.id),
              )
              .map((i) => ({
                ...i,
                product: products.find((p) => p.id === i.product.id),
              }))
          : [],
      );
    } catch {}
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem("aura_cart_v2", JSON.stringify(cart));
    } catch {
      setToast("저장 공간을 확인해 주세요.");
    }
  }, [cart, ready]);
  useEffect(() => {
    if (!ready) return;
    try {
      const x = JSON.parse(
        localStorage.getItem("aura_recipes_v2_" + (user?.email || "guest")) ||
          "[]",
      );
      setRecipes(Array.isArray(x) ? x : []);
    } catch {
      setRecipes([]);
    }
  }, [user, ready]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3200);
    return () => clearTimeout(t);
  }, [toast]);
  const save = (r: Recipe) => {
    const next = [r, ...recipes];
    try {
      localStorage.setItem(
        "aura_recipes_v2_" + (user?.email || "guest"),
        JSON.stringify(next),
      );
      setRecipes(next);
      setToast("내가 만든 향에 저장했어요.");
    } catch {
      setToast("저장하지 못했어요. 저장 공간을 확인해 주세요.");
    }
  };
  const add = (p: Product, n: number, s: string[] = []) => {
    if (
      p.type === "gift-set" &&
      (s.length !== 3 ||
        new Set(s).size !== 3 ||
        s.some(
          (id) =>
            !products.some(
              (q) =>
                q.id === id &&
                q.collection === p.collection &&
                q.type !== "gift-set",
            ),
        ))
    ) {
      setToast("같은 컬렉션의 제품 3개를 선택해 주세요.");
      return;
    }
    const key = p.id + ":" + [...s].sort().join(",");
    setCart((c) => {
      const old = c.find((x) => x.key === key);
      return old
        ? c.map((x) =>
            x.key === key
              ? { ...x, quantity: Math.min(15, x.quantity + n) }
              : x,
          )
        : [...c, { key, product: p, quantity: n, selection: s }];
    });
    setToast("장바구니에 담았어요.");
  };
  return (
    <Context.Provider
      value={{
        user,
        setUser,
        cart,
        recipes,
        ready,
        toast,
        notify: setToast,
        add,
        quantity: (key, n) =>
          setCart((c) =>
            n < 1
              ? c.filter((x) => x.key !== key)
              : c.map((x) =>
                  x.key === key ? { ...x, quantity: Math.min(15, n) } : x,
                ),
          ),
        save,
      }}
    >
      {children}
      <div className={"toast " + (toast ? "visible" : "")} role="status">
        {toast}
      </div>
    </Context.Provider>
  );
}
