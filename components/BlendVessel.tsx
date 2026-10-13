"use client"

import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { averageColor, FLASK_SHAPE, ingredientImage, NOTE_SIZE, stackLayers } from "./AtelierVisuals"
import { ANCHOR, BLEND_HEIGHT, BLEND_WIDTH, BlendLiquid, FLASK_SCALE, PIVOT } from "./blendLiquid"

type MotionState = "off" | "pending" | "enabled" | "unavailable"
type MotionWithPermission = typeof DeviceMotionEvent & { requestPermission?: () => Promise<string> }

let motionAccess: "granted" | "denied" | undefined
const motionListeners = new Set<() => void>()

const isTouchDevice = () => "DeviceMotionEvent" in window && window.matchMedia("(pointer: coarse)").matches
const needsMotionPermission = () => typeof (DeviceMotionEvent as MotionWithPermission).requestPermission === "function"

/** Phones shake to blend automatically; only iOS needs an explicit permission, which it grants from a tap. */
function motionSnapshot(): MotionState {
  if (!isTouchDevice()) return "off"
  if (!needsMotionPermission()) return "enabled"
  return motionAccess === "granted" ? "enabled" : motionAccess === "denied" ? "unavailable" : "pending"
}

const subscribeMotion = (listener: () => void) => {
  motionListeners.add(listener)
  return () => { motionListeners.delete(listener) }
}

/** Call from the tap that starts blending, so iOS can show its motion permission prompt then. */
export function requestBlendMotion() {
  if (typeof window === "undefined" || !isTouchDevice() || !needsMotionPermission() || motionAccess) return
  const settle = (result: "granted" | "denied") => { motionAccess = result; motionListeners.forEach((listener) => listener()) }
  ;(DeviceMotionEvent as MotionWithPermission).requestPermission!()
    .then((result) => settle(result === "granted" ? "granted" : "denied"))
    .catch(() => settle("denied"))
}

/**
 * Draws one frame in flask space: the hand holds the neck at ANCHOR, the body hangs at `swing`.
 * Colours come from the simulation's dye grid, clipped to the flask and below the moving surface.
 */
