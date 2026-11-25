import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as maplibregl from 'maplibre-gl';
import maplibreWorkerCode from 'maplibre-gl/dist/maplibre-gl-worker.mjs?raw';
import {
  Coordinates,
  GPSLocation,
  MapPOI,
  MapTileMode,
  RouteData,
  RouteStep,
  SearchResult,
  TrafficAlert,
  TravelMode,
} from '../../types/navigation';
import { Compass, LocateFixed, Layers, Settings, AlertTriangle, X } from 'lucide-react';
import { MapSettingsModal, MapSettingsData } from './MapSettingsModal';
import { AddFixedRadarModal } from './AddFixedRadarModal';
import { FixedRadar } from '../../data/fixedRadars';
import {
  getActiveRegionsForFilter,
  getMergedFixedRadarsForRegions,
  resolvePendingRadarsForRegions,
} from '../../services/fixedRadars';
import { reverseGeocodeCoords } from '../../services/nominatim';
import { voiceGuidance } from '../../services/tts';
import { logSystemNotice } from '../../services/systemNotices';
import { isAlertExpired } from '../../services/alertLifecycle';
import {
  closeAllSmallOverlays,
  hasAnyOpenSmallOverlay,
  notifySmallOverlayClose,
  notifySmallOverlayOpen,
  shouldSuppressMapClick,
} from '../../services/overlayCoordinator';
import {
  DEFAULT_POI_CATEGORIES,
  GeoBounds,
  boundsOverlapRatio,
  doesBoundsCover,
  expandBoundsSlightly,
  fetchOverpassPOIsForBounds,
  getAllCachedPois,
  getPoiDetailLevelForZoom,
  ingestVectorTileFeatures,
  isBoundsCoveredByCache,
} from '../../services/overpassPoi';
import { CarriagewaySnapResult } from '../../services/reportDirection';
import {
  ACTIVE_ROUTE_SNAP_MAX_METERS,
  EMPTY_MANEUVER_FC,
  FREE_DRIVE_MIN_MOVING_SPEED_MPS,
  INCLINACION_PANTALLA_PRINCIPAL,
  IdleRoadSegment,
  ManeuverFeatureCollection,
  NAV_PITCH_DEGREES,
  ZOOM_PANTALLA_PRINCIPAL,
  buildManeuverArrowGeoJSON,
  clampPointToRoadSegment,
  computeIdleArrowPaddingValues,
  computeLowerThirdPaddingValues,
  computeNavSmartZoom,
  computeNextStreetBubblePoint,
  computeNonOverlappingRouteLabelCoords,
  coordsToLngLat,
  findClosestVertexIndex,
  getBearing,
  getDistanceMeters,
  matchUserToRoute,
  normalizeHeadingDeg,
  offsetCoordByMeters,
  projectArrowOntoRoadSurface,
  projectPointOntoRoutePolyline,
  resolveNavigationBearing,
  shortestAngleDiffDeg,
  snapReportPointToRenderedCarriageway,
  snapToActiveRoute,
  speedToZoom,
} from './navigation/routeGeometry';
import {
  ACTIVE_ROUTE_SOURCE_ID,
  OpenFreeMapFallbackStage,
  OverviewLayerSnapshot,
  PERU_PMTILES_SOURCE_ID,
  applyOverviewCleanMapStyle,
  applyRoutePreviewMapStyle,
  applyWazeStyleEnhancements,
  createDestinationPinMarker,
  createNextStreetBubbleMarker,
  createPreviewRouteTimeMarkers,
  createVehicleChevronMarker,
  ensurePmtilesProtocolRegistered,
  ensureRouteAndOverlayLayers,
  getStyleForTileMode,
  isMapStyleReadyForSources,
  resolveVectorStyleWithPmTiles,
  restoreNormalMapStyleFromOverview,
  syncBuildings3DLayerVisibility,
  syncFixedRadarsLayersAndMarkers,
  syncOverviewMarkersAndStripsVisibility,
  syncPoiGeoJsonLayers,
  syncTrafficAlertMarkersOnMap,
  updateDestCollisionBlockerSource,
  updateManeuverArrowSource,
  updatePoiLayersVisibility,
  updateRouteGeoJsonSources,
} from './navigation/mapLayers';
import { LongPressPointState, MapOverlayCards } from './navigation/MapOverlayCards';

if (typeof window !== 'undefined' && typeof Blob !== 'undefined' && typeof URL !== 'undefined') {
  const maplibreWorkerBlobUrl = URL.createObjectURL(
    new Blob([maplibreWorkerCode], { type: 'text/javascript' })
  );
  maplibregl.setWorkerUrl(maplibreWorkerBlobUrl);
  ensurePmtilesProtocolRegistered();
}

// Storage key for user preferences persistence across sessions
const SETTINGS_STORAGE_KEY = 'ruta_lima_map_config';

export const getInitialSettings = (initialTileMode: MapTileMode): MapSettingsData => {
  const defaults: MapSettingsData = {
    tileMode: initialTileMode,
    openMapTilesEnabled: true,
    perspective3D: true,
    buildings3D: false,
    autoRotation: true,
    autoFollowGPS: true,
    smartZoom: true,
    controlsSize: 'normal',
    voiceEnabled: true,
    voiceVolume: 1.0,
    rerouteSoundEnabled: true,
    rerouteSoundVolume: 'high',
    navAlerts: true,
    preRouteAlertsEnabled: true,
    inspectorNavAlertsEnabled: true,
    inspectorAlertDistanceKm: 2,
    schoolZoneAlertEnabled: true,
    poiEnabled: true,
    poiCategories: { ...DEFAULT_POI_CATEGORIES },
    fixedRadarsEnabled: true,
    fixedRadarVoiceEnabled: true,
    fixedRadarRegionFilter: 'auto',
  };

  try {
    const saved = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        ...defaults,
        ...parsed,
        poiCategories: { ...defaults.poiCategories },
      };
    }
  } catch (err) {
    console.warn('Error loading map settings from localStorage', err);
  }

  return defaults;
};

interface NavigationMapProps {
  userLocation: GPSLocation;
  routes: RouteData[];
  activeRoute: RouteData | null;
  onSelectRoute?: (route: RouteData) => void;
  destinationCoords: Coordinates | null;
  mapTileMode: MapTileMode;
  isFollowing: boolean;
  onToggleFollow: (following: boolean) => void;
  onTileModeChange: (mode: MapTileMode) => void;
  isNavigating: boolean;
  trafficAlerts?: TrafficAlert[];
  onConfirmAlert?: (alertId: string) => void;
  onRemoveAlert?: (alertId: string) => void;
  onToggleAlertBothDirections?: (alertId: string) => void;
  onRegisterCarriagewaySnapper?: (
    snapper:
      | ((
          lat: number,
          lng: number,
          targetHeadingDeg: number,
          maxDistMeters?: number
        ) => CarriagewaySnapResult | null)
      | null
  ) => void;
  onOpenReportIncident?: () => void;
  distanceToNextStep?: number;
  currentStep?: RouteStep;
  nextStep?: RouteStep;
  currentRoadName?: string;
  speedKmh?: number;
  travelMode?: TravelMode;
  onRequestLocation?: () => void;
  overviewTrigger?: number;
  recenterTrigger?: number;
  focusCoordsTrigger?: { lat: number; lng: number; zoom?: number; seq: number } | null;
  onSettingsChange?: (settings: MapSettingsData) => void;
  onSettingsOpenChange?: (isOpen: boolean) => void;
  onAddFixedRadarOpenChange?: (isOpen: boolean) => void;
  onMapInteraction?: () => void;
  onUserExplorationGesture?: () => void;
  onNavigateToPOI?: (poi: MapPOI) => void;
  onPoisUpdated?: (pois: MapPOI[]) => void;
  onFixedRadarsUpdated?: (radars: FixedRadar[]) => void;
  onStartRouteToDestination?: (destination: SearchResult) => void;
  isOverlayModalOpen?: boolean;
  isLoadingRoute?: boolean;
}

