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
                  i?.product && (products.some((p) => p.id === i.product.id) || (i.product.id === "custom-atelier" && i.custom && typeof i.custom.name === "string")) &&
                  (i.product.id === "custom-atelier" || (i.product.type !== "gift-set" || isGiftSelectionValid(products.find(p=>p.id===i.product.id)!, Array.isArray(i.selection)?i.selection:[]))),
              )
              .map((i) => ({
                ...i,
                selection: Array.isArray(i.selection) ? i.selection : [],
                product: i.product.id === "custom-atelier" ? customProduct(i.custom.name, i.custom.productType || i.product.type) : products.find((p) => p.id === i.product.id)!,
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
    // Identical saved composition is consolidated; edited compositions remain separate.
    const signature=JSON.stringify([recipe.name.trim(),recipe.label,recipe.productType || "eau-de-parfum",Object.entries(recipe.counts).sort()]);
    const key="custom:"+Array.from(signature).reduce((h,c)=>((h*31+c.charCodeAt(0))>>>0),2166136261).toString(36);
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