function createRenderer(canvas: HTMLCanvasElement, sim: BlendLiquid, ingredients: string[]) {
  const ctx = canvas.getContext("2d")
  if (!ctx) return () => {}
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  canvas.width = BLEND_WIDTH * dpr
  canvas.height = BLEND_HEIGHT * dpr
  const flask = new Path2D(FLASK_SHAPE)
  const highlight = new Path2D("M84 228 Q68 284 80 339")
  const reflection = new Path2D("M222 220 Q254 277 239 336")
  const dyeCanvas = document.createElement("canvas")
  dyeCanvas.width = BlendLiquid.gridW
  dyeCanvas.height = sim.gridH
  const dyeCtx = dyeCanvas.getContext("2d")
  const pixels = dyeCtx?.createImageData(BlendLiquid.gridW, sim.gridH)
  const images = new Map(ingredients.map((name) => {
    const image = new Image()
    image.src = ingredientImage(name)
    return [name, image] as const
  }))
  const serif = getComputedStyle(document.documentElement).getPropertyValue("--font-serif").trim() || "serif"
  const right = BlendLiquid.gridX + BlendLiquid.gridW * BlendLiquid.cell

  return () => {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, BLEND_WIDTH, BLEND_HEIGHT)
    ctx.save()
    ctx.translate(ANCHOR.x + sim.hand, ANCHOR.y)
    ctx.scale(FLASK_SCALE, FLASK_SCALE)
    ctx.rotate(sim.swing)
    ctx.translate(-PIVOT.x, -PIVOT.y)

    const surface = new Path2D()
    surface.moveTo(BlendLiquid.gridX - 20, sim.surfaceY(0))
    for (let column = 0; column < BlendLiquid.columns; column++) surface.lineTo(BlendLiquid.columnX(column), sim.surfaceY(column))
    surface.lineTo(right + 20, sim.surfaceY(BlendLiquid.columns - 1))
    const liquid = new Path2D(surface)
    liquid.lineTo(right + 20, 420)
    liquid.lineTo(BlendLiquid.gridX - 20, 420)
    liquid.closePath()

    if (dyeCtx && pixels) {
      for (let k = 0, p = 0; k < sim.dye.length; k += 3, p += 4) {
        pixels.data[p] = sim.dye[k]
        pixels.data[p + 1] = sim.dye[k + 1]
        pixels.data[p + 2] = sim.dye[k + 2]
        pixels.data[p + 3] = 255
      }
      dyeCtx.putImageData(pixels, 0, 0)
    }
    ctx.save()
    ctx.clip(flask)
    ctx.clip(liquid)
    ctx.globalAlpha = .86
    ctx.drawImage(dyeCanvas, BlendLiquid.gridX, sim.gridTop, BlendLiquid.gridW * BlendLiquid.cell, sim.gridH * BlendLiquid.cell)
    // Notes drift with the flow and dissolve as the blend comes together.
    const fade = Math.max(0, .92 * (1 - sim.progress * 1.3))
    const size = NOTE_SIZE * (1 - sim.progress * .45)
    if (fade > 0) for (const note of sim.notes) {
      const image = images.get(note.name)
      if (!image?.complete || !image.naturalWidth) continue
      ctx.globalAlpha = fade
      ctx.drawImage(image, note.x - size / 2, note.y - size / 2, size, size)
    }
    ctx.restore()

    ctx.save()
    ctx.clip(flask)
    ctx.strokeStyle = "rgba(255,255,255,.45)"
    ctx.lineWidth = 1.5
    ctx.stroke(surface)
    ctx.lineCap = "round"
    ctx.strokeStyle = "rgba(255,255,255,.4)"
    ctx.lineWidth = 5
    ctx.stroke(highlight)
    ctx.strokeStyle = "rgba(255,255,255,.18)"
    ctx.lineWidth = 3
    ctx.stroke(reflection)
    ctx.restore()

    ctx.fillStyle = "rgba(255,255,255,.05)"
    ctx.fill(flask)
    ctx.strokeStyle = "rgba(232,225,213,.65)"
    ctx.lineWidth = 2
    ctx.stroke(flask)
    ctx.strokeStyle = "rgba(238,231,217,.7)"
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.ellipse(160, 42, 30, 6, 0, 0, Math.PI * 2)
    ctx.stroke()
    ctx.textAlign = "center"
    ctx.fillStyle = "#eee7d9"
    ctx.font = `18px ${serif}`
    ctx.letterSpacing = "5px"
    ctx.fillText("AURA", 160, 183)
    ctx.fillStyle = "#d7cdbc"
    ctx.font = "7px sans-serif"
    ctx.letterSpacing = "2px"
    ctx.fillText("PERSONAL ATELIER", 160, 199)
    ctx.restore()
  }
}

/**
 * Blending by hand: drag holds the flask by its neck and sways it, the button swirls it gently,
 * and on phones shaking moves it. Progress is how evenly the colours have actually mixed.
 */
