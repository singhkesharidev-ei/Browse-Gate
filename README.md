# BrowseGate

BrowseGate is a local-first research assistant for Google Chrome. It keeps saved webpages, notes, research workspaces, and browsing context together in a side panel, with practical tools for organizing and revisiting research.

The project folder also retains source files for a standalone C++ navigation-stack demonstration. The Chrome extension is the Manifest V3 application described below.

## Problem and intended users

Research often gets scattered across browser tabs, bookmarks, notes, and files. BrowseGate gives students, independent researchers, and knowledge workers one place to save useful pages, attach context, search what they have collected, and return to a group of tabs later. It is a lightweight personal workflow aid, not a replacement for library databases or professional reference-management software.

## Features

- Research workspaces, saved sources, linked notes, favorites, and duplicate detection.
- Toolbar popup and side-panel Quick Save for the active page.
- Local notes with autosave, pinning, search, and source/workspace links.
- Unified search across saved records and optional Chrome History.
- History search and Insights using Chrome's local History API, when permission is granted.
- Save, preview, edit, and restore eligible tabs as browser sessions.
- Reading List, citation formatting (APA 7, MLA 9, Chicago author-date), and local exports in Markdown, plain text, and JSON.
- Focus timer, text analyzer, and data-based smart insights.
- Light/dark theme, keyboard-operable navigation, responsive layout, and explicit optional-permission controls.

## Technology and architecture

BrowseGate is a dependency-free JavaScript ES module Chrome Extension using Manifest V3, the Side Panel API, IndexedDB, Chrome extension APIs, and plain HTML/CSS. The packaging and test commands use Node.js built-ins; no framework, build bundler, backend, account, or package installation is needed for core functionality.

`manifest.json` declares the extension entry points and permissions. `src/popup` contains the toolbar popup; `src/sidepanel` contains the UI and route handling; `src/services` contains focused data and feature services; `src/core` handles IndexedDB and errors; and `src/background` reconciles the alarm-backed focus timer. `scripts/package-extension.mjs` creates a clean loadable package at `dist/browseback`.

### Project structure

```text
manifest.json                  Chrome MV3 manifest
package.json                   Node scripts (no third-party dependencies)
scripts/package-extension.mjs  Extension packager
src/
  background/                  Service worker and focus timer alarms
  core/                        IndexedDB schema, transactions, errors
  icons/                       Extension icon assets
  popup/                       Toolbar popup
  services/                    Research, history, sessions, tools, exports
  sidepanel/                   Main application interface
  styles/                      Shared design tokens
tests/                         Node built-in test suite
dist/browseback/               Generated unpacked extension package
README.md                      Project and installation guide
FINAL_TEST_REPORT.md           Per-test automated results and manual checks
Browser_Sim.cpp, Stack.cpp,
main.cpp, matching headers     Retained C++ navigation-stack demo sources
```

## Installation in Chrome

This project is not installed from the Chrome Web Store. Use Google Chrome 116 or newer.

1. Obtain the project folder (for example, download or clone the project repository and extract it).
2. Install Node.js if it is not already available. No `npm install` or external dependencies are required.
3. Open a terminal in the project folder and build the extension package:

   ```powershell
   node scripts/package-extension.mjs
   ```

   If npm is available, the equivalent script is `npm run build:extension`.
4. In Chrome, open `chrome://extensions`.
5. Turn on **Developer mode**.
6. Select **Load unpacked** and choose the `dist/browseback` directory (the directory containing the generated `manifest.json`).
7. Use the BrowseGate toolbar icon to open its popup. Choose **Open BrowseGate** to open the side panel. Pin the icon from Chrome's Extensions menu if desired.
8. To inspect problems, open `chrome://extensions`, find BrowseGate, and select **Errors** if Chrome displays that link. Also inspect the side panel's visible error message; for developer details, open the service worker's **Inspect views** console from the extension card.
9. After editing source files, run the build command again, return to `chrome://extensions`, and select the extension's **Reload** button. Reloading may close extension pages; saved data should remain in that Chrome profile.

The generated package has no runtime installation step. The extension can be used without any backend.

## Development and tests

Edit files under `src/`. The package script copies the extension source and manifest into `dist/browseback`, then verifies that manifest entry points exist. The Node tests use only built-in modules.

```powershell
node --test tests/*.test.js
node scripts/package-extension.mjs
```

