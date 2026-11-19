import { getAll } from "../core/database.js";

export function scoreSearchResult(query, { title = "", url = "", domain = "", body = "", note = "", description = "", tabs = [], notes = "", tags = [] } = {}) {
  const term = String(query ?? "").trim().toLocaleLowerCase();
  if (!term) return 0;
  const normalizedTitle = String(title).toLocaleLowerCase();
  if (normalizedTitle === term) return 5;
  if (normalizedTitle.includes(term)) return 4;
  if (`${url} ${domain}`.toLocaleLowerCase().includes(term)) return 3;
  if (`${body} ${note} ${notes}`.toLocaleLowerCase().includes(term) || tabs.some((tab) => String(tab.title).toLocaleLowerCase().includes(term))) return 2;
  if (`${description} ${tags.join(" ")} ${tabs.map((tab) => tab.url).join(" ")}`.toLocaleLowerCase().includes(term)) return 1;
  return 0;
}

function rank(items, type, query) {
  return items.map((item) => {
    const searchable = ["workspace", "session"].includes(type) ? { ...item, title: item.name } : item;
    return { ...item, type, relevance: scoreSearchResult(query, searchable) };
  })
    .filter((item) => item.relevance > 0)
    .sort((a, b) => b.relevance - a.relevance || (b.updatedAt || b.savedAt || b.lastVisitTime || 0) - (a.updatedAt || a.savedAt || a.lastVisitTime || 0));
}

export async function searchSavedData(query, scope = "all") {
  const term = String(query ?? "").trim();
  const result = { sources: [], notes: [], workspaces: [], sessions: [] };
  if (!term) return result;
  const jobs = [];
  if (scope === "all" || scope === "saved") jobs.push(getAll("sources").then((items) => { result.sources = rank(items, "source", term); }));
  if (scope === "all" || scope === "notes") jobs.push(getAll("notes").then((items) => { result.notes = rank(items, "note", term); }));
  if (scope === "all" || scope === "workspaces") jobs.push(getAll("workspaces").then((items) => { result.workspaces = rank(items, "workspace", term); }));
  if (scope === "all" || scope === "sessions") jobs.push(getAll("sessions").then((items) => { result.sessions = rank(items, "session", term); }));
  await Promise.all(jobs);
  return result;
}
