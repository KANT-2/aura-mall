"use client";
/* eslint-disable @next/next/no-img-element */
// Synchronize browser storage or URL state after hydration.
/* eslint-disable react-hooks/set-state-in-effect */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import ingredients from "./ingredients.json";
import * as accounts from "./accounts";
import { Arrow, Asset, totalCount } from "./Shared";
import { useAura } from "./Provider";

/** Same-origin path only; browsers normalize `/\host` and tab-split slashes to `//host`. */
function safeReturnPath(next: string | null, fallback = "/mypage") {
  if (!next?.startsWith("/")) return fallback;
  try {
    const url = new URL(next, window.location.origin);
    return url.origin === window.location.origin
      ? url.pathname + url.search + url.hash
      : fallback;
  } catch {
    return fallback;
  }
}

export function Auth({ mode }: { mode: "login" | "register" }) {
  const { setUser, notify } = useAura(),
    router = useRouter(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [pw, setPw] = useState(""),
    [confirm, setConfirm] = useState(""),
    [terms, setTerms] = useState(false),
    [returnTo, setReturnTo] = useState("/mypage");
  const signup = mode === "register";
  useEffect(() => {
    const next = new URLSearchParams(window.location.search).get("next");
    setReturnTo(safeReturnPath(next));
  }, []);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const form=e.currentTarget as HTMLFormElement;
    form.querySelectorAll('[aria-invalid="true"]').forEach(el=>el.removeAttribute("aria-invalid"));
    const invalid=[...form.querySelectorAll<HTMLInputElement>("input")].find(el=>!el.validity.valid);
    if(invalid){invalid.setAttribute("aria-invalid","true");invalid.setAttribute("aria-describedby","auth-error");invalid.focus();setError(invalid.type==="email"?"이메일 주소를 확인해 주세요.":invalid.type==="password"?"비밀번호는 8자 이상 입력해 주세요.":invalid.type==="checkbox"?"필수 약관에 동의해 주세요.":"이름을 입력해 주세요.");return;}
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
      const u = signup
        ? await accounts.register(
            name,
            email,
            pw,
            new FormData(e.currentTarget as HTMLFormElement).get(
              "marketing",
            ) === "on",
          )
        : await accounts.login(email, pw);
      setUser(u);
      if(signup){
        sessionStorage.setItem("aura_welcome_pending_v8", "1");
        window.dispatchEvent(new Event("aura:welcome"));
      }
      notify(signup ? "회원가입을 환영해요." : "로그인했어요.");
      const next = new URLSearchParams(window.location.search).get("next");
      router.push(safeReturnPath(next));
    } catch (e) {
      setError(e instanceof Error ? e.message : "다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-page">
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
          {signup
            ? "첫 만남을 위한 배송비 쿠폰을 준비했어요."
            : "당신의 취향이 머무는 곳으로."}
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
                  현재 회원 정보와 비밀번호 검증값은 이용 중인 브라우저에
                  보관됩니다. 서버 회원 인증 및 운영 약관 연동 전까지 다른
                  기기에서는 계정을 이용할 수 없습니다. 저장한 향과 계정은
                  브라우저 데이터 삭제 시 함께 삭제됩니다.
                </p>
              </details>
            </>
          )}
          <p role="alert" className="form-error" id="auth-error">
            {error}
          </p>
          <button className="button" disabled={busy}>
            {busy ? "확인 중…" : signup ? "회원가입" : "로그인"} <Arrow />
          </button>
        </form>
        <div className="auth-links">
          <Link
            href={
              (signup ? "/login" : "/register") +
              "?next=" +
              encodeURIComponent(returnTo)
            }
          >
            {signup
              ? "이미 계정이 있나요? 로그인"
              : "AURA가 처음인가요? 회원가입"}
          </Link>
          {!signup && (
            <button
              onClick={() =>
                notify("비밀번호 재설정은 고객지원 연결 후 이용할 수 있어요.")
              }
            >
              비밀번호 찾기
            </button>
          )}
        </div>
      </div>
    </main>
  );
}

