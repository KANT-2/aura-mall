"use client";
import { useId } from "react";

export type VesselMotion = {
  x: number;
  y: number;
  energy: number;
  tilt?: number;
  wave?: number;
  mode?: string;
};

/** Crisp SVG glass and live liquid surface: no low-resolution raster beaker frames.
 * Stir mode follows pointer energy. Shake mode sloshes the surface without a rod. */
export function Vessel({
  total,
  color = "#d9a04c",
  mixing = false,
  stir,
}: {
  total: number;
  color?: string;
  mixing?: boolean;
  stir?: VesselMotion;
}) {
  const id = useId().replace(/:/g, "");
  const fill = Math.min(20, Math.max(0, total));
  const level = 270 - fill * 6;
  const e = Math.max(0, Math.min(1, stir?.energy ?? 0));
  const shake = stir?.mode === "shake";
  const t = Math.max(-12, Math.min(12, stir?.tilt ?? 0));
  const w = Math.max(-14, Math.min(14, stir?.wave ?? 0));
  const cx = 180 + ((stir?.x ?? 50) - 50) * 0.16;
  const rise = shake ? t * 0.8 + w * 0.8 : 0;
  const surface = `M79 ${level + rise} Q129 ${level - 19 - w * 0.35 - e * 6} ${cx} ${level - 19} Q234 ${level - 18 + w * 0.35 + e * 5} 281 ${level - rise} L281 279 Q180 308 79 279 Z`;
  const surfLine = `M79 ${level + rise} Q129 ${level - 19 - w * 0.35 - e * 6} ${cx} ${level - 19} Q234 ${level - 18 + w * 0.35 + e * 5} 281 ${level - rise}`;
  const turn = ((stir?.x ?? 50) - 50) * 0.42;
  return (
    <svg
      className="live-vessel"
      viewBox="0 0 360 360"
      role="img"
      aria-label={`투명 유리 비커, 향료 ${total}회 투입`}
    >
      <defs>
        <linearGradient id={id + "-glass"}>
          <stop stopColor="#fffcf5" stopOpacity=".72" />
          <stop offset=".18" stopColor="#e4d9c5" stopOpacity=".15" />
          <stop offset=".7" stopColor="#fffdf5" stopOpacity=".11" />
          <stop offset="1" stopColor="#d7cbb8" stopOpacity=".5" />
        </linearGradient>
        <linearGradient id={id + "-wood"}>
          <stop stopColor="#51331e" />
          <stop offset=".25" stopColor="#a3714b" />
          <stop offset=".6" stopColor="#7b4d2e" />
          <stop offset="1" stopColor="#492b1b" />
        </linearGradient>
        <linearGradient id={id + "-liquid"} x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#fff2ce" stopOpacity=".72" />
          <stop offset=".4" stopColor={color} stopOpacity=".75" />
          <stop offset="1" stopColor="#a86e35" stopOpacity=".85" />
        </linearGradient>
        <linearGradient id={id + "-swirl"} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#fff4d5" stopOpacity=".9" />
          <stop offset=".55" stopColor="#d59b4d" stopOpacity=".5" />
          <stop offset="1" stopColor="#fff4cf" stopOpacity=".05" />
        </linearGradient>
        <clipPath id={id + "-inside"}>
          <path d="M79 98V278Q180 309 281 278V98Z" />
        </clipPath>
      </defs>
      <g data-layer="shadow">
        <ellipse cx="190" cy="315" rx="120" ry="15" fill="#4f3925" opacity=".09" />
      </g>
      <g data-layer="wood-base">
        <path d="M72 278V309Q180 345 288 309V278Z" fill={`url(#${id}-wood)`} stroke="#6f492f" />
        <ellipse cx="180" cy="278" rx="108" ry="22" fill="#9d7956" />
        {Array.from({ length: 23 }, (_, i) => (
          <path
            key={i}
            d={`M${78 + i * 9} 294 q1 10 0 ${13 + (i % 5)}`}
            stroke={i % 2 ? "#412918" : "#d8a879"}
            strokeWidth=".7"
            opacity=".38"
          />
        ))}
      </g>
      <g data-layer="glass-body">
        <path
          d="M72 92V287Q180 320 288 287V101L301 94Q298 86 284 84"
          fill={`url(#${id}-glass)`}
          stroke="#c1b5a0"
          strokeWidth="1.5"
        />
      </g>
      <g data-layer="liquid" clipPath={`url(#${id}-inside)`}>
        {total > 0 && (
          <>
            <path
              d={surface}
              fill={`url(#${id}-liquid)`}
              style={{ transition: shake ? "d 100ms linear" : "d 120ms ease-out" }}
            />
            <path d={surfLine} fill="none" stroke="#fff5d9" strokeWidth="3.1" opacity=".73" />
            <path
              d={`M97 ${level + 20} Q180 ${level + 12 + w * 0.32} 264 ${level + 18}`}
              fill="none"
              stroke="#fff8e7"
              strokeWidth="1.5"
              opacity={0.15 + e * 0.34}
            />
            {e > 0.025 && (
              <g opacity={Math.min(0.72, e * 0.86)} aria-hidden="true">
                {shake ? (
                  <>
                    <path
                      d={`M94 ${level + 8 + rise} Q140 ${level - 8 + w * 0.65} 180 ${level + 3} T266 ${level + 7 - rise}`}
                      fill="none"
                      stroke="#fff5d9"
                      strokeWidth="2.5"
                    />
                    <ellipse
                      cx={225 - w * 1.3}
                      cy={level + 12}
                      rx={14 + e * 12}
                      ry={3 + e * 2}
                      fill="none"
                      stroke="#ffe7b2"
                      strokeWidth="1.5"
                    />
                  </>
                ) : (
                  <>
                    <g transform={`rotate(${turn} 180 ${level})`}>
                      <path
                        d={`M112 ${level + 1} C142 ${level - 18 - e * 4} 217 ${level - 20} 242 ${level - 1} C261 ${level + 14} 197 ${level + 25} 168 ${level + 13} C141 ${level + 5} 182 ${level - 8} 203 ${level}`}
                        stroke={`url(#${id}-swirl)`}
                        strokeWidth={4 + e * 6}
                        strokeLinecap="round"
                        fill="none"
                      />
                      <ellipse
                        cx={cx}
                        cy={level + 2}
                        rx={18 + e * 12}
                        ry={4 + e * 2}
                        stroke="#fff8de"
                        strokeWidth="1.6"
                        fill="none"
                      />
                    </g>
                  </>
                )}
              </g>
            )}
            {mixing && (
              <ellipse
                className="liquid-ripple"
                cx="180"
                cy={level}
                rx="93"
                ry="17"
                stroke="#fff4dd"
                strokeWidth="2"
                fill="none"
                opacity=".5"
              />
            )}
          </>
        )}
      </g>
      <g data-layer="rim">
        <path
          d="M72 92C72 65 270 62 290 85L301 94L288 100C260 117 77 119 72 92Z"
          fill="#fffdf5"
          fillOpacity=".24"
          stroke="#bcb09b"
          strokeWidth="1.5"
        />
        <path d="M81 93Q180 122 278 94" fill="none" stroke="#fff" strokeWidth="2" opacity=".8" />
      </g>
      <g data-layer="reflections">
        <path d="M86 113V267" stroke="#fffdf7" strokeWidth="6" opacity=".69" />
        <path d="M94 114V271M273 112V266" stroke="#fffdf7" strokeWidth="2" opacity=".54" />
        <ellipse
          cx="180"
          cy="281"
          rx="98"
          ry="20"
          fill="none"
          stroke="#fffaf1"
          strokeWidth="2"
          opacity=".55"
        />
      </g>
    </svg>
  );
}
