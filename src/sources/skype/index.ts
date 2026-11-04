import type { SourceMessage } from "../../model/chat";
import type { SourceAdapter } from "../types";
import { cleanDisplayName } from "./displayName";
import { isSkypeFolder, isSkypeJson, loadSkypeFolder, normalizeSkypeExport, toChatExport } from "./load";
import {
  createMediaUrl,
  createVideoThumbnailUrl,
  getMediaMetadata,
  getMediaType,
} from "./mediaUtils";
import { getMessagePreview, processMessages } from "./messageProcessor";
import { newestMessageIndex } from "./newest";
import type { Message } from "./types";

// The conversation lists in a ChatExport from this adapter are Skype's own messages
const asSkype = (messages: SourceMessage[]) => messages as Message[];

export const skypeSource: SourceAdapter = {
  id: "skype",

  canLoadFolder: isSkypeFolder,
  loadFolder: loadSkypeFolder,
  canLoadJson: isSkypeJson,
  fromJson: (parsed) => toChatExport(normalizeSkypeExport(parsed)),

  process: (messages, { ownerId, swapped, mediaFiles, limit }) =>
    processMessages(asSkype(messages), ownerId, swapped, mediaFiles, limit),

  preview: (messages, ownerId) => {
    const list = asSkype(messages);
    const index = newestMessageIndex(list);
    if (index === -1) return "";
    // The message next to the newest one, which a translation pair looks at
    const neighbour = index === 0 ? list[1] : list[index - 1];
    return getMessagePreview(list[index], ownerId, neighbour);
  },

  typeOf: (message) => (message as Message).messagetype,
  displayName: cleanDisplayName,

  media: {
    getMetadata: getMediaMetadata,
    getType: getMediaType,
    createUrl: createMediaUrl,
    createThumbnailUrl: createVideoThumbnailUrl,
  },
};
