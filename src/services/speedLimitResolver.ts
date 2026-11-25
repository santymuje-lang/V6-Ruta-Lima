import { useState, useEffect, useCallback, useRef } from 'react';
import { Coordinates, MapPOI } from '../types/navigation';
import { getDistanceMeters, projectPointOnSegment } from './routeMatching';

export type SpeedLimitSource =
  | 'Señal comunitaria'
  | 'Mapa'
  | 'Estimado por tipo de vía';

export interface ResolvedSpeedLimit {
  limitKmh: number | null;
  source: SpeedLimitSource | null;
  roadName: string;
  highwayType?: string;
  categoryLabel?: string;
  osmWayId?: number;
  segmentKey?: string;
  isSchoolOrHospitalZone?: boolean;
}

interface OsmWaySegmentCacheItem {
  wayId: number;
  name: string;
  highway: string;
  rawMaxSpeed?: string;
  parsedMaxSpeed: number | null;
  coords: [number, number][]; // [lat, lng]
}

interface OsmAreaQueryCacheEntry {
  centerLat: number;
  centerLng: number;
  radiusMeters: number;
  timestamp: number;
  ways: OsmWaySegmentCacheItem[];
  schoolOrHospitalPoints: Coordinates[];
}

export interface CommunitySpeedRecord {
  segmentKey: string;
  wayId?: number;
  roadName: string;
  lat: number;
  lng: number;
  votes: Record<string, number>;
  userVote?: number;
  updatedAt: number;
}

const COMMUNITY_SPEED_STORAGE_KEY = 'ruta_lima_community_speed_limits_v1';
const MIN_OVERPASS_INTERVAL_MS = 5000;
const AREA_CACHE_TTL_MS = 20 * 60 * 1000;
const AREA_COVER_RADIUS_METERS = 42;
const QUERY_RADIUS_ROAD_METERS = 75;
const QUERY_RADIUS_ZONE_METERS = 85;
const MAX_AREA_CACHE_ENTRIES = 160;
const OVERPASS_FALLBACK_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

const areaQueryCache: OsmAreaQueryCacheEntry[] = [];
const communityListeners = new Set<() => void>();

function notifyCommunityListeners() {
  communityListeners.forEach((fn) => {
    try {
      fn();
    } catch {}
  });
}

function normalizeRoadKey(name: string): string {
  return (name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Convierte la etiqueta OSM "maxspeed" (p. ej. "30 km/h", "40", "60kph") a número km/h.
 * Descarta valores no numéricos o fuera de rango válido en vías urbanas/carreteras.
 */
export function parseOsmMaxSpeed(raw?: string | null): number | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return null;

  // Rechazar etiquetas simbólicas sin valor numérico claro ("walk", "none", "signals", etc.)
  if (trimmed === 'none' || trimmed === 'walk' || trimmed === 'signals' || trimmed === 'variable') {
    return null;
  }

  // Ignorar límites en mph si existieran sin conversión ambigua, o soportar "30", "30 km/h", "30kmh"
  if (trimmed.includes('mph')) {
    const mphMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s*mph$/);
    if (!mphMatch) return null;
    const kmh = Math.round(parseFloat(mphMatch[1]) * 1.60934);
    return Number.isFinite(kmh) && kmh >= 10 && kmh <= 130 ? kmh : null;
  }

  // Tomar el primer número si viene en formato "30", "30 km/h", "30 kmh", "50;40"
  const numMatch = trimmed.match(/^(\d{1,3})(?:\s*(?:km\/?h|kph))?(?:[;|,].*)?$/);
  if (!numMatch) return null;

  const val = parseInt(numMatch[1], 10);
  if (!Number.isFinite(val) || val < 10 || val > 130) {
    return null;
  }
  return val;
}

/**
 * Límite prudente según el tipo de vía ("highway") en OpenStreetMap:
 * - motorway: 80
 * - trunk, primary: 50
 * - secondary, tertiary: 40
 * - residential, unclassified, living_street, service: 30
 */
