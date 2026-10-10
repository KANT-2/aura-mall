import type { ReactNode } from "react"

// AuraSite의 Icon과 같은 형태. 상품 컴포넌트가 AuraSite를 import하지 않도록(순환 방지) 필요한 아이콘만 둔다.
type ProductIconName = "arrow" | "chevron" | "close" | "search"

const paths: Record<ProductIconName, ReactNode> = {
  arrow: <path d="M5 12h14M14 7l5 5-5 5" />,
  chevron: <path d="m8 10 4 4 4-4" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6" />
      <path d="m16 16 4 4" />
    </>
  ),
}

export function ProductIcon({ name }: { name: ProductIconName }) {
  return (
    <svg aria-hidden="true" className="icon" fill="none" viewBox="0 0 24 24">
      <g stroke="currentColor" strokeLinecap="round" strokeWidth="1.5">
        {paths[name]}
      </g>
    </svg>
  )
}
