"use client";
/* eslint-disable react-hooks/set-state-in-effect */
import Link from "next/link";
import { AuraWordmark } from "./AuraWordmark";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type PointerEvent } from "react";
import ingredients from "./ingredients.json";
import { collections, Asset, Beaker, totalCount, mixColor } from "./Shared";
import { type Recipe, useAura } from "./Provider";
import { AtelierModal, ProgressRing, UtilityIcon } from "../ui/AtelierControls";

type Note = (typeof ingredients)[number];
type Stage = "top" | "middle" | "base";
const stageLabels: Record<Stage, string> = {top:"TOP · 첫인상", middle:"HEART · 중심", base:"BASE · 잔향"};
const stageDescriptions:Record<Stage,string> = {top:"처음 마주하는 맑은 인상",middle:"오래 머무는 향의 중심",base:"마지막까지 남는 잔향"};
const stageOrder:Stage[] = ["top","middle","base"];
const noteDescriptors:Record<string,string> = {
  bergamot:"시트러스 · 밝은 · 프레시", lemon:"상큼한 · 투명한 · 청량", mandarin:"달콤한 · 밝은 · 산뜻", grapefruit:"쌉싸름한 · 산뜻 · 시트러스",
  peppermint:"시원한 · 허벌 · 맑은", rosemary:"허벌 · 그린 · 깨끗한", apple:"과일 · 싱그러운 · 부드러운", peach:"달콤한 · 포근한 · 과일",
  rose:"플로럴 · 섬세한 · 로맨틱", jasmine:"플로럴 · 에어리 · 우아한", neroli:"화이트 플로럴 · 부드러운", lavender:"차분한 · 허벌 · 편안한",
  ylang:"풍성한 · 이국적 · 플로럴", muguet:"투명한 · 깨끗한 · 플로럴", "pink-pepper":"스파이시 · 싱그러운", cardamom:"스파이시 · 그린 · 따뜻한",
  sandalwood:"우디 · 따뜻한 · 차분한", cedarwood:"우디 · 드라이 · 안정적인", vetiver:"흙내음 · 그린 · 우디", "white-musk":"보송한 · 깨끗한 · 은은한",
  amber:"앰버 · 깊은 · 부드러운", vanilla:"포근한 · 달콤한 · 크리미", benzoin:"레진 · 따뜻한 · 깊은", tonka:"달콤한 · 우디 · 포근한"
};
const noteEnglish:Record<Stage,string> = { top:"TOP",middle:"HEART",base:"BASE" };


/** Largest-remainder allocation: displayed percentages always total exactly 100. */
function percentages(counts:Record<string,number>) {
  const entries = Object.entries(counts).filter(([,n])=>n>0);
  const total = entries.reduce((n,[,v])=>n+v,0);
  if(!total) return {} as Record<string,number>;
  const sorted = entries.map(([id,n])=>({id, exact:n*100/total, value:Math.floor(n*100/total)}));
  let left = 100 - sorted.reduce((n,x)=>n+x.value,0);
  sorted.sort((a,b)=>(b.exact-b.value)-(a.exact-a.value) || a.id.localeCompare(b.id));
  for(const entry of sorted) if(left-->0) entry.value++;
  return Object.fromEntries(sorted.map(({id,value})=>[id,value])) as Record<string,number>;
}

function FloatingComposition({ notes, className="", compact=false }:{notes:Note[];className?:string;compact?:boolean}) {
  // Limit the artwork to the leading notes; the complete recipe remains accessible as text.
  const chosen = [...notes].slice(0, compact?8:6);
  return <div className={`a-note-composition ${compact?"compact":""} ${className}`} aria-hidden="true">
    <span className="a-composition-line"/>
    {chosen.map((note,index)=><span className={`a-floating-ingredient a-float-${index%6}`} key={note.id} style={{"--float-order":index} as CSSProperties}>
      <Asset id={note.id}/><small>{note.name}</small>
    </span>)}
  </div>;
}

