import { PoliceSubtype, TrafficAlert } from '../types/navigation';

export interface PoliceSubtypeOption {
  subtype: PoliceSubtype;
  label: string;
  shortDesc: string;
  accentClass: string;
  bgClass: string;
  borderClass: string;
}

export const POLICE_SUBTYPE_OPTIONS: PoliceSubtypeOption[] = [
  {
    subtype: 'visible',
    label: 'Policía visible',
    shortDesc: 'Oficial a la vista en la vía',
    accentClass: 'text-sky-300',
    bgClass: 'bg-blue-500/15 hover:bg-blue-500/25',
    borderClass: 'border-blue-400/40',
  },
  {
    subtype: 'hidden',
    label: 'Policía escondido',
    shortDesc: 'Oculto o vigilando en esquina',
    accentClass: 'text-indigo-300',
    bgClass: 'bg-indigo-600/20 hover:bg-indigo-600/30',
    borderClass: 'border-indigo-400/40',
  },
  {
    subtype: 'opposite_lane',
    label: 'Policía en el otro carril',
    shortDesc: 'En sentido contrario',
    accentClass: 'text-cyan-300',
    bgClass: 'bg-sky-600/15 hover:bg-sky-600/25',
    borderClass: 'border-cyan-400/40',
  },
  {
    subtype: 'traffic',
    label: 'Policía de tránsito',
    shortDesc: 'Dirigiendo el tránsito',
    accentClass: 'text-orange-300',
    bgClass: 'bg-orange-500/15 hover:bg-orange-500/25',
    borderClass: 'border-orange-400/45',
  },
];

export function normalizePoliceSubtype(
  input?: PoliceSubtype | TrafficAlert | null
): PoliceSubtype {
  const raw =
    typeof input === 'string'
      ? input
      : input && typeof input === 'object'
      ? input.policeSubtype
      : undefined;

  if (
    raw === 'visible' ||
    raw === 'hidden' ||
    raw === 'opposite_lane' ||
    raw === 'traffic'
  ) {
    return raw;
  }
  return 'visible';
}

export function getPoliceSubtypeLabel(subtype?: PoliceSubtype | null): string {
  switch (normalizePoliceSubtype(subtype)) {
    case 'hidden':
      return 'Policía escondido';
    case 'opposite_lane':
      return 'Policía en el otro carril';
    case 'traffic':
      return 'Policía de tránsito';
    case 'visible':
    default:
      return 'Policía visible';
  }
}

let svgUidCounter = 0;

/**
 * Dibuja el personaje policial (cara, cuello, hombros, gorra/casco y uniforme/chaleco).
 * Se usa tanto dentro de la burbuja del mapa como en íconos de UI sin burbuja.
 */
