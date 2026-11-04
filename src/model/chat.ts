/**
 * The source-neutral model ChatLens works with. Each supported chat app has an adapter
 * (src/sources/) that turns its export into a ChatExport and knows how to show its
 * messages. Everything here is plain data (plus a Map of File objects), so a loaded
 * export can be copied between tabs with structured clone.
 */

/** The chat apps ChatLens can open exports from. */
export type SourceId = "skype";

/**
 * A message in the source's own format. The shared code only needs its ID; everything
 * else about it is the adapter's business (see SourceAdapter).
 */
export interface SourceMessage {
  /** Unique within its conversation; what deep links point at. */
  id: string;
}

export interface ChatConversation {
  /** The source's own conversation ID; what deep links point at. */
  id: string;
  title: string;
  /** ISO time of the newest message, or "" when there are no messages. */
  lastActivity: string;
  /**
   * Newest message first, which the viewer relies on: it shows the start of the list at
   * the bottom and loads older messages as you scroll up. An adapter puts them in this
   * order when it builds the conversation, whatever order its export lists them in.
   */
  messages: SourceMessage[];
}

export interface ChatExport {
  source: SourceId;
  /** The exporting user's ID, which decides on which side messages appear. */
  ownerId: string;
  exportedAt: string;
  conversations: ChatConversation[];
  /** Attachments from the export folder, keyed as the source's adapter expects. */
  mediaFiles?: Map<string, File>;
}
