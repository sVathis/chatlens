import type { Reaction } from "../../model/chat";
import type { ViberChat } from "./types";

// Viber's reaction IDs, in the order of its reaction bar. Written as code point escapes.
const REACTION_EMOJI: Record<string, string> = {
  "1": "\u{1F44D}", // like
  "2": "\u{2764}\u{FE0F}", // love
  "3": "\u{1F602}", // laugh
  "4": "\u{1F62E}", // wow
  "5": "\u{1F622}", // sad
  "6": "\u{1F621}", // angry
  "7": "\u{1F44E}", // dislike
};

/** The emoji for a Viber reaction ID; an ID this version doesn't know is shown as "#id". */
export function reactionEmoji(id: string): string {
  return REACTION_EMOJI[id] ?? `#${id}`;
}

// The owner's own reaction is an ID in some places and the emoji itself in others
const ownEmoji = (value: string) => (/^\d+$/.test(value) ? reactionEmoji(value) : value);

/**
 * The reactions to a chat's messages, by message ID, put together from the two places
 * Viber's export has them:
 * - on a message: counts by reaction ID (groups and communities) and the owner's own;
 * - as separate events (one-to-one chats), in time order, each one a reaction or the
 *   reaction taken back, per person.
 * A message that has counts of its own is not given the other people's events as well, so
 * nothing is counted twice. The owner's own reaction is counted in addition to the others'
 * counts, which is how the exporter reports them. Events that name no message in the chat,
 * or say neither "reaction" nor "removed", are ignored.
 */
export function viberReactions(
  chat: ViberChat,
  selfIds: Set<string>,
): Record<string, Reaction[]> | undefined {
  const messageIds = new Set(chat.messages.map((message) => String(message.id)));
  const counts = new Map<string, Map<string, number>>();
  const own = new Map<string, string | null>();
  const others = new Map<string, Map<string, string>>();
  const hasCounts = new Set<string>();

  const add = (messageId: string, emoji: string, n: number) => {
    const byEmoji = counts.get(messageId) ?? new Map<string, number>();
    byEmoji.set(emoji, (byEmoji.get(emoji) ?? 0) + n);
    counts.set(messageId, byEmoji);
  };

  for (const message of chat.messages) {
    const id = String(message.id);
    for (const [reactionId, count] of Object.entries(message.reactions?.others ?? {})) {
      if (count > 0) {
        add(id, reactionEmoji(reactionId), count);
        hasCounts.add(id);
      }
    }
    if (message.reactions?.self) own.set(id, ownEmoji(message.reactions.self));
  }

  const events = [...(chat.reactionEvents ?? [])].sort((a, b) => a.timestamp - b.timestamp);
  for (const event of events) {
    if (event.targetId === undefined) continue;
    if (event.reaction === undefined && event.removed !== true) continue;

    const id = String(event.targetId);
    if (!messageIds.has(id)) continue;
    const emoji = event.removed || event.reaction === undefined ? null : reactionEmoji(event.reaction);
    const mine = event.outgoing === true || (event.authorId !== undefined && selfIds.has(String(event.authorId)));

    if (mine) {
      own.set(id, emoji);
    } else if (!hasCounts.has(id)) {
      const byAuthor = others.get(id) ?? new Map<string, string>();
      const author = String(event.authorId ?? "unknown");
      if (emoji === null) byAuthor.delete(author);
      else byAuthor.set(author, emoji);
      others.set(id, byAuthor);
    }
  }

  const result: Record<string, Reaction[]> = {};
  for (const id of messageIds) {
    const total = new Map(counts.get(id) ?? []);
    const bump = (emoji: string | null | undefined) => {
      if (emoji) total.set(emoji, (total.get(emoji) ?? 0) + 1);
    };
    bump(own.get(id));
    for (const emoji of others.get(id)?.values() ?? []) bump(emoji);
    if (total.size === 0) continue;
    result[id] = [...total.entries()]
      .map(([emoji, count]) => ({ emoji, count }))
      .sort((a, b) => b.count - a.count);
  }
  return Object.keys(result).length > 0 ? result : undefined;
}