export function MyPage() {
  const { user, setUser, recipes, ready, notify } = useAura(),
    [tab, setTab] = useState("scents"),
    [filter, setFilter] = useState("all");
  if (!ready)
    return (
      <main className="page-width" aria-busy="true">
        <p>내 정보를 불러오고 있어요.</p>
      </main>
    );
  if (!user)
    return (
      <main className="page-width">
        <div className="empty">
          <Asset id="custom-bottle" />
          <h1>나의 향을 만나보세요.</h1>
          <p>로그인하면 저장한 향과 쿠폰을 확인할 수 있어요.</p>
          <Link className="button" href="/login?next=/mypage">
            로그인
          </Link>
        </div>
      </main>
    );
  return (
    <main className="page-width mypage">
      <div className="heading-row">
        <div>
          <span className="eyebrow">MY AURA</span>
          <h1>{user.name}님의 취향 기록</h1>
          <p>만든 향과 좋아하는 순간을 오래도록.</p>
        </div>
        <button
          className="text-link"
          onClick={() => {
            accounts.logout();
            setUser(null);
            notify("로그아웃했어요.");
          }}
        >
          로그아웃
        </button>
      </div>
      <div className="tabs">
        {[
          ["scents", "내가 만든 향"],
          ["orders", "주문 내역"],
          ["coupons", "내 쿠폰"],
          ["account", "계정 관리"],
        ].map(([id, title]) => (
          <button
            key={id}
            className={tab === id ? "selected" : ""}
            onClick={() => setTab(id)}
          >
            {title}
          </button>
        ))}
      </div>
      {tab === "scents" ? (
        <>
          <div className="chips">
            {[
              ["all", "전체"],
              ["saved", "저장한 향"],
              ["purchased", "구매한 향"],
            ].map(([id, title]) => (
              <button
                className={filter === id ? "selected" : ""}
                onClick={() => setFilter(id)}
                key={id}
              >
                {title}
              </button>
            ))}
          </div>
          {recipes.length && filter !== "purchased" ? (
            <div className="recipe-grid">
              {recipes.map((r) => (
                <article className="saved-recipe" key={r.id}>
                  <div className="saved-recipe-visual">
                    <span className="saved-version">AURA / PRIVATE COMPOSITION</span>
                    <Asset id="custom-bottle" /><span className="saved-name">{r.name}</span>
                  </div>
                  <div className="saved-recipe-body">
                    <span className="eyebrow">VERSION {r.version} / {new Date(r.created).toLocaleDateString("ko-KR")}</span>
                    <h2>{r.name}</h2>
                    <p className="saved-topnotes">{Object.entries(r.counts).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([id])=>ingredients.find(x=>x.id===id)?.name).filter(Boolean).join(" · ")}{Object.keys(r.counts).length>3?` 외 ${Object.keys(r.counts).length-3}종`:""}</p>
                    <details>
                      <summary>전체 레시피 보기 · {totalCount(r.counts)}회</summary>
                      <p>라벨: {r.label === "classic" ? "클래식" : r.label === "paper" ? "페이퍼" : "미니멀"}</p>
                      {Object.entries(r.counts).map(([id,n])=><p key={id}>{ingredients.find(x=>x.id===id)?.name} — {n}회</p>)}
                    </details>
                    <Link className="text-link" href={"/atelier?recipe="+r.id}>이 향으로 다시 만들기 <Arrow /></Link>
                    <small>이 향을 다시 열어 장바구니에 담을 수 있어요. 실제 제조·가격은 확인이 필요해요.</small>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty">
              <Asset id="custom-bottle" />
              <h2>
                {filter === "purchased"
                  ? "구매한 향이 없어요."
                  : "아직 저장한 향이 없어요."}
              </h2>
              <Link className="button" href="/atelier">
                나만의 향 만들기
              </Link>
            </div>
          )}
        </>
      ) : tab === "coupons" ? (
        <article className="coupon-card">
          <Asset id="coupon" />
          <div>
            <span className="eyebrow">WELCOME BENEFIT</span>
            <h2>첫 주문 배송비 쿠폰</h2>
            <p>{user?.coupon ? "3,000원 배송비 혜택 · 5만 원 이상 주문은 자동 무료배송" : "사용 가능한 쿠폰이 없습니다."}</p>
            <p className="micro">결제 기능 준비 전까지 쿠폰 사용 완료는 처리되지 않아요.</p>
          </div>
          <span className="chip">{user?.coupon ? "사용 가능" : "미보유"}</span>
        </article>
      ) : tab === "orders" ? (
        <div className="empty">
          <Asset id="empty-bag" />
          <h2>아직 주문 내역이 없어요.</h2>
          <Link className="text-link" href="/shop">
            컬렉션 둘러보기 →
          </Link>
        </div>
      ) : (
        <div className="account-panel">
          <h2>회원 정보</h2>
          <dl>
            <div>
              <dt>이름</dt>
              <dd>{user.name}</dd>
            </div>
            <div>
              <dt>이메일</dt>
              <dd>{user.email}</dd>
            </div>
          </dl>
        </div>
      )}
    </main>
  );
}
