import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("extension metadata and entry-point titles use BrowseGate branding", async () => {
  const manifest = JSON.parse(await read("../manifest.json"));
  const popup = await read("../src/popup/popup.html");
  const sidepanel = await read("../src/sidepanel/sidepanel.html");

  assert.equal(manifest.name, "BrowseGate");
  assert.match(manifest.action.default_title, /BrowseGate/);
  assert.match(popup, /<title>BrowseGate Quick Save<\/title>/);
  assert.match(sidepanel, /<title>BrowseGate<\/title>/);
});

test("console demo no longer identifies itself by its retired project title", async () => {
  const source = await read("../main.cpp");
  const binary = await readFile(new URL("../a.exe", import.meta.url));

  assert.match(source, /BROWSEGATE NAVIGATION DEMO/);
  assert.equal(binary.includes(Buffer.from("BROWSEGATE NAVIGATION DEMO")), true);
});
