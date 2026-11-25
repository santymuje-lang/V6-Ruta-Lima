/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface PointProjection {
  snappedPoint: [number, number];
  distanceMeters: number;
  segmentIndex: number;
  bearingDeg: number;
}

export interface SplitRouteResult {
  traveledCoords: [number, number][];
  remainingCoords: [number, number][];
  arrowPoint: [number, number];
  arrowBearing: number;
  isSnapped: boolean;
  distanceToRoute: number;
  angleDiff: number;
  isReversal: boolean;
}

/**
 * Calculates distance in meters between two coordinates using Haversine formula
 */
export function getDistanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLng = (lng2 - lng1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Calculates initial compass bearing from point 1 to point 2 (0..360 deg, 0 = North)
 */
export function getBearing(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const phi1 = lat1 * (Math.PI / 180);
  const phi2 = lat2 * (Math.PI / 180);
  const deltaLambda = (lng2 - lng1) * (Math.PI / 180);

  const y = Math.sin(deltaLambda) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);
  const theta = Math.atan2(y, x);
  return (theta * (180 / Math.PI) + 360) % 360;
}

/**
 * Projects a point P onto segment [A, B] and returns the snapped coordinate,
 * distance in meters, and interpolation parameter t (0..1).
 */
export function projectPointOnSegment(
  pLat: number,
  pLng: number,
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number
): { point: [number, number]; distanceMeters: number; t: number } {
  const midLat = ((aLat + bLat) / 2) * (Math.PI / 180);
  const kx = Math.cos(midLat) * 111320;
  const ky = 110540;

  const dx = (bLng - aLng) * kx;
  const dy = (bLat - aLat) * ky;
  const segLenSq = dx * dx + dy * dy;

  if (segLenSq === 0) {
    const dist = getDistanceMeters(pLat, pLng, aLat, aLng);
    return { point: [aLat, aLng], distanceMeters: dist, t: 0 };
  }

  const px = (pLng - aLng) * kx;
  const py = (pLat - aLat) * ky;

  let t = (px * dx + py * dy) / segLenSq;
  t = Math.max(0, Math.min(1, t));

  const projLat = aLat + t * (bLat - aLat);
  const projLng = aLng + t * (bLng - aLng);
  const dist = getDistanceMeters(pLat, pLng, projLat, projLng);

  return {
    point: [projLat, projLng],
    distanceMeters: dist,
    t,
  };
}

/**
 * Finds target point forward along route by forwardDistanceMeters (default 15m)
 */
export function getPointAheadOnRoute(
  startPoint: [number, number],
  startIndex: number,
  coordinates: [number, number][],
  forwardDistanceMeters = 15
): [number, number] {
  if (coordinates.length === 0) return startPoint;
  if (startIndex >= coordinates.length - 1) {
    return coordinates[coordinates.length - 1];
  }

  let remaining = forwardDistanceMeters;
  let currPoint: [number, number] = startPoint;
  let idx = startIndex;

  // First segment from startPoint to coordinates[idx + 1]
  const distToNext = getDistanceMeters(
    currPoint[0],
    currPoint[1],
    coordinates[idx + 1][0],
    coordinates[idx + 1][1]
  );

  if (distToNext >= remaining && distToNext > 0) {
    const r = remaining / distToNext;
    return [
      currPoint[0] + r * (coordinates[idx + 1][0] - currPoint[0]),
      currPoint[1] + r * (coordinates[idx + 1][1] - currPoint[1]),
    ];
  }

  remaining -= distToNext;
  currPoint = coordinates[idx + 1];
  idx += 1;

  while (idx < coordinates.length - 1) {
    const segDist = getDistanceMeters(
      coordinates[idx][0],
      coordinates[idx][1],
      coordinates[idx + 1][0],
      coordinates[idx + 1][1]
    );

    if (segDist >= remaining && segDist > 0) {
      const r = remaining / segDist;
      return [
        coordinates[idx][0] + r * (coordinates[idx + 1][0] - coordinates[idx][0]),
        coordinates[idx][1] + r * (coordinates[idx + 1][1] - coordinates[idx][1]),
      ];
    }

    remaining -= segDist;
    currPoint = coordinates[idx + 1];
    idx += 1;
  }

  return currPoint;
}

/**
 * Snaps user GPS to active route polyline at 100% onto the exact segment when distance <= 25m
 * (and not going in reverse). Never averages with raw GPS coordinates that would pull the
 * chevron toward the shoulder/curb. Prefers heading-compatible segments when a route loops
 * or runs along divided carriageways.
 */
