import { describe, expect, it } from "vitest";
import { processForDisplay } from "../sources";
import { skypeSource } from "../sources/skype";
import {
  CONTACT,
  FAMILY,
  FLAG,
  HEART,
  LAUGH,
  OWNER,
  STRANGER,
  THUMBS_UP_TONE,
  at,
  call,
  chat,
  load,
  message,
  thread,
} from "./fixtures/callThreads";
import { emojiOf, emojiSequences, isEmojiOnlyThread } from "../sources/skype/reactions";
import { conversationLabel } from "../utils/conversationLabel";
import { withReactions } from "../utils/reactions";
import type { ProcessedMessage } from "../types/messages";

describe("recognising emoji-only messages", () => {
  it("accepts emoji however they are written", () => {
    expect(emojiOf(message("RichText", at("01", "10:00:00"), HEART))).toBe(HEART);
    expect(emojiOf(message("Text", at("01", "10:00:00"), `${LAUGH} ${LAUGH}`))).toBe(`${LAUGH} ${LAUGH}`);
    expect(emojiOf(message("RichText", at("01", "10:00:00"), THUMBS_UP_TONE))).toBe(THUMBS_UP_TONE);
    expect(emojiOf(message("RichText", at("01", "10:00:00"), FAMILY))).toBe(FAMILY);
    expect(emojiOf(message("RichText", at("01", "10:00:00"), FLAG))).toBe(FLAG);
    // Skype's own markup for an emoticon
    expect(emojiOf(message("RichText", at("01", "10:00:00"), '<ss type="smile">(smile)</ss>'))).toBe(
      "\u{1F60A}",
    );
  });

  it("rejects anything else", () => {
    for (const content of ["hello", `hello ${HEART}`, "123", "#", "", "   ", "<b>bold</b>"]) {
      expect(emojiOf(message("RichText", at("01", "10:00:00"), content)), JSON.stringify(content)).toBeNull();
    }
    // Only messages with text are looked at
    expect(emojiOf(message("Event/Call", at("01", "10:00:00"), HEART))).toBeNull();
  });

  it("splits a text of emoji into the separate emoji", () => {
    expect(emojiSequences(`${HEART}${LAUGH}${THUMBS_UP_TONE}${FAMILY}${FLAG}${LAUGH}`)).toEqual([
      HEART,
      LAUGH,
      THUMBS_UP_TONE,
      FAMILY,
      FLAG,
      LAUGH,
    ]);
    expect(emojiSequences("no emoji")).toEqual([]);
  });

  it("recognises keycap emoji, with and without the variation selector", () => {
    const keycaps = [..."0123456789#*"].map((key) => `${key}\u{FE0F}\u{20E3}`);
    for (const keycap of keycaps) {
      expect(emojiOf(message("RichText", at("01", "10:00:00"), keycap)), keycap).toBe(keycap);
      const bare = keycap.replace("\u{FE0F}", "");
      expect(emojiOf(message("RichText", at("01", "10:00:00"), bare)), bare).toBe(bare);
    }
    expect(emojiSequences(keycaps.join(""))).toEqual(keycaps);
    expect(emojiSequences(`${HEART}${keycaps[1]}${LAUGH}${keycaps[10]}`)).toEqual([HEART, keycaps[1], LAUGH, keycaps[10]]);
    // The characters alone, or just next to each other, are not emoji
    for (const plain of ["1", "#", "*", "12", "1 2", "#1"]) {
      expect(emojiOf(message("RichText", at("01", "10:00:00"), plain)), plain).toBeNull();
    }
    // A keycap among text is not an emoji-only message
    expect(emojiOf(message("RichText", at("01", "10:00:00"), `call me ${keycaps[1]}`))).toBeNull();
  });

  it("calls a thread emoji-only when it holds nothing but emoji and system events", () => {
    const events = thread("19:a@thread.skype", at("01", "10:00:00"), []).MessageList;
    const emoji = message("RichText", at("01", "10:00:01"), HEART);
    expect(isEmojiOnlyThread([emoji, ...events])).toBe(true);
    // No emoji at all
    expect(isEmojiOnlyThread(events)).toBe(false);
    expect(isEmojiOnlyThread([])).toBe(false);
    // Any text, or any call event, makes it a real conversation
    expect(isEmojiOnlyThread([message("RichText", at("01", "10:00:02"), "hi"), emoji, ...events])).toBe(false);
    expect(isEmojiOnlyThread([call("c", at("01", "10:00:03"), 5), emoji, ...events])).toBe(false);
  });

  it("flags only group threads in the shared model", () => {
    const hearts: [string, string, string][] = [[at("01", "10:00:05"), CONTACT, HEART]];
    const group = thread("19:a@thread.skype", at("01", "10:00:00"), hearts);
    const talkative = thread("19:b@thread.skype", at("01", "10:00:00"), [[at("01", "10:00:05"), CONTACT, "hello"]]);
    const direct = chat(CONTACT, [message("RichText", at("01", "10:00:05"), HEART)]);

    const byId = Object.fromEntries(load([group, talkative, direct]).conversations.map((c) => [c.id, c]));
    expect(byId["19:a@thread.skype"].emojiOnly).toBe(true);
    expect(byId["19:b@thread.skype"].emojiOnly).toBeUndefined();
    expect(byId[CONTACT].emojiOnly).toBeUndefined(); // a chat with one person is never collapsed
  });
});

