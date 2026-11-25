import { Coordinates, TrafficAlert } from '../types/navigation';
import { getBearing, getDistanceMeters, projectPointOnSegment } from './routeMatching';

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

const DRIVABLE_HIGHWAY_REGEX =
  '^(motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link|unclassified|residential|living_street|service)$';

export interface OsmRoadWay {
  id: number;
  tags: Record<string, string>;
  geometry: Array<{ lat: number; lon: number }>;
}

export interface CarriagewaySnapResult {
  matched: boolean;
  coords: Coordinates;
  roadId?: string;
  carriagewayId?: string;
  roadName?: string;
  isOneway?: boolean;
  lanes?: number;
  isUndividedOrSingleLane?: boolean;
  headingDeg?: number;
  distanceMeters?: number;
}

export interface DualCarriagewaySnapResult {
  primary: CarriagewaySnapResult;
  opposite: CarriagewaySnapResult | null;
}

interface OsmWayCacheEntry {
  timestamp: number;
  ways: OsmRoadWay[];
}

const OSM_WAYS_CACHE = new Map<string, OsmWayCacheEntry>();
const OSM_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

/**
 * Normaliza un rumbo en grados al rango [0, 360).
 */
export function normalizeHeadingDeg(deg: number): number {
  const n = deg % 360;
  return n < 0 ? n + 360 : n;
}

/**
 * Diferencia angular mínima en grados [0, 180].
 */
export function shortestAngularDiffDeg(a: number, b: number): number {
  const diff = Math.abs((((a - b + 540) % 360) - 180));
  return diff;
}

/**
 * Rumbo opuesto (+180° normalizado).
 */
export function getOppositeHeading(headingDeg: number): number {
  return normalizeHeadingDeg(headingDeg + 180);
}

/**
 * Desplaza una coordenada perpendicularmente hacia la derecha del rumbo indicado
 * (positivo = derecha, negativo = izquierda).
 */
export function offsetCoordPerpendicular(
  lat: number,
  lng: number,
  headingDeg: number,
  rightMeters: number
): Coordinates {
  if (!Number.isFinite(rightMeters) || Math.abs(rightMeters) < 0.05) {
    return { lat, lng };
  }
  const perpRad = (normalizeHeadingDeg(headingDeg + 90) * Math.PI) / 180;
  const northMeters = Math.cos(perpRad) * rightMeters;
  const eastMeters = Math.sin(perpRad) * rightMeters;
  const metersPerDegLat = 110540;
  const metersPerDegLng = Math.max(1e-6, 111320 * Math.cos((lat * Math.PI) / 180));

  return {
    lat: lat + northMeters / metersPerDegLat,
    lng: lng + eastMeters / metersPerDegLng,
  };
}

/**
 * Convierte un rumbo en grados (0-360) a etiqueta legible en español:
 * "Sentido norte", "Sentido sur", "Sentido noreste", etc., o "Ambos sentidos".
 */
export function formatDirectionLabelSpanish(
  headingDeg?: number | null,
  bothDirections?: boolean
): string {
  if (bothDirections) {
    return 'Ambos sentidos';
  }
  // Los reportes existentes sin sentido guardado se tratan como "Ambos sentidos"
  if (headingDeg === null || headingDeg === undefined || !Number.isFinite(headingDeg)) {
    return 'Ambos sentidos';
  }
  const h = normalizeHeadingDeg(headingDeg);
  if (h >= 337.5 || h < 22.5) return 'Sentido norte';
  if (h < 67.5) return 'Sentido noreste';
  if (h < 112.5) return 'Sentido este';
  if (h < 157.5) return 'Sentido sureste';
  if (h < 202.5) return 'Sentido sur';
  if (h < 247.5) return 'Sentido suroeste';
  if (h < 292.5) return 'Sentido oeste';
  return 'Sentido noroeste';
}

