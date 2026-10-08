export type ScentFamily = "Fresh" | "Floral" | "Woody" | "Musk"

export type Product = {
  id: number
  slug: string
  name: string
  category: string
  family: ScentFamily
  price: number // Points (P), not KRW
  imageUrl: string
  description: string
  story: string
  notes: { top: string; heart: string; base: string }
  image: "white-bottle" | "pink-bottle" | "amber-bottle"
  accent: string
}