function renderPoliceCharacterInnerSvg(subtype: PoliceSubtype): string {
  if (subtype === 'traffic') {
    // Policía de tránsito: casco blanco + rostro + chaleco reflectivo neón con franjas blancas
    return `
      <!-- Hombros oscuros de camisa -->
      <path d="M11 54 C12 43 19 39.5 26 38.8 L38 38.8 C45 39.5 52 43 53 54 Z" fill="#1e293b"/>
      <!-- Chaleco reflectivo lima/neón -->
      <path d="M16.5 54 L18.5 40.5 L26 38.8 L32 45.5 L38 38.8 L45.5 40.5 L47.5 54 Z" fill="#a3e635" stroke="#65a30d" stroke-width="0.9"/>
      <!-- Franjas reflectivas blancas del chaleco -->
      <path d="M17.5 46.5 L27 46.5 L27 49 L17.2 49 Z" fill="#f8fafc"/>
      <path d="M37 46.5 L46.5 46.5 L46.8 49 L37 49 Z" fill="#f8fafc"/>
      <path d="M21 40 L24 46.5 L21.8 46.5 L19 40.6 Z" fill="#f8fafc"/>
      <path d="M43 40 L40 46.5 L42.2 46.5 L45 40.6 Z" fill="#f8fafc"/>
      <!-- Camisa interior y cuello -->
      <path d="M27.5 34.5 L36.5 34.5 L36.5 40.5 L32 45 L27.5 40.5 Z" fill="#f0b68a"/>
      <path d="M26 38.8 L32 45.5 L38 38.8" fill="none" stroke="#0f172a" stroke-width="1.3" stroke-linejoin="round"/>
      <!-- Orejas -->
      <ellipse cx="22.8" cy="28.5" rx="2.1" ry="2.9" fill="#e5a374" stroke="#b4754d" stroke-width="0.6"/>
      <ellipse cx="41.2" cy="28.5" rx="2.1" ry="2.9" fill="#e5a374" stroke="#b4754d" stroke-width="0.6"/>
      <!-- Rostro -->
      <path d="M23.5 23.5 C23.5 18.5 27.5 16.5 32 16.5 C36.5 16.5 40.5 18.5 40.5 23.5 L40.5 29 C40.5 34 36.7 37.8 32 37.8 C27.3 37.8 23.5 34 23.5 29 Z" fill="#f4bf96" stroke="#c08057" stroke-width="0.7"/>
      <!-- Cejas y ojos -->
      <path d="M26.3 25.3 Q28.5 24.3 30.5 25.3" fill="none" stroke="#334155" stroke-width="1.2" stroke-linecap="round"/>
      <path d="M33.5 25.3 Q35.5 24.3 37.7 25.3" fill="none" stroke="#334155" stroke-width="1.2" stroke-linecap="round"/>
      <circle cx="28.4" cy="27.8" r="1.45" fill="#0f172a"/>
      <circle cx="35.6" cy="27.8" r="1.45" fill="#0f172a"/>
      <circle cx="28.8" cy="27.3" r="0.45" fill="#ffffff"/>
      <circle cx="36.0" cy="27.3" r="0.45" fill="#ffffff"/>
      <!-- Nariz y boca -->
      <path d="M32 28.2 L31.3 31.1 L32.6 31.3" fill="none" stroke="#c08057" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M29.3 33.4 Q32 35 34.7 33.4" fill="none" stroke="#9a5b3b" stroke-width="1.25" stroke-linecap="round"/>
      <!-- Casco blanco de tránsito -->
      <path d="M20.5 23.5 C20.5 13.5 25.5 10 32 10 C38.5 10 43.5 13.5 43.5 23.5 Z" fill="#f8fafc" stroke="#cbd5e1" stroke-width="0.9"/>
      <path d="M24 13.5 C27 11.2 31 11 35 12" fill="none" stroke="#ffffff" stroke-width="1.6" stroke-linecap="round"/>
      <!-- Escudo frontal en el casco -->
      <path d="M32 12.6 L34.2 14.3 L33.4 17 L30.6 17 L29.8 14.3 Z" fill="#f59e0b" stroke="#b45309" stroke-width="0.5"/>
      <!-- Visera oscura del casco -->
      <path d="M20.2 22.4 Q32 25.6 43.8 22.4 L42.4 24.7 Q32 27.5 21.6 24.7 Z" fill="#1e293b"/>
    `;
  }

  if (subtype === 'hidden') {
    // Policía escondido: mismo personaje con gorra verde, un poco más pequeño y asomándose de lado
    return `
      <!-- Esquina/muro oscuro desde donde se asoma -->
      <path d="M8 20 L24 20 L24 55 L8 55 Z" fill="#0f172a" opacity="0.88"/>
      <line x1="24" y1="20" x2="24" y2="55" stroke="#475569" stroke-width="1.4"/>
      <g transform="translate(8.5, 4.5) scale(0.84)">
        <!-- Hombro y uniforme verde oliva asomándose -->
        <path d="M16 52 C17 42 22 39 27.5 38.5 L38.5 38.5 C44.5 39 49.5 42 50.5 52 Z" fill="#3f6a34" stroke="#26451e" stroke-width="0.8"/>
        <path d="M27.5 38.5 L33 44.5 L38.5 38.5" fill="#d9f99d" opacity="0.25"/>
        <path d="M31.8 43 L34.2 43 L33.7 51 L32.3 51 Z" fill="#172c14"/>
        <!-- Cuello -->
        <rect x="28.5" y="34" width="8.5" height="6" rx="2.5" fill="#e8ab7e"/>
        <!-- Oreja derecha visible en vista 3/4 -->
        <ellipse cx="40.2" cy="28.5" rx="2" ry="2.8" fill="#e5a374" stroke="#b4754d" stroke-width="0.6"/>
        <!-- Rostro inclinado asomándose hacia la izquierda -->
        <path d="M23 23.5 C23 18.5 26.8 16.5 31.5 16.5 C36.2 16.5 40 18.8 40 24 L40 29 C40 34 36.2 37.5 31.5 37.5 C26.8 37.5 23 34 23 29 Z" fill="#f4bf96" stroke="#c08057" stroke-width="0.7"/>
        <!-- Ojos mirando de reojo hacia la izquierda -->
        <path d="M24.8 25.3 Q26.8 24.2 28.8 25.1" fill="none" stroke="#2d3b1e" stroke-width="1.2" stroke-linecap="round"/>
        <path d="M31.5 25.1 Q33.8 24.2 35.8 25.3" fill="none" stroke="#2d3b1e" stroke-width="1.2" stroke-linecap="round"/>
        <ellipse cx="26.7" cy="27.8" rx="1.6" ry="1.5" fill="#ffffff"/>
        <ellipse cx="33.5" cy="27.8" rx="1.6" ry="1.5" fill="#ffffff"/>
        <circle cx="26.1" cy="27.8" r="1.05" fill="#0f172a"/>
        <circle cx="32.9" cy="27.8" r="1.05" fill="#0f172a"/>
        <!-- Nariz y expresión discreta -->
        <path d="M28.8 28.3 L27.8 31.2 L29.4 31.5" fill="none" stroke="#c08057" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M27.8 33.8 L32.2 33.4" fill="none" stroke="#9a5b3b" stroke-width="1.2" stroke-linecap="round"/>
        <!-- Gorra verde oliva -->
        <path d="M20.5 22.8 C20.8 14.5 25.8 11.2 32 11.2 C38.2 11.2 42.5 14.8 42.5 22.8 Z" fill="#557532" stroke="#364d1d" stroke-width="0.8"/>
        <rect x="21" y="20.4" width="21" height="2.6" rx="1" fill="#32471b"/>
        <!-- Escarapela/insignia dorada -->
        <circle cx="30" cy="16.5" r="2.1" fill="#fbbf24" stroke="#92400e" stroke-width="0.5"/>
        <!-- Visera apuntando hacia la izquierda -->
        <path d="M18.2 22.5 Q27 25.4 39.5 23.2 L38 25.2 Q26.5 27.2 18.8 24.2 Z" fill="#17230b"/>
      </g>
    `;
  }

  // Policía visible y Policía en el otro carril comparten el personaje mirando al frente con gorra verde oliva y uniforme verde
  return `
    <!-- Hombros y uniforme verde oliva -->
    <path d="M11 54 C12 43 19 39.2 26 38.5 L38 38.5 C45 39.2 52 43 53 54 Z" fill="#3f6a34" stroke="#24421d" stroke-width="0.8"/>
    <!-- Charreteras en los hombros -->
    <path d="M15 41.2 L21.5 39.4 L22.5 41.8 L16 43.5 Z" fill="#2d4f24"/>
    <path d="M49 41.2 L42.5 39.4 L41.5 41.8 L48 43.5 Z" fill="#2d4f24"/>
    <!-- Cuello de camisa verde claro y corbata -->
    <path d="M26 38.5 L32 45.2 L38 38.5 Z" fill="#84a96c"/>
    <path d="M30.7 42.5 L33.3 42.5 L33.8 53 L30.2 53 Z" fill="#1b3316"/>
    <!-- Placa dorada en el pecho -->
    <path d="M21.2 44.8 L24.8 44.8 L24.5 48.2 L23 49.5 L21.5 48.2 Z" fill="#fbbf24" stroke="#92400e" stroke-width="0.5"/>
    <!-- Cuello -->
    <rect x="27.8" y="34" width="8.4" height="6" rx="2.5" fill="#e8ab7e"/>
    <!-- Orejas -->
    <ellipse cx="22.8" cy="28.6" rx="2.1" ry="2.9" fill="#e5a374" stroke="#b4754d" stroke-width="0.6"/>
    <ellipse cx="41.2" cy="28.6" rx="2.1" ry="2.9" fill="#e5a374" stroke="#b4754d" stroke-width="0.6"/>
    <!-- Rostro mirando al frente -->
    <path d="M23.5 23.5 C23.5 18.5 27.5 16.5 32 16.5 C36.5 16.5 40.5 18.5 40.5 23.5 L40.5 29 C40.5 34 36.7 37.8 32 37.8 C27.3 37.8 23.5 34 23.5 29 Z" fill="#f4bf96" stroke="#c08057" stroke-width="0.7"/>
    <!-- Cejas y ojos expresivos -->
    <path d="M26.2 25.3 Q28.4 24.2 30.4 25.2" fill="none" stroke="#2d3b1e" stroke-width="1.2" stroke-linecap="round"/>
    <path d="M33.6 25.2 Q35.6 24.2 37.8 25.3" fill="none" stroke="#2d3b1e" stroke-width="1.2" stroke-linecap="round"/>
    <circle cx="28.4" cy="27.8" r="1.45" fill="#0f172a"/>
    <circle cx="35.6" cy="27.8" r="1.45" fill="#0f172a"/>
    <circle cx="28.8" cy="27.3" r="0.45" fill="#ffffff"/>
    <circle cx="36.0" cy="27.3" r="0.45" fill="#ffffff"/>
    <!-- Nariz y boca -->
    <path d="M32 28.2 L31.3 31.1 L32.6 31.3" fill="none" stroke="#c08057" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M29.2 33.4 Q32 35 34.8 33.4" fill="none" stroke="#9a5b3b" stroke-width="1.25" stroke-linecap="round"/>
    <!-- Gorra verde oliva -->
    <path d="M20.2 22.8 C20.2 14 25.2 10.6 32 10.6 C38.8 10.6 43.8 14 43.8 22.8 Z" fill="#557532" stroke="#364d1d" stroke-width="0.8"/>
    <path d="M24 13.5 C27.5 11.6 36.5 11.6 40 13.5" fill="none" stroke="#709446" stroke-width="1.4" stroke-linecap="round"/>
    <!-- Banda oscura de la gorra -->
    <rect x="20.6" y="20.3" width="22.8" height="2.7" rx="1" fill="#2e4218"/>
    <!-- Insignia dorada frontal -->
    <path d="M32 13.3 L34.1 15.1 L33.4 17.8 L30.6 17.8 L29.9 15.1 Z" fill="#fbbf24" stroke="#92400e" stroke-width="0.5"/>
    <!-- Visera oscura -->
    <path d="M20 22.5 Q32 26 44 22.5 L42.4 24.8 Q32 27.8 21.6 24.8 Z" fill="#17230b"/>
  `;
}

