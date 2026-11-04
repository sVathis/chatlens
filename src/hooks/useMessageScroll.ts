import { useRef, useEffect, useCallback, startTransition } from "react";
import type { ChatConversation } from "../model/chat";
import {
  SCROLL_THRESHOLD,
  LOAD_MORE_INCREMENT,
  REQUIRED_STABLE_FRAMES,
  MAX_SCROLL_FRAMES,
  PIN_STABLE_FRAMES,
  MAX_PIN_FRAMES,
} from "../constants/messages";

/**
 * Shared with deep-link navigation. While `active`, navigation owns the scroll position;
 * `generation` changes with every navigation so earlier scroll work can detect it.
 */
export interface NavigationScrollLock {
  active: boolean;
  generation: number;
}

interface UseMessageScrollProps {
  scrollContainerRef: React.RefObject<HTMLDivElement>;
  conversation: ChatConversation | null;
  loadedMessageCount: number;
  isLoadingMore: boolean;
  swapped: boolean;
  setLoadedMessageCount: (updater: (prev: number) => number) => void;
  setIsLoadingMore: (value: boolean) => void;
  navigationLockRef: React.MutableRefObject<NavigationScrollLock>;
}

/**
 * Manages scroll behavior for the message view.
 * Handles auto-scroll to bottom on conversation open and scroll position restoration
 * when loading more messages. Waits for virtualizer to stabilize before scrolling.
 * Defers to deep-link navigation whenever `navigationLockRef` is active.
 */
