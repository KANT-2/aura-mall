"use client";
import { useState } from "react";
import { ProductImageField } from "@/features/admin/components/product-image-field";
import { AdminFormSection } from "@/features/admin/components/admin-form-section";
import { productDetailLabels } from "@/features/catalog/model/catalog";
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
      <div className={styles.editorColumns}>
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
    isActive: product.isActive ?? true,
    volume: product.volume,
    category: product.category ?? product.typeName,
    notes: (product.notes ?? []).join(", "),
    details: product.details ?? {},
  });
  const [message, setMessage] = useState("");
  const [imagePending, setImagePending] = useState(false);
  const price = form.price.trim() === "" ? null : Number(form.price);
  const changes: Omit<ProductUpdate, "version"> = {};
  for (const field of [
    "name",
    "englishName",
    "description",
    "image",
    "volume",
    "category",
  ] as const) {
    if (form[field].trim() !== (product[field] ?? product.typeName)) {
      changes[field] = form[field].trim();
    }
  }

  if (price !== product.price) {
    changes.price = price;
  }

  for (const field of ["featured", "isNew", "isActive"] as const) {
    if (form[field] !== (product[field] ?? true)) {
      changes[field] = form[field];
    }
  }

  const notes = form.notes
    .split(",")
    .map((note) => note.trim())
    .filter(Boolean);
  if (JSON.stringify(notes) !== JSON.stringify(product.notes ?? [])) {
    changes.notes = notes;
  }

  if (JSON.stringify(form.details) !== JSON.stringify(product.details ?? {})) {
    changes.details = form.details;
  }

  const dirty = Object.keys(changes).length > 0;
  const set = <K extends keyof typeof form>(field: K, next: (typeof form)[K]) =>
    setForm((current) => ({ ...current, [field]: next }));
  return (
    <form
      className={styles.productEditPanel}
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
      <h2 id="product-form-title" className={styles.srOnly}>
        상품 정보
      </h2>
      <AdminFormSection
        number="01"
        title="기본 정보"
        description="상품명과 소개는 고객에게 그대로 표시돼요."
      >
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
            <span>용량</span>
            <input
              required
              maxLength={30}
              value={form.volume}
              onChange={(event) => set("volume", event.target.value)}
            />
          </label>
          <label>
            <span>상품 분류</span>
            <input
              required
              maxLength={50}
              value={form.category}
              onChange={(event) => set("category", event.target.value)}
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
            <small className={styles.help}>이미 접수된 주문의 금액은 바뀌지 않아요.</small>
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
            <span>향 노트 (쉼표로 구분)</span>
            <input
              value={form.notes}
              onChange={(event) => set("notes", event.target.value)}
              placeholder="베르가못, 네롤리, 화이트 머스크"
            />
          </label>
        </div>
      </AdminFormSection>
      <AdminFormSection number="02" title="상품 이미지">
        <ProductImageField
          images={product.imageOptions}
          value={form.image}
          onChange={(url) => set("image", url)}
          onPending={setImagePending}
        />
      </AdminFormSection>
      <AdminFormSection
        number="03"
        title="상세 안내"
        description="제품 정보와 배송·교환 안내를 고객에게 전달해요."
      >
        <details className={styles.advanced}>
          <summary>
            상세 안내 편집{" "}
            <span>{Object.values(form.details).filter((text) => text.trim()).length} / 7 항목</span>
          </summary>
          <div className={styles.fields}>
            {Object.entries(productDetailLabels).map(([key, label]) => (
              <label className={styles.wide} key={key}>
                <span>{label}</span>
                <textarea
                  rows={3}
                  maxLength={5000}
                  value={form.details[key as keyof typeof form.details] ?? ""}
                  onChange={(event) =>
                    set("details", { ...form.details, [key]: event.target.value })
                  }
                  placeholder={`${label} 내용을 입력해 주세요.`}
                />
              </label>
            ))}
          </div>
        </details>
      </AdminFormSection>
      <AdminFormSection number="04" title="판매 설정">
        <fieldset className={styles.toggleList}>
          <legend className={styles.srOnly}>노출 설정</legend>
          <label>
            <span>
              <strong>판매·목록 노출</strong>
              <small>끄면 고객의 상품 목록에서 숨겨져요.</small>
            </span>
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(event) => set("isActive", event.target.checked)}
            />
          </label>
          <label>
            <span>
              <strong>추천 상품</strong>
              <small>추천 상품으로 설정해요.</small>
            </span>
            <input
              type="checkbox"
              checked={form.featured}
              onChange={(event) => set("featured", event.target.checked)}
            />
          </label>
          <label>
            <span>
              <strong>신상품 표시</strong>
              <small>상품에 신상품 배지를 표시해요.</small>
            </span>
            <input
              type="checkbox"
              checked={form.isNew}
              onChange={(event) => set("isNew", event.target.checked)}
            />
          </label>
        </fieldset>
      </AdminFormSection>
      {message ? (
        <p className={styles.error} role="alert">
          {message}
        </p>
      ) : null}
      <div className={styles.productSave}>
        <button
          type="submit"
          className="button"
          disabled={!dirty || update.isPending || imagePending}
        >
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
