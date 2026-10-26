"use client";
export function Quantity({
  n,
  set,
  max,
  disabled = false,
}: {
  n: number;
  set: (n: number) => void;
  max: number;
  disabled?: boolean;
}) {
  return (
    <div className="quantity">
      <button disabled={disabled || n <= 1} aria-label="수량 줄이기" onClick={() => set(n - 1)}>
        −
      </button>
      <output aria-live="polite">{n}</output>
      <button disabled={disabled || n >= max} aria-label="수량 늘리기" onClick={() => set(n + 1)}>
        +
      </button>
    </div>
  );
}
