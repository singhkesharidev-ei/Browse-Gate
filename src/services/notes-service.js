import { abortTransaction, getAll, requestValue, transact } from "../core/database.js";
import { BrowseGateError } from "../core/errors.js";

const id = () => crypto.randomUUID();
export async function listNotes(query = "") {
  const [notes, sources] = await Promise.all([getAll("notes"), getAll("sources")]); const term = String(query).trim().toLocaleLowerCase();
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  return notes.filter((note) => !term || `${note.title} ${note.body} ${(note.tags || []).join(" ")}`.toLocaleLowerCase().includes(term))
    .map((note) => ({ ...note, relatedSource: sourceById.get(note.sourceId) || null }))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt);
}
export async function saveNote(draft) {
  const title = String(draft.title ?? "").trim().slice(0, 120);
  const body = String(draft.body ?? "").slice(0, 20000);
  if (!title && !body.trim()) throw new BrowseGateError("Add a title or some note text before saving.", { code: "EMPTY_NOTE" });
  const timestamp = Date.now();
  const workspaceIds = [...new Set((Array.isArray(draft.workspaceIds) ? draft.workspaceIds : []).map(String).filter(Boolean))];
  const sourceId = String(draft.sourceId || "");
  return transact(["notes", "workspaces", "sources"], "readwrite", (tx, setResult) => {
    const store = tx.objectStore("notes");
    const request = draft.id ? store.get(String(draft.id)) : null;
    const put = (previous) => {
      const note = { id: draft.id || id(), title: title || body.trim().split("\n")[0].slice(0, 60), body, createdAt: previous?.createdAt ?? timestamp, updatedAt: timestamp,
        workspaceIds, sourceId, tags: Array.isArray(draft.tags) ? draft.tags.map((tag) => String(tag).trim()).filter(Boolean).slice(0, 20) : [], pinned: Boolean(draft.pinned ?? previous?.pinned) };
      store.put(note); setResult(note);
    };
    const invalid = (message, code) => abortTransaction(tx, new BrowseGateError(message, { code }));
    let checked = 0; let missing = ""; const total = workspaceIds.length + Number(Boolean(sourceId)) + Number(Boolean(draft.id));
    const checkDone = () => { if (++checked !== total) return; if (missing) invalid(missing, "NOTE_REFERENCE_NOT_FOUND"); else put(request?.result || null); };
    for (const workspaceId of workspaceIds) { const check = tx.objectStore("workspaces").get(workspaceId); check.onsuccess = () => { if (!check.result) missing = "A selected workspace no longer exists. Refresh and try again."; checkDone(); }; }
    if (sourceId) { const check = tx.objectStore("sources").get(sourceId); check.onsuccess = () => { if (!check.result) missing = "The selected source no longer exists. Refresh and try again."; checkDone(); }; }
    if (request) request.onsuccess = () => { if (!request.result) missing = "This note no longer exists. Refresh the notes list and try again."; checkDone(); };
    if (!total) put(null);
  });
}
export async function deleteNote(noteId) { return transact(["notes"], "readwrite", (tx) => tx.objectStore("notes").delete(noteId)); }
export async function toggleNotePin(noteId) {
  return transact(["notes"], "readwrite", (tx, setResult) => {
    const store = tx.objectStore("notes"); const request = store.get(noteId);
    request.onsuccess = () => { if (!request.result) return; const note = { ...request.result, pinned: !request.result.pinned, updatedAt: Date.now() }; store.put(note); setResult(note); };
  });
}
export async function getNote(noteId) { return transact(["notes"], "readonly", (tx) => requestValue(tx.objectStore("notes").get(noteId))); }
