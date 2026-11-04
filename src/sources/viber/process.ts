import type { ProcessedMessage } from "../../types/messages";
import type { ProcessOptions } from "../types";
import { mediaKey } from "./load";
import { baseName, hasMedia } from "./media";
import type { ViberMsg } from "./types";
import { escapeHtml, formatDuration, isoTime, oneLine, textToHtml } from "./text";

const PREVIEW_MAX_LENGTH = 100;

/** What a message kind is called when its file or text isn't there. */
const KIND_LABEL: Record<string, string> = {
  image: "\u{1F4F7} Photo",
  video: "\u{1F3A5} Video",
  voice: "\u{1F3A4} Voice message",
  file: "\u{1F4CE} File",
  sticker: "Sticker",
  location: "\u{1F4CD} Location",
  contact: "\u{1F464} Contact",
  call: "\u{1F4DE} Call",
};

const isNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

function callText(message: ViberMsg): string {
  return message.peerName ? `Call with ${escapeHtml(message.peerName)}` : "Call";
}

/** The content (HTML) of a message that has nothing to show but a note that it is missing. */
function missingNote(message: ViberMsg, label: string): string {
  const named = message.media?.name ? ` ${escapeHtml(message.media.name)}` : "";
  const length = formatDuration(message.media?.durationMs);
  return `<em>${label}${named}${length ? ` (${length})` : ""} — not in this export</em>`;
}

function processMessage(
  message: ViberMsg,
  ownerId: string,
  swapped: boolean,
  mediaFiles: Map<string, File> | undefined,
): ProcessedMessage {
  const isOwner = swapped ? message.from !== ownerId : message.from === ownerId;
  const shown: ProcessedMessage = {
    id: message.id,
    displayName: message.authorName,
    timestamp: isoTime(message.timestamp),
    content: "",
    type: "text",
    from: message.from,
    isOwner,
    originalMessageType: message.kind,
  };

  const { replyTo } = message;
  if (replyTo && (replyTo.text || replyTo.messageId)) {
    shown.quote = { text: replyTo.text ?? "" };
    if (replyTo.messageId) shown.quote.messageId = replyTo.messageId;
  }
  if (message.edited) shown.edited = true;
  if (message.forwarded) shown.forwarded = true;
  if (message.caption) shown.caption = textToHtml(message.caption);

  const path = message.media?.path;
  const present = hasMedia(path, mediaFiles);

  switch (message.kind) {
    case "call":
      shown.type = "call";
      shown.content = callText(message);
      delete shown.quote;
      break;

    case "system":
      shown.type = "system";
      shown.content = escapeHtml(message.text ?? "System message");
      break;

    case "image":
    case "video":
      if (present) {
        shown.type = "media";
        shown.mediaUrl = mediaKey(path);
        shown.content = message.caption ? textToHtml(message.caption) : "";
      } else {
        shown.content = missingNote(message, KIND_LABEL[message.kind]);
      }
      break;

    case "voice": {
      const length = formatDuration(message.media?.durationMs);
      shown.content = present
        ? `${KIND_LABEL.voice}${length ? ` ${length}` : ""}`
        : missingNote(message, KIND_LABEL.voice);
      shown.attachment = {
        kind: "audio",
        ...(present ? { key: mediaKey(path) } : {}),
        ...(isNumber(message.media?.durationMs) ? { durationMs: message.media.durationMs } : {}),
      };
      break;
    }

    case "file": {
      const name = message.media?.name ?? (path ? baseName(path) : undefined);
      shown.content = present
        ? `${KIND_LABEL.file} ${escapeHtml(name ?? "File")}`
        : missingNote(message, KIND_LABEL.file);
      shown.attachment = {
        kind: "file",
        ...(present ? { key: mediaKey(path) } : {}),
        ...(name ? { name } : {}),
      };
      break;
    }

    case "sticker": {
      const stickerPath = message.sticker?.path;
      if (hasMedia(stickerPath, mediaFiles)) {
        shown.type = "media";
        shown.mediaUrl = mediaKey(stickerPath);
      } else {
        shown.content = "<em>Sticker</em>";
      }
      break;
    }

    case "location": {
      const { location } = message;
      shown.content = message.text ? textToHtml(message.text) : KIND_LABEL.location;
      if (location && isNumber(location.lat) && isNumber(location.lon)) {
        shown.location = { lat: location.lat, lon: location.lon };
      }
      break;
    }

    case "contact":
      shown.content = `${KIND_LABEL.contact}${message.contact?.name ? ` ${escapeHtml(message.contact.name)}` : ""}`;
      if (message.contact?.name || message.contact?.number) {
        shown.contactCard = { name: message.contact.name, number: message.contact.number };
      }
      break;

    case "link":
      shown.content = textToHtml(message.text ?? message.link?.url ?? "");
      if (message.link?.url) {
        shown.link = { url: message.link.url, ...(message.link.title ? { title: message.link.title } : {}) };
      }
      break;

    case "text":
    case "post":
      shown.content = textToHtml(message.text ?? "");
      break;

    default:
      // A kind a later exporter version may add: show its text if it has any
      shown.content = message.text
        ? textToHtml(message.text)
        : `<em>Unsupported message (${escapeHtml(message.kind)})</em>`;
  }

  return shown;
}

/** The displayed form of the first `limit` messages of a Viber chat (newest first). */
export function processViberMessages(messages: ViberMsg[], options: ProcessOptions): ProcessedMessage[] {
  const { ownerId, swapped, mediaFiles, limit } = options;
  const end = limit ? Math.min(limit, messages.length) : messages.length;
  const shown: ProcessedMessage[] = [];
  for (let i = 0; i < end; i++) {
    shown.push(processMessage(messages[i], ownerId, swapped, mediaFiles));
  }
  return shown;
}

/** One plain-text line about a message, for the conversation list. */
export function viberPreview(message: ViberMsg | undefined): string {
  if (!message) return "";
  const caption = message.caption ? ` ${message.caption}` : "";
  switch (message.kind) {
    case "call":
      return `${KIND_LABEL.call}${message.peerName ? ` ${message.peerName}` : ""}`;
    case "image":
    case "video":
      return oneLine(`${KIND_LABEL[message.kind]}${caption}`, PREVIEW_MAX_LENGTH);
    case "voice":
    case "sticker":
    case "location":
      return KIND_LABEL[message.kind];
    case "file":
      return oneLine(`${KIND_LABEL.file} ${message.media?.name ?? ""}`, PREVIEW_MAX_LENGTH);
    case "contact":
      return oneLine(`${KIND_LABEL.contact} ${message.contact?.name ?? ""}`, PREVIEW_MAX_LENGTH);
    case "link":
      return oneLine(message.text ?? message.link?.title ?? message.link?.url ?? "", PREVIEW_MAX_LENGTH);
    default:
      return oneLine(message.text ?? "", PREVIEW_MAX_LENGTH);
  }
}
