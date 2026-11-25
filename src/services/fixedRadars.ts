import {
  FixedRadar,
  FixedRadarPrecision,
  FixedRadarPriority,
  FixedRadarType,
  INITIAL_FIXED_RADARS,
} from '../data/fixedRadars';
import { Coordinates } from '../types/navigation';
import { getDeviceUserId } from './alertLifecycle';
import { buildCumulativeDistances, projectPointOnPolyline } from './routeAlerts';
import { getDistanceMeters, projectPointOnSegment } from './routeMatching';

const NOMINATIM_CACHE_KEY = 'ruta_lima_fixed_radar_nominatim_v1';
const OVERPASS_STRETCH_CACHE_KEY = 'ruta_lima_fixed_radar_overpass_v1';
const RADAR_OVERRIDES_KEY = 'ruta_lima_fixed_radar_overrides_v1';
const COMMUNITY_RADARS_KEY = 'ruta_lima_community_fixed_radars_v1';

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

interface NominatimCacheEntry {
  status: 'found' | 'not_found';
  latitud: number | null;
  longitud: number | null;
  query: string;
  timestamp: number;
}

interface OverpassStretchCacheEntry {
  status: 'found' | 'not_found';
  tramoCoordenadas: [number, number][];
  exactMilestones: boolean;
  latitud: number | null;
  longitud: number | null;
  timestamp: number;
}

export interface FixedRadarOverride {
  latitud?: number | null;
  longitud?: number | null;
  precision?: FixedRadarPrecision;
  confirmations?: number;
  confirmedBy?: string[];
  removedVotes?: number;
  removedBy?: string[];
}

function readJsonStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJsonStorage<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.warn('No se pudo guardar en localStorage:', key, err);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Detecta la región del Perú según latitud y longitud aproximada.
 */
export function detectRegionFromCoords(lat: number, lng: number): string {
  // Lima Metropolitana y Callao
  if (lat >= -12.42 && lat <= -11.72 && lng >= -77.26 && lng <= -76.68) {
    return 'Lima y Callao';
  }
  // Región Lima (Provincias: Canta, Cañete, Huaral, Barranca, etc.)
  if (lat >= -13.35 && lat <= -10.3 && lng >= -77.95 && lng <= -75.55) {
    return 'Lima';
  }
  // Región Ica
  if (lat >= -15.45 && lat <= -13.0 && lng >= -76.55 && lng <= -74.55) {
    return 'Ica';
  }
  // Región Arequipa
  if (lat >= -17.35 && lat <= -14.6 && lng >= -75.1 && lng <= -70.75) {
    return 'Arequipa';
  }
  // Región Puno
  if (lat >= -17.2 && lat <= -13.0 && lng >= -71.2 && lng <= -68.6) {
    return 'Puno';
  }
  // Región Junín
  if (lat >= -12.6 && lat <= -10.65 && lng >= -76.4 && lng <= -73.45) {
    return 'Junín';
  }
  // Otras regiones principales para soporte nacional de radares comunitarios
  if (lat >= -10.75 && lat <= -7.9 && lng >= -78.7 && lng <= -76.7) return 'Áncash';
  if (lat >= -8.95 && lat <= -6.9 && lng >= -79.7 && lng <= -77.4) return 'La Libertad';
  if (lat >= -7.2 && lat <= -5.4 && lng >= -80.7 && lng <= -79.1) return 'Lambayeque';
  if (lat >= -6.3 && lat <= -4.1 && lng >= -81.4 && lng <= -79.2) return 'Piura';
  if (lat >= -14.6 && lat <= -11.2 && lng >= -73.9 && lng <= -70.3) return 'Cusco';
  if (lat >= -18.35 && lat <= -16.75 && lng >= -71.5 && lng <= -69.4) return 'Tacna';
  if (lat >= -17.85 && lat <= -15.95 && lng >= -71.5 && lng <= -69.95) return 'Moquegua';

  return 'Lima y Callao';
}

/**
 * Determina las regiones a cargar en base a la ubicación del usuario, la ruta activa
 * y el filtro elegido en Ajustes.
 */
