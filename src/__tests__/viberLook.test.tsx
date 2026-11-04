import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MessageBubble } from "../components/Message/MessageBubble";
import { processForDisplay } from "../sources";
import { viberSource } from "../sources/viber";
import type { ViberExport } from "../sources/viber/types";
import type { ChatExport } from "../model/chat";
import { defaultLook, getLook, viberLook } from "../look";
import { avatarColor, initials } from "../look/avatar";
import { useMessageStore } from "../store/messageStore";
import { installLayout } from "./fixtures/layout";
import { renderApp, renderInApp, rowOf, unmountApp, waitFor } from "./fixtures/renderApp";
import sample from "./fixtures/viberSample.json";

const initialState = useMessageStore.getState();
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let uninstallLayout: () => void;
const createObjectURL = URL.createObjectURL;
const revokeObjectURL = URL.revokeObjectURL;
const play = HTMLMediaElement.prototype.play;
const pause = HTMLMediaElement.prototype.pause;
const pausedProperty = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "paused")!;
const currentTimeProperty = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "currentTime")!;
const playing = new WeakSet<HTMLMediaElement>();
const positions = new WeakMap<HTMLMediaElement, number>();

beforeAll(() => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = false;
  uninstallLayout = installLayout();
  URL.createObjectURL = (blob: Blob | MediaSource) => `blob:synthetic/${(blob as File).name}`;
  URL.revokeObjectURL = () => {};
  // jsdom doesn't play media: these make the element behave as one that plays
  Object.defineProperty(HTMLMediaElement.prototype, "paused", {
    configurable: true,
    get(this: HTMLMediaElement) {
      return !playing.has(this);
    },
  });
  Object.defineProperty(HTMLMediaElement.prototype, "currentTime", {
    configurable: true,
    get(this: HTMLMediaElement) {
      return positions.get(this) ?? 0;
    },
    set(this: HTMLMediaElement, value: number) {
      positions.set(this, value);
    },
  });
  HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
    playing.add(this);
    this.dispatchEvent(new Event("play"));
    return Promise.resolve();
  };
  HTMLMediaElement.prototype.pause = function (this: HTMLMediaElement) {
    playing.delete(this);
    this.dispatchEvent(new Event("pause"));
  };
});
afterAll(() => {
  uninstallLayout();
  URL.createObjectURL = createObjectURL;
  URL.revokeObjectURL = revokeObjectURL;
  HTMLMediaElement.prototype.play = play;
  HTMLMediaElement.prototype.pause = pause;
  Object.defineProperty(HTMLMediaElement.prototype, "paused", pausedProperty);
  Object.defineProperty(HTMLMediaElement.prototype, "currentTime", currentTimeProperty);
});
beforeEach(() => {
  useMessageStore.setState(initialState, true);
  window.history.replaceState(null, "", "/");
});
afterEach(unmountApp);

const DIRECT = "viber:10";
const GROUP = "viber:20";

const MEDIA_PATHS = [
  "media/Alice Example/2023-11-14_104_photo1.jpg",
  "media/Alice Example/thumb_2023-11-14_105_clip.jpg",
  "media/Alice Example/2023-11-14_106_voice_Alice Example.m4a",
  "media/stickers/00040103.png",
];

function loadExport(change?: (data: ViberExport) => void): ChatExport {
  const data = structuredClone(sample) as unknown as ViberExport;
  change?.(data);
  const chat = viberSource.fromJson(data);
  chat.mediaFiles = new Map(MEDIA_PATHS.map((p) => [p, new File(["x"], p.split("/").pop()!)]));
  return chat;
}

async function openChat(id: string, lastMessageId: string) {
  useMessageStore.getState().setExportData(loadExport());
  renderApp();
  await waitFor(() => useMessageStore.getState().selectedConversationId !== null, "a selection");
  useMessageStore.getState().selectConversation(id);
  await waitFor(() => rowOf(lastMessageId) !== null, "the messages");
  await sleep(50);
}

/** Every message of a chat as bubbles, without the virtualised list (so all are rendered). */
function renderBubbles(
  conversationId: string,
  isGroup: boolean,
  change?: (data: ViberExport) => void,
) {
  const chat = loadExport(change);
  useMessageStore.getState().setExportData(chat);
  const conversation = chat.conversations.find((c) => c.id === conversationId)!;
  const messages = processForDisplay(
    viberSource,
    conversation.messages,
    { ownerId: chat.ownerId, swapped: false, mediaFiles: chat.mediaFiles },
    conversation.reactions,
  );
  renderInApp(
    <div>
      {messages.map((message) => (
        <div key={message.id} data-bubble-for={message.id}>
          <MessageBubble message={message} showSender showTimestamp isGroup={isGroup} />
        </div>
      ))}
    </div>,
  );
}
const bubble = (id: string) => document.querySelector<HTMLElement>(`[data-bubble-for="${id}"]`)!;

