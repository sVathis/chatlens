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
const playing = new WeakSet<HTMLMediaElement>();

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

function loadExport(): ChatExport {
  const chat = viberSource.fromJson(structuredClone(sample) as unknown as ViberExport);
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
function renderBubbles(conversationId: string, isGroup: boolean) {
  const chat = loadExport();
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
