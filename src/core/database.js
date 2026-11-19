import { BrowseGateError } from "./errors.js";

const DB_NAME = "browseback";
const DB_VERSION = 6;
let opening;
const transactionErrors = new WeakMap();

const schema = {
  workspaces: { keyPath: "id", indexes: [["name", "name"], ["normalizedName", "normalizedName", { unique: true }], ["updatedAt", "updatedAt"]] },
  sources: { keyPath: "id", indexes: [["normalizedUrl", "normalizedUrl", { unique: true }], ["domain", "domain"], ["savedAt", "savedAt"]] },
  workspaceSources: { keyPath: "id", indexes: [["workspaceId", "workspaceId"], ["sourceId", "sourceId"], ["workspaceId_sourceId", ["workspaceId", "sourceId"], { unique: true }]] },
  notes: { keyPath: "id", indexes: [["updatedAt", "updatedAt"], ["sourceId", "sourceId"], ["pinned", "pinned"]] },
  sessions: { keyPath: "id", indexes: [["name", "name"], ["updatedAt", "updatedAt"], ["workspaceId", "workspaceId"]] },
  readingList: { keyPath: "sourceId", indexes: [["status", "status"], ["addedAt", "addedAt"]] },
};

export function upgradeSchema(db, transaction) {
  for (const [storeName, definition] of Object.entries(schema)) {
    const store = db.objectStoreNames.contains(storeName)
      ? transaction.objectStore(storeName)
      : db.createObjectStore(storeName, { keyPath: definition.keyPath });
    for (const [indexName, keyPath, options] of definition.indexes) {
      if (!store.indexNames.contains(indexName)) store.createIndex(indexName, keyPath, options);
    }
  }
  if (!db.objectStoreNames.contains("settings")) db.createObjectStore("settings", { keyPath: "key" });
}

export function planReferenceRepair({ workspaces = [], sources = [], workspaceSources = [], notes = [], sessions = [], readingList = [] }) {
  const workspaceIds = new Set(workspaces.map((item) => item.id)); const sourceIds = new Set(sources.map((item) => item.id));
  return {
    deleteLinks: workspaceSources.filter((link) => !workspaceIds.has(link.workspaceId) || !sourceIds.has(link.sourceId)),
    updateNotes: notes.filter((note) => (note.sourceId && !sourceIds.has(note.sourceId)) || (note.workspaceIds || []).some((id) => !workspaceIds.has(id))).map((note) => ({ ...note, sourceId: note.sourceId && sourceIds.has(note.sourceId) ? note.sourceId : "", workspaceIds: (note.workspaceIds || []).filter((id) => workspaceIds.has(id)) })),
    updateSessions: sessions.filter((session) => session.workspaceId && !workspaceIds.has(session.workspaceId)).map((session) => ({ ...session, workspaceId: "" })),
    deleteReadingItems: readingList.filter((item) => !sourceIds.has(item.sourceId)),
  };
}

function scheduleReferenceRepair(transaction) {
  const names = ["workspaces", "sources", "workspaceSources", "notes", "sessions", "readingList"];
  const data = {}; let remaining = names.length;
  for (const name of names) {
    const request = transaction.objectStore(name).getAll();
    request.onsuccess = () => {
      data[name] = request.result || [];
      if (--remaining) return;
      const repair = planReferenceRepair(data);
      const links = transaction.objectStore("workspaceSources"); repair.deleteLinks.forEach((link) => links.delete(link.id));
      const notes = transaction.objectStore("notes"); repair.updateNotes.forEach((note) => notes.put(note));
      const sessions = transaction.objectStore("sessions"); repair.updateSessions.forEach((session) => sessions.put(session));
      const reading = transaction.objectStore("readingList"); repair.deleteReadingItems.forEach((item) => reading.delete(item.sourceId));
    };
  }
}

function open() {
  if (opening) return opening;
  opening = new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) return reject(new BrowseGateError("This browser does not support local research storage.", { code: "STORAGE_UNAVAILABLE" }));
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    let blocked = false;
    request.onupgradeneeded = (event) => {
      upgradeSchema(request.result, request.transaction);
      if (event.oldVersion > 0) scheduleReferenceRepair(request.transaction);
    };
    request.onsuccess = () => {
      if (blocked) { request.result.close(); return; }
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(new BrowseGateError("BrowseGate could not open its local database. Existing data has not been reset.", { cause: request.error, code: "DATABASE_OPEN_FAILED" }));
    request.onblocked = () => { blocked = true; reject(new BrowseGateError("Close other BrowseGate panels or tabs to finish updating its local database. Existing records have not been reset.", { code: "DATABASE_BLOCKED" })); };
  }).catch((error) => { opening = undefined; throw error; });
  return opening;
}

export async function initializeDatabase() { await open(); }

export async function transact(storeNames, mode, operation) {
  const db = await open();
  return new Promise((resolve, reject) => {
    let result;
    let settled = false;
    let tx;
    try { tx = db.transaction(storeNames, mode); }
    catch (error) { reject(new BrowseGateError("BrowseGate could not open a database transaction. Your existing data has not been changed.", { cause: error, code: "DATABASE_TRANSACTION_START_FAILED" })); return; }
    const fail = (error) => {
      if (settled) return;
      settled = true;
      const reason = transactionErrors.get(tx);
      reject(reason || (error instanceof BrowseGateError ? error : new BrowseGateError("BrowseGate could not save or read local data. Your existing data has not been reset.", { cause: error ?? tx.error, code: "DATABASE_TRANSACTION_FAILED" })));
    };
    tx.oncomplete = () => { if (!settled) { settled = true; resolve(result); } };
    tx.onerror = () => fail(tx.error);
    tx.onabort = () => fail(tx.error);
    try {
      result = operation(tx, (value) => { result = value; });
      if (result && typeof result.then === "function") result.catch(() => {});
    } catch (error) {
      try { tx.abort(); } catch { /* transaction may already be inactive */ }
      fail(error);
    }
  });
}

export function abortTransaction(tx, error) {
  if (error) transactionErrors.set(tx, error);
  try { tx.abort(); } catch { /* The transaction may already have finished. */ }
}

export function requestValue(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getAll(storeName) {
  return transact([storeName], "readonly", (tx) => requestValue(tx.objectStore(storeName).getAll()));
}

export const preferences = {
  async get(key, fallback) {
    try { const data = await chrome.storage.local.get(key); return data[key] ?? fallback; }
    catch (error) { throw new BrowseGateError("Could not read BrowseGate preferences.", { cause: error, code: "PREFERENCES_READ_FAILED" }); }
  },
  async set(values) {
    try { await chrome.storage.local.set(values); }
    catch (error) { throw new BrowseGateError("Could not save BrowseGate preferences.", { cause: error, code: "PREFERENCES_WRITE_FAILED" }); }
  },
};
