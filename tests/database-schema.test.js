import test from "node:test";
import assert from "node:assert/strict";
import { planReferenceRepair, upgradeSchema } from "../src/core/database.js";

function nameList(values = []) { return { values, contains(name) { return this.values.includes(name); }, add(name) { if (!this.contains(name)) this.values.push(name); } }; }
function makeStore(keyPath) { return { keyPath, indexNames: nameList(), indexes: [], createIndex(name, key, options) { this.indexNames.add(name); this.indexes.push({ name, key, options }); }, records: new Map() }; }
function makeDatabase(existing = {}) {
  const stores = new Map(Object.entries(existing));
  const db = { objectStoreNames: nameList([...stores.keys()]), stores, createObjectStore(name, options) { const store = makeStore(options.keyPath); stores.set(name, store); this.objectStoreNames.add(name); return store; } };
  const transaction = { objectStore(name) { return stores.get(name); } };
  return { db, transaction };
}

test("schema upgrades create all stores and missing indexes while preserving existing records", () => {
  const oldSources = makeStore("id"); oldSources.records.set("keep", { id: "keep", title: "Existing record" });
  const { db, transaction } = makeDatabase({ sources: oldSources, workspaces: makeStore("id") });
  upgradeSchema(db, transaction);
  assert.equal(db.objectStoreNames.contains("summaries"), false);
  assert.ok(db.objectStoreNames.contains("readingList"));
  assert.ok(db.objectStoreNames.contains("settings"));
  assert.ok(oldSources.indexNames.contains("normalizedUrl"));
  assert.deepEqual(oldSources.records.get("keep"), { id: "keep", title: "Existing record" });
});

test("schema upgrades preserve the legacy saved-summary store and its records without using it", () => {
  const summaries = makeStore("id"); summaries.records.set("sum1", { id: "sum1", text: "Previously saved data" });
  const { db, transaction } = makeDatabase({ summaries });
  upgradeSchema(db, transaction);
  assert.equal(db.objectStoreNames.contains("summaries"), true);
  assert.deepEqual(summaries.records.get("sum1"), { id: "sum1", text: "Previously saved data" });
});

test("re-running an upgrade leaves existing indexes alone", () => {
  const { db, transaction } = makeDatabase();
  upgradeSchema(db, transaction);
  const sourceIndexes = db.stores.get("sources").indexes.length;
  upgradeSchema(db, transaction);
  assert.equal(db.stores.get("sources").indexes.length, sourceIndexes);
});

test("reference repair removes dangling links while preserving notes and sessions", () => {
  const plan = planReferenceRepair({
    workspaces: [{ id: "w1" }], sources: [{ id: "s1" }],
    workspaceSources: [{ id: "w1:s1", workspaceId: "w1", sourceId: "s1" }, { id: "w9:s1", workspaceId: "w9", sourceId: "s1" }],
    notes: [{ id: "n1", body: "Keep me", sourceId: "gone", workspaceIds: ["w1", "w9"] }],
    sessions: [{ id: "session1", name: "Keep session", workspaceId: "gone", tabs: [{ url: "https://example.com" }] }],
    readingList: [{ sourceId: "gone" }],
  });
  assert.deepEqual(plan.deleteLinks.map((item) => item.id), ["w9:s1"]);
  assert.deepEqual(plan.updateNotes[0], { id: "n1", body: "Keep me", sourceId: "", workspaceIds: ["w1"] });
  assert.deepEqual(plan.updateSessions[0], { id: "session1", name: "Keep session", workspaceId: "", tabs: [{ url: "https://example.com" }] });
  assert.deepEqual(plan.deleteReadingItems.map((item) => item.sourceId), ["gone"]);
});
