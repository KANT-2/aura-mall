import assert from "node:assert/strict";
import { test } from "node:test";
import { atelierReducer, initialAtelierState, percentages, stageRatiosForNames } from "../lib/aura/atelier";
import { blendReducer, initialBlendState, manualStir } from "../lib/aura/blending";
import { createAtelierStore } from "../lib/aura/atelier-store";
import { detectShake, initialShakeTracker, motionSample, shakePose } from "../lib/aura/motion";
import { restoreRecipes, totalCount } from "../lib/aura/recipes";

const selecting = () => atelierReducer(initialAtelierState(), { type: "select" });
const composed = () => atelierReducer(selecting(), { type: "add", id: "bergamot" });

test("sequential additions cannot exceed 20 drops, even when the UI batches rapid events", () => {
  let state = selecting();
  for (let index = 0; index < 40; index++) state = atelierReducer(state, { type: "add", id: "rose" });
  assert.equal(totalCount(state.counts), 20);
  assert.equal(state.drop, 20);
  assert.equal(atelierReducer(state, { type: "add", id: "bergamot" }), state);
});

test("unknown ingredients and additions outside editing cannot change a composition", () => {
  const initial = initialAtelierState();
  assert.equal(atelierReducer(initial, { type: "add", id: "rose" }), initial);
  const state = composed();
  for (const id of ["unknown", "__proto__", "constructor", "toString"]) {
    for (const type of ["add", "decrease", "remove"] as const) assert.equal(atelierReducer(state, { type, id }), state);
  }
});

test("decreasing the last drop removes the ingredient and edits invalidate confirmations", () => {
  const saved = { ...composed(), saved: true, cartAdded: true };
  const changed = atelierReducer(saved, { type: "decrease", id: "bergamot" });
  assert.deepEqual(changed.counts, {});
  assert.equal(changed.saved, false);
  assert.equal(changed.cartAdded, false);
  for (const action of [{ type: "name", value: "새 이름" }, { type: "label", value: "paper" }] as const) {
    const next = atelierReducer(saved, action);
    assert.equal(next.saved, false);
    assert.equal(next.cartAdded, false);
  }
});

test("result requires a completed blend and a nonempty composition", () => {
  const state = composed();
  assert.equal(atelierReducer(state, { type: "finish", complete: false }), state);
  assert.equal(atelierReducer(initialAtelierState(), { type: "finish", complete: true }).step, "entry");
  const result = atelierReducer(state, { type: "finish", complete: true });
  assert.equal(result.step, "result");
  assert.equal(atelierReducer(result, { type: "add", id: "rose" }), result);
  const editing = atelierReducer({ ...result, saved: true }, { type: "edit" });
  assert.equal(editing.step, "select");
  assert.equal(editing.saved, false);
  assert.deepEqual(editing.counts, state.counts);
});

test("recipe restoration preserves parent lineage while reset removes it", () => {
  const [parent] = restoreRecipes([{ id: "parent", name: "원본", counts: { rose: 3 }, version: 2 }]);
  const state = atelierReducer(selecting(), { type: "restore", draft: { ...parent, step: "result" }, parent });
  assert.equal(state.step, "select");
  assert.equal(state.parent?.version, 2);
  assert.equal(state.saved, false);
  assert.deepEqual(atelierReducer(state, { type: "reset" }), initialAtelierState());
  const cleared = atelierReducer(state, { type: "clear" });
  assert.deepEqual(cleared.counts, {});
  assert.equal(cleared.name, parent.name);
  assert.equal(cleared.drop, 0);
});

test("invalid draft restoration leaves the current composition intact", () => {
  const state = composed();
  assert.equal(atelierReducer(state, { type: "restore", draft: { counts: { unknown: 1 }, name: "", label: "classic", step: "result" } }), state);
});

