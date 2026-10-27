"use client";

import { useRef, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  updateProfile,
  changePassword,
  deactivateAccount,
  accountKey,
} from "@/features/account/api/account";
import type { AccountState, Member } from "@/features/account/model/account";
import { useNotify } from "@/components/feedback/notification-provider";
import styles from "@/features/account/components/account.module.css";

export function MemberSettings({ member }: { member: Member }) {
  const client = useQueryClient();
  const notify = useNotify();
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [name, setName] = useState(member.name);
  const [marketing, setMarketing] = useState(member.marketing ?? false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirmation, setConfirmation] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent, action: "profile" | "password" | "deactivate") {
    event.preventDefault();
    if (busy.current) {
      return;
    }

    setError("");
    if (action === "profile" && (!name.trim() || [...name].length > 100)) {
      setError("이름은 공백이 아닌 1~100자로 입력해 주세요.");
      return;
    }

    if (action !== "profile" && (!current || [...current].length > 256)) {
      setError("현재 비밀번호를 1~256자로 입력해 주세요.");
      return;
    }

    if (action === "password" && ([...next].length < 8 || [...next].length > 256)) {
      setError("새 비밀번호는 8~256자로 입력해 주세요.");
      return;
    }

    if (action === "deactivate" && !confirmation) {
      setError("계정 사용 중지 안내를 확인해 주세요.");
      return;
    }

    busy.current = true;
    setPending(true);
    try {
      if (action === "profile") {
        const account = await updateProfile(member.id, { name, marketing });
        if (client.getQueryData<AccountState>(accountKey)?.user?.id === member.id) {
          client.setQueryData(accountKey, account);
        }

        notify("회원 정보를 수정했어요.");
      } else {
        if (action === "password") {
          await changePassword(member.id, current, next);
        } else {
          await deactivateAccount(member.id, current);
        }

        notify(
          action === "password"
            ? "비밀번호를 변경했어요. 모든 기기에서 로그아웃됐습니다. 다시 로그인해 주세요."
            : "계정 사용을 중지했어요. 개인정보 완전 파기가 완료된 것은 아닙니다.",
        );
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "요청을 처리하지 못했어요.");
    } finally {
      setCurrent("");
      setNext("");
      busy.current = false;
      setPending(false);
    }
  }
  return (
    <section
      className={"account-panel " + styles.memberSettings}
      aria-label="회원 계정 관리"
      aria-busy={pending}
    >
      <h2>회원 정보 수정</h2>
      <p>{member.email}</p>
      <form onSubmit={(event) => void submit(event, "profile")}>
        <fieldset disabled={pending}>
          <label>
            이름
            <input
              autoComplete="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={marketing}
              onChange={(event) => setMarketing(event.target.checked)}
            />
            마케팅 수신 동의
          </label>
          <button className="button" type="submit">
            회원 정보 저장
          </button>
        </fieldset>
      </form>
      <h2>비밀번호 변경</h2>
      <form onSubmit={(event) => void submit(event, "password")}>
        <fieldset disabled={pending}>
          <label>
            현재 비밀번호
            <input
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(event) => setCurrent(event.target.value)}
              required
            />
          </label>
          <label>
            새 비밀번호
            <input
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={(event) => setNext(event.target.value)}
              required
            />
          </label>
          <p>8~256자이며 공백도 비밀번호에 포함됩니다. 변경하면 모든 기기에서 로그아웃됩니다.</p>
          <button className="button" type="submit">
            비밀번호 변경
          </button>
        </fieldset>
      </form>
      <h2>계정 사용 중지</h2>
      <p>이 브라우저의 장바구니는 유지됩니다.</p>
      <p>
        저장 레시피와 안전한 미사용 쿠폰을 정리합니다. 주문 기록은 보존하며 개인정보 완전 파기를
        의미하지 않습니다.
      </p>
      <form onSubmit={(event) => void submit(event, "deactivate")}>
        <fieldset disabled={pending}>
          <label>
            계정 사용 중지 확인
            <input
              type="checkbox"
              checked={confirmation}
              onChange={(event) => setConfirmation(event.target.checked)}
            />
          </label>
          <label>
            확인용 현재 비밀번호
            <input
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(event) => setCurrent(event.target.value)}
              required
            />
          </label>
          <button className="button" type="submit">
            계정 사용 중지
          </button>
        </fieldset>
      </form>
      {pending && <p role="status">처리 중이에요.</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