For a full browser check, load or reload `dist/browseback` as described above, then follow the demonstration sequence below and the manual test checklist in [FINAL_TEST_REPORT.md](FINAL_TEST_REPORT.md). Automated tests do not emulate Chrome's permission prompts, browser UI, extension lifecycle, or real history.

## Permissions and privacy

Required permissions: `sidePanel` opens the side panel; `storage` retains small preferences/timer state; `tabs` supports active-page Quick Save, tab capture, and session restore; `alarms` and `notifications` support focus timer completion.

Optional permissions: `history` is requested for History and Insights; `clipboardRead` and `clipboardWrite` are requested when the user chooses paste or copy.

Research records, notes, sessions, and reading status are kept in local IndexedDB in the Chrome profile. Theme and small preferences use `chrome.storage.local`. No telemetry, cloud service, account, bundled provider, or provider secret is included. The extension pages use a restrictive content security policy and do not load remote executable scripts.

## Exports, data, and limitations

Workspace exports are generated locally in Markdown (`.md`), plain text (`.txt`), or JSON (`.json`). Users can select source and note content and whether to include metadata. JSON export is a manual backup; JSON import/restore is not implemented. Deleting the extension or clearing its site data can remove locally stored records, so retain exports separately when a backup is needed.

Existing summary records from earlier BrowseGate versions remain in an existing browser profile’s IndexedDB. The current extension does not display or export them, and it does not delete or migrate them.

History analytics query up to 200 candidate URLs and count returned visits; they are not a complete time-spent or productivity measurement. History results depend on Chrome's stored history and permission. Restricted Chrome pages cannot be saved/restored as ordinary web pages. Citation output is a formatting aid: verify metadata, style details, and source claims before submission. No live Chrome runtime was available for automated validation.

## Live demonstration (about 4–6 minutes)

Use ordinary web pages you are comfortable saving. Do not seed or modify Chrome History. The sequence uses local features only:

1. **Open BrowseGate (20 sec):** open the toolbar popup, then the side panel; point out the local-first workspace.
2. **Create a workspace (30 sec):** create `Research Project` and briefly describe its topic.
3. **Collect pages (45 sec):** visit two or three relevant pages, use Quick Save, and associate them with the workspace. If internet access is unreliable, use pages already open.
4. **Add context and search (40 sec):** open a saved source, add a short note, then use universal search to find the source or note.
5. **Show tools (45 sec):** use the text analyzer or focus timer, then generate a citation from a saved source and inspect the missing-field notice.
6. **Export (35 sec):** preview a Markdown workspace export, download it, and open the downloaded `.md` file in a text editor.
7. **Save and restore a session (45 sec):** save the current tabs, preview the session, and restore the selected tabs. This opens new tabs and leaves existing tabs open.
8. **Show Insights (40 sec):** explain which metrics use saved BrowseGate records and which use optional Chrome History. Grant History access only if you want to show real history metrics; do not describe them as time spent.
9. **Close (20 sec):** point out Settings and the optional History and clipboard permissions.

Allow extra time for Chrome permission prompts, network loading, and file dialogs. Use only the features that work in the installed environment.

## Presentation notes

- **Product description:** BrowseGate is a Chrome side-panel research organizer that connects saved pages, notes, sessions, and lightweight research tools.
- **Problem:** useful pages and context become fragmented across tabs, bookmarks, and notes.
- **Objectives:** save sources quickly, group them by project, preserve personal context, search collected material, and return to a browsing setup.
- **Technology:** Manifest V3, JavaScript ES modules, HTML/CSS, Chrome APIs, IndexedDB, and Node's built-in test/packaging tools.
- **Architecture:** popup and side-panel UI call local feature services; services validate and persist structured records in IndexedDB; a service worker maintains timer alarms.
- **Privacy:** data remains in the browser profile; History and clipboard access are optional and action-triggered.
- **Testing:** automated service tests and package checks are documented in [FINAL_TEST_REPORT.md](FINAL_TEST_REPORT.md); live Chrome checks remain outstanding.
- **Future improvements:** implement validated JSON import/restore and perform and document a full Chrome accessibility/runtime test.

## License and project status

No license file is currently included; ask the project owner before redistribution. This is a student/demo project and has not undergone production security review. See [FINAL_TEST_REPORT.md](FINAL_TEST_REPORT.md) for exactly what was and was not verified.
#   B r o w s e - G a t e  
 