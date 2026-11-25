import * as maplibregl from 'maplibre-gl';
import type { StyleSpecification } from 'maplibre-gl';
import { EtagMismatch, PMTiles, Protocol, type RangeResponse, type Source } from 'pmtiles';
import {
  Coordinates,
  GPSLocation,
  MapPOI,
  MapTileMode,
  RouteData,
  TrafficAlert,
  TrafficAlertType,
} from '../../../types/navigation';
import { FixedRadar } from '../../../data/fixedRadars';
import {
  isAlertExpired,
  getInspectorMarkerOpacity,
} from '../../../services/alertLifecycle';
import {
  getPoliceSubtypeLabel,
  normalizePoliceSubtype,
  renderPoliceMarkerSvg,
} from '../../../services/policeReports';
import {
  getInspectorSubtypeLabel,
  normalizeInspectorSubtype,
  renderInspectorMarkerHtml,
} from '../../../services/inspectorReports';
import { shouldSuppressMapClick } from '../../../services/overlayCoordinator';
import {
  getAllCachedPois,
  getPoiSortKey,
  getPoiZoomTier,
} from '../../../services/overpassPoi';
import { getPoiIconKey, registerPoiMapIcons } from '../../../services/poiMapIcons';
import { getAlertTargetCoords } from '../../../services/reportDirection';
import {
  EMPTY_MANEUVER_FC,
  ManeuverFeatureCollection,
  coordsToLngLat,
  isPoiNearActiveRoute,
  matchUserToRoute,
} from './routeGeometry';

// Solo lugares útiles para la conducción mientras hay navegación activa (CAMBIO 5)
export const NAV_USEFUL_POI_CATEGORIES = new Set<string>([
  'fuel',
  'hospital',
  'bus_stop',
  'subway',
  'police',
  'fire_station',
  'school',
]);

export function getCommunityAlertVisual(type: TrafficAlertType): {
  bgHex: string;
  bubbleIconSvg: string;
  cardIconSvg: string;
} {
  let bgHex = '#f59e0b';
  let svgAttrs =
    'viewBox="0 0 24 24" fill="none" stroke="#ffffff" color="#ffffff"';
  let innerPaths = `
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
  `;

  if (type === 'accident') {
    bgHex = '#e11d48';
    svgAttrs =
      'viewBox="0 0 24 24" fill="none" stroke="#ffffff" color="#ffffff"';
    innerPaths = `
      <path d="M2 15h6l2-2.5V11L7 8H3.5L2 11v4z" stroke-width="1.5" stroke-linejoin="round" fill="currentColor" fill-opacity="0.3" />
      <path d="M22 15h-6l-2-2.5V11l3-3h3.5L22 11v4z" stroke-width="1.5" stroke-linejoin="round" fill="currentColor" fill-opacity="0.3" />
      <path d="M12 4l.6 1.8 1.8.6-1.8.6-.6 1.8-.6-1.8-1.8-.6 1.8-.6z" fill="#fecdd3" stroke="#fecdd3" stroke-width="0.5" />
    `;
  } else if (type === 'construction') {
    bgHex = '#f97316';
    svgAttrs = 'viewBox="0 0 24 24" fill="none"';
    innerPaths = `
      <rect x="3" y="19" width="18" height="2.5" rx="1.2" fill="#ffffff" />
      <polygon points="12,2.5 10.5,8 13.5,8" fill="#ffffff" />
      <polygon points="10.5,8 9.2,12 14.8,12 13.5,8" fill="#fed7aa" />
      <polygon points="9.2,12 8,15.5 16,15.5 14.8,12" fill="#ffffff" />
      <polygon points="8,15.5 6.8,19 17.2,19 16,15.5" fill="#fed7aa" />
    `;
  } else if (type === 'pothole') {
    bgHex = '#d97706';
    svgAttrs = 'viewBox="0 0 24 24" fill="none"';
    innerPaths = `
      <path d="M2 13h4.5c1 1.5 2 3.5 5.5 3.5s4.5-2 5.5-3.5H22" stroke="#ffffff" stroke-width="2" stroke-linecap="round" />
      <g transform="translate(12, 11) rotate(22) translate(-12, -11)">
        <circle cx="12" cy="11" r="4.5" stroke="#ffffff" stroke-width="2" fill="#78350f" fill-opacity="0.5" />
        <circle cx="12" cy="11" r="1.8" fill="#fef3c7" />
      </g>
    `;
  } else if (type === 'broken_light') {
    bgHex = '#eab308';
    svgAttrs = 'viewBox="0 0 24 24" fill="none"';
    innerPaths = `
      <rect x="7.5" y="2" width="9" height="17" rx="3.5" fill="#0f172a" stroke="#ffffff" stroke-width="1.6" />
      <circle cx="12" cy="5.5" r="1.5" fill="#ef4444" fill-opacity="0.4" />
      <circle cx="12" cy="10.5" r="1.5" fill="#eab308" fill-opacity="0.4" />
      <circle cx="12" cy="15.5" r="1.5" fill="#22c55e" fill-opacity="0.3" />
      <path d="M17 7l-3 4h2.5l-3.5 5" stroke="#facc15" stroke-width="1.8" stroke-linecap="round" />
    `;
  } else if (type === 'road_closed') {
    bgHex = '#b91c1c';
    svgAttrs = 'viewBox="0 0 24 24" fill="none"';
    innerPaths = `
      <circle cx="12" cy="12" r="9" fill="#dc2626" fill-opacity="0.3" stroke="#ffffff" stroke-width="1.8" />
      <rect x="6" y="10.5" width="12" height="3" rx="1" fill="#ffffff" />
    `;
  } else if (type === 'stopped_vehicle') {
    bgHex = '#9333ea';
    svgAttrs =
      'viewBox="0 0 24 24" fill="none" stroke="#ffffff" color="#ffffff"';
    innerPaths = `
      <path d="M3 15h18v3H3z" stroke-width="1.5" />
      <path d="M5 15l2-5h5l2 5" stroke-width="1.5" fill="currentColor" fill-opacity="0.3" />
      <line x1="14" y1="15" x2="19" y2="10.5" stroke-width="1.8" stroke-linecap="round" />
      <circle cx="7" cy="18" r="1.2" fill="currentColor" />
      <circle cx="17" cy="18" r="1.2" fill="currentColor" />
    `;
  } else if (type === 'speed_camera') {
    bgHex = '#c026d3';
    svgAttrs =
      'viewBox="0 0 24 24" fill="none" stroke="#ffffff" color="#ffffff"';
    innerPaths = `
      <rect x="4" y="6" width="13.5" height="8.5" rx="2.2" stroke-width="1.7" fill="currentColor" fill-opacity="0.25" />
      <circle cx="10.8" cy="10.2" r="2.3" stroke-width="1.6" fill="#fae8ff" fill-opacity="0.35" />
      <path d="M10.8 14.5v5.5M7.5 20h6.6" stroke-width="1.7" stroke-linecap="round" />
      <path d="M19 8.2a3.2 3.2 0 0 1 0 4.1M21 6.6a5.5 5.5 0 0 1 0 7.3" stroke="#fae8ff" stroke-width="1.6" stroke-linecap="round" />
    `;
  } else if (type === 'flood') {
    bgHex = '#0891b2';
    svgAttrs =
      'viewBox="0 0 24 24" fill="none" stroke="#ffffff" color="#ffffff"';
    innerPaths = `
      <path d="M8 4.2s2.2 2.7 2.2 4a2.2 2.2 0 1 1-4.4 0c0-1.3 2.2-4 2.2-4z" fill="currentColor" fill-opacity="0.35" stroke-width="1.5" />
      <path d="M16 3.5s2.2 2.7 2.2 4a2.2 2.2 0 1 1-4.4 0c0-1.3 2.2-4 2.2-4z" fill="currentColor" fill-opacity="0.35" stroke-width="1.5" />
      <path d="M3 15.2c1.5 1.3 3 1.3 4.5 0s3-1.3 4.5 0 3 1.3 4.5 0 3-1.3 4.5 0" stroke-width="1.9" stroke-linecap="round" />
      <path d="M3 19c1.5 1.3 3 1.3 4.5 0s3-1.3 4.5 0 3 1.3 4.5 0 3-1.3 4.5 0" stroke="#cffafe" stroke-width="1.9" stroke-linecap="round" />
    `;
  } else if (type === 'traffic') {
    bgHex = '#ef4444';
    svgAttrs =
      'viewBox="0 0 24 24" fill="none" stroke="#ffffff" color="#ffffff"';
    innerPaths = `
      <path d="M4 14l1.5-4.5h5L12 14v4H4v-4z" stroke-width="1.5" fill="currentColor" fill-opacity="0.3" />
      <circle cx="6" cy="18" r="1.2" fill="currentColor" />
      <circle cx="10" cy="18" r="1.2" fill="currentColor" />
      <path d="M13 11l1.2-3.5h4L19.5 11v3H13v-3z" stroke-width="1.4" />
    `;
  }

  return {
    bgHex,
    bubbleIconSvg: `<svg x="18.5" y="15.5" width="27" height="27" ${svgAttrs}>${innerPaths}</svg>`,
    cardIconSvg: `<svg width="24" height="24" style="display:block;" ${svgAttrs}>${innerPaths}</svg>`,
  };
}

export function renderCommunityAlertBubbleSvg(
  bgHex: string,
  iconInnerSvg: string,
  widthPx: number = 50
): string {
  const heightPx = Math.round((widthPx * 74) / 64);
  return `
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 74"
      width="${widthPx}"
      height="${heightPx}"
      style="display:block;overflow:visible;filter:drop-shadow(0 3px 6px rgba(0,0,0,0.52));"
    >
      <path
        d="M22.2 50.9 A24 24 0 1 1 41.8 50.9 C38.2 54.6 34.5 60 32 68.5 C29.5 60 25.8 54.6 22.2 50.9 Z"
        fill="${bgHex}"
        stroke="#ffffff"
        stroke-width="4.2"
        stroke-linejoin="round"
      />
      ${iconInnerSvg}
    </svg>
  `;
}

// Vector tiles source via PMTiles archive hosted on GitHub Releases (proxied for CORS + HTTP Range support)
export const PERU_PMTILES_SOURCE_ID = 'peru_pmtiles';
export const PERU_PMTILES_URL =
  'https://github.com/santymuje-lang/Ruta-Lima-corregido/releases/download/v1.0.0/peru-completo.pmtiles';
export const PERU_PMTILES_MAP_URL = `pmtiles://${PERU_PMTILES_URL}`;
export const OPENFREEMAP_LIBERTY_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
export const OPENFREEMAP_BRIGHT_STYLE_URL = 'https://tiles.openfreemap.org/styles/bright';
export const OSM_RASTER_TILES = ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'];
export const OSM_ATTRIBUTION = '© OpenStreetMap contributors';

export type OpenFreeMapFallbackStage = 'liberty' | 'bright' | 'osm_raster';

class ProxiedPmtilesSource implements Source {
  private readonly url: string;

  constructor(url: string) {
    this.url = url;
  }

  getKey(): string {
    return this.url;
  }

  async getBytes(
    offset: number,
    length: number,
    signal?: AbortSignal,
    etag?: string
  ): Promise<RangeResponse> {
    const proxyUrl = `/api/pmtiles?url=${encodeURIComponent(this.url)}`;
    const end = offset + length - 1;
    const response = await fetch(proxyUrl, {
      method: 'GET',
      headers: {
        Range: `bytes=${offset}-${end}`,
      },
      signal,
    });

    if (response.status === 416) {
      throw new EtagMismatch('PMTiles HTTP 416 Range Not Satisfiable');
    }

    const responseEtag = response.headers.get('etag') || undefined;
    if (etag && responseEtag && etag !== responseEtag) {
      throw new EtagMismatch('PMTiles ETag mismatch');
    }

    if (!response.ok) {
      const err: any = new Error(`Error al cargar PMTiles (HTTP ${response.status})`);
      err.status = response.status;
      throw err;
    }

    const data = await response.arrayBuffer();
    return {
      data,
      etag: responseEtag,
      cacheControl: response.headers.get('cache-control') || undefined,
      expires: response.headers.get('expires') || undefined,
    };
  }
}

let pmtilesProtocolInstance: Protocol | null = null;
let peruPmtilesInstance: PMTiles | null = null;
let isPmtilesProtocolRegistered = false;
const cachedBaseVectorStyles = new Map<'liberty' | 'bright', StyleSpecification>();

export function getPeruPmtilesInstance(): PMTiles {
  if (!peruPmtilesInstance) {
    peruPmtilesInstance = new PMTiles(new ProxiedPmtilesSource(PERU_PMTILES_URL));
  }
  return peruPmtilesInstance;
}

export function ensurePmtilesProtocolRegistered(): void {
  if (typeof window === 'undefined' || isPmtilesProtocolRegistered) return;
  if (!pmtilesProtocolInstance) {
    pmtilesProtocolInstance = new Protocol({ metadata: true });
  }
  pmtilesProtocolInstance.add(getPeruPmtilesInstance());
  try {
    maplibregl.addProtocol('pmtiles', pmtilesProtocolInstance.tile as any);
    isPmtilesProtocolRegistered = true;
  } catch (err) {
    console.warn('No se pudo registrar el protocolo pmtiles:', err);
  }
}

export const OSM_RASTER_DAY_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    osm_tiles: {
      type: 'raster',
      tiles: OSM_RASTER_TILES,
      tileSize: 256,
      maxzoom: 19,
      attribution: OSM_ATTRIBUTION,
    },
  },
  layers: [
    {
      id: 'osm-day-background-layer',
      type: 'background',
      paint: {
        'background-color': '#f3f4f6',
      },
    },
    {
      id: 'osm-day-raster-layer',
      type: 'raster',
      source: 'osm_tiles',
    },
  ],
};

export const OSM_RASTER_NIGHT_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    osm_tiles: {
      type: 'raster',
      tiles: OSM_RASTER_TILES,
      tileSize: 256,
      maxzoom: 19,
      attribution: OSM_ATTRIBUTION,
    },
  },
  layers: [
    {
      id: 'osm-night-background-layer',
      type: 'background',
      paint: {
        'background-color': '#1e293b',
      },
    },
    {
      id: 'osm-night-raster-layer',
      type: 'raster',
      source: 'osm_tiles',
      paint: {
        'raster-brightness-min': 0.04,
        'raster-brightness-max': 0.56,
        'raster-saturation': -0.35,
        'raster-contrast': 0.24,
        'raster-opacity': 0.96,
      },
    },
  ],
};

export const SATELLITE_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    esri_imagery: {
      type: 'raster',
      tiles: [
        'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
      maxzoom: 18,
      attribution: '&copy; Esri, Maxar, Earthstar Geographics',
    },
  },
  layers: [
    {
      id: 'esri-imagery-layer',
      type: 'raster',
      source: 'esri_imagery',
    },
  ],
};

export function createVectorPmtilesBootstrapStyle(mode: MapTileMode): StyleSpecification {
  return {
    version: 8,
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    sources: {
      [PERU_PMTILES_SOURCE_ID]: {
        type: 'vector',
        url: PERU_PMTILES_MAP_URL,
        attribution: OSM_ATTRIBUTION,
      },
    },
    layers: [
      {
        id: 'background',
        type: 'background',
        paint: {
          'background-color': mode === 'night' ? '#131c2b' : '#e8e5dc',
        },
      },
    ],
  };
}

function createProtomapsVectorFallbackStyle(mode: MapTileMode): StyleSpecification {
  const isNight = mode === 'night';
  return {
    version: 8,
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    sources: {
      [PERU_PMTILES_SOURCE_ID]: {
        type: 'vector',
        url: PERU_PMTILES_MAP_URL,
        attribution: OSM_ATTRIBUTION,
      },
    },
    layers: [
      {
        id: 'background',
        type: 'background',
        paint: { 'background-color': isNight ? '#1e293b' : '#e8e5dc' },
      },
      {
        id: 'landuse_residential',
        type: 'fill',
        source: PERU_PMTILES_SOURCE_ID,
        'source-layer': 'landuse',
        minzoom: 0,
        maxzoom: 24,
        filter: ['in', ['get', 'pmap:kind'], ['literal', ['residential', 'urban_area', 'suburb', 'neighbourhood']]],
        paint: { 'fill-color': isNight ? '#243146' : '#e1ddd3', 'fill-opacity': isNight ? 0.52 : 0.65 },
      },
      {
        id: 'landuse_commercial',
        type: 'fill',
        source: PERU_PMTILES_SOURCE_ID,
        'source-layer': 'landuse',
        minzoom: 0,
        maxzoom: 24,
        filter: ['in', ['get', 'pmap:kind'], ['literal', ['commercial', 'retail', 'industrial']]],
        paint: { 'fill-color': isNight ? '#2a3040' : '#e3dcd0', 'fill-opacity': 0.58 },
      },
      {
        id: 'landuse_civic',
        type: 'fill',
        source: PERU_PMTILES_SOURCE_ID,
        'source-layer': 'landuse',
        minzoom: 0,
        maxzoom: 24,
        filter: ['in', ['get', 'pmap:kind'], ['literal', ['hospital', 'school', 'university', 'college']]],
        paint: { 'fill-color': isNight ? '#342834' : '#efe0e3', 'fill-opacity': 0.62 },
      },
      {
        id: 'landuse_park',
        type: 'fill',
        source: PERU_PMTILES_SOURCE_ID,
        'source-layer': 'landuse',
        minzoom: 0,
        maxzoom: 24,
        filter: ['in', ['get', 'pmap:kind'], ['literal', ['park', 'forest', 'garden', 'grass', 'wood', 'pitch', 'cemetery', 'nature_reserve', 'meadow']]],
        paint: {
          'fill-color': isNight ? '#1d4335' : '#bfe0bb',
          'fill-outline-color': isNight ? '#2a5e4b' : '#8cc487',
          'fill-opacity': 0.85,
        },
      },
      {
        id: 'water',
        type: 'fill',
        source: PERU_PMTILES_SOURCE_ID,
        'source-layer': 'water',
        minzoom: 0,
        maxzoom: 24,
        paint: { 'fill-color': isNight ? '#112647' : '#9acae8' },
      },
      {
        id: 'waterway_river',
        type: 'line',
        source: PERU_PMTILES_SOURCE_ID,
        'source-layer': 'water',
        minzoom: 0,
        maxzoom: 24,
        filter: ['==', ['geometry-type'], 'LineString'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': isNight ? '#1b3b6b' : '#9ecfe8',
          'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.5, 11, 1.0, 15, 2.2, 18, 4.2],
          'line-opacity': ['interpolate', ['linear'], ['zoom'], 5, 0.65, 12, 0.86],
        },
      },
      {
        id: 'building',
        type: 'fill',
        source: PERU_PMTILES_SOURCE_ID,
        'source-layer': 'buildings',
        minzoom: 0,
        maxzoom: 24,
        paint: {
          'fill-color': isNight ? '#2c3b52' : '#dad6cc',
          'fill-outline-color': isNight ? '#475c7d' : '#c4bfb4',
          'fill-opacity': ['interpolate', ['linear'], ['zoom'], 6, 0.28, 12, 0.48, 14.5, 0.7, 16, 0.82],
        },
      },
      {
        id: 'road_major_rail',
        type: 'line',
        source: PERU_PMTILES_SOURCE_ID,
        'source-layer': 'roads',
        minzoom: 0,
        maxzoom: 24,
        filter: ['in', ['get', 'pmap:kind'], ['literal', ['rail', 'ferry']]],
        paint: {
          'line-color': isNight ? '#2b384d' : '#b8b8b8',
          'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.4, 12, 0.8, 16, 1.4],
          'line-dasharray': [4, 3],
          'line-opacity': ['interpolate', ['linear'], ['zoom'], 5, 0.45, 13, 0.75],
        },
      },
      {
        id: 'road_service_track_casing',
        type: 'line',
        source: PERU_PMTILES_SOURCE_ID,
        'source-layer': 'roads',
        minzoom: 0,
        maxzoom: 24,
        filter: ['in', ['get', 'pmap:kind'], ['literal', ['other', 'path', 'service', 'pedestrian', 'track', 'footway']]],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': isNight ? '#162030' : '#8795a8',
          'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.5, 11, 0.9, 14.6, 2.2, 16, 5.5, 18, 11.8],
          'line-opacity': ['interpolate', ['linear'], ['zoom'], 5, 0.28, 12, 0.48, 15, 0.84],
        },
      },
      {
        id: 'road_service_track',
        type: 'line',
        source: PERU_PMTILES_SOURCE_ID,
        'source-layer': 'roads',
        minzoom: 0,
        maxzoom: 24,
        filter: ['in', ['get', 'pmap:kind'], ['literal', ['other', 'path', 'service', 'pedestrian', 'track', 'footway']]],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': isNight ? '#394a66' : '#bcc5d3',
          'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.35, 11, 0.6, 14.6, 1.5, 16, 4.0, 18, 9.2],
          'line-opacity': ['interpolate', ['linear'], ['zoom'], 5, 0.36, 12, 0.58, 15, 0.9],
        },
      },
      {
        id: 'road_minor_casing',
        type: 'line',
        source: PERU_PMTILES_SOURCE_ID,
        'source-layer': 'roads',
        minzoom: 0,
        maxzoom: 24,
        filter: ['in', ['get', 'pmap:kind'], ['literal', ['minor_road', 'residential', 'unclassified']]],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': isNight ? '#162030' : '#7e8ca1',
          'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.6, 11, 1.15, 14, 2.3, 16, 7.0, 18, 15.6],
          'line-opacity': ['interpolate', ['linear'], ['zoom'], 5, 0.34, 11, 0.54, 14, 0.78, 15.5, 0.94],
        },
      },
      {
        id: 'road_minor',
        type: 'line',
        source: PERU_PMTILES_SOURCE_ID,
        'source-layer': 'roads',
        minzoom: 0,
        maxzoom: 24,
        filter: ['in', ['get', 'pmap:kind'], ['literal', ['minor_road', 'residential', 'unclassified']]],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': isNight ? '#435675' : '#b4becd',
          'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.4, 11, 0.8, 14, 1.6, 16, 5.2, 18, 12.2],
          'line-opacity': ['interpolate', ['linear'], ['zoom'], 5, 0.44, 11, 0.66, 14, 0.86, 15.5, 0.98],
        },
      },
      {
        id: 'road_secondary_tertiary_casing',
        type: 'line',
        source: PERU_PMTILES_SOURCE_ID,
        'source-layer': 'roads',
        minzoom: 0,
        maxzoom: 24,
        filter: ['in', ['get', 'pmap:kind'], ['literal', ['medium_road', 'secondary', 'tertiary']]],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': isNight ? '#172233' : '#66758a',
          'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.9, 11, 1.7, 13.5, 3.0, 16, 10.0, 18, 19.6],
          'line-opacity': ['interpolate', ['linear'], ['zoom'], 5, 0.46, 11, 0.64, 14, 0.84, 15.5, 0.94],
        },
      },
      {
        id: 'road_secondary_tertiary',
        type: 'line',
        source: PERU_PMTILES_SOURCE_ID,
        'source-layer': 'roads',
        minzoom: 0,
        maxzoom: 24,
        filter: ['in', ['get', 'pmap:kind'], ['literal', ['medium_road', 'secondary', 'tertiary']]],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': isNight ? '#546b8f' : '#95a3b6',
          'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.6, 11, 1.2, 13.5, 2.2, 16, 7.8, 18, 15.8],
          'line-opacity': ['interpolate', ['linear'], ['zoom'], 5, 0.6, 11, 0.78, 14, 0.92, 15.5, 0.98],
        },
      },
      {
        id: 'road_major_casing',
        type: 'line',
        source: PERU_PMTILES_SOURCE_ID,
        'source-layer': 'roads',
        minzoom: 0,
        maxzoom: 24,
        filter: ['in', ['get', 'pmap:kind'], ['literal', ['major_road', 'highway', 'primary', 'trunk', 'motorway']]],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': isNight ? '#3e3a24' : '#4c596e',
          'line-width': ['interpolate', ['linear'], ['zoom'], 5, 1.3, 11, 2.3, 14, 5.2, 17, 18.5],
          'line-opacity': ['interpolate', ['linear'], ['zoom'], 5, 0.52, 11, 0.7, 14.5, 0.92],
        },
      },
      {
        id: 'road_major',
        type: 'line',
        source: PERU_PMTILES_SOURCE_ID,
        'source-layer': 'roads',
        minzoom: 0,
        maxzoom: 24,
        filter: ['in', ['get', 'pmap:kind'], ['literal', ['major_road', 'highway', 'primary', 'trunk', 'motorway']]],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': isNight ? '#968c59' : '#78869c',
          'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.9, 11, 1.65, 14, 3.8, 17, 14.5],
          'line-opacity': ['interpolate', ['linear'], ['zoom'], 5, 0.76, 11, 0.86, 14.5, 0.98],
        },
      },
      {
        id: 'highway-name-path',
        type: 'symbol',
        source: PERU_PMTILES_SOURCE_ID,
        'source-layer': 'roads',
        minzoom: 0,
        maxzoom: 24,
        filter: ['in', ['get', 'pmap:kind'], ['literal', ['other', 'path', 'service', 'pedestrian', 'track', 'footway']]],
        layout: {
          'symbol-placement': 'line',
          'symbol-sort-key': 50,
          'symbol-spacing': ['interpolate', ['linear'], ['zoom'], 8, 160, 14, 210, 17, 250],
          'text-field': ['coalesce', ['get', 'name:es'], ['get', 'name'], ''],
          'text-font': ['Noto Sans Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 6, 8.2, 12, 9.4, 16, 11.4, 18, 12.8],
          'text-keep-upright': true,
          'text-padding': ['interpolate', ['linear'], ['zoom'], 6, 1, 14, 2],
        },
        paint: {
          'text-color': isNight ? '#cbd5e1' : '#334155',
          'text-halo-color': isNight ? '#131c2b' : '#ffffff',
          'text-halo-width': 2.2,
          'text-opacity': ['interpolate', ['linear'], ['zoom'], 6, 0.72, 12, 0.84, 15, 0.94],
        },
      },
      {
        id: 'highway-name-minor',
        type: 'symbol',
        source: PERU_PMTILES_SOURCE_ID,
        'source-layer': 'roads',
        minzoom: 0,
        maxzoom: 24,
        filter: ['in', ['get', 'pmap:kind'], ['literal', ['minor_road', 'residential', 'unclassified']]],
        layout: {
          'symbol-placement': 'line',
          'symbol-sort-key': 40,
          'symbol-spacing': ['interpolate', ['linear'], ['zoom'], 8, 150, 13, 200, 16, 240],
          'text-field': ['coalesce', ['get', 'name:es'], ['get', 'name'], ''],
          'text-font': ['Noto Sans Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 6, 8.6, 12, 9.8, 16, 12.2, 18, 13.8],
          'text-keep-upright': true,
          'text-padding': ['interpolate', ['linear'], ['zoom'], 6, 1, 14, 2],
        },
        paint: {
          'text-color': isNight ? '#e2e8f0' : '#1e293b',
          'text-halo-color': isNight ? '#131c2b' : '#ffffff',
          'text-halo-width': 2.4,
          'text-opacity': ['interpolate', ['linear'], ['zoom'], 6, 0.78, 12, 0.88, 15, 0.98],
        },
      },
      {
        id: SEC_ROADNAME_LAYER_ID,
        type: 'symbol',
        source: PERU_PMTILES_SOURCE_ID,
        'source-layer': 'roads',
        minzoom: 0,
        maxzoom: 24,
        filter: ['in', ['get', 'pmap:kind'], ['literal', ['medium_road', 'secondary', 'tertiary']]],
        layout: {
          'symbol-placement': 'line',
          'symbol-sort-key': 30,
          'symbol-spacing': ['interpolate', ['linear'], ['zoom'], 8, 150, 13, 200, 16, 240],
          'text-field': ['coalesce', ['get', 'name:es'], ['get', 'name'], ''],
          'text-font': ['Noto Sans Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 6, 9.0, 11, 10.2, 14, 11.4, 16, 12.6],
          'text-keep-upright': true,
          'text-padding': ['interpolate', ['linear'], ['zoom'], 6, 1, 14, 2],
        },
        paint: {
          'text-color': isNight ? '#f1f5f9' : '#0f172a',
          'text-halo-color': isNight ? '#131c2b' : '#ffffff',
          'text-halo-width': 2.5,
          'text-opacity': ['interpolate', ['linear'], ['zoom'], 6, 0.84, 12, 0.92, 15, 0.98],
        },
      },
      {
        id: 'highway-name-major',
        type: 'symbol',
        source: PERU_PMTILES_SOURCE_ID,
        'source-layer': 'roads',
        minzoom: 0,
        maxzoom: 24,
        filter: ['in', ['get', 'pmap:kind'], ['literal', ['major_road', 'highway', 'primary', 'trunk', 'motorway']]],
        layout: {
          'symbol-placement': 'line',
          'symbol-sort-key': 20,
          'symbol-spacing': ['interpolate', ['linear'], ['zoom'], 8, 160, 13, 220, 16, 260],
          'text-field': ['coalesce', ['get', 'name:es'], ['get', 'name'], ''],
          'text-font': ['Noto Sans Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 6, 9.6, 11, 11.0, 14, 12.2, 16, 13.5],
          'text-keep-upright': true,
          'text-padding': ['interpolate', ['linear'], ['zoom'], 6, 1, 14, 2],
        },
        paint: {
          'text-color': isNight ? '#ffffff' : '#0f172a',
          'text-halo-color': isNight ? '#131c2b' : '#ffffff',
          'text-halo-width': 2.6,
          'text-opacity': ['interpolate', ['linear'], ['zoom'], 6, 0.92, 12, 1],
        },
      },
      {
        id: 'label_city',
        type: 'symbol',
        source: PERU_PMTILES_SOURCE_ID,
        'source-layer': 'places',
        minzoom: 0,
        maxzoom: 24,
        layout: {
          'symbol-sort-key': 10,
          'text-field': ['coalesce', ['get', 'name:es'], ['get', 'name'], ''],
          'text-font': ['Noto Sans Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 5, 10.5, 10, 12.5, 14, 14],
          'text-keep-upright': true,
        },
        paint: {
          'text-color': isNight ? '#ffffff' : '#1e293b',
          'text-halo-color': isNight ? '#111927' : '#ffffff',
          'text-halo-width': 2.2,
        },
      },
    ],
  };
}

function createGenericPmtilesVectorStyle(
  mode: MapTileMode,
  vectorLayerIds: string[]
): StyleSpecification {
  const isNight = mode === 'night';
  const layers: StyleSpecification['layers'] = [
    {
      id: 'background',
      type: 'background',
      paint: { 'background-color': isNight ? '#1e293b' : '#e8e5dc' },
    },
  ];

  vectorLayerIds.forEach((sourceLayer, idx) => {
    const lower = sourceLayer.toLowerCase();
    const isWater = lower.includes('water');
    const isGreen =
      lower.includes('park') ||
      lower.includes('land') ||
      lower.includes('forest') ||
      lower.includes('green');
    const isBuilding = lower.includes('build');
    const isPlace = lower.includes('place') || lower.includes('city') || lower.includes('label');

    layers.push({
      id: `peru-pmtiles-fill-${idx}`,
      type: 'fill',
      source: PERU_PMTILES_SOURCE_ID,
      'source-layer': sourceLayer,
      minzoom: 0,
      maxzoom: 24,
      filter: ['==', ['geometry-type'], 'Polygon'],
      paint: {
        'fill-color': isWater
          ? isNight
            ? '#112647'
            : '#9acae8'
          : isGreen
          ? isNight
            ? '#1d4335'
            : '#bfe0bb'
          : isBuilding
          ? isNight
            ? '#2c3b52'
            : '#dad6cc'
          : isNight
          ? '#243146'
          : '#e1ddd3',
        'fill-outline-color': isBuilding
          ? isNight
            ? '#475c7d'
            : '#c4bfb4'
          : undefined,
        'fill-opacity': isWater ? 0.9 : ['interpolate', ['linear'], ['zoom'], 6, 0.35, 13, 0.65],
      },
    });

    layers.push({
      id: `peru-pmtiles-line-casing-${idx}`,
      type: 'line',
      source: PERU_PMTILES_SOURCE_ID,
      'source-layer': sourceLayer,
      minzoom: 0,
      maxzoom: 24,
      filter: ['==', ['geometry-type'], 'LineString'],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': isWater
          ? isNight
            ? '#163563'
            : '#8ec2e2'
          : isNight
          ? '#162030'
          : '#7e8ca1',
        'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.75, 10, 1.4, 14, 3.0, 17, 6.2],
        'line-opacity': ['interpolate', ['linear'], ['zoom'], 5, 0.42, 12, 0.72],
      },
    });

    layers.push({
      id: `peru-pmtiles-line-${idx}`,
      type: 'line',
      source: PERU_PMTILES_SOURCE_ID,
      'source-layer': sourceLayer,
      minzoom: 0,
      maxzoom: 24,
      filter: ['==', ['geometry-type'], 'LineString'],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': isWater
          ? isNight
            ? '#1b3b6b'
            : '#9ecfe8'
          : isNight
          ? '#546b8f'
          : '#95a3b6',
        'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.5, 10, 0.95, 14, 2.2, 17, 4.6],
        'line-opacity': ['interpolate', ['linear'], ['zoom'], 5, 0.55, 12, 0.85],
      },
    });

    layers.push({
      id: `peru-pmtiles-point-${idx}`,
      type: 'circle',
      source: PERU_PMTILES_SOURCE_ID,
      'source-layer': sourceLayer,
      minzoom: 0,
      maxzoom: 24,
      filter: ['==', ['geometry-type'], 'Point'],
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 2.4, 14, 3.8],
        'circle-color': isNight ? '#38bdf8' : '#0284c7',
        'circle-stroke-width': 1,
        'circle-stroke-color': '#ffffff',
      },
    });

    layers.push({
      id: `peru-pmtiles-label-${idx}`,
      type: 'symbol',
      source: PERU_PMTILES_SOURCE_ID,
      'source-layer': sourceLayer,
      minzoom: 0,
      maxzoom: 24,
      filter: ['any', ['has', 'name:es'], ['has', 'name']],
      layout: {
        'symbol-placement': isPlace ? 'point' : 'line',
        'symbol-sort-key': isPlace ? 10 : 30,
        'symbol-spacing': 180,
        'text-field': ['coalesce', ['get', 'name:es'], ['get', 'name'], ''],
        'text-font': ['Noto Sans Regular'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 6, 9.2, 12, 11.2, 16, 13.2],
        'text-keep-upright': true,
        'text-padding': 1.5,
      },
      paint: {
        'text-color': isNight ? '#f1f5f9' : '#0f172a',
        'text-halo-color': isNight ? '#111927' : '#ffffff',
        'text-halo-width': 2.4,
      },
    });
  });

  return {
    version: 8,
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    sources: {
      [PERU_PMTILES_SOURCE_ID]: {
        type: 'vector',
        url: PERU_PMTILES_MAP_URL,
        attribution: OSM_ATTRIBUTION,
      },
    },
    layers,
  };
}

