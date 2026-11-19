import { initializeDatabase, preferences } from "../core/database.js";
import { readableError } from "../core/errors.js";
import { listWorkspaces, getWorkspace, saveWorkspace, toggleFavorite, deleteWorkspace } from "../services/workspace-service.js";
import { listSources, findSourceByUrl, saveSource, addSourceToWorkspace, removeSourceFromWorkspace, deleteSource, updateSourceNote, updateSourceMetadata, saveCitation } from "../services/source-service.js";
import { listNotes, saveNote, deleteNote, toggleNotePin, getNote } from "../services/notes-service.js";
import { searchSavedData } from "../services/search-service.js";
import { inspectActivePage } from "../services/quick-save.js";
import { searchHistory } from "../services/history-service.js";
import { captureWindowTabs, listSessions, getSession, saveSession, deleteSession } from "../services/session-service.js";
import { normalizeUrl } from "../services/url-service.js";
import { formatCitation, metadataFromSource } from "../services/citation-service.js";
import { buildWorkspaceExport, downloadLocalFile } from "../services/export-service.js";
import { analyzeText } from "../services/text-analysis.js";
import { loadTimer, startTimer, pauseTimer, resetTimer, setTimerMode, reconcileTimer, saveTimer } from "../services/focus-timer.js";
import { listReadingItems, markForReading, updateReadingItem, removeReadingItem } from "../services/reading-list-service.js";
import { loadAnalytics, buildInsights, buildHomePreview } from "../services/analytics-service.js";

const content = document.querySelector("#content");
const dialogRoot = document.querySelector("#dialog-root");
const status = document.querySelector("#status-banner");
const searchInput = document.querySelector("#global-search");
const navItems = [...document.querySelectorAll(".nav-item")];
const views = { tools: ["SMALL UTILITIES", "Tools", "Local tools for research and focused work."], insights: ["YOUR ACTIVITY", "Insights", "Real Chrome History and BrowseGate data, calculated on this device."], settings: ["PREFERENCES", "Settings", "Your research data stays in local browser storage."] };

const state = { route: "home", workspaceId: "", workspaceQuery: "", sourceQuery: "", librarySourceQuery: "", notesQuery: "", globalQuery: "", searchScope: "all", historyQuery: "", historyDomain: "", historyRange: "month", historySort: "recent", historyLoading: false, historyError: "", historyResults: [], sessionQuery: "", readingQuery: "", readingStatus: "all", readingSort: "newest", activeDraft: null, saveTimer: null, saving: false, hasError: false, pendingHistory: null, pendingTabs: [], restoring: new Set(), lastRestore: new Map(), toolPage: "", timer: null, timerInterval: null, citationResult: null, analyticsRange: "week", analyticsStart: "", analyticsEnd: "" };
const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const dateText = (timestamp) => timestamp ? new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(timestamp)) : "";
const preview = (value, length = 120) => String(value || "").trim().slice(0, length);
const section = (title, action = "", label = "") => `<div class="list-section-head"><h2>${escapeHtml(title)}</h2>${action ? `<button class="text-button" data-action="${action}">${escapeHtml(label)}</button>` : ""}</div>`;

function setStatus(message, error = false) {
  status.textContent = message;
  status.hidden = !message;
  status.classList.toggle("is-error", error);
}

function setRoute(route, workspaceId = "") {
  state.route = route;
  if (route !== "tools") clearInterval(state.timerInterval);
  state.globalQuery = "";
  searchInput.value = "";
  if (workspaceId) state.workspaceId = workspaceId;
  navItems.forEach((item) => {
    const active = item.dataset.view === (route.startsWith("workspace") ? "research" : route === "note-editor" ? "notes" : route);
    item.classList.toggle("is-active", active);
    if (active) item.setAttribute("aria-current", "page"); else item.removeAttribute("aria-current");
  });
  setStatus("");
  return render().catch((error) => setStatus(readableError(error), true));
}

function workspaceCard(workspace) {
  return `<article class="workspace-card"><button type="button" class="item-main action-main" data-action="open-workspace" data-id="${escapeHtml(workspace.id)}"><span class="item-title">${escapeHtml(workspace.name)}</span><span class="item-subtitle">${escapeHtml(workspace.description || "No description")}</span><span class="item-meta"><span>${workspace.sourceCount} source${workspace.sourceCount === 1 ? "" : "s"}</span><span>${workspace.noteCount} note${workspace.noteCount === 1 ? "" : "s"}</span><span>Updated ${dateText(workspace.updatedAt)}</span></span></button><div class="card-actions"><button class="icon-action" title="${workspace.isFavorite ? "Remove favorite" : "Add favorite"}" aria-label="${workspace.isFavorite ? "Remove favorite" : "Add favorite"}" data-action="favorite-workspace" data-id="${escapeHtml(workspace.id)}">${workspace.isFavorite ? "★" : "☆"}</button><button class="icon-action" title="Edit workspace" aria-label="Edit workspace" data-action="edit-workspace" data-id="${escapeHtml(workspace.id)}">•••</button></div></article>`;
}

function sourceCard(source, workspaceId = "") {
  const icon = source.faviconUrl ? `<img class="favicon" src="${escapeHtml(source.faviconUrl)}" alt="" referrerpolicy="no-referrer">` : `<span class="favicon-fallback" aria-hidden="true">↗</span>`;
  const relatedNotes = (source.relatedNotes || []).map((note) => `<p class="source-note"><strong>${escapeHtml(note.title)}</strong><br>${escapeHtml(note.body)}</p>`).join("");
  return `<article class="source-card" data-source-id="${escapeHtml(source.id)}">${icon}<div class="item-main"><span class="item-title">${escapeHtml(source.title)}</span><span class="item-subtitle">${escapeHtml(source.domain)} · ${escapeHtml(source.url)}</span><span class="item-meta"><span>Saved ${dateText(source.savedAt)}</span>${source.note || relatedNotes ? `<span>${source.relatedNotes?.length ? `${source.relatedNotes.length} related note${source.relatedNotes.length === 1 ? "" : "s"}` : "Has page note"}</span>` : ""}</span></div>${source.note ? `<p class="source-note">${escapeHtml(source.note)}</p>` : ""}${relatedNotes}<div class="card-actions"><button class="button small" data-action="open-source" data-id="${escapeHtml(source.id)}">Open page</button><button class="button small" data-action="edit-source-note" data-id="${escapeHtml(source.id)}">${source.note ? "Edit page note" : "Add page note"}</button><button class="button small" data-action="reading-add" data-id="${escapeHtml(source.id)}">Read later</button><button class="button small" data-action="citation-source" data-id="${escapeHtml(source.id)}">Create citation</button>${workspaceId ? `<button class="button small" data-action="remove-source" data-id="${escapeHtml(source.id)}" data-workspace="${escapeHtml(workspaceId)}">Remove from workspace</button>` : ""}<button class="icon-action" title="Move or add to a workspace" aria-label="Move or add to a workspace" data-action="move-source" data-id="${escapeHtml(source.id)}">↗</button><button class="icon-action" title="Delete saved source" aria-label="Delete saved source" data-action="delete-source" data-id="${escapeHtml(source.id)}">×</button></div></article>`;
}

function noteCard(note) {
  return `<article class="note-card"><button type="button" class="item-main action-main" data-action="edit-note" data-id="${escapeHtml(note.id)}"><span class="item-title">${note.pinned ? "★ " : ""}${escapeHtml(note.title)}</span><span class="note-preview">${escapeHtml(preview(note.body, 180))}</span><span class="item-meta"><span>Updated ${dateText(note.updatedAt)}</span>${note.relatedSource ? `<span>Related: ${escapeHtml(note.relatedSource.title)}</span>` : ""}</span></button><div class="card-actions">${note.relatedSource ? `<button class="button small" data-action="open-source" data-id="${escapeHtml(note.relatedSource.id)}">Open source</button>` : ""}<button class="icon-action" title="${note.pinned ? "Unpin note" : "Pin note"}" aria-label="${note.pinned ? "Unpin note" : "Pin note"}" data-action="pin-note" data-id="${escapeHtml(note.id)}">${note.pinned ? "★" : "☆"}</button><button class="icon-action" title="Delete note" aria-label="Delete note" data-action="delete-note" data-id="${escapeHtml(note.id)}">×</button></div></article>`;
}

function sessionCard(session, workspaceName = "") {
  return `<article class="workspace-card"><div class="item-main"><span class="item-title">${escapeHtml(session.name)}</span><span class="item-subtitle">${escapeHtml(session.description || "Saved browser session")}</span><span class="item-meta"><span>${session.tabs.length} tab${session.tabs.length === 1 ? "" : "s"}</span><span>${workspaceName ? `Workspace: ${escapeHtml(workspaceName)}` : "No workspace"}</span><span>Updated ${dateText(session.updatedAt)}</span></span></div><div class="card-actions"><button class="button small" data-action="preview-session" data-id="${escapeHtml(session.id)}">Preview session</button><button class="icon-action" title="Edit session" aria-label="Edit session" data-action="edit-session" data-id="${escapeHtml(session.id)}">•••</button><button class="icon-action" title="Delete session" aria-label="Delete session" data-action="delete-session" data-id="${escapeHtml(session.id)}">×</button></div></article>`;
}

function historyCard(entry, savedSource = null) {
  const lastVisit = entry.lastVisitTime ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(entry.lastVisitTime)) : "Visit time unavailable";
  return `<article class="history-result"><div class="history-result-main"><span class="item-title">${escapeHtml(entry.title || "Untitled page")}</span><span class="item-subtitle">${escapeHtml(entry.domain || "Unknown domain")} · ${escapeHtml(entry.url)}</span><span class="item-meta"><span>Last visited ${escapeHtml(lastVisit)}</span><span>${entry.visitCount} visit${entry.visitCount === 1 ? "" : "s"}</span>${entry.typedCount ? `<span>${entry.typedCount} typed visit${entry.typedCount === 1 ? "" : "s"}</span>` : ""}${savedSource ? `<span>Saved in BrowseGate</span>` : ""}</span></div><div class="card-actions"><button class="button small" data-action="open-history" data-url="${escapeHtml(entry.url)}">Open page</button>${savedSource ? `<button class="button small" data-action="view-source-record" data-id="${escapeHtml(savedSource.id)}">View saved</button><button class="button small" data-action="history-note" data-id="${escapeHtml(savedSource.id)}">Add note</button>` : `<button class="button small" data-action="save-history" data-url="${escapeHtml(entry.url)}" data-title="${escapeHtml(entry.title)}">Save to BrowseGate</button>`}</div></article>`;
}

function pageHeading(eyebrow, title, subtitle = "") {
  const historyPermission = title === "History" ? `<p class="field-hint">Chrome History is optional and is queried locally only for this view and Insights.</p>` : "";
  return `<div class="page-heading"><div><p class="eyebrow">${escapeHtml(eyebrow)}</p><h1 tabindex="-1">${escapeHtml(title)}</h1>${subtitle ? `<p class="intro">${escapeHtml(subtitle)}</p>` : ""}${historyPermission}</div></div>`;
}

