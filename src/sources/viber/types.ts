/**
 * The shapes of viber_export.json, version 1, as ViberPC-Export writes it (see its
 * README). Optional fields are omitted in the file when absent, never empty or null.
 */

export interface ViberContact {
  name?: string;
  number?: string;
}

export interface ViberMedia {
  /** Relative to the export folder, e.g. "media/Name/2023-11-14_104_photo.jpg". */
  path?: string;
  status?: "original" | "thumbnail" | "missing";
  name?: string;
  durationMs?: number;
}

export interface ViberMessage {
  id: number;
  /** Epoch milliseconds. */
  timestamp: number;
  /** Not on calls. */
  authorId?: number;
  /** Not on calls. */
  outgoing?: boolean;
  /** Calls only: the other party. */
  peerId?: number;
  kind: string;
  text?: string;
  caption?: string;
  link?: { url?: string; title?: string };
  media?: ViberMedia;
  sticker?: { id?: number; path?: string };
  replyTo?: { text?: string; messageId?: number };
  edited?: boolean;
  forwarded?: boolean;
  /** Counts by Viber reaction ID; `self` is the owner's own reaction (an ID or an emoji). */
  reactions?: { others?: Record<string, number>; self?: string };
  location?: { lat?: number; lon?: number };
  contact?: ViberContact;
}

/** Viber's own reaction records (1:1 chats), kept apart from the messages. */
export interface ViberReactionEvent {
  id: number;
  timestamp: number;
  authorId?: number;
  outgoing?: boolean;
  /** The message reacted to, when it is in the export. */
  targetId?: number;
  /** Viber's reaction ID, or none when the reaction was taken back. */
  reaction?: string;
  removed?: boolean;
}

export interface ViberChat {
  id: number;
  title?: string;
  type?: "direct" | "group" | "community";
  /** The other participants (not the owner). */
  memberIds?: number[];
  /** Oldest first. */
  messages: ViberMessage[];
  reactionEvents?: ViberReactionEvent[];
}

export interface ViberExport {
  format: string;
  version: number;
  exportedAt?: string;
  self?: { contactIds?: number[]; name?: string; number?: string };
  contacts?: Record<string, ViberContact>;
  chats: ViberChat[];
}

/**
 * A Viber message as ChatLens keeps it in a conversation: the exporter's message with its
 * IDs as text (as every source's are) and the people's names looked up.
 */
export interface ViberMsg {
  id: string;
  /** Epoch milliseconds. */
  timestamp: number;
  kind: string;
  /** Who it is from: "viber:self" for the owner, "viber:<contact>", or for a call its peer. */
  from: string;
  /** The author's name, null for the owner and for events. */
  authorName: string | null;
  outgoing: boolean;
  /** Calls only: the other party's name. */
  peerName?: string | null;
  text?: string;
  caption?: string;
  link?: { url?: string; title?: string };
  media?: ViberMedia;
  sticker?: { id?: number; path?: string };
  replyTo?: { text?: string; messageId?: string };
  edited?: boolean;
  forwarded?: boolean;
  location?: { lat?: number; lon?: number };
  contact?: ViberContact;
}
