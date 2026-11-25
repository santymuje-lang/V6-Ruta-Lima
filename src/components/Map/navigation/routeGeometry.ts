import * as maplibregl from 'maplibre-gl';
import { Coordinates, GPSLocation, RouteData, RouteStep } from '../../../types/navigation';
import {
  getBearing,
  getDistanceMeters,
  matchUserToRoute,
  projectPointOnSegment,
} from '../../../services/routeMatching';
import {
  CarriagewaySnapResult,
  getOppositeHeading,
  shortestAngularDiffDeg,
} from '../../../services/reportDirection';

export { getBearing, getDistanceMeters, matchUserToRoute, projectPointOnSegment };

// Constantes de ajuste magnético al eje del carril (ruta activa y modo libre)
export const ACTIVE_ROUTE_SNAP_MAX_METERS = 25;
export const FREE_DRIVE_ROAD_SNAP_MAX_METERS = 22;
export const FREE_DRIVE_HEADING_TOLERANCE_DEG = 45;
export const FREE_DRIVE_MIN_MOVING_SPEED_MPS = 1.5;

/**
 * Con ruta activa y GPS dentro de 25m de la línea de ruta, proyecta el chevron al 100%
 * sobre el segmento exacto de la ruta (sin promediar con la coordenada GPS cruda).
 */
export function snapToActiveRoute(
  lat: number,
  lng: number,
  heading: number | null | undefined,
  coordinates: [number, number][],
  maxDistMeters: number = ACTIVE_ROUTE_SNAP_MAX_METERS
) {
  return matchUserToRoute(lat, lng, heading, coordinates, maxDistMeters);
}

// Inclinación única de cámara en navegación activa (55° idénticos en Día, Noche y Satelital)
export const NAV_PITCH_DEGREES = 55;

// Constantes de ajuste fino para la pantalla principal (sin ruta activa)
export const ZOOM_PANTALLA_PRINCIPAL = 17.5;
export const INCLINACION_PANTALLA_PRINCIPAL = 60;
export const POSICION_FLECHA_ABAJO = 0.25;

// Zoom dinámico según velocidad (estilo Waze): detenido = cerca, avenida rápida = lejos
export const SPEED_ZOOM_STOPS: Array<[number, number]> = [
  [0, 18.0],
  [20, 17.4],
  [50, 16.3],
  [80, 15.2],
  [100, 15.0],
];

// Zoom de aproximación a maniobra: desde 200 m se acerca suavemente; a ≤150 m queda en 18.0
export const MANEUVER_ZOOM = 18.0;
export const MANEUVER_ZOOM_START_M = 200;
export const MANEUVER_ZOOM_FULL_M = 150;

export function speedToZoom(speedKmh: number): number {
  const v = Math.max(0, Number.isFinite(speedKmh) ? speedKmh : 0);
  if (v >= SPEED_ZOOM_STOPS[SPEED_ZOOM_STOPS.length - 1][0]) {
    return SPEED_ZOOM_STOPS[SPEED_ZOOM_STOPS.length - 1][1];
  }
  for (let i = 1; i < SPEED_ZOOM_STOPS.length; i++) {
    const [v1, z1] = SPEED_ZOOM_STOPS[i];
    if (v <= v1) {
      const [v0, z0] = SPEED_ZOOM_STOPS[i - 1];
      return z0 + ((v - v0) / (v1 - v0)) * (z1 - z0);
    }
  }
  return SPEED_ZOOM_STOPS[0][1];
}

export function normalizeHeadingDeg(deg: number): number {
  if (!Number.isFinite(deg)) return 0;
  return ((deg % 360) + 360) % 360;
}

export function shortestAngleDiffDeg(fromDeg: number, toDeg: number): number {
  return ((toDeg - fromDeg + 540) % 360) - 180;
}

export function offsetCoordByMeters(
  lat: number,
  lng: number,
  distMeters: number,
  bearingDeg: number
): [number, number] {
  if (!Number.isFinite(distMeters) || distMeters <= 0) return [lat, lng];
  const rad = (bearingDeg * Math.PI) / 180;
  const latRad = (lat * Math.PI) / 180;
  const metersPerDegLng = Math.max(1e-5, 111320 * Math.cos(latRad));
  const dLat = (distMeters * Math.cos(rad)) / 110540;
  const dLng = (distMeters * Math.sin(rad)) / metersPerDegLng;
  return [lat + dLat, lng + dLng];
}

