"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useNotify } from "@/components/feedback/notification-provider";
import { adminAccountKey } from "@/features/admin/api/auth";
import { request } from "@/lib/api/client";
import { useAdminAuth } from "@/features/admin/hooks/use-admin-auth";
import { AdminHeading } from "@/features/admin/components/admin-feedback";
import styles from "@/features/admin/components/admin.module.css";

export function AdminSettings() {
  const { signOut } = useAdminAuth();
  const router = useRouter();
  const client = useQueryClient();
  const notify = useNotify();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [visible, setVisible] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) {
      return;
    }

    const form = new FormData(event.currentTarget);
    if (form.get("newPassword") !== form.get("repeatPassword")) {
      setError("새 비밀번호가 일치하지 않아요.");
      return;
    }

    setPending(true);
    setError("");
    try {
      await request("/admin/auth/change-password", {
        method: "POST",
        body: JSON.stringify({
          currentPassword: form.get("currentPassword"),
          newPassword: form.get("newPassword"),
        }),
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "비밀번호를 변경하지 못했어요.");
      setPending(false);
      return;
    }

    // The successful password change already revoked every admin session on the server.
    await client
      .cancelQueries({
        predicate: (query) => ["admin", "admin-account"].includes(String(query.queryKey[0])),
      })
      .catch(() => {});
    client.removeQueries({ predicate: (query) => query.queryKey[0] === "admin" });
    client.setQueryData(adminAccountKey, { admin: null });
    notify("비밀번호를 변경했어요. 새 비밀번호로 다시 로그인해 주세요.");
    try {
      await signOut();
    } catch {
      // A failed cookie cleanup must not turn a confirmed password change into an error.
    } finally {
      client.removeQueries({ predicate: (query) => query.queryKey[0] === "admin" });
      client.setQueryData(adminAccountKey, { admin: null });
      router.replace("/admin/login?passwordChanged=1");
    }
  };
  return (
    <>
      <AdminHeading
        title="관리자 비밀번호 변경"
        description="관리자 계정의 로그인 비밀번호를 변경합니다."
      />
      <div className={styles.settingsLayout}>
        <form className={styles.panel} onSubmit={submit} aria-busy={pending}>
          <div className={styles.panelHeading}>
            <h2>비밀번호 변경</h2>
            <span className={styles.eyebrow}>SECURITY</span>
          </div>
          <div className={styles.fields}>
            <label className={styles.wide}>
              <span>현재 비밀번호</span>
              <input
                type={visible ? "text" : "password"}
                name="currentPassword"
                autoComplete="current-password"
                required
                maxLength={256}
              />
            </label>
            <label className={styles.wide}>
              <span>새 비밀번호</span>
              <input
                type={visible ? "text" : "password"}
                name="newPassword"
                autoComplete="new-password"
                required
                minLength={8}
                maxLength={256}
                aria-describedby="admin-password-help"
              />
              <small id="admin-password-help" className={styles.help}>
                8자 이상으로 입력해 주세요.
              </small>
            </label>
            <label className={styles.wide}>
              <span>새 비밀번호 확인</span>
              <input
                type={visible ? "text" : "password"}
                name="repeatPassword"
                autoComplete="new-password"
                required
                minLength={8}
                maxLength={256}
              />
            </label>
          </div>
          <label className={styles.inlineCheck}>
            <input
              type="checkbox"
              checked={visible}
              onChange={(event) => setVisible(event.target.checked)}
            />
            비밀번호 보기
          </label>
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          <div className={styles.formActions}>
            <button className="button" disabled={pending}>
              {pending ? "비밀번호 변경 중…" : "비밀번호 변경 후 로그아웃"}
            </button>
          </div>
        </form>
        <aside className={styles.asideCard}>
          <span className={styles.eyebrow}>ACCOUNT SECURITY</span>
          <h2>안전한 계정 관리</h2>
          <p>비밀번호를 변경하면 이 브라우저를 포함한 모든 관리자 로그인 세션이 종료돼요.</p>
          <p>
            변경이 끝나면 새 비밀번호로 다시 로그인해 주세요. 회원 계정의 비밀번호는 바뀌지 않아요.
          </p>
        </aside>
      </div>
    </>
  );
}
