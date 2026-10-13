/**
 * Blending physics for MY AURA. The flask hangs from a hand that holds its neck: the body swings
 * like a pendulum, the liquid surface is a 1D shallow-water height field, and the colour layers mix
 * only as much as the liquid is actually stirred. Pure maths, no DOM, so it can be stepped anywhere.
 */

export type BlendLayer = { top: number; bottom: number; color: [number, number, number]; items: string[] }

/** Canvas size in CSS pixels. The flask itself is drawn in its 320×410 SVG coordinate space. */
export const BLEND_WIDTH = 360
export const BLEND_HEIGHT = 320
/** The neck, in flask space; the hand holds the flask here. */
export const PIVOT = { x: 160, y: 70 }
/** Where the hand sits on the canvas, and how large the flask is drawn. */
export const ANCHOR = { x: BLEND_WIDTH / 2, y: 34 }
export const FLASK_SCALE = .8

const BOTTOM = 374
const COLUMNS = 40
const X0 = 30
const X1 = 290
const DX = (X1 - X0) / COLUMNS
const CELL = 5
const GRID_W = (X1 - X0) / CELL

// Pendulum (gravity, stiffness, length) and liquid (wave speed, damping, how strongly it follows tilt).
const GRAVITY = 3.4
const STIFFNESS = .0155
const LENGTH = GRAVITY / STIFFNESS
const WAVE = .28
const WAVE_DAMP = .992
const FORCE = .6
const HAND_LIMIT = 30
const SWING_LIMIT = .25
/** Mixing counts as complete at this share of the initial colour spread removed. */
const MIX_DONE = .7

export type BlendNote = { name: string; x: number; y: number; restX: number; restY: number }

export class BlendLiquid {
  readonly liquidTop: number
  readonly gridTop: number
  readonly gridH: number
  readonly dye: Float32Array
  readonly heights = new Float32Array(COLUMNS)
  readonly notes: BlendNote[]
  hand = 0
  swing = 0
  energy = 0
  private flow = new Float32Array(COLUMNS + 1)
  private level = new Float32Array(COLUMNS)
  private scratch: Float32Array
  private handVel = 0
  private prevHandVel = 0
  private handTarget = 0
  private swingVel = 0
  private time = 0
  private shakeStart = -1
  private shakeLength = 0
  private boost = 0
  private initialSpread = 1
  private mixed = 0

  constructor(layers: BlendLayer[]) {
    this.liquidTop = layers.at(-1)?.top ?? BOTTOM
    this.gridTop = Math.floor((this.liquidTop - 76) / CELL) * CELL
    this.gridH = Math.ceil((BOTTOM - this.gridTop) / CELL)
    this.dye = new Float32Array(GRID_W * this.gridH * 3)
    this.scratch = new Float32Array(this.dye.length)
    const fallback = layers.at(-1)?.color ?? [177, 193, 181]
    for (let j = 0; j < this.gridH; j++) {
      const y = this.gridTop + (j + .5) * CELL
      const color = layers.find((layer) => y >= layer.top && y < layer.bottom)?.color ?? (y >= BOTTOM ? layers[0]?.color ?? fallback : fallback)
      for (let i = 0; i < GRID_W; i++) this.dye.set(color, (j * GRID_W + i) * 3)
    }
    this.initialSpread = Math.max(1, this.spread())
    this.notes = layers.flatMap((layer) => layer.items.map((name, index) => {
      const restX = 160 + (index - (layer.items.length - 1) / 2) * 58
      const restY = (layer.top + layer.bottom) / 2
      return { name, x: restX, y: restY, restX, restY }
    }))
  }

  /** 0–1 share of the way to a full blend. Never goes back down. */
  get progress() { return Math.min(1, this.mixed / MIX_DONE) }

  /** Drag: move the hand towards this offset from rest, in canvas pixels. */
  holdAt(offset: number) { this.shakeStart = -1; this.handTarget = Math.max(-HAND_LIMIT, Math.min(HAND_LIMIT, offset)) }
  release() { this.handTarget = 0 }
  /** Device motion: a sideways jolt of the phone pushes the hand. */
  jolt(amount: number) { this.handVel += Math.max(-6, Math.min(6, amount)) }
  /** A gentle swirl of the hand: eases in, sways about once a second, eases out. */
  shake(seconds = 2.6) { this.shakeStart = this.time; this.shakeLength = seconds; this.boost = Math.min(1, this.boost + .35) }

  /** Advances one 60fps frame. With reduced motion nothing swings; agitation still mixes. */
  step(reducedMotion = false) {
    this.time += 1 / 60
    if (this.shakeStart >= 0) {
      const t = this.time - this.shakeStart
      if (t < this.shakeLength) this.handTarget = 24 * Math.sin(Math.PI * t / this.shakeLength) ** 2 * Math.sin(2 * Math.PI * 1.05 * t)
      else { this.shakeStart = -1; this.handTarget = 0 }
    }
    if (reducedMotion) {
      this.handTarget = 0
      this.energy += ((this.shakeStart >= 0 ? .7 : 0) - this.energy) * .06
    } else {
      this.moveHand()
    }
    this.boost *= .97
    this.mix()
  }

