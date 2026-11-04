import { IMAGE_EXTS, VIDEO_EXTS } from "../../constants/media";
import type { MediaMetadata } from "../../types/messages";
import type { MediaResolver } from "../types";
import { mediaKey } from "./load";

/** The file for a media key (its path in the export folder), if the folder had it. */
function find(mediaId: string, files: Map<string, File>): File | undefined {
  return files.get(mediaKey(mediaId));
}

export function baseName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

function extensionOf(path: string): string {
  const name = baseName(path);
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
}

export const viberMedia: MediaResolver = {
  // The export has no metadata files; the name is the file's own
  async getMetadata(mediaId, files): Promise<MediaMetadata | null> {
    return find(mediaId, files)
      ? { expiry_date: "", filename: baseName(mediaKey(mediaId)), contents: {} }
      : null;
  },

  async getType(mediaId, files) {
    if (!find(mediaId, files)) return null;
    const extension = extensionOf(mediaId);
    return IMAGE_EXTS.has(extension) ? "image" : VIDEO_EXTS.has(extension) ? "video" : null;
  },

  async createUrl(mediaId, files) {
    const file = find(mediaId, files);
    return file ? URL.createObjectURL(file) : null;
  },

  // Viber's export holds no separate still image for a video
  async createThumbnailUrl() {
    return null;
  },
};

/** Whether the export folder has the file a message's media path names. */
export function hasMedia(path: string | undefined, files: Map<string, File> | undefined): path is string {
  return !!path && !!files && files.has(mediaKey(path));
}
