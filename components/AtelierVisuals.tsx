"use client"

import { atelierVolumes } from "@/data/atelier"
import { useId, type CSSProperties } from "react"
import "./AtelierVisuals.css"

type ProductKind = "Hand Cream" | "Diffuser" | "Perfume"
type RGB = [number, number, number]

const noteColors: Record<string, RGB> = {
  Bergamot: [174, 194, 114], Mandarin: [235, 170, 91], Grapefruit: [222, 139, 121],
  Fig: [174, 156, 181], Peony: [221, 171, 184], Neroli: [225, 211, 153],
  Cedarwood: [155, 139, 112], "White Musk": [205, 213, 200], Sandalwood: [192, 160, 122],
}

/** TOP · HEART · BASE. Fixed so every note keeps its own layer in the vessel. */
const noteGroups = [
  { label: "TOP", items: ["Bergamot", "Mandarin", "Grapefruit"] },
  { label: "HEART", items: ["Fig", "Peony", "Neroli"] },
  { label: "BASE", items: ["Cedarwood", "White Musk", "Sandalwood"] },
]

const fallbackColor: RGB = [177, 193, 181]
const toCss = (color: RGB) => `rgb(${color.map(Math.round).join(", ")})`
const mix = (from: RGB, to: RGB, amount: number) => [0, 1, 2].map((i) => from[i] + (to[i] - from[i]) * amount) as RGB

function averageColor(ingredients: string[]): RGB {
  const colors = ingredients.map((name) => noteColors[name]).filter(Boolean)
  if (!colors.length) return fallbackColor
  const average = [0, 1, 2].map((channel) => colors.reduce((sum, color) => sum + color[channel], 0) / colors.length) as RGB
  // Averaging many notes drifts toward grey; lift saturation so the blend keeps a character.
  const mean = (average[0] + average[1] + average[2]) / 3
  return average.map((value) => Math.max(0, Math.min(255, mean + (value - mean) * 1.35))) as RGB
}

function blendColor(ingredients: string[]) {
  return toCss(averageColor(ingredients))
}

const ingredientImage = (name: string) => `/assets/ingredients/${name.toLowerCase().replaceAll(" ", "-")}.png`

const FLASK_SHAPE = "M130 42 H190 V132 C190 157 257 211 265 289 C273 353 246 373 160 373 C74 373 47 353 55 289 C63 211 130 157 130 132 Z"
const LIQUID_BOTTOM = 374
const NOTE_SIZE = 42

/** Stacks the selected notes from the bottom: BASE, HEART, TOP. Empty layers take no space. */
function stackLayers(ingredients: string[]) {
  return [...noteGroups].reverse().reduce<{ label: string; items: string[]; top: number; bottom: number }[]>((layers, group) => {
    const items = group.items.filter((item) => ingredients.includes(item))
    if (!items.length) return layers
    const bottom = layers.at(-1)?.top ?? LIQUID_BOTTOM
    return [...layers, { label: group.label, items, bottom, top: bottom - (20 + items.length * 12) }]
  }, [])
}

/**
 * Selected notes rest as BASE / HEART / TOP layers. While blending, the layers converge to one
 * colour and the notes are drawn into a vortex; at 100% only the blend remains.
 */
