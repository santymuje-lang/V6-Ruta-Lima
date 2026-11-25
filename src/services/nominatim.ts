import { Coordinates, MapPOI, SearchPlaceCategory, SearchResult } from '../types/navigation';
import { getAllCachedPois } from './overpassPoi';
import { getLimaZoneFallback } from './alertLifecycle';
import { calculateDistanceMeters } from './osrm';
import { PERU_REGIONS } from '../data/fixedRadars';

export interface SearchPlacesOptions {
  userCoords?: Coordinates;
  localPois?: MapPOI[];
}

// Pre-curated list of well-known Lima landmarks for instant, offline & ultra-fast search
export const POPULAR_LIMA_PLACES: SearchResult[] = [
  {
    id: 'lima_larcomar',
    name: 'Larcomar',
    display_name: 'Malecón de la Reserva 610, Miraflores, Lima',
    lat: -12.1317,
    lng: -77.0305,
    district: 'Miraflores',
    category: 'shopping',
    placeTypeLabel: 'Centro comercial',
  },
  {
    id: 'lima_plaza_san_miguel',
    name: 'Plaza San Miguel',
    display_name: 'Av. La Marina 2000, San Miguel, Lima',
    lat: -12.0768,
    lng: -77.0805,
    district: 'San Miguel',
    category: 'shopping',
  },
  {
    id: 'lima_plaza_lima_sur',
    name: 'Plaza Lima Sur',
    display_name: 'Av. Paseo de la República s/n, Chorrillos, Lima',
    lat: -12.1706,
    lng: -77.0182,
    district: 'Chorrillos',
    category: 'shopping',
  },
  {
    id: 'lima_plaza_norte',
    name: 'Plaza Norte',
    display_name: 'Av. Alfredo Mendiola 1400, Independencia, Lima',
    lat: -12.0069,
    lng: -77.0592,
    district: 'Independencia',
    category: 'shopping',
  },
  {
    id: 'lima_real_plaza_salaverry',
    name: 'Real Plaza Salaverry',
    display_name: 'Av. Gral. Salaverry 2370, Jesús María, Lima',
    lat: -12.0886,
    lng: -77.0519,
    district: 'Jesús María',
    category: 'shopping',
  },
  {
    id: 'lima_jockey_plaza',
    name: 'Jockey Plaza',
    display_name: 'Av. Javier Prado Este 4200, Santiago de Surco, Lima',
    lat: -12.0863,
    lng: -76.9749,
    district: 'Santiago de Surco',
    category: 'shopping',
  },
  {
    id: 'lima_aeropuerto',
    name: 'Aeropuerto Internacional Jorge Chávez',
    display_name: 'Av. Elmer Faucett s/n, Callao, Lima',
    lat: -12.0219,
    lng: -77.1143,
    district: 'Callao',
    category: 'airport',
  },
  {
    id: 'lima_parque_kennedy',
    name: 'Parque Kennedy',
    display_name: 'Av. José Larco / Diagonal, Miraflores, Lima',
    lat: -12.1219,
    lng: -77.0297,
    district: 'Miraflores',
    category: 'landmark',
  },
  {
    id: 'lima_plaza_mayor',
    name: 'Plaza Mayor de Lima (Plaza de Armas)',
    display_name: 'Jirón de la Unión s/n, Centro Histórico de Lima',
    lat: -12.0464,
    lng: -77.0428,
    district: 'Cercado de Lima',
    category: 'landmark',
  },
  {
    id: 'lima_real_plaza_centro_civico',
    name: 'Real Plaza Centro Cívico',
    display_name: 'Av. Inca Garcilaso de la Vega 1337, Cercado de Lima',
    lat: -12.0573,
    lng: -77.0372,
    district: 'Cercado de Lima',
    category: 'shopping',
  },
  {
    id: 'lima_estadio_nacional',
    name: 'Estadio Nacional del Perú',
    display_name: 'Calle José Díaz s/n, Santa Beatriz, Lima',
    lat: -12.0672,
    lng: -77.0336,
    district: 'Cercado de Lima',
    category: 'landmark',
  },
  {
    id: 'lima_parque_de_las_leyendas',
    name: 'Parque de las Leyendas',
    display_name: 'Av. Parque de las Leyendas 580, San Miguel, Lima',
    lat: -12.0734,
    lng: -77.0868,
    district: 'San Miguel',
    category: 'landmark',
  },
  {
    id: 'lima_costa_verde',
    name: 'Circuito de Playas Costa Verde',
    display_name: 'Malecón Costa Verde, Miraflores / Barranco, Lima',
    lat: -12.1388,
    lng: -77.0275,
    district: 'Barranco',
    category: 'beach',
  },
  {
    id: 'lima_puente_suspiros',
    name: 'Puente de los Suspiros',
    display_name: 'Jirón Batalla de Ayacucho, Barranco, Lima',
    lat: -12.1487,
    lng: -77.0222,
    district: 'Barranco',
    category: 'landmark',
  },
  {
    id: 'lima_mall_del_sur',
    name: 'Mall del Sur',
    display_name: 'Av. Los Lirios / Panamericana Sur, San Juan de Miraflores',
    lat: -12.1554,
    lng: -76.9818,
    district: 'San Juan de Miraflores',
    category: 'shopping',
  },
];

// Distritos de Lima Metropolitana y Callao (con variantes comunes sin tilde o abreviadas)
const LIMA_CALLAO_DISTRICTS: { norm: string; canonical: string }[] = [
  { norm: 'carmen de la legua reynoso', canonical: 'Carmen de la Legua Reynoso' },
  { norm: 'san juan de lurigancho', canonical: 'San Juan de Lurigancho' },
  { norm: 'san juan de miraflores', canonical: 'San Juan de Miraflores' },
  { norm: 'villa maria del triunfo', canonical: 'Villa María del Triunfo' },
  { norm: 'san martin de porres', canonical: 'San Martín de Porres' },
  { norm: 'santa maria del mar', canonical: 'Santa María del Mar' },
  { norm: 'santiago de surco', canonical: 'Santiago de Surco' },
  { norm: 'villa el salvador', canonical: 'Villa El Salvador' },
  { norm: 'magdalena del mar', canonical: 'Magdalena del Mar' },
  { norm: 'carmen de la legua', canonical: 'Carmen de la Legua Reynoso' },
  { norm: 'lurigancho-chosica', canonical: 'Lurigancho-Chosica' },
  { norm: 'cercado de lima', canonical: 'Cercado de Lima' },
  { norm: 'centro de lima', canonical: 'Cercado de Lima' },
  { norm: 'lima cercado', canonical: 'Cercado de Lima' },
  { norm: 'puente piedra', canonical: 'Puente Piedra' },
  { norm: 'punta hermosa', canonical: 'Punta Hermosa' },
  { norm: 'pueblo libre', canonical: 'Pueblo Libre' },
  { norm: 'independencia', canonical: 'Independencia' },
  { norm: 'el agustino', canonical: 'El Agustino' },
  { norm: 'punta negra', canonical: 'Punta Negra' },
  { norm: 'jesus maria', canonical: 'Jesús María' },
  { norm: 'la victoria', canonical: 'La Victoria' },
  { norm: 'santa anita', canonical: 'Santa Anita' },
  { norm: 'san bartolo', canonical: 'San Bartolo' },
  { norm: 'cieneguilla', canonical: 'Cieneguilla' },
  { norm: 'los olivos', canonical: 'Los Olivos' },
  { norm: 'chaclacayo', canonical: 'Chaclacayo' },
  { norm: 'chorrillos', canonical: 'Chorrillos' },
  { norm: 'carabayllo', canonical: 'Carabayllo' },
  { norm: 'miraflores', canonical: 'Miraflores' },
  { norm: 'pachacamac', canonical: 'Pachacámac' },
  { norm: 'san isidro', canonical: 'San Isidro' },
  { norm: 'san miguel', canonical: 'San Miguel' },
  { norm: 'santa rosa', canonical: 'Santa Rosa' },
  { norm: 'ventanilla', canonical: 'Ventanilla' },
  { norm: 'bellavista', canonical: 'Bellavista' },
  { norm: 'lurigancho', canonical: 'Lurigancho' },
  { norm: 'la molina', canonical: 'La Molina' },
  { norm: 'san borja', canonical: 'San Borja' },
  { norm: 'magdalena', canonical: 'Magdalena del Mar' },
  { norm: 'surquillo', canonical: 'Surquillo' },
  { norm: 'barranco', canonical: 'Barranco' },
  { norm: 'la perla', canonical: 'La Perla' },
  { norm: 'la punta', canonical: 'La Punta' },
  { norm: 'san luis', canonical: 'San Luis' },
  { norm: 'pucusana', canonical: 'Pucusana' },
  { norm: 'chosica', canonical: 'Chosica' },
  { norm: 'mi peru', canonical: 'Mi Perú' },
  { norm: 'callao', canonical: 'Callao' },
  { norm: 'ancon', canonical: 'Ancón' },
  { norm: 'brena', canonical: 'Breña' },
  { norm: 'comas', canonical: 'Comas' },
  { norm: 'lince', canonical: 'Lince' },
  { norm: 'lurin', canonical: 'Lurín' },
  { norm: 'rimac', canonical: 'Rímac' },
  { norm: 'surco', canonical: 'Santiago de Surco' },
  { norm: 'lima', canonical: 'Lima' },
  { norm: 'ate', canonical: 'Ate' },
];

