import { beforeEach, describe, expect, it } from "vitest";
import {
  getSource,
  loadExportFolder,
  loadExportJson,
  pickFolderSource,
  pickJsonSource,
  processForDisplay,
} from "../sources";
import type { SourceId } from "../model/chat";
import type { SourceAdapter } from "../sources/types";
import { skypeSource } from "../sources/skype";
import { isSkypeJson, normalizeSkypeExport, toChatExport } from "../sources/skype/load";
import type { Message } from "../sources/skype/types";
import { PURIFY_CONFIG } from "../sources/skype/constants";
import { skypeConversationKind, skypeMemberCount } from "../sources/skype/kind";
import { conversationLabel } from "../utils/conversationLabel";
import { processMessages } from "../sources/skype/messageProcessor";
import { useMessageStore } from "../store/messageStore";
import { MESSAGE_HTML_CONFIG, sanitizeMessageHtml, sanitizeProcessedMessage } from "../utils/sanitizeHtml";
import { buildVirtualRows } from "../utils/virtualRows";
import {
  OWNER_ID,
  createSyntheticConversation,
  createSyntheticExport,
  messageIdFor,
} from "./fixtures/syntheticExport";

/** A Skype message with only what these tests look at. */
const message = (id: string, time: string, content: string) => ({
  id,
  displayName: null,
  originalarrivaltime: time,
  messagetype: "RichText",
  version: 1,
  content,
  conversationid: "8:live:.cid.synthetic-chat",
  from: OWNER_ID,
});

/** A Skype conversation whose messages are listed in the order given. */
const conversation = (id: string, messages: ReturnType<typeof message>[]) => ({
  id,
  displayName: `Chat ${id}`,
  MessageList: messages,
});

const store = () => useMessageStore.getState();

/** jsdom's File can't read itself; browsers' can, which the media code relies on. */
const fileWithText = (text: string, name: string) =>
  Object.defineProperty(new File([text], name), "text", { value: async () => text });

describe("the shared model", () => {
  it("wraps a Skype export without copying its messages", () => {
    const { exportData } = createSyntheticExport(50);
    const chat = toChatExport(exportData);

    expect(chat.source).toBe("skype");
    expect(chat.ownerId).toBe(OWNER_ID);
    expect(chat.exportedAt).toBe(exportData.exportDate);
    expect(chat.conversations.map((c) => c.id)).toEqual(exportData.conversations.map((c) => c.id));
    expect(chat.conversations[1].title).toBe(exportData.conversations[1].displayName);
    // The lists are the same arrays, so converting costs nothing on a large export
    expect(chat.conversations[1].messages).toBe(exportData.conversations[1].MessageList);
  });

  it("holds only plain data, so it can be copied between tabs", () => {
    const { chatExport } = createSyntheticExport(50);
    expect(structuredClone(chatExport)).toEqual(chatExport);
  });

  it("looks up its adapter by source", () => {
    expect(getSource("skype")).toBe(skypeSource);
  });
});

