import test from "node:test";
import assert from "node:assert/strict";
import { createTimerState, reconcileTimer, beginTimer, holdTimer, resetTimerState } from "../src/services/focus-timer.js";

test("timer presets and custom duration are bounded", () => {
  assert.equal(createTimerState({ mode: "focus", now: 100 }).durationMs, 25 * 60_000);
  assert.equal(createTimerState({ mode: "shortBreak", now: 100 }).durationMs, 5 * 60_000);
  assert.equal(createTimerState({ mode: "longBreak", now: 100 }).durationMs, 15 * 60_000);
  assert.equal(createTimerState({ mode: "custom", minutes: 240, now: 100 }).durationMs, 180 * 60_000);
});

test("timer reconciliation handles suspension and completion from stored deadline", () => {
  const running = { status: "running", endAt: 5000, remainingMs: 3000, mode: "focus" };
  assert.equal(reconcileTimer(running, 3000).remainingMs, 2000);
  const completed = reconcileTimer(running, 5000);
  assert.equal(completed.status, "complete");
  assert.equal(completed.remainingMs, 0);
});

test("timer can start, pause, resume, and reset from deterministic states", () => {
  const initial = createTimerState({ mode: "custom", minutes: 2, now: 100 });
  const running = beginTimer(initial, 1000);
  assert.equal(running.endAt, 121000);
  const paused = holdTimer(running, 21000);
  assert.equal(paused.status, "paused");
  assert.equal(paused.remainingMs, 100000);
  const resumed = beginTimer(paused, 30000);
  assert.equal(resumed.endAt, 130000);
  const reset = resetTimerState(resumed, 40000);
  assert.equal(reset.status, "idle");
  assert.equal(reset.remainingMs, 120000);
});
