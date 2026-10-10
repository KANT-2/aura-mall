"use client"

import { useId } from "react"
import "./AtelierNaming.css"

export type BlendNameIdea = { en: string; ko: string }

export const BLEND_NAME_MAX = 20

/** Collapses spacing; an empty name falls back to the first suggestion. */
export const normalizeBlendName = (name: string, fallback: string) => name.replace(/\s+/g, " ").trim() || fallback

const noteWords: Record<string, BlendNameIdea & { layer: 0 | 1 | 2 }> = {
  Bergamot: { en: "Bergamot", ko: "베르가못", layer: 0 },
  Mandarin: { en: "Mandarin", ko: "만다린", layer: 0 },
  Grapefruit: { en: "Grapefruit", ko: "자몽", layer: 0 },
  Fig: { en: "Fig", ko: "무화과", layer: 1 },
  Peony: { en: "Peony", ko: "작약", layer: 1 },
  Neroli: { en: "Neroli", ko: "네롤리", layer: 1 },
  Cedarwood: { en: "Cedar", ko: "시더우드", layer: 2 },
  "White Musk": { en: "Musk", ko: "화이트 머스크", layer: 2 },
  Sandalwood: { en: "Sandalwood", ko: "샌달우드", layer: 2 },
}

/** TOP · HEART · BASE character: the time of day it evokes and two mood names. */
const layerCharacter: { time: BlendNameIdea; moods: [BlendNameIdea, BlendNameIdea] }[] = [
  { time: { en: "Dawn", ko: "새벽" }, moods: [{ en: "Clear Morning", ko: "맑은 아침" }, { en: "Bright Air", ko: "산뜻한 공기" }] },
  { time: { en: "Noon", ko: "한낮" }, moods: [{ en: "Petal Hour", ko: "꽃잎의 시간" }, { en: "Soft Bloom", ko: "부드러운 개화" }] },
  { time: { en: "Dusk", ko: "해 질 녘" }, moods: [{ en: "Quiet Ember", ko: "고요한 잔향" }, { en: "Velvet Night", ko: "벨벳 같은 밤" }] },
]

/**
 * Three names drawn from the blend itself: the layer with the most notes sets the character,
 * its first note is the signature, and a note from another layer adds the trace.
 */
export function suggestBlendNames(ingredients: string[]): BlendNameIdea[] {
  const known = ingredients.filter((name) => noteWords[name])
  if (!known.length) return [{ en: "My Aura", ko: "나의 아우라" }]
  const counts = [0, 1, 2].map((layer) => known.filter((name) => noteWords[name].layer === layer).length)
  const dominant = counts.indexOf(Math.max(...counts))
  const signature = noteWords[known.find((name) => noteWords[name].layer === dominant)!]
  const accent = noteWords[[...known].reverse().find((name) => noteWords[name].layer !== dominant) ?? known.at(-1)!]
  const character = layerCharacter[dominant]
  const ideas = [
    { en: `${signature.en} at ${character.time.en}`, ko: `${character.time.ko}의 ${signature.ko}` },
    character.moods[known.length % 2],
    { en: `Trace of ${accent.en}`, ko: `${accent.ko}의 잔향` },
  ]
  return ideas.filter((idea, index) => ideas.findIndex((other) => other.en === idea.en) === index)
}

export function AtelierNaming({ name, ideas, onChange }: { name: string; ideas: BlendNameIdea[]; onChange: (name: string) => void }) {
  const inputId = useId()
  return <div className="atelier-naming">
    <p className="atelier-naming-label">추천 이름</p>
    <div className="atelier-naming-ideas" role="group" aria-label="추천 이름">
      {ideas.map((idea) => <button
        type="button"
        key={idea.en}
        className={`atelier-name-idea ${name === idea.en ? "is-active" : ""}`}
        aria-pressed={name === idea.en}
        aria-label={`${idea.en} · ${idea.ko}`}
        onClick={() => onChange(idea.en)}>
        <span className="atelier-name-idea-text" aria-hidden="true">
          <span className="atelier-name-idea-english" lang="en">{idea.en}</span>
          <span className="atelier-name-idea-korean" lang="ko">{idea.ko}</span>
        </span>
      </button>)}
    </div>
    <label className="atelier-naming-label" htmlFor={inputId}>직접 짓기</label>
    <div className="atelier-naming-field">
      <input id={inputId} type="text" value={name} maxLength={BLEND_NAME_MAX} placeholder={ideas[0].en} autoComplete="off" spellCheck={false}
        aria-describedby={`${inputId}-hint`} onChange={(event) => onChange(event.target.value)}/>
      <span aria-hidden="true">{name.length}/{BLEND_NAME_MAX}</span>
    </div>
    <p className="atelier-naming-hint" id={`${inputId}-hint`}>보틀 라벨에 새겨져요. 비워 두면 ‘{ideas[0].en}’(으)로 저장돼요.</p>
  </div>
}
