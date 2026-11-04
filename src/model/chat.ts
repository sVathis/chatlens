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

/**
 * What a conversation is, where the source says so: a chat with one other person, a chat
 * with several people, or an account that is not a person (a bot or a system feed).
 */
export type ConversationKind = "direct" | "group" | "service";

/** Emoji sent in reaction to a message, counted by emoji. */
export interface Reaction {
  emoji: string;
  count: number;
}

export interface ChatConversation {
  /** The source's own conversation ID; what deep links point at. */
  id: string;
  title: string;
  /** Omitted when the source doesn't say. */
  kind?: ConversationKind;
  /** How many people are in a group, when the export says so. */
  memberCount?: number;
  /**
   * True for a conversation that holds nothing but emoji (and system events), such as the
   * little threads Skype records for reactions sent during a call. The conversation list
   * keeps these together, out of the way.
   */
  emojiOnly?: boolean;
  /**
   * Where the emoji of an emoji-only conversation are shown instead, as reactions on
   * messages of another conversation. Set only when every one of its emoji was placed; a
   * conversation whose emoji were placed in part, or not at all, leaves this out.
   */
  shownOn?: { conversationId: string; messageIds: string[] };
  /** Reactions to this conversation's messages, by message ID. */
  reactions?: Record<string, Reaction[]>;
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
