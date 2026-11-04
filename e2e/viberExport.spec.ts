import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test, type BrowserContext, type Page, type TestInfo } from "@playwright/test";
import { CHATLENS_E2E_BASE_URL } from "../playwright.config";
import type { ViberExport } from "../src/sources/viber/types";
import { linkedMessage, reportHtml, uploadInput } from "./helpers";

// Read from disk: Node needs an import attribute for a JSON import, which Vite (the unit
// tests) does not
const SAMPLE_PATH = join(process.cwd(), "src/__tests__/fixtures/viberSample.json");
const sample = JSON.parse(readFileSync(SAMPLE_PATH, "utf8")) as ViberExport;

// A synthetic Viber export folder: the exporter's sample JSON, with media files for the
// messages that name them. No real conversation content anywhere.

// A real 1x1 PNG, a tiny silent WAV and a small PDF
const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const wav = () => {
  const samples = 800; // 0.1 s of silence at 8 kHz, 8 bit
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + samples, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(8000, 24);
  header.writeUInt32LE(8000, 28);
  header.writeUInt16LE(1, 32);
  header.writeUInt16LE(8, 34);
  header.write("data", 36);
  header.writeUInt32LE(samples, 40);
  return Buffer.concat([header, Buffer.alloc(samples, 128)]);
};
const PDF_BYTES = Buffer.from("%PDF-1.4\n% synthetic attachment, no real content\n%%EOF\n");

const DIRECT = "viber:10";
const GROUP = "viber:20";
const COMMUNITY = "viber:30";

const PHOTO = "media/Alice Example/2023-11-14_104_photo1.png";
const CLIP_THUMB = "media/Alice Example/thumb_2023-11-14_105_clip.png";
const VOICE = "media/Alice Example/2023-11-14_106_voice_Alice Example.wav";
const REPORT = "media/Alice Example/report.pdf";
const STICKER = "media/stickers/00040103.png";

/** Writes the export folder: viber_export.json and the media it names. */
async function writeViberFolder(testInfo: TestInfo): Promise<string> {
  const data = structuredClone(sample);
  const messages = data.chats[0].messages;
  const byId = (id: number) => messages.find((m) => m.id === id)!;
  byId(104).media!.path = PHOTO;
  byId(105).media!.path = CLIP_THUMB;
  byId(106).media!.path = VOICE;
  byId(107).media = { path: REPORT, status: "original", name: "Quarterly report.pdf" };

  const folder = testInfo.outputPath("export");
  await mkdir(join(folder, "media", "Alice Example"), { recursive: true });
  await mkdir(join(folder, "media", "stickers"), { recursive: true });
  await writeFile(join(folder, "viber_export.json"), JSON.stringify(data));
  await writeFile(join(folder, PHOTO), PNG_BYTES);
  await writeFile(join(folder, CLIP_THUMB), PNG_BYTES);
  await writeFile(join(folder, VOICE), wav());
  await writeFile(join(folder, REPORT), PDF_BYTES);
  await writeFile(join(folder, STICKER), PNG_BYTES);
  return folder;
}

const folderInput = (page: Page) => page.locator('input[type="file"][webkitdirectory]');
const entry = (page: Page, conversationId: string) =>
  page.locator(`[data-conversation-id="${conversationId}"]`);
const message = (page: Page, messageId: string) => page.locator(`[data-message-id="${messageId}"]`);

/** Opens a message the way a link in a report does: through the hash of this tab. */
async function open(page: Page, conversationId: string, messageId: string) {
  await page.evaluate(
    ([c, m]) => {
      window.location.hash = `conversationId=${encodeURIComponent(c)}&messageId=${encodeURIComponent(m)}`;
    },
    [conversationId, messageId],
  );
  await expect(linkedMessage(page, messageId)).toBeVisible();
}

/** Requests made to anything but the page's own server (blob: and data: URLs are local). */
function watchForeignRequests(page: Page): string[] {
  const foreign: string[] = [];
  page.on("request", (request) => {
    const url = request.url();
    if (!url.startsWith(CHATLENS_E2E_BASE_URL) && !/^(blob|data|about):/.test(url)) foreign.push(url);
  });
  return foreign;
}