export async function resolveVectorStyleWithPmTiles(
  stage: 'liberty' | 'bright' = 'liberty',
  mode: MapTileMode = 'day'
): Promise<StyleSpecification> {
  ensurePmtilesProtocolRegistered();
  const pmtiles = getPeruPmtilesInstance();

  // Verifica el encabezado del archivo PMTiles primero (se almacena en caché en PMTiles para las teselas siguientes)
  await pmtiles.getHeader();

  let vectorLayerIds: Set<string> | null = null;
  try {
    const metadata: any = await pmtiles.getMetadata();
    if (Array.isArray(metadata?.vector_layers)) {
      vectorLayerIds = new Set(
        metadata.vector_layers
          .map((vl: any) => String(vl?.id || ''))
          .filter(Boolean)
      );
    }
  } catch {}

  if (
    vectorLayerIds &&
    !vectorLayerIds.has('transportation') &&
    !vectorLayerIds.has('transportation_name')
  ) {
    if (vectorLayerIds.has('roads')) {
      return createProtomapsVectorFallbackStyle(mode);
    }
    if (vectorLayerIds.size > 0) {
      return createGenericPmtilesVectorStyle(mode, Array.from(vectorLayerIds));
    }
  }

  let baseStyle = cachedBaseVectorStyles.get(stage);
  if (!baseStyle) {
    const styleUrl =
      stage === 'bright' ? OPENFREEMAP_BRIGHT_STYLE_URL : OPENFREEMAP_LIBERTY_STYLE_URL;
    const resp = await fetch(styleUrl);
    if (!resp.ok) {
      throw new Error(`No se pudo cargar estilo base (HTTP ${resp.status})`);
    }
    baseStyle = (await resp.json()) as StyleSpecification;
    cachedBaseVectorStyles.set(stage, baseStyle);
  }

  const cloned: StyleSpecification = JSON.parse(JSON.stringify(baseStyle));
  const origSources = (cloned.sources || {}) as Record<string, any>;
  const replacedVectorSourceIds = new Set<string>();

  for (const [sourceId, sourceDef] of Object.entries(origSources)) {
    if (sourceDef?.type === 'vector' || sourceId === 'openmaptiles') {
      replacedVectorSourceIds.add(sourceId);
    }
  }

  // Deja ÚNICAMENTE la fuente PMTiles de Perú (elimina OpenMapTiles y cualquier raster base como ne2_shaded)
  cloned.sources = {
    [PERU_PMTILES_SOURCE_ID]: {
      type: 'vector',
      url: PERU_PMTILES_MAP_URL,
      attribution: OSM_ATTRIBUTION,
    },
  };

  cloned.layers = (cloned.layers || [])
    .filter((layer: any) => {
      if (!layer.source) return true; // background
      return replacedVectorSourceIds.has(layer.source);
    })
    .map((layer: any) => {
      if (layer.source && replacedVectorSourceIds.has(layer.source)) {
        const normalized: any = { ...layer, source: PERU_PMTILES_SOURCE_ID };
        if (!BASE_HIDDEN_NATIVE_POI_IDS.has(layer.id)) {
          // Desbloquear umbrales restrictivos de minzoom/maxzoom desde el estilo base
          normalized.minzoom = 0;
          delete normalized.maxzoom;
        }
        return normalized;
      }
      return layer;
    });

  return cloned;
}

export function getStyleForTileMode(
  mode: MapTileMode,
  stage: OpenFreeMapFallbackStage = 'liberty',
  openMapTilesEnabled: boolean = true
): string | StyleSpecification {
  if (mode === 'satellite') return SATELLITE_STYLE;
  if (!openMapTilesEnabled) {
    return createVectorPmtilesBootstrapStyle(mode);
  }
  if (stage === 'osm_raster') {
    return mode === 'night' ? OSM_RASTER_NIGHT_STYLE : OSM_RASTER_DAY_STYLE;
  }
  if (stage === 'bright') return OPENFREEMAP_BRIGHT_STYLE_URL;
  return OPENFREEMAP_LIBERTY_STYLE_URL;
}

export const SEC_ROADNAME_LAYER_ID = 'ruta-roadname-sec';

// Prefiere nombre español/local (name:es / name_es / name) y traduce sufijos en inglés
// únicamente en nombres de calles/avenidas ("... Avenue" -> "Avenida ...", "... Street" -> "Calle ...", "... Road" -> "Carretera ...")
export const SPANISH_ROAD_NAME_TEXT_FIELD: any = [
  'let',
  'n',
  ['coalesce', ['get', 'name:es'], ['get', 'name_es'], ['get', 'name'], ['get', 'name:latin'], ['get', 'name_en'], ['get', 'name:en'], ''],
  [
    'let',
    'len',
    ['length', ['var', 'n']],
    [
      'case',
      ['all', ['>', ['var', 'len'], 7], ['==', ['slice', ['var', 'n'], ['-', ['var', 'len'], 7]], ' Avenue']],
      ['concat', 'Avenida ', ['slice', ['var', 'n'], 0, ['-', ['var', 'len'], 7]]],
      ['all', ['>', ['var', 'len'], 7], ['==', ['slice', ['var', 'n'], ['-', ['var', 'len'], 7]], ' Street']],
      ['concat', 'Calle ', ['slice', ['var', 'n'], 0, ['-', ['var', 'len'], 7]]],
      ['all', ['>', ['var', 'len'], 5], ['==', ['slice', ['var', 'n'], ['-', ['var', 'len'], 5]], ' Road']],
      ['concat', 'Carretera ', ['slice', ['var', 'n'], 0, ['-', ['var', 'len'], 5]]],
      ['var', 'n'],
    ],
  ],
];

export function applySpanishRoadNameFormatting(map: maplibregl.Map): void {
  try {
    const layers = map.getStyle()?.layers || [];
    for (const layer of layers) {
      if (layer.type !== 'symbol') continue;
      const sourceLayer = (layer as any)['source-layer'];
      const isRoadNameLayer =
        layer.id === SEC_ROADNAME_LAYER_ID ||
        (sourceLayer === 'transportation_name' && !layer.id.includes('shield'));
      if (isRoadNameLayer) {
        try {
          map.setLayoutProperty(layer.id, 'text-field', SPANISH_ROAD_NAME_TEXT_FIELD);
        } catch {}
      }
    }
  } catch {}
}

export const VECTOR_LABEL_PRIORITY = {
  COUNTRY_CITY: 10,
  HIGHWAY_MAJOR: 20,
  SECONDARY_ROAD: 30,
  MINOR_STREET: 40,
  PATH_SERVICE: 50,
} as const;

// Orden ascendente de capas de etiquetas: las últimas en la lista se dibujan más arriba
// y tienen mayor prioridad en la resolución de colisiones de MapLibre.
const PRIORITIZED_LABEL_LAYER_STACK: Array<{ id: string; sortKey: number }> = [
  { id: 'highway-name-path', sortKey: VECTOR_LABEL_PRIORITY.PATH_SERVICE },
  { id: 'waterway_line_label', sortKey: VECTOR_LABEL_PRIORITY.MINOR_STREET + 4 },
  { id: 'water_name_line_label', sortKey: VECTOR_LABEL_PRIORITY.MINOR_STREET + 2 },
  { id: 'water_name_point_label', sortKey: VECTOR_LABEL_PRIORITY.MINOR_STREET + 2 },
  { id: 'highway-name-minor', sortKey: VECTOR_LABEL_PRIORITY.MINOR_STREET },
  { id: 'label_other', sortKey: VECTOR_LABEL_PRIORITY.SECONDARY_ROAD + 4 },
  { id: 'label_village', sortKey: VECTOR_LABEL_PRIORITY.SECONDARY_ROAD + 2 },
  { id: SEC_ROADNAME_LAYER_ID, sortKey: VECTOR_LABEL_PRIORITY.SECONDARY_ROAD },
  { id: 'highway-name-major', sortKey: VECTOR_LABEL_PRIORITY.HIGHWAY_MAJOR },
  { id: 'highway-shield-non-us', sortKey: VECTOR_LABEL_PRIORITY.HIGHWAY_MAJOR - 2 },
  { id: 'highway-shield-us-interstate', sortKey: VECTOR_LABEL_PRIORITY.HIGHWAY_MAJOR - 2 },
  { id: 'road_shield_us', sortKey: VECTOR_LABEL_PRIORITY.HIGHWAY_MAJOR - 2 },
  { id: 'label_town', sortKey: VECTOR_LABEL_PRIORITY.COUNTRY_CITY + 4 },
  { id: 'airport', sortKey: VECTOR_LABEL_PRIORITY.COUNTRY_CITY + 3 },
  { id: 'label_city', sortKey: VECTOR_LABEL_PRIORITY.COUNTRY_CITY + 2 },
  { id: 'label_city_capital', sortKey: VECTOR_LABEL_PRIORITY.COUNTRY_CITY + 1 },
  { id: 'label_state', sortKey: VECTOR_LABEL_PRIORITY.COUNTRY_CITY + 1 },
  { id: 'label_country_3', sortKey: VECTOR_LABEL_PRIORITY.COUNTRY_CITY },
  { id: 'label_country_2', sortKey: VECTOR_LABEL_PRIORITY.COUNTRY_CITY },
  { id: 'label_country_1', sortKey: VECTOR_LABEL_PRIORITY.COUNTRY_CITY },
];

const BASE_HIDDEN_NATIVE_POI_IDS = new Set(['poi_r20', 'poi_r7', 'poi_r1', 'poi_transit']);

export function ensureOpenFreeMapSecRoadNameLayer(map: maplibregl.Map): void {
  try {
    const vectorSourceId = map.getSource(PERU_PMTILES_SOURCE_ID)
      ? PERU_PMTILES_SOURCE_ID
      : map.getSource('openmaptiles')
      ? 'openmaptiles'
      : null;
    if (!vectorSourceId) return;

    const majorLayer = map.getLayer('highway-name-major') as any;
    const majorSourceLayer = majorLayer?.sourceLayer || majorLayer?.['source-layer'];
    if (majorLayer && majorSourceLayer !== 'transportation_name') {
      return;
    }

    if (majorLayer) {
      map.setFilter('highway-name-major', [
        'match',
        ['get', 'class'],
        ['primary', 'trunk', 'motorway'],
        true,
        false,
      ]);
    }
    if (!map.getLayer(SEC_ROADNAME_LAYER_ID) && majorLayer) {
      const sourceTextFont = majorLayer?.getLayoutProperty?.('text-font') || ['Noto Sans Regular'];
      const beforeId = map.getLayer('highway-name-major') ? 'highway-name-major' : undefined;
      map.addLayer(
        {
          id: SEC_ROADNAME_LAYER_ID,
          type: 'symbol',
          source: vectorSourceId,
          'source-layer': 'transportation_name',
          minzoom: 0,
          filter: ['match', ['get', 'class'], ['secondary', 'tertiary'], true, false],
          layout: {
            'symbol-placement': 'line',
            'symbol-sort-key': VECTOR_LABEL_PRIORITY.SECONDARY_ROAD,
            'text-field': SPANISH_ROAD_NAME_TEXT_FIELD,
            'text-font': sourceTextFont,
            'text-rotation-alignment': 'map',
            'text-pitch-alignment': 'viewport',
            'text-keep-upright': true,
            'text-padding': ['interpolate', ['linear'], ['zoom'], 6, 1, 14, 2],
            'symbol-spacing': ['interpolate', ['linear'], ['zoom'], 8, 150, 13, 210, 16, 250],
            'text-size': [
              'interpolate',
              ['linear'],
              ['zoom'],
              6,
              8.8,
              11,
              10.0,
              14,
              11.6,
              16,
              12.6,
              18,
              14.0,
            ],
          },
          paint: {
            'text-color': '#0f172a',
            'text-halo-color': '#ffffff',
            'text-halo-width': 2.5,
            'text-halo-blur': 0.4,
          },
        },
        beforeId
      );
    }
    applySpanishRoadNameFormatting(map);
  } catch {}
}

/**
 * Ordena explícitamente las capas vectoriales para garantizar máxima legibilidad en todos los zooms:
 * 1. Base vectorial (terreno, edificios, calles secundarias y principales)
 * 2. POIs y franjas de radares fijos
 * 3. Ruta de vista previa y ruta principal activa (siempre sobre vías y edificios 2D/3D)
 * 4. Etiquetas priorizadas (de menor a mayor prioridad: pasajes -> calles -> secundarias -> principales -> ciudades)
 * 5. Flechas blancas de maniobra y bloqueador de destino en la cima absoluta
 */
export function prioritizeRouteAndLabelLayers(map: maplibregl.Map): void {
  try {
    if (!isMapStyleReadyForSources(map)) return;

    const topManeuverAnchorId = map.getLayer('ruta-maneuver-outline')
      ? 'ruta-maneuver-outline'
      : map.getLayer(DEST_COLLISION_LAYER_ID)
      ? DEST_COLLISION_LAYER_ID
      : undefined;

    // 1. Bloqueador de destino y flechas de maniobra siempre arriba de todo
    if (map.getLayer(DEST_COLLISION_LAYER_ID)) {
      try {
        map.moveLayer(DEST_COLLISION_LAYER_ID);
      } catch {}
    }
    for (const mId of [
      'ruta-maneuver-outline',
      'ruta-maneuver-arrow-outline',
      'ruta-maneuver-line',
      'ruta-maneuver-arrow',
    ]) {
      if (map.getLayer(mId) && map.getLayer(DEST_COLLISION_LAYER_ID)) {
        try {
          map.moveLayer(mId, DEST_COLLISION_LAYER_ID);
        } catch {}
      }
    }

    // 2. Capas de etiquetas priorizadas justo debajo de las flechas de maniobra (y encima de la ruta morada
    // para que los nombres de calles y distritos nunca queden tapados al alejar ni al navegar)
    const styleLayers = map.getStyle()?.layers || [];
    const customLabelIds = styleLayers
      .filter((l) => l.id.startsWith('peru-pmtiles-label-'))
      .map((l) => l.id);

    const orderedLabelIds = [
      ...PRIORITIZED_LABEL_LAYER_STACK.map((item) => item.id),
      ...customLabelIds,
    ];

    for (const labelId of orderedLabelIds) {
      if (!map.getLayer(labelId)) continue;
      try {
        map.moveLayer(labelId, topManeuverAnchorId);
      } catch {}
    }

    // Primer label existente para anclar la ruta activa inmediatamente debajo de los textos
    const firstVisibleLabelId =
      orderedLabelIds.find((id) => Boolean(map.getLayer(id))) ?? topManeuverAnchorId;

    // 3. Rutas (alternativas primero, luego ruta seleccionada y activa) sobre calles, edificios y POIs, justo debajo de las etiquetas
    for (const routeId of [
      'ruta-preview-alt-outline',
      'ruta-preview-alt-line',
      'ruta-preview-glow',
      'ruta-preview-outline',
      'ruta-preview-line',
      'ruta-active-glow',
      'ruta-active-outline',
      'ruta-active-line',
    ]) {
      if (!map.getLayer(routeId)) continue;
      try {
        map.moveLayer(routeId, firstVisibleLabelId);
      } catch {}
    }

    // 4. Franjas de radar y POIs justo debajo de las rutas
    const beforeRouteId = map.getLayer('ruta-preview-alt-outline')
      ? 'ruta-preview-alt-outline'
      : map.getLayer('ruta-preview-glow')
      ? 'ruta-preview-glow'
      : map.getLayer('ruta-active-glow')
      ? 'ruta-active-glow'
      : firstVisibleLabelId;

    for (const radarStripId of [
      FIXED_RADAR_STRIPS_OUTLINE_LAYER_ID,
      FIXED_RADAR_STRIPS_FILL_LAYER_ID,
    ]) {
      if (map.getLayer(radarStripId)) {
        try {
          map.moveLayer(radarStripId, beforeRouteId);
        } catch {}
      }
    }

    const beforeRadarOrRouteId = map.getLayer(FIXED_RADAR_STRIPS_OUTLINE_LAYER_ID)
      ? FIXED_RADAR_STRIPS_OUTLINE_LAYER_ID
      : beforeRouteId;

    for (const poiLayerId of [POI_REGULAR_LAYER_ID, POI_ESSENTIAL_LAYER_ID]) {
      if (map.getLayer(poiLayerId) && beforeRadarOrRouteId) {
        try {
          map.moveLayer(poiLayerId, beforeRadarOrRouteId);
        } catch {}
      }
    }
  } catch {}
}

const ALL_LANDUSE_LANDCOVER_IDS = [
  'landuse_residential',
  'landuse-residential',
  'landuse-suburb',
  'landuse-commercial',
  'landuse-industrial',
  'landuse-railway',
  'landuse_cemetery',
  'landuse-cemetery',
  'landuse_hospital',
  'landuse-hospital',
  'landuse_school',
  'landuse-school',
  'landuse_pitch',
  'landuse_track',
  'landcover_sand',
  'landcover-sand',
  'landcover_ice',
  'landcover-glacier',
  'landcover-ice-shelf',
  'landcover_wetland',
  'park',
  'park_outline',
  'landcover_wood',
  'landcover-wood',
  'landcover_grass',
  'landcover-grass',
  'landcover-grass-park',
];

