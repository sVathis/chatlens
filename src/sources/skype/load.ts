import type { ChatExport } from "../../model/chat";
import { debugLog } from "../../utils/debug";
import { readJsonFile } from "../../utils/fileParser";
import { MEDIA_PATH_PREFIX } from "../../constants/fileUpload";
import { newestFirst } from "./order";
import type { Conversation, SkypeExport } from "./types";

/**
 * Picks the export owner for JSON without a `userId`: the most frequent sender that
 * is not the conversation itself (in a 1:1 chat the conversation ID is the other
 * person), falling back to the most frequent sender. Only affects which side bubbles
 * appear on, which the role swap button can flip.
 */
function inferUserId(conversations: Conversation[]): string {
  const counts = new Map<string, number>();
  const conversationIds = new Set(conversations.map((c) => c.id));
  for (const conversation of conversations) {
    for (const message of conversation.MessageList ?? []) {
      if (message.from) counts.set(message.from, (counts.get(message.from) ?? 0) + 1);
    }
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return (
    ranked.find(([from]) => !conversationIds.has(from))?.[0] ?? ranked[0]?.[0] ?? ""
  );
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

/**
 * A Skype conversation: an ID and a `MessageList`. A top-level `conversations` array on
 * its own proves nothing, since other chat exports use that name too.
 */
function looksLikeConversation(value: unknown): boolean {
  return isRecord(value) && typeof value.id === "string" && Array.isArray(value.MessageList);
}

/**
 * Whether parsed JSON has the shape of a Skype export or a single extracted conversation.
 * An export needs at least one conversation that looks like Skype's; one with none is
 * recognised by its `userId`.
 */
export function isSkypeJson(parsed: unknown): boolean {
  if (!isRecord(parsed)) return false;
  if (looksLikeConversation(parsed)) return true;

  const { conversations } = parsed;
  if (!Array.isArray(conversations)) return false;
  return conversations.length > 0
    ? conversations.some(looksLikeConversation)
    : typeof parsed.userId === "string";
}

/**
 * Accepts a full Skype export (`{ userId, conversations }`), an export without
 * `userId`, or a single extracted conversation (`{ id, MessageList, ... }`), and returns
 * the full export shape. Conversation and message IDs are kept as they are, so deep
 * links work the same for all of them.
 */
export function normalizeSkypeExport(parsed: unknown): SkypeExport {
  if (!isRecord(parsed)) {
    throw new Error("Invalid Skype export file format");
  }
  if (!isSkypeJson(parsed)) {
    throw new Error(
      "Invalid Skype export file format: expected a Skype export or a single conversation with id and MessageList",
    );
  }
  const data = parsed as Partial<SkypeExport> & Partial<Conversation>;

  if (Array.isArray(data.conversations)) {
    return data.userId
      ? (data as SkypeExport)
      : { ...(data as SkypeExport), userId: inferUserId(data.conversations) };
  }

  if (typeof data.id === "string" && Array.isArray(data.MessageList)) {
    const conversation: Conversation = {
      ...(data as Conversation),
      displayName: data.displayName ?? data.id,
      version: data.version ?? 0,
      properties: data.properties ?? {
        conversationblocked: false,
        lastimreceivedtime: null,
        consumptionhorizon: null,
        conversationstatus: null,
      },
      threadProperties: data.threadProperties ?? null,
    };
    return {
      userId: data.userId || inferUserId([conversation]),
      exportDate: "",
      conversations: [conversation],
    };
  }

  throw new Error(
    "Invalid Skype export file format: expected a Skype export or a single conversation with id and MessageList",
  );
}

/**
 * Puts a Skype export into the shared model. A message list that is already newest first
 * (as Skype writes it) is used as it is, not copied.
 */
export function toChatExport(data: SkypeExport): ChatExport {
  return {
    source: "skype",
    ownerId: data.userId,
    exportedAt: data.exportDate,
    conversations: data.conversations.map((conversation) => {
      const messages = newestFirst(conversation.MessageList ?? []);
      return {
        id: conversation.id,
        title: conversation.displayName,
        lastActivity: messages[0]?.originalarrivaltime ?? "",
        messages,
      };
    }),
    mediaFiles: data.mediaFiles,
  };
}

/** Whether an uploaded folder holds a Skype export (its messages.json). */
export function isSkypeFolder(files: File[]): boolean {
  return files.some(isMessagesFile);
}

function isMessagesFile(file: File): boolean {
  return file.name === "messages.json" || file.webkitRelativePath.endsWith("messages.json");
}

/**
 * Loads a Skype export directory containing messages.json and media files.
 * Extracts messages and builds a map of media files for later use.
 */
export async function loadSkypeFolder(
  files: File[],
  onProgress: (progress: number) => void,
): Promise<ChatExport> {
  const messagesFile = files.find(isMessagesFile);

  if (!messagesFile) {
    console.error("[fileParser] messages.json not found in directory:", {
      fileCount: files.length,
      fileNames: files.map((f) => f.name).slice(0, 10),
    });
    throw new Error("messages.json not found in directory");
  }

  // Parse messages.json first (90% of progress allocated to this)
  const data = normalizeSkypeExport(
    await readJsonFile(messagesFile, (prog) => onProgress(Math.min(prog * 0.9, 90))),
  );

  // Build a map of media files for efficient lookup during message rendering
  // Files are indexed by both full filename and media ID (without extension)
  const mediaMap = new Map<string, File>();
  let mediaFileCount = 0;

  for (const file of files) {
    const path = file.webkitRelativePath;
    const mediaIndex = path.indexOf(MEDIA_PATH_PREFIX);
    if (mediaIndex === -1) continue;

    // Extract filename from path (e.g., "media/abc123.1.jpg" -> "abc123.1.jpg")
    const fileName = path.substring(mediaIndex + MEDIA_PATH_PREFIX.length);
    const lastDotIndex = fileName.lastIndexOf(".");
    if (lastDotIndex <= 0) continue;

    // Store file by full filename (e.g., "abc123.1.jpg")
    mediaMap.set(fileName, file);
    mediaFileCount++;

    // Also store by media ID for non-JSON files (e.g., "abc123" -> file)
    // This allows lookup by ID without knowing the exact extension
    if (!fileName.endsWith(".json")) {
      const mediaId = fileName.substring(0, lastDotIndex);
      if (!mediaMap.has(mediaId)) {
        mediaMap.set(mediaId, file);
      }
    }
  }

  debugLog("[fileParser] Directory parsing complete:", {
    conversations: data.conversations.length,
    mediaFiles: mediaMap.size,
    mediaFileCount,
  });

  onProgress(100);

  return toChatExport({ ...data, mediaFiles: mediaMap });
}
