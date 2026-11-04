import { skypeSource } from "../../sources/skype";
import type { Message } from "../../sources/skype/types";

// Builders for chats, calls and the threads Skype keeps for reactions sent during a call.

export const OWNER = "8:live:.cid.owner";
export const CONTACT = "8:live:.cid.contact";
export const STRANGER = "8:live:.cid.stranger";

export const HEART = "\u{2764}\u{FE0F}";
export const LAUGH = "\u{1F602}";
export const THUMBS_UP_TONE = "\u{1F44D}\u{1F3FD}";
export const FAMILY = "\u{1F468}\u{200D}\u{1F469}\u{200D}\u{1F467}";
export const FLAG = "\u{1F1EC}\u{1F1F7}";

let counter = 0;
export const message = (
  type: string,
  time: string,
  content: string,
  from = CONTACT,
  id = `m${++counter}`,
): Message => ({
  id,
  displayName: null,
  originalarrivaltime: time,
  messagetype: type,
  version: 1,
  content,
  conversationid: "x",
  from,
});

export const at = (day: string, time: string) => `2024-08-${day}T${time}.000Z`;

/** A finished call: logged when it ended, with its length. */
export const call = (id: string, end: string, seconds: number) =>
  message(
    "Event/Call",
    end,
    `<partlist type="ended" alt=""><part identity="${CONTACT}"><name>Contact</name><duration>${seconds}</duration></part></partlist>`,
    OWNER,
    id,
  );

/**
 * The thread Skype keeps for a call: members added, history made visible, then the emoji
 * as [time, writer, emoji]. Chronological, which a conversation's list reverses.
 */
export function thread(
  id: string,
  start: string,
  emoji: [string, string, string][],
  added = [OWNER, CONTACT],
) {
  const events = [
    message(
      "ThreadActivity/AddMember",
      start,
      `<addmember>${added.map((target) => `<target>${target}</target>`).join("")}</addmember>`,
      id,
    ),
    message("ThreadActivity/HistoryDisclosedUpdate", start, "<value>true</value>", id),
  ];
  const texts = emoji.map(([time, from, text]) => message("RichText", time, text, from));
  return { id, displayName: "A group", MessageList: [...events, ...texts].reverse() };
}

export const chat = (id: string, messages: Message[]) => ({
  id,
  displayName: "Contact",
  MessageList: messages,
});

export const load = (conversations: object[]) =>
  skypeSource.fromJson({ userId: OWNER, exportDate: "", conversations });