export function getActiveRegionsForFilter(
  userCoords: Coordinates,
  routeCoordinates: [number, number][] | undefined,
  regionFilter: string
): Set<string> | 'ALL' {
  if (regionFilter === 'all') {
    return 'ALL';
  }

  const regions = new Set<string>();

  if (regionFilter && regionFilter !== 'auto') {
    regions.add(regionFilter);
  } else {
    regions.add(detectRegionFromCoords(userCoords.lat, userCoords.lng));
  }

  // Incluir siempre las regiones que atraviesa la ruta activa
  if (routeCoordinates && routeCoordinates.length >= 2) {
    const step = Math.max(1, Math.floor(routeCoordinates.length / 24));
    for (let i = 0; i < routeCoordinates.length; i += step) {
      const [lat, lng] = routeCoordinates[i];
      regions.add(detectRegionFromCoords(lat, lng));
    }
    const last = routeCoordinates[routeCoordinates.length - 1];
    regions.add(detectRegionFromCoords(last[0], last[1]));
  }

  return regions;
}

function getAllBaseAndCommunityRadars(): FixedRadar[] {
  const community = readJsonStorage<FixedRadar[]>(COMMUNITY_RADARS_KEY, []);
  return [...INITIAL_FIXED_RADARS, ...community];
}

/**
 * Devuelve la lista actual de radares filtrada por región/ruta activa,
 * aplicando caché de Nominatim, caché de Overpass y overrides comunitarios.
 */
export function getMergedFixedRadarsForRegions(activeRegions: Set<string> | 'ALL'): FixedRadar[] {
  const nominatimCache = readJsonStorage<Record<string, NominatimCacheEntry>>(
    NOMINATIM_CACHE_KEY,
    {}
  );
  const overpassCache = readJsonStorage<Record<string, OverpassStretchCacheEntry>>(
    OVERPASS_STRETCH_CACHE_KEY,
    {}
  );
  const overrides = readJsonStorage<Record<string, FixedRadarOverride>>(RADAR_OVERRIDES_KEY, {});

  const all = getAllBaseAndCommunityRadars();
  const result: FixedRadar[] = [];

  for (const base of all) {
    if (activeRegions !== 'ALL' && !activeRegions.has(base.region)) {
      continue;
    }

    const ov = overrides[base.id];
    const removedVotes = ov?.removedVotes ?? base.removedVotes ?? 0;
    if (removedVotes >= 3) {
      continue;
    }

    let merged: FixedRadar = { ...base };

    if (base.tipo === 'urbano') {
      const nom = nominatimCache[base.id];
      if (nom && nom.status === 'found' && nom.latitud !== null && nom.longitud !== null) {
        merged.latitud = nom.latitud;
        merged.longitud = nom.longitud;
      }
    } else if (base.tipo === 'carretera') {
      const str = overpassCache[base.id];
      if (str && str.status === 'found' && str.tramoCoordenadas.length >= 2) {
        merged.tramoCoordenadas = str.tramoCoordenadas;
        merged.latitud = str.latitud;
        merged.longitud = str.longitud;
        merged.precision = str.exactMilestones ? 'confirmado' : 'aproximado';
      }
    }

    if (ov) {
      if (typeof ov.latitud === 'number' && typeof ov.longitud === 'number') {
        merged.latitud = ov.latitud;
        merged.longitud = ov.longitud;
      }
      if (ov.precision) merged.precision = ov.precision;
      if (typeof ov.confirmations === 'number') merged.confirmations = ov.confirmations;
      if (Array.isArray(ov.confirmedBy)) merged.confirmedBy = ov.confirmedBy;
      if (typeof ov.removedVotes === 'number') merged.removedVotes = ov.removedVotes;
      if (Array.isArray(ov.removedBy)) merged.removedBy = ov.removedBy;
    }

    result.push(merged);
  }

  return result;
}

// Cola serializada global para respetar 1 sola consulta por dirección y pausa de 1s en Nominatim
let resolverPromise: Promise<void> | null = null;
let lastNominatimCallAt = 0;