/**
 * Evalúa si un reporte aplica al sentido de circulación actual o de un tramo de ruta.
 * Tolerancia por defecto: 60°.
 * - Si `alert.bothDirections === true`, siempre coincide.
 * - Si el reporte no tiene rumbo guardado (reportes heredados), coincide por compatibilidad.
 */
export function isAlertMatchingRouteHeading(
  alert: TrafficAlert,
  routeOrUserHeadingDeg: number | null | undefined,
  toleranceDeg: number = 60
): boolean {
  if (alert.bothDirections) return true;
  if (alert.heading === null || alert.heading === undefined || !Number.isFinite(alert.heading)) {
    return true;
  }
  if (
    routeOrUserHeadingDeg === null ||
    routeOrUserHeadingDeg === undefined ||
    !Number.isFinite(routeOrUserHeadingDeg)
  ) {
    return true;
  }
  return shortestAngularDiffDeg(alert.heading, routeOrUserHeadingDeg) <= toleranceDeg;
}

/**
 * Devuelve todos los puntos de visualización/chequeo del reporte (1 punto en un sentido,
 * 2 puntos cuando `bothDirections === true` y existe `oppositeCoords`).
 */
export function getAlertTargetCoords(alert: TrafficAlert): Coordinates[] {
  if (alert.bothDirections && alert.oppositeCoords) {
    return [alert.coords, alert.oppositeCoords];
  }
  return [alert.coords];
}

function getCacheKey(lat: number, lng: number): string {
  // Celda de ~20m
  return `${Math.round(lat * 5000)}_${Math.round(lng * 5000)}`;
}

async function fetchNearbyOsmWays(
  lat: number,
  lng: number,
  radiusMeters: number = 58
): Promise<OsmRoadWay[]> {
  const key = getCacheKey(lat, lng);
  const now = Date.now();
  const cached = OSM_WAYS_CACHE.get(key);
  if (cached && now - cached.timestamp < OSM_CACHE_TTL_MS) {
    return cached.ways;
  }

  const query = `[out:json][timeout:6];way(around:${Math.round(radiusMeters)},${lat.toFixed(6)},${lng.toFixed(6)})["highway"~"${DRIVABLE_HIGHWAY_REGEX}"];out body geom;`;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3200);
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
        body: `data=${encodeURIComponent(query)}`,
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) continue;
      const data = await res.json();
      const elements = Array.isArray(data?.elements) ? data.elements : [];
      const ways: OsmRoadWay[] = elements
        .filter((el: any) => el?.type === 'way' && Array.isArray(el?.geometry) && el.geometry.length >= 2)
        .map((el: any) => ({
          id: Number(el.id),
          tags: el.tags || {},
          geometry: el.geometry,
        }));

      OSM_WAYS_CACHE.set(key, { timestamp: now, ways });
      if (OSM_WAYS_CACHE.size > 120) {
        const oldestKey = OSM_WAYS_CACHE.keys().next().value;
        if (oldestKey) OSM_WAYS_CACHE.delete(oldestKey);
      }
      return ways;
    } catch {
      clearTimeout(timer);
    }
  }

  return [];
}

function getWayCirculationMode(tags: Record<string, string>): 'forward' | 'reverse' | 'both' {
  const oneway = String(tags.oneway || '').toLowerCase();
  const highway = String(tags.highway || '').toLowerCase();
  const junction = String(tags.junction || '').toLowerCase();

  if (oneway === '-1' || oneway === 'reverse') {
    return 'reverse';
  }
  if (
    oneway === 'yes' ||
    oneway === '1' ||
    oneway === 'true' ||
    highway === 'motorway' ||
    highway === 'motorway_link' ||
    junction === 'roundabout' ||
    junction === 'circular'
  ) {
    return 'forward';
  }
  return 'both';
}

interface SegmentCandidate {
  way: OsmRoadWay;
  projLat: number;
  projLng: number;
  distanceMeters: number;
  matchedBearing: number;
  angleDiff: number;
  isOneway: boolean;
  dirSuffix: 'fwd' | 'rev';
  score: number;
}