async function renderHome() {
  const heading = pageHeading("YOUR RESEARCH SPACE", "Good browsing starts here.", "Keep useful sources, ideas, and browser context together as you work.");
  const actions = `<div class="button-row"><button class="button primary dark-theme-contrast" data-action="quick-save">＋ Quick Save</button><button class="button" data-action="save-session">▣ Save Session</button><button class="button" data-action="create-workspace">＋ Workspace</button><button class="button" data-action="create-note">＋ Note</button></div>`;
  content.innerHTML = `${heading}${actions}<section class="list-section home-insights-preview" aria-labelledby="home-insights-title"><div class="list-section-head"><h2 id="home-insights-title">Your research at a glance</h2><button class="text-button" data-action="view-all-insights">View all insights</button></div><p class="empty-inline" role="status" aria-live="polite">Loading local research metrics…</p></section>`;
  let workspaces; let sources; let notes; let sessions;
  try { [workspaces, sources, notes, sessions] = await Promise.all([listWorkspaces(), listSources(), listNotes(), listSessions()]); }
  catch {
    content.innerHTML = `${heading}${actions}<section class="list-section home-insights-preview" aria-labelledby="home-insights-title"><div class="list-section-head"><h2 id="home-insights-title">Your research at a glance</h2><button class="text-button" data-action="view-all-insights">View all insights</button></div><p class="empty-inline" role="status">Local research metrics are temporarily unavailable. Your other BrowseGate pages remain available.</p></section>`;
    return;
  }
  const recentWorkspaces = [...workspaces].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 3);
  const previewMetrics = buildHomePreview({ sources, notes });
  content.innerHTML = `${heading}${actions}
    <section class="list-section home-insights-preview" aria-labelledby="home-insights-title"><div class="list-section-head"><h2 id="home-insights-title">Your research at a glance</h2><button class="text-button" data-action="view-all-insights">View all insights</button></div><div class="metric-grid">${previewMetrics.map((metric) => `<div class="metric-card"><strong>${metric.value}</strong><span>${escapeHtml(metric.label)}</span></div>`).join("")}</div></section>
    <section class="list-section">${section("Recent workspaces", "goto-research", "All workspaces")}${recentWorkspaces.length ? `<div class="item-list">${recentWorkspaces.map(workspaceCard).join("")}</div>` : `<div class="empty-inline">No workspaces yet. Create one to group a topic, project, or task.</div>`}</section>
    <section class="list-section">${section("Recently saved", "goto-research", "All sources")}${sources.length ? `<div class="item-list">${sources.slice(0, 3).map((source) => sourceCard(source)).join("")}</div>` : `<div class="empty-inline">Save a webpage from the active tab to keep it close at hand.</div>`}</section>
    <section class="list-section">${section("Recent notes", "goto-notes", "All notes")}${notes.length ? `<div class="item-list">${notes.slice(0, 3).map(noteCard).join("")}</div>` : `<div class="empty-inline">Capture an idea or add context to a saved source.</div>`}</section>
    <section class="list-section">${section("Saved sessions", "goto-sessions", "All sessions")}${sessions.length ? `<div class="item-list">${sessions.slice(0, 3).map((session) => sessionCard(session)).join("")}</div>` : `<div class="empty-inline">Save a set of tabs to return to this browsing context later.</div>`}</section>
    <p class="privacy-note"><span class="privacy-dot"></span>Private by default <span>·</span> Stored on this device</p>`;
}

async function renderResearch() {
  if (!state.workspaceId) {
    const [workspaces, sources] = await Promise.all([listWorkspaces(state.workspaceQuery), listSources()]);
    const filteredSources = sources.filter((source) => !state.librarySourceQuery || `${source.title} ${source.domain} ${source.url} ${source.note}`.toLocaleLowerCase().includes(state.librarySourceQuery.toLocaleLowerCase()));
    preserveFocusRender(`${pageHeading("COLLECT & ORGANIZE", "Research", "Group sources and notes into focused workspaces.")}
      <div class="button-row"><button class="button primary dark-theme-contrast" data-action="create-workspace">＋ Create workspace</button><button class="button" data-action="quick-save">＋ Quick Save</button></div>
      <input class="search-input" id="workspace-search" type="search" placeholder="Filter workspaces" value="${escapeHtml(state.workspaceQuery)}" aria-label="Filter workspaces">
      <section class="list-section">${section(`Workspaces · ${workspaces.length}`)}<div class="item-list">${workspaces.length ? workspaces.map(workspaceCard).join("") : `<div class="empty-inline">${state.workspaceQuery ? "No workspaces match that search." : "Your workspaces will appear here. Create one to begin organizing research."}</div>`}</div></section>
      <section class="list-section">${section(`All saved pages · ${sources.length}`)}<input class="search-input" id="library-source-search" type="search" placeholder="Search saved pages" value="${escapeHtml(state.librarySourceQuery)}" aria-label="Search all saved pages"><div class="item-list">${filteredSources.length ? filteredSources.map((source) => sourceCard(source)).join("") : `<div class="empty-inline">${state.librarySourceQuery ? "No saved pages match that search." : "No saved pages yet. Save a webpage from the toolbar or here."}</div>`}</div></section>`);
  } else {
    const workspace = await getWorkspace(state.workspaceId);
    if (!workspace) { state.workspaceId = ""; return renderResearch(); }
    const [workspaces, sources, notes, sessions] = await Promise.all([listWorkspaces(), listSources(state.workspaceId), listNotes(), listSessions("", state.workspaceId)]);
    const relatedNotes = notes.filter((note) => note.workspaceIds?.includes(workspace.id));
    const filtered = sources.filter((source) => !state.sourceQuery || `${source.title} ${source.url} ${source.domain} ${source.note}`.toLocaleLowerCase().includes(state.sourceQuery.toLocaleLowerCase()));
    preserveFocusRender(`<button class="text-button back-link" data-action="back-workspaces">← All workspaces</button>${pageHeading("RESEARCH WORKSPACE", workspace.name, workspace.description || "No description")}
      <div class="button-row"><button class="button primary" data-action="quick-save">＋ Save current page</button><button class="button" data-action="create-note" data-workspace="${escapeHtml(workspace.id)}">＋ Add note</button><button class="button" data-action="export-workspace" data-id="${escapeHtml(workspace.id)}">⇩ Export research</button><button class="button" data-action="edit-workspace" data-id="${escapeHtml(workspace.id)}">Edit workspace</button><button class="button" data-action="favorite-workspace" data-id="${escapeHtml(workspace.id)}">${workspace.isFavorite ? "★ Remove favorite" : "☆ Add favorite"}</button></div>
      <input class="search-input" id="source-search" type="search" placeholder="Search sources in this workspace" value="${escapeHtml(state.sourceQuery)}" aria-label="Search sources in this workspace">
      <section class="list-section">${section(`Sources · ${sources.length}`)}<div class="item-list">${filtered.length ? filtered.map((source) => sourceCard(source, workspace.id)).join("") : `<div class="empty-inline">${state.sourceQuery ? "No sources match that search." : "No sources here yet. Save the current page or add a previously saved source."}</div>`}</div></section>
      <section class="list-section">${section(`Workspace notes · ${relatedNotes.length}`, "create-note", "＋ Add note")}${relatedNotes.length ? `<div class="item-list">${relatedNotes.map(noteCard).join("")}</div>` : `<div class="empty-inline">Notes you associate with this workspace will appear here.</div>`}</section>
      <section class="list-section">${section(`Saved sessions · ${sessions.length}`, "goto-sessions", "View all")}${sessions.length ? `<div class="item-list">${sessions.map((session) => sessionCard(session, workspace.name)).join("")}</div>` : `<div class="empty-inline">Saved sessions associated with this workspace will appear here.</div>`}</section>
      <section class="list-section"><button class="button danger" data-action="delete-workspace" data-id="${escapeHtml(workspace.id)}">Delete workspace</button></section>`);
  }
}

async function renderNotes() {
  const notes = await listNotes(state.notesQuery);
  if (state.route === "note-editor" && state.activeDraft) { renderNoteEditor(); return; }
  const draftCard = state.activeDraft ? `<article class="note-card"><div class="item-main"><span class="item-title">${escapeHtml(state.activeDraft.title || "Unsaved note draft")}</span><p class="note-preview">${escapeHtml(preview(state.activeDraft.body, 150) || "Continue writing your note.")}</p><span class="item-meta"><span class="${state.hasError ? "save-state is-error" : "save-state"}">${state.hasError ? "Save failed · draft kept in this panel" : state.activeDraft.id ? "Saved draft" : "Unsaved draft"}</span></span></div><button class="button small" data-action="resume-note">Continue editing</button></article>` : "";
  preserveFocusRender(`${pageHeading("QUICK NOTES", "Notes", "Save ideas on their own, in a workspace, or alongside a source.")}
    <div class="button-row"><button class="button primary dark-theme-contrast" data-action="create-note">＋ Create note</button></div>
    <input class="search-input" id="notes-search" type="search" placeholder="Search notes" value="${escapeHtml(state.notesQuery)}" aria-label="Search notes">
    ${draftCard ? `<section class="list-section">${section("Draft in progress")}<div class="item-list">${draftCard}</div></section>` : ""}
    <section class="list-section"><div class="item-list">${notes.length ? notes.map(noteCard).join("") : `<div class="empty-inline">${state.notesQuery ? "No notes match that search." : "No notes yet. Create one, or annotate a saved source."}</div>`}</div></section>`);
}

function renderNoteEditor() {
  const draft = state.activeDraft;
  content.innerHTML = `${pageHeading("QUICK NOTES", draft.id ? "Edit note" : "New note", "Changes save automatically on this device.")}
    <div class="note-editor"><div class="note-editor-head"><span class="save-state" id="note-save-state">${state.saving ? "Saving…" : state.hasError ? "Save failed. Your text is still here." : draft.id ? "Saved" : "Not saved yet"}</span><div class="card-actions"><button class="icon-action" data-action="pin-draft" aria-label="${draft.pinned ? "Unpin note" : "Pin note"}" title="${draft.pinned ? "Unpin note" : "Pin note"}">${draft.pinned ? "★" : "☆"}</button></div></div>
      <label class="form-label" for="note-title">Title</label><input class="form-control" id="note-title" maxlength="120" value="${escapeHtml(draft.title)}" placeholder="A short title">
      <label class="form-label" for="note-body">Note</label><textarea class="form-control textarea" id="note-body" maxlength="20000" placeholder="Capture an idea or why this source matters…">${escapeHtml(draft.body)}</textarea><div class="button-row"><button class="button small" data-action="paste-note">Paste text</button></div>
      <label class="form-label" for="note-workspace">Workspace</label><select class="form-control" id="note-workspace"><option value="">No workspace</option>${draft._workspaceOptions || ""}</select>
      <label class="form-label" for="note-source">Related saved source</label><select class="form-control" id="note-source"><option value="">No source</option>${draft._sourceOptions || ""}</select>
      <p class="field-hint">Notes are stored as plain text. HTML is never executed.</p>
      <div class="dialog-actions"><button class="button" data-action="copy-note">Copy text</button>${draft.id ? `<button class="button danger" data-action="delete-note" data-id="${escapeHtml(draft.id)}">Delete</button>` : ""}<button class="button primary" data-action="save-note-now">Save note</button><button class="button" data-action="close-note-editor">Done</button></div>
    </div>`;
  const workspaceSelect = document.querySelector("#note-workspace");
  if (workspaceSelect && draft.workspaceIds?.[0]) workspaceSelect.value = draft.workspaceIds[0];
  const sourceSelect = document.querySelector("#note-source");
  if (sourceSelect && draft.sourceId) sourceSelect.value = draft.sourceId;
}

