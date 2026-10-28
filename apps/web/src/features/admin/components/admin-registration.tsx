"use client";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { adminAccountKey, createAdmin } from "@/features/admin/api/auth";
import { AdminHeading } from "@/features/admin/components/admin-feedback";
import { ApiError } from "@/lib/api/errors";
import styles from "@/features/admin/components/admin.module.css";

export function AdminRegistration() {
  const client = useQueryClient();
  const [message, setMessage] = useState("");
  const registration = useMutation({
    mutationFn: createAdmin,
    onError(error) {
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        void client.invalidateQueries({ queryKey: adminAccountKey });
      }
    },
  });
  return (
    <>
      <AdminHeading title="관리자 등록" description="함께 운영할 관리자 계정을 등록합니다." />
      <section className={styles.panel}>
        <form
          className={styles.loginForm}
          onSubmit={async (event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const data = new FormData(form);
            setMessage("");
            try {
              const admin = await registration.mutateAsync({
                name: String(data.get("name")),
                email: String(data.get("email")),
                password: String(data.get("password")),
              });
              form.reset();
              setMessage(`${admin.name} 관리자 계정을 등록했어요.`);
            } catch {
              // The mutation displays the public API error above the submit button.
            }
          }}
        >
          <label>
            이름
            <input name="name" autoComplete="off" required maxLength={100} />
          </label>
          <label>
            이메일
            <input name="email" type="email" autoComplete="off" required maxLength={254} />
          </label>
          <label>
            초기 비밀번호
            <input
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              maxLength={256}
            />
          </label>
          {registration.error ? <p role="alert">{registration.error.message}</p> : null}
          {message ? <p role="status">{message}</p> : null}
          <button className="button" type="submit" disabled={registration.isPending}>
            {registration.isPending ? "등록 중…" : "관리자 등록"}
          </button>
        </form>
      </section>
    </>
  );
}
