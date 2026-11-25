import { Coordinates, InspectorSubtype, MapPOI, TrafficAlert, TrafficAlertType } from '../types/navigation';
import { getBearing, getDistanceMeters, projectPointOnSegment } from './routeMatching';
import { isAlertExpired } from './alertLifecycle';
import { getPoliceSubtypeLabel, normalizePoliceSubtype } from './policeReports';
import { getInspectorSubtypeLabel, normalizeInspectorSubtype } from './inspectorReports';
import { getAlertTargetCoords, isAlertMatchingRouteHeading } from './reportDirection';

export interface RouteMatchedAlert {
  alert: TrafficAlert;
  distanceToRoute: number;
  alongRouteMeters: number;
  distanceAheadMeters: number;
}

const PRE_ROUTE_IMPORTANCE_ORDER: TrafficAlertType[] = [
  'inspectors',
  'accident',
  'road_closed',
  'hazard',
  'speed_camera',
  'construction',
  'traffic',
  'flood',
  'police',
  'stopped_vehicle',
  'pothole',
  'broken_light',
];

function formatCountLabel(type: TrafficAlertType, count: number): string {
  const plural = count !== 1;
  switch (type) {
    case 'inspectors':
      return `${count} ${plural ? 'inspectores' : 'inspector'}`;
    case 'accident':
      return `${count} ${plural ? 'accidentes' : 'accidente'}`;
    case 'road_closed':
      return `${count} ${plural ? 'vías cerradas' : 'vía cerrada'}`;
    case 'hazard':
      return `${count} ${plural ? 'peligros' : 'peligro'}`;
    case 'speed_camera':
      return `${count} ${plural ? 'radares temporales' : 'radar temporal'}`;
    case 'construction':
      return `${count} ${plural ? 'obras' : 'obra'}`;
    case 'traffic':
      return `${count} ${plural ? 'zonas de tráfico' : 'zona de tráfico'}`;
    case 'flood':
      return `${count} ${plural ? 'inundaciones' : 'inundación'}`;
    case 'police':
      return `${count} ${plural ? 'controles policiales' : 'control policial'}`;
    case 'stopped_vehicle':
      return `${count} ${plural ? 'vehículos varados' : 'vehículo varado'}`;
    case 'pothole':
      return `${count} ${plural ? 'baches' : 'bache'}`;
    case 'broken_light':
      return `${count} ${plural ? 'semáforos dañados' : 'semáforo dañado'}`;
    default:
      return `${count} ${plural ? 'reportes' : 'reporte'}`;
  }
}

