"use client"

import {
  CSSProperties,
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react"
import { formatPoint, products } from "@/data/products"
import type { Product, ScentFamily } from "@/types/product"
import NextLink from "next/link"
import { BlendVessel } from "@/components/BlendVessel"
import { AtelierFlask, AtelierProductVisual } from "./AtelierVisuals"
import { AtelierNaming, normalizeBlendName, suggestBlendNames } from "./AtelierNaming"
import { describeBlend } from "./AtelierDescription"
import "./AtelierProductName.css"
import { type AuraMember, currentMember, signOut, registerMember, authenticateMember } from "@/components/LocalAccount"
import { useRouter, useSearchParams } from "next/navigation"

type ShopCartItem = {
  kind: "product"
  id: string
  product: Product
  quantity: number
}
type CustomCartItem = {
  kind: "custom"
  id: string
  quantity: number
  recipeId: RecipeId
  recipeName: string
  ingredients: string[]
  productType: ProductType
  pointPrice: number
  image: string
}
type CartItem = ShopCartItem | CustomCartItem
type PointTransaction = {
  id: string
  label: string
  detail: string
  amount: number
  date: string
}
type AppState = {
  points: number
  user: AuraMember | null
  setSignedInUser: (user:AuraMember)=>void
  logout: ()=>void
  recoveryPending: number
  pointHistory: PointTransaction[]
  cart: CartItem[]
  addToCart: (product: Product, quantity?: number) => void
  addCustomToCart: (
    item: Omit<CustomCartItem, "kind" | "id" | "quantity">,
  ) => void
  changeQuantity: (id: string, quantity: number) => void
  removeFromCart: (id: string) => void
  redeem: (total: number) => boolean
}

type RecipeId = "R01" | "R02" | "R03"
type ProductType = "Hand Cream" | "Diffuser" | "Perfume"
type AtelierStage = "EMPTY" | "TOP_SELECTED" | "HEART_SELECTED" | "BASE_SELECTED" | "READY" | "BLENDING" | "REVEAL" | "BOTTLE" | "PRODUCT_SELECTION" | "SUMMARY"

type AtelierRecipe = {
  id: RecipeId
  name: string
  mood: string
  moodKey: string
  description: string
  ingredients: { top: string; heart: string; base: string }
  art: string
  bottle: string
  color: string
}

type AtelierSession = {
  stage: AtelierStage
  selected: string[]
  productType: ProductType
  name: string
}

const atelierRecipes: AtelierRecipe[] = [
  {
    id: "R01",
    name: "Clear Veil",
    mood: "Fresh / Woody",
    moodKey: "clear",
    description: "차가운 빛과 마른 나무결이 겹쳐지는 투명한 잔향",
    ingredients: { top: "Bergamot", heart: "Fig", base: "Cedarwood" },
    art: "aqua-art",
    bottle: "white-bottle",
    color: "clear",
  },
  {
    id: "R02",
    name: "Petal Skin",
    mood: "Floral / Musk",
    moodKey: "soft",
    description: "부드러운 꽃잎과 깨끗한 피부의 온도를 닮은 향",
    ingredients: { top: "Mandarin", heart: "Peony", base: "White Musk" },
    art: "pink-art",
    bottle: "pink-bottle",
    color: "petal",
  },
  {
    id: "R03",
    name: "Warm Trace",
    mood: "Woody / Citrus",
    moodKey: "warm",
    description: "따뜻한 시트러스와 샌들우드가 남기는 깊은 흔적",
    ingredients: { top: "Grapefruit", heart: "Neroli", base: "Sandalwood" },
    art: "amber-art",
    bottle: "amber-bottle",
    color: "warm",
  },
]

const atelierProducts: Record<ProductType, {
  price: number
  korean: string
  caption: string
}> = {
  "Hand Cream": {
    price: 25000,
    korean: "핸드크림",
    caption: "손끝에 은은하게 머무는 향",
  },
  Diffuser: {
    price: 35000,
    korean: "디퓨저",
    caption: "공간 전체로 천천히 번지는 향",
  },
  Perfume: {
    price: 50000,
    korean: "오 드 퍼퓸",
    caption: "피부 위에서 가장 선명해지는 향",
  },
}

const AppStateContext = createContext<AppState | null>(null)

function useAppState() {
  const value = useContext(AppStateContext)
  if (!value) throw new Error("AURA 상태를 찾을 수 없습니다.")
  return value
}

type IconName = "arrow" | "bag" | "chevron" | "close" | "menu" | "search"

function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, ReactNode> = {
    arrow: <path d="M5 12h14M14 7l5 5-5 5" />,
    bag: (
      <>
        <path d="M5 8h14l-1 12H6L5 8Z" />
        <path d="M9 9V6a3 3 0 0 1 6 0v3" />
      </>
    ),
    chevron: <path d="m8 10 4 4 4-4" />,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    menu: <path d="M4 8h16M4 16h16" />,
    search: (
      <>
        <circle cx="11" cy="11" r="6" />
        <path d="m16 16 4 4" />
      </>
    ),
  }
  return (
    <svg aria-hidden="true" className="icon" fill="none" viewBox="0 0 24 24">
      <g stroke="currentColor" strokeLinecap="round" strokeWidth="1.5">
        {paths[name]}
      </g>
    </svg>
  )
}

function Title({
  as = "h2",
  className = "",
  children,
}: {
  as?: "h1" | "h2" | "h3"
  className?: string
  children: ReactNode
}) {
  const Tag = as
  return <Tag className={className}>{children}</Tag>
}

function Link({
  href,
  className = "",
  children,
  onClick,
  ariaLabel,
}: {
  href: string
  className?: string
  children: ReactNode
  onClick?: () => void
  ariaLabel?: string
}) {
  return (
    <NextLink
      aria-label={ariaLabel}
      className={className}
      href={href}
      onClick={onClick}
    >
      {children}
    </NextLink>
  )
}

function Button({
  children,
  className = "",
  onClick,
  type = "button",
  ariaLabel,
  disabled = false,
  ariaPressed,
}: {
  children?: ReactNode
  className?: string
  onClick?: () => void
  type?: "button" | "submit"
  ariaLabel?: string
  disabled?: boolean
  ariaPressed?: boolean
}) {
  return (
    <button
      aria-label={ariaLabel}
      aria-pressed={ariaPressed}
      className={className}
      disabled={disabled}
      onClick={onClick}
      type={type}
    >
      {children}
    </button>
  )
}

function Header() {
  const [open, setOpen] = useState(false)
  const [walletOpen, setWalletOpen] = useState(false)
  const { cart, points, user, logout } = useAppState()
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0)
  const links = [
    ["/products", "컬렉션"],
    ["/custom", "MY AURA"],
    ["/cards", "AURA 카드"],
  ]
  const closeWallet = () => {
    setWalletOpen(false)
    window.setTimeout(
      () => document.querySelector<HTMLButtonElement>(".points-link")?.focus(),
      0,
    )
  }

  return (
    <>
      <header className="site-header">
        <div className="header-inner">
          <Button
            ariaLabel={open ? "메뉴 닫기" : "메뉴 열기"}
            className="icon-button mobile-menu"
            onClick={() => setOpen(!open)}
          >
            <Icon name={open ? "close" : "menu"} />
          </Button>
          <Link ariaLabel="AURA 홈" className="brand-logo" href="/">
            AURA
          </Link>
          <nav className={`primary-nav ${open ? "is-open" : ""}`}>
            {links.map(([href, label]) => (
              <Link href={href} key={href} onClick={() => setOpen(false)}>
                {label}
              </Link>
            ))}
            {user && <Link className="mobile-only-link" href="/mypage" onClick={()=>setOpen(false)}>마이페이지</Link>}
            {user && <Button className="mobile-only-link mobile-logout" onClick={()=>{logout();setOpen(false)}}>로그아웃</Button>}
            <Link
              className="mobile-only-link"
              href="/cart"
              onClick={() => setOpen(false)}
            >
              장바구니 {cartCount}
            </Link>
          </nav>
          <div className="header-actions">
            {user ? <>
              <Button ariaLabel="포인트 지갑 열기" className="points-link" onClick={() => setWalletOpen(true)}>
                <span>내 포인트</span><strong>{formatPoint(points)}</strong>
              </Button>
              <Link className="account-link" href="/mypage" ariaLabel="마이페이지">{user.name}님</Link>
              <Button className="logout-link" onClick={()=>{setWalletOpen(false);logout();setOpen(false)}}>로그아웃</Button>
            </> : <>
              <Link className="login-link" href="/login">로그인</Link>
              <Link className="signup-link" href="/signup">회원가입</Link>
            </>}
            <Link
              ariaLabel={`장바구니 ${cartCount}개`}
              className="bag-link"
              href="/cart"
            >
              <Icon name="bag" />
              <span>{cartCount}</span>
            </Link>
          </div>
        </div>
      </header>
      {user && <PointWallet open={walletOpen} onClose={closeWallet} />}
    </>
  )
}

