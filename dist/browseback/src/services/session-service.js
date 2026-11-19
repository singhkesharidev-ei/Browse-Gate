import { abortTransaction, getAll, requestValue, transact } from "../core/database.js";
import { BrowseGateError } from "../core/errors.js";
import { normalizeUrl } from "./url-service.js";

const createId = () => crypto.randomUUID();
const clean = (value) => String(value ?? "").trim();

export async function captureWindowTabs() {
  let tabs;
  try { tabs = await chrome.tabs.query({ currentWindow: true }); }
  catch (error) { throw new BrowseGateError("BrowseGate could not read tabs in this window.", { cause: error, code: "TABS_READ_FAILED" }); }
  return (tabs || []).map((tab) => {
    const url = tab.url || "";
    let restricted = false;
    try { normalizeUrl(url); } catch { restricted = true; }
    return { url, title: tab.title || "Untitled page", faviconUrl: tab.favIconUrl || "", restricted, active: Boolean(tab.active), tabId: tab.id };
  });
}

export async function listSessions(query = "", workspaceId = "") {
  const sessions = await getAll("sessions");
  const term = clean(query).toLocaleLowerCase();
  return sessions.filter((session) => (!term || `${session.name} ${session.description} ${session.notes} ${(session.tags || []).join(" ")} ${session.tabs.map((tab) => `${tab.title} ${tab.url}`).join(" ")}`.toLocaleLowerCase().includes(term))
    && (!workspaceId || session.workspaceId === workspaceId))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getSession(id) {
  return transact(["sessions"], "readonly", (tx) => requestValue(tx.objectStore("sessions").get(id)));
}

export async function saveSession(draft) {
  const name = clean(draft.name);
  if (!name) throw new BrowseGateError("Enter a name for this session.", { code: "INVALID_SESSION_NAME" });
  if (name.length > 100) throw new BrowseGateError("Session names must be 100 characters or fewer.", { code: "INVALID_SESSION_NAME" });
  const description = clean(draft.description);
  if (description.length > 500) throw new BrowseGateError("Session descriptions must be 500 characters or fewer.", { code: "INVALID_SESSION_DESCRIPTION" });
  const tabs = (draft.tabs || []).map((tab) => {
    normalizeUrl(tab.url);
    const url = String(tab.url).trim();
    if (url.length > 8192) throw new BrowseGateError("A tab URL is too long to save in a session.", { code: "INVALID_TAB_URL" });
    return { url, title: clean(tab.title).slice(0, 500) || url, faviconUrl: /^https?:\/\//i.test(tab.faviconUrl || "") ? tab.faviconUrl.slice(0, 3000) : "" };
  });
  if (!tabs.length) throw new BrowseGateError("Select at least one eligible HTTP or HTTPS tab.", { code: "EMPTY_SESSION" });
  if (tabs.length > 500) throw new BrowseGateError("A session can contain at most 500 tabs. Select fewer tabs and try again.", { code: "SESSION_TOO_MANY_TABS" });
  const now = Date.now();
  const workspaceId = String(draft.workspaceId || "");
  return transact(["sessions", "workspaces"], "readwrite", (tx, setResult) => {
    const store = tx.objectStore("sessions");
    const previousRequest = draft.id ? store.get(draft.id) : null;
    const put = (previous) => {
      const session = { id: draft.id || createId(), name, description, createdAt: previous?.createdAt ?? now, updatedAt: now,
        workspaceId, tabs, notes: clean(draft.notes).slice(0, 2000), tags: Array.isArray(draft.tags) ? [...new Set(draft.tags.map((tag) => clean(tag).slice(0, 80)).filter(Boolean))].slice(0, 20) : [] };
      store.put(session); setResult(session);
    };
    const total = Number(Boolean(workspaceId)) + Number(Boolean(previousRequest)); let checked = 0; let error = "";
    const done = () => { if (++checked !== total) return; if (error) abortTransaction(tx, new BrowseGateError(error, { code: "SESSION_REFERENCE_NOT_FOUND" })); else put(previousRequest?.result || null); };
    if (workspaceId) { const workspaceRequest = tx.objectStore("workspaces").get(workspaceId); workspaceRequest.onsuccess = () => { if (!workspaceRequest.result) error = "The selected workspace no longer exists. Refresh and try again."; done(); }; }
    if (previousRequest) previousRequest.onsuccess = () => { if (!previousRequest.result) error = "This saved session no longer exists. Refresh and try again."; done(); };
    if (!total) put(null);
  });
}

export async function deleteSession(id) { return transact(["sessions"], "readwrite", (tx) => tx.objectStore("sessions").delete(id)); }
