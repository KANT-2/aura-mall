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
import { isGiftSelectionValid } from "./pricing";

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

export type State = {
  user: accounts.Member | null;
  cart: CartItem[];
  recipes: Recipe[];
  ready: boolean;
  toast: string;
  notify: (s: string) => void;
  setUser: (u: accounts.Member | null) => void;
  add: (p: Product, n: number, s?: string[]) => void;
  addCustom: (r: CustomRecipeItem) => boolean;
  quantity: (key: string, n: number) => void;
  save: (r: Recipe) => boolean;
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
  } as unknown as Product;
}
const MAX_QUANTITY = 15;
const isRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
/** Ingredient counts must be non-negative integers with at least one drop; zero entries are dropped. */
function validCounts(v: unknown): Record<string, number> | null {
  if (!isRecord(v)) return null;
  const entries = Object.entries(v);
  if (!entries.every(([, n]) => Number.isInteger(n) && (n as number) >= 0)) return null;
  const used = entries.filter(([, n]) => (n as number) > 0);
  return used.length ? (Object.fromEntries(used) as Record<string, number>) : null;
}
const clampQuantity = (v: unknown) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.min(MAX_QUANTITY, Math.max(1, n)) : 1;
};
const productKey = (id: string, selection: string[]) => id + ":" + [...selection].sort().join(",");
// Identical saved composition is consolidated; edited compositions remain separate.
function customKey(recipe: CustomRecipeItem) {
  const signature=JSON.stringify([recipe.name.trim(),recipe.label,recipe.productType || "eau-de-parfum",Object.entries(recipe.counts).sort()]);
  return "custom:"+Array.from(signature).reduce((h,c)=>((h*31+c.charCodeAt(0))>>>0),2166136261).toString(36);
}

/** Rebuild stored cart rows from the catalog; drops corrupt rows and merges duplicate keys. */
function restoreCart(raw: unknown): CartItem[] {
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
        label: typeof c.label === "string" ? c.label : "classic",
        color: typeof c.color === "string" ? c.color : "#d5b575",
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

/**
 * Carts are kept per browser account: one key per signed-in email and one for guests.
 * This separates accounts sharing a browser; it is not a server-side security boundary.
 * The legacy shared `aura_cart_v2` key has no owner, so it is left untouched (not read or migrated).
 */
const cartKey = (email?: string | null) => "aura_cart_v3_" + (email ? "member:" + email : "guest");
function loadCart(email?: string | null): CartItem[] {
  try {
    return restoreCart(JSON.parse(localStorage.getItem(cartKey(email)) || "[]"));
  } catch {
    return [];
  }
}

/** Keeps saved recipes that can be opened again; malformed optional fields get safe defaults. */
function restoreRecipes(raw: unknown): Recipe[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((r): Recipe[] => {
    const counts = isRecord(r) ? validCounts(r.counts) : null;
    if (!isRecord(r) || typeof r.id !== "string" || typeof r.name !== "string" || !counts) return [];
    return [{
      id: r.id,
      parent: typeof r.parent === "string" ? r.parent : undefined,
      version: Number.isInteger(r.version) && (r.version as number) > 0 ? (r.version as number) : 1,
      name: r.name,
      label: typeof r.label === "string" ? r.label : "classic",
      counts,
      color: typeof r.color === "string" ? r.color : "#d5b575",
      created: typeof r.created === "string" ? r.created : "",
    }];
  });
}

export const Context = createContext<State | null>(null);

export function useAura() {
  const s = useContext(Context);
  if (!s) throw Error("AuraProvider required");
  return s;
}

export function AuraProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<accounts.Member | null>(null),
    [cart, setCart] = useState<CartItem[]>([]),
    // Storage key the in-memory cart belongs to; saving never follows `user` directly.
    [cartStore, setCartStore] = useState(cartKey(null)),
    [recipes, setRecipes] = useState<Recipe[]>([]),
    [ready, setReady] = useState(false),
    [toast, setToast] = useState("");
  // Switching account swaps user, owner key and cart in one batch so the
  // previous member's items are never written to the next member's key.
  const setUser = (u: accounts.Member | null) => {
    setUserState(u);
    setCartStore(cartKey(u?.email));
    setCart(loadCart(u?.email));
  };
  useEffect(() => {
    const u = accounts.current();
    setUserState(u);
    setCartStore(cartKey(u?.email));
    setCart(loadCart(u?.email));
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(cartStore, JSON.stringify(cart));
    } catch {
      setToast("저장 공간을 확인해 주세요.");
    }
  }, [cart, cartStore, ready]);
  useEffect(() => {
    if (!ready) return;
    try {
      const x = JSON.parse(
        localStorage.getItem("aura_recipes_v2_" + (user?.email || "guest")) ||
          "[]",
      );
      setRecipes(restoreRecipes(x));
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
      return true;
    } catch {
      setToast("저장하지 못했어요. 저장 공간을 확인해 주세요.");
      return false;
    }
  };
  const addCustom = (recipe:CustomRecipeItem) => {
    if(recipe.productType && recipe.productType !== "eau-de-parfum") {
      setToast("맞춤 조향은 현재 오 드 퍼퓸 50mL만 제공해요.");return false;
    }
    if(!recipe.name.trim() || !Object.values(recipe.counts).some(n=>n>0)) {
      setToast("향 이름과 향료 조합을 확인해 주세요.");return false;
    }
    const key=customKey(recipe);
    setCart(previous=>{
      const existing=previous.find(item=>item.key===key);
      return existing ? previous.map(item=>item.key===key?{...item,quantity:Math.min(15,item.quantity+1)}:item)
        : [...previous,{key,product:customProduct(recipe.name.trim(),recipe.productType),quantity:1,selection:[],custom:{...recipe,counts:{...recipe.counts}}}];
    });
    setToast("나만의 향을 장바구니에 담았어요.");
    return true;
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
    const key = productKey(p.id, s);
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
        addCustom,
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