export function getPrudentLimitByHighwayType(highway?: string | null): number | null {
  const hw = (highway || '').trim().toLowerCase();
  if (!hw) return null;

  if (hw === 'motorway' || hw === 'motorway_link') return 80;
  if (hw === 'trunk' || hw === 'trunk_link' || hw === 'primary' || hw === 'primary_link') return 50;
  if (hw === 'secondary' || hw === 'secondary_link' || hw === 'tertiary' || hw === 'tertiary_link') {
    return 40;
  }
  if (
    hw === 'residential' ||
    hw === 'unclassified' ||
    hw === 'living_street' ||
    hw === 'service' ||
    hw === 'road'
  ) {
    return 30;
  }
  return null;
}

export function getHighwayCategoryLabel(highway?: string | null, isSchoolOrHospital?: boolean): string {
  if (isSchoolOrHospital) return 'Zona Escolar / Hospitalaria';
  const hw = (highway || '').trim().toLowerCase();
  if (hw === 'motorway' || hw === 'motorway_link') return 'Vía Expresa / Autopista';
  if (hw === 'trunk' || hw === 'trunk_link' || hw === 'primary' || hw === 'primary_link') {
    return 'Avenida Troncal / Principal';
  }
  if (hw === 'secondary' || hw === 'secondary_link' || hw === 'tertiary' || hw === 'tertiary_link') {
    return 'Avenida Secundaria';
  }
  if (
    hw === 'residential' ||
    hw === 'unclassified' ||
    hw === 'living_street' ||
    hw === 'service'
  ) {
    return 'Calle / Jirón Local';
  }
  return 'Vía Urbana';
}

function buildSegmentKey(lat: number, lng: number, wayId?: number, roadName?: string): string {
  // Celda de ~220m para asociar correcciones al tramo específico de esa vía
  const latCell = Math.round(lat * 450);
  const lngCell = Math.round(lng * 450);
  if (wayId) {
    return `way_${wayId}_${latCell}_${lngCell}`;
  }
  const cleanName = normalizeRoadKey(roadName || '');
  if (cleanName) {
    return `road_${cleanName}_${latCell}_${lngCell}`;
  }
  return `pos_${latCell}_${lngCell}`;
}

function loadCommunityRecords(): Record<string, CommunitySpeedRecord> {
  try {
    const raw = localStorage.getItem(COMMUNITY_SPEED_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return parsed as Record<string, CommunitySpeedRecord>;
    }
  } catch {}
  return {};
}

function saveCommunityRecords(records: Record<string, CommunitySpeedRecord>) {
  try {
    localStorage.setItem(COMMUNITY_SPEED_STORAGE_KEY, JSON.stringify(records));
  } catch {}
}

function getMajorityLimitFromRecord(record: CommunitySpeedRecord): number | null {
  const entries = Object.entries(record.votes || {})
    .map(([k, count]) => ({ limit: Number(k), count: Number(count) }))
    .filter((item) => Number.isFinite(item.limit) && item.limit >= 10 && item.count > 0);

  if (entries.length === 0) {
    return record.userVote && record.userVote >= 10 ? record.userVote : null;
  }

  entries.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    // En empate exacto, priorizar el voto actual del usuario si coincide, o el límite menor (más prudente)
    if (record.userVote === a.limit) return -1;
    if (record.userVote === b.limit) return 1;
    return a.limit - b.limit;
  });

  return entries[0].limit;
}

export function findCommunitySpeedLimitForSegment(
  coords: Coordinates,
  wayId?: number,
  roadName?: string
): { limitKmh: number; record: CommunitySpeedRecord } | null {
  const records = loadCommunityRecords();
  const normRoad = normalizeRoadKey(roadName || '');

  // 1. Coincidencia exacta de clave de tramo
  const exactKey = buildSegmentKey(coords.lat, coords.lng, wayId, roadName);
  const exactRec = records[exactKey];
  if (exactRec) {
    const maj = getMajorityLimitFromRecord(exactRec);
    if (maj !== null) return { limitKmh: maj, record: exactRec };
  }

  // 2. Coincidencia cercana (~180m) sobre la misma vía (por wayId o nombre normalizado)
  let bestRec: CommunitySpeedRecord | null = null;
  let bestDist = Infinity;

  for (const rec of Object.values(records)) {
    const dist = getDistanceMeters(coords.lat, coords.lng, rec.lat, rec.lng);
    if (dist > 180) continue;

    const sameWay = wayId !== undefined && rec.wayId !== undefined && wayId === rec.wayId;
    const sameRoadName = normRoad && normalizeRoadKey(rec.roadName) === normRoad;
    const veryCloseSameSpot = dist <= 55 && !wayId && !normRoad;

    if (sameWay || sameRoadName || veryCloseSameSpot) {
      if (dist < bestDist) {
        bestDist = dist;
        bestRec = rec;
      }
    }
  }

  if (bestRec) {
    const maj = getMajorityLimitFromRecord(bestRec);
    if (maj !== null) return { limitKmh: maj, record: bestRec };
  }

  return null;
}