function PointWallet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { points, recoveryPending, pointHistory } = useAppState()

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
      if (event.key === "Tab") {
        const focusable = Array.from(
          document.querySelectorAll<HTMLElement>(
            ".point-wallet button:not(:disabled), .point-wallet a[href]",
          ),
        )
        if (!focusable.length) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first.focus()
        }
      }
    }
    window.addEventListener("keydown", onKey)
    window.setTimeout(
      () =>
        document
          .querySelector<HTMLButtonElement>(".point-wallet .icon-button")
          ?.focus(),
      0,
    )
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])

  return (
    <div
      aria-hidden={!open}
      className={`wallet-layer ${open ? "is-open" : ""}`}
    >
      <Button
        ariaLabel="포인트 지갑 닫기"
        className="wallet-backdrop"
        onClick={onClose}
      />
      <aside
        aria-label="AURA 포인트 지갑"
        aria-modal="true"
        className="point-wallet"
        role="dialog"
      >
        <div className="wallet-head">
          <div>
            <p className="eyebrow">AURA POINT WALLET</p>
            <Title as="h3">내 포인트</Title>
          </div>
          <Button ariaLabel="닫기" className="icon-button" onClick={onClose}>
            <Icon name="close" />
          </Button>
        </div>
        <div className="wallet-balance">
          <span>사용 가능 포인트</span>
          <strong>{formatPoint(Math.max(0, points))}</strong>
          <p>상품을 장바구니에 담을 때는 차감되지 않습니다.</p>
        </div>
        <div className="wallet-status-grid">
          <div>
            <span>카드 등급</span>
            <strong>Velvet · TASTE</strong>
          </div>
          <div>
            <span>회수 대기 포인트</span>
            <strong>{formatPoint(recoveryPending)}</strong>
          </div>
        </div>
        <div className="wallet-history">
          <div className="wallet-section-title">
            <strong>포인트 사용 내역</strong>
            <span>{pointHistory.length}건</span>
          </div>
          {pointHistory.length ? (
            pointHistory.map((transaction) => (
              <article key={transaction.id}>
                <div>
                  <strong>{transaction.label}</strong>
                  <span>
                    {transaction.date} · {transaction.detail}
                  </span>
                </div>
                <em>{formatPoint(transaction.amount)}</em>
              </article>
            ))
          ) : (
            <div className="wallet-empty">
              <span>아직 교환 내역이 없어요.</span>
              <p>포인트 교환이 완료되면 이곳에 기록됩니다.</p>
            </div>
          )}
        </div>
        <div className="wallet-notice">
          <strong>포인트 회수 안내</strong>
          <p>
            회수 예정 포인트가 잔액보다 큰 경우 사용 가능 포인트는 0P로
            표시되며, 초과분은 회수 대기로 분리됩니다.
          </p>

        </div>
      </aside>
    </div>
  )
}

function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-main">
        <div>
          <p className="footer-logo">AURA</p>
          <p className="footer-tagline">From Scent to Identity.</p>
        </div>
        <div className="footer-links">
          <div>
            <p className="footer-label">EXPLORE</p>
            <Link href="/products">컬렉션</Link>
            <Link href="/custom">MY AURA</Link>
            <Link href="/cards">AURA 카드</Link>
          </div>
          <div>
            <p className="footer-label">SUPPORT</p>
            <Link href="/cards">카드 혜택 안내</Link>
            <Link href="/mypage">내 포인트</Link>
            <Link href="/login">내 계정</Link>
          </div>
        </div>
      </div>
      <div className="footer-bottom">
        <span>© 2026 AURA. From Scent to Identity.</span>
        <span>향과 취향을 연결하는 AURA</span>
      </div>
    </footer>
  )
}

function AssetImage({
  asset,
  className = "",
  label,
}: {
  asset: string
  className?: string
  label: string
}) {
  return (
    <div
      aria-label={label}
      className={`asset-image asset-${asset} ${className}`}
      role="img"
    />
  )
}

function CtaLink({
  href,
  children,
  light = false,
}: {
  href: string
  children: ReactNode
  light?: boolean
}) {
  return (
    <Link className={`cta-link ${light ? "is-light" : ""}`} href={href}>
      <span>{children}</span>
      <Icon name="arrow" />
    </Link>
  )
}

function SectionHeading({
  eyebrow,
  title,
  body,
}: {
  eyebrow: string
  title: string
  body?: string
}) {
  return (
    <div className="section-heading">
      <p className="eyebrow">{eyebrow}</p>
      <Title className="section-title">{title}</Title>
      {body && <p className="section-copy">{body}</p>}
    </div>
  )
}

function ProductCard({
  product,
  index = 0,
}: {
  product: Product
  index?: number
}) {
  return (
    <article className="product-card">
      <Link
        ariaLabel={`${product.name} 상세 보기`}
        className={`product-visual tone-${product.accent}`}
        href={`/products/${product.slug}`}
      >
        <span className="product-index">
          {String(index + 1).padStart(2, "0")}
        </span>
        <AssetImage
          asset={product.image}
          label={`${product.name} 향수 이미지`}
        />
        <span className="product-image-name">{product.name}</span>
        <span className="view-label">
          VIEW SCENT <Icon name="arrow" />
        </span>
      </Link>
      <div className="product-card-info">
        <div>
          <p className="product-family">{product.family} · 50mL</p>
          <Title as="h3" className="product-name">
            {product.name}
          </Title>
          <p className="product-description">{product.description}</p>
        </div>
        <strong className="product-price">{formatPoint(product.price)}</strong>
      </div>
    </article>
  )
}

