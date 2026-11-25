import { getFallbackOrigin } from './lastKnownLocation';
import {
  Coordinates,
  ManeuverModifier,
  ManeuverType,
  RouteData,
  RouteStep,
  TravelMode,
} from '../types/navigation';

/**
 * Calculates distance between two coordinates in meters using the Haversine formula
 */
export function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3; // Earth radius in meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Formats distance: meters when < 1000m, else kilometers with 1 decimal
 */
export function formatDistance(meters: number): string {
  if (meters <= 35) return 'Ahora';
  if (meters < 1000) return `${Math.round(meters / 10) * 10} m`;
  const km = (meters / 1000).toFixed(1);
  return `${km} km`;
}

/**
 * Formats duration in minutes and hours
 */
export function formatDuration(seconds: number): string {
  const mins = Math.round(seconds / 60);
  if (mins < 1) return '< 1 min';
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  if (remainingMins === 0) return `${hrs} h`;
  return `${hrs} h ${remainingMins} min`;
}

/**
 * Calculates Estimated Time of Arrival (ETA)
 */
export function calculateETA(remainingSeconds: number): string {
  const now = new Date();
  const arrival = new Date(now.getTime() + remainingSeconds * 1000);
  const hours = arrival.getHours().toString().padStart(2, '0');
  const minutes = arrival.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

/**
 * Estimates number of walking steps based on average pedestrian stride (0.74m/step)
 */
export function formatWalkingSteps(meters: number): string {
  const steps = Math.round(meters / 0.74);
  return `${steps.toLocaleString('es-PE')} pasos`;
}

/**
 * Estimates calories burned while walking (~0.045 kcal per meter)
 */
export function formatCalories(meters: number): string {
  const kcal = Math.round(meters * 0.045);
  return `${kcal} kcal`;
}

/**
 * Converts OSRM step instructions into clear, professional Spanish commands for driving or walking
 */
function translateOSRMInstruction(
  type: string,
  modifier: string | undefined,
  name: string,
  travelMode: TravelMode = 'driving'
): string {
  const roadName = name && name.trim() !== '' ? ` en ${name}` : '';
  const modLower = (modifier || '').toLowerCase().replace(/\s+/g, '-');

  // Walking/Pedestrian specific instructions
  if (travelMode === 'walking') {
    switch (type) {
      case 'depart':
        return `Camina en dirección a ${name || 'tu destino'}`;
      case 'arrive':
        return 'Has llegado a tu destino a pie';
      case 'roundabout':
      case 'rotary':
        return `Cruza la rotonda por el paso peatonal${roadName}`;
      case 'turn':
        if (modLower.includes('sharp-right')) return `Gira a la derecha hacia${roadName}`;
        if (modLower.includes('slight-right')) return `Toma la acera de la derecha${roadName}`;
        if (modLower.includes('right')) return `Gira a la derecha por${roadName}`;
        if (modLower.includes('sharp-left')) return `Gira a la izquierda hacia${roadName}`;
        if (modLower.includes('slight-left')) return `Toma la acera de la izquierda${roadName}`;
        if (modLower.includes('left')) return `Gira a la izquierda por${roadName}`;
        if (modLower.includes('uturn')) return `Cruza con cuidado y cambia de acera`;
        return `Gira hacia${roadName}`;
      case 'continue':
      case 'new name':
        return `Continúa caminando recto por${roadName}`;
      case 'fork':
        if (modLower.includes('left')) return `Toma la acera izquierda${roadName}`;
        return `Toma la acera derecha${roadName}`;
      case 'end of road':
      case 'end-of-road':
        if (modLower.includes('left')) return `Al final del paso, gira a la izquierda${roadName}`;
        return `Al final del paso, gira a la derecha${roadName}`;
      default:
        if (modLower.includes('right')) return `Gira a la derecha por${roadName}`;
        if (modLower.includes('left')) return `Gira a la izquierda por${roadName}`;
        return `Sigue a pie por la acera${roadName}`;
    }
  }

  // Driving specific instructions
  switch (type) {
    case 'depart':
      return `Dirígete hacia ${name || 'tu destino'}`;
    case 'arrive':
      return 'Has llegado a tu destino';
    case 'roundabout':
    case 'rotary':
      return `En la rotonda, toma la salida${roadName}`;
    case 'turn':
      if (modLower.includes('sharp-right')) return `Giro pronunciado a la derecha${roadName}`;
      if (modLower.includes('slight-right')) return `Mantente a la derecha hacia${roadName}`;
      if (modLower.includes('right')) return `Gira a la derecha${roadName}`;
      if (modLower.includes('sharp-left')) return `Giro pronunciado a la izquierda${roadName}`;
      if (modLower.includes('slight-left')) return `Mantente a la izquierda hacia${roadName}`;
      if (modLower.includes('left')) return `Gira a la izquierda${roadName}`;
      if (modLower.includes('uturn')) return `Da la vuelta en U${roadName}`;
      return `Gira${roadName}`;
    case 'continue':
    case 'new name':
      return `Continúa recto${roadName}`;
    case 'fork':
      if (modLower.includes('left')) return `Mantente a la izquierda en la bifurcación${roadName}`;
      return `Mantente a la derecha en la bifurcación${roadName}`;
    case 'end of road':
    case 'end-of-road':
      if (modLower.includes('left')) return `Al final de la vía, gira a la izquierda${roadName}`;
      return `Al final de la vía, gira a la derecha${roadName}`;
    case 'merge':
      return `Incorpórate a la vía principal${roadName}`;
    case 'on ramp':
    case 'on-ramp':
      return `Toma la rampa de acceso${roadName}`;
    case 'off ramp':
    case 'off-ramp':
      return `Toma la salida${roadName}`;
    default:
      if (modLower.includes('right')) return `Gira a la derecha${roadName}`;
      if (modLower.includes('left')) return `Gira a la izquierda${roadName}`;
      return `Continúa por la vía${roadName}`;
  }
}

/**
 * Normalizes OSRM modifier to strict union type
 */
function normalizeModifier(mod?: string): ManeuverModifier | undefined {
  if (!mod) return undefined;
  const cleaned = mod.toLowerCase().replace(/\s+/g, '-');
  if (cleaned.includes('sharp-right')) return 'sharp-right';
  if (cleaned.includes('slight-right')) return 'slight-right';
  if (cleaned.includes('right')) return 'right';
  if (cleaned.includes('sharp-left')) return 'sharp-left';
  if (cleaned.includes('slight-left')) return 'slight-left';
  if (cleaned.includes('left')) return 'left';
  if (cleaned.includes('uturn')) return 'uturn';
  if (cleaned.includes('straight')) return 'straight';
  return undefined;
}

/**
 * Parses a single OSRM route object into typed RouteData
 */
function parseOSRMRoute(
  rawRoute: any,
  index: number,
  destination: Coordinates,
  destinationName: string,
  travelMode: TravelMode = 'driving',
  originCoords?: Coordinates
): RouteData {
  const coordinates: [number, number][] = rawRoute.geometry.coordinates.map(
    (coord: [number, number]) => [coord[1], coord[0]] as [number, number]
  );

  // Asegurar que la polilínea termine exactamente en el pin del destino sin pasarse
  if (coordinates.length > 0) {
    const lastIdx = coordinates.length - 1;
    const distToDestPin = calculateDistanceMeters(
      coordinates[lastIdx][0],
      coordinates[lastIdx][1],
      destination.lat,
      destination.lng
    );
    if (distToDestPin <= 0.5) {
      coordinates[lastIdx] = [destination.lat, destination.lng];
    } else {
      coordinates.push([destination.lat, destination.lng]);
    }
  }

  const steps: RouteStep[] = [];
  if (rawRoute.legs) {
    for (let legIdx = 0; legIdx < rawRoute.legs.length; legIdx++) {
      const leg = rawRoute.legs[legIdx];
      if (leg.steps) {
        for (let sIdx = 0; sIdx < leg.steps.length; sIdx++) {
          const step = leg.steps[sIdx];
          const maneuver = step.maneuver || {};
          const type = (maneuver.type || 'turn') as ManeuverType;

          // Manejo de multi-leg (p. ej. rodear la manzana con waypoint forward):
          // Omitir 'arrive' intermedio del primer leg y 'depart' intermedio del segundo leg
          if (rawRoute.legs.length > 1) {
            if (legIdx < rawRoute.legs.length - 1 && type === 'arrive') {
              continue;
            }
            if (legIdx > 0 && type === 'depart') {
              continue;
            }
          }

          const rawModifier = maneuver.modifier as string | undefined;
          const normalizedMod = normalizeModifier(rawModifier);
          const instruction = translateOSRMInstruction(type, rawModifier, step.name, travelMode);
          const maneuverCoords: [number, number] = [maneuver.location[1], maneuver.location[0]];

          const stepDuration =
            travelMode === 'walking'
              ? Math.max(5, Math.round(step.distance / 1.28))
              : step.duration;

          steps.push({
            distance: step.distance,
            duration: stepDuration,
            instruction,
            type,
            modifier: normalizedMod,
            name: step.name || '',
            coordinates: maneuverCoords,
          });
        }
      }
    }
  }

  const defaultSummary =
    travelMode === 'walking' ? 'Calles y aceras peatonales de Lima' : 'Vías principales de Lima';
  
  const legSummaries = rawRoute.legs?.map((l: any) => l.summary).filter(Boolean);
  const summaryRoad =
    (legSummaries && legSummaries.length > 0 ? legSummaries.join(' y ') : null) ||
    rawRoute.legs?.[0]?.steps?.[1]?.name ||
    defaultSummary;

  const rawDist = rawRoute.distance;
  const finalDuration =
    travelMode === 'walking'
      ? Math.max(45, Math.round(rawDist / 1.28))
      : rawRoute.duration;

  const estimatedSteps = Math.round(rawDist / 0.74);
  const estimatedCalories = Math.round(rawDist * 0.045);

  return {
    id: `route_${travelMode}_${index}_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
    coordinates,
    distance: rawDist,
    duration: finalDuration,
    steps,
    summary: travelMode === 'walking' ? `A pie por ${summaryRoad}` : `Por ${summaryRoad}`,
    destinationName,
    destinationCoords: destination,
    travelMode,
    estimatedSteps,
    estimatedCalories,
  };
}

export interface AvoidOptions {
  tolls?: boolean;
  highways?: boolean;
  unpaved?: boolean;
}

/**
 * Checks if a route traverses roads corresponding to the selected avoidance criteria in Lima
 */
function isRouteMatchingAvoidCriteria(rawRoute: any, avoid: AvoidOptions): boolean {
  if (!avoid.tolls && !avoid.highways && !avoid.unpaved) return false;

  const steps = rawRoute.legs?.flatMap((l: any) => l.steps || []) || [];
  const roadNames: string[] = [
    ...(rawRoute.legs?.map((l: any) => l.summary || '') || []),
    ...steps.map((s: any) => `${s.name || ''} ${s.ref || ''}`),
  ].map((str) => str.toLowerCase());

  const fullText = roadNames.join(' ');

  if (avoid.tolls) {
    const tollKeywords = [
      'peaje',
      'toll',
      'evitamiento',
      'línea amarilla',
      'linea amarilla',
      'concesion',
      'concesión',
      'via expresa sur',
      'vía expresa sur',
    ];
    if (tollKeywords.some((kw) => fullText.includes(kw))) {
      return true;
    }
  }

  if (avoid.highways) {
    const highwayKeywords = [
      'autopista',
      'motorway',
      'vía expresa',
      'via expresa',
      'panamericana',
      'circunvalación',
      'circunvalacion',
      'ramiro prialé',
      'ramiro priale',
    ];
    if (highwayKeywords.some((kw) => fullText.includes(kw))) {
      return true;
    }
  }

  if (avoid.unpaved) {
    const unpavedKeywords = [
      'trocha',
      'sin pavimentar',
      'no pavimentada',
      'afirmado',
      'camino de tierra',
      'unpaved',
    ];
    if (unpavedKeywords.some((kw) => fullText.includes(kw))) {
      return true;
    }
  }

  return false;
}

/**
 * Detecta si una ruta devuelta por OSRM incluye giros en U, retornos o salida en dirección opuesta al rumbo del usuario
 */
function routeContainsUTurn(rawRoute: any, departureHeading?: number | null): boolean {
  if (!rawRoute) return true;

  // 1. Verificar maniobras con modificador 'uturn' o instrucciones de giro en U
  const legs = rawRoute.legs || [];
  for (const leg of legs) {
    for (const step of leg.steps || []) {
      const mod = (step.maneuver?.modifier || '').toLowerCase();
      const type = (step.maneuver?.type || '').toLowerCase();
      const instr = (step.name || '').toLowerCase();

      if (mod === 'uturn' || mod.includes('uturn') || mod.includes('u-turn')) {
        return true;
      }
      if (type === 'roundabout-turn' && (mod.includes('uturn') || mod.includes('180'))) {
        return true;
      }
      if (
        instr.includes('en u') ||
        instr.includes('u-turn') ||
        instr.includes('vuelta en u') ||
        instr.includes('retorno')
      ) {
        return true;
      }
    }
  }

  // 2. Verificar que la salida inicial no invierta el sentido de marcha respecto al rumbo del usuario
  if (departureHeading !== undefined && departureHeading !== null && !isNaN(departureHeading)) {
    const coords = rawRoute.geometry?.coordinates;
    if (coords && coords.length >= 2) {
      const startLng = coords[0][0];
      const startLat = coords[0][1];

      let forwardLng = coords[1][0];
      let forwardLat = coords[1][1];
      for (let i = 1; i < coords.length; i++) {
        const d = calculateDistanceMeters(startLat, startLng, coords[i][1], coords[i][0]);
        if (d >= 10) {
          forwardLng = coords[i][0];
          forwardLat = coords[i][1];
          break;
        }
      }

      const initialBearing = calculateBearing(startLat, startLng, forwardLat, forwardLng);
      const diff = Math.abs((((initialBearing - departureHeading + 540) % 360) - 180));
      // Si la salida se aleja más de 100° del rumbo actual, está invirtiendo el sentido de marcha
      if (diff > 100) {
        return true;
      }
    }
  }

  return false;
}

function isCoordWithinPeru(coord: Coordinates): boolean {
  return coord.lat >= -18.5 && coord.lat <= 0.0 && coord.lng >= -81.5 && coord.lng <= -68.5;
}

async function queryOSRMWithTimeout(
  url: string,
  timeoutMs: number,
  abortSignal?: AbortSignal
): Promise<any | null> {
  if (abortSignal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }

  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const onExternalAbort = () => controller.abort();
  if (abortSignal) {
    abortSignal.addEventListener('abort', onExternalAbort, { once: true });
  }

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      return null;
    }
    const json = await res.json();
    if (json && json.code === 'Ok' && Array.isArray(json.routes) && json.routes.length > 0) {
      return json;
    }
    return null;
  } catch (err: any) {
    if (abortSignal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    if (!timedOut && typeof navigator !== 'undefined' && !navigator.onLine) {
      throw new Error('Sin conexión. Mostrando el último mapa guardado');
    }
    return null;
  } finally {
    clearTimeout(timeoutId);
    if (abortSignal) {
      abortSignal.removeEventListener('abort', onExternalAbort);
    }
  }
}

/**
 * Fetches multiple alternative driving or walking routes from OSRM
 */
export async function fetchOSRMRoutes(
  origin: Coordinates,
  destination: Coordinates,
  destinationName: string = 'Destino',
  travelMode: TravelMode = 'driving',
  avoidOptions?: AvoidOptions,
  heading?: number | null,
  isRecalculation?: boolean,
  abortSignal?: AbortSignal
): Promise<RouteData[]> {
  if (abortSignal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }

  // Check offline first
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error('Sin conexión. Mostrando el último mapa guardado');
  }

  // Sanitize origin if invalid or (0,0)
  const safeOrigin: Coordinates =
    Number.isFinite(origin?.lat) &&
    Number.isFinite(origin?.lng) &&
    !(Math.abs(origin.lat) < 0.01 && Math.abs(origin.lng) < 0.01)
      ? origin
      : getFallbackOrigin();

  if (!Number.isFinite(destination?.lat) || !Number.isFinite(destination?.lng)) {
    throw new Error('Las coordenadas de destino no son válidas.');
  }

  const originStr = `${safeOrigin.lng.toFixed(6)},${safeOrigin.lat.toFixed(6)}`;
  const destStr = `${destination.lng.toFixed(6)},${destination.lat.toFixed(6)}`;

  // Viajes largos (ej. Lima -> Ayacucho, ~560 km): más tiempo de espera para los servidores de rutas
  const tripDistanceKm =
    calculateDistanceMeters(safeOrigin.lat, safeOrigin.lng, destination.lat, destination.lng) / 1000;
  const timeoutScale = Math.min(3, Math.max(1, 1 + (tripDistanceKm - 40) / 150));
  const scaleTimeout = (ms: number): number => Math.round(ms * timeoutScale);

  const profile = travelMode === 'walking' ? 'foot' : 'driving';

  let data: any = null;
  const cleanHeading =
    heading !== undefined && heading !== null && !isNaN(heading)
      ? Math.round(((heading % 360) + 360) % 360)
      : null;

  // Intento 1: En modo vehículo con rumbo conocido, obligar a continuar de frente y restringir la salida al cono de avance
  if (travelMode === 'driving' && cleanHeading !== null) {
    const proxyUrl = `/api/route?origin=${encodeURIComponent(originStr)}&destination=${encodeURIComponent(destStr)}&profile=driving&continue_straight=true&bearings=${encodeURIComponent(`${cleanHeading},50;`)}&strict=true`;
    let candidateData = await queryOSRMWithTimeout(proxyUrl, scaleTimeout(8500), abortSignal);
    if (!candidateData) {
      const bearingsParam = `&continue_straight=true&bearings=${cleanHeading},50;`;
      const attemptUrl = `https://router.project-osrm.org/route/v1/driving/${originStr};${destStr}?overview=full&geometries=geojson&steps=true&alternatives=true${bearingsParam}`;
      candidateData = await queryOSRMWithTimeout(attemptUrl, scaleTimeout(7000), abortSignal);
    }
    if (candidateData) {
      const nonUTurnRoutes = candidateData.routes.filter((r: any) => !routeContainsUTurn(r, cleanHeading));
      if (nonUTurnRoutes.length > 0) {
        candidateData.routes = nonUTurnRoutes;
        data = candidateData;
      }
    }
  }

  // Intento 2 (Rodear la manzana): Si el destino está lejos (> 150m) y requiere retroceder o intento 1 no encontró ruta limpia,
  // proyectamos un waypoint 75m hacia adelante para obligar al vehículo a pasar la siguiente esquina y rodear la manzana
  const directDistanceMeters = calculateDistanceMeters(
    safeOrigin.lat,
    safeOrigin.lng,
    destination.lat,
    destination.lng
  );
  if (!data && travelMode === 'driving' && cleanHeading !== null && directDistanceMeters > 150) {
    const forwardDist = 75; // 75 metros adelante en la dirección de la flecha
    const fLat = safeOrigin.lat + (forwardDist / 111320) * Math.cos((cleanHeading * Math.PI) / 180);
    const fLng =
      safeOrigin.lng +
      (forwardDist / (111320 * Math.cos((safeOrigin.lat * Math.PI) / 180))) *
        Math.sin((cleanHeading * Math.PI) / 180);
    const wpStr = `${fLng.toFixed(6)},${fLat.toFixed(6)}`;

    const proxyWpUrl = `/api/route?origin=${encodeURIComponent(originStr)}&waypoint=${encodeURIComponent(wpStr)}&destination=${encodeURIComponent(destStr)}&profile=driving&continue_straight=true&strict=true`;
    data = await queryOSRMWithTimeout(proxyWpUrl, scaleTimeout(8500), abortSignal);
    if (!data) {
      const forwardWaypointUrl = `https://router.project-osrm.org/route/v1/driving/${originStr};${wpStr};${destStr}?overview=full&geometries=geojson&steps=true&continue_straight=true`;
      data = await queryOSRMWithTimeout(forwardWaypointUrl, scaleTimeout(7000), abortSignal);
    }
  }

  // Intento 3a: Proxy multi-motor en servidor (/api/route: OSRM + radio ilimitado + OSM.de + Valhalla)
  if (!data) {
    const bearingsParam =
      travelMode === 'driving' && cleanHeading !== null ? `&bearings=${encodeURIComponent(`${cleanHeading},60;`)}` : '';
    const straightParam = travelMode === 'driving' && (cleanHeading !== null || isRecalculation) ? '&continue_straight=true' : '';
    const proxyGeneralUrl = `/api/route?origin=${encodeURIComponent(originStr)}&destination=${encodeURIComponent(destStr)}&profile=${profile}${straightParam}${bearingsParam}&tscale=${timeoutScale.toFixed(2)}`;
    data = await queryOSRMWithTimeout(proxyGeneralUrl, scaleTimeout(12000), abortSignal);
  }

  // Intento 3b (Respaldo directo cliente sin restricciones de rumbo ni exclusiones)
  if (!data) {
    const simpleUrl = `https://router.project-osrm.org/route/v1/${profile}/${originStr};${destStr}?overview=full&geometries=geojson&steps=true&alternatives=true`;
    data = await queryOSRMWithTimeout(simpleUrl, scaleTimeout(9000), abortSignal);
  }

  // Intento 3c (Respaldo directo con radio ilimitado si algún punto cayó dentro de un parque, campus o zona peatonal)
  if (!data) {
    const wideRadiusUrl = `https://router.project-osrm.org/route/v1/${profile}/${originStr};${destStr}?overview=full&geometries=geojson&steps=true&alternatives=true&radiuses=unlimited;unlimited`;
    data = await queryOSRMWithTimeout(wideRadiusUrl, scaleTimeout(9000), abortSignal);
  }

  // Intento 4 (Servidor OSRM secundario OpenStreetMap.de directo ante saturación o caídas de router.project-osrm.org)
  if (!data) {
    const osmDeRouter = travelMode === 'walking' ? 'routed-foot' : 'routed-car';
    const secondaryUrl = `https://routing.openstreetmap.de/${osmDeRouter}/route/v1/driving/${originStr};${destStr}?overview=full&geometries=geojson&steps=true&alternatives=true`;
    data = await queryOSRMWithTimeout(secondaryUrl, scaleTimeout(10000), abortSignal);
  }

  // Fallback to driving profile if foot profile is unreachable or returns error
  if (!data && travelMode === 'walking') {
    const footFallbackPrimary = `https://router.project-osrm.org/route/v1/driving/${originStr};${destStr}?overview=full&geometries=geojson&steps=true&alternatives=true`;
    data = await queryOSRMWithTimeout(footFallbackPrimary, scaleTimeout(9000), abortSignal);
    if (!data) {
      const footFallbackSecondary = `https://routing.openstreetmap.de/routed-car/route/v1/driving/${originStr};${destStr}?overview=full&geometries=geojson&steps=true&alternatives=true`;
      data = await queryOSRMWithTimeout(footFallbackSecondary, scaleTimeout(9000), abortSignal);
    }
  }

  // Último respaldo si el origen quedó fuera de Perú (p. ej. GPS de navegador en otro continente) y el destino está en Perú
  if (!data && isCoordWithinPeru(destination) && !isCoordWithinPeru(safeOrigin)) {
    const fallbackOriginCoords = getFallbackOrigin();
    const limaFallbackOrigin = `${fallbackOriginCoords.lng.toFixed(6)},${fallbackOriginCoords.lat.toFixed(6)}`;
    const proxyLimaUrl = `/api/route?origin=${encodeURIComponent(limaFallbackOrigin)}&destination=${encodeURIComponent(destStr)}&profile=${profile}&tscale=${timeoutScale.toFixed(2)}`;
    data = await queryOSRMWithTimeout(proxyLimaUrl, scaleTimeout(10000), abortSignal);
    if (!data) {
      const primaryLimaUrl = `https://router.project-osrm.org/route/v1/${profile}/${limaFallbackOrigin};${destStr}?overview=full&geometries=geojson&steps=true&alternatives=true`;
      data = await queryOSRMWithTimeout(primaryLimaUrl, scaleTimeout(9000), abortSignal);
    }
    if (!data) {
      const osmDeRouter = travelMode === 'walking' ? 'routed-foot' : 'routed-car';
      const secondaryLimaUrl = `https://routing.openstreetmap.de/${osmDeRouter}/route/v1/driving/${limaFallbackOrigin};${destStr}?overview=full&geometries=geojson&steps=true&alternatives=true`;
      data = await queryOSRMWithTimeout(secondaryLimaUrl, scaleTimeout(9000), abortSignal);
    }
  }

  if (!data || data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      throw new Error('Sin conexión. Mostrando el último mapa guardado');
    }
    const modeName = travelMode === 'walking' ? 'a pie' : 'en vehículo';
    throw new Error(`No se encontró una ruta transitable ${modeName} entre estos puntos.`);
  }

  // Genuine route filtering if avoidance was requested
  let validRawRoutes: any[] = [...data.routes];
  if (avoidOptions && (avoidOptions.tolls || avoidOptions.highways || avoidOptions.unpaved)) {
    validRawRoutes = validRawRoutes.filter((r) => !isRouteMatchingAvoidCriteria(r, avoidOptions));

    // Si no queda ninguna alternativa que evite esas vías, avisa exactamente "No encontramos una ruta que evite eso"
    if (validRawRoutes.length === 0) {
      throw new Error('No encontramos una ruta que evite eso');
    }
  }

  // Si tenemos opciones sin giros en U, descartamos cualquier opción que contenga retorno en U
  if (travelMode === 'driving' && cleanHeading !== null) {
    const cleanRoutes = validRawRoutes.filter((r) => !routeContainsUTurn(r, cleanHeading));
    if (cleanRoutes.length > 0) {
      validRawRoutes = cleanRoutes;
    }
  }

  // Parse all genuine routes returned by OSRM with originCoords anchored to user GPS
  const parsedRoutesList: RouteData[] = validRawRoutes.map((r: any, idx: number) =>
    parseOSRMRoute(r, idx, destination, destinationName, travelMode, origin)
  );

  // Penalizar fuertemente cualquier ruta con retorno en U al ordenar
  parsedRoutesList.forEach((r) => {
    const hasU = r.steps.some(
      (s) =>
        s.modifier === 'uturn' ||
        s.instruction.toLowerCase().includes('en u') ||
        s.instruction.toLowerCase().includes('u-turn')
    );
    (r as any)._penalty = hasU ? 999999 : 0;
  });

  // Sort by duration + penalty first so fastest genuine route is kept during deduplication
  parsedRoutesList.sort((a, b) => {
    const scoreA = a.duration + ((a as any)._penalty || 0);
    const scoreB = b.duration + ((b as any)._penalty || 0);
    return scoreA - scoreB;
  });

  // Deduplicate identical or near-identical routes so the user never sees repeated options
  const areRoutesDuplicate = (a: RouteData, b: RouteData): boolean => {
    if (!a.coordinates.length || !b.coordinates.length) return false;
    const minDist = Math.min(a.distance, b.distance);
    const distDiff = Math.abs(a.distance - b.distance);
    const durDiff = Math.abs(a.duration - b.duration);
    if (distDiff > Math.max(90, minDist * 0.03) || durDiff > 25) {
      return false;
    }

    const sampleFractions = [0.15, 0.3, 0.45, 0.6, 0.75, 0.9];
    let maxSepMeters = 0;
    for (const frac of sampleFractions) {
      const idxA = Math.min(a.coordinates.length - 1, Math.floor(a.coordinates.length * frac));
      const ptA = a.coordinates[idxA];
      const sepA = getDistanceToRoute({ lat: ptA[0], lng: ptA[1] }, b.coordinates);
      if (sepA > maxSepMeters) maxSepMeters = sepA;
      if (maxSepMeters > 45) return false;

      const idxB = Math.min(b.coordinates.length - 1, Math.floor(b.coordinates.length * frac));
      const ptB = b.coordinates[idxB];
      const sepB = getDistanceToRoute({ lat: ptB[0], lng: ptB[1] }, a.coordinates);
      if (sepB > maxSepMeters) maxSepMeters = sepB;
      if (maxSepMeters > 45) return false;
    }
    return true;
  };

  const uniqueRoutes: RouteData[] = [];
  for (const candidate of parsedRoutesList) {
    if (!uniqueRoutes.some((existing) => areRoutesDuplicate(existing, candidate))) {
      uniqueRoutes.push(candidate);
      if (uniqueRoutes.length >= 3) break;
    }
  }

  const fastestRoute = uniqueRoutes[0];
  const sorted = uniqueRoutes;

  // Identify single shortest-distance option among alternatives (if strictly shorter than fastest)
  let shortestAltIdx = -1;
  if (fastestRoute && sorted.length > 1) {
    let minAltDist = fastestRoute.distance - 10;
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].distance < minAltDist) {
        minAltDist = sorted[i].distance;
        shortestAltIdx = i;
      }
    }
  }

  // Colors according to requirements:
  // Ruta principal (0): Azul
  // Ruta alternativa 1 (1): Verde
  // Ruta alternativa 2 (2): Morado
  const colorThemes: Array<'blue' | 'green' | 'purple'> = ['blue', 'green', 'purple'];

  sorted.forEach((r, idx) => {
    r.colorIndex = idx;
    r.colorTheme = colorThemes[idx] || 'blue';

    if (idx === 0) {
      r.classification = 'fastest';
      r.diffTimeText = travelMode === 'walking' ? 'Ruta principal recomendada' : 'Ruta principal • Más rápida';
      r.diffDistanceText = formatDistance(r.distance);
    } else if (idx === shortestAltIdx) {
      r.classification = 'shortest';
      const timeDiffMins = Math.round((r.duration - fastestRoute.duration) / 60);
      const distDiffKm = ((fastestRoute.distance - r.distance) / 1000).toFixed(1);
      r.diffTimeText = timeDiffMins > 0 ? `+${timeDiffMins} min` : 'Mismo tiempo';
      r.diffDistanceText = `-${distDiffKm} km`;
    } else {
      r.classification = 'alternative';
      const timeDiffMins = Math.round((r.duration - fastestRoute.duration) / 60);
      r.diffTimeText = timeDiffMins > 0 ? `+${timeDiffMins} min` : 'Tiempo similar';
      r.diffDistanceText = formatDistance(r.distance);
    }
  });

  return sorted;
}