export function interpolateLatLng(
  a: [number, number],
  b: [number, number],
  t: number
): [number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

export function coordsToLngLat(coords: [number, number][]): [number, number][] {
  return coords.map(([lat, lng]) => [lng, lat]);
}

export function lerpZoomStops(zoom: number, stops: Array<[number, number]>): number {
  if (zoom <= stops[0][0]) return stops[0][1];
  for (let i = 0; i < stops.length - 1; i++) {
    const [z0, v0] = stops[i];
    const [z1, v1] = stops[i + 1];
    if (zoom <= z1) {
      const t = (zoom - z0) / Math.max(1e-6, z1 - z0);
      return v0 + (v1 - v0) * t;
    }
  }
  return stops[stops.length - 1][1];
}

export function isPoiNearActiveRoute(
  poiLat: number,
  poiLng: number,
  routeCoords: [number, number][],
  maxDistMeters = 150
): boolean {
  if (!routeCoords || routeCoords.length < 2) return true;
  // Filtro rápido por caja aproximada (~0.002° ≈ 220m) antes de proyectar por segmento
  const latMargin = 0.0022;
  const lngMargin = 0.0022;
  for (let i = 0; i < routeCoords.length - 1; i++) {
    const a = routeCoords[i];
    const b = routeCoords[i + 1];
    const minLat = Math.min(a[0], b[0]) - latMargin;
    const maxLat = Math.max(a[0], b[0]) + latMargin;
    if (poiLat < minLat || poiLat > maxLat) continue;
    const minLng = Math.min(a[1], b[1]) - lngMargin;
    const maxLng = Math.max(a[1], b[1]) + lngMargin;
    if (poiLng < minLng || poiLng > maxLng) continue;

    const proj = projectPointOnSegment(poiLat, poiLng, a[0], a[1], b[0], b[1]);
    if (proj.distanceMeters <= maxDistMeters) {
      return true;
    }
  }
  return false;
}

export function projectPointOntoRoutePolyline(
  lat: number,
  lng: number,
  coords: [number, number][],
  hintSegIdx = 0
): {
  point: [number, number];
  segmentIndex: number;
  segmentBearing: number;
  distanceMeters: number;
} {
  const lastSegIdx = Math.max(0, coords.length - 2);
  const clampedHint = Math.max(0, Math.min(lastSegIdx, hintSegIdx));
  const searchStart = Math.max(0, clampedHint - 8);
  const searchEnd = Math.min(lastSegIdx, clampedHint + 28);

  let minDistance = Infinity;
  let bestSegment = clampedHint;
  let bestPoint: [number, number] = [lat, lng];

  for (let i = searchStart; i <= searchEnd; i++) {
    const a = coords[i];
    const b = coords[i + 1];
    const proj = projectPointOnSegment(lat, lng, a[0], a[1], b[0], b[1]);
    if (proj.distanceMeters < minDistance) {
      minDistance = proj.distanceMeters;
      bestSegment = i;
      bestPoint = proj.point;
    }
  }

  // Fallback full scan if point drifted away from hint window
  if (minDistance > 25 && (searchStart > 0 || searchEnd < lastSegIdx)) {
    for (let i = 0; i <= lastSegIdx; i++) {
      if (i >= searchStart && i <= searchEnd) continue;
      const a = coords[i];
      const b = coords[i + 1];
      const proj = projectPointOnSegment(lat, lng, a[0], a[1], b[0], b[1]);
      if (proj.distanceMeters < minDistance) {
        minDistance = proj.distanceMeters;
        bestSegment = i;
        bestPoint = proj.point;
      }
    }
  }

  const segA = coords[bestSegment];
  const segB = coords[Math.min(bestSegment + 1, coords.length - 1)];
  const segmentBearing = normalizeHeadingDeg(getBearing(segA[0], segA[1], segB[0], segB[1]));

  return {
    point: bestPoint,
    segmentIndex: bestSegment,
    segmentBearing,
    distanceMeters: minDistance,
  };
}

export interface IdleRoadSegment {
  a: [number, number];
  b: [number, number];
  halfWidthMeters: number;
  bearingDeg: number;
}

export const DRIVABLE_ROAD_QUERY_LAYERS = [
  'road_motorway',
  'bridge_motorway',
  'tunnel_motorway',
  'highway-motorway',
  'bridge-motorway',
  'road_motorway_link',
  'bridge_motorway_link',
  'tunnel_motorway_link',
  'highway-motorway-link',
  'bridge-motorway-link',
  'road_trunk_primary',
  'bridge_trunk_primary',
  'tunnel_trunk_primary',
  'highway-primary',
  'highway-trunk',
  'bridge-trunk-primary',
  'road_secondary_tertiary',
  'bridge_secondary_tertiary',
  'tunnel_secondary_tertiary',
  'highway-secondary-tertiary',
  'bridge-secondary-tertiary',
  'road_link',
  'bridge_link',
  'tunnel_link',
  'highway-link',
  'bridge-link',
  'road_minor',
  'bridge_street',
  'tunnel_street',
  'tunnel_minor',
  'highway-minor',
  'bridge-minor',
  'road_service_track',
  'bridge_service_track',
  'tunnel_service_track',
];

const EXCLUDED_ROAD_LAYER_ID_TOKENS = [
  'casing',
  'outline',
  'rail',
  'transit',
  'path',
  'pedestrian',
  'footway',
  'steps',
  'cycleway',
  'ferry',
  'pier',
  'area',
  'oneway',
  'one_way',
  'arrow',
  'shield',
  'label',
  'name',
  'route',
  'radar',
];

export function getActiveDrivableRoadLayers(map: maplibregl.Map): string[] {
  const seen = new Set<string>();
  const active: string[] = [];

  for (const id of DRIVABLE_ROAD_QUERY_LAYERS) {
    if (map.getLayer(id) && !seen.has(id)) {
      seen.add(id);
      active.push(id);
    }
  }

  try {
    const layers = map.getStyle()?.layers;
    if (Array.isArray(layers)) {
      for (const layer of layers) {
        if (!layer || layer.type !== 'line' || seen.has(layer.id)) continue;
        const sourceLayer = String((layer as any)['source-layer'] || '').toLowerCase();
        if (sourceLayer !== 'transportation') continue;
        if (layer.layout && (layer.layout as any).visibility === 'none') continue;
        const lowerId = layer.id.toLowerCase();
        if (EXCLUDED_ROAD_LAYER_ID_TOKENS.some((tok) => lowerId.includes(tok))) continue;
        seen.add(layer.id);
        active.push(layer.id);
      }
    }
  } catch {}

  return active;
}

export const NON_DRIVABLE_ROAD_CLASSES = new Set([
  'path',
  'pedestrian',
  'footway',
  'steps',
  'cycleway',
  'rail',
  'transit',
  'ferry',
  'bridleway',
  'track',
]);

export function getDrivableRoadHalfWidthPx(
  layerId: string,
  roadClass: string,
  zoom: number
): number {
  const id = layerId.toLowerCase();
  const cls = roadClass.toLowerCase();

  if ((id.includes('motorway') && id.includes('link')) || cls === 'motorway_link') {
    return lerpZoomStops(zoom, [[12.8, 0.9], [14.8, 2.3], [16, 4.1], [18, 6.2], [19.5, 7.2]]);
  }
  if (id.includes('motorway') || cls === 'motorway') {
    return lerpZoomStops(zoom, [
      [12, 1.4],
      [13.4, 1.9],
      [14.6, 3.8],
      [16, 6.7],
      [17, 9.4],
      [18, 11.8],
      [19.5, 13.5],
    ]);
  }
  if (id.includes('trunk') || id.includes('primary') || cls === 'trunk' || cls === 'primary') {
    return lerpZoomStops(zoom, [
      [12, 1.2],
      [13.4, 1.6],
      [14.6, 3.2],
      [16, 5.7],
      [17, 8.2],
      [18, 10.4],
      [19.5, 11.8],
    ]);
  }
  if (
    id.includes('secondary') ||
    id.includes('tertiary') ||
    id.includes('link') ||
    cls === 'secondary' ||
    cls === 'tertiary'
  ) {
    return lerpZoomStops(zoom, [
      [12.8, 0.8],
      [14.2, 1.9],
      [15, 2.8],
      [16, 4.0],
      [17, 6.2],
      [18, 8.0],
      [19.5, 9.2],
    ]);
  }
  if (
    id.includes('minor') ||
    id.includes('street') ||
    cls === 'minor' ||
    cls === 'residential' ||
    cls === 'unclassified'
  ) {
    return lerpZoomStops(zoom, [
      [13.8, 0.7],
      [15, 1.7],
      [16, 2.6],
      [17, 4.6],
      [18, 6.1],
      [19.5, 7.0],
    ]);
  }
  return lerpZoomStops(zoom, [
    [14.6, 0.6],
    [15.5, 1.4],
    [16, 2.1],
    [17, 3.5],
    [18, 4.7],
    [19.5, 5.5],
  ]);
}

/**
 * Proyecta un punto al 100% sobre el eje central del segmento vial activo durante la
 * interpolación/extrapolación a 60 FPS en modo libre, evitando derivas hacia bordes o bermas.
 */
export function clampPointToRoadSegment(
  lat: number,
  lng: number,
  segment: IdleRoadSegment
): [number, number] {
  const midLat = ((segment.a[0] + segment.b[0]) / 2) * (Math.PI / 180);
  const kx = Math.cos(midLat) * 111320;
  const ky = 110540;
  const dx = (segment.b[1] - segment.a[1]) * kx;
  const dy = (segment.b[0] - segment.a[0]) * ky;
  const segLenSq = dx * dx + dy * dy;
  if (segLenSq < 1e-6) return [lat, lng];

  const px = (lng - segment.a[1]) * kx;
  const py = (lat - segment.a[0]) * ky;
  const tLine = (px * dx + py * dy) / segLenSq;
  const lineLat = segment.a[0] + tLine * (segment.b[0] - segment.a[0]);
  const lineLng = segment.a[1] + tLine * (segment.b[1] - segment.a[1]);

  return [lineLat, lineLng];
}

export function snapReportPointToRenderedCarriageway(
  map: maplibregl.Map,
  lat: number,
  lng: number,
  targetHeadingDeg: number,
  maxDistMeters: number = 38
): CarriagewaySnapResult | null {
  try {
    if (!Number.isFinite(targetHeadingDeg)) return null;
    const activeLayers = DRIVABLE_ROAD_QUERY_LAYERS.filter((id) => Boolean(map.getLayer(id)));
    if (activeLayers.length === 0) return null;

    const canvas = map.getCanvas();
    const cw = canvas?.clientWidth || map.getContainer()?.clientWidth || 0;
    const ch = canvas?.clientHeight || map.getContainer()?.clientHeight || 0;
    if (cw === 0 || ch === 0) return null;

    const pt = map.project([lng, lat]);
    if (
      !Number.isFinite(pt.x) ||
      !Number.isFinite(pt.y) ||
      pt.x < -160 ||
      pt.x > cw + 160 ||
      pt.y < -160 ||
      pt.y > ch + 160
    ) {
      return null;
    }

    const zoom = map.getZoom();
    const metersPerPx = Math.max(
      0.05,
      (78271.51696 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom)
    );
    const searchPx = Math.max(40, Math.min(180, Math.round((maxDistMeters + 12) / metersPerPx)));

    const features = map.queryRenderedFeatures(
      [
        [pt.x - searchPx, pt.y - searchPx],
        [pt.x + searchPx, pt.y + searchPx],
      ],
      { layers: activeLayers }
    );
    if (!features || features.length === 0) return null;

    let bestScore = Infinity;
    let bestResult: CarriagewaySnapResult | null = null;

    for (const feat of features) {
      const geom = feat?.geometry;
      if (!geom) continue;
      const roadClass = String(feat.properties?.class || '').toLowerCase();
      if (roadClass && NON_DRIVABLE_ROAD_CLASSES.has(roadClass)) continue;

      const onewayRaw = feat.properties?.oneway;
      const onewayStr = String(onewayRaw ?? '').toLowerCase();
      const mode: 'forward' | 'reverse' | 'both' =
        onewayRaw === -1 || onewayStr === '-1' || onewayStr === 'reverse'
          ? 'reverse'
          : onewayRaw === 1 ||
            onewayStr === '1' ||
            onewayRaw === true ||
            onewayStr === 'yes' ||
            roadClass === 'motorway'
          ? 'forward'
          : 'both';
      const isOneway = mode !== 'both';

      const lineStrings: number[][][] =
        geom.type === 'LineString'
          ? [geom.coordinates as number[][]]
          : geom.type === 'MultiLineString'
          ? (geom.coordinates as number[][][])
          : [];

      const rawRoadName =
        typeof feat.properties?.name === 'string' && feat.properties.name.trim()
          ? feat.properties.name.trim()
          : undefined;
      const featIdPart =
        feat.id !== undefined && feat.id !== null
          ? String(feat.id)
          : `${feat.layer?.id || 'road'}:${rawRoadName || roadClass || 'way'}`;

      for (const coords of lineStrings) {
        if (!coords || coords.length < 2) continue;
        for (let i = 0; i < coords.length - 1; i++) {
          const cA = coords[i];
          const cB = coords[i + 1];
          if (!cA || !cB || cA.length < 2 || cB.length < 2) continue;
          const proj = projectPointOnSegment(lat, lng, cA[1], cA[0], cB[1], cB[0]);
          if (proj.distanceMeters > maxDistMeters) continue;

          const fwdBearing = getBearing(cA[1], cA[0], cB[1], cB[0]);
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
            if (angleDiff > 45) continue;

            const score = proj.distanceMeters + angleDiff * 0.22 + (isOneway ? -1.5 : 0);
            if (score < bestScore) {
              bestScore = score;
              const isUndividedOrSingleLane = !isOneway;
              bestResult = {
                matched: true,
                coords: { lat: proj.point[0], lng: proj.point[1] },
                roadId: `vt:${featIdPart}`,
                carriagewayId: `vt:${featIdPart}:${dir.dirSuffix}`,
                roadName: rawRoadName,
                isOneway,
                isUndividedOrSingleLane,
                headingDeg: dir.bearing,
                distanceMeters: proj.distanceMeters,
              };
            }
          }
        }
      }
    }

    return bestResult;
  } catch {
    return null;
  }
}