export function BlendVessel({ ingredients, onComplete }: { ingredients:string[]; onComplete:()=>void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const simRef = useRef<BlendLiquid | null>(null)
  const dragStart = useRef<number | null>(null)
  const [progress,setProgress] = useState(0)
  const motionState = useSyncExternalStore(subscribeMotion, motionSnapshot, (): MotionState => "off")
  const finished = useRef(false)
  const onCompleteRef = useRef(onComplete)
  useEffect(()=> { onCompleteRef.current = onComplete },[onComplete])
  useEffect(()=>{
    if(progress>=100 && !finished.current){ finished.current=true; const t=window.setTimeout(()=>onCompleteRef.current(),900); return ()=>window.clearTimeout(t) }
  },[progress])
  useEffect(()=>{
    const canvas = canvasRef.current
    if(!canvas) return
    const sim = new BlendLiquid(stackLayers(ingredients).map((layer) => ({ ...layer, color: averageColor(layer.items) })))
    simRef.current = sim
    const draw = createRenderer(canvas, sim, ingredients)
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    let frame = 0, count = 0, shown = 0
    const loop = () => {
      sim.step(reducedMotion)
      draw()
      const next = Math.round(sim.progress * 100)
      if(++count % 6 === 0 && next !== shown){ shown = next; setProgress(next) }
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)
    return ()=>cancelAnimationFrame(frame)
  },[ingredients])
  useEffect(()=>{
    if(motionState!=="enabled") return
    let previous: number | null = null
    // High-pass on sideways acceleration, so holding the phone tilted does not push the flask.
    const onMotion=(event:DeviceMotionEvent)=>{
      const x = (event.acceleration ?? event.accelerationIncludingGravity)?.x
      if(x == null) return
      if(previous != null) simRef.current?.jolt((x - previous) * .5)
      previous = x
    }
    window.addEventListener("devicemotion",onMotion)
    return ()=>window.removeEventListener("devicemotion",onMotion)
  },[motionState])
  /** Canvas pixels per screen pixel, for a canvas drawn with object-fit: contain. */
  const canvasScale = (element: HTMLElement) => {
    const rect = element.getBoundingClientRect()
    return 1 / Math.min(rect.width / BLEND_WIDTH, rect.height / BLEND_HEIGHT)
  }
  const endDrag = () => { dragStart.current = null; simRef.current?.release() }
  const complete = progress >= 100
  return <div className={`blend-interaction ${complete ? "is-complete" : ""}`}>
    {complete && <p className="blend-guide" role="status">향료가 하나로 어우러졌어요.</p>}
    <div className="blend-touch-target" role="group" aria-label="조향 용기의 목을 잡고 흔들어 섞기. 좌우 화살표 키로도 섞을 수 있어요." tabIndex={0}
      onPointerDown={e=>{requestBlendMotion();e.currentTarget.setPointerCapture(e.pointerId);dragStart.current=e.clientX-(simRef.current?.hand ?? 0)/canvasScale(e.currentTarget)}}
      onPointerMove={e=>{if(dragStart.current==null)return;simRef.current?.holdAt((e.clientX-dragStart.current)*canvasScale(e.currentTarget))}}
      onPointerUp={endDrag} onPointerCancel={endDrag}
      onKeyDown={e=>{if(e.key==="ArrowLeft"||e.key==="ArrowRight"||e.key==="Enter"||e.key===" "){e.preventDefault();simRef.current?.shake()}}}>
      <canvas ref={canvasRef} className="blend-canvas" role="img" aria-label={`${ingredients.length}가지 향료가 섞이고 있는 조향 용기`}/>
    </div>
    <div className="blend-progress"><span>{complete ? "BLEND COMPLETE" : "BLENDING"}</span><span aria-live="polite">{progress}%</span></div>
    <div className="blend-progress-track" role="progressbar" aria-label="블렌딩 진행률" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><span style={{width:`${progress}%`}}/></div>
    <div className="blend-controls">
      {motionState==="enabled" && <span className="blend-support">휴대폰을 흔들어 섞어 보세요.</span>}
      {motionState==="pending" && <span className="blend-support">용기를 터치하면 흔들어 섞을 수 있어요.</span>}
      {(motionState==="unavailable" || motionState==="off") && <span className="blend-support">용기의 목을 잡고 좌우로 흔들어 주세요.</span>}
      <button type="button" className="blend-tap-button" onClick={()=>simRef.current?.shake()} disabled={complete} aria-label="용기를 부드럽게 흔들어 섞기">가볍게 흔들어 섞기 ↗</button>
    </div>
  </div>
}