/**
 * Backwards compatible helper returning single fastest route
 */
export async function fetchOSRMRoute(
  origin: Coordinates,
  destination: Coordinates,
  destinationName: string = 'Destino',
  travelMode: TravelMode = 'driving',
  avoidOptions?: AvoidOptions
): Promise<RouteData> {
  const routes = await fetchOSRMRoutes(origin, destination, destinationName, travelMode, avoidOptions);
  return routes[0];
}

/**
 * Calculates perpendicular distance in meters to the planned route using segment projections
 */
export function getDistanceToRoute(
  currentPos: Coordinates,
  routeCoordinates: [number, number][]
): number {
  if (!routeCoordinates || routeCoordinates.length < 2) return Infinity;

  const latP = currentPos.lat;
  const lngP = currentPos.lng;
  let minDistance = Infinity;

  for (let i = 0; i < routeCoordinates.length - 1; i++) {
    const [latA, lngA] = routeCoordinates[i];
    const [latB, lngB] = routeCoordinates[i + 1];

    // Quick bounding box filter to avoid trigonometric math on far segments
    const minLat = Math.min(latA, latB) - 0.003;
    const maxLat = Math.max(latA, latB) + 0.003;
    const minLng = Math.min(lngA, lngB) - 0.003;
    const maxLng = Math.max(lngA, lngB) + 0.003;

    if (latP < minLat || latP > maxLat || lngP < minLng || lngP > maxLng) {
      continue;
    }

    const cosLat = Math.cos(((latA + latB) / 2) * (Math.PI / 180));
    const dx = (lngB - lngA) * cosLat;
    const dy = latB - latA;
    const lenSq = dx * dx + dy * dy;

    let t = 0;
    if (lenSq > 0) {
      t = Math.max(0, Math.min(1, (((lngP - lngA) * cosLat) * dx + (latP - latA) * dy) / lenSq));
    }

    const projLat = latA + t * (latB - latA);
    const projLng = lngA + t * (lngB - lngA);
    const dist = calculateDistanceMeters(latP, lngP, projLat, projLng);

    if (dist < minDistance) {
      minDistance = dist;
    }
  }

  // If bounding box filtered all or edge cases, check sample vertices
  if (minDistance === Infinity) {
    for (let i = 0; i < routeCoordinates.length; i += 3) {
      const [lat, lng] = routeCoordinates[i];
      const dist = calculateDistanceMeters(latP, lngP, lat, lng);
      if (dist < minDistance) {
        minDistance = dist;
      }
    }
  }

  return minDistance;
}

