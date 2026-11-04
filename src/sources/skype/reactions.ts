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

// The joiner (U+200D) and variation selectors (U+FE0F, U+FE0E) combine emoji, and are
// written as code point escapes so that no invisible character sits in this file.

// Emoji, skin tones, flags, the joiner and selectors that combine them, and whitespace:
// nothing else
const EMOJI_ONLY =
  /^(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|\p{Regional_Indicator}|\u{200D}|\u{FE0F}|\u{FE0E}|\s)+$/u;

// One emoji: a pictograph with an optional modifier, joined to others (a family, a
// profession), or a flag. Spelled out because Intl.Segmenter is missing from some browsers.
const EMOJI_SEQUENCE =
  /\p{Extended_Pictographic}(?:\u{FE0F}|\p{Emoji_Modifier})?(?:\u{200D}\p{Extended_Pictographic}(?:\u{FE0F}|\p{Emoji_Modifier})?)*|\p{Regional_Indicator}{2}/gu;

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
 * The one person, other than the owner, in a thread: the only other writer, or, when
 * only the owner wrote, the only other person added to it. Null when it is unclear.
 */
function otherPerson(messages: Message[], ownerId: string): string | null {
  const writers = new Set<string>();
  for (const message of messages) {
    if (!isSystemEvent(message) && message.from && message.from !== ownerId) {
      writers.add(message.from);
    }
  }
  if (writers.size === 1) return [...writers][0];
  if (writers.size > 1) return null;

  const added = new Set<string>();
  for (const message of messages) {
    if (message.messagetype !== "ThreadActivity/AddMember") continue;
    for (const match of message.content.matchAll(/<target>([^<]+)<\/target>/g)) {
      if (match[1] !== ownerId) added.add(match[1]);
    }
  }
  return added.size === 1 ? [...added][0] : null;
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

// A thread may start a little before the call is logged or end a little after it
const TOLERANCE_MS = 10 * 60 * 1000;
// Longest call looked back for, which keeps the search short
const LONGEST_CALL_MS = 24 * 60 * 60 * 1000;

/** The call whose time the thread overlaps most, if it overlaps any. */
function callOfThread(windows: CallWindow[], from: number, to: number): CallWindow | null {
  // First window that starts too late to overlap
  let low = 0;
  let high = windows.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (windows[middle].start > to + TOLERANCE_MS) high = middle;
    else low = middle + 1;
  }

  let best: CallWindow | null = null;
  let bestOverlap = -Infinity;
  for (let i = low - 1; i >= 0 && windows[i].start >= from - LONGEST_CALL_MS; i--) {
    const window = windows[i];
    if (window.end < from - TOLERANCE_MS) continue;
    const overlap = Math.min(to, window.end) - Math.max(from, window.start);
    if (overlap > bestOverlap) {
      best = window;
      bestOverlap = overlap;
    }
  }
  return best;
}

/**
 * Moves the emoji of each emoji-only thread onto the call it was sent during. The thread
 * is matched to the chat with the other person in it, and to the call in that chat that
 * overlaps it in time. A thread that can't be matched is left as it is. Changes the
 * conversations it is given.
 */
export function attachCallReactions(conversations: ChatConversation[], ownerId: string): void {
  const byId = new Map(conversations.map((conversation) => [conversation.id, conversation]));
  const windowsByChat = new Map<string, CallWindow[]>();

  for (const thread of conversations) {
    if (!thread.emojiOnly) continue;

    const messages = thread.messages as Message[];
    const chat = byId.get(otherPerson(messages, ownerId) ?? "");
    if (!chat) continue;

    let windows = windowsByChat.get(chat.id);
    if (!windows) {
      windows = callWindows(chat.messages as Message[]);
      windowsByChat.set(chat.id, windows);
    }

    const times = messages.map((message) => Date.parse(message.originalarrivaltime));
    const call = callOfThread(windows, Math.min(...times), Math.max(...times));
    if (!call) continue;

    const emoji = messages.flatMap((message) => emojiSequences(emojiOf(message) ?? ""));
    if (emoji.length === 0) continue;

    thread.shownOn = { conversationId: chat.id, messageId: call.messageId };
    const reactions = ((chat.reactions ??= {})[call.messageId] ??= []);
    for (const one of emoji) {
      const existing = reactions.find((reaction: Reaction) => reaction.emoji === one);
      if (existing) existing.count++;
      else reactions.push({ emoji: one, count: 1 });
    }
    reactions.sort((a, b) => b.count - a.count);
  }
}
