import { products as allProducts, scentFamilies } from "@/data/products"
import type { Product, ScentFamily } from "@/types/product"

export type FamilyFilter = ScentFamily | "All"
export type SortKey = "default" | "low" | "high"

export const sortOptions: { value: SortKey; label: string }[] = [
  { value: "default", label: "기본순" },
  { value: "low", label: "포인트 낮은 순" },
  { value: "high", label: "포인트 높은 순" },
]

/** 검색 보조용 한글 표기. 화면의 계열명은 영문을 그대로 사용한다. */
export const familyKoreanLabels: Record<ScentFamily, string> = {
  Fresh: "프레시",
  Floral: "플로럴",
  Woody: "우디",
  Musk: "머스크",
}

export const noteStages = [
  { key: "top", label: "TOP", copy: "첫 순간을 여는 투명하고 선명한 인상" },
  { key: "heart", label: "HEART", copy: "향의 중심에서 부드럽게 피어나는 온도" },
  { key: "base", label: "BASE", copy: "피부 가까이에 오래 남는 고요한 잔향" },
] as const

/** URL의 family 값을 대소문자 구분 없이 해석한다. 알 수 없는 값은 null. */
export function parseFamily(value: string | null): ScentFamily | null {
  if (!value) return null
  const normalized = value.trim().toLowerCase()
  return scentFamilies.find((family) => family.toLowerCase() === normalized) ?? null
}

const searchText = (product: Product) =>
  [
    product.name,
    product.family,
    familyKoreanLabels[product.family],
    product.notes.top,
    product.notes.heart,
    product.notes.base,
  ]
    .join(" ")
    .toLowerCase()

/** 검색어(공백으로 나눈 모든 단어 포함)·향 계열·정렬을 함께 적용한다. 원본 배열은 변경하지 않는다. */
export function filterProducts(
  list: readonly Product[],
  { query, family, sort }: { query: string; family: FamilyFilter; sort: SortKey },
) {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const result = list.filter(
    (product) =>
      (family === "All" || product.family === family) &&
      terms.every((term) => searchText(product).includes(term)),
  )
  // Array.prototype.sort는 안정 정렬이므로 같은 포인트는 기본 순서를 유지한다.
  if (sort === "low") return [...result].sort((a, b) => a.price - b.price)
  if (sort === "high") return [...result].sort((a, b) => b.price - a.price)
  return result
}

/** 같은 향 계열을 먼저, 부족하면 기본 순서의 다른 상품으로 채운다. 자신·중복 제외. */
export function getRelatedProducts(product: Product, list: readonly Product[] = allProducts, limit = 3) {
  const others = list.filter((item) => item.slug !== product.slug)
  const sameFamily = others.filter((item) => item.family === product.family)
  const rest = others.filter((item) => item.family !== product.family)
  const items = [...sameFamily, ...rest].slice(0, limit)
  return { items, sameFamilyCount: Math.min(sameFamily.length, limit) }
}

const koreanCounts = ["", "한", "두", "세", "네", "다섯", "여섯", "일곱", "여덟", "아홉", "열", "열한", "열두"]

/** 6 → "여섯 가지" */
export const countLabel = (count: number) => `${koreanCounts[count] ?? count} 가지`
