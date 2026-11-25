import { InspectorSubtype, PoliceSubtype, TrafficAlert, TrafficAlertType } from '../types/navigation';
import { getPoliceSubtypeLabel, normalizePoliceSubtype } from './policeReports';
import { getInspectorSubtypeLabel, normalizeInspectorSubtype } from './inspectorReports';

const DEVICE_USER_ID_KEY = 'ruta_lima_device_user_id';
const VOTED_ALERTS_KEY = 'ruta_lima_voted_alert_ids';

/**
 * Duraciones originales por tipo de advertencia según especificación:
 * - Policía y Varado: 45 minutos.
 * - Tráfico y Accidente: 90 minutos.
 * - Peligro y Semáforo dañado: 3 horas.
 * - Vía Cerrada: 6 horas.
 * - Obras y Bache: 3 días.
 */
export const INSPECTOR_FADE_START_MS = 60 * 60 * 1000; // 60 minutos
export const INSPECTOR_MAX_AGE_MS = 2 * 60 * 60 * 1000; // 2 horas

export const getAlertOriginalDuration = (type: TrafficAlertType): number => {
  switch (type) {
    case 'police':
    case 'stopped_vehicle':
      return 45 * 60 * 1000; // 45 minutos
    case 'traffic':
    case 'accident':
    case 'speed_camera':
      return 90 * 60 * 1000; // 90 minutos
    case 'inspectors':
      return INSPECTOR_MAX_AGE_MS; // 2 horas
    case 'hazard':
    case 'broken_light':
    case 'flood':
      return 3 * 60 * 60 * 1000; // 3 horas
    case 'road_closed':
      return 6 * 60 * 60 * 1000; // 6 horas
    case 'construction':
    case 'pothole':
      return 3 * 24 * 60 * 60 * 1000; // 3 días
    default:
      return 90 * 60 * 1000;
  }
};

/**
 * Nombre amigable en español para la pregunta: "¿Sigue ahí [tipo de reporte]?"
 */
export const getAlertQuestionName = (
  type: TrafficAlertType,
  policeSubtype?: PoliceSubtype,
  inspectorSubtype?: InspectorSubtype
): string => {
  switch (type) {
    case 'police':
      return `el ${getPoliceSubtypeLabel(normalizePoliceSubtype(policeSubtype)).toLowerCase()}`;
    case 'inspectors':
      return `el control de ${getInspectorSubtypeLabel(normalizeInspectorSubtype(inspectorSubtype))}`;
    case 'speed_camera':
      return 'el radar temporal';
    case 'flood':
      return 'la inundación';
    case 'accident':
      return 'el accidente';
    case 'traffic':
      return 'el tráfico pesado';
    case 'road_closed':
      return 'la vía cerrada';
    case 'construction':
      return 'la obra en la vía';
    case 'hazard':
      return 'el peligro en la calzada';
    case 'stopped_vehicle':
      return 'el vehículo averiado';
    case 'pothole':
      return 'el bache';
    case 'broken_light':
      return 'el semáforo dañado';
    default:
      return 'la advertencia vial';
  }
};

/**
 * Identificador único y persistente del conductor en este dispositivo
 */
export const getDeviceUserId = (): string => {
  try {
    let id = localStorage.getItem(DEVICE_USER_ID_KEY);
    if (!id) {
      id = 'driver_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now().toString(36);
      localStorage.setItem(DEVICE_USER_ID_KEY, id);
    }
    return id;
  } catch {
    return 'driver_local_client';
  }
};

/**
 * Obtiene los IDs de alertas por las cuales este conductor ya votó
 */
export const getVotedAlertIds = (): Set<string> => {
  try {
    const raw = localStorage.getItem(VOTED_ALERTS_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        return new Set(arr);
      }
    }
  } catch (e) {
    console.warn('Error reading voted alerts', e);
  }
  return new Set();
};

/**
 * Registra que el conductor ya votó por una advertencia para que no vuelva a votar
 */
export const addVotedAlertId = (alertId: string): void => {
  try {
    const current = getVotedAlertIds();
    current.add(alertId);
    localStorage.setItem(VOTED_ALERTS_KEY, JSON.stringify(Array.from(current)));
  } catch (e) {
    console.warn('Error saving voted alert', e);
  }
};

/**
 * Determina si una advertencia ya superó su tiempo de vida.
 * Para reportes de inspectores, siempre expiran máximo a las 2 horas desde su reporte.
 */
export const isAlertExpired = (alert: TrafficAlert, now: number = Date.now()): boolean => {
  if (alert.status === 'resolved') return true;
  if (alert.type === 'inspectors' && now - alert.timestamp >= INSPECTOR_MAX_AGE_MS) {
    return true;
  }
  const expiry = alert.expiresAt || alert.timestamp + getAlertOriginalDuration(alert.type);
  return expiry <= now;
};

/**
 * Calcula la opacidad visual en mapa para reportes de inspectores:
 * - < 60 minutos: opacidad 1.0
 * - 60 a 120 minutos: desvanecimiento gradual de 1.0 a 0.25
 */
export const getInspectorMarkerOpacity = (alert: TrafficAlert, now: number = Date.now()): number => {
  if (alert.type !== 'inspectors') return 1;
  const ageMs = Math.max(0, now - alert.timestamp);
  if (ageMs <= INSPECTOR_FADE_START_MS) return 1;
  if (ageMs >= INSPECTOR_MAX_AGE_MS) return 0;
  const progress = (ageMs - INSPECTOR_FADE_START_MS) / (INSPECTOR_MAX_AGE_MS - INSPECTOR_FADE_START_MS);
  return Math.max(0.25, Number((1 - progress * 0.75).toFixed(2)));
};