export function useMessageScroll({
  scrollContainerRef,
  conversation,
  loadedMessageCount,
  isLoadingMore,
  swapped,
  setLoadedMessageCount,
  setIsLoadingMore,
  navigationLockRef,
}: UseMessageScrollProps) {
  const previousScrollHeightRef = useRef(0);
  const previousScrollTopRef = useRef(0);

  useEffect(() => {
    previousScrollHeightRef.current = 0;
    previousScrollTopRef.current = 0;
  }, [conversation?.id, swapped]);

  /**
   * Auto-scrolls to bottom when conversation changes.
   * Waits for virtualizer to stabilise (scrollHeight stops changing) before scrolling
   * to ensure accurate positioning. Uses frame counting as fallback timeout.
   *
   * Once scrolled, it keeps the list at the bottom, frame by frame, until the height has
   * stayed the same for PIN_STABLE_FRAMES frames. The virtualizer goes on measuring rows
   * after the list first looks settled (on a busy machine, well after), which grows the
   * list below the view; a single scroll, or one more after a fixed delay, then leaves the
   * conversation open above its newest message. The pinning stops at once if the user
   * scrolls, a deep link takes over, or another conversation is opened.
   */
  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!conversation || !scrollContainer) {
      return;
    }

    let lastHeight = 0;
    let stableFrames = 0;
    let frameCount = 0;
    let cancelled = false;
    const startGeneration = navigationLockRef.current.generation;
    // A deep link started (or is running) since this scroll was scheduled
    const navigationTookOver = () =>
      navigationLockRef.current.active ||
      navigationLockRef.current.generation !== startGeneration;

    // Scrolling by the user (as opposed to by this hook, which fires none of these) ends it
    const USER_INPUT = ["wheel", "touchstart", "pointerdown", "keydown"] as const;
    const stop = () => {
      cancelled = true;
    };
    for (const type of USER_INPUT) scrollContainer.addEventListener(type, stop, { passive: true });

    const scrollToBottom = () => {
      const container = scrollContainerRef.current;
      if (cancelled || !container || navigationTookOver()) {
        return;
      }

      const currentHeight = container.scrollHeight;
      frameCount++;

      // Track consecutive frames with stable height (virtualizer has finished rendering)
      if (currentHeight === lastHeight) {
        stableFrames++;
      } else {
        stableFrames = 0;
        lastHeight = currentHeight;
      }

      // Scroll when height is stable or max frames reached (timeout fallback), and from
      // then on whenever the list has grown below the view
      const settled = stableFrames >= REQUIRED_STABLE_FRAMES || frameCount >= MAX_SCROLL_FRAMES;
      if (settled) {
        const atBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 1;
        if (!atBottom) container.scrollTop = container.scrollHeight;
        if (stableFrames >= PIN_STABLE_FRAMES || frameCount >= MAX_PIN_FRAMES) return;
      }
      requestAnimationFrame(scrollToBottom);
    };

    requestAnimationFrame(scrollToBottom);

    return () => {
      cancelled = true;
      for (const type of USER_INPUT) scrollContainer.removeEventListener(type, stop);
    };
  }, [conversation, swapped, scrollContainerRef, navigationLockRef]);

  const loadMoreMessages = useCallback(() => {
    if (!conversation || !scrollContainerRef.current || isLoadingMore) return;

    previousScrollHeightRef.current =
      scrollContainerRef.current.scrollHeight ?? 0;
    previousScrollTopRef.current = scrollContainerRef.current.scrollTop ?? 0;

    startTransition(() => {
      setIsLoadingMore(true);
      setLoadedMessageCount((prev) =>
        Math.min(prev + LOAD_MORE_INCREMENT, conversation.messages.length),
      );
    });
  }, [conversation, isLoadingMore, setLoadedMessageCount, scrollContainerRef, setIsLoadingMore]);

  /**
   * Handles scroll events to trigger loading more messages.
   * When user scrolls near the top (within SCROLL_THRESHOLD), loads additional older messages.
   * Prevents multiple simultaneous loads with isLoadingMore check.
   */
  const handleScroll = useCallback(() => {
    const scrollContainer = scrollContainerRef.current;
    if (
      !scrollContainer ||
      isLoadingMore ||
      !conversation ||
      navigationLockRef.current.active
    ) {
      return;
    }

    const scrollTop = scrollContainer.scrollTop;

    // Load more when scrolled near top and not all messages are loaded
    const shouldLoadMore =
      scrollTop < SCROLL_THRESHOLD &&
      loadedMessageCount < conversation.messages.length;

    if (shouldLoadMore) {
      loadMoreMessages();
    }
  }, [
    conversation,
    isLoadingMore,
    loadedMessageCount,
    loadMoreMessages,
    scrollContainerRef,
    navigationLockRef,
  ]);

  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) return;

    scrollContainer.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      scrollContainer.removeEventListener("scroll", handleScroll);
    };
  }, [handleScroll, scrollContainerRef]);

  /**
   * Restores scroll position after loading more messages.
   * When new messages are added above the current view, we adjust scrollTop by the height difference
   * to maintain the user's visual position. Waits for virtualizer to stabilise before restoring.
   */
  useEffect(() => {
    if (
      !isLoadingMore ||
      !scrollContainerRef.current ||
      previousScrollHeightRef.current === 0
    ) {
      return;
    }

    let lastHeight = 0;
    let stableFrames = 0;
    let frameCount = 0;

    const restoreScroll = () => {
      const scrollContainer = scrollContainerRef.current;
      if (!scrollContainer) {
        startTransition(() => setIsLoadingMore(false));
        return;
      }

      // Deep-link navigation now owns the scroll position; don't restore over it
      if (navigationLockRef.current.active) {
        previousScrollHeightRef.current = 0;
        previousScrollTopRef.current = 0;
        startTransition(() => setIsLoadingMore(false));
        return;
      }

      const currentHeight = scrollContainer.scrollHeight;
      frameCount++;

      // Wait for height to stabilise (virtualizer finished rendering new messages)
      if (currentHeight === lastHeight) {
        stableFrames++;
      } else {
        stableFrames = 0;
        lastHeight = currentHeight;
      }

      if (stableFrames >= REQUIRED_STABLE_FRAMES || frameCount >= MAX_SCROLL_FRAMES) {
        // Calculate new scroll position: previous position + height added above
        const heightDifference = currentHeight - previousScrollHeightRef.current;
        const newScrollTop = previousScrollTopRef.current + heightDifference;
        scrollContainer.scrollTop = newScrollTop;

        previousScrollHeightRef.current = 0;
        previousScrollTopRef.current = 0;
        startTransition(() => setIsLoadingMore(false));
      } else {
        requestAnimationFrame(restoreScroll);
      }
    };

    requestAnimationFrame(restoreScroll);
  }, [isLoadingMore, setIsLoadingMore, scrollContainerRef, navigationLockRef]);
}

