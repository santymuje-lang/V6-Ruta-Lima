export type SmallOverlayId =
  | 'long_press'
  | 'poi_card'
  | 'radar_card'
  | 'police_card'
  | 'inspector_card'
  | 'alert_popup'
  | 'limit_picker'
  | 'avoid_menu'
  | 'search_panel';

type CloseCallback = () => void;

const activeOverlays = new Map<SmallOverlayId, CloseCallback>();

interface PendingOutsideTap {
  x: number;
  y: number;
  pointerId: number;
}

let pendingOutsideTap: PendingOutsideTap | null = null;
let suppressMapClickUntil = 0;
let listenersInstalled = false;

function isInsideActiveSmallOverlay(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;

  if (target.closest('[data-small-overlay]')) {
    return true;
  }

  if (target.closest('.maplibregl-popup')) {
    return true;
  }

  const triggerEl = target.closest('[data-small-overlay-trigger]');
  if (triggerEl) {
    const triggerId = triggerEl.getAttribute('data-small-overlay-trigger') as SmallOverlayId | null;
    if (triggerId && activeOverlays.has(triggerId)) {
      return true;
    }
  }

  return false;
}

function ensureGlobalListenersInstalled() {
  if (listenersInstalled || typeof document === 'undefined') return;
  listenersInstalled = true;

  document.addEventListener(
    'pointerdown',
    (e: PointerEvent) => {
      if (e.isPrimary === false) {
        pendingOutsideTap = null;
        return;
      }

      if (!hasAnyOpenSmallOverlay()) {
        pendingOutsideTap = null;
        return;
      }

      if (isInsideActiveSmallOverlay(e.target)) {
        pendingOutsideTap = null;
        return;
      }

      pendingOutsideTap = {
        x: e.clientX,
        y: e.clientY,
        pointerId: e.pointerId,
      };
    },
    true
  );

  document.addEventListener(
    'pointerup',
    (e: PointerEvent) => {
      const pending = pendingOutsideTap;
      pendingOutsideTap = null;
      if (!pending || e.pointerId !== pending.pointerId) return;

      const moved = Math.hypot(e.clientX - pending.x, e.clientY - pending.y);
      if (moved >= 12) {
        return;
      }

      if (!hasAnyOpenSmallOverlay()) return;

      closeAllSmallOverlays();
      suppressMapClickUntil = performance.now() + 450;
    },
    true
  );

  document.addEventListener(
    'pointercancel',
    () => {
      pendingOutsideTap = null;
    },
    true
  );

  document.addEventListener(
    'click',
    (e: MouseEvent) => {
      if (performance.now() < suppressMapClickUntil) {
        if (
          e.target instanceof Element &&
          e.target.closest('#ruta-lima-leaflet-map, [data-map-control="true"]')
        ) {
          e.stopPropagation();
          e.preventDefault();
        }
      }
    },
    true
  );
}

export function notifySmallOverlayOpen(id: SmallOverlayId, closeFn: CloseCallback) {
  ensureGlobalListenersInstalled();
  const entries = Array.from(activeOverlays.entries());
  for (const [otherId, otherClose] of entries) {
    if (otherId !== id) {
      activeOverlays.delete(otherId);
      try {
        otherClose();
      } catch {}
    }
  }
  activeOverlays.set(id, closeFn);
}

export function notifySmallOverlayClose(id: SmallOverlayId) {
  activeOverlays.delete(id);
}

export function closeAllSmallOverlays() {
  const entries = Array.from(activeOverlays.entries());
  activeOverlays.clear();
  for (const [, closeFn] of entries) {
    try {
      closeFn();
    } catch {}
  }
}

export function hasAnyOpenSmallOverlay(): boolean {
  if (activeOverlays.size > 0) return true;
  if (typeof document !== 'undefined' && document.querySelector('.maplibregl-popup')) {
    return true;
  }
  return false;
}

export function shouldSuppressMapClick(): boolean {
  return performance.now() < suppressMapClickUntil;
}
