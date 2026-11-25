import type * as maplibregl from 'maplibre-gl';
import { MapPOI } from '../types/navigation';

export type PoiIconKey =
  | 'poi_hospital'
  | 'poi_hospital_urg'
  | 'poi_supermarket'
  | 'poi_restaurant'
  | 'poi_restaurant_pizza'
  | 'poi_cafe'
  | 'poi_pharmacy'
  | 'poi_fuel'
  | 'poi_fire_station'
  | 'poi_school'
  | 'poi_school_private'
  | 'poi_institute'
  | 'poi_bank'
  | 'poi_police'
  | 'poi_subway'
  | 'poi_university'
  | 'poi_military_army'
  | 'poi_military_police'
  | 'poi_military_air'
  | 'poi_military_navy'
  | 'poi_bus_stop'
  | 'poi_park'
  | 'poi_hotel';

const ALL_POI_ICON_KEYS: PoiIconKey[] = [
  'poi_hospital',
  'poi_hospital_urg',
  'poi_supermarket',
  'poi_restaurant',
  'poi_restaurant_pizza',
  'poi_cafe',
  'poi_pharmacy',
  'poi_fuel',
  'poi_fire_station',
  'poi_school',
  'poi_school_private',
  'poi_institute',
  'poi_bank',
  'poi_police',
  'poi_subway',
  'poi_university',
  'poi_military_army',
  'poi_military_police',
  'poi_military_air',
  'poi_military_navy',
  'poi_bus_stop',
  'poi_park',
  'poi_hotel',
];

export function getPoiIconKey(poi: MapPOI): PoiIconKey {
  switch (poi.category) {
    case 'hospital':
      return poi.hasEmergency === true ? 'poi_hospital_urg' : 'poi_hospital';
    case 'supermarket':
      return 'poi_supermarket';
    case 'restaurant':
      return poi.isPizza ? 'poi_restaurant_pizza' : 'poi_restaurant';
    case 'cafe':
      return 'poi_cafe';
    case 'pharmacy':
      return 'poi_pharmacy';
    case 'fuel':
      return 'poi_fuel';
    case 'fire_station':
      return 'poi_fire_station';
    case 'school':
      return poi.schoolType === 'private_small' ? 'poi_school_private' : 'poi_school';
    case 'institute':
      return 'poi_institute';
    case 'bank':
      return 'poi_bank';
    case 'police':
      return 'poi_police';
    case 'subway':
      return 'poi_subway';
    case 'university':
      return 'poi_university';
    case 'military_academy':
      switch (poi.militaryBranch) {
        case 'police_academy':
          return 'poi_military_police';
        case 'air_force':
          return 'poi_military_air';
        case 'navy':
          return 'poi_military_navy';
        case 'army':
        default:
          return 'poi_military_army';
      }
    case 'bus_stop':
      return 'poi_bus_stop';
    case 'park':
      return 'poi_park';
    case 'hotel':
      return 'poi_hotel';
  }
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function drawCircleBadgeBase(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  bgColor: string
) {
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.36)';
  ctx.shadowBlur = 4;
  ctx.shadowOffsetY = 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = bgColor;
  ctx.fill();
  ctx.restore();

  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.96)';
  ctx.lineWidth = 2.6;
  ctx.stroke();
}

function drawRoundedSquareBadgeBase(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  radius: number,
  bgColor: string,
  outerGlowColor?: string
) {
  if (outerGlowColor) {
    ctx.save();
    roundRectPath(ctx, x - 1.5, y - 1.5, size + 3, size + 3, radius + 1.5);
    ctx.strokeStyle = outerGlowColor;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.restore();
  }

  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.42)';
  ctx.shadowBlur = 5;
  ctx.shadowOffsetY = 2;
  roundRectPath(ctx, x, y, size, size, radius);
  ctx.fillStyle = bgColor;
  ctx.fill();
  ctx.restore();

  roundRectPath(ctx, x, y, size, size, radius);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.98)';
  ctx.lineWidth = 3;
  ctx.stroke();
}

