import type { ChatExport, SourceId, SourceMessage } from "../model/chat";
import type { MediaMetadata, ProcessedMessage } from "../types/messages";

/** Finds and opens a source's attachments. `files` is ChatExport.mediaFiles. */
export interface MediaResolver {
  getMetadata(mediaId: string, files: Map<string, File>): Promise<MediaMetadata | null>;
  getType(mediaId: string, files: Map<string, File>): Promise<"image" | "video" | null>;
  /** An object URL for the attachment, which the caller must revoke. */
  createUrl(mediaId: string, files: Map<string, File>): Promise<string | null>;
  /** An object URL for a video's still image, which the caller must revoke. */
  createThumbnailUrl(mediaId: string, files: Map<string, File>): Promise<string | null>;
}

export interface ProcessOptions {
  ownerId: string;
  /** Show the conversation from the other participant's side. */
  swapped: boolean;
  mediaFiles?: Map<string, File>;
  /** Only process this many messages from the start of the list. */
  limit?: number;
}

/**
 * Everything ChatLens needs to know about one chat app. Messages stay in the source's
 * own format; adapters are the only code that looks inside them.
 */
export interface SourceAdapter {
  id: SourceId;

  /** Whether the files of an uploaded folder are an export of this source. */
  canLoadFolder(files: File[]): boolean;
  loadFolder(files: File[], onProgress: (progress: number) => void): Promise<ChatExport>;
  /** Whether a parsed JSON file is an export (or part of one) of this source. */
  canLoadJson(parsed: unknown): boolean;
  fromJson(parsed: unknown): ChatExport;

  /**
   * The displayed form of the first `limit` messages (all when omitted).
   *
   * `ProcessedMessage.content` is HTML. Call this through `processForDisplay`
   * (src/sources/index.ts), which sanitizes it with an allowlist before anything renders
   * it, so an adapter can't make the viewer run code by mistake. An adapter should still
   * escape any plain text it puts into the HTML (a name, a file name, a message), because
   * the sanitizer only removes what is unsafe, it doesn't turn text into text.
   */
  process(messages: SourceMessage[], options: ProcessOptions): ProcessedMessage[];
  /** One line about a conversation's newest message, for the conversation list. */
  preview(messages: SourceMessage[], ownerId: string): string;
  /** Names the kind of a message the viewer doesn't display, for the link notice. */
  typeOf(message: SourceMessage): string;
  /** A person or conversation ID in the form to show to the user. */
  displayName(id: string | null | undefined): string | null;

  media: MediaResolver;
}
