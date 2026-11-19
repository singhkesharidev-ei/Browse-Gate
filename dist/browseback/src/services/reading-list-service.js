import { getAll, transact } from "../core/database.js";
import { listSources } from "./source-service.js";

export async function listReadingItems(query = "", status = "all", sort = "newest") {
  const [records, sources] = await Promise.all([getAll("readingList"), listSources()]);
  const byId = new Map(sources.map((source) => [source.id, source]));
  const term = String(query).trim().toLocaleLowerCase();
  return records.map((record) => ({ ...record, source: byId.get(record.sourceId) })).filter((item) => item.source && (status === "all" || item.status === status) && (!term || `${item.source.title} ${item.source.url} ${item.source.domain} ${item.note}`.toLocaleLowerCase().includes(term))).sort((a, b) => sort === "oldest" ? a.addedAt - b.addedAt : b.addedAt - a.addedAt);
}
export async function markForReading(sourceId, status = "unread") {
  const now = Date.now();
  return transact(["sources", "readingList"], "readwrite", (tx, setResult) => {
    const sourceStore = tx.objectStore("sources"); const request = sourceStore.get(sourceId);
    request.onsuccess = () => {
      if (!request.result) { try { tx.abort(); } catch {} return; }
      const reading = tx.objectStore("readingList"); const previousRequest = reading.get(sourceId);
      previousRequest.onsuccess = () => { const record = { sourceId, status: previousRequest.result?.status || status, note: previousRequest.result?.note || "", addedAt: previousRequest.result?.addedAt || now, updatedAt: now }; reading.put(record); setResult(record); };
    };
  });
}
export async function updateReadingItem(sourceId, patch) {
  return transact(["readingList"], "readwrite", (tx, setResult) => { const store = tx.objectStore("readingList"); const request = store.get(sourceId); request.onsuccess = () => { if (!request.result) return; const updated = { ...request.result, ...patch, updatedAt: Date.now() }; store.put(updated); setResult(updated); }; });
}
export async function removeReadingItem(sourceId) { return transact(["readingList"], "readwrite", (tx) => tx.objectStore("readingList").delete(sourceId)); }
