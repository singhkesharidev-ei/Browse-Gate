const md = (text = "") => String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/([\\`*_{}\[\]()#+.!|~-])/g, "\\$1");
const cleanFilename = (name) => { const safe = String(name || "BrowseGate research").normalize("NFKC").replace(/[<>:"/\\|?*\x00-\x1F]/g, "-").replace(/[. ]+$/g, "").trim().slice(0, 100) || "BrowseGate research"; return /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?$/i.test(safe) ? `_${safe}` : safe; };
const dateStamp = (date) => date.toISOString().slice(0, 10);

export function buildWorkspaceExport(workspace, sources, { format = "markdown", includeTitle = true, includeDescription = true, includeUrls = true, includeNotes = true, includeCitations = true, includeMetadata = true, includeTags = true, includeDate = true, workspaceNotes = [], excludedSensitiveNotes = [] } = {}) {
  const omitted = new Set(excludedSensitiveNotes);
  const date = new Date();
  const exportedWorkspaceNotes = includeNotes ? workspaceNotes.filter((note) => !omitted.has(`workspace:${note.id}`)).map(({ id, title, body, createdAt, updatedAt }) => ({ id, title, body, createdAt, updatedAt })) : [];
  const payload = {
    ...(includeDate ? { exportDate: date.toISOString() } : {}),
    workspace: {
      id: workspace.id,
      ...(includeTitle ? { title: workspace.name } : {}),
      ...(includeDescription ? { description: workspace.description || "" } : {}),
    },
    ...(exportedWorkspaceNotes.length ? { notes: exportedWorkspaceNotes } : {}),
    sources: sources.map((source) => ({
      id: source.id,
      title: source.title,
      ...(includeUrls ? { url: source.url, normalizedUrl: source.normalizedUrl || "" } : {}),
      ...(includeMetadata ? {
        faviconUrl: source.faviconUrl || "", description: source.description || "", domain: source.domain || "", savedAt: source.savedAt || null,
        author: source.metadata?.author || "", citationTitle: source.metadata?.title || "", citationUrl: source.metadata?.url || "",
        publicationDate: source.metadata?.date || "", publisher: source.metadata?.publisher || "", createdAt: source.createdAt || null, updatedAt: source.updatedAt || null,
      } : {}),
      ...(includeTags ? { tags: source.tags || [] } : {}),
      ...(includeNotes && !omitted.has(`${source.id}:page`) && source.note ? { note: source.note } : {}),
      ...(includeNotes ? { notes: (source.relatedNotes || []).filter((note) => !omitted.has(`${source.id}:${note.id}`)).map(({ id, title, body, createdAt, updatedAt }) => ({ id, title, body, createdAt, updatedAt })) } : {}),
      ...(includeCitations ? { citations: source.citations || [] } : {}),
    })),
  };
  if (format === "json") return { filename: `${cleanFilename(workspace.name)}-${dateStamp(date)}.json`, mime: "application/json;charset=utf-8", content: JSON.stringify(payload, null, 2), payload };
  if (format === "text") {
    const lines = includeTitle ? [workspace.name, "=".repeat(workspace.name.length)] : [];
    if (includeDescription && payload.workspace.description) lines.push("", payload.workspace.description);
    if (includeDate) lines.push("", `Exported ${date.toLocaleDateString()}`);
    for (const source of payload.sources) {
      lines.push("", source.title, "-".repeat(source.title.length));
      if (includeUrls && source.url) lines.push(source.url);
      const metadata = [source.author && `Author: ${source.author}`, source.citationTitle && `Citation title: ${source.citationTitle}`, source.citationUrl && `Citation URL: ${source.citationUrl}`, source.publisher && `Publisher: ${source.publisher}`, source.publicationDate && `Published: ${source.publicationDate}`, source.domain && `Domain: ${source.domain}`, source.description && `Description: ${source.description}`, source.savedAt && `Saved: ${new Date(source.savedAt).toLocaleDateString()}`].filter(Boolean);
      if (metadata.length) lines.push(metadata.join(" · "));
      if (includeTags && source.tags?.length) lines.push(`Tags: ${source.tags.join(", ")}`);
      if (source.note) lines.push("", source.note);
      for (const note of source.notes || []) lines.push("", `${note.title}:`, note.body);
      for (const citation of source.citations || []) lines.push("", `${citation.style || "Citation"}: ${citation.text || citation}`);
    }
    if (payload.notes?.length) { lines.push("", "Workspace notes", "--------------"); for (const note of payload.notes) lines.push("", note.title || "Note", note.body); }
    return { filename: `${cleanFilename(workspace.name)}-${dateStamp(date)}.txt`, mime: "text/plain;charset=utf-8", content: lines.join("\n"), payload };
  }
  const lines = includeTitle ? [`# ${md(workspace.name)}`] : [];
  if (includeDescription && payload.workspace.description) lines.push("", md(payload.workspace.description));
  if (includeDate) lines.push("", `*Exported ${date.toLocaleDateString()}*`);
  for (const source of payload.sources) {
    lines.push("", `## ${md(source.title)}`);
    if (includeUrls && source.url) lines.push("", `[${md(source.url)}](${source.url.replace(/[()\\]/g, "\\$&")})`);
    if (includeMetadata) {
      const metadata = [source.author && `Author: ${source.author}`, source.citationTitle && `Citation title: ${source.citationTitle}`, source.citationUrl && `Citation URL: ${source.citationUrl}`, source.publisher && `Publisher: ${source.publisher}`, source.publicationDate && `Published: ${source.publicationDate}`, source.domain && `Domain: ${source.domain}`, source.description && `Description: ${source.description}`, source.savedAt && `Saved: ${new Date(source.savedAt).toLocaleDateString()}`].filter(Boolean);
      if (metadata.length) lines.push("", `*${metadata.map(md).join(" · ")}*`);
    }
    if (includeTags && source.tags?.length) lines.push("", `*Tags: ${md(source.tags.join(", "))}*`);
    if (source.note) lines.push("", "### Page note", "", md(source.note));
    for (const note of source.notes || []) lines.push("", `### ${md(note.title || "Note")}`, "", md(note.body));
    if (source.citations?.length) lines.push("", "### Citations", "", ...source.citations.map((citation) => `- ${md(citation.text || citation)}`));
  }
  if (payload.notes?.length) lines.push("", "## Workspace notes", ...payload.notes.flatMap((note) => ["", `### ${md(note.title || "Note")}`, "", md(note.body)]));
  return { filename: `${cleanFilename(workspace.name)}-${dateStamp(date)}.md`, mime: "text/markdown;charset=utf-8", content: lines.join("\n"), payload };
}

export function downloadLocalFile(file) {
  const blob = new Blob([file.content], { type: file.mime });
  const url = URL.createObjectURL(blob);
  try { const anchor = document.createElement("a"); anchor.href = url; anchor.download = file.filename; anchor.hidden = true; document.body.append(anchor); anchor.click(); anchor.remove(); }
  finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
}
