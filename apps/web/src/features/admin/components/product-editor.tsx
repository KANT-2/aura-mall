/* eslint-disable @next/next/no-img-element */
"use client";
import { useState } from "react";
import { ApiError } from "@/lib/api/errors";
import { money } from "@/lib/format";
import { testIds } from "@/lib/test-ids";
import { useNotify } from "@/components/feedback/notification-provider";
import { useAdminProduct, useProductCommands } from "@/features/admin/hooks/use-admin";
import {
  MAX_STOCK,
  type AdminProductDetail,
  type ProductUpdate,
} from "@/features/admin/model/admin";
import {
  AdminError,
  AdminHeading,
  AdminHistory,
  AdminLoading,
} from "@/features/admin/components/admin-feedback";
import styles from "@/features/admin/components/admin.module.css";

const back = { href: "/admin/products", label: "상품 목록" };
function failureMessage(error: unknown) {
  if (error instanceof ApiError && error.status === 409) {
    return "다른 작업으로 정보가 바뀌어 최신 내용을 다시 불러왔어요. 확인 후 다시 저장해 주세요.";
  }

  return error instanceof Error ? error.message : "저장하지 못했어요.";
}

export function AdminProductEditor({ id }: { id: string }) {
  const { data, error, refetch } = useAdminProduct(id);
  if (!data && !error) {
    return (
      <>
        <AdminHeading title="상품 정보" back={back} />
        <AdminLoading rows={8} />
      </>
    );
  }

  if (error || !data) {
    return (
      <>
        <AdminHeading title="상품 정보" back={back} />
        <AdminError error={error} retry={() => refetch()} />
      </>
    );
  }

  return (
    <>
      <AdminHeading
        title={data.name}
        description={`${data.id} · ${data.collection.toUpperCase()} · ${data.typeName} · ${data.volume}`}
        back={back}
      />
      <div className={styles.columns}>
        {/* Remount on each saved version so forms always start from the latest server data. */}
        <ProductForm key={`product-${data.version}`} product={data} />
        <div className={styles.stack}>
          <StockForm key={`stock-${data.version}`} product={data} />
          <AdminHistory entries={data.history} />
        </div>
      </div>
    </>
  );
}

