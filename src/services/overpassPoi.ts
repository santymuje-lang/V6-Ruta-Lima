import { MapPOI, POICategory } from '../types/navigation';

export interface GeoBounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

export type PoiDetailLevel = 'overview' | 'full';

export interface POICategoryMeta {
  category: POICategory;
  label: string;
  shortLabel: string;
  color: string;
  dayTextColor: string;
  priority: 1 | 2 | 3; // 1 = máxima prioridad, 2 = alta prioridad / esencial, 3 = complementario
  isEssential?: boolean;
  bgClass: string;
  borderClass: string;
  textClass: string;
  iconSvg: string;
}

export const PIZZA_ICON_SVG = `
  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 3L4 19a15 15 0 0 0 16 0L12 3z" fill="#ffffff" fill-opacity="0.22" />
    <path d="M5.7 15.5a12 12 0 0 0 12.6 0" />
    <circle cx="11.5" cy="11" r="1" fill="#ffffff" />
    <circle cx="13.5" cy="14" r="1" fill="#ffffff" />
  </svg>
`;

export const POI_CATEGORY_LIST: POICategory[] = [
  'hospital',
  'supermarket',
  'restaurant',
  'cafe',
  'pharmacy',
  'fuel',
  'fire_station',
  'school',
  'institute',
  'university',
  'military_academy',
  'bank',
  'police',
  'subway',
  'bus_stop',
  'park',
  'hotel',
];

export const DEFAULT_POI_CATEGORIES: Record<POICategory, boolean> = {
  hospital: true,
  supermarket: true,
  restaurant: true,
  cafe: true,
  pharmacy: true,
  fuel: true,
  fire_station: true,
  school: true,
  institute: true,
  university: true,
  military_academy: true,
  bank: true,
  police: true,
  subway: true,
  bus_stop: true,
  park: true,
  hotel: true,
};

export const POI_CATEGORY_META: Record<POICategory, POICategoryMeta> = {
  hospital: {
    category: 'hospital',
    label: 'Hospitales y clínicas',
    shortLabel: 'Hospital',
    color: '#dc2626',
    dayTextColor: '#991b1b',
    priority: 1,
    isEssential: true,
    bgClass: 'bg-red-600',
    borderClass: 'border-red-400',
    textClass: 'text-red-300',
    iconSvg: `
      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M9.5 4h5v5.5H20v5h-5.5V20h-5v-5.5H4v-5h5.5V4z" fill="#ffffff" />
      </svg>
    `,
  },
  supermarket: {
    category: 'supermarket',
    label: 'Tiendas y supermercados',
    shortLabel: 'Supermercado',
    color: '#db2777',
    dayTextColor: '#9d174d',
    priority: 1,
    bgClass: 'bg-pink-600',
    borderClass: 'border-pink-400',
    textClass: 'text-pink-300',
    iconSvg: `
      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#ffffff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="9" cy="19.5" r="1.4" fill="#ffffff" />
        <circle cx="17.5" cy="19.5" r="1.4" fill="#ffffff" />
        <path d="M3 4.5h2.8l2.2 10h10.2l2-7H7" fill="#ffffff" fill-opacity="0.22" />
      </svg>
    `,
  },
  restaurant: {
    category: 'restaurant',
    label: 'Restaurantes y pizzerías',
    shortLabel: 'Restaurante',
    color: '#ea580c',
    dayTextColor: '#9a3412',
    priority: 2,
    bgClass: 'bg-orange-600',
    borderClass: 'border-orange-300',
    textClass: 'text-orange-300',
    iconSvg: `
      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#ffffff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
        <path d="M7 3.5v6a2.5 2.5 0 0 0 5 0v-6M9.5 3.5V20.5" />
        <path d="M16.5 3.5c1.5 1.8 2 4.5 1.5 7.5h-1.5v9.5" />
      </svg>
    `,
  },
  cafe: {
    category: 'cafe',
    label: 'Cafeterías',
    shortLabel: 'Cafetería',
    color: '#92400e',
    dayTextColor: '#78350f',
    priority: 2,
    bgClass: 'bg-amber-800',
    borderClass: 'border-amber-400',
    textClass: 'text-amber-300',
    iconSvg: `
      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M5 9h11v6a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4V9z" fill="#ffffff" fill-opacity="0.25" />
        <path d="M16 10h2a2 2 0 0 1 0 4h-2" />
        <path d="M8 5.5c0-1 .8-1.5.8-2.5M12 5.5c0-1 .8-1.5.8-2.5" />
      </svg>
    `,
  },
  pharmacy: {
    category: 'pharmacy',
    label: 'Farmacias',
    shortLabel: 'Farmacia',
    color: '#16a34a',
    dayTextColor: '#15803d',
    priority: 2,
    bgClass: 'bg-green-600',
    borderClass: 'border-green-400',
    textClass: 'text-green-300',
    iconSvg: `
      <svg viewBox="0 0 24 24" width="12" height="12" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M10 5.5h4v4.5h4.5v4H14v4.5h-4V14H5.5v-4H10V5.5z" fill="#ffffff" />
      </svg>
    `,
  },
  fuel: {
    category: 'fuel',
    label: 'Grifos y estaciones de servicio',
    shortLabel: 'Grifo',
    color: '#0284c7',
    dayTextColor: '#0369a1',
    priority: 2,
    bgClass: 'bg-sky-600',
    borderClass: 'border-sky-300',
    textClass: 'text-sky-300',
    iconSvg: `
      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#ffffff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
        <rect x="4" y="4" width="10" height="16" rx="1.8" fill="#ffffff" fill-opacity="0.22" />
        <path d="M6.5 8h5v3.5h-5z" fill="#ffffff" />
        <path d="M14 9l3 2.5V17a1.5 1.5 0 0 0 3 0v-6l-2.2-2.2" />
      </svg>
    `,
  },
  fire_station: {
    category: 'fire_station',
    label: 'Estaciones de bomberos',
    shortLabel: 'Bomberos',
    color: '#f97316',
    dayTextColor: '#c2410c',
    priority: 2,
    isEssential: true,
    bgClass: 'bg-orange-500',
    borderClass: 'border-orange-300',
    textClass: 'text-orange-300',
    iconSvg: `
      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 2.5c2.2 2.6 4.8 5.2 4.8 8.7A4.8 4.8 0 0 1 12 16a4.8 4.8 0 0 1-4.8-4.8c0-1.6.7-3.1 1.7-4.4.1 1.4.9 2.2 1.8 2.4-.5-2.1.2-4.6 1.3-6.7z" fill="#ffffff" fill-opacity="0.28" />
        <path d="M7.5 19.5h9" />
      </svg>
    `,
  },
  school: {
    category: 'school',
    label: 'Colegios y escuelas',
    shortLabel: 'Colegio',
    color: '#ca8a04',
    dayTextColor: '#854d0e',
    priority: 3,
    bgClass: 'bg-yellow-600',
    borderClass: 'border-yellow-400',
    textClass: 'text-yellow-300',
    iconSvg: `
      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#ffffff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 10.5L12 4.5l9 6V20H3V10.5z" fill="#ffffff" fill-opacity="0.22" />
        <path d="M9.5 20v-5.5h5V20" />
        <path d="M12 4.5V2.2" />
      </svg>
    `,
  },
  institute: {
    category: 'institute',
    label: 'Institutos civiles',
    shortLabel: 'Instituto',
    color: '#0891b2',
    dayTextColor: '#0e7490',
    priority: 3,
    bgClass: 'bg-cyan-600',
    borderClass: 'border-cyan-300',
    textClass: 'text-cyan-300',
    iconSvg: `<span style="font-size:13px;line-height:1;display:inline-flex;align-items:center;justify-content:center;">📚</span>`,
  },
  bank: {
    category: 'bank',
    label: 'Bancos y cajeros',
    shortLabel: 'Banco',
    color: '#0d9488',
    dayTextColor: '#0f766e',
    priority: 3,
    bgClass: 'bg-teal-600',
    borderClass: 'border-teal-400',
    textClass: 'text-teal-300',
    iconSvg: `
      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 9.5L12 4l9 5.5H3z" fill="#ffffff" fill-opacity="0.25" />
        <path d="M5.5 10v7.5M9.8 10v7.5M14.2 10v7.5M18.5 10v7.5M3.5 19.5h17" />
      </svg>
    `,
  },
  police: {
    category: 'police',
    label: 'Comisarías de policía',
    shortLabel: 'Policía',
    color: '#1d4ed8',
    dayTextColor: '#1e40af',
    priority: 2,
    isEssential: true,
    bgClass: 'bg-blue-700',
    borderClass: 'border-blue-400',
    textClass: 'text-blue-300',
    iconSvg: `
      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#ffffff" stroke-width="1.9" stroke-linejoin="round">
        <path d="M12 2.8L4.5 6v5.6c0 4.8 3.2 8.9 7.5 10.1 4.3-1.2 7.5-5.3 7.5-10.1V6L12 2.8z" fill="#ffffff" fill-opacity="0.26" />
      </svg>
    `,
  },
  subway: {
    category: 'subway',
    label: 'Estaciones de metro o tren',
    shortLabel: 'Metro / Tren',
    color: '#4f46e5',
    dayTextColor: '#3730a3',
    priority: 2,
    isEssential: true,
    bgClass: 'bg-indigo-600',
    borderClass: 'border-indigo-400',
    textClass: 'text-indigo-300',
    iconSvg: `
      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <rect x="6" y="3.5" width="12" height="13.5" rx="3" fill="#ffffff" fill-opacity="0.24" />
        <path d="M6 10.5h12" />
        <circle cx="9" cy="14" r="1" fill="#ffffff" />
        <circle cx="15" cy="14" r="1" fill="#ffffff" />
        <path d="M8.5 17l-2 3.5M15.5 17l2 3.5" />
      </svg>
    `,
  },
  university: {
    category: 'university',
    label: 'Universidades',
    shortLabel: 'Universidad',
    color: '#7e22ce',
    dayTextColor: '#6b21a8',
    priority: 3,
    bgClass: 'bg-purple-700',
    borderClass: 'border-purple-400',
    textClass: 'text-purple-300',
    iconSvg: `<span style="font-size:13px;line-height:1;display:inline-flex;align-items:center;justify-content:center;">🎓</span>`,
  },
  military_academy: {
    category: 'military_academy',
    label: 'Escuelas militares y policiales',
    shortLabel: 'Escuela Militar / PNP',
    color: '#3f6212',
    dayTextColor: '#365314',
    priority: 2,
    bgClass: 'bg-lime-800',
    borderClass: 'border-lime-400',
    textClass: 'text-lime-300',
    iconSvg: `<span style="font-size:13px;line-height:1;display:inline-flex;align-items:center;justify-content:center;">🪖</span>`,
  },
  bus_stop: {
    category: 'bus_stop',
    label: 'Paraderos y estaciones de bus',
    shortLabel: 'Paradero',
    color: '#0369a1',
    dayTextColor: '#0c4a6e',
    priority: 3,
    bgClass: 'bg-sky-700',
    borderClass: 'border-sky-400',
    textClass: 'text-sky-300',
    iconSvg: `
      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <rect x="5" y="4" width="14" height="13" rx="2.5" fill="#ffffff" fill-opacity="0.22" />
        <path d="M5 11h14" />
        <circle cx="8" cy="14" r="1" fill="#ffffff" />
        <circle cx="16" cy="14" r="1" fill="#ffffff" />
        <path d="M7 17v2.5M17 17v2.5" />
      </svg>
    `,
  },
  park: {
    category: 'park',
    label: 'Parques y plazas',
    shortLabel: 'Parque',
    color: '#22a352',
    dayTextColor: '#166534',
    priority: 3,
    bgClass: 'bg-green-700',
    borderClass: 'border-green-400',
    textClass: 'text-green-300',
    iconSvg: `
      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="4" y="4" width="16" height="16" rx="4" fill="#ffffff" fill-opacity="0.32" stroke="#ffffff" stroke-width="1.8" />
      </svg>
    `,
  },
  hotel: {
    category: 'hotel',
    label: 'Hoteles y hospedajes',
    shortLabel: 'Hotel',
    color: '#9333ea',
    dayTextColor: '#7e22ce',
    priority: 3,
    bgClass: 'bg-purple-600',
    borderClass: 'border-purple-300',
    textClass: 'text-purple-300',
    iconSvg: `
      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3.5 7v12M3.5 15h17v4M20.5 15v-2.5a3 3 0 0 0-3-3H10v5.5" />
        <circle cx="7" cy="11.2" r="1.5" fill="#ffffff" />
      </svg>
    `,
  },
};

