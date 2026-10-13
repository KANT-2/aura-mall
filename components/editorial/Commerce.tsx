"use client";
/* eslint-disable @next/next/no-img-element */
// Synchronize browser storage or URL state after hydration.
/* eslint-disable react-hooks/set-state-in-effect */
import Link from "next/link";
import { StyledSelect } from "../ui/StyledSelect";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  products,
  collections,
  types,
  type Product,
  money,
  Arrow,
  Asset,
  ProductPhoto,
  SectionHeading,
  Quantity,
} from "./Shared";
import { useAura } from "./Provider";
import { ProductDetailContentDock } from "./ProductDetailContentDock";
import { amountUntilFreeShipping, itemPrice, shippingFee } from "./pricing";

export function ProductCard({ product: p }: { product: Product }) {
  return (
    <Link href={"/shop/" + p.id} className="product-card">
      <div className="product-image">
        <ProductPhoto product={p} />
        <span>자세히 보기 ↗</span>
      </div>
      <span className="eyebrow">{p.collection.toUpperCase()} COLLECTION</span>
      <h3>{p.name}</h3>
      <p>
        {p.typeName} · {p.volume}
      </p>
      <strong>{p.type === "gift-set" ? "선택 상품 합계" : money(p.price)}</strong>
    </Link>
  );
}