async function queryNominatimSingle(query: string): Promise<{ lat: number; lng: number } | null> {
  const now = Date.now();
  const waitMs = Math.max(0, 1050 - (now - lastNominatimCallAt));
  if (waitMs > 0) {
    await sleep(waitMs);
  }
  lastNominatimCallAt = Date.now();

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
      query
    )}&countrycodes=pe&limit=1`;
    const res = await fetch(url, {
      headers: {
        'Accept-Language': 'es',
        'User-Agent': 'RutaLima-GPS-App/1.0',
      },
    });
    if (!res.ok) {
      return null;
    }
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0) {
      const lat = parseFloat(data[0].lat);
      const lng = parseFloat(data[0].lon);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        return { lat, lng };
      }
    }
    return null;
  } catch (err) {
    console.warn('[Radares Fijos] Error consultando Nominatim:', query, err);
    return null;
  }
}

function parseMilestoneKm(tags: Record<string, string> | undefined): number | null {
  if (!tags) return null;
  const raw = tags.distance || tags.pk || tags.milestone || tags.name || tags.ref || '';
  const match = String(raw).match(/(\d+(?:[.,]\d+)?)/);
  if (!match) return null;
  const val = parseFloat(match[1].replace(',', '.'));
  return Number.isFinite(val) ? val : null;
}

function chainHighwayWays(
  ways: Array<{ coords: [number, number][] }>
): [number, number][] {
  if (ways.length === 0) return [];
  if (ways.length === 1) return ways[0].coords;

  const remaining = ways.map((w) => [...w.coords]);
  let chain = remaining.shift()!;

  let progressed = true;
  while (remaining.length > 0 && progressed) {
    progressed = false;
    const head = chain[0];
    const tail = chain[chain.length - 1];
    let bestIdx = -1;
    let bestMode: 'append' | 'append_rev' | 'prepend' | 'prepend_rev' = 'append';
    let bestDist = Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const seg = remaining[i];
      if (seg.length < 2) continue;
      const segStart = seg[0];
      const segEnd = seg[seg.length - 1];

      const dTailStart = getDistanceMeters(tail[0], tail[1], segStart[0], segStart[1]);
      if (dTailStart < bestDist) {
        bestDist = dTailStart;
        bestIdx = i;
        bestMode = 'append';
      }
      const dTailEnd = getDistanceMeters(tail[0], tail[1], segEnd[0], segEnd[1]);
      if (dTailEnd < bestDist) {
        bestDist = dTailEnd;
        bestIdx = i;
        bestMode = 'append_rev';
      }
      const dHeadEnd = getDistanceMeters(head[0], head[1], segEnd[0], segEnd[1]);
      if (dHeadEnd < bestDist) {
        bestDist = dHeadEnd;
        bestIdx = i;
        bestMode = 'prepend';
      }
      const dHeadStart = getDistanceMeters(head[0], head[1], segStart[0], segStart[1]);
      if (dHeadStart < bestDist) {
        bestDist = dHeadStart;
        bestIdx = i;
        bestMode = 'prepend_rev';
      }
    }

    if (bestIdx >= 0 && bestDist < 2500) {
      const picked = remaining.splice(bestIdx, 1)[0];
      if (bestMode === 'append') {
        chain = [...chain, ...picked.slice(1)];
      } else if (bestMode === 'append_rev') {
        chain = [...chain, ...picked.slice().reverse().slice(1)];
      } else if (bestMode === 'prepend') {
        chain = [...picked.slice(0, -1), ...chain];
      } else {
        chain = [...picked.slice().reverse().slice(0, -1), ...chain];
      }
      progressed = true;
    }
  }

  return chain;
}

function slicePolylineBetweenPoints(
  coords: [number, number][],
  p1: Coordinates,
  p2: Coordinates
): [number, number][] {
  if (coords.length < 2) return coords;
  const cum = buildCumulativeDistances(coords);
  const proj1 = projectPointOnPolyline(p1.lat, p1.lng, coords, cum);
  const proj2 = projectPointOnPolyline(p2.lat, p2.lng, coords, cum);

  const startIdx = Math.min(proj1.segmentIndex, proj2.segmentIndex);
  const endIdx = Math.min(coords.length - 1, Math.max(proj1.segmentIndex, proj2.segmentIndex) + 1);
  const sliced = coords.slice(startIdx, endIdx + 1);
  return sliced.length >= 2 ? sliced : coords;
}

async function queryOverpassStretch(radar: FixedRadar): Promise<OverpassStretchCacheEntry> {
  if (!radar.bbox) {
    return {
      status: 'not_found',
      tramoCoordenadas: [],
      exactMilestones: false,
      latitud: null,
      longitud: null,
      timestamp: Date.now(),
    };
  }

  const [south, west, north, east] = radar.bbox;
  const regex = radar.roadMatchRegex || radar.carretera || '';
  const query = `
