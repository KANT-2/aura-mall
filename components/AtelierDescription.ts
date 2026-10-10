/**
 * Korean copy describing a MY AURA blend. Like a perfume house's product copy, it leads with a
 * scene, then names only the signature note and the note it rests on; the full TOP · HEART · BASE
 * list is shown separately.
 */

const finalConsonant = (word: string) => {
  const code = word.charCodeAt(word.length - 1)
  return code >= 0xac00 && code <= 0xd7a3 ? (code - 0xac00) % 28 : 0
}

/** Appends 이/가-style particles by whether the last Hangul syllable has a final consonant. */
export const withParticle = (word: string, withFinal: string, withoutFinal: string) => word + (finalConsonant(word) ? withFinal : withoutFinal)

type NoteStory = { layer: 0 | 1 | 2; scene: string; sense: string; mood: string }

const notes: Record<string, NoteStory> = {
  Bergamot: { layer: 0, scene: "햇살이 막 들기 시작한 이른 아침의 정원", sense: "베르가못의 맑은 쌉쌀함", mood: "산뜻한" },
  Mandarin: { layer: 0, scene: "늦은 오후, 창가로 금빛이 번지는 시간", sense: "만다린의 달콤한 과즙", mood: "다정한" },
  Grapefruit: { layer: 0, scene: "분홍빛으로 밝아오는 새벽의 공기", sense: "자몽의 경쾌한 쌉싸름함", mood: "생기 있는" },
  Fig: { layer: 1, scene: "한여름, 무화과나무 그늘 아래", sense: "무화과의 푸른 잎과 우윳빛 과육", mood: "편안한" },
  Peony: { layer: 1, scene: "꽃잎이 가득 열린 오월의 정원", sense: "작약의 풍성한 꽃잎", mood: "화사한" },
  Neroli: { layer: 1, scene: "흰 꽃이 핀 오렌지 나무 아래의 바람", sense: "네롤리의 맑고 하얀 꽃향", mood: "깨끗한" },
  Cedarwood: { layer: 2, scene: "비가 그친 뒤의 고요한 숲", sense: "시더우드의 단정한 나무결", mood: "차분한" },
  "White Musk": { layer: 2, scene: "햇볕에 잘 마른 하얀 리넨", sense: "화이트 머스크의 보송한 살결", mood: "포근한" },
  Sandalwood: { layer: 2, scene: "해가 진 뒤, 온기가 남은 벽난로 곁", sense: "샌달우드의 크리미한 온기", mood: "따뜻한" },
}

/** The moment the blend suits, by which layer leads. */
const moments = {
  top: "가볍게 하루를 여는 아침에 어울려요.",
  heart: "누군가를 만나러 가는 오후에 어울려요.",
  base: "하루를 차분히 정리하는 저녁에 어울려요.",
  balanced: "시간과 계절에 구애받지 않고 곁에 두기 좋아요.",
  full: "시간이 지날수록 겹겹이 다른 얼굴을 보여 줘요.",
}

type Profile = keyof typeof moments

/** The leading layer gives the signature note; an even blend is carried by its heart. */
function blendShape(ingredients: string[]) {
  const selected = ingredients.filter((name) => notes[name])
  const layers = [0, 1, 2].map((layer) => selected.filter((name) => notes[name].layer === layer))
  if (layers.some((layer) => !layer.length)) return null
  const counts = layers.map((layer) => layer.length)
  const max = Math.max(...counts)
  const leaders = counts.filter((count) => count === max).length
  const profile: Profile = selected.length === 9 ? "full" : leaders > 1 ? "balanced" : (["top", "heart", "base"] as const)[counts.indexOf(max)]
  const signatureLayer = profile === "top" ? 0 : profile === "base" ? 2 : 1
  return { selected, profile, signature: layers[signatureLayer][0], anchor: signatureLayer === 2 ? layers[0][0] : layers[2][0] }
}

/** The note a blend is named and described after, so its first suggested name tells the same story. */
export const signatureNote = (ingredients: string[]) => blendShape(ingredients)?.signature ?? null

/** Scene title, a two-note sentence, the moment it suits, and up to three mood words. */
export function describeBlend(ingredients: string[]) {
  const shape = blendShape(ingredients)
  if (!shape) return null
  const signature = notes[shape.signature]
  const anchor = notes[shape.anchor]
  const moods = [signature.mood, anchor.mood, ...shape.selected.map((name) => notes[name].mood)].filter((mood, index, all) => all.indexOf(mood) === index).slice(0, 3)
  return {
    headline: signature.scene,
    story: `${signature.sense}에 ${withParticle(anchor.sense, "이", "가")} 포개지는 향이에요. ${moments[shape.profile]}`,
    moods,
  }
}
