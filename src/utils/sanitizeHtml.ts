import DOMPurify from "dompurify";
import type { ProcessedMessage } from "../types/messages";

/**
 * What message HTML may contain once it reaches the screen. Messages are rendered with
 * dangerouslySetInnerHTML, so this is the trust boundary: text formatting and links,
 * and nothing that runs code or loads anything. DOMPurify also drops unsafe URLs such
 * as `javascript:` links.
 *
 * To let messages show more (e.g. images), widen this list deliberately.
 */
export const MESSAGE_HTML_CONFIG = {
  ALLOWED_TAGS: ["strong", "a", "br", "sup", "em"],
  ALLOWED_ATTR: ["href", "target", "rel"],
};

/** Makes HTML from a chat export safe to render as it is. */
export function sanitizeMessageHtml(html: string): string {
  return html ? DOMPurify.sanitize(html, MESSAGE_HTML_CONFIG) : "";
}

/** Whether a URL is a plain web address (http or https), the only kind shown as a link. */
export function isWebUrl(url: string): boolean {
  return /^https?:\/\/[^\s]+$/i.test(url);
}

/**
 * The same message made safe to render: its HTML (`content` and `caption`) sanitized, and
 * a link kept only if it is a web address. The message itself when it was already safe.
 */
export function sanitizeProcessedMessage(message: ProcessedMessage): ProcessedMessage {
  const content = sanitizeMessageHtml(message.content);
  const caption = message.caption === undefined ? undefined : sanitizeMessageHtml(message.caption);
  const link = message.link && isWebUrl(message.link.url) ? message.link : undefined;

  if (content === message.content && caption === message.caption && link === message.link) {
    return message;
  }
  const safe: ProcessedMessage = { ...message, content };
  if (caption !== undefined) safe.caption = caption;
  if (link) safe.link = link;
  else delete safe.link;
  return safe;
}
