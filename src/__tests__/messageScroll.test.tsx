import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useMessageScroll, type NavigationScrollLock } from "../hooks/useMessageScroll";
import type { ChatConversation } from "../model/chat";
import { waitFor } from "./fixtures/renderApp";

const VIEWPORT = 600;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** A scroll container whose content height the test controls, like a virtualized list that grows. */
class FakeLayout {
  height = 1000;
  top = 0;
  attach(element: HTMLElement) {
    Object.defineProperty(element, "scrollHeight", { configurable: true, get: () => this.height });
    Object.defineProperty(element, "clientHeight", { configurable: true, get: () => VIEWPORT });
    Object.defineProperty(element, "scrollTop", {
      configurable: true,
      get: () => this.top,
      set: (value: number) => {
        this.top = Math.max(0, Math.min(this.height - VIEWPORT, value));
      },
    });
  }
  get bottom() {
    return this.height - VIEWPORT;
  }
}

const conversation = (id: string): ChatConversation => ({ id, title: id, lastActivity: "", messages: [] });

function Harness({
  layout,
  chat,
  lock,
  onElement,
}: {
  layout: FakeLayout;
  chat: ChatConversation;
  lock: React.MutableRefObject<NavigationScrollLock>;
  onElement: (element: HTMLDivElement) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  useMessageScroll({
    scrollContainerRef: ref as React.RefObject<HTMLDivElement>,
    conversation: chat,
    loadedMessageCount: 0,
    isLoadingMore: false,
    swapped: false,
    setLoadedMessageCount: () => {},
    setIsLoadingMore: () => {},
    navigationLockRef: lock,
  });
  return (
    <div
      ref={(element) => {
        // Before the hook's effects run, so the first frame already sees the fake layout
        if (element) {
          layout.attach(element);
          ref.current = element;
          onElement(element);
        }
      }}
    />
  );
}

let root: Root | null = null;
let host: HTMLElement | null = null;
const unlocked = () => ({ current: { active: false, generation: 0 } });

function mount(layout: FakeLayout, chat = conversation("a"), lock = unlocked()) {
  let element!: HTMLDivElement;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  const render = (next: ChatConversation) =>
    root!.render(<Harness layout={layout} chat={next} lock={lock} onElement={(el) => (element = el)} />);
  render(chat);
  return { render, lock, element: () => element };
}

beforeAll(() => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = false;
});
afterAll(() => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = undefined;
});
afterEach(() => {
  root?.unmount();
  host?.remove();
  root = null;
  host = null;
});

describe("opening a conversation scrolls it to the newest message and keeps it there", () => {
  it("scrolls to the bottom once the list has settled", async () => {
    const layout = new FakeLayout();
    mount(layout);
    await waitFor(() => layout.top === layout.bottom, "the bottom");
    expect(layout.top).toBe(400);
  });

  it("follows the list when it grows after that first scroll, as rows are measured late", async () => {
    const layout = new FakeLayout();
    mount(layout);
    await waitFor(() => layout.top === 400, "the first scroll");

    // The virtualizer measures more rows: the list grows below the view
    layout.height = 1800;
    await waitFor(() => layout.top === layout.bottom, "following the growth");
    layout.height = 2600;
    await waitFor(() => layout.top === layout.bottom, "following the growth again");
    expect(layout.top).toBe(2000);
  });

  it("scrolls to the bottom of a list that is still growing while it waits", async () => {
    const layout = new FakeLayout();
    mount(layout);
    // Grows every frame for a while, so it never looks settled; the fallback scrolls anyway
    const timer = setInterval(() => (layout.height += 50), 8);
    await waitFor(() => layout.top > 0, "the fallback scroll", 5_000);
    clearInterval(timer);
    await waitFor(() => layout.top === layout.bottom, "the bottom");
  });

  it("stops following as soon as the user scrolls", async () => {
    const layout = new FakeLayout();
    const { element } = mount(layout);
    await waitFor(() => layout.top === 400, "the first scroll");

    element().dispatchEvent(new Event("wheel"));
    layout.top = 100; // the user scrolled up
    layout.height = 1800;
    await sleep(250);
    expect(layout.top).toBe(100);
  });

  it.each(["touchstart", "pointerdown", "keydown"])("stops following on %s too", async (type) => {
    const layout = new FakeLayout();
    const { element } = mount(layout);
    await waitFor(() => layout.top === 400, "the first scroll");

    element().dispatchEvent(new Event(type));
    layout.height = 1800;
    await sleep(250);
    expect(layout.top).toBe(400);
  });

  it("leaves the position alone while a deep link has taken over", async () => {
    const layout = new FakeLayout();
    const lock = unlocked();
    lock.current.active = true;
    mount(layout, conversation("a"), lock);
    await sleep(300);
    expect(layout.top).toBe(0);

    // A link that starts after the scroll was scheduled stops it, too
    const layout2 = new FakeLayout();
    const lock2 = unlocked();
    const second = mount(layout2, conversation("b"), lock2);
    await waitFor(() => layout2.top === 400, "the first scroll");
    lock2.current.generation += 1;
    layout2.top = 10; // where the link put the view
    layout2.height = 1800;
    await sleep(250);
    expect(layout2.top).toBe(10);
    expect(second.element()).toBeTruthy();
  });

  it("does not scroll a conversation that was closed, or replaced by another", async () => {
    const layout = new FakeLayout();
    const { render } = mount(layout, conversation("a"));
    await waitFor(() => layout.top === 400, "the first scroll");

    // Another conversation opens in the same list: it is scrolled to its own bottom, once
    render(conversation("b"));
    layout.top = 0;
    layout.height = 1400;
    await waitFor(() => layout.top === layout.bottom, "the second conversation's bottom");
    expect(layout.top).toBe(800);

    root!.unmount();
    root = null;
    layout.top = 0;
    layout.height = 3000;
    await sleep(250);
    expect(layout.top).toBe(0);
  });
});