export function AtelierFlask({ ingredients, progress = 0, blended = false, tilt = 0 }: { ingredients: string[]; progress?: number; blended?: boolean; tilt?: number }) {
  const id = useId().replaceAll(":", "")
  const mixAmount = blended ? Math.min(1, Math.max(0, progress / 100)) : 0
  const complete = blended && progress >= 100
  const blendRgb = averageColor(ingredients)

  const layers = stackLayers(ingredients).map((layer) => ({ ...layer, color: mix(averageColor(layer.items), blendRgb, mixAmount) }))
  const liquidTop = layers.at(-1)?.top ?? LIQUID_BOTTOM
  const depth = LIQUID_BOTTOM - liquidTop

  // Soft boundaries between layers, widening as the blend progresses.
  const stops = [...layers].reverse().flatMap((layer) => {
    const feather = Math.min((layer.bottom - layer.top) / 2, 2 + mixAmount * 40)
    return [
      { offset: (layer.top + feather - liquidTop) / depth, color: layer.color },
      { offset: (layer.bottom - feather - liquidTop) / depth, color: layer.color },
    ]
  })

  const slosh = Math.max(-1, Math.min(1, tilt / 14)) * 9
  const surfaceLine = `M30 ${liquidTop + slosh} C100 ${liquidTop + slosh - 7} 220 ${liquidTop - slosh + 7} 290 ${liquidTop - slosh}`
  const vortexY = liquidTop + depth * .55

  const notes = layers.flatMap((layer) => layer.items.map((name, index) => ({
    name,
    restX: 160 + (index - (layer.items.length - 1) / 2) * 58,
    restY: (layer.top + layer.bottom) / 2,
    order: ingredients.indexOf(name),
  })))
  const vortex = Math.min(1, mixAmount * 4)

  return <svg className={`aura-flask-visual ${blended ? "is-blended" : ""} ${complete ? "is-complete" : ""}`} viewBox="0 0 320 410" role="img" aria-label={`${ingredients.length}가지 향료${blended ? "가 혼합된" : "를 담은"} 조향 용기`}>
    <defs>
      <clipPath id={`${id}-clip`}><path d={FLASK_SHAPE}/></clipPath>
      <linearGradient id={`${id}-glass`}><stop stopColor="#ffffff" stopOpacity=".23"/><stop offset=".25" stopColor="#ffffff" stopOpacity=".03"/><stop offset=".8" stopColor="#ffffff" stopOpacity=".08"/><stop offset="1" stopColor="#ffffff" stopOpacity=".3"/></linearGradient>
      <linearGradient id={`${id}-liquid`} gradientUnits="userSpaceOnUse" x1="0" y1={liquidTop} x2="0" y2={LIQUID_BOTTOM}>
        {stops.map((stop, index) => <stop key={index} offset={Math.max(0, Math.min(1, stop.offset))} stopColor={toCss(stop.color)} stopOpacity=".8"/>)}
      </linearGradient>
      <linearGradient id={`${id}-depth`} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#fff" stopOpacity=".14"/><stop offset=".35" stopColor="#000" stopOpacity="0"/><stop offset="1" stopColor="#000" stopOpacity=".26"/></linearGradient>
      <radialGradient id={`${id}-glow`}><stop stopColor={toCss(blendRgb)} stopOpacity=".5"/><stop offset="1" stopColor={toCss(blendRgb)} stopOpacity="0"/></radialGradient>
    </defs>
    <ellipse cx="160" cy="386" rx="111" ry="12" fill="#000" opacity=".3"/>
    {complete && <ellipse className="aura-flask-glow" cx="160" cy="300" rx="150" ry="110" fill={`url(#${id}-glow)`}/>}
    <path d={FLASK_SHAPE} fill={`url(#${id}-glass)`} stroke="#e8e1d5" strokeOpacity=".65" strokeWidth="2"/>
    <g clipPath={`url(#${id}-clip)`}>
      {layers.length > 0 && <>
        <path className="aura-flask-liquid" d={`${surfaceLine} V390 H30 Z`} fill={`url(#${id}-liquid)`}/>
        <path className="aura-flask-liquid" d={`${surfaceLine} V390 H30 Z`} fill={`url(#${id}-depth)`}/>
        <path className="aura-flask-liquid" d={surfaceLine} fill="none" stroke="#fff" strokeOpacity=".45" strokeWidth="1.5"/>
      </>}
      {layers.slice(0, -1).map((layer) => <path key={layer.label} className="aura-flask-liquid" d={`M40 ${layer.top} Q160 ${layer.top + 5} 280 ${layer.top}`} fill="none" stroke="#fff" strokeOpacity={Math.max(0, .3 - mixAmount * 1.2)} strokeDasharray="2 5"/>)}
      {blended && !complete && progress > 0 && <>
        <g className="aura-flask-swirl" style={{ opacity: Math.min(.6, mixAmount * 2), transformOrigin: `160px ${vortexY}px` }}>
          <ellipse cx="160" cy={vortexY} rx="78" ry="20" fill="none" stroke="#fff" strokeOpacity=".35" strokeDasharray="40 30"/>
          <ellipse cx="160" cy={vortexY} rx="46" ry="11" fill="none" stroke="#fff" strokeOpacity=".28" strokeDasharray="22 18"/>
        </g>
        {[0, 1, 2, 3, 4, 5].map((index) => <circle key={index} className="aura-flask-bubble" cx={104 + index * 22} cy={LIQUID_BOTTOM - 12} r={2 + index % 3} fill="#fff" style={{ "--bubble-rise": `${-(depth - 20)}px`, animationDelay: `${index * .37}s` } as CSSProperties}/>)}
      </>}
      {notes.map((note) => {
        const angle = mixAmount * Math.PI * 3 + note.order * (Math.PI * 2 / Math.max(1, notes.length))
        const x = note.restX + (160 + Math.cos(angle) * 72 - note.restX) * vortex
        const y = note.restY + (vortexY + Math.sin(angle) * Math.min(28, depth * .25) - note.restY) * vortex
        return <g key={note.name} className="aura-flask-note" style={{ transform: `translate(${x}px, ${y}px) scale(${1 - mixAmount * .45})`, opacity: complete ? 0 : .92 - mixAmount * .7 }}>
          {/* Falls in through the neck once, when the note is first added. */}
          <g className="aura-flask-drop" style={{ "--drop-x": `${160 - note.restX}px`, "--drop-y": `${20 - note.restY}px` } as CSSProperties}>
            <image href={ingredientImage(note.name)} x={-NOTE_SIZE / 2} y={-NOTE_SIZE / 2} width={NOTE_SIZE} height={NOTE_SIZE}/>
          </g>
        </g>
      })}
      {!blended && notes.map((note) => <ellipse key={`ripple-${note.name}`} className="aura-flask-ripple" cx="160" cy={liquidTop} rx="34" ry="5" fill="none" stroke="#fff"/>)}
      <path d="M84 228 Q68 284 80 339" fill="none" stroke="white" strokeOpacity=".4" strokeWidth="5" strokeLinecap="round"/>
      <path d="M222 220 Q254 277 239 336" fill="none" stroke="white" strokeOpacity=".18" strokeWidth="3"/>
    </g>
    {!blended && layers.map((layer) => <g key={`tag-${layer.label}`} className="aura-flask-layer-tag" style={{ transform: `translateY(${(layer.top + layer.bottom) / 2}px)` }}>
      <path d="M266 0 H280" stroke="#d8cfc1" strokeOpacity=".55"/>
      <text x="284" y="3" fill="#d8cfc1" fontSize="8" letterSpacing="1">{layer.label}</text>
    </g>)}
    <ellipse cx="160" cy="42" rx="30" ry="6" fill="none" stroke="#eee7d9" strokeOpacity=".7"/>
    <text x="160" y="183" textAnchor="middle" fill="#eee7d9" fontSize="18" letterSpacing="5">AURA</text>
    <text x="160" y="199" textAnchor="middle" fill="#d7cdbc" fontSize="7" letterSpacing="2">PERSONAL ATELIER</text>
  </svg>
}

