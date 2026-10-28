"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { request } from "@/lib/api/client";
import { useAdminAuth } from "@/features/admin/hooks/use-admin-auth";
import styles from "@/features/admin/components/admin.module.css";

export function AdminSettings() {
  const { signOut } = useAdminAuth();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
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
      await signOut();
      router.replace("/admin/login?passwordChanged=1");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "비밀번호를 변경하지 못했어요.");
    } finally {
      setPending(false);
    }
  };
  return (
    <section className={styles.panel}>
      <h1>관리자 비밀번호 변경</h1>
      <p>변경하면 모든 관리자 로그인 세션이 종료돼요. 새 비밀번호로 다시 로그인해 주세요.</p>
      <form className={styles.form} onSubmit={submit}>
        <label>
          현재 비밀번호
          <input
            type="password"
            name="currentPassword"
            autoComplete="current-password"
            required
            maxLength={256}
          />
        </label>
        <label>
          새 비밀번호
          <input
            type="password"
            name="newPassword"
            autoComplete="new-password"
            required
            minLength={8}
            maxLength={256}
          />
        </label>
        <label>
          새 비밀번호 확인
          <input
            type="password"
            name="repeatPassword"
            autoComplete="new-password"
            required
            minLength={8}
            maxLength={256}
          />
        </label>
        <button className="button" disabled={pending}>
          비밀번호 변경 후 로그아웃
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