const WATERWAY_RIVER_IDS = [
  'waterway_river',
  'waterway-river',
  'waterway-river-intermittent',
];

const WATERWAY_MINOR_IDS = [
  'waterway_tunnel',
  'waterway_other',
  'waterway-stream-canal',
  'waterway-stream-canal-intermittent',
  'waterway-other',
  'waterway-other-intermittent',
];

const RAIL_MAIN_IDS = [
  'road_major_rail',
  'road_transit_rail',
  'tunnel_major_rail',
  'tunnel_transit_rail',
  'bridge_major_rail',
  'bridge_transit_rail',
  'railway',
  'railway-service',
  'railway-transit',
  'tunnel-railway',
  'bridge-railway',
  'cablecar',
];

const RAIL_HATCHING_IDS = [
  'road_major_rail_hatching',
  'road_transit_rail_hatching',
  'tunnel_major_rail_hatching',
  'tunnel_transit_rail_hatching',
  'bridge_major_rail_hatching',
  'bridge_transit_rail_hatching',
  'railway-hatching',
  'railway-service-hatching',
  'railway-transit-hatching',
  'bridge-railway-hatching',
  'cablecar-dash',
];

const AEROWAY_FILL_IDS = ['aeroway_fill', 'aeroway-area'];
const AEROWAY_RUNWAY_IDS = ['aeroway_runway', 'aeroway-runway', 'aeroway-runway-casing'];
const AEROWAY_TAXIWAY_IDS = ['aeroway_taxiway', 'aeroway-taxiway', 'aeroway-taxiway-casing'];

const ROAD_AREA_AND_PIER_FILL_IDS = [
  'road_area_pattern',
  'road_area_bridge',
  'road_area_pier',
  'highway-area',
];

const SERVICE_TRACK_ROAD_IDS = [
  'road_service_track_casing',
  'road_service_track',
  'bridge_service_track_casing',
  'bridge_service_track',
  'tunnel_service_track_casing',
  'tunnel_service_track',
  'road_path_pedestrian',
  'bridge_path_pedestrian_casing',
  'bridge_path_pedestrian',
  'tunnel_path_pedestrian',
  'highway-service-track-casing',
  'highway-service-track',
  'bridge-service-track-casing',
  'bridge-service-track',
  'tunnel-service-track-casing',
  'tunnel-service-track',
  'highway-path',
  'bridge-path-casing',
  'bridge-path',
  'tunnel-path',
  'road_pier',
];

const MINOR_ROAD_IDS = [
  'road_minor_casing',
  'road_minor',
  'bridge_street_casing',
  'bridge_street',
  'tunnel_street_casing',
  'tunnel_minor',
  'highway-minor-casing',
  'highway-minor',
  'bridge-minor-casing',
  'bridge-minor',
  'tunnel-minor-casing',
  'tunnel-minor',
];

const SECONDARY_TERTIARY_ROAD_IDS = [
  'road_secondary_tertiary_casing',
  'road_secondary_tertiary',
  'bridge_secondary_tertiary_casing',
  'bridge_secondary_tertiary',
  'tunnel_secondary_tertiary_casing',
  'tunnel_secondary_tertiary',
  'highway-secondary-tertiary-casing',
  'highway-secondary-tertiary',
  'bridge-secondary-tertiary-casing',
  'bridge-secondary-tertiary',
  'tunnel-secondary-tertiary-casing',
  'tunnel-secondary-tertiary',
];

const ROAD_LINK_IDS = [
  'road_link_casing',
  'road_link',
  'bridge_link_casing',
  'bridge_link',
  'tunnel_link_casing',
  'tunnel_link',
  'highway-link-casing',
  'highway-link',
  'bridge-link-casing',
  'bridge-link',
  'tunnel-link-casing',
  'tunnel-link',
];

const PRIMARY_TRUNK_ROAD_IDS = [
  'road_trunk_primary_casing',
  'road_trunk_primary',
  'bridge_trunk_primary_casing',
  'bridge_trunk_primary',
  'tunnel_trunk_primary_casing',
  'tunnel_trunk_primary',
  'highway-primary-casing',
  'highway-primary',
  'highway-trunk-casing',
  'highway-trunk',
  'bridge-trunk-primary-casing',
  'bridge-trunk-primary',
  'tunnel-trunk-primary-casing',
  'tunnel-trunk-primary',
];

const MOTORWAY_ROAD_IDS = [
  'road_motorway_casing',
  'road_motorway',
  'bridge_motorway_casing',
  'bridge_motorway',
  'tunnel_motorway_casing',
  'tunnel_motorway',
  'highway-motorway-casing',
  'highway-motorway',
  'bridge-motorway-casing',
  'bridge-motorway',
  'tunnel-motorway-casing',
  'tunnel-motorway',
];

const MOTORWAY_LINK_ROAD_IDS = [
  'road_motorway_link_casing',
  'road_motorway_link',
  'bridge_motorway_link_casing',
  'bridge_motorway_link',
  'tunnel_motorway_link_casing',
  'tunnel_motorway_link',
  'highway-motorway-link-casing',
  'highway-motorway-link',
  'bridge-motorway-link-casing',
  'bridge-motorway-link',
  'tunnel-motorway-link-casing',
  'tunnel-motorway-link',
];

const ONE_WAY_ARROW_IDS = [
  'road_one_way_arrow',
  'road_one_way_arrow_opposite',
  'road_oneway',
  'road_oneway_opposite',
];

/**
 * Desbloquea la visibilidad en todos los niveles de zoom (0..24) para los detalles vectoriales
 * y configura prioridades explícitas (`symbol-sort-key`, padding y orden Z) para evitar que
 * las calles secundarias, etiquetas o detalles menores desaparezcan al alejar la vista.
 */
export function applyVectorLayerPrioritization(map: maplibregl.Map): void {
  try {
    if (!isMapStyleReadyForSources(map)) return;
    const layers = map.getStyle()?.layers || [];

    // 1. Eliminar límites restrictivos de minzoom/maxzoom en TODAS las capas vectoriales base visibles
    for (const layer of layers) {
      const src = (layer as any).source;
      if (src !== 'openmaptiles' && src !== PERU_PMTILES_SOURCE_ID) continue;
      if (BASE_HIDDEN_NATIVE_POI_IDS.has(layer.id)) continue;
      try {
        const currentMin = typeof layer.minzoom === 'number' ? layer.minzoom : 0;
        const currentMax = typeof layer.maxzoom === 'number' ? layer.maxzoom : 24;
        if (currentMin > 0 || currentMax < 24) {
          map.setLayerZoomRange(layer.id, 0, 24);
        }
      } catch {}
    }

    // 2. Asignar prioridades de colisión (`symbol-sort-key`) y reglas de legibilidad en todos los zooms
    for (const item of PRIORITIZED_LABEL_LAYER_STACK) {
      if (!map.getLayer(item.id)) continue;
      try {
        map.setLayerZoomRange(item.id, 0, 24);
      } catch {}
      try {
        map.setLayoutProperty(item.id, 'symbol-sort-key', item.sortKey);
      } catch {}
      try {
        map.setLayoutProperty(item.id, 'text-keep-upright', true);
      } catch {}
      try {
        map.setLayoutProperty(item.id, 'text-optional', false);
      } catch {}
      try {
        map.setLayoutProperty(item.id, 'text-allow-overlap', false);
      } catch {}
      try {
        map.setLayoutProperty(item.id, 'text-ignore-placement', false);
      } catch {}
      try {
        map.setLayoutProperty(item.id, 'text-padding', [
          'interpolate',
          ['linear'],
          ['zoom'],
          6,
          1,
          12,
          1.5,
          16,
          2,
        ]);
      } catch {}
    }

    // 3. Reordenar pila Z (vías -> POIs -> ruta principal -> etiquetas -> flechas de maniobra)
    prioritizeRouteAndLabelLayers(map);
  } catch {}
}

export function isMapStyleReadyForSources(map: maplibregl.Map): boolean {
  try {
    const internalStyle = (map as any).style;
    if (!internalStyle) return false;
    if (typeof internalStyle._loaded === 'boolean') {
      return internalStyle._loaded;
    }
    return Boolean(map.isStyleLoaded());
  } catch {
    return false;
  }
}

// Darken OpenFreeMap (liberty / bright) vector style programmatically for Night mode
// with detailed Waze/Google Maps road & minor-detail visibility across all zoom levels (0..24)
export function applyGoogleMapsNightStyle(map: maplibregl.Map): void {
  ensureOpenFreeMapSecRoadNameLayer(map);

  const safeSetPaint = (layerId: string, prop: string, value: any) => {
    try {
      if (map.getLayer(layerId)) {
        map.setPaintProperty(layerId, prop as any, value);
      }
    } catch {}
  };

  const safeSetLayout = (layerId: string, prop: string, value: any) => {
    try {
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, prop as any, value);
      }
    } catch {}
  };

  const safeSetZoomRange = (layerId: string, minzoom: number, maxzoom: number) => {
    try {
      if (map.getLayer(layerId)) {
        map.setLayerZoomRange(layerId, minzoom, maxzoom);
      }
    } catch {}
  };

  // Ocultar capas POI nativas de OpenFreeMap (usamos nuestros íconos anclados a coordenadas sin texto)
  for (const basePoiId of ['poi_r20', 'poi_r7', 'poi_r1', 'poi_transit']) {
    safeSetLayout(basePoiId, 'visibility', 'none');
  }

  // Desbloquear umbrales de zoom de áreas verdes, usos de suelo y cobertura terrestre
  for (const landId of ALL_LANDUSE_LANDCOVER_IDS) {
    safeSetZoomRange(landId, 0, 24);
  }

  // Fondo azul grisáceo oscuro (sin deslumbrar) y contraste mejorado para edificios y vías
  safeSetPaint('background', 'background-color', '#1e293b');
  safeSetPaint('natural_earth', 'raster-opacity', 0.14);
  safeSetPaint('landuse_residential', 'fill-color', '#243146');
  safeSetPaint('landuse_residential', 'fill-opacity', 0.52);
  safeSetPaint('landuse-residential', 'fill-color', '#243146');
  safeSetPaint('landuse-residential', 'fill-opacity', 0.52);
  safeSetPaint('landuse-suburb', 'fill-color', '#212d40');
  safeSetPaint('landuse-suburb', 'fill-opacity', 0.52);
  safeSetPaint('landuse-commercial', 'fill-color', '#2f2d3d');
  safeSetPaint('landuse-commercial', 'fill-opacity', 0.58);
  safeSetPaint('landuse-industrial', 'fill-color', '#253042');
  safeSetPaint('landuse-industrial', 'fill-opacity', 0.58);
  safeSetPaint('landuse-railway', 'fill-color', '#232c3d');
  safeSetPaint('landuse-railway', 'fill-opacity', 0.58);
  safeSetPaint('landuse_cemetery', 'fill-color', '#20362f');
  safeSetPaint('landuse_cemetery', 'fill-opacity', 0.68);
  safeSetPaint('landuse-cemetery', 'fill-color', '#20362f');
  safeSetPaint('landuse-cemetery', 'fill-opacity', 0.68);
  safeSetPaint('landuse_hospital', 'fill-color', '#362735');
  safeSetPaint('landuse_hospital', 'fill-opacity', 0.72);
  safeSetPaint('landuse-hospital', 'fill-color', '#362735');
  safeSetPaint('landuse-hospital', 'fill-opacity', 0.72);
  safeSetPaint('landuse_school', 'fill-color', '#2e3127');
  safeSetPaint('landuse_school', 'fill-opacity', 0.7);
  safeSetPaint('landuse-school', 'fill-color', '#2e3127');
  safeSetPaint('landuse-school', 'fill-opacity', 0.7);
  safeSetPaint('landuse_pitch', 'fill-color', '#214537');
  safeSetPaint('landuse_pitch', 'fill-opacity', 0.76);
  safeSetPaint('landuse_track', 'fill-color', '#214537');
  safeSetPaint('landuse_track', 'fill-opacity', 0.76);
  safeSetPaint('landcover_sand', 'fill-color', '#2e313b');
  safeSetPaint('landcover_sand', 'fill-opacity', 0.58);
  safeSetPaint('landcover-sand', 'fill-color', '#2e313b');
  safeSetPaint('landcover-sand', 'fill-opacity', 0.58);
  safeSetPaint('landcover_ice', 'fill-color', '#28394f');
  safeSetPaint('landcover-glacier', 'fill-color', '#28394f');
  safeSetPaint('landcover-ice-shelf', 'fill-color', '#28394f');
  safeSetPaint('landcover_wetland', 'fill-opacity', 0.34);

  safeSetPaint('park', 'fill-color', '#1d4335');
  safeSetPaint('park', 'fill-opacity', 0.88);
  safeSetPaint('park', 'fill-outline-color', '#2a5e4b');
  safeSetPaint('park_outline', 'line-color', '#2a5e4b');
  safeSetPaint('park_outline', 'line-opacity', 0.8);
  safeSetPaint('landcover_wood', 'fill-color', '#1f4939');
  safeSetPaint('landcover_wood', 'fill-opacity', 0.72);
  safeSetPaint('landcover-wood', 'fill-color', '#1f4939');
  safeSetPaint('landcover-wood', 'fill-opacity', 0.72);
  for (const grassId of ['landcover_grass', 'landcover-grass', 'landcover-grass-park']) {
    safeSetPaint(grassId, 'fill-color', '#1c3e30');
    safeSetPaint(grassId, 'fill-opacity', 0.76);
  }

  // Aeropuertos y pistas visibles en todos los zooms con grosor proporcional
  for (const aeroFillId of AEROWAY_FILL_IDS) {
    safeSetZoomRange(aeroFillId, 0, 24);
    safeSetPaint(aeroFillId, 'fill-color', '#263247');
    safeSetPaint(aeroFillId, 'fill-opacity', 0.76);
  }
  for (const runwayId of AEROWAY_RUNWAY_IDS) {
    const isCasing = runwayId.includes('-casing');
    safeSetZoomRange(runwayId, 0, 24);
    safeSetPaint(runwayId, 'line-color', isCasing ? '#182233' : '#384863');
    safeSetPaint(runwayId, 'line-opacity', ['interpolate', ['linear'], ['zoom'], 5, 0.55, 11, 0.85]);
    safeSetPaint(runwayId, 'line-width', [
      'interpolate',
      ['linear'],
      ['zoom'],
      5,
      isCasing ? 1.0 : 0.7,
      11,
      isCasing ? 3.5 : 2.4,
      17,
      isCasing ? 40 : 32,
    ]);
  }
  for (const taxiId of AEROWAY_TAXIWAY_IDS) {
    const isCasing = taxiId.includes('-casing');
    safeSetZoomRange(taxiId, 0, 24);
    safeSetPaint(taxiId, 'line-color', isCasing ? '#182233' : '#313f57');
    safeSetPaint(taxiId, 'line-opacity', ['interpolate', ['linear'], ['zoom'], 5, 0.45, 11, 0.8]);
    safeSetPaint(taxiId, 'line-width', [
      'interpolate',
      ['linear'],
      ['zoom'],
      5,
      isCasing ? 0.65 : 0.4,
      11,
      isCasing ? 1.6 : 1.0,
      17,
      isCasing ? 10 : 7.5,
    ]);
  }

  // Edificios 2D y 3D visibles en todos los niveles de zoom con contraste progresivo
  safeSetZoomRange('building', 0, 24);
  safeSetPaint('building', 'fill-color', '#2c3b52');
  safeSetPaint('building', 'fill-outline-color', '#475c7d');
  safeSetPaint('building', 'fill-opacity', ['interpolate', ['linear'], ['zoom'], 6, 0.3, 12, 0.5, 14.5, 0.72, 16, 0.86]);
  safeSetZoomRange('building-top', 0, 24);
  safeSetPaint('building-top', 'fill-color', '#33445e');
  safeSetPaint('building-top', 'fill-outline-color', '#1c2636');
  safeSetPaint('building-top', 'fill-opacity', ['interpolate', ['linear'], ['zoom'], 6, 0.32, 12, 0.54, 14.5, 0.76, 16, 0.9]);
  safeSetZoomRange('building-3d', 0, 24);
  safeSetPaint('building-3d', 'fill-extrusion-color', '#394c6b');
  safeSetPaint('building-3d', 'fill-extrusion-opacity', ['interpolate', ['linear'], ['zoom'], 10, 0.36, 14, 0.88]);

  // Agua y cursos de agua visibles en todos los zooms con grosor proporcional
  safeSetZoomRange('water', 0, 24);
  safeSetZoomRange('water-intermittent', 0, 24);
  safeSetPaint('water', 'fill-color', '#112647');
  safeSetPaint('water-intermittent', 'fill-color', '#152e54');
  for (const riverId of WATERWAY_RIVER_IDS) {
    safeSetZoomRange(riverId, 0, 24);
    safeSetPaint(riverId, 'line-color', '#1b3b6b');
    safeSetPaint(riverId, 'line-width', ['interpolate', ['linear'], ['zoom'], 5, 0.5, 11, 1.0, 15, 2.2, 18, 4.2]);
    safeSetPaint(riverId, 'line-opacity', ['interpolate', ['linear'], ['zoom'], 5, 0.62, 12, 0.88]);
  }
  for (const minorWaterId of WATERWAY_MINOR_IDS) {
    safeSetZoomRange(minorWaterId, 0, 24);
    safeSetPaint(minorWaterId, 'line-color', '#1b3b6b');
    safeSetPaint(minorWaterId, 'line-width', ['interpolate', ['linear'], ['zoom'], 5, 0.35, 12, 0.75, 16, 1.7]);
    safeSetPaint(minorWaterId, 'line-opacity', ['interpolate', ['linear'], ['zoom'], 5, 0.5, 13, 0.8]);
  }

  // Vías férreas, tranvías y teleféricos visibles en todos los zooms sin sobrecargar al alejar
  for (const railId of RAIL_MAIN_IDS) {
    safeSetZoomRange(railId, 0, 24);
    safeSetPaint(railId, 'line-color', '#263144');
    safeSetPaint(railId, 'line-width', ['interpolate', ['linear'], ['zoom'], 5, 0.4, 12, 0.75, 16, 1.4, 19, 2.2]);
    safeSetPaint(railId, 'line-opacity', ['interpolate', ['linear'], ['zoom'], 5, 0.45, 13, 0.78]);
  }
  for (const hatchId of RAIL_HATCHING_IDS) {
    safeSetZoomRange(hatchId, 0, 24);
    safeSetPaint(hatchId, 'line-color', '#2f3d54');
    safeSetPaint(hatchId, 'line-width', ['interpolate', ['linear'], ['zoom'], 5, 0.7, 12, 1.3, 15, 2.6, 19, 5.5]);
    safeSetPaint(hatchId, 'line-opacity', ['interpolate', ['linear'], ['zoom'], 5, 0.35, 14, 0.68]);
  }

  for (const boundaryId of ['boundary_2', 'boundary_3', 'boundary_disputed']) {
    safeSetZoomRange(boundaryId, 0, 24);
    safeSetPaint(boundaryId, 'line-color', '#334155');
    safeSetPaint(boundaryId, 'line-opacity', 0.7);
  }

  const applyNightRoadGroup = (
    layerIds: string[],
    fillWidth: any,
    caseWidth: any,
    fillColor: any,
    caseColor: any,
    fillOpacityExpr?: any,
    caseOpacityExpr?: any,
    zoomRange?: [number, number]
  ) => {
    for (const id of layerIds) {
      const isCasing = id.includes('_case') || id.includes('_casing') || id.includes('-casing');
      if (zoomRange) {
        safeSetZoomRange(id, zoomRange[0], zoomRange[1]);
      }
      safeSetLayout(id, 'line-join', 'round');
      if (!id.includes('tunnel') && !id.includes('bridge')) {
        safeSetLayout(id, 'line-cap', 'round');
      }
      if (isCasing) {
        safeSetPaint(id, 'line-width', caseWidth);
        safeSetPaint(id, 'line-color', caseColor);
        if (caseOpacityExpr !== undefined) {
          safeSetPaint(id, 'line-opacity', caseOpacityExpr);
        }
      } else {
        safeSetPaint(id, 'line-width', fillWidth);
        safeSetPaint(id, 'line-color', fillColor);
        if (fillOpacityExpr !== undefined) {
          safeSetPaint(id, 'line-opacity', fillOpacityExpr);
        }
      }
    }
  };

  const localFillWidth = ['interpolate', ['linear'], ['zoom'], 5, 0.35, 11, 0.65, 14, 1.35, 15, 2.3, 16, 4.5, 17, 8.8, 18, 11.8];
  const localCaseWidth = ['interpolate', ['linear'], ['zoom'], 5, 0.55, 11, 0.95, 14, 1.95, 15, 3.1, 16, 5.7, 17, 11.4, 18, 15.0];

  // 1. Calles de servicio, pasajes y senderos: trazo fino proporcional al alejar
  applyNightRoadGroup(
    SERVICE_TRACK_ROAD_IDS,
    localFillWidth,
    localCaseWidth,
    ['interpolate', ['linear'], ['zoom'], 6, '#394a66', 14.5, '#435778', 16, '#4f658a', 18, '#5c759e'],
    '#162030',
    ['interpolate', ['linear'], ['zoom'], 5, 0.34, 12, 0.5, 14.5, 0.72, 16, 0.88, 17, 0.95],
    ['interpolate', ['linear'], ['zoom'], 5, 0.24, 12, 0.4, 14.5, 0.64, 16.2, 0.85],
    [0, 24]
  );

  for (const areaId of ROAD_AREA_AND_PIER_FILL_IDS) {
    safeSetZoomRange(areaId, 0, 24);
    safeSetPaint(areaId, 'fill-color', '#2d3d57');
    safeSetPaint(areaId, 'fill-opacity', ['interpolate', ['linear'], ['zoom'], 6, 0.22, 15, 0.42]);
  }

  // Calles locales y residenciales: visibles en todos los zooms con grosor proporcional
  applyNightRoadGroup(
    MINOR_ROAD_IDS,
    localFillWidth,
    localCaseWidth,
    ['interpolate', ['linear'], ['zoom'], 6, '#435675', 13, '#4c6285', 16, '#5d769e', 18, '#6c89b5'],
    '#162030',
    ['interpolate', ['linear'], ['zoom'], 5, 0.42, 11, 0.6, 14, 0.78, 15.5, 0.92, 16.5, 1],
    ['interpolate', ['linear'], ['zoom'], 5, 0.32, 11, 0.48, 14, 0.72, 16, 0.88, 17, 0.95],
    [0, 24]
  );

  // 2. Avenidas secundarias y terciarias: visibles siempre con grosor que se afina progresivamente al alejar
  applyNightRoadGroup(
    SECONDARY_TERTIARY_ROAD_IDS,
    ['interpolate', ['linear'], ['zoom'], 5, 0.6, 11, 1.15, 13.5, 2.1, 15, 4.0, 16, 6.6, 17, 11.8, 18, 15.4],
    ['interpolate', ['linear'], ['zoom'], 5, 0.9, 11, 1.65, 13.5, 2.8, 15, 5.2, 16, 8.2, 17, 14.8, 18, 19.0],
    ['interpolate', ['linear'], ['zoom'], 6, '#546b8f', 13.5, '#607aa3', 16, '#718eb8', 18, '#81a0cf'],
    '#172233',
    ['interpolate', ['linear'], ['zoom'], 5, 0.58, 11, 0.76, 13.5, 0.88, 15, 0.96, 16, 1],
    ['interpolate', ['linear'], ['zoom'], 5, 0.42, 11, 0.6, 13.5, 0.78, 15.5, 0.9, 16.5, 0.95],
    [0, 24]
  );

  // Enlaces / rampas no autopista: visibles en todos los zooms con grosor proporcional
  applyNightRoadGroup(
    ROAD_LINK_IDS,
    ['interpolate', ['linear'], ['zoom'], 5, 0.5, 12, 1.05, 14.8, 3.0, 16, 5.4, 18, 9.0],
    ['interpolate', ['linear'], ['zoom'], 5, 0.75, 12, 1.5, 14.8, 4.0, 16, 6.8, 18, 11.0],
    ['interpolate', ['linear'], ['zoom'], 6, '#7084a6', 14.8, '#6a86b3', 17, '#7c9bc9'],
    ['interpolate', ['linear'], ['zoom'], 6, '#1c2940', 14.8, '#172233'],
    ['interpolate', ['linear'], ['zoom'], 5, 0.5, 12, 0.72, 15.5, 0.96],
    ['interpolate', ['linear'], ['zoom'], 5, 0.38, 12, 0.58, 15.5, 0.88],
    [0, 24]
  );

  // 3. Vías principales y troncales (primary, trunk): tonos suaves originales y grosor proporcional al zoom
  applyNightRoadGroup(
    PRIMARY_TRUNK_ROAD_IDS,
    ['interpolate', ['linear'], ['zoom'], 5, 0.9, 11, 1.55, 13.4, 2.5, 14.8, 5.6, 16, 10.0, 17, 15.4, 18, 19.6],
    ['interpolate', ['linear'], ['zoom'], 5, 1.35, 11, 2.15, 13.4, 3.4, 14.8, 7.2, 16, 12.2, 17, 18.8, 18, 23.6],
    ['interpolate', ['linear'], ['zoom'], 5, '#968c59', 13.4, '#9c925e', 14.8, '#6a7f9e', 16, '#7794c2', 18, '#87a6d6'],
    ['interpolate', ['linear'], ['zoom'], 5, '#3e3a24', 13.4, '#423d26', 15, '#172133'],
    ['interpolate', ['linear'], ['zoom'], 5, 0.74, 11, 0.84, 13.4, 0.9, 14.8, 0.96, 16, 1],
    ['interpolate', ['linear'], ['zoom'], 5, 0.44, 13.4, 0.6, 15, 0.78, 16, 0.88],
    [0, 24]
  );

  // 4. Autopistas y vías expresas (motorway): tonos suaves originales y grosor proporcional al zoom
  applyNightRoadGroup(
    MOTORWAY_ROAD_IDS,
    ['interpolate', ['linear'], ['zoom'], 5, 1.05, 11, 1.85, 13.4, 2.9, 14.8, 6.8, 16, 11.8, 17, 17.6, 18, 22.2],
    ['interpolate', ['linear'], ['zoom'], 5, 1.55, 11, 2.55, 13.4, 3.9, 14.8, 8.4, 16, 14.2, 17, 21.2, 18, 26.4],
    ['interpolate', ['linear'], ['zoom'], 5, '#9e935e', 13.4, '#a39863', 14.8, '#7288ab', 16, '#82a0cf', 18, '#93b2e3'],
    ['interpolate', ['linear'], ['zoom'], 5, '#423d26', 13.4, '#474229', 15, '#182338'],
    ['interpolate', ['linear'], ['zoom'], 5, 0.8, 11, 0.88, 13.4, 0.92, 14.8, 0.96, 16, 1],
    ['interpolate', ['linear'], ['zoom'], 5, 0.48, 13.4, 0.65, 15, 0.8, 16, 0.9],
    [0, 24]
  );

  applyNightRoadGroup(
    MOTORWAY_LINK_ROAD_IDS,
    ['interpolate', ['linear'], ['zoom'], 5, 0.65, 12, 1.3, 14.8, 3.8, 16, 7.0, 18, 11.2],
    ['interpolate', ['linear'], ['zoom'], 5, 0.95, 12, 1.8, 14.8, 5.0, 16, 8.8, 18, 13.8],
    ['interpolate', ['linear'], ['zoom'], 6, '#9e935e', 14.8, '#6e8ab5', 17, '#82a0cf'],
    ['interpolate', ['linear'], ['zoom'], 6, '#423d26', 14.8, '#182338'],
    ['interpolate', ['linear'], ['zoom'], 5, 0.58, 12, 0.76, 15, 0.94],
    ['interpolate', ['linear'], ['zoom'], 5, 0.42, 12, 0.62, 15, 0.85],
    [0, 24]
  );

  // Flechas de sentido único discretas en modo noche
  for (const arrowId of ONE_WAY_ARROW_IDS) {
    safeSetZoomRange(arrowId, 0, 24);
    safeSetLayout(arrowId, 'visibility', 'visible');
    safeSetPaint(arrowId, 'icon-opacity', ['interpolate', ['linear'], ['zoom'], 5, 0.25, 13, 0.45, 16, 0.6]);
  }

  // 5. Nombres de calles nítidos en TODOS los niveles de zoom con priorización por jerarquía vial
  const nightRoadLabels: Array<{
    id: string;
    size: any;
    color: string;
    haloWidth: number;
    opacity: any;
    spacing: any;
    sortKey: number;
  }> = [
    {
      id: 'highway-name-path',
      size: ['interpolate', ['linear'], ['zoom'], 6, 8.2, 13, 9.4, 16, 11.4, 18, 13.2],
      color: '#cbd5e1',
      haloWidth: 2.0,
      opacity: ['interpolate', ['linear'], ['zoom'], 6, 0.72, 13, 0.84, 16, 0.94],
      spacing: ['interpolate', ['linear'], ['zoom'], 8, 160, 14, 210, 17, 250],
      sortKey: VECTOR_LABEL_PRIORITY.PATH_SERVICE,
    },
    {
      id: 'highway-name-minor',
      size: ['interpolate', ['linear'], ['zoom'], 6, 8.6, 12, 9.8, 15, 11.2, 17, 13.6, 18, 15.2],
      color: '#e2e8f0',
      haloWidth: 2.4,
      opacity: ['interpolate', ['linear'], ['zoom'], 6, 0.78, 12, 0.88, 15, 0.98],
      spacing: ['interpolate', ['linear'], ['zoom'], 8, 150, 13, 195, 16, 220],
      sortKey: VECTOR_LABEL_PRIORITY.MINOR_STREET,
    },
    {
      id: SEC_ROADNAME_LAYER_ID,
      size: ['interpolate', ['linear'], ['zoom'], 6, 9.0, 11, 10.2, 14, 11.6, 16, 12.8, 18, 15.6],
      color: '#f1f5f9',
      haloWidth: 2.5,
      opacity: ['interpolate', ['linear'], ['zoom'], 6, 0.84, 11, 0.92, 14, 0.99],
      spacing: ['interpolate', ['linear'], ['zoom'], 8, 150, 13, 200, 16, 225],
      sortKey: VECTOR_LABEL_PRIORITY.SECONDARY_ROAD,
    },
    {
      id: 'highway-name-major',
      size: ['interpolate', ['linear'], ['zoom'], 6, 9.6, 11, 11.0, 14, 12.4, 16, 13.8, 18, 16.4],
      color: '#ffffff',
      haloWidth: 2.6,
      opacity: ['interpolate', ['linear'], ['zoom'], 6, 0.92, 11, 0.96, 13.5, 1],
      spacing: ['interpolate', ['linear'], ['zoom'], 8, 160, 13, 215, 16, 250],
      sortKey: VECTOR_LABEL_PRIORITY.HIGHWAY_MAJOR,
    },
  ];

  for (const spec of nightRoadLabels) {
    safeSetZoomRange(spec.id, 0, 24);
    safeSetLayout(spec.id, 'visibility', 'visible');
    safeSetLayout(spec.id, 'symbol-sort-key', spec.sortKey);
    safeSetLayout(spec.id, 'text-size', spec.size);
    safeSetLayout(spec.id, 'text-keep-upright', true);
    safeSetLayout(spec.id, 'text-rotation-alignment', 'map');
    safeSetLayout(spec.id, 'text-pitch-alignment', 'viewport');
    safeSetLayout(spec.id, 'symbol-spacing', spec.spacing);
    safeSetPaint(spec.id, 'text-color', spec.color);
    safeSetPaint(spec.id, 'text-halo-color', '#131c2b');
    safeSetPaint(spec.id, 'text-halo-width', spec.haloWidth);
    safeSetPaint(spec.id, 'text-opacity', spec.opacity);
  }

  // Etiquetas de lugares, distritos, ciudades y cuerpos de agua en modo noche
  for (const labelId of [
    'label_other',
    'label_village',
    'label_town',
    'label_state',
    'label_city',
    'label_city_capital',
    'label_country_1',
    'label_country_2',
    'label_country_3',
    'airport',
  ]) {
    safeSetZoomRange(labelId, 0, 24);
    safeSetLayout(labelId, 'visibility', 'visible');
    safeSetLayout(labelId, 'text-keep-upright', true);
    safeSetPaint(labelId, 'text-color', '#ffffff');
    safeSetPaint(labelId, 'text-halo-color', '#111927');
    safeSetPaint(labelId, 'text-halo-width', 2.2);
  }

  for (const waterLabelId of [
    'waterway_line_label',
    'water_name_point_label',
    'water_name_line_label',
  ]) {
    safeSetZoomRange(waterLabelId, 0, 24);
    safeSetLayout(waterLabelId, 'visibility', 'visible');
    safeSetPaint(waterLabelId, 'text-color', '#8fb3db');
    safeSetPaint(waterLabelId, 'text-halo-color', '#111927');
    safeSetPaint(waterLabelId, 'text-halo-width', 1.6);
  }

  for (const shieldId of [
    'highway-shield-non-us',
    'highway-shield-us-interstate',
    'road_shield_us',
  ]) {
    safeSetZoomRange(shieldId, 0, 24);
    safeSetLayout(shieldId, 'visibility', 'visible');
    safeSetLayout(shieldId, 'text-keep-upright', true);
    safeSetPaint(shieldId, 'text-color', '#f1f5f9');
    safeSetPaint(shieldId, 'icon-opacity', 0.9);
    safeSetPaint(shieldId, 'text-opacity', 1);
  }

  applyVectorLayerPrioritization(map);
}

