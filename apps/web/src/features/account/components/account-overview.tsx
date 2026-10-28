"use client";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import { useOrders } from "@/features/checkout/hooks/use-orders";
import { testIds } from "@/lib/test-ids";
import styles from "@/features/account/components/account.module.css";
import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/features/account/hooks/use-auth";
import { useCatalog } from "@/features/catalog/hooks/use-catalog";
import { Arrow } from "@/components/ui/arrow";
import { Asset } from "@/components/ui/asset";
import { totalCount } from "@/features/atelier/model/recipes";
import { useNotify } from "@/components/feedback/notification-provider";
import { useRecipes } from "@/features/atelier/hooks/use-recipes";
import { useAccount } from "@/features/account/hooks/use-account";
import { useCart } from "@/features/cart/hooks/use-cart";
import { OrderCard } from "@/features/checkout/components/order-card";
import { Questions } from "@/features/questions/components/questions";
import { MemberSettings } from "@/features/account/components/member-settings";
export function MyPage({ initialTab = "scents" }: { initialTab?: string }) {
  const { ingredients } = useCatalog();
  const { signOut } = useAuth();
  const { addCustom } = useCart();
  const [addingScent, setAddingScent] = useState<string | null>(null);
  const [addedScent, setAddedScent] = useState<string | null>(null);
  const { user, ready } = useAccount(),
    { recipes, ready: recipesReady, remove: removeRecipe } = useRecipes(),
    notify = useNotify(),
    [tab, setTab] = useState(initialTab),
    [filter, setFilter] = useState("all");
  const memberId = user?.id ?? null;
  const [orderPaging, setOrderPaging] = useState<{ owner: string | null; count: number }>({
    owner: memberId,
    count: 5,
  });
  if (orderPaging.owner !== memberId) {
    setOrderPaging({ owner: memberId, count: 5 });
  }

  const orders = useOrders(tab === "orders" || (tab === "scents" && filter === "purchased"));
  const purchased =
    orders.data
      ?.filter(
        (order) =>
          order.status && ["paid", "preparing", "shipped", "delivered"].includes(order.status),
      )
      .flatMap((order) =>
        order.items.flatMap((item) =>
          item.custom
            ? [
                {
                  ...item.custom,
                  id: `${order.id}:${item.key}`,
                  quantity: item.quantity,
                  created: order.created,
                },
              ]
            : [],
        ),
      ) ?? [];
  if (!ready || !recipesReady) {
    return (
      <main className={styles.root + " page-width"} aria-busy="true">
        <LoadingSkeleton variant="account" label="내 정보를 불러오고 있어요." />
      </main>
    );
  }

  if (!user) {
    return (
      <main className={styles.root + " page-width"}>
        <div className="empty">
          <Asset id="custom-bottle" />
          <h1>나의 향을 만나보세요.</h1>
          <p>로그인하면 저장한 향과 쿠폰을 확인할 수 있어요.</p>
          <Link className="button" href="/login?next=/mypage">
            로그인
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main data-testid={testIds.account.overview} className={styles.root + " page-width mypage"}>
      <div className="heading-row">
        <div>
          <span className="eyebrow">MY AURA</span>
          <h1>{user.name}님의 취향 기록</h1>
          <p>만든 향과 좋아하는 순간을 오래도록.</p>
        </div>
        <div className="actions">
          {user.role === "admin" ? (
            <Link className="text-link" href="/admin">
              관리자 페이지
            </Link>
          ) : null}
          <button
            data-testid={testIds.account.logout}
            className="text-link"
            onClick={async () => {
              try {
                await signOut();
                notify("로그아웃했어요.");
              } catch (error) {
                notify(error instanceof Error ? error.message : "로그아웃하지 못했어요.");
              }
            }}
          >
            로그아웃
          </button>
        </div>
      </div>
      <div className="tabs">
        {[
          ["scents", "내가 만든 향"],
          ["orders", "주문 내역"],
          ["coupons", "내 쿠폰"],
          ["questions", "상품 문의"],
          ["account", "계정 관리"],
        ].map(([id, title]) => (
          <button
            key={id}
            className={tab === id ? "selected" : ""}
            aria-pressed={tab === id}
            onClick={() => setTab(id)}
          >
            {title}
          </button>
        ))}
      </div>
      {tab === "scents" ? (
        <>
          <div className="chips">
            {[
              ["all", "전체"],
              ["saved", "저장한 향"],
              ["purchased", "구매한 향"],
            ].map(([id, title]) => (
              <button
                className={filter === id ? "selected" : ""}
                aria-pressed={filter === id}
                onClick={() => setFilter(id)}
                key={id}
              >
                {title}
              </button>
            ))}
          </div>
          {filter === "purchased" && orders.isLoading ? (
            <LoadingSkeleton variant="orders" label="구매한 향을 불러오고 있어요." />
          ) : filter === "purchased" && orders.error ? (
            <p role="alert">구매 내역을 불러오지 못했어요.</p>
          ) : filter === "purchased" && purchased.length ? (
            <div className="recipe-grid">
              {purchased.map((item) => (
                <article className="saved-recipe" key={item.id}>
                  <div className="saved-recipe-visual">
                    <span className="saved-version">AURA / MY COLLECTION</span>
                    <Asset id="custom-bottle" />
                    <span className="saved-name">{item.name}</span>
                  </div>
                  <div className="saved-recipe-body">
                    <span className="eyebrow">MY PURCHASED SCENT</span>
                    <h2>{item.name}</h2>
                    <p>
                      {item.quantity}개 · {new Date(item.created).toLocaleDateString("ko-KR")}
                    </p>
                    <p>
                      {Object.entries(item.counts)
                        .map(
                          ([id, count]) =>
                            `${ingredients.find((x) => x.id === id)?.name ?? id} ${count}회`,
                        )
                        .join(" · ")}
                    </p>
                    <button
                      type="button"
                      className={styles.reorderButton}
                      disabled={addingScent === item.id}
                      onClick={async () => {
                        setAddingScent(item.id);
                        try {
                          if (
                            await addCustom({
                              name: item.name,
                              label: item.label,
                              color: item.color,
                              counts: item.counts,
                              productType: item.productType,
                            })
                          ) {
                            setAddedScent(item.id);
                          }
                        } finally {
                          setAddingScent(null);
                        }
                      }}
                    >
                      {addingScent === item.id ? "담는 중…" : "이 향 다시 담기"}
                      <span aria-hidden="true">↗</span>
                    </button>
                    {addedScent === item.id && (
                      <Link className="text-link" href="/cart">
                        장바구니에서 확인하기 →
                      </Link>
                    )}
                  </div>
                </article>
              ))}
            </div>
          ) : recipes.length && filter !== "purchased" ? (
            <div className="recipe-grid">
              {recipes.map((r) => (
                <article className="saved-recipe" key={r.id}>
                  <div className="saved-recipe-visual">
                    <span className="saved-version">AURA / PRIVATE COMPOSITION</span>
                    <Asset id="custom-bottle" />
                    <span className="saved-name">{r.name}</span>
                  </div>
                  <div className="saved-recipe-body">
                    <span className="eyebrow">
                      VERSION {r.version}
                      {Number.isNaN(Date.parse(r.created))
                        ? ""
                        : ` / ${new Date(r.created).toLocaleDateString("ko-KR")}`}
                    </span>
                    <h2>{r.name}</h2>
                    <p className="saved-topnotes">
                      {Object.entries(r.counts)
                        .sort((a, b) => b[1] - a[1])
                        .slice(0, 3)
                        .map(([id]) => ingredients.find((x) => x.id === id)?.name)
                        .filter(Boolean)
                        .join(" · ")}
                      {Object.keys(r.counts).length > 3
                        ? ` 외 ${Object.keys(r.counts).length - 3}종`
                        : ""}
                    </p>
                    <details>
                      <summary>전체 레시피 보기 · {totalCount(r.counts)}회</summary>
                      <p>
                        라벨:{" "}
                        {r.label === "classic"
                          ? "클래식"
                          : r.label === "paper"
                            ? "페이퍼"
                            : "미니멀"}
                      </p>
                      {Object.entries(r.counts).map(([id, n]) => (
                        <p key={id}>
                          {ingredients.find((x) => x.id === id)?.name} — {n}회
                        </p>
                      ))}
                    </details>
                    <Link className="text-link" href={"/atelier?recipe=" + r.id}>
                      이 향으로 다시 만들기 <Arrow />
                    </Link>
                    <button
                      type="button"
                      className="text-link"
                      onClick={() => {
                        if (window.confirm("저장한 향을 삭제할까요?")) {
                          void removeRecipe(r.id);
                        }
                      }}
                    >
                      저장한 향 삭제
                    </button>
                    <small>
                      이 향을 다시 열어 장바구니에 담을 수 있어요. 실제 제조·가격은 확인이 필요해요.
                    </small>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty">
              <Asset id="custom-bottle" />
              <h2>{filter === "purchased" ? "구매한 향이 없어요." : "아직 저장한 향이 없어요."}</h2>
              <Link className="button" href="/atelier">
                나만의 향 만들기
              </Link>
            </div>
          )}
        </>
      ) : tab === "coupons" ? (
        <article className="coupon-card">
          <Asset id="coupon" />
          <div>
            <span className="eyebrow">WELCOME BENEFIT</span>
            <h2>첫 주문 배송비 쿠폰</h2>
            <p>
              {user?.coupon
                ? "3,000원 배송비 혜택 · 5만 원 이상 주문은 자동 무료배송"
                : "사용 가능한 쿠폰이 없습니다."}
            </p>
            <p className="micro">쿠폰은 주문 접수 시 사용 처리되며, 주문 취소 시 복구돼요.</p>
          </div>
          <span className="chip">{user?.coupon ? "사용 가능" : "미보유"}</span>
        </article>
      ) : tab === "orders" && orders.data?.length ? (
        <section className={styles.ordersSection} aria-label="주문 내역">
          <div className={styles.sectionHeader}>
            <div>
              <span className="eyebrow">MY ORDERS</span>
              <h2>
                주문 내역 <small>{orders.data.length}</small>
              </h2>
            </div>
            <p>주문 상태와 배송 정보를 확인할 수 있어요.</p>
          </div>
          <div className={styles.orderList}>
            {orders.data
              .slice(0, orderPaging.owner === memberId ? orderPaging.count : 5)
              .map((order) => (
                <OrderCard key={order.id} order={order} />
              ))}
          </div>
          <div className={styles.orderMore}>
            <p>
              총 {orders.data.length}건 중 {Math.min(orderPaging.count, orders.data.length)}건을
              보고 있어요.
            </p>
            {orderPaging.count < orders.data.length && (
              <button
                type="button"
                onClick={() => setOrderPaging({ owner: memberId, count: orderPaging.count + 5 })}
              >
                이전 주문 더 보기 <span aria-hidden="true">↓</span>
              </button>
            )}
          </div>
        </section>
      ) : tab === "orders" && orders.isLoading ? (
        <LoadingSkeleton variant="orders" label="주문 내역을 불러오고 있어요." />
      ) : tab === "orders" && orders.error ? (
        <div className={styles.loadError} role="alert">
          <p>주문 내역을 불러오지 못했어요.</p>
          <button type="button" onClick={() => void orders.refetch()}>
            다시 불러오기
          </button>
        </div>
      ) : tab === "orders" ? (
        <div className="empty">
          <Asset id="empty-bag" />
          <h2>아직 주문 내역이 없어요.</h2>
          <Link className="text-link" href="/shop">
            컬렉션 둘러보기 →
          </Link>
        </div>
      ) : tab === "questions" ? (
        <Questions mine />
      ) : user.role !== "admin" ? (
        <MemberSettings key={`${user.id}:${user.name}:${user.marketing}`} member={user} />
      ) : null}
    </main>
  );
}