const MAJOR_RETAIL_REGEX =
  /\b(tottus|plaza\s*vea|plazavea|metro|wong|vivanda|makro|mass|tambo|oxxo|listo|vega|real\s*plaza|jockey\s*plaza|open\s*plaza|mall\s*plaza|mallplaza|megaplaza|plaza\s*norte|larcomar|la\s*rambla|hiraoka|sodimac|promart|plaza\s*san\s*miguel)\b/i;

function isMajorRetailPlace(name: string, tagLabel: string): boolean {
  if (tagLabel === 'supermarket' || tagLabel === 'mall' || tagLabel === 'department_store') {
    return true;
  }
  return MAJOR_RETAIL_REGEX.test(name);
}

function detectReliableEmergency(tags: Record<string, any>): boolean | undefined {
  const emergency = String(tags.emergency || '').trim().toLowerCase();
  if (emergency === 'yes') return true;
  if (emergency === 'no') return false;
  const speciality = String(tags['healthcare:speciality'] || '').trim().toLowerCase();
  if (speciality.includes('emergency')) return true;
  const healthcare = String(tags.healthcare || '').trim().toLowerCase();
  if (healthcare === 'emergency') return true;
  return undefined;
}

function detectPizza(tags: Record<string, any>, rawName: string): boolean {
  const cuisine = String(tags.cuisine || tags.kind_detail || '').toLowerCase();
  if (cuisine.includes('pizza')) return true;
  if (/\bpizz(a|er[ií]a)\b/i.test(rawName)) return true;
  return false;
}

export interface ClassifiedTagResult {
  category: POICategory;
  tagLabel: string;
  schoolType?: 'national' | 'private_small';
  militaryBranch?: 'army' | 'police_academy' | 'air_force' | 'navy';
}

const CIVILIAN_AVIATION_EXCLUDE_REGEX =
  /\b(aviaci[oó]n\s+civil|escuela\s+de\s+vuelo|aeroclub|piloto\s+privado|piloto\s+comercial|aerocivil|instrucci[oó]n\s+a[eé]rea\s+civil|flight\s+school)\b/i;

const CIVILIAN_K12_HERO_EXCLUDE_REGEX =
  /\b(liceo\s+naval|i\.?\s*e\.?\s*p?\.?\s+(coronel|crnl|ni[nñ]o|padre|virgen|santa|san|villa|se[nñ]or)|ceba\b|prono[ei]\b)\b/i;

const CIVILIAN_SCHOOL_WITH_MILITARY_WORD_REGEX =
  /\b(villa\s+marina|santa\s+marina|agua\s+marina|padre\s+miguel\s+marina|leoncio\s+prado\b(?!.*colegio\s+militar))\b/i;

