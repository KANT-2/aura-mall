import type { Product, ScentFamily } from "@/types/product"
export type { Product, ScentFamily } from "@/types/product"

export const products: Product[] = [
  {
    id: 1,
    category: "Fragrance",
    imageUrl: "/assets/aura-original/white-bottle.png",
    slug: "bergamot-veil",
    name: "Bergamot Veil",
    family: "Fresh",
    price: 38000,
    volume: "50mL",
    concentration: "Eau de Parfum",
    description: "투명한 베르가못 사이로 번지는 고요한 아침의 빛",
    story:
      "갓 걷어 올린 리넨 커튼 사이, 서늘한 햇빛이 피부에 내려앉는 순간을 담았습니다. 선명한 시트러스가 아이리스의 부드러운 결을 지나 맑은 우드로 잔잔하게 이어집니다.",
    notes: { top: "Bergamot", heart: "Iris", base: "White Cedar" },
    image: "white-bottle",
    accent: "dew",
  },
  {
    id: 2,
    category: "Fragrance",
    imageUrl: "/assets/aura-original/pink-bottle.png",
    slug: "petal-haze",
    name: "Petal Haze",
    family: "Floral",
    price: 42000,
    volume: "50mL",
    concentration: "Eau de Parfum",
    description: "꽃잎과 살결 사이, 흐릿하게 머무는 핑크빛 잔향",
    story:
      "만개하기 직전의 작약과 깨끗한 머스크가 만나는 순간. 화려함보다 여백을 남기는 플로럴 향으로, 피부 가까이에서 오래도록 섬세하게 피어납니다.",
    notes: { top: "Pink Pepper", heart: "Peony", base: "Skin Musk" },
    image: "pink-bottle",
    accent: "rose",
  },
  {
    id: 3,
    category: "Fragrance",
    imageUrl: "/assets/aura-original/amber-bottle.png",
    slug: "cedar-trace",
    name: "Cedar Trace",
    family: "Woody",
    price: 46000,
    volume: "50mL",
    concentration: "Eau de Parfum",
    description: "마른 나무결 위에 남겨진 따뜻하고 정제된 흔적",
    story:
      "성수의 오래된 목재 작업실에서 영감받은 향입니다. 건조한 시더우드와 부드러운 스웨이드가 차분한 온도를 만들고, 앰버가 은근한 깊이를 더합니다.",
    notes: { top: "Juniper", heart: "Suede", base: "Cedarwood" },
    image: "amber-bottle",
    accent: "amber",
  },
  {
    id: 4,
    category: "Fragrance",
    imageUrl: "/assets/aura-original/white-bottle.png",
    slug: "soft-skin",
    name: "Soft Skin",
    family: "Musk",
    price: 40000,
    volume: "50mL",
    concentration: "Eau de Parfum",
    description: "깨끗한 셔츠와 피부의 온기를 닮은 포근한 머스크",
    story:
      "향수를 뿌렸다는 사실보다 원래의 체향처럼 느껴지는 향. 알데하이드의 투명함 위로 코튼과 화이트 머스크가 포근하게 포개집니다.",
    notes: { top: "Aldehyde", heart: "Cotton", base: "White Musk" },
    image: "white-bottle",
    accent: "mist",
  },
  {
    id: 5,
    category: "Fragrance",
    imageUrl: "/assets/aura-original/pink-bottle.png",
    slug: "fig-reverie",
    name: "Fig Reverie",
    family: "Woody",
    price: 48000,
    volume: "50mL",
    concentration: "Eau de Parfum",
    description: "무화과 잎의 초록빛과 크리미한 우드의 몽상",
    story:
      "햇볕에 데워진 무화과나무 아래의 느린 오후. 풋풋한 잎과 밀키한 과육, 샌들우드의 부드러운 결이 한 장면처럼 이어집니다.",
    notes: { top: "Fig Leaf", heart: "Fig Milk", base: "Sandalwood" },
    image: "pink-bottle",
    accent: "sage",
  },
  {
    id: 6,
    category: "Fragrance",
    imageUrl: "/assets/aura-original/amber-bottle.png",
    slug: "amber-dusk",
    name: "Amber Dusk",
    family: "Woody",
    price: 52000,
    volume: "50mL",
    concentration: "Eau de Parfum",
    description: "해 질 녘의 공기처럼 짙고 부드러운 앰버 우드",
    story:
      "도시의 빛이 낮아지는 시간, 스파이시한 레진과 앰버가 천천히 온도를 높입니다. 깊지만 무겁지 않은 저녁의 향입니다.",
    notes: { top: "Saffron", heart: "Labdanum", base: "Amberwood" },
    image: "amber-bottle",
    accent: "dusk",
  },
]

export const scentFamilies: ScentFamily[] = ["Fresh", "Floral", "Woody", "Musk"]

export const findProductBySlug = (slug: string) =>
  products.find((product) => product.slug === slug)

export const formatPoint = (value: number) =>
  `${new Intl.NumberFormat("ko-KR").format(value)}P`
