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