function findBestMatchingOsmWay(
  lat: number,
  lng: number,
  targetHeadingDeg: number,
  ways: OsmRoadWay[],
  options: {
    maxAngleDiffDeg?: number;
    maxDistanceMeters?: number;
    excludeWayId?: number;
    preferDifferentFromPoint?: Coordinates;
  } = {}
): SegmentCandidate | null {
  const maxAngle = options.maxAngleDiffDeg ?? 45;
  const maxDist = options.maxDistanceMeters ?? 40;
  let best: SegmentCandidate | null = null;

  for (const way of ways) {
    if (options.excludeWayId !== undefined && way.id === options.excludeWayId) {
      continue;
    }
    const mode = getWayCirculationMode(way.tags);
    const isOneway = mode !== 'both';
    const geom = way.geometry;

    for (let i = 0; i < geom.length - 1; i++) {
      const a = geom[i];
      const b = geom[i + 1];
      const proj = projectPointOnSegment(lat, lng, a.lat, a.lon, b.lat, b.lon);
      if (proj.distanceMeters > maxDist) continue;

      const fwdBearing = getBearing(a.lat, a.lon, b.lat, b.lon);
      const revBearing = getOppositeHeading(fwdBearing);

      const allowed: Array<{ bearing: number; dirSuffix: 'fwd' | 'rev' }> =
        mode === 'forward'
          ? [{ bearing: fwdBearing, dirSuffix: 'fwd' }]
          : mode === 'reverse'
          ? [{ bearing: revBearing, dirSuffix: 'rev' }]
          : [
              { bearing: fwdBearing, dirSuffix: 'fwd' },
              { bearing: revBearing, dirSuffix: 'rev' },
            ];

      for (const dir of allowed) {
        const angleDiff = shortestAngularDiffDeg(targetHeadingDeg, dir.bearing);
        if (angleDiff > maxAngle) continue;

        // Si buscamos la calzada contraria, priorizar una vía físicamente separada del punto original
        let sepBonus = 0;
        if (options.preferDifferentFromPoint) {
          const sep = getDistanceMeters(
            options.preferDifferentFromPoint.lat,
            options.preferDifferentFromPoint.lng,
            proj.point[0],
            proj.point[1]
          );
          if (sep < 3.0) {
            sepBonus = 18;
          }
        }

        // Leve prioridad a vías de un sentido con rumbo exacto (calzadas separadas en avenidas)
        const onewayBonus = isOneway ? -1.5 : 0;
        const score = proj.distanceMeters + angleDiff * 0.22 + onewayBonus + sepBonus;

        if (!best || score < best.score) {
          best = {
            way,
            projLat: proj.point[0],
            projLng: proj.point[1],
            distanceMeters: proj.distanceMeters,
            matchedBearing: dir.bearing,
            angleDiff,
            isOneway,
            dirSuffix: dir.dirSuffix,
            score,
          };
        }
      }
    }
  }

  return best;
}

/**
 * Ajusta la coordenada de un reporte al eje de la calzada correcta en OpenStreetMap
 * según el sentido de circulación (tolerancia de 45°), y calcula además el punto
 * correspondiente a la calzada contraria para soportar "Ambos sentidos" o
 * "Policía en el otro carril".
 *
 * Si no se encuentra una calzada clara, devuelve `matched: false` con la coordenada
 * original sin modificar.
 */