type RoadKind = 'avenida' | 'jiron' | 'calle' | 'pasaje' | 'other';

function normalizeAccents(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeRoadAbbreviations(text: string): {
  text: string;
  roadKind: RoadKind;
} {
  let result = text
    .replace(/(^|[\s,])avda\.?(?=\s|$)/gi, '$1Avenida')
    .replace(/(^|[\s,])av\.?(?=\s|$)/gi, '$1Avenida')
    .replace(/(^|[\s,])jr\.?(?=\s|$)/gi, '$1Jirón')
    .replace(/(^|[\s,])cl\.?(?=\s|$)/gi, '$1Calle')
    .replace(/(^|[\s,])psje\.?(?=\s|$)/gi, '$1Pasaje')
    .replace(/(^|[\s,])pje\.?(?=\s|$)/gi, '$1Pasaje')
    .replace(/\s+/g, ' ')
    .trim();

  const norm = normalizeAccents(result).toLowerCase();
  let roadKind: RoadKind = 'other';
  if (/^(avenida|av\b)/.test(norm)) roadKind = 'avenida';
  else if (/^(jiron|jr\b)/.test(norm)) roadKind = 'jiron';
  else if (/^(calle|cl\b)/.test(norm)) roadKind = 'calle';
  else if (/^(pasaje|psje\b|pje\b)/.test(norm)) roadKind = 'pasaje';

  return { text: result, roadKind };
}

function getStreetFallbackNotice(roadKind: RoadKind): string {
  switch (roadKind) {
    case 'avenida':
      return 'No se encontró el número exacto, se muestra la avenida';
    case 'jiron':
      return 'No se encontró el número exacto, se muestra el jirón';
    case 'calle':
      return 'No se encontró el número exacto, se muestra la calle';
    case 'pasaje':
      return 'No se encontró el número exacto, se muestra el pasaje';
    default:
      return 'No se encontró el número exacto, se muestra la vía';
  }
}

function appendLimaPeruIfNeeded(raw: string): string {
  const cleaned = raw.replace(/\s+/g, ' ').trim().replace(/,+$/, '');
  const norm = normalizeAccents(cleaned).toLowerCase();
  const hasPeru = /\bperu\b/.test(norm);
  const hasLimaOrCallao = /\b(lima|callao)\b/.test(norm);

  if (hasPeru && hasLimaOrCallao) return cleaned;
  if (hasLimaOrCallao && !hasPeru) return `${cleaned}, Perú`;
  if (hasPeru && !hasLimaOrCallao) {
    return cleaned.replace(/,?\s*per[uú]\s*$/i, ', Lima, Perú');
  }
  return `${cleaned}, Lima, Perú`;
}

// Añade ", Perú" (sin forzar Lima) para buscar en todo el país
function appendPeruIfNeeded(raw: string): string {
  const cleaned = raw.replace(/\s+/g, ' ').trim().replace(/,+$/, '');
  if (/\bperu\b/.test(normalizeAccents(cleaned).toLowerCase())) return cleaned;
  return `${cleaned}, Perú`;
}

// Ciudades con dos nombres: lo que escribe la gente -> nombre con el que figura en el mapa
const PERU_CITY_ALIASES: Record<string, string[]> = {
  huamanga: ['Ayacucho, Ayacucho', 'Huamanga, Ayacucho'],
  ayacucho: ['Ayacucho, Ayacucho'],
  'san juan bautista de huamanga': ['Ayacucho, Ayacucho'],
  cuzco: ['Cusco'],
  qosqo: ['Cusco'],
  'nuevo chimbote': ['Nuevo Chimbote, Áncash'],
  chimbote: ['Chimbote, Áncash'],
  'cerro de pasco': ['Cerro de Pasco, Pasco', 'Chaupimarca, Pasco'],
  'huancayo ciudad': ['Huancayo, Junín'],
};

function getPeruCityAliasQueries(rawQuery: string): string[] {
  const norm = normalizeAccents(rawQuery)
    .toLowerCase()
    .replace(/,?\s*per[uú]\s*$/i, '')
    .replace(/[^a-z0-9ñ\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const targets = PERU_CITY_ALIASES[norm];
  return targets ? targets.map((name) => `${name}, Perú`) : [];
}

interface ParsedAddress {
  rawQuery: string;
  normalizedQuery: string;
  streetOnly: string;
  district: string | null;
  houseNumber: string | null;
  roadKind: RoadKind;
}

function parsePeruvianAddress(raw: string): ParsedAddress {
  const cleaned = raw.replace(/\s+/g, ' ').trim();
  const { text: normalizedFull, roadKind } = normalizeRoadAbbreviations(cleaned);

  // Quitar sufijos explícitos de país o metrópoli al final para analizar distrito + número
  let core = cleaned
    .replace(/,?\s*(per[uú]|lima metropolitana)\s*$/i, '')
    .trim()
    .replace(/,+$/, '')
    .trim();

  // Si termina en ", Lima" pero ya hay otro segmento previo con coma, quitar ese ", Lima" de ciudad
  const commaParts = core
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  if (
    commaParts.length >= 2 &&
    normalizeAccents(commaParts[commaParts.length - 1]).toLowerCase() === 'lima'
  ) {
    commaParts.pop();
    core = commaParts.join(', ');
  }

  let district: string | null = null;
  let streetAndNumber = core;

  // 1) Intentar extraer distrito cuando viene separado por coma
  const parts = core
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);

  if (parts.length >= 2) {
    const lastPart = parts[parts.length - 1];
    const lastNorm = normalizeAccents(lastPart).toLowerCase();
    const matched = LIMA_CALLAO_DISTRICTS.find((d) => d.norm === lastNorm);
    if (matched) {
      district = matched.canonical;
      streetAndNumber = parts.slice(0, -1).join(', ').trim();
    } else if (!/^\d+$/.test(lastNorm)) {
      // Zona o urbanización escrita después de coma (ej. Monterrico, Santa Beatriz)
      district = lastPart;
      streetAndNumber = parts.slice(0, -1).join(', ').trim();
    }
  } else {
    // 2) Intentar extraer distrito al final sin coma y sin tilde (ej. "Av. Angamos 345 Surquillo")
    const coreNorm = normalizeAccents(core).toLowerCase();
    for (const d of LIMA_CALLAO_DISTRICTS) {
      const idx = coreNorm.lastIndexOf(` ${d.norm}`);
      if (idx > 0 && idx + 1 + d.norm.length === coreNorm.length) {
        const prefixNorm = coreNorm.slice(0, idx).trim();
        // Evitar confundir nombres de vía como "Avenida Lima" o "Calle Callao" con un distrito
        const withoutRoadPrefix = prefixNorm
          .replace(/^(avenida|avda\.?|av\.?|jiron|jr\.?|calle|cl\.?|pasaje|psje\.?|pje\.?)\s+/i, '')
          .trim();
        if (withoutRoadPrefix.length >= 2) {
          district = d.canonical;
          // Tomar el prefijo preservando los caracteres originales hasta la longitud equivalente
          const wordsToDrop = d.norm.split(' ').length;
          const originalWords = core.split(/\s+/);
          streetAndNumber = originalWords.slice(0, Math.max(1, originalWords.length - wordsToDrop)).join(' ').trim();
          break;
        }
      }
    }
  }

  // Extraer número de puerta o cuadra al final de streetAndNumber (respetando vías como "28 de Julio" o "Calle 2")
  let houseNumber: string | null = null;
  let streetPart = streetAndNumber.replace(/,+$/, '').trim();

  const numMatch = streetPart.match(
    /^(.*?)\s+(?:n[°º]|nro\.?|#|cuadra|cdra\.?)?\s*(\d{1,5}(?:\s*[-]?\s*[a-zA-Z])?)$/i
  );
  if (numMatch) {
    const candidateStreet = numMatch[1].trim();
    const candidateNum = numMatch[2].trim();
    const candidateWithoutRoad = normalizeAccents(candidateStreet)
      .toLowerCase()
      .replace(/^(avenida|avda\.?|av\.?|jiron|jr\.?|calle|cl\.?|pasaje|psje\.?|pje\.?|malecon|alameda|prolongacion)\s*/i, '')
      .trim();
    // Solo considerarlo número de inmueble si queda un nombre de vía real (no vaciar "Calle 2")
    if (candidateWithoutRoad.length >= 2) {
      streetPart = candidateStreet;
      houseNumber = candidateNum;
    }
  }

  const normalizedStreetRes = normalizeRoadAbbreviations(streetPart);

  return {
    rawQuery: cleaned,
    normalizedQuery: normalizedFull,
    streetOnly: normalizedStreetRes.text,
    district,
    houseNumber,
    roadKind: normalizedStreetRes.roadKind !== 'other' ? normalizedStreetRes.roadKind : roadKind,
  };
}

function isInLimaOrCallao(item: any): boolean {
  const lat = parseFloat(item.lat);
  const lon = parseFloat(item.lon);
  const address = item.address || {};
  const geoFields = normalizeAccents(
    [
      address.state,
      address.region,
      address.county,
      address.city,
      address.province,
      address.state_district,
      item.display_name,
    ]
      .filter(Boolean)
      .join(' ')
  ).toLowerCase();

  const mentionsLimaOrCallao = /\b(lima|callao)\b/.test(geoFields);
  const inMetroBounds =
    !Number.isNaN(lat) &&
    !Number.isNaN(lon) &&
    lat >= -12.55 &&
    lat <= -11.55 &&
    lon >= -77.25 &&
    lon <= -76.6;

  return inMetroBounds || mentionsLimaOrCallao;
}

function rankNominatimResults(items: any[], parsed: ParsedAddress, userCoords?: Coordinates): any[] {
  const targetDistrictNorm = parsed.district
    ? normalizeAccents(parsed.district).toLowerCase()
    : '';
  const targetNumberNorm = parsed.houseNumber
    ? normalizeAccents(parsed.houseNumber).toLowerCase().replace(/[^a-z0-9]/g, '')
    : '';
  const targetStreetNorm = normalizeAccents(parsed.streetOnly).toLowerCase();

  const scored = items.map((item, idx) => {
    let score = 0;
    const addr = item.address || {};

    if (userCoords) {
      // Cerca de donde estás ahora (en cualquier ciudad del Perú)
      const itemLat = parseFloat(item.lat);
      const itemLng = parseFloat(item.lon);
      if (Number.isFinite(itemLat) && Number.isFinite(itemLng)) {
        const km = calculateDistanceMeters(userCoords.lat, userCoords.lng, itemLat, itemLng) / 1000;
        if (km <= 40) score += 100;
        else if (km <= 120) score += 60;
        else if (km <= 400) score += 25;
      }
    } else if (isInLimaOrCallao(item)) {
      score += 100;
    }

    if (targetDistrictNorm) {
      const resultLocText = normalizeAccents(
        [
          addr.suburb,
          addr.neighbourhood,
          addr.city_district,
          addr.quarter,
          addr.town,
          addr.city,
          item.display_name,
        ]
          .filter(Boolean)
          .join(' ')
      ).toLowerCase();
      if (resultLocText.includes(targetDistrictNorm)) {
        score += 45;
      }
    }

    if (targetNumberNorm && addr.house_number) {
      const itemNumNorm = normalizeAccents(String(addr.house_number))
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
      if (itemNumNorm === targetNumberNorm) {
        score += 30;
      } else if (itemNumNorm.includes(targetNumberNorm)) {
        score += 15;
      }
    }

    const roadNorm = normalizeAccents(String(addr.road || item.name || '')).toLowerCase();
    if (roadNorm && targetStreetNorm && (roadNorm.includes(targetStreetNorm) || targetStreetNorm.includes(roadNorm))) {
      score += 12;
    }

    return { item, score, idx };
  });

  scored.sort((a, b) => (b.score !== a.score ? b.score - a.score : a.idx - b.idx));
  return scored.map((s) => s.item);
}

function itemMatchesHouseNumber(item: any, houseNumber: string | null): boolean {
  if (!houseNumber) return true;
  const addrHouse = item?.address?.house_number;
  if (!addrHouse) return false;
  const targetDigits = houseNumber.replace(/\D/g, '');
  const foundNorm = normalizeAccents(String(addrHouse)).toLowerCase();
  if (foundNorm.includes(normalizeAccents(houseNumber).toLowerCase())) return true;
  if (targetDigits && foundNorm.replace(/\D/g, '') === targetDigits) return true;
  return false;
}

async function queryNominatim(
  searchQuery: string,
  signal?: AbortSignal,
  biasCenter?: Coordinates
): Promise<any[]> {
  const encoded = encodeURIComponent(searchQuery);
  // Preferencia (no obligatoria) por la zona donde estás; sin ubicación, la de Lima como antes
  let viewbox = '-77.30,-11.75,-76.70,-12.35';
  if (biasCenter && Number.isFinite(biasCenter.lat) && Number.isFinite(biasCenter.lng)) {
    const d = 0.35;
    viewbox = `${(biasCenter.lng - d).toFixed(4)},${(biasCenter.lat + d).toFixed(4)},${(biasCenter.lng + d).toFixed(4)},${(biasCenter.lat - d).toFixed(4)}`;
  }
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encoded}&viewbox=${viewbox}&bounded=0&countrycodes=pe&limit=7&addressdetails=1`;

  // Cada intento tiene su propio límite (4,5 s) y se reintenta una vez si el servidor está saturado (429/5xx)
  for (let attempt = 0; attempt < 2; attempt++) {
    if (signal?.aborted) {
      const abortErr = new Error('Aborted');
      abortErr.name = 'AbortError';
      throw abortErr;
    }
    const attemptController = new AbortController();
    const onOuterAbort = () => attemptController.abort();
    signal?.addEventListener('abort', onOuterAbort);
    const attemptTimer = setTimeout(() => attemptController.abort(), 4500);
    try {
      const response = await fetch(url, {
        signal: attemptController.signal,
        headers: {
          'Accept-Language': 'es',
          'User-Agent': 'RutaLima-GPS-App/1.0',
        },
      });
      if (response.ok) {
        const data = await response.json();
        return Array.isArray(data) ? data : [];
      }
      if (response.status !== 429 && response.status < 500) return [];
    } catch (err: any) {
      // Cancelación real del usuario: se propaga. Tiempo agotado de este intento: se reintenta / sigue al siguiente paso
      if (signal?.aborted) throw err;
    } finally {
      clearTimeout(attemptTimer);
      signal?.removeEventListener('abort', onOuterAbort);
    }
    if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 700));
  }
  return [];
}

/**
 * Respaldo: Photon (también basado en OpenStreetMap). Se usa solo si Nominatim no devolvió nada.
 * Devuelve elementos con la misma forma que Nominatim para reutilizar el resto del flujo.
 */
async function queryPhoton(
  searchQuery: string,
  signal?: AbortSignal,
  biasCenter?: Coordinates
): Promise<any[]> {
  const attemptController = new AbortController();
  const onOuterAbort = () => attemptController.abort();
  signal?.addEventListener('abort', onOuterAbort);
  const timer = setTimeout(() => attemptController.abort(), 5000);
  try {
    const bias =
      biasCenter && Number.isFinite(biasCenter.lat) && Number.isFinite(biasCenter.lng)
        ? `&lat=${biasCenter.lat.toFixed(4)}&lon=${biasCenter.lng.toFixed(4)}`
        : '';
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(searchQuery)}&limit=7&lang=es${bias}`;
    const response = await fetch(url, { signal: attemptController.signal });
    if (!response.ok) return [];
    const json = await response.json();
    const features: any[] = Array.isArray(json?.features) ? json.features : [];
    return features
      .filter((f) => f?.properties?.countrycode === 'PE' && Array.isArray(f?.geometry?.coordinates))
      .map((f, i) => {
        const p = f.properties || {};
        const [lon, lat] = f.geometry.coordinates;
        const road = p.street || (p.osm_key === 'highway' ? p.name : undefined);
        const displayName = [
          p.name,
          p.housenumber && p.street ? `${p.street} ${p.housenumber}` : p.street,
          p.district || p.locality,
          p.city || p.county,
          p.state,
          'Perú',
        ]
          .filter(Boolean)
          .join(', ');
        return {
          place_id: `photon_${p.osm_type || 'x'}${p.osm_id || i}`,
          lat: String(lat),
          lon: String(lon),
          name: p.name || '',
          display_name: displayName,
          class: p.osm_key,
          type: p.osm_value,
          address: {
            road,
            house_number: p.housenumber,
            suburb: p.district || p.locality,
            city: p.city,
            county: p.county,
            state: p.state,
          },
        };
      });
  } catch (err: any) {
    if (signal?.aborted) throw err;
    return [];
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onOuterAbort);
  }
}