export function submitCommunitySpeedLimitCorrection(params: {
  coords: Coordinates;
  limitKmh: number;
  wayId?: number;
  roadName?: string;
}): number | null {
  const { coords, limitKmh, wayId, roadName } = params;
  if (!Number.isFinite(limitKmh) || limitKmh < 10 || limitKmh > 130) return null;

  const records = loadCommunityRecords();
  const existingMatch = findCommunitySpeedLimitForSegment(coords, wayId, roadName);
  const targetKey = existingMatch?.record.segmentKey || buildSegmentKey(coords.lat, coords.lng, wayId, roadName);

  const current: CommunitySpeedRecord = records[targetKey] || {
    segmentKey: targetKey,
    wayId,
    roadName: (roadName || '').trim(),
    lat: coords.lat,
    lng: coords.lng,
    votes: {},
    updatedAt: Date.now(),
  };

  const nextVotes: Record<string, number> = { ...(current.votes || {}) };

  // Si el usuario ya había votado antes en este tramo, reemplazamos su voto anterior
  if (current.userVote !== undefined && nextVotes[String(current.userVote)]) {
    const decremented = nextVotes[String(current.userVote)] - 1;
    if (decremented > 0) {
      nextVotes[String(current.userVote)] = decremented;
    } else {
      delete nextVotes[String(current.userVote)];
    }
  }

  const limitStr = String(limitKmh);
  nextVotes[limitStr] = (nextVotes[limitStr] || 0) + 1;

  const updated: CommunitySpeedRecord = {
    ...current,
    wayId: wayId ?? current.wayId,
    roadName: (roadName || current.roadName || '').trim(),
    votes: nextVotes,
    userVote: limitKmh,
    updatedAt: Date.now(),
  };

  records[targetKey] = updated;
  saveCommunityRecords(records);
  notifyCommunityListeners();

  return getMajorityLimitFromRecord(updated);
}

function findMatchingCacheEntry(coords: Coordinates): OsmAreaQueryCacheEntry | null {
  const now = Date.now();
  for (let i = areaQueryCache.length - 1; i >= 0; i--) {
    const entry = areaQueryCache[i];
    if (now - entry.timestamp > AREA_CACHE_TTL_MS) {
      areaQueryCache.splice(i, 1);
      continue;
    }
    const dist = getDistanceMeters(coords.lat, coords.lng, entry.centerLat, entry.centerLng);
    if (dist <= entry.radiusMeters) {
      return entry;
    }
  }
  return null;
}

function findClosestWayInEntries(
  coords: Coordinates,
  entries: OsmAreaQueryCacheEntry[]
): { way: OsmWaySegmentCacheItem; distanceMeters: number } | null {
  let bestWay: OsmWaySegmentCacheItem | null = null;
  let bestDist = Infinity;
  const seenWayIds = new Set<number>();

  for (let eIdx = entries.length - 1; eIdx >= 0; eIdx--) {
    const entry = entries[eIdx];
    for (const way of entry.ways) {
      if (seenWayIds.has(way.wayId)) continue;
      seenWayIds.add(way.wayId);
      if (!way.coords || way.coords.length < 2) continue;

      for (let i = 0; i < way.coords.length - 1; i++) {
        const a = way.coords[i];
        const b = way.coords[i + 1];
        const proj = projectPointOnSegment(coords.lat, coords.lng, a[0], a[1], b[0], b[1]);
        if (proj.distanceMeters < bestDist) {
          bestDist = proj.distanceMeters;
          bestWay = way;
        }
      }
    }
  }

  if (bestWay && bestDist <= 38) {
    return { way: bestWay, distanceMeters: bestDist };
  }
  return null;
}

