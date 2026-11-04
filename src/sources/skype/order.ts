import type { Message } from "./types";

/**
 * A conversation's messages newest first, which the shared model and the viewer expect
 * (the viewer shows the start of the list at the bottom and loads older messages as you
 * scroll up). Skype writes its lists that way. One written the other way round is
 * reversed, since the viewer would otherwise show the oldest messages first and load
 * newer ones when scrolling up.
 *
 * The two ends are compared by time, so a list already in order is returned as it is,
 * without copying. Reversing keeps every message's neighbours, which is what pairs such
 * as a translation and its original rely on.
 */
export function newestFirst(messages: Message[]): Message[] {
  const last = messages.length - 1;
  if (last < 1) return messages;
  return Date.parse(messages[0].originalarrivaltime) <
    Date.parse(messages[last].originalarrivaltime)
    ? [...messages].reverse()
    : messages;
}