/**
 * Searches places in Lima & Callao (Peru) using a hybrid tolerant strategy:
 * 1. Checks matching local famous places (accent-insensitive)
 * 2. Executes progressive Nominatim fallbacks when full addresses aren't found:
 *    - Step 1: Full query + "Lima, Perú"
 *    - Step 2: Normalized road types (Av.->Avenida, Jr.->Jirón, Cl.->Calle, Psje.->Pasaje)
 *    - Step 3: Street + district without house number
 *    - Step 4: Street only + "Lima, Perú"
 */
function phoneticEs(value: string): string {
  return normalizeAccents(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/ll/g, 'y')
    .replace(/qu([ei])/g, 'k$1')
    .replace(/c([ei])/g, 's$1')
    .replace(/c/g, 'k')
    .replace(/z/g, 's')
    .replace(/v/g, 'b')
    .replace(/g([ei])/g, 'j$1')
    .replace(/h/g, '')
    .replace(/([a-z])\1+/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > 2) return 99;
  const prev = new Array(lb + 1);
  const curr = new Array(lb + 1);
  for (let j = 0; j <= lb; j++) prev[j] = j;
  for (let i = 1; i <= la; i++) {
    curr[0] = i;
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= lb; j++) prev[j] = curr[j];
  }
  return prev[lb];
}

