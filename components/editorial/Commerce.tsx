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
      <strong>{money(p.price)}</strong>
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
    setC(initialCollection);
    setType(initialType);
    setQuery(initialQuery);
  }, [initialCollection, initialType, initialQuery]);
  // q는 기본적으로 현재 검색어를 유지한다. 초기화처럼 같은 클릭에서 검색어를 비울 때는
  // setQuery 반영 전의 query가 URL에 남지 않도록 값을 직접 넘긴다.
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
          <ProductPhoto product={p} loading="eager" />
        </div>
        <div className="detail-copy">
          <span className="eyebrow">{col.name} COLLECTION</span>
          <h1>{p.name}</h1>
          <span className="english-title">{p.englishName}</span>
          <p className="lead">{p.description}</p>
          <strong className="price">{money(p.price)}</strong>
          <dl className="specs">
            <div>
              <dt>구성 / 용량</dt>
              <dd>{p.volume}</dd>
            </div>
            <div>
              <dt>배송비</dt>
              <dd>3,000원</dd>
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
          {p.price === null && (
            <p className="micro">
              판매가를 확인하고 있어요. 결제 전 최종 금액을 안내해 드립니다.
            </p>
          )}
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
      <section className="product-story">
        <span className="eyebrow">THE SCENT STORY</span>
        <h2>{col.title}</h2>
        <p>
          {col.description}
          <br />
          좋아하는 향이 작은 순간에 스며들도록.
        </p>
        <div className="note-grid">
          {p.notes.map((note, i) => (
            <div key={note}>
              <span className="eyebrow">
                {["TOP", "MIDDLE", "BASE"][i]} NOTE
              </span>
              <h3>{note}</h3>
              <p>
                {
                  [
                    "처음 만나는 선명한 인상",
                    "천천히 피어나는 향의 중심",
                    "오래도록 남는 잔잔한 여운",
                  ][i]
                }
              </p>
            </div>
          ))}
        </div>
      </section>
      <section className="product-guide">
        <details>
          <summary>사용과 보관 안내</summary>
          <p>
            직사광선과 고온을 피하고 뚜껑을 닫아 보관해 주세요. 제품별 확정
            사용법과 전성분은 판매 정보 확정 후 안내합니다.
          </p>
        </details>
        <details>
          <summary>배송 및 교환 안내</summary>
          <p>
            기본 배송비는 3,000원입니다. 출고 일정과 지역별 추가 배송비는 주문
            전 확인할 수 있습니다. 교환·반품은 제품 상태와 관련 규정에 따라
            안내합니다.
          </p>
        </details>
      </section>
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
  const known = cart.every((x) => x.product.price !== null),
    total = cart.reduce((s, x) => s + (x.product.price || 0) * x.quantity, 0);
  return (
    <main className="page-width cart-page">
      <span className="eyebrow">YOUR SELECTION</span>
      <h1>장바구니</h1>
      {!cart.length ? (
        <div className="empty">
          <Asset id="empty-bag" />
          <h2>아직 담은 향이 없어요.</h2>
          <p>당신의 일상에 어울리는 향을 찾아보세요.</p>
          <Link className="button" href="/shop">
            컬렉션 둘러보기 <Arrow />
          </Link>
        </div>
      ) : (
        <div className="cart-layout">
          <div>
            {cart.map((x) => (
              <article className="cart-item" key={x.key}>
                <Link href={"/shop/" + x.product.id}>
                  <img src={x.product.image} alt={x.product.name} />
                </Link>
                <div>
                  <span className="eyebrow">
                    {x.product.collection.toUpperCase()}
                  </span>
                  <Link href={"/shop/" + x.product.id}>
                    <h3>{x.product.name}</h3>
                  </Link>
                  <p>{x.product.volume}</p>
                  {x.selection.length > 0 && (
                    <ul>
                      {x.selection.map((id) => (
                        <li key={id}>
                          {products.find((p) => p.id === id)?.name}
                        </li>
                      ))}
                    </ul>
                  )}
                  <Quantity n={x.quantity} set={(n) => quantity(x.key, n)} />
                </div>
                <div>
                  <strong>
                    {money(
                      x.product.price === null
                        ? null
                        : x.product.price * x.quantity,
                    )}
                  </strong>
                  <button
                    className="text-link"
                    onClick={() => quantity(x.key, 0)}
                  >
                    삭제
                  </button>
                </div>
              </article>
            ))}
          </div>
          <aside className="order-summary">
            <h2>주문 예상 금액</h2>
            <dl>
              <div>
                <dt>상품금액</dt>
                <dd>{known ? money(total) : "가격 확인 필요"}</dd>
              </div>
              <div>
                <dt>기본 배송비</dt>
                <dd>3,000원</dd>
              </div>
              <div>
                <dt>배송비 쿠폰</dt>
                <dd>{user?.coupon ? "보유 중" : "가입 시 제공"}</dd>
              </div>
              <div className="total">
                <dt>예상 결제금액</dt>
                <dd>{known ? money(total + 3000) : "가격 확인 필요"}</dd>
              </div>
            </dl>
            <Link className="button" href="/checkout">
              주문 정보 확인 <Arrow />
            </Link>
            <p className="micro">
              최종 배송비와 쿠폰은 주문 단계에서 확인해 주세요.
            </p>
          </aside>
        </div>
      )}
    </main>
  );
}

export function Checkout() {
  const { cart, user } = useAura(),
    [coupon, setCoupon] = useState(false);
  const known = cart.every((x) => x.product.price !== null),
    total = cart.reduce((s, x) => s + (x.product.price || 0) * x.quantity, 0);
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
                {x.product.name} × {x.quantity}
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
                <dd>{coupon ? "0원" : "3,000원"}</dd>
              </div>
              <div className="total">
                <dt>합계</dt>
                <dd>
                  {known
                    ? money(total + (coupon ? 0 : 3000))
                    : "가격 확인 필요"}
                </dd>
              </div>
            </dl>
            <button className="button" disabled>
              결제 준비 중
            </button>
            <p className="micro">
              현재 결제를 이용할 수 없습니다. 결제 가능 시 최종 금액과 배송
              정보를 확인할 수 있어요.
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
