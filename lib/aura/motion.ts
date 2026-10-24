type Acceleration = { x: number | null; y: number | null; z: number | null } | null;
export type MotionSample = { magnitude: number; x: number; y: number };
export type ShakeTracker = { gravity: number; last: number; peaks: number; lastPeak: number };
export const initialShakeTracker = (): ShakeTracker => ({ gravity: 0, last: 0, peaks: 0, lastPeak: 0 });

function vector(value: Acceleration): [number, number, number] | null {
  if (!value || ![value.x, value.y, value.z].every(n => typeof n === "number" && Number.isFinite(n))) return null;
  return [value.x!, value.y!, value.z!];
}

export function motionSample(acceleration: Acceleration, includingGravity: Acceleration): MotionSample | null {
  const direct = vector(acceleration);
  const gravity = vector(includingGravity);
  const components = direct ?? gravity;
  if (!components) return null;
  return {
    magnitude: direct ? Math.hypot(...direct) : Math.max(0, Math.hypot(...gravity!) - 9.81),
    x: components[0],
    y: components[1],
  };
}

/** A single peak cannot advance blending; two intentional peaks are required. */
export function detectShake(previous: ShakeTracker, sample: MotionSample, now: number) {
  const next = { ...previous, gravity: previous.gravity * .82 + sample.magnitude * .18 };
  const jerk = Math.abs(sample.magnitude - previous.gravity);
  if (now - previous.last < 440 || (sample.magnitude < 3.8 && jerk < 3.2)) return { tracker: next, progress: 0 };
  next.peaks = now - previous.lastPeak < 1050 ? previous.peaks + 1 : 1;
  next.lastPeak = now;
  if (next.peaks < 2) return { tracker: next, progress: 0 };
  next.peaks = 0;
  next.last = now;
  return { tracker: next, progress: Math.min(9, 5 + Math.round(sample.magnitude * .22)) };
}

export function shakePose(sample: MotionSample) {
  return {
    tilt: Math.max(-12, Math.min(12, sample.x * 2.5)),
    wave: Math.max(-14, Math.min(14, sample.y * 1.7 + sample.x * .9)),
    energy: Math.min(1, sample.magnitude / 14),
  };
}
