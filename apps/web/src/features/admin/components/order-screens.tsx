"use client";
import Link from "next/link";
import { useState } from "react";
import { money } from "@/lib/format";
import { testIds } from "@/lib/test-ids";
import { useAdminOrder, useAdminOrders } from "@/features/admin/hooks/use-admin";
import { useAdminFilters } from "@/features/admin/hooks/use-admin-filters";
import { isDateInput, type AdminQuery } from "@/features/admin/model/admin";
import {
  AdminEmpty,
  AdminError,
  AdminHeading,
  AdminLoading,
  AdminPagination,
  adminDate,
} from "@/features/admin/components/admin-feedback";
import styles from "@/features/admin/components/admin.module.css";

export function AdminOrderList({ query }: { query: AdminQuery }) {
  const { data, error, isPlaceholderData, refetch } = useAdminOrders(query);
  const setFilters = useAdminFilters(query);
  const [range, setRange] = useState({ from: query.from ?? "", to: query.to ?? "" });
  const [message, setMessage] = useState("");
  const filtered = Boolean(query.from || query.to);
  return (
    <>
      <AdminHeading
        title="주문 조회"
        description="주문 당시 상품명·가격 스냅샷 기준으로 조회해요. 상태 변경은 정책 확정 후 제공돼요."
      />
      <form
        className={styles.filters}
        onSubmit={(event) => {
          event.preventDefault();
          if (range.from && range.to && range.from > range.to) {
            setMessage("시작일이 종료일보다 늦어요.");
            return;
          }

          setMessage("");
          setFilters({
            from: isDateInput(range.from) ? range.from : undefined,
            to: isDateInput(range.to) ? range.to : undefined,
          });
        }}
      >
        <label>
          <span>시작일</span>
          <input
            type="date"
            value={range.from}
            onChange={(event) => setRange((current) => ({ ...current, from: event.target.value }))}
          />
        </label>
        <label>
          <span>종료일</span>
          <input
            type="date"
            value={range.to}
            onChange={(event) => setRange((current) => ({ ...current, to: event.target.value }))}
          />
        </label>
        <button type="submit" className="button">
          조회
        </button>
        {filtered ? (
          <button
            type="button"
            className="text-link"
            onClick={() => {
              setRange({ from: "", to: "" });
              setFilters({ from: undefined, to: undefined });
            }}
          >
            기간 초기화
          </button>
        ) : null}
      </form>
      {message ? (
        <p className={styles.error} role="alert">
          {message}
        </p>
      ) : null}
      {error ? (
        <AdminError error={error} retry={() => refetch()} />
      ) : !data ? (
        <AdminLoading />
      ) : data.items.length ? (
        <>
          <p className={styles.count} aria-live="polite">
            총 {data.total}건
          </p>
          <div className={styles.tableWrap} aria-busy={isPlaceholderData}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">주문</th>
                  <th scope="col">주문일시</th>
                  <th scope="col">주문자</th>
                  <th scope="col">수량</th>
                  <th scope="col">결제 금액</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((order) => (
                  <tr key={order.id} data-testid={testIds.admin.orderRow}>
                    <th scope="row">
                      <Link href={`/admin/orders/${encodeURIComponent(order.id)}`}>
                        {order.title}
                      </Link>
                      <small>{order.id.slice(0, 8)}</small>
                    </th>
                    <td>{adminDate(order.created)}</td>
                    <td>{order.customer?.name ?? "비회원"}</td>
                    <td>{order.itemCount}개</td>
                    <td>{money(order.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <AdminPagination
            page={data.page}
            pageSize={data.pageSize}
            total={data.total}
            onPage={(page) => setFilters({ ...query, page: String(page) })}
          />
        </>
      ) : (
        <AdminEmpty
          title={filtered ? "선택한 기간의 주문이 없어요." : "아직 접수된 주문이 없어요."}
        >
          {filtered ? null : "결제 연결 전에는 실제 주문이 생성되지 않을 수 있어요."}
        </AdminEmpty>
      )}
    </>
  );
}

const orderBack = { href: "/admin/orders", label: "주문 목록" };
export function AdminOrderDetail({ id }: { id: string }) {
  const { data, error, refetch } = useAdminOrder(id);
  if (error || !data) {
    return (
      <>
        <AdminHeading title="주문 상세" back={orderBack} />
        {error ? <AdminError error={error} retry={() => refetch()} /> : <AdminLoading rows={6} />}
      </>
    );
  }

  return (
    <>
      <AdminHeading title="주문 상세" description={`주문번호 ${data.id}`} back={orderBack} />
      <div className={styles.columns}>
        <section className={styles.panel} aria-labelledby="order-items">
          <h2 id="order-items">주문 상품</h2>
          <p className="micro">
            주문 당시 저장된 상품 정보와 단가예요. 현재 상품 가격과 다를 수 있어요.
          </p>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">상품</th>
                  <th scope="col">단가</th>
                  <th scope="col">수량</th>
                  <th scope="col">금액</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item, index) => (
                  <tr key={`${item.productId}-${index}`}>
                    <th scope="row">
                      {item.name}
                      <small>
                        {item.typeName} · {item.volume}
                        {item.option ? ` · ${item.option}` : ""}
                      </small>
                    </th>
                    <td>{money(item.unitPrice)}</td>
                    <td>{item.quantity}</td>
                    <td>{item.unitPrice === null ? "-" : money(item.unitPrice * item.quantity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={styles.total}>
            결제 금액 <strong>{money(data.total)}</strong>
          </p>
        </section>
        <section className={styles.panel} aria-labelledby="order-info">
          <h2 id="order-info">주문 정보</h2>
          <dl className={styles.details}>
            <dt>주문일시</dt>
            <dd>{adminDate(data.created)}</dd>
            <dt>주문자</dt>
            <dd>{data.customer ? `${data.customer.name} (${data.customer.email})` : "비회원"}</dd>
            <dt>받는 분</dt>
            <dd>{data.recipient}</dd>
            <dt>배송지</dt>
            <dd>{data.address}</dd>
          </dl>
        </section>
      </div>
    </>
  );
}
