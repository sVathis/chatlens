import type { SourceMessage } from "../../model/chat";
import type { SourceAdapter } from "../types";
import { fromViberJson, isViberFolder, isViberJson, loadViberFolder } from "./load";
import { viberMedia } from "./media";
import { processViberMessages, viberPreview } from "./process";
import type { ViberMsg } from "./types";

// The conversation lists in a ChatExport from this adapter are Viber's own messages
const asViber = (messages: SourceMessage[]) => messages as ViberMsg[];

export const viberSource: SourceAdapter = {
  id: "viber",

  canLoadFolder: isViberFolder,
  loadFolder: loadViberFolder,
  canLoadJson: isViberJson,
  fromJson: fromViberJson,

  process: (messages, options) => processViberMessages(asViber(messages), options),
  // Newest first, as in every conversation
  preview: (messages) => viberPreview(asViber(messages)[0]),
  typeOf: (message) => (message as ViberMsg).kind,

  // The IDs this adapter makes ("viber:self", "viber:12") aren't names; the export's own
  // titles and names are shown instead
  displayName: (id) => (id && !id.startsWith("viber:") ? id : null),

  media: viberMedia,
};