/**
 * Snap-to-road magnético para modo conducción libre (sin ruta activa):
 * Consulta las capas de vías renderizadas (calles/avenidas) en un radio de 22 metros,
 * filtra estrictamente por compatibilidad de rumbo con tolerancia ±45° (respetando oneway
 * para no engancharse al carril contrario ni quedar sobre el separador central), y proyecta
 * la posición al 100% sobre el eje central de la vía compatible.
 */
export function projectArrowOntoRoadSurface(
  map: maplibregl.Map,
  lat: number,
  lng: number,
  headingDeg: number,
  hasReliableHeading: boolean,
  speedMps: number = 0
): {
  point: [number, number];
  segment: IdleRoadSegment | null;
  roadBearing: number | null;
  projected: boolean;
  distanceMeters: number;
} {
  const fallback = {
    point: [lat, lng] as [number, number],
    segment: null,
    roadBearing: null,
    projected: false,
    distanceMeters: Infinity,
  };
  try {
    const activeLayers = getActiveDrivableRoadLayers(map);
    if (activeLayers.length === 0) return fallback;

    const canvas = map.getCanvas();
    const cw = canvas?.clientWidth || map.getContainer()?.clientWidth || 0;
    const ch = canvas?.clientHeight || map.getContainer()?.clientHeight || 0;
    if (cw === 0 || ch === 0) return fallback;

    const pt = map.project([lng, lat]);
    if (
      !Number.isFinite(pt.x) ||
      !Number.isFinite(pt.y) ||
      pt.x < -160 ||
      pt.x > cw + 160 ||
      pt.y < -160 ||
      pt.y > ch + 160
    ) {
      return fallback;
    }

    const zoom = map.getZoom();
    const metersPerPx = Math.max(
      0.05,
      (78271.51696 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom)
    );
    // Margen generoso en píxeles para cubrir 22m incluso con zoom 18.5+ y perspectiva inclinada 60°
    const searchPx = Math.max(48, Math.min(220, Math.round(30 / metersPerPx)));

    const features = map.queryRenderedFeatures(
      [
        [pt.x - searchPx, pt.y - searchPx],
        [pt.x + searchPx, pt.y + searchPx],
      ],
      { layers: activeLayers }
    );
    if (!features || features.length === 0) return fallback;

    const MAX_CAPTURE_METERS = FREE_DRIVE_ROAD_SNAP_MAX_METERS;
    const isMoving = Number.isFinite(speedMps) && speedMps > FREE_DRIVE_MIN_MOVING_SPEED_MPS;
    const enforceHeadingMatch = Boolean(
      (hasReliableHeading || isMoving) && Number.isFinite(headingDeg)
    );
    const normHeading = normalizeHeadingDeg(headingDeg);

    let bestScore = Infinity;
    let bestDist = Infinity;
    let bestPoint: [number, number] = [lat, lng];
    let bestA: [number, number] | null = null;
    let bestB: [number, number] | null = null;
    let bestRoadBearing: number | null = null;
    let bestLayerId = '';
    let bestClass = '';

    for (const feat of features) {
      const geom = feat?.geometry;
      if (!geom) continue;
      const roadClass = String(feat.properties?.class || '').toLowerCase();
      if (roadClass && NON_DRIVABLE_ROAD_CLASSES.has(roadClass)) continue;

      const onewayRaw = feat.properties?.oneway;
      const onewayStr = String(onewayRaw ?? '').toLowerCase();
      const mode: 'forward' | 'reverse' | 'both' =
        onewayRaw === -1 || onewayStr === '-1' || onewayStr === 'reverse'
          ? 'reverse'
          : onewayRaw === 1 ||
            onewayStr === '1' ||
            onewayRaw === true ||
            onewayStr === 'yes' ||
            roadClass === 'motorway' ||
            roadClass === 'motorway_link'
          ? 'forward'
          : 'both';
      const isOneway = mode !== 'both';

      const lineStrings: number[][][] =
        geom.type === 'LineString'
          ? [geom.coordinates as number[][]]
          : geom.type === 'MultiLineString'
          ? (geom.coordinates as number[][][])
          : [];

      const layerId = feat.layer?.id || '';
      for (const coords of lineStrings) {
        if (!coords || coords.length < 2) continue;
        for (let i = 0; i < coords.length - 1; i++) {
          const cA = coords[i];
          const cB = coords[i + 1];
          if (!cA || !cB || cA.length < 2 || cB.length < 2) continue;
          const aLat = cA[1];
          const aLng = cA[0];
          const bLat = cB[1];
          const bLng = cB[0];

          const proj = projectPointOnSegment(lat, lng, aLat, aLng, bLat, bLng);
          if (proj.distanceMeters > MAX_CAPTURE_METERS) continue;

          const fwdBearing = normalizeHeadingDeg(getBearing(aLat, aLng, bLat, bLng));
          const revBearing = normalizeHeadingDeg(fwdBearing + 180);
          const allowedBearings: number[] =
            mode === 'forward'
              ? [fwdBearing]
              : mode === 'reverse'
              ? [revBearing]
              : [fwdBearing, revBearing];

          let matchedBearing = allowedBearings[0];
          let minAngleDiff = 0;

          if (enforceHeadingMatch) {
            let bestDirDiff = Infinity;
            for (const candBearing of allowedBearings) {
              const diff = Math.abs(shortestAngleDiffDeg(normHeading, candBearing));
              if (diff < bestDirDiff) {
                bestDirDiff = diff;
                matchedBearing = candBearing;
              }
            }
            // Tolerancia estricta ±45°: descarta el carril contrario en avenidas de doble sentido y calles transversales
            if (bestDirDiff > FREE_DRIVE_HEADING_TOLERANCE_DEG) continue;
            minAngleDiff = bestDirDiff;
          }

          // Preferir distancia mínima + buena alineación angular (ligera prioridad a calzadas oneway coincidentes)
          const score =
            proj.distanceMeters +
            (enforceHeadingMatch ? minAngleDiff * 0.18 : 0) +
            (isOneway && enforceHeadingMatch ? -1.0 : 0);

          if (score < bestScore) {
            bestScore = score;
            bestDist = proj.distanceMeters;
            bestPoint = proj.point;
            bestA = [aLat, aLng];
            bestB = [bLat, bLng];
            bestRoadBearing = matchedBearing;
            bestLayerId = layerId;
            bestClass = roadClass;
          }
        }
      }
    }

    if (!bestA || !bestB || !Number.isFinite(bestDist) || bestRoadBearing === null) {
      return fallback;
    }

    const halfWidthPx = getDrivableRoadHalfWidthPx(bestLayerId, bestClass, zoom);
    const halfWidthMeters = Math.min(12, Math.max(1.4, halfWidthPx * 0.88 * metersPerPx));

    // Proyección al 100% sobre el eje central de la línea vial compatible (sin promediar ni desplazar al borde)
    const centeredPoint: [number, number] = [bestPoint[0], bestPoint[1]];

    return {
      point: centeredPoint,
      segment: {
        a: bestA,
        b: bestB,
        halfWidthMeters,
        bearingDeg: bestRoadBearing,
      },
      roadBearing: isMoving ? bestRoadBearing : null,
      projected: true,
      distanceMeters: bestDist,
    };
  } catch {
    return fallback;
  }
}