export function Shop({
  initialCollection = "",
  initialType = "",
  initialQuery = "",
}: {
  initialCollection?: string;
  initialType?: string;
  initialQuery?: string;
}) {
  const [c, setC] = useState(initialCollection),
    [type, setType] = useState(initialType),
    [query, setQuery] = useState(initialQuery),
    [sort, setSort] = useState("default");
  const collection = collections.find((x) => x.id === c);
  const router = useRouter();
  useEffect(() => {
    const timer = window.setTimeout(() => {
      // A fresh filter reset from PR #14 still removes the stale q parameter.
      const current = new URLSearchParams(window.location.search);
      const q = query.trim();
      if(q) current.set("q",q); else current.delete("q");
      if((current.get("q")||"") !== initialQuery) {
        router.replace("/shop" + (current.toString() ? "?" + current : ""), {scroll:false});
      }
    }, 320);
    return () => window.clearTimeout(timer);
  },[query,initialQuery,router]);
  useEffect(() => {
    setC(initialCollection);
    setType(initialType);
    setQuery(initialQuery);
  }, [initialCollection, initialType, initialQuery]);
  const update = (co: string, ty: string, q = query) => {
    setC(co);
    setType(ty);
    const s = new URLSearchParams();
    if (co) s.set("collection", co);
    if (ty) s.set("type", ty);
    if (q) s.set("q", q);
    router.replace("/shop?" + s.toString(), { scroll: false });
  };
  const list = products
    .filter(
      (p) =>
        (!c || p.collection === c) &&
        (!type || p.type === type) &&
        [p.name, p.englishName, p.typeName, p.description]
          .join(" ")
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort((a, b) =>
      sort === "low"
        ? (a.price ?? Infinity) - (b.price ?? Infinity)
        : sort === "high"
          ? (b.price ?? -1) - (a.price ?? -1)
          : 0,
    );
  return (
    <main className="shop page-width">
      <div className="shop-title">
        <div>
          <span className="eyebrow">
            AURA COLLECTION / {collection?.name || "ALL"}
          </span>
          <h1>{collection?.title || "향으로 채우는 일상"}</h1>
          <p>
            {collection?.description ||
              "피부에, 머릿결에, 머무는 공간에. 당신의 향을 만나보세요."}
          </p>
        </div>
        <Asset id={"collection-" + (c || "fresh")} />
      </div>
      <div className="tabs">
        <button
          className={!c ? "selected" : ""}
          onClick={() => update("", type)}
        >
          전체
        </button>
        {collections.map((x) => (
          <button
            key={x.id}
            className={c === x.id ? "selected" : ""}
            onClick={() => update(x.id, type)}
          >
            {x.name}
          </button>
        ))}
      </div>
      <div className="filter-row">
        <label>
          제품 유형
          <StyledSelect label="제품 유형" value={type} onChange={v=>update(c,v)} options={[{value:"",label:"전체 유형"},...types.map(t=>({value:t.id,label:t.label}))]}/>
        </label>
        <label className="search-field">
          상품 검색
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="상품명 또는 향의 분위기"
          />
        </label>
        <label>
          정렬
          <StyledSelect label="정렬" value={sort} onChange={setSort} options={[{value:"default",label:"추천순"},{value:"low",label:"가격 낮은 순"},{value:"high",label:"가격 높은 순"}]}/>
        </label>
      </div>
      <div className="result-line">{list.length}개의 향 제품</div>
      {list.length ? (
        <div className="product-grid grid">
          {list.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      ) : (
        <div className="empty">
          <Asset id="scent-strip" />
          <h2>검색한 상품이 없어요.</h2>
          <p>다른 이름으로 검색하거나 필터를 바꿔보세요.</p>
          <button
            onClick={() => {
              setQuery("");
              setSort("default");
              update("", "", "");
            }}
          >
            필터 초기화
          </button>
        </div>
      )}
    </main>
  );
}

export function ProductDetail({ product: p }: { product: Product }) {
  const { add, notify } = useAura(),
    [n, setN] = useState(1),
    [selection, setSelection] = useState<string[]>([]),
    [added, setAdded] = useState(false);
  const col = collections.find((c) => c.id === p.collection)!,
    gift = p.type === "gift-set";
  const eligible = products.filter(
    (x) => x.collection === p.collection && x.type !== "gift-set",
  );
  function toggle(id: string) {
    if (selection.includes(id)) setSelection(selection.filter((x) => x !== id));
    else if (selection.length < 3) setSelection([...selection, id]);
    else notify("제품은 3개까지 선택할 수 있어요.");
  }
  return (
    <main className="detail page-width">
      <nav className="breadcrumb" aria-label="현재 위치">
        <Link href="/shop">컬렉션</Link> /{" "}
        <Link href={"/shop?collection=" + col.id}>{col.name}</Link> /{" "}
        {p.typeName}
      </nav>
      <section className="detail-top">
        <div className="detail-image">
          <ProductPhoto product={p} loading="eager" selection={selection} />
        </div>
        <div className="detail-copy">
          <span className="eyebrow">{col.name} COLLECTION</span>
          <h1>{p.name}</h1>
          <span className="english-title">{p.englishName}</span>
          <p className="lead">{p.description}</p>
          <strong className="price">{gift ? (selection.length===3 ? money(selection.reduce((sum,id)=>sum+(products.find(x=>x.id===id)?.price ?? 0),0)) : "구성에 따라 가격이 달라져요") : money(p.price)}</strong>
          <dl className="specs">
            <div>
              <dt>구성 / 용량</dt>
              <dd>{p.volume}</dd>
            </div>
            <div>
              <dt>배송비</dt>
              <dd>50,000원 이상 구매 시 무료 · 기본 3,000원</dd>
            </div>
            <div>
              <dt>향의 무드</dt>
              <dd>{col.title}</dd>
            </div>
          </dl>
          {gift && (
            <div className="gift-summary">
              <span>
                선물에 담을 세 가지 향 <b>{selection.length} / 3</b>
              </span>
              <div className="gift-slots">
                {[0, 1, 2].map((i) => {
                  const s = products.find((x) => x.id === selection[i]);
                  return (
                    <div key={i}>
                      {s ? (
                        <>
                          <img src={s.image} alt="" />
                          <small>{s.typeName}</small>
                          <button
                            aria-label={s.name + " 선택 해제"}
                            onClick={() => toggle(s.id)}
                          >
                            ×
                          </button>
                        </>
                      ) : (
                        <>
                          <span>0{i + 1}</span>
                          <small>제품을 선택해 주세요</small>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
              <a className="text-link" href="#gift-options">
                구성 선택하기 ↓
              </a>
            </div>
          )}
          <div className="purchase-row">
            <Quantity n={n} set={setN} />
            <button
              className="button"
              disabled={gift && selection.length !== 3}
              onClick={() => {
                add(p, n, selection);
                setAdded(true);
              }}
            >
              장바구니 담기 <Arrow />
            </button>
          </div>
          {added && (
            <Link className="added" href="/cart">
              장바구니에서 확인하기 →
            </Link>
          )}
          {gift && <p className="micro">선택한 3개 상품 판매가의 합계이며, 별도 기프트 할인 및 포장 추가금은 적용하지 않았어요.</p>}
        </div>
      </section>
      {gift && (
        <section className="gift-options" id="gift-options">
          <SectionHeading
            number="01"
            title="받는 분의 일상을 떠올려 보세요"
            copy="같은 컬렉션의 서로 다른 제품을 3개 골라주세요."
          />
          <div className="gift-grid">
            {eligible.map((s) => (
              <label
                className={
                  "gift-option " + (selection.includes(s.id) ? "selected" : "")
                }
                key={s.id}
              >
                <input
                  type="checkbox"
                  checked={selection.includes(s.id)}
                  onChange={() => toggle(s.id)}
                  disabled={!selection.includes(s.id) && selection.length === 3}
                />
                <img src={s.image} alt={s.name} />
                <span>{s.typeName}</span>
                <small>{s.name}</small>
              </label>
            ))}
          </div>
        </section>
      )}
      <ProductDetailContentDock product={p} collectionTitle={col.title} collectionDescription={col.description} />
      <section className="related">
        <SectionHeading
          number="02"
          title="같은 향, 다른 순간"
          copy="좋아하는 향을 일상으로 넓혀보세요."
        />
        <div className="product-grid grid">
          {eligible
            .filter((x) => x.id !== p.id)
            .slice(0, 3)
            .map((x) => (
              <ProductCard key={x.id} product={x} />
            ))}
        </div>
      </section>
    </main>
  );
}

export function Cart() {
  const { cart, quantity, user } = useAura();
  const known = cart.every(item => itemPrice(item) !== null);
  const subtotal = cart.reduce((sum, item) => sum + (itemPrice(item) ?? 0) * item.quantity, 0);
  const delivery = shippingFee(subtotal, false);
  const remaining = amountUntilFreeShipping(subtotal);
  return (
    <main className="page-width cart-page a86-cart">
      <div className="a86-cart-heading"><span className="eyebrow">YOUR SELECTION</span><h1>장바구니 <small>{cart.length}</small></h1></div>
      {!cart.length ? (
        <div className="empty"><Asset id="empty-bag"/><h2>아직 담은 향이 없어요.</h2><p>당신의 일상에 어울리는 향을 찾아보세요.</p><Link className="button" href="/shop">컬렉션 둘러보기 <Arrow/></Link></div>
      ) : (
        <>
          <p className="a86-shipping-hint" role="status">{known ? (delivery === 0 ? "50,000원 이상 구매 혜택 · 무료배송 적용" : `${money(remaining)} 더 담으면 무료배송 · 기본 배송비 3,000원`) : "확인이 필요한 상품이 있어 배송비는 주문 단계에서 안내돼요."}</p>
          <div className="cart-layout">
            <div className="a86-cart-list">
              {cart.map(item => {
                const amount = itemPrice(item);
                const isLegacyCustom = Boolean(item.custom && item.product.type !== "eau-de-parfum");
                return (
                  <article className="cart-item a86-cart-item" key={item.key}>
                    <div className="a86-cart-thumb">
                      {item.custom ? <Asset id="custom-bottle"/> : <Link href={`/shop/${item.product.id}`}><ProductPhoto product={item.product} selection={item.selection}/></Link>}
                    </div>
                    <div className="a86-cart-info">
                      <span className="eyebrow">{item.custom ? "PERSONAL ATELIER" : `${item.product.collection.toUpperCase()} COLLECTION`}</span>
                      {item.custom ? <h3>{item.custom.name}</h3> : <Link href={`/shop/${item.product.id}`}><h3>{item.product.name}</h3></Link>}
                      <p>{item.custom ? "커스텀 오 드 퍼퓸" : item.product.typeName} · {item.product.volume}</p>
                      {item.custom ? <p className="a86-cart-meta">{item.custom.label === "paper" ? "페이퍼" : item.custom.label === "minimal" ? "미니멀" : "클래식"} 라벨 · {Object.keys(item.custom.counts).length}종의 향료</p> : null}
                      {item.selection.length > 0 && <p className="a86-cart-meta">{item.selection.map(id => products.find(p => p.id === id)?.typeName).filter(Boolean).join(" · ")}</p>}
                      {isLegacyCustom && <p className="a86-cart-warning">이전에 담은 커스텀 제품 유형은 현재 제공하지 않아요. 조향에서 오 드 퍼퓸으로 다시 담아 주세요.</p>}
                      <div className="a86-cart-row-actions"><Quantity n={item.quantity} set={n => quantity(item.key, n)}/><button type="button" className="a86-cart-remove" onClick={() => quantity(item.key, 0)}>삭제</button></div>
                    </div>
                    <strong className="a86-cart-item-price">{amount === null || isLegacyCustom ? "확인 필요" : money(amount * item.quantity)}</strong>
                  </article>
                );
              })}
            </div>
            <aside className="order-summary a86-order-summary">
              <h2>주문 예상 금액</h2>
              <dl><div><dt>상품금액</dt><dd>{known ? money(subtotal) : "확인 필요"}</dd></div><div><dt>배송비</dt><dd>{known ? (delivery === 0 ? "무료" : money(delivery)) : "확인 필요"}</dd></div><div className="a86-coupon-line"><dt>배송비 쿠폰</dt><dd>{user?.coupon ? "주문 화면에서 선택" : "사용 가능 쿠폰 없음"}</dd></div><div className="total"><dt>예상 결제금액</dt><dd>{known ? money(subtotal + delivery) : "확인 필요"}</dd></div></dl>
              {known ? <Link className="button" href="/checkout">주문 정보 확인 <Arrow/></Link> : <button className="button" disabled>상품 정보 확인 후 진행</button>}
              <p className="micro">쿠폰 혜택은 주문 정보 확인 단계에서 적용돼요.</p>
            </aside>
          </div>
        </>
      )}
    </main>
  );
}

export function Checkout() {
  const { cart, user } = useAura(),
    [coupon, setCoupon] = useState(false);
  const known = cart.every(x=>itemPrice(x)!==null),
    total = cart.reduce((sum,x)=>sum + (itemPrice(x)??0)*x.quantity,0);
  return (
    <main className="page-width checkout">
      <span className="eyebrow">ORDER DETAILS</span>
      <h1>주문 정보</h1>
      {!cart.length ? (
        <div className="empty">
          <p>장바구니에서 상품을 선택해 주세요.</p>
          <Link className="button" href="/shop">
            컬렉션 보기
          </Link>
        </div>
      ) : (
        <div className="cart-layout">
          <form>
            <h2>배송지</h2>
            <label>
              받는 분
              <input
                name="recipient"
                autoComplete="shipping name"
                required
                placeholder="받는 분 이름"
              />
            </label>
            <label>
              연락처
              <input
                type="tel"
                autoComplete="shipping tel"
                placeholder="010-0000-0000"
              />
            </label>
            <label>
              주소
              <input
                autoComplete="shipping street-address"
                placeholder="배송받을 주소"
              />
            </label>
            <label>
              상세 주소
              <input placeholder="동·호수 등 상세 주소" />
            </label>
            <label>
              배송 요청사항
              <textarea placeholder="배송 시 요청사항을 적어주세요." />
            </label>
            {user?.coupon && (
              <label className="check">
                <input
                  type="checkbox"
                  checked={coupon}
                  onChange={(e) => setCoupon(e.target.checked)}
                />
                신규 회원 배송비 쿠폰 적용
              </label>
            )}
          </form>
          <aside className="order-summary">
            <h2>선택한 상품</h2>
            {cart.map((x) => (
              <p key={x.key}>
                {x.custom?`${x.custom.name} (커스텀 향)`:x.product.name} × {x.quantity}
                {x.selection.length > 0 && (
                  <small>
                    {x.selection
                      .map((id) => products.find((p) => p.id === id)?.typeName)
                      .join(" · ")}
                  </small>
                )}
              </p>
            ))}
            <dl>
              <div>
                <dt>상품금액</dt>
                <dd>{known ? money(total) : "가격 확인 필요"}</dd>
              </div>
              <div>
                <dt>배송비</dt>
                <dd>{known ? (shippingFee(total,Boolean(user?.coupon && coupon))===0 ? "무료" : "3,000원") : "금액 확인 필요"}</dd>
              </div>
              <div className="total">
                <dt>합계</dt>
                <dd>
                  {known
                    ? money(total + shippingFee(total, Boolean(user?.coupon && coupon)))
                    : "가격 확인 필요"}
                </dd>
              </div>
            </dl>
            <button className="button" disabled>
              결제 준비 중
            </button>
            <p className="micro">
              현재 주문 접수·결제는 지원되지 않아요. 커스텀 향은 제조 가능 여부 및 제작 정책 확인이 필요해요.
            </p>
          </aside>
        </div>
      )}
    </main>
  );
}

export function Missing() {
  return (
    <main className="page-width empty">
      <span className="eyebrow">PAGE NOT FOUND</span>
      <h1>이 페이지를 찾을 수 없어요.</h1>
      <Link className="button" href="/shop">
        컬렉션으로 이동
      </Link>
    </main>
  );
}
