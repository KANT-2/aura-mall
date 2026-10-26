"use client";
import Link from "next/link";
import { money } from "@/lib/format";
import { useAdminOverview } from "@/features/admin/hooks/use-admin";
import { inquiryStatusLabels, inquiryStatuses, LOW_STOCK } from "@/features/admin/model/admin";
import {
  AdminEmpty,
  AdminError,
  AdminHeading,
  AdminLoading,
  adminDate,
} from "@/features/admin/components/admin-feedback";
import styles from "@/features/admin/components/admin.module.css";

export function AdminOverviewScreen() {
  const { data, error, refetch } = useAdminOverview();
  return (
    <>
      <AdminHeading
        title="운영 요약"
        description="저장된 주문·입점 문의·재고 데이터를 기준으로 집계해요."
      />
      {error ? (
        <AdminError error={error} retry={() => refetch()} />
      ) : !data ? (
        <AdminLoading rows={6} />
      ) : (
        <>
          <dl className={styles.stats}>
            <div>
              <dt>최근 7일 주문</dt>
              <dd>{data.orders.recent.toLocaleString("ko-KR")}건</dd>
              <small>누적 {data.orders.total.toLocaleString("ko-KR")}건</small>
            </div>
            <div>
              <dt>최근 7일 주문 금액</dt>
              <dd>{money(data.orders.recentRevenue)}</dd>
              <small>배송비 포함 주문 합계</small>
            </div>
            <div>
              <dt>처리 대기 문의</dt>
              <dd>
                {(data.inquiries.received + data.inquiries.reviewing).toLocaleString("ko-KR")}건
              </dd>
              <small>
                {inquiryStatuses
                  .map((status) => `${inquiryStatusLabels[status]} ${data.inquiries[status]}`)
                  .join(" · ")}
              </small>
            </div>
            <div>
              <dt>재고 확인 필요</dt>
              <dd>{(data.products.lowStock + data.products.soldOut).toLocaleString("ko-KR")}종</dd>
              <small>
                품절 {data.products.soldOut} · {LOW_STOCK}개 이하 {data.products.lowStock} / 전체{" "}
                {data.products.total}종
              </small>
            </div>
          </dl>
          <div className={styles.columns}>
            <section className={styles.panel} aria-labelledby="overview-orders">
              <div className={styles.panelHeading}>
                <h2 id="overview-orders">최근 주문</h2>
                <Link href="/admin/orders">전체 보기</Link>
              </div>
              {data.recentOrders.length ? (
                <ul className={styles.list}>
                  {data.recentOrders.map((order) => (
                    <li key={order.id}>
                      <Link href={`/admin/orders/${encodeURIComponent(order.id)}`}>
                        <strong>{order.title}</strong>
                        <span>
                          {adminDate(order.created)} · {money(order.total)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <AdminEmpty title="아직 접수된 주문이 없어요.">
                  결제 연결 전에는 실제 주문이 생성되지 않을 수 있어요.
                </AdminEmpty>
              )}
            </section>
            <section className={styles.panel} aria-labelledby="overview-inquiries">
              <div className={styles.panelHeading}>
                <h2 id="overview-inquiries">최근 입점 문의</h2>
                <Link href="/admin/inquiries">전체 보기</Link>
              </div>
              {data.recentInquiries.length ? (
                <ul className={styles.list}>
                  {data.recentInquiries.map((inquiry) => (
                    <li key={inquiry.id}>
                      <Link href={`/admin/inquiries/${encodeURIComponent(inquiry.id)}`}>
                        <strong>{inquiry.brand}</strong>
                        <span>
                          {inquiryStatusLabels[inquiry.status]} · {adminDate(inquiry.created)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <AdminEmpty title="접수된 입점 문의가 없어요." />
              )}
            </section>
            <section className={styles.panel} aria-labelledby="overview-stock">
              <div className={styles.panelHeading}>
                <h2 id="overview-stock">재고 확인 필요</h2>
                <Link href="/admin/products?stock=low">전체 보기</Link>
              </div>
              {data.lowStockProducts.length ? (
                <ul className={styles.list}>
                  {data.lowStockProducts.map((product) => (
                    <li key={product.id}>
                      <Link href={`/admin/products/${encodeURIComponent(product.id)}`}>
                        <strong>{product.name}</strong>
                        <span className={product.stock ? undefined : styles.alert}>
                          {product.stock ? `재고 ${product.stock}개` : "품절"}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <AdminEmpty title={`재고가 ${LOW_STOCK}개 이하인 상품이 없어요.`} />
              )}
            </section>
          </div>
        </>
      )}
    </>
  );
}
