import { BrowseGateError } from "../core/errors.js";

export function normalizeUrl(rawUrl) {
  let url;
  try { url = new URL(String(rawUrl)); }
  catch (error) { throw new BrowseGateError("This tab does not have a valid webpage URL to save.", { cause: error, code: "INVALID_URL" }); }
  if (!/^https?:$/.test(url.protocol)) throw new BrowseGateError("BrowseGate can save regular HTTP and HTTPS webpages. This tab is restricted by Chrome or another extension.", { code: "RESTRICTED_URL" });
  url.hash = "";
  url.hostname = url.hostname.toLocaleLowerCase();
  if ((url.protocol === "https:" && url.port === "443") || (url.protocol === "http:" && url.port === "80")) url.port = "";
  return url.href;
}

export function domainFromUrl(rawUrl) {
  try { return new URL(rawUrl).hostname.replace(/^www\./i, ""); }
  catch { return ""; }
}
