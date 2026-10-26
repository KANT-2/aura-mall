"use client";
import { useRef, useState, type ReactNode } from "react";

export function ProductRail({ children }: { children: ReactNode }) {
  const rail = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(0);
  const [end, setEnd] = useState(false);
  return (
    <>
      <div
        className="product-rail"
        ref={rail}
        onScroll={() => {
          if (rail.current) {
            setPosition(rail.current.scrollLeft);
            setEnd(
              rail.current.scrollLeft + rail.current.clientWidth >= rail.current.scrollWidth - 3,
            );
          }
        }}
      >
        {children}
      </div>
      <div className="rail-controls">
        <span>AURA SELECTED / 06</span>
        <button
          disabled={position < 1}
          aria-label="이전 상품"
          onClick={() => rail.current?.scrollBy({ left: -380, behavior: "smooth" })}
        >
          ←
        </button>
        <button
          disabled={end}
          aria-label="다음 상품"
          onClick={() => rail.current?.scrollBy({ left: 380, behavior: "smooth" })}
        >
          →
        </button>
      </div>
    </>
  );
}
