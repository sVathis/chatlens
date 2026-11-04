import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MantineProvider } from "@mantine/core";
import { MainContent } from "../../components/Layout/MainContent";

/**
 * Renders the whole viewer into the page, for tests that look at what ends up on screen.
 * Needs installLayout() (fixtures/layout.ts), since jsdom has no layout of its own.
 */
let root: Root | null = null;
let host: HTMLElement | null = null;

/** Renders any part of the viewer inside the theme provider. */
export function renderInApp(element: ReactNode) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  root.render(<MantineProvider>{element}</MantineProvider>);
}

export function renderApp() {
  renderInApp(<MainContent />);
}

export function unmountApp() {
  root?.unmount();
  host?.remove();
  root = null;
  host = null;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function waitFor(check: () => boolean, label: string, timeout = 20_000) {
  const start = performance.now();
  while (!check()) {
    if (performance.now() - start > timeout) throw new Error(`Timed out waiting for ${label}`);
    await sleep(10);
  }
}

export const messageContainer = () =>
  document.querySelector<HTMLElement>("[data-message-scroll-container]")!;

/** The list row that shows a message, if it is rendered. */
export const rowOf = (messageId: string) =>
  document
    .querySelector(`[data-message-id="${messageId}"]`)
    ?.closest<HTMLElement>("[data-index]") ?? null;
