export interface Coordinates {
  lat: number;
  lng: number;
}

export interface GPSLocation {
  lat: number;
  lng: number;
  accuracy: number;
  speed: number | null; // in m/s
  heading: number | null; // in degrees (0-360)
  altitude: number | null;
  timestamp: number;
}

export type SearchPlaceCategory =
  | 'hospital'
  | 'clinic'
  | 'pharmacy'
  | 'school'
  | 'university'
  | 'restaurant'
  | 'cafe'
  | 'supermarket'
  | 'shopping'
  | 'fuel'
  | 'bank'
  | 'police'
  | 'fire_station'
  | 'park'
  | 'hotel'
  | 'bus_stop'
  | 'subway'
  | 'airport'
  | 'beach'
  | 'landmark'
  | 'food'
  | 'avenue'
  | 'street'
  | 'district';

export interface SearchResult {
  id: string;
  name: string;
  display_name: string;
  lat: number;
  lng: number;
  district?: string;
  category?: SearchPlaceCategory;
  placeTypeLabel?: string;
  isStreetFallback?: boolean;
  fallbackNotice?: string;
}

export type ManeuverType =
  | 'turn'
  | 'depart'
  | 'arrive'
  | 'roundabout'
  | 'fork'
  | 'end-of-road'
  | 'continue'
  | 'merge'
  | 'on-ramp'
  | 'off-ramp';

export type ManeuverModifier =
  | 'left'
  | 'sharp-left'
  | 'slight-left'
  | 'right'
  | 'sharp-right'
  | 'slight-right'
  | 'straight'
  | 'uturn';

export interface RouteStep {
  distance: number; // in meters
  duration: number; // in seconds
  instruction: string;
  type: ManeuverType;
  modifier?: ManeuverModifier;
  name: string;
  coordinates: [number, number]; // [lat, lng]
}

export type TravelMode = 'driving' | 'walking';

export type RouteClassification = 'fastest' | 'shortest' | 'alternative';

export interface RouteData {
  id: string;
  coordinates: [number, number][]; // array of [lat, lng]
  distance: number; // in meters
  duration: number; // in seconds
  steps: RouteStep[];
  summary: string;
  destinationName: string;
  destinationCoords: Coordinates;
  classification?: RouteClassification;
  diffTimeText?: string;
  diffDistanceText?: string;
  travelMode?: TravelMode;
  estimatedSteps?: number;
  estimatedCalories?: number;
  colorIndex?: number;
  colorTheme?: 'blue' | 'green' | 'purple' | 'orange';
}

export type MapTileMode = 'day' | 'night' | 'satellite';

export type ViewPerspective = '2d' | '3d';

export type NavigationMode = 'idle' | 'preview' | 'navigating' | 'rerouting' | 'arrived';

export type TrafficAlertType =
  | 'accident'
  | 'traffic'
  | 'road_closed'
  | 'construction'
  | 'hazard'
  | 'police'
  | 'stopped_vehicle'
  | 'pothole'
  | 'broken_light'
  | 'inspectors'
  | 'speed_camera'
  | 'flood';

export type PoliceSubtype = 'visible' | 'hidden' | 'opposite_lane' | 'traffic';

export type InspectorSubtype = 'inspector_a' | 'inspector_s' | 'inspector_municipal';

export interface TrafficAlert {
  id: string;
  type: TrafficAlertType;
  policeSubtype?: PoliceSubtype;
  inspectorSubtype?: InspectorSubtype;
  title: string;
  description: string;
  zone?: string;
  address?: string;
  coords: Coordinates;
  timestamp: number;
  expiresAt?: number; // timestamp cuando vence el reporte
  status: 'active' | 'resolved';
  isUserReport: boolean;
  creatorId?: string; // ID del conductor que creó el reporte
  isConfirmed?: boolean; // Pendiente de verificación vs Confirmado
  confirmations?: number; // Contador de confirmaciones ("Sigue ahí")
  removalVotes?: number; // Contador de votos de eliminación ("Ya no está")
  upvotes?: number;
  heading?: number | null; // Rumbo en grados (0-360) del sentido de marcha del reporte
  speedKmh?: number | null; // Velocidad en km/h al momento de crear el reporte
  roadId?: string; // Identificador de la vía más cercana en el mapa / OSM
  carriagewayId?: string; // Identificador de la calzada específica
  bothDirections?: boolean; // Si aplica a ambos sentidos de circulación
  oppositeCoords?: Coordinates; // Coordenada en la calzada contraria cuando bothDirections = true
  oppositeRoadId?: string; // Identificador de la calzada contraria
}

export interface SavedPlace {
  id: string;
  type: 'home' | 'work' | 'favorite' | 'recent';
  name: string;
  address?: string;
  display_name?: string;
  district?: string;
  lat: number;
  lng: number;
  addedAt?: number;
  lastVisitedAt?: number;
  timestamp?: number;
}

export type POICategory =
  | 'hospital'
  | 'supermarket'
  | 'restaurant'
  | 'cafe'
  | 'pharmacy'
  | 'fuel'
  | 'fire_station'
  | 'school'
  | 'institute'
  | 'university'
  | 'military_academy'
  | 'bank'
  | 'police'
  | 'subway'
  | 'bus_stop'
  | 'park'
  | 'hotel';

export interface MapPOI {
  id: string;
  name: string;
  hasCustomName?: boolean;
  category: POICategory;
  amenityTag: string;
  lat: number;
  lng: number;
  hasEmergency?: boolean;
  isPizza?: boolean;
  isMajorBrand?: boolean;
  schoolType?: 'national' | 'private_small';
  militaryBranch?: 'army' | 'police_academy' | 'air_force' | 'navy';
  osmType?: 'node' | 'way' | 'relation';
  source?: 'overpass' | 'vectortile';
}
