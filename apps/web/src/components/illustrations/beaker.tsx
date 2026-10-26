"use client";
/* eslint-disable @next/next/no-img-element */
import { Vessel } from "@/components/illustrations/vessel";
export function Beaker({
  count,
  color,
  mixing = false,
  drop = 0,
  stir,
}: {
  count: number;
  color: string;
  mixing?: boolean;
  drop?: number;
  stir?: { x: number; y: number; energy: number; tilt?: number; wave?: number; mode?: string };
}) {
  return (
    <div className={"beaker " + (mixing ? "mixing" : "")}>
      <Vessel total={count} color={color} mixing={mixing} stir={stir} />
      {drop > 0 && (
        <span key={drop} className="vessel-drop a86-vessel-drop" aria-hidden="true">
          <img src="/assets/editorial/drop-amber-natural.svg" alt="" />
        </span>
      )}
    </div>
  );
}
