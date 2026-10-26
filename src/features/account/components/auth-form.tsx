"use client";
import { testIds } from "@/lib/test-ids";
/* eslint-disable @next/next/no-img-element */
import styles from "@/features/account/components/account.module.css";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/features/account/hooks/use-auth";
import { Arrow } from "@/components/ui/arrow";
import { useNotify } from "@/components/feedback/notification-provider";
export function Auth({ mode, returnTo }: { mode: "login" | "register"; returnTo: string }) {
  const { signIn, signUp } = useAuth(),
    notify = useNotify(),
    router = useRouter(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [pw, setPw] = useState(""),
    [confirm, setConfirm] = useState(""),
    [terms, setTerms] = useState(false);
  const signup = mode === "register";
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const form = e.currentTarget as HTMLFormElement;
    form
      .querySelectorAll('[aria-invalid="true"]')
      .forEach((el) => el.removeAttribute("aria-invalid"));
    const invalid = [...form.querySelectorAll<HTMLInputElement>("input")].find(
      (el) => !el.validity.valid,
    );
    if (invalid) {
      invalid.setAttribute("aria-invalid", "true");
      invalid.setAttribute("aria-describedby", "auth-error");
      invalid.focus();
      setError(
        invalid.type === "email"
          ? "이메일 주소를 확인해 주세요."
          : invalid.type === "password"
            ? "비밀번호는 8자 이상 입력해 주세요."
            : invalid.type === "checkbox"
              ? "필수 약관에 동의해 주세요."
              : "이름을 입력해 주세요.",
      );
      return;
    }
    if (signup && pw !== confirm) {
      setError("비밀번호가 일치하지 않아요.");
      return;
    }
    if (signup && !terms) {
      setError("필수 약관에 동의해 주세요.");
      return;
    }
    setBusy(true);
    try {
      await (signup
        ? signUp(
            name,
            email,
            pw,
            new FormData(e.currentTarget as HTMLFormElement).get("marketing") === "on",
          )
        : signIn(email, pw));
      if (signup) {
        sessionStorage.setItem("aura_welcome_pending_v8", "1");
        window.dispatchEvent(new Event("aura:welcome"));
      }
      notify(signup ? "회원가입을 환영해요." : "로그인했어요.");
      router.push(returnTo);
    } catch (e) {
      setError(e instanceof Error ? e.message : "다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className={styles.root + " auth-page"}>
      <div className="auth-editorial">
        <img src="/assets/products/soft-eau-de-parfum.webp" alt="AURA 향수" />
        <div>
          <span className="eyebrow">YOUR EVERYDAY AURA</span>
          <h2>
            향으로 기억하는,
            <br />
            <i>나의 순간.</i>
          </h2>
        </div>
      </div>
      <div className="auth-form">
        <span className="eyebrow">WELCOME TO AURA</span>
        <h1>{signup ? "회원가입" : "로그인"}</h1>
        <p>
          {signup ? "첫 만남을 위한 배송비 쿠폰을 준비했어요." : "당신의 취향이 머무는 곳으로."}
        </p>
        <form noValidate onSubmit={submit}>
          {signup && (
            <label>
              이름
              <input
                autoComplete="name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="이름을 입력해 주세요"
              />
            </label>
          )}
          <label>
            이메일
            <input
              data-testid={testIds.account.email}
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="hello@example.com"
            />
          </label>
          <label>
            비밀번호
            <input
              data-testid={testIds.account.password}
              type="password"
              required
              minLength={8}
              autoComplete={signup ? "new-password" : "current-password"}
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder="8자 이상 입력해 주세요"
            />
          </label>
          {signup && (
            <>
              <label>
                비밀번호 확인
                <input
                  type="password"
                  autoComplete="new-password"
                  required
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="비밀번호를 한 번 더 입력해 주세요"
                />
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={terms}
                  onChange={(e) => setTerms(e.target.checked)}
                  required
                />
                [필수] 회원 이용 및 개인정보 처리 안내 확인
              </label>
              <label className="check">
                <input name="marketing" type="checkbox" />
                [선택] 새로운 향과 소식을 이메일로 받기
              </label>
              <details className="micro">
                <summary>약관 및 개인정보 처리 안내</summary>
                <p>
                  현재 회원 정보와 비밀번호 검증값은 이용 중인 브라우저에 보관됩니다. 서버 회원 인증
                  및 운영 약관 연동 전까지 다른 기기에서는 계정을 이용할 수 없습니다. 저장한 향과
                  계정은 브라우저 데이터 삭제 시 함께 삭제됩니다.
                </p>
              </details>
            </>
          )}
          <p role="alert" className="form-error" id="auth-error">
            {error}
          </p>
          <button data-testid={testIds.account.submit} className="button" disabled={busy}>
            {busy ? "확인 중…" : signup ? "회원가입" : "로그인"} <Arrow />
          </button>
        </form>
        <div className="auth-links">
          <Link href={(signup ? "/login" : "/register") + "?next=" + encodeURIComponent(returnTo)}>
            {signup ? "이미 계정이 있나요? 로그인" : "AURA가 처음인가요? 회원가입"}
          </Link>
          {!signup && (
            <button onClick={() => notify("비밀번호 재설정은 고객지원 연결 후 이용할 수 있어요.")}>
              비밀번호 찾기
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