function joinSpanishList(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} y ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`;
}

export function buildCumulativeDistances(coordinates: [number, number][]): number[] {
  const cumDist: number[] = new Array(coordinates.length).fill(0);
  for (let i = 1; i < coordinates.length; i++) {
    cumDist[i] =
      cumDist[i - 1] +
      getDistanceMeters(
        coordinates[i - 1][0],
        coordinates[i - 1][1],
        coordinates[i][0],
        coordinates[i][1]
      );
  }
  return cumDist;
}

export function projectPointOnPolyline(
  lat: number,
  lng: number,
  coordinates: [number, number][],
  cumDist: number[]
): {
  distanceToRoute: number;
  alongRouteMeters: number;
  segmentIndex: number;
  segmentBearing: number;
} {
  if (!coordinates || coordinates.length < 2) {
    return {
      distanceToRoute: Infinity,
      alongRouteMeters: 0,
      segmentIndex: 0,
      segmentBearing: 0,
    };
  }

  let minDistance = Infinity;
  let bestSegment = 0;
  let bestT = 0;

  for (let i = 0; i < coordinates.length - 1; i++) {
    const a = coordinates[i];
    const b = coordinates[i + 1];
    const proj = projectPointOnSegment(lat, lng, a[0], a[1], b[0], b[1]);
    if (proj.distanceMeters < minDistance) {
      minDistance = proj.distanceMeters;
      bestSegment = i;
      bestT = proj.t;
    }
  }

  const segA = coordinates[bestSegment];
  const segB = coordinates[Math.min(bestSegment + 1, coordinates.length - 1)];
  const segLen = cumDist[bestSegment + 1] - cumDist[bestSegment];
  const alongRouteMeters = cumDist[bestSegment] + bestT * Math.max(0, segLen);
  const segmentBearing = getBearing(segA[0], segA[1], segB[0], segB[1]);

  return {
    distanceToRoute: minDistance,
    alongRouteMeters,
    segmentIndex: bestSegment,
    segmentBearing,
  };
}

/**
 * Encuentra todas las alertas activas a lo largo de la ruta.
 */
export function getAlertsAlongRoute(
  routeCoordinates: [number, number][],
  alerts: TrafficAlert[],
  maxDistanceMeters: number = 42,
  now: number = Date.now()
): RouteMatchedAlert[] {
  if (!routeCoordinates || routeCoordinates.length < 2 || !alerts || alerts.length === 0) {
    return [];
  }

  const cumDist = buildCumulativeDistances(routeCoordinates);
  const matched: RouteMatchedAlert[] = [];

  for (const alert of alerts) {
    if (isAlertExpired(alert, now)) continue;
    if ((alert.removalVotes || 0) >= 3) continue;

    let bestProj: ReturnType<typeof projectPointOnPolyline> | null = null;
    for (const pt of getAlertTargetCoords(alert)) {
      const proj = projectPointOnPolyline(pt.lat, pt.lng, routeCoordinates, cumDist);
      if (proj.distanceToRoute > maxDistanceMeters) continue;
      if (!isAlertMatchingRouteHeading(alert, proj.segmentBearing, 60)) continue;
      if (!bestProj || proj.distanceToRoute < bestProj.distanceToRoute) {
        bestProj = proj;
      }
    }

    if (bestProj) {
      matched.push({
        alert,
        distanceToRoute: bestProj.distanceToRoute,
        alongRouteMeters: bestProj.alongRouteMeters,
        distanceAheadMeters: bestProj.alongRouteMeters,
      });
    }
  }

  return matched.sort((a, b) => a.alongRouteMeters - b.alongRouteMeters);
}

/**
 * Encuentra inspectores activos sobre la ruta, adelante del usuario y en su sentido de avance.
 */
export function getUpcomingInspectorsOnRoute(
  userCoords: Coordinates,
  userHeading: number | null | undefined,
  isMoving: boolean,
  routeCoordinates: [number, number][],
  alerts: TrafficAlert[],
  maxDistanceToRouteMeters: number = 38,
  now: number = Date.now()
): RouteMatchedAlert[] {
  if (!routeCoordinates || routeCoordinates.length < 2 || !alerts || alerts.length === 0) {
    return [];
  }

  const cumDist = buildCumulativeDistances(routeCoordinates);
  const userProj = projectPointOnPolyline(
    userCoords.lat,
    userCoords.lng,
    routeCoordinates,
    cumDist
  );

  // Si el usuario está muy lejos de la ruta, no asumir posición sobre ruta
  if (userProj.distanceToRoute > 60) {
    return [];
  }

  // Si el vehículo se mueve en sentido contrario al tramo de ruta (>100°), ignorar alertas adelante
  const hasValidHeading =
    isMoving && userHeading !== null && userHeading !== undefined && Number.isFinite(userHeading);
  if (hasValidHeading) {
    const angleDiff = Math.abs((((userHeading! - userProj.segmentBearing + 540) % 360) - 180));
    if (angleDiff > 100) {
      return [];
    }
  }

  const upcoming: RouteMatchedAlert[] = [];

  for (const alert of alerts) {
    if (alert.type !== 'inspectors') continue;
    if (isAlertExpired(alert, now)) continue;
    if ((alert.removalVotes || 0) >= 3) continue;

    let bestMatch: {
      distanceToRoute: number;
      alongRouteMeters: number;
      distanceAheadMeters: number;
    } | null = null;

    for (const pt of getAlertTargetCoords(alert)) {
      const proj = projectPointOnPolyline(pt.lat, pt.lng, routeCoordinates, cumDist);
      if (proj.distanceToRoute > maxDistanceToRouteMeters) continue;

      // Solo avisar si el rumbo de la ruta en ese punto coincide con el del reporte (<= 60°) o si aplica a ambos sentidos
      if (!isAlertMatchingRouteHeading(alert, proj.segmentBearing, 60)) continue;

      const distanceAheadMeters = Math.round(proj.alongRouteMeters - userProj.alongRouteMeters);
      // Debe estar adelante del usuario (evitar reportes ya pasados)
      if (distanceAheadMeters < 10) continue;

      if (!bestMatch || distanceAheadMeters < bestMatch.distanceAheadMeters) {
        bestMatch = {
          distanceToRoute: proj.distanceToRoute,
          alongRouteMeters: proj.alongRouteMeters,
          distanceAheadMeters,
        };
      }
    }

    if (bestMatch) {
      upcoming.push({
        alert,
        distanceToRoute: bestMatch.distanceToRoute,
        alongRouteMeters: bestMatch.alongRouteMeters,
        distanceAheadMeters: bestMatch.distanceAheadMeters,
      });
    }
  }

  return upcoming.sort((a, b) => a.distanceAheadMeters - b.distanceAheadMeters);
}

export interface PreRouteSummaryResult {
  speechText: string;
  panelSummaryText: string;
  inspectorCount: number;
  totalCount: number;
  matchedAlerts: RouteMatchedAlert[];
}

/**
 * Construye el resumen en español para leer antes de iniciar una ruta.
 * Orden: Inspectores siempre primero con énfasis -> Accidente -> Vía cerrada -> Peligro ->
 * Radar temporal -> Obras -> Tráfico -> Demás reportes.
 */
export function buildPreRouteVoiceSummary(
  routeCoordinates: [number, number][],
  alerts: TrafficAlert[],
  now: number = Date.now()
): PreRouteSummaryResult {
  const matchedAlerts = getAlertsAlongRoute(routeCoordinates, alerts, 45, now);

  if (matchedAlerts.length === 0) {
    return {
      speechText: 'Tu ruta está despejada.',
      panelSummaryText: '',
      inspectorCount: 0,
      totalCount: 0,
      matchedAlerts: [],
    };
  }

  const counts = new Map<TrafficAlertType, number>();
  for (const item of matchedAlerts) {
    counts.set(item.alert.type, (counts.get(item.alert.type) || 0) + 1);
  }

  const inspectorCount = counts.get('inspectors') || 0;
  const otherParts: string[] = [];
  const panelParts: string[] = [];

  if (inspectorCount > 0) {
    panelParts.push(formatCountLabel('inspectors', inspectorCount));
  }

  for (const type of PRE_ROUTE_IMPORTANCE_ORDER) {
    if (type === 'inspectors') continue;
    const count = counts.get(type) || 0;
    if (count > 0) {
      panelParts.push(formatCountLabel(type, count));
      if (type === 'police' && count === 1) {
        const singlePolice = matchedAlerts.find((m) => m.alert.type === 'police');
        if (singlePolice) {
          otherParts.push(
            `1 ${getPoliceSubtypeLabel(normalizePoliceSubtype(singlePolice.alert)).toLowerCase()}`
          );
          continue;
        }
      }
      otherParts.push(formatCountLabel(type, count));
    }
  }

  let speechText = '';
  if (inspectorCount > 0) {
    const inspPhrase = formatCountLabel('inspectors', inspectorCount);
    speechText = `Atención, en tu ruta hay ${inspPhrase}.`;
    if (otherParts.length > 0) {
      speechText += ` También hay ${joinSpanishList(otherParts)}.`;
    }
  } else {
    speechText = `En tu ruta hay ${joinSpanishList(otherParts)}.`;
  }

  const panelSummaryText =
    panelParts.length > 0 ? `${joinSpanishList(panelParts)} en tu ruta` : '';

  return {
    speechText,
    panelSummaryText,
    inspectorCount,
    totalCount: matchedAlerts.length,
    matchedAlerts,
  };
}

/**
 * Formatea el aviso de voz de inspector durante navegación activa.
 */
export function formatInspectorDistanceAnnouncement(
  distanceMeters: number,
  isFiveHundredThreshold: boolean,
  inspectorSubtype?: InspectorSubtype | null
): string {
  const subtypeLabel = getInspectorSubtypeLabel(normalizeInspectorSubtype(inspectorSubtype));

  if (isFiveHundredThreshold) {
    return `${subtypeLabel} a 500 metros.`;
  }

  if (distanceMeters >= 950) {
    const kmRounded = Math.max(1, Math.round(distanceMeters / 500) * 0.5);
    if (Math.abs(kmRounded - Math.round(kmRounded)) < 0.01) {
      const intKm = Math.round(kmRounded);
      return `Atención, ${subtypeLabel} a ${intKm} ${intKm === 1 ? 'kilómetro' : 'kilómetros'} en tu ruta.`;
    }
    return `Atención, ${subtypeLabel} a ${kmRounded.toFixed(1)} kilómetros en tu ruta.`;
  }

  const roundedMeters = Math.max(100, Math.round(distanceMeters / 50) * 50);
  return `Atención, ${subtypeLabel} a ${roundedMeters} metros en tu ruta.`;
}

export interface RouteMatchedPOI {
  poi: MapPOI;
  distanceToRoute: number;
  distanceAheadMeters: number;
}

/**
 * Encuentra colegios o hospitales sobre o junto a la ruta, dentro de los próximos <300m en sentido de avance.
 */
export function getUpcomingSchoolOrHospitalOnRoute(
  userCoords: Coordinates,
  userHeading: number | null | undefined,
  isMoving: boolean,
  routeCoordinates: [number, number][],
  pois: MapPOI[],
  maxDistanceMeters: number = 300,
  maxLateralMeters: number = 55
): RouteMatchedPOI[] {
  if (!routeCoordinates || routeCoordinates.length < 2 || !pois || pois.length === 0) {
    return [];
  }

  const cumDist = buildCumulativeDistances(routeCoordinates);
  const userProj = projectPointOnPolyline(
    userCoords.lat,
    userCoords.lng,
    routeCoordinates,
    cumDist
  );

  if (userProj.distanceToRoute > 65) {
    return [];
  }

  const hasValidHeading =
    isMoving && userHeading !== null && userHeading !== undefined && Number.isFinite(userHeading);
  if (hasValidHeading) {
    const angleDiff = Math.abs((((userHeading! - userProj.segmentBearing + 540) % 360) - 180));
    if (angleDiff > 100) {
      return [];
    }
  }

  const upcoming: RouteMatchedPOI[] = [];

  for (const poi of pois) {
    if (poi.category !== 'school' && poi.category !== 'hospital') continue;

    const proj = projectPointOnPolyline(poi.lat, poi.lng, routeCoordinates, cumDist);
    if (proj.distanceToRoute > maxLateralMeters) continue;

    const distanceAheadMeters = Math.round(proj.alongRouteMeters - userProj.alongRouteMeters);
    if (distanceAheadMeters < 15 || distanceAheadMeters >= maxDistanceMeters) continue;

    upcoming.push({
      poi,
      distanceToRoute: proj.distanceToRoute,
      distanceAheadMeters,
    });
  }

  return upcoming.sort((a, b) => a.distanceAheadMeters - b.distanceAheadMeters);
}

export interface FreeDriveCommunityAlertEvent {
  alert: TrafficAlert;
  stage: 'initial' | 'final';
  distanceAheadMeters: number;
  text: string;
  variant: 'inspector' | 'route_summary' | 'radar';
}

/**
 * Devuelve el nombre corto y claro en español del tipo de reporte comunitario
 * para avisos de voz y franja visual en conducción libre.
 */
export function getFreeDriveAlertTypeLabel(alert: TrafficAlert): string {
  switch (alert.type) {
    case 'inspectors':
      return alert.inspectorSubtype
        ? getInspectorSubtypeLabel(normalizeInspectorSubtype(alert))
        : 'Inspectores';
    case 'police': {
      const subtype = normalizePoliceSubtype(alert);
      if (subtype === 'traffic') return 'Policía de tránsito';
      if (subtype === 'hidden') return 'Policía escondido';
      return 'Policía';
    }
    case 'pothole':
      return 'Bache';
    case 'stopped_vehicle':
      return 'Vehículo varado';
    case 'accident':
      return 'Accidente';
    case 'construction':
      return 'Obras';
    case 'hazard':
      return 'Peligro en la vía';
    case 'flood':
      return 'Inundación';
    case 'speed_camera':
      return 'Cámara de velocidad';
    case 'road_closed':
      return 'Vía cerrada';
    case 'traffic':
      return 'Tráfico pesado';
    case 'broken_light':
      return 'Semáforo dañado';
    default:
      return (alert.title || '').trim() || 'Reporte vial';
  }
}

/**
 * Formatea el mensaje corto con tipo y distancia (ej. "Inspectores a 300 metros").
 */
export function formatFreeDriveCommunityAlertText(
  alert: TrafficAlert,
  distanceAheadMeters: number,
  stage: 'initial' | 'final'
): string {
  const typeLabel = getFreeDriveAlertTypeLabel(alert);
  const rawRounded = Math.round(distanceAheadMeters / 50) * 50;
  const roundedMeters =
    stage === 'final'
      ? Math.min(150, Math.max(50, rawRounded))
      : Math.min(400, Math.max(200, rawRounded));
  return `${typeLabel} a ${roundedMeters} metros`;
}

/**
 * Evalúa reportes comunitarios cercanos por delante del vehículo durante conducción libre
 * (sin ruta activa):
 * - Solo cuando la velocidad supera los 10 km/h y existe un rumbo confiable.
 * - Descarta reportes ya pasados, en sentido contrario o fuera del corredor frontal.
 * - Aviso inicial cerca de 400 m (210 m a 430 m) y aviso final corto cerca de 150 m (30 m a 175 m).
 * - Deduplica cada reporte por recorrido (una vez en aviso inicial y una vez en aviso final).
 */
export function evaluateFreeDriveCommunityAlerts(
  userCoords: Coordinates,
  userHeading: number | null | undefined,
  speedKmh: number,
  alerts: TrafficAlert[],
  announcedInitialIds: Set<string>,
  announcedFinalIds: Set<string>,
  now: number = Date.now()
): FreeDriveCommunityAlertEvent[] {
  if (!Number.isFinite(speedKmh) || speedKmh <= 10) {
    return [];
  }
  if (
    userHeading === null ||
    userHeading === undefined ||
    !Number.isFinite(userHeading) ||
    !alerts ||
    alerts.length === 0
  ) {
    return [];
  }

  const events: FreeDriveCommunityAlertEvent[] = [];

  for (const alert of alerts) {
    if (isAlertExpired(alert, now)) continue;
    if ((alert.removalVotes || 0) >= 3) continue;

    // Si ya se emitió el aviso final de este reporte en el recorrido, no volver a repetir
    if (announcedFinalIds.has(alert.id)) continue;

    // Filtrar reportes del sentido contrario (tolerancia 55°, o ambos sentidos si aplica)
    if (!isAlertMatchingRouteHeading(alert, userHeading, 55)) continue;

    let bestForwardMeters = Infinity;

    for (const pt of getAlertTargetCoords(alert)) {
      const dist = getDistanceMeters(userCoords.lat, userCoords.lng, pt.lat, pt.lng);
      if (dist < 25 || dist > 440) continue;

      const bearingToAlert = getBearing(userCoords.lat, userCoords.lng, pt.lat, pt.lng);
      const signedAngleDeg = ((bearingToAlert - userHeading + 540) % 360) - 180;
      const absAngleDeg = Math.abs(signedAngleDeg);

      // Descartar reportes que ya se pasaron o quedan atrás/costado
      if (absAngleDeg >= 85) continue;

      const rad = (signedAngleDeg * Math.PI) / 180;
      const forwardMeters = dist * Math.cos(rad);
      if (forwardMeters < 30) continue;

      const lateralMeters = Math.abs(dist * Math.sin(rad));
      const maxLateral = dist <= 180 ? 32 : Math.min(70, Math.max(32, dist * 0.2));
      const maxAngle = dist <= 180 ? 38 : 35;

      if (absAngleDeg > maxAngle || lateralMeters > maxLateral) continue;

      if (forwardMeters < bestForwardMeters) {
        bestForwardMeters = forwardMeters;
      }
    }

    if (!Number.isFinite(bestForwardMeters)) continue;

    const aheadMeters = Math.round(bestForwardMeters);
    const variant: 'inspector' | 'route_summary' | 'radar' =
      alert.type === 'inspectors'
        ? 'inspector'
        : alert.type === 'speed_camera'
        ? 'radar'
        : 'route_summary';

    if (aheadMeters >= 30 && aheadMeters <= 175) {
      if (!announcedFinalIds.has(alert.id)) {
        announcedFinalIds.add(alert.id);
        announcedInitialIds.add(alert.id);
        events.push({
          alert,
          stage: 'final',
          distanceAheadMeters: aheadMeters,
          text: formatFreeDriveCommunityAlertText(alert, aheadMeters, 'final'),
          variant,
        });
      }
    } else if (aheadMeters > 210 && aheadMeters <= 430) {
      if (!announcedInitialIds.has(alert.id)) {
        announcedInitialIds.add(alert.id);
        events.push({
          alert,
          stage: 'initial',
          distanceAheadMeters: aheadMeters,
          text: formatFreeDriveCommunityAlertText(alert, aheadMeters, 'initial'),
          variant,
        });
      }
    }
  }

  return events.sort((a, b) => a.distanceAheadMeters - b.distanceAheadMeters);
}
