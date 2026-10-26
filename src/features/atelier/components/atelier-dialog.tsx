"use client";
import modalStyles from "@/features/atelier/components/atelier-dialog.module.css";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { UtilityIcon } from "@/components/ui/utility-icon";
export function AtelierModal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null),
    close = useRef(onClose),
    id = useId();
  useEffect(() => {
    close.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const root = ref.current;
    root?.focus();
    const listener = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close.current();
      }
      if (e.key !== "Tab" || !root) {
        return;
      }
      const items = [
        ...root.querySelectorAll<HTMLElement>(
          'button:not(:disabled),a[href],input:not(:disabled),[tabindex="0"]',
        ),
      ].filter((e) => e.getClientRects().length);
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
      }
    };
    document.addEventListener("keydown", listener);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", listener);
      before?.focus();
    };
  }, []);
  return (
    <div
      className={modalStyles.backdrop}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        data-atelier-part="dialog"
        className={modalStyles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        tabIndex={-1}
        ref={ref}
      >
        <header>
          <h2 id={id}>{title}</h2>
          <button
            data-atelier-part="icon-button"
            className={modalStyles.iconButton}
            onClick={onClose}
            aria-label="닫기"
          >
            <UtilityIcon name="close" />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
