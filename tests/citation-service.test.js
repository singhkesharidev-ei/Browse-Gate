import test from "node:test";
import assert from "node:assert/strict";
import { formatCitation } from "../src/services/citation-service.js";

const fixed = new Date("2025-01-02T00:00:00Z");
test("APA 7 citation uses supplied fields without inventing missing author or date", () => {
  const result = formatCitation({ title: "A Study", publisher: "Example Journal", url: "https://example.com/a", includeAccessDate: true }, "apa7", fixed);
  assert.match(result.text, /\(n\.d\.\)/);
  assert.match(result.text, /A Study/);
  assert.match(result.text, /Retrieved January 2, 2025/);
  assert.deepEqual(result.missing, ["author", "publication date"]);
});

test("MLA 9 and Chicago author-date formats include available author/date and URL", () => {
  const metadata = { author: "Ada Lovelace", title: "Notes on Computing", publisher: "Example Archive", date: "1843-08-01", url: "https://example.org/notes" };
  assert.match(formatCitation(metadata, "mla9", fixed).text, /Ada Lovelace/);
  assert.match(formatCitation(metadata, "mla9", fixed).text, /1 Aug 1843/);
  assert.match(formatCitation(metadata, "mla9", fixed).text, /https:\/\/example.org\/notes/);
  assert.match(formatCitation(metadata, "chicago-author-date", fixed).text, /1843/);
});