async function startNote(draft = {}) {
  state.globalQuery = "";
  searchInput.value = "";
  const [workspaces, sources] = await Promise.all([listWorkspaces(), listSources()]);
  const existing = draft.id ? await getNote(draft.id) : null;
  state.activeDraft = { id: existing?.id || "", title: existing?.title || "", body: existing?.body || "", pinned: existing?.pinned || false,
    workspaceIds: draft.workspaceId ? [draft.workspaceId] : existing?.workspaceIds || [], sourceId: draft.sourceId || existing?.sourceId || "", tags: existing?.tags || [],
    _workspaceOptions: workspaces.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join(""),
    _sourceOptions: sources.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.title)}</option>`).join("") };
  state.route = "note-editor";
  state.hasError = false;
  await render();
  document.querySelector("#note-title")?.focus();
}

async function renderSearch(query) {
  const results = await searchSavedData(query, state.searchScope);
  let history = [];
  const hasHistoryPermission = state.searchScope === "history" ? await chrome.permissions.contains({ permissions: ["history"] }) : true;
  if (state.searchScope === "history" && hasHistoryPermission) history = await searchHistory({ query, range: state.historyRange, sort: state.historySort, limit: 150 });
  const sources = state.searchScope === "history" ? await listSources() : [];
  const groups = [];
  const resultButton = (action, id, title, subtitle, badge = "") => `<article class="result-card"><button class="search-result-button" data-action="${action}" data-id="${escapeHtml(id || "")}" aria-label="${escapeHtml(title)}"><span class="item-title">${escapeHtml(title)}</span><span class="item-subtitle">${escapeHtml(subtitle)}</span>${badge ? `<span class="item-meta">${escapeHtml(badge)}</span>` : ""}</button></article>`;
  if (state.searchScope === "all" || state.searchScope === "saved") groups.push(["Saved pages", results.sources, (item) => resultButton("open-source", item.id, item.title, `${item.domain} · ${item.url}`, `Saved ${dateText(item.savedAt)}`)]);
  if (state.searchScope === "all" || state.searchScope === "notes") groups.push(["Notes", results.notes, (item) => resultButton("edit-note", item.id, item.title, preview(item.body, 140), item.relatedSource?.title ? `Related source: ${item.relatedSource.title}` : "Note")]);
  if (state.searchScope === "all" || state.searchScope === "workspaces") groups.push(["Workspaces", results.workspaces, (item) => resultButton("open-workspace", item.id, item.name, item.description || "Workspace", "Workspace")]);
  if (state.searchScope === "all" || state.searchScope === "sessions") groups.push(["Sessions", results.sessions, (item) => resultButton("preview-session", item.id, item.name, item.description || `${item.tabs.length} saved tabs`, `${item.tabs.length} tabs · ${dateText(item.updatedAt)}`)]);
  if (state.searchScope === "history") groups.push(["Chrome history", history, (item) => { const saved = sources.find((source) => { try { return normalizeUrl(source.url) === normalizeUrl(item.url); } catch { return false; } }); return `<article class="result-card">${historyCard(item, saved)}</article>`; }]);
  const scopeNames = [["all", "All"], ["saved", "Saved pages"], ["history", "History"], ["notes", "Notes"], ["workspaces", "Workspaces"], ["sessions", "Sessions"]];
  const controls = `<div class="search-scopes" role="group" aria-label="Search category">${scopeNames.map(([scope, label]) => `<button class="scope-button ${state.searchScope === scope ? "is-active" : ""}" data-action="search-scope" data-scope="${scope}" aria-pressed="${state.searchScope === scope}">${label}</button>`).join("")}</div>${state.searchScope === "history" ? `${!hasHistoryPermission ? `<p class="field-hint">History search reads local Chrome visit records. Grant History access to use this search; saved research search works without it.</p><button class="button" data-action="grant-history">Grant History access</button>` : `<div class="history-controls"><select id="search-history-range" class="form-control" aria-label="History date range"><option value="day" ${state.historyRange === "day" ? "selected" : ""}>Past day</option><option value="week" ${state.historyRange === "week" ? "selected" : ""}>Past week</option><option value="month" ${state.historyRange === "month" ? "selected" : ""}>Past 30 days</option><option value="quarter" ${state.historyRange === "quarter" ? "selected" : ""}>Past 90 days</option></select><select id="search-history-sort" class="form-control" aria-label="History result order"><option value="recent" ${state.historySort === "recent" ? "selected" : ""}>Most recent</option><option value="frequent" ${state.historySort === "frequent" ? "selected" : ""}>Most visited</option></select></div>`}` : ""}`;
  const count = groups.reduce((sum, [, items]) => sum + items.length, 0);
  preserveFocusRender(`${pageHeading("UNIVERSAL SEARCH", `Results for “${query}”`, "Ranked by exact title, title match, URL or domain, note content, then other metadata. History is searched only when selected.")}${controls}${count ? groups.filter(([, items]) => items.length).map(([title, items, renderItem]) => `<section class="list-section"><p class="group-label">${title} · ${items.length}</p><div class="item-list">${items.map(renderItem).join("")}</div></section>`).join("") : `<div class="empty-inline">No matches in this scope. Try another category or a shorter search.</div>`}`);
}

function preserveFocusRender(markup) {
  const active = document.activeElement;
  const id = active?.id;
  const action = active?.dataset?.action;
  const scope = active?.dataset?.scope;
  const itemId = active?.dataset?.id;
  const start = active && "selectionStart" in active ? active.selectionStart : null;
  const end = active && "selectionEnd" in active ? active.selectionEnd : null;
  content.innerHTML = markup;
  const next = id ? document.getElementById(id) : action ? [...content.querySelectorAll("[data-action]")].find((element) => element.dataset.action === action && element.dataset.scope === scope && element.dataset.id === itemId) : null;
  if (next) { next.focus(); if (start !== null && typeof next.setSelectionRange === "function") next.setSelectionRange(start, end); }
}

async function renderHistory() {
  state.historyLoading = true;
  state.historyError = "";
  const controls = `<div class="history-controls"><input id="history-query" class="search-input" type="search" placeholder="Search titles or URLs" value="${escapeHtml(state.historyQuery)}" aria-label="Search Chrome history"><input id="history-domain" class="search-input" type="search" placeholder="Filter by domain" value="${escapeHtml(state.historyDomain)}" aria-label="Filter by domain"><select id="history-range" class="form-control" aria-label="History date range"><option value="day" ${state.historyRange === "day" ? "selected" : ""}>Past day</option><option value="week" ${state.historyRange === "week" ? "selected" : ""}>Past week</option><option value="month" ${state.historyRange === "month" ? "selected" : ""}>Past 30 days</option><option value="quarter" ${state.historyRange === "quarter" ? "selected" : ""}>Past 90 days</option></select><select id="history-sort" class="form-control" aria-label="Sort history"><option value="recent" ${state.historySort === "recent" ? "selected" : ""}>Most recent</option><option value="frequent" ${state.historySort === "frequent" ? "selected" : ""}>Most visited</option></select></div>`;
    preserveFocusRender(`${pageHeading("BROWSING CONTEXT", "History", "Actual Chrome visit records. Visit counts do not measure time spent on a page.")}<div class="button-row"><button class="button" data-action="clear-history-filters">Clear filters</button><button class="button" data-action="goto-sessions">Saved sessions</button></div>${controls}<div class="empty-inline" role="status">Loading Chrome history…</div>`);
  if (!await chrome.permissions.contains({ permissions: ["history"] })) {
    state.historyLoading = false;
    preserveFocusRender(`${pageHeading("BROWSING CONTEXT", "History", "BrowseGate reads Chrome History locally only when you enable this section.")}<p class="field-hint">History access is optional. Saved pages, notes, sessions, and workspaces continue to work without it.</p><button class="button primary" data-action="grant-history">Grant History access</button>`);
    return;
  }
  try {
    const [items, sources] = await Promise.all([searchHistory({ query: state.historyQuery, domain: state.historyDomain, range: state.historyRange, sort: state.historySort, limit: 200 }), listSources()]);
    state.historyResults = items;
    state.historyLoading = false;
    const resultMarkup = items.length ? `<div class="item-list">${items.map((entry) => { const saved = sources.find((source) => { try { return normalizeUrl(source.url) === normalizeUrl(entry.url); } catch { return false; } }); return historyCard(entry, saved); }).join("")}</div>` : `<div class="empty-inline">No Chrome history entries match these filters.</div>`;
    preserveFocusRender(`${pageHeading("BROWSING CONTEXT", "History", "Actual Chrome visit records. Visit counts do not measure time spent on a page.")}<div class="button-row"><button class="button" data-action="clear-history-filters">Clear filters</button><button class="button" data-action="goto-sessions">Saved sessions</button></div>${controls}<section class="list-section"><p class="group-label">${items.length} recent result${items.length === 1 ? "" : "s"} · up to 200 per search</p>${resultMarkup}</section>`);
  } catch (error) {
    state.historyLoading = false; state.historyError = readableError(error);
    preserveFocusRender(`${pageHeading("BROWSING CONTEXT", "History", "Actual Chrome visit records. Visit counts do not measure time spent on a page.")}<div class="button-row"><button class="button" data-action="clear-history-filters">Clear filters</button></div>${controls}<div class="status-banner is-error" role="alert">${escapeHtml(state.historyError)}</div>`);
  }
}

async function renderSessions() {
  const [sessions, workspaces] = await Promise.all([listSessions(state.sessionQuery), listWorkspaces()]);
  const workspaceNames = new Map(workspaces.map((workspace) => [workspace.id, workspace.name]));
  preserveFocusRender(`${pageHeading("BROWSER CONTEXT", "Saved sessions", "Save a set of tabs and restore them later. Restoring opens new tabs and leaves your current tabs open.")}
    <div class="button-row"><button class="button primary dark-theme-contrast" data-action="save-session">＋ Save window tabs</button><button class="button" data-action="save-current-tab">＋ Save current tab</button></div>
    <input id="sessions-search" class="search-input" type="search" placeholder="Search saved sessions" value="${escapeHtml(state.sessionQuery)}" aria-label="Search saved sessions">
    <section class="list-section"><div class="item-list">${sessions.length ? sessions.map((session) => sessionCard(session, workspaceNames.get(session.workspaceId) || "")).join("") : `<div class="empty-inline">${state.sessionQuery ? "No saved sessions match that search." : "No saved sessions yet. Save the tabs in this window to return to them later."}</div>`}</div></section>`);
}

async function renderReadingList() {
  const items = await listReadingItems(state.readingQuery, state.readingStatus, state.readingSort);
  const statuses = [["all", "All"], ["unread", "Unread"], ["reading", "Reading"], ["completed", "Completed"]];
  preserveFocusRender(`${pageHeading("READING QUEUE", "Reading list", "A status and note are stored separately from each saved source.")}
    <div class="button-row"><button class="button primary dark-theme-contrast" data-action="add-current-reading">＋ Save current page for later</button></div>
    <input class="search-input" id="reading-search" type="search" value="${escapeHtml(state.readingQuery)}" placeholder="Search reading list" aria-label="Search reading list">
    <div class="search-scopes" role="group" aria-label="Reading status">${statuses.map(([key, label]) => `<button class="scope-button ${state.readingStatus === key ? "is-active" : ""}" data-action="reading-filter" data-status="${key}" aria-pressed="${state.readingStatus === key}">${label}</button>`).join("")}</div>
    <label class="form-label" for="reading-sort">Sort by date added</label><select class="form-control" id="reading-sort"><option value="newest" ${state.readingSort === "newest" ? "selected" : ""}>Newest first</option><option value="oldest" ${state.readingSort === "oldest" ? "selected" : ""}>Oldest first</option></select>
    <section class="list-section"><div class="item-list">${items.length ? items.map((item) => `<article class="workspace-card"><div class="item-main"><span class="item-title">${escapeHtml(item.source.title)}</span><span class="item-subtitle">${escapeHtml(item.source.domain)} · ${escapeHtml(item.source.url)}</span><span class="item-meta"><span>${item.status === "completed" ? "Completed" : item.status === "reading" ? "Currently reading" : "Unread"}</span><span>Added ${dateText(item.addedAt)}</span></span><label class="form-label" for="reading-note-${escapeHtml(item.sourceId)}">Personal reading note</label><textarea id="reading-note-${escapeHtml(item.sourceId)}" class="form-control textarea reading-note" data-reading-note="${escapeHtml(item.sourceId)}" placeholder="Personal reading note">${escapeHtml(item.note || "")}</textarea><div class="button-row"><button class="button small" data-action="save-reading-note" data-id="${escapeHtml(item.sourceId)}">Save note</button><button class="button small" data-action="reading-open" data-url="${escapeHtml(item.source.url)}">Open page</button><button class="button small" data-action="reading-move" data-id="${escapeHtml(item.sourceId)}">Add to workspace</button><button class="button small danger" data-action="reading-remove" data-id="${escapeHtml(item.sourceId)}">Remove</button></div></div><select class="form-control reading-status" data-id="${escapeHtml(item.sourceId)}" aria-label="Reading status"><option value="unread" ${item.status === "unread" ? "selected" : ""}>Unread</option><option value="reading" ${item.status === "reading" ? "selected" : ""}>Currently reading</option><option value="completed" ${item.status === "completed" ? "selected" : ""}>Completed</option></select></article>`).join("") : `<div class="empty-inline">${state.readingQuery || state.readingStatus !== "all" ? "No reading items match this filter." : "No reading items yet. Save a current page or add a saved page from Research."}</div>`}</div></section>`);
}

function renderTools() {
  if (!state.toolPage) {
    content.innerHTML = `${pageHeading("SMALL UTILITIES", "Tools", "Everything here runs locally in the extension.")}
      <div class="tool-grid"><button class="tool-card" data-action="tool-open" data-tool="timer"><strong>Focus timer</strong><span>25-minute focus, break presets, or a custom duration.</span></button><button class="tool-card" data-action="tool-open" data-tool="counter"><strong>Text analyzer</strong><span>Count words, characters, sentences, paragraphs, and reading time.</span></button><button class="tool-card" data-action="tool-open" data-tool="citations"><strong>Citation generator</strong><span>APA 7, MLA 9, and Chicago author-date.</span></button><button class="tool-card" data-action="goto-reading"><strong>Reading list</strong><span>Track pages as unread, in progress, or completed.</span></button></div>`;
    return;
  }
  if (state.toolPage === "counter") {
    content.innerHTML = `${pageHeading("TEXT TOOL", "Text analyzer", "All counts are calculated locally. Words are Unicode letter/number groups; reading time assumes 200 words per minute, rounded up.")}<button class="text-button back-link" data-action="tools-back">← Tools</button><label class="form-label" for="analysis-text">Text to analyze</label><textarea id="analysis-text" class="form-control textarea" rows="12" placeholder="Paste or type text here. Use the Paste button for clipboard input."></textarea><div class="button-row"><button class="button" data-action="paste-text">Paste</button><button class="button" data-action="copy-analysis">Copy text</button><button class="button" data-action="clear-analysis">Clear</button></div><div class="metric-grid" id="analysis-results" aria-live="polite"></div>`;
    updateAnalysis(); return;
  }
  if (state.toolPage === "timer") {
    state.timer ||= null;
    const timer = reconcileTimer(state.timer || {});
    const remaining = timer.status === "running" ? timer.endAt - Date.now() : timer.remainingMs;
    const minutes = Math.floor(Math.max(0, remaining) / 60000); const seconds = Math.floor((Math.max(0, remaining) % 60000) / 1000);
    content.innerHTML = `${pageHeading("FOCUS TOOL", "Focus timer", "Timer state is saved locally and recovered from its deadline after the side panel or browser wakes.")}<button class="text-button back-link" data-action="tools-back">← Tools</button><div class="timer-card"><div class="search-scopes" role="group" aria-label="Timer preset"><button class="scope-button ${timer.mode === "focus" ? "is-active" : ""}" data-action="timer-mode" data-mode="focus">Focus · 25 min</button><button class="scope-button ${timer.mode === "shortBreak" ? "is-active" : ""}" data-action="timer-mode" data-mode="shortBreak">Short break · 5 min</button><button class="scope-button ${timer.mode === "longBreak" ? "is-active" : ""}" data-action="timer-mode" data-mode="longBreak">Long break · 15 min</button></div><label class="form-label" for="custom-minutes">Custom duration · minutes</label><input id="custom-minutes" class="form-control" type="number" min="1" max="180" value="${Math.round(timer.durationMs / 60000)}"><button class="button" data-action="set-custom-timer">Set custom duration</button><div class="timer-display" id="timer-display">${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}</div><p class="intro" id="timer-status">${timer.status === "running" ? "Running" : timer.status === "paused" ? "Paused" : timer.status === "complete" ? "Complete" : "Ready"} · ${timer.mode === "focus" ? "Focus" : timer.mode === "shortBreak" ? "Short break" : timer.mode === "longBreak" ? "Long break" : "Custom"}</p><div class="button-row"><button class="button primary" data-action="timer-start" ${timer.status === "running" ? "disabled" : ""}>${timer.status === "paused" ? "Resume" : timer.status === "running" ? "Running" : "Start"}</button><button class="button" data-action="timer-pause" ${timer.status !== "running" ? "disabled" : ""}>Pause</button><button class="button" data-action="timer-reset">Reset</button></div></div>`;
    return;
  }
  renderCitationTool().catch((error) => setStatus(readableError(error), true));
}

async function renderInsights() {
  const range = state.analyticsRange;
  content.innerHTML = `<div class="insights-page">${pageHeading("YOUR ACTIVITY", "Insights", "Loading local BrowseGate data and optional Chrome History…")}<p class="empty-inline" role="status" aria-live="polite">Loading insights…</p></div>`;
  let data; let insights;
  try {
    data = await loadAnalytics(range, range === "custom" ? state.analyticsStart : undefined, range === "custom" ? state.analyticsEnd : undefined);
    const storedDismissed = await preferences.get("dismissedInsights", []);
    insights = buildInsights(data, { dismissed: Array.isArray(storedDismissed) ? storedDismissed : [] });
  } catch (error) {
    content.innerHTML = `<div class="insights-page">${pageHeading("YOUR ACTIVITY", "Insights", "Local BrowseGate data and optional Chrome History.")}<p class="empty-inline" role="alert">Insights could not be loaded. Your saved records were not changed.</p><button class="button" data-action="refresh-insights">Try again</button></div>`;
    return;
  }
  const rangeSelect = `<label class="form-label" for="insights-range">Period</label><select class="form-control" id="insights-range"><option value="today" ${range === "today" ? "selected" : ""}>Today</option><option value="week" ${range === "week" ? "selected" : ""}>Last 7 days</option><option value="month" ${range === "month" ? "selected" : ""}>Last 30 days</option><option value="custom" ${range === "custom" ? "selected" : ""}>Custom period</option></select>${range === "custom" ? `<div class="history-controls"><input class="form-control" id="insights-start" type="date" value="${escapeHtml(state.analyticsStart)}"><input class="form-control" id="insights-end" type="date" value="${escapeHtml(state.analyticsEnd)}"><button class="button" data-action="refresh-insights">Apply period</button></div>` : ""}`;
  const max = Math.max(1, ...data.daily.map((item) => item.count));
  const daily = data.daily.length ? `<div class="chart-bars" role="img" aria-label="Daily recorded browser visits">${data.daily.map((item) => `<div class="chart-bar-row"><span>${escapeHtml(item.date.slice(5))}</span><div class="chart-track"><div class="chart-fill" style="width:${Math.max(2, item.count / max * 100)}%"></div></div><strong>${item.count}</strong></div>`).join("")}</div>` : `<div class="empty-inline">No recorded visits in this period, or Chrome History is unavailable.</div>`;
  const domains = data.domains.length ? `<ol class="ranked-list">${data.domains.map((item) => `<li><span>${escapeHtml(item.domain)}</span><strong>${item.visits}</strong></li>`).join("")}</ol>` : `<div class="empty-inline">No domain visit data.</div>`;
  const cards = [[data.recordedVisitCount, "Recorded visits"], [data.uniqueUrlCount, "Unique URLs visited"], [data.uniqueDomainCount, "Unique domains"]].map(([value, label]) => `<div class="metric-card"><strong>${value}</strong><span>${label}</span></div>`).join("");
  content.innerHTML = `<div class="insights-page">${pageHeading("YOUR ACTIVITY", "Insights", "Counts come from Chrome History and your local BrowseGate records. Visits are not screen time.")}${rangeSelect}<div class="metric-grid">${cards}<div class="metric-card"><strong>${data.savedSourceCount}</strong><span>Saved sources</span></div><div class="metric-card"><strong>${data.noteCount}</strong><span>Notes</span></div><div class="metric-card"><strong>${data.sessionCount}</strong><span>Saved sessions</span></div><div class="metric-card"><strong>${data.reading.completed}/${data.reading.total}</strong><span>Reading-list complete</span></div></div>${!data.historyAvailable ? `<p class="field-hint">Chrome History could not be read. BrowseGate library counts remain available; visit analytics are shown as unavailable/empty.</p><button class="button" data-action="grant-history">Grant History access</button>` : data.historyDataLimited ? `<p class="field-hint">Visit charts are based on at most 200 recently visited URLs for performance; counts may omit less recent URLs in a busy period.</p>` : ""}<section class="list-section">${section("Daily recorded visits")}<div class="result-card">${daily}</div></section><section class="list-section">${section("Most visited domains")}<div class="result-card">${domains}</div></section><section class="list-section">${section("Frequently revisited pages")}<div class="result-card">${data.pages.some((item) => item.visits > 1) ? `<ol class="ranked-list">${data.pages.filter((item) => item.visits > 1).map((item) => `<li><span>${escapeHtml(item.title)} · ${escapeHtml(item.domain)}</span><strong>${item.visits} visits</strong></li>`).join("")}</ol>` : `<div class="empty-inline">No page had multiple recorded visits in this period.</div>`}</div></section><section class="list-section">${section("Saved sources by workspace")}<div class="result-card">${data.workspaceSources.length ? `<ol class="ranked-list">${data.workspaceSources.sort((a, b) => b.savedSources - a.savedSources).map((item) => `<li><span>${escapeHtml(item.name)} · ${item.noteCount} notes</span><strong>${item.savedSources} sources</strong></li>`).join("")}</ol>` : `<div class="empty-inline">No workspaces to report.</div>`}</div></section><section class="list-section">${section("Smart insights")}<div class="item-list">${insights.length ? insights.map((item) => `<article class="result-card"><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.reason)}</p><span class="field-hint">${escapeHtml(item.action)}</span><div class="card-actions"><button class="button small" data-action="dismiss-insight" data-id="${escapeHtml(item.id)}">Dismiss</button><button class="button small" data-action="insight-review" data-insight="${escapeHtml(item.id)}">Review</button></div></article>`).join("") : `<div class="empty-inline">No actionable insights from the available data in this period.</div>`}</div></section></div>`;
}

async function renderSettings() {
  const [history, clipboardRead, clipboardWrite] = await Promise.all([chrome.permissions.contains({ permissions: ["history"] }), chrome.permissions.contains({ permissions: ["clipboardRead"] }), chrome.permissions.contains({ permissions: ["clipboardWrite"] })]);
  content.innerHTML = `${pageHeading("PREFERENCES", "Settings", "Manage optional access and see how BrowseGate handles local data.")}<section class="list-section">${section("Optional permissions")}<div class="item-list"><article class="result-card"><strong>Chrome History · ${history ? "Enabled" : "Not enabled"}</strong><p>Used locally by History search and visit analytics. Workspaces, saved pages, notes, and sessions do not depend on it.</p><div class="card-actions">${history ? `<button class="button small" data-action="revoke-history">Revoke access</button>` : `<button class="button small" data-action="grant-history">Grant access</button>`}</div></article><article class="result-card"><strong>Clipboard · ${clipboardRead || clipboardWrite ? "Enabled" : "Not enabled"}</strong><p>Requested only after you choose Paste or Copy. If access is denied, BrowseGate offers manual text entry or selection.</p><div class="card-actions">${clipboardRead || clipboardWrite ? `<button class="button small" data-action="revoke-clipboard">Revoke clipboard access</button>` : ""}</div></article></div></section><section class="list-section">${section("Local data")}<div class="result-card"><p>Research records, notes, citations, reading status, and sessions are stored in this browser profile. JSON export is available from each workspace. There is no import workflow yet.</p><button class="button" data-action="clear-insight-dismissals">Reset dismissed insights</button></div></section>`;
}

function updateAnalysis() {
  const input = document.querySelector("#analysis-text"); const output = document.querySelector("#analysis-results"); if (!input || !output) return;
  const stats = analyzeText(input.value);
  output.innerHTML = [["Words", stats.words], ["Characters", stats.characters], ["Characters · no spaces", stats.charactersNoSpaces], ["Sentences", stats.sentences], ["Paragraphs", stats.paragraphs], ["Reading time", stats.readingMinutes ? `${stats.readingMinutes} min` : "0 min"]].map(([label, value]) => `<div class="metric-card"><strong>${value}</strong><span>${label}</span></div>`).join("");
}

async function copyText(text) {
  try {
    if (!await chrome.permissions.request({ permissions: ["clipboardWrite"] })) throw new Error("Clipboard write permission was not granted.");
    await navigator.clipboard.writeText(text);
  }
  catch {
    showDialog(`<h2>Copy manually</h2><p>Clipboard access was unavailable. Select and copy this text with Ctrl+C or ⌘C.</p><textarea class="form-control textarea" id="manual-copy" readonly></textarea><div class="dialog-actions"><button class="button primary" data-action="close-dialog">Done</button></div>`);
    const field = document.querySelector("#manual-copy"); field.value = text; field.focus(); field.select();
    return false;
  }
  return true;
}

function startTimerDisplay() {
  clearInterval(state.timerInterval);
  state.timerInterval = setInterval(async () => {
    if (state.route !== "tools" || state.toolPage !== "timer" || !state.timer) return;
    const before = state.timer.status;
    state.timer = reconcileTimer(state.timer);
    const remaining = state.timer.status === "running" ? state.timer.endAt - Date.now() : state.timer.remainingMs;
    const display = document.querySelector("#timer-display"); const label = document.querySelector("#timer-status");
    if (display) display.textContent = `${String(Math.floor(Math.max(0, remaining) / 60000)).padStart(2, "0")}:${String(Math.floor((Math.max(0, remaining) % 60000) / 1000)).padStart(2, "0")}`;
    if (label) label.textContent = `${state.timer.status === "running" ? "Running" : state.timer.status === "paused" ? "Paused" : state.timer.status === "complete" ? "Complete" : "Ready"} · ${state.timer.mode === "focus" ? "Focus" : state.timer.mode === "shortBreak" ? "Short break" : state.timer.mode === "longBreak" ? "Long break" : "Custom"}`;
    if (before === "running" && state.timer.status === "complete") { try { await saveTimer(state.timer); setStatus("Focus timer complete."); } catch { setStatus("Focus timer deadline passed. Completion could not be persisted, but the timer state is shown here.", true); } }
  }, 500);
}

async function renderCitationTool() {
  const sources = await listSources();
  if (!sources.length) { content.innerHTML = `${pageHeading("REFERENCE TOOL", "Citation generator", "Citations use only metadata you provide or BrowseGate already has.")}<button class="text-button back-link" data-action="tools-back">← Tools</button><div class="empty-inline">Save a source before creating a citation.</div>`; return; }
  const source = sources.find((item) => item.id === state.citationSourceId) || sources[0]; state.citationSourceId = source.id;
  const metadata = metadataFromSource(source);
  content.innerHTML = `${pageHeading("REFERENCE TOOL", "Citation generator", "Review and correct metadata before using a citation. BrowseGate never guesses authors or publication dates.")}<button class="text-button back-link" data-action="tools-back">← Tools</button><label class="form-label" for="citation-source">Saved source</label><select id="citation-source" class="form-control">${sources.map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === source.id ? "selected" : ""}>${escapeHtml(item.title)}</option>`).join("")}</select><label class="form-label" for="citation-style">Style</label><select id="citation-style" class="form-control"><option value="apa7">APA 7</option><option value="mla9">MLA 9</option><option value="chicago-author-date">Chicago author-date</option></select><label class="form-label" for="citation-author">Author <span class="field-hint">Enter names in the order and punctuation required by your style.</span></label><input class="form-control" id="citation-author" value="${escapeHtml(metadata.author)}" placeholder="Leave blank if unavailable"><label class="form-label" for="citation-title">Title</label><input class="form-control" id="citation-title" value="${escapeHtml(metadata.title)}"><label class="form-label" for="citation-publisher">Publisher or website</label><input class="form-control" id="citation-publisher" value="${escapeHtml(metadata.publisher)}"><label class="form-label" for="citation-date">Publication date</label><input class="form-control" id="citation-date" type="date" value="${escapeHtml(metadata.date)}"><label class="form-label" for="citation-url">URL</label><input class="form-control" id="citation-url" value="${escapeHtml(metadata.url)}"><label class="check-row"><input id="citation-access" type="checkbox"><span>Add access date when the selected style and source call for one</span></label><div class="button-row"><button class="button primary dark-theme-contrast" data-action="generate-citation" data-id="${escapeHtml(source.id)}">Generate citation</button>${state.citationResult?.sourceId === source.id ? `<button class="button" data-action="copy-citation">Copy</button><button class="button" data-action="save-citation" data-id="${escapeHtml(source.id)}">Save with source</button>` : ""}</div>${state.citationResult?.sourceId === source.id ? `<section class="list-section"><p class="group-label">${escapeHtml(state.citationResult.styleLabel)}</p><pre class="citation-preview">${escapeHtml(state.citationResult.text)}</pre>${state.citationResult.missing.length ? `<p class="field-hint">Unavailable metadata: ${escapeHtml(state.citationResult.missing.join(", "))}. Review before submission.</p>` : ""}</section>` : ""}<p class="field-hint">Citation formatting is a best-effort starting point. Review capitalization, author names, dates, and style details before submission.</p>`;
  if (state.citationResult?.sourceId === source.id) document.querySelector("#citation-style").value = state.citationResult.style;
}