function scoreTextMatch(query: string, ...fields: Array<string | undefined>): number {
  const qNorm = normalizeAccents(query).toLowerCase();
  const qPhon = phoneticEs(query);
  if (!qNorm || qNorm.length < 3) return 0;

  const combinedNorm = normalizeAccents(fields.filter(Boolean).join(' ')).toLowerCase();
  const combinedPhon = phoneticEs(fields.filter(Boolean).join(' '));
  if (!combinedNorm) return 0;

  const primaryNorm = normalizeAccents(fields[0] || '').toLowerCase();

  if (primaryNorm === qNorm) return 200;
  if (primaryNorm.startsWith(qNorm)) return 160;
  if (combinedNorm.includes(qNorm)) return 140;
  if (qPhon.length >= 3 && combinedPhon.includes(qPhon)) return 120;

  // Coincidencia parcial palabra por palabra (ej. "Rodrigo Lasso" -> "Clínica Rodrigo Lazo")
  const qWords = qNorm.split(/\s+/).filter((w) => w.length >= 2);
  const qPhonWords = qPhon.split(/\s+/).filter((w) => w.length >= 2);
  if (qWords.length === 0) return 0;

  const candWordsNorm = combinedNorm.split(/\s+/).filter(Boolean);
  const candWordsPhon = combinedPhon.split(/\s+/).filter(Boolean);

  let matchedWords = 0;
  for (let i = 0; i < qWords.length; i++) {
    const qw = qWords[i];
    const qpw = qPhonWords[i] || phoneticEs(qw);

    const directHit =
      combinedNorm.includes(qw) ||
      (qpw.length >= 2 && combinedPhon.includes(qpw));

    if (directHit) {
      matchedWords++;
      continue;
    }

    if (qw.length >= 4) {
      const fuzzyHit =
        candWordsNorm.some((cw) => cw.length >= 3 && levenshtein(qw, cw) <= 1) ||
        candWordsPhon.some((cpw) => cpw.length >= 3 && levenshtein(qpw, cpw) <= 1);
      if (fuzzyHit) {
        matchedWords++;
      }
    }
  }

  if (matchedWords === qWords.length) {
    return 90 + matchedWords * 10;
  }

  return 0;
}

