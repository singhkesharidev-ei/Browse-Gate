import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sidepanelPath = new URL("../src/sidepanel/sidepanel.js", import.meta.url);
const sidepanelCssPath = new URL("../src/sidepanel/sidepanel.css", import.meta.url);
const manifestPath = new URL("../manifest.json", import.meta.url);
const removedModules = [
  new URL("../src/services/article-extraction.js", import.meta.url),
  new URL("../src/services/summarization-service.js", import.meta.url),
  new URL("../dist/browseback/src/services/article-extraction.js", import.meta.url),
  new URL("../dist/browseback/src/services/summarization-service.js", import.meta.url),
];

test("the side panel exposes no Article Summarizer UI route or controls", async () => {
  const sidepanel = await readFile(sidepanelPath, "utf8");
  const css = await readFile(sidepanelCssPath, "utf8");

  for (const reference of [
    "data-tool=\"summarizer\"",
    "open-summary-tool",
    "renderSummarizer",
    "extract-article",
    "summarize-local",
    "copy-saved-summary",
    "export-summaries",
    "Local summaries",
    "Article summarizer",
  ]) {
    assert.equal(sidepanel.includes(reference), false, `unexpected side-panel UI reference: ${reference}`);
  }
  assert.equal(css.includes(".summary-text"), false, "summarizer-only styling should be removed");
});

test("page-injection permissions are not requested after removing the extraction UI", async () => {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  assert.equal(manifest.permissions.includes("activeTab"), false);
  assert.equal(manifest.permissions.includes("scripting"), false);
});

test("summarizer and page-extraction implementation modules are removed from source and package", async () => {
  for (const moduleUrl of removedModules) {
    await assert.rejects(readFile(moduleUrl), { code: "ENOENT" });
  }
});