test("opens a Viber export folder and shows its chats and every kind of message", async ({
  page,
}, testInfo) => {
  const foreign = watchForeignRequests(page);
  const folder = await writeViberFolder(testInfo);
  await page.goto(CHATLENS_E2E_BASE_URL);
  await folderInput(page).setInputFiles(folder);

  // The chats, with what they are, named as in the export
  for (const id of [DIRECT, GROUP, COMMUNITY]) await expect(entry(page, id)).toBeVisible();
  await expect(entry(page, DIRECT)).toContainText("Alice Example");
  await expect(entry(page, GROUP)).toContainText("Weekend Plans");
  await expect(entry(page, GROUP)).toContainText("Group · 3 people");
  await expect(entry(page, COMMUNITY)).toContainText("Community");

  await entry(page, DIRECT).click();

  // A quote and a reaction under a bubble, an edited message
  await open(page, DIRECT, "102");
  await expect(message(page, "102").locator("[data-quote]")).toHaveText("Hello there");
  await expect(message(page, "102").locator("[data-reactions]")).toHaveAttribute("aria-label", /\u{1F44D} 1/u);
  await open(page, DIRECT, "103");
  await expect(message(page, "103").locator("[data-edited]")).toBeVisible();

  // A photo and its caption: the image really displays
  await open(page, DIRECT, "104");
  const photo = message(page, "104").locator("img");
  await expect(photo).toBeVisible();
  await expect.poll(() => photo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  await expect(message(page, "104")).toContainText("Look at this");

  // A voice message plays from the export; a file downloads under its own name
  await open(page, DIRECT, "106");
  const audio = message(page, "106").locator("audio[controls]");
  await expect(audio).toHaveAttribute("src", /^blob:/);
  await open(page, DIRECT, "107");
  const file = message(page, "107").locator('a[download="Quarterly report.pdf"]');
  await expect(file).toHaveAttribute("href", /^blob:/);

  // A sticker, a link card, a location, a call
  await open(page, DIRECT, "108");
  await expect(message(page, "108").locator("img")).toBeVisible();
  await open(page, DIRECT, "109");
  const card = message(page, "109").locator("a[data-link-card]");
  await expect(card).toHaveAttribute("href", "https://example.com/a");
  await expect(card).toHaveAttribute("target", "_blank");
  await open(page, DIRECT, "110");
  await expect(message(page, "110").locator("[data-location]")).toContainText("40.71280, -74.00600");
  await open(page, DIRECT, "113");
  await expect(message(page, "113")).toContainText("Call with Alice Example");

  // A group shows who wrote what, with a quote that points at the quoted message's text
  await entry(page, GROUP).click();
  await open(page, GROUP, "201");
  await expect(message(page, "201")).toContainText("Bob Example");
  await open(page, GROUP, "202");
  await expect(message(page, "202").locator("[data-quote]")).toHaveText("Who is in?");

  // The link card was never fetched: nothing left the page
  expect(foreign).toEqual([]);
});

/** Waits until both tabs show the same code, then answers in the user's tab. */
async function answerCopyRequest(reportTab: Page, userTab: Page) {
  const code = (await reportTab.locator("[data-export-copy-code]").textContent())?.trim();
  expect(code).toMatch(/^[2-9A-Z]{3}-[2-9A-Z]{3}$/);
  await expect(userTab.locator("[data-export-approval-code]")).toHaveText(code!);
  await userTab.getByRole("button", { name: "Allow copy" }).click();
  await expect(userTab.locator("[data-export-approval-code]")).toHaveCount(0);
}

async function openReport(context: BrowserContext, testInfo: TestInfo, messageIds: string[]) {
  const reportPath = testInfo.outputPath("report.html");
  await writeFile(
    reportPath,
    reportHtml(
      CHATLENS_E2E_BASE_URL,
      messageIds.map((messageId) => ({ target: { conversationId: DIRECT, messageId } })),
    ),
  );
  const report = await context.newPage();
  await report.goto(pathToFileURL(reportPath).href);
  return report.locator("a.chatlens-link");
}

test("a report link to a Viber message copies the export, media included, once allowed", async ({
  context,
}, testInfo) => {
  const folder = await writeViberFolder(testInfo);
  const userTab = await context.newPage();
  await userTab.goto(CHATLENS_E2E_BASE_URL);
  await folderInput(userTab).setInputFiles(folder);
  await expect(entry(userTab, DIRECT)).toBeVisible();

  // Message IDs are the exporter's event IDs; the conversation ID has the viber: prefix
  const links = await openReport(context, testInfo, ["104", "106"]);
  const [reportTab] = await Promise.all([context.waitForEvent("page"), links.nth(0).click()]);
  await answerCopyRequest(reportTab, userTab);

  // The linked photo is shown in the report's tab, with its image
  await expect(linkedMessage(reportTab, "104")).toBeVisible();
  await expect(uploadInput(reportTab)).toHaveCount(0);
  const photo = linkedMessage(reportTab, "104").locator("img");
  await expect(photo).toBeVisible();
  await expect.poll(() => photo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);

  // The next link reuses that tab, and its voice message plays there too
  await links.nth(1).click();
  await expect(linkedMessage(reportTab, "106")).toBeVisible();
  await expect(linkedMessage(reportTab, "106").locator("audio[controls]")).toHaveAttribute("src", /^blob:/);
  expect(context.pages()).toHaveLength(3);
});
