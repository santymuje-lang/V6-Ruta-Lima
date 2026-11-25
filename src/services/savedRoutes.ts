import { Coordinates, RouteData, SearchResult, TravelMode } from '../types/navigation';

// Rutas calculadas con internet que quedan guardadas en el teléfono para poder usarlas sin conexión
const STORAGE_KEY = 'ruta_lima_saved_routes';
const MAX_ENTRIES = 6;
const MAX_ROUTES_PER_ENTRY = 3;
const SAME_DESTINATION_METERS = 150;
// Para usar una ruta guardada sin internet, tu ubicación debe estar sobre o cerca del trazado
export const MAX_DISTANCE_TO_SAVED_ROUTE_M = 600;

export interface SavedRouteEntry {
  destination: { id: string; name: string; display_name: string; lat: number; lng: number };
  mode: TravelMode;
  routes: RouteData[];
  savedAt: number;
}

function haversineMeters(a: Coordinates, b: Coordinates): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function listSavedRoutes(): SavedRouteEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeEntries(entries: SavedRouteEntry[]): void {
  let list = entries;
  // Si el almacenamiento está lleno, se van descartando las rutas más antiguas
  while (list.length > 0) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
      return;
    } catch {
      list = list.slice(0, -1);
    }
  }
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

export function saveRoutes(destination: SearchResult, mode: TravelMode, routes: RouteData[]): void {
  if (!routes || routes.length === 0) return;
  const entry: SavedRouteEntry = {
    destination: {
      id: destination.id,
      name: destination.name,
      display_name: destination.display_name,
      lat: destination.lat,
      lng: destination.lng,
    },
    mode,
    routes: routes.slice(0, MAX_ROUTES_PER_ENTRY),
    savedAt: Date.now(),
  };
  const others = listSavedRoutes().filter(
    (e) =>
      !(
        e.mode === mode &&
        haversineMeters(e.destination, destination) <= SAME_DESTINATION_METERS
      )
  );
  writeEntries([entry, ...others].slice(0, MAX_ENTRIES));
}

export function findSavedRoutes(destination: Coordinates, mode: TravelMode): SavedRouteEntry | null {
  return (
    listSavedRoutes().find(
      (e) =>
        e.mode === mode &&
        Array.isArray(e.routes) &&
        e.routes.length > 0 &&
        haversineMeters(e.destination, destination) <= SAME_DESTINATION_METERS
    ) || null
  );
}

/** Distancia mínima (m) desde un punto hasta el trazado de la ruta (puntos [lat, lng]). */
export function distanceToRouteMeters(point: Coordinates, coords: [number, number][]): number {
  let best = Infinity;
  for (let i = 0; i < coords.length; i++) {
    const d = haversineMeters(point, { lat: coords[i][0], lng: coords[i][1] });
    if (d < best) best = d;
  }
  return best;
}