function showExportDialog(workspace, sources, workspaceNotes = []) {
  state.exportData = { workspace, sources, workspaceNotes };
  const options = [["export-title", "Workspace title", true], ["export-description", "Workspace description", true], ["export-urls", "Source URLs", true], ["export-notes", "User notes", true], ["export-citations", "Citations", true], ["export-metadata", "Available metadata", true], ["export-tags", "Tags", true], ["export-date", "Export date", true]];
  const sourceChecks = sources.map((source) => `<label class="check-row"><input type="checkbox" data-export-source="${escapeHtml(source.id)}" checked><span>${escapeHtml(source.title)}</span></label>`).join("") || `<p class="field-hint">No saved sources are associated with this workspace.</p>`;
  const noteChecks = sources.flatMap((source) => [...(source.note ? [{ key: `${source.id}:page`, title: `${source.title} · page note` }] : []), ...(source.relatedNotes || []).map((note) => ({ key: `${source.id}:${note.id}`, title: `${source.title} · ${note.title || "note"}` }))]).map((note) => `<label class="check-row"><input type="checkbox" data-export-note="${escapeHtml(note.key)}" checked><span>Include note: ${escapeHtml(note.title)}</span></label>`).join("");
  const workspaceNoteChecks = workspaceNotes.map((note) => `<label class="check-row"><input type="checkbox" data-export-note="workspace:${escapeHtml(note.id)}" checked><span>Include note: ${escapeHtml(note.title || "Workspace note")}</span></label>`).join("");
  showDialog(`<h2>Export research</h2><p>Preview and download a local copy of “${escapeHtml(workspace.name)}”. Sensitive notes are included only when their individual boxes remain checked.</p><label class="form-label" for="export-format">File format</label><select class="form-control" id="export-format"><option value="markdown">Markdown (.md)</option><option value="text">Plain text (.txt)</option><option value="json">JSON backup (.json)</option></select><fieldset class="export-options"><legend>Include</legend>${options.map(([id, label, checked]) => `<label class="check-row"><input type="checkbox" id="${id}" ${checked ? "checked" : ""}><span>${label}</span></label>`).join("")}</fieldset><fieldset class="export-options"><legend>Sources</legend>${sourceChecks}</fieldset>${noteChecks || workspaceNoteChecks ? `<fieldset class="export-options"><legend>Notes · uncheck sensitive notes to exclude them</legend>${workspaceNoteChecks}${noteChecks}</fieldset>` : ""}<label class="form-label" for="export-preview">Preview</label><pre id="export-preview" class="export-preview"></pre><p class="field-hint" id="export-error" role="status"></p><div class="dialog-actions"><button class="button" data-action="close-dialog">Cancel</button><button class="button" data-action="copy-export">Copy text</button><button class="button primary" data-action="download-export">Download export</button></div>`);
  updateExportPreview();
}

