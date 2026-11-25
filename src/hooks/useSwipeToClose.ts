import { useEffect, useRef } from 'react';

interface UseSwipeToCloseOptions {
  isOpen: boolean;
  onClose: () => void;
  scrollRef?: React.RefObject<HTMLElement | null>;
}

function hasScrolledAncestor(
  target: EventTarget | null,
  root: HTMLElement
): boolean {
  let node = target instanceof HTMLElement ? target : null;
  while (node && node !== root) {
    if (node.scrollHeight > node.clientHeight + 2 && node.scrollTop > 1) {
      return true;
    }
    node = node.parentElement;
  }
  return false;
}

export function useSwipeToClose<T extends HTMLElement = HTMLDivElement>({
  isOpen,
  onClose,
  scrollRef,
}: UseSwipeToCloseOptions) {
  const panelRef = useRef<T | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const el = panelRef.current;
    if (!isOpen || !el) {
      if (el) {
        el.style.transform = '';
        el.style.opacity = '';
        el.style.transition = '';
        el.style.willChange = '';
      }
      return;
    }

    let startX = 0;
    let startY = 0;
    let dragOriginY = 0;
    let dragStartTime = 0;
    let currentDeltaY = 0;
    let canSwipe = false;
    let isDragging = false;
    let isLockedOut = false;
    let isClosing = false;
    let cleanupTimer: ReturnType<typeof setTimeout> | null = null;

    const resetInlineStyles = () => {
      el.style.transform = '';
      el.style.opacity = '';
      el.style.transition = '';
      el.style.willChange = '';
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (isClosing || e.touches.length !== 1) {
        canSwipe = false;
        return;
      }

      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'SELECT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'OPTION')
      ) {
        canSwipe = false;
        return;
      }

      const scrollEl = scrollRef?.current;
      if (scrollEl && target && scrollEl.contains(target) && scrollEl.scrollTop > 1) {
        canSwipe = false;
        return;
      }

      if (hasScrolledAncestor(target, el)) {
        canSwipe = false;
        return;
      }

      if (cleanupTimer) {
        clearTimeout(cleanupTimer);
        cleanupTimer = null;
      }

      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      dragOriginY = startY;
      dragStartTime = performance.now();
      currentDeltaY = 0;
      canSwipe = true;
      isDragging = false;
      isLockedOut = false;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!canSwipe || isLockedOut || isClosing || e.touches.length !== 1) return;

      const touch = e.touches[0];
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;

      if (!isDragging) {
        if (Math.abs(dx) > 10 && Math.abs(dx) >= Math.abs(dy)) {
          isLockedOut = true;
          return;
        }
        if (dy < -6) {
          isLockedOut = true;
          return;
        }
        if (dy > 8 && dy > Math.abs(dx) * 1.15) {
          const scrollEl = scrollRef?.current;
          if (scrollEl && targetIsInside(e.target, scrollEl) && scrollEl.scrollTop > 1) {
            isLockedOut = true;
            return;
          }
          isDragging = true;
          dragOriginY = touch.clientY;
          dragStartTime = performance.now();
          el.style.transition = 'none';
          el.style.willChange = 'transform, opacity';
        } else {
          return;
        }
      }

      if (e.cancelable) {
        e.preventDefault();
      }
      const offset = Math.max(0, touch.clientY - dragOriginY);
      currentDeltaY = offset;
      el.style.transform = `translateY(${offset}px)`;
      el.style.opacity = String(Math.max(0.45, 1 - offset / 460));
    };

    const finishDrag = (cancelled: boolean) => {
      if (!isDragging) {
        canSwipe = false;
        isLockedOut = false;
        return;
      }
      const elapsed = Math.max(16, performance.now() - dragStartTime);
      const velocity = currentDeltaY / elapsed;
      const shouldClose =
        !cancelled && (currentDeltaY >= 85 || (currentDeltaY >= 40 && velocity >= 0.45));

      canSwipe = false;
      isDragging = false;
      isLockedOut = false;

      if (shouldClose) {
        isClosing = true;
        el.style.transition =
          'transform 220ms cubic-bezier(0.22, 1, 0.36, 1), opacity 200ms ease-out';
        el.style.transform = 'translateY(100vh)';
        el.style.opacity = '0';
        cleanupTimer = setTimeout(() => {
          cleanupTimer = null;
          resetInlineStyles();
          onCloseRef.current();
        }, 200);
      } else {
        el.style.transition =
          'transform 200ms cubic-bezier(0.22, 1, 0.36, 1), opacity 180ms ease-out';
        el.style.transform = 'translateY(0px)';
        el.style.opacity = '1';
        cleanupTimer = setTimeout(() => {
          cleanupTimer = null;
          resetInlineStyles();
        }, 210);
      }
    };

    const handleTouchEnd = () => finishDrag(false);
    const handleTouchCancel = () => finishDrag(true);

    el.addEventListener('touchstart', handleTouchStart, { passive: true });
    el.addEventListener('touchmove', handleTouchMove, { passive: false });
    el.addEventListener('touchend', handleTouchEnd, { passive: true });
    el.addEventListener('touchcancel', handleTouchCancel, { passive: true });

    return () => {
      if (cleanupTimer) {
        clearTimeout(cleanupTimer);
      }
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchmove', handleTouchMove);
      el.removeEventListener('touchend', handleTouchEnd);
      el.removeEventListener('touchcancel', handleTouchCancel);
      resetInlineStyles();
    };
  }, [isOpen, scrollRef]);

  return { panelRef };
}

function targetIsInside(target: EventTarget | null, container: HTMLElement): boolean {
  return target instanceof Node ? container.contains(target) : false;
}
