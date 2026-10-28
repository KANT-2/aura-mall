"use client";
import Link from "next/link";
import { useId, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAccount } from "@/features/account/hooks/use-account";
import { useNotify } from "@/components/feedback/notification-provider";
import type { ProductQuestion, QuestionPage } from "@/features/questions/model/question";
import { request } from "@/lib/api/client";
import styles from "@/features/questions/components/questions.module.css";

const errorText = (error: unknown) =>
  error instanceof TypeError
    ? "연결이 잠시 끊겼어요. 잠시 후 다시 시도해 주세요."
    : error instanceof Error
      ? error.message
      : "문의를 처리하지 못했어요.";

function QuestionForm({
  productId,
  question,
  owner,
  done,
}: {
  productId: string;
  question?: ProductQuestion;
  owner: string;
  done: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const notify = useNotify();
  const id = useId();
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError("");
    try {
      await request(
        question
          ? `/questions/${question.id}`
          : `/products/${encodeURIComponent(productId)}/questions`,
        {
          method: question ? "PATCH" : "POST",
          headers: { "X-Account-Owner": owner },
          body: JSON.stringify({
            title: form.get("title"),
            content: form.get("content"),
            private: form.get("private") === "on",
            ...(question ? { version: question.version } : {}),
          }),
        },
      );
      notify(question ? "문의 내용을 수정했어요." : "상품 문의를 등록했어요.");
      done();
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setPending(false);
    }
  };
  return (
    <form
      className={styles.form}
      onSubmit={submit}
      aria-labelledby={`${id}-title`}
      aria-busy={pending}
    >
      <div className={styles.formHeading}>
        <span className={styles.eyebrow}>AURA CUSTOMER CARE</span>
        <h3 id={`${id}-title`}>{question ? "문의 수정" : "상품 문의 작성"}</h3>
        <p>제품에 대해 궁금한 점을 남겨 주세요.</p>
      </div>
      <fieldset disabled={pending}>
        <label>
          제목
          <input
            name="title"
            required
            maxLength={120}
            defaultValue={question?.title}
            placeholder="어떤 점이 궁금하신가요?"
          />
        </label>
        <label>
          문의 내용
          <textarea
            name="content"
            required
            maxLength={3000}
            rows={5}
            defaultValue={question?.content ?? ""}
            placeholder="확인이 필요한 내용을 자세히 적어 주세요."
            aria-describedby={`${id}-privacy`}
          />
        </label>
        <div className={styles.privacy}>
          <label className={styles.check}>
            <input name="private" type="checkbox" defaultChecked={question?.private ?? true} />
            비공개 문의
          </label>
          <p id={`${id}-privacy`}>
            비공개 문의는 작성자와 운영자만 볼 수 있어요. 공개 문의에는 연락처·주소를 적지 마세요.
          </p>
        </div>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        <div className={styles.formActions}>
          <button type="submit" className={styles.primary} disabled={pending}>
            {pending ? "저장 중…" : question ? "수정 저장" : "문의 등록"}
          </button>
          <button type="button" className={styles.secondary} onClick={done} disabled={pending}>
            닫기
          </button>
        </div>
      </fieldset>
    </form>
  );
}