function isNearSchoolOrHospitalInData(
  coords: Coordinates,
  entry: OsmAreaQueryCacheEntry | null,
  cachedPois: MapPOI[],
  matchedWayName?: string
): { nearby: boolean; fromOsmTag: boolean } {
  // 1. Puntos de colegios/hospitales obtenidos directamente de Overpass alrededor de la posición
  if (entry) {
    for (const pt of entry.schoolOrHospitalPoints) {
      if (getDistanceMeters(coords.lat, coords.lng, pt.lat, pt.lng) <= QUERY_RADIUS_ZONE_METERS) {
        return { nearby: true, fromOsmTag: true };
      }
    }
  }

  // 2. POIs cacheados del mapa (school / hospital)
  for (const poi of cachedPois) {
    if (poi.category !== 'school' && poi.category !== 'hospital') continue;
    if (getDistanceMeters(coords.lat, coords.lng, poi.lat, poi.lng) <= QUERY_RADIUS_ZONE_METERS) {
      return { nearby: true, fromOsmTag: true };
    }
  }

  // 3. Nombre de la vía explícitamente escolar/hospitalaria
  const lower = (matchedWayName || '').toLowerCase();
  if (
    lower.includes('colegio') ||
    lower.includes('escuela') ||
    lower.includes('hospital') ||
    lower.includes('clinica') ||
    lower.includes('clínica')
  ) {
    return { nearby: true, fromOsmTag: false };
  }

  return { nearby: false, fromOsmTag: false };
}

function buildRoadSpeedOverpassQuery(lat: number, lng: number): string {
  const fLat = lat.toFixed(6);
  const fLng = lng.toFixed(6);
  return `[out:json][timeout:8];
(
  way["highway"~"^(motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link|residential|unclassified|living_street|service|road)$"](around:${QUERY_RADIUS_ROAD_METERS},${fLat},${fLng});
  nwr["amenity"~"^(school|hospital|clinic)$"](around:${QUERY_RADIUS_ZONE_METERS},${fLat},${fLng});
);
out geom tags;`;
}

async function postSpeedOverpass(
  endpoint: string,
  query: string,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<any[] | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) {
      clearTimeout(timeout);
      return null;
    }
    signal.addEventListener('abort', onAbort, { once: true });
  }

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      },
      body: `data=${encodeURIComponent(query)}`,
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data?.elements)) return null;
    return data.elements;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
    if (signal) {
      signal.removeEventListener('abort', onAbort);
    }
  }
}

async function fetchRoadAndZonesFromOverpass(
  coords: Coordinates,
  signal?: AbortSignal
): Promise<OsmAreaQueryCacheEntry | null> {
  const query = buildRoadSpeedOverpassQuery(coords.lat, coords.lng);

  let elements = await postSpeedOverpass('/api/overpass', query, 8000, signal);
  if (!elements) {
    for (const endpoint of OVERPASS_FALLBACK_ENDPOINTS) {
      if (signal?.aborted) return null;
      elements = await postSpeedOverpass(endpoint, query, 6500, signal);
      if (elements) break;
    }
  }

  if (!elements) return null;

  const ways: OsmWaySegmentCacheItem[] = [];
  const schoolOrHospitalPoints: Coordinates[] = [];

  for (const el of elements) {
    if (el.type === 'way' && el.tags?.highway && Array.isArray(el.geometry) && el.geometry.length >= 2) {
      const geomCoords: [number, number][] = el.geometry
        .filter((pt: any) => Number.isFinite(pt?.lat) && Number.isFinite(pt?.lon))
        .map((pt: any) => [pt.lat, pt.lon]);

      if (geomCoords.length >= 2) {
        ways.push({
          wayId: Number(el.id),
          name: (el.tags.name || el.tags.ref || '').trim(),
          highway: String(el.tags.highway),
          rawMaxSpeed: el.tags.maxspeed ? String(el.tags.maxspeed) : undefined,
          parsedMaxSpeed: parseOsmMaxSpeed(el.tags.maxspeed),
          coords: geomCoords,
        });
      }
    }

    const amenity = el.tags?.amenity;
    if (amenity === 'school' || amenity === 'hospital' || amenity === 'clinic') {
      const ptLat = el.lat ?? el.center?.lat ?? el.geometry?.[0]?.lat;
      const ptLng = el.lon ?? el.center?.lon ?? el.geometry?.[0]?.lon;
      if (Number.isFinite(ptLat) && Number.isFinite(ptLng)) {
        schoolOrHospitalPoints.push({ lat: Number(ptLat), lng: Number(ptLng) });
      }
    }
  }

  const entry: OsmAreaQueryCacheEntry = {
    centerLat: coords.lat,
    centerLng: coords.lng,
    radiusMeters: AREA_COVER_RADIUS_METERS,
    timestamp: Date.now(),
    ways,
    schoolOrHospitalPoints,
  };

  areaQueryCache.push(entry);
  if (areaQueryCache.length > MAX_AREA_CACHE_ENTRIES) {
    areaQueryCache.shift();
  }

  return entry;
}