[out:json][timeout:18];
(
  node["highway"="milestone"](${south},${west},${north},${east});
  way["highway"~"motorway|trunk|primary|secondary"]["ref"~"${regex}",i](${south},${west},${north},${east});
  way["highway"~"motorway|trunk|primary|secondary"]["name"~"${regex}",i](${south},${west},${north},${east});
);
out body;
>;
out skel qt;
`.trim();

  let jsonData: any = null;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: `data=${encodeURIComponent(query)}`,
      });
      if (res.ok) {
        jsonData = await res.json();
        break;
      }
    } catch {
      // Siguiente espejo Overpass
    }
  }

  if (!jsonData || !Array.isArray(jsonData.elements)) {
    console.warn(`[Radares Sutran] Overpass no respondió para tramo: ${radar.nombre}`);
    return {
      status: 'not_found',
      tramoCoordenadas: [],
      exactMilestones: false,
      latitud: null,
      longitud: null,
      timestamp: Date.now(),
    };
  }

  const nodeMap = new Map<number, [number, number]>();
  const milestones: Array<{ km: number; lat: number; lng: number }> = [];
  const wayList: Array<{ coords: [number, number][] }> = [];

  for (const el of jsonData.elements) {
    if (el.type === 'node' && typeof el.lat === 'number' && typeof el.lon === 'number') {
      nodeMap.set(el.id, [el.lat, el.lon]);
      if (el.tags?.highway === 'milestone') {
        const km = parseMilestoneKm(el.tags);
        if (km !== null) {
          milestones.push({ km, lat: el.lat, lng: el.lon });
        }
      }
    }
  }

  for (const el of jsonData.elements) {
    if (el.type === 'way' && Array.isArray(el.nodes)) {
      const coords: [number, number][] = [];
      for (const nid of el.nodes) {
        const pt = nodeMap.get(nid);
        if (pt) coords.push(pt);
      }
      if (coords.length >= 2) {
        wayList.push({ coords });
      }
    }
  }

  if (wayList.length === 0) {
    console.warn(`[Radares Sutran] No se encontró traza vial en OSM para: ${radar.nombre}`);
    return {
      status: 'not_found',
      tramoCoordenadas: [],
      exactMilestones: false,
      latitud: null,
      longitud: null,
      timestamp: Date.now(),
    };
  }

  let polyline = chainHighwayWays(wayList);
  let exactMilestones = false;

  if (typeof radar.kmInicio === 'number' && typeof radar.kmFin === 'number') {
    const startPost = milestones.find((m) => Math.abs(m.km - radar.kmInicio!) <= 2);
    const endPost = milestones.find((m) => Math.abs(m.km - radar.kmFin!) <= 2);
    if (startPost && endPost) {
      polyline = slicePolylineBetweenPoints(
        polyline,
        { lat: startPost.lat, lng: startPost.lng },
        { lat: endPost.lat, lng: endPost.lng }
      );
      exactMilestones = true;
    } else {
      console.log(
        `[Radares Sutran] Postes kilométricos exactos (${radar.kmInicio}-${radar.kmFin}) no hallados en OSM para ${radar.nombre}; tramo marcado como aproximado.`
      );
    }
  }

  // Simplificar ligeramente si tiene demasiados vértices para mantener fluidez
  if (polyline.length > 260) {
    const step = Math.ceil(polyline.length / 240);
    const thinned: [number, number][] = [];
    for (let i = 0; i < polyline.length; i += step) {
      thinned.push(polyline[i]);
    }
    const last = polyline[polyline.length - 1];
    if (thinned[thinned.length - 1] !== last) thinned.push(last);
    polyline = thinned;
  }

  const mid = polyline[Math.floor(polyline.length / 2)];
  return {
    status: polyline.length >= 2 ? 'found' : 'not_found',
    tramoCoordenadas: polyline,
    exactMilestones,
    latitud: mid ? mid[0] : null,
    longitud: mid ? mid[1] : null,
    timestamp: Date.now(),
  };
}

/**
 * Resuelve en segundo plano únicamente los radares y tramos de las regiones activas
 * que aún no tengan resultado guardado en caché local.
 */
export async function resolvePendingRadarsForRegions(
  activeRegions: Set<string> | 'ALL',
  onProgress: () => void
): Promise<void> {
  const work = async () => {
    const all = getAllBaseAndCommunityRadars();
    const nominatimCache = readJsonStorage<Record<string, NominatimCacheEntry>>(
      NOMINATIM_CACHE_KEY,
      {}
    );
    const overpassCache = readJsonStorage<Record<string, OverpassStretchCacheEntry>>(
      OVERPASS_STRETCH_CACHE_KEY,
      {}
    );

    const pendingUrban = all.filter((r) => {
      if (r.tipo !== 'urbano') return false;
      if (r.latitud !== null && r.longitud !== null) return false;
      if (activeRegions !== 'ALL' && !activeRegions.has(r.region)) return false;
      return !nominatimCache[r.id];
    });

    for (const radar of pendingUrban) {
      const currentCache = readJsonStorage<Record<string, NominatimCacheEntry>>(
        NOMINATIM_CACHE_KEY,
        {}
      );
      if (currentCache[radar.id]) continue;

      const citySuffix =
        radar.provincia === 'Callao'
          ? 'Callao, Peru'
          : radar.provincia === 'Lima'
          ? 'Lima, Peru'
          : `${radar.provincia || radar.region}, Peru`;
      const query = radar.nominatimQuery || `${radar.direccion}, ${radar.distrito}, ${citySuffix}`;

      const coords = await queryNominatimSingle(query);
      if (coords) {
        currentCache[radar.id] = {
          status: 'found',
          latitud: coords.lat,
          longitud: coords.lng,
          query,
          timestamp: Date.now(),
        };
      } else {
        console.warn(`[Radares Fijos] Dirección no encontrada en Nominatim: "${radar.direccion}" (${query})`);
        currentCache[radar.id] = {
          status: 'not_found',
          latitud: null,
          longitud: null,
          query,
          timestamp: Date.now(),
        };
      }
      writeJsonStorage(NOMINATIM_CACHE_KEY, currentCache);
      onProgress();
    }

    const pendingStretches = all.filter((r) => {
      if (r.tipo !== 'carretera') return false;
      if (r.tramoCoordenadas && r.tramoCoordenadas.length >= 2) return false;
      if (activeRegions !== 'ALL' && !activeRegions.has(r.region)) return false;
      return !overpassCache[r.id];
    });

    for (const stretch of pendingStretches) {
      const currentStretchCache = readJsonStorage<Record<string, OverpassStretchCacheEntry>>(
        OVERPASS_STRETCH_CACHE_KEY,
        {}
      );
      if (currentStretchCache[stretch.id]) continue;

      const resolved = await queryOverpassStretch(stretch);
      currentStretchCache[stretch.id] = resolved;
      writeJsonStorage(OVERPASS_STRETCH_CACHE_KEY, currentStretchCache);
      onProgress();
      await sleep(450);
    }
  };

  if (resolverPromise) {
    resolverPromise = resolverPromise.then(work).catch(() => {});
  } else {
    resolverPromise = work().finally(() => {
      resolverPromise = null;
    });
  }

  return resolverPromise;
}

/**
 * Guarda confirmación de ubicación exacta (arrastre en mapa o confirmación comunitaria).
 */
export function confirmFixedRadarLocation(
  radar: FixedRadar,
  newLat?: number,
  newLng?: number
): { confirmations: number; precision: FixedRadarPrecision; alreadyVoted: boolean } {
  const deviceId = getDeviceUserId();
  const overrides = readJsonStorage<Record<string, FixedRadarOverride>>(RADAR_OVERRIDES_KEY, {});
  const prev = overrides[radar.id] || {};
  const existingConfirmers = Array.isArray(prev.confirmedBy)
    ? [...prev.confirmedBy]
    : Array.isArray(radar.confirmedBy)
    ? [...radar.confirmedBy]
    : [];

  const alreadyVoted = existingConfirmers.includes(deviceId);
  if (!alreadyVoted) {
    existingConfirmers.push(deviceId);
  }

  const nextConfirmations = existingConfirmers.length;
  // Para radares sugeridos por comunidad, pasa a "confirmado" cuando 3 usuarios distintos lo confirman.
  // Para radares referenciales del catálogo, al arrastrar/confirmar ubicación se guarda como "confirmado".
  const nextPrecision: FixedRadarPrecision = radar.isCommunitySuggested
    ? nextConfirmations >= 3
      ? 'confirmado'
      : 'aproximado'
    : 'confirmado';

  overrides[radar.id] = {
    ...prev,
    ...(typeof newLat === 'number' && typeof newLng === 'number'
      ? { latitud: newLat, longitud: newLng }
      : {}),
    confirmedBy: existingConfirmers,
    confirmations: nextConfirmations,
    precision: nextPrecision,
  };

  writeJsonStorage(RADAR_OVERRIDES_KEY, overrides);
  return {
    confirmations: nextConfirmations,
    precision: nextPrecision,
    alreadyVoted,
  };
}

/**
 * Reporta que un radar fijo ya no está en esa ubicación.
 */
export function reportFixedRadarRemoved(radar: FixedRadar): {
  removedVotes: number;
  isHidden: boolean;
  alreadyVoted: boolean;
} {
  const deviceId = getDeviceUserId();
  const overrides = readJsonStorage<Record<string, FixedRadarOverride>>(RADAR_OVERRIDES_KEY, {});
  const prev = overrides[radar.id] || {};
  const existingRemovers = Array.isArray(prev.removedBy)
    ? [...prev.removedBy]
    : Array.isArray(radar.removedBy)
    ? [...radar.removedBy]
    : [];

  const alreadyVoted = existingRemovers.includes(deviceId);
  if (!alreadyVoted) {
    existingRemovers.push(deviceId);
  }

  const removedVotes = existingRemovers.length;
  overrides[radar.id] = {
    ...prev,
    removedBy: existingRemovers,
    removedVotes,
  };
  writeJsonStorage(RADAR_OVERRIDES_KEY, overrides);

  return {
    removedVotes,
    isHidden: removedVotes >= 3,
    alreadyVoted,
  };
}

export interface SuggestRadarInput {
  nombre: string;
  direccion: string;
  distrito: string;
  provincia: string;
  region: string;
  tipo: FixedRadarType;
  prioridad: FixedRadarPriority;
  coords?: Coordinates | null;
}

/**
 * Permite a cualquier conductor sugerir un nuevo radar fijo en cualquier ciudad del Perú.
 * Se guarda siempre como "aproximado" hasta que 3 usuarios distintos lo confirmen.
 */
export async function suggestCommunityFixedRadar(
  input: SuggestRadarInput
): Promise<{ success: boolean; radar?: FixedRadar; error?: string }> {
  const deviceId = getDeviceUserId();
  let latitud: number | null = input.coords?.lat ?? null;
  let longitud: number | null = input.coords?.lng ?? null;

  if (latitud === null || longitud === null) {
    const query = `${input.direccion}, ${input.distrito || input.provincia}, ${input.region}, Peru`;
    const geocoded = await queryNominatimSingle(query);
    if (!geocoded) {
      return {
        success: false,
        error: 'No se encontró la dirección en OpenStreetMap. Prueba usando la ubicación actual del mapa.',
      };
    }
    latitud = geocoded.lat;
    longitud = geocoded.lng;
  }

  const newRadar: FixedRadar = {
    id: `rf_comm_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    nombre: input.nombre.trim() || input.direccion.trim(),
    direccion: input.direccion.trim(),
    distrito: input.distrito.trim() || input.provincia.trim() || input.region,
    provincia: input.provincia.trim() || input.distrito.trim() || input.region,
    region: input.region,
    latitud,
    longitud,
    tipo: input.tipo,
    prioridad: input.prioridad,
    precision: 'aproximado',
    isCommunitySuggested: true,
    confirmations: 1,
    confirmedBy: [deviceId],
    removedVotes: 0,
    removedBy: [],
  };

  const existing = readJsonStorage<FixedRadar[]>(COMMUNITY_RADARS_KEY, []);
  writeJsonStorage(COMMUNITY_RADARS_KEY, [newRadar, ...existing]);
  return { success: true, radar: newRadar };
}