export async function snapReportToOsmCarriageway(
  lat: number,
  lng: number,
  targetHeadingDeg: number | null | undefined,
  options: {
    searchRadiusMeters?: number;
    maxAngleDiffDeg?: number;
    maxPrimaryDistanceMeters?: number;
    maxOppositeDistanceMeters?: number;
    preferDifferentFromPoint?: Coordinates;
  } = {}
): Promise<DualCarriagewaySnapResult> {
  const fallbackPrimary: CarriagewaySnapResult = {
    matched: false,
    coords: { lat, lng },
  };

  if (
    targetHeadingDeg === null ||
    targetHeadingDeg === undefined ||
    !Number.isFinite(targetHeadingDeg)
  ) {
    return { primary: fallbackPrimary, opposite: null };
  }

  const normalizedHeading = normalizeHeadingDeg(targetHeadingDeg);
  const oppHeading = getOppositeHeading(normalizedHeading);
  const searchRadius = options.searchRadiusMeters ?? 58;
  const maxAngle = options.maxAngleDiffDeg ?? 45;
  const maxPrimaryDist = options.maxPrimaryDistanceMeters ?? 40;
  const maxOppDist = options.maxOppositeDistanceMeters ?? 56;

  const ways = await fetchNearbyOsmWays(lat, lng, searchRadius);
  if (ways.length === 0) {
    return { primary: fallbackPrimary, opposite: null };
  }

  const bestPrimary = findBestMatchingOsmWay(lat, lng, normalizedHeading, ways, {
    maxAngleDiffDeg: maxAngle,
    maxDistanceMeters: maxPrimaryDist,
    preferDifferentFromPoint: options.preferDifferentFromPoint,
  });

  if (!bestPrimary) {
    return { primary: fallbackPrimary, opposite: null };
  }

  const rawLanes = Number(bestPrimary.way.tags.lanes);
  const lanes = Number.isFinite(rawLanes) && rawLanes > 0 ? rawLanes : undefined;
  const isSingleLane = lanes === 1;
  const isTwoWayUndivided = !bestPrimary.isOneway;
  const isUndividedOrSingleLane = isTwoWayUndivided || isSingleLane;

  // En calzadas separadas (oneway) o en vías de un solo carril / doble sentido sin separador,
  // ubicar directamente sobre el eje de la calzada encontrada.
  const primaryCoords: Coordinates = {
    lat: bestPrimary.projLat,
    lng: bestPrimary.projLng,
  };

  const primaryResult: CarriagewaySnapResult = {
    matched: true,
    coords: primaryCoords,
    roadId: `osm:way:${bestPrimary.way.id}`,
    carriagewayId: `osm:way:${bestPrimary.way.id}:${bestPrimary.dirSuffix}`,
    roadName: bestPrimary.way.tags.name || undefined,
    isOneway: bestPrimary.isOneway,
    lanes,
    isUndividedOrSingleLane,
    headingDeg: bestPrimary.matchedBearing,
    distanceMeters: bestPrimary.distanceMeters,
  };

  // Buscar calzada contraria real (otra vía OSM en sentido opuesto, p. ej. tras berma central)
  let oppositeResult: CarriagewaySnapResult | null = null;
  const distinctOpp = findBestMatchingOsmWay(
    primaryCoords.lat,
    primaryCoords.lng,
    oppHeading,
    ways,
    {
      maxAngleDiffDeg: maxAngle,
      maxDistanceMeters: maxOppDist,
      excludeWayId: bestPrimary.way.id,
      preferDifferentFromPoint: primaryCoords,
    }
  );

  if (distinctOpp) {
    const oppLanesRaw = Number(distinctOpp.way.tags.lanes);
    const oppLanes = Number.isFinite(oppLanesRaw) && oppLanesRaw > 0 ? oppLanesRaw : undefined;
    const oppCoords: Coordinates = {
      lat: distinctOpp.projLat,
      lng: distinctOpp.projLng,
    };
    oppositeResult = {
      matched: true,
      coords: oppCoords,
      roadId: `osm:way:${distinctOpp.way.id}`,
      carriagewayId: `osm:way:${distinctOpp.way.id}:${distinctOpp.dirSuffix}`,
      roadName: distinctOpp.way.tags.name || undefined,
      isOneway: distinctOpp.isOneway,
      lanes: oppLanes,
      isUndividedOrSingleLane: !distinctOpp.isOneway || oppLanes === 1,
      headingDeg: distinctOpp.matchedBearing,
      distanceMeters: distinctOpp.distanceMeters,
    };
  }

  return {
    primary: primaryResult,
    opposite: oppositeResult,
  };
}
