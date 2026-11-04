import type { Reaction } from "../model/chat";
import type { ProcessedMessage } from "../types/messages";

/**
 * The messages with their reactions attached. `reactions` is keyed by original message
 * ID (ChatConversation.reactions); a message that stands for several (a translation pair)
 * takes the reactions of whichever of its IDs has them. Messages without any are
 * returned as they are.
 */
export function withReactions(
  messages: ProcessedMessage[],
  reactions: Record<string, Reaction[]>,
): ProcessedMessage[] {
  return messages.map((message) => {
    const found =
      reactions[message.id] ?? message.mergedIds?.map((id) => reactions[id]).find(Boolean);
    return found ? { ...message, reactions: found } : message;
  });
}
