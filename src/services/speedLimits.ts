import { Coordinates } from '../types/navigation';

export type LimaRoadCategory =
  | 'highway' // Panamericana, Evitamiento (80 - 100 km/h)
  | 'expressway' // Vía Expresa Javier Prado, Paseo de la República, Línea Amarilla (80 km/h), Costa Verde (60 km/h)
  | 'avenue' // Avenidas principales (50 km/h)
  | 'street' // Calles, jirones, pasajes locales (30 km/h)
  | 'school_hospital'; // Zonas escolares y hospitalarias (30 km/h)

export interface LimaSpeedLimitInfo {
  limitKmh: number;
  roadCategory: LimaRoadCategory;
  categoryLabel: string;
  roadName: string;
  legalNorm: string;
}

/**
 * Evaluates localized road speed limits in Metropolitan Lima according to
 * the Peruvian National Traffic Regulations (Reglamento Nacional de Tránsito D.S. 025-2021-MTC
 * and Municipalidad Metropolitana de Lima ordinances).
 */
export function getLocalizedLimaSpeedLimit(
  roadName?: string,
  userCoords?: Coordinates
): LimaSpeedLimitInfo {
  const cleanName = (roadName || '').trim();
  const lower = cleanName.toLowerCase();

  // 1. Zonas Escolares / Hospitales (30 km/h)
  if (
    lower.includes('colegio') ||
    lower.includes('escuela') ||
    lower.includes('hospital') ||
    lower.includes('clinica') ||
    lower.includes('clínica') ||
    lower.includes('posta')
  ) {
    return {
      limitKmh: 30,
      roadCategory: 'school_hospital',
      categoryLabel: 'Zona Escolar / Hospitalaria',
      roadName: cleanName || 'Zona restringida',
      legalNorm: 'Reglamento Nacional de Tránsito D.S. 025-2021-MTC (Límite: 30 km/h)',
    };
  }

  // 2. Autopistas y Vías de Evitamiento en Lima Metropolitana (80 - 100 km/h)
  if (
    lower.includes('panamericana') ||
    lower.includes('evitamiento') ||
    lower.includes('ramiro priale') ||
    lower.includes('ramiro prialé') ||
    lower.includes('carretera central') ||
    lower.includes('autopista')
  ) {
    return {
      limitKmh: 80,
      roadCategory: 'highway',
      categoryLabel: 'Autopista / Vía de Evitamiento',
      roadName: cleanName || 'Autopista de Lima',
      legalNorm: 'Límite urbano en autopistas metropolitanas (80 km/h)',
    };
  }

  // 3. Circuito de Playas / Costa Verde (60 km/h según ordenanza MML)
  if (lower.includes('costa verde') || lower.includes('circuito de playas') || lower.includes('playas')) {
    return {
      limitKmh: 60,
      roadCategory: 'expressway',
      categoryLabel: 'Circuito de Playas (Costa Verde)',
      roadName: cleanName || 'Circuito de Playas',
      legalNorm: 'Ordenanza Municipalidad de Lima - Costa Verde (60 km/h)',
    };
  }

  // 4. Vías Expresas Urbanas (80 km/h)
  if (
    lower.includes('via expresa') ||
    lower.includes('vía expresa') ||
    lower.includes('linea amarilla') ||
    lower.includes('línea amarilla') ||
    lower.includes('expresa grau') ||
    lower.includes('fernan bedoya') ||
    lower.includes('fernán bedoya')
  ) {
    return {
      limitKmh: 80,
      roadCategory: 'expressway',
      categoryLabel: 'Vía Expresa Urbana',
      roadName: cleanName || 'Vía Expresa',
      legalNorm: 'Reglamento MTC - Vías Expresas Urbanas (80 km/h)',
    };
  }

  // 5. Calles, Jirones y Pasajes locales (30 km/h según D.S. 025-2021-MTC)
  if (
    lower.startsWith('calle') ||
    lower.startsWith('ca.') ||
    lower.startsWith('ca ') ||
    lower.startsWith('jiron') ||
    lower.startsWith('jirón') ||
    lower.startsWith('jr.') ||
    lower.startsWith('jr ') ||
    lower.startsWith('pasaje') ||
    lower.startsWith('pje.') ||
    lower.startsWith('pje ') ||
    lower.includes(' jirón') ||
    lower.includes(' jiron') ||
    lower.includes(' calle') ||
    lower.includes(' pasaje')
  ) {
    return {
      limitKmh: 30,
      roadCategory: 'street',
      categoryLabel: 'Calle / Jirón Local',
      roadName: cleanName || 'Calle local',
      legalNorm: 'D.S. 025-2021-MTC Calles y jirones (Límite: 30 km/h)',
    };
  }

  // 6. Avenidas Principales en Lima (50 km/h según D.S. 025-2021-MTC)
  if (
    lower.startsWith('avenida') ||
    lower.startsWith('av.') ||
    lower.startsWith('av ') ||
    lower.startsWith('prolongacion') ||
    lower.startsWith('prolongación') ||
    lower.includes('avenida') ||
    lower.includes(' av.') ||
    lower.includes('arequipa') ||
    lower.includes('javier prado') ||
    lower.includes('brasil') ||
    lower.includes('salaverry') ||
    lower.includes('benavides') ||
    lower.includes('universitaria') ||
    lower.includes('angamos') ||
    lower.includes('pardo') ||
    lower.includes('larco') ||
    lower.includes('colonial') ||
    lower.includes('marina') ||
    lower.includes('faucett') ||
    lower.includes('ejercito') ||
    lower.includes('ejército') ||
    lower.includes('aviacion') ||
    lower.includes('aviación')
  ) {
    return {
      limitKmh: 50,
      roadCategory: 'avenue',
      categoryLabel: 'Avenida Urbana',
      roadName: cleanName || 'Avenida principal',
      legalNorm: 'D.S. 025-2021-MTC Avenidas urbanas de Lima (Límite: 50 km/h)',
    };
  }

  // 7. Promedio general para vías urbanas en Lima cuando no se especifica el tipo
  return {
    limitKmh: 50,
    roadCategory: 'avenue',
    categoryLabel: 'Vía Urbana de Lima',
    roadName: cleanName || 'Vía en Lima',
    legalNorm: 'Límite promedio de velocidad en vías urbanas de Lima (50 km/h)',
  };
}