function detectMilitaryAcademyBranch(
  tags: Record<string, any>,
  rawName: string
): 'army' | 'police_academy' | 'air_force' | 'navy' | null {
  const military = String(tags.military || '').trim().toLowerCase();
  const landuse = String(tags.landuse || '').trim().toLowerCase();
  const amenity = String(tags.amenity || '').trim().toLowerCase();
  const office = String(tags.office || '').trim().toLowerCase();
  const militaryService = String(tags.military_service || '').trim().toLowerCase();
  const operator = String(tags.operator || '').trim();
  const combined = `${rawName} ${operator}`;

  // Nunca clasificar escuelas civiles de aviación ni colegios K-12 con nombres de héroes/urbanizaciones
  if (CIVILIAN_AVIATION_EXCLUDE_REGEX.test(combined)) return null;
  if (military !== 'academy') {
    if (CIVILIAN_K12_HERO_EXCLUDE_REGEX.test(rawName)) return null;
    if (
      CIVILIAN_SCHOOL_WITH_MILITARY_WORD_REGEX.test(rawName) &&
      !/colegio\s+militar|escuela\s+militar|escuela\s+naval|marina\s+de\s+guerra|ej[eé]rcito\s+del\s+per[uú]/i.test(
        combined
      )
    ) {
      return null;
    }
  }

  const isAcademicContext =
    military === 'academy' ||
    amenity === 'college' ||
    amenity === 'school' ||
    office === 'educational_institution' ||
    (landuse === 'military' &&
      /\b(escuela|colegio\s+militar|academia|instituto|citen|eofap|esofa|esga|escap|caen|iestpffaa)\b/i.test(
        rawName
      ));

  if (!isAcademicContext) return null;

  // 1. Policía Nacional (solo escuelas de formación PNP, nunca comisarías)
  if (
    /\b(escuela\s+(de\s+)?(oficiales|suboficiales|educaci[oó]n\s+superior\s+t[eé]cnico\s+profesional|t[eé]cnica|formaci[oó]n)\s+(de\s+la\s+)?(polic[ií]a\s+nacional|pnp)|eestp[-\s]?pnp|ets[-\s]?pnp|escuela\s+nacional\s+de\s+formaci[oó]n\s+profesional\s+policial)\b/i.test(
      rawName
    ) ||
    (/polic[ií]a\s+nacional/i.test(operator) && /\bescuela\b/i.test(rawName))
  ) {
    return 'police_academy';
  }

  // 2. Fuerza Aérea del Perú (estrictamente FAP / militar)
  if (
    (military === 'academy' && militaryService === 'air_force') ||
    /\b(eofap|esofa|esga|escap|escuela\s+de\s+oficiales\s+de\s+la\s+fuerza\s+a[eé]rea|escuela\s+de\s+suboficiales\s+de\s+la\s+fap|escuela\s+superior\s+de\s+guerra\s+a[eé]rea|escuela\s+de\s+capacitaci[oó]n\s+y\s+perfeccionamiento\s+de\s+la\s+fap)\b/i.test(
      rawName
    ) ||
    (/fuerza\s+a[eé]rea\s+del\s+per[uú]/i.test(operator) &&
      /\b(escuela|academia|eofap|esofa|esga|escap)\b/i.test(rawName))
  ) {
    return 'air_force';
  }

  // 3. Marina de Guerra del Perú (estrictamente naval militar)
  if (
    (military === 'academy' && militaryService === 'navy') ||
    /\b(escuela\s+naval(\s+del\s+per[uú])?|citen|instituto\s+(de\s+educaci[oó]n\s+)?superior\s+tecnol[oó]gico\s+(p[uú]blico\s+)?naval|escuela\s+superior\s+de\s+guerra\s+naval|escuela\s+de\s+infanter[ií]a\s+de\s+marina|escuela\s+de\s+submarinos)\b/i.test(
      rawName
    ) ||
    (/marina\s+de\s+guerra/i.test(operator) &&
      /\b(escuela|citen|academia|instituto)\b/i.test(rawName) &&
      !/liceo\s+naval/i.test(rawName))
  ) {
    return 'navy';
  }

  // 4. Ejército del Perú / Escuelas militares
  if (
    military === 'academy' ||
    /\b(escuela\s+militar(\s+de\s+chorrillos)?|colegio\s+militar(\s+leoncio\s+prado)?|escuela\s+t[eé]cnica\s+del\s+ej[eé]rcito|escuela\s+superior\s+de\s+guerra(\s+del\s+ej[eé]rcito|\s+del\s+per[uú])?|escuela\s+de\s+comandos|escuela\s+de\s+inteligencia\s+del\s+ej[eé]rcito|iestpffaa|de\s+las\s+fuerzas\s+armadas|centro\s+de\s+altos\s+estudios\s+nacionales|caen)\b/i.test(
      rawName
    ) ||
    (/(ej[eé]rcito\s+del\s+per[uú]|comando\s+de\s+educaci[oó]n\s+y\s+doctrina\s+del\s+ej[eé]rcito|ministerio\s+de\s+defensa)/i.test(
      operator
    ) &&
      /\b(escuela|colegio\s+militar|academia|instituto)\b/i.test(rawName))
  ) {
    return 'army';
  }

  return null;
}

function classifySchoolType(tags: Record<string, any>, rawName: string): 'national' | 'private_small' {
  const operatorType = String(tags['operator:type'] || '').trim().toLowerCase();
  const fee = String(tags.fee || '').trim().toLowerCase();
  const operator = String(tags.operator || '').trim();

  const isExplicitPublic =
    operatorType === 'government' ||
    operatorType === 'public' ||
    operatorType === 'municipal' ||
    operatorType === 'state' ||
    operatorType === 'national' ||
    fee === 'no' ||
    /\b(minedu|ministerio\s+de\s+educaci[oó]n|ugel|drelm|municipalidad|estado|p[uú]blic[oa])\b/i.test(
      operator
    ) ||
    (/\b(i\.?\s*e\.?\s*(n[°ºo.]?\s*\d{3,5}|p[uú]blica)|instituci[oó]n\s+educativa\s+(n[°ºo.]?\s*)?\d{3,5}|colegio\s+nacional|gran\s+unidad(\s+escolar)?|g\.?\s*u\.?\s*e\.?|colegio\s+emblem[aá]tico|ceba\b|c\.?\s*e\.?\s*b\.?\s*a\.?|prono[ei]\b)\b/i.test(
      rawName
    ) &&
      !/\b(i\.?\s*e\.?\s*p\.?|ieip|c\.?\s*e\.?\s*p\.?|privad[oa]|particular)\b/i.test(rawName));

  if (isExplicitPublic) {
    return 'national';
  }

  const isExplicitPrivate =
    operatorType === 'private' ||
    fee === 'yes' ||
    /\b(i\.?\s*e\.?\s*p\.?|ieip|i\.?\s*e\.?\s*c\.?|c\.?\s*e\.?\s*p\.?|c\.?\s*e\.?\s*p\.?\s*g\.?|colegio\s+privado|instituci[oó]n\s+educativa\s+privada|colegio\s+particular|nido|cuna\s+jard[ií]n)\b/i.test(
      rawName
    ) ||
    /\b(privad[oa]|particular|asociaci[oó]n\s+educativa|consorcio\s+educativo|promotora)\b/i.test(
      operator
    );

  if (isExplicitPrivate) {
    return 'private_small';
  }

  // Por seguridad ante datos incompletos, mantener tamaño/ícono uniforme sin adivinar "P"
  return 'national';
}

