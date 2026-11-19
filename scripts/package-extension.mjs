import { access, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageRoot = path.join(projectRoot, "dist", "browseback");
await rm(packageRoot, { recursive: true, force: true });
await mkdir(packageRoot, { recursive: true });
await cp(path.join(projectRoot, "src"), path.join(packageRoot, "src"), { recursive: true, force: true });
await cp(path.join(projectRoot, "manifest.json"), path.join(packageRoot, "manifest.json"), { force: true });
const manifest = JSON.parse(await readFile(path.join(packageRoot, "manifest.json"), "utf8"));
const entrypoints = [manifest.action.default_popup, manifest.side_panel.default_path, manifest.background.service_worker, manifest.icons?.["128"], manifest.action.default_icon?.["128"]].filter(Boolean);
for (const entrypoint of entrypoints) {
  await access(path.join(packageRoot, entrypoint)).catch(() => { throw new Error(`The extension package is missing ${entrypoint}.`); });
}
await writeFile(path.join(packageRoot, "README.md"), `# BrowseGate Chrome extension\n\nLoad this folder as an unpacked extension in Chrome 116 or newer: open chrome://extensions, enable Developer mode, select Load unpacked, and choose this folder.\n\nBrowseGate stores workspaces, saved pages, notes, sessions, reading status, citations, and timer state locally. History is read locally for History and Insights. The former Article Summarizer is not available in the current interface; existing saved summary records remain in local storage and are not displayed or exported.\n\nClipboard access happens only after a user selects copy or paste. The focus timer uses Chrome alarms and may show a completion notification. Review citations before submission. Citation output is a formatting aid, not a source verification service.\n`);
console.log(`Packaged BrowseGate ${manifest.version} at ${packageRoot}`);
