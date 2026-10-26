"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { Asset } from "@/components/ui/asset";
import { Beaker } from "@/components/illustrations/beaker";
import { useSession } from "@/features/account/hooks/use-session";

const screens = [
  {
    title: "AURA에 오신 것을 환영해요",
    description: "향으로 취향을 발견하는 공간입니다.",
    note: "WELCOME BENEFIT",
  },
  {
    title: "어떤 향을 좋아하세요?",
    description: "시트러스부터 우디까지, 여섯 가지 향의 분위기에서 시작해 보세요.",
    note: "FIND YOUR SCENT",
  },
  {
    title: "향료를 톡톡 담아 보세요",
    description: "아래 향료를 직접 눌러 보세요. 작은 한 방울이 비커에 더해져요.",
    note: "ADD A DROP",
  },
  {
    title: "천천히 저어, 하나의 향으로",
    description: "유리 막대가 움직이면 액체가 자연스럽게 반응해요.",
    note: "STIR GENTLY",
  },
  {
    title: "당신의 향을 기록하세요",
    description: "완성한 향에 이름과 라벨을 붙이고 오래 간직할 수 있어요.",
    note: "YOUR PERSONAL AURA",
  },
];
const KEY = "aura_welcome_pending_v8";
export function WelcomeJourney() {
  const router = useRouter();
  const { user } = useSession();
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(0);
  const [drops, setDrops] = useState(0);
  const start = useRef<number | null>(null);
  const dialog = useRef<HTMLElement>(null);
  const close = () => {
    setOpen(false);
    try {
      sessionStorage.removeItem(KEY);
      sessionStorage.setItem("aura_welcome_seen_v8", "1");
    } catch {}
  };
  useEffect(() => {
    const onWelcome = () => {
      setPage(0);
      setDrops(0);
      setOpen(true);
    };
    window.addEventListener("aura:welcome", onWelcome);
    try {
      if (sessionStorage.getItem(KEY) === "1") {
        onWelcome();
      }
    } catch {}
    return () => window.removeEventListener("aura:welcome", onWelcome);
  }, []);
  useEffect(() => {
    if (!open) {
      return;
    }

    // Same focus handling as AtelierModal: move in, keep Tab inside, restore on close.
    const before = document.activeElement as HTMLElement | null;
    dialog.current?.focus();
    const keyboard = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
      }

      if (e.key === "ArrowRight") {
        setPage((p) => Math.min(4, p + 1));
      }

      if (e.key === "ArrowLeft") {
        setPage((p) => Math.max(0, p - 1));
      }

      const root = dialog.current;
      if (e.key !== "Tab" || !root) {
        return;
      }

      const items = [
        ...root.querySelectorAll<HTMLElement>(
          'button:not(:disabled),a[href],input:not(:disabled),[tabindex="0"]',
        ),
      ].filter((el) => el.getClientRects().length);
      if (!items.length) {
        e.preventDefault();
        return;
      }

      const first = items[0],
        last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === root)) {
        e.preventDefault();
        last.focus();
      } else if (
        !e.shiftKey &&
        (document.activeElement === last || document.activeElement === root)
      ) {
        e.preventDefault();
        first.focus();
      } else if (!root.contains(document.activeElement)) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", keyboard);
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", keyboard);
      document.body.style.overflow = old;
      if (before?.isConnected) {
        before.focus();
      }
    };
  }, [open]);
  const onPointerUp = (e: PointerEvent<HTMLElement>) => {
    if (start.current === null) {
      return;
    }

    const dx = e.clientX - start.current;
    start.current = null;
    if (Math.abs(dx) > 55) {
      setPage((p) => Math.max(0, Math.min(4, p + (dx < 0 ? 1 : -1))));
    }
  };
  if (!open) {
    return null;
  }

  return (
    <div
      className="a-welcome-overlay"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          close();
        }
      }}
    >
      <section
        ref={dialog}
        tabIndex={-1}
        className="a-welcome-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="AURA 첫 이용 안내"
        onPointerDown={(e) => {
          start.current = e.clientX;
        }}
        onPointerUp={onPointerUp}
      >
        <header>
          <span className="eyebrow">AURA / AN INVITATION</span>
          <button aria-label="안내 닫기" onClick={close}>
            ×
          </button>
        </header>
        <div className="a-welcome-copy" key={page}>
          <span className="eyebrow">
            0{page + 1} / 05 · {screens[page].note}
          </span>
          <h2>{screens[page].title}</h2>
          <p>{screens[page].description}</p>
        </div>
        <div className="a-welcome-art" key={`art-${page}`}>
          {page === 0 ? (
            <div className="a-welcome-coupon">
              <Asset id="coupon" />
              <strong>
                {user?.coupon ? "배송비 쿠폰이 준비됐어요" : "당신만의 향을 발견해 보세요"}
              </strong>
              <small>
                {user?.coupon
                  ? "실제 주문 화면에서 배송비 쿠폰을 선택할 수 있어요."
                  : "현재 사용할 수 있는 쿠폰이 확인되지 않았어요."}
              </small>
            </div>
          ) : null}
          {page === 1 ? (
            <div className="a-welcome-families">
              {["bergamot", "jasmine", "sandalwood"].map((id, i) => (
                <span key={id}>
                  <Asset id={id} />
                  <small>{["시트러스", "플로럴", "우디"][i]}</small>
                </span>
              ))}
            </div>
          ) : null}
          {page === 2 ? (
            <div className="a-welcome-beaker">
              <Beaker count={drops} color="#c8a06a" drop={drops} />
              <button onClick={() => setDrops((n) => Math.min(9, n + 1))}>
                <Asset id="bergamot" /> 한 방울 담기 +
              </button>
              <small>{drops}방울 담았어요</small>
            </div>
          ) : null}
          {page === 3 ? (
            <div className="a-welcome-stir">
              <Beaker count={8} color="#bc976b" />
              <span className="a-welcome-stir-rod" />
              <span>유리 막대로 천천히 저어요</span>
            </div>
          ) : null}
          {page === 4 ? (
            <div className="a-welcome-result">
              <Asset id="custom-bottle" />
              <small>PERSONAL COMPOSITION</small>
            </div>
          ) : null}
        </div>
        <div className="a-welcome-footer">
          <div className="a-welcome-dots" aria-label="온보딩 단계">
            {screens.map((_, i) => (
              <button
                key={i}
                aria-label={`${i + 1}번째 안내`}
                aria-current={i === page ? "step" : undefined}
                className={page === i ? "active" : ""}
                onClick={() => setPage(i)}
              />
            ))}
          </div>
          <div className="a-welcome-nav">
            <button className="a-welcome-skip" onClick={close}>
              건너뛰기
            </button>
            <button
              className="a-welcome-prev"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              이전
            </button>
            <button
              className="button"
              onClick={() => {
                if (page === 4) {
                  close();
                  router.push("/atelier");
                } else {
                  setPage((p) => p + 1);
                }
              }}
            >
              {page === 4 ? "나만의 향 만들기" : "다음 →"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