describe("the order of a conversation's messages", () => {
  const older = message("1", "2024-01-01T10:00:00.000Z", "older");
  const newer = message("2", "2024-03-01T10:00:00.000Z", "newer");

  it("keeps a list that is newest first as it is, without copying it", () => {
    const list = [newer, older];
    const [chat] = skypeSource.fromJson(conversation("c", list)).conversations;
    expect(chat.messages).toBe(list);
    expect(chat.lastActivity).toBe(newer.originalarrivaltime);
    expect(skypeSource.preview(chat.messages, OWNER_ID)).toBe("newer");
  });

  it("puts a list that is oldest first into newest-first order, leaving the original alone", () => {
    const list = [older, newer];
    const [chat] = skypeSource.fromJson(conversation("c", list)).conversations;
    expect(chat.messages.map((m) => m.id)).toEqual(["2", "1"]);
    expect(list.map((m) => m.id)).toEqual(["1", "2"]);
    expect(chat.lastActivity).toBe(newer.originalarrivaltime);
    expect(skypeSource.preview(chat.messages, OWNER_ID)).toBe("newer");
  });

  it("shows the viewer the same messages whichever way round the export lists them", () => {
    // Includes translation pairs and an album, which look at their neighbours
    const { conversation: synthetic } = createSyntheticConversation(120);
    const [fromNewest] = skypeSource.fromJson(synthetic).conversations;
    const [fromOldest] = skypeSource.fromJson({
      ...synthetic,
      MessageList: [...synthetic.MessageList].reverse(),
    }).conversations;

    expect(fromOldest.messages.map((m) => m.id)).toEqual(fromNewest.messages.map((m) => m.id));
    for (const swapped of [false, true]) {
      const options = { ownerId: OWNER_ID, swapped, limit: 120 };
      expect(skypeSource.process(fromOldest.messages, options)).toEqual(
        skypeSource.process(fromNewest.messages, options),
      );
    }
  });

  it.each([
    ["newest first", (list: Message[]) => list],
    ["oldest first", (list: Message[]) => [...list].reverse()],
  ])("starts at the newest messages and loads older ones when scrolling up (%s)", (_label, arrange) => {
    const { conversation: synthetic } = createSyntheticConversation(300);
    const [chat] = skypeSource.fromJson({
      ...synthetic,
      MessageList: arrange(synthetic.MessageList),
    }).conversations;
    const show = (limit: number) =>
      processForDisplay(skypeSource, chat.messages, { ownerId: OWNER_ID, swapped: false, limit });

    const first = show(50);
    const more = show(100);
    const firstIds = new Set(first.map((m) => m.id));

    // The newest message is the last row on screen
    const newestId = messageIdFor(299);
    const { rowIndexByMessageId } = buildVirtualRows(first);
    expect(Math.max(...rowIndexByMessageId.values())).toBe(rowIndexByMessageId.get(newestId));

    // Loading more adds only older messages
    const oldestShown = Math.min(...first.map((m) => Date.parse(m.timestamp)));
    const added = more.filter((m) => !firstIds.has(m.id));
    expect(added.length).toBeGreaterThan(0);
    expect(Math.max(...added.map((m) => Date.parse(m.timestamp)))).toBeLessThan(oldestShown);
  });

  it("handles a single message and an empty conversation", () => {
    const [single, empty] = skypeSource.fromJson({
      userId: OWNER_ID,
      exportDate: "",
      conversations: [conversation("a", [older]), conversation("b", [])],
    }).conversations;
    expect(single.lastActivity).toBe(older.originalarrivaltime);
    expect(skypeSource.preview(single.messages, OWNER_ID)).toBe("older");
    expect(empty.lastActivity).toBe("");
    expect(skypeSource.preview(empty.messages, OWNER_ID)).toBe("");
  });

  it.each([
    ["newest first", (list: ReturnType<typeof message>[]) => list],
    ["oldest first", (list: ReturnType<typeof message>[]) => [...list].reverse()],
  ])("orders the conversation list by newest activity (messages listed %s)", (_label, arrange) => {
    // X started later than Y but was active earlier: the old code, which looked at the
    // last message of each list (the oldest), put X first
    const x = conversation("x", arrange([
      message("x2", "2024-06-01T10:00:00.000Z", "x newest"),
      message("x1", "2024-05-01T10:00:00.000Z", "x oldest"),
    ]));
    const y = conversation("y", arrange([
      message("y2", "2024-07-01T10:00:00.000Z", "y newest"),
      message("y1", "2023-01-01T10:00:00.000Z", "y oldest"),
    ]));
    store().unloadExport();
    store().setExportData(
      skypeSource.fromJson({ userId: OWNER_ID, exportDate: "", conversations: [x, y] }),
    );

    expect(store().conversations.map((c) => c.id)).toEqual(["y", "x"]);
    expect(store().selectedConversationId).toBe("y");
  });
});

describe("the Skype adapter", () => {
  const { conversation: synthetic } = createSyntheticConversation(300);
  const raw = synthetic.MessageList;

  it("shows messages exactly as the Skype processor does", () => {
    for (const swapped of [false, true]) {
      expect(skypeSource.process(raw, { ownerId: OWNER_ID, swapped, limit: 120 })).toEqual(
        processMessages(raw, OWNER_ID, swapped, undefined, 120),
      );
    }
  });

  it("names the kind of a message, and shows names the way Skype writes them", () => {
    expect(skypeSource.typeOf(raw[0])).toBe((raw[0] as { messagetype: string }).messagetype);
    expect(skypeSource.displayName("8:live:.cid.someone")).toBe("live:.cid.someone");
    expect(skypeSource.displayName(null)).toBeNull();
  });

  it("reads an attachment's file name and kind from the metadata next to it", async () => {
    const files = new Map([
      ["abc.json", fileWithText(JSON.stringify({ filename: "photo.jpg" }), "abc.json")],
      ["abc.1.jpg", new File(["image"], "abc.1.jpg")],
    ]);
    expect(await skypeSource.media.getMetadata("abc", files)).toEqual({ filename: "photo.jpg" });
    expect(await skypeSource.media.getType("abc", files)).toBe("image");
    expect(await skypeSource.media.getMetadata("missing", files)).toBeNull();
    expect(await skypeSource.media.getType("missing", files)).toBeNull();
  });
});