export function buildRouteCumulativeDistances(coords: [number, number][]): number[] {
  const cum = new Array<number>(coords.length).fill(0);
  for (let i = 1; i < coords.length; i++) {
    cum[i] =
      cum[i - 1] +
      getDistanceMeters(coords[i - 1][0], coords[i - 1][1], coords[i][0], coords[i][1]);
  }
  return cum;
}

export function sampleRouteCoordAtDistanceFraction(
  coords: [number, number][],
  cumDist: number[],
  fraction: number
): [number, number] {
  if (!coords || coords.length === 0) return [0, 0];
  if (coords.length === 1) return coords[0];
  const total = cumDist[cumDist.length - 1] || 0;
  if (total <= 1) {
    return coords[Math.min(coords.length - 1, Math.floor(coords.length * fraction))];
  }
  const target = total * Math.max(0.05, Math.min(0.95, fraction));
  for (let i = 0; i < cumDist.length - 1; i++) {
    const d0 = cumDist[i];
    const d1 = cumDist[i + 1];
    if (target <= d1) {
      const segLen = d1 - d0;
      const t = segLen > 0 ? Math.max(0, Math.min(1, (target - d0) / segLen)) : 0;
      return [
        coords[i][0] + (coords[i + 1][0] - coords[i][0]) * t,
        coords[i][1] + (coords[i + 1][1] - coords[i][1]) * t,
      ];
    }
  }
  return coords[Math.floor(coords.length / 2)];
}

