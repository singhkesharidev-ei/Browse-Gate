import { BrowseGateError } from "../core/errors.js";
import { domainFromUrl } from "./url-service.js";

const RANGE_MS = { day: 24 * 60 * 60 * 1000, week: 7 * 24 * 60 * 60 * 1000, month: 30 * 24 * 60 * 60 * 1000, quarter: 90 * 24 * 60 * 60 * 1000 };

export async function searchHistory({ query = "", domain = "", range = "month", sort = "recent", limit = 200 } = {}) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 200, 500));
  const endTime = Date.now();
  const startTime = RANGE_MS[range] ? endTime - RANGE_MS[range] : endTime - RANGE_MS.quarter;
  try {
    const text = String(query).trim() || String(domain).trim();
    const entries = await chrome.history.search({ text, startTime, endTime, maxResults: safeLimit });
    const domainFilter = String(domain).trim().toLocaleLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
    const results = (entries || []).map((item) => ({
      id: item.id,
      url: item.url || "",
      title: item.title || "Untitled page",
      domain: domainFromUrl(item.url || ""),
      lastVisitTime: item.lastVisitTime || 0,
      visitCount: Number.isFinite(item.visitCount) ? item.visitCount : 0,
      typedCount: Number.isFinite(item.typedCount) ? item.typedCount : 0,
    })).filter((item) => {
      if (!item.url || !/^https?:\/\//i.test(item.url)) return false;
      return !domainFilter || item.domain.toLocaleLowerCase() === domainFilter || item.domain.toLocaleLowerCase().endsWith(`.${domainFilter}`);
    });
    results.sort(sort === "frequent" ? (a, b) => b.visitCount - a.visitCount || b.lastVisitTime - a.lastVisitTime : (a, b) => b.lastVisitTime - a.lastVisitTime);
    return results;
  } catch (error) {
    throw new BrowseGateError("Chrome history could not be read. Check that BrowseGate has the History permission enabled in Chrome.", { cause: error, code: "HISTORY_READ_FAILED" });
  }
}