test("percentages total exactly 100 with deterministic rounding and stage grouping", () => {
  assert.deepEqual(percentages({}), {});
  assert.deepEqual(percentages({ a: 1, b: 1, c: 1 }), { a: 34, b: 33, c: 33 });
  const samples: Record<string, number>[] = [{ rose: 1, bergamot: 19 }, { a: 2, b: 3, c: 4 }, { a: 1, b: 0 }];
  for (const counts of samples) {
    assert.equal(Object.values(percentages(counts)).reduce((sum, n) => sum + n, 0), 100);
  }
  assert.equal(stageRatiosForNames({ bergamot: 3 }), "fresh");
  assert.equal(stageRatiosForNames({ rose: 3 }), "soft");
  assert.equal(stageRatiosForNames({ sandalwood: 3 }), "warm");
});

test("blend progress only accepts the current source and finishes exactly at 100", () => {
  assert.equal(blendReducer(initialBlendState, { type: "advance", source: "auto", amount: 1 }), initialBlendState);
  let state = blendReducer(initialBlendState, { type: "mode", mode: "auto" });
  const automatic = state;
  assert.equal(blendReducer(state, { type: "advance", source: "shake", amount: 9 }), state);
  for (let index = 0; index < 150; index++) state = blendReducer(state, { type: "advance", source: "auto", amount: 1 });
  assert.deepEqual(state, { progress: 100, mode: "done" });
  assert.equal(blendReducer(state, { type: "mode", mode: "manual" }), state);
  assert.equal(blendReducer(automatic, { type: "advance", source: "auto", amount: Infinity }), automatic);
  assert.deepEqual(blendReducer(state, { type: "reset" }), initialBlendState);
});

test("manual clicks and tiny movements cannot advance progress; large jumps stay bounded", () => {
  assert.equal(manualStir(0, 100), null);
  assert.equal(manualStir(2, 100), null);
  assert.equal(manualStir(NaN, 100), null);
  assert.deepEqual(manualStir(10000, 1), { progress: 1.4, energy: .85 });
});

test("sensor samples discard null and nonfinite data, with a gravity fallback", () => {
  assert.equal(motionSample(null, null), null);
  assert.equal(motionSample({ x: null, y: null, z: null }, null), null);
  assert.equal(motionSample({ x: Infinity, y: 0, z: 0 }, null), null);
  assert.deepEqual(motionSample(null, { x: 0, y: 0, z: 9.81 }), { magnitude: 0, x: 0, y: 0 });
  assert.deepEqual(motionSample({ x: 3, y: 4, z: 0 }, null), { magnitude: 5, x: 3, y: 4 });
});

test("one shake peak never progresses and separated peaks expire", () => {
  const sample = { magnitude: 10, x: 10, y: 0 };
  const first = detectShake(initialShakeTracker(), sample, 1200);
  assert.equal(first.progress, 0);
  const second = detectShake(first.tracker, sample, 1700);
  assert(second.progress > 0 && second.progress <= 9);
  assert.equal(detectShake(second.tracker, sample, 1800).progress, 0);
  assert.equal(detectShake(first.tracker, sample, 2400).progress, 0);
});

test("still sensor samples do not mix and shake visuals stay bounded", () => {
  let tracker = initialShakeTracker();
  for (let time = 0; time <= 10000; time += 500) {
    const result = detectShake(tracker, { magnitude: 0, x: 0, y: 0 }, time);
    assert.equal(result.progress, 0);
    tracker = result.tracker;
  }
  assert.deepEqual(shakePose({ magnitude: 100, x: 100, y: -100 }), { tilt: 12, wave: -14, energy: 1 });
});

test("draft storage preserves valid drafts and ignores corrupt or unavailable storage", () => {
  const values = new Map<string, string>();
  const store = createAtelierStore(() => ({ getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); }, removeItem: key => { values.delete(key); } }));
  assert.equal(store.load(), null);
  store.save({ counts: { rose: 2 }, name: "향", label: "paper", step: "result" });
  assert.equal(store.load()?.step, "result");
  store.clear();
  assert.equal(store.load(), null);
  values.set("aura_atelier_draft_v2", "not json");
  assert.equal(store.load(), null);
  const blocked = createAtelierStore(() => { throw Error("Storage unavailable"); });
  assert.equal(blocked.load(), null);
  assert.doesNotThrow(() => blocked.save({ counts: { rose: 2 }, name: "", label: "classic", step: "select" }));
  assert.doesNotThrow(() => blocked.clear());
});