export function matchUserToRoute(
  userLat: number,
  userLng: number,
  userHeading: number | null | undefined,
  coordinates: [number, number][],
  maxSnapDistanceMeters = 25
): SplitRouteResult {
  const fallbackResult: SplitRouteResult = {
    traveledCoords: [],
    remainingCoords: coordinates,
    arrowPoint: [userLat, userLng],
    arrowBearing: userHeading || 0,
    isSnapped: false,
    distanceToRoute: 0,
    angleDiff: 0,
    isReversal: false,
  };

  if (!coordinates || coordinates.length < 2) {
    return fallbackResult;
  }

  const hasValidHeading =
    userHeading !== null && userHeading !== undefined && Number.isFinite(userHeading);

  // Find closest segment overall AND closest heading-compatible segment within maxSnapDistanceMeters
  let minDistance = Infinity;
  let bestSegment = 0;
  let bestPoint: [number, number] = [coordinates[0][0], coordinates[0][1]];

  let bestAlignedScore = Infinity;
  let bestAlignedDistance = Infinity;
  let bestAlignedSegment = -1;
  let bestAlignedPoint: [number, number] = [coordinates[0][0], coordinates[0][1]];

  for (let i = 0; i < coordinates.length - 1; i++) {
    const a = coordinates[i];
    const b = coordinates[i + 1];
    const proj = projectPointOnSegment(userLat, userLng, a[0], a[1], b[0], b[1]);

    if (proj.distanceMeters < minDistance) {
      minDistance = proj.distanceMeters;
      bestSegment = i;
      bestPoint = proj.point;
    }

    if (hasValidHeading && proj.distanceMeters <= maxSnapDistanceMeters) {
      const segBearing = getBearing(a[0], a[1], b[0], b[1]);
      const diff = Math.abs((((userHeading! - segBearing + 540) % 360) - 180));
      if (diff <= 45) {
        const score = proj.distanceMeters + diff * 0.12;
        if (score < bestAlignedScore) {
          bestAlignedScore = score;
          bestAlignedDistance = proj.distanceMeters;
          bestAlignedSegment = i;
          bestAlignedPoint = proj.point;
        }
      }
    }
  }

  // Prefer the heading-compatible carriageway segment when available within 25m
  if (bestAlignedSegment >= 0) {
    bestSegment = bestAlignedSegment;
    bestPoint = bestAlignedPoint;
    minDistance = bestAlignedDistance;
  }

  // Bearing of the exact matched route segment (with 10m lookahead for smooth curve tangent)
  const segA = coordinates[bestSegment];
  const segB = coordinates[Math.min(bestSegment + 1, coordinates.length - 1)];
  let segmentBearing = getBearing(segA[0], segA[1], segB[0], segB[1]);
  const aheadPt = getPointAheadOnRoute(bestPoint, bestSegment, coordinates, 10);
  if (getDistanceMeters(bestPoint[0], bestPoint[1], aheadPt[0], aheadPt[1]) >= 1.5) {
    const aheadBearing = getBearing(bestPoint[0], bestPoint[1], aheadPt[0], aheadPt[1]);
    if (Number.isFinite(aheadBearing)) {
      segmentBearing = aheadBearing;
    }
  }

  // Angular difference between user motion heading and route segment direction
  let angleDiff = 0;
  if (hasValidHeading) {
    angleDiff = Math.abs((((userHeading! - segmentBearing + 540) % 360) - 180));
  }

  // Detección de cambio de sentido / contravía (> 100° de diferencia con respecto al tramo)
  const isReversal = hasValidHeading && angleDiff > 100;

  // Snap-to-route al 100% siempre que GPS esté dentro de 25m de la ruta y no vaya en contravía
  const isDistanceOk = minDistance <= maxSnapDistanceMeters;
  const isSnapped = isDistanceOk && !isReversal;

  // Determinar la posición y el rumbo del marcador (flecha)
  let arrowPoint: [number, number];
  let arrowBearing: number;

  if (isSnapped) {
    // Proyección exacta al 100% sobre el eje de la ruta (sin promediar con coordenada cruda)
    arrowPoint = [bestPoint[0], bestPoint[1]];
    arrowBearing = segmentBearing;
  } else {
    // Fuera de los 25m o en contravía: liberar snap magnético
    arrowPoint = [userLat, userLng];
    arrowBearing = hasValidHeading ? userHeading! : segmentBearing;
  }

  // La línea de ruta nace exactamente en el punto de la ruta más cercano a la flecha,
  // siguiendo la geometría real de calles de OSRM sin gancho, retroceso ni atajos en diagonal.
  const nextVertices = coordinates.slice(bestSegment + 1);
  const skipFirstNext =
    nextVertices.length > 1 &&
    getDistanceMeters(bestPoint[0], bestPoint[1], nextVertices[0][0], nextVertices[0][1]) < 0.5;
  const remainingCoords: [number, number][] = skipFirstNext
    ? [bestPoint, ...nextVertices.slice(1)]
    : [bestPoint, ...nextVertices];

  return {
    traveledCoords: [], // El tramo detrás de la flecha se borra en tiempo real
    remainingCoords,
    arrowPoint,
    arrowBearing,
    isSnapped,
    distanceToRoute: minDistance,
    angleDiff,
    isReversal,
  };
}
