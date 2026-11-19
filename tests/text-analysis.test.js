import test from "node:test";
import assert from "node:assert/strict";
import { analyzeText } from "../src/services/text-analysis.js";

test("empty input returns zero counts", () => assert.deepEqual(analyzeText(""), { words: 0, characters: 0, charactersNoSpaces: 0, sentences: 0, paragraphs: 0, readingMinutes: 0 }));
test("Unicode words, whitespace, sentence and paragraph counts are stable", () => {
  const result = analyzeText("  Hello,  world!\n\nCafé 世界。\u2028Next line?  ");
  assert.equal(result.words, 6);
  assert.equal(result.sentences, 3);
  assert.equal(result.paragraphs, 3);
  assert.equal(result.characters, [..."  Hello,  world!\n\nCafé 世界。\u2028Next line?  "].length);
});