function classifyMapPoi(poi: MapPOI): {
  category: SearchPlaceCategory;
  placeTypeLabel: string;
} {
  const nameNorm = normalizeAccents(poi.name).toLowerCase();
  switch (poi.category) {
    case 'hospital':
      if (
        poi.amenityTag === 'clinic' ||
        poi.amenityTag === 'doctors' ||
        /\b(clinica|policlinico|centro medico|posta|consultorio)\b/.test(nameNorm)
      ) {
        return { category: 'clinic', placeTypeLabel: 'Clínica' };
      }
      return { category: 'hospital', placeTypeLabel: 'Hospital' };
    case 'pharmacy':
      return { category: 'pharmacy', placeTypeLabel: 'Farmacia' };
    case 'school':
      return { category: 'school', placeTypeLabel: 'Colegio' };
    case 'institute':
      return { category: 'university', placeTypeLabel: 'Instituto' };
    case 'university':
      return { category: 'university', placeTypeLabel: 'Universidad' };
    case 'military_academy':
      return { category: 'school', placeTypeLabel: 'Academia / Escuela' };
    case 'restaurant':
      return { category: 'restaurant', placeTypeLabel: 'Restaurante' };
    case 'cafe':
      return { category: 'cafe', placeTypeLabel: 'Cafetería' };
    case 'supermarket':
      return {
        category: 'supermarket',
        placeTypeLabel: poi.amenityTag === 'mall' ? 'Centro comercial' : 'Tienda / Supermercado',
      };
    case 'fuel':
      return { category: 'fuel', placeTypeLabel: 'Grifo' };
    case 'bank':
      return { category: 'bank', placeTypeLabel: 'Banco' };
    case 'police':
      return { category: 'police', placeTypeLabel: 'Comisaría' };
    case 'fire_station':
      return { category: 'fire_station', placeTypeLabel: 'Bomberos' };
    case 'park':
      return { category: 'park', placeTypeLabel: 'Parque' };
    case 'hotel':
      return { category: 'hotel', placeTypeLabel: 'Hotel' };
    case 'bus_stop':
      return { category: 'bus_stop', placeTypeLabel: 'Paradero' };
    case 'subway':
      return { category: 'subway', placeTypeLabel: 'Estación' };
    default:
      return { category: 'landmark', placeTypeLabel: 'Lugar' };
  }
}

function classifyNominatimItem(item: any): {
  category: SearchPlaceCategory;
  placeTypeLabel: string;
} {
  const cls = String(item.class || '').toLowerCase();
  const type = String(item.type || '').toLowerCase();
  const addrType = String(item.addresstype || '').toLowerCase();
  const addr = item.address || {};
  const nameNorm = normalizeAccents(
    String(item.name || addr.road || item.display_name || '')
  ).toLowerCase();

  if (
    type === 'clinic' ||
    type === 'doctors' ||
    type === 'dentist' ||
    /\b(clinica|policlinico|centro medico|posta)\b/.test(nameNorm)
  ) {
    return { category: 'clinic', placeTypeLabel: 'Clínica' };
  }
  if (type === 'hospital' || /\bhospital\b/.test(nameNorm)) {
    return { category: 'hospital', placeTypeLabel: 'Hospital' };
  }
  if (type === 'pharmacy' || /\b(farmacia|botica|inkafarma|mifarma)\b/.test(nameNorm)) {
    return { category: 'pharmacy', placeTypeLabel: 'Farmacia' };
  }
  if (
    type === 'school' ||
    type === 'kindergarten' ||
    /\b(colegio|escuela|i\.?e\.?|institucion educativa)\b/.test(nameNorm)
  ) {
    return { category: 'school', placeTypeLabel: 'Colegio' };
  }
  if (type === 'university' || type === 'college' || /\b(universidad|instituto)\b/.test(nameNorm)) {
    return { category: 'university', placeTypeLabel: 'Universidad / Instituto' };
  }
  if (type === 'restaurant' || type === 'fast_food' || type === 'food_court') {
    return { category: 'restaurant', placeTypeLabel: 'Restaurante' };
  }
  if (type === 'cafe' || type === 'bakery') {
    return { category: 'cafe', placeTypeLabel: 'Cafetería' };
  }
  if (type === 'supermarket') {
    return { category: 'supermarket', placeTypeLabel: 'Supermercado' };
  }
  if (cls === 'shop' || type === 'mall' || type === 'department_store') {
    return {
      category: 'shopping',
      placeTypeLabel: type === 'mall' ? 'Centro comercial' : 'Tienda',
    };
  }
  if (type === 'fuel') {
    return { category: 'fuel', placeTypeLabel: 'Grifo' };
  }
  if (type === 'bank' || type === 'atm') {
    return { category: 'bank', placeTypeLabel: 'Banco' };
  }
  if (type === 'police') {
    return { category: 'police', placeTypeLabel: 'Comisaría' };
  }
  if (type === 'fire_station') {
    return { category: 'fire_station', placeTypeLabel: 'Bomberos' };
  }
  if (type === 'park' || type === 'garden' || cls === 'leisure') {
    return { category: 'park', placeTypeLabel: 'Parque' };
  }
  if (type === 'hotel' || type === 'hostel' || type === 'guest_house') {
    return { category: 'hotel', placeTypeLabel: 'Hotel' };
  }
  if (cls === 'aeroway') {
    return { category: 'airport', placeTypeLabel: 'Aeropuerto' };
  }
  if (type === 'bus_stop' || type === 'station' || cls === 'railway') {
    return {
      category: cls === 'railway' ? 'subway' : 'bus_stop',
      placeTypeLabel: cls === 'railway' ? 'Estación' : 'Paradero',
    };
  }
  if (
    cls === 'boundary' ||
    cls === 'place' ||
    ['suburb', 'quarter', 'neighbourhood', 'city_district', 'district', 'city', 'town', 'village'].includes(
      addrType
    ) ||
    ['suburb', 'quarter', 'neighbourhood', 'city_district', 'administrative', 'city', 'town'].includes(type)
  ) {
    return { category: 'district', placeTypeLabel: 'Distrito' };
  }
  if (cls === 'highway' || addr.road || addr.pedestrian) {
    if (
      /^(av\.?|avenida|autopista|carretera|via expresa|circuito|panamericana)\b/.test(nameNorm) ||
      ['trunk', 'motorway', 'primary', 'secondary'].includes(type)
    ) {
      return { category: 'avenue', placeTypeLabel: 'Avenida' };
    }
    if (/^(jr\.?|jiron)\b/.test(nameNorm)) {
      return { category: 'street', placeTypeLabel: 'Jirón' };
    }
    if (/^(psje\.?|pje\.?|pasaje)\b/.test(nameNorm)) {
      return { category: 'street', placeTypeLabel: 'Pasaje' };
    }
    return { category: 'street', placeTypeLabel: 'Calle' };
  }
  return { category: 'landmark', placeTypeLabel: 'Lugar' };
}

