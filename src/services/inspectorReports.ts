import { InspectorSubtype, TrafficAlert } from '../types/navigation';

export interface InspectorSubtypeOption {
  subtype: InspectorSubtype;
  label: string;
  filterLabel: string;
  imageSrc: string;
  accentClass: string;
  bgClass: string;
  borderClass: string;
}

export const INSPECTOR_SUBTYPE_OPTIONS: InspectorSubtypeOption[] = [
  {
    subtype: 'inspector_a',
    label: 'Inspectores A',
    filterLabel: 'A',
    imageSrc: '/assets/inspectors/inspector_a.png',
    accentClass: 'text-sky-300',
    bgClass: 'bg-blue-900/25 hover:bg-blue-900/40',
    borderClass: 'border-blue-400/45',
  },
  {
    subtype: 'inspector_s',
    label: 'Inspectores S',
    filterLabel: 'S',
    imageSrc: '/assets/inspectors/inspector_s.png',
    accentClass: 'text-cyan-300',
    bgClass: 'bg-sky-600/20 hover:bg-sky-600/35',
    borderClass: 'border-sky-400/45',
  },
  {
    subtype: 'inspector_municipal',
    label: 'Inspectores municipales',
    filterLabel: 'Municipales',
    imageSrc: '/assets/inspectors/inspector_municipal.png',
    accentClass: 'text-amber-300',
    bgClass: 'bg-amber-500/15 hover:bg-amber-500/30',
    borderClass: 'border-amber-400/45',
  },
];

export function normalizeInspectorSubtype(
  input?: InspectorSubtype | TrafficAlert | null
): InspectorSubtype {
  const raw =
    typeof input === 'string'
      ? input
      : input && typeof input === 'object'
      ? input.inspectorSubtype
      : undefined;

  if (
    raw === 'inspector_a' ||
    raw === 'inspector_s' ||
    raw === 'inspector_municipal'
  ) {
    return raw;
  }
  return 'inspector_a';
}

export function getInspectorSubtypeLabel(subtype?: InspectorSubtype | null): string {
  switch (normalizeInspectorSubtype(subtype)) {
    case 'inspector_s':
      return 'Inspectores S';
    case 'inspector_municipal':
      return 'Inspectores municipales';
    case 'inspector_a':
    default:
      return 'Inspectores A';
  }
}

export function getInspectorSubtypeImage(subtype?: InspectorSubtype | null): string {
  switch (normalizeInspectorSubtype(subtype)) {
    case 'inspector_s':
      return '/assets/inspectors/inspector_s.png';
    case 'inspector_municipal':
      return '/assets/inspectors/inspector_municipal.png';
    case 'inspector_a':
    default:
      return '/assets/inspectors/inspector_a.png';
  }
}

let inspectorSvgUidCounter = 0;

/**
 * Genera el SVG del marcador de inspectores en mapa:
 * burbuja redonda con borde blanco grueso, colita hacia abajo, sombra suave
 * e imagen circular del subtipo con exactamente el mismo tamaño que Policía de tránsito (50x58 px).
 */
export function renderInspectorMarkerHtml(
  subtypeInput?: InspectorSubtype | null,
  widthPx: number = 50
): string {
  const subtype = normalizeInspectorSubtype(subtypeInput);
  const label = getInspectorSubtypeLabel(subtype);
  const imageSrc = getInspectorSubtypeImage(subtype);
  const uid = ++inspectorSvgUidCounter;
  const clipId = `inspector_bubble_clip_${uid}`;
  const heightPx = Math.round((widthPx * 74) / 64);

  return `
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 74"
      width="${widthPx}"
      height="${heightPx}"
      aria-label="${label}"
      style="display:block;overflow:visible;filter:drop-shadow(0 3px 6px rgba(0,0,0,0.52));"
    >
      <defs>
        <clipPath id="${clipId}">
          <circle cx="32" cy="29" r="21.9" />
        </clipPath>
      </defs>

      <!-- Burbuja redonda con colita hacia abajo y borde blanco grueso -->
      <path
        d="M22.2 50.9 A24 24 0 1 1 41.8 50.9 C38.2 54.6 34.5 60 32 68.5 C29.5 60 25.8 54.6 22.2 50.9 Z"
        fill="#ffffff"
        stroke="#ffffff"
        stroke-width="4.2"
        stroke-linejoin="round"
      />

      <!-- Imagen circular del subtipo recortada limpiamente dentro del borde blanco -->
      <image
        href="${imageSrc}"
        x="9.1"
        y="6.1"
        width="45.8"
        height="45.8"
        preserveAspectRatio="xMidYMid slice"
        clip-path="url(#${clipId})"
      />
    </svg>
  `;
}
