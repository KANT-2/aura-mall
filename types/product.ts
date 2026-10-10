export type ScentFamily = "Fresh" | "Floral" | "Woody" | "Musk"

export type Product = {
  id: number
  slug: string
  name: string
  category: string
  family: ScentFamily
  price: number // Points (P), not KRW
  volume: string
  concentration: string
  /** 상품 화면(목록·상세·관련 상품·Quick View)에서 렌더링하는 개별 상품 이미지 경로 */
  imageUrl: string
  description: string
  story: string
  notes: { top: string; heart: string; base: string }
  /** 장바구니·홈 쇼케이스의 AssetImage(CSS 배경) 키. 장바구니 저장 데이터 호환을 위해 유지 */
  image: "white-bottle" | "pink-bottle" | "amber-bottle"
  accent: string
}