export interface FixedRadarNavAnnouncement {
  id: string;
  key: string;
  text: string;
  radar: FixedRadar;
}

/**
 * Evalúa durante navegación activa:
 * 1) Radares urbanos delante del usuario, sobre la ruta y en su sentido de marcha -> avisar a 1 km y a 300 m.
 * 2) Tramos de carretera Sutran -> avisar al entrar a la franja y al salir.
 */
export function evaluateFixedRadarsNavigation(
  userCoords: Coordinates,
  userHeading: number | null | undefined,
  isMoving: boolean,
  routeCoordinates: [number, number][],
  radars: FixedRadar[],
  enteredStretchIds: Set<string>,
  announcedKeys: Set<string>
): FixedRadarNavAnnouncement[] {
  const events: FixedRadarNavAnnouncement[] = [];
  if (!routeCoordinates || routeCoordinates.length < 2 || radars.length === 0) {
    return events;
  }

  const cumDist = buildCumulativeDistances(routeCoordinates);
  const userProj = projectPointOnPolyline(
    userCoords.lat,
    userCoords.lng,
    routeCoordinates,
    cumDist
  );

  // Si el usuario está muy lejos de la ruta, evitar avisos erróneos
  if (userProj.distanceToRoute > 65) {
    return events;
  }

  const hasValidHeading =
    isMoving && userHeading !== null && userHeading !== undefined && Number.isFinite(userHeading);
  if (hasValidHeading) {
    const angleDiff = Math.abs((((userHeading! - userProj.segmentBearing + 540) % 360) - 180));
    if (angleDiff > 100) {
      return events;
    }
  }

  for (const radar of radars) {
    if (radar.tipo === 'urbano' && radar.latitud !== null && radar.longitud !== null) {
      const proj = projectPointOnPolyline(
        radar.latitud,
        radar.longitud,
        routeCoordinates,
        cumDist
      );

      if (proj.distanceToRoute > 48) continue;

      const distanceAheadMeters = Math.round(proj.alongRouteMeters - userProj.alongRouteMeters);
      if (distanceAheadMeters < 20) continue;

      const statusWord = radar.precision === 'confirmado' ? 'confirmado' : 'referencial';

      // Aviso a 1 kilómetro (850m a 1150m)
      if (distanceAheadMeters >= 850 && distanceAheadMeters <= 1150) {
        const key = `${radar.id}_1km`;
        if (!announcedKeys.has(key)) {
          announcedKeys.add(key);
          events.push({
            id: radar.id,
            key,
            text: `Radar fijo ${statusWord} a 1 kilómetro en tu ruta.`,
            radar,
          });
        }
      }

      // Aviso a 300 metros (40m a 340m)
      if (distanceAheadMeters >= 40 && distanceAheadMeters <= 340) {
        const key = `${radar.id}_300m`;
        if (!announcedKeys.has(key)) {
          announcedKeys.add(key);
          events.push({
            id: radar.id,
            key,
            text: `Radar fijo ${statusWord} a 300 metros en tu ruta.`,
            radar,
          });
        }
      }
    } else if (
      radar.tipo === 'carretera' &&
      radar.tramoCoordenadas &&
      radar.tramoCoordenadas.length >= 2
    ) {
      let minStretchDist = Infinity;
      for (let i = 0; i < radar.tramoCoordenadas.length - 1; i++) {
        const a = radar.tramoCoordenadas[i];
        const b = radar.tramoCoordenadas[i + 1];
        const segProj = projectPointOnSegment(userCoords.lat, userCoords.lng, a[0], a[1], b[0], b[1]);
        if (segProj.distanceMeters < minStretchDist) {
          minStretchDist = segProj.distanceMeters;
        }
      }

      const wasInside = enteredStretchIds.has(radar.id);
      if (!wasInside && minStretchDist <= 75) {
        enteredStretchIds.add(radar.id);
        const enterKey = `${radar.id}_enter`;
        if (!announcedKeys.has(enterKey)) {
          announcedKeys.add(enterKey);
          const stretchKm =
            typeof radar.kmInicio === 'number' && typeof radar.kmFin === 'number'
              ? Math.max(1, Math.round(Math.abs(radar.kmFin - radar.kmInicio)))
              : 10;
          events.push({
            id: radar.id,
            key: enterKey,
            text: `Tramo con control de velocidad por cinemómetros en los próximos ${stretchKm} kilómetros.`,
            radar,
          });
        }
      } else if (wasInside && minStretchDist > 180) {
        enteredStretchIds.delete(radar.id);
        const exitKey = `${radar.id}_exit`;
        if (!announcedKeys.has(exitKey)) {
          announcedKeys.add(exitKey);
          events.push({
            id: radar.id,
            key: exitKey,
            text: 'Saliste del tramo con control de velocidad por cinemómetros.',
            radar,
          });
        }
      }
    }
  }

  return events;
}
