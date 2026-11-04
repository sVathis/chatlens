import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ConversationList } from "../components/Conversation/ConversationList";
import { MessageBubble } from "../components/Message/MessageBubble";
import { processForDisplay } from "../sources";
import { viberSource } from "../sources/viber";
import type { ViberExport } from "../sources/viber/types";
import type { ChatExport } from "../model/chat";
import { useMessageStore } from "../store/messageStore";
import { installLayout } from "./fixtures/layout";
import { renderApp, renderInApp, rowOf, unmountApp, waitFor } from "./fixtures/renderApp";
import sample from "./fixtures/viberSample.json";

const initialState = useMessageStore.getState();
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let uninstallLayout: () => void;
const createObjectURL = URL.createObjectURL;
const revokeObjectURL = URL.revokeObjectURL;

beforeAll(() => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = false;
  uninstallLayout = installLayout();
  // jsdom has no object URLs; each file gets one named after it
  URL.createObjectURL = (blob: Blob | MediaSource) => `blob:synthetic/${(blob as File).name}`;
  URL.revokeObjectURL = () => {};
});
afterAll(() => {
  uninstallLayout();
  URL.createObjectURL = createObjectURL;
  URL.revokeObjectURL = revokeObjectURL;
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

function loadExport(withMedia = true): ChatExport {
  const chat = viberSource.fromJson(structuredClone(sample) as unknown as ViberExport);
  if (withMedia) {
    chat.mediaFiles = new Map(MEDIA_PATHS.map((p) => [p, new File(["x"], p.split("/").pop()!)]));
  }
  return chat;
}

const bubble = (id: string) => document.querySelector<HTMLElement>(`[data-bubble-for="${id}"]`)!;

/** Renders every message of a chat as the viewer does (each in a wrapper to find it by). */
function renderChat(chat: ChatExport, conversationId: string) {
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
          <MessageBubble message={message} showSender showTimestamp />
        </div>
      ))}
    </div>,
  );
}

describe("Viber messages on screen", () => {
  it("shows a quote, with the reactions under the bubble and the time after them", async () => {
    renderChat(loadExport(), DIRECT);
    await waitFor(() => bubble("102") !== null, "the bubbles");

    const reply = bubble("102");
    expect(reply.querySelector("[data-quote]")?.textContent).toBe("Hello there");
    expect(reply.querySelector("[data-quote]")?.getAttribute("data-quote-id")).toBe("101");
    expect(reply.textContent).toContain("Hi Alice!");

    const chips = reply.querySelector("[data-reactions]")!;
    expect(chips.getAttribute("aria-label")).toBe("Reactions: \u{1F44D} 1");
    // Under the bubble, before the time, on the owner's side
    const order = Array.from(reply.querySelectorAll("[data-quote], [data-reactions]"));
    expect(order).toEqual([reply.querySelector("[data-quote]"), chips]);
    expect(bubble("101").querySelector("[data-reactions]")).toBeNull();
  });

  it("shows reactions under every kind of bubble that has them, not only under calls", async () => {
    renderChat(loadExport(), DIRECT);
    await waitFor(() => bubble("104") !== null, "the bubbles");
    await waitFor(() => bubble("104").querySelector("img") !== null, "the photo");

    for (const [id, label] of [
      ["102", "\u{1F44D} 1"],
      ["103", "\u{1F602} 1"],
      ["104", "\u{2764}\u{FE0F} 1"], // under a photo
    ] as const) {
      expect(bubble(id).querySelector("[data-reactions]")?.getAttribute("aria-label"), id).toBe(
        `Reactions: ${label}`,
      );
    }
  });

  it("marks an edited message and a forwarded one", async () => {
    renderChat(loadExport(), DIRECT);
    await waitFor(() => bubble("103") !== null, "the bubbles");
    expect(bubble("103").querySelector("[data-edited]")?.textContent).toContain("edited");
    expect(bubble("101").querySelector("[data-edited]")).toBeNull();
    expect(bubble("112").querySelector("[data-forwarded]")?.textContent).toBe("Forwarded");
    expect(bubble("112").textContent).toContain("Forwarded text");
  });

  it("shows a photo with its caption, a video by its thumbnail and a sticker", async () => {
    renderChat(loadExport(), DIRECT);
    await waitFor(() => bubble("108") !== null, "the bubbles");
    await waitFor(
      () => ["104", "105", "108"].every((id) => bubble(id).querySelector("img") !== null),
      "the images",
    );
    expect(bubble("104").querySelector("img")?.getAttribute("src")).toBe("blob:synthetic/2023-11-14_104_photo1.jpg");
    expect(bubble("104").textContent).toContain("Look at this");
    expect(bubble("105").querySelector("img")?.getAttribute("src")).toContain("thumb_2023-11-14_105_clip.jpg");
    expect(bubble("108").querySelector("img")?.getAttribute("src")).toContain("00040103.png");
  });

  it("plays a voice message from the export, and says when one is missing", async () => {
    renderChat(loadExport(), DIRECT);
    await waitFor(() => bubble("106") !== null, "the bubbles");
    await waitFor(() => bubble("106").querySelector("audio") !== null, "the audio player");
    const audio = bubble("106").querySelector("audio")!;
    // Viber's look has its own play button; the audio element is only the sound
    expect(audio.hasAttribute("controls")).toBe(false);
    expect(bubble("106").querySelector("[data-voice-player] button")).not.toBeNull();
    expect(audio.getAttribute("src")).toContain("voice_Alice Example.m4a");

    expect(bubble("117").querySelector("audio")).toBeNull();
    expect(bubble("117").textContent).toContain("not in this export");
    expect(bubble("107").textContent).toContain("Quarterly report.pdf");
    expect(bubble("107").textContent).toContain("not in this export");
  });

  it("says a photo is missing, instead of a broken image, when the folder had no media", async () => {
    renderChat(loadExport(false), DIRECT);
    await waitFor(() => bubble("104") !== null, "the bubbles");
    expect(bubble("104").querySelector("img, audio, video")).toBeNull();
    expect(bubble("104").textContent).toContain("not in this export");
    expect(bubble("104").textContent).toContain("Look at this"); // the caption is still there
  });

  it("shows a link card, a location, a contact, a call and a system message", async () => {
    renderChat(loadExport(), DIRECT);
    await waitFor(() => bubble("113") !== null, "the bubbles");

    const card = bubble("109").querySelector<HTMLAnchorElement>("a[data-link-card]")!;
    expect(card.getAttribute("href")).toBe("https://example.com/a");
    expect(card.getAttribute("target")).toBe("_blank");
    expect(card.getAttribute("rel")).toBe("noopener noreferrer");
    expect(card.textContent).toContain("Example Domain");
    expect(card.textContent).toContain("example.com");

    // The coordinates are text; there is no map link that would send them anywhere
    expect(bubble("110").querySelector("[data-location]")?.textContent).toContain("40.71280, -74.00600");
    expect(bubble("110").textContent).toContain("1 Example Street");
    expect(bubble("110").querySelector("a")).toBeNull();

    expect(bubble("111").textContent).toContain("Dan Example");
    expect(bubble("111").querySelector("[data-contact-number]")?.textContent).toBe("+10000000005");

    expect(bubble("113").textContent).toContain("Call with Alice Example");
    expect(bubble("115").textContent).toContain("[system message]");
  });

  it("does not let message text run anything", async () => {
    const data = structuredClone(sample) as unknown as ViberExport;
    data.chats[0].messages[0].text = '<img src=x onerror="window.__viberXss = 1">visible <script>1</script>';
    data.chats[0].messages[0].replyTo = { text: "<b>quoted</b>" };
    data.chats[0].messages[3].caption = '<iframe src="x"></iframe>caption';
    data.chats[0].messages[8].link = { url: "javascript:window.__viberXss=1", title: "<img src=x onerror=1>" };
    const chat = viberSource.fromJson(data);
    renderChat(chat, DIRECT);
    await waitFor(() => bubble("101") !== null, "the bubbles");

    expect(bubble("101").textContent).toContain("<img src=x");
    expect(bubble("101").textContent).toContain("visible");
    expect(bubble("101").querySelector("img, script, iframe, [onerror]")).toBeNull();
    // The reply on 101 is text: its markup is shown as typed, not applied
    expect(bubble("101").querySelector("[data-quote]")?.textContent).toBe("<b>quoted</b>");
    expect(bubble("101").querySelector("[data-quote] b")).toBeNull();
    expect(bubble("104").querySelector("iframe, script")).toBeNull();
    // A link that is not a web address is not shown as a link at all
    expect(bubble("109").querySelector("a[data-link-card]")).toBeNull();
    expect(document.querySelector("a[href^='javascript']")).toBeNull();
    expect((window as unknown as Record<string, unknown>).__viberXss).toBeUndefined();
  });
});