export interface SpeedAnalysisResult {
  isOverLimit: boolean;
  isSignificant: boolean;
  excessKmh: number;
  severity: 'safe' | 'warning' | 'critical';
  limitKmh: number | null;
  speedKmh: number;
  info: LimaSpeedLimitInfo;
}

/**
 * Analyzes whether the current speed significantly exceeds the localized Lima speed limit.
 * A speed is considered significantly excessive when it exceeds the limit by at least 10 km/h
 * or is >= 20% over the localized regulatory speed limit.
 */
export function analyzeLimaSpeed(
  speedKmh: number,
  roadName?: string,
  userCoords?: Coordinates,
  overrideLimit?: number | null,
  customMeta?: {
    categoryLabel?: string;
    roadName?: string;
    requireExplicitLimit?: boolean;
  }
): SpeedAnalysisResult {
  const info = getLocalizedLimaSpeedLimit(roadName, userCoords);
  if (customMeta?.categoryLabel) {
    info.categoryLabel = customMeta.categoryLabel;
  }
  if (customMeta?.roadName) {
    info.roadName = customMeta.roadName;
  }

  const currentSpeed = Math.max(0, Math.round(speedKmh));
  const effectiveLimit =
    overrideLimit !== undefined && overrideLimit !== null && overrideLimit > 0
      ? overrideLimit
      : customMeta?.requireExplicitLimit
        ? null
        : info.limitKmh;

  if (effectiveLimit === null) {
    return {
      isOverLimit: false,
      isSignificant: false,
      excessKmh: 0,
      severity: 'safe',
      limitKmh: null,
      speedKmh: currentSpeed,
      info,
    };
  }

  info.limitKmh = effectiveLimit;
  const excess = currentSpeed - effectiveLimit;

  // Minor tolerance threshold (up to 3 km/h over can be GPS drift or calibration error)
  const isOverLimit = excess >= 4;

  // "Significantly exceeds" threshold in Lima:
  // Exceeding by >= 10 km/h OR >= 20% over the localized threshold
  const isSignificant =
    currentSpeed >= effectiveLimit + 10 || currentSpeed >= Math.round(effectiveLimit * 1.2);

  let severity: 'safe' | 'warning' | 'critical' = 'safe';
  if (isSignificant) {
    severity = 'critical';
  } else if (isOverLimit) {
    severity = 'warning';
  }

  return {
    isOverLimit,
    isSignificant,
    excessKmh: Math.max(0, excess),
    severity,
    limitKmh: effectiveLimit,
    speedKmh: currentSpeed,
    info,
  };
}
