"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { AtelierFlask } from "./AtelierVisuals"

const MAX_TILT = 14

/** Gesture-controlled 2D blending. No motion permission is requested until a tap. */
export function BlendVessel({ ingredients, onComplete }: { ingredients:string[]; onComplete:()=>void }) {
  const [progress,setProgress] = useState(0)
  const [tilt,setTilt] = useState(0)
  const [motionState,setMotionState] = useState<"idle"|"enabled"|"unavailable">("idle")
  const last = useRef<{x:number,y:number}|null>(null)
  const settle = useRef<number|undefined>(undefined)
  const finished = useRef(false)
  const onCompleteRef = useRef(onComplete)
  useEffect(()=> { onCompleteRef.current = onComplete },[onComplete])
  useEffect(()=>()=>window.clearTimeout(settle.current),[])
  /** Tilts toward the gesture direction, then settles upright once the gesture pauses. */
  const advance = useCallback((amount:number, direction:number)=>{
    if(finished.current) return
    setProgress(current => Math.min(100,current+amount))
    setTilt(current => Math.max(-MAX_TILT,Math.min(MAX_TILT,current*.55 + direction*MAX_TILT*.6)))
    window.clearTimeout(settle.current)
    settle.current = window.setTimeout(()=>setTilt(0),180)
  },[])
  useEffect(()=>{
    if(progress>=100 && !finished.current){ finished.current=true; setTilt(0); const t=window.setTimeout(()=>onCompleteRef.current(),900); return ()=>window.clearTimeout(t) }
  },[progress])
  useEffect(()=>{
    if(motionState!=="enabled") return
    let lastShake=0
    const onMotion=(event:DeviceMotionEvent)=>{
      const a=event.accelerationIncludingGravity
      if(!a) return
      const magnitude=Math.sqrt((a.x||0)**2+(a.y||0)**2+(a.z||0)**2)
      const now=Date.now()
      if(magnitude>18 && now-lastShake>170){lastShake=now;advance(9,Math.sign(a.x||1))}
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
  const complete = progress >= 100
  return <div className={`blend-interaction ${complete ? "is-complete" : ""}`}>
    <p className="blend-guide">{complete ? "향료가 하나로 어우러졌어요." : "용기를 좌우로 끌어 흔들거나, 아래 버튼으로 천천히 저어 섞어 보세요."}</p>
    <div className="blend-touch-target" role="group" aria-label="조향 용기 흔들어 섞기. 좌우 화살표 키로도 섞을 수 있어요." tabIndex={0}
      onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);last.current={x:e.clientX,y:e.clientY}}}
      onPointerMove={e=>{if(!last.current)return;const dx=e.clientX-last.current.x;const dist=Math.hypot(dx,e.clientY-last.current.y);if(dist>8){advance(Math.min(9,dist/9),Math.sign(dx));last.current={x:e.clientX,y:e.clientY}}}}
      onPointerUp={()=>last.current=null} onPointerCancel={()=>last.current=null}
      onKeyDown={e=>{if(e.key==="ArrowLeft"||e.key==="ArrowRight"||e.key==="Enter"||e.key===" "){e.preventDefault();advance(12,e.key==="ArrowLeft"?-1:1)}}}>
      <div className="blend-illustration" style={{"--blend-rotation":`${tilt}deg`} as React.CSSProperties}>
        <AtelierFlask ingredients={ingredients} progress={progress} tilt={tilt} blended />
      </div>
    </div>
    <div className="blend-progress"><span>{complete ? "BLEND COMPLETE" : "BLENDING"}</span><span aria-live="polite">{Math.round(progress)}%</span></div>
    <div className="blend-progress-track" role="progressbar" aria-label="블렌딩 진행률" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}><span style={{width:`${progress}%`}}/></div>
    <div className="blend-controls">
      {motionState==="idle" && <button type="button" className="blend-motion-button" onClick={activateMotion} disabled={complete}>휴대폰 흔들기 사용</button>}
      {motionState==="enabled" && <span className="blend-support">흔들기 감지가 켜졌어요.</span>}
      {motionState==="unavailable" && <span className="blend-support">흔들기를 사용할 수 없다면 화면을 드래그해 주세요.</span>}
      <button type="button" className="blend-tap-button" onClick={()=>advance(12,progress%24<12?1:-1)} disabled={complete} aria-label="블렌딩 진행하기">가볍게 저어 섞기 ↗</button>
    </div>
  </div>
}
