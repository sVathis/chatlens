import { describe, expect, it, vi } from "vitest";
import {
  getSource,
  loadExportFolder,
  loadExportJson,
  pickFolderSource,
  pickJsonSource,
  processForDisplay,
} from "../sources";
import { skypeSource } from "../sources/skype";
import { viberSource } from "../sources/viber";
import { mediaKey } from "../sources/viber/load";
import { reactionEmoji, viberReactions } from "../sources/viber/reactions";
import { escapeHtml, formatDuration, textToHtml } from "../sources/viber/text";
import type { ViberChat, ViberExport, ViberMsg } from "../sources/viber/types";
import type { ChatConversation, ChatExport } from "../model/chat";
import type { ProcessedMessage } from "../types/messages";
import { conversationLabel } from "../utils/conversationLabel";
import sample from "./fixtures/viberSample.json";

// The exporter's own synthetic sample (ViberPC-Export/tests/fixtures), the shared contract
const exportOf = () => structuredClone(sample) as unknown as ViberExport;
const load = (data: ViberExport = exportOf(), mediaFiles?: Map<string, File>): ChatExport => {
  const chat = viberSource.fromJson(data);
  return mediaFiles ? { ...chat, mediaFiles } : chat;
};
const chatOf = (data: ChatExport, id: string): ChatConversation =>
  data.conversations.find((c) => c.id === id)!;
const DIRECT = "viber:10";
const GROUP = "viber:20";
const COMMUNITY = "viber:30";

const file = (name: string, relativePath: string) =>
  Object.defineProperty(new File(["x"], name), "webkitRelativePath", { value: relativePath });

const idsOf = (conversation: ChatConversation) => conversation.messages.map((m) => m.id);

/** The sample's chat 10 with the files its messages name, as an export folder would hold them. */
const MEDIA_PATHS = [
  "media/Alice Example/2023-11-14_104_photo1.jpg",
  "media/Alice Example/thumb_2023-11-14_105_clip.jpg",
  "media/Alice Example/2023-11-14_106_voice_Alice Example.m4a",
  "media/stickers/00040103.png",
];
const filesFor = (paths: string[]) => new Map(paths.map((p) => [p, new File(["x"], p.split("/").pop()!)]));

function show(
  chat: ChatExport,
  conversationId: string,
  options: { swapped?: boolean; mediaFiles?: Map<string, File>; limit?: number } = {},
): ProcessedMessage[] {
  const conversation = chatOf(chat, conversationId);
  return processForDisplay(
    viberSource,
    conversation.messages,
    {
      ownerId: chat.ownerId,
      swapped: options.swapped ?? false,
      mediaFiles: options.mediaFiles ?? chat.mediaFiles,
      limit: options.limit,
    },
    conversation.reactions,
  );
}
const shown = (messages: ProcessedMessage[], id: string) => messages.find((m) => m.id === id)!;

describe("recognising a Viber export", () => {
  it("is registered, and picks the sample's JSON over Skype", () => {
    expect(getSource("viber")).toBe(viberSource);
    expect(pickJsonSource([skypeSource, viberSource], sample)).toBe(viberSource);
    expect(viberSource.canLoadJson(sample)).toBe(true);
  });

  it("does not take Skype JSON, and Skype does not take Viber's", () => {
    const skype = { userId: "8:live:.cid.x", conversations: [{ id: "8:x", MessageList: [] }] };
    expect(viberSource.canLoadJson(skype)).toBe(false);
    expect(skypeSource.canLoadJson(sample)).toBe(false);
    expect(pickJsonSource([skypeSource, viberSource], skype)).toBe(skypeSource);
  });

  it("needs the format name and a list of chats", () => {
    expect(viberSource.canLoadJson({ ...sample, format: "something-else" })).toBe(false);
    expect(viberSource.canLoadJson({ ...sample, chats: {} })).toBe(false);
    expect(viberSource.canLoadJson(null)).toBe(false);
    expect(viberSource.canLoadJson([sample])).toBe(false);
  });

  it("recognises the folder by its viber_export.json, wherever it is in the upload", () => {
    const json = file("viber_export.json", "export/viber_export.json");
    expect(viberSource.canLoadFolder([json])).toBe(true);
    expect(viberSource.canLoadFolder([file("a.jpg", "export/media/a.jpg"), json])).toBe(true);
    expect(viberSource.canLoadFolder([file("messages.json", "export/messages.json")])).toBe(false);
    // A name that only ends the same way is not the file
    expect(viberSource.canLoadFolder([file("my_viber_export.json", "export/my_viber_export.json")])).toBe(false);
    expect(
      pickFolderSource([skypeSource, viberSource], [file("messages.json", "e/messages.json")]),
    ).toBe(skypeSource);
    expect(pickFolderSource([skypeSource, viberSource], [json])).toBe(viberSource);
  });

  it("says so, in its own words, about a version it does not know", () => {
    expect(() => viberSource.fromJson({ ...sample, version: 2 })).toThrow(/version 2.*reads version 1/s);
    expect(() => viberSource.fromJson({ ...sample, version: 0 })).toThrow(/Unsupported Viber export version/);
    expect(() => viberSource.fromJson({ format: "viberpc-export" })).toThrow(/Invalid Viber export/);
  });
});

