import test from "node:test";
import assert from "node:assert/strict";
import { buildWorkspaceExport } from "../src/services/export-service.js";

const workspace = { id: "w1", name: "Climate: Research?", description: "A *useful* project" };
const source = { id: "s1", title: "Page *one*", url: "https://example.com/a?x=1", domain: "example.com", note: "Private <script>alert(1)</script>", metadata: { author: "A. Author" }, citations: [{ style: "APA 7", text: "A citation" }], relatedNotes: [{ id: "n1", title: "Context", body: "Keep (these) notes." }] };

test("Markdown export includes source URLs, safely escaped notes, and citations", () => {
  const output = buildWorkspaceExport(workspace, [source], { format: "markdown" });
  assert.match(output.filename, /^Climate- Research-.*\.md$/);
  assert.match(output.content, /https:\/\/example\.com\/a\?x=1/);
  assert.match(output.content, /\\\*one\\\*/);
  assert.match(output.content, /A citation/);
  assert.doesNotMatch(output.content, /<script>/);
});

test("plain text export can exclude sensitive page and related notes", () => {
  const output = buildWorkspaceExport(workspace, [source], { format: "text", excludedSensitiveNotes: ["s1:page", "s1:n1"] });
  assert.match(output.content, /https:\/\/example\.com\/a\?x=1/);
  assert.doesNotMatch(output.content, /Private|Context|Keep/);
});

test("plain text includes workspace notes and independently selectable metadata and tags", () => {
  const taggedSource = { ...source, tags: ["policy", "review"] };
  const output = buildWorkspaceExport(workspace, [taggedSource], { format: "text", includeTitle: false, workspaceNotes: [{ id: "wn1", title: "Decision", body: "Keep this in scope." }] });
  assert.doesNotMatch(output.content, /Climate: Research\?/);
  assert.match(output.content, /Tags: policy, review/);
  assert.match(output.content, /Workspace notes/);
  assert.match(output.content, /Keep this in scope/);
});

test("JSON backup export preserves source identity and selected notes", () => {
  const output = buildWorkspaceExport(workspace, [source], { format: "json" });
  const parsed = JSON.parse(output.content);
  assert.equal(parsed.sources[0].id, "s1");
  assert.equal(parsed.sources[0].notes[0].id, "n1");
});

test("workspace export excludes legacy summary fields and protects reserved device filenames", () => {
  const output = buildWorkspaceExport({ id: "w2", name: "CON" }, [{ ...source, summary: "Previously saved data." }], { format: "json" });
  assert.match(output.filename, /^_CON-/);
  assert.equal("summary" in JSON.parse(output.content).sources[0], false);
});
