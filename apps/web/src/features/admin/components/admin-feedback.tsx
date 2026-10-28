"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { ApiError } from "@/lib/api/errors";
import { money } from "@/lib/format";
import type { AdminHistoryEntry } from "@/features/admin/model/admin";
import styles from "@/features/admin/components/admin.module.css";

export const adminDate = (value: string | null) =>
  value && !Number.isNaN(Date.parse(value))
    ? new Date(value).toLocaleString("ko-KR", {
        timeZone: "Asia/Seoul",
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "-";

export function AdminHeading({
  title,
  description,
  back,
  children,
}: {
  title: string;
  description?: string;
  back?: { href: string; label: string };
  children?: ReactNode;
}) {
  return (
    <div className={styles.heading}>
      <div>
        {back ? (
          <Link className={styles.back} href={back.href}>
            ← {back.label}
          </Link>
        ) : null}
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {children}
    </div>
  );
}

export function AdminLoading({ rows = 5 }: { rows?: number }) {
  return (
    <div className={styles.loading} aria-busy="true">
      <p role="status" className={styles.srOnly}>
        정보를 불러오고 있어요.
      </p>
      {Array.from({ length: rows }, (_, index) => (
        <span key={index} className={styles.skeleton} />
      ))}
    </div>
  );
}

export function AdminEmpty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className={styles.empty}>
      <strong>{title}</strong>
      {children ? <p>{children}</p> : null}
    </div>
  );
}

/** 401/403 also refresh the account, so the shell replaces this with the access screen. */
export function AdminError({ error, retry }: { error: unknown; retry?: () => void }) {
  const status = error instanceof ApiError ? error.status : 0;
  const message =
    status === 401
      ? "로그인이 만료되었어요. 다시 로그인해 주세요."
      : status === 403
        ? "관리자 권한이 없어요."
        : status === 404
          ? "요청한 정보를 찾을 수 없어요."
          : error instanceof Error
            ? error.message
            : "정보를 불러오지 못했어요.";
  return (
    <div className={styles.empty} role="alert">
      <strong>{message}</strong>
      {retry && status !== 401 && status !== 403 && status !== 404 ? (
        <button type="button" className="text-link" onClick={retry}>
          다시 시도
        </button>
      ) : null}
    </div>
  );
}

export function AdminPagination({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const last = Math.max(1, Math.ceil(total / pageSize));
  if (last === 1) {
    return null;
  }

  return (
    <nav className={styles.pagination} aria-label="페이지 이동">
      <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        이전
      </button>
      <span aria-current="page">
        {page} / {last}
      </span>
      <button type="button" disabled={page >= last} onClick={() => onPage(page + 1)}>
        다음
      </button>
    </nav>
  );
}

const fieldLabels: Record<string, string> = {
  product: "상품 등록",
  isActive: "판매 노출",
  details: "상세 안내",
  notes: "향 노트",
  volume: "용량",
  category: "상품 분류",
  name: "상품명",
  englishName: "영문명",
  description: "설명",
  price: "가격",
  image: "이미지",
  featured: "추천 노출",
  isNew: "신상품 표시",
  stock: "재고",
  status: "처리 상태",
  memo: "내부 메모",
};

function value(field: string, input: unknown) {
  if (input === null) {
    return "미정";
  }

  if (typeof input === "boolean") {
    return input ? "사용" : "사용 안 함";
  }

  if (field === "price" && typeof input === "number") {
    return money(input);
  }

  if (Array.isArray(input)) {
    return input.length ? input.join(" · ") : "없음";
  }

  if (typeof input === "object") {
    const object = input as Record<string, unknown>;
    if (field === "product") {
      return typeof object.name === "string" ? object.name : "등록 완료";
    }

    if (field === "details") {
      const count = Object.values(object).filter(
        (text) => typeof text === "string" && text.trim(),
      ).length;
      return count ? `${count}개 항목` : "미등록";
    }

    return "변경됨";
  }

  return String(input);
}

export function AdminHistory({ entries }: { entries: AdminHistoryEntry[] }) {
  return (
    <section className={styles.panel} aria-labelledby="admin-history">
      <h2 id="admin-history">변경 이력</h2>
      {entries.length ? (
        <ol className={styles.history}>
          {entries.map((entry) => (
            <li key={entry.id}>
              <span>
                {adminDate(entry.created)} · {entry.actor}
              </span>
              <strong className={styles.historyAction}>
                {entry.action === "product.create"
                  ? "상품 등록"
                  : entry.action === "product.stock"
                    ? "재고 조정"
                    : entry.action === "product.update"
                      ? "상품 정보 수정"
                      : "입점 문의 처리"}
              </strong>
              {entry.changes.map((change) => (
                <p key={change.field}>
                  <strong>{fieldLabels[change.field] ?? change.field}</strong>{" "}
                  {change.field === "memo"
                    ? "수정"
                    : `${value(change.field, change.from)} → ${value(change.field, change.to)}`}
                </p>
              ))}
              {entry.reason ? <p>사유: {entry.reason}</p> : null}
            </li>
          ))}
        </ol>
      ) : (
        <p className="micro">아직 변경 이력이 없어요.</p>
      )}
    </section>
  );
}