describe("the Viber export in the shared model", () => {
  it("has the owner, the export time and one conversation per chat", () => {
    const chat = load();
    expect(chat.source).toBe("viber");
    expect(chat.ownerId).toBe("viber:self");
    expect(chat.exportedAt).toBe("2025-01-01T00:00:00Z");
    expect(chat.conversations.map((c) => c.id)).toEqual([DIRECT, GROUP, COMMUNITY]);
  });

  it("names and classifies the chats, with a group's size and the community", () => {
    const chat = load();
    expect(chatOf(chat, DIRECT)).toMatchObject({ title: "Alice Example (+10000000002)", kind: "direct" });
    expect(chatOf(chat, DIRECT).memberCount).toBeUndefined();
    // Two other people and the owner
    expect(chatOf(chat, GROUP)).toMatchObject({ title: "Weekend Plans", kind: "group", memberCount: 3 });
    expect(chatOf(chat, COMMUNITY)).toMatchObject({ title: "Synthetic Community", kind: "community" });
    expect(conversationLabel(chatOf(chat, GROUP))).toBe("Group · 3 people");
    expect(conversationLabel(chatOf(chat, COMMUNITY))).toBe("Community");
    expect(conversationLabel(chatOf(chat, DIRECT))).toBeNull();
  });

  it("names a chat without a title for the other person, or by its number", () => {
    const data = exportOf();
    delete data.chats[0].title;
    delete data.chats[1].title;
    data.chats[1].memberIds = [2, 3];
    const chat = load(data);
    expect(chatOf(chat, DIRECT).title).toBe("Alice Example");
    expect(chatOf(chat, GROUP).title).toBe("Chat 20");
  });

  it("keeps newest first, and the exporter's order for messages in the same millisecond", () => {
    const chat = load();
    // The exporter lists 209 before 208, both at the same time: 208 is the newer one
    expect(idsOf(chatOf(chat, GROUP))).toEqual(["210", "208", "209", "207", "206", "204", "203", "202", "201"]);
    expect(idsOf(chatOf(chat, DIRECT))[0]).toBe("117");
    expect(idsOf(chatOf(chat, DIRECT)).slice(-1)).toEqual(["101"]);
  });

  it("puts messages in time order when the file lists them otherwise", () => {
    const data = exportOf();
    data.chats[0].messages.reverse();
    expect(idsOf(chatOf(load(data), DIRECT))).toEqual(idsOf(chatOf(load(), DIRECT)));
  });

  it("dates a conversation by its newest message, in ISO time", () => {
    expect(chatOf(load(), DIRECT).lastActivity).toBe(new Date(1700000960000).toISOString());
    const empty = exportOf();
    empty.chats[2].messages = [];
    expect(chatOf(load(empty), COMMUNITY).lastActivity).toBe("");
  });

  it("makes IDs text, and only points a quote at a message that is in the chat", () => {
    const chat = load();
    const messages = chatOf(chat, GROUP).messages as ViberMsg[];
    const byId = (id: string) => messages.find((m) => m.id === id)!;
    expect(byId("202").replyTo).toEqual({ text: "Who is in?", messageId: "201" });
    expect(byId("203").replyTo).toEqual({ text: "Earlier message not exported", messageId: undefined });

    const data = exportOf();
    data.chats[1].messages[1].replyTo = { text: "from elsewhere", messageId: 999 };
    const stray = (chatOf(load(data), GROUP).messages as ViberMsg[]).find((m) => m.id === "202")!;
    expect(stray.replyTo?.messageId).toBeUndefined();
  });

  it("tells the owner's messages from others', also by the owner's contact IDs", () => {
    const messages = chatOf(load(), DIRECT).messages as ViberMsg[];
    const byId = (id: string) => messages.find((m) => m.id === id)!;
    expect(byId("102")).toMatchObject({ from: "viber:self", outgoing: true, authorName: null });
    expect(byId("101")).toMatchObject({ from: "viber:2", outgoing: false, authorName: "Alice Example" });

    // outgoing missing, but the author is one of the owner's contacts
    const data = exportOf();
    delete data.chats[0].messages[1].outgoing;
    const noFlag = (chatOf(load(data), DIRECT).messages as ViberMsg[]).find((m) => m.id === "102")!;
    expect(noFlag.from).toBe("viber:self");
  });

  it("shows a call from the other party, with no direction claimed", () => {
    const call = (chatOf(load(), DIRECT).messages as ViberMsg[]).find((m) => m.id === "113")!;
    expect(call).toMatchObject({ kind: "call", from: "viber:2", outgoing: false, peerName: "Alice Example" });
  });

  it("is plain data, so it can be copied between tabs", () => {
    expect(() => structuredClone(load())).not.toThrow();
  });
});