export const NavigationMap: React.FC<NavigationMapProps> = ({
  userLocation,
  routes,
  activeRoute,
  onSelectRoute,
  destinationCoords,
  mapTileMode,
  isFollowing,
  onToggleFollow,
  onTileModeChange,
  isNavigating,
  trafficAlerts = [],
  onConfirmAlert,
  onRemoveAlert,
  onToggleAlertBothDirections,
  onRegisterCarriagewaySnapper,
  onOpenReportIncident,
  distanceToNextStep = 9999,
  currentStep,
  nextStep,
  currentRoadName,
  speedKmh = 0,
  onRequestLocation,
  overviewTrigger,
  recenterTrigger,
  focusCoordsTrigger,
  onSettingsChange,
  onSettingsOpenChange,
  onAddFixedRadarOpenChange,
  onMapInteraction,
  onUserExplorationGesture,
  onNavigateToPOI,
  onPoisUpdated,
  onFixedRadarsUpdated,
  onStartRouteToDestination,
  isOverlayModalOpen = false,
  isLoadingRoute = false,
}) => {
  const rootContainerRef = useRef<HTMLDivElement>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<maplibregl.Map | null>(null);
  const isMapStyleReadyRef = useRef<boolean>(false);
  const prevTileModeRef = useRef<MapTileMode>(mapTileMode);
  const mapTileModeRef = useRef<MapTileMode>(mapTileMode);
  mapTileModeRef.current = mapTileMode;

  const userMarkerRef = useRef<maplibregl.Marker | null>(null);
  const destMarkerRef = useRef<maplibregl.Marker | null>(null);
  const routeTimeMarkersRef = useRef<maplibregl.Marker[]>([]);
  const maneuverGeoJsonRef = useRef<ManeuverFeatureCollection>(EMPTY_MANEUVER_FC);
  const nextStreetBubbleMarkerRef = useRef<maplibregl.Marker | null>(null);
  const nextStreetBubbleLabelRef = useRef<string>('');
  const nextStreetBubbleModeRef = useRef<MapTileMode>(mapTileMode);
  const alertMarkersRef = useRef<maplibregl.Marker[]>([]);
  const lastFittedRouteKeyRef = useRef<string | null>(null);
  const lastFittedDestKeyRef = useRef<string | null>(null);
  const lastFittedPanelHeightRef = useRef<number | null>(null);
  const lastSelectedPreviewRouteIdRef = useRef<string | null>(null);
  const userInteractedInPreviewRef = useRef<boolean>(false);
  const previewFitDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewFitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewFitInitialRafRef = useRef<number | null>(null);
  const isLoadingRouteRef = useRef<boolean>(isLoadingRoute);
  isLoadingRouteRef.current = isLoadingRoute;
  const prevIsLoadingRouteRef = useRef<boolean>(isLoadingRoute);
  const handleUserPreviewRouteTapRef = useRef<(route: RouteData) => void>(() => {});
  const routeLineClickedAtRef = useRef<number>(0);
  const [resolvedCurrentStreet, setResolvedCurrentStreet] = useState<string>('');

  // Smooth marker interpolation & synced follow-camera refs (requestAnimationFrame 60 FPS)
  const currentMarkerPosRef = useRef<[number, number]>([userLocation.lat, userLocation.lng]);
  const targetMarkerPosRef = useRef<[number, number]>([userLocation.lat, userLocation.lng]);
  const currentMarkerAngleRef = useRef<number>(normalizeHeadingDeg(userLocation.heading || 0));
  const targetMarkerAngleRef = useRef<number>(normalizeHeadingDeg(userLocation.heading || 0));
  const animFrameIdRef = useRef<number | null>(null);
  const lastAnimTimeRef = useRef<number>(performance.now());
  const currentIconModeRef = useRef<string | null>(null);

  // Linear position interpolation + dead-reckoning anticipation + route projection state
  const hasInitializedArrowRef = useRef<boolean>(false);
  const posAnimStartRef = useRef<[number, number]>([userLocation.lat, userLocation.lng]);
  const posAnimEndRef = useRef<[number, number]>([userLocation.lat, userLocation.lng]);
  const posAnimStartTimeRef = useRef<number>(performance.now());
  const posAnimDurationRef = useRef<number>(1000);
  const lastGpsFixPerfTimeRef = useRef<number | null>(null);
  const lastProcessedFixSignatureRef = useRef<string>('');
  const velocityMpsRef = useRef<number>(0);
  const velocityBearingRef = useRef<number>(normalizeHeadingDeg(userLocation.heading || 0));
  const isVehicleMovingRef = useRef<boolean>(false);
  const isSnappedToRouteRef = useRef<boolean>(false);
  const snappedSegmentIdxRef = useRef<number>(0);
  const idleRoadSegmentRef = useRef<IdleRoadSegment | null>(null);

  // Smooth shortest-arc rotation (~300 ms, ignoring deltas < 5°)
  const committedTargetAngleRef = useRef<number>(normalizeHeadingDeg(userLocation.heading || 0));
  const rotAnimStartAngleRef = useRef<number>(normalizeHeadingDeg(userLocation.heading || 0));
  const rotAnimDeltaDegRef = useRef<number>(0);
  const rotAnimStartTimeRef = useRef<number>(performance.now());

  // Tab background visibility & direct camera snap tracking
  const wasPageHiddenRef = useRef<boolean>(false);
  const snapOnNextFixRef = useRef<boolean>(false);
  const cameraNeedsImmediateSnapRef = useRef<boolean>(false);

  // Synced follow-camera target parameters & frame guard
  const followCamTargetZoomRef = useRef<number>(ZOOM_PANTALLA_PRINCIPAL);
  // Velocidad suavizada para el zoom dinámico (evita que el zoom "respire" con cada cambio del GPS)
  const smoothedZoomSpeedRef = useRef<{ value: number; at: number }>({ value: 0, at: 0 });
  const followCamTargetBearingRef = useRef<number>(0);
  const followCamTargetPitchRef = useRef<number>(0);
  const followCamTargetPaddingRef = useRef<maplibregl.PaddingOptions>({
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  });
  const isFollowCameraJumpActiveRef = useRef<boolean>(false);
  const lastFollowPoiRefreshTimeRef = useRef<number>(0);

  // Synchronized state refs for callbacks & async map listeners
  const userLocationRef = useRef(userLocation);
  userLocationRef.current = userLocation;
  const routesRef = useRef(routes);
  routesRef.current = routes;
  const activeRouteRef = useRef(activeRoute);
  activeRouteRef.current = activeRoute;
  const destinationCoordsRef = useRef(destinationCoords);
  destinationCoordsRef.current = destinationCoords;
  const distanceToNextStepRef = useRef(distanceToNextStep);
  distanceToNextStepRef.current = distanceToNextStep;
  const speedKmhRef = useRef(speedKmh);
  speedKmhRef.current = speedKmh;
  const onSelectRouteRef = useRef(onSelectRoute);
  onSelectRouteRef.current = onSelectRoute;

  // Programmatic movement guard & pending atomic recenter flag
  const AUTO_FOLLOW_PAUSE_MS = 15_000;
  const isProgrammaticMoveRef = useRef<boolean>(false);
  const isProgrammaticCameraRef = useRef<boolean>(false);
  const isAtomicRecenterInFlightRef = useRef<boolean>(false);
  const isIdleUserPointerDownRef = useRef<boolean>(false);
  // Pausa de auto-seguimiento por 15 segundos al tocar o interactuar manualmente con el mapa
  const [isAutoFollowPaused, setIsAutoFollowPaused] = useState<boolean>(false);
  const isAutoFollowPausedRef = useRef<boolean>(false);
  const autoFollowPauseUntilRef = useRef<number>(0);
  const autoFollowPauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shouldResumeFollowAfterPauseRef = useRef<boolean>(false);
  const lastPauseTimerRefreshRef = useRef<number>(0);
  const cameraFollowAnimFrameIdRef = useRef<number | null>(null);
  const pauseAutoFollowRef = useRef<(opts?: { fromTouchMove?: boolean }) => void>(() => {});
  const clearAutoFollowPauseRef = useRef<() => void>(() => {});
  // Dedo apoyado sobre el mapa: la cámara automática se pausa al instante para no pelear con el gesto
  const isUserTouchingMapRef = useRef<boolean>(false);
  const userTouchStartedAtRef = useRef<number>(0);
  const idleGestureStartRef = useRef<{ x: number; y: number; pinchDist?: number; zoom: number } | null>(null);
  const isNavigatingRef = useRef<boolean>(isNavigating);
  isNavigatingRef.current = isNavigating;
  const isFollowingRef = useRef<boolean>(isFollowing);
  isFollowingRef.current = isFollowing;
  const hasAnyRoutesRef = useRef<boolean>(Boolean(activeRoute || routes.length > 0));
  hasAnyRoutesRef.current = Boolean(activeRoute || routes.length > 0);
  const isRoutePreviewActive = !isNavigating && (routes.length > 0 || Boolean(activeRoute));
  const isRoutePreviewActiveRef = useRef<boolean>(isRoutePreviewActive);
  isRoutePreviewActiveRef.current = isRoutePreviewActive;
  const pendingRecenterRef = useRef<boolean>(false);
  const recenterWaitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const programmaticClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const programmaticCameraTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idlePitchLockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevIdlePerspective3DRef = useRef<boolean>(false);
  const flatFallbackActiveRef = useRef<boolean>(false);
  const [pitchFallbackNotice, setPitchFallbackNotice] = useState<string | null>(null);
  const pitchFallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingStyleCameraRef = useRef<{
    center: maplibregl.LngLat;
    zoom: number;
    bearing: number;
    pitch: number;
    padding: maplibregl.PaddingOptions;
  } | null>(null);
  // Settings State
  const [mapSettings, setMapSettings] = useState<MapSettingsData>(() =>
    getInitialSettings(mapTileMode)
  );
  const mapSettingsRef = useRef<MapSettingsData>(mapSettings);
  mapSettingsRef.current = mapSettings;
  const openMapTilesEnabledRef = useRef<boolean>(mapSettings.openMapTilesEnabled !== false);
  openMapTilesEnabledRef.current = mapSettings.openMapTilesEnabled !== false;
  const prevOpenMapTilesEnabledRef = useRef<boolean>(mapSettings.openMapTilesEnabled !== false);

  const styleFallbackStageRef = useRef<OpenFreeMapFallbackStage>('liberty');
  const hasVectorSourceLoadedRef = useRef<boolean>(false);
  const styleLoadFallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const vectorStyleRequestSeqRef = useRef<number>(0);
  const loadPmTilesVectorStyleRef = useRef<(stage?: 'liberty' | 'bright') => void>(() => {});
  const triggerOpenFreeMapFallbackRef = useRef<() => void>(() => {});
  const [activeAttributionMode, setActiveAttributionMode] = useState<
    'openfreemap' | 'pmtiles_only' | 'osm_raster' | 'satellite'
  >(() =>
    mapTileMode === 'satellite'
      ? 'satellite'
      : mapSettings.openMapTilesEnabled !== false
      ? 'openfreemap'
      : 'pmtiles_only'
  );
  // Tamaño de los controles laterales (Ajustes → Tamaño de controles laterales)
  const controlSizeClass = mapSettings.controlsSize === 'large' ? 'w-14 h-14' : 'w-11 h-11';
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [alertOpacityTick, setAlertOpacityTick] = useState<number>(0);

  // Rotation State (autoRotation applies strictly during active navigation) and manual rotation tracking
  const [isHeadingUp, setIsHeadingUp] = useState<boolean>(() => mapSettings.autoRotation);
  const isHeadingUpRef = useRef<boolean>(isHeadingUp);
  isHeadingUpRef.current = isHeadingUp;
  const [mapRotation, setMapRotation] = useState<number>(0);
  const [isManuallyRotated, setIsManuallyRotated] = useState<boolean>(false);
  const isManuallyRotatedRef = useRef<boolean>(false);
  const lastValidHeadingRef = useRef<number>(
    userLocation.heading !== null &&
      userLocation.heading !== undefined &&
      Number.isFinite(userLocation.heading)
      ? ((userLocation.heading % 360) + 360) % 360
      : 0
  );
  // Orientación automática en pantalla principal sin ruta activa (CAMBIO 2)
  const isIdleAutoOrientActiveRef = useRef<boolean>(true);
  const idleCommittedHeadingRef = useRef<number | null>(null);
  const idleStopNorthTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevIdleGpsPosRef = useRef<{ lat: number; lng: number } | null>(null);
  const compassHeadingRef = useRef<number | null>(null);
  const idleBearingAnimRef = useRef<{
    active: boolean;
    startBearing: number;
    targetBearing: number;
    startTime: number;
    durationMs: number;
  }>({
    active: false,
    startBearing: 0,
    targetBearing: 0,
    startTime: 0,
    durationMs: 400,
  });

  const lastHandledOverviewTriggerRef = useRef<number>(0);
  const lastHandledRecenterTriggerRef = useRef<number>(0);
  const prevNavigatingRef = useRef<boolean>(isNavigating);
  const prevHasActiveRouteRef = useRef<boolean>(Boolean(activeRoute || routes.length > 0));

  // Overpass Points of Interest (POIs) state & refs
  const [isOverviewActive, setIsOverviewActive] = useState<boolean>(false);
  const isOverviewActiveRef = useRef<boolean>(false);
  isOverviewActiveRef.current = isOverviewActive;
  const justExitedOverviewUntilRef = useRef<number>(0);
  const overviewSavedLayersRef = useRef<Map<string, OverviewLayerSnapshot>>(new Map());
  const overviewZoomAnchorRef = useRef<number | undefined>(undefined);
  const [selectedPoi, setSelectedPoi] = useState<MapPOI | null>(null);
  const cachedPoisByIdRef = useRef<Map<string, MapPOI>>(new Map());
  const lastPoiSourceSignatureRef = useRef<string>('');
  const poiLayerListenersBoundRef = useRef<boolean>(false);
  const poiFeatureClickedAtRef = useRef<number>(0);
  const poiDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const poiRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const poiAbortControllerRef = useRef<AbortController | null>(null);
  const inFlightPoiBoundsRef = useRef<GeoBounds | null>(null);
  const poiRetryCountRef = useRef<number>(0);

  // Global callbacks for marker popup interactions
  const onConfirmAlertRef = useRef(onConfirmAlert);
  onConfirmAlertRef.current = onConfirmAlert;
  const onRemoveAlertRef = useRef(onRemoveAlert);
  onRemoveAlertRef.current = onRemoveAlert;
  const onToggleAlertBothDirectionsRef = useRef(onToggleAlertBothDirections);
  onToggleAlertBothDirectionsRef.current = onToggleAlertBothDirections;

  useEffect(() => {
    if (!onRegisterCarriagewaySnapper) return;
    onRegisterCarriagewaySnapper((lat, lng, targetHeadingDeg, maxDistMeters = 38) => {
      const map = mapInstanceRef.current;
      if (!map) return null;
      return snapReportPointToRenderedCarriageway(map, lat, lng, targetHeadingDeg, maxDistMeters);
    });
    return () => {
      onRegisterCarriagewaySnapper(null);
    };
  }, [onRegisterCarriagewaySnapper]);
  const onSettingsChangeRef = useRef(onSettingsChange);
  onSettingsChangeRef.current = onSettingsChange;
  const onSettingsOpenChangeRef = useRef(onSettingsOpenChange);
  onSettingsOpenChangeRef.current = onSettingsOpenChange;
  const onAddFixedRadarOpenChangeRef = useRef(onAddFixedRadarOpenChange);
  onAddFixedRadarOpenChangeRef.current = onAddFixedRadarOpenChange;
  const trafficAlertsRef = useRef(trafficAlerts);
  trafficAlertsRef.current = trafficAlerts;
  const onUserExplorationGestureRef = useRef(onUserExplorationGesture || onMapInteraction);
  onUserExplorationGestureRef.current = onUserExplorationGesture || onMapInteraction;
  const onToggleFollowRef = useRef(onToggleFollow);
  onToggleFollowRef.current = onToggleFollow;
  const onRequestLocationRef = useRef(onRequestLocation);
  onRequestLocationRef.current = onRequestLocation;
  const onNavigateToPOIRef = useRef(onNavigateToPOI);
  onNavigateToPOIRef.current = onNavigateToPOI;
  const onPoisUpdatedRef = useRef(onPoisUpdated);
  onPoisUpdatedRef.current = onPoisUpdated;
  const onFixedRadarsUpdatedRef = useRef(onFixedRadarsUpdated);
  onFixedRadarsUpdatedRef.current = onFixedRadarsUpdated;
  const onStartRouteToDestinationRef = useRef(onStartRouteToDestination);
  onStartRouteToDestinationRef.current = onStartRouteToDestination;

  // Radares fijos referenciales & tramos Sutran (state & refs)
  const [fixedRadarsList, setFixedRadarsList] = useState<FixedRadar[]>([]);
  const fixedRadarsListRef = useRef<FixedRadar[]>([]);
  fixedRadarsListRef.current = fixedRadarsList;
  const [selectedFixedRadar, setSelectedFixedRadar] = useState<FixedRadar | null>(null);
  const [selectedCommunityAlert, setSelectedCommunityAlert] = useState<TrafficAlert | null>(null);
  const [isCommunityAlertClosing, setIsCommunityAlertClosing] = useState<boolean>(false);
  const isCommunityAlertClosingRef = useRef<boolean>(false);
  const communityAlertCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [draggingRadarId, setDraggingRadarId] = useState<string | null>(null);
  const draggingRadarIdRef = useRef<string | null>(null);
  draggingRadarIdRef.current = draggingRadarId;
  const [draggedRadarCoords, setDraggedRadarCoords] = useState<Coordinates | null>(null);
  const [isAddFixedRadarOpen, setIsAddFixedRadarOpen] = useState<boolean>(false);
  const [isPickingRadarLocation, setIsPickingRadarLocation] = useState<boolean>(false);
  const isPickingRadarLocationRef = useRef<boolean>(false);
  isPickingRadarLocationRef.current = isPickingRadarLocation;
  const [pickedRadarCoords, setPickedRadarCoords] = useState<{
    lat: number;
    lng: number;
    seq: number;
  } | null>(null);
  const confirmRadarPickAtCoords = useCallback((lat: number, lng: number) => {
    setPickedRadarCoords((prev) => ({
      lat,
      lng,
      seq: (prev?.seq ?? 0) + 1,
    }));
    setIsPickingRadarLocation(false);
  }, []);
  const confirmRadarPickAtCoordsRef = useRef(confirmRadarPickAtCoords);
  confirmRadarPickAtCoordsRef.current = confirmRadarPickAtCoords;
  const [radarActionFeedback, setRadarActionFeedback] = useState<string | null>(null);
  const fixedRadarMarkersRef = useRef<maplibregl.Marker[]>([]);
  const fixedRadarStripListenersBoundRef = useRef<boolean>(false);

  useEffect(() => {
    onAddFixedRadarOpenChangeRef.current?.(isAddFixedRadarOpen);
    if (!isAddFixedRadarOpen) {
      setIsPickingRadarLocation(false);
    }
  }, [isAddFixedRadarOpen]);

  // Presión larga sobre el mapa (marcador temporal + ventanita "Ruta" / "Compartir")
  const [longPressPoint, setLongPressPoint] = useState<LongPressPointState | null>(null);
  const [longPressScreenPos, setLongPressScreenPos] = useState<{ x: number; y: number } | null>(null);
  const [shareCopiedToast, setShareCopiedToast] = useState<boolean>(false);
  const longPressMarkerRef = useRef<maplibregl.Marker | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressReverseAbortRef = useRef<AbortController | null>(null);
  const justTriggeredLongPressRef = useRef<boolean>(false);
  const hasPushedLongPressHistoryRef = useRef<boolean>(false);
  const ignoringLongPressPopstateRef = useRef<boolean>(false);
  const isAnyOverlayOpenRef = useRef<boolean>(false);
  isAnyOverlayOpenRef.current = Boolean(
    isOverlayModalOpen || isSettingsOpen || isAddFixedRadarOpen
  );

  // Mantener una sola ventanita abierta a la vez y cerrarla al tocar fuera sobre el mapa
  useEffect(() => {
    if (selectedPoi && !isOverviewActive) {
      notifySmallOverlayOpen('poi_card', () => setSelectedPoi(null));
    } else {
      notifySmallOverlayClose('poi_card');
    }
    return () => {
      notifySmallOverlayClose('poi_card');
    };
  }, [selectedPoi, isOverviewActive]);

  useEffect(() => {
    if (selectedFixedRadar) {
      notifySmallOverlayOpen('radar_card', () => {
        setDraggingRadarId(null);
        setDraggedRadarCoords(null);
        setRadarActionFeedback(null);
        setSelectedFixedRadar(null);
      });
    } else {
      notifySmallOverlayClose('radar_card');
    }
    return () => {
      notifySmallOverlayClose('radar_card');
    };
  }, [selectedFixedRadar]);

  const closeCommunityAlertImmediate = useCallback(() => {
    if (communityAlertCloseTimerRef.current) {
      clearTimeout(communityAlertCloseTimerRef.current);
      communityAlertCloseTimerRef.current = null;
    }
    isCommunityAlertClosingRef.current = false;
    setIsCommunityAlertClosing(false);
    setSelectedCommunityAlert(null);
  }, []);

  const closeCommunityAlertSmooth = useCallback(() => {
    if (communityAlertCloseTimerRef.current) {
      clearTimeout(communityAlertCloseTimerRef.current);
    }
    isCommunityAlertClosingRef.current = true;
    setIsCommunityAlertClosing(true);
    communityAlertCloseTimerRef.current = setTimeout(() => {
      communityAlertCloseTimerRef.current = null;
      isCommunityAlertClosingRef.current = false;
      setIsCommunityAlertClosing(false);
      setSelectedCommunityAlert(null);
    }, 150);
  }, []);

  const openCommunityAlertCard = useCallback((alert: TrafficAlert) => {
    if (communityAlertCloseTimerRef.current) {
      clearTimeout(communityAlertCloseTimerRef.current);
      communityAlertCloseTimerRef.current = null;
    }
    isCommunityAlertClosingRef.current = false;
    setIsCommunityAlertClosing(false);
    setSelectedCommunityAlert(alert);
  }, []);

  useEffect(() => {
    return () => {
      if (communityAlertCloseTimerRef.current) {
        clearTimeout(communityAlertCloseTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (selectedCommunityAlert) {
      notifySmallOverlayOpen('alert_popup', closeCommunityAlertImmediate);
    } else {
      notifySmallOverlayClose('alert_popup');
    }
    return () => {
      notifySmallOverlayClose('alert_popup');
    };
  }, [selectedCommunityAlert, closeCommunityAlertImmediate]);

  useEffect(() => {
    if (longPressPoint && !isNavigating) {
      notifySmallOverlayOpen('long_press', () => dismissLongPressRef.current());
    } else {
      notifySmallOverlayClose('long_press');
    }
    return () => {
      notifySmallOverlayClose('long_press');
    };
  }, [longPressPoint, isNavigating]);

  const beginProgrammaticCameraLock = useCallback((map: maplibregl.Map, durationMs = 400) => {
    if (programmaticCameraTimerRef.current) {
      clearTimeout(programmaticCameraTimerRef.current);
      programmaticCameraTimerRef.current = null;
    }
    isProgrammaticCameraRef.current = true;
    const clearCamLock = () => {
      map.off('moveend', clearCamLock);
      if (programmaticCameraTimerRef.current) {
        clearTimeout(programmaticCameraTimerRef.current);
        programmaticCameraTimerRef.current = null;
      }
      isProgrammaticCameraRef.current = false;
    };
    map.once('moveend', clearCamLock);
    programmaticCameraTimerRef.current = setTimeout(clearCamLock, Math.max(250, durationMs + 120));
  }, []);

  useEffect(() => {
    onSettingsChangeRef.current?.(mapSettings);
  }, [mapSettings]);

  useEffect(() => {
    onSettingsOpenChangeRef.current?.(isSettingsOpen);
  }, [isSettingsOpen]);

  // Refrescar opacidad de marcadores de inspectores cada 60 segundos
  useEffect(() => {
    const hasInspectors = trafficAlerts.some((a) => a.type === 'inspectors');
    if (!hasInspectors) return;
    const interval = setInterval(() => {
      setAlertOpacityTick((t) => t + 1);
    }, 60000);
    return () => clearInterval(interval);
  }, [trafficAlerts]);

  // Center map on specific coordinates (e.g. tapping an inspector item in LiveInspectorsModal)
  const lastHandledFocusSeqRef = useRef<number>(0);
  useEffect(() => {
    if (
      !focusCoordsTrigger ||
      focusCoordsTrigger.seq === lastHandledFocusSeqRef.current ||
      !mapInstanceRef.current ||
      (!isNavigatingRef.current && hasAnyRoutesRef.current)
    ) {
      return;
    }
    lastHandledFocusSeqRef.current = focusCoordsTrigger.seq;
    const map = mapInstanceRef.current;

    clearAutoFollowPauseRef.current();
    onToggleFollowRef.current(false);
    isManuallyRotatedRef.current = false;
    setIsManuallyRotated(false);
    setMapRotation(0);
    isProgrammaticMoveRef.current = true;
    map.stop();
    beginProgrammaticCameraLock(map, 750);

    const targetPitch =
      !isNavigatingRef.current &&
      !hasAnyRoutesRef.current &&
      mapSettingsRef.current.perspective3D &&
      !flatFallbackActiveRef.current
        ? getEffectiveIdlePitch()
        : 0;

    try {
      map.flyTo({
        center: [focusCoordsTrigger.lng, focusCoordsTrigger.lat],
        zoom: focusCoordsTrigger.zoom ?? 17,
        pitch: targetPitch,
        bearing: 0,
        padding: { top: 0, bottom: 0, left: 0, right: 0 },
        duration: 700,
      });
    } catch {}

    const timer = setTimeout(() => {
      isProgrammaticMoveRef.current = false;
    }, 800);
    return () => clearTimeout(timer);
  }, [focusCoordsTrigger, beginProgrammaticCameraLock]);

  // Update settings callback
  const handleUpdateSettings = useCallback(
    (partial: Partial<MapSettingsData>) => {
      setMapSettings((prev) => {
        const updated = { ...prev, ...partial };
        try {
          localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(updated));
        } catch (err) {
          console.warn('Error saving map settings to localStorage', err);
        }
        return updated;
      });

      if (partial.tileMode !== undefined && partial.tileMode !== mapTileMode) {
        onTileModeChange(partial.tileMode);
      }
      if (partial.autoRotation !== undefined) {
        setIsHeadingUp(partial.autoRotation);
      }
      if (partial.autoFollowGPS !== undefined) {
        clearAutoFollowPauseRef.current();
        onToggleFollow(partial.autoFollowGPS);
      }
      if (partial.voiceEnabled !== undefined) {
        voiceGuidance.setMuted(!partial.voiceEnabled);
      }
      if (partial.voiceVolume !== undefined) {
        voiceGuidance.setVolume(partial.voiceVolume);
      }
      if (partial.rerouteSoundEnabled !== undefined) {
        voiceGuidance.setRerouteSoundEnabled(partial.rerouteSoundEnabled);
      }
    },
    [mapTileMode, onTileModeChange, onToggleFollow]
  );

  const getEffectiveNavPitch = useCallback((): number => {
    if (flatFallbackActiveRef.current || !mapSettingsRef.current.perspective3D) return 0;
    return NAV_PITCH_DEGREES;
  }, []);

  const getEffectiveIdlePitch = useCallback((): number => {
    if (flatFallbackActiveRef.current || !mapSettingsRef.current.perspective3D) return 0;
    return INCLINACION_PANTALLA_PRINCIPAL;
  }, []);

  const applyPitchGesturePolicy = useCallback(
    (map: maplibregl.Map, opts?: { unlockingForTransition?: boolean }) => {
      const isNav = isNavigatingRef.current;
      const isOverview = isOverviewActiveRef.current;
      const hasRoutes = hasAnyRoutesRef.current;
      const flatFallback = flatFallbackActiveRef.current;
      const p3d = mapSettingsRef.current.perspective3D;
      const isManualCameraFree = Boolean(
        isAutoFollowPausedRef.current && (isNav || !hasRoutes) && !isOverview
      );

      try {
        map.dragPan.enable();
        map.scrollZoom.enable();
        map.touchZoomRotate.enable();

        if (isManualCameraFree) {
          map.dragRotate.enable();
          map.touchZoomRotate.enableRotation();
          if (!flatFallback) {
            map.touchPitch.enable();
          } else {
            map.touchPitch.disable();
          }
          const dragRotateAny = map.dragRotate as any;
          if (dragRotateAny) {
            dragRotateAny._pitchWithRotate = Boolean(!flatFallback);
            if (dragRotateAny._mousePitch) {
              if (!flatFallback && map.dragRotate.isEnabled()) {
                dragRotateAny._mousePitch.enable();
              } else {
                dragRotateAny._mousePitch.disable();
              }
            }
          }
        } else {
          if (isNav && p3d && !flatFallback && !isOverview) {
            map.touchPitch.enable();
          } else {
            map.touchPitch.disable();
          }
          const dragRotateAny = map.dragRotate as any;
          if (dragRotateAny) {
            dragRotateAny._pitchWithRotate = Boolean(isNav && p3d && !flatFallback && !isOverview);
            if (dragRotateAny._mousePitch) {
              if (dragRotateAny._pitchWithRotate && map.dragRotate.isEnabled()) {
                dragRotateAny._mousePitch.enable();
              } else {
                dragRotateAny._mousePitch.disable();
              }
            }
          }
          if (!isNav && hasRoutes && !isOverview) {
            map.dragRotate.disable();
            map.touchZoomRotate.disableRotation();
          } else {
            map.dragRotate.enable();
            map.touchZoomRotate.enableRotation();
          }
        }
      } catch {}

      try {
        if (!isNav && !hasRoutes && !isOverview) {
          map.setMinZoom(12);
          map.setMaxZoom(19.5);
        } else if (!isNav && hasRoutes && !isOverview) {
          map.setMinZoom(8);
          map.setMaxZoom(19);
        } else {
          map.setMinZoom(11);
          map.setMaxZoom(19);
        }
      } catch {}

      try {
        if (opts?.unlockingForTransition || isManualCameraFree || isNav || isOverview) {
          map.setMinPitch(0);
          map.setMaxPitch(flatFallback ? 0 : 60);
        } else if (hasRoutes) {
          map.setMinPitch(0);
          map.setMaxPitch(0);
        } else if (p3d && !flatFallback) {
          const targetIdlePitch = getEffectiveIdlePitch();
          map.setMinPitch(targetIdlePitch);
          map.setMaxPitch(targetIdlePitch);
        } else {
          map.setMinPitch(0);
          map.setMaxPitch(0);
        }
      } catch {}
    },
    [getEffectiveIdlePitch]
  );

  const clearAutoFollowPause = useCallback(() => {
    if (autoFollowPauseTimerRef.current) {
      clearTimeout(autoFollowPauseTimerRef.current);
      autoFollowPauseTimerRef.current = null;
    }
    shouldResumeFollowAfterPauseRef.current = false;
    autoFollowPauseUntilRef.current = 0;
    lastPauseTimerRefreshRef.current = 0;
    if (isAutoFollowPausedRef.current) {
      isAutoFollowPausedRef.current = false;
      setIsAutoFollowPaused(false);
    }
    const map = mapInstanceRef.current;
    if (map && !isProgrammaticMoveRef.current) {
      applyPitchGesturePolicy(map);
    }
  }, [applyPitchGesturePolicy]);

  const scheduleAutoFollowPauseExpiration = useCallback(
    (delayMs: number) => {
      if (autoFollowPauseTimerRef.current) {
        clearTimeout(autoFollowPauseTimerRef.current);
        autoFollowPauseTimerRef.current = null;
      }
      autoFollowPauseTimerRef.current = setTimeout(() => {
        autoFollowPauseTimerRef.current = null;
        const now = performance.now();
        if (isUserTouchingMapRef.current) {
          autoFollowPauseUntilRef.current = now + AUTO_FOLLOW_PAUSE_MS;
          scheduleAutoFollowPauseExpiration(AUTO_FOLLOW_PAUSE_MS);
          return;
        }
        const remaining = autoFollowPauseUntilRef.current - now;
        if (remaining > 50) {
          scheduleAutoFollowPauseExpiration(Math.ceil(remaining));
          return;
        }

        isAutoFollowPausedRef.current = false;
        autoFollowPauseUntilRef.current = 0;
        lastPauseTimerRefreshRef.current = 0;
        setIsAutoFollowPaused(false);

        const canResumeFollow = Boolean(
          shouldResumeFollowAfterPauseRef.current &&
            !isOverviewActiveRef.current &&
            !isPickingRadarLocationRef.current &&
            (isNavigatingRef.current || !hasAnyRoutesRef.current)
        );
        shouldResumeFollowAfterPauseRef.current = false;

        if (canResumeFollow) {
          isIdleAutoOrientActiveRef.current = true;
          if (!isFollowingRef.current) {
            onToggleFollowRef.current(true);
          }
        }
        const map = mapInstanceRef.current;
        if (map && !isProgrammaticMoveRef.current) {
          applyPitchGesturePolicy(map);
        }
      }, Math.max(50, delayMs));
    },
    [applyPitchGesturePolicy]
  );

  // Activa o extiende la pausa de auto-seguimiento por 15 segundos y libera totalmente la cámara manual
  const pauseAutoFollowForUserInteraction = useCallback(
    (opts?: { fromTouchMove?: boolean }) => {
      const now = performance.now();
      const wasPaused = isAutoFollowPausedRef.current;

      if (
        !wasPaused &&
        isFollowingRef.current &&
        !isOverviewActiveRef.current &&
        !isPickingRadarLocationRef.current &&
        (isNavigatingRef.current || !hasAnyRoutesRef.current)
      ) {
        shouldResumeFollowAfterPauseRef.current = true;
      }

      isAutoFollowPausedRef.current = true;
      autoFollowPauseUntilRef.current = now + AUTO_FOLLOW_PAUSE_MS;
      cameraNeedsImmediateSnapRef.current = false;
      idleBearingAnimRef.current.active = false;
      pendingRecenterRef.current = false;

      if (!wasPaused) {
        setIsAutoFollowPaused(true);
      }

      const map = mapInstanceRef.current;
      const hadProgrammaticTransition = Boolean(
        isProgrammaticMoveRef.current ||
          isProgrammaticCameraRef.current ||
          isAtomicRecenterInFlightRef.current
      );
      if (hadProgrammaticTransition) {
        isProgrammaticMoveRef.current = false;
        isProgrammaticCameraRef.current = false;
        isAtomicRecenterInFlightRef.current = false;
        if (programmaticClearTimerRef.current) {
          clearTimeout(programmaticClearTimerRef.current);
          programmaticClearTimerRef.current = null;
        }
        if (programmaticCameraTimerRef.current) {
          clearTimeout(programmaticCameraTimerRef.current);
          programmaticCameraTimerRef.current = null;
        }
        if (recenterWaitTimerRef.current) {
          clearTimeout(recenterWaitTimerRef.current);
          recenterWaitTimerRef.current = null;
        }
        if (map) {
          try {
            map.stop();
          } catch {}
        }
      }

      if (map && !wasPaused) {
        applyPitchGesturePolicy(map);
      }

      if (
        !opts?.fromTouchMove ||
        !autoFollowPauseTimerRef.current ||
        now - lastPauseTimerRefreshRef.current >= 250
      ) {
        lastPauseTimerRefreshRef.current = now;
        scheduleAutoFollowPauseExpiration(AUTO_FOLLOW_PAUSE_MS);
      }
    },
    [applyPitchGesturePolicy, scheduleAutoFollowPauseExpiration]
  );

  pauseAutoFollowRef.current = pauseAutoFollowForUserInteraction;
  clearAutoFollowPauseRef.current = clearAutoFollowPause;

  const activateFlatFallback = useCallback((map?: maplibregl.Map | null) => {
    const wasAlreadyFlat = flatFallbackActiveRef.current;
    flatFallbackActiveRef.current = true;

    if (map) {
      try {
        map.setMinPitch(0);
        map.setMaxPitch(0);
        map.touchPitch.disable();
        map.jumpTo({
          center: map.getCenter(),
          zoom: map.getZoom(),
          bearing: map.getBearing(),
          pitch: 0,
          padding: { top: 0, bottom: 0, left: 0, right: 0 },
        });
        map.resize();
        map.triggerRepaint();
      } catch {}
    }

    if (!wasAlreadyFlat) {
      const noticeText = 'Vista 3D no disponible; usando mapa plano.';
      logSystemNotice(noticeText, 'Respaldo a mapa plano 2D (pitchFallbackNotice)');
      setPitchFallbackNotice(noticeText);
      if (pitchFallbackTimerRef.current) {
        clearTimeout(pitchFallbackTimerRef.current);
      }
      pitchFallbackTimerRef.current = setTimeout(() => {
        pitchFallbackTimerRef.current = null;
        setPitchFallbackNotice(null);
      }, 4000);
    }
  }, []);

  const verifyPitchedRender = useCallback(
    (map: maplibregl.Map) => {
      requestAnimationFrame(() => {
        if (!mapInstanceRef.current || flatFallbackActiveRef.current) return;
        try {
          const canvas = map.getCanvas();
          if (!canvas || canvas.width === 0 || canvas.height === 0) return;
          const gl =
            (canvas.getContext('webgl2') as WebGL2RenderingContext | null) ||
            (canvas.getContext('webgl') as WebGLRenderingContext | null);
          if (gl?.isContextLost?.() || !Number.isFinite(map.getPitch())) {
            activateFlatFallback(map);
          }
        } catch {
          activateFlatFallback(map);
        }
      });
    },
    [activateFlatFallback]
  );

  const getSmoothedZoomSpeed = useCallback((speedKmh: number): number => {
    const now = performance.now();
    const st = smoothedZoomSpeedRef.current;
    const v = Number.isFinite(speedKmh) ? Math.max(0, speedKmh) : 0;
    if (st.at === 0 || now - st.at > 15000) {
      smoothedZoomSpeedRef.current = { value: v, at: now };
      return v;
    }
    const dtSec = Math.max(0, (now - st.at) / 1000);
    const alpha = 1 - Math.exp(-dtSec / 4);
    const next = st.value + (v - st.value) * alpha;
    smoothedZoomSpeedRef.current = { value: next, at: now };
    return next;
  }, []);

  // Zoom dinámico durante la navegación: según velocidad (18.0 detenido → 15.0 a 100 km/h)
  // y acercamiento a 18.0 al estar a menos de 200 m del giro (pleno a ≤150 m).
  const calculateSmartZoom = useCallback(
    (distToTurn: number, currentSpeed: number): number => {
      if (!isNavigatingRef.current) return 16;
      return computeNavSmartZoom(
        distToTurn,
        getSmoothedZoomSpeed(currentSpeed),
        mapSettingsRef.current.smartZoom
      );
    },
    [getSmoothedZoomSpeed]
  );

  // Zoom dinámico antes de navegar (pantalla principal siguiendo tu ubicación): solo por velocidad
  const calculateIdleZoom = useCallback(
    (currentSpeed: number): number => {
      if (!mapSettingsRef.current.smartZoom) return ZOOM_PANTALLA_PRINCIPAL;
      return speedToZoom(getSmoothedZoomSpeed(currentSpeed));
    },
    [getSmoothedZoomSpeed]
  );

  // Resolve a guaranteed valid bearing (0..360), preserving last valid heading when stopped
  const resolveValidBearing = useCallback(
    (loc: GPSLocation, route: RouteData | null, currentSpeedKmh: number): number => {
      const { bearing, nextLastValidHeading } = resolveNavigationBearing(
        isNavigatingRef.current,
        loc,
        route,
        currentSpeedKmh,
        lastValidHeadingRef.current
      );
      lastValidHeadingRef.current = nextLastValidHeading;
      return bearing;
    },
    []
  );

  // Con Perspectiva 3D activada, posiciona al vehículo más abajo para ver mayor tramo de calle por delante
  const computeLowerThirdPadding = useCallback(
    (containerHeight?: number): maplibregl.PaddingOptions =>
      computeLowerThirdPaddingValues(containerHeight, mapSettingsRef.current.perspective3D),
    []
  );

  // En pantalla principal sin ruta activa, ubica la flecha en POSICION_FLECHA_ABAJO (1/4 desde abajo)
  const computeIdleArrowPadding = useCallback(
    (containerHeight?: number): maplibregl.PaddingOptions =>
      computeIdleArrowPaddingValues(containerHeight),
    []
  );

  const getLowerThirdPadding = useCallback(
    (map: maplibregl.Map): maplibregl.PaddingOptions => {
      if (isNavigatingRef.current) {
        return computeLowerThirdPadding(map.getContainer().clientHeight);
      }
      const isTiltedIdleTracking =
        !hasAnyRoutesRef.current &&
        isFollowingRef.current &&
        mapSettingsRef.current.perspective3D &&
        !flatFallbackActiveRef.current;
      if (!isTiltedIdleTracking) {
        return { top: 0, bottom: 0, left: 0, right: 0 };
      }
      return computeIdleArrowPadding(map.getContainer().clientHeight);
    },
    [computeLowerThirdPadding, computeIdleArrowPadding]
  );

  // Ensure route GeoJSON sources & layers exist on the current style
  const ensureRouteLayers = useCallback((map: maplibregl.Map) => {
    return ensureRouteAndOverlayLayers(map, {
      mapTileMode: mapTileModeRef.current,
      isOverviewActive: () => isOverviewActiveRef.current,
      isPickingRadarLocation: () => isPickingRadarLocationRef.current,
      isNavigating: () => isNavigatingRef.current,
      getManeuverGeoJson: () => maneuverGeoJsonRef.current,
      getFixedRadarsList: () => fixedRadarsListRef.current,
      getActiveRouteId: () => activeRouteRef.current?.id,
      getRoutes: () => routesRef.current,
      isFixedRadarStripListenersBound: () => fixedRadarStripListenersBoundRef.current,
      markFixedRadarStripListenersBound: () => {
        fixedRadarStripListenersBoundRef.current = true;
      },
      onFixedRadarStripClick: (found) => {
        dismissLongPressRef.current();
        setSelectedPoi(null);
        setDraggingRadarId(null);
        setDraggedRadarCoords(null);
        setRadarActionFeedback(null);
        setSelectedFixedRadar(found);
      },
      onPreviewRouteLineClick: (found) => {
        routeLineClickedAtRef.current = performance.now();
        handleUserPreviewRouteTapRef.current(found);
      },
    });
  }, []);

  const syncDestCollisionBlocker = useCallback((map: maplibregl.Map, coords: Coordinates | null) => {
    updateDestCollisionBlockerSource(map, coords);
  }, []);

  // Push active or preview route geometry into MapLibre GeoJSON sources
  const syncRouteDataToMap = useCallback(
    (map: maplibregl.Map) => {
      if (!ensureRouteLayers(map)) return;
      updateRouteGeoJsonSources(map, {
        isOverviewActive: isOverviewActiveRef.current,
        isNavigating: isNavigatingRef.current,
        mapTileMode: mapTileModeRef.current,
        destinationCoords: destinationCoordsRef.current,
        activeRoute: activeRouteRef.current,
        routes: routesRef.current,
        userLocation: userLocationRef.current,
        onClearManeuverGeoJson: () => {
          maneuverGeoJsonRef.current = EMPTY_MANEUVER_FC;
        },
      });
    },
    [ensureRouteLayers]
  );

  // Perform the single atomic camera placement for "Volver a centrar"
  const performAtomicJump = useCallback(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    pendingRecenterRef.current = false;
    if (recenterWaitTimerRef.current) {
      clearTimeout(recenterWaitTimerRef.current);
      recenterWaitTimerRef.current = null;
    }
    if (programmaticClearTimerRef.current) {
      clearTimeout(programmaticClearTimerRef.current);
      programmaticClearTimerRef.current = null;
    }

    const loc = userLocationRef.current;
    const route = activeRouteRef.current;
    const speed = speedKmhRef.current;
    const distTurn = distanceToNextStepRef.current;

    const validBearing = resolveValidBearing(loc, route, speed);
    const navZoom = isNavigatingRef.current
      ? calculateSmartZoom(distTurn, speed)
      : calculateIdleZoom(speed);
    let idleRecenterBearing = 0;
    if (!isNavigatingRef.current && !route && isIdleAutoOrientActiveRef.current && speed > 5) {
      let cand: number | null = null;
      if (loc.heading !== null && loc.heading !== undefined && Number.isFinite(loc.heading) && loc.heading !== 0) {
        cand = ((loc.heading % 360) + 360) % 360;
      } else if (compassHeadingRef.current !== null) {
        cand = compassHeadingRef.current;
      }
      if (cand !== null) {
        idleCommittedHeadingRef.current = cand;
        idleRecenterBearing = cand;
      } else if (idleCommittedHeadingRef.current !== null) {
        idleRecenterBearing = idleCommittedHeadingRef.current;
      }
    }
    const navBearing = isNavigatingRef.current
      ? mapSettingsRef.current.autoRotation
        ? validBearing
        : 0
      : idleRecenterBearing;
    const navPitch = isNavigatingRef.current
      ? getEffectiveNavPitch()
      : !route
      ? getEffectiveIdlePitch()
      : 0;
    const navPadding = getLowerThirdPadding(map);

    if (isNavigatingRef.current) {
      map.setMinZoom(11);
      map.setMaxZoom(19);
      map.setMaxPitch(60);
      try {
        map.touchPitch.enable();
      } catch {}
    }

    let targetLat = loc.lat;
    let targetLng = loc.lng;
    let targetArrowBearing =
      !isNavigatingRef.current && !route && idleRecenterBearing !== 0
        ? idleRecenterBearing
        : validBearing;

    if (isNavigatingRef.current && route && route.coordinates.length >= 2) {
      const match = snapToActiveRoute(
        loc.lat,
        loc.lng,
        loc.heading,
        route.coordinates,
        ACTIVE_ROUTE_SNAP_MAX_METERS
      );
      targetLat = match.arrowPoint[0];
      targetLng = match.arrowPoint[1];
      targetArrowBearing = Number.isFinite(match.arrowBearing)
        ? ((match.arrowBearing % 360) + 360) % 360
        : validBearing;
    }

    isProgrammaticMoveRef.current = true;
    isAtomicRecenterInFlightRef.current = true;
    beginProgrammaticCameraLock(map, 200);
    map.stop();

    let flagsCleared = false;
    const clearFlags = () => {
      if (flagsCleared) return;
      flagsCleared = true;
      if (programmaticClearTimerRef.current) {
        clearTimeout(programmaticClearTimerRef.current);
        programmaticClearTimerRef.current = null;
      }
      map.off('moveend', onMoveEnd);
      isProgrammaticMoveRef.current = false;
      isAtomicRecenterInFlightRef.current = false;
    };
    const onMoveEnd = () => {
      setTimeout(clearFlags, 80);
    };

    map.once('moveend', onMoveEnd);
    programmaticClearTimerRef.current = setTimeout(clearFlags, 1000);

    // Single atomic operation: center + zoom (nav 300-500m / 16 idle) + bearing + 55° pitch + lower-third offset
    map.resize();
    try {
      map.jumpTo({
        center: [targetLng, targetLat],
        zoom: navZoom,
        bearing: navBearing,
        pitch: navPitch,
        padding: navPadding,
      });
      if (!isNavigatingRef.current) {
        const speedMps = Math.max(0, speed / 3.6);
        const roadProj = projectArrowOntoRoadSurface(
          map,
          loc.lat,
          loc.lng,
          targetArrowBearing,
          speedMps > FREE_DRIVE_MIN_MOVING_SPEED_MPS || targetArrowBearing !== 0,
          speedMps
        );
        idleRoadSegmentRef.current = roadProj.segment;
        if (roadProj.projected) {
          targetLat = roadProj.point[0];
          targetLng = roadProj.point[1];
          if (speedMps > FREE_DRIVE_MIN_MOVING_SPEED_MPS && roadProj.roadBearing !== null) {
            targetArrowBearing = roadProj.roadBearing;
          }
          if (getDistanceMeters(loc.lat, loc.lng, targetLat, targetLng) > 0.5) {
            map.jumpTo({
              center: [targetLng, targetLat],
              zoom: navZoom,
              bearing: navBearing,
              pitch: navPitch,
              padding: navPadding,
            });
          }
        }
      }
      if (navPitch > 0) {
        verifyPitchedRender(map);
      }
    } catch {
      activateFlatFallback(map);
    }
    map.resize();

    isManuallyRotatedRef.current = false;
    setIsManuallyRotated(false);
    setMapRotation(navBearing);

    // Synchronize arrow marker position, animation origins and rotation in the exact same frame
    currentMarkerPosRef.current = [targetLat, targetLng];
    targetMarkerPosRef.current = [targetLat, targetLng];
    posAnimStartRef.current = [targetLat, targetLng];
    posAnimEndRef.current = [targetLat, targetLng];
    posAnimStartTimeRef.current = performance.now();
    lastGpsFixPerfTimeRef.current = null;
    currentMarkerAngleRef.current = targetArrowBearing;
    targetMarkerAngleRef.current = targetArrowBearing;
    committedTargetAngleRef.current = targetArrowBearing;
    rotAnimStartAngleRef.current = targetArrowBearing;
    rotAnimDeltaDegRef.current = 0;
    followCamTargetZoomRef.current = navZoom;
    followCamTargetBearingRef.current = navBearing;
    followCamTargetPitchRef.current = navPitch;
    followCamTargetPaddingRef.current = navPadding;

    if (userMarkerRef.current) {
      userMarkerRef.current.setLngLat([targetLng, targetLat]);
      userMarkerRef.current.setRotation(targetArrowBearing);
    }
  }, [
    calculateSmartZoom,
    calculateIdleZoom,
    getLowerThirdPadding,
    resolveValidBearing,
    beginProgrammaticCameraLock,
    getEffectiveNavPitch,
    getEffectiveIdlePitch,
    activateFlatFallback,
    verifyPitchedRender,
  ]);

  // Execute atomic recenter immediately once initial style is ready (never stall on isStyleLoaded/areTilesLoaded)
  const executeAtomicRecenter = useCallback(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (recenterWaitTimerRef.current) {
      clearTimeout(recenterWaitTimerRef.current);
      recenterWaitTimerRef.current = null;
    }

    // Only defer if initial style hasn't finished its first load yet, with a 1s max safety cap
    if (!isMapStyleReadyRef.current) {
      pendingRecenterRef.current = true;
      isProgrammaticMoveRef.current = true;
      isAtomicRecenterInFlightRef.current = true;

      recenterWaitTimerRef.current = setTimeout(() => {
        recenterWaitTimerRef.current = null;
        if (pendingRecenterRef.current) {
          pendingRecenterRef.current = false;
          performAtomicJump();
        } else {
          isProgrammaticMoveRef.current = false;
          isAtomicRecenterInFlightRef.current = false;
        }
      }, 1000);
      return;
    }

    performAtomicJump();
  }, [performAtomicJump]);

  // Resolver rumbo en pantalla principal sin ruta: mantiene último rumbo si detenido/< 5 km/h y gira suave al avanzar
  const resolveIdleTrackingBearing = useCallback(
    (loc: GPSLocation, currentSpeedKmh: number): number => {
      if (
        !mapSettingsRef.current.perspective3D ||
        flatFallbackActiveRef.current ||
        !mapSettingsRef.current.autoRotation
      ) {
        return 0;
      }
      if (currentSpeedKmh > 5) {
        let candidateHeading: number | null = null;
        if (
          loc.heading !== null &&
          loc.heading !== undefined &&
          Number.isFinite(loc.heading) &&
          loc.heading !== 0
        ) {
          candidateHeading = normalizeHeadingDeg(loc.heading);
        } else if (compassHeadingRef.current !== null) {
          candidateHeading = compassHeadingRef.current;
        }
        if (candidateHeading !== null) {
          if (
            idleCommittedHeadingRef.current === null ||
            Math.abs(shortestAngleDiffDeg(idleCommittedHeadingRef.current, candidateHeading)) >= 10
          ) {
            idleCommittedHeadingRef.current = candidateHeading;
          }
        }
      }
      return idleCommittedHeadingRef.current ?? 0;
    },
    []
  );

  // Vuelve suavemente (~500 ms) a la vista inclinada de seguimiento en pantalla principal y reactiva seguimiento automático
  const returnToIdleTrackingView = useCallback(
    (durationMs: number = 500) => {
      const map = mapInstanceRef.current;
      if (!map || isNavigatingRef.current || hasAnyRoutesRef.current) return;

      if (idlePitchLockTimerRef.current) {
        clearTimeout(idlePitchLockTimerRef.current);
        idlePitchLockTimerRef.current = null;
      }

      onToggleFollowRef.current(true);
      isManuallyRotatedRef.current = false;
      setIsManuallyRotated(false);
      isIdleAutoOrientActiveRef.current = true;
      idleBearingAnimRef.current.active = false;

      const loc = userLocationRef.current;
      const speed = speedKmhRef.current;
      const useTiltedIdle =
        !hasAnyRoutesRef.current &&
        mapSettingsRef.current.perspective3D &&
        !flatFallbackActiveRef.current;

      const targetZoom = calculateIdleZoom(speed);
      const targetPitch = useTiltedIdle ? getEffectiveIdlePitch() : 0;
      const targetPadding = useTiltedIdle
        ? computeIdleArrowPadding(map.getContainer().clientHeight)
        : { top: 0, bottom: 0, left: 0, right: 0 };
      const targetBearing = useTiltedIdle ? resolveIdleTrackingBearing(loc, speed) : 0;

      let currentPitch = 0;
      try {
        currentPitch = map.getPitch();
      } catch {}
      const needsPitchTransition = Math.abs(currentPitch - targetPitch) > 0.5;
      if (needsPitchTransition) {
        applyPitchGesturePolicy(map, { unlockingForTransition: true });
      } else {
        applyPitchGesturePolicy(map);
      }

      isProgrammaticMoveRef.current = true;
      isAtomicRecenterInFlightRef.current = true;
      beginProgrammaticCameraLock(map, durationMs + 70);
      map.stop();

      let flagsCleared = false;
      const clearFlags = () => {
        if (flagsCleared) return;
        flagsCleared = true;
        map.off('moveend', onMoveEnd);
        if (programmaticClearTimerRef.current) {
          clearTimeout(programmaticClearTimerRef.current);
          programmaticClearTimerRef.current = null;
        }
        isProgrammaticMoveRef.current = false;
        isAtomicRecenterInFlightRef.current = false;
        applyPitchGesturePolicy(map);
      };
      const onMoveEnd = () => clearFlags();
      map.once('moveend', onMoveEnd);
      if (programmaticClearTimerRef.current) {
        clearTimeout(programmaticClearTimerRef.current);
      }
      programmaticClearTimerRef.current = setTimeout(clearFlags, durationMs + 100);

      followCamTargetZoomRef.current = targetZoom;
      followCamTargetBearingRef.current = targetBearing;
      followCamTargetPitchRef.current = targetPitch;
      followCamTargetPaddingRef.current = targetPadding;
      setMapRotation(targetBearing);

      const idleSpeedMps = Math.max(0, speed / 3.6);
      const idleRoadProj = projectArrowOntoRoadSurface(
        map,
        loc.lat,
        loc.lng,
        targetBearing,
        idleSpeedMps > FREE_DRIVE_MIN_MOVING_SPEED_MPS || targetBearing !== 0,
        idleSpeedMps
      );
      idleRoadSegmentRef.current = idleRoadProj.segment;
      const [idleLat, idleLng] = idleRoadProj.point;

      currentMarkerPosRef.current = [idleLat, idleLng];
      targetMarkerPosRef.current = [idleLat, idleLng];
      posAnimStartRef.current = [idleLat, idleLng];
      posAnimEndRef.current = [idleLat, idleLng];
      posAnimStartTimeRef.current = performance.now();
      lastGpsFixPerfTimeRef.current = null;
      if (userMarkerRef.current) {
        userMarkerRef.current.setLngLat([idleLng, idleLat]);
      }

      try {
        map.easeTo({
          center: [idleLng, idleLat],
          zoom: targetZoom,
          bearing: targetBearing,
          pitch: targetPitch,
          padding: targetPadding,
          duration: durationMs,
          essential: true,
        });
        if (targetPitch > 0) {
          verifyPitchedRender(map);
        }
      } catch {
        activateFlatFallback(map);
        clearFlags();
      }
    },
    [
      activateFlatFallback,
      applyPitchGesturePolicy,
      beginProgrammaticCameraLock,
      computeIdleArrowPadding,
      getEffectiveIdlePitch,
      resolveIdleTrackingBearing,
      verifyPitchedRender,
    ]
  );

  const syncBuildings3DLayer = useCallback((map: maplibregl.Map) => {
    const show3D = Boolean(
      mapSettingsRef.current.buildings3D &&
        !isOverviewActiveRef.current &&
        !isRoutePreviewActiveRef.current
    );
    syncBuildings3DLayerVisibility(map, show3D);
  }, []);

  const syncBuildings3DLayerRef = useRef(syncBuildings3DLayer);
  syncBuildings3DLayerRef.current = syncBuildings3DLayer;

  // 1. Initialize MapLibre GL Map (Full viewport WebGL canvas, zero dark corners, upright street labels)
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const initialZoom = isNavigating ? 16 : ZOOM_PANTALLA_PRINCIPAL;
    const initialLat = userLocation.lat || -12.0464;
    const initialLng = userLocation.lng || -77.0428;
    const canIdleTiltInit =
      !isNavigating &&
      !hasAnyRoutesRef.current &&
      mapSettingsRef.current.perspective3D &&
      !flatFallbackActiveRef.current;
    const initialPitch = isNavigating
      ? getEffectiveNavPitch()
      : canIdleTiltInit
      ? getEffectiveIdlePitch()
      : 0;
    const initialPadding = isNavigating
      ? computeLowerThirdPadding(mapContainerRef.current.clientHeight)
      : canIdleTiltInit && isFollowing
      ? computeIdleArrowPadding(mapContainerRef.current.clientHeight)
      : { top: 0, bottom: 0, left: 0, right: 0 };

    followCamTargetZoomRef.current = initialZoom;
    followCamTargetBearingRef.current = 0;
    followCamTargetPitchRef.current = initialPitch;
    followCamTargetPaddingRef.current = initialPadding;
    prevIdlePerspective3DRef.current = mapSettingsRef.current.perspective3D;

    styleFallbackStageRef.current = 'liberty';
    hasVectorSourceLoadedRef.current = false;
    ensurePmtilesProtocolRegistered();
    const initialOpenMapTilesEnabled = openMapTilesEnabledRef.current;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: getStyleForTileMode(mapTileMode, 'liberty', initialOpenMapTilesEnabled),
      center: [initialLng, initialLat],
      zoom: initialZoom,
      minZoom: isNavigating ? 11 : 12,
      maxZoom: isNavigating ? 19 : 19.5,
      maxPitch: 60,
      pitch: initialPitch,
      bearing: 0,
      attributionControl: false,
      // Limita la densidad de píxeles a 2 para aliviar la GPU en teléfonos de pantalla muy densa
      pixelRatio: Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2),
      // Arrastre con inercia más fluida (estilo Waze)
      dragPan: { linearity: 0.3, deceleration: 2200, maxSpeed: 1800 },
      dragRotate: true,
      touchZoomRotate: true,
      touchPitch: isNavigating,
      pitchWithRotate: isNavigating,
    });

    if ((initialPadding.top ?? 0) > 0) {
      try {
        map.setPadding(initialPadding);
      } catch {}
    }

    applyPitchGesturePolicy(map);

    if (initialPitch > 0) {
      verifyPitchedRender(map);
    }

    const loadPmTilesVectorStyle = (stage: 'liberty' | 'bright' = 'liberty') => {
      const reqSeq = ++vectorStyleRequestSeqRef.current;
      resolveVectorStyleWithPmTiles(stage, mapTileModeRef.current)
        .then((resolvedStyle) => {
          if (
            reqSeq !== vectorStyleRequestSeqRef.current ||
            mapInstanceRef.current !== map ||
            mapTileModeRef.current === 'satellite' ||
            openMapTilesEnabledRef.current
          ) {
            return;
          }
          try {
            pendingStyleCameraRef.current = {
              center: map.getCenter(),
              zoom: map.getZoom(),
              bearing: map.getBearing(),
              pitch: flatFallbackActiveRef.current ? 0 : map.getPitch(),
              padding: map.getPadding(),
            };
          } catch {}
          isMapStyleReadyRef.current = false;
          map.setStyle(resolvedStyle);
        })
        .catch((err) => {
          if (
            reqSeq !== vectorStyleRequestSeqRef.current ||
            mapInstanceRef.current !== map ||
            mapTileModeRef.current === 'satellite' ||
            openMapTilesEnabledRef.current
          ) {
            return;
          }
          // En modo "Solo PMTiles de Perú" (OpenMapTiles desactivado) NO hacemos fallback a OpenMapTiles ni a OSM raster
          console.warn('No se pudo cargar PMTiles de Perú (modo aislado):', err?.message || err);
        });
    };
    loadPmTilesVectorStyleRef.current = loadPmTilesVectorStyle;

    const triggerOpenFreeMapFallback = () => {
      if (mapTileModeRef.current === 'satellite') return;
      if (!openMapTilesEnabledRef.current) return;
      const stage = styleFallbackStageRef.current;
      if (stage === 'osm_raster') return;

      const nextStage: OpenFreeMapFallbackStage = stage === 'liberty' ? 'bright' : 'osm_raster';
      styleFallbackStageRef.current = nextStage;
      hasVectorSourceLoadedRef.current = false;
      isMapStyleReadyRef.current = false;

      if (styleLoadFallbackTimerRef.current) {
        clearTimeout(styleLoadFallbackTimerRef.current);
        styleLoadFallbackTimerRef.current = null;
      }

      try {
        pendingStyleCameraRef.current = {
          center: map.getCenter(),
          zoom: map.getZoom(),
          bearing: map.getBearing(),
          pitch: flatFallbackActiveRef.current ? 0 : map.getPitch(),
          padding: map.getPadding(),
        };
      } catch {}

      if (nextStage === 'osm_raster') {
        setActiveAttributionMode('osm_raster');
      } else {
        setActiveAttributionMode('openfreemap');
        styleLoadFallbackTimerRef.current = setTimeout(() => {
          styleLoadFallbackTimerRef.current = null;
          if (
            openMapTilesEnabledRef.current &&
            (!isMapStyleReadyRef.current || !hasVectorSourceLoadedRef.current)
          ) {
            triggerOpenFreeMapFallback();
          }
        }, 6500);
      }

      try {
        map.setStyle(getStyleForTileMode(mapTileModeRef.current, nextStage, true));
      } catch {
        if (nextStage !== 'osm_raster') {
          styleFallbackStageRef.current = 'osm_raster';
          setActiveAttributionMode('osm_raster');
          try {
            map.setStyle(getStyleForTileMode(mapTileModeRef.current, 'osm_raster', true));
          } catch {}
        }
      }
    };
    triggerOpenFreeMapFallbackRef.current = triggerOpenFreeMapFallback;

    if (mapTileMode !== 'satellite') {
      if (initialOpenMapTilesEnabled) {
        styleLoadFallbackTimerRef.current = setTimeout(() => {
          styleLoadFallbackTimerRef.current = null;
          if (
            openMapTilesEnabledRef.current &&
            (!isMapStyleReadyRef.current || !hasVectorSourceLoadedRef.current)
          ) {
            triggerOpenFreeMapFallback();
          }
        }, 6500);
      } else {
        loadPmTilesVectorStyle('liberty');
      }
    }

    const handleWebGLContextLost = (ev: Event) => {
      ev.preventDefault();
      if (map.getPitch() > 0 || isNavigatingRef.current) {
        activateFlatFallback(map);
      }
    };
    const mapCanvas = map.getCanvas();
    mapCanvas?.addEventListener('webglcontextlost', handleWebGLContextLost);

    map.on('error', (e: any) => {
      const errMsg = e?.error?.message || '';
      const status = e?.error?.status;

      // Cuando OpenMapTiles está desactivado, aislamos estrictamente PMTiles sin activar fallback a OpenFreeMap/OSM
      if (!openMapTilesEnabledRef.current && mapTileModeRef.current !== 'satellite') {
        const isPmTilesError =
          e?.sourceId === PERU_PMTILES_SOURCE_ID ||
          errMsg.includes('pmtiles') ||
          errMsg.includes('/api/pmtiles') ||
          e?.sourceId !== undefined ||
          errMsg.includes('Failed to fetch') ||
          errMsg.includes('AJAXError') ||
          errMsg.includes('AbortError');
        if (isPmTilesError) {
          return;
        }
      }

      const isStyleOrOpenFreeMapSourceFailure =
        openMapTilesEnabledRef.current &&
        mapTileModeRef.current !== 'satellite' &&
        styleFallbackStageRef.current !== 'osm_raster' &&
        (!isMapStyleReadyRef.current ||
          (e?.sourceId === 'openmaptiles' && !hasVectorSourceLoadedRef.current) ||
          errMsg.includes('openfreemap') ||
          (typeof status === 'number' && status >= 400 && !hasVectorSourceLoadedRef.current));

      if (isStyleOrOpenFreeMapSourceFailure) {
        triggerOpenFreeMapFallback();
        return;
      }

      const isTileOrNetworkAbort =
        e?.sourceId !== undefined ||
        errMsg.includes('Failed to fetch') ||
        errMsg.includes('AJAXError') ||
        errMsg.includes('AbortError');
      if (isTileOrNetworkAbort) {
        // Swallow transient tile network/rate-limit fetch failures so MapLibre does not throw unhandled errors
        return;
      }
      if (map.getPitch() > 0) {
        activateFlatFallback(map);
      }
      console.warn('MapLibre warning:', e?.error || e);
    });

    map.on('sourcedata', (e: any) => {
      const isVectorSource =
        e?.sourceId === 'openmaptiles' || e?.sourceId === PERU_PMTILES_SOURCE_ID;
      if (isVectorSource && e?.isSourceLoaded) {
        const wasLoaded = hasVectorSourceLoadedRef.current;
        hasVectorSourceLoadedRef.current = true;
        if (styleLoadFallbackTimerRef.current) {
          clearTimeout(styleLoadFallbackTimerRef.current);
          styleLoadFallbackTimerRef.current = null;
        }
        if (!wasLoaded && !isNavigatingRef.current && userMarkerRef.current) {
          const loc = userLocationRef.current;
          const initSpeedMps = Math.max(0, speedKmhRef.current / 3.6);
          const roadProj = projectArrowOntoRoadSurface(
            map,
            loc.lat,
            loc.lng,
            currentMarkerAngleRef.current,
            initSpeedMps > FREE_DRIVE_MIN_MOVING_SPEED_MPS || currentMarkerAngleRef.current !== 0,
            initSpeedMps
          );
          idleRoadSegmentRef.current = roadProj.segment;
          if (roadProj.projected) {
            const [pLat, pLng] = roadProj.point;
            currentMarkerPosRef.current = [pLat, pLng];
            targetMarkerPosRef.current = [pLat, pLng];
            posAnimStartRef.current = [pLat, pLng];
            posAnimEndRef.current = [pLat, pLng];
            userMarkerRef.current.setLngLat([pLng, pLat]);
          }
        }
      }
    });

    map.on('style.load', () => {
      isMapStyleReadyRef.current = true;
      if (mapTileModeRef.current === 'satellite') {
        setActiveAttributionMode('satellite');
        if (styleLoadFallbackTimerRef.current) {
          clearTimeout(styleLoadFallbackTimerRef.current);
          styleLoadFallbackTimerRef.current = null;
        }
      } else if (!openMapTilesEnabledRef.current) {
        setActiveAttributionMode('pmtiles_only');
        if (styleLoadFallbackTimerRef.current) {
          clearTimeout(styleLoadFallbackTimerRef.current);
          styleLoadFallbackTimerRef.current = null;
        }
      } else if (styleFallbackStageRef.current === 'osm_raster') {
        setActiveAttributionMode('osm_raster');
        if (styleLoadFallbackTimerRef.current) {
          clearTimeout(styleLoadFallbackTimerRef.current);
          styleLoadFallbackTimerRef.current = null;
        }
      } else {
        setActiveAttributionMode('openfreemap');
        if (styleLoadFallbackTimerRef.current) {
          clearTimeout(styleLoadFallbackTimerRef.current);
          styleLoadFallbackTimerRef.current = null;
        }
        // Asegurar respaldo si el estilo JSON cargó pero el origen openmaptiles no entrega datos
        if (!hasVectorSourceLoadedRef.current) {
          styleLoadFallbackTimerRef.current = setTimeout(() => {
            styleLoadFallbackTimerRef.current = null;
            if (
              openMapTilesEnabledRef.current &&
              !hasVectorSourceLoadedRef.current &&
              mapTileModeRef.current !== 'satellite'
            ) {
              triggerOpenFreeMapFallback();
            }
          }, 6500);
        }
      }

      if (pendingStyleCameraRef.current) {
        const preserved = pendingStyleCameraRef.current;
        pendingStyleCameraRef.current = null;
        try {
          beginProgrammaticCameraLock(map, 200);
          map.jumpTo({
            center: preserved.center,
            zoom: preserved.zoom,
            bearing: preserved.bearing,
            pitch: flatFallbackActiveRef.current ? 0 : preserved.pitch,
            padding: preserved.padding,
          });
        } catch {
          activateFlatFallback(map);
        }
      }
      applyWazeStyleEnhancements(map, mapTileModeRef.current);
      syncBuildings3DLayerRef.current(map);
      fixedRadarStripListenersBoundRef.current = false;
      syncRouteDataToMap(map);
      syncPoiGeoJsonSourceRef.current?.(map, true);
      syncFixedRadarsOnMapRef.current?.(map);
      overviewSavedLayersRef.current.clear();
      if (isOverviewActiveRef.current) {
        applyOverviewCleanMapStyle(
          map,
          mapTileModeRef.current,
          overviewSavedLayersRef.current,
          overviewZoomAnchorRef.current
        );
      } else if (isRoutePreviewActiveRef.current) {
        applyRoutePreviewMapStyle(map, mapTileModeRef.current);
      }

      if (pendingRecenterRef.current) {
        pendingRecenterRef.current = false;
        if (recenterWaitTimerRef.current) {
          clearTimeout(recenterWaitTimerRef.current);
          recenterWaitTimerRef.current = null;
        }
        performAtomicJump();
      }
    });

    map.on('rotate', (e: any) => {
      const currBearing = map.getBearing();
      const signed = (((currBearing % 360) + 540) % 360) - 180;
      const isUserRotate = Boolean(e?.originalEvent);
      if (isUserRotate || isManuallyRotatedRef.current || !isFollowCameraJumpActiveRef.current) {
        setMapRotation(currBearing);
      }
      if (
        isUserRotate ||
        (!isNavigatingRef.current &&
          !isProgrammaticCameraRef.current &&
          !isProgrammaticMoveRef.current)
      ) {
        const rotated = Math.abs(signed) > 1.5;
        if (rotated !== isManuallyRotatedRef.current) {
          isManuallyRotatedRef.current = rotated;
          setIsManuallyRotated(rotated);
        }
      }
    });

    const extractGestureMetrics = (orig: any): { x: number; y: number; pinchDist?: number } | null => {
      if (!orig) return null;
      if (orig.touches && orig.touches.length >= 2) {
        const t0 = orig.touches[0];
        const t1 = orig.touches[1];
        return {
          x: (t0.clientX + t1.clientX) / 2,
          y: (t0.clientY + t1.clientY) / 2,
          pinchDist: Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY),
        };
      }
      if (orig.touches && orig.touches.length === 1) {
        return { x: orig.touches[0].clientX, y: orig.touches[0].clientY };
      }
      if (orig.changedTouches && orig.changedTouches.length >= 1) {
        return { x: orig.changedTouches[0].clientX, y: orig.changedTouches[0].clientY };
      }
      if (typeof orig.clientX === 'number' && typeof orig.clientY === 'number') {
        return { x: orig.clientX, y: orig.clientY };
      }
      return null;
    };

    const cancelIdleFollowImmediately = () => {
      idleGestureStartRef.current = null;
      isIdleAutoOrientActiveRef.current = false;
      idleBearingAnimRef.current.active = false;
      if (idleStopNorthTimerRef.current) {
        clearTimeout(idleStopNorthTimerRef.current);
        idleStopNorthTimerRef.current = null;
      }
      isProgrammaticCameraRef.current = false;
      isProgrammaticMoveRef.current = false;
      pendingRecenterRef.current = false;
      if (programmaticCameraTimerRef.current) {
        clearTimeout(programmaticCameraTimerRef.current);
        programmaticCameraTimerRef.current = null;
      }
      if (programmaticClearTimerRef.current) {
        clearTimeout(programmaticClearTimerRef.current);
        programmaticClearTimerRef.current = null;
      }
      if (recenterWaitTimerRef.current) {
        clearTimeout(recenterWaitTimerRef.current);
        recenterWaitTimerRef.current = null;
      }
      if (isFollowingRef.current) {
        onToggleFollowRef.current(false);
      }
    };

    // Real user input gestures (originalEvent present):
    // - During active navigation: preserved exact behavior (immediate exploration pause)
    // - Before route starts (idle): ignore micro-movements < 10px; upon drag/zoom/rotate disable auto-follow & auto-rotation while keeping 55° pitch untouched
    const handleUserGestureStart = (e: any) => {
      if (!e?.originalEvent) return;

      // Cualquier gesto manual (arrastre, zoom, rotación o inclinación) activa/extiende la pausa de 15s
      pauseAutoFollowRef.current();

      if (isNavigatingRef.current) {
        if (e.type === 'rotatestart') {
          isManuallyRotatedRef.current = true;
          setIsManuallyRotated(true);
        }
        isProgrammaticMoveRef.current = false;
        isAtomicRecenterInFlightRef.current = false;
        pendingRecenterRef.current = false;
        if (programmaticClearTimerRef.current) {
          clearTimeout(programmaticClearTimerRef.current);
          programmaticClearTimerRef.current = null;
        }
        if (recenterWaitTimerRef.current) {
          clearTimeout(recenterWaitTimerRef.current);
          recenterWaitTimerRef.current = null;
        }
        onUserExplorationGestureRef.current?.();
        return;
      }

      if (isAtomicRecenterInFlightRef.current) return;

      // En selección de ruta, cualquier gesto manual de desplazamiento o zoom bloquea futuros reencuadres automáticos
      if (hasAnyRoutesRef.current) {
        if (e.type === 'rotatestart') {
          return;
        }
        if (e.type === 'zoomstart' && e.originalEvent.type === 'wheel') {
          userInteractedInPreviewRef.current = true;
          if (previewFitDebounceTimerRef.current) {
            clearTimeout(previewFitDebounceTimerRef.current);
            previewFitDebounceTimerRef.current = null;
          }
          if (previewFitInitialRafRef.current !== null) {
            cancelAnimationFrame(previewFitInitialRafRef.current);
            previewFitInitialRafRef.current = null;
          }
          return;
        }
        isIdleUserPointerDownRef.current = true;
        const metrics = extractGestureMetrics(e.originalEvent);
        if (metrics) {
          idleGestureStartRef.current = { ...metrics, zoom: map.getZoom() };
        }
        return;
      }

      if (e.type === 'rotatestart') {
        isManuallyRotatedRef.current = true;
        setIsManuallyRotated(true);
        cancelIdleFollowImmediately();
        return;
      }

      if (e.type === 'zoomstart' && e.originalEvent.type === 'wheel') {
        cancelIdleFollowImmediately();
        return;
      }

      isIdleUserPointerDownRef.current = true;
      const metrics = extractGestureMetrics(e.originalEvent);
      if (metrics) {
        idleGestureStartRef.current = { ...metrics, zoom: map.getZoom() };
      }
    };

    const handleIdleGestureMove = (e: any) => {
      if (isNavigatingRef.current || !e?.originalEvent) return;
      if (isAtomicRecenterInFlightRef.current) return;

      if (hasAnyRoutesRef.current) {
        if (e.type === 'rotate') return;
        if (e.originalEvent.type === 'wheel') {
          userInteractedInPreviewRef.current = true;
          if (previewFitDebounceTimerRef.current) {
            clearTimeout(previewFitDebounceTimerRef.current);
            previewFitDebounceTimerRef.current = null;
          }
          if (previewFitInitialRafRef.current !== null) {
            cancelAnimationFrame(previewFitInitialRafRef.current);
            previewFitInitialRafRef.current = null;
          }
          return;
        }
        const metrics = extractGestureMetrics(e.originalEvent);
        const start = idleGestureStartRef.current;
        if (!start) {
          if (metrics) {
            idleGestureStartRef.current = { ...metrics, zoom: map.getZoom() };
          }
          return;
        }
        const movedPx = metrics ? Math.hypot(metrics.x - start.x, metrics.y - start.y) : 0;
        const pinchDeltaPx =
          metrics?.pinchDist !== undefined && start.pinchDist !== undefined
            ? Math.abs(metrics.pinchDist - start.pinchDist)
            : 0;
        const zoomDelta = Math.abs(map.getZoom() - start.zoom);
        if (movedPx >= 6 || pinchDeltaPx >= 6 || zoomDelta >= 0.03) {
          userInteractedInPreviewRef.current = true;
          if (previewFitDebounceTimerRef.current) {
            clearTimeout(previewFitDebounceTimerRef.current);
            previewFitDebounceTimerRef.current = null;
          }
          if (previewFitInitialRafRef.current !== null) {
            cancelAnimationFrame(previewFitInitialRafRef.current);
            previewFitInitialRafRef.current = null;
          }
        }
        return;
      }

      if (e.originalEvent.type === 'wheel') {
        cancelIdleFollowImmediately();
        return;
      }

      const metrics = extractGestureMetrics(e.originalEvent);
      const start = idleGestureStartRef.current;
      if (!start) {
        if (metrics) {
          idleGestureStartRef.current = { ...metrics, zoom: map.getZoom() };
        }
        return;
      }

      const movedPx = metrics ? Math.hypot(metrics.x - start.x, metrics.y - start.y) : 0;
      const pinchDeltaPx =
        metrics?.pinchDist !== undefined && start.pinchDist !== undefined
          ? Math.abs(metrics.pinchDist - start.pinchDist)
          : 0;
      const zoomDelta = Math.abs(map.getZoom() - start.zoom);

      const signedBearing = (((map.getBearing() % 360) + 540) % 360) - 180;
      if (e.type === 'rotate' && Math.abs(signedBearing) > 1.5) {
        isManuallyRotatedRef.current = true;
        setIsManuallyRotated(true);
        cancelIdleFollowImmediately();
        return;
      }

      if (movedPx >= 10 || pinchDeltaPx >= 10 || zoomDelta >= 0.05) {
        cancelIdleFollowImmediately();
      }
    };

    const handleIdleGestureEnd = (e: any) => {
      if (isNavigatingRef.current) return;
      const remainingTouches = e?.originalEvent?.touches?.length ?? 0;
      if (remainingTouches > 0) return;

      isIdleUserPointerDownRef.current = false;
      idleGestureStartRef.current = null;
    };

    const handleCanvasPointerRelease = (e: TouchEvent | PointerEvent) => {
      if (isNavigatingRef.current) return;
      const touchesRemaining = 'touches' in e ? e.touches.length : 0;
      if (touchesRemaining === 0) {
        isIdleUserPointerDownRef.current = false;
        idleGestureStartRef.current = null;
      }
    };

    map.on('dragstart', handleUserGestureStart);
    map.on('zoomstart', handleUserGestureStart);
    map.on('rotatestart', handleUserGestureStart);
    map.on('pitchstart', handleUserGestureStart);

    map.on('drag', handleIdleGestureMove);
    map.on('zoom', handleIdleGestureMove);
    map.on('rotate', handleIdleGestureMove);

    map.on('dragend', handleIdleGestureEnd);
    map.on('zoomend', handleIdleGestureEnd);
    map.on('rotateend', handleIdleGestureEnd);

    // Pausa de auto-seguimiento por 15 segundos ante cualquier toque o gesto táctil/puntero en el mapa
    const mapTouchTarget = map.getContainer() || mapCanvas;
    const handleCanvasTouchStart = () => {
      isUserTouchingMapRef.current = true;
      userTouchStartedAtRef.current = performance.now();
      pauseAutoFollowRef.current();
    };
    const handleCanvasTouchMove = () => {
      isUserTouchingMapRef.current = true;
      userTouchStartedAtRef.current = performance.now();
      pauseAutoFollowRef.current({ fromTouchMove: true });
    };
    const handleCanvasPointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      isUserTouchingMapRef.current = true;
      userTouchStartedAtRef.current = performance.now();
      pauseAutoFollowRef.current();
    };
    const handleCanvasPointerMove = (e: PointerEvent) => {
      if (e.pointerType !== 'touch' && e.buttons === 0) return;
      pauseAutoFollowRef.current({ fromTouchMove: true });
    };
    const handleCanvasWheel = () => {
      pauseAutoFollowRef.current();
    };
    const handleCanvasTouchEndAny = (e: TouchEvent | PointerEvent) => {
      const touchesRemaining = 'touches' in e ? e.touches.length : 0;
      if (touchesRemaining === 0) {
        isUserTouchingMapRef.current = false;
        if (isAutoFollowPausedRef.current) {
          // Reinicia el conteo de 15 segundos desde que el usuario suelta el mapa
          pauseAutoFollowRef.current();
        }
      }
    };
    const handleWindowBlurTouch = () => {
      isUserTouchingMapRef.current = false;
    };
    mapTouchTarget?.addEventListener('touchstart', handleCanvasTouchStart, { passive: true });
    mapTouchTarget?.addEventListener('touchmove', handleCanvasTouchMove, { passive: true });
    mapTouchTarget?.addEventListener('pointerdown', handleCanvasPointerDown, { passive: true });
    mapTouchTarget?.addEventListener('pointermove', handleCanvasPointerMove, { passive: true });
    mapTouchTarget?.addEventListener('wheel', handleCanvasWheel, { passive: true });
    mapTouchTarget?.addEventListener('touchend', handleCanvasTouchEndAny, { passive: true });
    mapTouchTarget?.addEventListener('touchcancel', handleCanvasTouchEndAny, { passive: true });
    mapTouchTarget?.addEventListener('pointerup', handleCanvasTouchEndAny, { passive: true });
    mapTouchTarget?.addEventListener('pointercancel', handleCanvasTouchEndAny, { passive: true });
    window.addEventListener('blur', handleWindowBlurTouch);
    mapCanvas?.addEventListener('touchend', handleCanvasPointerRelease, { passive: true });
    mapCanvas?.addEventListener('touchcancel', handleCanvasPointerRelease, { passive: true });
    mapCanvas?.addEventListener('pointerup', handleCanvasPointerRelease, { passive: true });
    mapCanvas?.addEventListener('pointercancel', handleCanvasPointerRelease, { passive: true });

    mapInstanceRef.current = map;

    return () => {
      mapTouchTarget?.removeEventListener('touchstart', handleCanvasTouchStart);
      mapTouchTarget?.removeEventListener('touchmove', handleCanvasTouchMove);
      mapTouchTarget?.removeEventListener('pointerdown', handleCanvasPointerDown);
      mapTouchTarget?.removeEventListener('pointermove', handleCanvasPointerMove);
      mapTouchTarget?.removeEventListener('wheel', handleCanvasWheel);
      mapTouchTarget?.removeEventListener('touchend', handleCanvasTouchEndAny);
      mapTouchTarget?.removeEventListener('touchcancel', handleCanvasTouchEndAny);
      mapTouchTarget?.removeEventListener('pointerup', handleCanvasTouchEndAny);
      mapTouchTarget?.removeEventListener('pointercancel', handleCanvasTouchEndAny);
      window.removeEventListener('blur', handleWindowBlurTouch);
      isUserTouchingMapRef.current = false;
      if (autoFollowPauseTimerRef.current) {
        clearTimeout(autoFollowPauseTimerRef.current);
        autoFollowPauseTimerRef.current = null;
      }
      isAutoFollowPausedRef.current = false;
      autoFollowPauseUntilRef.current = 0;
      shouldResumeFollowAfterPauseRef.current = false;
      if (previewFitDebounceTimerRef.current) {
        clearTimeout(previewFitDebounceTimerRef.current);
        previewFitDebounceTimerRef.current = null;
      }
      if (previewFitTimeoutRef.current) {
        clearTimeout(previewFitTimeoutRef.current);
        previewFitTimeoutRef.current = null;
      }
      if (previewFitInitialRafRef.current !== null) {
        cancelAnimationFrame(previewFitInitialRafRef.current);
        previewFitInitialRafRef.current = null;
      }
      if (recenterWaitTimerRef.current) {
        clearTimeout(recenterWaitTimerRef.current);
        recenterWaitTimerRef.current = null;
      }
      if (programmaticClearTimerRef.current) {
        clearTimeout(programmaticClearTimerRef.current);
        programmaticClearTimerRef.current = null;
      }
      if (programmaticCameraTimerRef.current) {
        clearTimeout(programmaticCameraTimerRef.current);
        programmaticCameraTimerRef.current = null;
      }
      if (idlePitchLockTimerRef.current) {
        clearTimeout(idlePitchLockTimerRef.current);
        idlePitchLockTimerRef.current = null;
      }
      if (pitchFallbackTimerRef.current) {
        clearTimeout(pitchFallbackTimerRef.current);
        pitchFallbackTimerRef.current = null;
      }
      if (styleLoadFallbackTimerRef.current) {
        clearTimeout(styleLoadFallbackTimerRef.current);
        styleLoadFallbackTimerRef.current = null;
      }
      mapCanvas?.removeEventListener('webglcontextlost', handleWebGLContextLost);
      mapCanvas?.removeEventListener('touchend', handleCanvasPointerRelease);
      mapCanvas?.removeEventListener('touchcancel', handleCanvasPointerRelease);
      mapCanvas?.removeEventListener('pointerup', handleCanvasPointerRelease);
      mapCanvas?.removeEventListener('pointercancel', handleCanvasPointerRelease);
      pendingStyleCameraRef.current = null;
      isProgrammaticMoveRef.current = false;
      isProgrammaticCameraRef.current = false;
      isAtomicRecenterInFlightRef.current = false;
      isIdleUserPointerDownRef.current = false;
      idleGestureStartRef.current = null;
      pendingRecenterRef.current = false;
      isMapStyleReadyRef.current = false;
      vectorStyleRequestSeqRef.current += 1;
      loadPmTilesVectorStyleRef.current = () => {};
      triggerOpenFreeMapFallbackRef.current = () => {};
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // 2. Dynamic resize observer for panel collapse/expand and window resizes
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !mapContainerRef.current) return;

    let resizeRaf: number | null = null;
    const handleResize = () => {
      if (resizeRaf) cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(() => {
        if (mapInstanceRef.current) {
          mapInstanceRef.current.resize();
        }
      });
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(mapContainerRef.current);
    window.addEventListener('resize', handleResize);
    window.addEventListener('ruta-lima-layout-resize', handleResize);

    return () => {
      if (resizeRaf) cancelAnimationFrame(resizeRaf);
      resizeObserver.disconnect();
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('ruta-lima-layout-resize', handleResize);
    };
  }, []);

  // Resize & smooth camera transition when entering or exiting active navigation
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    setTimeout(() => {
      map.resize();
    }, 60);

    let transitionTimer: ReturnType<typeof setTimeout> | null = null;

    if (!prevNavigatingRef.current && isNavigating) {
      // Entering active navigation: clear any manual pause, enable 3D tilt (if enabled) & smooth easeTo driving view
      clearAutoFollowPauseRef.current();
      userInteractedInPreviewRef.current = false;
      if (previewFitDebounceTimerRef.current) {
        clearTimeout(previewFitDebounceTimerRef.current);
        previewFitDebounceTimerRef.current = null;
      }
      if (previewFitTimeoutRef.current) {
        clearTimeout(previewFitTimeoutRef.current);
        previewFitTimeoutRef.current = null;
      }
      if (previewFitInitialRafRef.current !== null) {
        cancelAnimationFrame(previewFitInitialRafRef.current);
        previewFitInitialRafRef.current = null;
      }
      if (idlePitchLockTimerRef.current) {
        clearTimeout(idlePitchLockTimerRef.current);
        idlePitchLockTimerRef.current = null;
      }
      applyPitchGesturePolicy(map);

      isManuallyRotatedRef.current = false;
      setIsManuallyRotated(false);
      setIsHeadingUp(mapSettingsRef.current.autoRotation);
      syncRouteDataToMap(map);

      const loc = userLocationRef.current;
      const route = activeRouteRef.current;
      const speed = speedKmhRef.current;
      const distTurn = distanceToNextStepRef.current;

      const validBearing = resolveValidBearing(loc, route, speed);
      const targetBearing = mapSettingsRef.current.autoRotation ? validBearing : 0;
      const targetPitch = getEffectiveNavPitch();
      const targetZoom = calculateSmartZoom(distTurn, speed);
      const targetPadding = getLowerThirdPadding(map);

      let targetLat = loc.lat;
      let targetLng = loc.lng;
      if (route && route.coordinates.length >= 2) {
        const match = snapToActiveRoute(
          loc.lat,
          loc.lng,
          loc.heading,
          route.coordinates,
          ACTIVE_ROUTE_SNAP_MAX_METERS
        );
        targetLat = match.arrowPoint[0];
        targetLng = match.arrowPoint[1];
      }

      followCamTargetZoomRef.current = targetZoom;
      followCamTargetBearingRef.current = targetBearing;
      followCamTargetPitchRef.current = targetPitch;
      followCamTargetPaddingRef.current = targetPadding;
      setMapRotation(targetBearing);
      isProgrammaticMoveRef.current = true;
      beginProgrammaticCameraLock(map, 750);
      try {
        map.easeTo({
          ...(targetLat && targetLng ? { center: [targetLng, targetLat] } : {}),
          zoom: targetZoom,
          bearing: targetBearing,
          pitch: targetPitch,
          padding: targetPadding,
          duration: 700,
        });
        if (targetPitch > 0) {
          verifyPitchedRender(map);
        }
      } catch {
        activateFlatFallback(map);
      }
      transitionTimer = setTimeout(() => {
        isProgrammaticMoveRef.current = false;
      }, 750);
    } else if (prevNavigatingRef.current && !isNavigating) {
      // Ending or cancelling route: vuelve a la vista de seguimiento en pantalla principal (60° si Perspectiva 3D activa, o plana Norte arriba si desactivada)
      clearAutoFollowPauseRef.current();
      isManuallyRotatedRef.current = false;
      setIsManuallyRotated(false);
      idleBearingAnimRef.current.active = false;
      if (idleStopNorthTimerRef.current) {
        clearTimeout(idleStopNorthTimerRef.current);
        idleStopNorthTimerRef.current = null;
      }
      isIdleAutoOrientActiveRef.current = true;
      syncRouteDataToMap(map);

      const useTiltedIdle =
        !hasAnyRoutesRef.current &&
        mapSettingsRef.current.perspective3D &&
        !flatFallbackActiveRef.current;
      const currLat = userLocationRef.current.lat;
      const currLng = userLocationRef.current.lng;
      const targetPitch = useTiltedIdle ? getEffectiveIdlePitch() : 0;
      const targetPadding = useTiltedIdle
        ? computeIdleArrowPadding(map.getContainer().clientHeight)
        : { top: 0, bottom: 0, left: 0, right: 0 };
      const targetBearing = useTiltedIdle
        ? resolveIdleTrackingBearing(userLocationRef.current, speedKmhRef.current)
        : 0;

      applyPitchGesturePolicy(map, { unlockingForTransition: true });

      const idleRecenterZoom = calculateIdleZoom(speedKmhRef.current);
      followCamTargetZoomRef.current = idleRecenterZoom;
      followCamTargetBearingRef.current = targetBearing;
      followCamTargetPitchRef.current = targetPitch;
      followCamTargetPaddingRef.current = targetPadding;
      setMapRotation(targetBearing);

      isProgrammaticMoveRef.current = true;
      beginProgrammaticCameraLock(map, 700);
      try {
        map.easeTo({
          ...(currLat && currLng ? { center: [currLng, currLat] } : {}),
          zoom: idleRecenterZoom,
          bearing: targetBearing,
          pitch: targetPitch,
          padding: targetPadding,
          duration: 650,
          essential: true,
        });
        if (targetPitch > 0) {
          verifyPitchedRender(map);
        }
      } catch {
        activateFlatFallback(map);
      }
      transitionTimer = setTimeout(() => {
        isProgrammaticMoveRef.current = false;
        applyPitchGesturePolicy(map);
      }, 700);
    }
    prevNavigatingRef.current = isNavigating;

    return () => {
      if (transitionTimer) clearTimeout(transitionTimer);
    };
  }, [
    isNavigating,
    syncRouteDataToMap,
    resolveValidBearing,
    resolveIdleTrackingBearing,
    getEffectiveNavPitch,
    getEffectiveIdlePitch,
    calculateSmartZoom,
    calculateIdleZoom,
    getLowerThirdPadding,
    computeIdleArrowPadding,
    beginProgrammaticCameraLock,
    verifyPitchedRender,
    activateFlatFallback,
    applyPitchGesturePolicy,
  ]);

  // Ensure full canvas sizing whenever follow mode changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    map.resize();
  }, [isFollowing]);

  // 3. Switch Map Style on Tile Mode change (Day / Night / Satellite), preserving exact pitch, bearing, zoom & center
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    if (prevTileModeRef.current === mapTileMode) return;
    const prevMode = prevTileModeRef.current;
    prevTileModeRef.current = mapTileMode;
    const isOpenMapTilesOn = openMapTilesEnabledRef.current;

    // Si cambiamos entre Día y Noche sobre estilo vectorial ya cargado, oscurecemos/aclaramos al instante sin recargar
    if (
      prevMode !== 'satellite' &&
      mapTileMode !== 'satellite' &&
      styleFallbackStageRef.current !== 'osm_raster' &&
      isMapStyleReadyForSources(map)
    ) {
      if (!isOpenMapTilesOn && (map.getLayer('road_major') || map.getLayer('peru-pmtiles-line-0'))) {
        loadPmTilesVectorStyleRef.current('liberty');
        return;
      }
      applyWazeStyleEnhancements(map, mapTileMode);
      syncBuildings3DLayer(map);
      syncRouteDataToMap(map);
      syncPoiGeoJsonSourceRef.current?.(map, true);
      syncFixedRadarsOnMapRef.current?.(map);
      if (isOverviewActiveRef.current) {
        overviewSavedLayersRef.current.clear();
        applyOverviewCleanMapStyle(
          map,
          mapTileMode,
          overviewSavedLayersRef.current,
          overviewZoomAnchorRef.current
        );
      } else if (isRoutePreviewActiveRef.current) {
        applyRoutePreviewMapStyle(map, mapTileMode);
      }
      return;
    }

    const preservedCamera = {
      center: map.getCenter(),
      zoom: map.getZoom(),
      bearing: map.getBearing(),
      pitch: flatFallbackActiveRef.current ? 0 : map.getPitch(),
      padding: map.getPadding(),
    };
    pendingStyleCameraRef.current = preservedCamera;

    if (mapTileMode !== 'satellite' && prevMode === 'satellite') {
      styleFallbackStageRef.current = 'liberty';
      hasVectorSourceLoadedRef.current = false;
    } else if (mapTileMode === 'satellite') {
      vectorStyleRequestSeqRef.current += 1;
    }

    isMapStyleReadyRef.current = false;
    map.setStyle(
      getStyleForTileMode(mapTileMode, styleFallbackStageRef.current, isOpenMapTilesOn)
    );
    if (mapTileMode !== 'satellite' && !isOpenMapTilesOn) {
      loadPmTilesVectorStyleRef.current('liberty');
    }
    try {
      beginProgrammaticCameraLock(map, 200);
      map.jumpTo(preservedCamera);
    } catch {}
  }, [mapTileMode, beginProgrammaticCameraLock, syncBuildings3DLayer, syncRouteDataToMap]);

  // 3B. Toggle between OpenMapTiles base source (ON) and isolated Peru PMTiles vector layer (OFF)
  useEffect(() => {
    const map = mapInstanceRef.current;
    const isOpenMapTilesOn = mapSettings.openMapTilesEnabled !== false;
    if (!map) return;
    if (prevOpenMapTilesEnabledRef.current === isOpenMapTilesOn) return;
    prevOpenMapTilesEnabledRef.current = isOpenMapTilesOn;

    if (mapTileModeRef.current === 'satellite') return;

    if (styleLoadFallbackTimerRef.current) {
      clearTimeout(styleLoadFallbackTimerRef.current);
      styleLoadFallbackTimerRef.current = null;
    }
    vectorStyleRequestSeqRef.current += 1;
    styleFallbackStageRef.current = 'liberty';
    hasVectorSourceLoadedRef.current = false;
    isMapStyleReadyRef.current = false;

    const preservedCamera = {
      center: map.getCenter(),
      zoom: map.getZoom(),
      bearing: map.getBearing(),
      pitch: flatFallbackActiveRef.current ? 0 : map.getPitch(),
      padding: map.getPadding(),
    };
    pendingStyleCameraRef.current = preservedCamera;

    if (!isOpenMapTilesOn) {
      setActiveAttributionMode('pmtiles_only');
      map.setStyle(getStyleForTileMode(mapTileModeRef.current, 'liberty', false));
      loadPmTilesVectorStyleRef.current('liberty');
    } else {
      setActiveAttributionMode('openfreemap');
      map.setStyle(getStyleForTileMode(mapTileModeRef.current, 'liberty', true));
      styleLoadFallbackTimerRef.current = setTimeout(() => {
        styleLoadFallbackTimerRef.current = null;
        if (
          openMapTilesEnabledRef.current &&
          (!isMapStyleReadyRef.current || !hasVectorSourceLoadedRef.current)
        ) {
          triggerOpenFreeMapFallbackRef.current();
        }
      }, 6500);
    }

    try {
      beginProgrammaticCameraLock(map, 200);
      map.jumpTo(preservedCamera);
    } catch {}
  }, [mapSettings.openMapTilesEnabled, beginProgrammaticCameraLock]);

  // Sync 3D buildings visibility whenever setting or overview state changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    syncBuildings3DLayer(map);
  }, [mapSettings.buildings3D, isOverviewActive, syncBuildings3DLayer]);

  // 4A. Independent 60 FPS Vehicle Chevron Position & Rotation Loop
  // Updates ONLY the blue vehicle marker (setLngLat / setRotation) without ever calling flyTo/easeTo/jumpTo
  useEffect(() => {
    const MAX_EXTRAPOLATION_MS = 1500;
    const ROT_ANIM_DURATION_MS = 300;

    if (animFrameIdRef.current !== null) {
      cancelAnimationFrame(animFrameIdRef.current);
      animFrameIdRef.current = null;
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        wasPageHiddenRef.current = true;
      } else if (document.visibilityState === 'visible' && wasPageHiddenRef.current) {
        wasPageHiddenRef.current = false;
        snapOnNextFixRef.current = true;
        lastGpsFixPerfTimeRef.current = null;
        isVehicleMovingRef.current = false;

        const [tLat, tLng] = targetMarkerPosRef.current;
        const tAngle = targetMarkerAngleRef.current;
        posAnimStartRef.current = [tLat, tLng];
        posAnimEndRef.current = [tLat, tLng];
        posAnimStartTimeRef.current = performance.now();
        currentMarkerPosRef.current = [tLat, tLng];

        rotAnimStartAngleRef.current = tAngle;
        rotAnimDeltaDegRef.current = 0;
        committedTargetAngleRef.current = tAngle;
        currentMarkerAngleRef.current = tAngle;

        if (userMarkerRef.current) {
          userMarkerRef.current.setLngLat([tLng, tLat]);
          userMarkerRef.current.setRotation(tAngle);
        }

        const nowPerf = performance.now();
        const isPauseActive =
          isAutoFollowPausedRef.current ||
          isUserTouchingMapRef.current ||
          nowPerf < autoFollowPauseUntilRef.current;
        if (isFollowingRef.current && !isPauseActive && !isOverviewActiveRef.current) {
          cameraNeedsImmediateSnapRef.current = true;
        }
        lastAnimTimeRef.current = nowPerf;
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    const animateVehicleChevron = (now: number) => {
      lastAnimTimeRef.current = now;

      if (document.visibilityState === 'hidden') {
        animFrameIdRef.current = requestAnimationFrame(animateVehicleChevron);
        return;
      }

      const marker = userMarkerRef.current;

      if (marker) {
        // A. Linear interpolation between last two fixes + max 1.5s dead-reckoning anticipation
        if (isVehicleMovingRef.current) {
          const duration = Math.max(200, posAnimDurationRef.current);
          const elapsed = Math.max(0, now - posAnimStartTimeRef.current);
          let rawLat: number;
          let rawLng: number;

          if (elapsed <= duration) {
            const t = elapsed / duration;
            const [sLat, sLng] = posAnimStartRef.current;
            const [eLat, eLng] = posAnimEndRef.current;
            rawLat = sLat + (eLat - sLat) * t;
            rawLng = sLng + (eLng - sLng) * t;
          } else {
            const overtimeMs = Math.min(elapsed - duration, MAX_EXTRAPOLATION_MS);
            const [eLat, eLng] = posAnimEndRef.current;
            const extraDistMeters = Math.max(0, velocityMpsRef.current) * (overtimeMs / 1000);
            [rawLat, rawLng] = offsetCoordByMeters(
              eLat,
              eLng,
              extraDistMeters,
              velocityBearingRef.current
            );

            if (elapsed - duration >= MAX_EXTRAPOLATION_MS) {
              // Stop extrapolating cleanly once the 1.5s limit is reached
              isVehicleMovingRef.current = false;
              posAnimStartRef.current = [rawLat, rawLng];
              posAnimEndRef.current = [rawLat, rawLng];
            }
          }

          let finalLat = rawLat;
          let finalLng = rawLng;

          // Keep arrow projected onto active route polyline while on-route (even around bends)
          const route = activeRouteRef.current;
          if (
            isNavigatingRef.current &&
            isSnappedToRouteRef.current &&
            route &&
            route.coordinates.length >= 2
          ) {
            const proj = projectPointOntoRoutePolyline(
              rawLat,
              rawLng,
              route.coordinates,
              snappedSegmentIdxRef.current
            );
            snappedSegmentIdxRef.current = proj.segmentIndex;
            finalLat = proj.point[0];
            finalLng = proj.point[1];
            if (elapsed > duration) {
              velocityBearingRef.current = proj.segmentBearing;
            }
          } else if (!isNavigatingRef.current && idleRoadSegmentRef.current) {
            [finalLat, finalLng] = clampPointToRoadSegment(
              rawLat,
              rawLng,
              idleRoadSegmentRef.current
            );
            if (elapsed > duration && Number.isFinite(idleRoadSegmentRef.current.bearingDeg)) {
              velocityBearingRef.current = idleRoadSegmentRef.current.bearingDeg;
            }
          }

          const [prevLat, prevLng] = currentMarkerPosRef.current;
          if (
            Math.abs(finalLat - prevLat) > 1e-8 ||
            Math.abs(finalLng - prevLng) > 1e-8
          ) {
            currentMarkerPosRef.current = [finalLat, finalLng];
            marker.setLngLat([finalLng, finalLat]);
          }
        }

        // B. Smooth shortest-arc rotation (~300 ms, zero 360° wrap jump)
        if (Math.abs(rotAnimDeltaDegRef.current) > 0.01) {
          const rotElapsed = Math.max(0, now - rotAnimStartTimeRef.current);
          const rotT = Math.min(1, rotElapsed / ROT_ANIM_DURATION_MS);
          const nextAngle = normalizeHeadingDeg(
            rotAnimStartAngleRef.current + rotAnimDeltaDegRef.current * rotT
          );
          currentMarkerAngleRef.current = nextAngle;
          marker.setRotation(nextAngle);
          if (rotT >= 1) {
            rotAnimDeltaDegRef.current = 0;
          }
        }
      }

      animFrameIdRef.current = requestAnimationFrame(animateVehicleChevron);
    };

    lastAnimTimeRef.current = performance.now();
    animFrameIdRef.current = requestAnimationFrame(animateVehicleChevron);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (animFrameIdRef.current !== null) {
        cancelAnimationFrame(animFrameIdRef.current);
        animFrameIdRef.current = null;
      }
    };
  }, []);

  // 4B. Independent Auto-Follow Camera Sync Loop
  // Completely paused during any 15-second user touch/gesture window so manual pan/zoom/rotate is never interrupted
  useEffect(() => {
    if (cameraFollowAnimFrameIdRef.current !== null) {
      cancelAnimationFrame(cameraFollowAnimFrameIdRef.current);
      cameraFollowAnimFrameIdRef.current = null;
    }

    let lastCamFrameTime = performance.now();

    const syncAutoFollowCamera = (now: number) => {
      const dt = Math.min(Math.max(0.001, (now - lastCamFrameTime) / 1000), 0.1);
      lastCamFrameTime = now;

      if (document.visibilityState === 'hidden') {
        cameraFollowAnimFrameIdRef.current = requestAnimationFrame(syncAutoFollowCamera);
        return;
      }

      const map = mapInstanceRef.current;
      const isPauseActive =
        isAutoFollowPausedRef.current ||
        isUserTouchingMapRef.current ||
        now < autoFollowPauseUntilRef.current;

      const isAutoFollowAllowed = Boolean(
        isFollowingRef.current &&
          !isPauseActive &&
          (isNavigatingRef.current || !hasAnyRoutesRef.current) &&
          !isProgrammaticMoveRef.current &&
          !isAtomicRecenterInFlightRef.current &&
          !pendingRecenterRef.current &&
          !isOverviewActiveRef.current &&
          !isPickingRadarLocationRef.current &&
          !isIdleUserPointerDownRef.current
      );

      if (map && isAutoFollowAllowed) {
        const [camLat, camLng] = currentMarkerPosRef.current;
        const tgtZoom = followCamTargetZoomRef.current;
        const tgtBearing = followCamTargetBearingRef.current;
        const tgtPitch = followCamTargetPitchRef.current;
        const tgtPadding = followCamTargetPaddingRef.current;

        if (cameraNeedsImmediateSnapRef.current) {
          cameraNeedsImmediateSnapRef.current = false;
          isProgrammaticCameraRef.current = true;
          isFollowCameraJumpActiveRef.current = true;
          try {
            map.jumpTo({
              center: [camLng, camLat],
              zoom: tgtZoom,
              bearing: tgtBearing,
              pitch: tgtPitch,
              padding: tgtPadding,
            });
            if (tgtPitch > 0) {
              verifyPitchedRender(map);
            }
          } catch {
            activateFlatFallback(map);
          } finally {
            isFollowCameraJumpActiveRef.current = false;
            isProgrammaticCameraRef.current = false;
          }
        } else {
          const curCenter = map.getCenter();
          const curZoom = map.getZoom();
          const curBearing = map.getBearing();
          const curPitch = map.getPitch();
          const curPadding = map.getPadding();
          const curPadTop = typeof curPadding?.top === 'number' ? curPadding.top : 0;
          const tgtPadTop = typeof tgtPadding?.top === 'number' ? tgtPadding.top : 0;

          const centerNeedsUpdate =
            Math.abs(curCenter.lat - camLat) > 1e-6 ||
            Math.abs(curCenter.lng - camLng) > 1e-6;
          const zoomDiff = tgtZoom - curZoom;
          const bearingDiff = shortestAngleDiffDeg(curBearing, tgtBearing);
          const pitchDiff = tgtPitch - curPitch;
          const padTopDiff = tgtPadTop - curPadTop;
          const isIdleBearingAnimActive = Boolean(
            !isNavigatingRef.current &&
              !hasAnyRoutesRef.current &&
              idleBearingAnimRef.current.active
          );

          const cameraNeedsAdjust =
            centerNeedsUpdate ||
            isIdleBearingAnimActive ||
            Math.abs(zoomDiff) > 0.003 ||
            Math.abs(bearingDiff) > 0.08 ||
            Math.abs(pitchDiff) > 0.08 ||
            Math.abs(padTopDiff) > 0.5;

          if (cameraNeedsAdjust) {
            const camFactor = 1 - Math.exp(-8 * dt);
            const rotCamFactor = 1 - Math.exp(-10 * dt);
            const zoomCamFactor = 1 - Math.exp(-3 * dt);

            // Smooth center convergence when resuming after manual pan, exact lock when already close
            const centerDistMeters = centerNeedsUpdate
              ? getDistanceMeters(curCenter.lat, curCenter.lng, camLat, camLng)
              : 0;
            const nextLat =
              centerDistMeters > 6 ? curCenter.lat + (camLat - curCenter.lat) * camFactor : camLat;
            const nextLng =
              centerDistMeters > 6 ? curCenter.lng + (camLng - curCenter.lng) * camFactor : camLng;

            const nextZoom = Math.abs(zoomDiff) > 0.003 ? curZoom + zoomDiff * zoomCamFactor : tgtZoom;
            let nextBearing: number;
            if (isIdleBearingAnimActive) {
              const anim = idleBearingAnimRef.current;
              const t = Math.min(1, Math.max(0, (now - anim.startTime) / anim.durationMs));
              const eased = 1 - Math.pow(1 - t, 3);
              const totalDelta = shortestAngleDiffDeg(anim.startBearing, anim.targetBearing);
              nextBearing = normalizeHeadingDeg(anim.startBearing + totalDelta * eased);
              if (t >= 1) {
                anim.active = false;
                nextBearing = anim.targetBearing;
              }
            } else {
              nextBearing =
                Math.abs(bearingDiff) > 0.08
                  ? curBearing + bearingDiff * rotCamFactor
                  : tgtBearing;
            }
            const nextPitch =
              Math.abs(pitchDiff) > 0.08 ? curPitch + pitchDiff * camFactor : tgtPitch;
            const nextPadTop =
              Math.abs(padTopDiff) > 0.5 ? curPadTop + padTopDiff * camFactor : tgtPadTop;

            isProgrammaticCameraRef.current = true;
            isFollowCameraJumpActiveRef.current = true;
            try {
              map.jumpTo({
                center: [nextLng, nextLat],
                zoom: nextZoom,
                bearing: nextBearing,
                pitch: nextPitch,
                padding: { ...tgtPadding, top: nextPadTop },
              });
            } catch {
              activateFlatFallback(map);
            } finally {
              isFollowCameraJumpActiveRef.current = false;
              isProgrammaticCameraRef.current = false;
            }
          }
        }
      }

      cameraFollowAnimFrameIdRef.current = requestAnimationFrame(syncAutoFollowCamera);
    };

    cameraFollowAnimFrameIdRef.current = requestAnimationFrame(syncAutoFollowCamera);

    return () => {
      if (cameraFollowAnimFrameIdRef.current !== null) {
        cancelAnimationFrame(cameraFollowAnimFrameIdRef.current);
        cameraFollowAnimFrameIdRef.current = null;
      }
    };
  }, [activateFlatFallback, verifyPitchedRender]);

  // Escucha pasiva de la brújula del celular (solo apoyo cuando GPS en movimiento > 5 km/h no entregue rumbo)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleOrientation = (e: DeviceOrientationEvent) => {
      try {
        const webkitHeading = (e as any).webkitCompassHeading;
        let heading: number | null = null;
        if (typeof webkitHeading === 'number' && Number.isFinite(webkitHeading)) {
          heading = webkitHeading;
        } else if (
          (e.absolute === true || e.type === 'deviceorientationabsolute') &&
          typeof e.alpha === 'number' &&
          Number.isFinite(e.alpha)
        ) {
          const screenAngle =
            typeof window.screen?.orientation?.angle === 'number'
              ? window.screen.orientation.angle
              : 0;
          heading = 360 - e.alpha + screenAngle;
        }
        if (heading !== null) {
          compassHeadingRef.current = normalizeHeadingDeg(heading);
        }
      } catch {}
    };

    window.addEventListener('deviceorientationabsolute', handleOrientation as EventListener, true);
    window.addEventListener('deviceorientation', handleOrientation as EventListener, true);
    return () => {
      window.removeEventListener('deviceorientationabsolute', handleOrientation as EventListener, true);
      window.removeEventListener('deviceorientation', handleOrientation as EventListener, true);
    };
  }, []);

  // Restaurar vista inclinada al cancelar vista previa y volver a la pantalla principal sin ruta
  useEffect(() => {
    const map = mapInstanceRef.current;
    const hasRoute = Boolean(activeRoute || routes.length > 0);
    if (!isNavigating) {
      if (!prevHasActiveRouteRef.current && hasRoute && map) {
        applyPitchGesturePolicy(map, { unlockingForTransition: true });
      } else if (prevHasActiveRouteRef.current && !hasRoute) {
        idleCommittedHeadingRef.current = null;
        idleBearingAnimRef.current.active = false;
        if (idleStopNorthTimerRef.current) {
          clearTimeout(idleStopNorthTimerRef.current);
          idleStopNorthTimerRef.current = null;
        }
        isIdleAutoOrientActiveRef.current = true;
        returnToIdleTrackingView(500);
      }
    }
    prevHasActiveRouteRef.current = hasRoute;
  }, [activeRoute, routes.length, isNavigating, applyPitchGesturePolicy, returnToIdleTrackingView]);

  // Sincronizar política de inclinación y cambio del interruptor "Perspectiva 3D" en pantalla principal
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const perspectiveChanged = prevIdlePerspective3DRef.current !== mapSettings.perspective3D;
    prevIdlePerspective3DRef.current = mapSettings.perspective3D;

    if (
      perspectiveChanged &&
      !isNavigatingRef.current &&
      !hasAnyRoutesRef.current &&
      !isOverviewActiveRef.current
    ) {
      if (idlePitchLockTimerRef.current) {
        clearTimeout(idlePitchLockTimerRef.current);
        idlePitchLockTimerRef.current = null;
      }

      if (!mapSettings.perspective3D) {
        applyPitchGesturePolicy(map, { unlockingForTransition: true });
        isManuallyRotatedRef.current = false;
        setIsManuallyRotated(false);
        setMapRotation(0);
        isIdleAutoOrientActiveRef.current = true;
        idleBearingAnimRef.current.active = false;
        followCamTargetPitchRef.current = 0;
        followCamTargetBearingRef.current = 0;
        followCamTargetPaddingRef.current = { top: 0, bottom: 0, left: 0, right: 0 };
        isProgrammaticMoveRef.current = true;
        beginProgrammaticCameraLock(map, 450);
        try {
          map.easeTo({
            pitch: 0,
            bearing: 0,
            padding: { top: 0, bottom: 0, left: 0, right: 0 },
            duration: 400,
            essential: true,
          });
        } catch {
          activateFlatFallback(map);
        }
        idlePitchLockTimerRef.current = setTimeout(() => {
          idlePitchLockTimerRef.current = null;
          isProgrammaticMoveRef.current = false;
          applyPitchGesturePolicy(map);
        }, 430);
      } else if (!flatFallbackActiveRef.current) {
        if (isFollowingRef.current && !isPickingRadarLocationRef.current) {
          returnToIdleTrackingView(500);
        } else {
          const targetPitch = getEffectiveIdlePitch();
          applyPitchGesturePolicy(map, { unlockingForTransition: true });
          followCamTargetPitchRef.current = targetPitch;
          isProgrammaticMoveRef.current = true;
          beginProgrammaticCameraLock(map, 450);
          try {
            map.easeTo({
              pitch: targetPitch,
              duration: 400,
              essential: true,
            });
            verifyPitchedRender(map);
          } catch {
            activateFlatFallback(map);
          }
          idlePitchLockTimerRef.current = setTimeout(() => {
            idlePitchLockTimerRef.current = null;
            isProgrammaticMoveRef.current = false;
            applyPitchGesturePolicy(map);
          }, 430);
        }
      }
      return;
    }

    if (!isProgrammaticMoveRef.current) {
      applyPitchGesturePolicy(map);
    }
  }, [
    isNavigating,
    mapSettings.perspective3D,
    isOverviewActive,
    applyPitchGesturePolicy,
    beginProgrammaticCameraLock,
    activateFlatFallback,
    returnToIdleTrackingView,
    getEffectiveIdlePitch,
    verifyPitchedRender,
  ]);

  useEffect(() => {
    return () => {
      if (idleStopNorthTimerRef.current) {
        clearTimeout(idleStopNorthTimerRef.current);
        idleStopNorthTimerRef.current = null;
      }
    };
  }, []);

  // 5. Target State Calculation, Snap-to-Road, Remaining Route Trim & Camera Target Sync
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const nowPerf = performance.now();
    const validBearing = resolveValidBearing(userLocation, activeRoute, speedKmh);

    // Sync follow camera targets continuously when follow / route / zoom inputs update
    const hasPendingTrigger =
      (recenterTrigger && recenterTrigger !== lastHandledRecenterTriggerRef.current) ||
      (overviewTrigger && overviewTrigger !== lastHandledOverviewTriggerRef.current);

    // Registro de desplazamiento en pantalla principal sin ruta para calcular rumbo de movimiento si hace falta
    const prevIdlePos = prevIdleGpsPosRef.current;
    let movedBearingFromGps: number | null = null;
    if (prevIdlePos) {
      const movedDist = getDistanceMeters(
        prevIdlePos.lat,
        prevIdlePos.lng,
        userLocation.lat,
        userLocation.lng
      );
      if (movedDist >= 2.5) {
        const b = getBearing(prevIdlePos.lat, prevIdlePos.lng, userLocation.lat, userLocation.lng);
        if (Number.isFinite(b)) {
          movedBearingFromGps = normalizeHeadingDeg(b);
        }
        prevIdleGpsPosRef.current = { lat: userLocation.lat, lng: userLocation.lng };
      }
    } else {
      prevIdleGpsPosRef.current = { lat: userLocation.lat, lng: userLocation.lng };
    }

    const isAutoFollowPauseActive =
      isAutoFollowPausedRef.current ||
      isUserTouchingMapRef.current ||
      nowPerf < autoFollowPauseUntilRef.current;

    if (
      isFollowing &&
      !isAutoFollowPauseActive &&
      (isNavigating || !hasAnyRoutesRef.current) &&
      !isProgrammaticMoveRef.current &&
      !isAtomicRecenterInFlightRef.current &&
      !pendingRecenterRef.current &&
      !hasPendingTrigger &&
      !isIdleUserPointerDownRef.current
    ) {
      const targetZoom = isNavigating
        ? calculateSmartZoom(distanceToNextStep, speedKmh)
        : calculateIdleZoom(speedKmh);
      let targetBearing =
        isNavigating && mapSettings.autoRotation && isHeadingUp ? validBearing : 0;

      // Orientación automática e inclinación en pantalla principal sin ruta activa
      if (!isNavigating && !hasAnyRoutesRef.current) {
        if (
          mapSettings.perspective3D &&
          !flatFallbackActiveRef.current &&
          mapSettings.autoRotation &&
          isIdleAutoOrientActiveRef.current
        ) {
          if (speedKmh > 5) {
            if (idleStopNorthTimerRef.current) {
              clearTimeout(idleStopNorthTimerRef.current);
              idleStopNorthTimerRef.current = null;
            }

            let candidateHeading: number | null = null;
            if (movedBearingFromGps !== null) {
              candidateHeading = movedBearingFromGps;
            } else if (
              userLocation.heading !== null &&
              userLocation.heading !== undefined &&
              Number.isFinite(userLocation.heading) &&
              userLocation.heading !== 0
            ) {
              candidateHeading = normalizeHeadingDeg(userLocation.heading);
            } else if (compassHeadingRef.current !== null) {
              // Brújula del celular solo como apoyo si el GPS no entrega rumbo en movimiento > 5 km/h
              candidateHeading = compassHeadingRef.current;
            }

            if (candidateHeading !== null) {
              if (
                idleCommittedHeadingRef.current === null ||
                Math.abs(shortestAngleDiffDeg(idleCommittedHeadingRef.current, candidateHeading)) >= 10
              ) {
                idleCommittedHeadingRef.current = candidateHeading;
              }
            }
          }
          // Si está detenido o < 5 km/h, mantiene la última orientación sin girar
          targetBearing = idleCommittedHeadingRef.current ?? 0;

          if (
            Math.abs(shortestAngleDiffDeg(followCamTargetBearingRef.current, targetBearing)) >= 0.5
          ) {
            idleBearingAnimRef.current = {
              active: true,
              startBearing: map.getBearing(),
              targetBearing,
              startTime: performance.now(),
              durationMs: 400,
            };
          }
        } else {
          idleBearingAnimRef.current.active = false;
          targetBearing = 0;
        }
      }

      const targetPitch = isNavigating
        ? getEffectiveNavPitch()
        : !hasAnyRoutesRef.current && mapSettings.perspective3D && !flatFallbackActiveRef.current
        ? getEffectiveIdlePitch()
        : 0;
      const targetPadding = getLowerThirdPadding(map);

      followCamTargetZoomRef.current = targetZoom;
      followCamTargetBearingRef.current = targetBearing;
      followCamTargetPitchRef.current = targetPitch;
      followCamTargetPaddingRef.current = targetPadding;

      if (!isManuallyRotatedRef.current) {
        setMapRotation(targetBearing);
      }
    }

    const fixSignature = `${userLocation.lat.toFixed(7)},${userLocation.lng.toFixed(7)},${
      userLocation.timestamp || 0
    },${isNavigating ? 1 : 0},${activeRoute?.id || ''}`;
    const isNewPositionEvent = fixSignature !== lastProcessedFixSignatureRef.current;

    if (isNewPositionEvent) {
      lastProcessedFixSignatureRef.current = fixSignature;

      let targetLat = userLocation.lat;
      let targetLng = userLocation.lng;
      let targetArrowBearing = normalizeHeadingDeg(validBearing);
      let snappedToRoute = false;
      let snappedToIdleRoad = false;

      const rawSpeedKmh =
        userLocation.speed !== null &&
        userLocation.speed !== undefined &&
        Number.isFinite(userLocation.speed)
          ? userLocation.speed * 3.6
          : speedKmh;
      const rawSpeedMps = Math.max(0, rawSpeedKmh / 3.6);

      if (isNavigating && activeRoute && activeRoute.coordinates.length >= 2) {
        idleRoadSegmentRef.current = null;
        const match = snapToActiveRoute(
          userLocation.lat,
          userLocation.lng,
          userLocation.heading,
          activeRoute.coordinates,
          ACTIVE_ROUTE_SNAP_MAX_METERS
        );

        targetLat = match.arrowPoint[0];
        targetLng = match.arrowPoint[1];
        targetArrowBearing = Number.isFinite(match.arrowBearing)
          ? normalizeHeadingDeg(match.arrowBearing)
          : targetArrowBearing;
        snappedToRoute = match.isSnapped;

        // Update remaining active route trimmed cleanly from the arrow's closest route point
        if (isMapStyleReadyRef.current && isMapStyleReadyForSources(map)) {
          const activeSrc = map.getSource(ACTIVE_ROUTE_SOURCE_ID) as
            | maplibregl.GeoJSONSource
            | undefined;
          if (activeSrc) {
            const coordsToDraw =
              match.remainingCoords.length >= 2 ? match.remainingCoords : activeRoute.coordinates;
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
          }
        }
      } else if (!isNavigating) {
        // Orientación fiel al movimiento/dirección real en modo conducción libre (sin ruta activa)
        const isMovingFastEnough = rawSpeedMps > FREE_DRIVE_MIN_MOVING_SPEED_MPS;
        const hasMovingGpsHeading =
          userLocation.heading !== null &&
          userLocation.heading !== undefined &&
          Number.isFinite(userLocation.heading) &&
          (isMovingFastEnough ||
            rawSpeedKmh >= 2 ||
            movedBearingFromGps !== null ||
            (lastValidHeadingRef.current === 0 && userLocation.heading !== 0));

        if (movedBearingFromGps !== null) {
          targetArrowBearing = movedBearingFromGps;
          lastValidHeadingRef.current = movedBearingFromGps;
        } else if (hasMovingGpsHeading) {
          targetArrowBearing = normalizeHeadingDeg(userLocation.heading as number);
          lastValidHeadingRef.current = targetArrowBearing;
        } else if (idleCommittedHeadingRef.current !== null) {
          targetArrowBearing = idleCommittedHeadingRef.current;
        } else if (compassHeadingRef.current !== null && rawSpeedKmh >= 1.5) {
          targetArrowBearing = compassHeadingRef.current;
        }

        // Snap-to-road magnético (radio 22m, tolerancia ±45°) al 100% sobre el eje de la vía compatible
        const hasReliableFreeDriveHeading = Boolean(
          isMovingFastEnough ||
            movedBearingFromGps !== null ||
            hasMovingGpsHeading ||
            targetArrowBearing !== 0
        );
        const roadProj = projectArrowOntoRoadSurface(
          map,
          userLocation.lat,
          userLocation.lng,
          targetArrowBearing,
          hasReliableFreeDriveHeading,
          rawSpeedMps
        );
        idleRoadSegmentRef.current = roadProj.segment;
        if (roadProj.projected) {
          snappedToIdleRoad = true;
          targetLat = roadProj.point[0];
          targetLng = roadProj.point[1];
          // Si está en movimiento (> 1.5 m/s) y hay vía compatible, alinear suavemente el rumbo al eje vial
          if (isMovingFastEnough && roadProj.roadBearing !== null) {
            targetArrowBearing = roadProj.roadBearing;
            lastValidHeadingRef.current = targetArrowBearing;
            if (
              !hasAnyRoutesRef.current &&
              mapSettings.perspective3D &&
              !flatFallbackActiveRef.current &&
              mapSettings.autoRotation &&
              isIdleAutoOrientActiveRef.current
            ) {
              idleCommittedHeadingRef.current = roadProj.roadBearing;
              if (
                isFollowing &&
                !isAutoFollowPauseActive &&
                !isProgrammaticMoveRef.current &&
                !isAtomicRecenterInFlightRef.current &&
                !pendingRecenterRef.current &&
                !hasPendingTrigger &&
                !isIdleUserPointerDownRef.current
              ) {
                followCamTargetBearingRef.current = roadProj.roadBearing;
                if (!isManuallyRotatedRef.current) {
                  setMapRotation(roadProj.roadBearing);
                }
              }
            }
          }
        }
      }

      isSnappedToRouteRef.current = snappedToRoute;
      if (snappedToRoute && activeRoute && activeRoute.coordinates.length >= 2) {
        const segProj = projectPointOntoRoutePolyline(
          targetLat,
          targetLng,
          activeRoute.coordinates,
          snappedSegmentIdxRef.current
        );
        snappedSegmentIdxRef.current = segProj.segmentIndex;
      } else {
        snappedSegmentIdxRef.current = 0;
      }

      const [curLat, curLng] = currentMarkerPosRef.current;
      const jumpMeters = getDistanceMeters(curLat, curLng, targetLat, targetLng);

      const shouldSnapDirectly =
        !hasInitializedArrowRef.current || snapOnNextFixRef.current || jumpMeters > 50;

      if (shouldSnapDirectly) {
        snapOnNextFixRef.current = false;
        hasInitializedArrowRef.current = true;
        targetMarkerPosRef.current = [targetLat, targetLng];
        currentMarkerPosRef.current = [targetLat, targetLng];
        posAnimStartRef.current = [targetLat, targetLng];
        posAnimEndRef.current = [targetLat, targetLng];
        posAnimStartTimeRef.current = nowPerf;
        posAnimDurationRef.current = 1000;
        lastGpsFixPerfTimeRef.current = nowPerf;
        isVehicleMovingRef.current = false;
        velocityMpsRef.current = rawSpeedMps;
        velocityBearingRef.current = targetArrowBearing;

        committedTargetAngleRef.current = targetArrowBearing;
        targetMarkerAngleRef.current = targetArrowBearing;
        currentMarkerAngleRef.current = targetArrowBearing;
        rotAnimStartAngleRef.current = targetArrowBearing;
        rotAnimDeltaDegRef.current = 0;

        if (userMarkerRef.current) {
          userMarkerRef.current.setLngLat([targetLng, targetLat]);
          userMarkerRef.current.setRotation(targetArrowBearing);
        }
        if (
          isFollowingRef.current &&
          !isAutoFollowPauseActive &&
          !isOverviewActiveRef.current &&
          !isPickingRadarLocationRef.current
        ) {
          cameraNeedsImmediateSnapRef.current = true;
        }
      } else if (rawSpeedKmh < 2) {
        if (!isNavigating && jumpMeters >= 1.5) {
          // Desplazamiento real lento o ajuste al eje vial: acompañar sin congelar
          targetMarkerPosRef.current = [targetLat, targetLng];
          posAnimStartRef.current = [curLat, curLng];
          posAnimEndRef.current = [targetLat, targetLng];
          posAnimStartTimeRef.current = nowPerf;
          posAnimDurationRef.current = 600;
          lastGpsFixPerfTimeRef.current = nowPerf;
          isVehicleMovingRef.current = true;
          velocityMpsRef.current = 0;
          velocityBearingRef.current = targetArrowBearing;
        } else {
          // Detenido sin desplazamiento real (< 1.5m): evitar temblor GPS
          isVehicleMovingRef.current = false;
          velocityMpsRef.current = 0;
          lastGpsFixPerfTimeRef.current = null;
          posAnimStartRef.current = [...currentMarkerPosRef.current];
          posAnimEndRef.current = [...currentMarkerPosRef.current];
          targetMarkerPosRef.current = [...currentMarkerPosRef.current];
        }

        if (!isNavigating) {
          const headingDelta = shortestAngleDiffDeg(
            committedTargetAngleRef.current,
            targetArrowBearing
          );
          if (Math.abs(headingDelta) >= (jumpMeters >= 1.5 ? 5 : 8)) {
            committedTargetAngleRef.current = targetArrowBearing;
            targetMarkerAngleRef.current = targetArrowBearing;
            rotAnimStartAngleRef.current = currentMarkerAngleRef.current;
            rotAnimDeltaDegRef.current = shortestAngleDiffDeg(
              currentMarkerAngleRef.current,
              targetArrowBearing
            );
            rotAnimStartTimeRef.current = nowPerf;
          }
        }
      } else {
        // Normal moving update: linear interpolation over elapsed inter-fix interval (~1000 ms)
        let intervalMs = 1000;
        if (lastGpsFixPerfTimeRef.current !== null) {
          const measuredMs = nowPerf - lastGpsFixPerfTimeRef.current;
          if (measuredMs >= 200 && measuredMs <= 2500) {
            intervalMs = Math.max(250, Math.min(2000, measuredMs));
          }
        }
        lastGpsFixPerfTimeRef.current = nowPerf;

        targetMarkerPosRef.current = [targetLat, targetLng];
        posAnimStartRef.current = [curLat, curLng];
        posAnimEndRef.current = [targetLat, targetLng];
        posAnimStartTimeRef.current = nowPerf;
        posAnimDurationRef.current = intervalMs;
        isVehicleMovingRef.current = true;

        const segSpeedMps = jumpMeters > 0.3 ? jumpMeters / (intervalMs / 1000) : rawSpeedMps;
        velocityMpsRef.current = rawSpeedKmh >= 2 ? rawSpeedMps : segSpeedMps;
        velocityBearingRef.current = targetArrowBearing;

        // Smooth rotation (~300 ms) along shortest angular arc; tight 1.5° deadband when snapped to lane axis
        const headingDelta = shortestAngleDiffDeg(
          committedTargetAngleRef.current,
          targetArrowBearing
        );
        const headingNoiseThreshold = snappedToRoute || snappedToIdleRoad ? 1.5 : 5;
        if (Math.abs(headingDelta) >= headingNoiseThreshold) {
          committedTargetAngleRef.current = targetArrowBearing;
          targetMarkerAngleRef.current = targetArrowBearing;
          rotAnimStartAngleRef.current = currentMarkerAngleRef.current;
          rotAnimDeltaDegRef.current = shortestAngleDiffDeg(
            currentMarkerAngleRef.current,
            targetArrowBearing
          );
          rotAnimStartTimeRef.current = nowPerf;
        }
      }
    }

    // Create or swap marker element only when navigating / preview / idle mode changes
    const isPreviewMode = !isNavigating && (routes.length > 0 || Boolean(activeRoute));
    const desiredIconKey = isNavigating
      ? 'nav_waze'
      : isPreviewMode
      ? 'preview_dot'
      : 'idle_waze';
    if (!userMarkerRef.current || currentIconModeRef.current !== desiredIconKey) {
      currentIconModeRef.current = desiredIconKey;

      if (userMarkerRef.current) {
        userMarkerRef.current.remove();
        userMarkerRef.current = null;
      }

      const [initLat, initLng] = currentMarkerPosRef.current;
      userMarkerRef.current = createVehicleChevronMarker(map, {
        isNavigating,
        isPreviewMode,
        lat: initLat,
        lng: initLng,
        angle: currentMarkerAngleRef.current,
      });
    }
  }, [
    userLocation,
    isFollowing,
    isNavigating,
    isHeadingUp,
    mapSettings.autoRotation,
    mapSettings.perspective3D,
    mapTileMode,
    activeRoute,
    routes.length,
    distanceToNextStep,
    speedKmh,
    recenterTrigger,
    overviewTrigger,
    calculateSmartZoom,
    calculateIdleZoom,
    getLowerThirdPadding,
    resolveValidBearing,
    getEffectiveNavPitch,
    getEffectiveIdlePitch,
  ]);

  const computePreviewFitLayout = useCallback(
    (
      map: maplibregl.Map,
      routesList: RouteData[],
      destForBounds: Coordinates | null
    ) => {
      const bounds = new maplibregl.LngLatBounds();
      for (const r of routesList) {
        for (const [lat, lng] of r.coordinates) {
          bounds.extend([lng, lat]);
        }
      }
      const currUserLoc = userLocationRef.current;
      if (
        Number.isFinite(currUserLoc?.lat) &&
        Number.isFinite(currUserLoc?.lng) &&
        !(Math.abs(currUserLoc.lat) < 0.01 && Math.abs(currUserLoc.lng) < 0.01)
      ) {
        bounds.extend([currUserLoc.lng, currUserLoc.lat]);
      }
      if (destForBounds && Number.isFinite(destForBounds.lat) && Number.isFinite(destForBounds.lng)) {
        bounds.extend([destForBounds.lng, destForBounds.lat]);
      }

      const containerHeight = map.getContainer()?.clientHeight || window.innerHeight || 720;
      const containerWidth = map.getContainer()?.clientWidth || window.innerWidth || 360;
      const navCardEl =
        typeof document !== 'undefined' ? document.querySelector('.nav-card') : null;
      const measuredPanelHeight = navCardEl
        ? Math.round(navCardEl.getBoundingClientRect().height)
        : 215;

      const topPad = 100;
      const rightPad = containerWidth < 260 ? 60 : 90;
      const leftPad = containerWidth < 260 ? 20 : 40;
      const desiredBottomPad = measuredPanelHeight + 30;
      const maxSafeBottomPad = Math.max(120, containerHeight - topPad - 60);
      const bottomPad = Math.min(desiredBottomPad, maxSafeBottomPad);

      return {
        bounds,
        measuredPanelHeight,
        padding: { top: topPad, bottom: bottomPad, left: leftPad, right: rightPad },
      };
    },
    []
  );

  const runPreviewFitBounds = useCallback(
    (
      map: maplibregl.Map,
      routesList: RouteData[],
      destForBounds: Coordinates | null,
      durationMs: number = 600,
      reason: string = 'preview'
    ) => {
      if (isNavigatingRef.current || routesList.length === 0) return;

      // 1. Pausar seguimiento automático y cancelar cualquier animación/temporizador de cámara previo
      if (previewFitTimeoutRef.current) {
        clearTimeout(previewFitTimeoutRef.current);
        previewFitTimeoutRef.current = null;
      }
      if (idlePitchLockTimerRef.current) {
        clearTimeout(idlePitchLockTimerRef.current);
        idlePitchLockTimerRef.current = null;
      }
      if (idleStopNorthTimerRef.current) {
        clearTimeout(idleStopNorthTimerRef.current);
        idleStopNorthTimerRef.current = null;
      }
      if (programmaticClearTimerRef.current) {
        clearTimeout(programmaticClearTimerRef.current);
        programmaticClearTimerRef.current = null;
      }
      if (recenterWaitTimerRef.current) {
        clearTimeout(recenterWaitTimerRef.current);
        recenterWaitTimerRef.current = null;
      }

      idleBearingAnimRef.current.active = false;
      cameraNeedsImmediateSnapRef.current = false;
      isIdleAutoOrientActiveRef.current = false;
      isAtomicRecenterInFlightRef.current = false;
      pendingRecenterRef.current = false;
      isManuallyRotatedRef.current = false;
      setIsManuallyRotated(false);
      setMapRotation(0);

      if (isFollowingRef.current) {
        onToggleFollowRef.current(false);
      }

      map.stop();

      // 2. Limpiar padding residual de la pantalla principal y fijar vista vertical (pitch 0, Norte arriba)
      try {
        map.setPadding({ top: 0, bottom: 0, left: 0, right: 0 });
      } catch {}

      applyPitchGesturePolicy(map, { unlockingForTransition: true });
      try {
        map.setMinZoom(8);
        map.setMaxZoom(19);
      } catch {}

      const { bounds, measuredPanelHeight, padding } = computePreviewFitLayout(
        map,
        routesList,
        destForBounds
      );
      if (bounds.isEmpty()) {
        applyPitchGesturePolicy(map);
        return;
      }
      lastFittedPanelHeightRef.current = measuredPanelHeight;

      followCamTargetPitchRef.current = 0;
      followCamTargetBearingRef.current = 0;
      followCamTargetPaddingRef.current = { top: 0, bottom: 0, left: 0, right: 0 };

      let computedZoom: number | null = null;
      try {
        const cam = map.cameraForBounds(bounds, {
          padding,
          bearing: 0,
          maxZoom: 17,
        });
        if (cam && typeof cam.zoom === 'number' && Number.isFinite(cam.zoom)) {
          computedZoom = Math.min(17, Math.max(8, cam.zoom));
        }
      } catch {}

      const sw = bounds.getSouthWest();
      const ne = bounds.getNorthEast();
      console.log('[RutaLima][PreviewFitBounds]', {
        reason,
        zoom: computedZoom !== null ? Number(computedZoom.toFixed(2)) : null,
        bounds: {
          southWest: { lat: Number(sw.lat.toFixed(6)), lng: Number(sw.lng.toFixed(6)) },
          northEast: { lat: Number(ne.lat.toFixed(6)), lng: Number(ne.lng.toFixed(6)) },
        },
        padding,
        routesCount: routesList.length,
      });

      isProgrammaticMoveRef.current = true;
      beginProgrammaticCameraLock(map, durationMs + 80);

      let finalized = false;
      const finalizePreviewFit = () => {
        if (finalized) return;
        finalized = true;
        map.off('moveend', finalizePreviewFit);
        if (previewFitTimeoutRef.current) {
          clearTimeout(previewFitTimeoutRef.current);
          previewFitTimeoutRef.current = null;
        }
        isProgrammaticMoveRef.current = false;
        if (!isNavigatingRef.current && hasAnyRoutesRef.current) {
          applyPitchGesturePolicy(map);
        }
      };

      map.once('moveend', finalizePreviewFit);
      previewFitTimeoutRef.current = setTimeout(finalizePreviewFit, durationMs + 95);

      try {
        map.fitBounds(bounds, {
          padding,
          bearing: 0,
          pitch: 0,
          maxZoom: 17,
          duration: durationMs,
          linear: true,
          essential: true,
        });
      } catch {
        finalizePreviewFit();
      }
    },
    [computePreviewFitLayout, applyPitchGesturePolicy, beginProgrammaticCameraLock]
  );

  const schedulePreviewFitBounds = useCallback(
    (reason: string, delayMs: number = 300, opts?: { force?: boolean }) => {
      if (previewFitDebounceTimerRef.current) {
        clearTimeout(previewFitDebounceTimerRef.current);
        previewFitDebounceTimerRef.current = null;
      }
      if (!opts?.force && userInteractedInPreviewRef.current) return;

      previewFitDebounceTimerRef.current = setTimeout(() => {
        previewFitDebounceTimerRef.current = null;
        const map = mapInstanceRef.current;
        if (!map || isNavigatingRef.current) return;
        if (!opts?.force && userInteractedInPreviewRef.current) return;
        const currRoutes =
          routesRef.current.length > 0
            ? routesRef.current
            : activeRouteRef.current
            ? [activeRouteRef.current]
            : [];
        if (currRoutes.length === 0) return;

        const destForBounds =
          activeRouteRef.current?.destinationCoords ||
          routesRef.current[0]?.destinationCoords ||
          destinationCoordsRef.current ||
          null;
        runPreviewFitBounds(map, currRoutes, destForBounds, 600, reason);
      }, delayMs);
    },
    [runPreviewFitBounds]
  );

  handleUserPreviewRouteTapRef.current = (tappedRoute: RouteData) => {
    userInteractedInPreviewRef.current = false;
    if (previewFitDebounceTimerRef.current) {
      clearTimeout(previewFitDebounceTimerRef.current);
      previewFitDebounceTimerRef.current = null;
    }
    if (previewFitInitialRafRef.current !== null) {
      cancelAnimationFrame(previewFitInitialRafRef.current);
      previewFitInitialRafRef.current = null;
    }
    lastSelectedPreviewRouteIdRef.current = tappedRoute.id;
    onSelectRouteRef.current?.(tappedRoute);

    const map = mapInstanceRef.current;
    if (map && !isNavigatingRef.current) {
      const currRoutes =
        routesRef.current.length > 0
          ? routesRef.current
          : activeRouteRef.current
          ? [activeRouteRef.current]
          : [tappedRoute];
      const destForBounds =
        tappedRoute.destinationCoords ||
        activeRouteRef.current?.destinationCoords ||
        destinationCoordsRef.current ||
        null;
      runPreviewFitBounds(map, currRoutes, destForBounds, 600, 'route-tap');
    }
  };

  // 6. Draw Routes, Globitos & Destination Pin
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Update GeoJSON lines
    if (isMapStyleReadyRef.current && isMapStyleReadyForSources(map)) {
      syncRouteDataToMap(map);
    }

    // Clear previous globitos
    routeTimeMarkersRef.current.forEach((m) => m.remove());
    routeTimeMarkersRef.current = [];

    // Clear previous destination marker
    if (destMarkerRef.current) {
      destMarkerRef.current.remove();
      destMarkerRef.current = null;
    }

    const routesToDraw = isNavigating
      ? activeRoute
        ? [activeRoute]
        : []
      : routes.length > 0
      ? routes
      : activeRoute
      ? [activeRoute]
      : [];

    if (routesToDraw.length === 0) {
      lastFittedRouteKeyRef.current = null;
      lastFittedDestKeyRef.current = null;
      lastFittedPanelHeightRef.current = null;
      lastSelectedPreviewRouteIdRef.current = null;
      userInteractedInPreviewRef.current = false;
      if (previewFitDebounceTimerRef.current) {
        clearTimeout(previewFitDebounceTimerRef.current);
        previewFitDebounceTimerRef.current = null;
      }
      if (previewFitInitialRafRef.current !== null) {
        cancelAnimationFrame(previewFitInitialRafRef.current);
        previewFitInitialRafRef.current = null;
      }
      if (destinationCoords) {
        destMarkerRef.current = createDestinationPinMarker(map, destinationCoords);
        syncDestCollisionBlocker(map, destinationCoords);
      } else {
        syncDestCollisionBlocker(map, null);
      }
      return;
    }

    const allCoordinates: [number, number][] = [];
    const sortedByDuration = [...routesToDraw].sort((a, b) => a.duration - b.duration);
    const fastestId = sortedByDuration[0]?.id;
    const selectedId = activeRoute ? activeRoute.id : fastestId;
    const targetDestination = activeRoute || (routes.length > 0 ? routes[0] : null);
    const destForBounds =
      targetDestination?.destinationCoords || destinationCoords || null;

    routesToDraw.forEach((r) => {
      allCoordinates.push(...r.coordinates);
    });

    if (!isNavigating && allCoordinates.length > 0) {
      const { padding } = computePreviewFitLayout(map, routesToDraw, destForBounds);
      const labelCoordsMap = computeNonOverlappingRouteLabelCoords(
        map,
        routesToDraw,
        selectedId,
        fastestId,
        userLocationRef.current,
        destForBounds,
        padding
      );

      routeTimeMarkersRef.current = createPreviewRouteTimeMarkers(
        map,
        routesToDraw,
        selectedId,
        fastestId,
        labelCoordsMap,
        () => isNavigatingRef.current,
        (r) => handleUserPreviewRouteTapRef.current(r)
      );
    }

    // Destination Pin for the active route (exact tip anchored at destination coordinate)
    if (targetDestination) {
      const destCoords = targetDestination.destinationCoords;
      destMarkerRef.current = createDestinationPinMarker(map, destCoords);
      syncDestCollisionBlocker(map, destCoords);
    } else {
      syncDestCollisionBlocker(map, null);
    }

    // Auto-fit routes when previewing (from point A to point B, flat, North-up, clear of HUD/buttons)
    if (!isNavigating && allCoordinates.length > 0) {
      const destKey = destForBounds
        ? `${destForBounds.lat.toFixed(5)}_${destForBounds.lng.toFixed(5)}`
        : 'none';
      const currentRouteKey =
        routesToDraw.map((r) => `${r.id}_${r.coordinates.length}`).join('|') + `_${destKey}`;

      const wasEmpty = lastFittedRouteKeyRef.current === null;
      const isNewDestination = lastFittedDestKeyRef.current !== destKey;

      if (isNewDestination) {
        lastFittedDestKeyRef.current = destKey;
        userInteractedInPreviewRef.current = false;
      }

      if (lastFittedRouteKeyRef.current !== currentRouteKey) {
        lastFittedRouteKeyRef.current = currentRouteKey;
        lastSelectedPreviewRouteIdRef.current = selectedId || null;

        if (wasEmpty || isNewDestination) {
          userInteractedInPreviewRef.current = false;
          if (isFollowingRef.current) {
            onToggleFollowRef.current(false);
          }
          map.stop();
          if (previewFitInitialRafRef.current !== null) {
            cancelAnimationFrame(previewFitInitialRafRef.current);
          }
          previewFitInitialRafRef.current = requestAnimationFrame(() => {
            previewFitInitialRafRef.current = null;
            if (!isNavigatingRef.current && !userInteractedInPreviewRef.current) {
              runPreviewFitBounds(map, routesToDraw, destForBounds, 600, 'initial-preview');
            }
          });
        } else if (!userInteractedInPreviewRef.current) {
          schedulePreviewFitBounds('alternative-route-updated', 300);
        }
      } else if (selectedId && selectedId !== lastSelectedPreviewRouteIdRef.current) {
        lastSelectedPreviewRouteIdRef.current = selectedId;
        userInteractedInPreviewRef.current = false;
        runPreviewFitBounds(map, routesToDraw, destForBounds, 600, 'route-selected');
      }
    } else if (isNavigating) {
      lastFittedRouteKeyRef.current = null;
      lastFittedDestKeyRef.current = null;
      lastFittedPanelHeightRef.current = null;
      lastSelectedPreviewRouteIdRef.current = null;
      userInteractedInPreviewRef.current = false;
    }
  }, [
    routes,
    activeRoute,
    destinationCoords,
    isNavigating,
    syncRouteDataToMap,
    syncDestCollisionBlocker,
    computePreviewFitLayout,
    runPreviewFitBounds,
    schedulePreviewFitBounds,
  ]);

  // 6a-preview-style. Optimizar contraste, grosor y nitidez del mapa base durante la selección / vista previa de rutas
  const prevRoutePreviewStyleRef = useRef<boolean>(false);
  useEffect(() => {
    if (prevRoutePreviewStyleRef.current === isRoutePreviewActive) return;
    prevRoutePreviewStyleRef.current = isRoutePreviewActive;

    const map = mapInstanceRef.current;
    if (!map || !isMapStyleReadyRef.current || !isMapStyleReadyForSources(map)) return;
    if (isOverviewActiveRef.current) return;

    if (isRoutePreviewActive) {
      applyRoutePreviewMapStyle(map, mapTileModeRef.current);
      syncBuildings3DLayer(map);
      syncRouteDataToMap(map);
    } else {
      applyWazeStyleEnhancements(map, mapTileModeRef.current);
      syncBuildings3DLayer(map);
      syncRouteDataToMap(map);
    }
  }, [isRoutePreviewActive, syncBuildings3DLayer, syncRouteDataToMap]);

  // 6a-bis. Reencuadra suavemente (debounce ~300 ms) al terminar de cargar, cambiar tamaño del panel o rotar/redimensionar pantalla
  useEffect(() => {
    const map = mapInstanceRef.current;
    const routesToFit =
      routes.length > 0 ? routes : activeRoute ? [activeRoute] : [];

    const finishedLoading = prevIsLoadingRouteRef.current && !isLoadingRoute;
    prevIsLoadingRouteRef.current = isLoadingRoute;

    if (!map || isNavigating || routesToFit.length === 0) return;

    if (finishedLoading && !userInteractedInPreviewRef.current) {
      schedulePreviewFitBounds('loading-finished', 300);
    }

    let observer: ResizeObserver | null = null;
    let attachRaf: number | null = null;

    const handleScreenResize = () => {
      if (isNavigatingRef.current || !hasAnyRoutesRef.current || userInteractedInPreviewRef.current) {
        return;
      }
      schedulePreviewFitBounds('screen-resize', 300);
    };

    window.addEventListener('resize', handleScreenResize);
    window.addEventListener('orientationchange', handleScreenResize);

    const attachObserver = () => {
      const navCardEl =
        typeof document !== 'undefined' ? document.querySelector('.nav-card') : null;
      if (!navCardEl || typeof ResizeObserver === 'undefined') return false;

      observer = new ResizeObserver(() => {
        if (isNavigatingRef.current || userInteractedInPreviewRef.current) return;
        const currRoutes =
          routesRef.current.length > 0
            ? routesRef.current
            : activeRouteRef.current
            ? [activeRouteRef.current]
            : [];
        if (currRoutes.length === 0) return;
        const nextHeight = Math.round(navCardEl.getBoundingClientRect().height);
        if (
          lastFittedPanelHeightRef.current !== null &&
          Math.abs(nextHeight - lastFittedPanelHeightRef.current) < 4
        ) {
          return;
        }
        schedulePreviewFitBounds('panel-resize', 300);
      });
      observer.observe(navCardEl);
      return true;
    };

    if (!attachObserver()) {
      attachRaf = requestAnimationFrame(() => {
        attachObserver();
      });
    }

    return () => {
      window.removeEventListener('resize', handleScreenResize);
      window.removeEventListener('orientationchange', handleScreenResize);
      if (attachRaf !== null) cancelAnimationFrame(attachRaf);
      if (observer) observer.disconnect();
    };
  }, [isNavigating, isLoadingRoute, routes, activeRoute, destinationCoords, schedulePreviewFitBounds]);

  // 6b. Active Navigation Maneuver Overlays on Blue Route (full-curve Waze turn arrow + light-cyan next street bubble)
  useEffect(() => {
    const map = mapInstanceRef.current;
    const clearTurnArrow = () => {
      maneuverGeoJsonRef.current = EMPTY_MANEUVER_FC;
      if (map) {
        updateManeuverArrowSource(map, EMPTY_MANEUVER_FC);
      }
    };
    const clearStreetBubble = () => {
      if (nextStreetBubbleMarkerRef.current) {
        nextStreetBubbleMarkerRef.current.remove();
        nextStreetBubbleMarkerRef.current = null;
      }
      nextStreetBubbleLabelRef.current = '';
    };

    if (
      !map ||
      !isNavigating ||
      !activeRoute ||
      activeRoute.coordinates.length < 2 ||
      !currentStep
    ) {
      clearTurnArrow();
      clearStreetBubble();
      return;
    }

    const coords = activeRoute.coordinates;
    const turnIdx = findClosestVertexIndex(
      coords,
      currentStep.coordinates[0],
      currentStep.coordinates[1]
    );
    const turnPt = coords[turnIdx] || currentStep.coordinates;
    const distUserToTurn = getDistanceMeters(userLocation.lat, userLocation.lng, turnPt[0], turnPt[1]);

    const isDayMode = mapTileMode === 'day';

    // A) Flecha blanca con contorno oscuro sobre la ruta morada (solo el siguiente giro dentro de 300 m)
    const effectiveTurnDistance = Number.isFinite(distanceToNextStep)
      ? Math.min(distanceToNextStep, distUserToTurn)
      : distUserToTurn;
    const shouldShowRouteArrow =
      effectiveTurnDistance <= 300 &&
      currentStep.type !== 'depart' &&
      !(currentStep.type === 'arrive' && effectiveTurnDistance < 12);
    const maneuverGeoJSON = shouldShowRouteArrow
      ? buildManeuverArrowGeoJSON(coords, currentStep)
      : EMPTY_MANEUVER_FC;
    maneuverGeoJsonRef.current = maneuverGeoJSON;

    if (isMapStyleReadyRef.current && isMapStyleReadyForSources(map)) {
      if (ensureRouteLayers(map)) {
        updateManeuverArrowSource(map, maneuverGeoJSON);
      }
    }

    // B) Next-street bubble on the active route
    const rawStreetName = (currentStep.name || nextStep?.name || '').trim();
    if (!rawStreetName) {
      clearStreetBubble();
      return;
    }

    // In Day Mode, hide the next-turn street bubble when the turn is more than 800m away
    if (isDayMode && distUserToTurn > 800) {
      clearStreetBubble();
      return;
    }

    const bubblePt = computeNextStreetBubblePoint(
      coords,
      turnIdx,
      turnPt,
      userLocation.lat,
      userLocation.lng,
      distUserToTurn,
      isDayMode
    );

    const destCoords = activeRoute.destinationCoords;
    const distFromUser = bubblePt
      ? getDistanceMeters(userLocation.lat, userLocation.lng, bubblePt[0], bubblePt[1])
      : 0;
    const distFromDest =
      bubblePt && destCoords
        ? getDistanceMeters(destCoords.lat, destCoords.lng, bubblePt[0], bubblePt[1])
        : 999;

    if (!bubblePt || distFromUser < 40 || distFromDest < 24) {
      clearStreetBubble();
      return;
    }

    if (
      !nextStreetBubbleMarkerRef.current ||
      nextStreetBubbleLabelRef.current !== rawStreetName ||
      nextStreetBubbleModeRef.current !== mapTileMode
    ) {
      clearStreetBubble();
      nextStreetBubbleLabelRef.current = rawStreetName;
      nextStreetBubbleModeRef.current = mapTileMode;
      nextStreetBubbleMarkerRef.current = createNextStreetBubbleMarker(
        map,
        rawStreetName,
        isDayMode,
        bubblePt
      );
    } else {
      nextStreetBubbleMarkerRef.current.setLngLat([bubblePt[1], bubblePt[0]]);
    }
  }, [isNavigating, mapTileMode, activeRoute, currentStep, nextStep, distanceToNextStep, userLocation.lat, userLocation.lng]);

  // 6c. Resolve current street name pill for Day Mode navigation
  useEffect(() => {
    if (!isNavigating || mapTileMode !== 'day') {
      setResolvedCurrentStreet('');
      return;
    }

    const trimmedRouteStreet = (currentRoadName || '').trim();
    let isNearActiveRoute = false;
    if (trimmedRouteStreet && activeRoute && activeRoute.coordinates.length >= 2) {
      const match = matchUserToRoute(
        userLocation.lat,
        userLocation.lng,
        userLocation.heading,
        activeRoute.coordinates
      );
      if (match.distanceToRoute <= 40) {
        isNearActiveRoute = true;
      }
    }

    if (trimmedRouteStreet && isNearActiveRoute) {
      setResolvedCurrentStreet(trimmedRouteStreet);
      return;
    }

    const map = mapInstanceRef.current;
    if (map && isMapStyleReadyRef.current && isMapStyleReadyForSources(map)) {
      try {
        const pt = map.project([userLocation.lng, userLocation.lat]);
        const queryLayers = [
          'roadname_minor',
          'roadname_sec',
          'roadname_pri',
          'roadname_major',
          'road_minor_fill',
          'road_sec_fill_noramp',
          'road_pri_fill_noramp',
          'road_trunk_fill_noramp',
          'road_mot_fill_noramp',
        ].filter((id) => Boolean(map.getLayer(id)));

        if (queryLayers.length > 0) {
          const features = map.queryRenderedFeatures(
            [
              [pt.x - 32, pt.y - 32],
              [pt.x + 32, pt.y + 32],
            ],
            { layers: queryLayers }
          );
          for (const f of features) {
            const props = f.properties as Record<string, any> | undefined;
            const n1 = typeof props?.name === 'string' ? props.name.trim() : '';
            const n2 = typeof props?.name2 === 'string' ? props.name2.trim() : '';
            const combined = [n1, n2].filter(Boolean).join(' ').trim();
            if (combined) {
              setResolvedCurrentStreet(combined);
              return;
            }
          }
        }
      } catch {}
    }

    setResolvedCurrentStreet(trimmedRouteStreet);
  }, [
    isNavigating,
    mapTileMode,
    currentRoadName,
    activeRoute,
    userLocation.lat,
    userLocation.lng,
    userLocation.heading,
  ]);

  // 7. Traffic Incident Markers with Unified Community Report Card
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    alertMarkersRef.current = syncTrafficAlertMarkersOnMap(map, {
      trafficAlerts,
      existingMarkers: alertMarkersRef.current,
      isOverviewActive: () => isOverviewActiveRef.current,
      justExitedOverviewUntil: justExitedOverviewUntilRef.current,
      onAlertClick: (alert) => {
        dismissLongPressRef.current();
        setSelectedPoi(null);
        setSelectedFixedRadar(null);
        openCommunityAlertCard(alert);
      },
    });
  }, [trafficAlerts, alertOpacityTick, openCommunityAlertCard]);

  // Keep selectedCommunityAlert synchronized with latest trafficAlerts state
  useEffect(() => {
    if (isCommunityAlertClosingRef.current) return;
    setSelectedCommunityAlert((prev) => {
      if (!prev) return null;
      const latest = trafficAlerts.find((a) => a.id === prev.id);
      if (!latest || isAlertExpired(latest, Date.now()) || (latest.removalVotes || 0) >= 3) {
        return null;
      }
      return latest;
    });
  }, [trafficAlerts, alertOpacityTick]);

  // 7b. OpenStreetMap POIs (Overpass + extracción instantánea de teselas vectoriales CARTO/OSM)
  const poiVectorSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const syncVectorTilePoisFromMap = useCallback((map: maplibregl.Map): number => {
    try {
      if (!isMapStyleReadyForSources(map)) return 0;
      const currentZoom = map.getZoom();
      if (currentZoom < 15) return 0;
      if (!map.getSource('protomaps')) return 0;
      const features = map.querySourceFeatures('protomaps', { sourceLayer: 'pois' });
      if (!features || features.length === 0) return 0;
      const added = ingestVectorTileFeatures(features, currentZoom);
      if (added > 0) {
        onPoisUpdatedRef.current?.(getAllCachedPois());
      }
      return added;
    } catch {
      return 0;
    }
  }, []);

  const updatePoiLayerVisibility = useCallback((map: maplibregl.Map) => {
    const visible = Boolean(mapSettingsRef.current.poiEnabled && !isOverviewActiveRef.current);
    updatePoiLayersVisibility(map, visible);
  }, []);

  const syncPoiGeoJsonSource = useCallback(
    (map: maplibregl.Map, forceDataUpdate = false) => {
      const currentSettings = mapSettingsRef.current;
      syncPoiGeoJsonLayers(map, {
        forceDataUpdate,
        poiEnabled: Boolean(currentSettings.poiEnabled),
        poiCategories: currentSettings.poiCategories,
        isOverviewActive: () => isOverviewActiveRef.current,
        isPickingRadarLocation: () => isPickingRadarLocationRef.current,
        isPoiEnabled: () => Boolean(mapSettingsRef.current.poiEnabled),
        isNavigating: isNavigatingRef.current,
        activeRoute: activeRouteRef.current,
        getLastSignature: () => lastPoiSourceSignatureRef.current,
        setLastSignature: (sig) => {
          lastPoiSourceSignatureRef.current = sig;
        },
        isListenersBound: () => poiLayerListenersBoundRef.current,
        markListenersBound: () => {
          poiLayerListenersBoundRef.current = true;
        },
        getCachedPoiById: (id) => cachedPoisByIdRef.current.get(id),
        setCachedPoisLookup: (lookup) => {
          cachedPoisByIdRef.current = lookup;
        },
        onSyncVectorTilePois: syncVectorTilePoisFromMap,
        onPoiClick: (found) => {
          poiFeatureClickedAtRef.current = performance.now();
          dismissLongPressRef.current();
          setSelectedFixedRadar(null);
          closeCommunityAlertImmediate();
          setSelectedPoi(found);
        },
      });
    },
    [syncVectorTilePoisFromMap]
  );

  const syncPoiGeoJsonSourceRef = useRef(syncPoiGeoJsonSource);
  syncPoiGeoJsonSourceRef.current = syncPoiGeoJsonSource;

  const schedulePoiRefresh = useCallback(
    (immediate = false) => {
      const map = mapInstanceRef.current;
      if (!map) return;

      if (poiDebounceTimerRef.current) {
        clearTimeout(poiDebounceTimerRef.current);
        poiDebounceTimerRef.current = null;
      }
      if (poiRetryTimerRef.current) {
        clearTimeout(poiRetryTimerRef.current);
        poiRetryTimerRef.current = null;
      }

      // Sincroniza inmediatamente la capa nativa de lugares sin recalcular posiciones en cada frame
      syncPoiGeoJsonSource(map, false);

      const currentSettings = mapSettingsRef.current;
      const hasAnyCategoryEnabled = Object.values(currentSettings.poiCategories || {}).some(Boolean);
      if (!currentSettings.poiEnabled || !hasAnyCategoryEnabled || map.getZoom() < 11) {
        if (poiAbortControllerRef.current) {
          poiAbortControllerRef.current.abort();
          poiAbortControllerRef.current = null;
          inFlightPoiBoundsRef.current = null;
        }
        return;
      }

      const b = map.getBounds();
      const bounds: GeoBounds = {
        south: b.getSouth(),
        west: b.getWest(),
        north: b.getNorth(),
        east: b.getEast(),
      };
      const detailLevel = getPoiDetailLevelForZoom(map.getZoom());

      if (isBoundsCoveredByCache(bounds, detailLevel)) {
        onPoisUpdatedRef.current?.(getAllCachedPois());
        return;
      }

      // Si ya hay una consulta Overpass en vuelo que cubre o solapa >=55% de esta vista, déjala terminar
      if (
        poiAbortControllerRef.current &&
        inFlightPoiBoundsRef.current &&
        (doesBoundsCover(inFlightPoiBoundsRef.current, bounds) ||
          boundsOverlapRatio(inFlightPoiBoundsRef.current, bounds) >= 0.55)
      ) {
        return;
      }

      const runFetch = async () => {
        const activeMap = mapInstanceRef.current;
        if (!activeMap || activeMap.getZoom() < 11 || !mapSettingsRef.current.poiEnabled) {
          return;
        }

        const latestB = activeMap.getBounds();
        const latestBounds: GeoBounds = {
          south: latestB.getSouth(),
          west: latestB.getWest(),
          north: latestB.getNorth(),
          east: latestB.getEast(),
        };
        const latestDetail = getPoiDetailLevelForZoom(activeMap.getZoom());

        if (isBoundsCoveredByCache(latestBounds, latestDetail)) {
          syncPoiGeoJsonSource(activeMap, false);
          return;
        }

        if (
          poiAbortControllerRef.current &&
          inFlightPoiBoundsRef.current &&
          (doesBoundsCover(inFlightPoiBoundsRef.current, latestBounds) ||
            boundsOverlapRatio(inFlightPoiBoundsRef.current, latestBounds) >= 0.55)
        ) {
          return;
        }

        if (poiAbortControllerRef.current) {
          poiAbortControllerRef.current.abort();
          poiAbortControllerRef.current = null;
          inFlightPoiBoundsRef.current = null;
        }

        const expandedQueryBounds = expandBoundsSlightly(latestBounds);
        const controller = new AbortController();
        poiAbortControllerRef.current = controller;
        inFlightPoiBoundsRef.current = expandedQueryBounds;

        const result = await fetchOverpassPOIsForBounds(
          latestBounds,
          mapSettingsRef.current.poiCategories,
          controller.signal,
          expandedQueryBounds,
          latestDetail
        );

        if (poiAbortControllerRef.current === controller) {
          poiAbortControllerRef.current = null;
          inFlightPoiBoundsRef.current = null;
        }

        if (result.aborted || controller.signal.aborted) return;

        if (result.ok) {
          poiRetryCountRef.current = 0;
          if (mapInstanceRef.current) {
            syncPoiGeoJsonSource(mapInstanceRef.current, true);
          }
          onPoisUpdatedRef.current?.(getAllCachedPois());
        } else {
          if (mapInstanceRef.current) {
            syncPoiGeoJsonSource(mapInstanceRef.current, false);
          }
          // Reintento silencioso en segundo plano (sin bloquear mapa ni saturar)
          const retryNum = poiRetryCountRef.current;
          if (retryNum < 4) {
            poiRetryCountRef.current = retryNum + 1;
            const delayMs = Math.min(30000, Math.round(6000 * Math.pow(1.6, retryNum)));
            poiRetryTimerRef.current = setTimeout(() => {
              schedulePoiRefresh(true);
            }, delayMs);
          }
        }
      };

      if (immediate) {
        runFetch();
      } else {
        poiDebounceTimerRef.current = setTimeout(runFetch, 450);
      }
    },
    [syncPoiGeoJsonSource]
  );

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const handleMapMoved = () => {
      if (isFollowCameraJumpActiveRef.current) {
        const now = performance.now();
        if (now - lastFollowPoiRefreshTimeRef.current < 1600) {
          return;
        }
        lastFollowPoiRefreshTimeRef.current = now;
        schedulePoiRefresh(true);
        return;
      }
      schedulePoiRefresh(false);
    };
    const handleMapLoaded = () => schedulePoiRefresh(true);
    const handleSourceData = (e: any) => {
      if (e?.sourceId === 'protomaps' && e?.isSourceLoaded) {
        if (poiVectorSyncTimerRef.current) return;
        poiVectorSyncTimerRef.current = setTimeout(() => {
          poiVectorSyncTimerRef.current = null;
          if (mapInstanceRef.current) {
            const added = syncVectorTilePoisFromMap(mapInstanceRef.current);
            if (added > 0 || cachedPoisByIdRef.current.size === 0) {
              syncPoiGeoJsonSource(mapInstanceRef.current, added > 0);
            }
          }
        }, 160);
      }
    };
    const handleMapBgClick = (e: maplibregl.MapMouseEvent) => {
      if (isPickingRadarLocationRef.current) {
        confirmRadarPickAtCoordsRef.current(e.lngLat.lat, e.lngLat.lng);
        return;
      }
      if (justTriggeredLongPressRef.current) return;
      if (performance.now() - poiFeatureClickedAtRef.current < 100) return;
      if (performance.now() - routeLineClickedAtRef.current < 100) return;
      if (!isNavigatingRef.current && routesRef.current.length > 0) {
        const routeHitLayers = [
          'ruta-preview-line',
          'ruta-preview-outline',
          'ruta-preview-alt-line',
          'ruta-preview-alt-outline',
        ].filter((id) => Boolean(map.getLayer(id)));
        if (routeHitLayers.length > 0) {
          try {
            const hitFeatures = map.queryRenderedFeatures(
              [
                [e.point.x - 14, e.point.y - 14],
                [e.point.x + 14, e.point.y + 14],
              ],
              { layers: routeHitLayers }
            );
            if (hitFeatures && hitFeatures.length > 0) {
              const currActiveId = activeRouteRef.current?.id;
              const preferred =
                hitFeatures.find((f) => f.properties?.routeId && f.properties.routeId !== currActiveId) ||
                hitFeatures[0];
              const hitRouteId = preferred?.properties?.routeId;
              if (hitRouteId) {
                const found = routesRef.current.find((r) => r.id === hitRouteId);
                if (found) {
                  handleUserPreviewRouteTapRef.current(found);
                  return;
                }
              }
            }
          } catch {}
        }
      }
      setSelectedPoi(null);
      setSelectedFixedRadar(null);
      setDraggingRadarId(null);
      setDraggedRadarCoords(null);
      closeCommunityAlertImmediate();
      dismissLongPressRef.current();
    };

    map.on('load', handleMapLoaded);
    map.on('idle', handleMapLoaded);
    map.on('sourcedata', handleSourceData);
    map.on('moveend', handleMapMoved);
    map.on('zoomend', handleMapMoved);
    map.on('click', handleMapBgClick);

    // Arranque inmediato en la vista inicial
    schedulePoiRefresh(true);

    return () => {
      map.off('load', handleMapLoaded);
      map.off('idle', handleMapLoaded);
      map.off('sourcedata', handleSourceData);
      map.off('moveend', handleMapMoved);
      map.off('zoomend', handleMapMoved);
      map.off('click', handleMapBgClick);
      if (poiVectorSyncTimerRef.current) {
        clearTimeout(poiVectorSyncTimerRef.current);
        poiVectorSyncTimerRef.current = null;
      }
      if (poiDebounceTimerRef.current) {
        clearTimeout(poiDebounceTimerRef.current);
        poiDebounceTimerRef.current = null;
      }
      if (poiRetryTimerRef.current) {
        clearTimeout(poiRetryTimerRef.current);
        poiRetryTimerRef.current = null;
      }
      if (poiAbortControllerRef.current) {
        poiAbortControllerRef.current.abort();
        poiAbortControllerRef.current = null;
        inFlightPoiBoundsRef.current = null;
      }
    };
  }, [schedulePoiRefresh, syncVectorTilePoisFromMap, syncPoiGeoJsonSource]);

  useEffect(() => {
    setSelectedPoi((prev) => {
      if (
        prev &&
        (!mapSettings.poiEnabled || mapSettings.poiCategories?.[prev.category] === false)
      ) {
        return null;
      }
      return prev;
    });
    if (mapInstanceRef.current) {
      syncPoiGeoJsonSource(mapInstanceRef.current, true);
    }
  }, [mapSettings.poiEnabled, mapSettings.poiCategories, mapTileMode, isNavigating, activeRoute?.id, syncPoiGeoJsonSource]);

  // 7c. Radares fijos referenciales & tramos Sutran (carga por región/ruta, marcadores y franjas)
  const lastFixedRadarScopeKeyRef = useRef<string>('');

  const refreshFixedRadarsData = useCallback(() => {
    const activeRegions = getActiveRegionsForFilter(
      { lat: userLocationRef.current.lat, lng: userLocationRef.current.lng },
      activeRouteRef.current?.coordinates,
      mapSettingsRef.current.fixedRadarRegionFilter || 'auto'
    );
    const merged = getMergedFixedRadarsForRegions(activeRegions);
    setFixedRadarsList(merged);
    onFixedRadarsUpdatedRef.current?.(merged);
  }, []);

  useEffect(() => {
    const activeRegions = getActiveRegionsForFilter(
      { lat: userLocation.lat, lng: userLocation.lng },
      activeRoute?.coordinates,
      mapSettings.fixedRadarRegionFilter || 'auto'
    );
    const regionsKey =
      activeRegions === 'ALL' ? 'ALL' : Array.from(activeRegions).sort().join('|');
    const scopeKey = `${regionsKey}::${Boolean(mapSettings.fixedRadarsEnabled)}::${
      activeRoute?.id || 'none'
    }`;

    if (lastFixedRadarScopeKeyRef.current === scopeKey) {
      return;
    }
    lastFixedRadarScopeKeyRef.current = scopeKey;

    refreshFixedRadarsData();
    if (!mapSettings.fixedRadarsEnabled) return;

    resolvePendingRadarsForRegions(activeRegions, () => {
      refreshFixedRadarsData();
    });
  }, [
    userLocation.lat,
    userLocation.lng,
    activeRoute?.id,
    activeRoute?.coordinates,
    mapSettings.fixedRadarsEnabled,
    mapSettings.fixedRadarRegionFilter,
    refreshFixedRadarsData,
  ]);

  const syncFixedRadarsOnMap = useCallback(
    (map: maplibregl.Map) => {
      fixedRadarMarkersRef.current = syncFixedRadarsLayersAndMarkers(map, {
        enabled: mapSettingsRef.current.fixedRadarsEnabled !== false,
        radars: fixedRadarsListRef.current,
        existingMarkers: fixedRadarMarkersRef.current,
        ensureRouteLayers,
        isOverviewActive: () => isOverviewActiveRef.current,
        isPickingRadarLocation: () => isPickingRadarLocationRef.current,
        justExitedOverviewUntil: justExitedOverviewUntilRef.current,
        draggingRadarId: draggingRadarIdRef.current,
        onRadarClick: (radar) => {
          dismissLongPressRef.current();
          if (draggingRadarIdRef.current && draggingRadarIdRef.current !== radar.id) {
            setDraggingRadarId(null);
            setDraggedRadarCoords(null);
          }
          setSelectedPoi(null);
          closeCommunityAlertImmediate();
          setRadarActionFeedback(null);
          setSelectedFixedRadar(radar);
        },
        onRadarDragEnd: (coords) => {
          setDraggedRadarCoords(coords);
        },
      });
    },
    [ensureRouteLayers]
  );

  const syncFixedRadarsOnMapRef = useRef(syncFixedRadarsOnMap);
  syncFixedRadarsOnMapRef.current = syncFixedRadarsOnMap;

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    syncFixedRadarsOnMap(map);
  }, [
    fixedRadarsList,
    mapSettings.fixedRadarsEnabled,
    draggingRadarId,
    mapTileMode,
    syncFixedRadarsOnMap,
  ]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const handleZoomChange = () => {
      if (draggingRadarIdRef.current !== null) return;
      syncFixedRadarsOnMapRef.current(map);
    };
    map.on('zoomend', handleZoomChange);
    return () => {
      map.off('zoomend', handleZoomChange);
      fixedRadarMarkersRef.current.forEach((m) => m.remove());
      fixedRadarMarkersRef.current = [];
    };
  }, []);

  // 7d. Presión larga (~500 ms) sobre el mapa con marcador temporal y opciones "Ruta" y "Compartir"
  const dismissLongPress = useCallback((fromPopstate = false) => {
    if (longPressReverseAbortRef.current) {
      longPressReverseAbortRef.current.abort();
      longPressReverseAbortRef.current = null;
    }
    if (longPressMarkerRef.current) {
      longPressMarkerRef.current.remove();
      longPressMarkerRef.current = null;
    }
    setLongPressPoint(null);
    setLongPressScreenPos(null);
    setShareCopiedToast(false);

    if (!fromPopstate && hasPushedLongPressHistoryRef.current) {
      hasPushedLongPressHistoryRef.current = false;
      if (window.history.state?.rutaLimaLongPress) {
        ignoringLongPressPopstateRef.current = true;
        try {
          window.history.back();
        } catch {
          ignoringLongPressPopstateRef.current = false;
        }
        setTimeout(() => {
          ignoringLongPressPopstateRef.current = false;
        }, 150);
      }
    } else if (fromPopstate) {
      hasPushedLongPressHistoryRef.current = false;
    }
  }, []);

  const dismissLongPressRef = useRef(dismissLongPress);
  dismissLongPressRef.current = dismissLongPress;

  // Cerrar automáticamente si se entra a navegación activa o se abre un panel encima
  useEffect(() => {
    if (isNavigating || isOverlayModalOpen || isSettingsOpen || isAddFixedRadarOpen) {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      if (longPressPoint) {
        dismissLongPress();
      }
      closeAllSmallOverlays();
    }
  }, [
    isNavigating,
    isOverlayModalOpen,
    isSettingsOpen,
    isAddFixedRadarOpen,
    longPressPoint,
    dismissLongPress,
  ]);

  // Botón atrás del navegador / celular o tecla Escape cierra marcador temporal y ventanita
  useEffect(() => {
    const handlePopState = () => {
      if (ignoringLongPressPopstateRef.current) {
        ignoringLongPressPopstateRef.current = false;
        return;
      }
      if (hasPushedLongPressHistoryRef.current) {
        dismissLongPressRef.current(true);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && longPressMarkerRef.current) {
        dismissLongPressRef.current(false);
      }
    };
    window.addEventListener('popstate', handlePopState);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Sincronizar marcador temporal y posición en pantalla de la ventanita
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (!longPressPoint) {
      if (longPressMarkerRef.current) {
        longPressMarkerRef.current.remove();
        longPressMarkerRef.current = null;
      }
      setLongPressScreenPos(null);
      return;
    }

    if (!longPressMarkerRef.current) {
      const pinEl = document.createElement('div');
      pinEl.className = 'long-press-temp-marker pointer-events-none';
      pinEl.style.zIndex = '52';
      pinEl.innerHTML = `
        <div style="position:relative;display:flex;flex-direction:column;align-items:center;transform:translateY(-6px);">
          <div style="
            width:32px;
            height:32px;
            border-radius:9999px 9999px 9999px 4px;
            transform:rotate(-45deg);
            background:linear-gradient(135deg,#38bdf8,#0284c7);
            border:2.5px solid #ffffff;
            box-shadow:0 6px 16px rgba(2,132,199,0.55);
            display:flex;
            align-items:center;
            justify-content:center;
          ">
            <div style="width:10px;height:10px;border-radius:9999px;background:#ffffff;transform:rotate(45deg);"></div>
          </div>
          <div style="width:10px;height:4px;border-radius:9999px;background:rgba(15,23,42,0.55);margin-top:2px;"></div>
        </div>
      `;
      longPressMarkerRef.current = new maplibregl.Marker({
        element: pinEl,
        anchor: 'bottom',
        rotationAlignment: 'viewport',
        pitchAlignment: 'viewport',
      })
        .setLngLat([longPressPoint.lng, longPressPoint.lat])
        .addTo(map);
    } else {
      longPressMarkerRef.current.setLngLat([longPressPoint.lng, longPressPoint.lat]);
    }

    const updateScreenPos = () => {
      try {
        const projected = map.project([longPressPoint.lng, longPressPoint.lat]);
        const rect = map.getCanvas().getBoundingClientRect();
        setLongPressScreenPos({ x: rect.left + projected.x, y: rect.top + projected.y });
      } catch {}
    };

    updateScreenPos();
    map.on('move', updateScreenPos);
    map.on('zoom', updateScreenPos);
    return () => {
      map.off('move', updateScreenPos);
      map.off('zoom', updateScreenPos);
    };
  }, [longPressPoint]);

  // Listener de presión larga (~500 ms) únicamente sobre el canvas del mapa (sin interferir con gestos ni marcadores)
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const canvas = map.getCanvas();
    if (!canvas) return;

    let startX = 0;
    let startY = 0;
    let lastTouchTime = 0;

    const clearTimer = () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    };

    const openLongPressPopupAt = (lat: number, lng: number) => {
      if (
        isNavigatingRef.current ||
        isAnyOverlayOpenRef.current ||
        draggingRadarIdRef.current !== null ||
        hasAnyOpenSmallOverlay()
      ) {
        return;
      }

      const fallbackCoordsText = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

      // Cerrar otras tarjetas abiertas para evitar superposición
      setSelectedPoi(null);
      setSelectedFixedRadar(null);
      closeCommunityAlertImmediate();
      setDraggingRadarId(null);
      setShareCopiedToast(false);

      if (longPressReverseAbortRef.current) {
        longPressReverseAbortRef.current.abort();
      }
      const abortCtrl = new AbortController();
      longPressReverseAbortRef.current = abortCtrl;

      if (!hasPushedLongPressHistoryRef.current) {
        try {
          window.history.pushState({ rutaLimaLongPress: true }, '');
          hasPushedLongPressHistoryRef.current = true;
        } catch {}
      }

      setLongPressPoint({
        lat,
        lng,
        label: fallbackCoordsText,
        address: null,
        isLoadingLabel: true,
        addressFound: false,
      });

      reverseGeocodeCoords(lat, lng, abortCtrl.signal).then((geo) => {
        if (abortCtrl.signal.aborted) return;
        setLongPressPoint((prev) => {
          if (!prev || Math.abs(prev.lat - lat) > 1e-6 || Math.abs(prev.lng - lng) > 1e-6) {
            return prev;
          }
          if (!geo) {
            return {
              ...prev,
              isLoadingLabel: false,
              addressFound: false,
            };
          }
          return {
            ...prev,
            label: geo.name,
            address: geo.address,
            district: geo.district,
            isLoadingLabel: false,
            addressFound: true,
          };
        });
      });
    };

    const triggerLongPressAt = (clientX: number, clientY: number) => {
      clearTimer();
      const isPickingRadar = isPickingRadarLocationRef.current;
      if (
        !isPickingRadar &&
        (isNavigatingRef.current ||
          isAnyOverlayOpenRef.current ||
          draggingRadarIdRef.current !== null ||
          hasAnyOpenSmallOverlay() ||
          shouldSuppressMapClick())
      ) {
        return;
      }

      const rect = canvas.getBoundingClientRect();
      const relX = clientX - rect.left;
      const relY = clientY - rect.top;
      if (relX < 0 || relY < 0 || relX > rect.width || relY > rect.height) {
        return;
      }

      let lngLat: maplibregl.LngLat;
      try {
        lngLat = map.unproject([relX, relY]);
      } catch {
        return;
      }

      const lat = lngLat.lat;
      const lng = lngLat.lng;

      // Vibración sutil si el dispositivo lo soporta
      try {
        if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
          navigator.vibrate(35);
        }
      } catch {}

      justTriggeredLongPressRef.current = true;
      setTimeout(() => {
        justTriggeredLongPressRef.current = false;
      }, 350);

      if (isPickingRadar) {
        confirmRadarPickAtCoordsRef.current(lat, lng);
        return;
      }

      openLongPressPopupAt(lat, lng);
    };

    const handleTouchStart = (e: TouchEvent) => {
      lastTouchTime = Date.now();
      if (e.target !== canvas || e.touches.length !== 1) {
        clearTimer();
        return;
      }
      if (
        !isPickingRadarLocationRef.current &&
        (isNavigatingRef.current ||
          isAnyOverlayOpenRef.current ||
          draggingRadarIdRef.current !== null ||
          hasAnyOpenSmallOverlay() ||
          shouldSuppressMapClick())
      ) {
        clearTimer();
        return;
      }
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      clearTimer();
      longPressTimerRef.current = setTimeout(() => {
        triggerLongPressAt(startX, startY);
      }, 500);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!longPressTimerRef.current) return;
      if (e.touches.length !== 1) {
        clearTimer();
        return;
      }
      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;
      if (Math.hypot(dx, dy) > 8) {
        clearTimer();
      }
    };

    const handleTouchEndOrCancel = () => {
      clearTimer();
    };

    const handleMouseDown = (e: MouseEvent) => {
      if (Date.now() - lastTouchTime < 700) return;
      if (e.button !== 0 || e.target !== canvas) {
        clearTimer();
        return;
      }
      if (
        !isPickingRadarLocationRef.current &&
        (isNavigatingRef.current ||
          isAnyOverlayOpenRef.current ||
          draggingRadarIdRef.current !== null ||
          hasAnyOpenSmallOverlay() ||
          shouldSuppressMapClick())
      ) {
        clearTimer();
        return;
      }
      startX = e.clientX;
      startY = e.clientY;
      clearTimer();
      longPressTimerRef.current = setTimeout(() => {
        triggerLongPressAt(startX, startY);
      }, 500);
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!longPressTimerRef.current) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (Math.hypot(dx, dy) > 8) {
        clearTimer();
      }
    };

    const handleMouseUpOrLeave = () => {
      clearTimer();
    };

    const handleContextMenu = (e: MouseEvent) => {
      if (justTriggeredLongPressRef.current || longPressTimerRef.current) {
        e.preventDefault();
      }
    };

    canvas.addEventListener('touchstart', handleTouchStart, { passive: true });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: true });
    canvas.addEventListener('touchend', handleTouchEndOrCancel, { passive: true });
    canvas.addEventListener('touchcancel', handleTouchEndOrCancel, { passive: true });
    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseup', handleMouseUpOrLeave);
    canvas.addEventListener('mouseleave', handleMouseUpOrLeave);
    canvas.addEventListener('contextmenu', handleContextMenu);

    return () => {
      clearTimer();
      canvas.removeEventListener('touchstart', handleTouchStart);
      canvas.removeEventListener('touchmove', handleTouchMove);
      canvas.removeEventListener('touchend', handleTouchEndOrCancel);
      canvas.removeEventListener('touchcancel', handleTouchEndOrCancel);
      canvas.removeEventListener('mousedown', handleMouseDown);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mouseup', handleMouseUpOrLeave);
      canvas.removeEventListener('mouseleave', handleMouseUpOrLeave);
      canvas.removeEventListener('contextmenu', handleContextMenu);
      if (longPressMarkerRef.current) {
        longPressMarkerRef.current.remove();
        longPressMarkerRef.current = null;
      }
    };
  }, []);

  // Sincroniza la visibilidad visual (sin borrar datos) de burbujas de reportes, radares fijos y tramos Sutran en Vista general
  const syncOverviewReportsAndRadarsVisibility = useCallback((map: maplibregl.Map | null) => {
    syncOverviewMarkersAndStripsVisibility(
      map,
      alertMarkersRef.current,
      fixedRadarMarkersRef.current,
      isOverviewActiveRef.current
    );
  }, []);

  // Effect for Overview Route button ("Vista general": fit bounds from user to destination using real panel heights)
  useEffect(() => {
    if (
      !overviewTrigger ||
      overviewTrigger === lastHandledOverviewTriggerRef.current ||
      !mapInstanceRef.current
    ) {
      return;
    }
    lastHandledOverviewTriggerRef.current = overviewTrigger;
    const map = mapInstanceRef.current;

    // Ocultar visualmente lugares, reportes, radares fijos y tramos mientras Vista general esté activa
    justExitedOverviewUntilRef.current = 0;
    isOverviewActiveRef.current = true;
    setIsOverviewActive(true);
    setSelectedPoi(null);
    setSelectedFixedRadar(null);
    closeCommunityAlertImmediate();
    updatePoiLayerVisibility(map);
    syncOverviewReportsAndRadarsVisibility(map);
    applyOverviewCleanMapStyle(map, mapTileModeRef.current, overviewSavedLayersRef.current);

    clearAutoFollowPauseRef.current();
    pendingRecenterRef.current = false;
    isAtomicRecenterInFlightRef.current = false;
    if (recenterWaitTimerRef.current) {
      clearTimeout(recenterWaitTimerRef.current);
      recenterWaitTimerRef.current = null;
    }
    if (programmaticClearTimerRef.current) {
      clearTimeout(programmaticClearTimerRef.current);
      programmaticClearTimerRef.current = null;
    }

    isProgrammaticMoveRef.current = true;
    map.stop();

    isManuallyRotatedRef.current = false;
    setIsManuallyRotated(false);
    setIsHeadingUp(false);
    setMapRotation(0);

    const rafId = requestAnimationFrame(() => {
      if (!mapInstanceRef.current) return;

      const currLocation = userLocationRef.current;
      const currRoute = activeRouteRef.current;
      const currDest = destinationCoordsRef.current;

      const bounds = new maplibregl.LngLatBounds();
      bounds.extend([currLocation.lng, currLocation.lat]);

      if (currRoute && currRoute.coordinates && currRoute.coordinates.length > 0) {
        currRoute.coordinates.forEach(([lat, lng]) => bounds.extend([lng, lat]));
      }

      if (currDest) {
        bounds.extend([currDest.lng, currDest.lat]);
      } else if (currRoute?.destinationCoords) {
        bounds.extend([currRoute.destinationCoords.lng, currRoute.destinationCoords.lat]);
      }

      // Measure real on-screen heights of top banner and bottom trip panel / compact bar
      const topBannerEl =
        document.getElementById('turn-by-turn-banner') ||
        (document.querySelector('.top-navigation-bar') as HTMLElement | null);
      const topRect = topBannerEl?.getBoundingClientRect();
      const realTopHeight = topRect ? Math.max(0, Math.round(topRect.bottom)) : 0;

      const compactBarEl = document.getElementById('nav-compact-bar');
      const bottomCardEl = document.querySelector('.bottom-trip-panel .nav-card') as HTMLElement | null;
      const compactH = compactBarEl ? Math.round(compactBarEl.getBoundingClientRect().height) : 0;
      const bottomCardH = bottomCardEl ? Math.round(bottomCardEl.getBoundingClientRect().height) : 0;
      const realBottomHeight = Math.max(compactH, bottomCardH);

      const topPad = realTopHeight + 16;
      const bottomPad = realBottomHeight + 16;
      const sidePad = 24;

      // Calcular el zoom objetivo del encuadre general sin modificarlo, para anclar la aparición gradual de calles al acercar
      try {
        const targetCam = map.cameraForBounds(bounds, {
          padding: { top: topPad, bottom: bottomPad, left: sidePad, right: sidePad },
          bearing: 0,
          maxZoom: 18,
        });
        const targetZoom = typeof targetCam?.zoom === 'number' ? targetCam.zoom : undefined;
        overviewZoomAnchorRef.current = targetZoom;
        if (targetZoom !== undefined) {
          applyOverviewCleanMapStyle(
            map,
            mapTileModeRef.current,
            overviewSavedLayersRef.current,
            targetZoom
          );
        }
      } catch {}

      let overviewCleared = false;
      const clearOverviewFlags = () => {
        if (overviewCleared) return;
        overviewCleared = true;
        if (programmaticClearTimerRef.current) {
          clearTimeout(programmaticClearTimerRef.current);
          programmaticClearTimerRef.current = null;
        }
        map.off('moveend', clearOverviewFlags);
        isProgrammaticMoveRef.current = false;
        isAtomicRecenterInFlightRef.current = false;
      };

      map.once('moveend', clearOverviewFlags);
      programmaticClearTimerRef.current = setTimeout(clearOverviewFlags, 1000);

      beginProgrammaticCameraLock(map, 600);
      map.setPadding({ top: 0, bottom: 0, left: 0, right: 0 });
      map.fitBounds(bounds, {
        padding: { top: topPad, bottom: bottomPad, left: sidePad, right: sidePad },
        bearing: 0,
        pitch: 0,
        maxZoom: 18,
        duration: 600,
      });
    });

    return () => cancelAnimationFrame(rafId);
  }, [overviewTrigger]);

  // Triggered by bottom bar "Volver a centrar" button
  useEffect(() => {
    if (
      !recenterTrigger ||
      recenterTrigger === lastHandledRecenterTriggerRef.current ||
      !mapInstanceRef.current
    ) {
      return;
    }
    lastHandledRecenterTriggerRef.current = recenterTrigger;
    clearAutoFollowPauseRef.current();
    if (isOverviewActiveRef.current) {
      justExitedOverviewUntilRef.current = Date.now() + 900;
    }
    isOverviewActiveRef.current = false;
    setIsOverviewActive(false);
    syncOverviewReportsAndRadarsVisibility(mapInstanceRef.current);
    isManuallyRotatedRef.current = false;
    setIsManuallyRotated(false);
    isIdleAutoOrientActiveRef.current = true;
    idleBearingAnimRef.current.active = false;
    setIsHeadingUp(mapSettingsRef.current.autoRotation);
    executeAtomicRecenter();
  }, [recenterTrigger, executeAtomicRecenter, syncOverviewReportsAndRadarsVisibility]);

  // Salir de Vista general al retomar seguimiento o terminar/cancelar la navegación
  useEffect(() => {
    if (isOverviewActiveRef.current && (!isNavigating || isFollowing)) {
      justExitedOverviewUntilRef.current = Date.now() + 900;
      isOverviewActiveRef.current = false;
      setIsOverviewActive(false);
    }
  }, [isNavigating, isFollowing]);

  // Sincronizar visibilidad visual de lugares, reportes, radares y estilo limpio de mapa al entrar o salir de Vista general
  const prevOverviewActiveRef = useRef<boolean>(false);
  useEffect(() => {
    isOverviewActiveRef.current = isOverviewActive;
    if (prevOverviewActiveRef.current === isOverviewActive) return;
    prevOverviewActiveRef.current = isOverviewActive;

    const map = mapInstanceRef.current;
    if (!isOverviewActive) {
      justExitedOverviewUntilRef.current = Date.now() + 900;
    } else {
      justExitedOverviewUntilRef.current = 0;
    }
    if (map) {
      updatePoiLayerVisibility(map);
      syncOverviewReportsAndRadarsVisibility(map);
      if (isOverviewActive) {
        applyOverviewCleanMapStyle(
          map,
          mapTileModeRef.current,
          overviewSavedLayersRef.current,
          overviewZoomAnchorRef.current
        );
      } else {
        overviewZoomAnchorRef.current = undefined;
        restoreNormalMapStyleFromOverview(
          map,
          mapTileModeRef.current,
          overviewSavedLayersRef.current
        );
        syncBuildings3DLayer(map);
        syncPoiGeoJsonSource(map, true);
      }
    }
  }, [
    isOverviewActive,
    syncBuildings3DLayer,
    syncPoiGeoJsonSource,
    updatePoiLayerVisibility,
    syncOverviewReportsAndRadarsVisibility,
  ]);

  // Compass button (solo visible cuando el mapa fue girado manualmente): vuelve al Norte arriba (bearing 0)
  const handleResetNorthUp = () => {
    const map = mapInstanceRef.current;
    isManuallyRotatedRef.current = false;
    setIsManuallyRotated(false);
    setMapRotation(0);
    if (!map) return;

    isProgrammaticMoveRef.current = true;
    beginProgrammaticCameraLock(map, 400);
    try {
      map.easeTo({
        bearing: 0,
        duration: 350,
      });
    } catch {
      activateFlatFallback(map);
    }
    setTimeout(() => {
      isProgrammaticMoveRef.current = false;
    }, 400);
  };

  // Botón azul de ubicación: en selección de ruta reencuadra toda la ruta; en pantalla principal vuelve a seguimiento inclinado
  const handleCenterOnUserIdle = useCallback(() => {
    const map = mapInstanceRef.current;
    if (map && !isNavigatingRef.current && hasAnyRoutesRef.current) {
      const currRoutes =
        routesRef.current.length > 0
          ? routesRef.current
          : activeRouteRef.current
          ? [activeRouteRef.current]
          : [];
      if (currRoutes.length > 0) {
        const destForBounds =
          activeRouteRef.current?.destinationCoords ||
          routesRef.current[0]?.destinationCoords ||
          destinationCoordsRef.current ||
          null;
        userInteractedInPreviewRef.current = false;
        if (previewFitDebounceTimerRef.current) {
          clearTimeout(previewFitDebounceTimerRef.current);
          previewFitDebounceTimerRef.current = null;
        }
        if (previewFitInitialRafRef.current !== null) {
          cancelAnimationFrame(previewFitInitialRafRef.current);
          previewFitInitialRafRef.current = null;
        }
        runPreviewFitBounds(map, currRoutes, destForBounds, 600, 'location-button');
        return;
      }
    }
    clearAutoFollowPauseRef.current();
    onRequestLocationRef.current?.();
    returnToIdleTrackingView(500);
  }, [returnToIdleTrackingView, runPreviewFitBounds]);

  // Selector de 3 modos: Diurno -> Nocturno -> Satelital -> Diurno
  const handleCycleTileMode = () => {
    if (mapTileMode === 'day') {
      onTileModeChange('night');
    } else if (mapTileMode === 'night') {
      onTileModeChange('satellite');
    } else {
      onTileModeChange('day');
    }
  };

  return (
    <div
      ref={rootContainerRef}
      className={`relative w-full h-full min-h-full overflow-hidden select-none ${
        mapTileMode === 'day' ? 'bg-[#f3f4f6]' : 'bg-slate-950'
      }`}
    >
      {/* Full-screen MapLibre GL WebGL Canvas (100% coverage, zero dark zones, upright street labels) */}
      <div
        ref={mapContainerRef}
        id="ruta-lima-leaflet-map"
        className="relative z-0 w-full h-full min-h-full"
      />

      {pitchFallbackNotice && (
        <button
          type="button"
          onClick={() => {
            if (pitchFallbackTimerRef.current) {
              clearTimeout(pitchFallbackTimerRef.current);
              pitchFallbackTimerRef.current = null;
            }
            setPitchFallbackNotice(null);
          }}
          className="fixed top-24 left-1/2 -translate-x-1/2 z-50 px-3.5 py-2 rounded-xl bg-slate-900/95 text-amber-200 border border-amber-400/50 shadow-lg text-xs font-semibold pointer-events-auto cursor-pointer flex items-center gap-2 hover:bg-slate-800/95 active:scale-95 transition"
          aria-label="Cerrar aviso"
        >
          <span>{pitchFallbackNotice}</span>
          <X className="w-3.5 h-3.5 text-amber-300/90 flex-shrink-0" />
        </button>
      )}

      {/* Píldora con el nombre de la calle actual (Modo Día durante ruta, encima del panel inferior y a la derecha del círculo de velocidad) */}
      {isNavigating && mapTileMode === 'day' && resolvedCurrentStreet && (
        <div
          className="fixed left-[92px] sm:left-[104px] right-3.5 z-30 flex justify-start pointer-events-none select-none transition-all duration-300"
          style={{
            bottom: isFollowing
              ? 'calc(env(safe-area-inset-bottom, 0px) + 102px)'
              : 'calc(env(safe-area-inset-bottom, 0px) + 82px)',
          }}
        >
          <div className="px-3.5 py-1.5 rounded-2xl bg-white/98 text-slate-900 border border-slate-200/95 shadow-[0_3px_12px_rgba(0,0,0,0.22)] font-extrabold text-[13px] leading-[1.2] max-w-[230px] sm:max-w-[280px] line-clamp-2">
            {resolvedCurrentStreet}
          </div>
        </div>
      )}

      {/* Visible Attribution badge */}
      <div className="absolute bottom-2 left-2 z-30 pointer-events-none flex flex-wrap items-center gap-1.5 max-w-[calc(100vw-24px)] select-none">
        <div className="text-[10px] text-slate-400 bg-slate-950/75 backdrop-blur-sm px-2 py-0.5 rounded-md border border-slate-800/80 shadow-sm flex items-center gap-1.5">
          {activeAttributionMode === 'pmtiles_only' ? (
            <span>
              Solo PMTiles Perú (vector) · ©{' '}
              <a
                href="https://www.openstreetmap.org/copyright"
                target="_blank"
                rel="noreferrer"
                className="underline pointer-events-auto hover:text-white"
              >
                OpenStreetMap
              </a>
            </span>
          ) : activeAttributionMode === 'openfreemap' ? (
            <span>
              <a
                href="https://openfreemap.org"
                target="_blank"
                rel="noreferrer"
                className="underline pointer-events-auto hover:text-white"
              >
                OpenFreeMap
              </a>{' '}
              ©{' '}
              <a
                href="https://openmaptiles.org"
                target="_blank"
                rel="noreferrer"
                className="underline pointer-events-auto hover:text-white"
              >
                OpenMapTiles
              </a>
              , datos de{' '}
              <a
                href="https://www.openstreetmap.org/copyright"
                target="_blank"
                rel="noreferrer"
                className="underline pointer-events-auto hover:text-white"
              >
                OpenStreetMap
              </a>
            </span>
          ) : (
            <span>
              ©{' '}
              <a
                href="https://www.openstreetmap.org/copyright"
                target="_blank"
                rel="noreferrer"
                className="underline pointer-events-auto hover:text-white"
              >
                OpenStreetMap
              </a>{' '}
              contributors
            </span>
          )}
        </div>
      </div>

      {/* Floating Action Controls on Right Edge (Centrados verticalmente) */}
      <div
        data-map-control="true"
        className="absolute right-3.5 top-1/2 -translate-y-1/2 z-30 flex flex-col items-center gap-1.5 transition-all duration-300 ease-out translate-x-0 opacity-100 pointer-events-auto"
      >
        {/* 1. Brújula: visible solo cuando el mapa está girado manualmente; al tocarla vuelve al Norte arriba */}
        {isManuallyRotated && Math.abs((((mapRotation % 360) + 540) % 360) - 180) > 1.5 && (
          <button
            type="button"
            onClick={handleResetNorthUp}
            className={`flex items-center justify-center ${controlSizeClass} rounded-2xl border shadow-xl backdrop-blur-md active:scale-95 transition bg-slate-900/90 text-sky-300 border-sky-400/70 hover:bg-slate-800 animate-in fade-in zoom-in-95 duration-150`}
            title="Volver al Norte arriba"
            aria-label="Volver al Norte arriba"
          >
            <Compass
              className="w-5 h-5 transition-transform duration-150"
              style={{
                transform: `rotate(${-mapRotation}deg)`,
              }}
            />
          </button>
        )}

        {/* 2. Ubicación: Botón azul para volver a centrar en el usuario (solo antes de iniciar ruta) */}
        {!isNavigating && (
          <button
            type="button"
            onClick={handleCenterOnUserIdle}
            className={`flex items-center justify-center ${controlSizeClass} rounded-2xl border shadow-xl backdrop-blur-md active:scale-95 transition ${
              isFollowing && !isAutoFollowPaused
                ? 'bg-sky-500 text-white border-sky-300 shadow-sky-500/40'
                : 'bg-blue-600 hover:bg-blue-500 text-white border-sky-400 shadow-blue-500/40'
            }`}
            title="Centrar en mi ubicación"
            aria-label="Centrar en mi ubicación"
          >
            <LocateFixed className="w-5 h-5" />
          </button>
        )}

        {/* 3. Alertas: Advertencias / Incidentes (Triángulo Ámbar Brillante #FFB000) */}
        {onOpenReportIncident && (
          <button
            onClick={onOpenReportIncident}
            className={`flex items-center justify-center ${controlSizeClass} rounded-2xl bg-[#FFB000]/20 hover:bg-[#FFB000]/30 text-[#FFB000] border-2 border-[#FFB000] shadow-[0_0_15px_rgba(255,176,0,0.35)] backdrop-blur-md active:scale-95 transition`}
            title="Reportar advertencia vial o incidente"
            aria-label="Reportar incidente vial"
          >
            <AlertTriangle className="w-5 h-5 text-[#FFB000] fill-[#FFB000]/20" />
          </button>
        )}

        {/* 4. Capas: Selector de Modos de Cartografía (Diurno -> Nocturno -> Satelital) */}
        <button
          onClick={handleCycleTileMode}
          className={`flex items-center justify-center ${controlSizeClass} rounded-2xl bg-slate-900/90 text-slate-200 border border-slate-700/80 shadow-xl backdrop-blur-md hover:bg-slate-800 active:scale-95 transition`}
          title={`Modo actual: ${
            mapTileMode === 'day'
              ? 'Diurno (OpenStreetMap)'
              : mapTileMode === 'night'
              ? 'Nocturno (OpenStreetMap Oscuro)'
              : 'Satelital (Esri Aerial)'
          }. Toca para cambiar.`}
          aria-label="Cambiar estilo de mapa"
        >
          <Layers
            className={`w-5 h-5 ${
              mapTileMode === 'day'
                ? 'text-amber-400'
                : mapTileMode === 'night'
                ? 'text-sky-400'
                : 'text-emerald-400'
            }`}
          />
        </button>

        {/* 5. Ajustes: Configuración de mapa y voz (oculto durante navegación activa) */}
        {!isNavigating && (
          <button
            onClick={() => setIsSettingsOpen(true)}
            className={`flex items-center justify-center ${controlSizeClass} rounded-2xl bg-slate-900/90 text-slate-300 border border-slate-700/80 shadow-xl backdrop-blur-md hover:bg-slate-800 active:scale-95 transition`}
            title="Ajustes de mapa y voz"
            aria-label="Ajustes de mapa"
          >
            <Settings className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Tarjetas flotantes (POI, Radar Fijo, Alertas de Comunidad, Elegir Radar, Presión Larga) */}
      <MapOverlayCards
        userLocation={userLocation}
        isNavigating={isNavigating}
        isOverviewActive={isOverviewActive}
        mapInstanceRef={mapInstanceRef}
        selectedPoi={selectedPoi}
        onClosePoi={() => setSelectedPoi(null)}
        onNavigateToPOI={(poi) => onNavigateToPOIRef.current?.(poi)}
        selectedFixedRadar={selectedFixedRadar}
        setSelectedFixedRadar={setSelectedFixedRadar}
        draggingRadarId={draggingRadarId}
        setDraggingRadarId={setDraggingRadarId}
        draggedRadarCoords={draggedRadarCoords}
        setDraggedRadarCoords={setDraggedRadarCoords}
        radarActionFeedback={radarActionFeedback}
        setRadarActionFeedback={setRadarActionFeedback}
        refreshFixedRadarsData={refreshFixedRadarsData}
        onOpenAddFixedRadar={() => setIsAddFixedRadarOpen(true)}
        selectedCommunityAlert={selectedCommunityAlert}
        isCommunityAlertClosing={isCommunityAlertClosing}
        onCloseCommunityAlertImmediate={closeCommunityAlertImmediate}
        onCloseCommunityAlertSmooth={closeCommunityAlertSmooth}
        onConfirmAlert={(alertId) => onConfirmAlertRef.current?.(alertId)}
        onRemoveAlert={(alertId) => onRemoveAlertRef.current?.(alertId)}
        onToggleAlertBothDirections={(alertId) =>
          onToggleAlertBothDirectionsRef.current?.(alertId)
        }
        isAddFixedRadarOpen={isAddFixedRadarOpen}
        isPickingRadarLocation={isPickingRadarLocation}
        onCancelRadarMapPick={() => setIsPickingRadarLocation(false)}
        onConfirmRadarPickAtCoords={confirmRadarPickAtCoords}
        longPressPoint={longPressPoint}
        longPressScreenPos={longPressScreenPos}
        shareCopiedToast={shareCopiedToast}
        setShareCopiedToast={setShareCopiedToast}
        onDismissLongPress={dismissLongPress}
        onStartRouteToDestination={(dest) => onStartRouteToDestinationRef.current?.(dest)}
      />

      {/* Modal Agregar Radar Comunitario (Todo el Perú) */}
      <AddFixedRadarModal
        isOpen={isAddFixedRadarOpen}
        isHiddenForMapPick={isPickingRadarLocation}
        onStartMapPick={() => setIsPickingRadarLocation(true)}
        pickedMapCoords={pickedRadarCoords}
        onClose={() => {
          setIsPickingRadarLocation(false);
          setIsAddFixedRadarOpen(false);
        }}
        userCoords={{ lat: userLocation.lat, lng: userLocation.lng }}
        mapCenterCoords={
          mapInstanceRef.current
            ? {
                lat: mapInstanceRef.current.getCenter().lat,
                lng: mapInstanceRef.current.getCenter().lng,
              }
            : null
        }
        onAdded={(newRadar) => {
          refreshFixedRadarsData();
          setSelectedFixedRadar(newRadar);
        }}
      />

      {/* Settings Modal */}
      <MapSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={mapSettings}
        onUpdateSettings={handleUpdateSettings}
        onOpenAddFixedRadar={() => setIsAddFixedRadarOpen(true)}
      />
    </div>
  );
};