export function mapTagsToCategory(
  tags: Record<string, any>,
  rawName: string = ''
): ClassifiedTagResult | null {
  const effectiveName = (
    rawName ||
    String(
      tags['name:es'] || tags.name || tags.short_name || tags.official_name || tags.brand || ''
    ).trim()
  );
  rawName = effectiveName;
  const amenity = String(tags.amenity || '').trim().toLowerCase();
  const healthcare = String(tags.healthcare || '').trim().toLowerCase();
  const education = String(tags.education || '').trim().toLowerCase();
  const office = String(tags.office || '').trim().toLowerCase();
  const railway = String(tags.railway || '').trim().toLowerCase();
  const highway = String(tags.highway || '').trim().toLowerCase();
  const publicTransport = String(tags.public_transport || '').trim().toLowerCase();
  const shop = String(tags.shop || '').trim().toLowerCase();
  const leisure = String(tags.leisure || '').trim().toLowerCase();
  const tourism = String(tags.tourism || '').trim().toLowerCase();
  const military = String(tags.military || '').trim().toLowerCase();
  const landuse = String(tags.landuse || '').trim().toLowerCase();

  // 1. Transporte primero: evita que paraderos como "Estación Escuela Militar" se confundan
  if (
    railway === 'station' ||
    railway === 'subway_entrance' ||
    railway === 'halt' ||
    railway === 'tram_stop' ||
    (publicTransport === 'station' &&
      (tags.subway === 'yes' || tags.train === 'yes' || tags.light_rail === 'yes' || Boolean(railway)))
  ) {
    return { category: 'subway', tagLabel: railway || 'subway_station' };
  }
  if (highway === 'bus_stop' || publicTransport === 'station' || amenity === 'bus_station') {
    return { category: 'bus_stop', tagLabel: highway || publicTransport || amenity };
  }

  // 2. Salud primero: evita que enfermerías militares se confundan con academias
  if (
    amenity === 'hospital' ||
    amenity === 'clinic' ||
    healthcare === 'hospital' ||
    healthcare === 'clinic'
  ) {
    return { category: 'hospital', tagLabel: amenity || healthcare || 'hospital' };
  }
  if (amenity === 'doctors' || amenity === 'dentist' || healthcare === 'doctor') {
    return null;
  }

  // 3. Escuelas militares y policiales (clasificación visual independiente y verificada)
  if (
    military === 'academy' ||
    landuse === 'military' ||
    amenity === 'college' ||
    amenity === 'school' ||
    office === 'educational_institution'
  ) {
    const branch = detectMilitaryAcademyBranch(tags, rawName);
    if (branch) {
      return {
        category: 'military_academy',
        tagLabel: military === 'academy' ? 'military_academy' : branch,
        militaryBranch: branch,
      };
    }
    if (landuse === 'military' && amenity !== 'college' && amenity !== 'school') {
      return null;
    }
  }

  // 4. Universidades (exclusivamente universidades)
  const isPostSecondaryInstituteName =
    /\b(instituto(\s+de\s+educaci[oó]n)?\s+superior|iestp\b|istp\b|cetpro\b|senati\b|cibertec\b|isil\b|certus\b|tecsup\b|idat\b|zegel\b|sencico\b|toulouse\s+lautrec\b|le\s+cordon\s+bleu|instituto\s+sistemas|brit[aá]nico\b|icpna\b)\b/i.test(
      rawName
    );
  const isClearUniversityName = /^universidad\b|\buniversidad\s+(nacional|cat[oó]lica|peruana|de\s+lima|del\s+pac[ií]fico|san\s+mart[ií]n|ricardo\s+palma|c[eé]sar\s+vallejo|tecnol[oó]gica|privada|cient[ií]fica|femenina|agraria)\b/i.test(
    rawName
  );

  if (amenity === 'university' || education === 'university') {
    if (isPostSecondaryInstituteName && !/\buniversidad\b/i.test(rawName)) {
      return { category: 'institute', tagLabel: 'institute' };
    }
    return { category: 'university', tagLabel: amenity || 'university' };
  }

  // 5. Institutos civiles (claramente diferenciados de universidades, colegios K-12 y escuelas militares/policiales)
  const isK12TaggedAsCollege =
    /\b(colegio|i\.?\s*e\.?\s*p?\.?|ieip|c\.?\s*e\.?\s*p?\.?|instituci[oó]n\s+educativa|nido|jard[ií]n|inicial|primaria|secundaria|innova\s+school|school)\b/i.test(
      rawName
    ) && !isPostSecondaryInstituteName;

  if (amenity === 'college') {
    if (/^polideportivo\b/i.test(rawName)) {
      return null;
    }
    if (isClearUniversityName && !isPostSecondaryInstituteName) {
      return { category: 'university', tagLabel: 'university' };
    }
    if (isK12TaggedAsCollege) {
      return {
        category: 'school',
        tagLabel: 'school',
        schoolType: classifySchoolType(tags, rawName),
      };
    }
    return { category: 'institute', tagLabel: 'college' };
  }
  if (office === 'educational_institution') {
    if (isClearUniversityName && !isPostSecondaryInstituteName) {
      return { category: 'university', tagLabel: 'university' };
    }
    if (isK12TaggedAsCollege) {
      return {
        category: 'school',
        tagLabel: 'school',
        schoolType: classifySchoolType(tags, rawName),
      };
    }
    return { category: 'institute', tagLabel: 'educational_institution' };
  }

  // 6. Colegios y escuelas (nacionales vs privados pequeños, o institutos etiquetados como school)
  if (amenity === 'school' || amenity === 'kindergarten') {
    if (
      isPostSecondaryInstituteName &&
      !/\b(i\.?\s*e\.?\s*p?\.?|colegio|nido|inicial|primaria|secundaria)\b/i.test(rawName)
    ) {
      return { category: 'institute', tagLabel: 'institute' };
    }
    return {
      category: 'school',
      tagLabel: amenity,
      schoolType: classifySchoolType(tags, rawName),
    };
  }

  // 7. Comercios, servicios y espacios públicos
  if (
    shop === 'supermarket' ||
    shop === 'mall' ||
    shop === 'department_store' ||
    shop === 'convenience' ||
    shop === 'general' ||
    shop === 'variety_store' ||
    amenity === 'marketplace'
  ) {
    return { category: 'supermarket', tagLabel: shop || amenity };
  }
  if (amenity === 'restaurant' || amenity === 'fast_food' || amenity === 'food_court') {
    return { category: 'restaurant', tagLabel: amenity };
  }
  if (amenity === 'cafe' || shop === 'coffee') {
    return { category: 'cafe', tagLabel: amenity || shop };
  }
  if (amenity === 'pharmacy' || healthcare === 'pharmacy') {
    return { category: 'pharmacy', tagLabel: amenity || 'pharmacy' };
  }
  if (amenity === 'fuel') {
    return { category: 'fuel', tagLabel: amenity };
  }
  if (amenity === 'fire_station') {
    return { category: 'fire_station', tagLabel: amenity };
  }
  if (amenity === 'bank' || amenity === 'atm') {
    return { category: 'bank', tagLabel: amenity };
  }
  if (amenity === 'police') {
    return { category: 'police', tagLabel: amenity };
  }
  if (leisure === 'park') {
    return { category: 'park', tagLabel: leisure };
  }
  if (tourism === 'hotel' || tourism === 'hostel') {
    return { category: 'hotel', tagLabel: tourism };
  }

  return null;
}

function mapVectorKindToCategory(
  kind: string,
  rawName: string = ''
): ClassifiedTagResult | null {
  switch (kind) {
    case 'hospital':
    case 'clinic':
      return { category: 'hospital', tagLabel: kind };
    case 'supermarket':
    case 'mall':
    case 'department_store':
    case 'convenience':
    case 'marketplace':
    case 'variety_store':
    case 'general':
      return { category: 'supermarket', tagLabel: kind };
    case 'restaurant':
    case 'fast_food':
    case 'food_court':
      return { category: 'restaurant', tagLabel: kind };
    case 'cafe':
    case 'coffee':
      return { category: 'cafe', tagLabel: kind };
    case 'pharmacy':
      return { category: 'pharmacy', tagLabel: kind };
    case 'fuel':
      return { category: 'fuel', tagLabel: kind };
    case 'fire_station':
      return { category: 'fire_station', tagLabel: kind };
    case 'school':
    case 'kindergarten':
      return mapTagsToCategory({ amenity: kind }, rawName);
    case 'college':
      return mapTagsToCategory({ amenity: 'college' }, rawName);
    case 'university':
      return mapTagsToCategory({ amenity: 'university' }, rawName);
    case 'bank':
    case 'atm':
      return { category: 'bank', tagLabel: kind };
    case 'police':
      return { category: 'police', tagLabel: kind };
    case 'station':
    case 'subway_entrance':
    case 'halt':
    case 'tram_stop':
      return { category: 'subway', tagLabel: kind };
    case 'bus_stop':
    case 'bus_station':
      return { category: 'bus_stop', tagLabel: kind };
    case 'park':
      return { category: 'park', tagLabel: kind };
    case 'hotel':
    case 'hostel':
      return { category: 'hotel', tagLabel: kind };
    default:
      return null;
  }
}

function getDefaultNameForCategory(
  category: POICategory,
  tagLabel: string,
  isPizza?: boolean
): string {
  if (tagLabel === 'clinic') return 'Clínica';
  if (tagLabel === 'hospital') return 'Hospital';
  if (tagLabel === 'kindergarten') return 'Jardín / Inicial';
  if (tagLabel === 'atm') return 'Cajero automático';
  if (tagLabel === 'mall') return 'Centro comercial';
  if (tagLabel === 'convenience') return 'Tienda / Minimarket';
  if (tagLabel === 'marketplace') return 'Mercado';
  if (tagLabel === 'fast_food') return isPizza ? 'Pizzería' : 'Comida rápida';
  if (tagLabel === 'subway_entrance') return 'Estación de Metro';
  if (isPizza) return 'Pizzería';
  switch (category) {
    case 'hospital':
      return 'Hospital / Clínica';
    case 'supermarket':
      return 'Supermercado / Tienda';
    case 'restaurant':
      return 'Restaurante';
    case 'cafe':
      return 'Cafetería';
    case 'pharmacy':
      return 'Farmacia';
    case 'fuel':
      return 'Grifo';
    case 'fire_station':
      return 'Bomberos';
    case 'school':
      return 'Colegio';
    case 'institute':
      return 'Instituto';
    case 'university':
      return 'Universidad';
    case 'military_academy':
      return 'Escuela Militar / Policial';
    case 'bank':
      return 'Banco';
    case 'police':
      return 'Comisaría';
    case 'subway':
      return 'Estación de Metro / Tren';
    case 'bus_stop':
      return 'Paradero';
    case 'park':
      return 'Parque';
    case 'hotel':
      return 'Hotel';
  }
}