function getBubbleColors(subtype: PoliceSubtype): {
  bgTop: string;
  bgBottom: string;
} {
  switch (subtype) {
    case 'hidden':
      return { bgTop: '#1e3a8a', bgBottom: '#0f172a' }; // Azul más oscuro
    case 'traffic':
      return { bgTop: '#fb923c', bgBottom: '#ea580c' }; // Naranja
    case 'opposite_lane':
      return { bgTop: '#2563eb', bgBottom: '#1d4ed8' }; // Azul
    case 'visible':
    default:
      return { bgTop: '#3b82f6', bgBottom: '#1d4ed8' }; // Azul
  }
}

/**
 * Genera el SVG completo de marcador en mapa:
 * burbuja redonda con colita hacia abajo, borde blanco grueso, sombra suave
 * y personaje policial dibujado (>= 44px de ancho).
 */
export function renderPoliceMarkerSvg(
  subtypeInput?: PoliceSubtype | null,
  widthPx: number = 50
): string {
  const subtype = normalizePoliceSubtype(subtypeInput);
  const uid = ++svgUidCounter;
  const clipId = `police_bubble_clip_${uid}`;
  const gradId = `police_bubble_grad_${uid}`;
  const { bgTop, bgBottom } = getBubbleColors(subtype);
  const heightPx = Math.round((widthPx * 74) / 64);

  const oppositeLaneCornerBadge =
    subtype === 'opposite_lane'
      ? `
        <!-- Pequeña flecha de doble sentido en la esquina de la burbuja -->
        <g transform="translate(49.5, 13.5)">
          <circle cx="0" cy="0" r="10.2" fill="#0f172a" stroke="#ffffff" stroke-width="2.2"/>
          <!-- Flecha superior hacia derecha -->
          <path d="M-5.5 -2.5 L3 -2.5 M1 -5 L4 -2.5 L1 0" fill="none" stroke="#38bdf8" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>
          <!-- Flecha inferior hacia izquierda -->
          <path d="M5.5 2.5 L-3 2.5 M-1 0 L-4 2.5 L-1 5" fill="none" stroke="#fde047" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>
        </g>
      `
      : '';

  return `
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 74"
      width="${widthPx}"
      height="${heightPx}"
      style="display:block;overflow:visible;filter:drop-shadow(0 3px 6px rgba(0,0,0,0.52));"
    >
      <defs>
        <linearGradient id="${gradId}" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="${bgTop}" />
          <stop offset="100%" stop-color="${bgBottom}" />
        </linearGradient>
        <clipPath id="${clipId}">
          <circle cx="32" cy="29" r="22.8" />
        </clipPath>
      </defs>

      <!-- Burbuja redonda con colita hacia abajo y borde blanco grueso -->
      <path
        d="M22.2 50.9 A24 24 0 1 1 41.8 50.9 C38.2 54.6 34.5 60 32 68.5 C29.5 60 25.8 54.6 22.2 50.9 Z"
        fill="url(#${gradId})"
        stroke="#ffffff"
        stroke-width="4.2"
        stroke-linejoin="round"
      />

      <!-- Personaje dibujado recortado limpiamente dentro de la burbuja -->
      <g clip-path="url(#${clipId})">
        ${renderPoliceCharacterInnerSvg(subtype)}
      </g>

      ${oppositeLaneCornerBadge}
    </svg>
  `;
}

/**
 * Ícono compacto para el botón "Policía" del panel "Reportar con un toque"
 * (personaje con gorra verde, sin colita de mapa).
 */
export function renderPolicePanelButtonIconSvg(sizePx: number = 28): string {
  return `
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="8 8 48 48"
      width="${sizePx}"
      height="${sizePx}"
      style="display:block;"
    >
      <defs>
        <clipPath id="police_btn_clip_static">
          <circle cx="32" cy="32" r="22.5" />
        </clipPath>
      </defs>
      <circle cx="32" cy="32" r="22.5" fill="#1d4ed8" stroke="#7dd3fc" stroke-width="2.2" />
      <g clip-path="url(#police_btn_clip_static)" transform="translate(0, 2)">
        ${renderPoliceCharacterInnerSvg('visible')}
      </g>
    </svg>
  `;
}