function ProductForm({ product }: { product: AdminProductDetail }) {
  const { update } = useProductCommands(product.id);
  const notify = useNotify();
  const [form, setForm] = useState({
    name: product.name,
    englishName: product.englishName,
    description: product.description,
    price: product.price === null ? "" : String(product.price),
    image: product.image,
    featured: product.featured,
    isNew: product.isNew,
  });
  const [message, setMessage] = useState("");
  const price = form.price.trim() === "" ? null : Number(form.price);
  const changes: Omit<ProductUpdate, "version"> = {};
  for (const field of ["name", "englishName", "description", "image"] as const) {
    if (form[field].trim() !== product[field]) {
      changes[field] = form[field].trim();
    }
  }

  if (price !== product.price) {
    changes.price = price;
  }

  for (const field of ["featured", "isNew"] as const) {
    if (form[field] !== product[field]) {
      changes[field] = form[field];
    }
  }

  const dirty = Object.keys(changes).length > 0;
  const set = <K extends keyof typeof form>(field: K, next: (typeof form)[K]) =>
    setForm((current) => ({ ...current, [field]: next }));
  return (
    <form
      className={styles.panel}
      data-testid={testIds.admin.productForm}
      aria-labelledby="product-form-title"
      onSubmit={async (event) => {
        event.preventDefault();
        setMessage("");
        if (price !== null && (!Number.isInteger(price) || price < 0 || price > 10_000_000)) {
          setMessage("가격은 0원 이상 1,000만 원 이하의 정수로 입력해 주세요.");
          return;
        }

        if (
          changes.price !== undefined &&
          !window.confirm(
            `가격을 ${money(product.price)}에서 ${money(price)}(으)로 변경할까요?\n이미 접수된 주문 금액은 바뀌지 않아요.`,
          )
        ) {
          return;
        }

        try {
          await update.mutateAsync({ ...changes, version: product.version });
          notify("상품 정보를 저장했어요.");
        } catch (error) {
          setMessage(failureMessage(error));
        }
      }}
    >
      <h2 id="product-form-title">상품 정보</h2>
      <div className={styles.fields}>
        <label>
          <span>상품명</span>
          <input
            required
            maxLength={100}
            value={form.name}
            onChange={(event) => set("name", event.target.value)}
          />
        </label>
        <label>
          <span>영문명</span>
          <input
            required
            maxLength={100}
            value={form.englishName}
            onChange={(event) => set("englishName", event.target.value)}
          />
        </label>
        <label>
          <span>판매가(원)</span>
          <input
            inputMode="numeric"
            type="number"
            min={0}
            max={10_000_000}
            step={1}
            value={form.price}
            placeholder="비워 두면 가격 미정"
            onChange={(event) => set("price", event.target.value)}
          />
        </label>
        <label className={styles.wide}>
          <span>설명</span>
          <textarea
            required
            rows={4}
            maxLength={1000}
            value={form.description}
            onChange={(event) => set("description", event.target.value)}
          />
        </label>
        <label className={styles.wide}>
          <span>대표 이미지</span>
          <select value={form.image} onChange={(event) => set("image", event.target.value)}>
            {product.imageOptions.map((image) => (
              <option key={image} value={image}>
                {image.replace(/^\/assets\/products\//, "")}
              </option>
            ))}
          </select>
        </label>
        <img className={styles.preview} src={form.image} alt="선택한 대표 이미지 미리보기" />
        <fieldset className={styles.checks}>
          <legend>노출 설정</legend>
          <label>
            <input
              type="checkbox"
              checked={form.featured}
              onChange={(event) => set("featured", event.target.checked)}
            />
            추천 상품
          </label>
          <label>
            <input
              type="checkbox"
              checked={form.isNew}
              onChange={(event) => set("isNew", event.target.checked)}
            />
            신상품 표시
          </label>
        </fieldset>
      </div>
      {message ? (
        <p className={styles.error} role="alert">
          {message}
        </p>
      ) : null}
      <div className={styles.formActions}>
        <button type="submit" className="button" disabled={!dirty || update.isPending}>
          {update.isPending ? "저장 중" : "변경 저장"}
        </button>
        <span className="micro">
          {dirty ? "저장하지 않은 변경이 있어요." : `버전 ${product.version} · 변경 사항 없음`}
        </span>
      </div>
    </form>
  );
}

function StockForm({ product }: { product: AdminProductDetail }) {
  const { stock } = useProductCommands(product.id);
  const notify = useNotify();
  const [direction, setDirection] = useState<"in" | "out">("in");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  // One key per intended adjustment: a resend after a lost response is not applied twice.
  const [key, setKey] = useState(() => crypto.randomUUID());
  const quantity = Number(amount);
  const valid = Number.isInteger(quantity) && quantity > 0;
  const delta = direction === "in" ? quantity : -quantity;
  const after = product.stock + (valid ? delta : 0);
  const invalidAfter = after < 0 || after > MAX_STOCK;
  return (
    <form
      className={styles.panel}
      data-testid={testIds.admin.stockForm}
      aria-labelledby="stock-form-title"
      onSubmit={async (event) => {
        event.preventDefault();
        setMessage("");
        if (!valid || invalidAfter || !reason.trim()) {
          setMessage("수량과 사유를 확인해 주세요. 조정 후 재고는 0개 이상이어야 해요.");
          return;
        }

        try {
          await stock.mutateAsync({ version: product.version, delta, reason: reason.trim(), key });
          notify(`재고를 ${after.toLocaleString("ko-KR")}개로 조정했어요.`);
        } catch (error) {
          if (error instanceof ApiError && error.status < 500) {
            setKey(crypto.randomUUID());
          }

          setMessage(failureMessage(error));
        }
      }}
    >
      <h2 id="stock-form-title">재고 조정</h2>
      <p className={styles.stock}>
        현재 재고 <strong>{product.stock.toLocaleString("ko-KR")}개</strong>
        {valid ? (
          <>
            {" "}
            → 조정 후{" "}
            <strong className={invalidAfter ? styles.alert : undefined}>
              {after.toLocaleString("ko-KR")}개
            </strong>
          </>
        ) : null}
      </p>
      <div className={styles.fields}>
        <fieldset className={styles.segmented}>
          <legend>구분</legend>
          <label>
            <input
              type="radio"
              name="direction"
              checked={direction === "in"}
              onChange={() => setDirection("in")}
            />
            입고 (+)
          </label>
          <label>
            <input
              type="radio"
              name="direction"
              checked={direction === "out"}
              onChange={() => setDirection("out")}
            />
            출고·차감 (−)
          </label>
        </fieldset>
        <label>
          <span>수량</span>
          <input
            required
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_STOCK}
            step={1}
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
        </label>
        <label className={styles.wide}>
          <span>사유</span>
          <input
            required
            maxLength={200}
            value={reason}
            placeholder="예: 정기 입고, 파손 폐기, 실사 차이 보정"
            onChange={(event) => setReason(event.target.value)}
          />
        </label>
      </div>
      {message ? (
        <p className={styles.error} role="alert">
          {message}
        </p>
      ) : null}
      <div className={styles.formActions}>
        <button type="submit" className="button" disabled={stock.isPending}>
          {stock.isPending ? "조정 중" : "재고 조정"}
        </button>
      </div>
    </form>
  );
}