// Style OpenFreeMap (liberty / bright) for Day mode with soft balanced colors,
// proportional width scaling on zoom-out, and full all-zoom visibility (0..24)
export function applyWazeStyleEnhancements(map: maplibregl.Map, mode: MapTileMode): void {
  if (mode === 'satellite') return;
  if (mode === 'night') {
    applyGoogleMapsNightStyle(map);
    return;
  }

  ensureOpenFreeMapSecRoadNameLayer(map);

  const safeSetPaint = (layerId: string, prop: string, value: any) => {
    try {
      if (map.getLayer(layerId)) {
        map.setPaintProperty(layerId, prop as any, value);
      }
    } catch {}
  };

  const safeSetLayout = (layerId: string, prop: string, value: any) => {
    try {
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, prop as any, value);
      }
    } catch {}
  };

  const safeSetZoomRange = (layerId: string, minzoom: number, maxzoom: number) => {
    try {
      if (map.getLayer(layerId)) {
        map.setLayerZoomRange(layerId, minzoom, maxzoom);
      }
    } catch {}
  };

  // Ocultar POIs base de OpenFreeMap (se muestran únicamente nuestros íconos anclados a coordenadas)
  for (const basePoiId of ['poi_r20', 'poi_r7', 'poi_r1', 'poi_transit']) {
    safeSetLayout(basePoiId, 'visibility', 'none');
  }

  // Desbloquear umbrales de zoom en usos de suelo, parques y cobertura terrestre
  for (const landId of ALL_LANDUSE_LANDCOVER_IDS) {
    safeSetZoomRange(landId, 0, 24);
  }

  // Fondo claro cálido y equilibrado original para resaltar vías suaves, edificios y áreas verdes
  safeSetPaint('background', 'background-color', '#e8e5dc');
  safeSetPaint('natural_earth', 'raster-opacity', ['interpolate', ['exponential', 1.5], ['zoom'], 0, 0.5, 6, 0.1]);
  safeSetPaint('landuse_residential', 'fill-color', '#e1ddd3');
  safeSetPaint('landuse_residential', 'fill-opacity', 0.65);
  safeSetPaint('landuse-residential', 'fill-color', '#e1ddd3');
  safeSetPaint('landuse-residential', 'fill-opacity', 0.65);
  safeSetPaint('landuse-suburb', 'fill-color', '#e4e0d6');
  safeSetPaint('landuse-suburb', 'fill-opacity', 0.65);
  safeSetPaint('landuse-commercial', 'fill-color', '#eadcc7');
  safeSetPaint('landuse-commercial', 'fill-opacity', 0.68);
  safeSetPaint('landuse-industrial', 'fill-color', '#dcdad3');
  safeSetPaint('landuse-industrial', 'fill-opacity', 0.68);
  safeSetPaint('landuse-railway', 'fill-color', '#d9dbe0');
  safeSetPaint('landuse-railway', 'fill-opacity', 0.68);
  safeSetPaint('landuse_cemetery', 'fill-color', '#cedbc1');
  safeSetPaint('landuse_cemetery', 'fill-opacity', 0.76);
  safeSetPaint('landuse-cemetery', 'fill-color', '#cedbc1');
  safeSetPaint('landuse-cemetery', 'fill-opacity', 0.76);
  safeSetPaint('landuse_hospital', 'fill-color', '#f3dde2');
  safeSetPaint('landuse_hospital', 'fill-opacity', 0.78);
  safeSetPaint('landuse-hospital', 'fill-color', '#f3dde2');
  safeSetPaint('landuse-hospital', 'fill-opacity', 0.78);
  safeSetPaint('landuse_school', 'fill-color', '#e4e5c3');
  safeSetPaint('landuse_school', 'fill-opacity', 0.76);
  safeSetPaint('landuse-school', 'fill-color', '#e4e5c3');
  safeSetPaint('landuse-school', 'fill-opacity', 0.76);
  safeSetPaint('landuse_pitch', 'fill-color', '#cfe0be');
  safeSetPaint('landuse_pitch', 'fill-opacity', 0.78);
  safeSetPaint('landuse_track', 'fill-color', '#cfe0be');
  safeSetPaint('landuse_track', 'fill-opacity', 0.78);
  safeSetPaint('landcover_sand', 'fill-color', '#ede3b9');
  safeSetPaint('landcover_sand', 'fill-opacity', 0.72);
  safeSetPaint('landcover-sand', 'fill-color', '#ede3b9');
  safeSetPaint('landcover-sand', 'fill-opacity', 0.72);
  safeSetPaint('landcover_ice', 'fill-color', '#d6e4e4');
  safeSetPaint('landcover-glacier', 'fill-color', '#d6e4e4');
  safeSetPaint('landcover-ice-shelf', 'fill-color', '#d6e4e4');
  safeSetPaint('landcover_wetland', 'fill-opacity', 0.72);

  safeSetPaint('park', 'fill-color', '#bfe0bb');
  safeSetPaint('park', 'fill-opacity', 0.85);
  safeSetPaint('park', 'fill-outline-color', '#8cc487');
  safeSetPaint('park_outline', 'line-color', '#a3d49e');
  safeSetPaint('park_outline', 'line-opacity', 0.82);
  safeSetPaint('landcover_wood', 'fill-color', '#b5dbb0');
  safeSetPaint('landcover_wood', 'fill-opacity', 0.55);
  safeSetPaint('landcover-wood', 'fill-color', '#b5dbb0');
  safeSetPaint('landcover-wood', 'fill-opacity', 0.55);
  for (const grassId of ['landcover_grass', 'landcover-grass', 'landcover-grass-park']) {
    safeSetPaint(grassId, 'fill-color', '#c2e3be');
    safeSetPaint(grassId, 'fill-opacity', 0.55);
  }

  // Aeropuertos y pistas visibles en todos los zooms con grosor proporcional
  for (const aeroFillId of AEROWAY_FILL_IDS) {
    safeSetZoomRange(aeroFillId, 0, 24);
    safeSetPaint(aeroFillId, 'fill-color', '#dcd9d1');
    safeSetPaint(aeroFillId, 'fill-opacity', 0.78);
  }
  for (const runwayId of AEROWAY_RUNWAY_IDS) {
    const isCasing = runwayId.includes('-casing');
    safeSetZoomRange(runwayId, 0, 24);
    safeSetPaint(runwayId, 'line-color', isCasing ? '#b8b5ad' : '#c9c6be');
    safeSetPaint(runwayId, 'line-opacity', ['interpolate', ['linear'], ['zoom'], 5, 0.58, 11, 0.88]);
    safeSetPaint(runwayId, 'line-width', [
      'interpolate',
      ['linear'],
      ['zoom'],
      5,
      isCasing ? 1.0 : 0.7,
      11,
      isCasing ? 3.5 : 2.4,
      17,
      isCasing ? 40 : 32,
    ]);
  }
  for (const taxiId of AEROWAY_TAXIWAY_IDS) {
    const isCasing = taxiId.includes('-casing');
    safeSetZoomRange(taxiId, 0, 24);
    safeSetPaint(taxiId, 'line-color', isCasing ? '#c0bdb5' : '#d1cec6');
    safeSetPaint(taxiId, 'line-opacity', ['interpolate', ['linear'], ['zoom'], 5, 0.48, 11, 0.82]);
    safeSetPaint(taxiId, 'line-width', [
      'interpolate',
      ['linear'],
      ['zoom'],
      5,
      isCasing ? 0.65 : 0.4,
      11,
      isCasing ? 1.6 : 1.0,
      17,
      isCasing ? 10 : 7.5,
    ]);
  }

  // Edificios 2D y 3D visibles en todos los niveles de zoom con contraste suave
  safeSetZoomRange('building', 0, 24);
  safeSetPaint('building', 'fill-color', '#dad6cc');
  safeSetPaint('building', 'fill-outline-color', '#c4bfb4');
  safeSetPaint('building', 'fill-opacity', ['interpolate', ['linear'], ['zoom'], 6, 0.28, 12, 0.46, 14.5, 0.68, 16, 0.8]);
  safeSetZoomRange('building-top', 0, 24);
  safeSetPaint('building-top', 'fill-color', '#e1ddd4');
  safeSetPaint('building-top', 'fill-outline-color', '#cac5ba');
  safeSetPaint('building-top', 'fill-opacity', ['interpolate', ['linear'], ['zoom'], 6, 0.3, 12, 0.5, 14.5, 0.72, 16, 0.85]);
  safeSetZoomRange('building-3d', 0, 24);
  safeSetPaint('building-3d', 'fill-extrusion-color', '#d6d2c8');
  safeSetPaint('building-3d', 'fill-extrusion-opacity', ['interpolate', ['linear'], ['zoom'], 10, 0.36, 14, 0.82]);

  // Agua y cursos de agua visibles en todos los zooms con grosor proporcional
  safeSetZoomRange('water', 0, 24);
  safeSetZoomRange('water-intermittent', 0, 24);
  safeSetPaint('water', 'fill-color', '#9acae8');
  safeSetPaint('water-intermittent', 'fill-color', '#afd7f0');
  for (const riverId of WATERWAY_RIVER_IDS) {
    safeSetZoomRange(riverId, 0, 24);
    safeSetPaint(riverId, 'line-color', '#9ecfe8');
    safeSetPaint(riverId, 'line-width', ['interpolate', ['linear'], ['zoom'], 5, 0.5, 11, 1.0, 15, 2.2, 18, 4.2]);
    safeSetPaint(riverId, 'line-opacity', ['interpolate', ['linear'], ['zoom'], 5, 0.68, 12, 0.9]);
  }
  for (const minorWaterId of WATERWAY_MINOR_IDS) {
    safeSetZoomRange(minorWaterId, 0, 24);
    safeSetPaint(minorWaterId, 'line-color', '#9ecfe8');
    safeSetPaint(minorWaterId, 'line-width', ['interpolate', ['linear'], ['zoom'], 5, 0.35, 12, 0.75, 16, 1.7]);
    safeSetPaint(minorWaterId, 'line-opacity', ['interpolate', ['linear'], ['zoom'], 5, 0.55, 13, 0.84]);
  }

  // Vías férreas, tranvías y teleféricos visibles en todos los zooms sin recargar al alejar
  for (const railId of RAIL_MAIN_IDS) {
    safeSetZoomRange(railId, 0, 24);
    safeSetPaint(railId, 'line-color', '#bbbbbb');
    safeSetPaint(railId, 'line-width', ['interpolate', ['linear'], ['zoom'], 5, 0.4, 12, 0.75, 16, 1.4, 19, 2.2]);
    safeSetPaint(railId, 'line-opacity', ['interpolate', ['linear'], ['zoom'], 5, 0.48, 13, 0.8]);
  }
  for (const hatchId of RAIL_HATCHING_IDS) {
    safeSetZoomRange(hatchId, 0, 24);
    safeSetPaint(hatchId, 'line-color', '#b3b3b3');
    safeSetPaint(hatchId, 'line-width', ['interpolate', ['linear'], ['zoom'], 5, 0.7, 12, 1.3, 15, 2.6, 19, 5.5]);
    safeSetPaint(hatchId, 'line-opacity', ['interpolate', ['linear'], ['zoom'], 5, 0.38, 14, 0.72]);
  }

  for (const boundaryId of ['boundary_2', 'boundary_3', 'boundary_disputed']) {
    safeSetZoomRange(boundaryId, 0, 24);
    safeSetPaint(boundaryId, 'line-color', '#cbd5e1');
    safeSetPaint(boundaryId, 'line-opacity', 0.72);
  }

  const applyRoadGroup = (
    layerIds: string[],
    fillWidth: any,
    caseWidth: any,
    fillColor: any,
    caseColor: any,
    minZoom?: number,
    fillOpacityExpr?: any,
    caseOpacityExpr?: any
  ) => {
    for (const id of layerIds) {
      const isCasing = id.includes('_case') || id.includes('_casing') || id.includes('-casing');
      if (minZoom !== undefined) {
        safeSetZoomRange(id, minZoom, 24);
      }
      // Cruces e intersecciones nítidas sin puntas ni solapamientos irregulares
      safeSetLayout(id, 'line-join', 'round');
      if (!id.includes('tunnel') && !id.includes('bridge')) {
        safeSetLayout(id, 'line-cap', 'round');
      }
      if (isCasing) {
        safeSetPaint(id, 'line-width', caseWidth);
        safeSetPaint(id, 'line-color', caseColor);
        if (caseOpacityExpr !== undefined) {
          safeSetPaint(id, 'line-opacity', caseOpacityExpr);
        }
      } else {
        safeSetPaint(id, 'line-width', fillWidth);
        safeSetPaint(id, 'line-color', fillColor);
        if (fillOpacityExpr !== undefined) {
          safeSetPaint(id, 'line-opacity', fillOpacityExpr);
        }
      }
    }
  };

  // 1. Calles pequeñas de servicio, pasajes y senderos: trazo fino que se reduce al alejar
  applyRoadGroup(
    SERVICE_TRACK_ROAD_IDS,
    ['interpolate', ['linear'], ['zoom'], 5, 0.35, 11, 0.65, 14.6, 1.45, 15.5, 2.8, 16, 4.2, 17, 7.0, 18, 9.4],
    ['interpolate', ['linear'], ['zoom'], 5, 0.55, 11, 0.95, 14.6, 2.1, 15.5, 4.0, 16, 5.7, 17, 9.2, 18, 12.0],
    '#bcc5d3',
    '#8795a8',
    0,
    ['interpolate', ['linear'], ['zoom'], 5, 0.36, 12, 0.56, 14.5, 0.8, 15.5, 0.92],
    ['interpolate', ['linear'], ['zoom'], 5, 0.26, 12, 0.46, 14.5, 0.72, 15.5, 0.86]
  );

  for (const areaId of ROAD_AREA_AND_PIER_FILL_IDS) {
    safeSetZoomRange(areaId, 0, 24);
    safeSetPaint(areaId, 'fill-color', '#e1ddd4');
    safeSetPaint(areaId, 'fill-opacity', ['interpolate', ['linear'], ['zoom'], 6, 0.32, 15, 0.72]);
  }

  // Calles pequeñas locales y residenciales: tonos suaves originales y grosor proporcional al alejar
  applyRoadGroup(
    MINOR_ROAD_IDS,
    ['interpolate', ['linear'], ['zoom'], 5, 0.4, 11, 0.8, 13.8, 1.5, 15, 3.2, 16, 5.2, 17, 9.2, 18, 12.2],
    ['interpolate', ['linear'], ['zoom'], 5, 0.65, 11, 1.2, 13.8, 2.2, 15, 4.5, 16, 7.0, 17, 12.0, 18, 15.6],
    ['interpolate', ['linear'], ['zoom'], 6, '#b4becd', 15.5, '#aab5c6', 17, '#a3afbf'],
    ['interpolate', ['linear'], ['zoom'], 6, '#7e8ca1', 15.5, '#6f7e94'],
    0,
    ['interpolate', ['linear'], ['zoom'], 5, 0.46, 11, 0.65, 13.8, 0.84, 15.4, 0.98],
    ['interpolate', ['linear'], ['zoom'], 5, 0.34, 11, 0.54, 13.8, 0.76, 15.5, 0.94]
  );

  // 2. Calles secundarias y terciarias: visibles en todos los zooms con tonos suaves y grosor proporcional
  applyRoadGroup(
    SECONDARY_TERTIARY_ROAD_IDS,
    ['interpolate', ['linear'], ['zoom'], 5, 0.65, 11, 1.25, 12.8, 2.0, 14.2, 3.6, 15, 5.6, 16, 8.0, 17, 12.4, 18, 16.0],
    ['interpolate', ['linear'], ['zoom'], 5, 1.0, 11, 1.8, 12.8, 2.9, 14.2, 5.0, 15, 7.4, 16, 10.2, 17, 15.6, 18, 19.8],
    ['interpolate', ['linear'], ['zoom'], 6, '#95a3b6', 14.5, '#8c9bb0', 16, '#8493a8'],
    ['interpolate', ['linear'], ['zoom'], 6, '#66758a', 14.5, '#59687d', 16, '#526075'],
    0,
    ['interpolate', ['linear'], ['zoom'], 5, 0.62, 11, 0.78, 13.5, 0.9, 14.6, 0.98],
    ['interpolate', ['linear'], ['zoom'], 5, 0.46, 11, 0.64, 13.5, 0.82, 14.6, 0.94]
  );

  applyRoadGroup(
    ROAD_LINK_IDS,
    ['interpolate', ['linear'], ['zoom'], 5, 0.5, 12, 1.15, 14.8, 3.4, 16, 6.4, 18, 10.4],
    ['interpolate', ['linear'], ['zoom'], 5, 0.8, 12, 1.7, 14.8, 4.7, 16, 8.2, 18, 12.8],
    ['interpolate', ['linear'], ['zoom'], 6, '#95a3b6', 15.0, '#8a99ae'],
    ['interpolate', ['linear'], ['zoom'], 6, '#66758a', 15.0, '#58677c'],
    0,
    ['interpolate', ['linear'], ['zoom'], 5, 0.54, 12, 0.76, 15.2, 0.98],
    ['interpolate', ['linear'], ['zoom'], 5, 0.42, 12, 0.64, 15.2, 0.94]
  );

  // 3. Avenidas principales (primary, trunk): tonos gris pizarra originales y grosor proporcional al alejar
  applyRoadGroup(
    PRIMARY_TRUNK_ROAD_IDS,
    ['interpolate', ['linear'], ['zoom'], 5, 0.95, 11, 1.8, 13.4, 3.0, 14.6, 6.2, 16, 11.4, 17, 16.4, 18, 20.8],
    ['interpolate', ['linear'], ['zoom'], 5, 1.4, 11, 2.5, 13.4, 4.2, 14.6, 8.2, 16, 14.2, 17, 20.0, 18, 25.0],
    ['interpolate', ['linear'], ['zoom'], 5, '#78869c', 11, '#758399', 13.4, '#6f7e94', 15, '#68778d', 16.5, '#637288'],
    ['interpolate', ['linear'], ['zoom'], 5, '#4c596e', 13.4, '#465368', 15, '#3b475c'],
    0,
    ['interpolate', ['linear'], ['zoom'], 5, 0.78, 11, 0.86, 13.4, 0.94, 14.8, 0.98, 16, 1],
    ['interpolate', ['linear'], ['zoom'], 5, 0.54, 11, 0.7, 13.4, 0.85, 15, 0.95, 16, 1]
  );

  // 4. Autopistas y vías expresas (motorway): gris pizarra oscuro original con grosor proporcional al alejar
  applyRoadGroup(
    MOTORWAY_ROAD_IDS,
    ['interpolate', ['linear'], ['zoom'], 5, 1.1, 11, 2.1, 13.4, 3.5, 14.6, 7.2, 16, 13.4, 17, 18.8, 18, 23.6],
    ['interpolate', ['linear'], ['zoom'], 5, 1.65, 11, 3.0, 13.4, 4.9, 14.6, 9.4, 16, 16.4, 17, 22.8, 18, 28.2],
    ['interpolate', ['linear'], ['zoom'], 5, '#64738a', 13.4, '#5e6d85', 15, '#55647c', 16.5, '#4f5e76'],
    ['interpolate', ['linear'], ['zoom'], 5, '#3b475c', 13.4, '#364154', 15, '#2c3647'],
    0,
    ['interpolate', ['linear'], ['zoom'], 5, 0.82, 11, 0.9, 13.4, 0.96, 14.8, 0.98, 16, 1],
    ['interpolate', ['linear'], ['zoom'], 5, 0.58, 11, 0.74, 13.4, 0.88, 15, 0.96, 16, 1]
  );

  applyRoadGroup(
    MOTORWAY_LINK_ROAD_IDS,
    ['interpolate', ['linear'], ['zoom'], 5, 0.7, 12, 1.5, 14.8, 4.4, 16, 8.2, 18, 12.4],
    ['interpolate', ['linear'], ['zoom'], 5, 1.05, 12, 2.2, 14.8, 5.8, 16, 10.2, 18, 15.0],
    ['interpolate', ['linear'], ['zoom'], 6, '#66758c', 15, '#5b6a82', 16.5, '#526179'],
    ['interpolate', ['linear'], ['zoom'], 6, '#3d495e', 15, '#354052'],
    0,
    ['interpolate', ['linear'], ['zoom'], 5, 0.62, 12, 0.8, 15, 0.98],
    ['interpolate', ['linear'], ['zoom'], 5, 0.48, 12, 0.68, 15, 0.95]
  );

  for (const arrowId of ONE_WAY_ARROW_IDS) {
    safeSetZoomRange(arrowId, 0, 24);
    safeSetLayout(arrowId, 'visibility', 'visible');
    safeSetPaint(arrowId, 'icon-opacity', ['interpolate', ['linear'], ['zoom'], 5, 0.3, 13, 0.6, 16, 0.85]);
  }

  // 5. Nombres de calles y avenidas visibles en TODOS los niveles de zoom con priorización por jerarquía
  const labelSpecs: Array<{
    id: string;
    size: any;
    color: string;
    haloWidth: number;
    opacity: any;
    spacing: any;
    sortKey: number;
  }> = [
    {
      id: 'highway-name-path',
      size: ['interpolate', ['linear'], ['zoom'], 6, 8.4, 13, 9.6, 15.5, 11.0, 18, 12.6],
      color: '#334155',
      haloWidth: 2.3,
      opacity: ['interpolate', ['linear'], ['zoom'], 6, 0.82, 13, 0.9, 16, 0.98],
      spacing: ['interpolate', ['linear'], ['zoom'], 8, 160, 14, 215, 17, 250],
      sortKey: VECTOR_LABEL_PRIORITY.PATH_SERVICE,
    },
    {
      id: 'highway-name-minor',
      size: ['interpolate', ['linear'], ['zoom'], 6, 8.8, 12, 10.0, 14.5, 11.2, 16.5, 12.4, 19, 14.0],
      color: '#1e293b',
      haloWidth: 2.5,
      opacity: ['interpolate', ['linear'], ['zoom'], 6, 0.86, 12, 0.94, 15, 1],
      spacing: ['interpolate', ['linear'], ['zoom'], 8, 150, 13, 205, 16, 245],
      sortKey: VECTOR_LABEL_PRIORITY.MINOR_STREET,
    },
    {
      id: SEC_ROADNAME_LAYER_ID,
      size: ['interpolate', ['linear'], ['zoom'], 6, 9.2, 11, 10.4, 13.5, 11.6, 16, 12.8, 19, 14.4],
      color: '#0f172a',
      haloWidth: 2.6,
      opacity: ['interpolate', ['linear'], ['zoom'], 6, 0.9, 11, 0.96, 14, 1],
      spacing: ['interpolate', ['linear'], ['zoom'], 8, 150, 13, 205, 16, 250],
      sortKey: VECTOR_LABEL_PRIORITY.SECONDARY_ROAD,
    },
    {
      id: 'highway-name-major',
      size: ['interpolate', ['linear'], ['zoom'], 6, 9.8, 11, 11.2, 14, 12.4, 16, 13.4, 19, 15.0],
      color: '#0f172a',
      haloWidth: 2.7,
      opacity: ['interpolate', ['linear'], ['zoom'], 6, 0.95, 11, 0.98, 13.5, 1],
      spacing: ['interpolate', ['linear'], ['zoom'], 8, 160, 13, 215, 16, 260],
      sortKey: VECTOR_LABEL_PRIORITY.HIGHWAY_MAJOR,
    },
  ];

  for (const spec of labelSpecs) {
    safeSetZoomRange(spec.id, 0, 24);
    safeSetLayout(spec.id, 'visibility', 'visible');
    safeSetLayout(spec.id, 'symbol-sort-key', spec.sortKey);
    safeSetLayout(spec.id, 'text-size', spec.size);
    safeSetLayout(spec.id, 'text-keep-upright', true);
    safeSetLayout(spec.id, 'text-rotation-alignment', 'map');
    safeSetLayout(spec.id, 'text-pitch-alignment', 'viewport');
    safeSetLayout(spec.id, 'text-letter-spacing', 0.01);
    safeSetLayout(spec.id, 'text-max-angle', 38);
    safeSetLayout(spec.id, 'symbol-spacing', spec.spacing);
    safeSetPaint(spec.id, 'text-color', spec.color);
    safeSetPaint(spec.id, 'text-halo-color', '#ffffff');
    safeSetPaint(spec.id, 'text-halo-width', spec.haloWidth);
    safeSetPaint(spec.id, 'text-halo-blur', 0.4);
    safeSetPaint(spec.id, 'text-opacity', spec.opacity);
  }

  // Restaurar etiquetas de lugares, distritos y agua en Día (visibles en todos los zooms)
  for (const labelId of [
    'label_other',
    'label_village',
    'label_town',
    'label_state',
    'label_city',
    'label_city_capital',
    'label_country_1',
    'label_country_2',
    'label_country_3',
    'airport',
  ]) {
    safeSetZoomRange(labelId, 0, 24);
    safeSetLayout(labelId, 'visibility', 'visible');
    safeSetLayout(labelId, 'text-keep-upright', true);
    safeSetPaint(labelId, 'text-color', '#1e293b');
    safeSetPaint(labelId, 'text-halo-color', '#ffffff');
    safeSetPaint(labelId, 'text-halo-width', 2.0);
  }

  for (const waterLabelId of [
    'waterway_line_label',
    'water_name_point_label',
    'water_name_line_label',
  ]) {
    safeSetZoomRange(waterLabelId, 0, 24);
    safeSetLayout(waterLabelId, 'visibility', 'visible');
    safeSetPaint(waterLabelId, 'text-color', '#2563eb');
    safeSetPaint(waterLabelId, 'text-halo-color', '#ffffff');
    safeSetPaint(waterLabelId, 'text-halo-width', 1.6);
  }

  for (const shieldId of [
    'highway-shield-non-us',
    'highway-shield-us-interstate',
    'road_shield_us',
  ]) {
    safeSetZoomRange(shieldId, 0, 24);
    safeSetLayout(shieldId, 'visibility', 'visible');
    safeSetLayout(shieldId, 'text-keep-upright', true);
    safeSetPaint(shieldId, 'text-color', '#1e293b');
    safeSetPaint(shieldId, 'icon-opacity', 1);
    safeSetPaint(shieldId, 'text-opacity', 1);
  }

  applyVectorLayerPrioritization(map);
}

