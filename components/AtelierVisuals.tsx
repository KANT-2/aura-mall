"use client"

import { useId } from "react"
import "./AtelierVisuals.css"

type ProductKind = "Hand Cream" | "Diffuser" | "Perfume"

const noteColors: Record<string, [number, number, number]> = {
  Bergamot: [174, 194, 114], Mandarin: [235, 170, 91], Grapefruit: [222, 139, 121],
  Fig: [174, 156, 181], Peony: [221, 171, 184], Neroli: [225, 211, 153],
  Cedarwood: [155, 139, 112], "White Musk": [205, 213, 200], Sandalwood: [192, 160, 122],
}

function blendColor(ingredients: string[]) {
  const colors = ingredients.map((name) => noteColors[name]).filter(Boolean)
  if (!colors.length) return "rgb(177, 193, 181)"
  return `rgb(${[0, 1, 2].map((channel) => Math.round(colors.reduce((sum, color) => sum + color[channel], 0) / colors.length)).join(", ")})`
}

export function AtelierFlask({ ingredients, progress = 0, blended = false }: { ingredients: string[]; progress?: number; blended?: boolean }) {
  const id = useId().replaceAll(":", "")
  const shape = "M130 42 H190 V132 C190 157 257 211 265 289 C273 353 246 373 160 373 C74 373 47 353 55 289 C63 211 130 157 130 132 Z"
  const liquidTop = 348 - Math.min(ingredients.length, 9) * 13 - progress * 0.35
  return <svg className={`aura-flask-visual ${blended ? "is-blended" : ""}`} viewBox="0 0 320 410" role="img" aria-label={`${ingredients.length}가지 향료${blended ? "가 혼합된" : "를 담은"} 조향 용기`}>
    <defs>
      <clipPath id={`${id}-clip`}><path d={shape}/></clipPath>
      <linearGradient id={`${id}-glass`}><stop stopColor="#ffffff" stopOpacity=".23"/><stop offset=".25" stopColor="#ffffff" stopOpacity=".03"/><stop offset=".8" stopColor="#ffffff" stopOpacity=".08"/><stop offset="1" stopColor="#ffffff" stopOpacity=".3"/></linearGradient>
      <linearGradient id={`${id}-liquid`} x1="0" y1="0" x2="0" y2="1"><stop stopColor={blendColor(ingredients)} stopOpacity=".72"/><stop offset="1" stopColor={blendColor(ingredients)} stopOpacity=".25"/></linearGradient>
    </defs>
    <ellipse cx="160" cy="386" rx="111" ry="12" fill="#000" opacity=".3"/>
    <path d={shape} fill={`url(#${id}-glass)`} stroke="#e8e1d5" strokeOpacity=".65" strokeWidth="2"/>
    <g clipPath={`url(#${id}-clip)`}>
      {ingredients.length > 0 && <path className="aura-flask-liquid" d={`M35 ${liquidTop} Q100 ${liquidTop - 12} 160 ${liquidTop} T285 ${liquidTop} V385 H35 Z`} fill={`url(#${id}-liquid)`}/>}
      {ingredients.map((ingredient, index) => <image key={ingredient} className="aura-flask-ingredient" href={`/assets/ingredients/${ingredient.toLowerCase().replaceAll(" ", "-")}.png`} x={84 + index % 3 * 52} y={209 + Math.floor(index / 3) * 46} width="48" height="48" opacity={blended ? .25 : .82}/>) }
      <path d="M84 228 Q68 284 80 339" fill="none" stroke="white" strokeOpacity=".4" strokeWidth="5" strokeLinecap="round"/>
      <path d="M222 220 Q254 277 239 336" fill="none" stroke="white" strokeOpacity=".18" strokeWidth="3"/>
    </g>
    <ellipse cx="160" cy="42" rx="30" ry="6" fill="none" stroke="#eee7d9" strokeOpacity=".7"/>
    <text x="160" y="183" textAnchor="middle" fill="#eee7d9" fontSize="18" letterSpacing="5">AURA</text>
    <text x="160" y="199" textAnchor="middle" fill="#d7cdbc" fontSize="7" letterSpacing="2">PERSONAL ATELIER</text>
  </svg>
}

export function AtelierProductVisual({ type, name, ingredients }: { type: ProductKind; name: string; ingredients: string[] }) {
  const id = useId().replaceAll(":", "")
  const labelY = type === "Diffuser" ? 258 : type === "Hand Cream" ? 218 : 228
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
      <rect x="112" y={labelY - 23} width="96" height="75" rx="2" fill="#eee7db" fillOpacity=".96"/>
      <text x="160" y={labelY} textAnchor="middle" fill="#282622" fontSize="16" letterSpacing="4">AURA</text>
      <text x="160" y={labelY + 18} textAnchor="middle" fill="#655c4f" fontSize="7" letterSpacing="1.2">PERSONAL BLEND</text>
      <text x="160" y={labelY + 34} textAnchor="middle" fill="#655c4f" fontSize="7">{type === "Hand Cream" ? "HAND CREAM" : type === "Diffuser" ? "DIFFUSER" : "EAU DE PARFUM"}</text>
    </svg>
    <span className="aura-product-blend-name">{name}</span>
  </div>
}
