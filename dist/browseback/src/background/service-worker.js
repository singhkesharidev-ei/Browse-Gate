const TIMER_ALARM = "browseback-focus-timer";
async function reconcileFocusAlarm() {
  const { focusTimer } = await chrome.storage.local.get("focusTimer");
  if (!focusTimer || focusTimer.status !== "running") return;
  const remainingMs = focusTimer.endAt - Date.now();
  if (remainingMs > 0) { await chrome.alarms.create(TIMER_ALARM, { when: focusTimer.endAt }); return; }
  const completed = { ...focusTimer, status: "complete", remainingMs: 0, endAt: 0, completedAt: Date.now() };
  await chrome.storage.local.set({ focusTimer: completed });
  try { const label = focusTimer.mode === "focus" ? "Focus" : focusTimer.mode === "shortBreak" ? "Short break" : focusTimer.mode === "longBreak" ? "Long break" : "Custom"; await chrome.notifications.create("browseback-focus-complete", { type: "basic", iconUrl: chrome.runtime.getURL("src/icons/browsegate-128.png"), title: "BrowseGate timer complete", message: `${label} timer finished.` }); } catch { /* The side panel shows completion even without notifications. */ }
}
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === TIMER_ALARM) reconcileFocusAlarm().catch(() => {});
});
chrome.runtime.onInstalled.addListener(() => { reconcileFocusAlarm().catch(() => {}); });
chrome.runtime.onStartup.addListener(() => { reconcileFocusAlarm().catch(() => {}); });