export function computeNonOverlappingRouteLabelCoords(
  map: maplibregl.Map,
  routesList: RouteData[],
  selectedRouteId: string | undefined,
  fastestRouteId: string | undefined,
  userPos: Coordinates | null | undefined,
  destPos: Coordinates | null | undefined,
  previewPadding: { top: number; bottom: number; left: number; right: number }
): Map<string, [number, number]> {
  const result = new Map<string, [number, number]>();
  const validRoutes = routesList.filter((r) => r.coordinates.length >= 2);
  if (validRoutes.length === 0) return result;

  const bounds = new maplibregl.LngLatBounds();
  for (const r of validRoutes) {
    for (const [lat, lng] of r.coordinates) {
      bounds.extend([lng, lat]);
    }
  }
  const hasValidUser =
    Number.isFinite(userPos?.lat) &&
    Number.isFinite(userPos?.lng) &&
    !(Math.abs(userPos!.lat) < 0.01 && Math.abs(userPos!.lng) < 0.01);
  if (hasValidUser) {
    bounds.extend([userPos!.lng, userPos!.lat]);
  }
  if (destPos && Number.isFinite(destPos.lat) && Number.isFinite(destPos.lng)) {
    bounds.extend([destPos.lng, destPos.lat]);
  }

  let camZoom = map.getZoom();
  try {
    const cam = map.cameraForBounds(bounds, {
      padding: previewPadding,
      bearing: 0,
      pitch: 0,
      maxZoom: 17,
    });
    if (cam && typeof cam.zoom === 'number' && Number.isFinite(cam.zoom)) {
      camZoom = cam.zoom;
    }
  } catch {}

  const worldSize = 512 * Math.pow(2, camZoom);
  const toPx = (lat: number, lng: number): [number, number] => {
    const x = ((lng + 180) / 360) * worldSize;
    const clampedLat = Math.max(-85, Math.min(85, lat));
    const sinLat = Math.sin((clampedLat * Math.PI) / 180);
    const y = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * worldSize;
    return [x, y];
  };

  interface PlacedRect {
    x: number;
    y: number;
    w: number;
    h: number;
  }

  const placedRects: PlacedRect[] = [];
  if (hasValidUser) {
    const [ux, uy] = toPx(userPos!.lat, userPos!.lng);
    placedRects.push({ x: ux, y: uy, w: 40, h: 40 });
  }
  if (destPos && Number.isFinite(destPos.lat) && Number.isFinite(destPos.lng)) {
    const [dx, dy] = toPx(destPos.lat, destPos.lng);
    placedRects.push({ x: dx, y: dy - 18, w: 38, h: 46 });
  }

  const cumMap = new Map<string, number[]>();
  const sampledOtherMap = new Map<string, Array<[number, number]>>();
  for (const r of validRoutes) {
    const cum = buildRouteCumulativeDistances(r.coordinates);
    cumMap.set(r.id, cum);
    const pts: Array<[number, number]> = [];
    for (let f = 0.14; f <= 0.86; f += 0.06) {
      const c = sampleRouteCoordAtDistanceFraction(r.coordinates, cum, f);
      pts.push(toPx(c[0], c[1]));
    }
    sampledOtherMap.set(r.id, pts);
  }

  // Place selected route first, then fastest, then others
  const placementOrder = [...validRoutes].sort((a, b) => {
    const aSel = a.id === selectedRouteId ? 0 : a.id === fastestRouteId ? 1 : 2;
    const bSel = b.id === selectedRouteId ? 0 : b.id === fastestRouteId ? 1 : 2;
    return aSel - bSel;
  });

  const candidateFractions = [0.5, 0.43, 0.57, 0.36, 0.64, 0.29, 0.71, 0.22, 0.78, 0.16, 0.84];

  for (const r of placementOrder) {
    const cum = cumMap.get(r.id)!;
    const isSelected = r.id === selectedRouteId;
    const isFastest = r.id === fastestRouteId;
    const w = isSelected ? (isFastest ? 116 : 82) : 68;
    const h = isSelected ? 40 : 32;

    const otherPts: Array<[number, number]> = [];
    for (const other of validRoutes) {
      if (other.id !== r.id) {
        otherPts.push(...(sampledOtherMap.get(other.id) || []));
      }
    }

    let bestCleanScore = Infinity;
    let bestCleanCoord: [number, number] | null = null;
    let bestCleanRect: PlacedRect | null = null;

    let bestFallbackClearance = -Infinity;
    let bestFallbackCoord: [number, number] = sampleRouteCoordAtDistanceFraction(
      r.coordinates,
      cum,
      0.5
    );
    let bestFallbackRect: PlacedRect = {
      x: toPx(bestFallbackCoord[0], bestFallbackCoord[1])[0],
      y: toPx(bestFallbackCoord[0], bestFallbackCoord[1])[1] - h / 2,
      w,
      h,
    };

    for (const frac of candidateFractions) {
      const coord = sampleRouteCoordAtDistanceFraction(r.coordinates, cum, frac);
      const [px, py] = toPx(coord[0], coord[1]);
      const centerY = py - h / 2;

      let overlaps = false;
      let minClearance = Infinity;
      for (const rect of placedRects) {
        const reqDx = (w + rect.w) / 2 + 12;
        const reqDy = (h + rect.h) / 2 + 10;
        const dx = Math.abs(px - rect.x);
        const dy = Math.abs(centerY - rect.y);
        if (dx < reqDx && dy < reqDy) {
          overlaps = true;
        }
        const clearance = Math.max(dx - reqDx, dy - reqDy);
        if (clearance < minClearance) {
          minClearance = clearance;
        }
      }

      let minOtherRoutePx = 30;
      if (otherPts.length > 0) {
        minOtherRoutePx = Infinity;
        for (const [ox, oy] of otherPts) {
          const d = Math.hypot(px - ox, py - oy);
          if (d < minOtherRoutePx) minOtherRoutePx = d;
        }
      }

      if (!overlaps) {
        const score = Math.abs(frac - 0.5) * 115 - Math.min(26, minOtherRoutePx) * 1.4;
        if (score < bestCleanScore) {
          bestCleanScore = score;
          bestCleanCoord = coord;
          bestCleanRect = { x: px, y: centerY, w, h };
        }
      } else if (minClearance > bestFallbackClearance) {
        bestFallbackClearance = minClearance;
        bestFallbackCoord = coord;
        bestFallbackRect = { x: px, y: centerY, w, h };
      }
    }

    if (bestCleanCoord && bestCleanRect) {
      result.set(r.id, bestCleanCoord);
      placedRects.push(bestCleanRect);
    } else {
      result.set(r.id, bestFallbackCoord);
      placedRects.push(bestFallbackRect);
    }
  }

  return result;
}

