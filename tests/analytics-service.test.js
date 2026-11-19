import test from "node:test";
import assert from "node:assert/strict";
import { buildHomePreview, buildInsights, calculateAnalytics } from "../src/services/analytics-service.js";

test("Home preview metrics reflect current local records and show zero for empty storage", () => {
  assert.deepEqual(buildHomePreview(), [
    { id: "saved-sources", label: "Saved sources", value: 0 },
    { id: "notes", label: "Notes", value: 0 },
  ]);
  assert.deepEqual(buildHomePreview({ sources: [{ id: "s1" }, { id: "s2" }], notes: [{ id: "n1" }] }), [
    { id: "saved-sources", label: "Saved sources", value: 2 },
    { id: "notes", label: "Notes", value: 1 },
  ]);
});

test("analytics distinguishes visits, URLs, domains, workspaces, notes, sessions, and reading progress", () => {
  const now = Date.now();
  const data = calculateAnalytics({ now, visits: [
    { url: "https://example.com/a", title: "A", visitTime: now - 1000 },
    { url: "https://example.com/a", title: "A", visitTime: now - 900 },
    { url: "https://other.test/b", title: "B", visitTime: now - 800 },
  ], sources: [{ id: "s", url: "https://example.com/a", normalizedUrl: "same", savedAt: now - 40 * 86400000 }, { id: "s2", url: "https://example.com/a", normalizedUrl: "same", savedAt: now - 40 * 86400000 }], workspaces: [{ id: "w", name: "Research" }], links: [{ id: "w:s", workspaceId: "w", sourceId: "s" }], notes: [], sessions: [{}], reading: [{ status: "completed" }, { status: "unread" }] });
  assert.equal(data.recordedVisitCount, 3);
  assert.equal(data.uniqueUrlCount, 2);
  assert.equal(data.uniqueDomainCount, 2);
  assert.equal(data.domains[0].domain, "example.com");
  assert.equal(data.domains[0].visits, 2);
  assert.equal(data.workspaceSources[0].savedSources, 1);
  assert.equal(data.sessionCount, 1);
  assert.deepEqual(data.reading, { total: 2, unread: 1, inProgress: 0, completed: 1 });
  assert.equal(data.duplicateSavedUrls, 1);
});

test("insights are grounded in supplied data and dismissed insights do not repeat", () => {
  const data = calculateAnalytics({ visits: [{ url: "https://example.com", visitTime: Date.now() }], workspaces: [{ id: "w", name: "Topic" }], links: [{ workspaceId: "w", sourceId: "s" }] });
  const insights = buildInsights({ ...data, historyAvailable: true });
  assert.ok(insights.some((item) => item.id.startsWith("top-domain:example.com")));
  assert.ok(insights.some((item) => item.id === "workspace-no-notes:w"));
  assert.ok(!insights.some((item) => item.title.includes("unproductive")));
  assert.ok(buildInsights({ ...data, historyAvailable: true }, { dismissed: ["workspace-no-notes:w"] }).every((item) => item.id !== "workspace-no-notes:w"));
  assert.equal(buildInsights({ ...data, domains: [], historyAvailable: true }).some((item) => item.id.startsWith("top-domain:")), false);
  assert.ok(buildInsights({ ...data, domains: [], historyAvailable: false }).some((item) => item.id === "history-unavailable"));
});