// Call A ran 18:31 to 18:36 on the 10th, call B 18:00 to 18:10 on the 11th
const callA = call("callA", at("10", "18:36:00"), 300);
const callB = call("callB", at("11", "18:10:00"), 600);
const direct = chat(CONTACT, [callB, message("RichText", at("11", "17:00:00"), "hi", OWNER), callA]);

function exportWith(...threads: object[]) {
  const conversations = load([direct, ...threads]).conversations;
  return {
    chat: conversations.find((c) => c.id === CONTACT)!,
    byId: Object.fromEntries(conversations.map((c) => [c.id, c])),
  };
}

describe("reactions sent during a call", () => {
  it("puts the emoji on the call, counted, and says where each thread went", () => {
    const first = thread("19:t1@thread.skype", at("10", "18:31:05"), [
      [at("10", "18:32:00"), CONTACT, HEART],
      [at("10", "18:33:00"), OWNER, HEART],
      [at("10", "18:34:00"), CONTACT, LAUGH],
    ]);
    // A second thread for the same call adds to it
    const second = thread("19:t2@thread.skype", at("10", "18:35:00"), [[at("10", "18:35:30"), CONTACT, HEART]]);
    // Only the owner wrote: the other person is found from who was added
    const third = thread("19:t3@thread.skype", at("11", "18:01:00"), [[at("11", "18:02:00"), OWNER, HEART]]);

    const { chat, byId } = exportWith(first, second, third);

    expect(chat.reactions).toEqual({
      callA: [
        { emoji: HEART, count: 3 },
        { emoji: LAUGH, count: 1 },
      ],
      callB: [{ emoji: HEART, count: 1 }],
    });
    expect(byId["19:t1@thread.skype"].shownOn).toEqual({ conversationId: CONTACT, messageIds: ["callA"] });
    expect(byId["19:t2@thread.skype"].shownOn).toEqual({ conversationId: CONTACT, messageIds: ["callA"] });
    expect(byId["19:t3@thread.skype"].shownOn).toEqual({ conversationId: CONTACT, messageIds: ["callB"] });
    // The threads themselves stay, flagged, so nothing is lost
    expect(byId["19:t1@thread.skype"].emojiOnly).toBe(true);
    expect(byId["19:t1@thread.skype"].messages.length).toBe(5);
  });

  it("shows them on the call when the chat is displayed", () => {
    const { chat } = exportWith(
      thread("19:t1@thread.skype", at("10", "18:31:05"), [[at("10", "18:32:00"), CONTACT, HEART]]),
    );
    const shown = processForDisplay(
      skypeSource,
      chat.messages,
      { ownerId: OWNER, swapped: false },
      chat.reactions,
    );

    const onCall = shown.find((m) => m.id === "callA")!;
    expect(onCall.type).toBe("call");
    expect(onCall.reactions).toEqual([{ emoji: HEART, count: 1 }]);
    expect(shown.filter((m) => m.reactions).map((m) => m.id)).toEqual(["callA"]);
  });

  it("leaves a thread alone when it can't tell which call it belongs to", () => {
    const noCall = thread("19:far@thread.skype", at("20", "09:00:00"), [[at("20", "09:00:10"), CONTACT, HEART]]);
    // An emoji a little after the call is logged still belongs to it; much later does not
    const justAfter = thread("19:after@thread.skype", at("10", "18:40:00"), [[at("10", "18:40:10"), CONTACT, HEART]]);
    const tooLate = thread("19:late@thread.skype", at("10", "18:55:00"), [[at("10", "18:55:10"), CONTACT, HEART]]);
    // Two people besides the owner wrote: whose call is it?
    const unclear = thread("19:two@thread.skype", at("10", "18:32:00"), [
      [at("10", "18:32:10"), CONTACT, HEART],
      [at("10", "18:32:20"), STRANGER, HEART],
    ]);
    // The other person has no chat in this export
    const noChat = thread("19:none@thread.skype", at("10", "18:32:00"), [[at("10", "18:32:10"), STRANGER, HEART]], [OWNER, STRANGER]);

    const { chat, byId } = exportWith(noCall, justAfter, tooLate, unclear, noChat);

    expect(byId["19:far@thread.skype"].shownOn).toBeUndefined();
    expect(byId["19:after@thread.skype"].shownOn?.messageIds).toEqual(["callA"]);
    expect(byId["19:late@thread.skype"].shownOn).toBeUndefined();
    expect(byId["19:two@thread.skype"].shownOn).toBeUndefined();
    expect(byId["19:none@thread.skype"].shownOn).toBeUndefined();
    // Only the one thread that matched added anything
    expect(chat.reactions).toEqual({ callA: [{ emoji: HEART, count: 1 }] });
    // All of them are still collapsed as emoji-only threads
    expect(Object.values(byId).filter((c) => c.emojiOnly)).toHaveLength(5);
  });

  it("picks the call an emoji was sent during when two are close together", () => {
    const first = call("first", at("12", "18:10:00"), 600); // 18:00 to 18:10
    const second = call("second", at("12", "18:20:00"), 480); // 18:12 to 18:20
    const between = thread("19:between@thread.skype", at("12", "18:09:00"), [[at("12", "18:15:00"), CONTACT, HEART]]);

    const conversations = load([chat(CONTACT, [second, first]), between]).conversations;
    expect(conversations.find((c) => c.id === "19:between@thread.skype")!.shownOn?.messageIds).toEqual(["second"]);
  });

  it("is worded for the conversation list", () => {
    const base = { id: "x", title: "t", lastActivity: "", messages: [] };
    const on = (...messageIds: string[]) => ({ conversationId: "a", messageIds });
    expect(conversationLabel({ ...base, emojiOnly: true })).toBe("Emoji only");
    expect(conversationLabel({ ...base, emojiOnly: true, shownOn: on("b") })).toBe("Emoji only · shown on a call");
    expect(conversationLabel({ ...base, emojiOnly: true, shownOn: on("b", "c") })).toBe("Emoji only · shown on calls");
    // The emoji-only note wins over the group label
    expect(conversationLabel({ ...base, kind: "group", memberCount: 2, emojiOnly: true })).toBe("Emoji only");
  });
});