/**
 * Formato de tiempo relativo (ej. "hace 5 min", "hace 1 h 10 min")
 */
export const formatRelativeTime = (timestamp: number, now: number = Date.now()): string => {
  const elapsedMs = Math.max(0, now - timestamp);
  const totalMinutes = Math.floor(elapsedMs / (60 * 1000));
  if (totalMinutes < 1) return 'hace un momento';
  if (totalMinutes < 60) return `hace ${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  return mins > 0 ? `hace ${hours} h ${mins} min` : `hace ${hours} h`;
};

/**
 * Formato amigable de tiempo restante (ej. "38 min", "2 h 15 min", "2 días")
 */
export const formatAlertRemainingTime = (alert: TrafficAlert, now: number = Date.now()): string => {
  const rawExpiry = alert.expiresAt || alert.timestamp + getAlertOriginalDuration(alert.type);
  const expiry =
    alert.type === 'inspectors'
      ? Math.min(rawExpiry, alert.timestamp + INSPECTOR_MAX_AGE_MS)
      : rawExpiry;
  const remainingMs = expiry - now;

  if (remainingMs <= 0) return 'Vencido';

  const totalMinutes = Math.floor(remainingMs / (60 * 1000));
  if (totalMinutes < 60) {
    return `${Math.max(1, totalMinutes)} min`;
  }

  const totalHours = Math.floor(totalMinutes / 60);
  const remMinutes = totalMinutes % 60;
  if (totalHours < 24) {
    return remMinutes > 0 ? `${totalHours} h ${remMinutes} min` : `${totalHours} h`;
  }

  const totalDays = Math.floor(totalHours / 24);
  const remHours = totalHours % 24;
  return remHours > 0 ? `${totalDays} d ${remHours} h` : `${totalDays} días`;
};

const LIMA_ZONES: Array<{ name: string; lat: number; lng: number }> = [
  { name: 'Cercado de Lima', lat: -12.0464, lng: -77.0428 },
  { name: 'Miraflores', lat: -12.1219, lng: -77.0297 },
  { name: 'San Isidro', lat: -12.0977, lng: -77.0365 },
  { name: 'San Borja', lat: -12.0992, lng: -77.0011 },
  { name: 'Santiago de Surco', lat: -12.138, lng: -76.993 },
  { name: 'Barranco', lat: -12.1487, lng: -77.0222 },
  { name: 'Chorrillos', lat: -12.1706, lng: -77.0182 },
  { name: 'Jesús María', lat: -12.078, lng: -77.048 },
  { name: 'Lince', lat: -12.085, lng: -77.034 },
  { name: 'La Victoria', lat: -12.072, lng: -77.019 },
  { name: 'Magdalena del Mar', lat: -12.091, lng: -77.071 },
  { name: 'Pueblo Libre', lat: -12.076, lng: -77.063 },
  { name: 'San Miguel', lat: -12.0768, lng: -77.0805 },
  { name: 'Callao', lat: -12.052, lng: -77.118 },
  { name: 'Los Olivos', lat: -11.992, lng: -77.071 },
  { name: 'Independencia', lat: -12.001, lng: -77.054 },
  { name: 'San Martín de Porres', lat: -12.012, lng: -77.082 },
  { name: 'San Juan de Lurigancho', lat: -12.002, lng: -77.004 },
  { name: 'Ate', lat: -12.043, lng: -76.942 },
  { name: 'Santa Anita', lat: -12.044, lng: -76.971 },
  { name: 'San Juan de Miraflores', lat: -12.1554, lng: -76.9818 },
  { name: 'Villa El Salvador', lat: -12.212, lng: -76.939 },
  { name: 'La Molina', lat: -12.078, lng: -76.943 },
  { name: 'Rímac', lat: -12.027, lng: -77.036 },
  { name: 'Breña', lat: -12.059, lng: -77.052 },
];

export const getLimaZoneFallback = (lat: number, lng: number): string => {
  let closest = LIMA_ZONES[0].name;
  let bestDistSq = Infinity;
  for (const z of LIMA_ZONES) {
    const dLat = lat - z.lat;
    const dLng = lng - z.lng;
    const distSq = dLat * dLat + dLng * dLng;
    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      closest = z.name;
    }
  }
  return closest;
};

export async function reverseGeocodeLimaZone(
  lat: number,
  lng: number
): Promise<{ zone: string; address: string }> {
  const fallbackZone = getLimaZoneFallback(lat, lng);
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=17&addressdetails=1`;
    const res = await fetch(url, {
      headers: {
        'Accept-Language': 'es',
        'User-Agent': 'RutaLima-GPS-App/1.0',
      },
    });
    if (!res.ok) return { zone: fallbackZone, address: fallbackZone };
    const data = await res.json();
    const addr = data?.address || {};
    const road = addr.road || addr.pedestrian || addr.avenue || addr.street || '';
    const district =
      addr.city_district || addr.suburb || addr.neighbourhood || addr.quarter || addr.town || fallbackZone;
    const formatted = road && district ? `${road}, ${district}` : road || district || fallbackZone;
    return {
      zone: district || fallbackZone,
      address: formatted,
    };
  } catch {
    return { zone: fallbackZone, address: fallbackZone };
  }
}
