"use client"

import { useEffect, useRef } from "react"
import { HomeScenes } from "./HomeScenes"
import "./HomeExperience.css"

const sceneLabels = [
  "브랜드 히어로", "향수 큐레이션", "Fig Reverie 쇼케이스", "향 계열 탐색",
  "MY AURA Atelier", "포인트 경험", "AURA 카드", "브랜드 클로징",
]

/** Full-screen controlled chapter transitions, not a free-scrolling landing page.
 * Only Hero, Special Showcase and Atelier use inner transition steps.
 * Keep the shared site navigation, product routes and account state intact.
 */
export function HomeExperience({ signedIn, points }: { signedIn: boolean; points: string }) {
  const rootRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const track = root.querySelector<HTMLElement>(".chapter-track")
    const chapters = Array.from(root.querySelectorAll<HTMLElement>(".chapter"))
    const display = root.querySelector<HTMLElement>(".current-index")
    const sceneDisplay = root.querySelector<HTMLElement>(".aura-scene-status")
    const prev = root.querySelector<HTMLButtonElement>(".aura-scene-prev")
    const next = root.querySelector<HTMLButtonElement>(".aura-scene-next")
    if (!track || !display || !sceneDisplay || !prev || !next || chapters.length !== 8) return
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)")
    const stepsFor = (id: string) => motion.matches ? 1 : ({ "aura-s01": 3, "aura-s03": 3, "aura-s05": 4 } as Record<string, number>)[id] || 1
    const pagerButtons = Array.from(root.querySelectorAll<HTMLButtonElement>(".chapter-pager button[data-home-go]"))
    let index = 0, step = 0, locked = false, wheelTotal = 0, wheelTime = 0
    let unlockTimer = 0
    let touchStart: { x: number; y: number } | null = null

    // header is shared across app and has responsive height.
    const header = document.querySelector<HTMLElement>(".site-header")
    const setHeaderHeight = () => {
      const height = header?.getBoundingClientRect().height || 76
      root.style.setProperty("--home-header-height", `${height}px`)
    }
    setHeaderHeight()
    const headerObserver = new ResizeObserver(setHeaderHeight)
    if (header) headerObserver.observe(header)

    const setScene = (to: number, substep = 0, animate = true) => {
      index = Math.max(0, Math.min(chapters.length - 1, to))
      step = Math.max(0, Math.min(stepsFor(chapters[index].id) - 1, substep))
      chapters.forEach((chapter, i) => {
        const active = i === index
        chapter.classList.toggle("is-active", active)
        chapter.setAttribute("aria-hidden", active ? "false" : "true")
        chapter.inert = !active
        chapter.dataset.step = active ? String(step) : "0"
        chapter.style.setProperty("--scene-progress", active && stepsFor(chapter.id) > 1 ? String(step / (stepsFor(chapter.id) - 1)) : "0")
        if (!active) {
          const content = chapter.querySelector<HTMLElement>(".chapter-content")
          if (content) content.scrollTop = 0
        }
      })
      track.style.transition = animate ? "" : "none"
      track.style.transform = `translate3d(0, -${index * 100}%, 0)`
      display.textContent = `${String(index + 1).padStart(2, "0")} / 08`
      sceneDisplay.textContent = stepsFor(chapters[index].id) > 1 ? `장면 ${step + 1} / ${stepsFor(chapters[index].id)}` : "다음 화면으로 이동"
      pagerButtons.forEach((b, i) => b.setAttribute("aria-current", i === index ? "step" : "false"))
      prev.disabled = index === 0 && step === 0
      next.disabled = index === chapters.length - 1 && step === stepsFor(chapters[index].id) - 1
    }

    const innerCanScroll = (dir: number): boolean => {
      const content = chapters[index]?.querySelector<HTMLElement>(".chapter-content")
      if (!content) return false
      const max = content.scrollHeight - content.clientHeight
      return max > 3 && (dir > 0 ? content.scrollTop < max - 2 : content.scrollTop > 2)
    }

    const move = (dir: number) => {
      if (locked) return
      let target = index, nextStep = step
      if (dir > 0) {
        if (step + 1 < stepsFor(chapters[index].id)) nextStep++
        else { target++; nextStep = 0 }
      } else {
        if (step > 0) nextStep--
        else { target--; if (target >= 0) nextStep = stepsFor(chapters[target].id) - 1 }
      }
      if (target < 0 || target >= chapters.length) return
      locked = true; wheelTotal = 0
      setScene(target, nextStep, !motion.matches)
      window.clearTimeout(unlockTimer)
      unlockTimer = window.setTimeout(() => { locked = false }, motion.matches ? 120 : 620)
    }

    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey || !root.contains(e.target as Node)) return
      if ((e.target as Element).closest(".hf-prod-grid, .hf-card-grid") && Math.abs(e.deltaX) > Math.abs(e.deltaY)) return
      const dir = Math.sign(e.deltaY)
      if (!dir || innerCanScroll(dir)) return
      e.preventDefault()
      if (locked) return
      const now = performance.now()
      if (now - wheelTime > 260 || Math.sign(wheelTotal) !== dir) wheelTotal = 0
      wheelTime = now
      wheelTotal += e.deltaY
      if (Math.abs(wheelTotal) > 26) move(dir)
    }

    const onKey = (e: KeyboardEvent) => {
      const el = e.target as Element | null
      if (!el || el.closest("input, textarea, select, button, a, [contenteditable='true'], [role='dialog']")) return
      if (!root.contains(el) && el !== document.body && el !== document.documentElement) return
      if (["ArrowDown", "PageDown", " ", "ArrowRight"].includes(e.key)) {
        if (innerCanScroll(1)) return
        e.preventDefault(); move(1)
      } else if (["ArrowUp", "PageUp", "ArrowLeft"].includes(e.key)) {
        if (innerCanScroll(-1)) return
        e.preventDefault(); move(-1)
      } else if (e.key === "Home") { e.preventDefault(); locked = false; setScene(0, 0) }
      else if (e.key === "End") { e.preventDefault(); locked = false; setScene(chapters.length - 1, 0) }
    }
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return
      touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY }
    }
    const onTouchEnd = (e: TouchEvent) => {
      if (!touchStart || e.changedTouches.length !== 1) return
      const dx = e.changedTouches[0].clientX - touchStart.x
      const dy = e.changedTouches[0].clientY - touchStart.y
      touchStart = null
      if (Math.abs(dy) < 52 || Math.abs(dy) < Math.abs(dx) * 1.2) return
      if (!innerCanScroll(dy < 0 ? 1 : -1)) move(dy < 0 ? 1 : -1)
    }
    const onPager = (e: MouseEvent) => {
      const button = (e.target as Element).closest<HTMLButtonElement>("button[data-home-go]")
      if (!button) return
      locked = false; window.clearTimeout(unlockTimer)
      setScene(Number(button.dataset.homeGo), 0)
    }
    const onPrev = () => move(-1), onNext = () => move(1)
    const onResize = () => { wheelTotal = 0; setHeaderHeight(); setScene(index, step, false) }
    const onMotionChange = () => { locked = false; setScene(index, 0, false) }
    root.addEventListener("wheel", onWheel, { passive: false })
    root.addEventListener("touchstart", onTouchStart, { passive: true })
    root.addEventListener("touchend", onTouchEnd, { passive: true })
    root.querySelector(".chapter-pager")?.addEventListener("click", onPager as EventListener)
    prev.addEventListener("click", onPrev)
    next.addEventListener("click", onNext)
    window.addEventListener("keydown", onKey)
    window.addEventListener("resize", onResize)
    motion.addEventListener("change", onMotionChange)
    setScene(0, 0, false)
    return () => {
      root.removeEventListener("wheel", onWheel)
      root.removeEventListener("touchstart", onTouchStart)
      root.removeEventListener("touchend", onTouchEnd)
      root.querySelector(".chapter-pager")?.removeEventListener("click", onPager as EventListener)
      prev.removeEventListener("click", onPrev)
      next.removeEventListener("click", onNext)
      window.removeEventListener("keydown", onKey)
      window.removeEventListener("resize", onResize)
      motion.removeEventListener("change", onMotionChange)
      headerObserver.disconnect()
      window.clearTimeout(unlockTimer)
    }
  }, [])

  return (
    <main ref={rootRef} className="aura-home-snap chapter-deck" aria-label="AURA 홈 콘텐츠 · 휠 또는 터치로 화면 전환">
      <div className="chapter-track">
        <HomeScenes signedIn={signedIn} points={points} />
      </div>
      <nav aria-label="8개 홈 화면 이동" className="chapter-pager">
        {sceneLabels.map((label, i) => (
          <button aria-label={`${i + 1}번 화면: ${label}`} data-home-go={i} key={label} type="button">
            <span className="dot" aria-hidden="true" />
          </button>
        ))}
        <span aria-live="polite" className="current-index">01 / 08</span>
      </nav>
      <div className="chapter-nav" aria-label="홈 화면 이전·다음 이동">
        <button aria-label="이전 장면" className="aura-scene-prev" type="button">‹</button>
        <strong aria-live="polite" className="aura-scene-status">장면 1 / 3</strong>
        <button aria-label="다음 장면" className="aura-scene-next" type="button">›</button>
      </div>
    </main>
  )
}