function renderPoiIconToImageData(key: PoiIconKey): {
  width: number;
  height: number;
  data: Uint8Array;
} {
  // Hospital con badge URG tiene un pequeño margen adicional arriba/derecha
  const width = key === 'poi_hospital_urg' ? 72 : 56;
  const height = key === 'poi_hospital_urg' ? 66 : 56;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return { width, height, data: new Uint8Array(width * height * 4) };
  }

  ctx.clearRect(0, 0, width, height);

  if (key === 'poi_hospital' || key === 'poi_hospital_urg') {
    const cx = key === 'poi_hospital_urg' ? 28 : 28;
    const cy = key === 'poi_hospital_urg' ? 36 : 28;
    const sqSize = 46;
    const x = cx - sqSize / 2;
    const y = cy - sqSize / 2;
    drawRoundedSquareBadgeBase(ctx, x, y, sqSize, 13, '#dc2626', 'rgba(220, 38, 38, 0.48)');

    // Cruz blanca gruesa de hospital
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(cx - 4.5, cy - 13, 9, 26);
    ctx.fillRect(cx - 13, cy - 4.5, 26, 9);

    if (key === 'poi_hospital_urg') {
      // Etiqueta amarilla URG en esquina superior derecha
      const pillX = 36;
      const pillY = 4;
      const pillW = 32;
      const pillH = 16;
      roundRectPath(ctx, pillX, pillY, pillW, pillH, 8);
      ctx.fillStyle = '#fef08a';
      ctx.fill();
      ctx.strokeStyle = '#dc2626';
      ctx.lineWidth = 2.2;
      ctx.stroke();

      ctx.fillStyle = '#991b1b';
      ctx.font = '900 10.5px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('URG', pillX + pillW / 2, pillY + pillH / 2 + 0.5);
    }

    const imageData = ctx.getImageData(0, 0, width, height);
    return { width, height, data: new Uint8Array(imageData.data.buffer) };
  }

  if (key === 'poi_school_private') {
    const sqSize = 36;
    const x = (width - sqSize) / 2;
    const y = (height - sqSize) / 2;
    drawRoundedSquareBadgeBase(ctx, x, y, sqSize, 10, '#b45309');
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 19px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('P', width / 2, height / 2 + 1);
    const imageData = ctx.getImageData(0, 0, width, height);
    return { width, height, data: new Uint8Array(imageData.data.buffer) };
  }

  const cx = width / 2;
  const cy = height / 2;
  const r = 21;

  const badgeColors: Record<Exclude<PoiIconKey, 'poi_hospital' | 'poi_hospital_urg' | 'poi_school_private'>, string> = {
    poi_supermarket: '#db2777',
    poi_restaurant: '#ea580c',
    poi_restaurant_pizza: '#ea580c',
    poi_cafe: '#92400e',
    poi_pharmacy: '#16a34a',
    poi_fuel: '#0284c7',
    poi_fire_station: '#f97316',
    poi_school: '#ca8a04',
    poi_institute: '#0891b2',
    poi_bank: '#0d9488',
    poi_police: '#1d4ed8',
    poi_subway: '#4f46e5',
    poi_university: '#7e22ce',
    poi_military_army: '#3f6212',
    poi_military_police: '#1e3a8a',
    poi_military_air: '#0369a1',
    poi_military_navy: '#1e293b',
    poi_bus_stop: '#0369a1',
    poi_park: '#22a352',
    poi_hotel: '#9333ea',
  };

  drawCircleBadgeBase(ctx, cx, cy, r, badgeColors[key]);

  ctx.strokeStyle = '#ffffff';
  ctx.fillStyle = '#ffffff';
  ctx.lineWidth = 2.4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  switch (key) {
    case 'poi_supermarket': {
      ctx.beginPath();
      ctx.moveTo(cx - 10, cy - 8);
      ctx.lineTo(cx - 6.5, cy - 8);
      ctx.lineTo(cx - 3.5, cy + 3.5);
      ctx.lineTo(cx + 8, cy + 3.5);
      ctx.lineTo(cx + 10.5, cy - 4.5);
      ctx.lineTo(cx - 5, cy - 4.5);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx - 2.5, cy + 8.5, 2, 0, Math.PI * 2);
      ctx.arc(cx + 7, cy + 8.5, 2, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'poi_restaurant': {
      // Tenedor
      ctx.beginPath();
      ctx.moveTo(cx - 7, cy - 10);
      ctx.lineTo(cx - 7, cy - 3);
      ctx.moveTo(cx - 3, cy - 10);
      ctx.lineTo(cx - 3, cy - 3);
      ctx.moveTo(cx - 7, cy - 3);
      ctx.quadraticCurveTo(cx - 5, cy + 1, cx - 3, cy - 3);
      ctx.moveTo(cx - 5, cy - 10);
      ctx.lineTo(cx - 5, cy + 10);
      // Cuchillo
      ctx.moveTo(cx + 5.5, cy - 10);
      ctx.quadraticCurveTo(cx + 8.5, cy - 4, cx + 6.5, cy + 1);
      ctx.lineTo(cx + 5.5, cy + 1);
      ctx.lineTo(cx + 5.5, cy + 10);
      ctx.stroke();
      break;
    }
    case 'poi_restaurant_pizza': {
      ctx.beginPath();
      ctx.moveTo(cx, cy - 10);
      ctx.lineTo(cx - 9, cy + 8);
      ctx.quadraticCurveTo(cx, cy + 11.5, cx + 9, cy + 8);
      ctx.closePath();
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(cx - 1.5, cy + 1, 1.5, 0, Math.PI * 2);
      ctx.arc(cx + 2.5, cy + 5, 1.5, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'poi_cafe': {
      roundRectPath(ctx, cx - 8.5, cy - 3, 12.5, 11.5, 3.5);
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx + 4.5, cy + 2, 3.2, -Math.PI / 2, Math.PI / 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - 4.5, cy - 6.5);
      ctx.lineTo(cx - 3.5, cy - 10);
      ctx.moveTo(cx + 0.5, cy - 6.5);
      ctx.lineTo(cx + 1.5, cy - 10);
      ctx.stroke();
      break;
    }
    case 'poi_pharmacy': {
      ctx.fillRect(cx - 3.2, cy - 9.5, 6.4, 19);
      ctx.fillRect(cx - 9.5, cy - 3.2, 19, 6.4);
      break;
    }
    case 'poi_fuel': {
      roundRectPath(ctx, cx - 9, cy - 9, 11, 18, 2.2);
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(cx - 6.5, cy - 6.5, 6, 4.5);
      ctx.beginPath();
      ctx.moveTo(cx + 2, cy - 4);
      ctx.lineTo(cx + 6.5, cy - 1);
      ctx.lineTo(cx + 6.5, cy + 6.5);
      ctx.arc(cx + 8, cy + 6.5, 1.8, Math.PI, 0, true);
      ctx.lineTo(cx + 9.8, cy - 2);
      ctx.stroke();
      break;
    }
    case 'poi_fire_station': {
      ctx.beginPath();
      ctx.moveTo(cx, cy - 10.5);
      ctx.bezierCurveTo(cx + 7.5, cy - 4, cx + 8, cy + 4.5, cx, cy + 8.5);
      ctx.bezierCurveTo(cx - 8, cy + 4.5, cx - 7.5, cy - 4, cx - 2.5, cy - 6.5);
      ctx.bezierCurveTo(cx - 2.5, cy - 2.5, cx + 0.5, cy - 2, cx, cy - 10.5);
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - 6.5, cy + 11);
      ctx.lineTo(cx + 6.5, cy + 11);
      ctx.stroke();
      break;
    }
    case 'poi_school': {
      ctx.beginPath();
      ctx.moveTo(cx - 10, cy - 1);
      ctx.lineTo(cx, cy - 8.5);
      ctx.lineTo(cx + 10, cy - 1);
      ctx.lineTo(cx + 10, cy + 9.5);
      ctx.lineTo(cx - 10, cy + 9.5);
      ctx.closePath();
      ctx.fillStyle = 'rgba(255,255,255,0.24)';
      ctx.fill();
      ctx.stroke();
      ctx.strokeRect(cx - 2.8, cy + 3, 5.6, 6.5);
      ctx.beginPath();
      ctx.moveTo(cx, cy - 8.5);
      ctx.lineTo(cx, cy - 12);
      ctx.stroke();
      break;
    }
    case 'poi_institute': {
      // Libro abierto nítido
      ctx.beginPath();
      ctx.moveTo(cx, cy - 5);
      ctx.quadraticCurveTo(cx - 5, cy - 8, cx - 10, cy - 6);
      ctx.lineTo(cx - 10, cy + 7.5);
      ctx.quadraticCurveTo(cx - 5, cy + 5.5, cx, cy + 8.5);
      ctx.quadraticCurveTo(cx + 5, cy + 5.5, cx + 10, cy + 7.5);
      ctx.lineTo(cx + 10, cy - 6);
      ctx.quadraticCurveTo(cx + 5, cy - 8, cx, cy - 5);
      ctx.fillStyle = 'rgba(255,255,255,0.26)';
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx, cy - 5);
      ctx.lineTo(cx, cy + 8.5);
      ctx.stroke();
      break;
    }
    case 'poi_bank': {
      ctx.beginPath();
      ctx.moveTo(cx - 10, cy - 3);
      ctx.lineTo(cx, cy - 9.5);
      ctx.lineTo(cx + 10, cy - 3);
      ctx.closePath();
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      ctx.fill();
      ctx.stroke();
      for (const colX of [cx - 6.5, cx - 2, cx + 2, cx + 6.5]) {
        ctx.beginPath();
        ctx.moveTo(colX, cy - 2);
        ctx.lineTo(colX, cy + 7);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(cx - 10, cy + 8.5);
      ctx.lineTo(cx + 10, cy + 8.5);
      ctx.stroke();
      break;
    }
    case 'poi_police': {
      ctx.beginPath();
      ctx.moveTo(cx, cy - 10);
      ctx.lineTo(cx + 8.5, cy - 6.5);
      ctx.lineTo(cx + 8.5, cy - 0.5);
      ctx.bezierCurveTo(cx + 8.5, cy + 5.5, cx + 4.5, cy + 9.5, cx, cy + 11);
      ctx.bezierCurveTo(cx - 4.5, cy + 9.5, cx - 8.5, cy + 5.5, cx - 8.5, cy - 0.5);
      ctx.lineTo(cx - 8.5, cy - 6.5);
      ctx.closePath();
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      ctx.fill();
      ctx.stroke();
      break;
    }
    case 'poi_subway': {
      roundRectPath(ctx, cx - 7, cy - 9.5, 14, 15.5, 3.5);
      ctx.fillStyle = 'rgba(255,255,255,0.24)';
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - 7, cy - 2);
      ctx.lineTo(cx + 7, cy - 2);
      ctx.moveTo(cx - 4.5, cy + 6);
      ctx.lineTo(cx - 7, cy + 10.5);
      ctx.moveTo(cx + 4.5, cy + 6);
      ctx.lineTo(cx + 7, cy + 10.5);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx - 3.5, cy + 2.5, 1.5, 0, Math.PI * 2);
      ctx.arc(cx + 3.5, cy + 2.5, 1.5, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'poi_university': {
      // Birrete de graduación
      ctx.beginPath();
      ctx.moveTo(cx, cy - 8.5);
      ctx.lineTo(cx + 11, cy - 3);
      ctx.lineTo(cx, cy + 2.5);
      ctx.lineTo(cx - 11, cy - 3);
      ctx.closePath();
      ctx.fillStyle = 'rgba(255,255,255,0.32)';
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - 6.5, cy + 0.5);
      ctx.lineTo(cx - 6.5, cy + 6.5);
      ctx.quadraticCurveTo(cx, cy + 9.5, cx + 6.5, cy + 6.5);
      ctx.lineTo(cx + 6.5, cy + 0.5);
      ctx.moveTo(cx + 10.5, cy - 2.5);
      ctx.lineTo(cx + 10.5, cy + 6);
      ctx.stroke();
      break;
    }
    case 'poi_military_army':
    case 'poi_military_police': {
      // Estrella emblemática
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const outerA = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
        const innerA = outerA + Math.PI / 5;
        const ox = cx + Math.cos(outerA) * 9.5;
        const oy = cy + Math.sin(outerA) * 9.5;
        const ix = cx + Math.cos(innerA) * 4.2;
        const iy = cy + Math.sin(innerA) * 4.2;
        if (i === 0) ctx.moveTo(ox, oy);
        else ctx.lineTo(ox, oy);
        ctx.lineTo(ix, iy);
      }
      ctx.closePath();
      ctx.fillStyle = 'rgba(255,255,255,0.34)';
      ctx.fill();
      ctx.stroke();
      break;
    }
    case 'poi_military_air': {
      // Avión / Alas Fuerza Aérea
      ctx.beginPath();
      ctx.moveTo(cx, cy - 10);
      ctx.lineTo(cx + 2.5, cy - 2);
      ctx.lineTo(cx + 10.5, cy + 2.5);
      ctx.lineTo(cx + 10.5, cy + 5);
      ctx.lineTo(cx + 2.5, cy + 3);
      ctx.lineTo(cx + 2.5, cy + 8.5);
      ctx.lineTo(cx + 5.5, cy + 10.5);
      ctx.lineTo(cx - 5.5, cy + 10.5);
      ctx.lineTo(cx - 2.5, cy + 8.5);
      ctx.lineTo(cx - 2.5, cy + 3);
      ctx.lineTo(cx - 10.5, cy + 5);
      ctx.lineTo(cx - 10.5, cy + 2.5);
      ctx.lineTo(cx - 2.5, cy - 2);
      ctx.closePath();
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      break;
    }
    case 'poi_military_navy': {
      // Ancla naval
      ctx.beginPath();
      ctx.arc(cx, cy - 7, 2.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx, cy - 4.5);
      ctx.lineTo(cx, cy + 9);
      ctx.moveTo(cx - 5, cy - 1);
      ctx.lineTo(cx + 5, cy - 1);
      ctx.moveTo(cx - 8, cy + 3.5);
      ctx.quadraticCurveTo(cx, cy + 11.5, cx + 8, cy + 3.5);
      ctx.stroke();
      break;
    }
    case 'poi_bus_stop': {
      roundRectPath(ctx, cx - 8, cy - 9, 16, 15, 3);
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - 8, cy - 1.5);
      ctx.lineTo(cx + 8, cy - 1.5);
      ctx.moveTo(cx - 5, cy + 6);
      ctx.lineTo(cx - 5, cy + 9.5);
      ctx.moveTo(cx + 5, cy + 6);
      ctx.lineTo(cx + 5, cy + 9.5);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx - 4, cy + 2.5, 1.4, 0, Math.PI * 2);
      ctx.arc(cx + 4, cy + 2.5, 1.4, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'poi_park': {
      // Árbol / parque limpio
      ctx.beginPath();
      ctx.arc(cx, cy - 3.5, 6.5, 0, Math.PI * 2);
      ctx.arc(cx - 4.5, cy + 0.5, 4.5, 0, Math.PI * 2);
      ctx.arc(cx + 4.5, cy + 0.5, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.34)';
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx, cy + 4);
      ctx.lineTo(cx, cy + 10.5);
      ctx.stroke();
      break;
    }
    case 'poi_hotel': {
      ctx.beginPath();
      ctx.moveTo(cx - 9.5, cy - 6);
      ctx.lineTo(cx - 9.5, cy + 7.5);
      ctx.moveTo(cx - 9.5, cy + 3);
      ctx.lineTo(cx + 9.5, cy + 3);
      ctx.lineTo(cx + 9.5, cy + 7.5);
      ctx.moveTo(cx + 9.5, cy + 3);
      ctx.lineTo(cx + 9.5, cy - 0.5);
      ctx.quadraticCurveTo(cx + 9.5, cy - 3.5, cx + 6, cy - 3.5);
      ctx.lineTo(cx - 2, cy - 3.5);
      ctx.lineTo(cx - 2, cy + 3);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx - 5.5, cy - 1, 2, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
  }

  const imageData = ctx.getImageData(0, 0, width, height);
  return { width, height, data: new Uint8Array(imageData.data.buffer) };
}

const iconDataCache = new Map<PoiIconKey, { width: number; height: number; data: Uint8Array }>();

export function registerPoiMapIcons(map: maplibregl.Map): void {
  for (const key of ALL_POI_ICON_KEYS) {
    try {
      if (map.hasImage(key)) continue;
      let cached = iconDataCache.get(key);
      if (!cached) {
        cached = renderPoiIconToImageData(key);
        iconDataCache.set(key, cached);
      }
      map.addImage(
        key,
        {
          width: cached.width,
          height: cached.height,
          data: new Uint8Array(cached.data),
        },
        { pixelRatio: 2 }
      );
    } catch {}
  }
}