function QuestionCard({
  question: q,
  admin,
  owner,
  refresh,
}: {
  question: ProductQuestion;
  admin: boolean;
  owner?: string;
  refresh: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const notify = useNotify();
  const remove = async () => {
    if (!window.confirm("이 문의를 삭제할까요?")) {
      return;
    }

    setPending(true);
    setError("");
    try {
      await request(`/questions/${q.id}?version=${q.version}`, {
        method: "DELETE",
        headers: { "X-Account-Owner": owner ?? "" },
      });
      notify("문의가 삭제되었어요.");
      refresh();
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setPending(false);
    }
  };
  const answer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError("");
    try {
      await request(`/admin/questions/${q.id}/answer`, {
        method: "PATCH",
        body: JSON.stringify({ answer: form.get("answer"), version: q.version }),
      });
      notify(q.answered ? "답변을 수정했어요." : "답변을 등록했어요.");
      refresh();
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setPending(false);
    }
  };
  return (
    <article className={styles.card} aria-busy={pending}>
      <div className={styles.metadata}>
        <span className={`${styles.badge} ${q.answered ? styles.answered : ""}`}>
          {q.answered ? "답변 완료" : "답변 대기"}
        </span>
        {q.private && <span className={styles.private}>비공개</span>}
        {q.mine && <span className={styles.mine}>내 문의</span>}
        <time dateTime={q.created}>{new Date(q.created).toLocaleDateString("ko-KR")}</time>
      </div>
      <h3>{q.title}</h3>
      {q.content ? (
        <p className={styles.body}>{q.content}</p>
      ) : (
        <p className={styles.locked}>작성자와 운영자만 내용을 확인할 수 있어요.</p>
      )}
      {q.answer && (
        <blockquote className={styles.answer}>
          <span className={styles.answerLabel}>AURA 답변</span>
          <p className={styles.body}>{q.answer}</p>
          {q.answeredAt && (
            <time dateTime={q.answeredAt}>
              {new Date(q.answeredAt).toLocaleDateString("ko-KR")}
            </time>
          )}
        </blockquote>
      )}
      {q.mine && (
        <div className={styles.ownerActions}>
          {!q.answered && (
            <button type="button" onClick={() => setEditing(!editing)} disabled={pending}>
              {editing ? "수정 닫기" : "수정"}
            </button>
          )}
          <button type="button" disabled={pending} onClick={() => void remove()}>
            문의 삭제
          </button>
        </div>
      )}
      {editing && owner && (
        <QuestionForm
          productId={q.productId}
          question={q}
          owner={owner}
          done={() => {
            setEditing(false);
            refresh();
          }}
        />
      )}
      {admin && (
        <div className={styles.adminArea}>
          <Link
            href={`/admin/products/${encodeURIComponent(q.productId)}`}
            className={styles.productLink}
          >
            상품 {q.productId} <span aria-hidden="true">↗</span>
          </Link>
          <details className={styles.answerEditor} open={!q.answered}>
            <summary>{q.answered ? "답변 수정" : "답변 작성"}</summary>
            <form className={styles.replyForm} onSubmit={answer}>
              <label>
                관리자 답변
                <textarea
                  name="answer"
                  required
                  rows={4}
                  maxLength={3000}
                  defaultValue={q.answer ?? ""}
                  placeholder="고객에게 안내할 답변을 입력해 주세요."
                  disabled={pending}
                />
              </label>
              <button className={styles.primary} disabled={pending}>
                {pending ? "저장 중…" : q.answered ? "답변 수정" : "답변 등록"}
              </button>
            </form>
          </details>
        </div>
      )}
      {error && (
        <div className={styles.error} role="alert">
          <p>{error}</p>
          <button type="button" onClick={refresh}>
            최신 내용 확인
          </button>
        </div>
      )}
    </article>
  );
}

