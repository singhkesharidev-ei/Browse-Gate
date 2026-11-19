import { initializeDatabase, preferences } from "../core/database.js";
import { readableError } from "../core/errors.js";
import { listWorkspaces } from "../services/workspace-service.js";
import { findSourceByUrl, saveSource, addSourceToWorkspace, updateSourceNote } from "../services/source-service.js";
import { getActivePage } from "../services/quick-save.js";

const pageNode = document.querySelector("#page");
const messageNode = document.querySelector("#message");
let activePage;
let existingSource;
let workspaces = [];
const esc = (value = "") => String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
function message(text, error = false) { messageNode.textContent = text; messageNode.hidden = !text; messageNode.classList.toggle("error", error); }

async function openPanel() {
  try { const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true }); await chrome.sidePanel.open({ windowId: tab.windowId }); window.close(); }
  catch (error) { message(readableError(error, "Could not open the BrowseGate side panel."), true); }
}

function render() {
  const workspaceOptions = workspaces.map((workspace) => `<option value="${esc(workspace.id)}">${esc(workspace.name)}</option>`).join("");
  pageNode.innerHTML = `<section class="current-page"><p class="eyebrow">ACTIVE PAGE</p><p class="title">${esc(activePage.title || "Untitled page")}</p><p class="url">${esc(activePage.url)}</p></section>
    <label class="form-label" for="workspace">Save to workspace</label><select id="workspace"><option value="">No workspace</option>${workspaceOptions}</select>
    ${existingSource ? `<p class="form-label">This page is already saved. You can open it, add it to another workspace, or update its page note.</p><label class="form-label" for="note">Page note</label><textarea id="note" maxlength="2000" placeholder="Why is this page useful?">${esc(existingSource.note || "")}</textarea><div class="button-row"><button data-action="open-existing">Open saved source</button><button class="primary" data-action="save-note">Save page note</button></div><div class="small-actions"><button data-action="add-existing">Add to selected workspace</button><button data-action="open-panel">Open BrowseGate</button></div>`
      : `<div class="button-row"><button class="primary" data-action="save">Save page</button><button data-action="open-panel">Open BrowseGate</button></div>`}`;
}

pageNode.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]"); if (!button) return;
  try {
    const workspaceId = document.querySelector("#workspace")?.value || "";
    if (button.dataset.action === "open-panel") return openPanel();
    if (button.dataset.action === "save") {
      const result = await saveSource(activePage, workspaceId);
      if (workspaceId) await preferences.set({ lastWorkspaceId: workspaceId });
      message(result.associated || !result.existed ? "Page saved in BrowseGate." : "Page is already in your library.");
    } else if (button.dataset.action === "open-existing") { await chrome.tabs.create({ url: existingSource.url }); window.close(); }
    else if (button.dataset.action === "save-note") { await updateSourceNote(existingSource.id, document.querySelector("#note").value); message("Page note updated."); }
    else if (button.dataset.action === "add-existing") {
      if (!workspaceId) { message("Choose a workspace first.", true); return; }
      const added = await addSourceToWorkspace(existingSource.id, workspaceId);
      await preferences.set({ lastWorkspaceId: workspaceId });
      message(added ? "Existing source added to workspace." : "This source is already in that workspace.");
    }
  } catch (error) { message(readableError(error), true); }
});

try {
  await initializeDatabase();
  activePage = await getActivePage();
  [existingSource, workspaces] = await Promise.all([findSourceByUrl(activePage.url).catch(() => null), listWorkspaces()]);
  render();
  const lastWorkspaceId = await preferences.get("lastWorkspaceId", "");
  const selector = document.querySelector("#workspace");
  if (selector && workspaces.some((workspace) => workspace.id === lastWorkspaceId)) selector.value = lastWorkspaceId;
} catch (error) {
  pageNode.innerHTML = `<p class="title">Quick Save unavailable</p><p class="url">${esc(readableError(error))}</p><button data-action="open-panel">Open BrowseGate</button>`;
}
