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
    // Newest first (see toChatExport). The second message is the neighbour a
    // translation pair looks at.
    const [newest, neighbour] = asSkype(messages);
    return newest ? getMessagePreview(newest, ownerId, neighbour) : "";
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