  private moveHand() {
    this.handVel = (this.handVel + (this.handTarget - this.hand) * .1) * .7
    this.hand += this.handVel
    const accel = this.handVel - this.prevHandVel
    this.prevHandVel = this.handVel
    this.swingVel += -STIFFNESS * Math.sin(this.swing) + (accel / LENGTH) * Math.cos(this.swing)
    this.swingVel *= .965
    this.swing = Math.max(-SWING_LIMIT, Math.min(SWING_LIMIT, this.swing + this.swingVel))

    // The surface wants to sit level against gravity plus the hand's pull, seen from inside the flask.
    const slope = Math.tan((this.swing - Math.atan2(accel, GRAVITY)) * FORCE)
    for (let i = 0; i < COLUMNS; i++) this.level[i] = slope * (X0 + (i + .5) * DX - 160)
    const h = this.heights, u = this.flow, level = this.level
    for (let s = 0; s < 4; s++) {
      for (let j = 1; j < COLUMNS; j++) u[j] = (u[j] - WAVE * ((h[j] - level[j]) - (h[j - 1] - level[j - 1]))) * WAVE_DAMP
      for (let i = 0; i < COLUMNS; i++) h[i] -= WAVE * (u[i + 1] - u[i])
    }
    for (let i = 1; i < COLUMNS - 1; i++) h[i] += (h[i - 1] + h[i + 1] - 2 * h[i]) * .08

    let stir = 0
    for (let j = 1; j < COLUMNS; j++) stir += Math.abs(u[j])
    this.energy += (Math.min(1, stir * .016 + Math.abs(this.swingVel) * 6 + this.boost * .2) - this.energy) * .06
  }

  /** Liquid velocity at a point: the slosh flow plus a slow swirl that grows with agitation. */
  private velocity(x: number, y: number): [number, number] {
    const c = Math.max(0, Math.min(COLUMNS - 1, Math.floor((x - X0) / DX)))
    const depth = Math.max(0, BOTTOM - y)
    let vx = (this.flow[c] + this.flow[c + 1]) * .35
    let vy = (this.flow[c + 1] - this.flow[c]) / DX * depth * .5
    const swirl = this.energy * 34
    const t = this.time
    const p1 = x * .045 + t * .6, q1 = y * .05 - t * .4, p2 = x * .09 - t * .8 + y * .03
    vx += (Math.sin(p1) * Math.cos(q1) * .05 + .5 * Math.cos(p2) * .03) * swirl
    vy -= (Math.cos(p1) * Math.sin(q1) * .045 + .5 * Math.cos(p2) * .09) * swirl
    // Capped so a violent jerk stirs the liquid rather than teleporting the colours across it.
    const speed = Math.hypot(vx, vy)
    return speed > 4 ? [vx / speed * 4, vy / speed * 4] : [vx, vy]
  }

  private sample(x: number, y: number, channel: number) {
    x = Math.max(0, Math.min(GRID_W - 1.001, x))
    y = Math.max(0, Math.min(this.gridH - 1.001, y))
    const i = x | 0, j = y | 0, fx = x - i, fy = y - j
    const k00 = (j * GRID_W + i) * 3 + channel, k01 = k00 + GRID_W * 3
    const d = this.dye
    return (d[k00] * (1 - fx) + d[k00 + 3] * fx) * (1 - fy) + (d[k01] * (1 - fx) + d[k01 + 3] * fx) * fy
  }

  /** Carries the colours along the flow, then lets neighbours bleed into each other. */
  private mix() {
    if (this.energy < .01) return
    const src = this.scratch, dye = this.dye
    for (let j = 0; j < this.gridH; j++) {
      const y = this.gridTop + (j + .5) * CELL
      for (let i = 0; i < GRID_W; i++) {
        const [vx, vy] = this.velocity(X0 + (i + .5) * CELL, y)
        const k = (j * GRID_W + i) * 3
        for (let ch = 0; ch < 3; ch++) src[k + ch] = this.sample(i - vx / CELL, j - vy / CELL, ch)
      }
    }
    const bleed = .035 * this.energy
    const row = GRID_W * 3
    for (let j = 0; j < this.gridH; j++) for (let i = 0; i < GRID_W; i++) {
      const k = (j * GRID_W + i) * 3
      for (let ch = 0; ch < 3; ch++) {
        const v = src[k + ch]
        const l = i > 0 ? src[k - 3 + ch] : v, r = i < GRID_W - 1 ? src[k + 3 + ch] : v
        const up = j > 0 ? src[k - row + ch] : v, down = j < this.gridH - 1 ? src[k + row + ch] : v
        dye[k + ch] = v + bleed * (l + r + up + down - 4 * v)
      }
    }
    for (const note of this.notes) {
      const [vx, vy] = this.velocity(note.x, note.y)
      note.x += vx * .6 + (note.restX - note.x) * .02
      note.y += vy * .6 + (note.restY - note.y) * .02
    }
    this.mixed = Math.max(this.mixed, 1 - this.spread() / this.initialSpread)
  }

  /** Average distance of each cell's colour from the mean colour. */
  private spread() {
    const d = this.dye, n = d.length / 3
    let r = 0, g = 0, b = 0
    for (let k = 0; k < d.length; k += 3) { r += d[k]; g += d[k + 1]; b += d[k + 2] }
    r /= n; g /= n; b /= n
    let total = 0
    for (let k = 0; k < d.length; k += 3) total += Math.hypot(d[k] - r, d[k + 1] - g, d[k + 2] - b)
    return total / n
  }

  /** Surface height (flask space) under each column. */
  surfaceY(column: number) { return this.liquidTop - this.heights[Math.max(0, Math.min(COLUMNS - 1, column))] }
  static readonly columns = COLUMNS
  static columnX(column: number) { return X0 + (column + .5) * DX }
  static readonly gridX = X0
  static readonly gridW = GRID_W
  static readonly cell = CELL
}