/**
 * Optimiza el mapa base durante la selección / vista previa de rutas:
 * - Alto contraste, grosor definido y máxima nitidez (`line-blur: 0`) en todos los tramos.
 * - Calles secundarias, locales y pasajes siempre nítidos y visibles en cualquier zoom (0..24),
 *   sin desaparecer ni verse tenues al alejar el encuadre de la ruta.
 * - Jerarquía visual clara de 5 niveles (autopistas > avenidas principales > secundarias > locales > pasajes)
 *   sobre un lienzo limpio que permite leer toda la geografía de la ruta de un vistazo.
 */
export function applyRoutePreviewMapStyle(map: maplibregl.Map, mode: MapTileMode): void {
  if (mode === 'satellite' || !isMapStyleReadyForSources(map)) return;

  const isNight = mode === 'night';
  ensureOpenFreeMapSecRoadNameLayer(map);

  const safeSetPaint = (layerId: string, prop: string, value: any) => {
    try {
      if (map.getLayer(layerId)) {
        map.setPaintProperty(layerId, prop as any, value);
      }
    } catch {}
  };

  const safeSetLayout = (layerId: string, prop: string, value: any) => {
    try {
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, prop as any, value);
      }
    } catch {}
  };

  const safeSetZoomRange = (layerId: string, minzoom: number, maxzoom: number) => {
    try {
      if (map.getLayer(layerId)) {
        map.setLayerZoomRange(layerId, minzoom, maxzoom);
      }
    } catch {}
  };

  // Mantener ocultos POIs nativos duplicados y extrusión 3D en vista previa plana
  for (const basePoiId of ['poi_r20', 'poi_r7', 'poi_r1', 'poi_transit', 'building-3d']) {
    safeSetLayout(basePoiId, 'visibility', 'none');
  }

  for (const landId of ALL_LANDUSE_LANDCOVER_IDS) {
    safeSetZoomRange(landId, 0, 24);
  }

  // Lienzo limpio y equilibrado para maximizar el contraste de calles y rutas candidatas
  safeSetPaint('background', 'background-color', isNight ? '#141d2e' : '#ece9e1');
  safeSetPaint('natural_earth', 'raster-opacity', isNight ? 0.1 : 0.18);
  safeSetPaint('landuse_residential', 'fill-color', isNight ? '#1b273b' : '#e5e1d8');
  safeSetPaint('landuse_residential', 'fill-opacity', isNight ? 0.56 : 0.62);
  safeSetPaint('landuse-residential', 'fill-color', isNight ? '#1b273b' : '#e5e1d8');
  safeSetPaint('landuse-residential', 'fill-opacity', isNight ? 0.56 : 0.62);
  safeSetPaint('landuse-suburb', 'fill-color', isNight ? '#192436' : '#e7e3da');
  safeSetPaint('landuse-suburb', 'fill-opacity', isNight ? 0.54 : 0.6);
  safeSetPaint('landuse-commercial', 'fill-color', isNight ? '#24273a' : '#e9dfd0');
  safeSetPaint('landuse-commercial', 'fill-opacity', isNight ? 0.58 : 0.64);
  safeSetPaint('landuse-industrial', 'fill-color', isNight ? '#1f293b' : '#dedcd5');
  safeSetPaint('landuse-industrial', 'fill-opacity', isNight ? 0.58 : 0.64);
  safeSetPaint('landuse-railway', 'fill-color', isNight ? '#1d2638' : '#dbdde2');
  safeSetPaint('landuse-railway', 'fill-opacity', isNight ? 0.56 : 0.64);
  safeSetPaint('landuse_hospital', 'fill-color', isNight ? '#312332' : '#f2dce1');
  safeSetPaint('landuse-hospital', 'fill-color', isNight ? '#312332' : '#f2dce1');
  safeSetPaint('landuse_school', 'fill-color', isNight ? '#2a2e25' : '#e5e6c8');
  safeSetPaint('landuse-school', 'fill-color', isNight ? '#2a2e25' : '#e5e6c8');

  safeSetPaint('park', 'fill-color', isNight ? '#183b2e' : '#c6e3c2');
  safeSetPaint('park', 'fill-opacity', isNight ? 0.84 : 0.8);
  safeSetPaint('park', 'fill-outline-color', isNight ? '#255442' : '#96c991');
  safeSetPaint('park_outline', 'line-color', isNight ? '#255442' : '#96c991');
  safeSetPaint('park_outline', 'line-opacity', 0.85);
  safeSetPaint('landcover_wood', 'fill-color', isNight ? '#1b4233' : '#bcdeb7');
  safeSetPaint('landcover-wood', 'fill-color', isNight ? '#1b4233' : '#bcdeb7');
  for (const grassId of ['landcover_grass', 'landcover-grass', 'landcover-grass-park']) {
    safeSetPaint(grassId, 'fill-color', isNight ? '#18382b' : '#c8e6c4');
    safeSetPaint(grassId, 'fill-opacity', isNight ? 0.7 : 0.55);
  }

  // Edificios 2D nítidos pero subordinados a la malla vial
  safeSetZoomRange('building', 0, 24);
  safeSetPaint('building', 'fill-color', isNight ? '#24334b' : '#dfdbd1');
  safeSetPaint('building', 'fill-outline-color', isNight ? '#384c6b' : '#c9c4b9');
  safeSetPaint('building', 'fill-opacity', ['interpolate', ['linear'], ['zoom'], 6, 0.34, 12, 0.54, 15, 0.74]);
  safeSetZoomRange('building-top', 0, 24);
  safeSetPaint('building-top', 'fill-color', isNight ? '#2a3b56' : '#e5e1d8');
  safeSetPaint('building-top', 'fill-outline-color', isNight ? '#162030' : '#cfcabe');
  safeSetPaint('building-top', 'fill-opacity', ['interpolate', ['linear'], ['zoom'], 6, 0.34, 12, 0.56, 15, 0.78]);

  // Agua y ríos bien definidos como referencia geográfica
  safeSetZoomRange('water', 0, 24);
  safeSetZoomRange('water-intermittent', 0, 24);
  safeSetPaint('water', 'fill-color', isNight ? '#0f2444' : '#9bcbe8');
  safeSetPaint('water-intermittent', 'fill-color', isNight ? '#142d54' : '#afd7f0');
  for (const riverId of WATERWAY_RIVER_IDS) {
    safeSetZoomRange(riverId, 0, 24);
    safeSetPaint(riverId, 'line-color', isNight ? '#1f447a' : '#7ebde3');
    safeSetPaint(riverId, 'line-width', ['interpolate', ['linear'], ['zoom'], 5, 0.9, 11, 1.6, 15, 2.8, 18, 4.8]);
    safeSetPaint(riverId, 'line-opacity', 0.92);
    safeSetPaint(riverId, 'line-blur', 0);
  }
  for (const minorWaterId of WATERWAY_MINOR_IDS) {
    safeSetZoomRange(minorWaterId, 0, 24);
    safeSetPaint(minorWaterId, 'line-color', isNight ? '#1f447a' : '#8ac4e6');
    safeSetPaint(minorWaterId, 'line-width', ['interpolate', ['linear'], ['zoom'], 5, 0.6, 12, 1.15, 16, 2.1]);
    safeSetPaint(minorWaterId, 'line-opacity', 0.84);
    safeSetPaint(minorWaterId, 'line-blur', 0);
  }

  for (const railId of RAIL_MAIN_IDS) {
    safeSetZoomRange(railId, 0, 24);
    safeSetPaint(railId, 'line-color', isNight ? '#33425c' : '#94a3b8');
    safeSetPaint(railId, 'line-width', ['interpolate', ['linear'], ['zoom'], 5, 0.6, 12, 1.05, 16, 1.7]);
    safeSetPaint(railId, 'line-opacity', 0.78);
    safeSetPaint(railId, 'line-blur', 0);
  }

  const applyPreviewRoadGroup = (
    layerIds: string[],
    fillWidth: any,
    caseWidth: any,
    fillColor: any,
    caseColor: any,
    fillOpacity: any,
    caseOpacity: any
  ) => {
    for (const id of layerIds) {
      if (!map.getLayer(id)) continue;
      const isCasing = id.includes('_case') || id.includes('_casing') || id.includes('-casing');
      safeSetLayout(id, 'visibility', 'visible');
      safeSetZoomRange(id, 0, 24);
      safeSetLayout(id, 'line-join', 'round');
      if (!id.includes('tunnel') && !id.includes('bridge')) {
        safeSetLayout(id, 'line-cap', 'round');
      }
      safeSetPaint(id, 'line-blur', 0);
      if (isCasing) {
        safeSetPaint(id, 'line-width', caseWidth);
        safeSetPaint(id, 'line-color', caseColor);
        safeSetPaint(id, 'line-opacity', caseOpacity);
      } else {
        safeSetPaint(id, 'line-width', fillWidth);
        safeSetPaint(id, 'line-color', fillColor);
        safeSetPaint(id, 'line-opacity', fillOpacity);
      }
    }
  };

  // Nivel 1: Calles de servicio, pasajes y accesos menores — visibles, nítidos y sin desvanecerse
  applyPreviewRoadGroup(
    SERVICE_TRACK_ROAD_IDS,
    ['interpolate', ['linear'], ['zoom'], 5, 0.75, 10, 1.05, 12, 1.45, 14, 2.15, 16, 4.3, 18, 8.6],
    ['interpolate', ['linear'], ['zoom'], 5, 1.25, 10, 1.65, 12, 2.2, 14, 3.05, 16, 5.9, 18, 11.2],
    isNight ? '#465c7a' : '#f8fafc',
    isNight ? '#0e1524' : '#8b99ad',
    ['interpolate', ['linear'], ['zoom'], 5, 0.86, 11, 0.94, 14, 1.0],
    ['interpolate', ['linear'], ['zoom'], 5, 0.8, 11, 0.9, 14, 0.96]
  );

  for (const areaId of ROAD_AREA_AND_PIER_FILL_IDS) {
    safeSetZoomRange(areaId, 0, 24);
    safeSetPaint(areaId, 'fill-color', isNight ? '#2d3f5c' : '#e6e2d9');
    safeSetPaint(areaId, 'fill-opacity', 0.75);
  }

  // Nivel 2: Calles locales y residenciales — trazo blanco/azul-acero nítido con borde definido
  applyPreviewRoadGroup(
    MINOR_ROAD_IDS,
    ['interpolate', ['linear'], ['zoom'], 5, 0.95, 10, 1.35, 12, 1.9, 14, 2.9, 16, 5.5, 18, 11.4],
    ['interpolate', ['linear'], ['zoom'], 5, 1.55, 10, 2.15, 12, 2.95, 14, 4.25, 16, 7.6, 18, 14.8],
    isNight ? '#5b7499' : '#ffffff',
    isNight ? '#0c1321' : '#66778f',
    ['interpolate', ['linear'], ['zoom'], 5, 0.94, 11, 0.98, 13, 1.0],
    ['interpolate', ['linear'], ['zoom'], 5, 0.88, 11, 0.95, 13, 1.0]
  );

  // Nivel 3: Calles secundarias y terciarias — alto contraste y grosor firme en toda la vista previa
  applyPreviewRoadGroup(
    SECONDARY_TERTIARY_ROAD_IDS,
    ['interpolate', ['linear'], ['zoom'], 5, 1.45, 10, 2.25, 12, 3.15, 14, 4.8, 16, 8.2, 18, 15.4],
    ['interpolate', ['linear'], ['zoom'], 5, 2.25, 10, 3.4, 12, 4.6, 14, 6.7, 16, 10.8, 18, 19.4],
    isNight ? '#7692ba' : '#dce5f0',
    isNight ? '#0a101c' : '#435369',
    ['interpolate', ['linear'], ['zoom'], 5, 0.96, 11, 1.0],
    ['interpolate', ['linear'], ['zoom'], 5, 0.92, 11, 1.0]
  );

  // Enlaces y rampas de conexión — claramente legibles al inspeccionar desvíos
  applyPreviewRoadGroup(
    ROAD_LINK_IDS,
    ['interpolate', ['linear'], ['zoom'], 5, 1.15, 10, 1.75, 12, 2.45, 14, 3.8, 16, 6.4, 18, 10.6],
    ['interpolate', ['linear'], ['zoom'], 5, 1.85, 10, 2.7, 12, 3.65, 14, 5.3, 16, 8.5, 18, 13.4],
    isNight ? '#7692ba' : '#dce5f0',
    isNight ? '#0a101c' : '#435369',
    ['interpolate', ['linear'], ['zoom'], 5, 0.94, 11, 1.0],
    ['interpolate', ['linear'], ['zoom'], 5, 0.88, 11, 1.0]
  );

  // Nivel 4: Avenidas principales y troncales (primary, trunk + fallback PMTiles road_major)
  applyPreviewRoadGroup(
    [...PRIMARY_TRUNK_ROAD_IDS, 'road_major', 'road_major_casing'],
    ['interpolate', ['linear'], ['zoom'], 5, 1.85, 10, 2.95, 12, 4.1, 14, 6.4, 16, 11.2, 18, 19.6],
    ['interpolate', ['linear'], ['zoom'], 5, 2.85, 10, 4.35, 12, 5.9, 14, 8.8, 16, 14.4, 18, 24.2],
    isNight ? '#96b2db' : '#7d90aa',
    isNight ? '#0a101c' : '#2a384d',
    1.0,
    ['interpolate', ['linear'], ['zoom'], 5, 0.95, 11, 1.0]
  );

  // Nivel 5: Autopistas y vías expresas (motorway) — máxima jerarquía vial
  applyPreviewRoadGroup(
    MOTORWAY_ROAD_IDS,
    ['interpolate', ['linear'], ['zoom'], 5, 2.2, 10, 3.5, 12, 4.9, 14, 7.6, 16, 13.0, 18, 22.4],
    ['interpolate', ['linear'], ['zoom'], 5, 3.3, 10, 5.1, 12, 6.9, 14, 10.2, 16, 16.6, 18, 27.6],
    isNight ? '#b5a972' : '#556882',
    isNight ? '#1b2233' : '#182233',
    1.0,
    1.0
  );

  applyPreviewRoadGroup(
    MOTORWAY_LINK_ROAD_IDS,
    ['interpolate', ['linear'], ['zoom'], 5, 1.45, 10, 2.35, 12, 3.3, 14, 5.2, 16, 8.6, 18, 13.2],
    ['interpolate', ['linear'], ['zoom'], 5, 2.25, 10, 3.5, 12, 4.7, 14, 7.1, 16, 11.2, 18, 16.4],
    isNight ? '#b5a972' : '#5c6f8a',
    isNight ? '#1b2233' : '#1f2b3d',
    1.0,
    ['interpolate', ['linear'], ['zoom'], 5, 0.94, 11, 1.0]
  );

  // Compatibilidad con capas genéricas de PMTiles (si el archivo no sigue esquema OpenMapTiles/Protomaps)
  const allLayers = map.getStyle()?.layers || [];
  for (const layer of allLayers) {
    if (layer.id.startsWith('peru-pmtiles-line-casing-')) {
      safeSetZoomRange(layer.id, 0, 24);
      safeSetPaint(layer.id, 'line-blur', 0);
      safeSetPaint(layer.id, 'line-color', isNight ? '#0c1321' : '#435369');
      safeSetPaint(layer.id, 'line-width', ['interpolate', ['linear'], ['zoom'], 5, 1.6, 10, 2.6, 14, 4.6, 17, 7.8]);
      safeSetPaint(layer.id, 'line-opacity', 0.94);
    } else if (layer.id.startsWith('peru-pmtiles-line-')) {
      safeSetZoomRange(layer.id, 0, 24);
      safeSetPaint(layer.id, 'line-blur', 0);
      safeSetPaint(layer.id, 'line-color', isNight ? '#7692ba' : '#dce5f0');
      safeSetPaint(layer.id, 'line-width', ['interpolate', ['linear'], ['zoom'], 5, 1.0, 10, 1.75, 14, 3.2, 17, 5.8]);
      safeSetPaint(layer.id, 'line-opacity', 0.98);
    }
  }

  // Etiquetas de vías con alto contraste y halo nítido para identificar avenidas y calles secundarias de un vistazo
  const previewRoadLabels: Array<{
    id: string;
    size: any;
    color: string;
    haloWidth: number;
    opacity: any;
    spacing: any;
    sortKey: number;
  }> = [
    {
      id: 'highway-name-path',
      size: ['interpolate', ['linear'], ['zoom'], 6, 8.6, 12, 9.8, 15.5, 11.2, 18, 12.8],
      color: isNight ? '#cbd5e1' : '#334155',
      haloWidth: 2.3,
      opacity: ['interpolate', ['linear'], ['zoom'], 6, 0.86, 12, 0.94, 15, 1.0],
      spacing: ['interpolate', ['linear'], ['zoom'], 8, 155, 14, 210, 17, 245],
      sortKey: VECTOR_LABEL_PRIORITY.PATH_SERVICE,
    },
    {
      id: 'highway-name-minor',
      size: ['interpolate', ['linear'], ['zoom'], 6, 9.0, 12, 10.4, 15, 11.6, 17, 13.0, 19, 14.4],
      color: isNight ? '#e2e8f0' : '#1e293b',
      haloWidth: 2.5,
      opacity: ['interpolate', ['linear'], ['zoom'], 6, 0.9, 12, 0.96, 14, 1.0],
      spacing: ['interpolate', ['linear'], ['zoom'], 8, 145, 13, 195, 16, 235],
      sortKey: VECTOR_LABEL_PRIORITY.MINOR_STREET,
    },
    {
      id: SEC_ROADNAME_LAYER_ID,
      size: ['interpolate', ['linear'], ['zoom'], 6, 9.6, 11, 11.0, 14, 12.2, 16, 13.4, 19, 15.0],
      color: isNight ? '#f8fafc' : '#0f172a',
      haloWidth: 2.7,
      opacity: ['interpolate', ['linear'], ['zoom'], 6, 0.95, 11, 1.0],
      spacing: ['interpolate', ['linear'], ['zoom'], 8, 145, 13, 195, 16, 240],
      sortKey: VECTOR_LABEL_PRIORITY.SECONDARY_ROAD,
    },
    {
      id: 'highway-name-major',
      size: ['interpolate', ['linear'], ['zoom'], 6, 10.2, 11, 11.8, 14, 13.0, 16, 14.2, 19, 15.8],
      color: isNight ? '#ffffff' : '#020617',
      haloWidth: 2.9,
      opacity: 1.0,
      spacing: ['interpolate', ['linear'], ['zoom'], 8, 155, 13, 210, 16, 250],
      sortKey: VECTOR_LABEL_PRIORITY.HIGHWAY_MAJOR,
    },
  ];

  for (const spec of previewRoadLabels) {
    safeSetZoomRange(spec.id, 0, 24);
    safeSetLayout(spec.id, 'visibility', 'visible');
    safeSetLayout(spec.id, 'symbol-sort-key', spec.sortKey);
    safeSetLayout(spec.id, 'text-size', spec.size);
    safeSetLayout(spec.id, 'text-keep-upright', true);
    safeSetLayout(spec.id, 'text-rotation-alignment', 'map');
    safeSetLayout(spec.id, 'text-pitch-alignment', 'viewport');
    safeSetLayout(spec.id, 'symbol-spacing', spec.spacing);
    safeSetPaint(spec.id, 'text-color', spec.color);
    safeSetPaint(spec.id, 'text-halo-color', isNight ? '#0c1320' : '#ffffff');
    safeSetPaint(spec.id, 'text-halo-width', spec.haloWidth);
    safeSetPaint(spec.id, 'text-halo-blur', 0.2);
    safeSetPaint(spec.id, 'text-opacity', spec.opacity);
  }

  for (const labelId of [
    'label_other',
    'label_village',
    'label_town',
    'label_state',
    'label_city',
    'label_city_capital',
    'label_country_1',
    'label_country_2',
    'label_country_3',
    'airport',
  ]) {
    safeSetZoomRange(labelId, 0, 24);
    safeSetLayout(labelId, 'visibility', 'visible');
    safeSetLayout(labelId, 'text-keep-upright', true);
    safeSetPaint(labelId, 'text-color', isNight ? '#ffffff' : '#0f172a');
    safeSetPaint(labelId, 'text-halo-color', isNight ? '#0c1320' : '#ffffff');
    safeSetPaint(labelId, 'text-halo-width', 2.4);
    safeSetPaint(labelId, 'text-halo-blur', 0.2);
  }

  applyVectorLayerPrioritization(map);
}