export function formatPoiDistance(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return '';
  if (meters < 1000) {
    return `${Math.max(1, Math.round(meters))} m`;
  }
  return `${(meters / 1000).toFixed(1)} km`;
}

// Spatial + Element caches shared across map sessions
const poiCache = new Map<string, MapPOI>();
const queriedBoundsCache: Array<{
  bounds: GeoBounds;
  detailLevel: PoiDetailLevel;
  timestamp: number;
}> = [];
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutos
const MAX_CACHED_BOUNDS = 100;
const MAX_CACHED_POIS = 6000;

const OVERPASS_FALLBACK_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

export interface OverpassFetchResult {
  ok: boolean;
  fromCache: boolean;
  aborted: boolean;
  pois: MapPOI[];
  totalCached: number;
  endpointUsed?: string;
  statusCode?: number;
  errorReason?: string;
}

export function getPoiDetailLevelForZoom(zoom: number): PoiDetailLevel {
  return zoom < 14.2 ? 'overview' : 'full';
}

function pruneExpiredBounds(now: number) {
  for (let i = queriedBoundsCache.length - 1; i >= 0; i--) {
    if (now - queriedBoundsCache[i].timestamp > CACHE_TTL_MS) {
      queriedBoundsCache.splice(i, 1);
    }
  }
}

export function isBoundsCoveredByCache(
  bounds: GeoBounds,
  requiredDetail: PoiDetailLevel = 'full'
): boolean {
  const now = Date.now();
  pruneExpiredBounds(now);
  const eps = 0.0002;
  return queriedBoundsCache.some((entry) => {
    if (requiredDetail === 'full' && entry.detailLevel !== 'full') return false;
    return (
      entry.bounds.south <= bounds.south + eps &&
      entry.bounds.west <= bounds.west + eps &&
      entry.bounds.north >= bounds.north - eps &&
      entry.bounds.east >= bounds.east - eps
    );
  });
}

export function doesBoundsCover(outer: GeoBounds, inner: GeoBounds): boolean {
  const eps = 0.00015;
  return (
    outer.south <= inner.south + eps &&
    outer.west <= inner.west + eps &&
    outer.north >= inner.north - eps &&
    outer.east >= inner.east + eps
  );
}

export function boundsOverlapRatio(a: GeoBounds, b: GeoBounds): number {
  const south = Math.max(a.south, b.south);
  const west = Math.max(a.west, b.west);
  const north = Math.min(a.north, b.north);
  const east = Math.min(a.east, b.east);
  if (south >= north || west >= east) return 0;
  const interArea = (north - south) * (east - west);
  const bArea = Math.max(1e-9, (b.north - b.south) * (b.east - b.west));
  return Math.min(1, interArea / bArea);
}

function recordQueriedBounds(bounds: GeoBounds, detailLevel: PoiDetailLevel) {
  const now = Date.now();
  pruneExpiredBounds(now);
  queriedBoundsCache.push({ bounds, detailLevel, timestamp: now });
  if (queriedBoundsCache.length > MAX_CACHED_BOUNDS) {
    queriedBoundsCache.shift();
  }
}

function normalizePoiNameKey(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function normalizeSchoolCoreKey(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(inicial|primaria|secundaria|nivel|nido|cebe|ceba)\b/g, ' ')
    .replace(/[^a-z0-9]/g, '');
}

function approxMetersApart(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = (lat2 - lat1) * 111320;
  const dLng = (lng2 - lng1) * 108900; // cos(-12 deg) ~= 0.978
  return Math.hypot(dLat, dLng);
}

function getCoordinatePrecisionRank(poi: MapPOI): number {
  if (poi.source === 'overpass') {
    if (poi.osmType === 'node') return 4;
    if (poi.osmType === 'way') return 3;
    return 2; // relation
  }
  return 1; // vectortile
}

function trimPoiCacheIfNeeded() {
  while (poiCache.size > MAX_CACHED_POIS) {
    const oldestKey = poiCache.keys().next().value;
    if (!oldestKey) break;
    poiCache.delete(oldestKey);
  }
}

function upsertPoiToCache(poi: MapPOI): void {
  const normName = normalizePoiNameKey(poi.name);
  const schoolCore = poi.category === 'school' ? normalizeSchoolCoreKey(poi.name) : normName;
  const incomingRank = getCoordinatePrecisionRank(poi);

  for (const [existingId, existing] of poiCache.entries()) {
    if (existingId === poi.id) continue;

    // Permitir deduplicado entre categorías hermanas en el mismo campus (p.ej. military_academy vs institute/university)
    const sameCategory = existing.category === poi.category;
    const siblingAcademicOrMilitary =
      (existing.category === 'military_academy' ||
        existing.category === 'institute' ||
        existing.category === 'university') &&
      (poi.category === 'military_academy' ||
        poi.category === 'institute' ||
        poi.category === 'university');

    if (!sameCategory && !siblingAcademicOrMilitary) continue;

    const dist = approxMetersApart(existing.lat, existing.lng, poi.lat, poi.lng);
    if (dist > 220) continue;

    const existingNorm = normalizePoiNameKey(existing.name);
    const sameExactName = Boolean(normName) && existingNorm === normName;
    const sameSchoolSite =
      sameCategory &&
      poi.category === 'school' &&
      dist <= 45 &&
      Boolean(schoolCore) &&
      normalizeSchoolCoreKey(existing.name) === schoolCore;

    const closeSameCategoryMatch =
      sameCategory &&
      dist <= 55 &&
      (sameExactName || !existing.hasCustomName || !poi.hasCustomName);

    const campusSameNameMatch = (sameExactName && dist <= 220) || sameSchoolSite;

    if (!closeSameCategoryMatch && !campusSameNameMatch) continue;

    const existingRank = getCoordinatePrecisionRank(existing);

    // Si una entrada es academia militar verificada y la otra del mismo nombre es institute/university, gana military_academy
    if (!sameCategory && siblingAcademicOrMilitary) {
      if (existing.category === 'military_academy' && poi.category !== 'military_academy') {
        return;
      }
      if (poi.category === 'military_academy' && existing.category !== 'military_academy') {
        poiCache.delete(existingId);
        continue;
      }
    }

    if (existingRank > incomingRank) {
      return;
    }
    if (existingRank === incomingRank && existing.hasEmergency && !poi.hasEmergency) {
      return;
    }
    poiCache.delete(existingId);
  }

  poiCache.set(poi.id, poi);
  trimPoiCacheIfNeeded();
}

export function ingestVectorTileFeatures(features: any[], currentZoom?: number): number {
  // Evitar coordenadas cuantizadas de teselas z14; usar solo desde z15 cuando la precisión es alta
  if (typeof currentZoom === 'number' && currentZoom < 15) return 0;
  if (!Array.isArray(features) || features.length === 0) return 0;
  let added = 0;

  for (const feature of features) {
    const props = feature?.properties;
    if (!props) continue;

    const rawName = String(props['name:es'] || props.name || '').trim();
    const kind = String(props.kind || '').trim().toLowerCase();
    const mapped = mapVectorKindToCategory(kind, rawName);
    if (!mapped) continue;

    // Nunca fabricar marcadores de vector tile sin nombre real (salvo paraderos con ref)
    if (!rawName && mapped.category !== 'bus_stop') continue;

    const geom = feature.geometry;
    let lng: number | undefined;
    let lat: number | undefined;
    if (geom?.type === 'Point' && Array.isArray(geom.coordinates)) {
      lng = Number(geom.coordinates[0]);
      lat = Number(geom.coordinates[1]);
    } else if (geom?.type === 'MultiPoint' && Array.isArray(geom.coordinates?.[0])) {
      lng = Number(geom.coordinates[0][0]);
      lat = Number(geom.coordinates[0][1]);
    }
    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      Math.abs(lat!) < 0.001 ||
      Math.abs(lng!) < 0.001
    ) {
      continue;
    }

    const isPizza = mapped.category === 'restaurant' ? detectPizza(props, rawName) : undefined;
    const displayName = rawName || getDefaultNameForCategory(mapped.category, mapped.tagLabel, isPizza);
    const id = `vt:${mapped.category}:${lat!.toFixed(5)},${lng!.toFixed(5)}`;

    const beforeSize = poiCache.size;
    upsertPoiToCache({
      id,
      name: displayName,
      hasCustomName: Boolean(rawName),
      category: mapped.category,
      amenityTag: mapped.tagLabel,
      lat: lat!,
      lng: lng!,
      isPizza: isPizza || undefined,
      isMajorBrand:
        mapped.category === 'supermarket'
          ? isMajorRetailPlace(displayName, mapped.tagLabel)
          : undefined,
      schoolType: mapped.schoolType,
      militaryBranch: mapped.militaryBranch,
      source: 'vectortile',
    });
    if (poiCache.size > beforeSize) added++;
  }

  return added;
}