function updateExportPreview() {
  const previewNode = document.querySelector("#export-preview"); if (!previewNode || !state.exportData) return;
  const included = [...document.querySelectorAll("[data-export-source]:checked")].map((node) => node.dataset.exportSource);
  const excludedSensitiveNotes = [...document.querySelectorAll("[data-export-note]:not(:checked)")].map((node) => node.dataset.exportNote);
  const options = { format: document.querySelector("#export-format")?.value || "markdown", includeTitle: document.querySelector("#export-title")?.checked, includeDescription: document.querySelector("#export-description")?.checked, includeUrls: document.querySelector("#export-urls")?.checked, includeNotes: document.querySelector("#export-notes")?.checked, includeCitations: document.querySelector("#export-citations")?.checked, includeMetadata: document.querySelector("#export-metadata")?.checked, includeTags: document.querySelector("#export-tags")?.checked, includeDate: document.querySelector("#export-date")?.checked, excludedSensitiveNotes };
  options.workspaceNotes = state.exportData.workspaceNotes;
  const file = buildWorkspaceExport(state.exportData.workspace, state.exportData.sources.filter((source) => included.includes(source.id)), options);
  previewNode.textContent = file.content.slice(0, 6000) + (file.content.length > 6000 ? "\n… Preview shortened. Download contains the full export." : "");
  previewNode.dataset.filename = file.filename;
  state.exportFile = file;
}

async function beginSessionCapture(activeOnly = false) {
  try {
    let tabs = await captureWindowTabs();
    if (activeOnly) tabs = tabs.filter((tab) => tab.active);
    if (!tabs.length) { setStatus("No tabs are available to save in this window.", true); return; }
    const workspaces = await listWorkspaces();
    const remembered = await preferences.get("lastWorkspaceId", "");
    state.pendingTabs = tabs;
    const eligible = tabs.filter((tab) => !tab.restricted);
    showDialog(`<h2>Save ${activeOnly ? "current tab" : "window tabs"}</h2><p>Review the tabs before saving. Restricted Chrome or extension pages cannot be restored and will be skipped.</p><label class="form-label" for="session-name">Session name</label><input class="form-control" id="session-name" maxlength="100" value="${escapeHtml(activeOnly ? (tabs[0]?.title || "Current tab") : `Browser session · ${new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date())}`)}" placeholder="Session name"><label class="form-label" for="session-description">Description</label><textarea class="form-control textarea" id="session-description" maxlength="500" placeholder="Optional context for this set of tabs"></textarea><label class="form-label" for="session-notes">Session notes</label><textarea class="form-control textarea" id="session-notes" maxlength="2000" placeholder="Optional notes"></textarea><label class="form-label" for="session-tags">Tags</label><input class="form-control" id="session-tags" placeholder="Optional, comma-separated"><label class="form-label" for="session-workspace">Workspace</label><select class="form-control" id="session-workspace"><option value="">No workspace</option>${workspaces.map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === remembered ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("")}</select><p class="field-hint">${eligible.length} eligible · ${tabs.length - eligible.length} restricted.</p><div class="tab-preview-list">${tabs.map((tab, index) => `<label class="tab-preview"><input type="checkbox" class="session-tab-check" value="${index}" ${tab.restricted ? "disabled" : "checked"}><span><strong>${escapeHtml(tab.title || "Untitled page")}${tab.active ? " · current" : ""}</strong><span>${escapeHtml(tab.restricted ? "Restricted page — excluded" : tab.url)}</span></span></label>`).join("")}</div><p class="field-hint" id="session-error" role="status"></p><div class="dialog-actions"><button class="button" data-action="close-dialog">Cancel</button><button class="button primary" data-action="save-captured-session">Save session</button></div>`);
    document.querySelector("#session-name")?.focus();
  } catch (error) { setStatus(readableError(error), true); }
}

async function previewSession(id) {
  const [session, workspaces] = await Promise.all([getSession(id), listWorkspaces()]);
  if (!session) { setStatus("This saved session is no longer available.", true); await render(); return; }
  const workspace = workspaces.find((item) => item.id === session.workspaceId);
  showDialog(`<h2>${escapeHtml(session.name)}</h2><p>${escapeHtml(session.description || "No description")}</p><p>${session.tabs.length} tabs · ${workspace ? `Workspace: ${escapeHtml(workspace.name)}` : "No workspace"} · Updated ${dateText(session.updatedAt)}</p>${session.notes ? `<div class="source-note">${escapeHtml(session.notes)}</div>` : ""}<div class="tab-preview-list">${session.tabs.map((tab, index) => `<label class="tab-preview"><input type="checkbox" class="restore-tab-check" value="${index}" checked><span><strong>${escapeHtml(tab.title || "Untitled page")}</strong><span>${escapeHtml(tab.url)}</span></span></label>`).join("")}</div><p class="field-hint">Restoring opens new tabs. Existing tabs are left open.</p><div class="dialog-actions"><button class="button" data-action="close-dialog">Close</button><button class="button" data-action="restore-selected" data-id="${escapeHtml(session.id)}">Restore selected</button><button class="button primary" data-action="restore-all" data-id="${escapeHtml(session.id)}">Restore all</button></div>`);
}

async function editSessionDialog(id) {
  const [session, workspaces] = await Promise.all([getSession(id), listWorkspaces()]);
  if (!session) return;
  showDialog(`<h2>Edit session</h2><label class="form-label" for="edit-session-name">Name</label><input id="edit-session-name" class="form-control" maxlength="100" value="${escapeHtml(session.name)}"><label class="form-label" for="edit-session-description">Description</label><textarea id="edit-session-description" class="form-control textarea" maxlength="500">${escapeHtml(session.description)}</textarea><label class="form-label" for="edit-session-notes">Session notes</label><textarea id="edit-session-notes" class="form-control textarea" maxlength="2000">${escapeHtml(session.notes)}</textarea><label class="form-label" for="edit-session-tags">Tags</label><input id="edit-session-tags" class="form-control" value="${escapeHtml((session.tags || []).join(", "))}" placeholder="Comma-separated"><label class="form-label" for="edit-session-workspace">Workspace</label><select id="edit-session-workspace" class="form-control"><option value="">No workspace</option>${workspaces.map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === session.workspaceId ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("")}</select><p class="field-hint" id="session-error" role="status"></p><div class="dialog-actions"><button class="button" data-action="close-dialog">Cancel</button><button class="button primary" data-action="save-session-edits" data-id="${escapeHtml(session.id)}">Save changes</button></div>`);
}