export function HomePage() {
  const { points, user } = useAppState()
  const feature = products.find((item)=>item.slug==="fig-reverie") || products[4]
  return <main className="editorial-home">
    <section className="hero hero-story">
      <div className="hero-copy">
        <p className="eyebrow">AURA — THE SCENT VEIL</p>
        <Title as="h1" className="hero-title">From Scent<br/>to <em>Identity.</em></Title>
        <p className="hero-korean">일상의 포인트가,<br/>나만의 향이 되다.</p>
        <p className="hero-subcopy">취향에 맞는 향을 발견하고, 마음에 남는 리워드를 AURA 포인트로 만나보세요.</p>
        <div className="hero-actions"><CtaLink href="/products">컬렉션 둘러보기</CtaLink><Link className="text-link" href="/custom">MY AURA 알아보기 <Icon name="arrow"/></Link></div>
      </div>
      <div className="hero-art"><span className="hero-art-caption">AURA EAU DE PARFUM · SCENT COLLECTION</span><AssetImage asset="hero-bottles" label="AURA 향수병 컬렉션"/></div>
    </section>
    <section className="featured editorial-section page-shell section-pad" id="collection">
      <SectionHeading eyebrow="01 — THE AURA EDIT" title="지금, 만나고 싶은 세 가지 향." body="서로 다른 순간을 담은 AURA의 큐레이션. 산뜻한 아침부터 차분한 저녁의 잔향까지."/>
      <div className="featured-grid">{products.slice(0,3).map((product,index)=><ProductCard key={product.slug} product={product} index={index}/>)}</div>
      <div className="section-end-link"><CtaLink href="/products">전체 컬렉션 보기</CtaLink></div>
    </section>
    <section className="special-showcase" id="showcase">
      <div className="showcase-art"><AssetImage asset={feature.image} label={`${feature.name} 시그니처 향수`}/><img src="/assets/ingredients/fig.png" alt="무화과 일러스트" className="showcase-fig"/></div>
      <div className="showcase-copy"><p className="eyebrow">02 — AURA SPECIAL SHOWCASE</p><span className="showcase-index">THE WOODY EDIT / 01</span><Title>Fig Reverie</Title><h3>무화과나무 아래,<br/>조금 느린 오후.</h3><p>푸른 무화과 잎과 부드러운 우드. 익숙한 오후의 풍경을 하나의 향으로 간직하세요.</p><div className="showcase-notes"><span>FIG</span><span>WOODY</span><span>SANDALWOOD</span></div><CtaLink href="/products/fig-reverie" light>향 자세히 보기</CtaLink></div>
    </section>
    <section className="families section-pad editorial-section" id="scents"><div className="page-shell">
      <SectionHeading eyebrow="03 — FIND YOUR SCENT" title="오늘, 어떤 향이 끌리나요?" body="향의 이름보다 먼저 끌리는 감각. 네 가지 향 계열에서 시작해 보세요."/>
      <div className="family-grid">{[
        ["Fresh","맑게 시작되는 첫인상","bergamot"],
        ["Floral","부드럽게 피어나는 향","peony"],
        ["Woody","차분하고 깊이 남는 잔향","cedarwood"],
        ["Musk","피부 가까이 머무는 향","white-musk"],
      ].map(([name,copy,img],index)=><Link className="family-item" href={`/products?family=${name}`} key={name}>
        <img className="family-illustration" alt="" src={`/assets/ingredients/${img}.png`}/>
        <span className="family-number">0{index+1}</span><span className="family-copy">{copy}</span><strong>{name}</strong><Icon name="arrow"/>
      </Link>)}</div>
    </div></section>
    <section className="atelier-feature editorial-section" id="atelier"><AssetImage asset="atelier-flasks" label="AURA 조향 플라스크"/><div className="atelier-copy"><p className="eyebrow">04 — MY AURA PERSONAL ATELIER</p><Title>보이지 않는 향을<br/>눈앞의 형태로.</Title><p>TOP, HEART, BASE의 향료를 자유롭게 고르고, 용기를 움직여 향을 직접 섞어 보세요. 지금의 취향이 하나의 향으로 완성됩니다.</p><CtaLink href="/custom" light>나만의 향 구성하기</CtaLink></div></section>
    <section className="point-experience editorial-section section-pad page-shell"><SectionHeading eyebrow="05 — AURA POINT" title="쌓인 포인트가,
좋아하는 향으로." body="카드 이용으로 쌓은 포인트로 컬렉션과 MY AURA의 리워드를 만나보세요."/>
      <div className="journey-grid">{[["01","Earn","일상에서 포인트를 쌓고"],["02","Discover","좋아하는 향을 발견하고"],["03","Redeem","포인트로 리워드를 교환하세요"]].map(([n,title,copy])=><div className="journey-step" key={n}><span>{n}</span><Title as="h3">{title}</Title><p>{copy}</p></div>)}</div>
      <div className="home-wallet-bridge"><div><span>{user ? "사용 가능 포인트" : "MY AURA POINT"}</span><strong>{user ? formatPoint(points) : "내 포인트를 확인해 보세요"}</strong></div><CtaLink href={user?"/mypage":"/login"}>{user?"포인트 내역 보기":"로그인하기"}</CtaLink></div>
    </section>
    <section className="card-preview editorial-section section-pad" id="cards"><div className="page-shell"><SectionHeading eyebrow="06 — AURA CARD" title="일상의 소비가,
취향을 위한 혜택으로." body="다양한 라이프스타일을 위한 세 가지 카드. 적립한 포인트를 향의 경험으로 연결해 보세요."/><div className="cards-stage"><CreditCard name="Dew" tier="START" className="card-dew"/><CreditCard name="Velvet" tier="TASTE" className="card-velvet"/><CreditCard name="Amber" tier="PRIVILEGE" className="card-amber"/></div><p className="card-perfumery">PARTNER PERFUMERY · 카드 공통 5% 할인 혜택</p><div className="section-end-link"><CtaLink href="/cards">카드 혜택 비교하기</CtaLink></div></div></section>
    <section className="closing editorial-section"><AssetImage asset="closing-art" label="AURA 유리 아트 오브젝트"/><div><p className="eyebrow">07 — FROM SCENT TO IDENTITY</p><Title>향은 보이지 않지만,<br/>취향은 선명하게 남습니다.</Title><CtaLink href="/products" light>컬렉션 둘러보기</CtaLink></div></section>
  </main>
}

function CreditCard({
  name,
  tier,
  className,
}: {
  name: string
  tier: string
  className: string
}) {
  return (
    <div className={`credit-card ${className}`}>
      <div className="card-top">
        <span>AURA</span>
        <span>{tier}</span>
      </div>
      <span className="card-chip" />
      <div className="card-number">
        4821&nbsp;&nbsp;••••&nbsp;&nbsp;••••&nbsp;&nbsp;0926
      </div>
      <div className="card-bottom">
        <strong>{name}</strong>
        <span>MEMBER SINCE 2026</span>
      </div>
    </div>
  )
}