/**
 * Checks if the vehicle is off the planned route (perpendicular distance to all segments > maxThresholdMeters)
 * Uses true segment projection math to prevent false off-route triggers on long road segments.
 */
export function isVehicleOffRoute(
  currentPos: Coordinates,
  routeCoordinates: [number, number][],
  maxThresholdMeters: number = 65
): boolean {
  const dist = getDistanceToRoute(currentPos, routeCoordinates);
  return dist > maxThresholdMeters;
}

/**
 * Finds the current active maneuver step based on current position and forward progress along the route
 */
export function findCurrentStep(
  currentPos: Coordinates,
  steps: RouteStep[],
  routeCoordinates?: [number, number][]
): { currentStep: RouteStep; distanceToStep: number; nextStep?: RouteStep; stepIndex: number } {
  if (!steps || steps.length === 0) {
    return {
      currentStep: {
        distance: 0,
        duration: 0,
        instruction: 'Sigue la ruta marcada',
        type: 'continue',
        name: '',
        coordinates: [currentPos.lat, currentPos.lng],
      },
      distanceToStep: 0,
      stepIndex: 0,
    };
  }

  if (steps.length === 1) {
    const dist = calculateDistanceMeters(
      currentPos.lat,
      currentPos.lng,
      steps[0].coordinates[0],
      steps[0].coordinates[1]
    );
    return { currentStep: steps[0], distanceToStep: Math.round(dist), stepIndex: 0 };
  }

  // When routeCoordinates is available, track progress along route geometry
  if (routeCoordinates && routeCoordinates.length >= 2) {
    // 1. Find user's closest segment along routeCoordinates using perpendicular projection
    let minUserDist = Infinity;
    let userSegIdx = 0;
    let userProjPoint: [number, number] = routeCoordinates[0];

    for (let i = 0; i < routeCoordinates.length - 1; i++) {
      const a = routeCoordinates[i];
      const b = routeCoordinates[i + 1];

      // Quick bounding box filter
      if (
        Math.abs(currentPos.lat - a[0]) > 0.005 &&
        Math.abs(currentPos.lat - b[0]) > 0.005 &&
        Math.abs(currentPos.lng - a[1]) > 0.005 &&
        Math.abs(currentPos.lng - b[1]) > 0.005
      ) {
        continue;
      }

      const midLat = ((a[0] + b[0]) / 2) * (Math.PI / 180);
      const kx = Math.cos(midLat) * 111320;
      const ky = 110540;
      const dx = (b[1] - a[1]) * kx;
      const dy = (b[0] - a[0]) * ky;
      const lenSq = dx * dx + dy * dy;

      let t = 0;
      if (lenSq > 0) {
        const px = (currentPos.lng - a[1]) * kx;
        const py = (currentPos.lat - a[0]) * ky;
        t = Math.max(0, Math.min(1, (px * dx + py * dy) / lenSq));
      }

      const projLat = a[0] + t * (b[0] - a[0]);
      const projLng = a[1] + t * (b[1] - a[1]);
      const d = calculateDistanceMeters(currentPos.lat, currentPos.lng, projLat, projLng);

      if (d < minUserDist) {
        minUserDist = d;
        userSegIdx = i;
        userProjPoint = [projLat, projLng];
      }
    }

    // 2. Pre-map each step's maneuver location to a monotonically increasing vertex index along routeCoordinates
    const stepVertexIndices: number[] = new Array(steps.length);
    stepVertexIndices[0] = 0;
    let searchStartVertex = 0;

    for (let s = 1; s < steps.length; s++) {
      const stepCoord = steps[s].coordinates;
      let closestVertex = searchStartVertex;
      let minStepDist = Infinity;

      // Monotonically search from previous step's vertex onwards
      for (let j = searchStartVertex; j < routeCoordinates.length; j++) {
        const d = calculateDistanceMeters(
          stepCoord[0],
          stepCoord[1],
          routeCoordinates[j][0],
          routeCoordinates[j][1]
        );
        if (d < minStepDist) {
          minStepDist = d;
          closestVertex = j;
          if (d < 5) break; // Exact match found
        }
      }
      stepVertexIndices[s] = closestVertex;
      searchStartVertex = closestVertex;
    }

    // 3. Find the first upcoming maneuver step ahead of user
    let targetIndex = steps.length - 1;
    for (let s = 1; s < steps.length; s++) {
      const stepVertex = stepVertexIndices[s];
      const distToManeuverPoint = calculateDistanceMeters(
        currentPos.lat,
        currentPos.lng,
        steps[s].coordinates[0],
        steps[s].coordinates[1]
      );

      // If user is before this step's vertex along the polyline:
      if (userSegIdx < stepVertex) {
        targetIndex = s;
        break;
      }

      // If user is on the same segment as the maneuver vertex:
      // Check if user has not yet passed the maneuver coordinates (distance > 12m)
      if (userSegIdx === stepVertex && distToManeuverPoint > 12) {
        targetIndex = s;
        break;
      }

      // If user has reached or passed this vertex and distance is small (<= 12m), or user is ahead (userSegIdx > stepVertex),
      // this maneuver is completed; proceed to check the next step s + 1
    }

    const currentStep = steps[targetIndex] || steps[steps.length - 1];

    // 4. Calculate accurate distance along route geometry to the upcoming maneuver
    let distanceToStep = 0;
    const targetVertex = stepVertexIndices[targetIndex] ?? (routeCoordinates.length - 1);

    if (userSegIdx < targetVertex) {
      // Distance from user to end of current segment
      distanceToStep = calculateDistanceMeters(
        userProjPoint[0],
        userProjPoint[1],
        routeCoordinates[userSegIdx + 1][0],
        routeCoordinates[userSegIdx + 1][1]
      );
      // Distance along intermediate route vertices
      for (let k = userSegIdx + 1; k < targetVertex; k++) {
        distanceToStep += calculateDistanceMeters(
          routeCoordinates[k][0],
          routeCoordinates[k][1],
          routeCoordinates[k + 1][0],
          routeCoordinates[k + 1][1]
        );
      }
      // Distance from target vertex to exact step maneuver location
      distanceToStep += calculateDistanceMeters(
        routeCoordinates[targetVertex][0],
        routeCoordinates[targetVertex][1],
        currentStep.coordinates[0],
        currentStep.coordinates[1]
      );
    } else {
      distanceToStep = calculateDistanceMeters(
        currentPos.lat,
        currentPos.lng,
        currentStep.coordinates[0],
        currentStep.coordinates[1]
      );
    }

    distanceToStep = Math.max(0, Math.round(distanceToStep));
    const nextStep = steps[targetIndex + 1];

    return { currentStep, distanceToStep, nextStep, stepIndex: targetIndex };
  }

  // Fallback if no routeCoordinates
  let targetIndex = 1;
  for (let i = 1; i < steps.length; i++) {
    const dist = calculateDistanceMeters(
      currentPos.lat,
      currentPos.lng,
      steps[i].coordinates[0],
      steps[i].coordinates[1]
    );
    if (dist > 15) {
      targetIndex = i;
      break;
    }
  }

  const currentStep = steps[targetIndex] || steps[steps.length - 1];
  const distanceToStep = Math.max(
    0,
    Math.round(
      calculateDistanceMeters(
        currentPos.lat,
        currentPos.lng,
        currentStep.coordinates[0],
        currentStep.coordinates[1]
      )
    )
  );
  const nextStep = steps[targetIndex + 1];

  return { currentStep, distanceToStep, nextStep, stepIndex: targetIndex };
}