describe("loading an upload", () => {
  const messagesJson = (name: string) =>
    new File([JSON.stringify(createSyntheticExport(20).exportData)], name, {
      type: "application/json",
    });

  /** A file the way a folder upload reports it. */
  const inFolder = (file: File, path: string) =>
    Object.defineProperty(file, "webkitRelativePath", { value: path });

  beforeEach(() => store().unloadExport());

  it("recognises a Skype folder and indexes its media by name and by name without extension", async () => {
    const files = [
      inFolder(messagesJson("messages.json"), "export/messages.json"),
      inFolder(new File(["{}"], "abc.json"), "export/media/abc.json"),
      inFolder(new File(["image"], "abc.1.jpg"), "export/media/abc.1.jpg"),
      inFolder(new File(["text"], "notes.txt"), "export/notes.txt"),
    ];
    expect(skypeSource.canLoadFolder(files)).toBe(true);

    const data = await loadExportFolder(files, () => {});
    expect(data.source).toBe("skype");
    expect(data.conversations).toHaveLength(3);
    expect([...data.mediaFiles!.keys()].sort()).toEqual(["abc.1", "abc.1.jpg", "abc.json"]);
  });

  it("says what is missing when a folder has no messages.json", async () => {
    const files = [inFolder(new File(["image"], "abc.1.jpg"), "export/media/abc.1.jpg")];
    expect(skypeSource.canLoadFolder(files)).toBe(false);
    await expect(loadExportFolder(files, () => {})).rejects.toThrow("messages.json not found");
  });

  it("loads a single JSON file, and explains one that isn't an export", async () => {
    const data = await loadExportJson(messagesJson("messages.json"), () => {});
    expect(data.ownerId).toBe(OWNER_ID);

    const notAnExport = new File(['{"hello": "world"}'], "other.json");
    await expect(loadExportJson(notAnExport, () => {})).rejects.toThrow(/Invalid Skype export/);
  });
});

describe("the HTML boundary", () => {
  const unsafe =
    '<img src=x onerror="alert(1)">hello <script>alert(2)</script>' +
    '<a href="javascript:alert(3)">link</a><strong style="color:red">bold</strong>';
  const nothingUnsafe = /<img|<script|onerror|javascript:|style=/i;
  const shownMessage = (content: string) => ({
    id: "1",
    displayName: null,
    timestamp: "2024-01-01T00:00:00.000Z",
    content,
    type: "text" as const,
    from: "someone",
    isOwner: false,
    originalMessageType: "Test",
  });

  it("keeps formatting and links, and removes everything that can run code", () => {
    const safe =
      '<strong>a</strong> <em>b</em><br><sup>c</sup> <a href="https://example.com/x" target="_blank" rel="noopener noreferrer">d</a>';
    expect(sanitizeMessageHtml(safe)).toBe(safe);

    const cleaned = sanitizeMessageHtml(unsafe);
    expect(cleaned).not.toMatch(nothingUnsafe);
    expect(cleaned).toContain("hello");
    expect(cleaned).toContain("link");
    expect(cleaned).toContain("<strong>bold</strong>");
  });

  it("is the allowlist the Skype processor uses", () => {
    expect(PURIFY_CONFIG).toBe(MESSAGE_HTML_CONFIG);
  });

  it("returns a message that is already safe as it is", () => {
    const safe = shownMessage("<em>fine</em>");
    expect(sanitizeProcessedMessage(safe)).toBe(safe);
    expect(sanitizeProcessedMessage(shownMessage(unsafe)).content).not.toMatch(nothingUnsafe);
  });

  it("sanitizes whatever any adapter returns, before anything renders it", () => {
    // An adapter that forgets to sanitize, as a future one might
    const careless: SourceAdapter = { ...skypeSource, process: () => [shownMessage(unsafe)] };
    const [shown] = processForDisplay(careless, [], { ownerId: OWNER_ID, swapped: false });
    expect(shown.content).not.toMatch(nothingUnsafe);
    expect(shown.content).toContain("hello");
  });

  it("also covers the Skype text that was not sanitized before", () => {
    // A file name goes into the message as it is, and so does a plain Text message
    const risky = [
      {
        ...message(
          "file",
          "2024-01-01T10:00:00.000Z",
          '<URIObject type="File.1"><OriginalName v="<img src=x onerror=alert(1)>.pdf"></OriginalName></URIObject>',
        ),
        messagetype: "RichText/Media_GenericFile",
      },
      {
        ...message("text", "2024-01-01T10:00:01.000Z", "<img src=x onerror=alert(2)>plain"),
        messagetype: "Text",
      },
    ];
    const shown = processForDisplay(skypeSource, risky, { ownerId: OWNER_ID, swapped: false });

    expect(shown).toHaveLength(2);
    for (const { content } of shown) expect(content).not.toMatch(nothingUnsafe);
  });

  it("changes nothing in what Skype shows for ordinary messages", () => {
    const { conversation: synthetic } = createSyntheticConversation(300);
    for (const swapped of [false, true]) {
      const options = { ownerId: OWNER_ID, swapped, limit: 300 };
      expect(processForDisplay(skypeSource, synthetic.MessageList, options)).toEqual(
        skypeSource.process(synthetic.MessageList, options),
      );
    }
  });
});