export function CollectionPage() {
  const params = useSearchParams()
  const initialFamily = params.get("family") as ScentFamily | null
  const [query, setQuery] = useState("")
  const [family, setFamily] = useState<ScentFamily | "All">(
    ["Fresh", "Floral", "Woody", "Musk"].includes(initialFamily || "")
      ? initialFamily!
      : "All",
  )
  const [sort, setSort] = useState("recommended")

  const filtered = useMemo(() => {
    const result = products.filter(
      (product) =>
        (family === "All" || product.family === family) &&
        `${product.name} ${product.notes.top} ${product.notes.heart} ${product.notes.base}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    if (sort === "low") return [...result].sort((a, b) => a.price - b.price)
    if (sort === "high") return [...result].sort((a, b) => b.price - a.price)
    return result
  }, [family, query, sort])

  return (
    <main className="collection-page">
      <section className="collection-hero page-shell">
        <div>
          <p className="eyebrow">AURA COLLECTION · 50mL</p>
          <Title as="h1">
            Find Your
            <br />
            <em>Scent Veil.</em>
          </Title>
        </div>
        <p>
          향은 기억보다 먼저 당신을 말합니다.
          <br />
          피부 위에서 완성되는 여섯 가지 AURA를 만나보세요.
        </p>
      </section>

      <section className="shop-controls page-shell">
        <label className="search-box">
          <Icon name="search" />
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="향수 이름이나 향 노트를 검색해 보세요."
            type="search"
            value={query}
          />
        </label>
        <div className="filter-row">
          <div className="filter-tabs" role="group" aria-label="향 계열 필터">
            {(["All", "Fresh", "Floral", "Woody", "Musk"] as const).map(
              (item) => (
                <Button
                  className={family === item ? "is-active" : ""}
                  key={item}
                  onClick={() => setFamily(item)}
                >
                  {item === "All" ? "전체" : item}
                </Button>
              ),
            )}
          </div>
          <label className="sort-select">
            <select
              onChange={(event) => setSort(event.target.value)}
              value={sort}
            >
              <option value="recommended">추천순</option>
              <option value="low">포인트 낮은 순</option>
              <option value="high">포인트 높은 순</option>
            </select>
            <Icon name="chevron" />
          </label>
        </div>
      </section>

      <section className="shop-results page-shell">
        <p className="result-count">
          총 <strong>{filtered.length}</strong>개의 향
        </p>
        {filtered.length ? (
          <div className="product-grid">
            {filtered.map((product, index) => (
              <ProductCard index={index} key={product.slug} product={product} />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <p className="eyebrow">NO SCENT FOUND</p>
            <Title>조건에 맞는 향을 찾지 못했어요.</Title>
            <p>검색어를 바꾸거나 다른 향 계열을 선택해 보세요.</p>
            <Button
              onClick={() => {
                setQuery("")
                setFamily("All")
              }}
            >
              전체 향 보기
            </Button>
          </div>
        )}
      </section>

      <section className="my-aura-banner page-shell">
        <AssetImage asset="pink-art" label="핑크 플로럴 AURA 아트 오브젝트" />
        <div>
          <p className="eyebrow">CAN'T FIND YOUR SCENT?</p>
          <Title>
            찾는 향이 없다면,
            <br />
            직접 만들어 보세요.
          </Title>
          <p>
            세 가지 노트를 고르고 당신만의 향을 완성하는 가이드형 조향 경험.
          </p>
          <CtaLink href="/custom" light>
            MY AURA 시작하기
          </CtaLink>
        </div>
      </section>
    </main>
  )
}

function QuantityControl({
  value,
  onChange,
}: {
  value: number
  onChange: (next: number) => void
}) {
  return (
    <div className="quantity-control">
      <Button
        ariaLabel="수량 줄이기"
        onClick={() => onChange(Math.max(1, value - 1))}
      >
        −
      </Button>
      <span>{value}</span>
      <Button ariaLabel="수량 늘리기" onClick={() => onChange(value + 1)}>
        +
      </Button>
    </div>
  )
}

export function ProductDetailPage({ product }: { product: Product }) {
  const [quantity, setQuantity] = useState(1)
  const [added, setAdded] = useState(false)
  const { addToCart, points, user } = useAppState()
  const canAfford = points >= product.price * quantity
  const recommended = products
    .filter((item) => item.slug !== product.slug)
    .slice(0, 3)
  const add = () => {
    addToCart(product, quantity)
    setAdded(true)
    window.setTimeout(() => setAdded(false), 1800)
  }

  return (
    <main className="detail-page">
      <div className="breadcrumb page-shell">
        <Link href="/products">컬렉션</Link>
        <span>/</span>
        <span>{product.name}</span>
      </div>
      <section className="detail-main page-shell">
        <div className={`detail-gallery tone-${product.accent}`}>
          <span className="gallery-caption">AURA EAU DE PARFUM · 50mL</span>
          <AssetImage
            asset={product.image}
            label={`${product.name} 정면 제품 이미지`}
          />
          <span className="detail-image-name">{product.name}</span>
          <div className="gallery-thumbs">
            <span className="is-active">01</span>
            <span>02</span>
            <span>03</span>
          </div>
        </div>
        <div className="detail-info">
          <p className="product-family">{product.family} · EAU DE PARFUM</p>
          <Title as="h1">{product.name}</Title>
          <p className="detail-description">{product.description}</p>
          <p className="detail-story">{product.story}</p>
          <div className="detail-price">
            <span>필요 포인트</span>
            <strong>{formatPoint(product.price)}</strong>
          </div>
          {user && <div className="balance-line"><span>현재 보유 포인트</span><strong>{formatPoint(points)}</strong></div>}
          <div className="purchase-row">
            <QuantityControl onChange={setQuantity} value={quantity} />
            <Button
              className="primary-button"
              onClick={add}
            >
              {added ? "장바구니에 담았어요" : "장바구니 담기"}
            </Button>
          </div>
          <p className="policy-note">
            AURA 카드 회원 전용 · 100% 포인트 교환 상품
          </p>
          <div className="detail-accordions">
            <details open>
              <summary>
                패키징 디테일 <span>+</span>
              </summary>
              <p>
                재활용 가능한 종이 패키지와 유리 보틀, AURA 시그니처 태그로
                구성됩니다.
              </p>
            </details>
            <details>
              <summary>
                교환 안내 <span>+</span>
              </summary>
              <p>
                상품을 장바구니에 담은 뒤 교환 내용을 확인할 수 있어요. 교환 시 보유한 AURA 포인트를 사용합니다.
              </p>
            </details>
          </div>
        </div>
      </section>

      <section className="notes-section page-shell section-pad">
        <SectionHeading
          eyebrow="SCENT NOTES"
          title="피부 위에서 이어지는 향의 결"
        />
        <div className="notes-grid">
          {[
            ["TOP", product.notes.top, "첫 순간을 여는 투명하고 선명한 인상"],
            [
              "HEART",
              product.notes.heart,
              "향의 중심에서 부드럽게 피어나는 온도",
            ],
            ["BASE", product.notes.base, "피부 가까이에 오래 남는 고요한 잔향"],
          ].map(([stage, note, copy], index) => (
            <div className="note-item" key={stage}>
              <span>0{index + 1}</span>
              <p>{stage}</p>
              <Title as="h3">{note}</Title>
              <p>{copy}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="recommendations page-shell section-pad">
        <SectionHeading
          eyebrow="ALSO IN YOUR AURA"
          title="이 향과 함께 만나보세요"
        />
        <div className="product-grid compact">
          {recommended.map((item, index) => (
            <ProductCard index={index} key={item.slug} product={item} />
          ))}
        </div>
      </section>
      <div className="mobile-sticky-cta">
        <div>
          <span>{product.name}</span>
          <strong>{formatPoint(product.price * quantity)}</strong>
        </div>
        <Button onClick={add}>장바구니 담기</Button>
      </div>
    </main>
  )
}

export function CartPage() {
  const { cart, points, user, changeQuantity, removeFromCart, redeem } = useAppState()
  const total = cart.reduce(
    (sum, item) =>
      sum +
      (item.kind === "product" ? item.product.price : item.pointPrice) *
        item.quantity,
    0,
  )
  const [done, setDone] = useState(false)

  if (done) {
    return (
      <main className="simple-page success-page page-shell">
        <p className="eyebrow">REDEEM COMPLETE</p>
        <Title as="h1">
          당신의 AURA를
          <br />
          교환을 완료했어요.
        </Title>
        <p>
          포인트 사용 내역은 내 포인트 지갑에서 확인할 수 있어요.
        </p>
        <CtaLink href="/products">다른 향 둘러보기</CtaLink>
      </main>
    )
  }

  return (
    <main className="simple-page page-shell">
      <p className="eyebrow">YOUR SELECTION</p>
      <Title as="h1">장바구니</Title>
      {!cart.length ? (
        <div className="empty-state cart-empty">
          <Title>아직 담긴 향이 없어요.</Title>
          <p>지금의 당신을 닮은 AURA를 발견해 보세요.</p>
          <CtaLink href="/products">컬렉션 둘러보기</CtaLink>
        </div>
      ) : (
        <div className="cart-layout">
          <div className="cart-list">
            {cart.map((item) => (
              <article className="cart-item" key={item.id}>
                <div
                  className={`cart-image ${
                    item.kind === "product"
                      ? `tone-${item.product.accent}`
                      : "tone-custom"
                  }`}
                >
                  <AssetImage
                    asset={
                      item.kind === "product" ? item.product.image : item.image
                    }
                    label={
                      item.kind === "product"
                        ? item.product.name
                        : `${item.recipeName} 커스텀 향`
                    }
                  />
                </div>
                <div className="cart-item-info">
                  <div className="cart-item-meta">
                    {item.kind === "custom" && <span>MY AURA</span>}
                    <p>
                      {item.kind === "product"
                        ? `${item.product.family} · 50mL`
                        : `${item.recipeId} · ${item.productType}`}
                    </p>
                  </div>
                  <Title as="h3">
                    {item.kind === "product"
                      ? item.product.name
                      : item.recipeName}
                  </Title>
                  {item.kind === "custom" && (
                    <div className="custom-cart-notes">
                      {["TOP", "HEART", "BASE"].map((stage, index) => (
                        <span key={stage}>
                          <small>{stage}</small>
                      {item.ingredients.filter(ingredient=>[ ["Bergamot","Mandarin","Grapefruit"], ["Fig","Peony","Neroli"], ["Cedarwood","White Musk","Sandalwood"] ][index].includes(ingredient)).join(", ") || "—"}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="cart-line-actions">
                    <strong>
                      {formatPoint(
                        item.kind === "product"
                          ? item.product.price
                          : item.pointPrice,
                      )}
                    </strong>
                    <QuantityControl
                      onChange={(quantity) => changeQuantity(item.id, quantity)}
                      value={item.quantity}
                    />
                    <Button
                      className="remove-item"
                      onClick={() => removeFromCart(item.id)}
                    >
                      삭제
                    </Button>
                  </div>
                </div>
              </article>
            ))}
          </div>
          <aside className="order-summary">
            <Title as="h3">포인트 교환 요약</Title>
            {user && <p><span>보유 포인트</span><strong>{formatPoint(points)}</strong></p>}
            <p>
              <span>필요 포인트</span>
              <strong>{formatPoint(total)}</strong>
            </p>
            {user && <div><span>교환 후 포인트</span><strong>{formatPoint(Math.max(0, points - total))}</strong></div>}
            {user && total > points && (
              <p className="shortage-notice">
                <span>부족 포인트</span>
                <strong>{formatPoint(total - points)}</strong>
              </p>
            )}
            <Button
              className="primary-button"
              disabled={!user || total > points}
              onClick={() => {
                if (user && redeem(total)) setDone(true)
              }}
            >
              {!user ? "로그인 후 교환 가능" : total <= points ? "포인트로 교환하기" : `${formatPoint(total - points)} 부족해요`}
            </Button>
            {!user && <Link className="cart-login" href="/login?next=%2Fcart">로그인하고 내 포인트 확인하기 →</Link>}
          </aside>
        </div>
      )}
    </main>
  )
}

export function AtelierPage() {
  const router = useRouter()
  const { addCustomToCart } = useAppState()
  const [view, setView] = useState<"MOOD" | "RECIPE" | "WORKBENCH">("MOOD")
  const [mood, setMood] = useState<string | null>(null)
  const [recipeId, setRecipeId] = useState<RecipeId>("R01")
  const [sessions, setSessions] = useState<Record<RecipeId, AtelierSession>>({
    R01: { stage: "EMPTY", selected: [], productType: "Perfume", name: "" },
    R02: { stage: "EMPTY", selected: [], productType: "Perfume", name: "" },
    R03: { stage: "EMPTY", selected: [], productType: "Perfume", name: "" },
  })

  const recipe = atelierRecipes.find((item) => item.id === recipeId)!
  const session = sessions[recipeId]
  const ingredientGroups = [
    ["Bergamot", "Mandarin", "Grapefruit"],
    ["Fig", "Peony", "Neroli"],
    ["Cedarwood", "White Musk", "Sandalwood"],
  ]
  const selectedGroups = ingredientGroups.map(group => group.filter(item=>session.selected.includes(item)))
  const completeGroups = selectedGroups.filter(group=>group.length>0).length
  const missingNotes = ["TOP", "HEART", "BASE"].filter((_, index) => selectedGroups[index].length === 0)
  const product = atelierProducts[session.productType]
  const nameIdeas = suggestBlendNames(session.selected)
  const blendName = normalizeBlendName(session.name, nameIdeas[0].en)
  const blendStory = describeBlend(session.selected)

  const updateSession = (next: Partial<AtelierSession>) =>
    setSessions((current) => ({
      ...current,
      [recipeId]: { ...current[recipeId], ...next },
    }))

  const selectIngredient = (ingredient: string) => {
    setSessions((current) => {
      const currentSession = current[recipeId]
      if (["BLENDING", "REVEAL", "BOTTLE", "PRODUCT_SELECTION", "SUMMARY"].includes(currentSession.stage)) return current
      const selected = currentSession.selected.includes(ingredient)
        ? currentSession.selected.filter((item) => item !== ingredient)
        : [...currentSession.selected, ingredient]
      const complete = ingredientGroups.filter((group) => group.some((item) => selected.includes(item))).length
      const stage: AtelierStage = complete === 3 ? "READY" : complete === 2 ? "HEART_SELECTED" : complete === 1 ? "TOP_SELECTED" : "EMPTY"
      return { ...current, [recipeId]: { ...currentSession, selected, stage } }
    })
  }

  const stageCopy: Record<AtelierStage, string> = {
    EMPTY: "TOP · HEART · BASE에서 향료를 골라 주세요.",
    TOP_SELECTED: "좋아요. 나머지 향 계열도 선택해 보세요.",
    HEART_SELECTED: "한 가지 계열을 더 선택하면 블렌딩할 수 있어요.",
    BASE_SELECTED: "선택한 향의 구성을 확인해 주세요.",
    READY: "향료가 준비됐어요. 원하는 만큼 더 추가할 수 있어요.",
    BLENDING: "용기를 직접 움직여 향을 섞어 보세요.",
    REVEAL: "보이지 않던 향이 하나의 형태로 드러납니다.",
    BOTTLE: "당신의 향에 이름을 붙여 주세요.",
    PRODUCT_SELECTION: "어떤 형태로 향을 간직할까요?",
    SUMMARY: "당신의 AURA가 완성됐어요.",
  }

  if (view === "MOOD") {
    return (
      <main className="atelier-page atelier-onboarding">
        <section className="atelier-intro">
          <div className="atelier-intro-copy">
            <p className="eyebrow">AURA PERSONAL ATELIER · STEP 01</p>
            <Title as="h1">
              어떤 향의 분위기로
              <br />
              <em>시작할까요?</em>
            </Title>
            <p>
              지금 마음이 향하는 온도를 골라 주세요. 다음 단계에서 당신의 취향에
              가까운 대표 레시피를 제안합니다.
            </p>
          </div>
          <div className="mood-options">
            {[
              ["clear", "01", "맑고 투명한", "Fresh / Woody", "aqua-art"],
              ["soft", "02", "부드럽고 포근한", "Floral / Musk", "pink-art"],
              ["warm", "03", "깊고 따뜻한", "Woody / Citrus", "amber-art"],
            ].map(([key, number, title, note, asset]) => (
              <Button
                className={`mood-option ${mood === key ? "is-active" : ""}`}
                ariaPressed={mood === key}
                key={key}
                onClick={() => {
                  setMood(key)
                  setView("RECIPE")
                }}
              >
                <AssetImage
                  asset={asset}
                  label={`${title} 향의 아트 오브젝트`}
                />
                <span>{number}{mood === key ? " · 선택한 분위기" : ""}</span>
                <strong>{title}</strong>
                <small>{note}</small>
                <Icon name="arrow" />
              </Button>
            ))}
          </div>
        </section>
      </main>
    )
  }

  if (view === "RECIPE") {
    return (
      <main className="atelier-page atelier-onboarding">
        <section className="recipe-select-page">
          <div className="atelier-select-heading">
            <Button className="atelier-back" onClick={() => setView("MOOD")}>
              ← 분위기 다시 선택
            </Button>
            <p className="eyebrow">AURA PERSONAL ATELIER · STEP 02</p>
            <Title as="h1">당신의 취향에 가까운 향을 골라 보세요.</Title>
          </div>
          <div className="atelier-recipe-grid">
            {atelierRecipes.map((item) => (
              <Button
                className={`atelier-recipe-card ${
                  item.moodKey === mood ? "is-recommended" : ""
                }`}
                key={item.id}
                onClick={() => {
                  setRecipeId(item.id)
                  setView("WORKBENCH")
                }}
              >
                <span className="recipe-id">
                  {item.id}
                  {item.moodKey === mood && <em>추천</em>}
                </span>
                <AssetImage
                  asset={item.art}
                  label={`${item.name} 아트 오브젝트`}
                />
                <strong>{item.name}</strong>
                <span>{item.mood}</span>
                <small>
                  {item.ingredients.top} · {item.ingredients.heart} ·{" "}
                  {item.ingredients.base}
                </small>
              </Button>
            ))}
          </div>
        </section>
      </main>
    )
  }

  const allIngredients = [
    {
      stage: "TOP",
      items: ingredientGroups[0],
    },
    {
      stage: "HEART",
      items: ingredientGroups[1],
    },
    {
      stage: "BASE",
      items: ingredientGroups[2],
    },
  ]

  const showArt = session.stage === "REVEAL"
  const showBottle = session.stage === "BOTTLE"
  const showProduct = ["PRODUCT_SELECTION", "SUMMARY"].includes(session.stage)

  return (
    <main className="atelier-page">
      <section className={`atelier-workbench atelier-${recipe.color}`}>
        <div className="atelier-mobile-head">
          <Button className="atelier-back" onClick={() => setView("RECIPE")}>
            ← 레시피 변경
          </Button>
          <span>
            {recipe.id} · {recipe.name}
          </span>
        </div>
        <aside className="ingredient-library">
          <div className="atelier-panel-heading">
            <p className="eyebrow">INGREDIENT LIBRARY</p>
            <Title as="h3">향료 라이브러리</Title>
            <p>각 노트에서 하나 이상, 원하는 향료를 자유롭게 선택하거나 해제하세요.</p>
            <p role="status">
              {session.selected.length}가지 향료 선택 · {missingNotes.length > 0 ? `${missingNotes.join(" · ")}에서 향료를 더 골라 주세요.` : session.stage === "READY" ? "블렌딩할 준비가 됐어요." : "선택한 향료 구성이 확정됐어요."}
            </p>
          </div>
          <div className="ingredient-groups">
            {allIngredients.map((group, groupIndex) => (
              <div className="ingredient-group" key={group.stage}>
                <span>{group.stage} · {selectedGroups[groupIndex].length}개 선택</span>
                <div>
                  {group.items.map((ingredient) => {
                    const active = session.selected.includes(ingredient)
                    const locked = ["BLENDING","REVEAL","BOTTLE","PRODUCT_SELECTION","SUMMARY"].includes(session.stage)
                    const imageKey=ingredient.toLowerCase().replaceAll(" ","-")
                    return <Button ariaLabel={`${ingredient} 향료 ${active?"선택 해제":"선택"}`}
                      ariaPressed={active}
                      className={`ingredient-chip ${active ? "is-selected" : ""}`}
                      disabled={locked}
                      key={ingredient}
                      onClick={()=>selectIngredient(ingredient)}>
                      <img className="ingredient-illustration" src={`/assets/ingredients/${imageKey}.png`} alt=""/>
                      <strong>{ingredient}</strong>
                      <small>{active ? "선택됨 · 다시 누르면 해제" : "선택하기"}</small>
                    </Button>
                  })}
                </div>
              </div>
            ))}
          </div>
        </aside>

        <section className="vessel-stage">
          <div className="vessel-heading">
            <p className="eyebrow">
              {session.stage === "BLENDING"
                ? "BLENDING IN PROGRESS"
                : `${recipe.id} · ${session.stage.replace("_", " ")}`}
            </p>
            <Title>{stageCopy[session.stage]}</Title>
          </div>

          <div
            className={`atelier-object-frame stage-${session.stage.toLowerCase()}`}
          >
            {session.stage === "BLENDING" && <BlendVessel ingredients={session.selected} onComplete={()=>updateSession({stage:"REVEAL"})}/>}
            {!showArt && !showBottle && !showProduct && session.stage !== "BLENDING" && (
              <AtelierFlask ingredients={session.selected} />
            )}
            {showArt && (
              <div className="reveal-object aura-result-composition">
                <AtelierFlask ingredients={session.selected} blended progress={100} />
                <div className="aura-result-notes" aria-label="완성된 향료 구성">
                  {session.selected.map((name) => <span key={name}>{name}</span>)}
                </div>
                {blendStory ? <div className="aura-result-story">
                  <strong>{blendStory.headline}</strong>
                  <p>{blendStory.story}</p>
                  <span className="aura-result-moods">{blendStory.moods.map((mood) => <em key={mood}>{mood}</em>)}</span>
                </div> : <span className="aura-result-caption">{session.selected.length}가지 향료로 완성한 당신의 블렌드</span>}
              </div>
            )}
            {showBottle && (
              <div className="reveal-object bottle-object">
                <AtelierProductVisual type="Perfume" name={blendName} ingredients={session.selected} />
              </div>
            )}
            {showProduct && (
              <div className={`final-product aura-result-product product-${session.productType.toLowerCase().replace(" ", "-")}`}>
                <AtelierProductVisual type={session.productType} name={blendName} ingredients={session.selected} />
                <p>{product.korean}</p>
                <strong>{formatPoint(product.price)}</strong>
                {session.stage === "SUMMARY" && blendStory && <div className="aura-result-story is-compact">
                  <strong>{blendStory.headline}</strong>
                  <p>{blendStory.story}</p>
                  <span className="aura-result-moods">{blendStory.moods.map((mood) => <em key={mood}>{mood}</em>)}</span>
                </div>}
              </div>
            )}
          </div>

          <div className="atelier-stage-actions">
            {session.stage === "READY" && (
              <Button
                className="atelier-primary"
                onClick={() => updateSession({ stage: "BLENDING" })}
              >
                선택한 향료 섞기
              </Button>
            )}
            {session.stage === "REVEAL" && (
              <Button
                className="atelier-primary"
                onClick={() => updateSession({ stage: "BOTTLE", name: session.name || nameIdeas[0].en })}
              >
                완성된 향 만나보기
              </Button>
            )}
            {session.stage === "BOTTLE" && (
              <div className="atelier-naming-step">
                <AtelierNaming name={session.name} ingredients={session.selected} fallback={nameIdeas[0].en} onChange={(name) => updateSession({ name })} />
                <Button
                  className="atelier-primary"
                  onClick={() => updateSession({ stage: "PRODUCT_SELECTION", name: blendName })}
                >
                  이 이름으로 간직할 형태 고르기
                </Button>
              </div>
            )}
            {session.stage === "PRODUCT_SELECTION" && (
              <Button
                className="atelier-primary"
                onClick={() => updateSession({ stage: "SUMMARY" })}
              >
                구성 확인하기
              </Button>
            )}
            {session.stage === "SUMMARY" && (
              <Button
                className="atelier-primary"
                onClick={() => {
                  addCustomToCart({
                    recipeId: recipe.id,
                    recipeName: blendName,
                    ingredients: session.selected,
                    productType: session.productType,
                    pointPrice: product.price,
                    image: `atelier-${session.productType.toLowerCase().replaceAll(" ", "-")}`,
                  })
                  router.push("/cart")
                }}
              >
                장바구니 담기 · {formatPoint(product.price)}
              </Button>
            )}

          </div>
        </section>

        <aside className="recipe-panel">
          <div className="recipe-panel-top">
            <Button className="atelier-back" onClick={() => setView("RECIPE")}>
              ← 레시피 변경
            </Button>
            <p className="eyebrow">CURRENT RECIPE</p>
            <span className="recipe-number">{recipe.id}</span>
            <Title as="h3">{recipe.name}</Title>
            <p>{recipe.description}</p>
            <span className="recipe-mood">{recipe.mood}</span>
          </div>
          <div className="recipe-progress">
            {[
              ["TOP", selectedGroups[0].join(", ") || "선택 전"],
              ["HEART", selectedGroups[1].join(", ") || "선택 전"],
              ["BASE", selectedGroups[2].join(", ") || "선택 전"],
            ].map(([stage, ingredient], index) => (
              <div
                className={selectedGroups[index].length ? "is-complete" : ""}
                key={stage}
              >
                <span>0{index + 1}</span>
                <p>{stage}</p>
                <strong>{ingredient}</strong>
                <em>{selectedGroups[index].length ? "SELECTED" : "WAITING"}</em>
              </div>
            ))}
          </div>
          {["PRODUCT_SELECTION", "SUMMARY"].includes(session.stage) && (
            <div className="product-options">
              <p className="eyebrow">FINAL PRODUCT</p>
              {(Object.keys(atelierProducts) as ProductType[]).map((type) => (
                <Button
                  className={`atelier-product-option ${session.productType === type ? "is-active" : ""}`}
                  ariaPressed={session.productType === type}
                  ariaLabel={`${type} · ${atelierProducts[type].korean} · ${formatPoint(atelierProducts[type].price)}`}
                  key={type}
                  onClick={() => updateSession({ productType: type })}
                >
                  <span>
                    <strong className="atelier-product-name" aria-hidden="true">
                      <span className="atelier-product-name-english" lang="en">{type}</span>
                      <span className="atelier-product-name-korean" lang="ko">{atelierProducts[type].korean}</span>
                    </strong>
                    <small>{atelierProducts[type].caption}</small>
                  </span>
                  <em>{formatPoint(atelierProducts[type].price)}</em>
                </Button>
              ))}
            </div>
          )}
          <div className="recipe-panel-footer">
            {session.selected.length > 0 &&
              [
                "TOP_SELECTED",
                "HEART_SELECTED",
                "BASE_SELECTED",
                "READY",
              ].includes(session.stage) && (
                <Button
                  className="reset-recipe"
                  onClick={() =>
                    updateSession({
                      selected: [],
                      stage: "EMPTY",
                      name: "",
                    })
                  }
                >
                  향료 다시 선택하기
                </Button>
              )}
            <span>진행률</span>
            <strong>{Math.round((completeGroups / 3) * 100)}%</strong>
            <div>
              <i style={{ width: `${(completeGroups / 3) * 100}%` }} />
            </div>
          </div>
        </aside>
      </section>
    </main>
  )
}

export function CardsPage() {
  const cards = [
    {
      name: "Dew",
      tier: "START",
      className: "physical-dew",
      fee: "10,000원",
      performance: "없음",
      limit: "3,000P",
      basic: "0.5%",
      beauty: "1%",
      partner: "1%",
    },
    {
      name: "Velvet",
      tier: "TASTE",
      className: "physical-velvet",
      fee: "30,000원",
      performance: "300,000원",
      limit: "8,000P",
      basic: "0.7%",
      beauty: "3%",
      partner: "5%",
    },
    {
      name: "Amber",
      tier: "PRIVILEGE",
      className: "physical-amber",
      fee: "50,000원",
      performance: "500,000원",
      limit: "15,000P",
      basic: "1%",
      beauty: "5%",
      partner: "5%",
    },
  ]
  return (
    <main className="cards-page page-shell">
      <section className="cards-hero">
        <p className="eyebrow">AURA CARD</p>
        <Title as="h1">
          일상의 취향이
          <br />
          <em>향으로 돌아오도록.</em>
        </Title>
        <p>
          카드 등급과 향 타입은 독립적이며, 모든 AURA 카드 회원이 컬렉션과
          Atelier를 이용할 수 있습니다.
        </p>
      </section>
      <section className="physical-card-gallery">
        {cards.map((card) => (
          <article key={card.name}>
            <AuraFlipCard card={card} />
            <p>카드를 클릭해 뒷면을 확인하세요.</p>
          </article>
        ))}
      </section>
      <section className="benefits-section" id="benefits">
        <div className="benefits-heading">
          <p className="eyebrow">BENEFIT COMPARISON</p>
          <Title>
            생활의 리듬에 맞는
            <br />세 가지 포인트 방식
          </Title>
          <p>
            카드 등급은 향 계열이나 상품 접근을 제한하지 않습니다. 모든 카드
            회원이 일반 컬렉션과 Personal Atelier를 이용할 수 있습니다.
          </p>
        </div>
        <div className="benefit-grid">
          {cards.map((card) => (
            <article
              className={`benefit-column ${card.className}`}
              key={card.name}
            >
              <div className="benefit-card-title">
                <span>{card.tier}</span>
                <Title as="h3">{card.name}</Title>
              </div>
              <BenefitRow label="연회비" value={card.fee} />
              <BenefitRow label="전월 실적" value={card.performance} />
              <BenefitRow label="기본 적립률" value={card.basic} />
              <BenefitRow label="뷰티 적립률" value={card.beauty} />
              <BenefitRow label="월 특별 적립 한도" value={card.limit} />
              <BenefitRow
                label="Partner Perfumery 적립률"
                value={card.partner}
              />
            </article>
          ))}
        </div>
      </section>
      <section className="partner-benefit">
        <div>
          <p className="eyebrow">PARTNER PERFUMERY</p>
          <Title>모든 카드 5% 할인</Title>
        </div>
        <p>
          Partner Perfumery에서는 카드 등급에 따른 포인트 적립과 공통 5% 할인 혜택을 함께 제공합니다. 카드별 상세 혜택은 상단 비교표를 확인해 주세요.
        </p>
      </section>
      <section className="issuance-notice">
        <div>
          <p className="eyebrow">AURA CARD MEMBERSHIP</p>
          <Title>나에게 맞는 AURA 카드 찾기</Title>
          <p>연회비와 전월 실적, 적립 혜택을 비교하고 나에게 알맞은 카드를 살펴보세요.</p>
        </div>
        <Link className="issuance-button" href="#benefits">카드 혜택 비교하기 ↗</Link>
      </section>
    </main>
  )
}

type AuraCardData = {
  name: string
  tier: string
  className: string
  fee: string
  performance: string
  limit: string
  basic: string
  beauty: string
  partner: string
}

function AuraFlipCard({ card }: { card: AuraCardData }) {
  const [flipped, setFlipped] = useState(false)
  return (
    <Button
      ariaLabel={`${card.name} 카드 ${flipped ? "앞면" : "뒷면"} 보기`}
      ariaPressed={flipped}
      className={`physical-card-shell ${flipped ? "is-flipped" : ""}`}
      onClick={() => setFlipped(!flipped)}
    >
      <span className="physical-card-inner">
        <span className={`physical-card-face card-front ${card.className}`}>
          <span className="physical-card-top">
            <strong>AURA</strong>
            <em>{card.tier}</em>
          </span>
          <span className="metal-chip">
            <i />
            <i />
            <i />
            <i />
          </span>
          <span className="masked-number">
            4821&nbsp;&nbsp;••••&nbsp;&nbsp;••••&nbsp;&nbsp;0926
          </span>
          <span className="physical-card-bottom">
            <strong>{card.name}</strong>
            <small>MEMBER SINCE 2026</small>
          </span>
        </span>
        <span className={`physical-card-face card-back ${card.className}`}>
          <span className="magnetic-stripe" />
          <span className="signature-panel">
            <i>AURA MEMBER</i>
            <strong>•••</strong>
          </span>
          <span className="card-back-copy">
            <strong>AURA</strong>
            <small>
              AURA CARD · FROM SCENT TO IDENTITY
            </small>
          </span>
          <span className="card-back-tier">{card.tier}</span>
        </span>
      </span>
    </Button>
  )
}

function BenefitRow({
  label,
  value,
  tentative = false,
}: {
  label: string
  value: string
  tentative?: boolean
}) {
  return (
    <div className="benefit-row">
      <span>
        {label}
        {tentative && <small>잠정안</small>}
      </span>
      <strong>{value}</strong>
    </div>
  )
}

export function NotFoundPage() {
  return (
    <main className="simple-page page-shell">
      <p className="eyebrow">404 · LOST SCENT</p>
      <Title as="h1">페이지를 찾을 수 없어요.</Title>
      <CtaLink href="/">AURA 홈으로 돌아가기</CtaLink>
    </main>
  )
}

export function AuthPage({mode}:{mode:"login"|"signup"}) {
  const router=useRouter()
  const {user,setSignedInUser}=useAppState()
  const [name,setName]=useState("")
  const [email,setEmail]=useState("")
  const [password,setPassword]=useState("")
  const [confirm,setConfirm]=useState("")
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState("")
  const [visible,setVisible]=useState(false)
  const params=useSearchParams()
  const next=params.get("next")
  const destination=next?.startsWith("/") && !next.startsWith("//") ? next : "/mypage"
  const submit=async(event:React.FormEvent<HTMLFormElement>)=>{
    event.preventDefault();setError("")
    if(mode==="signup" && password!==confirm){setError("비밀번호가 일치하지 않아요.");return}
    setBusy(true)
    try{
      const member=mode==="signup"?await registerMember(name,email,password):await authenticateMember(email,password)
      setSignedInUser(member);router.push(destination)
    }catch(e){setError(e instanceof Error?e.message:"다시 시도해 주세요.")}
    finally{setBusy(false)}
  }
  return <main className="auth-layout">
    <section className="auth-brand"><span className="eyebrow">AURA · FROM SCENT TO IDENTITY</span><Title as="h1">Your scent,<br/><em>your identity.</em></Title><p>일상의 포인트가 당신만의 향이 되는 곳.</p><AssetImage asset="hero-bottles" label="AURA 향수 컬렉션"/></section>
    <section className="auth-form-panel"><div className="auth-form-inner"><p className="eyebrow">AURA ACCOUNT</p><Title as="h2">{mode==="signup"?"AURA에 오신 것을 환영해요.":"다시 만나 반가워요."}</Title><p className="auth-subtitle">{mode==="signup"?"새로운 취향을 만나는 여정을 시작하세요.":"로그인하고 내 포인트와 리워드 내역을 확인하세요."}</p>
      {user && <p className="auth-notice">현재 {user.name}님으로 로그인되어 있습니다. 다른 계정으로 이용하려면 먼저 로그아웃해 주세요.</p>}
      <form className="auth-form" onSubmit={submit}>
        {mode==="signup"&&<label>이름<input autoComplete="name" maxLength={30} onChange={e=>setName(e.target.value)} placeholder="이름을 입력해 주세요" required value={name}/></label>}
        <label>이메일<input autoComplete="email" type="email" onChange={e=>setEmail(e.target.value)} placeholder="이메일을 입력해 주세요" required value={email}/></label>
        <label>비밀번호<div className="auth-password"><input autoComplete={mode==="signup"?"new-password":"current-password"} type={visible?"text":"password"} minLength={8} onChange={e=>setPassword(e.target.value)} placeholder="비밀번호를 입력해 주세요 (8자 이상)" required value={password}/><button type="button" onClick={()=>setVisible(v=>!v)} aria-label={visible?"비밀번호 숨기기":"비밀번호 보기"}>{visible?"숨기기":"보기"}</button></div></label>
        {mode==="signup"&&<label>비밀번호 확인<input autoComplete="new-password" type={visible?"text":"password"} minLength={8} onChange={e=>setConfirm(e.target.value)} placeholder="비밀번호를 한 번 더 입력해 주세요" required value={confirm}/></label>}
        {error&&<p className="auth-error" role="alert">{error}</p>}
        <button className="auth-submit" type="submit" disabled={busy}>{busy?"처리 중…":mode==="signup"?"회원가입":"로그인"} <span aria-hidden="true">↗</span></button>
      </form>
      <p className="auth-switch">{mode==="signup"?"이미 회원이신가요?":"아직 AURA 회원이 아니신가요?"} <Link href={mode==="signup"?"/login":"/signup"}>{mode==="signup"?"로그인":"회원가입"}</Link></p>
    </div></section>
  </main>
}

export function MyPage(){
  const {user,points,pointHistory,recoveryPending,logout}=useAppState()
  const router=useRouter()
  if(!user)return <main className="simple-page page-shell"><p className="eyebrow">MY AURA ACCOUNT</p><Title as="h1">로그인하고 내 포인트를 확인하세요.</Title><CtaLink href="/login?next=%2Fmypage">로그인하기</CtaLink></main>
  return <main className="mypage page-shell"><p className="eyebrow">MY AURA ACCOUNT</p><Title as="h1">{user.name}님의 AURA</Title><p className="mypage-email">{user.email}</p>
    <div className="mypage-grid"><article className="mypage-wallet"><span>사용 가능 포인트</span><strong>{formatPoint(points)}</strong><small>회수 대기 {formatPoint(recoveryPending)}</small></article><article className="mypage-card"><span>YOUR AURA</span><h3>일상과 취향을 연결하는 혜택</h3><Link href="/cards">카드 혜택 알아보기 ↗</Link></article></div>
    <section className="mypage-history"><Title>포인트 사용 내역</Title>{pointHistory.length?pointHistory.map(item=><article key={item.id}><span>{item.label}<small>{item.date} · {item.detail}</small></span><strong>{formatPoint(item.amount)}</strong></article>):<p>아직 포인트 사용 내역이 없어요.</p>}</section>
    <button className="mypage-logout" type="button" onClick={()=>{logout();router.push("/")}}>로그아웃</button>
  </main>
}

export function AuraProviders({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<CartItem[]>([])
  const [user,setUser] = useState<AuraMember|null>(null)
  const [pointBalance, setPointBalance] = useState(0)
  const [pointHistory, setPointHistory] = useState<PointTransaction[]>([])
  const [hydrated,setHydrated]=useState(false)
  useEffect(()=>{
    const restored=currentMember()
    if(restored){setUser(restored);const saved=localStorage.getItem(`aura_wallet_${restored.email}`);if(saved){try{const data=JSON.parse(saved);setPointBalance(data.points||0);setPointHistory(data.history||[])}catch{}}}
    try { const savedCart=JSON.parse(localStorage.getItem("aura_cart_v1")||"[]");if(Array.isArray(savedCart))setCart(savedCart) } catch {}
    setHydrated(true)
  },[])
  useEffect(()=>{
    if(user && hydrated) localStorage.setItem(`aura_wallet_${user.email}`,JSON.stringify({points:pointBalance,history:pointHistory}))
  },[user,pointBalance,pointHistory,hydrated])
  useEffect(()=>{if(hydrated)localStorage.setItem("aura_cart_v1",JSON.stringify(cart))},[cart,hydrated])
  const setSignedInUser=(member:AuraMember)=>{
    setUser(member)
    try{const data=JSON.parse(localStorage.getItem(`aura_wallet_${member.email}`)||"{}");setPointBalance(data.points||0);setPointHistory(data.history||[])}catch{setPointBalance(0);setPointHistory([])}
  }
  const logout=()=>{signOut();setUser(null);setPointBalance(0);setPointHistory([]);setCart([]);localStorage.removeItem("aura_cart_v1")}
  const [recoveryRequest] = useState(0)
  const points = Math.max(0, pointBalance - recoveryRequest)
  const recoveryPending = Math.max(0, recoveryRequest - pointBalance)
  const state = useMemo<AppState>(
    () => ({
      points,
      user,
      setSignedInUser,
      logout,
      recoveryPending,
      pointHistory,
      cart,
      addToCart: (product, quantity = 1) =>
        setCart((current) => {
          const existing = current.find(
            (item) =>
              item.kind === "product" && item.product.slug === product.slug,
          )
          return existing
            ? current.map((item) =>
                item.kind === "product" && item.product.slug === product.slug
                  ? { ...item, quantity: item.quantity + quantity }
                  : item,
              )
            : [
                ...current,
                { kind: "product", id: product.slug, product, quantity },
              ]
        }),
      addCustomToCart: (item) =>
        setCart((current) => [
          ...current,
          {
            ...item,
            kind: "custom",
            id: `${item.recipeId}-${item.productType}-${Date.now()}`,
            quantity: 1,
          },
        ]),
      changeQuantity: (id, quantity) =>
        setCart((current) =>
          current.map((item) =>
            item.id === id
              ? { ...item, quantity: Math.max(1, quantity) }
              : item,
          ),
        ),
      removeFromCart: (id) =>
        setCart((current) => current.filter((item) => item.id !== id)),
      redeem: (total) => {
        if (!user || total > points || total<=0) return false
        const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0)
        setPointBalance((current) => current - total)
        setPointHistory((current) => [
          {
            id: `redeem-${Date.now()}`,
            label: "AURA 포인트 교환",
            detail: `${itemCount}개 상품`,
            amount: -total,
            date: new Intl.DateTimeFormat("ko-KR", {
              month: "2-digit",
              day: "2-digit",
            }).format(new Date()),
          },
          ...current,
        ])
        setCart([])
        return true
      },
    }),
    [cart, pointHistory, points, recoveryPending, user],
  )
  return (
    <AppStateContext.Provider value={state}>
      {children}
    </AppStateContext.Provider>
  )
}

export function AuraShell({ children }: { children: ReactNode }) {
  return (<>
    <Header />
    {children}
    <Footer />
  </>)
}