async function restoreSession(id, selectedOnly, trigger) {
  if (state.restoring.has(id) || Date.now() - (state.lastRestore.get(id) || 0) < 5000) { setStatus("This session was just restored. Wait a moment before restoring it again.", true); return; }
  state.restoring.add(id);
  let session;
  try { session = await getSession(id); } catch (error) { state.restoring.delete(id); throw error; }
  if (!session) { state.restoring.delete(id); setStatus("This saved session is no longer available.", true); closeDialog(); return; }
  const chosen = selectedOnly ? [...document.querySelectorAll(".restore-tab-check:checked")].map((checkbox) => session.tabs[Number(checkbox.value)]).filter(Boolean) : session.tabs;
  if (!chosen.length) { state.restoring.delete(id); setStatus("Select at least one tab to restore.", true); return; }
  const valid = chosen.filter((tab) => { try { normalizeUrl(tab.url); return true; } catch { return false; } });
  const skipped = chosen.length - valid.length;
  if (!valid.length) { state.restoring.delete(id); setStatus("None of the selected session tabs has a restorable HTTP or HTTPS URL.", true); return; }
  if (valid.length > 10 && !confirm(`This will open ${valid.length} new tabs. Your current tabs will stay open. Continue?`)) { state.restoring.delete(id); return; }
  if (trigger) { trigger.disabled = true; trigger.textContent = "Restoring…"; }
  let opened = 0;
  let failed = 0;
  try {
    for (const tab of valid) {
      try { await chrome.tabs.create({ url: tab.url, active: false }); opened += 1; }
      catch { failed += 1; }
    }
  } finally {
    state.restoring.delete(id);
    if (opened) state.lastRestore.set(id, Date.now());
    closeDialog();
    setStatus(`${opened} tab${opened === 1 ? "" : "s"} restored${failed ? ` · ${failed} could not be opened` : ""}${skipped ? ` · ${skipped} invalid tab${skipped === 1 ? "" : "s"} skipped` : ""}.`, opened === 0 || failed > 0);
    await render();
  }
}

async function render() {
  if (state.globalQuery.trim()) return renderSearch(state.globalQuery.trim());
  if (state.route === "home") return renderHome();
  if (state.route === "research" || state.route.startsWith("workspace")) return renderResearch();
  if (state.route === "notes" || state.route === "note-editor") return renderNotes();
  if (state.route === "history") return renderHistory();
  if (state.route === "sessions") return renderSessions();
  if (state.route === "reading") return renderReadingList();
  if (state.route === "tools") return renderTools();
  if (state.route === "insights") return renderInsights();
  if (state.route === "settings") return renderSettings();
  if (state.route === "search") return renderSearch(state.globalQuery.trim());
  content.innerHTML = `${pageHeading("BROWSEGATE", "Section unavailable", "This section is not available in the current extension build.")}<button class="button" data-action="go-home">Return home</button>`;
}

function showDialog(markup) {
  state.dialogOpener = document.activeElement;
  dialogRoot.innerHTML = `<div class="dialog-backdrop" data-action="backdrop"><section class="dialog" role="dialog" aria-modal="true" tabindex="-1">${markup}</section></div>`;
  const dialog = dialogRoot.querySelector("[role=dialog]"); const heading = dialog?.querySelector("h2");
  if (heading) { heading.id = "active-dialog-title"; dialog.setAttribute("aria-labelledby", heading.id); }
  dialogRoot.querySelector("input,textarea,select,button")?.focus();
}
function closeDialog() { dialogRoot.innerHTML = ""; if (state.dialogOpener?.isConnected) state.dialogOpener.focus(); state.dialogOpener = null; }

async function workspaceDialog(workspace = null) {
  showDialog(`<h2>${workspace ? "Edit workspace" : "Create workspace"}</h2><form id="workspace-form" data-id="${escapeHtml(workspace?.id || "")}"><label class="form-label" for="workspace-name">Name</label><input class="form-control" id="workspace-name" name="name" maxlength="80" required value="${escapeHtml(workspace?.name || "")}" placeholder="e.g. Climate policy research"><label class="form-label" for="workspace-description">Description <span class="field-hint">Optional, up to 500 characters</span></label><textarea class="form-control textarea" id="workspace-description" name="description" maxlength="500" placeholder="What are you working on?">${escapeHtml(workspace?.description || "")}</textarea><p class="field-hint" id="workspace-error" role="status"></p><div class="dialog-actions"><button type="button" class="button" data-action="close-dialog">Cancel</button><button class="button primary" type="submit">${workspace ? "Save changes" : "Create workspace"}</button></div></form>`);
}

async function chooseWorkspaceDialog({ title, description, source = null, allowNone = true }) {
  const workspaces = await listWorkspaces();
  const remembered = await preferences.get("lastWorkspaceId", "");
  showDialog(`<h2>${escapeHtml(title)}</h2><p>${escapeHtml(description)}</p><label class="form-label" for="workspace-choice">Workspace</label><select class="form-control" id="workspace-choice">${allowNone ? `<option value="">Save outside a workspace</option>` : ""}${workspaces.map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === remembered ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("")}</select><div class="dialog-actions"><button class="button" data-action="close-dialog">Cancel</button><button class="button primary" data-action="confirm-workspace" data-source="${escapeHtml(source?.id || "")}">Continue</button></div>`);
}

async function quickSave() {
  try {
    const { metadata, existing } = await inspectActivePage();
    if (existing) {
      const workspaces = await listWorkspaces();
      const remembered = await preferences.get("lastWorkspaceId", "");
      showDialog(`<h2>Already saved</h2><p><strong>${escapeHtml(existing.title)}</strong><br>${escapeHtml(existing.domain)}<br>This URL is already in your library. Choose what you want to do next.</p><label class="form-label" for="duplicate-workspace">Add to workspace</label><select class="form-control" id="duplicate-workspace"><option value="">Choose a workspace</option>${workspaces.map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === remembered ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("")}</select><label class="form-label" for="duplicate-note">Update page note</label><textarea class="form-control textarea" id="duplicate-note" maxlength="2000" placeholder="Why is this page useful?">${escapeHtml(existing.note || "")}</textarea><div class="dialog-actions"><button class="button" data-action="close-dialog">Cancel</button><button class="button" data-action="open-existing" data-id="${escapeHtml(existing.id)}">Open existing</button><button class="button" data-action="add-duplicate" data-id="${escapeHtml(existing.id)}">Add to workspace</button><button class="button primary" data-action="save-duplicate-note" data-id="${escapeHtml(existing.id)}">Save page note</button></div>`);
      return;
    }
    state.pendingMetadata = metadata;
    const workspaces = await listWorkspaces();
    const remembered = await preferences.get("lastWorkspaceId", "");
    showDialog(`<h2>Quick Save</h2><p>Save <strong>${escapeHtml(metadata.title || metadata.url)}</strong> to BrowseGate.</p><label class="form-label" for="save-workspace">Workspace</label><select class="form-control" id="save-workspace"><option value="">Save without a workspace</option>${workspaces.map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === remembered ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("")}</select><div class="dialog-actions"><button class="button" data-action="close-dialog">Cancel</button><button class="button primary" data-action="confirm-save">Save page</button></div>`);
  } catch (error) { setStatus(readableError(error), true); }
}

async function commitNoteDraft() {
  if (!state.activeDraft || state.saving) return false;
  const draft = state.activeDraft;
  const title = document.querySelector("#note-title")?.value ?? draft.title;
  const body = document.querySelector("#note-body")?.value ?? draft.body;
  if (!title.trim() && !body.trim()) return true;
  state.saving = true; state.hasError = false;
  const saveState = document.querySelector("#note-save-state"); if (saveState) saveState.textContent = "Saving…";
  try {
    const saved = await saveNote({ ...draft, title, body });
    state.activeDraft = { ...draft, ...saved };
    state.hasError = false;
    const current = document.querySelector("#note-save-state"); if (current) current.textContent = "Saved";
    return true;
  } catch (error) {
    state.hasError = true;
    const current = document.querySelector("#note-save-state"); if (current) { current.textContent = `${readableError(error)} Your text is still here.`; current.classList.add("is-error"); }
    setStatus(readableError(error), true);
    return false;
  } finally { state.saving = false; }
}

function scheduleNoteSave() {
  if (!state.activeDraft) return;
  state.activeDraft.title = document.querySelector("#note-title")?.value ?? state.activeDraft.title;
  state.activeDraft.body = document.querySelector("#note-body")?.value ?? state.activeDraft.body;
  state.activeDraft.workspaceIds = [document.querySelector("#note-workspace")?.value || ""].filter(Boolean);
  state.activeDraft.sourceId = document.querySelector("#note-source")?.value || "";
  state.hasError = false;
  const saveState = document.querySelector("#note-save-state"); if (saveState) { saveState.textContent = "Unsaved changes"; saveState.classList.remove("is-error"); }
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(() => commitNoteDraft(), 650);
}

document.addEventListener("error", (event) => {
  if (event.target.matches?.("img.favicon")) { const fallback = document.createElement("span"); fallback.className = "favicon-fallback"; fallback.setAttribute("aria-hidden", "true"); fallback.textContent = "↗"; event.target.replaceWith(fallback); }
}, true);