export function resolveSpeedLimitForPosition(
  coords: Coordinates,
  cachedPois: MapPOI[],
  hintRoadName?: string
): ResolvedSpeedLimit {
  const areaEntry = findMatchingCacheEntry(coords);
  const closestWayMatch = findClosestWayInEntries(coords, areaQueryCache);
  const way = closestWayMatch?.way;

  const resolvedRoadName = (way?.name || hintRoadName || '').trim();
  const osmWayId = way?.wayId;
  const highwayType = way?.highway;

  // 1. Prioridad máxima: corrección elegida por mayoría de la comunidad para este tramo
  const community = findCommunitySpeedLimitForSegment(coords, osmWayId, resolvedRoadName);
  const zoneInfo = isNearSchoolOrHospitalInData(coords, areaEntry, cachedPois, resolvedRoadName);

  if (community) {
    return {
      limitKmh: community.limitKmh,
      source: 'Señal comunitaria',
      roadName: resolvedRoadName || community.record.roadName || 'Vía corregida',
      highwayType,
      categoryLabel: getHighwayCategoryLabel(highwayType, zoneInfo.nearby),
      osmWayId: osmWayId ?? community.record.wayId,
      segmentKey: community.record.segmentKey,
      isSchoolOrHospitalZone: zoneInfo.nearby,
    };
  }

  // 2. Zonas escolares y hospitales cercanas a la posición: 30 km/h (salvo maxspeed aún más restrictivo en OSM)
  if (zoneInfo.nearby) {
    const osmLimit = way?.parsedMaxSpeed ?? null;
    const zoneLimit = osmLimit !== null && osmLimit < 30 ? osmLimit : 30;
    return {
      limitKmh: zoneLimit,
      source: zoneInfo.fromOsmTag || osmLimit !== null ? 'Mapa' : 'Estimado por tipo de vía',
      roadName: resolvedRoadName || 'Zona restringida',
      highwayType,
      categoryLabel: 'Zona Escolar / Hospitalaria',
      osmWayId,
      segmentKey: buildSegmentKey(coords.lat, coords.lng, osmWayId, resolvedRoadName),
      isSchoolOrHospitalZone: true,
    };
  }

  // 3. Prioridad 2: etiqueta "maxspeed" válida de OpenStreetMap
  if (way && way.parsedMaxSpeed !== null) {
    return {
      limitKmh: way.parsedMaxSpeed,
      source: 'Mapa',
      roadName: resolvedRoadName || getHighwayCategoryLabel(highwayType),
      highwayType,
      categoryLabel: getHighwayCategoryLabel(highwayType),
      osmWayId,
      segmentKey: buildSegmentKey(coords.lat, coords.lng, osmWayId, resolvedRoadName),
      isSchoolOrHospitalZone: false,
    };
  }

  // 4. Prioridad 3: límite prudente según el tipo de vía (highway) en OpenStreetMap
  if (way) {
    const byType = getPrudentLimitByHighwayType(way.highway);
    if (byType !== null) {
      return {
        limitKmh: byType,
        source: 'Estimado por tipo de vía',
        roadName: resolvedRoadName || getHighwayCategoryLabel(way.highway),
        highwayType: way.highway,
        categoryLabel: getHighwayCategoryLabel(way.highway),
        osmWayId,
        segmentKey: buildSegmentKey(coords.lat, coords.lng, osmWayId, resolvedRoadName),
        isSchoolOrHospitalZone: false,
      };
    }
  }

  // 5. Si no se conoce la vía, no mostrar ningún número en lugar de inventar uno
  return {
    limitKmh: null,
    source: null,
    roadName: resolvedRoadName,
    segmentKey: resolvedRoadName
      ? buildSegmentKey(coords.lat, coords.lng, undefined, resolvedRoadName)
      : undefined,
    isSchoolOrHospitalZone: false,
  };
}

