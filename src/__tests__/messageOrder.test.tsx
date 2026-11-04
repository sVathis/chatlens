import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { useMessageStore } from "../store/messageStore";
import { skypeSource } from "../sources/skype";
import type { SkypeExport } from "../sources/skype/types";
import { createSyntheticExport, messageIdFor } from "./fixtures/syntheticExport";
import { MESSAGE_ROW_HEIGHT, VIEWPORT_HEIGHT, installLayout } from "./fixtures/layout";
import { messageContainer, renderApp, rowOf, unmountApp, waitFor } from "./fixtures/renderApp";

// More than the viewer loads at first (INITIAL_MESSAGE_COUNT), so the oldest message
// is only shown if the viewer starts from the wrong end of the list
const COUNT = 600;
const NEWEST = messageIdFor(COUNT - 1);
const OLDEST = messageIdFor(0);

const initialState = useMessageStore.getState();

let uninstallLayout: () => void;

beforeAll(() => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = false;
  uninstallLayout = installLayout();
});
afterAll(() => uninstallLayout());

beforeEach(() => {
  useMessageStore.setState(initialState, true);
  window.history.replaceState(null, "", "/");
});

afterEach(unmountApp);

/** The same export with every message list the other way round. */
const oldestFirst = (data: SkypeExport): SkypeExport => ({
  ...data,
  conversations: data.conversations.map((conversation) => ({
    ...conversation,
    MessageList: [...conversation.MessageList].reverse(),
  })),
});

describe("the message list opens at the newest message", () => {
  it.each([
    ["newest first, as Skype writes it", (data: SkypeExport) => data],
    ["oldest first", oldestFirst],
  ])("when the export lists messages %s", async (_label, arrange) => {
    useMessageStore
      .getState()
      .setExportData(skypeSource.fromJson(arrange(createSyntheticExport(COUNT).exportData)));
    renderApp();

    // The newest message is in view, at the bottom of the list
    await waitFor(() => {
      const row = rowOf(NEWEST);
      return (
        row !== null &&
        parseFloat(row.style.top) + MESSAGE_ROW_HEIGHT <=
          messageContainer().scrollTop + VIEWPORT_HEIGHT + 1
      );
    }, "the newest message at the bottom");

    // Only the newest messages are loaded, not the start of the conversation
    expect(rowOf(OLDEST)).toBeNull();
    const rendered = [...document.querySelectorAll("[data-message-id]")].map((el) =>
      Number(el.getAttribute("data-message-id")),
    );
    expect(Math.min(...rendered)).toBeGreaterThan(Number(messageIdFor(COUNT - 100)));
  });
});
