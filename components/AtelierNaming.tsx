"use client"

import { useId, useState } from "react"
import { signatureNote, withParticle } from "./AtelierDescription"
import "./AtelierNaming.css"

export type BlendNameIdea = { en: string; ko: string; style: "poetic" | "brand" }

export const BLEND_NAME_MAX = 20

/** Collapses spacing; an empty name falls back to the first suggestion. */
export const normalizeBlendName = (name: string, fallback: string) => name.replace(/\s+/g, " ").trim() || fallback

type Word = { en: string; ko: string }
type NoteVocabulary = { layer: 0 | 1 | 2; name: Word; image: Word; adjective: Word; scene: Word }

/** What each note evokes: its own name, an image, a quality, and a scene. */
const vocabulary: Record<string, NoteVocabulary> = {
  Bergamot: { layer: 0, name: { en: "Bergamot", ko: "베르가못" }, image: { en: "Morning Light", ko: "아침 햇살" }, adjective: { en: "Sunlit", ko: "햇살 머금은" }, scene: { en: "Early Garden", ko: "이른 아침 정원" } },
  Mandarin: { layer: 0, name: { en: "Mandarin", ko: "만다린" }, image: { en: "Golden Hour", ko: "금빛 오후" }, adjective: { en: "Golden", ko: "금빛" }, scene: { en: "Golden Window", ko: "금빛 창가" } },
  Grapefruit: { layer: 0, name: { en: "Grapefruit", ko: "자몽" }, image: { en: "Pink Dawn", ko: "분홍빛 새벽" }, adjective: { en: "Blushing", ko: "발그레한" }, scene: { en: "First Light", ko: "첫 햇살" } },
  Fig: { layer: 1, name: { en: "Fig", ko: "무화과" }, image: { en: "Orchard", ko: "과수원" }, adjective: { en: "Milky", ko: "뽀얀" }, scene: { en: "Fig Shade", ko: "무화과 그늘" } },
  Peony: { layer: 1, name: { en: "Peony", ko: "작약" }, image: { en: "Petals", ko: "꽃잎" }, adjective: { en: "Blooming", ko: "피어나는" }, scene: { en: "May Garden", ko: "오월의 정원" } },
  Neroli: { layer: 1, name: { en: "Neroli", ko: "네롤리" }, image: { en: "Blossom", ko: "흰 꽃" }, adjective: { en: "Luminous", ko: "빛나는" }, scene: { en: "Orange Grove", ko: "오렌지 나무 아래" } },
  Cedarwood: { layer: 2, name: { en: "Cedar", ko: "시더" }, image: { en: "Forest", ko: "숲" }, adjective: { en: "Quiet", ko: "고요한" }, scene: { en: "After the Rain", ko: "비 갠 숲" } },
  "White Musk": { layer: 2, name: { en: "Musk", ko: "머스크" }, image: { en: "Linen", ko: "리넨" }, adjective: { en: "Soft", ko: "포근한" }, scene: { en: "Clean Linen", ko: "마른 리넨" } },
  Sandalwood: { layer: 2, name: { en: "Sandalwood", ko: "샌달우드" }, image: { en: "Embers", ko: "잔불" }, adjective: { en: "Velvet", ko: "벨벳 같은" }, scene: { en: "Fireside", ko: "벽난로 곁" } },
}

/** Signature words for the overall shape of a blend. */
const profileWords: Record<"top" | "heart" | "base" | "balanced" | "full", Word[]> = {
  top: [{ en: "Aube", ko: "오브" }, { en: "Lumen", ko: "루멘" }],
  heart: [{ en: "Bloom", ko: "블룸" }, { en: "Petale", ko: "페탈" }],
  base: [{ en: "Velour", ko: "벨루어" }, { en: "Ember", ko: "엠버" }],
  balanced: [{ en: "Halo", ko: "헤일로" }, { en: "Equilibre", ko: "에퀼리브르" }],
  full: [{ en: "Plenitude", ko: "플레니튜드" }, { en: "Full Bloom", ko: "만개" }],
}

type Notes = { top: NoteVocabulary[]; heart: NoteVocabulary[]; base: NoteVocabulary[]; all: NoteVocabulary[] }

/** Poetic names are scenes, as perfume houses name a scent after a place or a memory. */
function poeticNames({ top, heart, base, all }: Notes): Word[] {
  return [
    ...all.map((note) => note.scene),
    ...heart.flatMap((h) => base.map((b) => ({ en: `${h.image.en} in ${b.image.en}`, ko: `${b.image.ko}에 스민 ${h.image.ko}` }))),
    ...base.flatMap((b) => heart.map((h) => ({ en: `${b.adjective.en} ${h.image.en}`, ko: `${b.adjective.ko} ${h.image.ko}` }))),
    ...top.map((t) => ({ en: `After ${t.image.en}`, ko: `${withParticle(t.image.ko, "이", "가")} 지나간 자리` })),
    ...top.map((t) => ({ en: `${t.adjective.en} Reverie`, ko: `${t.adjective.ko} 몽상` })),
    ...base.map((b) => ({ en: `${b.image.en} at Midnight`, ko: `자정의 ${b.image.ko}` })),
  ]
}