export function Questions({
  productId,
  mine = false,
  admin = false,
}: {
  productId?: string;
  mine?: boolean;
  admin?: boolean;
}) {
  const { user, owner, ready } = useAccount();
  const client = useQueryClient();
  const [page, setPage] = useState(1);
  const [writing, setWriting] = useState(false);
  const [unanswered, setUnanswered] = useState(false);
  const path = admin
    ? "/admin/questions"
    : mine
      ? "/questions/mine"
      : `/products/${encodeURIComponent(productId ?? "")}/questions`;
  const query = useQuery({
    queryKey: [admin ? "admin" : "questions", "questions", path, owner, page, unanswered],
    queryFn: ({ signal }) =>
      request<QuestionPage>(`${path}?page=${page}&unanswered=${unanswered}`, { signal }),
    enabled: admin || (ready && (!mine || !!user)),
    staleTime: 0,
  });
  const lastPage = query.data ? Math.max(1, Math.ceil(query.data.total / 20)) : page;
  if (query.data && page > lastPage) {
    setPage(lastPage);
  }

  const refresh = () => {
    void client.invalidateQueries({ queryKey: [admin ? "admin" : "questions"] });
  };
  return (
    <section
      className={styles.root}
      data-admin={admin}
      aria-label={admin ? "상품 문의 관리" : "상품 문의"}
    >
      <div className={styles.heading}>
        <div>
          {admin && <span className={styles.eyebrow}>CUSTOMER CARE</span>}
          <h2>
            {admin ? "상품 문의 관리" : mine ? "내 상품 문의" : "상품 문의"}
            {query.data && <span className={styles.count}>{query.data.total}</span>}
          </h2>
          <p>
            {admin
              ? "고객의 궁금한 점을 확인하고 답변을 남겨 주세요."
              : mine
                ? "내가 남긴 문의와 AURA의 답변을 한곳에서 확인하세요."
                : "향과 제품에 대해 궁금한 점을 편하게 남겨 주세요."}
          </p>
        </div>
        {productId &&
          (user ? (
            <button
              type="button"
              className={writing ? styles.secondary : styles.primary}
              onClick={() => setWriting(!writing)}
              aria-expanded={writing}
            >
              {writing ? "작성 닫기" : "상품 문의 작성"}
            </button>
          ) : (
            <Link
              className={styles.secondary}
              href={`/login?next=${encodeURIComponent(`/shop/${productId}`)}`}
            >
              로그인 후 상품 문의 작성
            </Link>
          ))}
      </div>
      {admin && (
        <div className={styles.toolbar}>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={unanswered}
              onChange={(e) => {
                setUnanswered(e.target.checked);
                setPage(1);
              }}
            />
            미답변만 보기
          </label>
          <button
            type="button"
            className={styles.secondary}
            disabled={query.isFetching}
            onClick={refresh}
          >
            {query.isFetching ? "확인 중…" : "새로고침"}
          </button>
        </div>
      )}
      {writing && user && productId && (
        <QuestionForm
          productId={productId}
          owner={user.id}
          done={() => {
            setWriting(false);
            refresh();
          }}
        />
      )}
      {query.isLoading && (
        <div className={styles.loading} role="status">
          <span />
          문의를 불러오고 있어요.
        </div>
      )}
      {query.error && (
        <div className={styles.error} role="alert">
          <p>{errorText(query.error)}</p>
          <button type="button" onClick={() => void query.refetch()}>
            다시 시도
          </button>
        </div>
      )}
      {query.data && !query.data.items.length && (
        <div className={styles.empty}>
          <span className={styles.emptyMark} aria-hidden="true">
            Q
          </span>
          <h3>
            {unanswered
              ? "모든 문의에 답변했어요."
              : mine
                ? "아직 남긴 문의가 없어요."
                : "등록된 상품 문의가 없습니다."}
          </h3>
          <p>
            {admin
              ? "새로운 문의가 접수되면 이곳에서 확인할 수 있어요."
              : mine
                ? "상품 상세의 Q&A에서 궁금한 점을 남겨 보세요."
                : "첫 번째 질문을 남겨 주세요. 운영자가 확인하고 답변드려요."}
          </p>
          {mine && (
            <Link href="/shop" className={styles.secondary}>
              상품 둘러보기
            </Link>
          )}
        </div>
      )}
      <div className={styles.list}>
        {query.data?.items.map((q) => (
          <QuestionCard
            key={`${q.id}:${q.version}`}
            question={q}
            admin={admin}
            owner={owner}
            refresh={refresh}
          />
        ))}
      </div>
      {query.data && (query.data.total > 20 || page > 1) && (
        <nav className={styles.pagination} aria-label="문의 페이지">
          <button
            type="button"
            disabled={page === 1 || query.isFetching}
            onClick={() => setPage(page - 1)}
          >
            이전
          </button>
          <span>
            {page} <span>/ {Math.max(1, Math.ceil(query.data.total / 20))}</span>
          </span>
          <button
            type="button"
            disabled={page * 20 >= query.data.total || query.isFetching}
            onClick={() => setPage(page + 1)}
          >
            다음
          </button>
        </nav>
      )}
    </section>
  );
}