// GeoJSON source & layer IDs
export const ACTIVE_ROUTE_SOURCE_ID = 'ruta-active-route-src';
export const PREVIEW_ROUTES_SOURCE_ID = 'ruta-preview-routes-src';
export const DEST_COLLISION_SOURCE_ID = 'ruta-dest-collision-src';
export const DEST_COLLISION_LAYER_ID = 'ruta-dest-collision-layer';
export const DEST_COLLISION_IMAGE_ID = 'ruta-dest-collision-box';
export const MANEUVER_ARROW_SOURCE_ID = 'ruta-maneuver-arrow-src';
export const MANEUVER_ARROW_OUTLINE_IMAGE_ID = 'ruta-maneuver-arrow-outline-img';
export const MANEUVER_ARROW_FILL_IMAGE_ID = 'ruta-maneuver-arrow-fill-img';
export const FIXED_RADAR_STRIPS_SOURCE_ID = 'ruta-fixed-radar-strips-src';
export const FIXED_RADAR_STRIPS_OUTLINE_LAYER_ID = 'ruta-fixed-radar-strips-outline';
export const FIXED_RADAR_STRIPS_FILL_LAYER_ID = 'ruta-fixed-radar-strips-fill';
export const POI_SOURCE_ID = 'ruta-pois-src';
export const POI_REGULAR_LAYER_ID = 'ruta-pois-regular-layer';
export const POI_ESSENTIAL_LAYER_ID = 'ruta-pois-essential-layer';
export const ROUTE_LAYER_IDS = [
  'ruta-preview-alt-outline',
  'ruta-preview-alt-line',
  'ruta-preview-glow',
  'ruta-preview-outline',
  'ruta-preview-line',
  'ruta-active-glow',
  'ruta-active-outline',
  'ruta-active-line',
  'ruta-maneuver-outline',
  'ruta-maneuver-arrow-outline',
  'ruta-maneuver-line',
  'ruta-maneuver-arrow',
];

// Configuraciones independientes de estilo de ruta para modo Día y modo Noche (legibles desde zoom 4 hasta 24)
export const DAY_ROUTE_STYLE = {
  preview: {
    selectedColor: '#7e22ce',
    altColor: '#8b7ae0',
    glowColor: '#7e22ce',
    glowWidth: ['interpolate', ['linear'], ['zoom'], 4, 12.5, 8, 14.5, 10, 16.5, 13, 19.5, 16, 23.5, 18, 27.5] as any,
    glowOpacity: 0.28,
    glowBlur: 3,
    outlineColor: '#ffffff',
    outlineWidth: ['interpolate', ['linear'], ['zoom'], 4, 10.6, 8, 12.2, 10, 13.8, 13, 15.8, 16, 18.4, 18, 21.6] as any,
    outlineOpacity: 1.0,
    lineWidth: ['interpolate', ['linear'], ['zoom'], 4, 6.4, 8, 7.4, 10, 8.6, 13, 10.2, 16, 12.2, 18, 14.6] as any,
    lineOpacity: 1.0,
    altOutlineColor: '#4c3b8f',
    altOutlineWidth: ['interpolate', ['linear'], ['zoom'], 4, 7.4, 8, 8.4, 10, 9.2, 13, 10.6, 16, 12.2, 18, 14.2] as any,
    altOutlineOpacity: 0.98,
    altLineWidth: ['interpolate', ['linear'], ['zoom'], 4, 4.4, 8, 5.0, 10, 5.6, 13, 6.6, 16, 7.8, 18, 9.2] as any,
    altLineOpacity: 0.98,
  },
  active: {
    glowColor: '#a855f7',
    glowWidth: ['interpolate', ['linear'], ['zoom'], 4, 10.0, 8, 11.5, 12, 12.5, 14, 14.0, 15, 15.5, 16, 17.5, 17, 19.5, 18, 22.0] as any,
    glowOpacity: 0.34,
    glowBlur: 3.5,
    outlineColor: '#581c87',
    outlineWidth: ['interpolate', ['linear'], ['zoom'], 4, 7.2, 8, 8.2, 12, 8.8, 14, 9.6, 15, 10.8, 16, 12.2, 17, 14.0, 18, 16.0] as any,
    outlineOpacity: 1.0,
    lineColor: '#a855f7',
    lineWidth: ['interpolate', ['linear'], ['zoom'], 4, 4.4, 8, 5.2, 12, 5.6, 14, 6.4, 15, 7.6, 16, 9.0, 17, 10.6, 18, 12.4] as any,
    lineOpacity: 1.0,
  },
};

export const NIGHT_ROUTE_STYLE = {
  preview: {
    selectedColor: '#a855f7',
    altColor: '#8e82e3',
    glowColor: '#a855f7',
    glowWidth: ['interpolate', ['linear'], ['zoom'], 4, 12.5, 8, 14.5, 10, 16.5, 13, 19.5, 16, 23.5, 18, 27.5] as any,
    glowOpacity: 0.34,
    glowBlur: 3.5,
    outlineColor: '#f8fafc',
    outlineWidth: ['interpolate', ['linear'], ['zoom'], 4, 10.6, 8, 12.2, 10, 13.8, 13, 15.8, 16, 18.4, 18, 21.6] as any,
    outlineOpacity: 1.0,
    lineWidth: ['interpolate', ['linear'], ['zoom'], 4, 6.4, 8, 7.4, 10, 8.6, 13, 10.2, 16, 12.2, 18, 14.6] as any,
    lineOpacity: 1.0,
    altOutlineColor: '#1e1b4b',
    altOutlineWidth: ['interpolate', ['linear'], ['zoom'], 4, 7.4, 8, 8.4, 10, 9.2, 13, 10.6, 16, 12.2, 18, 14.2] as any,
    altOutlineOpacity: 0.98,
    altLineWidth: ['interpolate', ['linear'], ['zoom'], 4, 4.4, 8, 5.0, 10, 5.6, 13, 6.6, 16, 7.8, 18, 9.2] as any,
    altLineOpacity: 0.98,
  },
  active: {
    glowColor: '#c084fc',
    glowWidth: ['interpolate', ['linear'], ['zoom'], 4, 10.5, 8, 12.0, 12, 13.0, 14, 14.5, 15, 16.0, 16, 18.0, 17, 20.0, 18, 22.5] as any,
    glowOpacity: 0.36,
    glowBlur: 4,
    outlineColor: '#6b21a8',
    outlineWidth: ['interpolate', ['linear'], ['zoom'], 4, 7.2, 8, 8.2, 12, 8.8, 14, 9.6, 15, 10.8, 16, 12.2, 17, 14.0, 18, 16.0] as any,
    outlineOpacity: 1.0,
    lineColor: '#c084fc',
    lineWidth: ['interpolate', ['linear'], ['zoom'], 4, 4.4, 8, 5.2, 12, 5.6, 14, 6.4, 15, 7.6, 16, 9.0, 17, 10.6, 18, 12.4] as any,
    lineOpacity: 1.0,
  },
};

export interface OverviewLayerSnapshot {
  visibility?: any;
  minzoom: number;
  maxzoom: number;
  paint: Record<string, any>;
  layout: Record<string, any>;
}

export const OVERVIEW_HIDDEN_LAYER_IDS = [
  // Solo ocultar POIs base duplicados y edificios 3D extruidos durante Vista general (calles secundarias, menores, edificios 2D y detalles se mantienen visibles)
  'poi_r20',
  'poi_r7',
  'poi_r1',
  'poi_transit',
  'building-3d',
];

export function applyOverviewActiveRouteStyle(map: maplibregl.Map): void {
  const safeSetPaint = (layerId: string, prop: string, value: any) => {
    try {
      if (map.getLayer(layerId)) {
        map.setPaintProperty(layerId, prop as any, value);
      }
    } catch {}
  };

  // Ruta morada viva más gruesa y con contorno de alto contraste en todos los niveles de zoom (4..24)
  safeSetPaint('ruta-active-glow', 'line-color', '#a855f7');
  safeSetPaint('ruta-active-glow', 'line-width', [
    'interpolate',
    ['linear'],
    ['zoom'],
    4,
    13,
    8,
    16,
    12,
    19,
    15,
    22,
    18,
    26,
  ]);
  safeSetPaint('ruta-active-glow', 'line-opacity', 0.36);
  safeSetPaint('ruta-active-glow', 'line-blur', 3.5);

  safeSetPaint('ruta-active-outline', 'line-color', '#581c87');
  safeSetPaint('ruta-active-outline', 'line-width', [
    'interpolate',
    ['linear'],
    ['zoom'],
    4,
    9.2,
    8,
    11.2,
    12,
    13.0,
    15,
    15.2,
    18,
    18.0,
  ]);
  safeSetPaint('ruta-active-outline', 'line-opacity', 1.0);

  safeSetPaint('ruta-active-line', 'line-color', '#a855f7');
  safeSetPaint('ruta-active-line', 'line-width', [
    'interpolate',
    ['linear'],
    ['zoom'],
    4,
    5.4,
    8,
    6.8,
    12,
    8.0,
    15,
    9.6,
    18,
    11.6,
  ]);
  safeSetPaint('ruta-active-line', 'line-opacity', 1);

  // Garantizar que la ruta quede sobre todas las calles y edificios, con etiquetas priorizadas legibles encima
  prioritizeRouteAndLabelLayers(map);
}

export function applyOverviewCleanMapStyle(
  map: maplibregl.Map,
  mode: MapTileMode,
  savedMap: Map<string, OverviewLayerSnapshot>,
  _overviewZoomAnchor?: number
): void {
  const ensureSnap = (layerId: string): OverviewLayerSnapshot | null => {
    const layer = map.getLayer(layerId);
    if (!layer) return null;
    let snap = savedMap.get(layerId);
    if (!snap) {
      let existingVisibility: any = undefined;
      try {
        existingVisibility = map.getLayoutProperty(layerId, 'visibility');
      } catch {}
      snap = {
        visibility: existingVisibility,
        minzoom: typeof layer.minzoom === 'number' ? layer.minzoom : 0,
        maxzoom: typeof layer.maxzoom === 'number' ? layer.maxzoom : 24,
        paint: {},
        layout: {},
      };
      savedMap.set(layerId, snap);
    }
    return snap;
  };

  const setOverviewLayout = (layerId: string, prop: string, value: any) => {
    const snap = ensureSnap(layerId);
    if (!snap) return;
    if (!(prop in snap.layout)) {
      try {
        snap.layout[prop] = map.getLayoutProperty(layerId, prop as any);
      } catch {
        snap.layout[prop] = undefined;
      }
    }
    try {
      map.setLayoutProperty(layerId, prop as any, value);
    } catch {}
  };

  const setOverviewPaint = (layerId: string, prop: string, value: any) => {
    const snap = ensureSnap(layerId);
    if (!snap) return;
    if (!(prop in snap.paint)) {
      try {
        snap.paint[prop] = map.getPaintProperty(layerId, prop as any);
      } catch {
        snap.paint[prop] = undefined;
      }
    }
    try {
      map.setPaintProperty(layerId, prop as any, value);
    } catch {}
  };

  const setOverviewZoomRange = (layerId: string, minzoom: number, maxzoom: number) => {
    const snap = ensureSnap(layerId);
    if (!snap) return;
    try {
      map.setLayerZoomRange(layerId, minzoom, maxzoom);
    } catch {}
  };

  if (mode !== 'satellite') {
    const isNight = mode === 'night';
    ensureOpenFreeMapSecRoadNameLayer(map);

    // 1. Ocultar únicamente capas redundantes (POIs nativos y extrusión 3D), manteniendo edificios 2D y detalles visibles
    for (const hiddenId of OVERVIEW_HIDDEN_LAYER_IDS) {
      setOverviewLayout(hiddenId, 'visibility', 'none');
    }

    const applyOverviewRoadGroup = (
      layerIds: string[],
      fillWidth: any,
      caseWidth: any,
      fillColor: any,
      caseColor: any,
      fillOpacity: any,
      caseOpacity: any,
      zoomRange: [number, number] = [0, 24]
    ) => {
      for (const id of layerIds) {
        if (!map.getLayer(id)) continue;
        const isCasing = id.includes('_case') || id.includes('_casing') || id.includes('-casing');
        setOverviewLayout(id, 'visibility', 'visible');
        setOverviewZoomRange(id, zoomRange[0], zoomRange[1]);
        setOverviewPaint(id, 'line-blur', 0);
        if (isCasing) {
          setOverviewPaint(id, 'line-width', caseWidth);
          setOverviewPaint(id, 'line-color', caseColor);
          setOverviewPaint(id, 'line-opacity', caseOpacity);
        } else {
          setOverviewPaint(id, 'line-width', fillWidth);
          setOverviewPaint(id, 'line-color', fillColor);
          setOverviewPaint(id, 'line-opacity', fillOpacity);
        }
      }
    };

    // 2. Calles de servicio, pasajes y senderos: definidos y nítidos en vista general
    applyOverviewRoadGroup(
      SERVICE_TRACK_ROAD_IDS,
      ['interpolate', ['linear'], ['zoom'], 5, 0.55, 12, 1.05, 15.5, 2.4, 17.5, 4.8],
      ['interpolate', ['linear'], ['zoom'], 5, 0.9, 12, 1.6, 15.5, 3.4, 17.5, 6.4],
      isNight ? '#445978' : '#f8fafc',
      isNight ? '#0f1726' : '#94a3b8',
      ['interpolate', ['linear'], ['zoom'], 5, 0.72, 12, 0.86, 16, 0.96],
      ['interpolate', ['linear'], ['zoom'], 5, 0.62, 12, 0.78, 16, 0.9]
    );

    if (map.getLayer('highway-name-path')) {
      setOverviewLayout('highway-name-path', 'visibility', 'visible');
      setOverviewZoomRange('highway-name-path', 0, 24);
      setOverviewLayout('highway-name-path', 'symbol-sort-key', VECTOR_LABEL_PRIORITY.PATH_SERVICE);
      setOverviewPaint('highway-name-path', 'text-opacity', ['interpolate', ['linear'], ['zoom'], 6, 0.78, 14, 0.92]);
    }

    // Calles locales / residenciales: alto contraste y trazo firme sin desaparecer al alejar
    applyOverviewRoadGroup(
      MINOR_ROAD_IDS,
      ['interpolate', ['linear'], ['zoom'], 5, 0.75, 12, 1.45, 16, 4.0, 17.5, 6.4, 18, 8.2],
      ['interpolate', ['linear'], ['zoom'], 5, 1.2, 12, 2.2, 16, 5.4, 17.5, 8.4, 18, 10.6],
      isNight ? '#566f94' : '#ffffff',
      isNight ? '#0d1422' : '#74859c',
      ['interpolate', ['linear'], ['zoom'], 5, 0.84, 12, 0.94, 16, 1.0],
      ['interpolate', ['linear'], ['zoom'], 5, 0.76, 12, 0.88, 16, 0.96]
    );

    if (map.getLayer('highway-name-minor')) {
      setOverviewLayout('highway-name-minor', 'visibility', 'visible');
      setOverviewZoomRange('highway-name-minor', 0, 24);
      setOverviewLayout('highway-name-minor', 'symbol-sort-key', VECTOR_LABEL_PRIORITY.MINOR_STREET);
      setOverviewLayout('highway-name-minor', 'text-size', ['interpolate', ['linear'], ['zoom'], 6, 8.6, 12, 9.8, 16, 11.6, 18, 12.8]);
      setOverviewLayout('highway-name-minor', 'symbol-spacing', ['interpolate', ['linear'], ['zoom'], 8, 160, 14, 210]);
      setOverviewPaint('highway-name-minor', 'text-color', isNight ? '#cbd5e1' : '#334155');
      setOverviewPaint('highway-name-minor', 'text-halo-color', isNight ? '#0c1320' : '#ffffff');
      setOverviewPaint('highway-name-minor', 'text-halo-width', 2.2);
      setOverviewPaint('highway-name-minor', 'text-opacity', ['interpolate', ['linear'], ['zoom'], 6, 0.84, 13, 0.92, 16, 0.98]);
    }

    // 3. Avenidas secundarias, terciarias y enlaces: alto contraste, grosor definido y máxima nitidez
    applyOverviewRoadGroup(
      [...SECONDARY_TERTIARY_ROAD_IDS, ...ROAD_LINK_IDS],
      ['interpolate', ['linear'], ['zoom'], 5, 1.15, 12, 2.35, 15.5, 4.8, 17, 7.2, 18, 9.6],
      ['interpolate', ['linear'], ['zoom'], 5, 1.8, 12, 3.4, 15.5, 6.4, 17, 9.4, 18, 12.2],
      isNight ? '#728eb5' : '#dce5f0',
      isNight ? '#0b1220' : '#4a5a70',
      ['interpolate', ['linear'], ['zoom'], 5, 0.92, 12, 0.98, 15.5, 1.0],
      ['interpolate', ['linear'], ['zoom'], 5, 0.86, 12, 0.94, 15.5, 1.0]
    );

    if (map.getLayer(SEC_ROADNAME_LAYER_ID)) {
      setOverviewLayout(SEC_ROADNAME_LAYER_ID, 'visibility', 'visible');
      setOverviewZoomRange(SEC_ROADNAME_LAYER_ID, 0, 24);
      setOverviewLayout(SEC_ROADNAME_LAYER_ID, 'symbol-sort-key', VECTOR_LABEL_PRIORITY.SECONDARY_ROAD);
      setOverviewLayout(SEC_ROADNAME_LAYER_ID, 'text-size', ['interpolate', ['linear'], ['zoom'], 6, 9.2, 12, 10.6, 16, 12.4, 18, 13.8]);
      setOverviewLayout(SEC_ROADNAME_LAYER_ID, 'symbol-spacing', ['interpolate', ['linear'], ['zoom'], 8, 155, 14, 210]);
      setOverviewPaint(SEC_ROADNAME_LAYER_ID, 'text-color', isNight ? '#f1f5f9' : '#0f172a');
      setOverviewPaint(SEC_ROADNAME_LAYER_ID, 'text-halo-color', isNight ? '#0c1320' : '#ffffff');
      setOverviewPaint(SEC_ROADNAME_LAYER_ID, 'text-halo-width', 2.4);
      setOverviewPaint(SEC_ROADNAME_LAYER_ID, 'text-opacity', ['interpolate', ['linear'], ['zoom'], 6, 0.9, 12, 0.96, 15, 1.0]);
    }

    // 4. Vías principales (primary, trunk, motorway): jerarquía clara con tonos equilibrados y borde nítido
    applyOverviewRoadGroup(
      [...PRIMARY_TRUNK_ROAD_IDS, 'road_major', 'road_major_casing'],
      ['interpolate', ['linear'], ['zoom'], 5, 1.5, 8, 2.0, 12, 3.1, 14, 4.6, 16, 6.8, 18, 9.2],
      ['interpolate', ['linear'], ['zoom'], 5, 2.3, 8, 3.0, 12, 4.4, 14, 6.4, 16, 9.0, 18, 11.8],
      isNight ? '#93afd6' : '#8598b2',
      isNight ? '#0b1220' : '#314057',
      ['interpolate', ['linear'], ['zoom'], 5, 0.96, 13.5, 1.0],
      ['interpolate', ['linear'], ['zoom'], 5, 0.9, 13.5, 0.98]
    );

    applyOverviewRoadGroup(
      [...MOTORWAY_ROAD_IDS, ...MOTORWAY_LINK_ROAD_IDS],
      ['interpolate', ['linear'], ['zoom'], 5, 1.85, 8, 2.45, 12, 3.8, 14, 5.6, 16, 8.2, 18, 11.0],
      ['interpolate', ['linear'], ['zoom'], 5, 2.75, 8, 3.6, 12, 5.3, 14, 7.6, 16, 10.6, 18, 13.8],
      isNight ? '#b0a46d' : '#5e718c',
      isNight ? '#1b2233' : '#1e2a3d',
      1.0,
      ['interpolate', ['linear'], ['zoom'], 5, 0.94, 13.5, 1.0]
    );

    // 5. Etiquetas priorizadas de vías principales visibles en todos los niveles de zoom
    if (map.getLayer('highway-name-major')) {
      setOverviewLayout('highway-name-major', 'visibility', 'visible');
      setOverviewZoomRange('highway-name-major', 0, 24);
      setOverviewLayout('highway-name-major', 'symbol-sort-key', VECTOR_LABEL_PRIORITY.HIGHWAY_MAJOR);
      setOverviewLayout('highway-name-major', 'text-size', ['interpolate', ['linear'], ['zoom'], 6, 9.8, 12, 11.4, 14, 12.6, 16, 13.6]);
      setOverviewLayout('highway-name-major', 'symbol-spacing', ['interpolate', ['linear'], ['zoom'], 8, 155, 14, 210]);
      setOverviewPaint('highway-name-major', 'text-color', isNight ? '#ffffff' : '#020617');
      setOverviewPaint('highway-name-major', 'text-halo-color', isNight ? '#0c1320' : '#ffffff');
      setOverviewPaint('highway-name-major', 'text-halo-width', 2.6);
      setOverviewPaint('highway-name-major', 'text-opacity', 1.0);
    }

    applyVectorLayerPrioritization(map);
  }

  // 6. Ruta morada destacada con etiquetas priorizadas legibles encima
  applyOverviewActiveRouteStyle(map);
}

export function restoreNormalMapStyleFromOverview(
  map: maplibregl.Map,
  mode: MapTileMode,
  savedMap: Map<string, OverviewLayerSnapshot>
): void {
  for (const [layerId, snap] of savedMap.entries()) {
    if (!map.getLayer(layerId)) continue;
    try {
      map.setLayoutProperty(layerId, 'visibility', snap.visibility ?? 'visible');
    } catch {}
    try {
      map.setLayerZoomRange(layerId, snap.minzoom, snap.maxzoom);
    } catch {}
    for (const [prop, val] of Object.entries(snap.layout)) {
      if (prop === 'visibility') continue;
      try {
        map.setLayoutProperty(layerId, prop as any, val);
      } catch {}
    }
    for (const [prop, val] of Object.entries(snap.paint)) {
      try {
        map.setPaintProperty(layerId, prop as any, val);
      } catch {}
    }
  }
  savedMap.clear();

  // Reaplicar estilos propios de Día / Noche y priorización de capas
  applyWazeStyleEnhancements(map, mode);

  // Restaurar estilo normal de la ruta activa
  const normalActiveStyle = (mode === 'night' ? NIGHT_ROUTE_STYLE : DAY_ROUTE_STYLE).active;
  const safeSetPaint = (layerId: string, prop: string, value: any) => {
    try {
      if (map.getLayer(layerId)) {
        map.setPaintProperty(layerId, prop as any, value);
      }
    } catch {}
  };
  safeSetPaint('ruta-active-glow', 'line-color', normalActiveStyle.glowColor);
  safeSetPaint('ruta-active-glow', 'line-width', normalActiveStyle.glowWidth);
  safeSetPaint('ruta-active-glow', 'line-opacity', normalActiveStyle.glowOpacity);
  safeSetPaint('ruta-active-glow', 'line-blur', normalActiveStyle.glowBlur);

  safeSetPaint('ruta-active-outline', 'line-color', normalActiveStyle.outlineColor);
  safeSetPaint('ruta-active-outline', 'line-width', normalActiveStyle.outlineWidth);
  safeSetPaint('ruta-active-outline', 'line-opacity', normalActiveStyle.outlineOpacity);

  safeSetPaint('ruta-active-line', 'line-color', normalActiveStyle.lineColor);
  safeSetPaint('ruta-active-line', 'line-width', normalActiveStyle.lineWidth);
  safeSetPaint('ruta-active-line', 'line-opacity', normalActiveStyle.lineOpacity);

  prioritizeRouteAndLabelLayers(map);
}