/** Brand names are short: a numbered signature, two notes paired, a quality and a note, or a profile word. */
function brandNames({ top, heart, base, all }: Notes, profile: keyof typeof profileWords): Word[] {
  const count = all.length
  return [
    ...all.map((note) => ({ en: `${note.name.en} No.${count}`, ko: `${note.name.ko} No.${count}` })),
    ...[...top, ...heart].flatMap((a) => base.map((b) => ({ en: `${a.name.en} & ${b.name.en}`, ko: `${a.name.ko} & ${b.name.ko}` }))),
    ...top.flatMap((t) => base.map((b) => ({ en: `${t.adjective.en} ${b.name.en}`, ko: `${t.adjective.ko} ${b.name.ko}` }))),
    ...base.flatMap((b) => heart.map((h) => ({ en: `${b.adjective.en} ${h.name.en}`, ko: `${b.adjective.ko} ${h.name.ko}` }))),
    ...profileWords[profile].flatMap((word) => [word, { en: `${word.en} ${String(count).padStart(2, "0")}`, ko: `${word.ko} ${String(count).padStart(2, "0")}` }]),
  ]
}

/** Same blend, same order; a different blend reshuffles. */
function seededShuffle<T>(items: T[], seedText: string) {
  let seed = [...seedText].reduce((hash, char) => Math.imul(hash ^ char.charCodeAt(0), 16777619), 2166136261)
  const random = () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

const fits = (word: Word) => word.en.length <= BLEND_NAME_MAX && word.ko.length <= BLEND_NAME_MAX

/**
 * One poetic and one brand-style name for the blend. `round` moves to the next pair, so asking
 * again keeps offering new names before any repeat.
 */
export function suggestBlendNames(ingredients: string[], round = 0): BlendNameIdea[] {
  const notes = ingredients.map((name) => vocabulary[name]).filter(Boolean)
  if (!notes.length) return [{ en: "My Aura", ko: "나의 아우라", style: "poetic" }, { en: "Aura No.1", ko: "아우라 No.1", style: "brand" }]
  const byLayer: Notes = {
    top: notes.filter((note) => note.layer === 0),
    heart: notes.filter((note) => note.layer === 1),
    base: notes.filter((note) => note.layer === 2),
    all: notes,
  }
  const counts = [byLayer.top.length, byLayer.heart.length, byLayer.base.length]
  const leaders = counts.filter((count) => count === Math.max(...counts)).length
  const profile = notes.length === 9 ? "full" : leaders > 1 ? "balanced" : (["top", "heart", "base"] as const)[counts.indexOf(Math.max(...counts))]
  const seed = [...ingredients].sort().join("|")
  // The first poetic name is the signature note's scene, matching the blend's description.
  const signatureScene = vocabulary[signatureNote(ingredients) ?? ""]?.scene
  const shuffled = seededShuffle(poeticNames(byLayer).filter(fits), `${seed}#poetic`)
  const poetic = signatureScene ? [signatureScene, ...shuffled.filter((name) => name.en !== signatureScene.en)] : shuffled
  const brand = seededShuffle(brandNames(byLayer, profile).filter(fits), `${seed}#brand`)
  return [
    { ...poetic[round % poetic.length], style: "poetic" },
    { ...brand[round % brand.length], style: "brand" },
  ]
}

export function AtelierNaming({ name, ingredients, fallback, onChange }: { name: string; ingredients: string[]; fallback: string; onChange: (name: string) => void }) {
  const inputId = useId()
  const [round, setRound] = useState(0)
  const ideas = suggestBlendNames(ingredients, round)
  return <div className="atelier-naming">
    <p className="atelier-naming-label">추천 이름</p>
    <div className="atelier-naming-ideas" role="group" aria-label="추천 이름">
      {ideas.map((idea) => <button
        type="button"
        key={idea.style}
        className={`atelier-name-idea ${name === idea.en ? "is-active" : ""}`}
        aria-pressed={name === idea.en}
        aria-label={`${idea.style === "poetic" ? "감성형" : "브랜드형"} 추천 이름 ${idea.en} · ${idea.ko}`}
        onClick={() => onChange(idea.en)}>
        <small className="atelier-name-idea-style" aria-hidden="true">{idea.style === "poetic" ? "POETIC" : "SIGNATURE"}</small>
        <span className="atelier-name-idea-text" aria-hidden="true">
          <span className="atelier-name-idea-english" lang="en">{idea.en}</span>
          <span className="atelier-name-idea-korean" lang="ko">{idea.ko}</span>
        </span>
      </button>)}
      <button type="button" className="atelier-name-more" onClick={() => setRound((current) => current + 1)}>
        <span aria-hidden="true">↻</span> 다른 이름 추천
      </button>
    </div>
    <label className="atelier-naming-label" htmlFor={inputId}>직접 짓기</label>
    <div className="atelier-naming-field">
      <input id={inputId} type="text" value={name} maxLength={BLEND_NAME_MAX} placeholder={fallback} autoComplete="off" spellCheck={false}
        aria-describedby={`${inputId}-hint`} onChange={(event) => onChange(event.target.value)}/>
      <span aria-hidden="true">{name.length}/{BLEND_NAME_MAX}</span>
    </div>
    <p className="atelier-naming-hint" id={`${inputId}-hint`}>보틀 라벨에 새겨져요. 비워 두면 ‘{fallback}’(으)로 저장돼요.</p>
  </div>
}