function stageRatiosForNames(counts:Record<string,number>):"fresh"|"soft"|"warm"{
  const total=Object.values(counts).reduce((n,v)=>n+v,0);
  if(!total)return "fresh";
  const t=ingredients.filter(i=>i.stage==="top").reduce((n,i)=>n+(counts[i.id]||0),0);
  const h=ingredients.filter(i=>i.stage==="middle").reduce((n,i)=>n+(counts[i.id]||0),0);
  const b=total-t-h;
  return b>t && b>=h?"warm":h>t?"soft":"fresh";
}

export function Atelier(){
  const {recipes,save,user,notify}=useAura();
  const [step,setStep]=useState<"entry"|"select"|"result">("entry");
  const [tab,setTab]=useState<Stage>("top");
  const [counts,setCounts]=useState<Record<string,number>>({});
  const [recommended,setRecommended]=useState<string[]>([]);
  const [drop,setDrop]=useState(0);
  const [progress,setProgress]=useState(0);
  const [name,setName]=useState("");
  const [label,setLabel]=useState("classic");
  const [parent,setParent]=useState<Recipe>();
  const [saved,setSaved]=useState(false);
  const [draftReady,setDraftReady]=useState(false);
  const [overlay,setOverlay]=useState<"blend"|"recipe"|"info"|null>(null);
  const [blendMode,setBlendMode]=useState<"ready"|"manual"|"auto"|"done">("ready");
  const [gestureActive,setGestureActive]=useState(false);
  const [dragActive,setDragActive]=useState(false);
  const gesture=useRef<{angle:number,direction:number,travel:number}|null>(null);
  const [canNativeShare,setCanNativeShare]=useState(false);


  const total=totalCount(counts);
  const color=mixColor(counts);
  const selected=useMemo(()=>ingredients.filter(i=>counts[i.id]>0).sort((a,b)=>stageOrder.indexOf(a.stage as Stage)-stageOrder.indexOf(b.stage as Stage)),[counts]);
  const ranked=useMemo(()=>[...selected].sort((a,b)=>(counts[b.id]||0)-(counts[a.id]||0)),[selected,counts]);
  const ratio=useMemo(()=>percentages(counts),[counts]);
  const stages=stageOrder.map(s=>selected.filter(i=>i.stage===s));
  const blendComplete=progress>=100;
  const turnsRemaining = Math.max(0, (100-progress)/33.3333).toFixed(1);
  const mood = stageRatiosForNames(counts);
  const suggestedNames = useMemo(()=>{
    const theme = mood === "fresh" ? ["투명한 오후","초록의 틈","시트러스 모닝","가벼운 숨","첫 번째 햇살"] : mood === "soft" ? ["느린 오후","포근한 여백","꽃이 머문 자리","고요한 온기","부드러운 잔상"] : ["나무의 시간","따뜻한 그림자","밤의 서가","오래 남는 온도","앰버의 결"];
    const dominant = [...selected].sort((a,b)=>(counts[b.id]||0)-(counts[a.id]||0))[0];
    return [...new Set([...theme,dominant?`${dominant.name}의 순간`:"나의 향"])].slice(0,5);
  },[counts,selected,mood]);
  const atmosphere=stages[1].length>stages[0].length?"풍성한 중심 노트":stages[2].length>stages[0].length?"차분한 잔향 중심":"균형을 찾아가는 중";

  useEffect(()=>{
    const key=new URLSearchParams(location.search).get("recipe");
    const recipe=recipes.find(r=>r.id===key);
    if(recipe&&parent?.id!==recipe.id){setParent(recipe);setCounts({...recipe.counts});setName(recipe.name);setLabel(recipe.label);setStep("select");}
  },[recipes,parent?.id]);
  useEffect(()=>{
    setCanNativeShare(typeof navigator!=="undefined" && typeof navigator.share==="function");
    try{if(!new URLSearchParams(location.search).has("recipe")){
      const raw=sessionStorage.getItem("aura_atelier_draft_v2");const draft=raw?JSON.parse(raw):null;
      if(draft){setCounts(draft.counts||{});setName(draft.name||"");setLabel(draft.label||"classic");setStep(draft.step==="result"?"result":"select");}
    }}catch{}setDraftReady(true);
  },[]);
  useEffect(()=>{
    if(!draftReady)return;
    try{if(total)sessionStorage.setItem("aura_atelier_draft_v2",JSON.stringify({counts,name,label,step}));else sessionStorage.removeItem("aura_atelier_draft_v2");}catch{}
  },[counts,name,label,step,total,draftReady]);
  useEffect(()=>{
    if(overlay!=="blend" || blendMode!=="auto" || blendComplete)return;
    const timer=window.setInterval(()=>setProgress(value=>Math.min(100,value+1)),85);
    return ()=>window.clearInterval(timer);
  },[overlay,blendMode,blendComplete]);
  useEffect(()=>{ if(overlay==="blend" && blendComplete)setBlendMode("done"); },[overlay,blendComplete]);

  function add(id:string){
    if(total>=20){notify("최대 20회까지 담을 수 있어요.");return;}
    setCounts(previous=>({...previous,[id]:(previous[id]||0)+1}));setDrop(x=>x+1);setSaved(false);
  }
  function decrease(id:string){setCounts(prev=>{const updated={...prev};if((updated[id]||0)<=1)delete updated[id];else updated[id]--;return updated;});setSaved(false);}
  function remove(id:string){setCounts(prev=>{const updated={...prev};delete updated[id];return updated;});setSaved(false);}
  function recommend(id:string){setRecommended(id==="fresh"?["bergamot","lemon","neroli","white-musk"]:id==="soft"?["peach","rose","jasmine","white-musk"]:["mandarin","cardamom","sandalwood","amber"]);setTab("top");setStep("select");}
  function startBlend(){if(total===0)return;setProgress(0);setBlendMode("ready");setGestureActive(false);setOverlay("blend");}
  function closeOverlay(){setOverlay(null);gesture.current=null;setGestureActive(false);}
  function dropIngredient(event:DragEvent<HTMLElement>){
    event.preventDefault(); setDragActive(false);
    const id=event.dataTransfer.getData("application/x-aura-note") || event.dataTransfer.getData("text/plain");
    if(ingredients.some(n=>n.id===id))add(id);
  }
  function startGesture(event:PointerEvent<HTMLDivElement>){
    if(blendComplete)return;
    const rect=event.currentTarget.getBoundingClientRect();
    gesture.current={angle:Math.atan2(event.clientY-rect.top-rect.height/2,event.clientX-rect.left-rect.width/2),direction:0,travel:0};
    event.currentTarget.setPointerCapture(event.pointerId);
    setGestureActive(true);setBlendMode("manual");
  }
  function moveGesture(event:PointerEvent<HTMLDivElement>){
    if(!gesture.current || blendComplete)return;
    const rect=event.currentTarget.getBoundingClientRect();
    const next=Math.atan2(event.clientY-rect.top-rect.height/2,event.clientX-rect.left-rect.width/2);
    let delta=next-gesture.current.angle;
    if(delta>Math.PI)delta-=Math.PI*2;
    if(delta< -Math.PI)delta+=Math.PI*2;
    if(Math.abs(delta)<1.15){
      if(!gesture.current.direction && Math.abs(delta)>.02)gesture.current.direction=Math.sign(delta);
      const step=Math.max(0,delta*(gesture.current.direction||1));
      // A deliberate 3-turn stir; one tap or short swipe never completes the blend.
      if(step>.008 && step<.85){
        gesture.current.travel+=step;
        setProgress(p=>Math.min(100,p+step/(Math.PI*6)*100));
      }
    }
    gesture.current.angle=next;
  }
  function endGesture(event:PointerEvent<HTMLDivElement>){
    gesture.current=null;setGestureActive(false);
    if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function recipeText(){return `${name||"나의 향"} / AURA ATELIER\n${stageOrder.map(st=>`${stageLabels[st]}: ${selected.filter(n=>n.stage===st).map(n=>`${n.name} ${counts[n.id]}회`).join(" · ")||"없음"}`).join("\n")}\n총 ${total}회 · ${selected.length}종`; }
  async function copyRecipe(){try{await navigator.clipboard.writeText(recipeText());notify("레시피가 클립보드에 복사됐어요.");}catch{notify("복사 권한을 확인해 주세요.");}}
  async function shareRecipe(){
    if(typeof navigator.share!=="function"){notify("공유를 지원하지 않는 브라우저예요. 레시피 복사를 사용해 주세요.");return;}
    try{await navigator.share({title:`AURA | ${name||"나의 향"}`,text:recipeText()});}catch(e){if((e as Error)?.name!=="AbortError")notify("공유를 완료하지 못했어요.");}
  }
  function enterResult(){setOverlay(null);setStep("result");window.requestAnimationFrame(()=>window.scrollTo({top:0,behavior:"instant"}));}
  function record(){
    if(!name.trim()){notify("향 이름을 입력해 주세요.");return;}
    if(!user){notify("로그인 후 향을 저장할 수 있어요.");return;}
    save({id:crypto.randomUUID(),parent:parent?.id,version:parent?parent.version+1:1,name:name.trim(),label,counts:{...counts},color,created:new Date().toISOString()});setSaved(true);
  }

  const recipeList=<div className="recipe-list a-recipe-list" aria-label="선택한 향료 비중">{selected.map(note=><div className="recipe-row a-recipe-chip" data-note={note.stage} key={note.id}>
    <div className="a-token-portrait"><Asset id={note.id}/></div><div className="a-token-main"><span className="a-token-category">{noteEnglish[note.stage as Stage]}</span><strong>{note.name}</strong><div className="a-token-subrow"><div className="a-token-track" aria-hidden="true"><span style={{width:`${ratio[note.id]}%`,background:note.color}}/></div><small>{counts[note.id]}회 · {ratio[note.id]}%</small></div></div>
    {step!=="result"&&<div className="a-chip-actions"><button aria-label={`${note.name} 1회 줄이기`} title="1회 줄이기" onClick={()=>decrease(note.id)}>−</button><button aria-label={`${note.name} 1회 추가`} title="1회 추가" disabled={total>=20} onClick={()=>add(note.id)}>+</button><button aria-label={`${note.name} 삭제`} title="향료 제거" onClick={()=>remove(note.id)}>×</button></div>}
  </div>)}</div>;
  const stageRatios=stageOrder.map(stage=>stageOrder.length ? ingredients.filter(i=>i.stage===stage).reduce((v,i)=>v+(counts[i.id]||0),0):0);
  const stageBadge=stageRatios[1]>stageRatios[0] && stageRatios[1]>=stageRatios[2] ? "FLORAL FORWARD" : stageRatios[2]>stageRatios[0] ? "WOODY BASE" : "BALANCED BLEND";

  return <main className={`atelier-page a-atelier a-v3 ${step==="select"?"a-editing":""}`}>
    <header className="atelier-heading a-heading"><div><span className="eyebrow">PERSONAL ATELIER / AURA</span><h1>{step==="entry"?"취향을 한 방울씩":step==="result"?"나만의 향을 기록하다":"향을 만드는 시간"}</h1></div>
      <div className="a-step-nav" aria-label="진행 단계"><span className={step!=="result"&&overlay!=="blend"?"active":""}>01 고르기</span><span className={overlay==="blend"?"active":""}>02 섞기</span><span className={step==="result"?"active":""}>03 기록하기</span></div>
    </header>
    {step==="entry"?<section className="atelier-entry page-width a-entry"><div className="entry-visual"><span className="a-entry-disc"/><Asset id="dropper"/><Beaker count={6} color="#d3ac6b"/></div><div><span className="eyebrow">A SCENT OF YOUR OWN</span><h2>나를 닮은 향의 시작.</h2><p>지금의 기분에서 출발해도 좋고, 마음에 드는 향료부터 골라도 좋아요.</p><div className="recommend-cards">{collections.map(c=><button key={c.id} onClick={()=>recommend(c.id)}><Asset id={c.id==="fresh"?"bergamot":c.id==="soft"?"jasmine":"sandalwood"}/><strong>{c.name}</strong><span>{c.title}</span></button>)}</div><button className="button" onClick={()=>{setRecommended([]);setStep("select");}}>향료 직접 고르기 <UtilityIcon name="arrow"/></button></div></section>
      :step==="select"?<><div className="atelier-workspace a-workspace" inert={overlay!==null}>
        <section className="ingredient-panel a-ingredients"><div className="panel-title"><h2>향료 고르기</h2><span>24 NOTES</span></div>
          {recommended.length>0&&<div className="recommendation"><span className="eyebrow">추천하는 첫 향료</span><div>{recommended.map(id=><button key={id} disabled={total>=20} onClick={()=>add(id)}><Asset id={id}/>{ingredients.find(i=>i.id===id)?.name}<span>+</span></button>)}</div></div>}
          <div className="tabs note-tabs" role="tablist" aria-label="향 노트">{stageOrder.map(s=><button key={s} role="tab" aria-selected={tab===s} className={tab===s?"selected":""} onClick={()=>setTab(s)}>{s==="top"?"탑":s==="middle"?"미들":"베이스"}<small>{s==="middle"?"HEART":s.toUpperCase()}</small></button>)}</div>
          <p className="micro">{stageDescriptions[tab]} · 터치할 때마다 한 방울</p>
          <div className="ingredient-grid a-ingredient-grid">{ingredients.filter(i=>i.stage===tab).map(note=><button key={note.id} className={`ingredient a-ingredient a-sheet-card ${counts[note.id]?"selected":""}`} draggable={total<20} onDragStart={e=>{e.dataTransfer.effectAllowed="copy";e.dataTransfer.setData("application/x-aura-note",note.id);e.dataTransfer.setData("text/plain",note.id);setDragActive(true);}} onDragEnd={()=>setDragActive(false)} aria-pressed={Boolean(counts[note.id])} aria-label={`${note.name} 한 방울 추가`} disabled={total>=20} onClick={()=>add(note.id)} data-note={tab}>
            <small className="ingredient-note">{noteEnglish[tab]}</small><span className="a-ingredient-art"><Asset id={note.id}/></span><strong>{note.name}</strong><small className="a-note-description">{noteDescriptors[note.id]}</small><span className="a-add-dot" aria-hidden="true">{counts[note.id]?counts[note.id]:"+"}</span>{counts[note.id]>0&&<span className="a-selected-check" aria-hidden="true">✓</span>}
          </button>)}</div>
        </section>
        <section className={`vessel-panel a-vessel ${dragActive?"a-vessel-target-active":""}`} onDragOver={e=>{e.preventDefault();e.dataTransfer.dropEffect="copy";}} onDrop={dropIngredient}><span className="eyebrow">YOUR BLEND</span><span className="a-vessel-drop-hint" aria-live="polite">{dragActive?"이곳에 놓아 향을 담아 주세요":"향료를 선택하거나 이곳에 끌어다 놓으세요"}</span><div className="a-vessel-art"><Beaker count={total} color={color} drop={drop}/>{drop>0&&<span key={drop} className="a-impact" style={{borderColor:color}}/>}</div>
          <div className="a-counters"><div><strong>{selected.length}</strong><small>선택한 향료</small></div><div className="a-dark-counter"><strong>{total}<small>/20</small></strong><small>담은 횟수</small></div></div>
          <div className="a-segment-meter" role="progressbar" aria-label="향료 투입 횟수" aria-valuenow={total} aria-valuemin={0} aria-valuemax={20}><span style={{width:`${total*5}%`,background:`linear-gradient(90deg,#eddfc1,${color})`}}/>{[1,2,3,4].map(n=><i key={n} style={{left:`${n*20}%`}}/>)}</div>
          <div className="a-meter-labels"><span>0</span><span>5</span><span>10</span><span>15</span><span>20회</span></div><div className="a-scent-badge a-sheet-badge"><span style={{background:color}}/>{atmosphere}<small>{stageBadge}</small></div>
          <div className="a-note-ratio" role="group" aria-label="선택한 향료 노트별 비중">{stageOrder.map((stage,index)=><div className="a-note-ratio-row" key={stage}><small>{noteEnglish[stage]}</small><div className="a-note-ratio-track"><span style={{width:`${total?stageRatios[index]/total*100:0}%`}} data-stage={stage}/></div><strong>{total?Math.round(stageRatios[index]/total*100):0}%</strong></div>)}</div>
          <div className="a-vessel-tools"><button className="a-icon-button" aria-label="전체 비우기" disabled={!total} onClick={()=>{setCounts({});setDrop(0);setSaved(false);}}><UtilityIcon name="reset"/></button><button className="a-icon-button" aria-label="조향 도움말" onClick={()=>setOverlay("info")}><UtilityIcon name="info"/></button></div>
        </section>
        <aside className="blend-summary a-summary"><div className="panel-title"><h2>내가 담은 향</h2><span>{selected.length}종</span></div><div className="a-summary-scroll">{total?recipeList:<div className="a-empty"><Asset id="droplet"/><p>좋아하는 향료부터 담아 보세요.<br/>한 방울씩 나만의 향이 쌓여요.</p></div>}</div>
          <p className="micro">비중은 선택 횟수의 비율이며 실제 향의 농도나 강도와는 달라요.</p><button className="button a-blend-button" disabled={!total} onClick={startBlend}>이 조합으로 향 섞기 <UtilityIcon name="arrow"/></button>
        </aside>
      </div><div className="a-mobile-dock" inert={overlay!==null}><button className="a-dock-summary" onClick={()=>setOverlay("recipe")}><span className="a-mini-dot" style={{background:color}}/><span>{selected.length}종 · {total}/20회<small>내가 담은 향 보기</small></span><UtilityIcon name="adjust"/></button><button className="button" disabled={!total} onClick={startBlend}>향 섞기 <UtilityIcon name="arrow"/></button></div></>
      :<section className="result-screen page-width a-result a-result-v3 a-result-v5">
        <div className={`a-result-bottle label-${label}`}>
          <span className="a-result-caption eyebrow">THE SCENT YOU MADE / AURA</span>
          <div className="a-result-note-gallery" aria-label={`선택한 향료 ${selected.length}종`}>
            {selected.map(n=><div className="a-result-note" key={n.id}><Asset id={n.id}/><span>{n.name}</span></div>)}
          </div>
          <div className="a-product-vessel"><Asset id="custom-bottle"/><div className="a-bottle-label" aria-label={`선택한 ${label} 라벨 미리보기`}>
            {label==="classic"?<><AuraWordmark className="a-bottle-brand-mark"/><strong>{name||"나의 향"}</strong><small>PERSONAL SCENT</small></>:
              label==="paper"?<><small>NO. {String(total).padStart(2,"0")}</small><AuraWordmark className="a-bottle-brand-mark"/><strong>{name||"나의 향"}</strong><small>HANDCRAFTED BLEND</small></>:
              <><AuraWordmark className="a-bottle-brand-mark"/><strong>{name||"나의 향"}</strong><span className="a-label-rule"/></>}
          </div></div>
          <p className="micro">선택한 모든 향료가 담긴 나만의 조합입니다.</p>
        </div>
        <div className="a-result-form"><span className="eyebrow">VERSION {parent?parent.version+1:1} · PRIVATE COMPOSITION</span><h2>이 향에 이름을 붙여 주세요.</h2><p className="a-result-lede">고른 향료가 하나의 조합으로 완성되었어요. 오래 간직하고 싶은 순간의 이름을 남겨 주세요.</p>
          <label className="a-name-field">향 이름<input value={name} maxLength={30} onChange={e=>{setName(e.target.value);setSaved(false);}} placeholder="예: 느린 오후"/></label>
          <div className="a-name-suggestions"><div className="a-mini-heading"><strong>향 이름 추천</strong><small>선택한 노트의 분위기를 바탕으로 제안해요</small></div><div className="a-suggestion-list">{suggestedNames.map(n=><button key={n} type="button" className={name===n?"active":""} onClick={()=>{setName(n);setSaved(false);}}>{n}<span aria-hidden="true">↗</span></button>)}</div></div>
          <fieldset className="label-options a-label-styles"><legend>라벨 스타일 <small>선택하면 왼쪽 병에 바로 반영돼요</small></legend>{[["classic","클래식","테두리 · 세리프"],["paper","페이퍼","종이 · 활자"],["minimal","미니멀","여백 · 모던"]].map(([id,text,desc])=><label key={id} className={`a-label-swatch a-label-${id}`}><input type="radio" name="label" checked={label===id} onChange={()=>{setLabel(id);setSaved(false);}}/><span><strong>{text}</strong><small>{desc}</small></span></label>)}</fieldset>
          <div className="a-note-pyramid">{stageOrder.map((st,index)=><div key={st}><span className="eyebrow">{stageLabels[st]}</span><p>{stages[index].map(n=>n.name).join(" · ")||"—"}</p></div>)}</div>
          <details className="a-recipe-details"><summary>전체 레시피 보기 · {selected.length}종 / {total}회</summary>{recipeList}</details>
          <div className="a-result-actions">{user?<button className="button" disabled={saved||!name.trim()} onClick={record}><UtilityIcon name="heart"/>{saved?"저장 완료":"나의 향 저장하기"}</button>:<Link className="button" href="/login?next=%2Fatelier">로그인하고 향 저장하기</Link>}</div>
          <div className="a-secondary-actions"><button type="button" className="a-action-link" onClick={copyRecipe}><UtilityIcon name="copy"/> 레시피 복사</button>{canNativeShare&&<button type="button" className="a-action-link" onClick={shareRecipe}><UtilityIcon name="share"/> 공유하기</button>}<button type="button" className="a-action-link" onClick={()=>{setStep("select");setSaved(false);window.scrollTo({top:0,behavior:"instant"});}}><UtilityIcon name="adjust"/> 조합 수정</button></div>
          {saved&&<Link className="text-link" href="/mypage">저장한 향 보러 가기 →</Link>}
        </div></section>}
    {overlay&&<AtelierModal title={overlay==="blend"?(progress<100?"향이 어우러지는 시간":"당신의 향이 완성되었어요"):overlay==="recipe"?"내가 담은 향":"향 만들기 안내"} onClose={closeOverlay}>
      {overlay==="recipe"?<div className="a-modal-content">{total?recipeList:<p>아직 담은 향료가 없어요.</p>}<button className="button" disabled={!total} onClick={startBlend}>향 섞기 <UtilityIcon name="arrow"/></button></div>
      :overlay==="info"?<div className="a-modal-content"><p>탑은 첫인상, 미들은 향의 중심, 베이스는 잔향을 표현해요.</p><p>마음에 드는 향료를 눌러 최대 20회까지 담아 보세요. 섞기 버튼을 누르면 조합이 완성돼요.</p><p>이 경험은 조합을 시각화한 것으로 실제 조향 처방이나 농도를 뜻하지 않아요.</p></div>
      :<div className={`a-blend-experience a-sheet-blend ${blendComplete?"complete":blendMode==="ready"?"waiting":"blending"}`}>
        <div className="a-blend-stage">
          <span className="eyebrow">{blendComplete?"YOUR SCENT / COMPLETED":"THE ART OF BLENDING"}</span>
          <FloatingComposition notes={ranked} className="a-blend-floating"/>
          <div className={`a-blend-beaker a-interactive-vessel ${gestureActive?"dragging":""}`} role="slider" tabIndex={blendComplete?-1:0} aria-label="비커를 원을 그리듯 세 바퀴 저어 조향하기" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}
            style={{"--stir-progress":`${progress}%`} as CSSProperties}
            onKeyDown={e=>{if(["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"," ","Enter"].includes(e.key)){e.preventDefault();setBlendMode("manual");setProgress(v=>Math.min(100,v+3));}}}
            onPointerDown={startGesture} onPointerMove={moveGesture} onPointerUp={endGesture} onPointerCancel={endGesture}><Beaker count={total} color={color} mixing={(blendMode==="auto"||gestureActive)&&!blendComplete}/></div>
          <div className="a-blend-focal-glow" aria-hidden="true"/>
        </div>
        <div className="a-blend-copy" aria-live="polite"><h3>{blendComplete?"서로 다른 향이 하나로 어우러졌어요.":blendMode==="ready"?"이제 향을 천천히 섞어 볼까요?":"한 방울씩, 당신의 향이 완성되고 있어요."}</h3><p>{blendComplete?"고른 향료의 조화에 이름을 붙여 주세요.":blendMode==="ready"?"마우스나 손가락으로 비커를 원 그리듯 세 바퀴 저어 보세요. 모바일에서도 동일하게 작동해요.":"천천히 저을수록 액체가 어우러져요. 움직임을 멈춰도 지금까지 섞은 상태가 유지돼요."}</p></div>
        {!blendComplete?<>
          <div className="a-stir-layout">
            <div className="a-stir-surface" aria-hidden="true">
              <span className="a-stir-outline" style={{"--stir-progress":`${progress}%`} as CSSProperties}/>
              <span className="a-stir-instruction">BLENDING</span>
              <span className="a-stir-percent">{Math.round(progress)}%</span>
            </div>
            <div className="a-stir-actions"><strong>{blendMode==="ready"?"나만의 조향 방식":"당신의 조합을 만드는 중"}</strong><p>원형으로 천천히 3바퀴 저어 주세요. 움직이기 어렵다면 자동 섞기를 사용할 수 있어요.</p><button className="button a-stir-auto" onClick={()=>setBlendMode("auto")} disabled={blendMode==="auto"}>{blendMode==="auto"?"천천히 섞이는 중…":"자동 섞기 · 약 9초"}<UtilityIcon name="arrow"/></button><small className="a-turns-hint">{blendMode==="auto"?"향료가 부드럽게 어우러지는 중이에요":`약 ${turnsRemaining}바퀴 남았어요 · 방향키로도 조작 가능`}</small></div>
          </div>
          <div className="a-blend-progress"><div role="progressbar" aria-label="블렌딩 진행" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}><span style={{width:`${progress}%`}}/></div><small>BLENDING / {Math.round(progress)}%</small></div>
        </>:<><div className="a-finished-badges">{ranked.slice(0,3).map(n=><span key={n.id}><Asset id={n.id}/>{n.name}</span>)}</div><button className="button a-finish-button" onClick={enterResult}>이 향에 이름 붙이기 <UtilityIcon name="arrow"/></button></>}
      </div>}
    </AtelierModal>}
  </main>;
}
