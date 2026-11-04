import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { useMessageStore } from "../store/messageStore";
import { skypeSource } from "../sources/skype";
import { createSyntheticExport, messageIdFor } from "./fixtures/syntheticExport";
import { installLayout } from "./fixtures/layout";
import { renderApp, rowOf, unmountApp, waitFor } from "./fixtures/renderApp";

const COUNT = 120;
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

describe("what a chat export can put on screen", () => {
  it("never includes markup that runs code, from any kind of message", async () => {
    const { exportData } = createSyntheticExport(COUNT);
    const conversation = exportData.conversations.find((c) => c.MessageList.length === COUNT)!;
    // The newest messages, which are the ones shown first: a plain Text message and a file
    // whose name is markup. Both used to reach the page as they were written.
    const [text, file] = conversation.MessageList;
    Object.assign(text, {
      messagetype: "Text",
      content: '<img src=x onerror="window.__chatlensXss = 1">visible text',
    });
    Object.assign(file, {
      messagetype: "RichText/Media_GenericFile",
      content:
        '<URIObject type="File.1"><OriginalName v="<img src=x onerror=alert(1)>.pdf"></OriginalName></URIObject>',
    });
    const ids = [text.id, file.id];

    useMessageStore.getState().setExportData(skypeSource.fromJson(exportData));
    renderApp();
    await waitFor(() => ids.every((id) => rowOf(id) !== null), "both messages");

    // Their text is there, but nothing from them can load or run anything
    expect(document.body.textContent).toContain("visible text");
    for (const id of ids) {
      const row = rowOf(id)!;
      expect(row.querySelector("img, script, iframe, [onerror]"), `message ${id}`).toBeNull();
    }
    expect((window as unknown as Record<string, unknown>).__chatlensXss).toBeUndefined();
    expect(messageIdFor(COUNT - 1)).toBe(text.id);
  });
});
