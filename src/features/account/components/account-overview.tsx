"use client";
import { useOrders } from "@/features/checkout/hooks/use-orders";
import { money } from "@/lib/format";
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
import { useSession } from "@/features/account/hooks/use-session";
export function MyPage() {
  const { ingredients } = useCatalog();
  const { signOut } = useAuth();
  const { user, ready } = useSession(),
    { recipes, ready: recipesReady } = useRecipes(),
    notify = useNotify(),
    [tab, setTab] = useState("scents"),
    [filter, setFilter] = useState("all");
  const orders = useOrders(tab === "orders");
  if (!ready || !recipesReady) {
    return (
      <main className={styles.root + " page-width"} aria-busy="true">
        <p>내 정보를 불러오고 있어요.</p>
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
      <div className="tabs">
        {[
          ["scents", "내가 만든 향"],
          ["orders", "주문 내역"],
          ["coupons", "내 쿠폰"],
          ["account", "계정 관리"],
        ].map(([id, title]) => (
          <button key={id} className={tab === id ? "selected" : ""} onClick={() => setTab(id)}>
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
                onClick={() => setFilter(id)}
                key={id}
              >
                {title}
              </button>
            ))}
          </div>
          {recipes.length && filter !== "purchased" ? (
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
            <p className="micro">결제 기능 준비 전까지 쿠폰 사용 완료는 처리되지 않아요.</p>
          </div>
          <span className="chip">{user?.coupon ? "사용 가능" : "미보유"}</span>
        </article>
      ) : tab === "orders" && orders.data?.length ? (
        <section>
          {orders.data.map((order) => (
            <article className="account-panel" key={order.id}>
              <h2>{order.items.map((item) => item.product.name).join(" · ")}</h2>
              <p>{money(order.total)}</p>
              <p>
                {order.recipient} · {order.address}
              </p>
            </article>
          ))}
        </section>
      ) : tab === "orders" && orders.isLoading ? (
        <p role="status">주문 내역을 불러오고 있어요.</p>
      ) : tab === "orders" && orders.error ? (
        <p role="alert">주문 내역을 불러오지 못했어요.</p>
      ) : tab === "orders" ? (
        <div className="empty">
          <Asset id="empty-bag" />
          <h2>아직 주문 내역이 없어요.</h2>
          <Link className="text-link" href="/shop">
            컬렉션 둘러보기 →
          </Link>
        </div>
      ) : (
        <div className="account-panel">
          <h2>회원 정보</h2>
          <dl>
            <div>
              <dt>이름</dt>
              <dd>{user.name}</dd>
            </div>
            <div>
              <dt>이메일</dt>
              <dd>{user.email}</dd>
            </div>
          </dl>
        </div>
      )}
    </main>
  );
}
