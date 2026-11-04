import type { ChatConversation, ChatExport, ConversationKind } from "../../model/chat";
import { readJsonFile } from "../../utils/fileParser";
import { viberReactions } from "./reactions";
import { isoTime } from "./text";
import type { ViberChat, ViberContact, ViberExport, ViberMessage, ViberMsg } from "./types";

export const VIBER_EXPORT_FILE = "viber_export.json";
export const VIBER_FORMAT = "viberpc-export";
/** The newest version of the exporter's format this adapter reads. */
export const VIBER_VERSION = 1;
export const VIBER_SELF = "viber:self";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

/** Whether parsed JSON is a ViberPC-Export file (whatever its version). */
export function isViberJson(parsed: unknown): boolean {
  return isRecord(parsed) && parsed.format === VIBER_FORMAT && Array.isArray(parsed.chats);
}

function checkVersion(data: ViberExport): void {
  if (typeof data.version !== "number" || data.version < 1 || data.version > VIBER_VERSION) {
    throw new Error(
      `Unsupported Viber export version ${String(data.version)}: this ChatLens reads version ${VIBER_VERSION}. ` +
        "Update ChatLens, or export again with a matching ViberPC-Export.",
    );
  }
}

const personId = (contactId: number) => `viber:${contactId}`;

/** A person's name for display: the contact's name, else their number. */
function nameOf(contact: ViberContact | undefined): string | null {
  return contact?.name?.trim() || contact?.number?.trim() || null;
}

/** The chat's messages newest first. The exporter writes them in order, and ties (messages in the same millisecond) keep it. */
function newestFirst(messages: ViberMessage[]): ViberMessage[] {
  let sorted = true;
  for (let i = 1; i < messages.length; i++) {
    if (messages[i].timestamp < messages[i - 1].timestamp) {
      sorted = false;
      break;
    }
  }
  // Array.prototype.sort is stable, so equal times stay in the exporter's order
  const ordered = sorted ? messages : [...messages].sort((a, b) => a.timestamp - b.timestamp);
  return [...ordered].reverse();
}

function conversationKind(chat: ViberChat): ConversationKind | undefined {
  return chat.type === "direct" || chat.type === "group" || chat.type === "community"
    ? chat.type
    : undefined;
}

/** Puts a Viber export into the shared model. */
export function toChatExport(data: ViberExport, mediaFiles?: Map<string, File>): ChatExport {
  checkVersion(data);

  const contacts = data.contacts ?? {};
  const selfIds = new Set((data.self?.contactIds ?? []).map(String));
  const contactName = (id: number | undefined) =>
    id === undefined ? null : nameOf(contacts[String(id)]);

  const conversations: ChatConversation[] = data.chats.map((chat) => {
    const kind = conversationKind(chat);
    const messageIds = new Set(chat.messages.map((message) => String(message.id)));

    const messages = newestFirst(chat.messages).map((message): ViberMsg => {
      // A call records no author and no direction: it is shown from the other party
      const isCall = message.kind === "call";
      const mine =
        !isCall &&
        (message.outgoing === true ||
          (message.authorId !== undefined && selfIds.has(String(message.authorId))));
      const other = isCall ? message.peerId : message.authorId;
      const from = mine ? VIBER_SELF : other === undefined ? "viber:unknown" : personId(other);

      const replyId = message.replyTo?.messageId;
      const converted: ViberMsg = {
        id: String(message.id),
        timestamp: message.timestamp,
        kind: message.kind,
        from,
        authorName: mine || isCall ? null : contactName(message.authorId),
        outgoing: mine,
      };
      if (isCall) converted.peerName = contactName(message.peerId);
      if (message.text !== undefined) converted.text = message.text;
      if (message.caption !== undefined) converted.caption = message.caption;
      if (message.link) converted.link = message.link;
      if (message.media) converted.media = message.media;
      if (message.sticker) converted.sticker = message.sticker;
      if (message.replyTo) {
        // A quote points at a message only if that message is in this chat
        converted.replyTo = {
          text: message.replyTo.text,
          messageId:
            replyId !== undefined && messageIds.has(String(replyId)) ? String(replyId) : undefined,
        };
      }
      if (message.edited) converted.edited = true;
      if (message.forwarded) converted.forwarded = true;
      if (message.location) converted.location = message.location;
      if (message.contact) converted.contact = message.contact;
      return converted;
    });

    // A direct chat is named for the other person when the export has no title for it
    const otherName = chat.memberIds?.length === 1 ? contactName(chat.memberIds[0]) : null;
    const title = chat.title?.trim() || otherName || `Chat ${chat.id}`;

    return {
      id: `viber:${chat.id}`,
      title,
      kind,
      // The other participants, plus the owner
      memberCount: kind === "group" && chat.memberIds ? chat.memberIds.length + 1 : undefined,
      reactions: viberReactions(chat, selfIds),
      lastActivity: messages[0] ? isoTime(messages[0].timestamp) : "",
      messages,
    };
  });

  return {
    source: "viber",
    ownerId: VIBER_SELF,
    exportedAt: data.exportedAt ?? "",
    conversations,
    mediaFiles,
  };
}

export function fromViberJson(parsed: unknown): ChatExport {
  if (!isViberJson(parsed)) {
    throw new Error("Invalid Viber export: expected a viber_export.json written by ViberPC-Export");
  }
  return toChatExport(parsed as ViberExport);
}

const MEDIA_DIR = "media/";

/** A media path as keys are compared: forward slashes, composed Unicode (macOS stores names decomposed). */
export function mediaKey(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.?\//, "").normalize("NFC");
}

const isExportFile = (file: File) =>
  file.name === VIBER_EXPORT_FILE || file.webkitRelativePath.endsWith(`/${VIBER_EXPORT_FILE}`);

/** Whether an uploaded folder holds a Viber export (its viber_export.json). */
export function isViberFolder(files: File[]): boolean {
  return files.some(isExportFile);
}

/**
 * Loads an export folder: viber_export.json and the media files next to it. Media is keyed
 * by its path relative to the folder holding the JSON ("media/<chat>/<file>"), which is how
 * the JSON names it.
 */
export async function loadViberFolder(
  files: File[],
  onProgress: (progress: number) => void,
): Promise<ChatExport> {
  const jsonFile = files.find(isExportFile);
  if (!jsonFile) throw new Error(`${VIBER_EXPORT_FILE} not found in directory`);

  const parsed = await readJsonFile(jsonFile, (progress) => onProgress(Math.min(progress * 0.9, 90)));
  if (!isViberJson(parsed)) {
    throw new Error("Invalid Viber export: expected a viber_export.json written by ViberPC-Export");
  }

  // Files are named from the folder the user picked; the JSON's own folder is the base
  const jsonPath = jsonFile.webkitRelativePath || jsonFile.name;
  const base = jsonPath.slice(0, jsonPath.length - VIBER_EXPORT_FILE.length);

  const mediaFiles = new Map<string, File>();
  for (const file of files) {
    const path = file.webkitRelativePath;
    if (!path || !path.startsWith(base)) continue;
    const key = mediaKey(path.slice(base.length));
    if (key.startsWith(MEDIA_DIR)) mediaFiles.set(key, file);
  }

  onProgress(100);
  return toChatExport(parsed as ViberExport, mediaFiles);
}