document.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const action = button.dataset.action;
  try {
    if (action === "close-dialog" || (action === "backdrop" && event.target === button)) closeDialog();
    else if (action === "create-workspace") await workspaceDialog();
    else if (action === "edit-workspace") await workspaceDialog(await getWorkspace(button.dataset.id));
    else if (action === "open-workspace") { state.workspaceId = button.dataset.id; state.sourceQuery = ""; setRoute("research", button.dataset.id); }
    else if (action === "back-workspaces") { state.workspaceId = ""; setRoute("research"); }
    else if (action === "goto-research") { state.workspaceId = ""; setRoute("research"); }
    else if (action === "goto-notes") setRoute("notes");
    else if (action === "goto-sessions") setRoute("sessions");
    else if (action === "goto-reading") setRoute("reading");
    else if (action === "go-home") setRoute("home");
    else if (action === "view-all-insights") setRoute("insights");
    else if (action === "retry-database") { await initializeDatabase(); state.timer = await loadTimer(); await render(); setStatus("BrowseGate local data is available again."); }
    else if (action === "grant-history") { const granted = await chrome.permissions.request({ permissions: ["history"] }); if (granted) { setStatus("Chrome History access enabled."); await render(); } else setStatus("History access was not granted. Saved research features remain available; you can enable History later.", true); }
    else if (action === "revoke-history") { await chrome.permissions.remove({ permissions: ["history"] }); setStatus("Chrome History access revoked."); await render(); }
    else if (action === "revoke-clipboard") { await chrome.permissions.remove({ permissions: ["clipboardRead", "clipboardWrite"] }); setStatus("Clipboard permissions revoked. Manual copy and paste remain available."); await render(); }
    else if (action === "clear-insight-dismissals") { await preferences.set({ dismissedInsights: [] }); setStatus("Dismissed insights reset."); await renderSettings(); }
    else if (action === "dismiss-insight") { const dismissed = await preferences.get("dismissedInsights", []); if (!dismissed.includes(button.dataset.id)) dismissed.push(button.dataset.id); await preferences.set({ dismissedInsights: dismissed }); await renderInsights(); }
    else if (action === "insight-review") { const insightId = button.dataset.insight || ""; const workspacePrefix = insightId.startsWith("workspace-no-notes:") ? "workspace-no-notes:" : insightId.startsWith("largest-workspace:") ? "largest-workspace:" : ""; if (workspacePrefix) setRoute("research", insightId.slice(workspacePrefix.length)); else setRoute(insightId === "duplicate-sources" || insightId === "stale-sources" ? "research" : "history"); }
    else if (action === "refresh-insights") { state.analyticsStart = document.querySelector("#insights-start")?.value || ""; state.analyticsEnd = document.querySelector("#insights-end")?.value || ""; if (state.analyticsStart && state.analyticsEnd && state.analyticsStart > state.analyticsEnd) throw new Error("Start date must be before end date."); await renderInsights(); }
    else if (action === "tools-back") { state.toolPage = ""; await renderTools(); }
    else if (action === "tool-open") { state.toolPage = button.dataset.tool; state.route = "tools"; if (state.toolPage === "timer") state.timer = await loadTimer(); else clearInterval(state.timerInterval); renderTools(); if (state.toolPage === "timer") startTimerDisplay(); }
    else if (action === "citation-source") { state.citationSourceId = button.dataset.id; state.citationResult = null; state.toolPage = "citations"; setRoute("tools"); }
    else if (action === "reading-add") { await markForReading(button.dataset.id, "unread"); setStatus("Saved page added to the reading list."); }
    else if (action === "export-workspace") {
      const workspace = await getWorkspace(button.dataset.id); if (!workspace) throw new Error("This workspace is no longer available.");
      const [sources, notes] = await Promise.all([listSources(workspace.id), listNotes()]);
      const workspaceNotes = notes.filter((note) => note.workspaceIds?.includes(workspace.id) && (!note.sourceId || !sources.some((source) => source.id === note.sourceId)));
      showExportDialog(workspace, sources, workspaceNotes);
    }
    else if (action === "download-export") {
      try {
        updateExportPreview();
        const included = [...document.querySelectorAll("[data-export-source]:checked")].map((node) => node.dataset.exportSource);
        const excludedSensitiveNotes = [...document.querySelectorAll("[data-export-note]:not(:checked)")].map((node) => node.dataset.exportNote);
        const format = document.querySelector("#export-format").value;
        const workspaceNotes = state.exportData.workspaceNotes;
        const file = buildWorkspaceExport(state.exportData.workspace, state.exportData.sources.filter((source) => included.includes(source.id)), { format, includeTitle: document.querySelector("#export-title").checked, includeDescription: document.querySelector("#export-description").checked, includeUrls: document.querySelector("#export-urls").checked, includeNotes: document.querySelector("#export-notes").checked, includeCitations: document.querySelector("#export-citations").checked, includeMetadata: document.querySelector("#export-metadata").checked, includeTags: document.querySelector("#export-tags").checked, includeDate: document.querySelector("#export-date").checked, excludedSensitiveNotes, workspaceNotes });
        downloadLocalFile(file); closeDialog(); setStatus(`Downloaded ${file.filename}.`);
      } catch (error) { const node = document.querySelector("#export-error"); if (node) node.textContent = readableError(error); }
    }
    else if (action === "copy-export") { if (await copyText(state.exportFile?.content || "")) setStatus("Export text copied."); }
    else if (action === "add-current-reading") {
      const { metadata } = await inspectActivePage(); const result = await saveSource(metadata); await markForReading(result.source.id, "unread"); setStatus("Page added to your reading list."); await renderReadingList();
    }
    else if (action === "reading-open") await chrome.tabs.create({ url: button.dataset.url, active: true });
    else if (action === "reading-filter") { state.readingStatus = button.dataset.status; await renderReadingList(); }
    else if (action === "reading-status") { await updateReadingItem(button.dataset.id, { status: button.dataset.status }); await renderReadingList(); }
    else if (action === "reading-remove") { await removeReadingItem(button.dataset.id); setStatus("Removed from reading list. The saved source is unchanged."); await renderReadingList(); }
    else if (action === "save-reading-note") { const note = document.querySelector(`[data-reading-note="${CSS.escape(button.dataset.id)}"]`)?.value || ""; await updateReadingItem(button.dataset.id, { note }); setStatus("Reading note saved."); }
    else if (action === "reading-move") await chooseWorkspaceDialog({ title: "Add reading item to workspace", description: "This associates the existing saved source with a workspace.", source: { id: button.dataset.id }, allowNone: false });
    else if (action === "generate-citation") {
      const sourceId = button.dataset.id; const metadata = { author: document.querySelector("#citation-author").value, title: document.querySelector("#citation-title").value, publisher: document.querySelector("#citation-publisher").value, date: document.querySelector("#citation-date").value, url: document.querySelector("#citation-url").value, includeAccessDate: document.querySelector("#citation-access").checked };
      await updateSourceMetadata(sourceId, metadata); const style = document.querySelector("#citation-style").value; const result = formatCitation(metadata, style); state.citationResult = { ...result, sourceId, styleLabel: style === "apa7" ? "APA 7" : style === "mla9" ? "MLA 9" : "Chicago author-date" }; await renderCitationTool();
    }
    else if (action === "copy-citation") { if (await copyText(state.citationResult?.text || "")) setStatus("Citation copied."); }
    else if (action === "save-citation") { await saveCitation(button.dataset.id, state.citationResult); setStatus("Citation saved with the source and available to research exports."); }
    else if (action === "timer-mode") { state.timer = await setTimerMode(button.dataset.mode); renderTools(); }
    else if (action === "set-custom-timer") { state.timer = await setTimerMode("custom", Number(document.querySelector("#custom-minutes")?.value)); renderTools(); }
    else if (action === "timer-start") { state.timer = await startTimer(reconcileTimer(state.timer)); renderTools(); startTimerDisplay(); }
    else if (action === "timer-pause") { state.timer = await pauseTimer(reconcileTimer(state.timer)); renderTools(); }
    else if (action === "timer-reset") { state.timer = await resetTimer(state.timer); renderTools(); }
    else if (action === "paste-text" || action === "paste-note") {
      const targetId = action === "paste-note" ? "note-body" : "analysis-text";
      state.pasteTarget = targetId;
      try { if (!await chrome.permissions.request({ permissions: ["clipboardRead"] })) throw new Error("Clipboard read permission was not granted."); const target = document.querySelector(`#${targetId}`); target.value = await navigator.clipboard.readText(); target.dispatchEvent(new Event("input", { bubbles: true })); if (targetId === "note-body") scheduleNoteSave(); else updateAnalysis(); setStatus("Text pasted from clipboard."); }
      catch { showDialog(`<h2>Paste text</h2><p>Clipboard access was unavailable. Paste manually below.</p><textarea class="form-control textarea" id="manual-paste" placeholder="Paste text here"></textarea><div class="dialog-actions"><button class="button" data-action="close-dialog">Cancel</button><button class="button primary dark-theme-contrast" data-action="use-manual-paste">Use text</button></div>`); }
    }
    else if (action === "use-manual-paste") { const target = document.querySelector(`#${state.pasteTarget || "analysis-text"}`); if (target) { target.value = document.querySelector("#manual-paste").value; target.dispatchEvent(new Event("input", { bubbles: true })); } closeDialog(); if (state.pasteTarget === "note-body") scheduleNoteSave(); else updateAnalysis(); state.pasteTarget = ""; }
    else if (action === "copy-analysis") { if (await copyText(document.querySelector("#analysis-text")?.value || "")) setStatus("Text copied."); }
    else if (action === "clear-analysis") { document.querySelector("#analysis-text").value = ""; updateAnalysis(); }
    else if (action === "search-scope") { state.searchScope = button.dataset.scope || "all"; await renderSearch(state.globalQuery.trim()); }
    else if (action === "clear-history-filters") { state.historyQuery = ""; state.historyDomain = ""; state.historyRange = "month"; state.historySort = "recent"; await renderHistory(); }
    else if (action === "open-history") { await chrome.tabs.create({ url: button.dataset.url, active: true }); }
    else if (action === "save-history") {
      const workspaces = await listWorkspaces();
      const remembered = await preferences.get("lastWorkspaceId", "");
      state.pendingHistory = { url: button.dataset.url, title: button.dataset.title || "" };
      showDialog(`<h2>Save history result</h2><p>${escapeHtml(state.pendingHistory.title || state.pendingHistory.url)}</p><label class="form-label" for="history-save-workspace">Workspace</label><select id="history-save-workspace" class="form-control"><option value="">Save without a workspace</option>${workspaces.map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === remembered ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("")}</select><div class="dialog-actions"><button class="button" data-action="close-dialog">Cancel</button><button class="button primary" data-action="confirm-history-save">Save page</button></div>`);
    }
    else if (action === "confirm-history-save") {
      const workspaceId = document.querySelector("#history-save-workspace").value;
      const saved = await saveSource(state.pendingHistory, workspaceId);
      if (workspaceId) await preferences.set({ lastWorkspaceId: workspaceId });
      state.pendingHistory = null; closeDialog(); setStatus(saved.associated || !saved.existed ? "History page saved." : "This page is already in your saved sources."); await render();
    }
    else if (action === "history-note") {
      const source = (await listSources()).find((item) => item.id === button.dataset.id);
      if (source) showDialog(`<h2>${source.note ? "Edit page note" : "Add page note"}</h2><p>${escapeHtml(source.title)}</p><textarea class="form-control textarea" id="source-note-input" maxlength="2000" placeholder="Why is this page useful?">${escapeHtml(source.note)}</textarea><div class="dialog-actions"><button class="button" data-action="close-dialog">Cancel</button><button class="button primary" data-action="save-source-note" data-id="${escapeHtml(source.id)}">Save note</button></div>`);
    }
    else if (action === "view-source-record") {
      const source = (await listSources()).find((item) => item.id === button.dataset.id);
      if (source) showDialog(`<h2>${escapeHtml(source.title)}</h2><p>${escapeHtml(source.domain)}<br>${escapeHtml(source.url)}<br>Saved ${dateText(source.savedAt)}</p>${source.description ? `<p>${escapeHtml(source.description)}</p>` : ""}${source.note ? `<div class="source-note">${escapeHtml(source.note)}</div>` : "<p>No page note yet.</p>"}${(source.relatedNotes || []).map((note) => `<div class="source-note"><strong>${escapeHtml(note.title)}</strong><br>${escapeHtml(note.body)}</div>`).join("")}<div class="dialog-actions"><button class="button" data-action="close-dialog">Close</button><button class="button" data-action="history-note" data-id="${escapeHtml(source.id)}">Edit page note</button><button class="button primary" data-action="open-source" data-id="${escapeHtml(source.id)}">Open page</button></div>`);
    }
    else if (action === "save-session") await beginSessionCapture(false);
    else if (action === "save-current-tab") await beginSessionCapture(true);
    else if (action === "preview-session") await previewSession(button.dataset.id);
    else if (action === "edit-session") await editSessionDialog(button.dataset.id);
    else if (action === "save-captured-session") {
      try {
        const selectedTabs = [...document.querySelectorAll(".session-tab-check:checked")].map((checkbox) => state.pendingTabs[Number(checkbox.value)]).filter((tab) => tab && !tab.restricted);
        const session = await saveSession({ name: document.querySelector("#session-name").value, description: document.querySelector("#session-description").value, notes: document.querySelector("#session-notes").value,
          tags: document.querySelector("#session-tags").value.split(","), workspaceId: document.querySelector("#session-workspace").value, tabs: selectedTabs });
        state.pendingTabs = []; closeDialog(); setStatus(`Session “${session.name}” saved with ${session.tabs.length} tabs.`); await render();
      } catch (error) { const node = document.querySelector("#session-error"); if (node) node.textContent = readableError(error); }
    }
    else if (action === "save-session-edits") {
      try {
        const session = await getSession(button.dataset.id);
        const saved = await saveSession({ ...session, name: document.querySelector("#edit-session-name").value, description: document.querySelector("#edit-session-description").value,
          notes: document.querySelector("#edit-session-notes").value, tags: document.querySelector("#edit-session-tags").value.split(","), workspaceId: document.querySelector("#edit-session-workspace").value });
        closeDialog(); setStatus(`Session “${saved.name}” updated.`); await render();
      } catch (error) { const node = document.querySelector("#session-error"); if (node) node.textContent = readableError(error); }
    }
    else if (action === "delete-session") {
      const session = await getSession(button.dataset.id);
      if (confirm(`Delete saved session “${session?.name}”? This does not change your open browser tabs.`)) { await deleteSession(button.dataset.id); closeDialog(); setStatus("Saved session deleted."); await render(); }
    }
    else if (action === "restore-selected") await restoreSession(button.dataset.id, true, button);
    else if (action === "restore-all") await restoreSession(button.dataset.id, false, button);
    else if (action === "favorite-workspace") { await toggleFavorite(button.dataset.id); await render(); }
    else if (action === "delete-workspace") {
      const workspace = await getWorkspace(button.dataset.id);
      if (confirm(`Delete “${workspace?.name}”? Its sources, notes, and sessions will remain saved, but be unlinked from this workspace.`)) {
        await deleteWorkspace(button.dataset.id); state.workspaceId = ""; setRoute("research");
      }
    } else if (action === "quick-save") await quickSave();
    else if (action === "close-note-editor") { clearTimeout(state.saveTimer); scheduleNoteSave(); clearTimeout(state.saveTimer); if (await commitNoteDraft()) setRoute(state.workspaceId ? "research" : "notes"); }
    else if (action === "resume-note") { state.route = "note-editor"; await render(); }
    else if (action === "create-note") {
      if (state.activeDraft && (state.activeDraft.body?.trim() || state.activeDraft.title?.trim())) {
        if (!await commitNoteDraft()) return;
      }
      state.activeDraft = null;
      await startNote({ workspaceId: button.dataset.workspace || state.workspaceId });
    }
    else if (action === "edit-note") {
      if (state.activeDraft?.id === button.dataset.id) { state.globalQuery = ""; searchInput.value = ""; state.route = "note-editor"; await render(); return; }
      if (state.activeDraft && state.activeDraft.id !== button.dataset.id && (state.activeDraft.body?.trim() || state.activeDraft.title?.trim())) {
        if (!await commitNoteDraft()) return;
      }
      await startNote({ id: button.dataset.id });
    }
    else if (action === "save-note-now") { clearTimeout(state.saveTimer); if (document.querySelector("#note-title")) scheduleNoteSave(); clearTimeout(state.saveTimer); await commitNoteDraft(); }
    else if (action === "copy-note") { const body = document.querySelector("#note-body")?.value ?? state.activeDraft?.body ?? ""; if (await copyText(body)) setStatus("Note text copied."); }
    else if (action === "pin-draft") { if (state.activeDraft) { state.activeDraft.pinned = !state.activeDraft.pinned; scheduleNoteSave(); clearTimeout(state.saveTimer); await commitNoteDraft(); renderNoteEditor(); } }
    else if (action === "pin-note") { await toggleNotePin(button.dataset.id); await render(); }
    else if (action === "delete-note") { if (confirm("Delete this note? This cannot be undone.")) { clearTimeout(state.saveTimer); await deleteNote(button.dataset.id); if (state.activeDraft?.id === button.dataset.id) state.activeDraft = null; setRoute("notes"); } }
    else if (action === "open-source") { const source = (await listSources()).find((item) => item.id === button.dataset.id); if (source) await chrome.tabs.create({ url: source.url }); }
    else if (action === "edit-source-note") {
      const source = (await listSources()).find((item) => item.id === button.dataset.id);
      if (source) { showDialog(`<h2>${source.note ? "Edit page note" : "Add page note"}</h2><p>${escapeHtml(source.title)}</p><textarea class="form-control textarea" id="source-note-input" maxlength="2000" placeholder="Why is this page useful?">${escapeHtml(source.note)}</textarea><div class="dialog-actions"><button class="button" data-action="close-dialog">Cancel</button><button class="button primary" data-action="save-source-note" data-id="${escapeHtml(source.id)}">Save note</button></div>`); }
    } else if (action === "save-source-note") { await updateSourceNote(button.dataset.id, document.querySelector("#source-note-input").value); closeDialog(); setStatus("Page note saved."); await render(); }
    else if (action === "remove-source") { if (confirm("Remove this source from the workspace? The saved source and its note will remain in your library.")) { await removeSourceFromWorkspace(button.dataset.id, button.dataset.workspace); await render(); } }
    else if (action === "delete-source") { if (confirm("Delete this saved source from all workspaces? Attached notes will remain but lose their source link.")) { await deleteSource(button.dataset.id); await render(); } }
    else if (action === "move-source") await chooseWorkspaceDialog({ title: "Add source to workspace", description: "The source remains in your library and can belong to several workspaces.", source: { id: button.dataset.id }, allowNone: false });
    else if (action === "confirm-workspace") {
      const workspaceId = document.querySelector("#workspace-choice").value;
      if (!workspaceId) { setStatus("Choose a workspace.", true); return; }
      if (button.dataset.source) { const added = await addSourceToWorkspace(button.dataset.source, workspaceId); closeDialog(); setStatus(added ? "Source added to workspace." : "This source is already in that workspace."); await render(); }
    } else if (action === "confirm-save") {
      const workspaceId = document.querySelector("#save-workspace").value;
      const result = await saveSource(state.pendingMetadata, workspaceId);
      if (workspaceId) await preferences.set({ lastWorkspaceId: workspaceId });
      closeDialog(); state.pendingMetadata = null; setStatus(result.associated || !result.existed ? "Page saved to BrowseGate." : "Page saved in your library."); await render();
    } else if (action === "open-existing") { const source = (await listSources()).find((item) => item.id === button.dataset.id); if (source) await chrome.tabs.create({ url: source.url }); closeDialog(); }
    else if (action === "add-duplicate") {
      const workspaceId = document.querySelector("#duplicate-workspace").value;
      if (!workspaceId) { setStatus("Choose a workspace first.", true); return; }
      const existingId = button.dataset.id;
      const added = await addSourceToWorkspace(existingId, workspaceId); await preferences.set({ lastWorkspaceId: workspaceId }); closeDialog(); setStatus(added ? "Existing source added to workspace." : "Source is already in that workspace."); await render();
    } else if (action === "save-duplicate-note") { await updateSourceNote(button.dataset.id, document.querySelector("#duplicate-note").value); closeDialog(); setStatus("Page note updated."); await render(); }
  } catch (error) { closeDialog(); setStatus(readableError(error), true); }
});