const LABEL_NAME_SIZE = 14
/** Rough rendered width: Hangul is near full-width, Latin about half. */
const labelTextWidth = (text: string) => [...text].reduce((width, char) => width + LABEL_NAME_SIZE * (/[가-힣]/.test(char) ? 1 : /[A-Z]/.test(char) ? .68 : .52), 0)

export function AtelierProductVisual({ type, name, ingredients }: { type: ProductKind; name: string; ingredients: string[] }) {
  const id = useId().replaceAll(":", "")
  const labelY = type === "Diffuser" ? 258 : type === "Hand Cream" ? 218 : 228
  const labelWidth = type === "Hand Cream" ? 84 : 108
  const labelNameWidth = labelWidth - 12
  return <div className="aura-product-artwork">
    <svg viewBox="0 0 320 400" role="img" aria-label={`${name} ${type === "Hand Cream" ? "핸드크림" : type === "Diffuser" ? "디퓨저" : "향수"} 완성 제품`}>
      <defs><linearGradient id={`${id}-product`}><stop stopColor={blendColor(ingredients)} stopOpacity=".8"/><stop offset=".45" stopColor="#eee6d7" stopOpacity=".22"/><stop offset="1" stopColor={blendColor(ingredients)} stopOpacity=".65"/></linearGradient></defs>
      <ellipse cx="160" cy="370" rx="100" ry="13" fill="#000" opacity=".32"/>
      {type === "Hand Cream" ? <g>
        <path d="M96 76 H224 L208 321 H112 Z" fill="#e9e1d2" stroke="#f3ecdf"/>
        <path d="M98 80 H222 M100 87 H220" stroke="#c8b9a3"/>
        <rect x="111" y="318" width="98" height="40" rx="5" fill="#ab9474"/>
        <path d="M120 321 V354 M132 321 V354 M144 321 V354 M156 321 V354 M168 321 V354 M180 321 V354 M192 321 V354" stroke="#d4c2a6" strokeOpacity=".4"/>
      </g> : type === "Diffuser" ? <g>
        <path d="M146 207 L110 42 M157 207 L155 24 M168 207 L201 41 M151 207 L130 28 M165 207 L181 22" stroke="#c9b99e" strokeWidth="5" strokeLinecap="round"/>
        <rect x="88" y="204" width="144" height="149" rx="24" fill={`url(#${id}-product)`} stroke="#e4dbcc" strokeOpacity=".7"/>
        <rect x="132" y="187" width="56" height="24" rx="4" fill="#ac9472"/>
        <path d="M101 230 V319" stroke="white" strokeOpacity=".36" strokeWidth="4" strokeLinecap="round"/>
      </g> : <g>
        <rect x="89" y="143" width="142" height="208" rx="18" fill={`url(#${id}-product)`} stroke="#e4dbcc" strokeOpacity=".7"/>
        <rect x="132" y="124" width="56" height="23" rx="3" fill="#af9877"/>
        <rect x="125" y="78" width="70" height="51" rx="6" fill="#292724" stroke="#c7b590"/>
        <path d="M102 169 V317" stroke="white" strokeOpacity=".4" strokeWidth="4" strokeLinecap="round"/>
      </g>}
      <rect x={160 - labelWidth / 2} y={labelY - 26} width={labelWidth} height="80" rx="2" fill="#eee7db" fillOpacity=".96"/>
      <text x="160" y={labelY - 10} textAnchor="middle" fill="#282622" fontSize="9" letterSpacing="3">AURA</text>
      <path d={`M146 ${labelY - 3} H174`} stroke="#b9ab95" strokeWidth=".6"/>
      {/* The blend's own name, squeezed to the label width when it runs long. */}
      <text x="160" y={labelY + 15} textAnchor="middle" fill="#282622" fontSize={LABEL_NAME_SIZE} style={{ fontFamily: "var(--font-serif)" }}
        {...(labelTextWidth(name) > labelNameWidth ? { textLength: labelNameWidth, lengthAdjust: "spacingAndGlyphs" } : {})}>{name}</text>
      <text x="160" y={labelY + 33} textAnchor="middle" fill="#655c4f" fontSize="6" letterSpacing="1.2">PERSONAL BLEND</text>
      <text x="160" y={labelY + 44} textAnchor="middle" fill="#655c4f" fontSize="6" letterSpacing=".8">{type === "Hand Cream" ? "HAND CREAM" : type === "Diffuser" ? "DIFFUSER" : "EAU DE PARFUM"} · {atelierVolumes[type]}</text>
    </svg>
    <span className="aura-product-blend-name">{name}</span>
  </div>
}
