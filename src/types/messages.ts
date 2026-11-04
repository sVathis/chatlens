import type { Reaction } from "../model/chat";

/** What the viewer renders. Every source's adapter produces these (see src/sources/). */
export interface ProcessedMessage {
  id: string;
  displayName: string | null;
  timestamp: string;
  /** HTML, sanitized by processForDisplay before it reaches any renderer. */
  content: string;
  type: "text" | "system" | "call" | "notice" | "media";
  from: string;
  isOwner: boolean;
  originalMessageType: string;
  mediaUrl?: string;
  /** Original message IDs folded into this displayed message (e.g. translation pairs). */
  mergedIds?: string[];
  /** Emoji sent in reaction to this message (see ChatConversation.reactions). */
  reactions?: Reaction[];

  // What some sources' messages carry beyond text. Text in these is plain (the renderer
  // escapes it); `caption` is HTML, sanitized by processForDisplay like `content`.

  /** Text shown under a media message. */
  caption?: string;
  /** The message this one replies to. `messageId` is set when it is in the conversation. */
  quote?: { text: string; messageId?: string };
  /** A voice message or a file, whose content is the file under `key` in the export. */
  attachment?: { kind: "audio" | "file"; key?: string; name?: string; durationMs?: number };
  /** A link with a preview. Only http and https URLs are kept. */
  link?: { url: string; title?: string };
  location?: { lat: number; lon: number };
  contactCard?: { name?: string; number?: string };
  edited?: boolean;
  forwarded?: boolean;
}

export interface MediaMetadata {
  expiry_date: string;
  filename: string;
  contents: {
    [key: string]: {
      type: string;
    };
  };
}

export interface MediaItem {
  id: string;
  mediaId: string;
  timestamp: string;
  displayName: string | null;
  isOwner: boolean;
}