export type ManeuverFeatureCollection = {
  type: 'FeatureCollection';
  features: any[];
};

export const EMPTY_MANEUVER_FC: ManeuverFeatureCollection = {
  type: 'FeatureCollection',
  features: [],
};

export function smoothSharpTurnCorners(pts: [number, number][]): [number, number][] {
  if (pts.length < 3) return pts;
  const out: [number, number][] = [pts[0]];

  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1];
    const curr = pts[i];
    const next = pts[i + 1];

    const lenIn = getDistanceMeters(prev[0], prev[1], curr[0], curr[1]);
    const lenOut = getDistanceMeters(curr[0], curr[1], next[0], next[1]);

    if (lenIn < 1.5 || lenOut < 1.5) {
      out.push(curr);
      continue;
    }

    const bIn = getBearing(prev[0], prev[1], curr[0], curr[1]);
    const bOut = getBearing(curr[0], curr[1], next[0], next[1]);
    const turnAngle = Math.abs(((bOut - bIn + 540) % 360) - 180);

    // Subtle fillet on sharp corners (>= 30 deg) keeps white curve smooth inside blue route casing
    if (turnAngle >= 30 && lenIn >= 4 && lenOut >= 4) {
      const filletMeters = Math.min(3.2, lenIn * 0.35, lenOut * 0.35);
      const q0 = interpolateLatLng(curr, prev, filletMeters / lenIn);
      const q2 = interpolateLatLng(curr, next, filletMeters / lenOut);

      out.push(q0);
      for (const t of [0.25, 0.5, 0.75]) {
        const omt = 1 - t;
        out.push([
          omt * omt * q0[0] + 2 * omt * t * curr[0] + t * t * q2[0],
          omt * omt * q0[1] + 2 * omt * t * curr[1] + t * t * q2[1],
        ]);
      }
      out.push(q2);
    } else {
      out.push(curr);
    }
  }

  out.push(pts[pts.length - 1]);
  return out;
}