/**
 * Calculates forward azimuth (bearing) from coordinate 1 to coordinate 2 in degrees (0 - 360)
 */
export function calculateBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const y = Math.sin(((lon2 - lon1) * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180);
  const x =
    Math.cos((lat1 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180) -
    Math.sin((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.cos(((lon2 - lon1) * Math.PI) / 180);
  const bearing = (Math.atan2(y, x) * 180) / Math.PI;
  return (bearing + 360) % 360;
}

/**
 * Projects a coordinate onto the nearest segment of an OSRM route polyline (Snap-to-Route / Map Matching)
 * Only snaps when vehicle is within maxThresholdMeters (default 26m) of the route.
 * When deviated (> maxThresholdMeters), returns raw coordinates so user sees actual off-route position.
 */
export function snapPointToRoute(
  point: Coordinates,
  routeCoordinates: [number, number][],
  maxThresholdMeters: number = 26
): {
  snappedCoords: Coordinates;
  distanceToRoute: number;
  isSnapped: boolean;
  segmentBearing?: number;
} {
  if (!routeCoordinates || routeCoordinates.length < 2) {
    return { snappedCoords: point, distanceToRoute: 0, isSnapped: false };
  }

  const latP = point.lat;
  const lngP = point.lng;
  let minDistance = Infinity;
  let bestLat = latP;
  let bestLng = lngP;
  let bestBearing: number | undefined;

  for (let i = 0; i < routeCoordinates.length - 1; i++) {
    const [latA, lngA] = routeCoordinates[i];
    const [latB, lngB] = routeCoordinates[i + 1];

    // Quick bounding box filter to avoid trigonometric calculations on distant segments
    if (Math.abs(latP - latA) > 0.004 && Math.abs(latP - latB) > 0.004) {
      continue;
    }

    const cosLat = Math.cos(((latA + latB) / 2) * (Math.PI / 180));
    const dx = (lngB - lngA) * cosLat;
    const dy = latB - latA;
    const lenSq = dx * dx + dy * dy;

    let t = 0;
    if (lenSq > 0) {
      t = Math.max(0, Math.min(1, (((lngP - lngA) * cosLat) * dx + (latP - latA) * dy) / lenSq));
    }

    const projLat = latA + t * (latB - latA);
    const projLng = lngA + t * (lngB - lngA);
    const dist = calculateDistanceMeters(latP, lngP, projLat, projLng);

    if (dist < minDistance) {
      minDistance = dist;
      bestLat = projLat;
      bestLng = projLng;
      bestBearing = calculateBearing(latA, lngA, latB, lngB);
    }
  }

  if (minDistance <= maxThresholdMeters) {
    return {
      snappedCoords: { lat: bestLat, lng: bestLng },
      distanceToRoute: minDistance,
      isSnapped: true,
      segmentBearing: bestBearing,
    };
  }

  return {
    snappedCoords: point,
    distanceToRoute: minDistance,
    isSnapped: false,
    segmentBearing: undefined,
  };
}
