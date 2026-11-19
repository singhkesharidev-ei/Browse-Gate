import test from "node:test";
import assert from "node:assert/strict";
import { scoreSearchResult } from "../src/services/search-service.js";

test("universal search ranks exact and partial title hits above other fields", () => {
  assert.equal(scoreSearchResult("vector", { title: "vector" }), 5);
  assert.equal(scoreSearchResult("vector", { title: "Vector search notes" }), 4);
  assert.equal(scoreSearchResult("vector", { title: "Reference", url: "https://example.com/vector" }), 3);
  assert.equal(scoreSearchResult("vector", { title: "Reference", body: "vector erase" }), 2);
  assert.equal(scoreSearchResult("vector", { title: "Reference", description: "vector approach" }), 1);
  assert.equal(scoreSearchResult("vector", { title: "Reference" }), 0);
});

test("search matching trims and ignores case", () => {
  assert.equal(scoreSearchResult("  VECTOR ", { title: "Vector" }), 5);
});