export function buildManeuverArrowGeoJSON(
  coords: [number, number][],
  step: RouteStep
): ManeuverFeatureCollection {
  if (!coords || coords.length < 2) return EMPTY_MANEUVER_FC;

  // Dibuja giros (izquierda/derecha/rotonda/retorno) y también maniobras rectas sobre la ruta morada
  if (step.type === 'depart') return EMPTY_MANEUVER_FC;

  const [stepLat, stepLng] = step.coordinates;
  let turnIdx = 0;
  let bestStepDist = Infinity;
  for (let i = 0; i < coords.length; i++) {
    const d = getDistanceMeters(stepLat, stepLng, coords[i][0], coords[i][1]);
    if (d < bestStepDist) {
      bestStepDist = d;
      turnIdx = i;
      if (d < 2) break;
    }
  }

  if (bestStepDist > 120) {
    return EMPTY_MANEUVER_FC;
  }

  // Extract route geometry from ~24m before the maneuver to ~20m after it
  const BEFORE_METERS = 24;
  const AFTER_METERS = 20;

  const beforePoints: [number, number][] = [];
  let accumBack = 0;
  for (let i = turnIdx; i > 0; i--) {
    const segLen = getDistanceMeters(coords[i][0], coords[i][1], coords[i - 1][0], coords[i - 1][1]);
    if (segLen <= 0.05) continue;
    if (accumBack + segLen >= BEFORE_METERS) {
      const ratio = (BEFORE_METERS - accumBack) / segLen;
      beforePoints.push(interpolateLatLng(coords[i], coords[i - 1], ratio));
      accumBack = BEFORE_METERS;
      break;
    }
    beforePoints.push(coords[i - 1]);
    accumBack += segLen;
  }
  beforePoints.reverse();

  const afterPoints: [number, number][] = [];
  let accumForward = 0;
  for (let i = turnIdx; i < coords.length - 1; i++) {
    const segLen = getDistanceMeters(coords[i][0], coords[i][1], coords[i + 1][0], coords[i + 1][1]);
    if (segLen <= 0.05) continue;
    if (accumForward + segLen >= AFTER_METERS) {
      const ratio = (AFTER_METERS - accumForward) / segLen;
      afterPoints.push(interpolateLatLng(coords[i], coords[i + 1], ratio));
      accumForward = AFTER_METERS;
      break;
    }
    afterPoints.push(coords[i + 1]);
    accumForward += segLen;
  }

  if (accumForward < 3 && accumBack < 6) {
    return EMPTY_MANEUVER_FC;
  }

  const rawSlice: [number, number][] = [...beforePoints, coords[turnIdx], ...afterPoints];
  const cleanSlice: [number, number][] = [];
  for (const pt of rawSlice) {
    if (
      cleanSlice.length === 0 ||
      getDistanceMeters(
        cleanSlice[cleanSlice.length - 1][0],
        cleanSlice[cleanSlice.length - 1][1],
        pt[0],
        pt[1]
      ) >= 0.3
    ) {
      cleanSlice.push(pt);
    }
  }

  if (cleanSlice.length < 2) {
    return EMPTY_MANEUVER_FC;
  }

  const smoothPts = smoothSharpTurnCorners(cleanSlice);
  const endPt = smoothPts[smoothPts.length - 1];

  // Orient arrowhead along the final outgoing segment of the curve
  let tailRef = smoothPts[smoothPts.length - 2];
  for (let i = smoothPts.length - 2; i >= 0; i--) {
    const d = getDistanceMeters(smoothPts[i][0], smoothPts[i][1], endPt[0], endPt[1]);
    tailRef = smoothPts[i];
    if (d >= 2.5) break;
  }

  const arrowBearing = getBearing(tailRef[0], tailRef[1], endPt[0], endPt[1]);
  if (!Number.isFinite(arrowBearing)) {
    return EMPTY_MANEUVER_FC;
  }

  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { role: 'stem' },
        geometry: {
          type: 'LineString',
          coordinates: coordsToLngLat(smoothPts),
        },
      },
      {
        type: 'Feature',
        properties: { role: 'tip', bearing: ((arrowBearing % 360) + 360) % 360 },
        geometry: {
          type: 'Point',
          coordinates: [endPt[1], endPt[0]],
        },
      },
    ],
  };
}

/**
 * Zoom dinámico durante navegación activa: según velocidad (18.0 detenido → 15.0 a 100 km/h)
 * y acercamiento a 18.0 al estar a menos de 200 m del giro (pleno a ≤150 m).
 */
export function computeNavSmartZoom(
  distToTurn: number,
  smoothedSpeedKmh: number,
  smartZoomEnabled: boolean
): number {
  if (!smartZoomEnabled) return 16;
  const speedZoom = speedToZoom(smoothedSpeedKmh);
  if (distToTurn > 0 && distToTurn < MANEUVER_ZOOM_START_M) {
    const t = Math.min(
      1,
      (MANEUVER_ZOOM_START_M - distToTurn) / (MANEUVER_ZOOM_START_M - MANEUVER_ZOOM_FULL_M)
    );
    return Math.max(speedZoom, speedZoom + t * (MANEUVER_ZOOM - speedZoom));
  }
  return speedZoom;
}

