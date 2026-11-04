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

/** The same message with its content sanitized (the message itself when already safe). */
export function sanitizeProcessedMessage(message: ProcessedMessage): ProcessedMessage {
  const content = sanitizeMessageHtml(message.content);
  return content === message.content ? message : { ...message, content };
}
