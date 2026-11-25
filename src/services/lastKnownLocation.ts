import { Coordinates } from '../types/navigation';

const STORAGE_KEY = 'ruta_lima_last_known_location';

// Respaldo final solo si nunca hubo una ubicación real guardada
export const DEFAULT_FALLBACK_COORDS: Coordinates = { lat: -12.0975, lng: -77.0345 };

function isWithinPeru(lat: number, lng: number): boolean {
  return lat >= -18.5 && lat <= 0.0 && lng >= -81.5 && lng <= -68.5;
}

/** Última ubicación GPS real guardada en este dispositivo (o null si no hay). */
export function getLastKnownLocation(): Coordinates | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      Number.isFinite(parsed.lat) &&
      Number.isFinite(parsed.lng) &&
      isWithinPeru(parsed.lat, parsed.lng)
    ) {
      return { lat: parsed.lat, lng: parsed.lng };
    }
  } catch {
    // almacenamiento no disponible
  }
  return null;
}

let lastSavedAt = 0;

/** Guarda la ubicación real (máximo una vez cada 10 s para no escribir en cada fix). */
export function saveLastKnownLocation(lat: number, lng: number): void {
  const now = Date.now();
  if (now - lastSavedAt < 10000) return;
  if (!isWithinPeru(lat, lng)) return;
  lastSavedAt = now;
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ lat, lng, t: now }));
  } catch {
    // almacenamiento no disponible
  }
}

/** Origen de respaldo: la última ubicación real, o el centro de Lima si nunca hubo una. */
export function getFallbackOrigin(): Coordinates {
  return getLastKnownLocation() ?? DEFAULT_FALLBACK_COORDS;
}
