import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { viberSource } from "../sources/viber";
import type { ViberExport } from "../sources/viber/types";
import { useMessageStore } from "../store/messageStore";
import { installLayout } from "./fixtures/layout";
import { renderApp, rowOf, unmountApp, waitFor } from "./fixtures/renderApp";

const initialState = useMessageStore.getState();
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let uninstallLayout: () => void;
const scrollIntoView = Element.prototype.scrollIntoView;
const createObjectURL = URL.createObjectURL;
const revokeObjectURL = URL.revokeObjectURL;

beforeAll(() => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = false;
  uninstallLayout = installLayout();
  URL.createObjectURL = (blob: Blob | MediaSource) => `blob:synthetic/${(blob as File).name}`;
  URL.revokeObjectURL = () => {};
  // jsdom has none; the viewer scrolls the active thumbnail into view
  Element.prototype.scrollIntoView = () => {};
});
afterAll(() => {
  uninstallLayout();
  URL.createObjectURL = createObjectURL;
  URL.revokeObjectURL = revokeObjectURL;
  Element.prototype.scrollIntoView = scrollIntoView;
});
beforeEach(() => {
  useMessageStore.setState(initialState, true);
  window.history.replaceState(null, "", "/");
});
afterEach(() => {
  unmountApp();
  document.body.innerHTML = "";
});

const STICKER = "media/stickers/00040103.png";
const PHOTO = "media/Alice/photo.png";

// A chat in which the same sticker is sent three times, with a photo in between
function stickerChat() {
  const data: ViberExport = {
    format: "viberpc-export",
    version: 1,
    exportedAt: "2025-01-01T00:00:00Z",
    self: { contactIds: [1] },
    contacts: { "1": { name: "Me" }, "2": { name: "Alice" } },
    chats: [
      {
        id: 1,
        title: "Alice",
        type: "direct",
        memberIds: [2],
        messages: [
          { id: 501, timestamp: 1700000000000, authorId: 2, kind: "sticker", sticker: { path: STICKER } },
          { id: 502, timestamp: 1700000060000, authorId: 1, outgoing: true, kind: "image", media: { path: PHOTO, status: "original" } },
          { id: 503, timestamp: 1700000120000, authorId: 2, kind: "sticker", sticker: { path: STICKER } },
          { id: 504, timestamp: 1700000180000, authorId: 2, kind: "sticker", sticker: { path: STICKER } },
        ],
      },
    ],
  };
  const chat = viberSource.fromJson(data);
  chat.mediaFiles = new Map([STICKER, PHOTO].map((p) => [p, new File(["x"], p.split("/").pop()!)]));
  return chat;
}

const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]');
/** The viewer's "n / total" position. */
const position = () => {
  const counter = Array.from(dialog()?.querySelectorAll("p") ?? []).find((p) => /^\d+ \/ \d+$/.test(p.textContent ?? ""));
  return counter?.textContent?.replace(/ /g, "");
};

async function openViewerOn(messageId: string) {
  await waitFor(() => rowOf(messageId)?.querySelector("img") != null, `the image in ${messageId}`);
  rowOf(messageId)!.querySelector<HTMLElement>("img")!.click();
  await waitFor(() => dialog() !== null, "the viewer");
}

// The gallery lists media newest first, like the messages: 504, 503, 502 (the photo), 501.
// A lookup by file would find the newest sticker (504) for any of the three stickers.
describe("the media gallery, when the same file is in several messages", () => {
  it("opens on the oldest use of a file as the last item, not the first", async () => {
    useMessageStore.getState().setExportData(stickerChat());
    renderApp();
    await openViewerOn("501");
    await waitFor(() => position() === "4/4", "the position of the oldest sticker");
    expect(position()).toBe("4/4");
  });

  it("opens on a use of the file in the middle as its own item", async () => {
    useMessageStore.getState().setExportData(stickerChat());
    renderApp();
    await openViewerOn("503");
    await waitFor(() => position() === "2/4", "the position of the middle sticker");
    expect(position()).toBe("2/4");
  });

  it("steps through every occurrence with next and previous, one at a time", async () => {
    useMessageStore.getState().setExportData(stickerChat());
    renderApp();
    await openViewerOn("503");
    await waitFor(() => position() === "2/4", "the second item");

    const press = (key: string) =>
      window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
    press("ArrowRight"); // towards older messages
    await waitFor(() => position() === "3/4", "the photo");
    press("ArrowRight");
    await waitFor(() => position() === "4/4", "the oldest sticker");
    press("ArrowLeft");
    await waitFor(() => position() === "3/4", "back to the photo");
    press("ArrowLeft");
    await waitFor(() => position() === "2/4", "back to the middle sticker");
    press("ArrowLeft");
    await waitFor(() => position() === "1/4", "the newest sticker");
    await sleep(50);
    expect(position()).toBe("1/4");
  });
});