export function getCachedPoisInBounds(
  bounds: GeoBounds,
  enabledCategories?: Record<POICategory, boolean>
): MapPOI[] {
  const out: MapPOI[] = [];
  for (const poi of poiCache.values()) {
    if (
      poi.lat >= bounds.south &&
      poi.lat <= bounds.north &&
      poi.lng >= bounds.west &&
      poi.lng <= bounds.east
    ) {
      if (!enabledCategories || enabledCategories[poi.category] !== false) {
        out.push(poi);
      }
    }
  }
  return out;
}

export function getAllCachedPois(): MapPOI[] {
  return Array.from(poiCache.values());
}

export interface PoiRenderItem {
  poi: MapPOI;
  showLabel: boolean;
}

export interface PoiClusterItem {
  id: string;
  lat: number;
  lng: number;
  count: number;
  topCategory: POICategory;
}

export interface SelectedPoisResult {
  items: PoiRenderItem[];
  clusters: PoiClusterItem[];
}

export function getPoiSelectionScore(poi: MapPOI): number {
  const meta = POI_CATEGORY_META[poi.category];
  if (!meta) return 0;

  // Base según prioridad
  let score = 0;
  switch (poi.category) {
    case 'hospital':
      // Hospitales y clínicas al nivel más alto + impulso extra si tiene emergencia confirmada
      score = 1000 + (poi.hasEmergency ? 120 : 0) + (poi.amenityTag === 'hospital' ? 40 : 0);
      break;
    case 'supermarket':
      // Tiendas y supermercados al mismo nivel visual que hospitales; grandes cadenas primero
      score =
        950 +
        (poi.isMajorBrand ? 130 : 0) +
        (poi.amenityTag === 'mall' || poi.amenityTag === 'supermarket' ? 45 : 0);
      break;
    case 'fire_station':
      score = 910;
      break;
    case 'police':
      score = 890;
      break;
    case 'subway':
      score = 880;
      break;
    case 'fuel':
      score = 860;
      break;
    case 'pharmacy':
      score = 850;
      break;
    case 'restaurant':
      score = 830 + (poi.isPizza ? 15 : 0);
      break;
    case 'cafe':
      score = 825;
      break;
    case 'military_academy':
      score = 815;
      break;
    case 'university':
      score = 780;
      break;
    case 'institute':
      score = 745;
      break;
    case 'school':
      score = poi.schoolType === 'private_small' ? 715 : 730;
      break;
    case 'bank':
      score = poi.amenityTag === 'atm' ? 660 : 710;
      break;
    case 'park':
      score = 680;
      break;
    case 'hotel':
      score = 670;
      break;
    case 'bus_stop':
      score = 640;
      break;
  }

  if (poi.hasCustomName) score += 45;
  if (poi.source === 'overpass') {
    score += poi.osmType === 'node' ? 10 : poi.osmType === 'way' ? 6 : 2;
  }
  return score;
}

export function getPoiSortKey(poi: MapPOI): number {
  return Math.max(1, 2000 - getPoiSelectionScore(poi));
}

export function getPoiZoomTier(poi: MapPOI): 'essential' | 'regular' {
  if (
    poi.category === 'hospital' ||
    poi.category === 'police' ||
    poi.category === 'fire_station'
  ) {
    return 'essential';
  }
  return 'regular';
}

/**
 * Selecciona, prioriza y evita superposiciones según el nivel de zoom:
 * - zoom < 14.0 (alejado): mantiene hospitales, clínicas y servicios esenciales sin ocultar + agrupa comerciales densos
 * - 14.0 <= zoom < 16.4 (vista inicial e intermedio): muestra alta prioridad (hospitales, supermercados, restaurantes, cafés, farmacias, grifos) + complementarios espaciados
 * - zoom >= 16.4 (cercano): muestra todos los establecimientos individuales con nombres legibles sin solaparse
 */