describe("only a thread of exactly two people is matched", () => {
  const heart = (time: string): [string, string, string][] => [[at("10", time), CONTACT, HEART]];

  it("leaves the emoji of a real group in the group, even when only one friend wrote", () => {
    // The owner, the contact and a third person are in it; only the contact sent a heart,
    // during a call the owner had with the contact
    const group = thread("19:group@thread.skype", at("10", "18:31:05"), heart("18:32:00"), [OWNER, CONTACT, STRANGER]);
    const { chat, byId } = exportWith(group);

    expect(byId[group.id].emojiOnly).toBe(true); // still collapsed with the others
    expect(byId[group.id].shownOn).toBeUndefined();
    expect(chat.reactions).toBeUndefined();
  });

  it("counts whoever added the members, not only who was added or wrote", () => {
    // A third person added the owner and the contact, and then said nothing
    const addedByThird = thread("19:third@thread.skype", at("10", "18:31:05"), heart("18:32:00"), [OWNER, CONTACT], STRANGER);
    // The contact added the owner: still two people
    const addedByContact = thread("19:two@thread.skype", at("10", "18:33:05"), heart("18:34:00"), [OWNER], CONTACT);
    const { byId } = exportWith(addedByThird, addedByContact);

    expect(byId[addedByThird.id].shownOn).toBeUndefined();
    expect(byId[addedByContact.id].shownOn?.messageIds).toEqual(["callA"]);
  });

  it("trusts the member count the export gives", () => {
    // Nothing in the messages shows a third person, but the export says there are three
    const three = { ...thread("19:count3@thread.skype", at("10", "18:31:05"), heart("18:32:00")), threadProperties: { membercount: "3" } };
    const two = { ...thread("19:count2@thread.skype", at("10", "18:33:05"), heart("18:34:00")), threadProperties: { membercount: 2 } };
    const { byId } = exportWith(three, two);

    expect(byId[three.id].memberCount).toBe(3);
    expect(byId[three.id].shownOn).toBeUndefined();
    expect(byId[two.id].shownOn?.messageIds).toEqual(["callA"]);
  });

  it("needs some sign of who is in the thread", () => {
    // No member events and no count: the one who wrote could be one of several people
    const bare = { id: "19:bare@thread.skype", displayName: "A group", MessageList: [message("RichText", at("10", "18:32:00"), HEART, CONTACT)] };
    const counted = { ...bare, id: "19:counted@thread.skype", threadProperties: { membercount: 2 } };
    const { byId } = exportWith(bare, counted);

    expect(byId[bare.id].shownOn).toBeUndefined();
    expect(byId[counted.id].shownOn?.messageIds).toEqual(["callA"]);
  });
});

