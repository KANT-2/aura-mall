"use client";
import styles from "./Partner.module.css";
 
import Link from "next/link";
import { StyledSelect } from "../ui/StyledSelect";
import { useState } from "react";
import { Arrow, Asset } from "./Shared";

export function Partner() {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [complete, setComplete] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const form=e.currentTarget;
    const invalid=[...form.querySelectorAll<HTMLInputElement|HTMLTextAreaElement>("input:not([type=hidden]),textarea")].find(el=>!el.validity.valid);
    if(invalid){invalid.setAttribute("aria-invalid","true");invalid.setAttribute("aria-describedby","partner-error");invalid.focus();setError(invalid.type==="email"?"연락 가능한 이메일을 확인해 주세요.":invalid.type==="checkbox"?"개인정보 수집·이용에 동의해 주세요.":"필수 항목과 입력 형식을 확인해 주세요.");return;}
    if(!new FormData(form).get("type")){setError("제품 유형을 선택해 주세요.");form.querySelector<HTMLButtonElement>("[role=combobox]")?.focus();return;}
    setBusy(true);
    const data = Object.fromEntries(new FormData(e.currentTarget));
    try {
      const res = await fetch("/api/partner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const body = await res.json();
      if (!res.ok) throw Error(body.error || "문의 전송에 실패했어요.");
      setComplete(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className={styles.root + " partner-page page-width"}>
      <div className="partner-copy">
        <span className="eyebrow">PARTNER WITH AURA</span>
        <h1>
          향의 이야기를,
          <br />
          함께 넓혀가요.
        </h1>
        <p>
          자신만의 향과 이야기를 가진 브랜드를 기다립니다.
          <br />
          브랜드와 제품을 소개해 주세요.
        </p>
        <Asset id="gift" />
        <p className="micro">
          문의 내용을 검토한 후 연락드려요.
          <br />
          입점 상담은 입점 승인을 보장하지 않습니다.
        </p>
      </div>
      {complete ? (
        <div className="empty">
          <h2>입점 문의가 접수되었어요.</h2>
          <p>남겨주신 연락처로 안내드리겠습니다.</p>
          <Link className="button" href="/">
            홈으로
          </Link>
        </div>
      ) : (
        <form noValidate onSubmit={submit}>
          <label>
            브랜드명
            <input
              name="brand"
              required
              placeholder="브랜드 이름"
              maxLength={100}
            />
          </label>
          <div className="form-columns">
            <label>
              담당자명
              <input
                name="name"
                required
                placeholder="담당자 이름"
                maxLength={50}
              />
            </label>
            <label>
              이메일
              <input
                type="email"
                name="email"
                required
                placeholder="contact@brand.com"
              />
            </label>
          </div>
          <label>
            홈페이지 또는 SNS
            <input name="website" type="url" placeholder="https://" />
          </label>
          <label>
            주요 제품 유형
            <StyledSelect label="주요 제품 유형" name="type" options={[{value:"",label:"제품 유형을 선택해 주세요"},...["향수","바디 · 헤어","홈 프래그런스","기타 향 제품"].map(v=>({value:v,label:v}))]}/>
          </label>
          <label>
            브랜드 및 제품 소개
            <textarea
              name="introduction"
              required
              maxLength={3000}
              placeholder="브랜드의 이야기와 주요 제품을 소개해 주세요"
            />
          </label>
          <label>
            문의 내용
            <textarea
              name="message"
              required
              maxLength={3000}
              placeholder="상담하고 싶은 내용을 남겨주세요"
            />
          </label>
          <label className="check">
            <input name="consent" type="checkbox" required />
            [필수] 입점 상담을 위한 개인정보 수집·이용 동의
          </label>
          <details className="micro">
            <summary>수집·이용 안내 확인</summary>
            <p>
              수집 항목: 브랜드명, 담당자명, 이메일, 문의 내용. 이용 목적: 입점
              문의 검토와 상담 연락. 접수 기능과 보유 기간은 실제 운영 체계에
              맞춰 확정하며, 운영 설정이 준비되지 않은 경우 문의를 전송하지
              않습니다.
            </p>
          </details>
          <p className="form-error" id="partner-error" role="alert">
            {error}
          </p>
          <button className="button" disabled={busy}>
            {busy ? "전송 중…" : "입점 문의 보내기"} <Arrow />
          </button>
        </form>
      )}
    </main>
  );
}
