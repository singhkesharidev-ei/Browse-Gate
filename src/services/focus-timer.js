const ALARM_NAME = "browseback-focus-timer";
const PRESETS = { focus: 25, shortBreak: 5, longBreak: 15 };

export function createTimerState({ mode = "focus", minutes = PRESETS[mode] || 25, now = Date.now() } = {}) {
  const durationMs = Math.max(1, Math.min(180, Number(minutes) || 25)) * 60_000;
  return { mode, durationMs, remainingMs: durationMs, status: "idle", endAt: 0, updatedAt: now };
}

export function reconcileTimer(timer, now = Date.now()) {
  if (!timer || timer.status !== "running" || !timer.endAt) return timer || createTimerState({ now });
  const remainingMs = Math.max(0, timer.endAt - now);
  return remainingMs ? { ...timer, remainingMs } : { ...timer, remainingMs: 0, status: "complete", endAt: 0, completedAt: now };
}

export function beginTimer(timer, now = Date.now()) {
  const remainingMs = timer.status === "idle" || timer.status === "complete" ? timer.durationMs : timer.remainingMs;
  return { ...timer, remainingMs, status: "running", endAt: now + remainingMs, completedAt: 0 };
}
export function holdTimer(timer, now = Date.now()) {
  const current = reconcileTimer(timer, now);
  return { ...current, status: current.status === "complete" ? "complete" : "paused", remainingMs: current.remainingMs, endAt: 0 };
}
export function resetTimerState(timer, now = Date.now()) { return createTimerState({ mode: timer.mode, minutes: timer.durationMs / 60_000, now }); }

export async function loadTimer() {
  const result = await chrome.storage.local.get("focusTimer");
  const timer = reconcileTimer(result.focusTimer);
  await chrome.storage.local.set({ focusTimer: timer });
  if (timer.status === "running") await chrome.alarms.create(ALARM_NAME, { when: timer.endAt }); else await chrome.alarms.clear(ALARM_NAME);
  return timer;
}

export async function saveTimer(timer) {
  const normalized = { ...timer, updatedAt: Date.now() };
  if (normalized.status === "running") await chrome.alarms.create(ALARM_NAME, { when: normalized.endAt }); else await chrome.alarms.clear(ALARM_NAME);
  await chrome.storage.local.set({ focusTimer: normalized });
  return normalized;
}

export async function startTimer(timer) { return saveTimer(beginTimer(timer)); }
export async function pauseTimer(timer) { return saveTimer(holdTimer(timer)); }
export async function resetTimer(timer) { return saveTimer(resetTimerState(timer)); }
export async function setTimerMode(mode, customMinutes) { return saveTimer(createTimerState({ mode, minutes: customMinutes || PRESETS[mode] })); }
