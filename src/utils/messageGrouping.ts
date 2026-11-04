import type { ProcessedMessage } from "../types/messages";
import { GROUP_TIME_THRESHOLD } from "../constants/messages";

const DATE_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

/**
 * Groups messages by date for display purposes.
 * Returns a map where keys are formatted dates and values are arrays of messages.
 */
export function groupMessagesByDate(
  messages: ProcessedMessage[],
): Map<string, ProcessedMessage[]> {
  const grouped = new Map<string, ProcessedMessage[]>();

  for (const message of messages) {
    const dateKey = DATE_FORMATTER.format(new Date(message.timestamp));
    const group = grouped.get(dateKey) || [];
    group.push(message);
    grouped.set(dateKey, group);
  }

  return grouped;
}

/**
 * Determines if a message should be visually grouped with the previous message.
 *
 * Grouping rules:
 * 1. Must be from same sender
 * 2. Must be same message type (text/media/system)
 * 3. Must be within time threshold (GROUP_TIME_THRESHOLD)
 * 4. System messages are never grouped
 *
 * Grouped messages share the same bubble styling and only show sender/timestamp on the first message.
 */
export function shouldGroupWithPrevious(
  current: ProcessedMessage,
  previous: ProcessedMessage | null,
): boolean {
  // Different sender or type cannot be grouped
  if (
    !previous ||
    current.from !== previous.from ||
    current.type !== previous.type
  ) {
    return false;
  }
  // System messages are always displayed separately
  if (current.type === "system" || previous.type === "system") {
    return false;
  }

  // Check if messages are close enough in time to be grouped
  const timeDiff = Math.abs(
    new Date(current.timestamp).getTime() -
      new Date(previous.timestamp).getTime(),
  );
  return timeDiff < GROUP_TIME_THRESHOLD;
}
