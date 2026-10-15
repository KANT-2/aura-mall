"use client";
/* eslint-disable react-hooks/set-state-in-effect */
import Link from "next/link";
import { AuraWordmark } from "./AuraWordmark";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type PointerEvent } from "react";
import ingredients from "./ingredients.json";
import { Asset, Beaker, totalCount, mixColor, money, products } from "./Shared";
import { type Recipe, useAura } from "./Provider";
import { AtelierModal, ProgressRing, UtilityIcon } from "../ui/AtelierControls";

type Note = (typeof ingredients)[number];
type Stage = "top" | "middle" | "base";
type MotionAccess = "idle" | "requesting" | "active" | "denied" | "unavailable";
type MotionWithPermission = typeof DeviceMotionEvent & { requestPermission?: () => Promise<"granted" | "denied"> };
const MOTION_APPROVED = "aura_atelier_motion_granted_v1";

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
// Fragrance preferences are separate from FRESH / SOFT / WARM commerce collections.
const scentFamilies = [
  {id:"citrus",name:"시트러스",english:"CITRUS",asset:"bergamot",description:"상큼하고 투명한 시작",notes:["bergamot","lemon","grapefruit","neroli"]},
  {id:"floral",name:"플로럴",english:"FLORAL",asset:"jasmine",description:"꽃이 남기는 부드러운 여운",notes:["neroli","jasmine","rose","muguet"]},
  {id:"woody",name:"우디",english:"WOODY",asset:"sandalwood",description:"차분한 나무와 깊은 잔향",notes:["rosemary","cedarwood","sandalwood","vetiver"]},
  {id:"musky",name:"머스키",english:"MUSKY",asset:"white-musk",description:"가까이 머무는 포근함",notes:["bergamot","muguet","white-musk","vanilla"]},
  {id:"green",name:"그린",english:"GREEN",asset:"rosemary",description:"풀잎처럼 산뜻하고 깨끗하게",notes:["peppermint","rosemary","lavender","vetiver"]},
  {id:"spicy",name:"스파이시",english:"SPICY",asset:"cardamom",description:"따뜻하고 선명한 개성",notes:["pink-pepper","cardamom","sandalwood","amber"]},
] as const;
type AtelierDraft = {counts:Record<string,number>;name:string;label:string;step:"entry"|"select"|"result"};
const DRAFT_KEY = "aura_atelier_draft_v2";



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
  const chosen = [...notes].slice(0, compact?4:3);
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
  const {recipes,save,user,notify,addCustom}=useAura();
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
  const [pendingDraft,setPendingDraft]=useState<AtelierDraft|null>(null);
  const [cartAdded,setCartAdded]=useState(false);
  const [rod,setRod]=useState({x:50,y:50,energy:0});
  const [showRatio,setShowRatio]=useState(false);
  const [overlay,setOverlay]=useState<"blend"|"recipe"|"info"|null>(null);
  const [blendMode,setBlendMode]=useState<"ready"|"manual"|"shake"|"auto"|"done">("ready");
  const [motionAccess,setMotionAccess]=useState<MotionAccess>("idle");
  const shakeData=useRef({gravity:0, last:0, peaks:0, lastPeak:0, count:0});
  const motionAccessRef=useRef<MotionAccess>("idle");
  const motionSeen=useRef(false);
  const shakeCount=useRef(0);
  const [shakeUiCount,setShakeUiCount]=useState(0);

  const [gestureActive,setGestureActive]=useState(false);
  const [settling,setSettling]=useState(false);
  const [dragActive,setDragActive]=useState(false);
  const gesture=useRef<{x:number;y:number;last:number}|null>(null);
  const rodUpdate=useRef(0);
  const [canNativeShare,setCanNativeShare]=useState(false);


  const total=totalCount(counts);
  const liquidY = 270 - Math.min(20, total) * 6;
  const color=mixColor(counts);
  const selected=useMemo(()=>ingredients.filter(i=>counts[i.id]>0).sort((a,b)=>stageOrder.indexOf(a.stage as Stage)-stageOrder.indexOf(b.stage as Stage)),[counts]);
  const ranked=useMemo(()=>[...selected].sort((a,b)=>(counts[b.id]||0)-(counts[a.id]||0)),[selected,counts]);
  const ratio=useMemo(()=>percentages(counts),[counts]);
  const stages=stageOrder.map(s=>selected.filter(i=>i.stage===s));
  const blendComplete=progress>=100;
  const motionAvailable=typeof window!=="undefined" && typeof window.DeviceMotionEvent!=="undefined" && window.isSecureContext;

  const mixHint = progress<30 ? "톡톡 눌러 보거나 천천히 저어 보세요" : progress<75 ? "막대를 움직이면 액체가 따라와요" : "액체가 차분하게 어우러졌어요";
  const customPerfumePrice = products.find(product=>product.type==="eau-de-parfum")?.price ?? 98000; // shared catalog source
  const mood = stageRatiosForNames(counts);
  const suggestedNames = useMemo(()=>{
    const theme = mood === "fresh" ? ["투명한 오후","초록의 틈","시트러스 모닝","가벼운 숨","첫 번째 햇살"] : mood === "soft" ? ["느린 오후","포근한 여백","꽃이 머문 자리","고요한 온기","부드러운 잔상"] : ["나무의 시간","따뜻한 그림자","밤의 서가","오래 남는 온도","앰버의 결"];
    const dominant = [...selected].sort((a,b)=>(counts[b.id]||0)-(counts[a.id]||0))[0];
    return [...new Set([...theme,dominant?`${dominant.name}의 순간`:"나의 향"])].slice(0,5);
  },[counts,selected,mood]);
  const atmosphere=stages[1].length>stages[0].length?"풍성한 중심 노트":stages[2].length>stages[0].length?"차분한 잔향 중심":"균형을 찾아가는 중";

  useEffect(()=>{
    setCanNativeShare(typeof navigator!=="undefined" && typeof navigator.share==="function");
    let draft:AtelierDraft|null=null;
    try{
      const raw=sessionStorage.getItem(DRAFT_KEY);
      if(raw){
        const parsed=JSON.parse(raw) as AtelierDraft;
        if(parsed && parsed.counts && totalCount(parsed.counts)>0)draft=parsed;
      }
    }catch{}
    setPendingDraft(draft);
    // Deliberate: regular /atelier visits always start at the welcome screen.
    // Only explicit resume after login restores a result; a recipe URL loads for editing.
    const params=new URLSearchParams(window.location.search);
    if(params.has("resume") && draft){
      setCounts(draft.counts);setName(draft.name||"");setLabel(draft.label||"classic");
      setStep(draft.step==="result"?"result":"select");
    }
    setDraftReady(true);
  },[]);
  useEffect(()=>{
    if(!draftReady)return;
    const key=new URLSearchParams(window.location.search).get("recipe");
    const recipe=recipes.find(r=>r.id===key);
    if(recipe && parent?.id!==recipe.id){
      setParent(recipe);setCounts({...recipe.counts});setName(recipe.name);setLabel(recipe.label);
      setStep("select");setCartAdded(false);
    }
  },[recipes,parent?.id,draftReady]);
  useEffect(()=>{
    if(!draftReady)return;
    try{
      if(total) {
        const draft:AtelierDraft={counts,name,label,step};
        sessionStorage.setItem(DRAFT_KEY,JSON.stringify(draft));
      } else if(!pendingDraft) sessionStorage.removeItem(DRAFT_KEY);
    }catch{}
  },[counts,name,label,step,total,draftReady,pendingDraft]);
  function resumeDraft(){
    if(!pendingDraft)return;
    setCounts({...pendingDraft.counts});setName(pendingDraft.name||"");setLabel(pendingDraft.label||"classic");
    setStep("select");setParent(undefined);setCartAdded(false);
    window.scrollTo({top:0,behavior:"instant"});
  }
  function newComposition(){
    setCounts({});setName("");setLabel("classic");setParent(undefined);
    setRecommended([]);setTab("top");setSaved(false);setCartAdded(false);
    setPendingDraft(null);setStep("entry");
    try{sessionStorage.removeItem(DRAFT_KEY);}catch{}
    window.scrollTo({top:0,behavior:"instant"});
  }
  // Auto mode animates the actual rod AND liquid; progress alone must never move.
  // A slow elliptical hand movement replaces the earlier stationary rod and vortex artwork.
  useEffect(()=>{
    if(overlay!=="blend" || blendMode!=="auto" || blendComplete)return;
    let raf=0; let last=0; const start=performance.now();
    const tick=(now:number)=>{
      if(now-last>=48){
        const seconds=(now-start)/1000;
        const phase=seconds*Math.PI*.70;
        setRod({x:50+24*Math.cos(phase),y:50+19*Math.sin(phase),energy:.48+.08*Math.sin(phase*.5)});
        last=now;
      }
      raf=requestAnimationFrame(tick);
    };
    raf=requestAnimationFrame(tick);
    const timer=window.setInterval(()=>setProgress(value=>Math.min(100,value+1)),85);
    return ()=>{window.clearInterval(timer);cancelAnimationFrame(raf);};
  },[overlay,blendMode,blendComplete]);
  useEffect(()=>{
    if(overlay==="blend" && blendComplete){setBlendMode("done");setRod(r=>({...r,energy:0}));}
  },[overlay,blendComplete]);
  // A small damped ripple settles after manual or sensor stirring stops.
  useEffect(()=>{if(!(["manual","shake"] as const).includes(blendMode as "manual"|"shake") || rod.energy<.03)return;const timer=window.setTimeout(()=>{setRod(current=>({...current,energy:0}));setGestureActive(false);},620);return ()=>window.clearTimeout(timer);},[blendMode,rod]);
  useEffect(()=>{motionAccessRef.current=motionAccess;},[motionAccess]);
  // An accepted permission is remembered; the browser owns the real permission.
  // On iOS Safari, requestPermission MUST be invoked by a direct user click.
  async function enableShake(){
    if(!window.isSecureContext || !("DeviceMotionEvent" in window)){
      setMotionAccess("unavailable");return;
    }
    setMotionAccess("requesting");
    try{
      const constructor=window.DeviceMotionEvent as MotionWithPermission;
      if(typeof constructor.requestPermission==="function"){
        const result=await constructor.requestPermission();
        if(result!=="granted"){setMotionAccess("denied");return;}
      }
      localStorage.setItem(MOTION_APPROVED,"1");
      motionSeen.current=false;
      shakeData.current={gravity:0,last:0,peaks:0,lastPeak:0,count:0};
      setMotionAccess("active");setBlendMode("shake");
      setGestureActive(false);
    }catch{
      setMotionAccess("denied");
    }
  }
  useEffect(()=>{
    if(overlay!=="blend" || !motionAvailable || blendComplete || blendMode==="auto" || motionAccess!=="active")return;
    const onMotion=(event:DeviceMotionEvent)=>{
      motionSeen.current=true;
      if(motionAccessRef.current!=="active" || event.timeStamp===0 && !event.accelerationIncludingGravity)return;
      const a=event.acceleration;
      const g=event.accelerationIncludingGravity;
      const magnitude=a && a.x!==null && a.y!==null && a.z!==null
        ? Math.hypot(a.x,a.y,a.z)
        : g && g.x!==null && g.y!==null && g.z!==null ? Math.hypot(g.x,g.y,g.z):0;
      const now=performance.now();const tracker=shakeData.current;
      const jerk=Math.abs(magnitude-tracker.gravity);
      tracker.gravity=tracker.gravity ? tracker.gravity*.72+magnitude*.28 : magnitude;
      if(now-tracker.last<420)return;
      if(jerk<8.5 && magnitude<15)return;
      // Debounced meaningful shakes, not every tiny sensor fluctuation.
      if(now-tracker.lastPeak<850)tracker.peaks++;else tracker.peaks=1;
      tracker.lastPeak=now;
      if(tracker.peaks<2)return;
      tracker.peaks=0;tracker.last=now;
      shakeCount.current++;
      setShakeUiCount(shakeCount.current);
      setBlendMode(current=>current==="auto"?current:"shake");
      const direction=shakeCount.current%4;
      setRod({x:[31,70,44,63][direction],y:[42,60,64,36][direction],energy:.64});
      setProgress(p=>Math.min(100,p+9));
    };
    window.addEventListener("devicemotion",onMotion,{passive:true});
    const timeout=window.setTimeout(()=>{if(!motionSeen.current)setMotionAccess("unavailable");},4200);
    return ()=>{window.removeEventListener("devicemotion",onMotion);window.clearTimeout(timeout);};
  },[overlay,motionAccess,blendComplete,motionAvailable,blendMode]);
  // Resume listening after an already approved permission on later modal visits.
  useEffect(()=>{
    if(overlay!=="blend" || !motionAvailable || blendMode==="auto" || motionAccess!=="idle")return;
    try{if(localStorage.getItem(MOTION_APPROVED)==="1")setMotionAccess("active");}catch{}
  },[overlay,motionAvailable,motionAccess,blendMode]);
  useEffect(()=>{
    if(!settling)return;
    const timer=window.setTimeout(()=>{setSettling(false);setRod(r=>({...r,energy:0}));},950);
    return ()=>window.clearTimeout(timer);
  },[settling]);

  function add(id:string){
    if(total>=20){notify("한 조합에서 최대 20번까지 선택할 수 있어요.");return;}
    setCounts(previous=>({...previous,[id]:(previous[id]||0)+1}));setDrop(x=>x+1);setSaved(false);setCartAdded(false);
  }
  function decrease(id:string){setCounts(prev=>{const updated={...prev};if((updated[id]||0)<=1)delete updated[id];else updated[id]--;return updated;});setSaved(false);setCartAdded(false);}
  function remove(id:string){setCounts(prev=>{const updated={...prev};delete updated[id];return updated;});setSaved(false);setCartAdded(false);}
  function recommend(id:string){
    const family=scentFamilies.find(f=>f.id===id);
    setRecommended(family?[...family.notes]:[]);
    setTab("top");setStep("select");
  }
  function startBlend(){if(total===0)return;setProgress(0);setBlendMode("ready");setGestureActive(false);setSettling(false);setRod({x:50,y:50,energy:0});setShakeUiCount(0);shakeCount.current=0;setMotionAccess("idle");setOverlay("blend");}
  function closeOverlay(){setOverlay(null);gesture.current=null;setGestureActive(false);}
  function dropIngredient(event:DragEvent<HTMLElement>){
    event.preventDefault(); setDragActive(false);
    const id=event.dataTransfer.getData("application/x-aura-note") || event.dataTransfer.getData("text/plain");
    if(ingredients.some(n=>n.id===id))add(id);
  }
  // The glass rod follows deliberate clicks or free pointer motion *after* activation.
  // No compulsory mouse hold, exact circles, turns, vortex, or 'shake' gesture.
  function startGesture(event:PointerEvent<HTMLDivElement>){
    if(blendComplete || blendMode==="auto") return;
    const rect=event.currentTarget.getBoundingClientRect();
    gesture.current={x:event.clientX,y:event.clientY,last:performance.now()};
    setBlendMode("manual");setSettling(false);setGestureActive(true);
    setProgress(v=>Math.min(100,v+9));
    setRod({x:Math.max(12,Math.min(88,(event.clientX-rect.left)/rect.width*100)),y:Math.max(12,Math.min(88,(event.clientY-rect.top)/rect.height*100)),energy:.5});
    if(event.pointerType!=="mouse")event.currentTarget.setPointerCapture(event.pointerId);
  }
  function moveGesture(event:PointerEvent<HTMLDivElement>){
    if(blendComplete || blendMode!=="manual" || !gesture.current) return;
    const now=performance.now();
    const g=gesture.current;
    if(now-rodUpdate.current<35)return;
    rodUpdate.current=now;
    const distance=Math.hypot(event.clientX-g.x,event.clientY-g.y);
    const dt=Math.max(18,now-g.last);
    const rect=event.currentTarget.getBoundingClientRect();
    const x=(event.clientX-rect.left)/rect.width*100;
    const y=(event.clientY-rect.top)/rect.height*100;
    // Clamp close-to-edge pointer motion without cancelling the active gesture.
    g.x=event.clientX;g.y=event.clientY;g.last=now;
    if(distance<3)return;
    const energy=Math.min(.85,Math.max(.1,distance/dt*1.3));
    // Small, bounded progress; fast cursor jumps cannot immediately finish blending.
    setProgress(v=>Math.min(100,v+Math.min(1.8,distance*.028)));
    setRod({x:Math.max(12,Math.min(88,x)),y:Math.max(12,Math.min(88,y)),energy});
    setGestureActive(true);
    setSettling(false);
  }
  function endGesture(event:PointerEvent<HTMLDivElement>){
    if(event.pointerType==="mouse")return; // Mouse works after a single click, no hold.
    gesture.current=null;setGestureActive(false);setSettling(true);
    if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function recipeText(){return `${name||"나의 향"} / AURA ATELIER\n${stageOrder.map(st=>`${stageLabels[st]}: ${selected.filter(n=>n.stage===st).map(n=>`${n.name} ${counts[n.id]}회`).join(" · ")||"없음"}`).join("\n")}\n총 ${total}회 · ${selected.length}종`; }
  async function shareRecipe(){
    if(typeof navigator.share!=="function"){notify("현재 기기에서 공유를 지원하지 않아요.");return;}
    try{await navigator.share({title:`AURA | ${name||"나의 향"}`,text:recipeText()});}catch(e){if((e as Error)?.name!=="AbortError")notify("공유를 완료하지 못했어요.");}
  }
  function enterResult(){setOverlay(null);setStep("result");window.requestAnimationFrame(()=>window.scrollTo({top:0,behavior:"instant"}));}
  function record(){
    if(!name.trim()){notify("향 이름을 입력해 주세요.");return;}
    if(!user){notify("로그인 후 향을 저장할 수 있어요.");return;}
    const didSave=save({id:crypto.randomUUID(),parent:parent?.id,version:parent?parent.version+1:1,name:name.trim(),label,counts:{...counts},color,created:new Date().toISOString()});
    if(didSave)setSaved(true);
  }

  function putInCart(){
    if(!name.trim()){notify("향 이름을 먼저 정해 주세요.");return;}
    if(!total){notify("향료를 선택해 주세요.");return;}
    const added=addCustom({
      name:name.trim(),label,counts:{...counts},color,
      recipeKey:parent?.id||undefined,productType:"eau-de-parfum",
    });
    if(added)setCartAdded(true);
  }
  const recipeList=<div className="recipe-list a-recipe-list" aria-label="선택한 향료 비중">{selected.map(note=><div className="recipe-row a-recipe-chip" data-note={note.stage} key={note.id}>
    <div className="a-token-portrait"><Asset id={note.id}/></div><div className="a-token-main"><span className="a-token-category">{noteEnglish[note.stage as Stage]}</span><strong>{note.name}</strong><div className="a-token-subrow"><div className="a-token-track" aria-hidden="true"><span style={{width:`${ratio[note.id]}%`,background:note.color}}/></div><small>{counts[note.id]}회 · {ratio[note.id]}%</small></div></div>
    {step!=="result"&&<div className="a-chip-actions"><button aria-label={`${note.name} 1회 줄이기`} title="1회 줄이기" onClick={()=>decrease(note.id)}>−</button><button aria-label={`${note.name} 1회 추가`} title="1회 추가" disabled={total>=20} onClick={()=>add(note.id)}>+</button><button aria-label={`${note.name} 삭제`} title="향료 제거" onClick={()=>remove(note.id)}>×</button></div>}
  </div>)}</div>;
  const stageRatios=stageOrder.map(stage=>stageOrder.length ? ingredients.filter(i=>i.stage===stage).reduce((v,i)=>v+(counts[i.id]||0),0):0);
  const stagePercentages = percentages(Object.fromEntries(stageOrder.map((key,i)=>[key,stageRatios[i]])));
  const stageBadge=stageRatios[1]>stageRatios[0] && stageRatios[1]>=stageRatios[2] ? "FLORAL FORWARD" : stageRatios[2]>stageRatios[0] ? "WOODY BASE" : "BALANCED BLEND";

  return <main className={`atelier-page a-atelier a-v3 a-v7 ${step==="select"?"a-editing":""}`}>
    <header className="atelier-heading a-heading"><div><span className="eyebrow">PERSONAL ATELIER / AURA</span><h1>{step==="entry"?"취향을 한 방울씩":step==="result"?"나만의 향을 기록하다":"향을 만드는 시간"}</h1></div>
      <div className="a-step-nav" aria-label="진행 단계"><span className={step!=="result"&&overlay!=="blend"?"active":""}>01 고르기</span><span className={overlay==="blend"?"active":""}>02 섞기</span><span className={step==="result"?"active":""}>03 기록하기</span></div>
    </header>
    {step==="entry"?<section className="atelier-entry page-width a-entry"><div className="entry-visual" aria-label="AURA 조향 안내 이미지"><img className="a-entry-photo" src="/assets/products/warm-eau-de-parfum.webp" alt="AURA의 향수병과 자연 소재" loading="eager"/><span className="a-entry-caption">A PERSONAL SCENT / AURA ATELIER</span></div><div><span className="eyebrow">A SCENT OF YOUR OWN</span><h2>어떤 향 계열을 좋아하시나요?</h2><p>익숙한 향의 계열에서 출발하거나, 원하는 향료를 자유롭게 골라 보세요.</p>
      {pendingDraft&&<div className="a-resume-card"><div><strong>만들던 향이 있어요</strong><p>{Object.keys(pendingDraft.counts).length}종의 향료를 다시 이어서 선택할 수 있어요.</p></div><button className="button" onClick={resumeDraft}>이어서 만들기 <UtilityIcon name="arrow"/></button></div>}
      <div className="recommend-cards a-families">{scentFamilies.map(f=><button key={f.id} onClick={()=>recommend(f.id)}><Asset id={f.asset}/><strong>{f.name}</strong><span>{f.english} · {f.description}</span></button>)}</div>
      <button className="button a-direct-start" onClick={()=>{setRecommended([]);setStep("select");}}>향료 직접 고르기 <UtilityIcon name="arrow"/></button></div></section>
      :step==="select"?<><div className="atelier-workspace a-workspace" inert={overlay!==null}>
        <section className="ingredient-panel a-ingredients"><div className="panel-title"><h2>향료 고르기</h2><span>24 NOTES</span></div>
          {recommended.length>0&&<div className="recommendation"><span className="eyebrow">추천하는 첫 향료</span><div>{recommended.map(id=><button key={id} disabled={total>=20} onClick={()=>add(id)}><Asset id={id}/>{ingredients.find(i=>i.id===id)?.name}<span>+</span></button>)}</div></div>}
          <div className="tabs note-tabs" role="tablist" aria-label="향 노트">{stageOrder.map(s=><button key={s} role="tab" aria-selected={tab===s} className={tab===s?"selected":""} onClick={()=>setTab(s)}>{s==="top"?"탑":s==="middle"?"미들":"베이스"}<small>{s==="middle"?"HEART":s.toUpperCase()}</small></button>)}</div>
          <p className="micro">{stageDescriptions[tab]} · 선택할 때마다 조합 비중이 조정돼요</p>
          <div className="ingredient-grid a-ingredient-grid">{ingredients.filter(i=>i.stage===tab).map(note=><button key={note.id} className={`ingredient a-ingredient a-sheet-card ${counts[note.id]?"selected":""}`} draggable={total<20} onDragStart={e=>{e.dataTransfer.effectAllowed="copy";e.dataTransfer.setData("application/x-aura-note",note.id);e.dataTransfer.setData("text/plain",note.id);setDragActive(true);}} onDragEnd={()=>setDragActive(false)} aria-pressed={Boolean(counts[note.id])} aria-label={`${note.name} 한 방울 추가`} disabled={total>=20} onClick={()=>add(note.id)} data-note={tab}>
            <small className="ingredient-note">{noteEnglish[tab]}</small><span className="a-ingredient-art"><Asset id={note.id}/></span><strong>{note.name}</strong><small className="a-note-description">{noteDescriptors[note.id]}</small><span className="a-add-dot" aria-hidden="true">{counts[note.id]?counts[note.id]:"+"}</span>{counts[note.id]>0&&<span className="a-selected-check" aria-hidden="true">✓</span>}
          </button>)}</div>
        </section>
        <section className={`vessel-panel a-vessel ${dragActive?"a-vessel-target-active":""}`} onDragOver={e=>{e.preventDefault();e.dataTransfer.dropEffect="copy";}} onDrop={dropIngredient}><span className="eyebrow">YOUR BLEND</span><span className="a-vessel-drop-hint" aria-live="polite">{dragActive?"이곳에 놓아 향을 담아 주세요":"향료를 선택하거나 이곳에 끌어다 놓으세요"}</span><div className="a-vessel-art"><Beaker count={total} color={color} drop={drop}/>{drop>0&&<span key={drop} className="a-impact" style={{borderColor:color}}/>}</div>
          <div className="a-counters"><div><strong>{selected.length}</strong><small>선택한 향료</small></div><div className="a-dark-counter"><strong>{total}<small>/20</small></strong><small>담은 횟수</small></div></div>
          <div className="a-segment-meter" role="progressbar" aria-label="향료 투입 횟수" aria-valuenow={total} aria-valuemin={0} aria-valuemax={20}><span style={{width:`${total*5}%`,background:`linear-gradient(90deg,#eddfc1,${color})`}}/>{[1,2,3,4].map(n=><i key={n} style={{left:`${n*20}%`}}/>)}</div>
          <div className="a-meter-labels"><span>0</span><span>5</span><span>10</span><span>15</span><span>20회</span></div><div className="a-scent-badge a-sheet-badge"><span style={{background:color}}/>{atmosphere}<small>{stageBadge}</small></div>
          <button className="a-ratio-toggle" type="button" aria-expanded={showRatio} onClick={()=>setShowRatio(v=>!v)}>{showRatio?"상세 비중 접기 −":"배합 비중 자세히 보기 +"}</button>
          {showRatio&&<div className="a-note-ratio" role="group" aria-label="선택한 향료 노트별 비중">{stageOrder.map(stage=><div className="a-note-ratio-row" key={stage}><small>{noteEnglish[stage]}</small><div className="a-note-ratio-track"><span style={{width:`${stagePercentages[stage]||0}%`}} data-stage={stage}/></div><strong>{stagePercentages[stage]||0}%</strong></div>)}</div>}
          <div className="a-vessel-tools"><button className="a-icon-button" aria-label="전체 비우기" disabled={!total} onClick={()=>{setCounts({});setDrop(0);setSaved(false);setCartAdded(false);}}><UtilityIcon name="reset"/></button><button className="a-icon-button" aria-label="조향 도움말" onClick={()=>setOverlay("info")}><UtilityIcon name="info"/></button></div>
        </section>
        <aside className="blend-summary a-summary"><div className="panel-title"><h2>내가 담은 향</h2><span>{selected.length}종</span></div><div className="a-summary-scroll">{total?recipeList:<div className="a-empty"><Asset id="droplet"/><p>좋아하는 향료부터 담아 보세요.<br/>한 방울씩 나만의 향이 쌓여요.</p></div>}</div>
          <p className="micro">선택 횟수는 취향을 시각화한 값이에요. 실제 제조 배합은 중량·원료 특성·안전 기준에 따라 별도 검토해요.</p><button className="button a-blend-button" disabled={!total} onClick={startBlend}>이 조합으로 향 섞기 <UtilityIcon name="arrow"/></button>
        </aside>
      </div><div className="a-mobile-dock" inert={overlay!==null}><button className="a-dock-summary" onClick={()=>setOverlay("recipe")}><span className="a-mini-dot" style={{background:color}}/><span>{selected.length}종 · {total}/20회<small>내가 담은 향 보기</small></span><UtilityIcon name="adjust"/></button><button className="button" disabled={!total} onClick={startBlend}>향 섞기 <UtilityIcon name="arrow"/></button></div></>
      :<section className="result-screen page-width a-result a-result-v3 a-result-v5">
        <div className={`a-result-bottle label-${label}`}>
          <span className="a-result-caption eyebrow">THE SCENT YOU MADE / AURA</span>
          <div className="a-result-note-gallery" aria-label={`선택한 향료 ${selected.length}종`}>
            {selected.map(n=><div className="a-result-note" key={n.id}><Asset id={n.id}/><span>{n.name}</span></div>)}
          </div>
          <div className="a-product-vessel">
            <Asset id="custom-bottle"/>
            <div className="a-bottle-label" aria-label={`선택한 ${label} 라벨 미리보기`}>
            {label==="classic"?<><AuraWordmark className="a-bottle-brand-mark"/><strong>{name||"나의 향"}</strong><small>PERSONAL SCENT</small></>:
              label==="paper"?<><small>NO. {String(total).padStart(2,"0")}</small><AuraWordmark className="a-bottle-brand-mark"/><strong>{name||"나의 향"}</strong><small>HANDCRAFTED BLEND</small></>:
              <><AuraWordmark className="a-bottle-brand-mark"/><strong>{name||"나의 향"}</strong><span className="a-label-rule"/></>}
          </div></div>
          <p className="micro">선택한 모든 향료가 담긴 나만의 조합입니다.</p>
        </div>
        <div className="a-result-form"><span className="eyebrow">VERSION {parent?parent.version+1:1} · PRIVATE COMPOSITION</span><h2>이 향에 이름을 붙여 주세요.</h2><p className="a-result-lede">고른 향료가 하나의 조합으로 완성되었어요. 오래 간직하고 싶은 순간의 이름을 남겨 주세요.</p>
          <label className="a-name-field">향 이름<input value={name} maxLength={30} onChange={e=>{setName(e.target.value);setSaved(false);setCartAdded(false);}} placeholder="예: 느린 오후"/></label>
          <div className="a-name-suggestions"><div className="a-mini-heading"><strong>향 이름 추천</strong><small>선택한 노트의 분위기를 바탕으로 제안해요</small></div><div className="a-suggestion-list">{suggestedNames.map(n=><button key={n} type="button" className={name===n?"active":""} onClick={()=>{setName(n);setSaved(false);setCartAdded(false);}}>{n}<span aria-hidden="true">↗</span></button>)}</div></div>
          <fieldset className="label-options a-label-styles"><legend>라벨 스타일 <small>선택하면 왼쪽 병에 바로 반영돼요</small></legend>{[["classic","클래식","테두리 · 세리프"],["paper","페이퍼","종이 · 활자"],["minimal","미니멀","여백 · 모던"]].map(([id,text,desc])=><label key={id} className={`a-label-swatch a-label-${id}`}><input type="radio" name="label" checked={label===id} onChange={()=>{setLabel(id);setSaved(false);setCartAdded(false);}}/><span><strong>{text}</strong><small>{desc}</small></span></label>)}</fieldset>
          <div className="a-note-pyramid">{stageOrder.map((st,index)=><div key={st}><span className="eyebrow">{stageLabels[st]}</span><p>{stages[index].map(n=>n.name).join(" · ")||"—"}</p></div>)}</div>
          <details className="a-recipe-details"><summary>전체 레시피 보기 · {selected.length}종 / {total}회</summary>{recipeList}</details>
          <div className="a-result-product-choose"><span className="eyebrow">THE SCENT YOU MADE</span><div className="a-result-product-row"><strong>커스텀 오 드 퍼퓸 · 50mL</strong><strong>{money(customPerfumePrice)}</strong></div><p>현재 맞춤 조향은 오 드 퍼퓸 50mL로 제공해요. 선택한 향료와 라벨이 주문 정보에 함께 담겨요.</p></div>
          <div className="a-result-actions a-v7-result-actions"><button className="button a-buy-custom" disabled={cartAdded||!name.trim()} onClick={putInCart}><UtilityIcon name="arrow"/>{cartAdded?"장바구니에 추가됨":"이 향을 장바구니에 담기"}</button>{cartAdded&&<Link className="button a-cart-link" href="/cart">장바구니 보기 →</Link>}{user?<button className="button" disabled={saved||!name.trim()} onClick={record}><UtilityIcon name="heart"/>{saved?"저장 완료":"나의 향 저장하기"}</button>:<Link className="button" href="/login?next=%2Fatelier%3Fresume%3D1">로그인하고 향 저장하기</Link>}</div>
          <div className="a-secondary-actions"><button type="button" className="a-action-link" onClick={newComposition}><UtilityIcon name="reset"/> 새 향 만들기</button>{canNativeShare&&<button type="button" className="a-action-link" onClick={shareRecipe}><UtilityIcon name="share"/> 공유하기</button>}<button type="button" className="a-action-link" onClick={()=>{setStep("select");setSaved(false);setCartAdded(false);window.scrollTo({top:0,behavior:"instant"});}}><UtilityIcon name="adjust"/> 조합 수정</button></div>
          {saved&&<Link className="text-link" href="/mypage">저장한 향 보러 가기 →</Link>}
        </div></section>}
    {overlay&&<AtelierModal title={overlay==="blend"?(progress<100?"향이 어우러지는 시간":"당신의 향이 완성되었어요"):overlay==="recipe"?"내가 담은 향":"향 만들기 안내"} onClose={closeOverlay}>
      {overlay==="recipe"?<div className="a-modal-content">{total?recipeList:<p>아직 담은 향료가 없어요.</p>}<button className="button" disabled={!total} onClick={startBlend}>향 섞기 <UtilityIcon name="arrow"/></button></div>
      :overlay==="info"?<div className="a-modal-content"><p>탑은 첫인상, 미들은 향의 중심, 베이스는 잔향을 표현해요.</p><p>마음에 드는 향료를 눌러 최대 20회까지 담아 보세요. 섞기 버튼을 누르면 조합이 완성돼요.</p><p>향료는 취향을 조합하는 인터랙션이며 20회 선택과 비율은 실제 제조 처방·향료 농도를 의미하지 않아요. 전문 배합은 원료별 중량과 안전 기준을 따릅니다.</p></div>
      :<div className={`a-blend-experience a-sheet-blend ${blendComplete?"complete":blendMode==="ready"?"waiting":"blending"}`}>
        <div className="a-blend-stage">
          <span className="eyebrow">{blendComplete?"YOUR SCENT / COMPLETED":"THE ART OF BLENDING"}</span>
          
          <div className={`a-blend-beaker a-interactive-vessel a-real-stir-target ${blendMode==="auto"?"automix":""} ${gestureActive?"dragging":settling?"settling":""}`} role="slider" tabIndex={blendComplete?-1:0} aria-label="비커를 클릭하거나 막대를 부드럽게 움직여 향 섞기" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}
            style={{"--stir-progress":`${progress}%`,"--rod-x":`${rod.x}%`,"--rod-y":`${rod.y}%`,"--stir-energy":rod.energy} as CSSProperties}
            onKeyDown={e=>{if(blendComplete || blendMode==="auto") return; if(["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"," ","Enter"].includes(e.key)){e.preventDefault();setBlendMode("manual");setProgress(v=>Math.min(100,v+8));setRod(r=>({...r,energy:.45,x:Math.max(35,Math.min(65,r.x+(e.key==="ArrowLeft"?-3:3)))}));}}}
            onPointerDown={startGesture} onPointerMove={moveGesture} onPointerUp={endGesture} onPointerCancel={endGesture} onPointerLeave={()=>{gesture.current=null;setGestureActive(false);setSettling(true);}}>
            <Beaker count={total} color={color} mixing={false} stir={rod}/>
            <svg className="a86-stir-layer" viewBox="0 0 360 360" aria-hidden="true" focusable="false"><defs><linearGradient id="a86-rod-glass" x1="0" x2="1"><stop offset="0" stopColor="#b2b8ac" stopOpacity=".3"/><stop offset=".28" stopColor="#fffdf6" stopOpacity=".94"/><stop offset=".64" stopColor="#d1ded8" stopOpacity=".55"/><stop offset="1" stopColor="#fffdfa" stopOpacity=".83"/></linearGradient></defs><g className="a86-stir-rod-group" style={{transform:`translate(${(rod.x-50)*.8}px,${(rod.y-50)*.28}px) rotate(${(rod.x-50)*.05}deg)`,transformOrigin:"180px 205px"}}><path d={`M180 25 L177 ${liquidY + 10} Q176 ${liquidY + 17} 181 ${liquidY + 17} Q186 ${liquidY + 17} 185 ${liquidY + 10} L183 25 Z`} fill="url(#a86-rod-glass)" stroke="#c4c0b4" strokeWidth="1.4"/><path d={`M180 33 L179 ${liquidY + 8}`} stroke="#fff" strokeOpacity=".72" strokeWidth="1.4"/></g><ellipse className="a86-rod-ripple" cx={180+(rod.x-50)*.8} cy={liquidY+(rod.y-50)*.28} rx={21+rod.energy*8} ry={3+rod.energy*2} fill="none" stroke="#fff5db" strokeWidth="1.6" style={{opacity:rod.energy*.52}}/></svg>
          </div>
          <div className="a-stir-soft-light" aria-hidden="true"/>
        </div>
        <div className="a-blend-copy" aria-live="polite"><h3>{blendComplete?"서로 다른 향이 하나로 어우러졌어요.":blendMode==="ready"?"이제 향을 천천히 섞어 볼까요?":"한 방울씩, 당신의 향이 완성되고 있어요."}</h3><p>{blendComplete?"고른 향료의 조화에 이름을 붙여 주세요.":blendMode==="ready"?"비커를 클릭한 뒤 마우스를 천천히 움직여 보세요. 누르고 있을 필요는 없어요.":"유리 막대의 움직임을 따라 작은 잔물결이 생겨요. 서두르지 않아도 괜찮아요."}</p></div>
        {!blendComplete?<>
          <div className="a-stir-layout">
            <div className="a-stir-surface" aria-hidden="true">
              <span className="a-stir-outline" style={{"--stir-progress":`${progress}%`} as CSSProperties}/>
              <span className="a-stir-instruction">GENTLE STIR</span>
              <span className="a-stir-percent">{Math.round(progress)}%</span>
            </div>
            <div className="a-stir-actions"><strong>{blendMode==="ready"?"나만의 조향 방식":"당신의 조합을 만드는 중"}</strong><p>휴대폰을 가볍게 흔들거나 비커를 터치해 천천히 저어 보세요. PC에서는 클릭 후 마우스를 움직이면 돼요.</p><div className="a87-blend-controls">
              {motionAvailable && <button type="button" className="a87-sensor-button" onClick={enableShake} disabled={motionAccess==="requesting" || (motionAccess==="active" && blendMode!=="auto")} aria-pressed={motionAccess==="active"}>
                {motionAccess==="active"?`휴대폰 흔들기 인식 중${shakeUiCount?` · ${shakeUiCount}회`:""}`:motionAccess==="requesting"?"센서 권한 확인 중…":motionAccess==="denied"?"흔들기 권한 다시 요청":motionAccess==="unavailable"?"센서 확인 후 다시 시도":"휴대폰 흔들기 켜기"}
              </button>}
              <button type="button" className="button a-stir-auto" onClick={()=>{setSettling(false);setMotionAccess("idle");setBlendMode("auto");}} disabled={blendMode==="auto"}>{blendMode==="auto"?"천천히 섞이는 중…":"자동으로 섞기 · 약 9초"}<UtilityIcon name="arrow"/></button>
            </div>
            <small className="a87-sensor-status" role="status">{!motionAvailable?"센서가 없는 환경에서도 터치·자동 섞기를 사용할 수 있어요.":motionAccess==="active"?"흔들기 활성화됨 · 가볍게 좌우로 흔들어 주세요.":motionAccess==="denied"?"권한이 없어도 터치나 자동 섞기로 계속할 수 있어요.":motionAccess==="unavailable"?"센서 신호를 받지 못했어요. 터치나 자동 섞기를 이용해 주세요.":"첫 이용 시 센서 사용을 허용하면 이후 허용 상태를 기억해요."}</small><small className="a-turns-hint">{blendMode==="auto"?"향료가 부드럽게 어우러지는 중이에요":`${mixHint} · 방향키로도 조작 가능`}</small></div>
          </div>
          <div className="a-blend-progress"><div role="progressbar" aria-label="블렌딩 진행" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}><span style={{width:`${progress}%`}}/></div><small>BLENDING / {Math.round(progress)}%</small></div>
        </>:<><div className="a-finished-badges">{ranked.slice(0,3).map(n=><span key={n.id}><Asset id={n.id}/>{n.name}</span>)}</div><button className="button a-finish-button" onClick={enterResult}>이 향에 이름 붙이기 <UtilityIcon name="arrow"/></button></>}
      </div>}
    </AtelierModal>}
  </main>;
}