describe("Viber's reactions", () => {
  it("combines counts on messages, the owner's own, and reaction records", () => {
    const chat = load();
    const reactions = chatOf(chat, DIRECT).reactions!;
    expect(reactions["102"]).toEqual([{ emoji: "\u{1F44D}", count: 1 }]); // counts
    expect(reactions["103"]).toEqual([{ emoji: "\u{1F602}", count: 1 }]); // the owner's own (an emoji)
    expect(reactions["104"]).toEqual([{ emoji: "\u{2764}\u{FE0F}", count: 1 }]); // a record from Alice
    expect(reactions["101"]).toBeUndefined(); // the owner took theirs back
    expect(Object.keys(reactions).sort()).toEqual(["102", "103", "104"]);
  });

  it("counts a community's likes together with the owner's own", () => {
    expect(chatOf(load(), COMMUNITY).reactions).toEqual({ "301": [{ emoji: "\u{1F44D}", count: 13 }] });
  });

  it("has none for a chat without any", () => {
    expect(chatOf(load(), GROUP).reactions).toBeUndefined();
  });

  const chatWith = (patch: Partial<ViberChat>): ViberChat => ({
    id: 1,
    messages: [
      { id: 1, timestamp: 1, authorId: 2, kind: "text", text: "a" },
      { id: 2, timestamp: 2, authorId: 2, kind: "text", text: "b" },
    ],
    ...patch,
  });
  const SELF = new Set(["1"]);

  it("does not count a person's reaction twice when the message also has counts", () => {
    const chat = chatWith({
      messages: [
        { id: 1, timestamp: 1, authorId: 2, kind: "text", reactions: { others: { "1": 2 } } },
      ],
      reactionEvents: [{ id: 5, timestamp: 3, authorId: 2, targetId: 1, reaction: "1" }],
    });
    expect(viberReactions(chat, SELF)).toEqual({ "1": [{ emoji: "\u{1F44D}", count: 2 }] });
  });

  it("follows each person's latest record, and a record taken back", () => {
    const chat = chatWith({
      reactionEvents: [
        { id: 5, timestamp: 3, authorId: 2, targetId: 1, reaction: "1" },
        { id: 6, timestamp: 4, authorId: 2, targetId: 1, reaction: "3" }, // changed their mind
        { id: 7, timestamp: 5, authorId: 3, targetId: 1, reaction: "3" },
        { id: 8, timestamp: 6, authorId: 3, targetId: 1, removed: true },
        { id: 9, timestamp: 7, authorId: 2, targetId: 2, reaction: "1" },
        { id: 10, timestamp: 8, authorId: 2, targetId: 2, removed: true },
      ],
    });
    expect(viberReactions(chat, SELF)).toEqual({ "1": [{ emoji: "\u{1F602}", count: 1 }] });
  });

  it("orders records by time, whatever order the file lists them", () => {
    const chat = chatWith({
      reactionEvents: [
        { id: 6, timestamp: 9, authorId: 2, targetId: 1, removed: true },
        { id: 5, timestamp: 3, authorId: 2, targetId: 1, reaction: "1" },
      ],
    });
    expect(viberReactions(chat, SELF)).toBeUndefined();
  });

  it("lets the owner's later record replace their own reaction on the message", () => {
    const chat = chatWith({
      messages: [{ id: 1, timestamp: 1, authorId: 2, kind: "text", reactions: { self: "\u{1F44D}" } }],
      reactionEvents: [{ id: 5, timestamp: 3, authorId: 1, outgoing: true, targetId: 1, reaction: "2" }],
    });
    expect(viberReactions(chat, SELF)).toEqual({ "1": [{ emoji: "\u{2764}\u{FE0F}", count: 1 }] });
  });

  it("ignores records for messages that are not in the chat, or that say nothing", () => {
    const chat = chatWith({
      reactionEvents: [
        { id: 5, timestamp: 3, authorId: 2, targetId: 99, reaction: "1" },
        { id: 6, timestamp: 4, authorId: 2 },
        { id: 7, timestamp: 5, authorId: 2, targetId: 1 },
      ],
    });
    expect(viberReactions(chat, SELF)).toBeUndefined();
  });

  it("shows a reaction ID it does not know as its number", () => {
    expect(reactionEmoji("2")).toBe("\u{2764}\u{FE0F}");
    expect(reactionEmoji("42")).toBe("#42");
  });

  it("sorts the most used first", () => {
    const chat = chatWith({
      messages: [
        { id: 1, timestamp: 1, authorId: 2, kind: "text", reactions: { others: { "1": 1, "3": 4 } } },
      ],
    });
    expect(viberReactions(chat, SELF)!["1"].map((r) => r.emoji)).toEqual(["\u{1F602}", "\u{1F44D}"]);
  });
});

