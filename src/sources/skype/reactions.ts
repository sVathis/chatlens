import type { ChatConversation, Reaction } from "../../model/chat";
import { CALL_EVENT_PATTERNS, STRIP_HTML_PATTERN } from "./constants";
import { parseSkypeEmoji } from "./skypeEmoji";
import type { Message } from "./types";

/**
 * Skype records the emoji people send during a call as a thread of their own: a new
 * group chat holding a "member added" event, a "history is now visible" event and the
 * emoji. These helpers recognise such threads, so the conversation list can keep them
 * out of the way, and put their emoji where they belong, as reactions on the call in the
 * chat with that person.
 */

// The joiner (U+200D), the variation selectors (U+FE0F, U+FE0E) and the enclosing keycap
// (U+20E3) combine emoji, and are written as code point escapes so that no invisible
// character sits in this file.

// Emoji (a keycap such as 1 with its selector and keycap, a pictograph, a skin tone, a
// flag), the joiner and selectors that combine them, and whitespace: nothing else
const EMOJI_ONLY =
  /^(?:[0-9#*]\u{FE0F}?\u{20E3}|\p{Extended_Pictographic}|\p{Emoji_Modifier}|\p{Regional_Indicator}|\u{200D}|\u{FE0F}|\u{FE0E}|\s)+$/u;

// One emoji: a keycap, a pictograph with an optional modifier joined to others (a family,
// a profession), or a flag. Spelled out because Intl.Segmenter is missing from some
// browsers.
const EMOJI_SEQUENCE =
  /[0-9#*]\u{FE0F}?\u{20E3}|\p{Extended_Pictographic}(?:\u{FE0F}|\p{Emoji_Modifier})?(?:\u{200D}\p{Extended_Pictographic}(?:\u{FE0F}|\p{Emoji_Modifier})?)*|\p{Regional_Indicator}{2}/gu;

const isSystemEvent = (message: Message) => message.messagetype.startsWith("ThreadActivity");

/** The text of a message that is only emoji (any Skype markup read), otherwise null. */
export function emojiOf(message: Message): string | null {
  const { messagetype } = message;
  if (messagetype !== "RichText" && messagetype !== "Text" && messagetype !== "RichText/Html") {
    return null;
  }
  const text = parseSkypeEmoji(message.content ?? "").replace(STRIP_HTML_PATTERN, "").trim();
  return text && EMOJI_ONLY.test(text) ? text : null;
}

/** Whether a thread holds at least one emoji and nothing but emoji and system events. */
export function isEmojiOnlyThread(messages: Message[]): boolean {
  let emoji = 0;
  for (const message of messages) {
    if (isSystemEvent(message)) continue;
    if (emojiOf(message) === null) return false;
    emoji++;
  }
  return emoji > 0;
}

/** The separate emoji in a text of emoji. */
export function emojiSequences(text: string): string[] {
  return text.match(EMOJI_SEQUENCE) ?? [];
}

/**
 * The people in a thread other than the owner, as far as its messages tell: whoever wrote
 * in it, and whoever added or was added.
 */
function otherMembers(messages: Message[], ownerId: string): Set<string> {
  const others = new Set<string>();
  const add = (id: string | undefined) => {
    if (id && id !== ownerId) others.add(id);
  };

  for (const message of messages) {
    if (!isSystemEvent(message)) {
      add(message.from);
    } else if (message.messagetype === "ThreadActivity/AddMember") {
      for (const match of message.content.matchAll(/<target>([^<]+)<\/target>/g)) add(match[1]);
      add(message.content.match(/<initiator>([^<]+)<\/initiator>/)?.[1]);
    }
  }
  return others;
}

/**
 * The one person, besides the owner, in a thread that has exactly two people, or null.
 * It must be certain: an emoji in a real group (the owner, a friend and a third person)
 * has to stay in its group, however few of them wrote. So the thread needs to say how
 * many people it has (two), or, without a count, show who was added, and everything it
 * shows must point at one other person.
 */
function otherPerson(thread: ChatConversation, ownerId: string): string | null {
  const messages = thread.messages as Message[];
  const others = otherMembers(messages, ownerId);
  if (others.size !== 1) return null;

  if (thread.memberCount !== undefined) return thread.memberCount === 2 ? [...others][0] : null;
  const showsWhoWasAdded = messages.some((message) => message.messagetype === "ThreadActivity/AddMember");
  return showsWhoWasAdded ? [...others][0] : null;
}

interface CallWindow {
  messageId: string;
  start: number;
  end: number;
}

/** When each finished call in a chat took place: its end, and its start from its length. */
function callWindows(messages: Message[]): CallWindow[] {
  const windows: CallWindow[] = [];
  for (const message of messages) {
    if (!message.messagetype.startsWith("Event/Call")) continue;
    if (message.content.match(CALL_EVENT_PATTERNS.Type)?.[1]?.toLowerCase() !== "ended") continue;

    const end = Date.parse(message.originalarrivaltime);
    if (Number.isNaN(end)) continue;
    let seconds = 0;
    for (const match of message.content.matchAll(/<duration>([^<]+)<\/duration>/gi)) {
      const value = parseFloat(match[1]);
      if (!Number.isNaN(value)) seconds = Math.max(seconds, value);
    }
    windows.push({ messageId: message.id, start: end - seconds * 1000, end });
  }
  return windows.sort((a, b) => a.start - b.start);
}

// An emoji may be logged a little before a call is or a little after it ends
const TOLERANCE_MS = 10 * 60 * 1000;
// Longest call looked back for, which keeps the search short
const LONGEST_CALL_MS = 24 * 60 * 60 * 1000;

/** The call that was going on at that time, or the nearest one within the tolerance. */
function callAt(windows: CallWindow[], time: number): CallWindow | null {
  // First window that starts too late to matter
  let low = 0;
  let high = windows.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (windows[middle].start > time + TOLERANCE_MS) high = middle;
    else low = middle + 1;
  }

  let best: CallWindow | null = null;
  let bestDistance = Infinity;
  for (let i = low - 1; i >= 0 && windows[i].start >= time - LONGEST_CALL_MS; i--) {
    const window = windows[i];
    const distance = time < window.start ? window.start - time : time > window.end ? time - window.end : 0;
    if (distance <= TOLERANCE_MS && distance < bestDistance) {
      best = window;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * The emoji sent in a thread, each with when it was sent, oldest first. System events
 * are not emoji.
 */
function emojiMessages(messages: Message[]): { time: number; emoji: string[] }[] {
  const found: { time: number; emoji: string[] }[] = [];
  for (const message of messages) {
    if (isSystemEvent(message)) continue;
    const text = emojiOf(message);
    if (text !== null) {
      found.push({ time: Date.parse(message.originalarrivaltime), emoji: emojiSequences(text) });
    }
  }
  return found.sort((a, b) => a.time - b.time);
}

function addReactions(chat: ChatConversation, messageId: string, emoji: string[]) {
  const reactions = ((chat.reactions ??= {})[messageId] ??= []);
  for (const one of emoji) {
    const existing = reactions.find((reaction: Reaction) => reaction.emoji === one);
    if (existing) existing.count++;
    else reactions.push({ emoji: one, count: 1 });
  }
  reactions.sort((a, b) => b.count - a.count);
}

/**
 * Moves the emoji of each emoji-only thread onto the call each was sent during. A thread
 * is only used when it is certain to have two people (see otherPerson), and then matched
 * to the chat with the other person. Every emoji is placed by the time it was sent, on
 * its own, so one thread can feed several calls, and an emoji sent when no call was going
 * on stays where it is. The thread's own creation, and the other events in it, play no
 * part. Changes the conversations it is given.
 */
export function attachCallReactions(conversations: ChatConversation[], ownerId: string): void {
  const byId = new Map(conversations.map((conversation) => [conversation.id, conversation]));
  const windowsByChat = new Map<string, CallWindow[]>();

  for (const thread of conversations) {
    if (!thread.emojiOnly) continue;

    const chat = byId.get(otherPerson(thread, ownerId) ?? "");
    if (!chat) continue;

    let windows = windowsByChat.get(chat.id);
    if (!windows) {
      windows = callWindows(chat.messages as Message[]);
      windowsByChat.set(chat.id, windows);
    }

    const placedOn = new Set<string>();
    let everyEmojiPlaced = true;
    for (const { time, emoji } of emojiMessages(thread.messages as Message[])) {
      const call = emoji.length > 0 ? callAt(windows, time) : null;
      if (!call) {
        everyEmojiPlaced = false;
        continue;
      }
      addReactions(chat, call.messageId, emoji);
      placedOn.add(call.messageId);
    }

    if (everyEmojiPlaced && placedOn.size > 0) {
      thread.shownOn = { conversationId: chat.id, messageIds: [...placedOn] };
    }
  }
}
