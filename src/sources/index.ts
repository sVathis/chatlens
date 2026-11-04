import type { ChatExport, Reaction, SourceId, SourceMessage } from "../model/chat";
import type { ProcessedMessage } from "../types/messages";
import { readJsonFile } from "../utils/fileParser";
import { withReactions } from "../utils/reactions";
import { sanitizeProcessedMessage } from "../utils/sanitizeHtml";
import { skypeSource } from "./skype";
import type { ProcessOptions, SourceAdapter } from "./types";
import { viberSource } from "./viber";

const SOURCES: Record<SourceId, SourceAdapter> = {
  skype: skypeSource,
  viber: viberSource,
};

// When nothing recognises an upload, this source reports why in its own words
const FALLBACK_SOURCE = skypeSource;

export function getSource(id: SourceId): SourceAdapter {
  return SOURCES[id];
}

/** The first of `sources` that recognises an uploaded folder, if any does. */
export function pickFolderSource(sources: SourceAdapter[], files: File[]): SourceAdapter | undefined {
  return sources.find((source) => source.canLoadFolder(files));
}

/** The first of `sources` that recognises parsed JSON, if any does. */
export function pickJsonSource(sources: SourceAdapter[], parsed: unknown): SourceAdapter | undefined {
  return sources.find((source) => source.canLoadJson(parsed));
}

/** Loads an uploaded folder with the source whose export it is. */
export async function loadExportFolder(
  files: File[],
  onProgress: (progress: number) => void,
): Promise<ChatExport> {
  const source = pickFolderSource(Object.values(SOURCES), files) ?? FALLBACK_SOURCE;
  return source.loadFolder(files, onProgress);
}

/** Loads a single uploaded JSON file with the source whose export it is. */
export async function loadExportJson(
  file: File,
  onProgress: (progress: number) => void,
): Promise<ChatExport> {
  const parsed = await readJsonFile(file, onProgress);
  const source = pickJsonSource(Object.values(SOURCES), parsed) ?? FALLBACK_SOURCE;
  return source.fromJson(parsed);
}

/**
 * Shows a conversation's messages: the one place they leave an adapter on their way to
 * the screen. Whatever HTML an adapter returns is sanitized here, so no renderer has to
 * trust it, and a new adapter can't forget to (see sanitizeHtml.ts for what is kept).
 * The conversation's reactions, if it has any, are attached here too.
 */
export function processForDisplay(
  source: SourceAdapter,
  messages: SourceMessage[],
  options: ProcessOptions,
  reactions?: Record<string, Reaction[]>,
): ProcessedMessage[] {
  const shown = source.process(messages, options).map(sanitizeProcessedMessage);
  return reactions ? withReactions(shown, reactions) : shown;
}