function buildLocalSuggestions(
  query: string,
  userCoords?: Coordinates,
  passedPois?: MapPOI[]
): SearchResult[] {
  const candidates: Array<SearchResult & { _score: number; _dist: number }> = [];
  const seenKeys = new Set<string>();

  const tryAdd = (place: SearchResult) => {
    const score = scoreTextMatch(query, place.name, place.display_name, place.district);
    if (score <= 0) return;

    const dedupeKey = `${normalizeAccents(place.name).toLowerCase()}_${place.lat.toFixed(3)}_${place.lng.toFixed(3)}`;
    if (seenKeys.has(dedupeKey)) return;
    seenKeys.add(dedupeKey);

    const dist = userCoords
      ? calculateDistanceMeters(userCoords.lat, userCoords.lng, place.lat, place.lng)
      : 0;

    candidates.push({ ...place, _score: score, _dist: dist });
  };

  // 1) Lugares cargados en la app (clínicas, hospitales, colegios, etc.)
  const mergedPois = [...(passedPois || []), ...getAllCachedPois()];
  for (const poi of mergedPois) {
    if (!poi.name || poi.hasCustomName === false) continue;
    const { category, placeTypeLabel } = classifyMapPoi(poi);
    const approxDistrict = getLimaZoneFallback(poi.lat, poi.lng);
    tryAdd({
      id: `poi_${poi.id}`,
      name: poi.name,
      display_name: `${placeTypeLabel} · ${approxDistrict}`,
      lat: poi.lat,
      lng: poi.lng,
      district: approxDistrict,
      category,
      placeTypeLabel,
    });
  }

  // 2) Lugares populares pre-cargados de Lima
  for (const place of POPULAR_LIMA_PLACES) {
    tryAdd({
      ...place,
      placeTypeLabel:
        place.placeTypeLabel ||
        (place.category === 'shopping'
          ? 'Centro comercial'
          : place.category === 'airport'
          ? 'Aeropuerto'
          : place.category === 'beach'
          ? 'Vía / Circuito'
          : 'Lugar'),
    });
  }

  // Ordenar primero por cercanía a la ubicación actual (y en empate, mejor coincidencia)
  candidates.sort((a, b) => {
    if (userCoords && Math.abs(a._dist - b._dist) > 120) {
      return a._dist - b._dist;
    }
    return b._score - a._score;
  });

  return candidates.map(({ _score: _s, _dist: _d, ...rest }) => rest);
}

/**
 * Searches places in Lima & Callao (Peru) using a hybrid tolerant strategy:
 * 1. Searches local cached POIs & famous Lima places (partial & phonetic matching, closest first)
 * 2. Executes progressive Nominatim fallbacks when full addresses/names aren't found:
 *    - Step 1: Full query + "Lima, Perú"
 *    - Step 2: Normalized road types (Av.->Avenida, Jr.->Jirón, Cl.->Calle, Psje.->Pasaje)
 *    - Step 3: Street + district without house number
 *    - Step 4: Street only + "Lima, Perú"
 *    - Step 5: Orthographic/phonetic Spanish variant for name queries (e.g. ss->z/s) if needed
 */
