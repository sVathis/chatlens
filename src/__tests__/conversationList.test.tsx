import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ConversationList } from "../components/Conversation/ConversationList";
import { skypeSource } from "../sources/skype";
import { useMessageStore } from "../store/messageStore";
import { createSyntheticConversation, OWNER_ID } from "./fixtures/syntheticExport";
import { installLayout } from "./fixtures/layout";
import { renderInApp, unmountApp, waitFor } from "./fixtures/renderApp";

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

const GROUP = "19:synthetic-group@thread.skype";
const GROUP_NO_COUNT = "19:synthetic-other-group@thread.skype";
const PERSON = "8:live:.cid.synthetic-person";
const BOT = "28:synthetic-bot";
const LONG_NAME = "A very long group name that the sidebar has to cut to a single line";

/** A conversation with the given ID, name and thread properties. */
function conversation(id: string, displayName: string, threadProperties: object | null = null) {
  const { conversation: raw } = createSyntheticConversation(5, id);
  return { ...raw, displayName, threadProperties };
}

const entry = (id: string) => document.querySelector<HTMLElement>(`[data-conversation-id="${id}"]`);
const labelOf = (id: string) =>
  entry(id)?.querySelector("[data-conversation-label]")?.textContent ?? null;

describe("the conversation list", () => {
  it("says what each conversation is, and gives the full name on hover", async () => {
    useMessageStore.getState().setExportData(
      skypeSource.fromJson({
        userId: OWNER_ID,
        exportDate: "",
        conversations: [
          conversation(GROUP, LONG_NAME, { membercount: "3" }), // Skype writes it as text
          conversation(GROUP_NO_COUNT, "Another group"),
          conversation(PERSON, "A person"),
          conversation(BOT, "A bot"),
        ],
      }),
    );
    renderInApp(<ConversationList searchQuery="" />);
    await waitFor(() => entry(GROUP) !== null && entry(BOT) !== null, "the conversations");

    expect(labelOf(GROUP)).toBe("Group · 3 people");
    expect(labelOf(GROUP_NO_COUNT)).toBe("Group");
    expect(labelOf(BOT)).toBe("Service");
    // A chat with one person needs no note
    expect(labelOf(PERSON)).toBeNull();

    // The name is cut to one line on screen; the full text is the hover text
    expect(entry(GROUP)!.querySelector("[title]")?.getAttribute("title")).toBe(LONG_NAME);
    expect(entry(PERSON)!.querySelector("[title]")?.getAttribute("title")).toBe("A person");
  });
});
