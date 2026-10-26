"use client";
import Link from "next/link";
import { useState } from "react";
import { ApiError } from "@/lib/api/errors";
import { testIds } from "@/lib/test-ids";
import { useNotify } from "@/components/feedback/notification-provider";
import {
  useAdminInquiries,
  useAdminInquiry,
  useInquiryUpdate,
} from "@/features/admin/hooks/use-admin";
import { useAdminFilters } from "@/features/admin/hooks/use-admin-filters";
import {
  inquiryStatusLabels,
  inquiryStatuses,
  type AdminInquiry,
  type AdminQuery,
  type InquiryStatus,
} from "@/features/admin/model/admin";
import {
  AdminEmpty,
  AdminError,
  AdminHeading,
  AdminHistory,
  AdminLoading,
  AdminPagination,
  adminDate,
} from "@/features/admin/components/admin-feedback";
import styles from "@/features/admin/components/admin.module.css";

function StatusBadge({ status }: { status: InquiryStatus }) {
  return (
    <span className={styles.badge} data-status={status}>
      {inquiryStatusLabels[status]}
    </span>
  );
}

export function AdminInquiryList({ query }: { query: AdminQuery }) {
  const { data, error, isPlaceholderData, refetch } = useAdminInquiries(query);
  const setFilters = useAdminFilters(query);
  return (
    <>
      <AdminHeading
        title="입점 문의"
        description="브랜드 입점 문의를 검토하고 처리 상태와 내부 메모를 기록해요."
      />
      <div className={styles.tabs} role="group" aria-label="처리 상태">
        {[undefined, ...inquiryStatuses].map((status) => (
          <button
            key={status ?? "all"}
            type="button"
            aria-pressed={(query.status ?? undefined) === status}
            onClick={() => setFilters({ status })}
          >
            {status ? inquiryStatusLabels[status] : "전체"}
          </button>
        ))}
      </div>
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
                  <th scope="col">브랜드</th>
                  <th scope="col">제품 유형</th>
                  <th scope="col">상태</th>
                  <th scope="col">접수일시</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((inquiry) => (
                  <tr key={inquiry.id} data-testid={testIds.admin.inquiryRow}>
                    <th scope="row">
                      <Link href={`/admin/inquiries/${encodeURIComponent(inquiry.id)}`}>
                        {inquiry.brand}
                      </Link>
                      <small>담당 {inquiry.name}</small>
                    </th>
                    <td>{inquiry.type}</td>
                    <td>
                      <StatusBadge status={inquiry.status} />
                    </td>
                    <td>{adminDate(inquiry.created)}</td>
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
          title={
            query.status && query.status in inquiryStatusLabels
              ? `'${inquiryStatusLabels[query.status as InquiryStatus]}' 상태의 문의가 없어요.`
              : "접수된 입점 문의가 없어요."
          }
        />
      )}
    </>
  );
}

const inquiryBack = { href: "/admin/inquiries", label: "문의 목록" };
export function AdminInquiryDetail({ id }: { id: string }) {
  const { data, error, refetch } = useAdminInquiry(id);
  if (error || !data) {
    return (
      <>
        <AdminHeading title="입점 문의" back={inquiryBack} />
        {error ? <AdminError error={error} retry={() => refetch()} /> : <AdminLoading rows={6} />}
      </>
    );
  }

  return (
    <>
      <AdminHeading
        title={data.brand}
        description={`${adminDate(data.created)} 접수`}
        back={inquiryBack}
      >
        <StatusBadge status={data.status} />
      </AdminHeading>
      <div className={styles.columns}>
        <section className={styles.panel} aria-labelledby="inquiry-content">
          <h2 id="inquiry-content">문의 내용</h2>
          <dl className={styles.details}>
            <dt>담당자</dt>
            <dd>{data.name}</dd>
            <dt>이메일</dt>
            <dd>
              <a href={`mailto:${data.email}`}>{data.email}</a>
            </dd>
            <dt>웹사이트·SNS</dt>
            <dd>{data.website || "-"}</dd>
            <dt>제품 유형</dt>
            <dd>{data.type}</dd>
            <dt>브랜드 소개</dt>
            <dd className={styles.prose}>{data.introduction}</dd>
            <dt>문의 내용</dt>
            <dd className={styles.prose}>{data.message}</dd>
          </dl>
        </section>
        <div className={styles.stack}>
          <InquiryForm key={data.version} inquiry={data} />
          <AdminHistory entries={data.history} />
        </div>
      </div>
    </>
  );
}

function InquiryForm({ inquiry }: { inquiry: AdminInquiry }) {
  const update = useInquiryUpdate(inquiry.id);
  const notify = useNotify();
  const [status, setStatus] = useState(inquiry.status);
  const [memo, setMemo] = useState(inquiry.memo);
  const [message, setMessage] = useState("");
  const dirty = status !== inquiry.status || memo.trim() !== inquiry.memo;
  return (
    <form
      className={styles.panel}
      data-testid={testIds.admin.inquiryForm}
      aria-labelledby="inquiry-form-title"
      onSubmit={async (event) => {
        event.preventDefault();
        setMessage("");
        try {
          await update.mutateAsync({
            version: inquiry.version,
            ...(status !== inquiry.status ? { status } : {}),
            ...(memo.trim() !== inquiry.memo ? { memo } : {}),
          });
          notify("문의 처리 정보를 저장했어요.");
        } catch (error) {
          setMessage(
            error instanceof ApiError && error.status === 409
              ? "다른 작업으로 정보가 바뀌어 최신 내용을 다시 불러왔어요. 확인 후 다시 저장해 주세요."
              : error instanceof Error
                ? error.message
                : "저장하지 못했어요.",
          );
        }
      }}
    >
      <h2 id="inquiry-form-title">처리 정보</h2>
      <fieldset className={styles.segmented}>
        <legend>처리 상태</legend>
        {inquiryStatuses.map((value) => (
          <label key={value}>
            <input
              type="radio"
              name="status"
              checked={status === value}
              onChange={() => setStatus(value)}
            />
            {inquiryStatusLabels[value]}
          </label>
        ))}
      </fieldset>
      <label className={styles.fieldBlock}>
        <span>내부 메모</span>
        <textarea
          rows={5}
          maxLength={2000}
          value={memo}
          placeholder="연락 내역, 검토 의견 등 운영자만 볼 수 있는 내용"
          onChange={(event) => setMemo(event.target.value)}
        />
        <small className="micro">고객과 공개 API에는 노출되지 않아요. {memo.length}/2000</small>
      </label>
      {message ? (
        <p className={styles.error} role="alert">
          {message}
        </p>
      ) : null}
      <div className={styles.formActions}>
        <button type="submit" className="button" disabled={!dirty || update.isPending}>
          {update.isPending ? "저장 중" : "저장"}
        </button>
      </div>
    </form>
  );
}
