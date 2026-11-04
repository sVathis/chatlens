import type { ChatConversation } from "../model/chat";

/**
 * A short note saying what a conversation is, for the conversation list; null for a chat
 * with one person (the common case, which needs no note) and when the source doesn't say.
 */
export function conversationLabel(conversation: ChatConversation): string | null {
  if (conversation.emojiOnly) {
    return conversation.shownOn ? "Emoji only · shown on a call" : "Emoji only";
  }
  switch (conversation.kind) {
    case "group": {
      const members = conversation.memberCount;
      return members ? `Group · ${members} ${members === 1 ? "person" : "people"}` : "Group";
    }
    case "service":
      return "Service";
    default:
      return null;
  }
}
