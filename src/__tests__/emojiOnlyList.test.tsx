import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ConversationList } from "../components/Conversation/ConversationList";
import { skypeSource } from "../sources/skype";
import { useMessageStore } from "../store/messageStore";
import { CONTACT, HEART, LAUGH, OWNER, at, call, chat, load, message, thread } from "./fixtures/callThreads";
import { installLayout } from "./fixtures/layout";
import { messageContainer, renderApp, renderInApp, rowOf, unmountApp, waitFor } from "./fixtures/renderApp";

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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// A chat with a call, and three threads of emoji sent during calls: two that belong to
// the call, one that could not be matched
const CALL = call("the-call", at("10", "18:36:00"), 300);
const MATCHED_A = "19:match-a@thread.skype";
const MATCHED_B = "19:match-b@thread.skype";
const UNMATCHED = "19:unmatched@thread.skype";

function exportWithCallThreads() {
  const direct = chat(CONTACT, [CALL, message("RichText", at("10", "18:00:00"), "hello", OWNER)]);
  return load([
    direct,
    { ...thread(MATCHED_A, at("10", "18:31:05"), [[at("10", "18:32:00"), CONTACT, HEART]]), displayName: "emoji thread A" },
    { ...thread(MATCHED_B, at("10", "18:33:00"), [[at("10", "18:34:00"), OWNER, LAUGH]]), displayName: "emoji thread B" },
    { ...thread(UNMATCHED, at("20", "09:00:00"), [[at("20", "09:00:10"), CONTACT, HEART]]), displayName: "emoji thread C" },
  ]);
}

const entry = (id: string) => document.querySelector<HTMLElement>(`[data-conversation-id="${id}"]`);
const row = () => document.querySelector<HTMLElement>("[data-emoji-only-row]");

describe("the conversation list keeps emoji-only threads together", () => {
  it("shows one collapsed row, and opens it on a click", async () => {
    useMessageStore.getState().setExportData(exportWithCallThreads());
    renderInApp(<ConversationList searchQuery="" />);
    await waitFor(() => entry(CONTACT) !== null, "the conversations");

    // The newest conversation overall is an emoji-only thread, but the one opened first
    // is the real chat, so the row starts closed
    expect(useMessageStore.getState().conversations[0].id).toBe(UNMATCHED);
    expect(useMessageStore.getState().selectedConversationId).toBe(CONTACT);

    // The real conversation is listed; the emoji-only threads are behind one row
    expect(row()?.textContent).toContain("Emoji-only threads · 3");
    expect(row()?.textContent).toContain("2 of them shown as reactions on calls");
    expect(row()?.getAttribute("aria-expanded")).toBe("false");
    for (const id of [MATCHED_A, MATCHED_B, UNMATCHED]) expect(entry(id), id).toBeNull();

    row()!.click();
    await waitFor(() => entry(MATCHED_A) !== null, "the threads to open");
    expect(row()?.getAttribute("aria-expanded")).toBe("true");
    for (const id of [MATCHED_A, MATCHED_B, UNMATCHED]) expect(entry(id), id).not.toBeNull();
    // Each says what it is, and whether its emoji are shown elsewhere
    const label = (id: string) => entry(id)?.querySelector("[data-conversation-label]")?.textContent;
    expect(label(MATCHED_A)).toBe("Emoji only · shown on a call");
    expect(label(UNMATCHED)).toBe("Emoji only");

    row()!.click();
    await waitFor(() => entry(MATCHED_A) === null, "the threads to close");
    expect(entry(CONTACT)).not.toBeNull();
  });

  it("opens by itself while searching, so a match is never hidden", async () => {
    useMessageStore.getState().setExportData(exportWithCallThreads());
    renderInApp(<ConversationList searchQuery="emoji thread b" />);
    await waitFor(() => row() !== null, "the row");

    expect(entry(MATCHED_B)).not.toBeNull();
    expect(entry(MATCHED_A)).toBeNull(); // not a match
  });

  it("opens by itself when the selected conversation is inside it", async () => {
    useMessageStore.getState().setExportData(exportWithCallThreads());
    useMessageStore.getState().selectConversation(UNMATCHED);
    renderInApp(<ConversationList searchQuery="" />);
    await waitFor(() => row() !== null, "the row");

    expect(entry(UNMATCHED)).not.toBeNull();
  });

  it("shows no row when there are no emoji-only threads", async () => {
    useMessageStore.getState().setExportData(load([chat(CONTACT, [message("RichText", at("10", "18:00:00"), "hello")])]));
    renderInApp(<ConversationList searchQuery="" />);
    await waitFor(() => entry(CONTACT) !== null, "the conversation");
    await sleep(50);

    expect(row()).toBeNull();
  });
});

describe("the call in the chat shows the reactions", () => {
  it("shows the emoji under the call line, counted", async () => {
    // Two hearts and a laugh were sent during the call
    useMessageStore.getState().setExportData(
      load([
        chat(CONTACT, [CALL, message("RichText", at("10", "18:00:00"), "hello", OWNER)]),
        thread(MATCHED_A, at("10", "18:31:05"), [
          [at("10", "18:32:00"), CONTACT, HEART],
          [at("10", "18:33:00"), OWNER, HEART],
          [at("10", "18:34:00"), CONTACT, LAUGH],
        ]),
      ]),
    );
    useMessageStore.getState().selectConversation(CONTACT);
    renderApp();
    await waitFor(() => rowOf("the-call") !== null, "the call line");

    const chips = rowOf("the-call")!.querySelector("[data-reactions]");
    expect(chips).not.toBeNull();
    expect(chips!.getAttribute("aria-label")).toBe(`Reactions: ${HEART} 2, ${LAUGH} 1`);
    expect(chips!.textContent).toContain(HEART);
    expect(chips!.textContent).toContain("2");
    expect(chips!.textContent).toContain(LAUGH);
    // Only the call has any
    expect(messageContainer().querySelectorAll("[data-reactions]")).toHaveLength(1);
  });

  it("shows nothing extra on a call without reactions", async () => {
    useMessageStore.getState().setExportData(
      load([chat(CONTACT, [CALL, message("RichText", at("10", "18:00:00"), "hello", OWNER)])]),
    );
    useMessageStore.getState().selectConversation(CONTACT);
    renderApp();
    await waitFor(() => rowOf("the-call") !== null, "the call line");

    expect(messageContainer().querySelector("[data-reactions]")).toBeNull();
    expect(skypeSource.id).toBe("skype");
  });
});
