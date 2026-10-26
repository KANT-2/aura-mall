"use client";
import Link from "next/link";
import { useState } from "react";
import { money } from "@/lib/format";
import { testIds } from "@/lib/test-ids";
import { useCatalog } from "@/features/catalog/hooks/use-catalog";
import { useAdminProducts } from "@/features/admin/hooks/use-admin";
import { useAdminFilters } from "@/features/admin/hooks/use-admin-filters";
import { LOW_STOCK, adminPageNumber, type AdminQuery } from "@/features/admin/model/admin";
import {
  AdminEmpty,
  AdminError,
  AdminHeading,
  AdminLoading,
  AdminPagination,
} from "@/features/admin/components/admin-feedback";
import styles from "@/features/admin/components/admin.module.css";

export function AdminProductList({ query }: { query: AdminQuery }) {
  const { collections } = useCatalog();
  const { data, error, isPlaceholderData, refetch } = useAdminProducts(query);
  const setFilters = useAdminFilters(query);
  const [search, setSearch] = useState(query.q ?? "");
  return (
    <>
      <AdminHeading
        title="상품·재고"
        description="기존 상품의 정보와 가격을 수정하고, 사유를 남겨 재고를 조정해요."
      />
      <form
        className={styles.filters}
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          setFilters({ q: search.trim() || undefined });
        }}
      >
        <label>
          <span>검색</span>
          <input
            type="search"
            value={search}
            maxLength={100}
            placeholder="상품명·영문명·ID"
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <label>
          <span>컬렉션</span>
          <select
            value={query.collection ?? ""}
            onChange={(event) => setFilters({ collection: event.target.value || undefined })}
          >
            <option value="">전체</option>
            {collections.map((collection) => (
              <option key={collection.id} value={collection.id}>
                {collection.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>재고</span>
          <select
            value={query.stock ?? ""}
            onChange={(event) => setFilters({ stock: event.target.value || undefined })}
          >
            <option value="">전체</option>
            <option value="low">{LOW_STOCK}개 이하</option>
            <option value="out">품절</option>
          </select>
        </label>
        <button type="submit" className="button">
          검색
        </button>
      </form>
      {error ? (
        <AdminError error={error} retry={() => refetch()} />
      ) : !data ? (
        <AdminLoading />
      ) : data.items.length ? (
        <>
          <p className={styles.count} aria-live="polite">
            총 {data.total}개 상품
          </p>
          <div className={styles.tableWrap} aria-busy={isPlaceholderData}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">상품</th>
                  <th scope="col">컬렉션</th>
                  <th scope="col">가격</th>
                  <th scope="col">재고</th>
                  <th scope="col">최근 수정</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((product) => (
                  <tr key={product.id} data-testid={testIds.admin.productRow}>
                    <th scope="row">
                      <Link href={`/admin/products/${encodeURIComponent(product.id)}`}>
                        {product.name}
                      </Link>
                      <small>
                        {product.typeName} · {product.volume}
                      </small>
                    </th>
                    <td>{product.collection.toUpperCase()}</td>
                    <td>{money(product.price)}</td>
                    <td className={product.stock <= LOW_STOCK ? styles.alert : undefined}>
                      {product.stock ? `${product.stock.toLocaleString("ko-KR")}개` : "품절"}
                    </td>
                    <td>{product.updated ? product.updated.slice(0, 10) : "-"}</td>
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
        <AdminEmpty title="조건에 맞는 상품이 없어요.">
          {query.q || query.collection || query.stock ? (
            <button
              type="button"
              className="text-link"
              onClick={() => {
                setSearch("");
                setFilters({ q: undefined, collection: undefined, stock: undefined });
              }}
            >
              필터 초기화
            </button>
          ) : null}
        </AdminEmpty>
      )}
      {adminPageNumber(query.page) > 1 && data && !data.items.length ? (
        <button type="button" className="text-link" onClick={() => setFilters({})}>
          첫 페이지로
        </button>
      ) : null}
    </>
  );
}
