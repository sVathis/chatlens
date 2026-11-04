import type { Message } from "./types";

/**
 * Index of the newest message in a conversation's `MessageList`, or -1 when it is empty.
 *
 * The viewer treats the list as newest first, so this is normally 0. It compares the
 * two ends by time instead of assuming that, so the conversation list shows the right
 * time and preview for a list in the other order too.
 */
export function newestMessageIndex(messages: Message[]): number {
  if (messages.length === 0) return -1;
  const last = messages.length - 1;
  if (last === 0) return 0;
  return Date.parse(messages[0].originalarrivaltime) >=
    Date.parse(messages[last].originalarrivaltime)
    ? 0
    : last;
}
