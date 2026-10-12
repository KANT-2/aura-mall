/* eslint-disable @next/next/no-img-element -- Editorial images use controlled aspect ratios and static local assets. */
import Link from "next/link"

/** Home v3 composition; each chapter is editable JSX, not an iframe. */
export function HomeScenes({ signedIn, points }: { signedIn: boolean; points: string }) {
  return <>
        <section aria-label="1 / 8 브랜드 히어로" className="chapter is-active" data-step="0" id="aura-s01" role="group" tabIndex={-1}>
          <div className="chapter-content">
            <div className="hf hf-hero">
              <div className="hf-hero-copy">
                <p className="hf-eyebrow">
                  THE SCENT VEIL 
                  <i>
                    —
                  </i>
                   AURA
                </p>
                <h1 className="hf-display">
                  From Scent
                  <br />
                  <em>
                    to Identity.
                  </em>
                </h1>
                <div className="hf-line">
                </div>
                <h2 className="hf-korean">
                  일상의 포인트가,
                  <br />
                  나만의 향이 되다.
                </h2>
                <p className="hf-paragraph">
                  취향을 발견하고, 나만의 향을 구성하며,
                  <br className="desktop" />
                   포인트로 새로운 순간을 만나보세요.
                </p>
                <div className="hf-actions">
                  <Link className="hf-cta" href="/products">
                    컬렉션 둘러보기 
                    <span>
                      ↗
                    </span>
                  </Link>
                  <Link className="hf-secondary" href="/custom">
                    MY AURA 알아보기 ↗
                  </Link>
                </div>
                <small className="hf-hero-foot">
                  AURA / FRAGRANCE REWARD EXPERIENCE
                </small>
              </div>
              <div className="hf-hero-photo">
                <img alt="AURA 향수 제품과 베르가못 식물, 자연광이 담긴 에디토리얼 상품 컷" className="hf-hero-img" src="/assets/home-v3/bergamot-veil.webp" />
                <div className="hf-hero-photo-shade">
                </div>
                <div className="hf-product-caption">
                  <span>
                    01 / SCENT EDITORIAL
                  </span>
                  <b>
                    BERGAMOT VEIL
                  </b>
                </div>
                <span className="hf-editorial-watermark">
                  AURA
                </span>
              </div>
            </div>
          </div>
        </section>
        <section aria-label="2 / 8 향수 큐레이션" className="chapter" data-step="0" id="aura-s02" role="group" tabIndex={-1}>
          <div className="chapter-content">
            <div className="hf hf-editorial hf-collection">
              <div className="hf-inner">
                <header className="hf-section-title">
                  <div>
                    <p className="hf-eyebrow">
                      01 / THE AURA EDIT
                    </p>
                    <h2>
                      지금, 만나고 싶은
                      <br />
                      세 가지 향.
                    </h2>
                  </div>
                  <p>
                    가벼운 아침의 공기부터 깊은 나무의 잔향까지.
                    <br className="desktop" />
                     AURA가 제안하는 취향의 세 가지 장면.
                  </p>
                </header>
                <div className="hf-prod-grid">
                  <Link className="hf-prod" href="/products/bergamot-veil">
                    <div className="hf-prod-photo">
                      <img alt="AURA Bergamot Veil 향수 연출 컷" className="" src="/assets/home-v3/bergamot-veil.webp" />
                      <span className="hf-prod-index">
                        01
                      </span>
                    </div>
                    <div className="hf-prod-line">
                      <div>
                        <p>
                          FRESH / CITRUS
                        </p>
                        <h3>
                          Bergamot Veil
                        </h3>
                        <span>
                          맑은 시트러스의 첫인상
                        </span>
                      </div>
                      <strong>
                        38,000P
                      </strong>
                    </div>
                  </Link>
                  <Link className="hf-prod" href="/products/petal-haze">
                    <div className="hf-prod-photo">
                      <img alt="AURA Petal Haze 향수 연출 컷" className="" src="/assets/home-v3/petal-haze.webp" />
                      <span className="hf-prod-index">
                        02
                      </span>
                    </div>
                    <div className="hf-prod-line">
                      <div>
                        <p>
                          FLORAL / SOFT
                        </p>
                        <h3>
                          Petal Haze
                        </h3>
                        <span>
                          부드럽게 피어나는 잔향
                        </span>
                      </div>
                      <strong>
                        42,000P
                      </strong>
                    </div>
                  </Link>
                  <Link className="hf-prod" href="/products/cedar-trace">
                    <div className="hf-prod-photo">
                      <img alt="AURA Cedar Trace 향수 연출 컷" className="" src="/assets/home-v3/cedar-trace.webp" />
                      <span className="hf-prod-index">
                        03
                      </span>
                    </div>
                    <div className="hf-prod-line">
                      <div>
                        <p>
                          WOODY / WARM
                        </p>
                        <h3>
                          Cedar Trace
                        </h3>
                        <span>
                          차분하게 남는 나무의 결
                        </span>
                      </div>
                      <strong>
                        46,000P
                      </strong>
                    </div>
                  </Link>
                </div>
                <div className="hf-section-end">
                  <Link href="/products">
                    전체 컬렉션 보기 
                    <span>
                      ↗
                    </span>
                  </Link>
                  <span>
                    THE COLLECTION / 06 SCENTS
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>
        <section aria-label="3 / 8 Fig 특별 쇼케이스" className="chapter" data-step="0" id="aura-s03" role="group" tabIndex={-1}>
          <div className="chapter-content">
            <div className="hf hf-showcase">
              <div className="hf-showcase-image">
                <img alt="무화과와 잎사귀를 배경으로 한 AURA Fig Reverie 향수" className="hf-fig-img" src="/assets/home-v3/fig-reverie.webp" />
                <div className="hf-dusk">
                </div>
                <img alt="무화과 2D 일러스트" className="hf-fig-ingredient" src="/assets/home-v3/fig.png" />
                <span className="hf-vertical-label">
                  SCENT PROFILE / 04
                </span>
              </div>
              <div className="hf-showcase-copy">
                <p className="hf-eyebrow">
                  02 / SPECIAL SHOWCASE
                </p>
                <div className="hf-fig-title">
                  FIG
                  <br />
                  <em>
                    Reverie.
                  </em>
                </div>
                <h3>
                  무화과나무 아래,
                  <br />
                  조금 느린 오후.
                </h3>
                <p className="hf-paragraph">
                  푸른 무화과의 여운과 샌들우드의 따뜻함.
                  <br />
                  정적 속에 오래 머무는 향.
                </p>
                <div className="hf-notes">
                  <span>
                    TOP 
                    <b>
                      FIG LEAF
                    </b>
                  </span>
                  <span>
                    HEART  FIG MILK
                  </span>
                  <span>
                    BASE 
                    <b>
                      SANDALWOOD
                    </b>
                  </span>
                </div>
                <Link className="hf-cta hf-cta-light" href="/products/fig-reverie">
                  Fig Reverie 살펴보기 
                  <span>
                    ↗
                  </span>
                </Link>
              </div>
            </div>
          </div>
        </section>
        <section aria-label="4 / 8 향 계열 탐색" className="chapter" data-step="0" id="aura-s04" role="group" tabIndex={-1}>
          <div className="chapter-content">
            <div className="hf hf-editorial hf-families">
              <div className="hf-inner">
                <header className="hf-section-title">
                  <div>
                    <p className="hf-eyebrow">
                      03 / FIND YOUR SCENT
                    </p>
                    <h2>
                      오늘, 어떤 향이
                      <br />
                      끌리나요?
                    </h2>
                  </div>
                  <p>
                    향의 이름보다 먼저 이끌리는 감각이 있어요.
                    <br className="desktop" />
                     좋아하는 분위기에서부터 찾아보세요.
                  </p>
                </header>
                <div className="hf-family-grid">
                  <Link className="hf-family" href="/products?family=Fresh">
                    <div className="hf-family-art" style={{ "--family-bg": "#DCE2D6" } as React.CSSProperties}>
                      <img alt="향료 Fresh" className="" src="/assets/home-v3/bergamot.png" />
                      <span>
                        01
                      </span>
                    </div>
                    <div className="hf-family-meta">
                      <h3>
                        Fresh
                      </h3>
                      <span>
                        ↗
                      </span>
                    </div>
                    <p>
                      산뜻하고 맑은 시작
                    </p>
                  </Link>
                  <Link className="hf-family" href="/products?family=Floral">
                    <div className="hf-family-art" style={{ "--family-bg": "#EEDDD9" } as React.CSSProperties}>
                      <img alt="향료 Floral" className="" src="/assets/home-v3/peony.png" />
                      <span>
                        02
                      </span>
                    </div>
                    <div className="hf-family-meta">
                      <h3>
                        Floral
                      </h3>
                      <span>
                        ↗
                      </span>
                    </div>
                    <p>
                      부드럽게 피어나는 순간
                    </p>
                  </Link>
                  <Link className="hf-family" href="/products?family=Woody">
                    <div className="hf-family-art" style={{ "--family-bg": "#D8CBBC" } as React.CSSProperties}>
                      <img alt="향료 Woody" className="" src="/assets/home-v3/cedarwood.png" />
                      <span>
                        03
                      </span>
                    </div>
                    <div className="hf-family-meta">
                      <h3>
                        Woody
                      </h3>
                      <span>
                        ↗
                      </span>
                    </div>
                    <p>
                      깊고 차분한 잔향
                    </p>
                  </Link>
                  <Link className="hf-family" href="/products?family=Musk">
                    <div className="hf-family-art" style={{ "--family-bg": "#EBE6DB" } as React.CSSProperties}>
                      <img alt="향료 Musk" className="" src="/assets/home-v3/musk.png" />
                      <span>
                        04
                      </span>
                    </div>
                    <div className="hf-family-meta">
                      <h3>
                        Musk
                      </h3>
                      <span>
                        ↗
                      </span>
                    </div>
                    <p>
                      피부처럼 편안한 여운
                    </p>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>
        <section aria-label="5 / 8 MY AURA Atelier" className="chapter" data-step="0" id="aura-s05" role="group" tabIndex={-1}>
          <div className="chapter-content">
            <div className="hf hf-atelier">
              <div className="hf-atelier-visual">
                <div className="hf-ring hf-ring-outer">
                </div>
                <div className="hf-ring hf-ring-inner">
                </div>
                <span className="hf-at-name">
                  PERSONAL ATELIER
                  <br />
                  <i>
                    THE ART OF BLENDING
                  </i>
                </span>
                <span className="hf-bot hf-bot-1">
                  <img alt="향료 bergamot" className="" src="/assets/home-v3/bergamot.png" />
                </span>
                <span className="hf-bot hf-bot-2">
                  <img alt="향료 peony" className="" src="/assets/home-v3/peony.png" />
                </span>
                <span className="hf-bot hf-bot-3">
                  <img alt="향료 sandalwood" className="" src="/assets/home-v3/sandalwood.png" />
                </span>
                <div className="hf-atelier-glass">
                  <div className="hf-atelier-neck">
                  </div>
                  <div className="hf-atelier-liquid">
                  </div>
                  <span>
                    AURA
                  </span>
                  <small>
                    YOUR OWN SCENT
                  </small>
                </div>
                <div className="hf-blend-particles">
                  ✦ · ✦ · ✦
                </div>
                <span className="hf-at-bottom">
                  TOP · HEART · BASE
                </span>
              </div>
              <div className="hf-atelier-copy">
                <p className="hf-eyebrow">
                  04 / MY AURA — PERSONAL ATELIER
                </p>
                <h2>
                  보이지 않는 향을,
                  <br />
                  눈앞의 형태로.
                </h2>
                <p>
                  TOP, HEART, BASE.
                  <br />
                  고른 향료를 하나씩 담고, 용기를 흔들어
                  <br />
                  당신만의 향을 완성하는 경험.
                </p>
                <div className="hf-atelier-steps">
                  <span>
                    01 
                    <b>
                      향을 고르고
                    </b>
                  </span>
                  <span>
                    02 
                    <b>
                      용기에 담고
                    </b>
                  </span>
                  <span>
                    03 
                    <b>
                      하나의 향으로
                    </b>
                  </span>
                </div>
                <Link className="hf-cta hf-cta-light" href="/custom">
                  MY AURA 살펴보기 
                  <span>
                    ↗
                  </span>
                </Link>
              </div>
            </div>
          </div>
        </section>
        <section aria-label="6 / 8 포인트 경험" className="chapter" data-step="0" id="aura-s06" role="group" tabIndex={-1}>
          <div className="chapter-content">
            <div className="hf hf-editorial hf-points">
              <div className="hf-inner">
                <header className="hf-section-title">
                  <div>
                    <p className="hf-eyebrow">
                      05 / AURA POINT
                    </p>
                    <h2>
                      쌓인 포인트가,
                      <br />
                      좋아하는 향으로.
                    </h2>
                  </div>
                  <p>
                    일상에서 쌓이는 포인트가 나를 위한
                    <br className="desktop" />
                     특별한 순간으로 이어집니다.
                  </p>
                </header>
                <div className="hf-points-grid">
                  <div className="hf-point-step">
                    <span>
                      01
                    </span>
                    <div className="hf-point-icon">
                      ↗
                    </div>
                    <h3>
                      EARN
                    </h3>
                    <p>
                      일상에서 포인트를 쌓고
                    </p>
                  </div>
                  <div className="hf-point-step">
                    <span>
                      02
                    </span>
                    <div className="hf-point-icon">
                      ✳
                    </div>
                    <h3>
                      DISCOVER
                    </h3>
                    <p>
                      취향에 맞는 향을 고르고
                    </p>
                  </div>
                  <div className="hf-point-step">
                    <span>
                      03
                    </span>
                    <div className="hf-point-icon">
                      ◇
                    </div>
                    <h3>
                      REDEEM
                    </h3>
                    <p>
                      포인트로 리워드를 교환해요
                    </p>
                  </div>
                </div>
                {signedIn ? (
                  <div className="hf-point-guest hf-member-points">
                    <div><p>사용 가능 포인트</p><h3>{points}</h3></div>
                    <Link className="hf-cta" href="/mypage">포인트 내역 보기 <span>↗</span></Link>
                  </div>
                ) : (
                  <div className="hf-point-guest">
                    <div><p>MY AURA POINT</p><h3>나의 포인트를 확인하세요.</h3></div>
                    <Link className="hf-cta" href="/login">로그인하기 <span>↗</span></Link>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
        <section aria-label="7 / 8 AURA 카드" className="chapter" data-step="0" id="aura-s07" role="group" tabIndex={-1}>
          <div className="chapter-content">
            <div className="hf hf-editorial hf-cards">
              <div className="hf-inner">
                <header className="hf-section-title">
                  <div>
                    <p className="hf-eyebrow">
                      06 / AURA CARD
                    </p>
                    <h2>
                      일상의 소비가,
                      <br />
                      취향을 위한 혜택으로.
                    </h2>
                  </div>
                  <p>
                    서로 다른 세 가지 카드, 하나의 AURA.
                    <br className="desktop" />
                     나에게 맞는 포인트 경험을 발견해 보세요.
                  </p>
                </header>
                <div className="hf-card-grid">
                  <div className="hf-card-wrap">
                    <div className="hf-card hf-card-dew">
                      <span className="hf-card-brand">
                        AURA 
                        <small>
                          FRAGRANCE REWARDS
                        </small>
                      </span>
                      <div className="hf-card-mark">
                        ✦
                      </div>
                      <div className="hf-card-detail">
                        <strong>
                          Dew
                        </strong>
                        <span>
                          START / 01
                        </span>
                      </div>
                    </div>
                    <p>
                      <b>
                        Dew
                      </b>
                      <span>
                        START
                      </span>
                    </p>
                  </div>
                  <div className="hf-card-wrap">
                    <div className="hf-card hf-card-velvet">
                      <span className="hf-card-brand">
                        AURA 
                        <small>
                          FRAGRANCE REWARDS
                        </small>
                      </span>
                      <div className="hf-card-mark">
                        ✦
                      </div>
                      <div className="hf-card-detail">
                        <strong>
                          Velvet
                        </strong>
                        <span>
                          TASTE / 02
                        </span>
                      </div>
                    </div>
                    <p>
                      <b>
                        Velvet
                      </b>
                      <span>
                        TASTE
                      </span>
                    </p>
                  </div>
                  <div className="hf-card-wrap">
                    <div className="hf-card hf-card-amber">
                      <span className="hf-card-brand">
                        AURA 
                        <small>
                          FRAGRANCE REWARDS
                        </small>
                      </span>
                      <div className="hf-card-mark">
                        ✦
                      </div>
                      <div className="hf-card-detail">
                        <strong>
                          Amber
                        </strong>
                        <span>
                          PRIVILEGE / 03
                        </span>
                      </div>
                    </div>
                    <p>
                      <b>
                        Amber
                      </b>
                      <span>
                        PRIVILEGE
                      </span>
                    </p>
                  </div>
                </div>
                <div className="hf-section-end">
                  <Link href="/cards">
                    카드 혜택 알아보기 
                    <span>
                      ↗
                    </span>
                  </Link>
                  <span>
                    DEW · VELVET · AMBER
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>
        <section aria-label="8 / 8 브랜드 클로징" className="chapter" data-step="0" id="aura-s08" role="group" tabIndex={-1}>
          <div className="chapter-content">
            <div className="hf hf-closing">
              <div className="hf-close-photo">
                <img alt="앰버 톤의 AURA 향수와 레진 오브젝트" className="" src="/assets/home-v3/amber-nocturne.webp" />
                <div className="hf-close-photo-overlay">
                </div>
                <span>
                  THE LAST NOTE / AURA
                </span>
              </div>
              <div className="hf-closing-copy">
                <p className="hf-eyebrow">
                  FROM SCENT TO IDENTITY.
                </p>
                <h2>
                  향은 보이지 않지만,
                  <br />
                  취향은 선명하게 남습니다.
                </h2>
                <p>
                  지금의 당신을 닮은 향을 AURA에서 만나보세요.
                </p>
                <div className="hf-actions">
                  <Link className="hf-cta hf-cta-light" href="/products">
                    컬렉션 둘러보기 
                    <span>
                      ↗
                    </span>
                  </Link>
                  <Link className="hf-secondary hf-white-link" href="/custom">
                    MY AURA 알아보기 ↗
                  </Link>
                </div>
                <div className="hf-closing-footer">
                  <strong>
                    AURA
                  </strong>
                  <span>
                    FROM SCENT TO IDENTITY · 2026
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>
  </>
}