export async function searchPlacesInLima(
  query: string,
  signal?: AbortSignal,
  options?: SearchPlacesOptions
): Promise<SearchResult[]> {
  const rawTrimmed = query.trim();
  const cleanNorm = normalizeAccents(rawTrimmed).toLowerCase();
  if (cleanNorm.length < 3) return [];

  const userCoords = options?.userCoords;

  // 1. Buscar primero en lugares ya cargados en la app (clínicas, colegios, hospitales, etc.) y lugares populares
  const localMatches = buildLocalSuggestions(rawTrimmed, userCoords, options?.localPois);

  // 2. Build progressive fallback steps
  const parsed = parsePeruvianAddress(rawTrimmed);
  const steps: { query: string; isNoNumberStep: boolean }[] = [];
  const seenQueries = new Set<string>();

  const pushStep = (q: string, isNoNumberStep: boolean) => {
    const trimmedQ = q.replace(/\s+/g, ' ').trim();
    const key = normalizeAccents(trimmedQ).toLowerCase();
    if (trimmedQ.length >= 3 && !seenQueries.has(key)) {
      seenQueries.add(key);
      steps.push({ query: trimmedQ, isNoNumberStep });
    }
  };

  // Paso 0: Ciudades con dos nombres (ej. "Huamanga" también busca "Ayacucho")
  const aliasQueries = getPeruCityAliasQueries(rawTrimmed);
  aliasQueries.forEach((q) => pushStep(q, false));

  // Paso 1: Dirección/nombre completo tal como se escribió + "Perú" (todo el país)
  pushStep(appendPeruIfNeeded(rawTrimmed), false);
  const hasExplicitLima = /\b(lima|callao)\b/.test(cleanNorm);
  if (hasExplicitLima) {
    pushStep(appendLimaPeruIfNeeded(rawTrimmed), false);
  }

  // Paso 2: Dirección con tipos de vía normalizados (Av. -> Avenida, Jr. -> Jirón, Cl. -> Calle, Psje. -> Pasaje)
  if (parsed.normalizedQuery) {
    const normalizedWithDistrict = parsed.district
      ? `${parsed.streetOnly}${parsed.houseNumber ? ` ${parsed.houseNumber}` : ''}, ${parsed.district}`
      : parsed.normalizedQuery;
    pushStep(appendPeruIfNeeded(parsed.normalizedQuery), false);
    pushStep(appendPeruIfNeeded(normalizedWithDistrict), false);
  }

  // Paso 3: Vía y distrito, sin el número
  if (parsed.houseNumber && parsed.district && parsed.streetOnly) {
    pushStep(appendPeruIfNeeded(`${parsed.streetOnly}, ${parsed.district}`), true);
  }

  // Paso 4: Solo la vía con la ciudad ("Lima, Perú")
  if (parsed.streetOnly && (parsed.houseNumber || parsed.district)) {
    pushStep(`${parsed.streetOnly}, Lima, Perú`, true);
  }

  // Respaldo clásico de Lima: se intenta al final por si la búsqueda nacional no encontró nada
  pushStep(appendLimaPeruIfNeeded(rawTrimmed), false);

  // Paso 5 (solo si es búsqueda de nombre sin número y pasos previos no hallaron resultados): variante ortográfica común en español
  if (!parsed.houseNumber && /(ss|z|s)/.test(cleanNorm)) {
    const variantZ = rawTrimmed.replace(/ss/gi, 'z').replace(/s(?=[aeiouáéíóú])/gi, 'z');
    const variantS = rawTrimmed.replace(/ss/gi, 's').replace(/z/gi, 's');
    if (variantZ !== rawTrimmed) pushStep(appendPeruIfNeeded(variantZ), false);
    if (variantS !== rawTrimmed) pushStep(appendPeruIfNeeded(variantS), false);
  }

  try {
    let rawData: any[] = [];
    let usedNoNumberStep = false;

    // Solo exigimos resultado en Lima/Callao si el usuario escribió un distrito de Lima/Callao
    const districtNormForLima = parsed.district ? normalizeAccents(parsed.district).toLowerCase() : '';
    const requireLimaHit = Boolean(
      districtNormForLima &&
        LIMA_CALLAO_DISTRICTS.some(
          (d) => d.norm === districtNormForLima || normalizeAccents(d.canonical).toLowerCase() === districtNormForLima
        )
    );

    // Resultados de ciudades con alias (Huamanga -> Ayacucho): van primero y se suman a los demás
    const aliasResults: any[] = [];
    for (const aliasQuery of aliasQueries) {
      if (signal?.aborted) {
        const abortErr = new Error('Aborted');
        abortErr.name = 'AbortError';
        throw abortErr;
      }
      try {
        const aliasCandidates = await queryNominatim(aliasQuery, signal, userCoords);
        for (const c of aliasCandidates) {
          if (!aliasResults.some((r) => r.place_id === c.place_id)) aliasResults.push(c);
        }
      } catch (aliasErr: any) {
        if (aliasErr?.name === 'AbortError') throw aliasErr;
      }
      if (aliasResults.length > 0) break;
    }

    const cascadeStartedAt = Date.now();
    for (const step of steps) {
      // Presupuesto de tiempo: si ya pasaron ~8 s, se responde con lo que haya en vez de seguir girando
      if (Date.now() - cascadeStartedAt > 8000) break;
      if (signal?.aborted) {
        const abortErr = new Error('Aborted');
        abortErr.name = 'AbortError';
        throw abortErr;
      }

      // Los pasos de alias ya se consultaron arriba
      if (aliasQueries.includes(step.query)) continue;
      const candidates = await queryNominatim(step.query, signal, userCoords);
      if (candidates.length > 0) {
        // Si el usuario buscó un distrito de Lima o Callao y ningún resultado está en Lima/Callao,
        // continuar al siguiente paso de respaldo por si el número o formato confundió a OSM
        const hasLimaCallaoHit = candidates.some(isInLimaOrCallao);
        if (!requireLimaHit || hasLimaCallaoHit || step === steps[steps.length - 1]) {
          rawData = candidates;
          usedNoNumberStep = step.isNoNumberStep;
          break;
        }
      }
    }

    // Respaldo final: si Nominatim no halló nada, probar Photon con la dirección completa y luego con la vía sin número
    if (rawData.length === 0 && aliasResults.length === 0 && !signal?.aborted && Date.now() - cascadeStartedAt < 11000) {
      const photonQueries = [rawTrimmed];
      if (parsed.houseNumber && parsed.streetOnly) {
        photonQueries.push(parsed.district ? `${parsed.streetOnly}, ${parsed.district}` : parsed.streetOnly);
      }
      for (let i = 0; i < photonQueries.length; i++) {
        const photonItems = await queryPhoton(photonQueries[i], signal, userCoords);
        if (photonItems.length > 0) {
          rawData = photonItems;
          usedNoNumberStep = i > 0;
          break;
        }
      }
    }

    if (aliasResults.length > 0) {
      const aliasIds = new Set(aliasResults.map((r) => r.place_id));
      rawData = [...aliasResults, ...rawData.filter((r) => !aliasIds.has(r.place_id))];
    }

    const rankedData = rankNominatimResults(rawData, parsed, userCoords);
    const hasExactHouseMatch =
      !parsed.houseNumber ||
      (!usedNoNumberStep && rankedData.some((item) => itemMatchesHouseNumber(item, parsed.houseNumber)));

    if (aliasResults.length > 0) {
      const aliasIds2 = new Set(aliasResults.map((r) => r.place_id));
      rankedData.sort((a: any, b: any) => Number(aliasIds2.has(b.place_id)) - Number(aliasIds2.has(a.place_id)));
    }

    const isStreetOnlyFallback = Boolean(parsed.houseNumber && !hasExactHouseMatch && rankedData.length > 0);
    const fallbackNotice = isStreetOnlyFallback ? getStreetFallbackNotice(parsed.roadKind) : undefined;

    const remoteMapped: Array<SearchResult & { _dist: number; _inMetro: boolean }> = rankedData.map(
      (item: any) => {
        const address = item.address || {};
        const district =
          address.suburb ||
          address.neighbourhood ||
          address.city_district ||
          address.quarter ||
          address.town ||
          address.city ||
          address.county ||
          address.state ||
          'Perú';
        const street = address.road || address.pedestrian || address.amenity || item.name;
        const { category, placeTypeLabel } = classifyNominatimItem(item);
        const lat = parseFloat(item.lat);
        const lng = parseFloat(item.lon);
        const dist = userCoords
          ? calculateDistanceMeters(userCoords.lat, userCoords.lng, lat, lng)
          : 0;

        return {
          id: `osm_${item.place_id}`,
          name: item.name || street || 'Ubicación en Perú',
          display_name: item.display_name,
          lat,
          lng,
          district,
          category,
          placeTypeLabel,
          _dist: dist,
          _inMetro: isInLimaOrCallao(item),
          ...(isStreetOnlyFallback
            ? {
                isStreetFallback: true,
                fallbackNotice,
              }
            : {}),
        };
      }
    );

    // Con ubicación: los resultados cercanos primero (en cualquier ciudad); los de alias de ciudad siempre al inicio
    if (userCoords && aliasResults.length === 0) {
      remoteMapped.sort((a, b) => a._dist - b._dist);
    }

    const remoteResults: SearchResult[] = remoteMapped.map(({ _dist: _d, _inMetro: _m, ...rest }) => rest);

    // Primero los lugares ya cargados en la app (clínicas, etc.) y los más cercanos, después los resultados de Nominatim
    const combined: SearchResult[] = [...localMatches.slice(0, 6)];
    for (const remote of remoteResults) {
      const remoteNameNorm = normalizeAccents(remote.name).toLowerCase();
      const alreadyExists = combined.some(
        (local) =>
          (Math.abs(local.lat - remote.lat) < 0.0012 &&
            Math.abs(local.lng - remote.lng) < 0.0012) ||
          (normalizeAccents(local.name).toLowerCase() === remoteNameNorm &&
            Math.abs(local.lat - remote.lat) < 0.004 &&
            Math.abs(local.lng - remote.lng) < 0.004)
      );
      if (!alreadyExists) {
        combined.push(remote);
      }
    }

    return combined.slice(0, 10);
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw err;
    }
    console.warn('Nominatim search fallback to local places:', err);
    return localMatches.slice(0, 10);
  }
}

export interface ReverseGeocodeResult {
  name: string;
  address: string;
  district?: string;
}

/**
 * Resolves a human-readable place name or street address from coordinates using OpenStreetMap Nominatim.
 * Returns null if Nominatim is unavailable or finds no address.
 */
export async function reverseGeocodeCoords(
  lat: number,
  lng: number,
  signal?: AbortSignal
): Promise<ReverseGeocodeResult | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
    const response = await fetch(url, {
      signal,
      headers: {
        'Accept-Language': 'es',
        'User-Agent': 'RutaLima-GPS-App/1.0',
      },
    });

    if (!response.ok) return null;
    const data = await response.json();
    if (!data || data.error) return null;

    const addr = data.address || {};
    const road = addr.road || addr.pedestrian || addr.footway || addr.path || addr.street || '';
    const houseNumber = addr.house_number ? ` ${addr.house_number}` : '';
    const streetWithNum = road ? `${road}${houseNumber}`.trim() : '';
    const district =
      addr.city_district ||
      addr.suburb ||
      addr.neighbourhood ||
      addr.quarter ||
      addr.town ||
      addr.city ||
      '';

    const primaryName =
      (typeof data.name === 'string' && data.name.trim()) ||
      streetWithNum ||
      district ||
      (typeof data.display_name === 'string'
        ? data.display_name.split(',')[0]?.trim()
        : '') ||
      '';

    if (!primaryName) return null;

    const fullAddress =
      streetWithNum && district && !primaryName.includes(streetWithNum)
        ? `${primaryName} · ${streetWithNum}, ${district}`
        : streetWithNum && district
        ? `${streetWithNum}, ${district}`
        : primaryName && district && primaryName !== district
        ? `${primaryName}, ${district}`
        : (typeof data.display_name === 'string' && data.display_name) || primaryName;

    return {
      name: primaryName,
      address: fullAddress,
      district: district || undefined,
    };
  } catch (err: any) {
    if (err?.name === 'AbortError') return null;
    return null;
  }
}

export interface ReverseGeocodeDetailedResult {
  streetAddress: string;
  roadName: string;
  district: string;
  province: string;
  region: string;
  tipo: 'urbano' | 'carretera';
  shortName: string;
}