export function createExactDestPinHTML(): string {
  return `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:flex-end;width:30px;height:38px;margin:0;padding:0;pointer-events:none;">
      <svg width="30" height="38" viewBox="0 0 30 38" fill="none" xmlns="http://www.w3.org/2000/svg" style="display:block;filter:drop-shadow(0 3px 5px rgba(0,0,0,0.55));">
        <path d="M15 1.5C7.544 1.5 1.5 7.544 1.5 15c0 9.6 11.78 19.86 12.92 20.84a.9.9 0 0 0 1.16 0C16.72 34.86 28.5 24.6 28.5 15 28.5 7.544 22.456 1.5 15 1.5Z" fill="#e11d48" stroke="#ffffff" stroke-width="2.2"/>
        <circle cx="15" cy="14.5" r="5.2" fill="#ffffff"/>
      </svg>
    </div>
  `;
}

export function createManeuverArrowImageData(
  fillColor: string,
  strokeColor: string | null,
  strokeWidth: number
): { width: number; height: number; data: Uint8Array } {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return { width: size, height: size, data: new Uint8Array(size * size * 4) };
  }

  ctx.clearRect(0, 0, size, size);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  ctx.beginPath();
  ctx.moveTo(32, 11);
  ctx.lineTo(50, 43);
  ctx.lineTo(32, 38);
  ctx.lineTo(14, 43);
  ctx.closePath();

  if (strokeColor && strokeWidth > 0) {
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = strokeWidth;
    ctx.stroke();
  }
  ctx.fillStyle = fillColor;
  ctx.fill();

  const imgData = ctx.getImageData(0, 0, size, size);
  return {
    width: size,
    height: size,
    data: new Uint8Array(imgData.data.buffer),
  };
}

export function renderRouteTimePillHtml(
  mins: number,
  isSelected: boolean,
  isFastest: boolean
): string {
  return isSelected
    ? `<div class="route-time-pill flex flex-col items-center cursor-pointer active:scale-95 transition-transform select-none">
        <div class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-white font-black text-[13px] leading-none border-2 border-purple-200/90 shadow-[0_6px_18px_rgba(76,29,149,0.55)]" style="background-color:#4c1d95;">
          <span>${mins} min</span>
          ${
            isFastest
              ? '<span class="text-[10px] px-1.5 py-0.5 rounded-md bg-white/20 text-white font-black leading-none">Mejor</span>'
              : ''
          }
        </div>
        <div style="width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:6px solid #4c1d95;margin-top:-1px;"></div>
      </div>`
    : `<div class="route-time-pill flex flex-col items-center cursor-pointer hover:scale-105 active:scale-95 transition-transform select-none">
        <div class="flex items-center px-2.5 py-1 rounded-xl bg-white text-slate-950 font-extrabold text-[11px] leading-none border-2 border-slate-500/80 shadow-[0_4px_12px_rgba(15,23,42,0.34)]">
          <span>${mins} min</span>
        </div>
        <div style="width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:5px solid #ffffff;margin-top:-1px;filter:drop-shadow(0 2px 2px rgba(15,23,42,0.28));"></div>
      </div>`;
}

export interface EnsureRouteAndOverlayLayersOptions {
  mapTileMode: MapTileMode;
  isOverviewActive: () => boolean;
  isPickingRadarLocation: () => boolean;
  isNavigating: () => boolean;
  getManeuverGeoJson: () => ManeuverFeatureCollection;
  getFixedRadarsList: () => FixedRadar[];
  getActiveRouteId: () => string | undefined;
  getRoutes: () => RouteData[];
  isFixedRadarStripListenersBound: () => boolean;
  markFixedRadarStripListenersBound: () => void;
  onFixedRadarStripClick: (radar: FixedRadar) => void;
  onPreviewRouteLineClick: (route: RouteData) => void;
}

/**
 * Ensures all GeoJSON sources and MapLibre layers exist for routes (active & preview),
 * turn maneuver arrows, fixed Sutran radar strips, and destination label collision blocker.
 */
export function ensureRouteAndOverlayLayers(
  map: maplibregl.Map,
  opts: EnsureRouteAndOverlayLayersOptions
): boolean {
  if (!isMapStyleReadyForSources(map)) return false;

  if (!map.getSource(FIXED_RADAR_STRIPS_SOURCE_ID)) {
    map.addSource(FIXED_RADAR_STRIPS_SOURCE_ID, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });
  }

  if (!map.getSource(PREVIEW_ROUTES_SOURCE_ID)) {
    map.addSource(PREVIEW_ROUTES_SOURCE_ID, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });
  }

  if (!map.getSource(ACTIVE_ROUTE_SOURCE_ID)) {
    map.addSource(ACTIVE_ROUTE_SOURCE_ID, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });
  }

  if (!map.getLayer(FIXED_RADAR_STRIPS_OUTLINE_LAYER_ID)) {
    map.addLayer({
      id: FIXED_RADAR_STRIPS_OUTLINE_LAYER_ID,
      type: 'line',
      source: FIXED_RADAR_STRIPS_SOURCE_ID,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': '#ffffff',
        'line-width': ['interpolate', ['linear'], ['zoom'], 8, 7, 13, 10, 16, 13],
        'line-opacity': opts.isOverviewActive() ? 0 : 0.88,
        'line-opacity-transition': { duration: 200, delay: 0 },
      },
    });
  }

  if (!map.getLayer(FIXED_RADAR_STRIPS_FILL_LAYER_ID)) {
    map.addLayer({
      id: FIXED_RADAR_STRIPS_FILL_LAYER_ID,
      type: 'line',
      source: FIXED_RADAR_STRIPS_SOURCE_ID,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': '#db2777',
        'line-width': ['interpolate', ['linear'], ['zoom'], 8, 4.2, 13, 6.2, 16, 8.5],
        'line-opacity': opts.isOverviewActive() ? 0 : 0.92,
        'line-opacity-transition': { duration: 200, delay: 0 },
        'line-dasharray': [2.2, 1.2],
      },
    });

    if (!opts.isFixedRadarStripListenersBound()) {
      opts.markFixedRadarStripListenersBound();
      map.on('click', FIXED_RADAR_STRIPS_FILL_LAYER_ID, (e: maplibregl.MapLayerMouseEvent) => {
        if (opts.isOverviewActive()) return;
        if (opts.isPickingRadarLocation()) return;
        if (shouldSuppressMapClick()) return;
        const radarId = e.features?.[0]?.properties?.radarId;
        if (!radarId) return;
        const found = opts.getFixedRadarsList().find((r) => r.id === radarId);
        if (found) {
          opts.onFixedRadarStripClick(found);
        }
      });
      map.on('mouseenter', FIXED_RADAR_STRIPS_FILL_LAYER_ID, () => {
        if (opts.isOverviewActive()) return;
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', FIXED_RADAR_STRIPS_FILL_LAYER_ID, () => {
        map.getCanvas().style.cursor = '';
      });
    }
  }

  const routeStyle = opts.mapTileMode === 'night' ? NIGHT_ROUTE_STYLE : DAY_ROUTE_STYLE;

  const handlePreviewRouteFeatureClick = (e: maplibregl.MapLayerMouseEvent) => {
    if (opts.isNavigating()) return;
    const currActiveId = opts.getActiveRouteId();
    const features = e.features || [];
    const targetFeature =
      features.find((f) => f.properties?.routeId && f.properties.routeId !== currActiveId) ||
      features[0];
    const routeId = targetFeature?.properties?.routeId;
    if (routeId) {
      const found = opts.getRoutes().find((r) => r.id === routeId);
      if (found) opts.onPreviewRouteLineClick(found);
    }
  };

  if (!map.getLayer('ruta-preview-alt-outline')) {
    map.addLayer({
      id: 'ruta-preview-alt-outline',
      type: 'line',
      source: PREVIEW_ROUTES_SOURCE_ID,
      filter: ['!=', ['get', 'isSelected'], true],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': routeStyle.preview.altOutlineColor,
        'line-width': routeStyle.preview.altOutlineWidth,
        'line-opacity': routeStyle.preview.altOutlineOpacity,
        'line-blur': 0,
      },
    });
  }

  if (!map.getLayer('ruta-preview-alt-line')) {
    map.addLayer({
      id: 'ruta-preview-alt-line',
      type: 'line',
      source: PREVIEW_ROUTES_SOURCE_ID,
      filter: ['!=', ['get', 'isSelected'], true],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': ['get', 'color'],
        'line-width': routeStyle.preview.altLineWidth,
        'line-opacity': routeStyle.preview.altLineOpacity,
        'line-blur': 0,
      },
    });

    map.on('click', 'ruta-preview-alt-line', handlePreviewRouteFeatureClick);
    map.on('mouseenter', 'ruta-preview-alt-line', () => {
      if (!opts.isNavigating()) map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', 'ruta-preview-alt-line', () => {
      map.getCanvas().style.cursor = '';
    });
  }

  if (!map.getLayer('ruta-preview-glow')) {
    map.addLayer({
      id: 'ruta-preview-glow',
      type: 'line',
      source: PREVIEW_ROUTES_SOURCE_ID,
      filter: ['==', ['get', 'isSelected'], true],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': routeStyle.preview.glowColor,
        'line-width': routeStyle.preview.glowWidth,
        'line-opacity': routeStyle.preview.glowOpacity,
        'line-blur': routeStyle.preview.glowBlur,
      },
    });
  }

  if (!map.getLayer('ruta-preview-outline')) {
    map.addLayer({
      id: 'ruta-preview-outline',
      type: 'line',
      source: PREVIEW_ROUTES_SOURCE_ID,
      filter: ['==', ['get', 'isSelected'], true],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': routeStyle.preview.outlineColor,
        'line-width': routeStyle.preview.outlineWidth,
        'line-opacity': routeStyle.preview.outlineOpacity,
        'line-blur': 0,
      },
    });
  }

  if (!map.getLayer('ruta-preview-line')) {
    map.addLayer({
      id: 'ruta-preview-line',
      type: 'line',
      source: PREVIEW_ROUTES_SOURCE_ID,
      filter: ['==', ['get', 'isSelected'], true],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': ['get', 'color'],
        'line-width': routeStyle.preview.lineWidth,
        'line-opacity': routeStyle.preview.lineOpacity,
        'line-blur': 0,
      },
    });

    map.on('click', 'ruta-preview-line', handlePreviewRouteFeatureClick);
    map.on('mouseenter', 'ruta-preview-line', () => {
      if (!opts.isNavigating()) map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', 'ruta-preview-line', () => {
      map.getCanvas().style.cursor = '';
    });
  }

  if (!map.getLayer('ruta-active-glow')) {
    map.addLayer({
      id: 'ruta-active-glow',
      type: 'line',
      source: ACTIVE_ROUTE_SOURCE_ID,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': routeStyle.active.glowColor,
        'line-width': routeStyle.active.glowWidth,
        'line-opacity': routeStyle.active.glowOpacity,
        'line-blur': routeStyle.active.glowBlur,
      },
    });
  }

  if (!map.getLayer('ruta-active-outline')) {
    map.addLayer({
      id: 'ruta-active-outline',
      type: 'line',
      source: ACTIVE_ROUTE_SOURCE_ID,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': routeStyle.active.outlineColor,
        'line-width': routeStyle.active.outlineWidth,
        'line-opacity': routeStyle.active.outlineOpacity,
      },
    });
  }

  if (!map.getLayer('ruta-active-line')) {
    map.addLayer({
      id: 'ruta-active-line',
      type: 'line',
      source: ACTIVE_ROUTE_SOURCE_ID,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': routeStyle.active.lineColor,
        'line-width': routeStyle.active.lineWidth,
        'line-opacity': routeStyle.active.lineOpacity,
      },
    });
  }

  // Flecha blanca de maniobra con contorno oscuro nítido directamente sobre la ruta morada
  const isDay = opts.mapTileMode === 'day';
  const maneuverOutlineColor = '#111827';
  const beforeCollisionId = map.getLayer(DEST_COLLISION_LAYER_ID)
    ? DEST_COLLISION_LAYER_ID
    : undefined;

  if (!map.hasImage(MANEUVER_ARROW_OUTLINE_IMAGE_ID)) {
    try {
      map.addImage(
        MANEUVER_ARROW_OUTLINE_IMAGE_ID,
        createManeuverArrowImageData(maneuverOutlineColor, maneuverOutlineColor, 9),
        { pixelRatio: 2 }
      );
    } catch {}
  }

  if (!map.hasImage(MANEUVER_ARROW_FILL_IMAGE_ID)) {
    try {
      map.addImage(
        MANEUVER_ARROW_FILL_IMAGE_ID,
        createManeuverArrowImageData('#ffffff', '#ffffff', 3),
        { pixelRatio: 2 }
      );
    } catch {}
  }

  if (!map.getSource(MANEUVER_ARROW_SOURCE_ID)) {
    map.addSource(MANEUVER_ARROW_SOURCE_ID, {
      type: 'geojson',
      data: opts.getManeuverGeoJson(),
    });
  }

  const maneuverStemWidthExpr: any = [
    'interpolate',
    ['linear'],
    ['zoom'],
    12, 2.6,
    14, 3.6,
    15, 4.6,
    16, 5.4,
    17, 5.8,
    18, 6.2,
  ];
  const maneuverOutlineWidthExpr: any = [
    'interpolate',
    ['linear'],
    ['zoom'],
    12, 4.4,
    14, 5.8,
    15, 7.2,
    16, 8.2,
    17, 8.8,
    18, 9.4,
  ];
  const maneuverArrowSizeExpr: any = [
    'interpolate',
    ['linear'],
    ['zoom'],
    12, 0.50,
    14, 0.68,
    15, 0.84,
    16, 0.94,
    17, 1.02,
    18, 1.10,
  ];

  if (!map.getLayer('ruta-maneuver-outline')) {
    map.addLayer(
      {
        id: 'ruta-maneuver-outline',
        type: 'line',
        source: MANEUVER_ARROW_SOURCE_ID,
        filter: ['==', ['get', 'role'], 'stem'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': maneuverOutlineColor,
          'line-width': maneuverOutlineWidthExpr,
          'line-opacity': isDay ? 0.94 : 0.96,
        },
      },
      beforeCollisionId
    );
  }

  if (!map.getLayer('ruta-maneuver-arrow-outline')) {
    map.addLayer(
      {
        id: 'ruta-maneuver-arrow-outline',
        type: 'symbol',
        source: MANEUVER_ARROW_SOURCE_ID,
        filter: ['==', ['get', 'role'], 'tip'],
        layout: {
          'icon-image': MANEUVER_ARROW_OUTLINE_IMAGE_ID,
          'icon-size': maneuverArrowSizeExpr,
          'icon-rotate': ['get', 'bearing'],
          'icon-rotation-alignment': 'map',
          'icon-pitch-alignment': 'map',
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          'icon-anchor': 'center',
          'icon-offset': [0, 0],
        },
        paint: {
          'icon-opacity': isDay ? 0.94 : 0.96,
        },
      },
      beforeCollisionId
    );
  }

  if (!map.getLayer('ruta-maneuver-line')) {
    map.addLayer(
      {
        id: 'ruta-maneuver-line',
        type: 'line',
        source: MANEUVER_ARROW_SOURCE_ID,
        filter: ['==', ['get', 'role'], 'stem'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#ffffff',
          'line-width': maneuverStemWidthExpr,
          'line-opacity': 1,
        },
      },
      beforeCollisionId
    );
  }

  if (!map.getLayer('ruta-maneuver-arrow')) {
    map.addLayer(
      {
        id: 'ruta-maneuver-arrow',
        type: 'symbol',
        source: MANEUVER_ARROW_SOURCE_ID,
        filter: ['==', ['get', 'role'], 'tip'],
        layout: {
          'icon-image': MANEUVER_ARROW_FILL_IMAGE_ID,
          'icon-size': maneuverArrowSizeExpr,
          'icon-rotate': ['get', 'bearing'],
          'icon-rotation-alignment': 'map',
          'icon-pitch-alignment': 'map',
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          'icon-anchor': 'center',
          'icon-offset': [0, 0],
        },
        paint: {
          'icon-opacity': 1,
        },
      },
      beforeCollisionId
    );
  }

  // Transparent collision-blocker symbol above map labels so text underneath the red destination pin hides instead of cutting off (e.g. "IMA")
  if (!map.hasImage(DEST_COLLISION_IMAGE_ID)) {
    try {
      map.addImage(DEST_COLLISION_IMAGE_ID, {
        width: 44,
        height: 50,
        data: new Uint8Array(44 * 50 * 4),
      });
    } catch {}
  }

  if (!map.getSource(DEST_COLLISION_SOURCE_ID)) {
    map.addSource(DEST_COLLISION_SOURCE_ID, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });
  }

  if (!map.getLayer(DEST_COLLISION_LAYER_ID)) {
    map.addLayer({
      id: DEST_COLLISION_LAYER_ID,
      type: 'symbol',
      source: DEST_COLLISION_SOURCE_ID,
      layout: {
        'icon-image': DEST_COLLISION_IMAGE_ID,
        'icon-size': 1,
        'icon-anchor': 'bottom',
        'icon-allow-overlap': true,
        'icon-ignore-placement': false,
        'icon-padding': 6,
      },
    });
  }

  // Aplicar la jerarquía priorizada de capas (vías -> POIs -> franjas -> rutas -> etiquetas -> flechas -> destino)
  prioritizeRouteAndLabelLayers(map);

  return true;
}

export function updateDestCollisionBlockerSource(
  map: maplibregl.Map,
  coords: Coordinates | null
): void {
  try {
    if (!isMapStyleReadyForSources(map)) return;
    const src = map.getSource(DEST_COLLISION_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    if (coords) {
      src.setData({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'Point',
              coordinates: [coords.lng, coords.lat],
            },
          },
        ],
      });
    } else {
      src.setData({ type: 'FeatureCollection', features: [] });
    }
  } catch {}
}

export interface UpdateRouteGeoJsonSourcesOptions {
  isOverviewActive: boolean;
  isNavigating: boolean;
  mapTileMode: MapTileMode;
  destinationCoords: Coordinates | null;
  activeRoute: RouteData | null;
  routes: RouteData[];
  userLocation: GPSLocation;
  onClearManeuverGeoJson: () => void;
}

export function updateRouteGeoJsonSources(
  map: maplibregl.Map,
  opts: UpdateRouteGeoJsonSourcesOptions
): void {
  if (opts.isOverviewActive) {
    applyOverviewActiveRouteStyle(map);
  }

  const targetDestForBlocker =
    opts.destinationCoords ||
    opts.activeRoute?.destinationCoords ||
    opts.routes[0]?.destinationCoords ||
    null;
  updateDestCollisionBlockerSource(map, targetDestForBlocker);

  const activeSrc = map.getSource(ACTIVE_ROUTE_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
  const previewSrc = map.getSource(PREVIEW_ROUTES_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
  if (!activeSrc || !previewSrc) return;

  const currActive = opts.activeRoute;
  const currRoutes = opts.routes;
  const currLoc = opts.userLocation;

  if (opts.isNavigating && currActive && currActive.coordinates.length >= 2) {
    const match = matchUserToRoute(
      currLoc.lat,
      currLoc.lng,
      currLoc.heading,
      currActive.coordinates
    );

    const coordsToDraw =
      match.remainingCoords.length >= 2 ? match.remainingCoords : currActive.coordinates;

    activeSrc.setData({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: coordsToLngLat(coordsToDraw),
          },
        },
      ],
    });
    previewSrc.setData({ type: 'FeatureCollection', features: [] });
    return;
  }

  // Clear active route & maneuver arrow sources when not navigating
  activeSrc.setData({ type: 'FeatureCollection', features: [] });
  if (!opts.isNavigating) {
    opts.onClearManeuverGeoJson();
    try {
      const maneuverSrc = map.getSource(MANEUVER_ARROW_SOURCE_ID) as
        | maplibregl.GeoJSONSource
        | undefined;
      maneuverSrc?.setData(EMPTY_MANEUVER_FC);
    } catch {}
  }

  const routesToDraw =
    currRoutes.length > 0 ? currRoutes : currActive ? [currActive] : [];

  if (routesToDraw.length === 0) {
    previewSrc.setData({ type: 'FeatureCollection', features: [] });
    return;
  }

  const isNight = opts.mapTileMode === 'night';
  const previewStyle = (isNight ? NIGHT_ROUTE_STYLE : DAY_ROUTE_STYLE).preview;
  try {
    if (map.getLayer('ruta-preview-alt-outline')) {
      map.setPaintProperty('ruta-preview-alt-outline', 'line-color', previewStyle.altOutlineColor);
      map.setPaintProperty('ruta-preview-alt-outline', 'line-width', previewStyle.altOutlineWidth);
      map.setPaintProperty('ruta-preview-alt-outline', 'line-opacity', previewStyle.altOutlineOpacity);
      map.setPaintProperty('ruta-preview-alt-outline', 'line-blur', 0);
    }
    if (map.getLayer('ruta-preview-alt-line')) {
      map.setPaintProperty('ruta-preview-alt-line', 'line-width', previewStyle.altLineWidth);
      map.setPaintProperty('ruta-preview-alt-line', 'line-opacity', previewStyle.altLineOpacity);
      map.setPaintProperty('ruta-preview-alt-line', 'line-blur', 0);
    }
    if (map.getLayer('ruta-preview-glow')) {
      map.setPaintProperty('ruta-preview-glow', 'line-color', previewStyle.glowColor);
      map.setPaintProperty('ruta-preview-glow', 'line-width', previewStyle.glowWidth);
      map.setPaintProperty('ruta-preview-glow', 'line-opacity', previewStyle.glowOpacity);
      map.setPaintProperty('ruta-preview-glow', 'line-blur', previewStyle.glowBlur);
    }
    if (map.getLayer('ruta-preview-outline')) {
      map.setPaintProperty('ruta-preview-outline', 'line-color', previewStyle.outlineColor);
      map.setPaintProperty('ruta-preview-outline', 'line-width', previewStyle.outlineWidth);
      map.setPaintProperty('ruta-preview-outline', 'line-opacity', previewStyle.outlineOpacity);
      map.setPaintProperty('ruta-preview-outline', 'line-blur', 0);
    }
    if (map.getLayer('ruta-preview-line')) {
      map.setPaintProperty('ruta-preview-line', 'line-width', previewStyle.lineWidth);
      map.setPaintProperty('ruta-preview-line', 'line-opacity', previewStyle.lineOpacity);
      map.setPaintProperty('ruta-preview-line', 'line-blur', 0);
    }
  } catch {}

  const sortedByDuration = [...routesToDraw].sort((a, b) => a.duration - b.duration);
  const fastestId = sortedByDuration[0]?.id;

  // Non-selected routes first, selected route rendered on top
  const sortedRoutes = [...routesToDraw].sort((a, b) => {
    const isASelected = currActive ? a.id === currActive.id : a.id === fastestId;
    const isBSelected = currActive ? b.id === currActive.id : b.id === fastestId;
    return isASelected ? 1 : isBSelected ? -1 : 0;
  });

  const features = sortedRoutes
    .filter((r) => r.coordinates.length >= 2)
    .map((r) => {
      const isSelected = currActive ? r.id === currActive.id : r.id === fastestId;
      const isFastest = r.id === fastestId;
      const color = isSelected
        ? previewStyle.selectedColor
        : previewStyle.altColor;
      return {
        type: 'Feature' as const,
        properties: {
          routeId: r.id,
          isSelected,
          isFastest,
          color,
        },
        geometry: {
          type: 'LineString' as const,
          coordinates: coordsToLngLat(r.coordinates),
        },
      };
    });

  previewSrc.setData({
    type: 'FeatureCollection',
    features,
  });
}

export interface SyncTrafficAlertMarkersOptions {
  trafficAlerts: TrafficAlert[];
  existingMarkers: maplibregl.Marker[];
  isOverviewActive: () => boolean;
  justExitedOverviewUntil: number;
  onAlertClick: (alert: TrafficAlert) => void;
}

