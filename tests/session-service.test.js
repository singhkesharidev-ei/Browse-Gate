import test from "node:test";
import assert from "node:assert/strict";
import { captureWindowTabs, saveSession } from "../src/services/session-service.js";

test("session capture keeps available metadata and flags restricted tabs", async () => {
  globalThis.chrome = { tabs: { query: async () => [
    { id: 1, url: "https://example.com/path#section", title: "Example", favIconUrl: "https://example.com/icon.png", active: true },
    { id: 2, url: "chrome://settings", title: "Settings", active: false },
    { id: 3, title: "Unavailable", active: false },
  ] } };
  const tabs = await captureWindowTabs();
  assert.equal(tabs[0].url, "https://example.com/path#section");
  assert.equal(tabs[0].faviconUrl, "https://example.com/icon.png");
  assert.equal(tabs[0].active, true);
  assert.equal(tabs[0].restricted, false);
  assert.equal(tabs[1].restricted, true);
  assert.equal(tabs[2].restricted, true);
});

test("session capture reports Chrome tabs API failures", async () => {
  globalThis.chrome = { tabs: { query: async () => { throw new Error("denied"); } } };
  await assert.rejects(captureWindowTabs(), { code: "TABS_READ_FAILED" });
});

test("session saving rejects empty and restricted tab lists before persistence", async () => {
  await assert.rejects(saveSession({ name: "Empty", tabs: [] }), { code: "EMPTY_SESSION" });
  await assert.rejects(saveSession({ name: "Restricted", tabs: [{ url: "chrome://settings" }] }), { code: "RESTRICTED_URL" });
});
