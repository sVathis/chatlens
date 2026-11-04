import type { ChatExport, SourceId } from "../model/chat";
import { readJsonFile } from "../utils/fileParser";
import { skypeSource } from "./skype";
import type { SourceAdapter } from "./types";

const SOURCES: Record<SourceId, SourceAdapter> = {
  skype: skypeSource,
};

// When nothing recognises an upload, this source reports why in its own words
const FALLBACK_SOURCE = skypeSource;

export function getSource(id: SourceId): SourceAdapter {
  return SOURCES[id];
}

/** Loads an uploaded folder with the source whose export it is. */
export async function loadExportFolder(
  files: File[],
  onProgress: (progress: number) => void,
): Promise<ChatExport> {
  const source =
    Object.values(SOURCES).find((candidate) => candidate.canLoadFolder(files)) ??
    FALLBACK_SOURCE;
  return source.loadFolder(files, onProgress);
}

/** Loads a single uploaded JSON file with the source whose export it is. */
export async function loadExportJson(
  file: File,
  onProgress: (progress: number) => void,
): Promise<ChatExport> {
  const parsed = await readJsonFile(file, onProgress);
  const source =
    Object.values(SOURCES).find((candidate) => candidate.canLoadJson(parsed)) ??
    FALLBACK_SOURCE;
  return source.fromJson(parsed);
}
