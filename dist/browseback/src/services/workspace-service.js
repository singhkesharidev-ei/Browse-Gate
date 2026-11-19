import { abortTransaction, getAll, requestValue, transact } from "../core/database.js";
import { BrowseGateError } from "../core/errors.js";

const makeId = () => crypto.randomUUID();
const clean = (value) => String(value ?? "").trim();

export async function listWorkspaces(query = "") {
  const [workspaces, links, notes] = await Promise.all([getAll("workspaces"), getAll("workspaceSources"), getAll("notes")]);
  const term = clean(query).toLocaleLowerCase();
  return workspaces.filter((item) => !term || `${item.name} ${item.description}`.toLocaleLowerCase().includes(term))
    .map((item) => ({ ...item, sourceCount: links.filter((link) => link.workspaceId === item.id).length, noteCount: notes.filter((note) => note.workspaceIds?.includes(item.id)).length }))
    .sort((a, b) => Number(b.isFavorite) - Number(a.isFavorite) || b.updatedAt - a.updatedAt);
}

export async function getWorkspace(id) {
  return transact(["workspaces"], "readonly", (tx) => requestValue(tx.objectStore("workspaces").get(id)));
}

export async function saveWorkspace({ id, name, description = "", isFavorite }) {
  const normalizedName = clean(name);
  if (!normalizedName) throw new BrowseGateError("Enter a workspace name.", { code: "INVALID_WORKSPACE_NAME" });
  if (normalizedName.length > 80) throw new BrowseGateError("Workspace names must be 80 characters or fewer.", { code: "INVALID_WORKSPACE_NAME" });
  const normalizedDescription = clean(description);
  if (normalizedDescription.length > 500) throw new BrowseGateError("Descriptions must be 500 characters or fewer.", { code: "INVALID_WORKSPACE_DESCRIPTION" });
  const all = await getAll("workspaces");
  if (all.some((item) => item.id !== id && item.name.toLocaleLowerCase() === normalizedName.toLocaleLowerCase())) {
    throw new BrowseGateError("A workspace with that name already exists.", { code: "DUPLICATE_WORKSPACE" });
  }
  const timestamp = Date.now();
  return transact(["workspaces"], "readwrite", (tx, setResult) => {
    const store = tx.objectStore("workspaces");
    const write = (previous) => {
      if (id && !previous) { abortTransaction(tx, new BrowseGateError("This workspace no longer exists. Refresh the workspace list and try again.", { code: "WORKSPACE_NOT_FOUND" })); return; }
      const duplicate = all.some((item) => item.id !== id && item.name.toLocaleLowerCase() === normalizedName.toLocaleLowerCase());
      if (duplicate) { abortTransaction(tx, new BrowseGateError("A workspace with that name already exists.", { code: "DUPLICATE_WORKSPACE" })); return; }
      const workspace = { id: id || makeId(), name: normalizedName, normalizedName: normalizedName.toLocaleLowerCase(), description: normalizedDescription, isFavorite: isFavorite ?? previous?.isFavorite ?? false, createdAt: previous?.createdAt ?? timestamp, updatedAt: timestamp };
      store.put(workspace); setResult(workspace);
    };
    if (id) { const request = store.get(id); request.onsuccess = () => write(request.result); }
    else write(null);
  });
}

export async function toggleFavorite(id) {
  return transact(["workspaces"], "readwrite", (tx, setResult) => {
    const store = tx.objectStore("workspaces");
    const request = store.get(id);
    request.onsuccess = () => {
      if (!request.result) return;
      const workspace = { ...request.result, isFavorite: !request.result.isFavorite, updatedAt: Date.now() };
      store.put(workspace); setResult(workspace);
    };
  });
}

// Deletion removes workspace links and memberships from notes and sessions. Sources remain saved globally;
// notes and sessions remain available, including attached source/tab data, even if they become unfiled.
export async function deleteWorkspace(id) {
  return transact(["workspaces", "workspaceSources", "notes", "sessions"], "readwrite", (tx) => {
    tx.objectStore("workspaces").delete(id);
    const links = tx.objectStore("workspaceSources");
    const linkRequest = links.index("workspaceId").getAll(id);
    linkRequest.onsuccess = () => linkRequest.result.forEach((link) => links.delete(link.id));
    const notes = tx.objectStore("notes");
    const noteRequest = notes.getAll();
    noteRequest.onsuccess = () => noteRequest.result.filter((note) => note.workspaceIds?.includes(id)).forEach((note) => {
      note.workspaceIds = note.workspaceIds.filter((workspaceId) => workspaceId !== id); note.updatedAt = Date.now(); notes.put(note);
    });
    const sessions = tx.objectStore("sessions");
    const sessionRequest = sessions.index("workspaceId").getAll(id);
    sessionRequest.onsuccess = () => sessionRequest.result.forEach((session) => sessions.put({ ...session, workspaceId: "", updatedAt: Date.now() }));
  });
}
