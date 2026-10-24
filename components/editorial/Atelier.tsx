"use client";
/* eslint-disable react-hooks/set-state-in-effect */
import Link from "next/link";
import Image from "next/image";
import { AuraWordmark } from "./AuraWordmark";
import { useEffect, useMemo, useState, type DragEvent } from "react";
import ingredients from "../../data/ingredients.json";
import { Asset, Beaker } from "./Shared";
import { products } from "@/lib/aura/catalog";
import { money } from "@/lib/aura/format";
import { useCart, useNotify, useRecipes, useSession } from "../providers/AuraContexts";
import { MAX_DROPS, totalCount, mixColor } from "../../lib/aura/recipes";
import { AtelierModal, UtilityIcon } from "../ui/AtelierControls";
import { percentages, stageOrder, stageRatiosForNames, type Stage } from "@/lib/aura/atelier";
import { stageLabels, stageDescriptions, noteDescriptors, noteEnglish, scentFamilies } from "../atelier/content";
import { useComposition } from "../atelier/useComposition";
import { useBlend } from "../atelier/useBlend";
import { BlendExperience } from "../atelier/BlendExperience";
import styles from "../atelier/Atelier.module.css";


export function Atelier(){
  const {recipes,save}=useRecipes();
  const {user}=useSession();
  const {addCustom}=useCart();
  const notify=useNotify();
  const composition = useComposition(recipes);
  const { state, dispatch, pendingDraft } = composition;
  const { step, tab, counts, name, label, parent, saved, cartAdded, recommended, drop } = state;
  const [overlay, setOverlay] = useState<"blend" | "recipe" | "info" | null>(null);
  const [showRatio, setShowRatio] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [canNativeShare, setCanNativeShare] = useState(false);
  const blend = useBlend(overlay === "blend");
  const { progress } = blend;

  useEffect(() => setCanNativeShare(typeof navigator.share === "function"), []);

  useEffect(()=>{
    if(step!=="select")return;
    const frame=requestAnimationFrame(()=>{
      window.scrollTo({top:0,behavior:"instant"});
      document.querySelector(".a-ingredients")?.scrollTo({top:0,behavior:"instant"});
    });
    return ()=>cancelAnimationFrame(frame);
  },[step]);

  const total=totalCount(counts);
  const color=mixColor(counts);
  const selected=useMemo(()=>ingredients.filter(i=>counts[i.id]>0).sort((a,b)=>stageOrder.indexOf(a.stage as Stage)-stageOrder.indexOf(b.stage as Stage)),[counts]);
  const ranked=useMemo(()=>[...selected].sort((a,b)=>(counts[b.id]||0)-(counts[a.id]||0)),[selected,counts]);
  const ratio=useMemo(()=>percentages(counts),[counts]);
  const stages=stageOrder.map(s=>selected.filter(i=>i.stage===s));

  const customPerfumePrice = products.find(product=>product.type==="eau-de-parfum")?.price ?? 98000; // shared catalog source
  const mood = stageRatiosForNames(counts);
  const suggestedNames = useMemo(()=>{
    const theme = mood === "fresh" ? ["투명한 오후","초록의 틈","시트러스 모닝","가벼운 숨","첫 번째 햇살"] : mood === "soft" ? ["느린 오후","포근한 여백","꽃이 머문 자리","고요한 온기","부드러운 잔상"] : ["나무의 시간","따뜻한 그림자","밤의 서가","오래 남는 온도","앰버의 결"];
    const dominant = [...selected].sort((a,b)=>(counts[b.id]||0)-(counts[a.id]||0))[0];
    return [...new Set([...theme,dominant?`${dominant.name}의 순간`:"나의 향"])].slice(0,5);
  },[counts,selected,mood]);
  const atmosphere=stages[1].length>stages[0].length?"풍성한 중심 노트":stages[2].length>stages[0].length?"차분한 잔향 중심":"균형을 찾아가는 중";

  function resumeDraft() {
    composition.resumeDraft();
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  function newComposition() {
    blend.stop();
    setOverlay(null);
    composition.reset();
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  function add(id: string) {
    if (total >= MAX_DROPS) { notify("한 조합에서 최대 20번까지 선택할 수 있어요."); return; }
    dispatch({ type: "add", id });
  }
  function decrease(id: string) { dispatch({ type: "decrease", id }); }
  function remove(id: string) { dispatch({ type: "remove", id }); }
  function openSelection(familyId?: string) {
    const family = scentFamilies.find(item => item.id === familyId);
    dispatch({ type: "select", recommended: family ? [...family.notes] : [] });
  }
  function startBlend() {
    if (!total) return;
    blend.reset();
    setOverlay("blend");
  }
  function closeOverlay() {
    blend.stop();
    setOverlay(null);
  }
  function dropIngredient(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setDragActive(false);
    add(event.dataTransfer.getData("application/x-aura-note") || event.dataTransfer.getData("text/plain"));
  }
  function recipeText(){return `${name||"나의 향"} / AURA ATELIER\n${stageOrder.map(st=>`${stageLabels[st]}: ${selected.filter(n=>n.stage===st).map(n=>`${n.name} ${counts[n.id]}회`).join(" · ")||"없음"}`).join("\n")}\n총 ${total}회 · ${selected.length}종`; }
  async function shareRecipe(){
    if(typeof navigator.share!=="function"){notify("현재 기기에서 공유를 지원하지 않아요.");return;}
    try{await navigator.share({title:`AURA | ${name||"나의 향"}`,text:recipeText()});}catch(e){if((e as Error)?.name!=="AbortError")notify("공유를 완료하지 못했어요.");}
  }
  function enterResult() {
    if (!blend.complete) return;
    closeOverlay();
    dispatch({ type: "finish", complete: blend.complete });
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "instant" }));
  }
  function record(){
    if(!name.trim()){notify("향 이름을 입력해 주세요.");return;}
    if(!user){notify("로그인 후 향을 저장할 수 있어요.");return;}
    const didSave=save({id:crypto.randomUUID(),parent:parent?.id,version:parent?parent.version+1:1,name:name.trim(),label,counts:{...counts},color,created:new Date().toISOString()});
    if(didSave)dispatch({ type: "saved" });
  }

  function putInCart(){
    if(!name.trim()){notify("향 이름을 먼저 정해 주세요.");return;}
    if(!total){notify("향료를 선택해 주세요.");return;}
    const added=addCustom({
      name:name.trim(),label,counts:{...counts},color,
      recipeKey:parent?.id||undefined,productType:"eau-de-parfum",
    });
    if(added)dispatch({ type: "cart-added" });
  }
  const recipeList=<div className="recipe-list a-recipe-list" aria-label="선택한 향료 비중">{selected.map(note=><div className="recipe-row a-recipe-chip" data-note={note.stage} key={note.id}>
    <div className="a-token-portrait"><Asset id={note.id}/></div><div className="a-token-main"><span className="a-token-category">{noteEnglish[note.stage as Stage]}</span><strong>{note.name}</strong><div className="a-token-subrow"><div className="a-token-track" aria-hidden="true"><span style={{width:`${ratio[note.id]}%`,background:note.color}}/></div><small>{counts[note.id]}회 · {ratio[note.id]}%</small></div></div>
    {step!=="result"&&<div className="a-chip-actions"><button aria-label={`${note.name} 1회 줄이기`} title="1회 줄이기" onClick={()=>decrease(note.id)}>−</button><button aria-label={`${note.name} 1회 추가`} title="1회 추가" disabled={total>=MAX_DROPS} onClick={()=>add(note.id)}>+</button><button aria-label={`${note.name} 삭제`} title="향료 제거" onClick={()=>remove(note.id)}>×</button></div>}
  </div>)}</div>;
  const stageRatios=stageOrder.map(stage=>stageOrder.length ? ingredients.filter(i=>i.stage===stage).reduce((v,i)=>v+(counts[i.id]||0),0):0);
  const stagePercentages = percentages(Object.fromEntries(stageOrder.map((key,i)=>[key,stageRatios[i]])));
  const stageBadge=stageRatios[1]>stageRatios[0] && stageRatios[1]>=stageRatios[2] ? "FLORAL FORWARD" : stageRatios[2]>stageRatios[0] ? "WOODY BASE" : "BALANCED BLEND";

  return <main className={`${styles.root} atelier-page a-atelier a-v3 a-v7 ${step==="select"?"a-editing":""}`}>
    <header className="atelier-heading a-heading"><div><span className="eyebrow">PERSONAL ATELIER / AURA</span><h1>{step==="entry"?"취향을 한 방울씩":step==="result"?"나만의 향을 기록하다":"향을 만드는 시간"}</h1></div>
      <div className="a-step-nav" aria-label="진행 단계"><span className={step!=="result"&&overlay!=="blend"?"active":""}>01 고르기</span><span className={overlay==="blend"?"active":""}>02 섞기</span><span className={step==="result"?"active":""}>03 기록하기</span></div>
    </header>
    {step==="entry"?<section className="atelier-entry page-width a-entry"><div className="entry-visual" aria-label="AURA 조향 안내 이미지"><Image className="a-entry-photo" src="/assets/products/warm-eau-de-parfum.webp" alt="AURA의 향수병과 자연 소재" fill sizes="(max-width: 900px) 100vw, 45vw" loading="eager"/><span className="a-entry-caption">A PERSONAL SCENT / AURA ATELIER</span></div><div><span className="eyebrow">A SCENT OF YOUR OWN</span><h2>어떤 향 계열을 좋아하시나요?</h2><p>익숙한 향의 계열에서 출발하거나, 원하는 향료를 자유롭게 골라 보세요.</p>
      {pendingDraft&&<div className="a-resume-card"><div><strong>만들던 향이 있어요</strong><p>{Object.keys(pendingDraft.counts).length}종의 향료를 다시 이어서 선택할 수 있어요.</p></div><button className="button" onClick={resumeDraft}>이어서 만들기 <UtilityIcon name="arrow"/></button></div>}
      <div className="recommend-cards a-families">{scentFamilies.map(f=><button key={f.id} type="button" data-aura-family={f.id} onClick={()=>openSelection(f.id)}><Asset id={f.asset}/><strong>{f.name}</strong><span>{f.english} · {f.description}</span></button>)}</div>
      <button className="button a-direct-start" onClick={()=>openSelection()}>향료 직접 고르기 <UtilityIcon name="arrow"/></button></div></section>
      :step==="select"?<><div className="atelier-workspace a-workspace" inert={overlay!==null}>
        <section className="ingredient-panel a-ingredients"><div className="panel-title"><h2>향료 고르기</h2><span>24 NOTES</span></div>
          {recommended.length>0&&<div className="recommendation"><span className="eyebrow">추천하는 첫 향료</span><div>{recommended.map(id=><button key={id} disabled={total>=MAX_DROPS} onClick={()=>add(id)}><Asset id={id}/>{ingredients.find(i=>i.id===id)?.name}<span>+</span></button>)}</div></div>}
          <div className="tabs note-tabs" role="tablist" aria-label="향 노트">{stageOrder.map(s=><button key={s} role="tab" aria-selected={tab===s} className={tab===s?"selected":""} onClick={()=>dispatch({ type: "tab", tab: s })}>{s==="top"?"탑":s==="middle"?"미들":"베이스"}<small>{s==="middle"?"HEART":s.toUpperCase()}</small></button>)}</div>
          <p className="micro">{stageDescriptions[tab]} · 선택할 때마다 조합 비중이 조정돼요</p>
          <div className="ingredient-grid a-ingredient-grid">{ingredients.filter(i=>i.stage===tab).map(note=><button key={note.id} className={`ingredient a-ingredient a-sheet-card ${counts[note.id]?"selected":""}`} draggable={total<MAX_DROPS} onDragStart={e=>{e.dataTransfer.effectAllowed="copy";e.dataTransfer.setData("application/x-aura-note",note.id);e.dataTransfer.setData("text/plain",note.id);setDragActive(true);}} onDragEnd={()=>setDragActive(false)} aria-pressed={Boolean(counts[note.id])} aria-label={`${note.name} 한 방울 추가`} disabled={total>=MAX_DROPS} onClick={()=>add(note.id)} data-note={tab}>
            <small className="ingredient-note">{noteEnglish[tab]}</small><span className="a-ingredient-art"><Asset id={note.id}/></span><strong>{note.name}</strong><small className="a-note-description">{noteDescriptors[note.id]}</small><span className="a-add-dot" aria-hidden="true">{counts[note.id]?counts[note.id]:"+"}</span>{counts[note.id]>0&&<span className="a-selected-check" aria-hidden="true">✓</span>}
          </button>)}</div>
        </section>
        <section className={`vessel-panel a-vessel ${dragActive?"a-vessel-target-active":""}`} onDragOver={e=>{e.preventDefault();e.dataTransfer.dropEffect="copy";}} onDrop={dropIngredient}><span className="eyebrow">YOUR BLEND</span><span className="a-vessel-drop-hint" aria-live="polite">{dragActive?"이곳에 놓아 향을 담아 주세요":"향료를 선택하거나 이곳에 끌어다 놓으세요"}</span><div className="a-vessel-art"><Beaker count={total} color={color} drop={drop}/>{drop>0&&<span key={drop} className="a-impact" style={{borderColor:color}}/>}</div>
          <div className="a-counters"><div><strong>{selected.length}</strong><small>선택한 향료</small></div><div className="a-dark-counter"><strong>{total}<small>/20</small></strong><small>담은 횟수</small></div></div>
          <div className="a-segment-meter" role="progressbar" aria-label="향료 투입 횟수" aria-valuenow={total} aria-valuemin={0} aria-valuemax={MAX_DROPS}><span style={{width:`${total*5}%`,background:`linear-gradient(90deg,#eddfc1,${color})`}}/>{[1,2,3,4].map(n=><i key={n} style={{left:`${n*20}%`}}/>)}</div>
          <div className="a-meter-labels"><span>0</span><span>5</span><span>10</span><span>15</span><span>20회</span></div><div className="a-scent-badge a-sheet-badge"><span style={{background:color}}/>{atmosphere}<small>{stageBadge}</small></div>
          <button className="a-ratio-toggle" type="button" aria-expanded={showRatio} onClick={()=>setShowRatio(v=>!v)}>{showRatio?"상세 비중 접기 −":"배합 비중 자세히 보기 +"}</button>
          {showRatio&&<div className="a-note-ratio" role="group" aria-label="선택한 향료 노트별 비중">{stageOrder.map(stage=><div className="a-note-ratio-row" key={stage}><small>{noteEnglish[stage]}</small><div className="a-note-ratio-track"><span style={{width:`${stagePercentages[stage]||0}%`}} data-stage={stage}/></div><strong>{stagePercentages[stage]||0}%</strong></div>)}</div>}
          <div className="a-vessel-tools"><button className="a-icon-button" aria-label="전체 비우기" disabled={!total} onClick={()=>{dispatch({ type: "clear" });}}><UtilityIcon name="reset"/></button><button className="a-icon-button" aria-label="조향 도움말" onClick={()=>setOverlay("info")}><UtilityIcon name="info"/></button></div>
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
          <label className="a-name-field">향 이름<input value={name} maxLength={30} onChange={e=>{dispatch({ type: "name", value: e.target.value });}} placeholder="예: 느린 오후"/></label>
          <div className="a-name-suggestions"><div className="a-mini-heading"><strong>향 이름 추천</strong><small>선택한 노트의 분위기를 바탕으로 제안해요</small></div><div className="a-suggestion-list">{suggestedNames.map(n=><button key={n} type="button" className={name===n?"active":""} onClick={()=>{dispatch({ type: "name", value: n });}}>{n}<span aria-hidden="true">↗</span></button>)}</div></div>
          <fieldset className="label-options a-label-styles"><legend>라벨 스타일 <small>선택하면 왼쪽 병에 바로 반영돼요</small></legend>{[["classic","클래식","테두리 · 세리프"],["paper","페이퍼","종이 · 활자"],["minimal","미니멀","여백 · 모던"]].map(([id,text,desc])=><label key={id} className={`a-label-swatch a-label-${id}`}><input type="radio" name="label" checked={label===id} onChange={()=>{dispatch({ type: "label", value: id });}}/><span><strong>{text}</strong><small>{desc}</small></span></label>)}</fieldset>
          <div className="a-note-pyramid">{stageOrder.map((st,index)=><div key={st}><span className="eyebrow">{stageLabels[st]}</span><p>{stages[index].map(n=>n.name).join(" · ")||"—"}</p></div>)}</div>
          <details className="a-recipe-details"><summary>전체 레시피 보기 · {selected.length}종 / {total}회</summary>{recipeList}</details>
          <div className="a-result-product-choose"><span className="eyebrow">THE SCENT YOU MADE</span><div className="a-result-product-row"><strong>커스텀 오 드 퍼퓸 · 50mL</strong><strong>{money(customPerfumePrice)}</strong></div><p>현재 맞춤 조향은 오 드 퍼퓸 50mL로 제공해요. 선택한 향료와 라벨이 주문 정보에 함께 담겨요.</p></div>
          <div className="a-result-actions a-v7-result-actions"><button className="button a-buy-custom" disabled={cartAdded||!name.trim()} onClick={putInCart}><UtilityIcon name="arrow"/>{cartAdded?"장바구니에 추가됨":"이 향을 장바구니에 담기"}</button>{cartAdded&&<Link className="button a-cart-link" href="/cart">장바구니 보기 →</Link>}{user?<button className="button" disabled={saved||!name.trim()} onClick={record}><UtilityIcon name="heart"/>{saved?"저장 완료":"나의 향 저장하기"}</button>:<Link className="button" href="/login?next=%2Fatelier%3Fresume%3D1">로그인하고 향 저장하기</Link>}</div>
          <div className="a-secondary-actions"><button type="button" className="a-action-link" onClick={newComposition}><UtilityIcon name="reset"/> 새 향 만들기</button>{canNativeShare&&<button type="button" className="a-action-link" onClick={shareRecipe}><UtilityIcon name="share"/> 공유하기</button>}<button type="button" className="a-action-link" onClick={()=>{dispatch({ type: "edit" });window.scrollTo({top:0,behavior:"instant"});}}><UtilityIcon name="adjust"/> 조합 수정</button></div>
          {saved&&<Link className="text-link" href="/mypage">저장한 향 보러 가기 →</Link>}
        </div></section>}
    {overlay&&<AtelierModal title={overlay==="blend"?(progress<100?"향이 어우러지는 시간":"당신의 향이 완성되었어요"):overlay==="recipe"?"내가 담은 향":"향 만들기 안내"} onClose={closeOverlay}>
      {overlay==="recipe"?<div className="a-modal-content">{total?recipeList:<p>아직 담은 향료가 없어요.</p>}<button className="button" disabled={!total} onClick={startBlend}>향 섞기 <UtilityIcon name="arrow"/></button></div>
      :overlay==="info"?<div className="a-modal-content"><p>탑은 첫인상, 미들은 향의 중심, 베이스는 잔향을 표현해요.</p><p>마음에 드는 향료를 눌러 최대 20회까지 담아 보세요. 섞기 버튼을 누르면 조합이 완성돼요.</p><p>향료는 취향을 조합하는 인터랙션이며 20회 선택과 비율은 실제 제조 처방·향료 농도를 의미하지 않아요. 전문 배합은 원료별 중량과 안전 기준을 따릅니다.</p></div>
      :<BlendExperience blend={blend} total={total} color={color} ranked={ranked} onFinish={enterResult}/>}
    </AtelierModal>}
  </main>;
}