/**
 * Hook que mantiene actualizado el límite de velocidad del tramo actual:
 * - Usa caché por tramo/área antes de consultar Overpass
 * - Limita consultas Overpass a máximo 1 cada 5 segundos
 * - Reintenta en segundo plano si la consulta falla
 */
export function useSpeedLimitResolver(
  userCoords: Coordinates,
  enabled: boolean,
  cachedPois: MapPOI[],
  hintRoadName?: string
) {
  const [tick, setTick] = useState(0);
  const lastFetchTimeRef = useRef<number>(0);
  const isFetchingRef = useRef<boolean>(false);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const throttleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const coordsRef = useRef(userCoords);
  coordsRef.current = userCoords;

  useEffect(() => {
    const onCommunityChange = () => setTick((t) => t + 1);
    communityListeners.add(onCommunityChange);
    return () => {
      communityListeners.delete(onCommunityChange);
    };
  }, []);

  const triggerOverpassCheck = useCallback(() => {
    if (!enabled) return;
    const coords = coordsRef.current;

    // Si ya tenemos caché reciente cubriendo este tramo/punto, no consultar Overpass
    const cachedArea = findMatchingCacheEntry(coords);
    if (cachedArea) {
      return;
    }

    const now = Date.now();
    const elapsed = now - lastFetchTimeRef.current;

    // No hacer más de una consulta cada 5 segundos
    if (elapsed < MIN_OVERPASS_INTERVAL_MS) {
      if (!throttleTimerRef.current) {
        throttleTimerRef.current = setTimeout(() => {
          throttleTimerRef.current = null;
          triggerOverpassCheck();
        }, MIN_OVERPASS_INTERVAL_MS - elapsed + 50);
      }
      return;
    }

    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    lastFetchTimeRef.current = now;

    fetchRoadAndZonesFromOverpass(coords)
      .then((res) => {
        if (res) {
          setTick((t) => t + 1);
        } else {
          // Si falla la consulta, reintentar en segundo plano después de 5s
          if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
          retryTimerRef.current = setTimeout(() => {
            retryTimerRef.current = null;
            triggerOverpassCheck();
          }, MIN_OVERPASS_INTERVAL_MS);
        }
      })
      .finally(() => {
        isFetchingRef.current = false;
      });
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      if (throttleTimerRef.current) {
        clearTimeout(throttleTimerRef.current);
        throttleTimerRef.current = null;
      }
      return;
    }
    triggerOverpassCheck();
  }, [enabled, userCoords.lat, userCoords.lng, triggerOverpassCheck]);

  useEffect(() => {
    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      if (throttleTimerRef.current) clearTimeout(throttleTimerRef.current);
    };
  }, []);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _dep = tick;
  const resolved = enabled
    ? resolveSpeedLimitForPosition(userCoords, cachedPois, hintRoadName)
    : null;

  const submitCorrection = useCallback(
    (limitKmh: number) => {
      const currentResolved = resolveSpeedLimitForPosition(
        coordsRef.current,
        cachedPois,
        hintRoadName
      );
      submitCommunitySpeedLimitCorrection({
        coords: coordsRef.current,
        limitKmh,
        wayId: currentResolved.osmWayId,
        roadName: currentResolved.roadName || hintRoadName,
      });
    },
    [cachedPois, hintRoadName]
  );

  return {
    resolvedSpeedLimit: resolved,
    submitSpeedLimitCorrection: submitCorrection,
  };
}
