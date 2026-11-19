import { abortTransaction, getAll, requestValue, transact } from "../core/database.js";
import { BrowseGateError } from "../core/errors.js";
import { domainFromUrl, normalizeUrl } from "./url-service.js";

const id = () => crypto.randomUUID();
export async function listSources(workspaceId) {
  const [sources, links, notes] = await Promise.all([getAll("sources"), getAll("workspaceSources"), getAll("notes")]);
  const allowed = workspaceId ? new Set(links.filter((link) => link.workspaceId === workspaceId).map((link) => link.sourceId)) : null;
  return sources.filter((source) => !allowed || allowed.has(source.id))
    .map((source) => ({ ...source, relatedNotes: notes.filter((note) => note.sourceId === source.id) }))
    .sort((a, b) => b.savedAt - a.savedAt);
}
export async function findSourceByUrl(rawUrl) {
  const normalizedUrl = normalizeUrl(rawUrl);
  return transact(["sources"], "readonly", (tx) => requestValue(tx.objectStore("sources").index("normalizedUrl").get(normalizedUrl)));
}
export async function saveSource(metadata, workspaceId = "") {
  const url = normalizeUrl(metadata.url);
  const normalizedUrl = normalizeUrl(metadata.url);
  const timestamp = Date.now();
  return transact(["sources", "workspaceSources", "workspaces"], "readwrite", (tx, setResult) => {
    const sources = tx.objectStore("sources");
    const lookup = sources.index("normalizedUrl").get(normalizedUrl);
    lookup.onsuccess = () => {
      const previous = lookup.result;
      const source = previous ? { ...previous, title: metadata.title?.trim() || previous.title, updatedAt: timestamp } : {
        id: id(), url, normalizedUrl, title: metadata.title?.trim() || domainFromUrl(url) || url, domain: domainFromUrl(url),
        faviconUrl: metadata.faviconUrl || "", description: metadata.description?.trim() || "", note: "", savedAt: timestamp, createdAt: timestamp, updatedAt: timestamp,
      };
      if (!previous) sources.add(source); else sources.put(source);
      if (!workspaceId) { setResult({ source, existed: Boolean(previous), associated: false }); return; }
      const workspaces = tx.objectStore("workspaces");
      const workspaceRequest = workspaces.get(workspaceId);
      workspaceRequest.onsuccess = () => {
        if (!workspaceRequest.result) { abortTransaction(tx, new BrowseGateError("The selected workspace no longer exists. Refresh and try again.", { code: "WORKSPACE_NOT_FOUND" })); return; }
        const links = tx.objectStore("workspaceSources");
        const linkId = `${workspaceId}:${source.id}`;
        const linkRequest = links.get(linkId);
        linkRequest.onsuccess = () => {
          const associated = !linkRequest.result;
          if (associated) links.add({ id: linkId, workspaceId, sourceId: source.id, createdAt: timestamp });
          workspaces.put({ ...workspaceRequest.result, updatedAt: timestamp });
          setResult({ source, existed: Boolean(previous), associated });
        };
      };
    };
  });
}
export async function addSourceToWorkspace(sourceId, workspaceId) {
  return transact(["sources", "workspaceSources", "workspaces"], "readwrite", (tx, setResult) => {
    const sources = tx.objectStore("sources"); const workspaces = tx.objectStore("workspaces");
    const [sr, wr] = [sources.get(sourceId), workspaces.get(workspaceId)];
    let source; let workspace; let ready = 0;
    const finish = () => {
      if (++ready !== 2) return;
      if (!source || !workspace) { abortTransaction(tx, new BrowseGateError(!source ? "This saved source no longer exists." : "The selected workspace no longer exists.", { code: !source ? "SOURCE_NOT_FOUND" : "WORKSPACE_NOT_FOUND" })); return; }
      const links = tx.objectStore("workspaceSources"); const linkId = `${workspaceId}:${sourceId}`; const lookup = links.get(linkId);
      lookup.onsuccess = () => { const added = !lookup.result; if (added) links.add({ id: linkId, workspaceId, sourceId, createdAt: Date.now() }); workspace.updatedAt = Date.now(); workspaces.put(workspace); setResult(added); };
    };
    sr.onsuccess = () => { source = sr.result; finish(); }; wr.onsuccess = () => { workspace = wr.result; finish(); };
  });
}
export async function removeSourceFromWorkspace(sourceId, workspaceId) {
  return transact(["workspaceSources", "workspaces"], "readwrite", (tx) => {
    tx.objectStore("workspaceSources").delete(`${workspaceId}:${sourceId}`);
    const store = tx.objectStore("workspaces"); const request = store.get(workspaceId);
    request.onsuccess = () => { if (request.result) store.put({ ...request.result, updatedAt: Date.now() }); };
  });
}
export async function deleteSource(sourceId) {
  return transact(["sources", "workspaceSources", "notes", "readingList"], "readwrite", (tx) => {
    tx.objectStore("sources").delete(sourceId);
    tx.objectStore("readingList").delete(sourceId);
    const links = tx.objectStore("workspaceSources"); const linkRequest = links.index("sourceId").getAll(sourceId);
    linkRequest.onsuccess = () => linkRequest.result.forEach((link) => links.delete(link.id));
    const notes = tx.objectStore("notes"); const noteRequest = notes.index("sourceId").getAll(sourceId);
    noteRequest.onsuccess = () => noteRequest.result.forEach((note) => { note.sourceId = ""; note.updatedAt = Date.now(); notes.put(note); });
  });
}
export async function updateSourceNote(sourceId, note) {
  const text = String(note ?? "").trim().slice(0, 2000);
  return transact(["sources"], "readwrite", (tx, setResult) => {
    const store = tx.objectStore("sources"); const request = store.get(sourceId);
    request.onsuccess = () => { if (!request.result) { abortTransaction(tx, new BrowseGateError("This saved source no longer exists.", { code: "SOURCE_NOT_FOUND" })); return; } const updated = { ...request.result, note: text, updatedAt: Date.now() }; store.put(updated); setResult(updated); };
  });
}

export async function updateSourceMetadata(sourceId, metadata) {
  return transact(["sources"], "readwrite", (tx, setResult) => {
    const store = tx.objectStore("sources"); const request = store.get(sourceId);
    request.onsuccess = () => { if (!request.result) { try { tx.abort(); } catch {} return; } const updated = { ...request.result, metadata: { ...(request.result.metadata || {}), author: String(metadata.author || "").trim(), title: String(metadata.title || "").trim(), publisher: String(metadata.publisher || "").trim(), date: String(metadata.date || "").trim(), url: String(metadata.url || "").trim() }, updatedAt: Date.now() }; store.put(updated); setResult(updated); };
  });
}

export async function saveCitation(sourceId, citation) {
  return transact(["sources"], "readwrite", (tx, setResult) => {
    const store = tx.objectStore("sources"); const request = store.get(sourceId);
    request.onsuccess = () => { if (!request.result) { try { tx.abort(); } catch {} return; } const citations = request.result.citations || []; const saved = { id: crypto.randomUUID(), ...citation, createdAt: Date.now() }; const updated = { ...request.result, citations: [...citations, saved], updatedAt: Date.now() }; store.put(updated); setResult(saved); };
  });
}