document.addEventListener("submit", async (event) => {
  if (event.target.id !== "workspace-form") return;
  event.preventDefault();
  const data = new FormData(event.target);
  try {
    await saveWorkspace({ id: event.target.dataset.id || undefined, name: data.get("name"), description: data.get("description") });
    closeDialog(); await render(); setStatus("Workspace saved.");
  } catch (error) { const errorNode = document.querySelector("#workspace-error"); if (errorNode) errorNode.textContent = readableError(error); }
});

document.addEventListener("input", (event) => {
  if (event.target.id === "global-search") { state.globalQuery = event.target.value; state.route = state.globalQuery.trim() ? "search" : "home"; if (state.route !== "tools") clearInterval(state.timerInterval); clearTimeout(state.searchTimer); state.searchTimer = setTimeout(() => render().catch((error) => setStatus(readableError(error), true)), 200); }
  if (event.target.id === "workspace-search") { state.workspaceQuery = event.target.value; clearTimeout(state.filterTimer); state.filterTimer = setTimeout(() => render().catch((error) => setStatus(readableError(error), true)), 180); }
  if (event.target.id === "source-search") { state.sourceQuery = event.target.value; clearTimeout(state.filterTimer); state.filterTimer = setTimeout(() => render().catch((error) => setStatus(readableError(error), true)), 180); }
  if (event.target.id === "notes-search") { state.notesQuery = event.target.value; clearTimeout(state.filterTimer); state.filterTimer = setTimeout(() => render().catch((error) => setStatus(readableError(error), true)), 180); }
  if (event.target.id === "sessions-search") { state.sessionQuery = event.target.value; clearTimeout(state.filterTimer); state.filterTimer = setTimeout(() => renderSessions().catch((error) => setStatus(readableError(error), true)), 180); }
  if (event.target.id === "library-source-search") { state.librarySourceQuery = event.target.value; clearTimeout(state.filterTimer); state.filterTimer = setTimeout(() => renderResearch().catch((error) => setStatus(readableError(error), true)), 180); }
  if (event.target.id === "history-query") { state.historyQuery = event.target.value; clearTimeout(state.historyTimer); state.historyTimer = setTimeout(() => renderHistory().catch((error) => setStatus(readableError(error), true)), 250); }
  if (event.target.id === "history-domain") { state.historyDomain = event.target.value; clearTimeout(state.historyTimer); state.historyTimer = setTimeout(() => renderHistory().catch((error) => setStatus(readableError(error), true)), 250); }
  if (event.target.id === "reading-search") { state.readingQuery = event.target.value; clearTimeout(state.filterTimer); state.filterTimer = setTimeout(() => renderReadingList().catch((error) => setStatus(readableError(error), true)), 180); }
  if (event.target.id === "analysis-text") updateAnalysis();
  if (event.target.id === "insights-start") state.analyticsStart = event.target.value;
  if (event.target.id === "insights-end") state.analyticsEnd = event.target.value;
  if (["note-title", "note-body"].includes(event.target.id)) scheduleNoteSave();
});
document.addEventListener("change", (event) => {
  if (["note-workspace", "note-source"].includes(event.target.id)) scheduleNoteSave();
  if (["history-range", "history-sort"].includes(event.target.id)) { state.historyRange = document.querySelector("#history-range")?.value || state.historyRange; state.historySort = document.querySelector("#history-sort")?.value || state.historySort; renderHistory().catch((error) => setStatus(readableError(error), true)); }
  if (["search-history-range", "search-history-sort"].includes(event.target.id)) { state.historyRange = document.querySelector("#search-history-range")?.value || state.historyRange; state.historySort = document.querySelector("#search-history-sort")?.value || state.historySort; renderSearch(state.globalQuery.trim()).catch((error) => setStatus(readableError(error), true)); }
  if (event.target.id === "reading-sort") { state.readingSort = event.target.value; renderReadingList().catch((error) => setStatus(readableError(error), true)); }
  if (event.target.id === "insights-range") { state.analyticsRange = event.target.value; renderInsights().catch((error) => setStatus(readableError(error), true)); }
  if (event.target.matches(".reading-status")) { event.target.dataset.status = event.target.value; const id = event.target.dataset.id; updateReadingItem(id, { status: event.target.value }).then(() => renderReadingList()).catch((error) => setStatus(readableError(error), true)); }
  if (event.target.matches("[data-export-source], [data-export-note]") || event.target.id.startsWith("export-") || event.target.id === "export-format") updateExportPreview();
  if (event.target.id === "citation-source") { state.citationSourceId = event.target.value; state.citationResult = null; renderCitationTool().catch((error) => setStatus(readableError(error), true)); }
});

navItems.forEach((item) => item.addEventListener("click", async () => {
  if (state.route === "note-editor" && state.activeDraft) {
    clearTimeout(state.saveTimer);
    scheduleNoteSave();
    clearTimeout(state.saveTimer);
    await commitNoteDraft();
  }
  if (item.dataset.view === "research") state.workspaceId = "";
  state.globalQuery = ""; searchInput.value = ""; await setRoute(item.dataset.view); content.querySelector("h1")?.focus();
}));

searchInput.addEventListener("keydown", (event) => { if (event.key === "Escape") { searchInput.value = ""; state.globalQuery = ""; state.route = "home"; render(); } });
document.addEventListener("keydown", (event) => {
  const dialog = dialogRoot.querySelector("[role=dialog]");
  if (dialog && event.key === "Tab") {
    const focusable = [...dialog.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')].filter((element) => element.offsetParent !== null);
    if (!focusable.length) { event.preventDefault(); dialog.focus(); return; }
    const first = focusable[0]; const last = focusable.at(-1);
    if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
  if (!dialog && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); searchInput.focus(); }
  if (event.key === "Escape" && dialogRoot.firstElementChild) closeDialog();
});
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !changes.focusTimer) return;
  const timer = changes.focusTimer.newValue;
  if (timer?.status === "complete") { state.timer = timer; setStatus("Focus timer complete."); }
  else if (timer) state.timer = timer;
});

const themeButton = document.querySelector("#theme-toggle");
async function applyTheme(theme) {
  const resolved = theme === "system" ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : theme;
  document.documentElement.dataset.theme = resolved;
  themeButton.setAttribute("aria-label", resolved === "dark" ? "Switch to light theme" : "Switch to dark theme");
}
themeButton.addEventListener("click", async () => {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  await applyTheme(next);
  try { await preferences.set({ theme: next }); } catch (error) { setStatus(readableError(error), true); }
});

try {
  const savedTheme = await preferences.get("theme", "system"); await applyTheme(savedTheme);
  await initializeDatabase();
  state.timer = await loadTimer();
  if (state.timer.status === "running") startTimerDisplay();
  await render();
  if (state.timer.status === "complete" && state.timer.completedAt > Date.now() - 24 * 60 * 60 * 1000) setStatus("Focus timer completed while BrowseGate was closed.");
} catch (error) {
  const message = readableError(error);
  setStatus(message, true);
  content.innerHTML = `${pageHeading("LOCAL DATA", "BrowseGate could not open its library", "Your saved data has not been reset. Close other BrowseGate panels if a database upgrade is waiting, then retry.")}<div class="status-banner is-error" role="alert">${escapeHtml(message)}</div><button class="button primary" data-action="retry-database">Retry database access</button>`;
}