const LIMA_PROVINCIAS_NAMES = new Set([
  'canete',
  'huaral',
  'huaura',
  'barranca',
  'huarochiri',
  'canta',
  'yauyos',
  'oyon',
  'cajatambo',
]);

function normalizeGeoText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function cleanPeruAdminPrefix(raw: string): string {
  return raw
    .replace(/^provincia constitucional del\s+/i, '')
    .replace(/^provincia de\s+/i, '')
    .replace(/^departamento de\s+/i, '')
    .replace(/^gobierno regional de\s+/i, '')
    .replace(/^region\s+/i, '')
    .replace(/^región\s+/i, '')
    .trim();
}

function mapNominatimAddressToPeruRegion(addr: Record<string, any>): string {
  const candidates = [
    addr.state,
    addr.region,
    addr.state_district,
    addr.county,
    addr.city,
  ]
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    .map((v) => cleanPeruAdminPrefix(v));

  const countyClean =
    typeof addr.county === 'string' ? normalizeGeoText(cleanPeruAdminPrefix(addr.county)) : '';
  const cityClean =
    typeof addr.city === 'string' ? normalizeGeoText(cleanPeruAdminPrefix(addr.city)) : '';

  for (const cand of candidates) {
    const norm = normalizeGeoText(cand);
    if (!norm) continue;
    if (norm.includes('lima metropolitana') || norm.includes('callao')) {
      return 'Lima y Callao';
    }
    if (norm === 'lima') {
      if (LIMA_PROVINCIAS_NAMES.has(countyClean) || LIMA_PROVINCIAS_NAMES.has(cityClean)) {
        return 'Lima';
      }
      return 'Lima y Callao';
    }
  }

  for (const cand of candidates) {
    const norm = normalizeGeoText(cand);
    if (!norm) continue;
    const exactMatch = PERU_REGIONS.find((reg) => normalizeGeoText(reg) === norm);
    if (exactMatch) return exactMatch;
    const partialMatch = PERU_REGIONS.find(
      (reg) => norm.includes(normalizeGeoText(reg)) && normalizeGeoText(reg) !== 'lima'
    );
    if (partialMatch) return partialMatch;
  }

  if (LIMA_PROVINCIAS_NAMES.has(countyClean) || LIMA_PROVINCIAS_NAMES.has(cityClean)) {
    return 'Lima';
  }

  return '';
}

function classifyPeruRadarRoadType(
  data: any,
  roadName: string,
  addr: Record<string, any>
): 'urbano' | 'carretera' {
  const roadNorm = normalizeGeoText(roadName);
  const osmType = typeof data?.type === 'string' ? data.type.toLowerCase() : '';
  const osmCategory = typeof data?.category === 'string' ? data.category.toLowerCase() : '';

  const hasUrbanPrefix =
    /^(av\.?|avenida|jr\.?|jiron|calle|ca\.?|psj\.?|pasaje|malecon|alameda|ovalo|plaza)\b/i.test(
      roadNorm
    );
  const hasHighwayKeyword =
    /\b(carretera|panamericana|autopista|km\b|kilometro|pe-\d+)\b/i.test(roadNorm);
  const hasUrbanDistrict = Boolean(
    (typeof addr.city_district === 'string' && addr.city_district.trim()) ||
      (typeof addr.suburb === 'string' && addr.suburb.trim())
  );

  if (hasUrbanPrefix) {
    return 'urbano';
  }

  if (hasHighwayKeyword && (!hasUrbanDistrict || !hasUrbanPrefix)) {
    return 'carretera';
  }

  if (
    osmCategory === 'highway' &&
    (osmType === 'motorway' ||
      osmType === 'motorway_link' ||
      osmType === 'trunk' ||
      osmType === 'trunk_link') &&
    !hasUrbanDistrict
  ) {
    return 'carretera';
  }

  return 'urbano';
}

function formatShortRadarName(roadName: string): string {
  const trimmed = roadName.trim();
  if (!trimmed) return '';
  const shortened = trimmed
    .replace(/^Avenida\s+/i, 'Av. ')
    .replace(/^Jir[oó]n\s+/i, 'Jr. ')
    .replace(/^Pasaje\s+/i, 'Psj. ');
  return `Radar ${shortened}`;
}

/**
 * Consulta una única vez OpenStreetMap Nominatim (en español) para autocompletar
 * dirección, distrito, provincia, región, tipo y nombre corto desde unas coordenadas.
 * Devuelve null si Nominatim no responde o no encuentra datos, sin lanzar error al usuario.
 */
export async function reverseGeocodeDetailed(
  lat: number,
  lng: number,
  signal?: AbortSignal
): Promise<ReverseGeocodeDetailedResult | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
    const response = await fetch(url, {
      signal,
      headers: {
        'Accept-Language': 'es',
        'User-Agent': 'RutaLima-GPS-App/1.0',
      },
    });

    if (!response.ok) return null;
    const data = await response.json();
    if (!data || data.error) return null;

    const addr: Record<string, any> = data.address || {};
    const roadName = String(
      addr.road || addr.pedestrian || addr.footway || addr.path || addr.street || addr.highway || ''
    ).trim();
    const houseOrBlock = String(addr.house_number || addr.block || '').trim();
    const streetAddress = roadName
      ? houseOrBlock
        ? `${roadName} ${houseOrBlock}`.trim()
        : roadName
      : '';

    const rawDistrict = String(
      addr.city_district ||
        addr.suburb ||
        addr.municipality ||
        addr.town ||
        addr.city ||
        addr.village ||
        ''
    ).trim();
    const district =
      normalizeGeoText(rawDistrict) === 'lima metropolitana' ? '' : rawDistrict;

    const rawProvince = String(addr.county || addr.province || addr.city || '').trim();
    const cleanedProvince = cleanPeruAdminPrefix(rawProvince);
    const province =
      normalizeGeoText(cleanedProvince) === 'lima metropolitana' ? 'Lima' : cleanedProvince;

    const region = mapNominatimAddressToPeruRegion(addr);
    const tipo = classifyPeruRadarRoadType(data, roadName, addr);
    const shortName = formatShortRadarName(roadName);

    return {
      streetAddress,
      roadName,
      district,
      province,
      region,
      tipo,
      shortName,
    };
  } catch (err: any) {
    if (err?.name === 'AbortError') return null;
    return null;
  }
}

/**
 * Resuelve una dirección o tramo escrito por el usuario en coordenadas usando Nominatim (Perú, español).
 * Devuelve null si no se encuentran resultados o si se cancela la petición.
 */
export async function forwardGeocodeAddress(
  query: string,
  regionHint?: string,
  signal?: AbortSignal
): Promise<{ lat: number; lng: number } | null> {
  const trimmed = query.trim();
  if (trimmed.length < 3) return null;

  const fullQuery =
    regionHint && !normalizeGeoText(trimmed).includes(normalizeGeoText(regionHint))
      ? `${trimmed}, ${regionHint}, Peru`
      : `${trimmed}, Peru`;

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(
      fullQuery
    )}&countrycodes=pe&limit=1`;
    const response = await fetch(url, {
      signal,
      headers: {
        'Accept-Language': 'es',
        'User-Agent': 'RutaLima-GPS-App/1.0',
      },
    });
    if (!response.ok) return null;
    const data = await response.json();
    if (!Array.isArray(data) || data.length === 0) return null;
    const lat = parseFloat(data[0].lat);
    const lng = parseFloat(data[0].lon);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return { lat, lng };
    }
    return null;
  } catch {
    return null;
  }
}