describe("a Viber export in the viewer", () => {
  it("lists the chats with what they are, and opens the newest one", async () => {
    useMessageStore.getState().setExportData(loadExport());
    renderInApp(<ConversationList searchQuery="" />);
    await waitFor(
      () => document.querySelector('[data-conversation-id="viber:20"]') !== null,
      "the conversation list",
    );

    const entry = (id: string) => document.querySelector<HTMLElement>(`[data-conversation-id="${id}"]`)!;
    expect(entry("viber:10").textContent).toContain("Alice Example");
    expect(entry("viber:10").textContent).toContain("\u{1F3A4}"); // newest message is a voice message
    expect(entry("viber:20").textContent).toContain("Weekend Plans");
    expect(entry("viber:20").textContent).toContain("Group · 3 people");
    expect(entry("viber:30").textContent).toContain("Community");
    // Newest activity first
    expect(useMessageStore.getState().selectedConversationId).toBe("viber:30");
  });

  it("opens a group, with each person's name over their messages and quotes inside", async () => {
    useMessageStore.getState().setExportData(loadExport());
    renderApp();
    await waitFor(() => useMessageStore.getState().selectedConversationId !== null, "a selection");
    useMessageStore.getState().selectConversation(GROUP);
    await waitFor(() => rowOf("210") !== null && rowOf("201") !== null, "the group's messages");
    await sleep(50);

    expect(rowOf("201")!.textContent).toContain("Bob Example");
    expect(rowOf("201")!.textContent).toContain("Who is in?");
    expect(rowOf("202")!.querySelector("[data-quote]")?.textContent).toBe("Who is in?");
    expect(rowOf("203")!.textContent).toContain("Alice Example");
    expect(rowOf("203")!.querySelector("[data-edited]")).not.toBeNull();
    // The owner's messages carry no name
    expect(rowOf("202")!.textContent).not.toContain("Me Synthetic");
    // Same-millisecond messages show in the exporter's order: first, then second
    const top = (id: string) => parseFloat(rowOf(id)!.style.top);
    expect(top("209")).toBeLessThan(top("208")); // 209 is above 208: read top to bottom, first then second
  });
});