describe("showing Viber messages", () => {
  const chat = load(undefined, filesFor(MEDIA_PATHS));
  const direct = show(chat, DIRECT);

  it("shows messages newest first, as the viewer expects, and only as many as asked", () => {
    expect(direct[0].id).toBe("117");
    expect(show(chat, DIRECT, { limit: 3 }).map((m) => m.id)).toEqual(["117", "115", "113"]);
  });

  it("shows text as it is, with its line breaks, as HTML", () => {
    expect(shown(direct, "101").content).toBe("Hello there<br>second line");
    expect(shown(direct, "101")).toMatchObject({
      type: "text",
      displayName: "Alice Example",
      isOwner: false,
      from: "viber:2",
      originalMessageType: "text",
      timestamp: new Date(1700000000000).toISOString(),
    });
    expect(shown(direct, "102")).toMatchObject({ isOwner: true, displayName: null });
  });

  it("keeps leading spaces and drops only trailing blank lines", () => {
    const group = show(chat, GROUP);
    expect(shown(group, "206").content).toBe("  padded text  <br>line two");
  });

  it("shows a reply as a quote, pointing at the message when it is in the chat", () => {
    expect(shown(direct, "102").quote).toEqual({ text: "Hello there", messageId: "101" });
    const group = show(chat, GROUP);
    expect(shown(group, "203").quote).toEqual({ text: "Earlier message not exported" });
    expect(shown(group, "202").quote?.messageId).toBe("201");
  });

  it("marks edited and forwarded messages", () => {
    expect(shown(direct, "103").edited).toBe(true);
    expect(shown(direct, "112")).toMatchObject({ forwarded: true, content: "Forwarded text" });
    expect(shown(direct, "101").edited).toBeUndefined();
    expect(shown(direct, "101").forwarded).toBeUndefined();
  });

  it("attaches the chat's reactions to the messages they are for", () => {
    expect(shown(direct, "102").reactions).toEqual([{ emoji: "\u{1F44D}", count: 1 }]);
    expect(shown(direct, "104").reactions).toEqual([{ emoji: "\u{2764}\u{FE0F}", count: 1 }]);
    expect(shown(direct, "101").reactions).toBeUndefined();
    expect(shown(show(chat, COMMUNITY), "301").reactions).toEqual([{ emoji: "\u{1F44D}", count: 13 }]);
  });

  it("shows a photo from the folder as media, with its caption", () => {
    const photo = shown(direct, "104");
    expect(photo).toMatchObject({ type: "media", mediaUrl: "media/Alice Example/2023-11-14_104_photo1.jpg" });
    expect(photo.caption).toBe("Look at this");
  });

  it("shows a video that only has its thumbnail as that image", () => {
    expect(shown(direct, "105")).toMatchObject({
      type: "media",
      isOwner: true,
      mediaUrl: "media/Alice Example/thumb_2023-11-14_105_clip.jpg",
    });
  });

  it("says when a photo or video is not in the export, instead of showing a broken one", () => {
    const without = show(load(), DIRECT); // no media files at all
    expect(shown(without, "104")).toMatchObject({ type: "text", caption: "Look at this" });
    expect(shown(without, "104").mediaUrl).toBeUndefined();
    expect(shown(without, "104").content).toContain("not in this export");

    const missing = exportOf();
    missing.chats[0].messages[3].media = { status: "missing", name: "photo1.jpg" };
    expect(shown(show(load(missing, filesFor(MEDIA_PATHS)), DIRECT), "104").content).toBe(
      "<em>\u{1F4F7} Photo photo1.jpg — not in this export</em>",
    );
  });

  it("gives a voice message its file and length, or says it is missing", () => {
    expect(shown(direct, "106")).toMatchObject({
      content: "\u{1F3A4} Voice message 0:14",
      attachment: { kind: "audio", key: "media/Alice Example/2023-11-14_106_voice_Alice Example.m4a", durationMs: 14000 },
    });
    const missing = shown(direct, "117");
    expect(missing.attachment).toEqual({ kind: "audio", durationMs: 9000 });
    expect(missing.content).toBe("<em>\u{1F3A4} Voice message (0:09) — not in this export</em>");
  });

  it("gives a file its name, whether or not it is in the export", () => {
    const missing = shown(direct, "107");
    expect(missing.attachment).toEqual({ kind: "file", name: "Quarterly report.pdf" });
    expect(missing.content).toContain("Quarterly report.pdf");
    expect(missing.content).toContain("not in this export");

    const data = exportOf();
    data.chats[0].messages[6].media = {
      path: "media/Alice Example/report.pdf",
      status: "original",
      name: "Quarterly report.pdf",
    };
    const files = filesFor(["media/Alice Example/report.pdf"]);
    expect(shown(show(load(data, files), DIRECT), "107").attachment).toEqual({
      kind: "file",
      key: "media/Alice Example/report.pdf",
      name: "Quarterly report.pdf",
    });
  });

  it("shows a sticker as an image when its file is there, else says so", () => {
    expect(shown(direct, "108")).toMatchObject({ type: "media", mediaUrl: "media/stickers/00040103.png" });
    expect(shown(show(load(), DIRECT), "108")).toMatchObject({ type: "text", content: "<em>Sticker</em>" });
  });

  it("shows a link with its title, and the text as a link too", () => {
    const link = shown(direct, "109");
    expect(link.link).toEqual({ url: "https://example.com/a", title: "Example Domain" });
    expect(link.content).toBe(
      '<a href="https://example.com/a" target="_blank" rel="noopener noreferrer">https://example.com/a</a>',
    );
  });

  it("shows a location's address and coordinates, and a contact card", () => {
    expect(shown(direct, "110")).toMatchObject({
      content: "1 Example Street",
      location: { lat: 40.7128, lon: -74.006 },
    });
    expect(shown(direct, "111")).toMatchObject({
      content: "\u{1F464} Contact Dan Example",
      contactCard: { name: "Dan Example", number: "+10000000005" },
    });
  });

  it("shows a call and a system message in the middle of the conversation", () => {
    expect(shown(direct, "113")).toMatchObject({
      type: "call",
      content: "Call with Alice Example",
      isOwner: false,
    });
    expect(shown(direct, "115")).toMatchObject({ type: "system", content: "[system message]" });
    expect(shown(show(chat, GROUP), "204").content).toBe("Call with Bob Example");
  });

  it("shows a community post as text, and a kind it does not know by its text", () => {
    expect(shown(show(chat, COMMUNITY), "301")).toMatchObject({ type: "text", content: "Promo text" });

    const data = exportOf();
    data.chats[2].messages[1].kind = "poll";
    const later = show(load(data), COMMUNITY);
    expect(shown(later, "302").content).toBe("cross-chat quote");
    delete data.chats[2].messages[1].text;
    expect(shown(show(load(data), COMMUNITY), "302").content).toBe("<em>Unsupported message (poll)</em>");
  });

  it("views the chat from the other side when swapped", () => {
    const swapped = show(chat, DIRECT, { swapped: true });
    expect(shown(swapped, "101").isOwner).toBe(true);
    expect(shown(swapped, "102").isOwner).toBe(false);
  });

  it("gives the same shown message for every message of the sample", () => {
    for (const id of [DIRECT, GROUP, COMMUNITY]) {
      const messages = show(chat, id);
      expect(messages).toHaveLength(chatOf(chat, id).messages.length);
      for (const m of messages) {
        expect(typeof m.content).toBe("string");
        expect(m.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      }
    }
  });
});

describe("what Viber messages can not do to the page", () => {
  it("shows markup in a message as text", () => {
    const data = exportOf();
    data.chats[0].messages[0].text = '<img src=x onerror="window.__viberXss = 1"><script>1</script> & more';
    data.chats[0].messages[3].caption = "<b onclick=1>caption</b>";
    const messages = show(load(data), DIRECT);
    expect(shown(messages, "101").content).toBe(
      '&lt;img src=x onerror=&quot;window.__viberXss = 1&quot;&gt;&lt;script&gt;1&lt;/script&gt; &amp; more',
    );
    expect(shown(messages, "104").caption).toBe("&lt;b onclick=1&gt;caption&lt;/b&gt;");
  });

  it("escapes names, file names and contact cards", () => {
    const data = exportOf();
    data.contacts!["2"].name = "<i>Alice</i>";
    data.chats[0].messages[6].media = { status: "missing", name: "<img src=x>.pdf" };
    data.chats[0].messages[10].contact = { name: "<u>Dan</u>" };
    const messages = show(load(data), DIRECT);
    expect(shown(messages, "113").content).toBe("Call with &lt;i&gt;Alice&lt;/i&gt;");
    expect(shown(messages, "107").content).toContain("&lt;img src=x&gt;.pdf");
    expect(shown(messages, "111").content).toBe("\u{1F464} Contact &lt;u&gt;Dan&lt;/u&gt;");
    for (const m of messages) expect(m.content).not.toMatch(/<(img|script|i|u)\b/);
  });

  it("links only web addresses, in the text and in the link card", () => {
    const data = exportOf();
    data.chats[0].messages[0].text = "javascript:alert(1) and data:text/html,x and https://ok.example/a?b=1&c=2.";
    data.chats[0].messages[8].link = { url: "javascript:alert(1)", title: "bad" };
    const messages = show(load(data), DIRECT);
    expect(shown(messages, "101").content).toBe(
      'javascript:alert(1) and data:text/html,x and <a href="https://ok.example/a?b=1&amp;c=2" target="_blank" rel="noopener noreferrer">https://ok.example/a?b=1&amp;c=2</a>.',
    );
    expect(shown(messages, "109").link).toBeUndefined();
  });

  it("does not link a bare scheme, and leaves sentence punctuation out of an address", () => {
    expect(textToHtml("see https://")).toBe("see https://");
    expect(textToHtml("(https://a.example/x), then")).toBe(
      '(<a href="https://a.example/x" target="_blank" rel="noopener noreferrer">https://a.example/x</a>), then',
    );
  });
});

describe("the previews in the conversation list", () => {
  const chat = load();
  const previewOf = (id: string, mutate?: (m: ViberMsg[]) => ViberMsg[]) => {
    const conversation = chatOf(chat, id);
    return viberSource.preview(mutate ? mutate([...(conversation.messages as ViberMsg[])]) : conversation.messages, chat.ownerId);
  };
  const newestOf = (id: string, kind: string) =>
    (chatOf(chat, id).messages as ViberMsg[]).filter((m) => m.kind === kind);
  const previewFor = (id: string, kind: string) => viberSource.preview(newestOf(id, kind), chat.ownerId);

  it("is the newest message's text, on one line and cut", () => {
    expect(previewOf(GROUP)).toBe("ok");
    expect(previewOf(COMMUNITY)).toBe("cross-chat quote");
    const long = (chatOf(chat, GROUP).messages as ViberMsg[]).map((m, i) =>
      i === 0 ? { ...m, text: `first\nsecond ${"x".repeat(200)}` } : m,
    );
    const preview = viberSource.preview(long, chat.ownerId);
    expect(preview.startsWith("first second xxx")).toBe(true);
    expect(preview).toHaveLength(100);
  });

  it("says what a message without text is", () => {
    expect(previewFor(DIRECT, "image")).toBe("\u{1F4F7} Photo Look at this");
    expect(previewFor(DIRECT, "video")).toBe("\u{1F3A5} Video");
    expect(previewFor(DIRECT, "voice")).toBe("\u{1F3A4} Voice message");
    expect(previewFor(DIRECT, "file")).toBe("\u{1F4CE} File Quarterly report.pdf");
    expect(previewFor(DIRECT, "sticker")).toBe("Sticker");
    expect(previewFor(DIRECT, "location")).toBe("\u{1F4CD} Location");
    expect(previewFor(DIRECT, "contact")).toBe("\u{1F464} Contact Dan Example");
    expect(previewFor(DIRECT, "call")).toBe("\u{1F4DE} Call Alice Example");
    expect(previewFor(DIRECT, "link")).toBe("https://example.com/a");
  });

  it("is empty for a chat without messages", () => {
    expect(viberSource.preview([], chat.ownerId)).toBe("");
  });

  it("names the kind of a message", () => {
    expect(viberSource.typeOf(newestOf(DIRECT, "voice")[0])).toBe("voice");
  });

  it("does not show its own IDs as names", () => {
    expect(viberSource.displayName("viber:self")).toBeNull();
    expect(viberSource.displayName("viber:12")).toBeNull();
    expect(viberSource.displayName(null)).toBeNull();
    expect(viberSource.displayName("Alice Example")).toBe("Alice Example");
  });
});

describe("Viber's media files", () => {
  const files = filesFor(MEDIA_PATHS);
  const { media } = viberSource;

  it("finds a file by the path the export gives", async () => {
    const path = "media/Alice Example/2023-11-14_104_photo1.jpg";
    expect(await media.getType(path, files)).toBe("image");
    expect(await media.getMetadata(path, files)).toMatchObject({ filename: "2023-11-14_104_photo1.jpg" });

    const created = vi.fn(() => "blob:synthetic");
    const original = URL.createObjectURL;
    URL.createObjectURL = created;
    try {
      expect(await media.createUrl(path, files)).toBe("blob:synthetic");
      expect(created).toHaveBeenCalledWith(files.get(path));
    } finally {
      URL.createObjectURL = original;
    }
  });

  it("tells videos from images, and knows nothing of files that are not there", async () => {
    const withVideo = filesFor(["media/a/clip.MP4", "media/a/song.m4a"]);
    expect(await media.getType("media/a/clip.MP4", withVideo)).toBe("video");
    expect(await media.getType("media/a/song.m4a", withVideo)).toBeNull();
    expect(await media.getType("media/a/none.jpg", withVideo)).toBeNull();
    expect(await media.getMetadata("media/a/none.jpg", withVideo)).toBeNull();
    expect(await media.createUrl("media/a/none.jpg", withVideo)).toBeNull();
    expect(await media.createThumbnailUrl("media/a/clip.MP4", withVideo)).toBeNull();
  });

  it("finds a file whichever way the system spelled its name (composed or decomposed)", async () => {
    const composed = "media/Caf\u{00E9}/photo.jpg"; // e with acute accent, one character
    const decomposed = "media/Cafe\u{0301}/photo.jpg"; // e followed by a combining accent
    expect(composed).not.toBe(decomposed);
    expect(mediaKey(decomposed)).toBe(composed);
    // The folder listing holds the decomposed name; the JSON the composed one
    const listed = new Map([[mediaKey(decomposed), new File(["x"], "photo.jpg")]]);
    expect(await media.getType(composed, listed)).toBe("image");
    expect(await media.getType(decomposed, listed)).toBe("image");
  });
});

describe("loading a Viber export folder", () => {
  const jsonFile = (relativePath: string, content: unknown = sample) =>
    Object.defineProperty(
      Object.defineProperty(new File([JSON.stringify(content)], "viber_export.json"), "webkitRelativePath", {
        value: relativePath,
      }),
      "text",
      { value: async () => JSON.stringify(content) },
    );

  it("reads viber_export.json and keys the media by its path from the JSON's folder", async () => {
    const photo = file("2023-11-14_104_photo1.jpg", "export/media/Alice Example/2023-11-14_104_photo1.jpg");
    const stray = file("notes.txt", "export/notes.txt");
    const progress: number[] = [];
    const chat = await viberSource.loadFolder([stray, jsonFile("export/viber_export.json"), photo], (p) =>
      progress.push(p),
    );

    expect(chat.source).toBe("viber");
    expect(chat.conversations).toHaveLength(3);
    expect([...chat.mediaFiles!.keys()]).toEqual(["media/Alice Example/2023-11-14_104_photo1.jpg"]);
    expect(chat.mediaFiles!.get("media/Alice Example/2023-11-14_104_photo1.jpg")).toBe(photo);
    expect(progress[progress.length - 1]).toBe(100);
  });

  it("finds the media when a parent folder of the export was picked", async () => {
    const photo = file("a.jpg", "parent/export/media/Alice Example/a.jpg");
    const other = file("b.jpg", "parent/elsewhere/media/b.jpg");
    const chat = await viberSource.loadFolder([jsonFile("parent/export/viber_export.json"), photo, other], () => {});
    expect([...chat.mediaFiles!.keys()]).toEqual(["media/Alice Example/a.jpg"]);
  });

  it("is what the registry uses for a Viber folder, and for a single JSON file", async () => {
    const folder = await loadExportFolder([jsonFile("export/viber_export.json")], () => {});
    expect(folder.source).toBe("viber");
    const single = await loadExportJson(jsonFile("viber_export.json"), () => {});
    expect(single.source).toBe("viber");
    expect(single.mediaFiles).toBeUndefined();
  });

  it("rejects a viber_export.json that is not one", async () => {
    await expect(
      viberSource.loadFolder([jsonFile("export/viber_export.json", { hello: "world" })], () => {}),
    ).rejects.toThrow(/Invalid Viber export/);
  });
});

describe("small text helpers", () => {
  it("escapes the characters that matter in HTML", () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
  });

  it("formats durations", () => {
    expect(formatDuration(14000)).toBe("0:14");
    expect(formatDuration(22431)).toBe("0:22");
    expect(formatDuration(3_725_000)).toBe("1:02:05");
    expect(formatDuration(undefined)).toBe("");
    expect(formatDuration(-1)).toBe("");
    expect(formatDuration(Number.NaN)).toBe("");
  });
});
