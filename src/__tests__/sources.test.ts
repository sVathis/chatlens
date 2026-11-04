import { beforeEach, describe, expect, it } from "vitest";
import { getSource, loadExportFolder, loadExportJson } from "../sources";
import { skypeSource } from "../sources/skype";
import { toChatExport } from "../sources/skype/load";
import { processMessages } from "../sources/skype/messageProcessor";
import { useMessageStore } from "../store/messageStore";
import {
  OWNER_ID,
  createSyntheticConversation,
  createSyntheticExport,
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

describe("the newest message of a conversation", () => {
  const older = message("1", "2024-01-01T10:00:00.000Z", "older");
  const newer = message("2", "2024-03-01T10:00:00.000Z", "newer");

  it("is the first one when the list is newest first", () => {
    const [chat] = skypeSource.fromJson(conversation("c", [newer, older])).conversations;
    expect(chat.lastActivity).toBe(newer.originalarrivaltime);
    expect(skypeSource.preview(chat.messages, OWNER_ID)).toBe("newer");
  });

  it("is the last one when the list is oldest first", () => {
    const [chat] = skypeSource.fromJson(conversation("c", [older, newer])).conversations;
    expect(chat.lastActivity).toBe(newer.originalarrivaltime);
    expect(skypeSource.preview(chat.messages, OWNER_ID)).toBe("newer");
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

  it("orders the conversation list by it", () => {
    // X started later than Y but was active earlier: the old code, which looked at the
    // last message of each list (the oldest), put X first
    const x = conversation("x", [
      message("x2", "2024-06-01T10:00:00.000Z", "x newest"),
      message("x1", "2024-05-01T10:00:00.000Z", "x oldest"),
    ]);
    const y = conversation("y", [
      message("y2", "2024-07-01T10:00:00.000Z", "y newest"),
      message("y1", "2023-01-01T10:00:00.000Z", "y oldest"),
    ]);
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