describe("each emoji is matched by when it was sent", () => {
  it("ignores when the thread was created", () => {
    // Created while call A was going on, but the heart was sent hours after any call
    const late = thread("19:late@thread.skype", at("10", "18:31:05"), [[at("10", "21:00:00"), CONTACT, HEART]]);
    const { chat, byId } = exportWith(late);

    expect(byId[late.id].shownOn).toBeUndefined();
    expect(chat.reactions).toBeUndefined();
  });

  it("sends the emoji of one thread to each of the calls they were sent during", () => {
    // One thread, created during call A, holds a heart sent during call A and a laugh sent
    // during call B the next day
    const both = thread("19:both@thread.skype", at("10", "18:31:05"), [
      [at("10", "18:33:00"), CONTACT, HEART],
      [at("11", "18:05:00"), CONTACT, LAUGH],
    ]);
    const { chat, byId } = exportWith(both);

    expect(chat.reactions).toEqual({ callA: [{ emoji: HEART, count: 1 }], callB: [{ emoji: LAUGH, count: 1 }] });
    expect(byId[both.id].shownOn).toEqual({ conversationId: CONTACT, messageIds: ["callA", "callB"] });
    expect(conversationLabel(byId[both.id])).toBe("Emoji only · shown on calls");
  });

  it("places the emoji it can and makes no claim for the thread when some can't be placed", () => {
    const partly = thread("19:partly@thread.skype", at("10", "18:31:05"), [
      [at("10", "18:33:00"), CONTACT, HEART],
      [at("10", "21:00:00"), CONTACT, LAUGH],
    ]);
    const { chat, byId } = exportWith(partly);

    expect(chat.reactions).toEqual({ callA: [{ emoji: HEART, count: 1 }] });
    expect(byId[partly.id].shownOn).toBeUndefined();
    expect(conversationLabel(byId[partly.id])).toBe("Emoji only");
  });

  it("takes the creation event and the history event for what they are: not emoji", () => {
    // Without any emoji sent during a call there is nothing to place, whatever the events say
    const eventsOnlyDuringCall = thread("19:events@thread.skype", at("10", "18:33:00"), [[at("10", "23:00:00"), CONTACT, HEART]]);
    const { byId } = exportWith(eventsOnlyDuringCall);

    expect(byId[eventsOnlyDuringCall.id].shownOn).toBeUndefined();
  });
});

describe("attaching reactions to displayed messages", () => {
  const shown = (id: string, mergedIds?: string[]): ProcessedMessage => ({
    id,
    displayName: null,
    timestamp: "2024-08-01T00:00:00.000Z",
    content: "x",
    type: "text",
    from: "x",
    isOwner: false,
    originalMessageType: "RichText",
    mergedIds,
  });
  const reactions = { a: [{ emoji: HEART, count: 2 }], hidden: [{ emoji: LAUGH, count: 1 }] };

  it("attaches by message ID, or by an ID a message stands for", () => {
    const [plain, merged, other] = withReactions([shown("a"), shown("b", ["x", "hidden"]), shown("c")], reactions);
    expect(plain.reactions).toEqual(reactions.a);
    expect(merged.reactions).toEqual(reactions.hidden);
    expect(other.reactions).toBeUndefined();
  });

  it("returns a message without reactions as it is", () => {
    const message = shown("untouched");
    expect(withReactions([message], reactions)[0]).toBe(message);
  });
});