describe("recognising a Skype export", () => {
  it("accepts the shapes Skype writes", () => {
    const { exportData, conversation: synthetic } = createSyntheticExport(5);
    expect(isSkypeJson(JSON.parse(JSON.stringify(exportData)))).toBe(true);
    expect(isSkypeJson(JSON.parse(JSON.stringify(synthetic)))).toBe(true); // one conversation
    // No conversations yet, but it names its owner
    expect(isSkypeJson({ userId: OWNER_ID, conversations: [] })).toBe(true);
    // Not every conversation needs messages listed
    expect(isSkypeJson({ conversations: [{ id: "a" }, { id: "b", MessageList: [] }] })).toBe(true);
  });

  it("does not claim other JSON that shares generic field names", () => {
    const lookalikes = [
      { conversations: [{ id: "c1", messages: [] }], ownerId: "me" },
      { conversations: [] },
      { conversations: [1, "x", null] },
      { conversations: {} },
      { chats: [{ id: 1, messages: [] }] },
      { id: "c1", messages: [] },
      [],
      null,
      "text",
    ];
    for (const json of lookalikes) {
      expect(isSkypeJson(json), JSON.stringify(json)).toBe(false);
      expect(() => normalizeSkypeExport(json), JSON.stringify(json)).toThrow(/Invalid Skype export/);
    }
  });
});

describe("choosing the source for an upload", () => {
  // A made-up app whose JSON also has a top-level `conversations` array of { id, messages }
  const otherExport = { format: "other-chat", conversations: [{ id: "c1", messages: [] }] };
  const claimsOtherExport = (parsed: unknown) =>
    (parsed as { format?: unknown } | null)?.format === "other-chat";
  const other: SourceAdapter = {
    ...skypeSource,
    id: "other" as SourceId,
    canLoadJson: claimsOtherExport,
    canLoadFolder: (files) => files.some((file) => file.name === "other.json"),
  };

  it.each([
    ["Skype first", [skypeSource, other]],
    ["Skype last", [other, skypeSource]],
  ])("gives each export to its own source whatever the order (%s)", (_label, sources) => {
    const skypeJson = JSON.parse(JSON.stringify(createSyntheticExport(5).exportData));
    expect(pickJsonSource(sources, otherExport)?.id).toBe("other");
    expect(pickJsonSource(sources, skypeJson)?.id).toBe("skype");
    expect(pickJsonSource(sources, { unrelated: true })).toBeUndefined();
  });

  it("picks a folder by what it contains", () => {
    const folder = (name: string) => [
      Object.defineProperty(new File(["{}"], name), "webkitRelativePath", { value: `export/${name}` }),
    ];
    expect(pickFolderSource([skypeSource, other], folder("other.json"))?.id).toBe("other");
    expect(pickFolderSource([skypeSource, other], folder("messages.json"))?.id).toBe("skype");
    expect(pickFolderSource([skypeSource, other], folder("notes.txt"))).toBeUndefined();
  });
});

