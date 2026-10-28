"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAccount } from "@/features/account/hooks/use-account";
import type { ProductQuestion, QuestionPage } from "@/features/questions/model/question";
import { request } from "@/lib/api/client";
import styles from "@/features/questions/components/questions.module.css";

const errorText = (error: unknown) =>
  error instanceof Error ? error.message : "문의를 처리하지 못했어요.";

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
      done();
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setPending(false);
    }
  };
  return (
    <form className={styles.form} onSubmit={submit}>
      <label>
        제목
        <input name="title" required maxLength={120} defaultValue={question?.title} />
      </label>
      <label>
        문의 내용
        <textarea
          name="content"
          required
          maxLength={3000}
          rows={5}
          defaultValue={question?.content ?? ""}
        />
      </label>
      <label className={styles.check}>
        <input name="private" type="checkbox" defaultChecked={question?.private ?? true} />
        비공개 문의
      </label>
      <p>공개 문의에는 연락처·주소 등 개인정보를 적지 마세요.</p>
      <button type="submit" className="button" disabled={pending}>
        {pending ? "저장 중…" : question ? "수정 저장" : "문의 등록"}
      </button>
      <button type="button" onClick={done} disabled={pending}>
        닫기
      </button>
      {error && <p role="alert">{error}</p>}
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
      refresh();
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setPending(false);
    }
  };
  return (
    <article className={styles.card}>
      <small>
        {q.private ? "비공개 · " : ""}
        {q.answered ? "답변 완료" : "답변 대기"} · {new Date(q.created).toLocaleDateString("ko-KR")}
      </small>
      <h3>{q.title}</h3>
      {q.content && <p className={styles.body}>{q.content}</p>}
      {q.answer && (
        <blockquote className={styles.body}>
          <strong>관리자 답변</strong>
          <p>{q.answer}</p>
        </blockquote>
      )}
      {q.mine && (
        <div className="actions">
          {!q.answered && (
            <button type="button" onClick={() => setEditing(!editing)}>
              수정
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
        <>
          <p>상품: {q.productId}</p>
          <form className={styles.form} onSubmit={answer}>
            <label>
              관리자 답변
              <textarea
                name="answer"
                required
                rows={4}
                maxLength={3000}
                defaultValue={q.answer ?? ""}
              />
            </label>
            <button className="button" disabled={pending}>
              {q.answered ? "답변 수정" : "답변 등록"}
            </button>
          </form>
        </>
      )}
      {error && <p role="alert">{error} 최신 내용을 확인한 후 다시 시도해 주세요.</p>}
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
  const refresh = () => {
    void client.invalidateQueries({ queryKey: [admin ? "admin" : "questions"] });
  };
  return (
    <section className={styles.root} aria-label={admin ? "상품 문의 관리" : "상품 문의"}>
      <h2>{admin ? "상품 문의 관리" : mine ? "내 상품 문의" : "상품 문의"}</h2>
      {admin && (
        <label>
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
      )}
      {productId &&
        (user ? (
          <button className="button" onClick={() => setWriting(!writing)}>
            상품 문의 작성
          </button>
        ) : (
          <Link href="/login">로그인 후 상품 문의 작성</Link>
        ))}
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
      {admin && (
        <button type="button" onClick={refresh}>
          새로고침
        </button>
      )}
      {query.isLoading && <p role="status">문의를 불러오고 있어요.</p>}
      {query.error && (
        <p role="alert">
          {errorText(query.error)} <button onClick={() => void query.refetch()}>다시 시도</button>
        </p>
      )}
      {query.data && !query.data.items.length && <p>등록된 상품 문의가 없습니다.</p>}
      {query.data?.items.map((q) => (
        <QuestionCard
          key={`${q.id}:${q.version}`}
          question={q}
          admin={admin}
          owner={owner}
          refresh={refresh}
        />
      ))}
      {query.data && (query.data.total > 20 || page > 1) && (
        <nav aria-label="문의 페이지">
          <button disabled={page === 1} onClick={() => setPage(page - 1)}>
            이전
          </button>
          <span>
            {page} / {Math.ceil(query.data.total / 20)}
          </span>
          <button disabled={page * 20 >= query.data.total} onClick={() => setPage(page + 1)}>
            다음
          </button>
        </nav>
      )}
    </section>
  );
}
