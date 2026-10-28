"use client";
import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useCatalog } from "@/features/catalog/hooks/use-catalog";
import { request } from "@/lib/api/client";
import type { AdminProductDetail } from "@/features/admin/model/admin";
import { ProductImageField } from "@/features/admin/components/product-image-field";
import { AdminFormSection } from "@/features/admin/components/admin-form-section";
import Link from "next/link";
import { AdminHeading } from "@/features/admin/components/admin-feedback";
import styles from "@/features/admin/components/admin.module.css";
export function ProductCreate() {
  const catalog = useCatalog();
  const router = useRouter();
  const client = useQueryClient();
  const generated = useRef("");
  const [image, setImage] = useState(catalog.products[0]?.image ?? "");
  const [uploading, setUploading] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    generated.current ||= `product-${crypto.randomUUID().slice(0, 18)}`;
    setPending(true);
    setError("");
    try {
      const product = await request<AdminProductDetail>("/admin/products", {
        method: "POST",
        body: JSON.stringify({
          id: form.get("id") || generated.current,
          collection: form.get("collection"),
          type: form.get("type"),
          name: form.get("name"),
          englishName: form.get("englishName"),
          volume: form.get("volume"),
          category: form.get("category"),
          description: form.get("description"),
          price: form.get("price") === "" ? null : Number(form.get("price")),
          stock: Number(form.get("stock")),
          image,
          notes: String(form.get("notes"))
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean),
          isActive: form.get("isActive") === "on",
          isNew: form.get("isNew") === "on",
          featured: form.get("featured") === "on",
        }),
      });
      await Promise.all([
        client.invalidateQueries({ queryKey: ["admin"] }),
        client.invalidateQueries({ queryKey: ["catalog"] }),
      ]);
      router.push(`/admin/products/${encodeURIComponent(product.id)}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "상품을 등록하지 못했어요.");
    } finally {
      setPending(false);
    }
  };
  return (
    <>
      <AdminHeading
        title="상품 등록"
        description="기본 정보와 이미지를 준비하고 판매 여부를 선택해 주세요."
        back={{ href: "/admin/products", label: "상품 목록" }}
      />
      <form className={styles.editorForm} onSubmit={submit} aria-busy={pending}>
        <div className={styles.editorBody}>
          <AdminFormSection
            number="01"
            title="기본 정보"
            description="고객에게 보여줄 상품의 이름과 구성을 입력해요."
          >
            <div className={styles.fields}>
              <label>
                <span>
                  상품명 <em aria-hidden="true">필수</em>
                </span>
                <input name="name" required maxLength={100} placeholder="예: 베르가못 핸드크림" />
              </label>
              <label>
                <span>
                  영문명 <em aria-hidden="true">필수</em>
                </span>
                <input
                  name="englishName"
                  required
                  maxLength={100}
                  placeholder="예: Bergamot Hand Cream"
                />
              </label>
              <label>
                <span>
                  컬렉션 <em aria-hidden="true">필수</em>
                </span>
                <select name="collection" required>
                  {catalog.collections.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>
                  제품 유형 <em aria-hidden="true">필수</em>
                </span>
                <select name="type" required>
                  {catalog.types.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>
                  용량 <em aria-hidden="true">필수</em>
                </span>
                <input name="volume" required maxLength={30} placeholder="예: 50mL" />
              </label>
              <label>
                <span>
                  상품 분류 <em aria-hidden="true">필수</em>
                </span>
                <input name="category" required maxLength={50} placeholder="예: 향수, 바디 케어" />
              </label>
              <label className={styles.wide}>
                <span>
                  상품 소개 <em aria-hidden="true">필수</em>
                </span>
                <textarea
                  name="description"
                  required
                  maxLength={1000}
                  rows={4}
                  placeholder="이 상품의 향과 매력을 소개해 주세요."
                />
              </label>
              <label className={styles.wide}>
                <span>향 노트</span>
                <input name="notes" placeholder="예: 베르가못, 네롤리, 화이트 머스크" />
                <small className={styles.help}>각 노트를 쉼표로 구분해 주세요.</small>
              </label>
            </div>
          </AdminFormSection>
          <AdminFormSection
            number="02"
            title="상품 이미지"
            description="상품을 가장 잘 보여주는 대표 사진을 선택해요."
          >
            <ProductImageField
              images={catalog.products.map((product) => product.image)}
              value={image}
              onChange={setImage}
              onPending={setUploading}
            />
          </AdminFormSection>
          <AdminFormSection
            number="03"
            title="가격과 재고"
            description="등록 후에도 상품 상세에서 수정할 수 있어요."
          >
            <div className={styles.fields}>
              <label>
                <span>판매가(원)</span>
                <input name="price" type="number" min={0} max={10000000} placeholder="예: 28000" />
                <small className={styles.help}>비워 두면 가격 미정으로 표시돼요.</small>
              </label>
              <label>
                <span>
                  초기 재고 <em aria-hidden="true">필수</em>
                </span>
                <input name="stock" type="number" min={0} max={99999} required defaultValue={0} />
                <small className={styles.help}>재고가 0이면 주문할 수 없어요.</small>
              </label>
            </div>
          </AdminFormSection>
          <AdminFormSection number="04" title="판매 설정">
            <fieldset className={styles.toggleList}>
              <legend className={styles.srOnly}>노출 설정</legend>
              <label>
                <span>
                  <strong>판매·목록 노출</strong>
                  <small>켜면 상품 목록에 표시되고 주문을 받을 수 있어요.</small>
                </span>
                <input type="checkbox" name="isActive" />
              </label>
              <label>
                <span>
                  <strong>신상품 표시</strong>
                  <small>상품에 신상품 배지를 표시해요.</small>
                </span>
                <input type="checkbox" name="isNew" />
              </label>
              <label>
                <span>
                  <strong>추천 상품</strong>
                  <small>추천 상품으로 설정해요.</small>
                </span>
                <input type="checkbox" name="featured" />
              </label>
            </fieldset>
            <details className={styles.advanced}>
              <summary>상품 ID 직접 지정</summary>
              <label>
                <span>상품 ID</span>
                <input
                  name="id"
                  maxLength={50}
                  pattern="[a-z0-9]+(-[a-z0-9]+)*"
                  placeholder="비워 두면 자동 생성"
                />
                <small className={styles.help}>
                  영문 소문자·숫자·하이픈을 사용할 수 있어요. 등록 후 변경할 수 없어요.
                </small>
              </label>
            </details>
          </AdminFormSection>
        </div>
        <aside className={styles.editorAside}>
          <div className={styles.asideCard}>
            <span className={styles.eyebrow}>NEW PRODUCT</span>
            <h2>새로운 향의 시작</h2>
            <p>등록 후 상세 안내를 추가하고, 판매 노출을 조정할 수 있어요.</p>
            <ol className={styles.checklist}>
              <li>이름·컬렉션·유형 확인</li>
              <li>대표 이미지 선택</li>
              <li>판매가·재고 확인</li>
              <li>판매 여부 선택</li>
            </ol>
          </div>
        </aside>
        <div className={styles.editorActions}>
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          <p className={styles.help}>판매 노출을 끄면 관리자 화면에만 보관돼요.</p>
          <div>
            <Link className={styles.secondaryButton} href="/admin/products">
              취소
            </Link>
            <button className="button" disabled={pending || uploading || !image}>
              {pending ? "등록 중…" : uploading ? "이미지 업로드 중…" : "상품 등록"}
            </button>
          </div>
        </div>
      </form>
    </>
  );
}
