"use client";
import { useId } from "react";

/** Independent vector layers; liquid height follows each addition, no raster wrapper. */
export function Vessel({ total, color = "#d9a04c", mixing = false, stir }: { total: number; color?: string; mixing?: boolean; stir?:{x:number;y:number;energy:number} }) {
  const id = useId().replace(/:/g, "");
  const y = 270 - Math.min(20, total) * 6;
  return <svg className="live-vessel" viewBox="0 0 360 360" role="img" aria-label={`목재 받침 유리 비커, ${total}회 투입`}>
    <defs>
      <linearGradient id={`${id}-glass`}><stop stopColor="#fffdf6" stopOpacity=".8"/><stop offset=".18" stopColor="#e4d9c5" stopOpacity=".18"/><stop offset=".7" stopColor="#fffdf5" stopOpacity=".14"/><stop offset="1" stopColor="#d7cbb8" stopOpacity=".5"/></linearGradient>
      <linearGradient id={`${id}-wood`}><stop stopColor="#51331e"/><stop offset=".25" stopColor="#a3714b"/><stop offset=".6" stopColor="#7b4d2e"/><stop offset="1" stopColor="#492b1b"/></linearGradient>
      <linearGradient id={`${id}-liquid`} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#f8dca5" stopOpacity=".63"/><stop offset=".48" stopColor={color} stopOpacity=".46"/><stop offset="1" stopColor="#c68b4d" stopOpacity=".77"/></linearGradient>
      <linearGradient id={`${id}-swirl`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#ffedc5" stopOpacity=".96"/><stop offset=".55" stopColor="#d79a48" stopOpacity=".75"/><stop offset="1" stopColor="#fbe7bd" stopOpacity=".1"/></linearGradient>
      <clipPath id={`${id}-inside`}><path d="M79 98V278Q180 309 281 278V98Z"/></clipPath>
    </defs>
    <g data-layer="shadow"><ellipse cx="199" cy="313" rx="120" ry="17" fill="#5b4029" opacity=".08"/></g>
    <g data-layer="wood-base"><path d="M72 278V309Q180 345 288 309V278Z" fill={`url(#${id}-wood)`} stroke="#6f492f"/><ellipse cx="180" cy="278" rx="108" ry="22" fill="#9d7956"/>{Array.from({length:32},(_,i)=><path key={i} d={`M${76+i*6.5} 294q${i%3-1} 9 0 ${[16,17,18,19,20,21,22,23,22,21,20,19,18,17,16,15][i % 16]}`} stroke={i%2?"#412918":"#d8a879"} strokeWidth=".7" opacity=".4"/>)}</g>
    <g data-layer="glass-body"><path d="M72 92V287Q180 320 288 287V101L301 94Q298 86 284 84" fill={`url(#${id}-glass)`} stroke="#c1b5a0" strokeWidth="1.5"/></g>
    <g data-layer="liquid" clipPath={`url(#${id}-inside)`} style={{transition:"fill .35s"}}>
      {total>0&&<><path d={`M79 ${y}V278Q180 309 281 278V${y}Z`} fill={`url(#${id}-liquid)`}/><ellipse cx={180+((stir?.x ?? 50)-50)*.09} cy={y} rx="101" ry="20" fill="#dfab65" opacity=".54"/><ellipse cx="180" cy={y} rx="98" ry="18" fill="none" stroke="#fff2d6" opacity=".8"/>{stir && stir.energy>.03 && <g aria-hidden="true" opacity={Math.min(.68,stir.energy*.86)}><path d={`M82 ${y+3} Q125 ${y-5-stir.energy*4} ${170+(stir.x-50)*.4} ${y+2} T278 ${y+2}`} fill="none" stroke="#fff4d8" strokeWidth="1.8"/><path d={`M101 ${y+9} Q${168+(stir.x-50)*.2} ${y+14+stir.energy*3} 251 ${y+7}`} fill="none" stroke="#a36a33" strokeWidth="1.2" opacity=".55"/></g>}{stir && stir.energy>.025 && <g opacity={Math.min(.42,stir.energy*.45)}><ellipse cx={180+(stir.x-50)*.32} cy={y+(stir.y-50)*.07} rx={17+stir.energy*7} ry={4+stir.energy*2} fill="none" stroke="#fff7e5" strokeWidth="1.2"/><path d={`M${154+(stir.x-50)*.23} ${y+7} Q${178+(stir.x-50)*.23} ${y+12} ${209+(stir.x-50)*.23} ${y+5}`} fill="none" stroke="#b98242" strokeWidth="1" opacity=".3"/></g>}{mixing&&<g className="liquid-ripple"><ellipse cx="180" cy={y} rx="91" ry="17" fill="none" stroke="#fff3dc" strokeWidth="1.8" opacity=".7"/><path d={`M117 ${y-1} C133 ${y-15} 198 ${y-18} 234 ${y-2} C257 ${y+11} 194 ${y+21} 164 ${y+10} C143 ${y+3} 176 ${y-11} 198 ${y-4} C215 ${y+1} 183 ${y+11} 173 ${y+5}`} fill="none" stroke={`url(#${id}-swirl)`} strokeWidth="7" strokeLinecap="round"/><path d={`M148 ${y+1} C161 ${y-9} 192 ${y-9} 207 ${y+3} C215 ${y+11} 182 ${y+13} 176 ${y+5}`} fill="none" stroke="#fff3d4" strokeWidth="2" strokeLinecap="round" opacity=".7"/></g>}</>}
    </g>
    <g data-layer="rim"><path d="M72 92C72 65 270 62 290 85L301 94L288 100C260 117 77 119 72 92Z" fill="#fffdf5" fillOpacity=".3" stroke="#bcb09b" strokeWidth="1.5"/><path d="M81 93Q180 122 278 94" fill="none" stroke="#fff" strokeWidth="2" opacity=".8"/></g>
    <g data-layer="reflections"><path d="M86 113V267" stroke="#fffdf7" strokeWidth="6" opacity=".8"/><path d="M94 114V271M273 112V266" stroke="#fffdf7" strokeWidth="2" opacity=".6"/><ellipse cx="180" cy="281" rx="98" ry="20" fill="none" stroke="#fffaf1" strokeWidth="2" opacity=".6"/></g>
  </svg>;
}