export function selectVisiblePoisForZoom(
  pois: MapPOI[],
  zoom: number,
  projectFn: (lat: number, lng: number) => { x: number; y: number }
): SelectedPoisResult {
  if (zoom < 11 || pois.length === 0) {
    return { items: [], clusters: [] };
  }

  const isFarZoom = zoom < 14.0;
  const isInitialOrMidZoom = zoom >= 14.0 && zoom < 16.4;

  // Filtrado por relevancia según zoom (nunca ocultar hospitales/clínicas/servicios esenciales)
  const eligible = pois.filter((poi) => {
    const meta = POI_CATEGORY_META[poi.category];
    if (!meta) return false;
    if (isFarZoom) {
      if (meta.isEssential) return true;
      if (poi.category === 'supermarket' && (poi.isMajorBrand || poi.amenityTag === 'mall' || poi.amenityTag === 'supermarket')) {
        return true;
      }
      if (poi.category === 'fuel' || poi.category === 'university' || poi.category === 'military_academy') {
        return Boolean(poi.hasCustomName);
      }
      // Resto en zoom alejado entra al agrupador (cluster)
      return true;
    }
    if (isInitialOrMidZoom) {
      if (meta.priority <= 2 || meta.isEssential) return true;
      // Complementarios con nombre propio visibles también en vista inicial/intermedia
      return Boolean(poi.hasCustomName);
    }
    return true;
  });

  // Ordenar:
  // En zoom alejado: esenciales (hospital, bomberos, policía, metro) SIEMPRE primero para no quedar ocultos por comerciales
  // En zoom inicial/intermedio/cercano: protegemos hospitales/emergencias/esenciales primero y luego repartimos en round-robin ponderado
  // entre tiendas/supermercados, restaurantes/pizzerías, cafeterías, farmacias, grifos y complementarios para que ninguna categoría quede fuera.
  let ordered: MapPOI[];
  if (isFarZoom) {
    const essentialList: MapPOI[] = [];
    const otherList: MapPOI[] = [];
    for (const poi of eligible) {
      if (poi.category === 'hospital' || POI_CATEGORY_META[poi.category]?.isEssential) {
        essentialList.push(poi);
      } else {
        otherList.push(poi);
      }
    }
    essentialList.sort((a, b) => getPoiSelectionScore(b) - getPoiSelectionScore(a));
    otherList.sort((a, b) => getPoiSelectionScore(b) - getPoiSelectionScore(a));
    ordered = [...essentialList, ...otherList];
  } else {
    const buckets: Record<string, MapPOI[]> = {
      hospital_priority: [],
      essential_other: [],
      supermarket: [],
      restaurant: [],
      cafe: [],
      pharmacy: [],
      fuel: [],
      education_military: [],
      complementary: [],
    };

    for (const poi of eligible) {
      if (poi.category === 'hospital') {
        buckets.hospital_priority.push(poi);
      } else if (poi.category === 'fire_station' || poi.category === 'police' || poi.category === 'subway') {
        buckets.essential_other.push(poi);
      } else if (poi.category === 'supermarket') {
        buckets.supermarket.push(poi);
      } else if (poi.category === 'restaurant') {
        buckets.restaurant.push(poi);
      } else if (poi.category === 'cafe') {
        buckets.cafe.push(poi);
      } else if (poi.category === 'pharmacy') {
        buckets.pharmacy.push(poi);
      } else if (poi.category === 'fuel') {
        buckets.fuel.push(poi);
      } else if (
        poi.category === 'school' ||
        poi.category === 'institute' ||
        poi.category === 'university' ||
        poi.category === 'military_academy'
      ) {
        buckets.education_military.push(poi);
      } else {
        buckets.complementary.push(poi);
      }
    }

    for (const key of Object.keys(buckets)) {
      buckets[key].sort((a, b) => getPoiSelectionScore(b) - getPoiSelectionScore(a));
    }

    // 1) Garantiza hospitales principales/emergencia y servicios esenciales primero (nunca ocultados por comerciales)
    ordered = [];
    const guaranteedHospitalReserve = zoom >= 16.4 ? 14 : 10;
    ordered.push(...buckets.hospital_priority.splice(0, guaranteedHospitalReserve));
    ordered.push(...buckets.essential_other.splice(0, 6));

    // 2) Turnos equilibrados incluyendo educación y centros militares/policiales junto a comercios y servicios
    const roundSchedule: Array<{ key: keyof typeof buckets; take: number }> =
      zoom < 15.2
        ? [
            { key: 'supermarket', take: 2 },
            { key: 'hospital_priority', take: 1 },
            { key: 'restaurant', take: 1 },
            { key: 'cafe', take: 1 },
            { key: 'pharmacy', take: 1 },
            { key: 'fuel', take: 1 },
            { key: 'education_military', take: 1 },
            { key: 'complementary', take: 1 },
          ]
        : [
            { key: 'supermarket', take: 2 },
            { key: 'hospital_priority', take: 1 },
            { key: 'restaurant', take: 2 },
            { key: 'cafe', take: 1 },
            { key: 'pharmacy', take: 1 },
            { key: 'fuel', take: 1 },
            { key: 'education_military', take: 2 },
            { key: 'complementary', take: 1 },
            { key: 'essential_other', take: 1 },
          ];

    let progressed = true;
    while (progressed) {
      progressed = false;
      for (const slot of roundSchedule) {
        const list = buckets[slot.key];
        if (list.length > 0) {
          ordered.push(...list.splice(0, slot.take));
          progressed = true;
        }
      }
    }
  }

  const iconMinDistPx = isFarZoom ? 42 : zoom < 15.2 ? 34 : zoom < 16.4 ? 26 : 22;
  const maxItems = isFarZoom ? 24 : zoom < 15.2 ? 50 : zoom < 16.4 ? 90 : 150;
  const shouldClusterNearby = zoom < 15.2;

  const placedIcons: Array<{ x: number; y: number; poi: MapPOI }> = [];
  const items: PoiRenderItem[] = [];
  const unplacedForClustering: Array<{ poi: MapPOI; x: number; y: number }> = [];

  const iconDistSq = iconMinDistPx * iconMinDistPx;

  for (const poi of ordered) {
    const pt = projectFn(poi.lat, poi.lng);
    if (!Number.isFinite(pt.x) || !Number.isFinite(pt.y)) continue;

    // Deduplicado adicional si hay dos del mismo nombre y categoría muy juntos en pantalla
    const normName = normalizePoiNameKey(poi.name);
    let tooCloseToIcon = false;
    for (let i = 0; i < placedIcons.length; i++) {
      const other = placedIcons[i];
      const dx = pt.x - other.x;
      const dy = pt.y - other.y;
      const dSq = dx * dx + dy * dy;

      const sameEntity =
        other.poi.category === poi.category &&
        normalizePoiNameKey(other.poi.name) === normName &&
        dSq < 48 * 48;

      if (dSq < iconDistSq || sameEntity) {
        tooCloseToIcon = true;
        break;
      }
    }

    if (tooCloseToIcon || items.length >= maxItems) {
      if (shouldClusterNearby && !POI_CATEGORY_META[poi.category]?.isEssential) {
        unplacedForClustering.push({ poi, x: pt.x, y: pt.y });
      }
      continue;
    }

    placedIcons.push({ x: pt.x, y: pt.y, poi });
    items.push({ poi, showLabel: false });
  }

  // En zoom alejado o medio-bajo (< 15.2), agrupar íconos densos cercanos en badges de clúster (+N) sin tapar los ya colocados
  const clusters: PoiClusterItem[] = [];
  if (shouldClusterNearby && unplacedForClustering.length >= 2) {
    const CELL_PX = isFarZoom ? 76 : 86;
    const minClusterCount = isFarZoom ? 2 : 3;
    const buckets = new Map<
      string,
      { sumLat: number; sumLng: number; sumX: number; sumY: number; count: number; topCategory: POICategory }
    >();

    for (const entry of unplacedForClustering) {
      const gx = Math.floor(entry.x / CELL_PX);
      const gy = Math.floor(entry.y / CELL_PX);
      const key = `${gx}_${gy}`;
      const existing = buckets.get(key);
      if (existing) {
        existing.sumLat += entry.poi.lat;
        existing.sumLng += entry.poi.lng;
        existing.sumX += entry.x;
        existing.sumY += entry.y;
        existing.count += 1;
      } else {
        buckets.set(key, {
          sumLat: entry.poi.lat,
          sumLng: entry.poi.lng,
          sumX: entry.x,
          sumY: entry.y,
          count: 1,
          topCategory: entry.poi.category,
        });
      }
    }

    for (const [key, b] of buckets.entries()) {
      if (b.count < minClusterCount || clusters.length >= 14) continue;
      const cx = b.sumX / b.count;
      const cy = b.sumY / b.count;
      const overlapsPlacedIcon = placedIcons.some(
        (ic) => Math.hypot(ic.x - cx, ic.y - cy) < 32
      );
      if (overlapsPlacedIcon) continue;
      clusters.push({
        id: `cluster_${key}`,
        lat: b.sumLat / b.count,
        lng: b.sumLng / b.count,
        count: b.count,
        topCategory: b.topCategory,
      });
    }
  }

  return { items, clusters };
}

export function expandBoundsSlightly(bounds: GeoBounds): GeoBounds {
  const latSpan = Math.max(0.003, bounds.north - bounds.south);
  const lngSpan = Math.max(0.003, bounds.east - bounds.west);
  const padLat = Math.min(0.008, latSpan * 0.22);
  const padLng = Math.min(0.008, lngSpan * 0.22);
  return {
    south: Math.max(-85, bounds.south - padLat),
    west: Math.max(-180, bounds.west - padLng),
    north: Math.min(85, bounds.north + padLat),
    east: Math.min(180, bounds.east + padLng),
  };
}

function buildOverpassQuery(bounds: GeoBounds, detailLevel: PoiDetailLevel): string {
  const bbox = `${bounds.south.toFixed(5)},${bounds.west.toFixed(5)},${bounds.north.toFixed(5)},${bounds.east.toFixed(5)}`;

  if (detailLevel === 'overview') {
    return `[out:json][timeout:10];
(
  nwr["amenity"~"^(hospital|clinic|fire_station|police|fuel|university|college)$"](${bbox});
  nwr["healthcare"~"^(hospital|clinic)$"](${bbox});
  nwr["shop"~"^(supermarket|mall|department_store)$"](${bbox});
  nwr["railway"~"^(station|subway_entrance)$"](${bbox});
  nw["military"="academy"](${bbox});
);
out center qt;`;
  }

  return `[out:json][timeout:12];
(
  nwr["amenity"~"^(hospital|clinic|school|kindergarten|university|college|police|fire_station|pharmacy|fuel|bus_station|restaurant|fast_food|food_court|cafe|bank|atm|marketplace)$"](${bbox});
  nwr["healthcare"~"^(hospital|clinic|pharmacy)$"](${bbox});
  nwr["shop"~"^(supermarket|mall|department_store|convenience|coffee|variety_store)$"](${bbox});
  nw["highway"="bus_stop"](${bbox});
  nw["public_transport"="station"](${bbox});
  nw["railway"~"^(station|subway_entrance|halt|tram_stop)$"](${bbox});
  nw["military"="academy"](${bbox});
  nw["landuse"="military"]["operator"~"Fuerza A[eé]rea|Ej[eé]rcito|Marina de Guerra|Polic[ií]a Nacional",i](${bbox});
  nw["office"="educational_institution"](${bbox});
  nw["leisure"="park"](${bbox});
  nw["tourism"~"^(hotel|hostel)$"](${bbox});
);
out center qt;`;
}

