import { writeFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { CHATLENS_E2E_BASE_URL } from "../playwright.config";
import type { Conversation } from "../src/sources/skype/types";
import { createSyntheticConversation, messageIdFor } from "../src/__tests__/fixtures/syntheticExport";
import { uploadInput } from "./helpers";

// More than the viewer shows at first (50), so the start of the conversation is only on
// screen if the viewer starts from the wrong end of the list
const COUNT = 300;
const NEWEST = messageIdFor(COUNT - 1);
const OLDEST = messageIdFor(0);

// Skype writes messages newest first; an export listed the other way round must open the
// same way, with the newest message at the bottom and older ones above it
const ORDERS: [string, (conversation: Conversation) => Conversation][] = [
  ["newest first", (conversation) => conversation],
  [
    "oldest first",
    (conversation) => ({ ...conversation, MessageList: [...conversation.MessageList].reverse() }),
  ],
];

for (const [label, arrange] of ORDERS) {
  test(`opens at the newest message and loads older ones when scrolling up (export listed ${label})`, async ({
    page,
  }, testInfo) => {
    const exportPath = testInfo.outputPath("conversation.json");
    await writeFile(exportPath, JSON.stringify(arrange(createSyntheticConversation(COUNT).conversation)));

    await page.goto(CHATLENS_E2E_BASE_URL);
    await uploadInput(page).setInputFiles(exportPath);

    // The newest message is the last one on screen, and the start of the conversation
    // has not been loaded
    const messages = page.locator("[data-message-id]");
    await expect(messages.last()).toHaveAttribute("data-message-id", NEWEST);
    await expect(page.locator(`[data-message-id="${NEWEST}"]`)).toBeInViewport();
    await expect(page.locator(`[data-message-id="${OLDEST}"]`)).toHaveCount(0);

    // Scrolling to the top loads older messages, never newer ones
    const oldestShown = () =>
      messages.evaluateAll((elements) =>
        Math.min(...elements.map((element) => Number(element.getAttribute("data-message-id")))),
      );
    const firstLoaded = Number(messageIdFor(COUNT - 50));
    await expect
      .poll(async () => {
        await page.locator("[data-message-scroll-container]").evaluate((element) => {
          element.scrollTop = 0;
        });
        return oldestShown();
      })
      .toBeLessThan(firstLoaded);
    await expect(page.locator(`[data-message-id="${NEWEST}"]`)).toHaveCount(0);
  });
}
