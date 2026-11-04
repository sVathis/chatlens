const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Plain text made safe to put into HTML. */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => ESCAPES[char]);
}

const URL_PATTERN = /https?:\/\/[^\s<>"]+/gi;
// What ends a sentence rather than an address: "see https://example.com/a." / "(https://…)"
const TRAILING = /[.,;:!?)\]}'"]+$/;

/**
 * Message text as HTML: escaped, with web addresses made into links and line breaks kept.
 * Spaces and tabs are kept exactly as exported (the message style is pre-wrap), including
 * trailing ones; only the line breaks at the very end are dropped, so a message ending in
 * a newline doesn't get an empty line under it.
 */
export function textToHtml(text: string): string {
  const body = text.replace(/(?:\r?\n)+$/, "");
  let html = "";
  let last = 0;

  for (const match of body.matchAll(URL_PATTERN)) {
    const start = match.index ?? 0;
    const url = match[0].replace(TRAILING, "");
    // "https://" alone (or with only punctuation after it) is not an address
    if (url.length <= "https://".length) continue;

    html += escapeHtml(body.slice(last, start));
    const safe = escapeHtml(url);
    html += `<a href="${safe}" target="_blank" rel="noopener noreferrer">${safe}</a>`;
    last = start + url.length;
  }
  html += escapeHtml(body.slice(last));
  return html.replace(/\r?\n/g, "<br>");
}

/** An epoch-millisecond time as ISO text, or "" when it is not a usable time. */
export function isoTime(ms: number): string {
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

/** Plain text on one line, cut to `max` characters, for a list preview. */
export function oneLine(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? flat.slice(0, max) : flat;
}

/** A duration as m:ss (h:mm:ss from an hour), or "" when it is not a usable number. */
export function formatDuration(ms: number | undefined): string {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms < 0) return "";
  const total = Math.round(ms / 1000);
  const seconds = String(total % 60).padStart(2, "0");
  const minutes = Math.floor(total / 60) % 60;
  const hours = Math.floor(total / 3600);
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}`
    : `${minutes}:${seconds}`;
}