export function parseOverpassElements(elements: any[]): MapPOI[] {
  const parsed: MapPOI[] = [];
  for (const el of elements) {
    if (!el || !el.tags) continue;

    const rawName = String(
      el.tags['name:es'] ||
        el.tags.name ||
        el.tags.short_name ||
        el.tags.official_name ||
        el.tags.brand ||
        ''
    ).trim();

    const mapped = mapTagsToCategory(el.tags, rawName);
    if (!mapped) continue;

    // Rechazar elementos sin nombre real verificable (solo permitir bus_stop/atm/fuel si tienen ref o network)
    const fallbackRef = String(el.tags.ref || el.tags.network || '').trim();
    const hasVerifiedIdentity = Boolean(rawName) || (
      (mapped.category === 'bus_stop' || mapped.category === 'bank' || mapped.category === 'fuel') &&
      Boolean(fallbackRef)
    );
    if (!hasVerifiedIdentity) continue;

    const lat = Number(el.lat ?? el.center?.lat);
    const lng = Number(el.lon ?? el.center?.lon);
    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      Math.abs(lat) < 0.001 ||
      Math.abs(lng) < 0.001
    ) {
      continue;
    }

    const osmType: 'node' | 'way' | 'relation' =
      el.type === 'way' ? 'way' : el.type === 'relation' ? 'relation' : 'node';
    const id = `${osmType}/${el.id}`;
    const isPizza = mapped.category === 'restaurant' ? detectPizza(el.tags, rawName) : undefined;
    const displayName =
      rawName || fallbackRef || getDefaultNameForCategory(mapped.category, mapped.tagLabel, isPizza);
    const hasEmergency =
      mapped.category === 'hospital' ? detectReliableEmergency(el.tags) : undefined;

    const poi: MapPOI = {
      id,
      name: displayName,
      hasCustomName: Boolean(rawName),
      category: mapped.category,
      amenityTag: mapped.tagLabel,
      lat,
      lng,
      hasEmergency,
      isPizza: isPizza || undefined,
      isMajorBrand:
        mapped.category === 'supermarket'
          ? isMajorRetailPlace(displayName, mapped.tagLabel)
          : undefined,
      schoolType: mapped.schoolType,
      militaryBranch: mapped.militaryBranch,
      osmType,
      source: 'overpass',
    };
    upsertPoiToCache(poi);
    parsed.push(poi);
  }
  return parsed;
}

interface EndpointAttemptResult {
  elements: any[] | null;
  status: number;
  aborted: boolean;
  errorReason: string | null;
  upstreamEndpoint?: string;
}

async function postOverpassRequest(
  endpoint: string,
  query: string,
  timeoutMs: number,
  externalSignal?: AbortSignal
): Promise<EndpointAttemptResult> {
  const controller = new AbortController();
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  const onExternalAbort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) {
      clearTimeout(timeoutId);
      return { elements: null, status: 0, aborted: true, errorReason: 'Consulta cancelada' };
    }
    externalSignal.addEventListener('abort', onExternalAbort, { once: true });
  }

  console.log(`[Overpass POI] Consultando ${endpoint}`);

  try {
    const body = `data=${encodeURIComponent(query)}`;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        Accept: 'application/json, */*',
      },
      body,
      signal: controller.signal,
    });

    const text = await res.text();
    let data: any = null;
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }

    const elements: any[] | null = data && Array.isArray(data.elements) ? data.elements : null;
    const count = elements ? elements.length : 0;
    const upstreamInfo = data?.endpoint ? ` (upstream: ${data.endpoint}, http ${data.status ?? res.status})` : '';

    console.log(
      `[Overpass POI] Respuesta de ${endpoint}${upstreamInfo} -> estado: ${res.status}, lugares devueltos: ${count}`
    );

    if (!res.ok) {
      return {
        elements: null,
        status: data?.status || res.status,
        aborted: false,
        upstreamEndpoint: data?.endpoint,
        errorReason: data?.error || `HTTP ${res.status}`,
      };
    }

    if (!elements) {
      return {
        elements: null,
        status: res.status,
        aborted: false,
        upstreamEndpoint: data?.endpoint,
        errorReason: 'Respuesta JSON inválida de Overpass',
      };
    }

    return {
      elements,
      status: data?.status || res.status,
      aborted: false,
      upstreamEndpoint: data?.endpoint,
      errorReason: null,
    };
  } catch (err: any) {
    const wasExternalAbort = Boolean(externalSignal?.aborted);
    const reason = wasExternalAbort
      ? 'Consulta cancelada'
      : timedOut
      ? `Timeout (${Math.round(timeoutMs / 1000)}s)`
      : err?.message || 'Error de red / CORS';

    console.log(
      `[Overpass POI] Respuesta de ${endpoint} -> estado: ERROR (${reason})`
    );

    return {
      elements: null,
      status: 0,
      aborted: wasExternalAbort,
      errorReason: reason,
    };
  } finally {
    clearTimeout(timeoutId);
    if (externalSignal) {
      externalSignal.removeEventListener('abort', onExternalAbort);
    }
  }
}

export async function fetchOverpassPOIsForBounds(
  bounds: GeoBounds,
  enabledCategories?: Record<POICategory, boolean>,
  signal?: AbortSignal,
  queryBoundsOverride?: GeoBounds,
  detailLevel: PoiDetailLevel = 'full'
): Promise<OverpassFetchResult> {
  if (signal?.aborted) {
    return {
      ok: false,
      fromCache: false,
      aborted: true,
      pois: getCachedPoisInBounds(bounds, enabledCategories),
      totalCached: poiCache.size,
      errorReason: 'Consulta cancelada',
    };
  }

  if (isBoundsCoveredByCache(bounds, detailLevel)) {
    const cachedInBounds = getCachedPoisInBounds(bounds, enabledCategories);
    return {
      ok: true,
      fromCache: true,
      aborted: false,
      pois: cachedInBounds,
      totalCached: poiCache.size,
    };
  }

  const queryBounds = queryBoundsOverride ?? expandBoundsSlightly(bounds);
  const query = buildOverpassQuery(queryBounds, detailLevel);
  const errors: string[] = [];

  // 1. Proxy /api/overpass primero: usa overpass.openstreetmap.fr + caché del servidor + evita bloqueos CORS
  const proxyAttempt = await postOverpassRequest('/api/overpass', query, 11000, signal);
  if (proxyAttempt.aborted) {
    return {
      ok: false,
      fromCache: false,
      aborted: true,
      pois: getCachedPoisInBounds(bounds, enabledCategories),
      totalCached: poiCache.size,
      errorReason: 'Consulta cancelada',
    };
  }

  if (proxyAttempt.elements !== null) {
    parseOverpassElements(proxyAttempt.elements);
    recordQueriedBounds(queryBounds, detailLevel);
    return {
      ok: true,
      fromCache: false,
      aborted: false,
      pois: getCachedPoisInBounds(bounds, enabledCategories),
      totalCached: poiCache.size,
      endpointUsed: proxyAttempt.upstreamEndpoint || '/api/overpass',
      statusCode: proxyAttempt.status,
    };
  }

  errors.push(`proxy: ${proxyAttempt.errorReason || 'no disponible'}`);

  // 2. Fallback directo desde el navegador solo si /api/overpass falló
  for (const endpoint of OVERPASS_FALLBACK_ENDPOINTS) {
    if (signal?.aborted) {
      return {
        ok: false,
        fromCache: false,
        aborted: true,
        pois: getCachedPoisInBounds(bounds, enabledCategories),
        totalCached: poiCache.size,
        errorReason: 'Consulta cancelada',
      };
    }

    const attempt = await postOverpassRequest(endpoint, query, 7000, signal);
    if (attempt.aborted) {
      return {
        ok: false,
        fromCache: false,
        aborted: true,
        pois: getCachedPoisInBounds(bounds, enabledCategories),
        totalCached: poiCache.size,
        errorReason: 'Consulta cancelada',
      };
    }

    if (attempt.elements !== null) {
      parseOverpassElements(attempt.elements);
      recordQueriedBounds(queryBounds, detailLevel);
      return {
        ok: true,
        fromCache: false,
        aborted: false,
        pois: getCachedPoisInBounds(bounds, enabledCategories),
        totalCached: poiCache.size,
        endpointUsed: endpoint,
        statusCode: attempt.status,
      };
    }

    errors.push(`${new URL(endpoint).hostname}: ${attempt.errorReason || 'error'}`);
  }

  return {
    ok: false,
    fromCache: false,
    aborted: Boolean(signal?.aborted),
    pois: getCachedPoisInBounds(bounds, enabledCategories),
    totalCached: poiCache.size,
    errorReason: errors.join(' | '),
  };
}
