import type { MantineColorsTuple } from "@mantine/core";
import type { SourceId } from "../model/chat";
import { useExportData } from "../store/messageStore";

/**
 * How a source's conversations look: the colours and the few layout choices that differ
 * between chat apps. Components read these instead of hard-coding colours, so a source
 * gets its own look without its own copy of every component. Colours are CSS values and
 * may use `light-dark()`, so each look covers the light and the dark scheme.
 */
export interface Look {
  id: "default" | "viber";
  /** Selection, focus and links. */
  accent: string;
  /** The conversation background behind the bubbles. */
  chatBackground: string;
  ownBubble: string;
  ownText: string;
  otherBubble: string;
  otherText: string;
  /** Behind a photo, video or file the owner / someone else sent (a Mantine colour or CSS). */
  mediaOwn: string;
  mediaOther: string;
  /** The bar at the left of a quote. */
  quoteBar: string;
  /** The selected row in the conversation list. */
  selectedRow: string;
  bubbleRadius: number;
  /** Initials avatars beside other people's messages in group chats. */
  groupAvatars: boolean;
  /** Time inside the bubble (clock time only) instead of under it. */
  timeInBubble: boolean;
  /** Dates as a rounded pill instead of a line across the page. */
  datePill: boolean;
  /** Voice messages with a play button and progress bar instead of the browser's player. */
  voicePlayer: boolean;
  /** Replaces the app's blue as Mantine's primary colour, when set. */
  palette?: MantineColorsTuple;
}

export const defaultLook: Look = {
  id: "default",
  accent: "#0078d4",
  chatBackground: "light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-8))",
  ownBubble: "#0078d4",
  ownText: "white",
  otherBubble: "light-dark(var(--mantine-color-gray-2), var(--mantine-color-dark-5))",
  otherText: "light-dark(var(--mantine-color-gray-9), var(--mantine-color-gray-0))",
  mediaOwn: "#0078d4",
  mediaOther: "dark.5",
  quoteBar: "currentColor",
  selectedRow: "light-dark(var(--mantine-color-blue-0), var(--mantine-color-dark-6))",
  bubbleRadius: 8,
  groupAvatars: false,
  timeInBubble: false,
  datePill: false,
  voicePlayer: false,
};

/** Viber's purple, in ten shades for Mantine (index 6 is the brand colour #7360F2). */
const VIBER_PALETTE: MantineColorsTuple = [
  "#f3f1ff",
  "#e4e0ff",
  "#cbc3fb",
  "#b0a5f8",
  "#9788f5",
  "#8474f3",
  "#7360f2",
  "#6451d9",
  "#5745bf",
  "#4a39a6",
];

const viberBubble = "light-dark(#e6e1ff, #5d4fcf)";

export const viberLook: Look = {
  id: "viber",
  accent: "#7360f2",
  chatBackground: "light-dark(#f4f2fc, #1c1b24)",
  ownBubble: viberBubble,
  ownText: "light-dark(#1f1a45, #ffffff)",
  otherBubble: "light-dark(#ffffff, #2e2d3a)",
  otherText: "light-dark(#1f1a45, #f1effb)",
  mediaOwn: viberBubble,
  mediaOther: "light-dark(#ffffff, #2e2d3a)",
  quoteBar: "#7360f2",
  selectedRow: "light-dark(#ece8ff, #2e2d3a)",
  bubbleRadius: 18,
  groupAvatars: true,
  timeInBubble: true,
  datePill: true,
  voicePlayer: true,
  palette: VIBER_PALETTE,
};

const LOOKS: Record<SourceId, Look> = { skype: defaultLook, viber: viberLook };

export function getLook(source: SourceId | undefined): Look {
  return (source && LOOKS[source]) || defaultLook;
}

/** The look of the loaded export's source (Skype's while nothing is loaded). */
export function useLook(): Look {
  return getLook(useExportData()?.source);
}
