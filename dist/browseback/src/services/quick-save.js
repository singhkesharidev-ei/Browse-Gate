import { findSourceByUrl, saveSource } from "./source-service.js";
import { BrowseGateError } from "../core/errors.js";

export async function getActivePage() {
  let tabs;
  try { tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true }); }
  catch (error) { throw new BrowseGateError("BrowseGate could not access the active tab. Try opening it from a regular webpage.", { cause: error, code: "ACTIVE_TAB_UNAVAILABLE" }); }
  const tab = tabs?.[0];
  if (!tab?.url) throw new BrowseGateError("The active tab does not expose a webpage URL. Chrome system pages and some extension pages cannot be saved.", { code: "ACTIVE_TAB_UNAVAILABLE" });
  return { url: tab.url, title: tab.title || "", faviconUrl: tab.favIconUrl || "", description: "" };
}

export async function inspectActivePage() {
  const metadata = await getActivePage();
  const existing = await findSourceByUrl(metadata.url);
  return { metadata, existing };
}

export async function saveActivePage(workspaceId = "") {
  const metadata = await getActivePage();
  return saveSource(metadata, workspaceId);
}
