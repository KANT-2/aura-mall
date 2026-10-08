"use client"

import { useCallback, useEffect, useRef, useState } from "react"

const icons: Record<string,string> = {
  Bergamot:"bergamot", Mandarin:"mandarin", Grapefruit:"grapefruit", Fig:"fig", Peony:"peony", Neroli:"neroli", Cedarwood:"cedarwood", "White Musk":"white-musk", Sandalwood:"sandalwood"
}

/** Gesture-controlled 2D blending. No motion permission is requested until a tap. */
export function BlendVessel({ ingredients, onComplete }: { ingredients:string[]; onComplete:()=>void }) {
  const [progress,setProgress] = useState(0)
  const [rotation,setRotation] = useState(0)
  const [motionState,setMotionState] = useState<"idle"|"enabled"|"unavailable">("idle")
  const last = useRef<{x:number,y:number}|null>(null)
  const finished = useRef(false)
  const onCompleteRef = useRef(onComplete)
  useEffect(()=> { onCompleteRef.current = onComplete },[onComplete])
  const advance = useCallback((amount:number)=>{
    setProgress(current => Math.min(100,current+amount))
    setRotation(current=>current + amount * 2.8)
  },[])
  useEffect(()=>{
    if(progress>=100 && !finished.current){ finished.current=true; const t=window.setTimeout(()=>onCompleteRef.current(),550); return ()=>window.clearTimeout(t) }
  },[progress])
  useEffect(()=>{
    if(motionState!=="enabled") return
    let lastShake=0
    const onMotion=(event:DeviceMotionEvent)=>{
      const a=event.accelerationIncludingGravity
      if(!a) return
      const magnitude=Math.sqrt((a.x||0)**2+(a.y||0)**2+(a.z||0)**2)
      const now=Date.now()
      if(magnitude>18 && now-lastShake>170){lastShake=now;advance(9)}
    }
    window.addEventListener("devicemotion",onMotion)
    return ()=>window.removeEventListener("devicemotion",onMotion)
  },[motionState,advance])
  const activateMotion=async()=>{
    if(typeof window==="undefined" || !("DeviceMotionEvent" in window)){ setMotionState("unavailable");return }
    try{
      const Motion = DeviceMotionEvent as typeof DeviceMotionEvent & {requestPermission?:()=>Promise<string>}
      const result = typeof Motion.requestPermission === "function" ? await Motion.requestPermission() : "granted"
      setMotionState(result === "granted"?"enabled":"unavailable")
    }catch{setMotionState("unavailable")}
  }
  return <div className="blend-interaction">
    <p className="blend-guide">마우스로 용기를 흔들거나 손가락으로 좌우로 움직여 보세요.</p>
    <div className="blend-touch-target" role="group" aria-label="조향 용기 흔들어 섞기" tabIndex={0}
      onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);last.current={x:e.clientX,y:e.clientY}}}
      onPointerMove={e=>{if(!last.current)return;const dist=Math.hypot(e.clientX-last.current.x,e.clientY-last.current.y);if(dist>8){advance(Math.min(9,dist/9));last.current={x:e.clientX,y:e.clientY}}}}
      onPointerUp={()=>last.current=null} onPointerCancel={()=>last.current=null}
      onKeyDown={e=>{if(e.key==="ArrowLeft"||e.key==="ArrowRight"||e.key==="Enter"){e.preventDefault();advance(12)}}}>
      <div className="blend-illustration" style={{"--blend-rotation":`${Math.sin(rotation/30)*10}deg`} as React.CSSProperties}>
        <div className="blend-bottle-neck" />
        <div className="blend-bottle-body"><div className="blend-liquid" style={{height:`${20+progress*.42}%`}}/><strong>AURA</strong><small>PERSONAL ATELIER</small></div>
        {ingredients.slice(0,9).map((ingredient,index)=><img key={ingredient} alt="" draggable={false} className="blend-floating-ingredient" style={{top:`${5+(index%3)*25}%`,left:`${index%2?68:1}%`}} src={`/assets/ingredients/${icons[ingredient]}.png`}/>)}
      </div>
    </div>
    <div className="blend-progress"><span>BLENDING</span><span aria-live="polite">{Math.round(progress)}%</span></div>
    <div className="blend-progress-track"><span style={{width:`${progress}%`}}/></div>
    <div className="blend-controls">
      {motionState==="idle" && <button type="button" className="blend-motion-button" onClick={activateMotion}>휴대폰 흔들기 사용</button>}
      {motionState==="enabled" && <span className="blend-support">흔들기 감지가 켜졌어요.</span>}
      {motionState==="unavailable" && <span className="blend-support">흔들기를 사용할 수 없다면 화면을 드래그해 주세요.</span>}
      <button type="button" className="blend-tap-button" onClick={()=>advance(12)} aria-label="블렌딩 진행하기">가볍게 저어 섞기 ↗</button>
    </div>
  </div>
}
