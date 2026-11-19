import { getAll } from "../core/database.js";
import { domainFromUrl } from "./url-service.js";

export const ANALYTICS_RANGES = { today: 1, week: 7, month: 30 };
export function buildHomePreview({ sources = [], notes = [] } = {}) {
  return [
    { id: "saved-sources", label: "Saved sources", value: sources.length },
    { id: "notes", label: "Notes", value: notes.length },
  ];
}

export function calculateAnalytics({ visits = [], sources = [], workspaces = [], links = [], notes = [], sessions = [], reading = [], now = Date.now() } = {}) {
  const visitRows = visits.filter((visit) => /^https?:\/\//i.test(visit.url || ""));
  const domains = new Map(); const pages = new Map(); const daily = new Map();
  for (const visit of visitRows) {
    const domain = domainFromUrl(visit.url); if (!domain) continue;
    domains.set(domain, (domains.get(domain) || 0) + 1);
    const page = pages.get(visit.url) || { url: visit.url, title: visit.title || visit.url, visits: 0, lastVisitTime: 0, domain };
    page.visits += 1; page.lastVisitTime = Math.max(page.lastVisitTime, visit.visitTime || 0); pages.set(visit.url, page);
    const timestamp = new Date(visit.visitTime); if (!Number.isFinite(timestamp.getTime())) continue;
    const day = `${timestamp.getFullYear()}-${String(timestamp.getMonth() + 1).padStart(2, "0")}-${String(timestamp.getDate()).padStart(2, "0")}`; daily.set(day, (daily.get(day) || 0) + 1);
  }
  const workspaceSources = workspaces.map((workspace) => ({ ...workspace, savedSources: links.filter((link) => link.workspaceId === workspace.id).length, noteCount: notes.filter((note) => note.workspaceIds?.includes(workspace.id)).length }));
  const recentCutoff = now - 30 * 86400000;
  return { recordedVisitCount: visitRows.length, uniqueUrlCount: pages.size, uniqueDomainCount: domains.size, domains: [...domains].map(([domain, visits]) => ({ domain, visits })).sort((a, b) => b.visits - a.visits).slice(0, 8), pages: [...pages.values()].sort((a, b) => b.visits - a.visits).slice(0, 8), daily: [...daily].map(([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date)), savedSourceCount: sources.length, workspaceSources, noteCount: notes.length, sessionCount: sessions.length, reading: { total: reading.length, unread: reading.filter((item) => item.status === "unread").length, inProgress: reading.filter((item) => item.status === "reading").length, completed: reading.filter((item) => item.status === "completed").length }, staleSavedSources: sources.filter((source) => source.savedAt && source.savedAt < recentCutoff && !visitRows.some((visit) => visit.url === source.url)).length, duplicateSavedUrls: sources.length - new Set(sources.map((source) => source.normalizedUrl || source.url)).size };
}

export async function loadAnalytics(range = "week", customStart, customEnd) {
  const end = customEnd ? new Date(`${customEnd}T23:59:59.999`).getTime() : Date.now();
  const start = customStart ? new Date(`${customStart}T00:00:00.000`).getTime() : range === "today" ? new Date(new Date().toDateString()).getTime() : end - (ANALYTICS_RANGES[range] || 7) * 86400000;
  const [sources, workspaces, links, notes, sessions, reading] = await Promise.all([getAll("sources"), getAll("workspaces"), getAll("workspaceSources"), getAll("notes"), getAll("sessions"), getAll("readingList")]);
  let visits = []; let historyDataLimited = false;
  try {
    const pages = await chrome.history.search({ text: "", startTime: start, endTime: end, maxResults: 500 });
    historyDataLimited = (pages || []).length > 200;
    const candidates = (pages || []).slice(0, 200).filter((page) => /^https?:\/\//i.test(page.url || ""));
    for (let offset = 0; offset < candidates.length; offset += 20) {
      const batch = await Promise.all(candidates.slice(offset, offset + 20).map(async (page) => {
        try {
          const pageVisits = await chrome.history.getVisits({ url: page.url });
          return pageVisits.filter((visit) => visit.visitTime >= start && visit.visitTime <= end).map((visit) => ({ url: page.url, title: page.title || page.url, visitTime: visit.visitTime }));
        } catch { return []; /* A page may disappear from History between query and getVisits. */ }
      }));
      visits.push(...batch.flat());
    }
  } catch { visits = null; }
  return { ...calculateAnalytics({ visits: visits || [], sources, workspaces, links, notes, sessions, reading }), historyAvailable: visits !== null, historyDataLimited: visits !== null && historyDataLimited, start, end };
}

export function buildInsights(data, { dismissed = [] } = {}) {
  const all = [];
  if (!data.historyAvailable) all.push({ id: "history-unavailable", title: "History data unavailable", reason: "Chrome did not return local History records for this period.", action: "Check the extension’s History permission." });
  if (data.domains?.[0]) all.push({ id: `top-domain:${data.domains[0].domain}`, title: `${data.domains[0].domain} is your most visited domain`, reason: `${data.domains[0].visits} recorded page visits in this period.`, action: "Review its pages in the History section." });
  const noNotes = data.workspaceSources?.filter((workspace) => workspace.savedSources > 0 && workspace.noteCount === 0) || [];
  if (noNotes.length) all.push({ id: `workspace-no-notes:${noNotes[0].id}`, title: `“${noNotes[0].name}” has saved sources but no notes`, reason: `${noNotes[0].savedSources} source${noNotes[0].savedSources === 1 ? "" : "s"} are linked to this workspace and no notes are associated with it.`, action: "Open the workspace to add context." });
  const largest = [...(data.workspaceSources || [])].sort((a, b) => b.savedSources - a.savedSources)[0];
  if (largest?.savedSources) all.push({ id: `largest-workspace:${largest.id}`, title: `“${largest.name}” has the most saved sources`, reason: `${largest.savedSources} saved source${largest.savedSources === 1 ? "" : "s"} are associated with it.`, action: "Review that research workspace." });
  if (data.staleSavedSources) all.push({ id: "stale-sources", title: `${data.staleSavedSources} saved sources were not revisited recently`, reason: "These sources were saved more than 30 days ago and had no visit in the selected period.", action: "Review your saved research." });
  if (data.duplicateSavedUrls) all.push({ id: "duplicate-sources", title: `${data.duplicateSavedUrls} duplicate saved URLs`, reason: "Saved source records share a normalized URL.", action: "Review the Research library." });
  return all.filter((insight) => !dismissed.includes(insight.id));
}
