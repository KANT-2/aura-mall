import type { Stage } from "@/lib/aura/atelier";

export const stageLabels: Record<Stage, string> = {top:"TOP · 첫인상", middle:"HEART · 중심", base:"BASE · 잔향"};
export const stageDescriptions:Record<Stage,string> = {top:"처음 마주하는 맑은 인상",middle:"오래 머무는 향의 중심",base:"마지막까지 남는 잔향"};
export const noteDescriptors:Record<string,string> = {
  bergamot:"시트러스 · 밝은 · 프레시", lemon:"상큼한 · 투명한 · 청량", mandarin:"달콤한 · 밝은 · 산뜻", grapefruit:"쌉싸름한 · 산뜻 · 시트러스",
  peppermint:"시원한 · 허벌 · 맑은", rosemary:"허벌 · 그린 · 깨끗한", apple:"과일 · 싱그러운 · 부드러운", peach:"달콤한 · 포근한 · 과일",
  rose:"플로럴 · 섬세한 · 로맨틱", jasmine:"플로럴 · 에어리 · 우아한", neroli:"화이트 플로럴 · 부드러운", lavender:"차분한 · 허벌 · 편안한",
  ylang:"풍성한 · 이국적 · 플로럴", muguet:"투명한 · 깨끗한 · 플로럴", "pink-pepper":"스파이시 · 싱그러운", cardamom:"스파이시 · 그린 · 따뜻한",
  sandalwood:"우디 · 따뜻한 · 차분한", cedarwood:"우디 · 드라이 · 안정적인", vetiver:"흙내음 · 그린 · 우디", "white-musk":"보송한 · 깨끗한 · 은은한",
  amber:"앰버 · 깊은 · 부드러운", vanilla:"포근한 · 달콤한 · 크리미", benzoin:"레진 · 따뜻한 · 깊은", tonka:"달콤한 · 우디 · 포근한"
};
export const noteEnglish:Record<Stage,string> = { top:"TOP",middle:"HEART",base:"BASE" };
// Fragrance preferences are separate from FRESH / SOFT / WARM commerce collections.
export const scentFamilies = [
  {id:"citrus",name:"시트러스",english:"CITRUS",asset:"bergamot",description:"상큼하고 투명한 시작",notes:["bergamot","lemon","grapefruit","neroli"]},
  {id:"floral",name:"플로럴",english:"FLORAL",asset:"jasmine",description:"꽃이 남기는 부드러운 여운",notes:["neroli","jasmine","rose","muguet"]},
  {id:"woody",name:"우디",english:"WOODY",asset:"sandalwood",description:"차분한 나무와 깊은 잔향",notes:["rosemary","cedarwood","sandalwood","vetiver"]},
  {id:"musky",name:"머스키",english:"MUSKY",asset:"white-musk",description:"가까이 머무는 포근함",notes:["bergamot","muguet","white-musk","vanilla"]},
  {id:"green",name:"그린",english:"GREEN",asset:"rosemary",description:"풀잎처럼 산뜻하고 깨끗하게",notes:["peppermint","rosemary","lavender","vetiver"]},
  {id:"spicy",name:"스파이시",english:"SPICY",asset:"cardamom",description:"따뜻하고 선명한 개성",notes:["pink-pepper","cardamom","sandalwood","amber"]},
] as const;