describe("which look a source gets", () => {
  it("gives Viber its own look and everything else the default one", () => {
    expect(getLook("viber")).toBe(viberLook);
    expect(getLook("skype")).toBe(defaultLook);
    expect(getLook(undefined)).toBe(defaultLook);
    expect(viberLook.accent).toBe("#7360f2");
    // Skype's blue is untouched
    expect(defaultLook.accent).toBe("#0078d4");
    expect(defaultLook.ownBubble).toBe("#0078d4");
    expect(defaultLook.groupAvatars).toBe(false);
    expect(defaultLook.voicePlayer).toBe(false);
    expect(defaultLook.palette).toBeUndefined();
  });

  it("brings a palette whose main shade is the brand colour", () => {
    expect(viberLook.palette).toHaveLength(10);
    expect(viberLook.palette?.[6]).toBe(viberLook.accent);
  });
});

describe("avatars", () => {
  it("takes the first letters of the first and last word, as whole characters", () => {
    expect(initials("Alice Example")).toBe("AE");
    expect(initials("Alice")).toBe("A");
    expect(initials("  mary  jane  watson ")).toBe("MW");
    expect(initials("\u{0397}\u{03BB}\u{03AF}\u{03B1}\u{03C2} \u{039A}\u{03B1}\u{03BD}")).toBe("\u{0397}\u{039A}");
    // An emoji is one character, not two halves of a surrogate pair
    expect(initials("\u{1F600} Smile")).toBe("\u{1F600}S");
    expect(initials("")).toBe("?");
    expect(initials(null)).toBe("?");
  });

  it("gives a person the same colour every time, from a fixed set", () => {
    expect(avatarColor("viber:2")).toBe(avatarColor("viber:2"));
    const colors = new Set(Array.from({ length: 40 }, (_, i) => avatarColor(`viber:${i}`)));
    expect(colors.size).toBeGreaterThan(3);
    for (const color of colors) expect(color).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe("a Viber group chat", () => {
  it("shows a name over the first message of a run and an avatar beside the last", async () => {
    await openChat(GROUP, "210");

    // 206, 207, 209 and 208 are one run by the same person
    const run = ["206", "207", "209", "208"].map((id) => rowOf(id)!);
    const names = run.map((row) => row.querySelector("[data-sender-name]")?.textContent ?? null);
    expect(names).toEqual(["Bob Example", null, null, null]);
    const avatars = run.map((row) => row.querySelector("[data-avatar]")?.textContent ?? null);
    expect(avatars).toEqual([null, null, null, "BE"]);

    // The owner's own messages have neither
    expect(rowOf("202")!.querySelector("[data-avatar], [data-sender-name]")).toBeNull();
    // Another person gets their own letters and colour
    expect(rowOf("203")!.querySelector("[data-avatar]")?.textContent).toBe("AE");
    const barColor = (id: string) => getComputedStyle(rowOf(id)!.querySelector("[data-avatar]")!).background;
    expect(barColor("203")).not.toBe(barColor("208"));
  });

  it("puts the time inside each bubble, as clock time only", async () => {
    await openChat(GROUP, "210");
    const time = rowOf("207")!.querySelector("[data-bubble-time]")!;
    // 207 was edited: the note comes before the clock time
    expect(time.textContent).toMatch(/^edited · \d\d:\d\d$/);
    expect(rowOf("206")!.querySelector("[data-bubble-time]")?.textContent).toMatch(/^\d\d:\d\d$/);
    // The date is a title on hover and a pill above the day
    expect(time.getAttribute("title")).toMatch(/\d{4}/);
    expect(document.querySelector("[data-date-row]")?.textContent).toMatch(/\d{4}/);
    expect(document.querySelector("[data-message-scroll-container] [role='separator']")).toBeNull();
  });

  it("shows a call as a pill in the middle of the chat", async () => {
    await openChat(GROUP, "210");
    const pill = rowOf("204")!.querySelector("[data-center-pill]");
    expect(pill?.textContent).toContain("Call");
    expect(rowOf("204")!.querySelector("[data-bubble-time]")).toBeNull();
  });

  it("jumps to the quoted message when its quote is clicked, or Enter is pressed", async () => {
    await openChat(GROUP, "210");
    const quote = rowOf("202")!.querySelector<HTMLElement>("[data-quote]")!;
    expect(quote.getAttribute("role")).toBe("button");
    expect(quote.getAttribute("data-quote-id")).toBe("201");

    expect(useMessageStore.getState().navigationTarget?.messageId).not.toBe("201");
    quote.click();
    await waitFor(() => useMessageStore.getState().navigationTarget?.messageId === "201", "the jump");
    expect(useMessageStore.getState().navigationTarget?.conversationId).toBe(GROUP);

    // The keyboard does the same, for the other quote in this chat
    rowOf("210")!
      .querySelector<HTMLElement>("[data-quote]")!
      .dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await waitFor(() => useMessageStore.getState().navigationTarget?.messageId === "203", "the second jump");
  });
});

describe("a Viber direct chat", () => {
  it("has no avatars or sender names, since there is only one other person", async () => {
    renderBubbles(DIRECT, false);
    await waitFor(() => bubble("101") !== null, "the bubbles");
    expect(bubble("101").querySelector("[data-avatar], [data-sender-name]")).toBeNull();
    expect(bubble("101").textContent).not.toContain("Alice Example");
  });

  it("shows a sticker with no bubble behind it, and a photo in a bubble of its own", async () => {
    renderBubbles(DIRECT, false);
    await waitFor(() => bubble("108") !== null, "the bubbles");
    await waitFor(() => bubble("108").querySelector("img") !== null, "the sticker");
    await waitFor(() => bubble("104").querySelector("img") !== null, "the photo");
    const sticker = bubble("108").querySelector("img")!;
    expect(sticker.getAttribute("src")).toContain("00040103.png");
    expect(bubble("108").querySelector("[data-viber-bubble]")).toBeNull();
    // Nothing is painted behind the picture
    expect(sticker.parentElement!.getAttribute("style")).toContain("transparent");
    // The photo (104) is not made transparent
    const photo = bubble("104").querySelector("img")!;
    expect(photo.parentElement!.getAttribute("style")).not.toContain("transparent");
  });

  it("plays a voice message with its own button, and shows the length from the export", async () => {
    renderBubbles(DIRECT, false);
    await waitFor(() => bubble("106") !== null, "the bubbles");
    await waitFor(() => bubble("106").querySelector("[data-voice-player]") !== null, "the player");
    const player = bubble("106").querySelector<HTMLElement>("[data-voice-player]")!;
    // The export says 14 s; it shows until the file reports its own length
    expect(player.textContent).toContain("0:14");

    const button = player.querySelector<HTMLButtonElement>("button")!;
    expect(button.getAttribute("aria-label")).toBe("Play voice message");
    button.click();
    await waitFor(() => button.getAttribute("aria-label") === "Pause voice message", "playing");
    button.click();
    await waitFor(() => button.getAttribute("aria-label") === "Play voice message", "paused");
  });

  it("can be sought with the keyboard: the seek bar is a range input with a value text", async () => {
    renderBubbles(DIRECT, false);
    await waitFor(() => bubble("106") !== null, "the bubbles");
    await waitFor(() => bubble("106").querySelector("[data-voice-player]") !== null, "the player");
    const seek = bubble("106").querySelector<HTMLInputElement>("input[type='range']")!;
    // A native range input is focusable and answers arrow keys, Home and End by itself
    expect(seek.getAttribute("aria-label")).toBe("Seek voice message");
    expect(seek.disabled).toBe(false);
    expect(seek.max).toBe("14");
    expect(seek.getAttribute("aria-valuetext")).toBe("0:00 of 0:14");

    const audio = bubble("106").querySelector("audio")!;
    // What the browser does for an arrow key or a drag: it changes the value and says so
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    setValue.call(seek, "5");
    seek.dispatchEvent(new Event("input", { bubbles: true }));
    await waitFor(() => audio.currentTime === 5, "the seek");
    await waitFor(() => seek.getAttribute("aria-valuetext") === "0:05 of 0:14", "the new value text");
  });

  it("shows a missing voice message as a note, not as a player", async () => {
    renderBubbles(DIRECT, false);
    await waitFor(() => bubble("117") !== null, "the bubbles");
    expect(bubble("117").querySelector("[data-voice-player]")).toBeNull();
    expect(bubble("117").textContent).toContain("not in this export");
  });

  it("shows a file as a card with its name", async () => {
    const chat = loadExport();
    chat.mediaFiles!.set("media/Alice Example/Quarterly report.pdf", new File(["x"], "Quarterly report.pdf"));
    const data = structuredClone(sample) as unknown as ViberExport;
    const file = data.chats[0].messages.find((m) => m.id === 107)!;
    file.media = { ...file.media, path: "media/Alice Example/Quarterly report.pdf", status: "original" };
    const withFile = viberSource.fromJson(data);
    withFile.mediaFiles = chat.mediaFiles;
    useMessageStore.getState().setExportData(withFile);
    renderApp();
    await waitFor(() => useMessageStore.getState().selectedConversationId !== null, "a selection");
    useMessageStore.getState().selectConversation(DIRECT);
    await waitFor(() => rowOf("107") !== null, "the file message");
    await waitFor(() => rowOf("107")!.querySelector("[data-file-card]") !== null, "the file card");
    const card = rowOf("107")!.querySelector<HTMLAnchorElement>("[data-file-card]")!;
    expect(card.textContent).toContain("Quarterly report.pdf");
    expect(card.hasAttribute("download")).toBe(true);
  });
});

describe("context that must survive on every kind of message", () => {
  it("shows that a photo or video was forwarded, and what it replies to", async () => {
    renderBubbles(DIRECT, false, (data) => {
      const chat = data.chats.find((c) => c.id === 10)!;
      const photo = chat.messages.find((m) => m.id === 104)!;
      photo.forwarded = true;
      const clip = chat.messages.find((m) => m.id === 105)!;
      clip.replyTo = { text: "Hello there", messageId: 101 };
    });
    await waitFor(() => bubble("104") !== null, "the bubbles");
    await waitFor(() => bubble("104").querySelector("img") !== null, "the photo");
    await waitFor(() => bubble("105").querySelector("img, video") !== null, "the video");

    // Forwarded: the note is above the picture, and the picture is still there
    const note = bubble("104").querySelector("[data-forwarded]")!;
    expect(note.textContent).toBe("Forwarded");
    const photo = bubble("104").querySelector("img")!;
    expect(note.compareDocumentPosition(photo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(bubble("104").querySelector("[data-quote]")).toBeNull();

    // A reply: the quote is above the video, and points at the message it quotes
    const quote = bubble("105").querySelector<HTMLElement>("[data-quote]")!;
    expect(quote.textContent).toBe("Hello there");
    expect(quote.getAttribute("data-quote-id")).toBe("101");
    expect(quote.getAttribute("role")).toBe("button");
    const video = bubble("105").querySelector("img, video")!;
    expect(quote.compareDocumentPosition(video) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(bubble("105").querySelector("[data-forwarded]")).toBeNull();
  });

  it("shows the reactions to a call and to a system message under their pills", async () => {
    renderBubbles(DIRECT, false, (data) => {
      const chat = data.chats.find((c) => c.id === 10)!;
      chat.messages.find((m) => m.id === 113)!.reactions = { others: { "2": 1 } };
      chat.messages.find((m) => m.id === 115)!.reactions = { others: { "3": 2 } };
    });
    await waitFor(() => bubble("113") !== null, "the bubbles");

    const call = bubble("113");
    expect(call.querySelector("[data-center-pill]")?.textContent).toContain("Call");
    expect(call.querySelector("[data-reactions]")?.getAttribute("aria-label")).toBe(
      "Reactions: \u{2764}\u{FE0F} 1",
    );
    const pill = call.querySelector("[data-center-pill]")!;
    const chips = call.querySelector("[data-reactions]")!;
    expect(pill.compareDocumentPosition(chips) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(bubble("115").querySelector("[data-reactions]")?.getAttribute("aria-label")).toBe(
      "Reactions: \u{1F602} 2",
    );
  });
});

describe("what the look is built from", () => {
  it("marks only stickers as stickers", () => {
    const chat = loadExport();
    const conversation = chat.conversations.find((c) => c.id === DIRECT)!;
    const shown = processForDisplay(viberSource, conversation.messages, {
      ownerId: chat.ownerId,
      swapped: false,
      mediaFiles: chat.mediaFiles,
    });
    const stickers = shown.filter((m) => m.sticker).map((m) => m.id);
    expect(stickers).toEqual(["108"]);
  });

  it("renders a bubble in the Viber look only when the export is Viber's", async () => {
    const chat = loadExport();
    useMessageStore.getState().setExportData(chat);
    const conversation = chat.conversations.find((c) => c.id === DIRECT)!;
    const [message] = processForDisplay(viberSource, conversation.messages, {
      ownerId: chat.ownerId,
      swapped: false,
      mediaFiles: chat.mediaFiles,
    }).filter((m) => m.id === "101");

    renderInApp(<MessageBubble message={message} showSender showTimestamp />);
    await waitFor(() => document.querySelector("[data-viber-bubble]") !== null, "the bubble");
    expect(document.querySelector("[data-viber-bubble]")?.textContent).toContain("Hello there");

    unmountApp();
    // The same message in a Skype export keeps Skype's look
    useMessageStore.getState().setExportData({ ...chat, source: "skype" });
    renderInApp(<MessageBubble message={message} showSender showTimestamp />);
    await waitFor(() => document.body.textContent?.includes("Hello there") === true, "the bubble");
    expect(document.querySelector("[data-viber-bubble]")).toBeNull();
  });
});
