const clean = (value) => String(value ?? "").trim();
const yearOf = (date) => {
  const parsed = date ? new Date(date) : null;
  return parsed && Number.isFinite(parsed.getTime()) ? String(parsed.getUTCFullYear()) : "n.d.";
};
const mlaDate = (date) => {
  const parsed = date ? new Date(`${date.slice(0, 10)}T00:00:00Z`) : null;
  return parsed && Number.isFinite(parsed.getTime()) ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(parsed) : clean(date);
};

export function formatCitation(metadata = {}, style = "apa7", accessedAt = new Date()) {
  const author = clean(metadata.author);
  const title = clean(metadata.title) || "Untitled";
  const publisher = clean(metadata.publisher || metadata.website);
  const date = clean(metadata.date);
  const url = clean(metadata.url);
  const access = accessedAt instanceof Date ? accessedAt : new Date(accessedAt);
  const accessDate = Number.isFinite(access.getTime()) ? access.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }) : "";
  const year = yearOf(date);
  const missing = [!author && "author", !clean(metadata.title) && "title", !date && "publication date", !publisher && "publisher or website name", !url && "URL"].filter(Boolean);
  let text;
  if (style === "mla9") {
    const pieces = [];
    if (author) pieces.push(`${author}.`);
    pieces.push(`“${title}.”`);
    if (publisher) pieces.push(`${publisher},`);
    if (date) pieces.push(`${mlaDate(date)},`);
    if (url) pieces.push(`${url}.`);
    if (!date && accessDate) pieces.push(`Accessed ${accessDate}.`);
    text = pieces.join(" ").replace(/\s+([,.])/g, "$1");
  } else if (style === "chicago-author-date") {
    const pieces = [];
    if (author) pieces.push(`${author}.`);
    pieces.push(`${year}. “${title}.”`);
    if (publisher) pieces.push(`${publisher}.`);
    if (url) pieces.push(url);
    text = pieces.join(" ");
  } else {
    const pieces = [];
    if (author) pieces.push(`${author}.`);
    pieces.push(`(${year}).`);
    pieces.push(`${title}.`);
    if (publisher) pieces.push(`${publisher}.`);
    if (url) pieces.push(url);
    text = pieces.join(" ").replace(/\s+([,.])/g, "$1");
    if (metadata.includeAccessDate && accessDate && url) text = text.replace(url, `Retrieved ${accessDate}, from ${url}`);
  }
  return { style, text, missing, metadata: { author, title, publisher, date, url, accessedAt: accessDate, includeAccessDate: Boolean(metadata.includeAccessDate) } };
}

export function metadataFromSource(source, overrides = {}) {
  const metadata = source?.metadata || {};
  return { author: "", title: "", publisher: "", date: "", url: "", ...metadata, ...overrides,
    title: clean(overrides.title) || clean(metadata.title) || source?.title || "",
    url: clean(overrides.url) || clean(metadata.url) || source?.url || "",
    publisher: clean(overrides.publisher) || clean(metadata.publisher) || source?.domain || "" };
}
