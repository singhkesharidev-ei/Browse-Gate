import test from "node:test";
import assert from "node:assert/strict";
import { searchHistory } from "../src/services/history-service.js";

test("history search requests a bounded range and sorts recent or frequent visits", async () => {
  let queryArgs;
  globalThis.chrome = { history: { search: async (args) => {
    queryArgs = args;
    return [
      { id: "1", url: "https://example.com/old", title: "Old", visitCount: 9, lastVisitTime: 100 },
      { id: "2", url: "https://example.com/new", title: "New", visitCount: 2, lastVisitTime: 300 },
    ];
  } } };
  const recent = await searchHistory({ query: "research", range: "week", limit: 900 });
  assert.equal(queryArgs.text, "research");
  assert.equal(queryArgs.maxResults, 500);
  assert.ok(Date.now() - queryArgs.startTime <= 7 * 24 * 60 * 60 * 1000 + 50);
  assert.equal(recent[0].id, "2");
  const frequent = await searchHistory({ sort: "frequent", range: "day" });
  assert.equal(frequent[0].id, "1");
});

test("history search applies domain filters and drops non-web and missing URLs", async () => {
  globalThis.chrome = { history: { search: async () => [
    { id: "1", url: "https://www.example.com/a", visitCount: 1 },
    { id: "2", url: "https://other.test/b", visitCount: 1 },
    { id: "3", url: "chrome://settings", visitCount: 3 },
    { id: "4", title: "Missing URL" },
  ] } };
  const results = await searchHistory({ domain: "example.com", range: "month" });
  assert.deepEqual(results.map((entry) => entry.id), ["1"]);
  assert.equal(results[0].title, "Untitled page");
  assert.equal(results[0].domain, "example.com");
});

test("history API errors become useful permission messages", async () => {
  globalThis.chrome = { history: { search: async () => { throw new Error("permission denied"); } } };
  await assert.rejects(searchHistory(), { code: "HISTORY_READ_FAILED", message: /History permission/ });
});
