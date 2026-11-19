import test from "node:test";
import assert from "node:assert/strict";
import { normalizeUrl, domainFromUrl } from "../src/services/url-service.js";

test("normalization drops fragments and normalizes host/default port", () => {
  assert.equal(normalizeUrl("HTTPS://WWW.Example.COM:443/research/#section"), "https://www.example.com/research/");
});

test("meaningful query parameters are retained during deduplication", () => {
  assert.equal(normalizeUrl("https://example.com/search?q=vector&page=2#results"), "https://example.com/search?q=vector&page=2");
  assert.notEqual(normalizeUrl("https://example.com/search?q=vector"), normalizeUrl("https://example.com/search?q=history"));
});

test("HTTP and HTTPS remain distinct, and non-default ports remain", () => {
  assert.equal(normalizeUrl("http://example.com:8080/path"), "http://example.com:8080/path");
  assert.notEqual(normalizeUrl("http://example.com/path"), normalizeUrl("https://example.com/path"));
});

test("restricted browser pages and malformed URLs are rejected", () => {
  assert.throws(() => normalizeUrl("chrome://settings"), { code: "RESTRICTED_URL" });
  assert.throws(() => normalizeUrl("not a URL"), { code: "INVALID_URL" });
});

test("domain extraction does not invent data for invalid URLs", () => {
  assert.equal(domainFromUrl("https://www.example.com/a"), "example.com");
  assert.equal(domainFromUrl("not a URL"), "");
});
