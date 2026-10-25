"use client";
import { MAX_QUANTITY } from "@/features/cart/model/cart";
import { useCatalog } from "@/features/catalog/hooks/use-catalog";
import { testIds } from "@/lib/test-ids";
import styles from "@/styles/commerce.module.css";
import Link from "next/link";

import { money } from "@/lib/format";
import { amountUntilFreeShipping, itemPrice, shippingFee } from "@/features/cart/model/pricing";
import { Arrow } from "@/components/ui/arrow";
import { Asset } from "@/components/ui/asset";
import { ProductPhoto } from "@/features/catalog/components/product-photo";
import { Quantity } from "@/components/ui/quantity-input";
import { useCart } from "@/features/cart/hooks/use-cart";
import { useSession } from "@/features/account/hooks/use-session";

export function Cart() {
  const { products } = useCatalog();
  const { cart, quantity, ready, pending } = useCart();
  const { user } = useSession();
  const known = cart.every((item) => itemPrice(item, products) !== null);
  const subtotal = cart.reduce(
    (sum, item) => sum + (itemPrice(item, products) ?? 0) * item.quantity,
    0,
  );
  const delivery = shippingFee(subtotal, false);
  const remaining = amountUntilFreeShipping(subtotal);
  if (!ready) {
    return (
      <main className={styles.root + " page-width cart-page"} aria-busy="true">
        <p role="status">장바구니를 불러오고 있어요.</p>
      </main>
    );
  }
  return (
    <main className={styles.root + " page-width cart-page a86-cart"}>
      <div className="a86-cart-heading">
        <span className="eyebrow">YOUR SELECTION</span>
        <h1>
          장바구니 <small>{cart.length}</small>
        </h1>
      </div>
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
        <>
          <p className="a86-shipping-hint" role="status">
            {known
              ? delivery === 0
                ? "50,000원 이상 구매 혜택 · 무료배송 적용"
                : `${money(remaining)} 더 담으면 무료배송 · 기본 배송비 3,000원`
              : "확인이 필요한 상품이 있어 배송비는 주문 단계에서 안내돼요."}
          </p>
          <div className="cart-layout">
            <div className="a86-cart-list">
              {cart.map((item) => {
                const amount = itemPrice(item, products);
                const isLegacyCustom = Boolean(
                  item.custom && item.product.type !== "eau-de-parfum",
                );
                return (
                  <article
                    data-testid={testIds.cart.item}
                    className="cart-item a86-cart-item"
                    key={item.key}
                  >
                    <div className="a86-cart-thumb">
                      {item.custom ? (
                        <Asset id="custom-bottle" />
                      ) : (
                        <Link href={`/shop/${item.product.id}`}>
                          <ProductPhoto
                            product={item.product}
                            selection={products.filter((product) =>
                              item.selection.includes(product.id),
                            )}
                          />
                        </Link>
                      )}
                    </div>
                    <div className="a86-cart-info">
                      <span className="eyebrow">
                        {item.custom
                          ? "PERSONAL ATELIER"
                          : `${item.product.collection.toUpperCase()} COLLECTION`}
                      </span>
                      {item.custom ? (
                        <h3>{item.custom.name}</h3>
                      ) : (
                        <Link href={`/shop/${item.product.id}`}>
                          <h3>{item.product.name}</h3>
                        </Link>
                      )}
                      <p>
                        {item.custom ? "커스텀 오 드 퍼퓸" : item.product.typeName} ·{" "}
                        {item.product.volume}
                      </p>
                      {item.custom ? (
                        <p className="a86-cart-meta">
                          {item.custom.label === "paper"
                            ? "페이퍼"
                            : item.custom.label === "minimal"
                              ? "미니멀"
                              : "클래식"}{" "}
                          라벨 · {Object.keys(item.custom.counts).length}종의 향료
                        </p>
                      ) : null}
                      {item.selection.length > 0 && (
                        <p className="a86-cart-meta">
                          {item.selection
                            .map((id) => products.find((p) => p.id === id)?.typeName)
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      )}
                      {isLegacyCustom && (
                        <p className="a86-cart-warning">
                          이전에 담은 커스텀 제품 유형은 현재 제공하지 않아요. 조향에서 오 드
                          퍼퓸으로 다시 담아 주세요.
                        </p>
                      )}
                      <div className="a86-cart-row-actions">
                        <Quantity
                          disabled={pending}
                          max={MAX_QUANTITY}
                          n={item.quantity}
                          set={(n) => quantity(item.key, n)}
                        />
                        <button
                          type="button"
                          className="a86-cart-remove"
                          onClick={() => quantity(item.key, 0)}
                        >
                          삭제
                        </button>
                      </div>
                    </div>
                    <strong className="a86-cart-item-price">
                      {amount === null || isLegacyCustom
                        ? "확인 필요"
                        : money(amount * item.quantity)}
                    </strong>
                  </article>
                );
              })}
            </div>
            <aside className="order-summary a86-order-summary">
              <h2>주문 예상 금액</h2>
              <dl>
                <div>
                  <dt>상품금액</dt>
                  <dd>{known ? money(subtotal) : "확인 필요"}</dd>
                </div>
                <div>
                  <dt>배송비</dt>
                  <dd>{known ? (delivery === 0 ? "무료" : money(delivery)) : "확인 필요"}</dd>
                </div>
                <div className="a86-coupon-line">
                  <dt>배송비 쿠폰</dt>
                  <dd>{user?.coupon ? "주문 화면에서 선택" : "사용 가능 쿠폰 없음"}</dd>
                </div>
                <div className="total">
                  <dt>예상 결제금액</dt>
                  <dd>{known ? money(subtotal + delivery) : "확인 필요"}</dd>
                </div>
              </dl>
              {known ? (
                <Link className="button" href="/checkout">
                  주문 정보 확인 <Arrow />
                </Link>
              ) : (
                <button className="button" disabled>
                  상품 정보 확인 후 진행
                </button>
              )}
              <p className="micro">쿠폰 혜택은 주문 정보 확인 단계에서 적용돼요.</p>
            </aside>
          </div>
        </>
      )}
    </main>
  );
}