describe("what a Skype conversation is", () => {
  it("is told by the prefix of its ID", () => {
    expect(skypeConversationKind("19:abc@thread.skype")).toBe("group");
    expect(skypeConversationKind("19:abc@thread.v2")).toBe("group");
    expect(skypeConversationKind("19:abc@thread.tacv2")).toBe("group");
    expect(skypeConversationKind("19:ABC@Thread.Skype")).toBe("group"); // not case sensitive
    // Teams-style chats share the 19: prefix but are with one person
    expect(skypeConversationKind("19:aaaa_bbbb@unq.gbl.spaces")).toBe("direct");
    expect(skypeConversationKind("19:abc@oneToOne.skype")).toBe("direct");
    // A 19: ID with no ending that says which is not guessed
    expect(skypeConversationKind("19:abc")).toBeUndefined();
    expect(skypeConversationKind("19:abc@something.else")).toBeUndefined();
    expect(skypeConversationKind("8:live:.cid.abc")).toBe("direct");
    expect(skypeConversationKind("8:someone")).toBe("direct");
    expect(skypeConversationKind("4:+306900000000")).toBe("direct");
    expect(skypeConversationKind("28:concierge")).toBe("service");
    expect(skypeConversationKind("48:notifications")).toBe("service");
    // Not guessed
    expect(skypeConversationKind("c")).toBeUndefined();
    expect(skypeConversationKind("")).toBeUndefined();
  });

  it("has a member count however Skype wrote it", () => {
    expect(skypeMemberCount({ membercount: 3 })).toBe(3);
    expect(skypeMemberCount({ membercount: "3" as unknown as number })).toBe(3);
    // Only the members are listed
    expect(skypeMemberCount({ members: '["8:a","8:b","8:c","8:d"]' })).toBe(4);
    // The count wins over the list
    expect(skypeMemberCount({ membercount: 2, members: '["8:a","8:b","8:c"]' })).toBe(2);
    for (const properties of [
      null,
      undefined,
      {},
      { membercount: 0 },
      { membercount: -2 },
      { membercount: "many" as unknown as number },
      { membercount: 2.5 },
      { members: "not json" },
      { members: "[]" },
      { members: '{"a": 1}' },
    ]) {
      expect(skypeMemberCount(properties), JSON.stringify(properties)).toBeUndefined();
    }
  });

  it("is carried into the shared model, with a member count for groups only", () => {
    const chat = skypeSource.fromJson({
      userId: OWNER_ID,
      exportDate: "",
      conversations: [
        { ...conversation("19:g@thread.skype", []), threadProperties: { membercount: "3" } },
        { ...conversation("8:live:.cid.p", []), threadProperties: { membercount: "2" } },
        { ...conversation("28:bot", []), threadProperties: null },
        conversation("custom-id", []),
      ],
    });
    const [group, person, bot, custom] = chat.conversations;

    expect(group).toMatchObject({ kind: "group", memberCount: 3 });
    expect(person.kind).toBe("direct");
    expect(person.memberCount).toBeUndefined();
    expect(bot.kind).toBe("service");
    expect(custom.kind).toBeUndefined();
    expect(structuredClone(chat)).toEqual(chat);
  });

  it("is worded for the conversation list", () => {
    const base = { id: "x", title: "t", lastActivity: "", messages: [] };
    expect(conversationLabel({ ...base, kind: "group", memberCount: 3 })).toBe("Group · 3 people");
    expect(conversationLabel({ ...base, kind: "group", memberCount: 1 })).toBe("Group · 1 person");
    expect(conversationLabel({ ...base, kind: "group" })).toBe("Group");
    expect(conversationLabel({ ...base, kind: "service" })).toBe("Service");
    expect(conversationLabel({ ...base, kind: "direct" })).toBeNull();
    expect(conversationLabel(base)).toBeNull();
  });
});

describe("a conversation with no name", () => {
  it("gets an empty title in the shared model, which promises text", () => {
    const [nameless, named] = skypeSource.fromJson({
      userId: OWNER_ID,
      exportDate: "",
      conversations: [
        { ...conversation("8:live:.cid.a", []), displayName: null },
        { ...conversation("8:live:.cid.b", []), displayName: "Someone" },
      ],
    }).conversations;

    expect(nameless.title).toBe("");
    expect(named.title).toBe("Someone");
    // Whatever shows names takes the ID instead of failing on an empty one
    expect(skypeSource.displayName(nameless.title)).toBeNull();
  });
});
