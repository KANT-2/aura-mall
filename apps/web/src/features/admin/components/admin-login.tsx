"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAdminAuth } from "@/features/admin/hooks/use-admin-auth";
import styles from "@/features/admin/components/admin.module.css";

export function AdminLogin({ returnTo }: { returnTo: string }) {
  const { signIn, pending } = useAdminAuth();
  const router = useRouter();
  const [error, setError] = useState("");
  return (
    <main className={styles.gate}>
      <span className="eyebrow">AURA ADMIN</span>
      <h1>관리자 로그인</h1>
      <p>운영자 계정으로 로그인해 주세요.</p>
      <form
        className={styles.loginForm}
        onSubmit={async (event) => {
          event.preventDefault();
          setError("");
          const data = new FormData(event.currentTarget);
          try {
            await signIn({
              email: String(data.get("email")),
              password: String(data.get("password")),
            });
            router.replace(returnTo);
          } catch (error) {
            setError(error instanceof Error ? error.message : "로그인하지 못했어요.");
          }
        }}
      >
        <label>
          이메일
          <input name="email" type="email" autoComplete="username" required maxLength={254} />
        </label>
        <label>
          비밀번호
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
            maxLength={256}
          />
        </label>
        {error ? <p role="alert">{error}</p> : null}
        <button className="button" type="submit" disabled={pending}>
          {pending ? "확인 중…" : "로그인"}
        </button>
      </form>
      <Link href="/">쇼핑몰로 이동</Link>
    </main>
  );
}