export function syncTrafficAlertMarkersOnMap(
  map: maplibregl.Map,
  opts: SyncTrafficAlertMarkersOptions
): maplibregl.Marker[] {
  opts.existingMarkers.forEach((m) => m.remove());
  const nextMarkers: maplibregl.Marker[] = [];

  const now = Date.now();
  const activeAlerts = opts.trafficAlerts.filter((a) => !isAlertExpired(a, now));

  activeAlerts.forEach((alert) => {
    const isPoliceAlert = alert.type === 'police';
    const policeSubtype = isPoliceAlert ? normalizePoliceSubtype(alert) : 'visible';
    const policeSubtypeLabel = isPoliceAlert ? getPoliceSubtypeLabel(policeSubtype) : alert.title;
    const isInspectorAlert = alert.type === 'inspectors';
    const inspectorSubtype = isInspectorAlert ? normalizeInspectorSubtype(alert) : 'inspector_a';
    const inspectorSubtypeLabel = isInspectorAlert
      ? getInspectorSubtypeLabel(inspectorSubtype)
      : alert.title;

    const markerOpacity = alert.type === 'inspectors' ? getInspectorMarkerOpacity(alert, now) : 1;
    const markerCoordsList = getAlertTargetCoords(alert);

    markerCoordsList.forEach((coord) => {
      const alertEl = document.createElement('div');
      alertEl.className = 'alert-map-marker cursor-pointer';
      alertEl.dataset.baseOpacity = String(markerOpacity);
      const hiddenByOverview = opts.isOverviewActive();
      const shouldFadeInAfterOverview =
        !hiddenByOverview && opts.justExitedOverviewUntil > Date.now();
      alertEl.style.opacity =
        hiddenByOverview || shouldFadeInAfterOverview ? '0' : String(markerOpacity);
      alertEl.style.pointerEvents = hiddenByOverview ? 'none' : 'auto';
      if (hiddenByOverview) {
        alertEl.setAttribute('aria-hidden', 'true');
      }
      alertEl.style.zIndex = isPoliceAlert || isInspectorAlert ? '47' : '45';

      if (isPoliceAlert) {
        alertEl.innerHTML = `
          <div class="relative flex flex-col items-center justify-end" aria-label="${policeSubtypeLabel}">
            ${renderPoliceMarkerSvg(policeSubtype, 50)}
          </div>
        `;
      } else if (isInspectorAlert) {
        alertEl.innerHTML = `
          <div class="relative flex flex-col items-center justify-end" aria-label="${inspectorSubtypeLabel}">
            ${renderInspectorMarkerHtml(inspectorSubtype, 50)}
          </div>
        `;
      } else {
        const { bgHex, bubbleIconSvg } = getCommunityAlertVisual(alert.type);
        alertEl.innerHTML = `
          <div class="relative flex flex-col items-center justify-end" aria-label="${alert.title}">
            ${renderCommunityAlertBubbleSvg(bgHex, bubbleIconSvg, 50)}
          </div>
        `;
      }

      alertEl.addEventListener('click', (ev) => {
        if (opts.isOverviewActive()) return;
        ev.stopPropagation();
        if (shouldSuppressMapClick()) return;
        opts.onAlertClick(alert);
      });

      const m = new maplibregl.Marker({
        element: alertEl,
        anchor: 'bottom',
        offset: [0, 3],
        rotationAlignment: 'viewport',
        pitchAlignment: 'viewport',
        subpixelPositioning: true,
      })
        .setLngLat([coord.lng, coord.lat])
        .addTo(map);

      if (shouldFadeInAfterOverview) {
        requestAnimationFrame(() => {
          if (!opts.isOverviewActive()) {
            alertEl.style.opacity = alertEl.dataset.baseOpacity || String(markerOpacity);
          }
        });
      }

      nextMarkers.push(m);
    });
  });

  return nextMarkers;
}

export function updatePoiLayersVisibility(map: maplibregl.Map, visible: boolean): void {
  if (!isMapStyleReadyForSources(map)) return;
  const visVal = visible ? 'visible' : 'none';
  for (const layerId of [POI_REGULAR_LAYER_ID, POI_ESSENTIAL_LAYER_ID]) {
    try {
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, 'visibility', visVal);
      }
    } catch {}
  }
}

export interface SyncPoiGeoJsonLayersOptions {
  forceDataUpdate: boolean;
  poiEnabled: boolean;
  poiCategories: Record<string, boolean> | undefined;
  isOverviewActive: () => boolean;
  isPickingRadarLocation: () => boolean;
  isPoiEnabled: () => boolean;
  isNavigating: boolean;
  activeRoute: RouteData | null;
  getLastSignature: () => string;
  setLastSignature: (sig: string) => void;
  isListenersBound: () => boolean;
  markListenersBound: () => void;
  getCachedPoiById: (id: string) => MapPOI | undefined;
  setCachedPoisLookup: (lookup: Map<string, MapPOI>) => void;
  onSyncVectorTilePois: (map: maplibregl.Map) => void;
  onPoiClick: (poi: MapPOI) => void;
}

export function syncPoiGeoJsonLayers(
  map: maplibregl.Map,
  opts: SyncPoiGeoJsonLayersOptions
): void {
  if (!isMapStyleReadyForSources(map)) return;

  // Sincroniza cualquier POI ya cargado en los vector tiles antes de actualizar la fuente GeoJSON
  opts.onSyncVectorTilePois(map);

  // Asegura íconos 2x registrados en el estilo actual (Día / Noche / Satelital)
  registerPoiMapIcons(map);

  if (!map.getSource(POI_SOURCE_ID)) {
    opts.setLastSignature('');
    map.addSource(POI_SOURCE_ID, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });
  }

  const beforeOverlayId = map.getLayer(FIXED_RADAR_STRIPS_OUTLINE_LAYER_ID)
    ? FIXED_RADAR_STRIPS_OUTLINE_LAYER_ID
    : map.getLayer('ruta-preview-alt-outline')
    ? 'ruta-preview-alt-outline'
    : map.getLayer('ruta-preview-glow')
    ? 'ruta-preview-glow'
    : map.getLayer('ruta-active-glow')
    ? 'ruta-active-glow'
    : map.getLayer('ruta-maneuver-outline')
    ? 'ruta-maneuver-outline'
    : map.getLayer(DEST_COLLISION_LAYER_ID)
    ? DEST_COLLISION_LAYER_ID
    : undefined;

  const shouldBeVisible = Boolean(opts.poiEnabled && !opts.isOverviewActive());
  const visibilityVal = shouldBeVisible ? 'visible' : 'none';

  // Capa 1 (todos los zooms, menor prioridad de colisión que esenciales): colegios, tiendas, restaurantes, paraderos
  if (!map.getLayer(POI_REGULAR_LAYER_ID)) {
    map.addLayer(
      {
        id: POI_REGULAR_LAYER_ID,
        type: 'symbol',
        source: POI_SOURCE_ID,
        minzoom: 0,
        filter: ['==', ['get', 'tier'], 'regular'],
        layout: {
          'icon-image': ['get', 'iconKey'],
          'symbol-sort-key': ['get', 'sortKey'],
          'icon-size': ['interpolate', ['linear'], ['zoom'], 6, 0.5, 11, 0.68, 14.8, 0.88, 16, 0.96, 18, 1.04],
          'icon-allow-overlap': false,
          'icon-ignore-placement': false,
          'icon-padding': 4,
          'icon-anchor': 'center',
          'icon-rotation-alignment': 'viewport',
          'icon-pitch-alignment': 'viewport',
          visibility: visibilityVal,
        },
      },
      beforeOverlayId
    );
  }

  // Capa 2 (todos los zooms, prioridad sobre regulares): hospitales, urgencias, comisarías, bomberos
  if (!map.getLayer(POI_ESSENTIAL_LAYER_ID)) {
    map.addLayer(
      {
        id: POI_ESSENTIAL_LAYER_ID,
        type: 'symbol',
        source: POI_SOURCE_ID,
        minzoom: 0,
        filter: ['==', ['get', 'tier'], 'essential'],
        layout: {
          'icon-image': ['get', 'iconKey'],
          'symbol-sort-key': ['get', 'sortKey'],
          'icon-size': ['interpolate', ['linear'], ['zoom'], 6, 0.56, 11, 0.74, 13, 0.86, 15, 0.94, 17, 1.02],
          'icon-allow-overlap': false,
          'icon-ignore-placement': false,
          'icon-padding': 4,
          'icon-anchor': 'center',
          'icon-rotation-alignment': 'viewport',
          'icon-pitch-alignment': 'viewport',
          visibility: visibilityVal,
        },
      },
      beforeOverlayId
    );
  }

  prioritizeRouteAndLabelLayers(map);

  updatePoiLayersVisibility(map, shouldBeVisible);

  if (!opts.isListenersBound()) {
    opts.markListenersBound();
    const handlePoiLayerClick = (e: maplibregl.MapLayerMouseEvent) => {
      if (opts.isPickingRadarLocation()) return;
      if (shouldSuppressMapClick()) return;
      if (opts.isOverviewActive() || !opts.isPoiEnabled()) return;
      const poiId = e.features?.[0]?.properties?.poiId;
      if (!poiId) return;
      const found = opts.getCachedPoiById(String(poiId));
      if (!found) return;
      opts.onPoiClick(found);
    };
    const handlePoiEnter = () => {
      if (!opts.isOverviewActive() && opts.isPoiEnabled()) {
        map.getCanvas().style.cursor = 'pointer';
      }
    };
    const handlePoiLeave = () => {
      map.getCanvas().style.cursor = '';
    };
    map.on('click', POI_ESSENTIAL_LAYER_ID, handlePoiLayerClick);
    map.on('click', POI_REGULAR_LAYER_ID, handlePoiLayerClick);
    map.on('mouseenter', POI_ESSENTIAL_LAYER_ID, handlePoiEnter);
    map.on('mouseenter', POI_REGULAR_LAYER_ID, handlePoiEnter);
    map.on('mouseleave', POI_ESSENTIAL_LAYER_ID, handlePoiLeave);
    map.on('mouseleave', POI_REGULAR_LAYER_ID, handlePoiLeave);
  }

  const enabledCats = opts.poiCategories || {};
  const enabledKey = Object.entries(enabledCats)
    .filter(([, v]) => v !== false)
    .map(([k]) => k)
    .sort()
    .join(',');

  const allCached = opts.poiEnabled ? getAllCachedPois() : [];
  const isNavActive = opts.isNavigating;
  const navRouteCoords = opts.activeRoute?.coordinates;
  const navRouteId = opts.activeRoute?.id || 'none';
  const filtered = allCached.filter((poi) => {
    if (enabledCats[poi.category] === false) return false;
    if (isNavActive) {
      if (!NAV_USEFUL_POI_CATEGORIES.has(poi.category)) return false;
      if (navRouteCoords && navRouteCoords.length >= 2) {
        return isPoiNearActiveRoute(poi.lat, poi.lng, navRouteCoords, 150);
      }
    }
    return true;
  });
  const signature = `${opts.poiEnabled ? 1 : 0}:${isNavActive ? 1 : 0}:${navRouteId}:${enabledKey}:${filtered.length}`;
  if (!opts.forceDataUpdate && signature === opts.getLastSignature()) {
    return;
  }
  opts.setLastSignature(signature);

  const lookup = new Map<string, MapPOI>();
  const features = filtered.map((poi) => {
    lookup.set(poi.id, poi);
    return {
      type: 'Feature' as const,
      properties: {
        poiId: poi.id,
        iconKey: getPoiIconKey(poi),
        sortKey: getPoiSortKey(poi),
        tier: getPoiZoomTier(poi),
      },
      geometry: {
        type: 'Point' as const,
        coordinates: [poi.lng, poi.lat] as [number, number],
      },
    };
  });
  opts.setCachedPoisLookup(lookup);

  const src = map.getSource(POI_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
  if (src) {
    src.setData({
      type: 'FeatureCollection',
      features,
    });
  }
}

export interface SyncFixedRadarsLayersAndMarkersOptions {
  enabled: boolean;
  radars: FixedRadar[];
  existingMarkers: maplibregl.Marker[];
  ensureRouteLayers: (map: maplibregl.Map) => boolean;
  isOverviewActive: () => boolean;
  isPickingRadarLocation: () => boolean;
  justExitedOverviewUntil: number;
  draggingRadarId: string | null;
  onRadarClick: (radar: FixedRadar) => void;
  onRadarDragEnd: (coords: Coordinates) => void;
}

export function syncFixedRadarsLayersAndMarkers(
  map: maplibregl.Map,
  opts: SyncFixedRadarsLayersAndMarkersOptions
): maplibregl.Marker[] {
  opts.existingMarkers.forEach((m) => m.remove());
  const nextMarkers: maplibregl.Marker[] = [];

  const radars = opts.enabled ? opts.radars : [];

  // 1. Franjas de carretera Sutran en fuente GeoJSON (por debajo de la ruta azul)
  if (isMapStyleReadyForSources(map) && opts.ensureRouteLayers(map)) {
    const stripSrc = map.getSource(FIXED_RADAR_STRIPS_SOURCE_ID) as
      | maplibregl.GeoJSONSource
      | undefined;
    if (stripSrc) {
      const features = radars
        .filter(
          (r) =>
            r.tipo === 'carretera' &&
            Array.isArray(r.tramoCoordenadas) &&
            r.tramoCoordenadas.length >= 2
        )
        .map((r) => ({
          type: 'Feature' as const,
          properties: {
            radarId: r.id,
            nombre: r.nombre,
            precision: r.precision,
          },
          geometry: {
            type: 'LineString' as const,
            coordinates: r.tramoCoordenadas!.map(([lat, lng]) => [lng, lat]),
          },
        }));
      stripSrc.setData({ type: 'FeatureCollection', features });
    }
    const stripsHidden = opts.isOverviewActive();
    try {
      if (map.getLayer(FIXED_RADAR_STRIPS_OUTLINE_LAYER_ID)) {
        map.setPaintProperty(
          FIXED_RADAR_STRIPS_OUTLINE_LAYER_ID,
          'line-opacity',
          stripsHidden ? 0 : 0.88
        );
      }
      if (map.getLayer(FIXED_RADAR_STRIPS_FILL_LAYER_ID)) {
        map.setPaintProperty(
          FIXED_RADAR_STRIPS_FILL_LAYER_ID,
          'line-opacity',
          stripsHidden ? 0 : 0.92
        );
      }
    } catch {}
  }

  if (!opts.enabled) return nextMarkers;

  // 2. Marcadores urbanos de cámara de velocidad magenta (distintos a "Radar temporal")
  const currentZoom = map.getZoom();
  const editingId = opts.draggingRadarId;
  const hiddenByOverview = opts.isOverviewActive();
  const shouldFadeInAfterOverview =
    !hiddenByOverview && opts.justExitedOverviewUntil > Date.now();

  for (const radar of radars) {
    if (radar.tipo !== 'urbano') continue;
    if (radar.latitud === null || radar.longitud === null) continue;

    const isEditingThis = editingId === radar.id;
    const isHigh = radar.prioridad === 'alta';

    // Prioridad alta visible desde zoom más bajo (11); normal al acercarse (14.2)
    if (!isEditingThis) {
      if (isHigh && currentZoom < 11) continue;
      if (!isHigh && currentZoom < 14.2) continue;
    }

    const sizePx = isHigh ? 36 : 27;
    const isConfirmed = radar.precision === 'confirmado';

    const markerEl = document.createElement('div');
    markerEl.className = 'fixed-radar-marker cursor-pointer';
    markerEl.style.opacity = hiddenByOverview || shouldFadeInAfterOverview ? '0' : '1';
    markerEl.style.pointerEvents = hiddenByOverview ? 'none' : 'auto';
    if (hiddenByOverview) {
      markerEl.setAttribute('aria-hidden', 'true');
    }
    markerEl.style.zIndex = isEditingThis ? '55' : isHigh ? '44' : '42';
    markerEl.title = `${radar.nombre} (${radar.distrito})`;
    markerEl.innerHTML = `
      <div style="position:relative;display:flex;align-items:center;justify-content:center;">
        <div style="
          width:${sizePx}px;
          height:${sizePx}px;
          border-radius:10px;
          background:${isEditingThis ? '#be123c' : '#be185d'};
          border:2px solid ${isEditingThis ? '#fde047' : '#ffffff'};
          box-shadow:${
            isEditingThis
              ? '0 0 0 4px rgba(253,224,71,0.45), 0 6px 14px rgba(0,0,0,0.6)'
              : '0 3px 10px rgba(190,24,93,0.55)'
          };
          display:flex;
          align-items:center;
          justify-content:center;
          color:#ffffff;
        ">
          <svg viewBox="0 0 24 24" width="${Math.round(sizePx * 0.6)}" height="${Math.round(
      sizePx * 0.6
    )}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="4" y="4" width="14" height="10" rx="2.5" fill="rgba(255,255,255,0.18)" />
            <circle cx="11" cy="9" r="2.6" fill="#fbcfe8" />
            <path d="M11 14v6M8 20h6" />
            <circle cx="15.3" cy="6.6" r="1" fill="#fde047" stroke="none" />
          </svg>
        </div>
        ${
          isConfirmed
            ? `<span style="position:absolute;top:-4px;right:-4px;width:12px;height:12px;border-radius:9999px;background:#10b981;border:1.5px solid #ffffff;box-shadow:0 1px 3px rgba(0,0,0,0.4);"></span>`
            : ''
        }
      </div>
    `;

    markerEl.addEventListener('click', (ev) => {
      if (opts.isOverviewActive()) return;
      if (opts.isPickingRadarLocation()) return;
      ev.stopPropagation();
      if (shouldSuppressMapClick()) return;
      opts.onRadarClick(radar);
    });

    const marker = new maplibregl.Marker({
      element: markerEl,
      anchor: 'center',
      draggable: isEditingThis,
      rotationAlignment: 'viewport',
      pitchAlignment: 'viewport',
    })
      .setLngLat([radar.longitud, radar.latitud])
      .addTo(map);

    if (shouldFadeInAfterOverview) {
      requestAnimationFrame(() => {
        if (!opts.isOverviewActive()) {
          markerEl.style.opacity = '1';
        }
      });
    }

    if (isEditingThis) {
      marker.on('dragend', () => {
        const pos = marker.getLngLat();
        opts.onRadarDragEnd({ lat: pos.lat, lng: pos.lng });
      });
    }

    nextMarkers.push(marker);
  }

  return nextMarkers;
}

export function syncOverviewMarkersAndStripsVisibility(
  map: maplibregl.Map | null,
  alertMarkers: maplibregl.Marker[],
  fixedRadarMarkers: maplibregl.Marker[],
  hidden: boolean
): void {
  alertMarkers.forEach((m) => {
    const el = m.getElement();
    if (!el) return;
    el.style.opacity = hidden ? '0' : el.dataset.baseOpacity || '1';
    el.style.pointerEvents = hidden ? 'none' : 'auto';
    if (hidden) {
      el.setAttribute('aria-hidden', 'true');
    } else {
      el.removeAttribute('aria-hidden');
    }
  });

  fixedRadarMarkers.forEach((m) => {
    const el = m.getElement();
    if (!el) return;
    el.style.opacity = hidden ? '0' : '1';
    el.style.pointerEvents = hidden ? 'none' : 'auto';
    if (hidden) {
      el.setAttribute('aria-hidden', 'true');
    } else {
      el.removeAttribute('aria-hidden');
    }
  });

  if (map && isMapStyleReadyForSources(map)) {
    try {
      if (map.getLayer(FIXED_RADAR_STRIPS_OUTLINE_LAYER_ID)) {
        map.setPaintProperty(
          FIXED_RADAR_STRIPS_OUTLINE_LAYER_ID,
          'line-opacity',
          hidden ? 0 : 0.88
        );
      }
      if (map.getLayer(FIXED_RADAR_STRIPS_FILL_LAYER_ID)) {
        map.setPaintProperty(
          FIXED_RADAR_STRIPS_FILL_LAYER_ID,
          'line-opacity',
          hidden ? 0 : 0.92
        );
      }
    } catch {}
  }
}

export function syncBuildings3DLayerVisibility(map: maplibregl.Map, show3D: boolean): void {
  if (!isMapStyleReadyForSources(map)) return;
  try {
    if (map.getLayer('building-3d')) {
      map.setLayerZoomRange('building-3d', 0, 24);
      map.setLayoutProperty('building-3d', 'visibility', show3D ? 'visible' : 'none');
    }
  } catch {}
}

export function createVehicleChevronMarker(
  map: maplibregl.Map,
  opts: {
    isNavigating: boolean;
    isPreviewMode: boolean;
    lat: number;
    lng: number;
    angle: number;
  }
): maplibregl.Marker {
  const { isNavigating, isPreviewMode, lat, lng, angle } = opts;
  const el = document.createElement('div');
  const sizePx = isNavigating ? '60px' : isPreviewMode ? '36px' : '84px';
  el.className = 'vehicle-nav-marker pointer-events-none select-none';
  el.style.width = sizePx;
  el.style.height = sizePx;
  el.style.margin = '0';
  el.style.padding = '0';
  el.style.boxSizing = 'border-box';
  el.style.display = 'flex';
  el.style.alignItems = 'center';
  el.style.justifyContent = 'center';
  el.style.lineHeight = '0';
  el.style.transformOrigin = 'center center';

  if (isNavigating) {
    el.innerHTML = `
      <div class="relative flex items-center justify-center w-[60px] h-[60px] pointer-events-none select-none">
        <div class="absolute w-14 h-14 rounded-full bg-sky-500/15 border border-sky-400/25"></div>
        <div class="relative w-[56px] h-[56px] flex items-center justify-center">
          <svg viewBox="0 0 64 64" class="block w-full h-full" style="filter: drop-shadow(0 0 8px rgba(0, 0, 0, 0.45));">
            <path
              d="M32 6 L56 54 L32 43 L8 54 Z"
              fill="#00d2ff"
              stroke="#ffffff"
              stroke-width="4.2"
              stroke-linejoin="round"
              stroke-linecap="round"
            />
          </svg>
        </div>
      </div>
    `;
  } else if (isPreviewMode) {
    el.innerHTML = `
      <div class="relative flex items-center justify-center w-[36px] h-[36px] pointer-events-none select-none">
        <div class="absolute w-8 h-8 rounded-full bg-sky-500/30 border border-sky-400/45"></div>
        <div class="relative w-4 h-4 rounded-full bg-[#0284c7] border-[2.5px] border-white shadow-[0_2px_8px_rgba(2,132,199,0.75)]"></div>
      </div>
    `;
  } else {
    el.innerHTML = `
      <div class="relative flex items-center justify-center w-[84px] h-[84px] pointer-events-none select-none">
        <div class="absolute w-16 h-16 rounded-full bg-sky-500/18 border border-sky-400/35"></div>
        <div class="relative w-[78px] h-[78px] flex items-center justify-center">
          <svg viewBox="0 0 64 64" class="block w-full h-full" style="filter: drop-shadow(0 0 8px rgba(0, 0, 0, 0.45));">
            <path
              d="M32 6 L56 54 L32 43 L8 54 Z"
              fill="#00d2ff"
              stroke="#ffffff"
              stroke-width="4.2"
              stroke-linejoin="round"
              stroke-linecap="round"
            />
          </svg>
        </div>
      </div>
    `;
  }

  const marker = new maplibregl.Marker({
    element: el,
    anchor: 'center',
    offset: [0, 0],
    rotationAlignment: isPreviewMode ? 'viewport' : 'map',
    pitchAlignment: isPreviewMode ? 'viewport' : 'map',
    subpixelPositioning: true,
  })
    .setLngLat([lng, lat])
    .setRotation(isPreviewMode ? 0 : angle)
    .addTo(map);

  el.style.zIndex = '50';
  return marker;
}

export function createDestinationPinMarker(
  map: maplibregl.Map,
  coords: Coordinates
): maplibregl.Marker {
  const destEl = document.createElement('div');
  destEl.className = 'dest-pin-marker';
  destEl.innerHTML = createExactDestPinHTML();
  return new maplibregl.Marker({
    element: destEl,
    anchor: 'bottom',
    rotationAlignment: 'viewport',
    pitchAlignment: 'viewport',
  })
    .setLngLat([coords.lng, coords.lat])
    .addTo(map);
}

export function createPreviewRouteTimeMarkers(
  map: maplibregl.Map,
  routesToDraw: RouteData[],
  selectedId: string | undefined,
  fastestId: string | undefined,
  labelCoordsMap: Map<string, [number, number]>,
  isNavigating: () => boolean,
  onRouteTap: (route: RouteData) => void
): maplibregl.Marker[] {
  const markers: maplibregl.Marker[] = [];
  routesToDraw.forEach((r) => {
    if (r.coordinates.length < 2) return;
    const isSelected = r.id === selectedId;
    const isFastest = r.id === fastestId;
    const mins = Math.max(1, Math.round(r.duration / 60));
    const globitoCoord =
      labelCoordsMap.get(r.id) ||
      r.coordinates[Math.floor(r.coordinates.length / 2)];

    const pillEl = document.createElement('div');
    pillEl.className = 'route-time-marker';
    pillEl.style.zIndex = isSelected ? '26' : '16';
    pillEl.innerHTML = renderRouteTimePillHtml(mins, isSelected, isFastest);
    pillEl.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (!isNavigating()) {
        onRouteTap(r);
      }
    });

    const timeMarker = new maplibregl.Marker({
      element: pillEl,
      anchor: 'bottom',
      rotationAlignment: 'viewport',
      pitchAlignment: 'viewport',
    })
      .setLngLat([globitoCoord[1], globitoCoord[0]])
      .addTo(map);

    markers.push(timeMarker);
  });
  return markers;
}

export function updateManeuverArrowSource(
  map: maplibregl.Map,
  geoJson: ManeuverFeatureCollection
): void {
  try {
    const src = map.getSource(MANEUVER_ARROW_SOURCE_ID) as
      | maplibregl.GeoJSONSource
      | undefined;
    src?.setData(geoJson);
  } catch {}
}

export function createNextStreetBubbleMarker(
  map: maplibregl.Map,
  rawStreetName: string,
  isDayMode: boolean,
  bubblePt: [number, number]
): maplibregl.Marker {
  const safeLabel = rawStreetName.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const bubbleEl = document.createElement('div');
  bubbleEl.className = 'nav-next-street-bubble pointer-events-none select-none';
  bubbleEl.style.zIndex = '46';
  if (isDayMode) {
    bubbleEl.innerHTML = `
      <div class="flex flex-col items-center">
        <div class="px-2.5 py-1 rounded-lg bg-slate-900 text-white border border-sky-400/80 shadow-[0_3px_10px_rgba(0,0,0,0.4)] font-extrabold text-[11px] leading-tight tracking-tight whitespace-nowrap max-w-[155px] truncate">${safeLabel}</div>
        <div class="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-slate-900 -mt-[1px]"></div>
      </div>
    `;
  } else {
    bubbleEl.innerHTML = `<div class="px-2 py-0.5 rounded-md bg-sky-200 text-slate-950 border border-slate-900/90 shadow-[0_2px_6px_rgba(0,0,0,0.6)] font-extrabold text-[11px] leading-tight tracking-tight whitespace-nowrap max-w-[140px] truncate">${safeLabel}</div>`;
  }
  return new maplibregl.Marker({
    element: bubbleEl,
    anchor: isDayMode ? 'bottom' : 'center',
  })
    .setLngLat([bubblePt[1], bubblePt[0]])
    .addTo(map);
}