/**
 * Con Perspectiva 3D activada, posiciona al vehículo más abajo para ver mayor tramo de calle por delante.
 */
export function computeLowerThirdPaddingValues(
  containerHeight: number | undefined,
  perspective3D: boolean
): maplibregl.PaddingOptions {
  const viewportHeight =
    containerHeight || (typeof window !== 'undefined' ? window.innerHeight : 700) || 700;
  const ratio = perspective3D ? 0.45 : 0.36;
  const topPad = Math.round(
    Math.min(viewportHeight * (ratio + 0.03), Math.max(125, viewportHeight * ratio))
  );
  return {
    top: topPad,
    bottom: 0,
    left: 0,
    right: 0,
  };
}

/**
 * En pantalla principal sin ruta activa, ubica la flecha en POSICION_FLECHA_ABAJO (1/4 desde abajo).
 */
export function computeIdleArrowPaddingValues(
  containerHeight: number | undefined
): maplibregl.PaddingOptions {
  const viewportHeight =
    containerHeight || (typeof window !== 'undefined' ? window.innerHeight : 700) || 700;
  const topRatio = Math.max(0, Math.min(0.65, 1 - 2 * POSICION_FLECHA_ABAJO));
  const topPad = Math.round(viewportHeight * topRatio);
  return {
    top: topPad,
    bottom: 0,
    left: 0,
    right: 0,
  };
}

/**
 * Resolve a guaranteed valid bearing (0..360), preserving last valid heading when stopped.
 */
export function resolveNavigationBearing(
  isNavigating: boolean,
  loc: GPSLocation,
  route: RouteData | null,
  currentSpeedKmh: number,
  lastValidHeading: number
): { bearing: number; nextLastValidHeading: number } {
  const isMoving = currentSpeedKmh >= 2.5;

  // 1. If actively navigating and snapped to route, align with road segment ahead
  if (isNavigating && route && route.coordinates.length >= 2) {
    const match = matchUserToRoute(loc.lat, loc.lng, loc.heading, route.coordinates);
    if (match.isSnapped && Number.isFinite(match.arrowBearing)) {
      const norm = ((match.arrowBearing % 360) + 360) % 360;
      return { bearing: norm, nextLastValidHeading: norm };
    }
  }

  // 2. Use GPS heading when moving (or when no prior non-zero heading exists)
  if (loc.heading !== null && loc.heading !== undefined && Number.isFinite(loc.heading)) {
    const norm = ((loc.heading % 360) + 360) % 360;
    if (isMoving || (lastValidHeading === 0 && norm !== 0)) {
      return { bearing: norm, nextLastValidHeading: norm };
    }
  }

  // 3. If user is stopped and heading hasn't been set yet, derive from route's first segment
  if (lastValidHeading === 0 && route && route.coordinates.length >= 2) {
    const b = getBearing(
      route.coordinates[0][0],
      route.coordinates[0][1],
      route.coordinates[1][0],
      route.coordinates[1][1]
    );
    if (Number.isFinite(b)) {
      const norm = ((b % 360) + 360) % 360;
      return { bearing: norm, nextLastValidHeading: norm };
    }
  }

  // 4. Fallback to last valid heading (never empty/null/NaN)
  const fallback = Number.isFinite(lastValidHeading) ? lastValidHeading : 0;
  return { bearing: fallback, nextLastValidHeading: lastValidHeading };
}

/**
 * Finds the closest vertex index on a polyline to a target lat/lng coordinate.
 */
export function findClosestVertexIndex(
  coords: [number, number][],
  targetLat: number,
  targetLng: number,
  maxIndex?: number
): number {
  const limit =
    maxIndex !== undefined ? Math.min(maxIndex, coords.length - 1) : coords.length - 1;
  let bestIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i <= limit; i++) {
    const d = getDistanceMeters(targetLat, targetLng, coords[i][0], coords[i][1]);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  return bestIdx;
}

/**
 * Walks `targetMeters` forward along a route polyline starting at `startIdx`, returning an interpolated [lat, lng].
 */
export function walkAlongRouteFrom(
  coords: [number, number][],
  startIdx: number,
  targetMeters: number
): [number, number] {
  let walked = 0;
  for (let i = startIdx; i < coords.length - 1; i++) {
    const segLen = getDistanceMeters(coords[i][0], coords[i][1], coords[i + 1][0], coords[i + 1][1]);
    if (walked + segLen >= targetMeters && segLen > 0) {
      const ratio = (targetMeters - walked) / segLen;
      return [
        coords[i][0] + (coords[i + 1][0] - coords[i][0]) * ratio,
        coords[i][1] + (coords[i + 1][1] - coords[i][1]) * ratio,
      ];
    }
    walked += segLen;
  }
  return coords[Math.max(startIdx, coords.length - 2)] || coords[coords.length - 1];
}

/**
 * Computes the placement coordinate for the next-street bubble along the active route.
 */
export function computeNextStreetBubblePoint(
  coords: [number, number][],
  turnIdx: number,
  turnPt: [number, number],
  userLat: number,
  userLng: number,
  distUserToTurn: number,
  isDayMode: boolean
): [number, number] {
  if (isDayMode) {
    // Place near the next turn on the route line
    return turnIdx < coords.length - 1 ? walkAlongRouteFrom(coords, turnIdx, 24) : turnPt;
  }
  if (distUserToTurn <= 260 && turnIdx < coords.length - 1) {
    // Place 36m after the turn directly on the outgoing street
    return walkAlongRouteFrom(coords, turnIdx, 36);
  }
  // Long approach (>260m): find nearest user vertex and place 135m ahead on the visible blue route
  const userIdx = findClosestVertexIndex(coords, userLat, userLng, turnIdx);
  return walkAlongRouteFrom(coords, userIdx, Math.min(135, Math.max(55, distUserToTurn * 0.45)));
}

