/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Coordinates,
  InspectorSubtype,
  MapPOI,
  MapTileMode,
  NavigationMode,
  PoliceSubtype,
  RouteData,
  SearchResult,
  TrafficAlert,
  TrafficAlertType,
  TravelMode,
} from './types/navigation';
import { getInspectorSubtypeLabel, normalizeInspectorSubtype } from './services/inspectorReports';
import { useGeolocation } from './hooks/useGeolocation';
import {
  fetchOSRMRoutes,
  findCurrentStep,
  getDistanceToRoute,
  calculateDistanceMeters,
  formatDistance,
} from './services/osrm';
import { getBearing, matchUserToRoute } from './services/routeMatching';
import {
  CarriagewaySnapResult,
  formatDirectionLabelSpanish,
  getAlertTargetCoords,
  getOppositeHeading,
  isAlertMatchingRouteHeading,
  normalizeHeadingDeg,
  offsetCoordPerpendicular,
  snapReportToOsmCarriageway,
} from './services/reportDirection';
import { voiceGuidance, QueuedVoiceBannerItem } from './services/tts';
import { logSystemNotice } from './services/systemNotices';
import {
  saveRoutes,
  findSavedRoutes,
  distanceToRouteMeters,
  MAX_DISTANCE_TO_SAVED_ROUTE_M,
} from './services/savedRoutes';
import { useSpeedLimitResolver } from './services/speedLimitResolver';
import {
  closeAllSmallOverlays,
  notifySmallOverlayClose,
  notifySmallOverlayOpen,
} from './services/overlayCoordinator';
import { NavigationMap, getInitialSettings } from './components/Map/NavigationMap';
import { MapSettingsData } from './components/Map/MapSettingsModal';
import { IncidentReportModal } from './components/Map/IncidentReportModal';
import { LiveInspectorsModal } from './components/Map/LiveInspectorsModal';
import { SearchPanel } from './components/Search/SearchPanel';
import { TurnByTurnBanner } from './components/HUD/TurnByTurnBanner';
import { BottomNavCard } from './components/HUD/BottomNavCard';
import { VoiceAlertBanner } from './components/HUD/VoiceAlertBanner';
import { RoutePreviewCard } from './components/RoutePreview/RoutePreviewCard';
import { PermissionModal } from './components/Permissions/PermissionModal';
import { OfflineIndicator } from './components/OfflineIndicator';
import { NearbyAlertVerificationCard } from './components/HUD/NearbyAlertVerificationCard';
import {
  getAlertOriginalDuration,
  getDeviceUserId,
  getVotedAlertIds,
  addVotedAlertId,
  isAlertExpired,
  getLimaZoneFallback,
  reverseGeocodeLimaZone,
} from './services/alertLifecycle';
import {
  buildPreRouteVoiceSummary,
  evaluateFreeDriveCommunityAlerts,
  getUpcomingInspectorsOnRoute,
  getUpcomingSchoolOrHospitalOnRoute,
  formatInspectorDistanceAnnouncement,
  RouteMatchedAlert,
} from './services/routeAlerts';
import { POI_CATEGORY_META } from './services/overpassPoi';
import { FixedRadar } from './data/fixedRadars';
import { evaluateFixedRadarsNavigation } from './services/fixedRadars';

// Todos los tipos de alerta: se usan para silenciar los avisos por voz cuando
// el interruptor "Alertas de tránsito" está desactivado.
const ALL_TRAFFIC_ALERT_TYPES: TrafficAlertType[] = [
  'accident',
  'traffic',
  'road_closed',
  'construction',
  'hazard',
  'police',
  'stopped_vehicle',
  'pothole',
  'broken_light',
  'inspectors',
  'speed_camera',
  'flood',
];
import {
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
  ArrowLeft,
  ChevronDown,
  X,
} from 'lucide-react';

export default function App() {
  // Geolocation & GPS tracking
  const {
    location,
    permissionState,
    errorMessage,
    isGpsSignalLost,
    isSimulating,
    setIsFollowing,
    requestLocation,
    startSimulation,
    stopSimulation,
  } = useGeolocation();

  // Navigation & Multi-Route State
  const [navigationMode, setNavigationMode] = useState<NavigationMode>('idle');
  const [selectedDestination, setSelectedDestination] = useState<SearchResult | null>(null);
  const [travelMode, setTravelMode] = useState<TravelMode>('driving');
  const [routes, setRoutes] = useState<RouteData[]>([]);
  const [route, setRoute] = useState<RouteData | null>(null);
  const [isLoadingRoute, setIsLoadingRoute] = useState<boolean>(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [isRerouting, setIsRerouting] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isSearchOpenInNav, setIsSearchOpenInNav] = useState<boolean>(false);
  const [isIncidentReportOpen, setIsIncidentReportOpen] = useState<boolean>(false);
  const [isLiveInspectorsOpen, setIsLiveInspectorsOpen] = useState<boolean>(false);
  const [isMapSettingsOpen, setIsMapSettingsOpen] = useState<boolean>(false);
  const [isAddFixedRadarOpen, setIsAddFixedRadarOpen] = useState<boolean>(false);
  const isAnyLargeModalOpen =
    isMapSettingsOpen || isIncidentReportOpen || isLiveInspectorsOpen || isAddFixedRadarOpen;
  const [lastSeenInspectorsAt, setLastSeenInspectorsAt] = useState<number>(() => {
    try {
      return Number(localStorage.getItem('ruta_lima_last_seen_inspectors_at') || '0') || 0;
    } catch {
      return 0;
    }
  });
  const [focusCoordsTrigger, setFocusCoordsTrigger] = useState<{
    lat: number;
    lng: number;
    zoom?: number;
    seq: number;
  } | null>(null);
  const [streetFallbackNotice, setStreetFallbackNotice] = useState<{
    message: string;
    place: SearchResult;
  } | null>(null);
  const [activeVoiceBanner, setActiveVoiceBanner] = useState<QueuedVoiceBannerItem | null>(null);
  const [cachedPois, setCachedPois] = useState<MapPOI[]>([]);
  const [fixedRadars, setFixedRadars] = useState<FixedRadar[]>([]);

  // Avoid options for Route Choice screen: Peajes, Autopistas, Vías sin pavimentar
  const [avoidOptions, setAvoidOptions] = useState({
    tolls: false,
    highways: false,
    unpaved: false,
  });
  const [isAvoidMenuOpen, setIsAvoidMenuOpen] = useState(false);

  useEffect(() => {
    if (isAvoidMenuOpen && navigationMode === 'preview') {
      notifySmallOverlayOpen('avoid_menu', () => setIsAvoidMenuOpen(false));
    } else {
      notifySmallOverlayClose('avoid_menu');
    }
    return () => {
      notifySmallOverlayClose('avoid_menu');
    };
  }, [isAvoidMenuOpen, navigationMode]);

  useEffect(() => {
    if (isAnyLargeModalOpen) {
      closeAllSmallOverlays();
    }
  }, [isAnyLargeModalOpen]);

  // 3) Modo de seguimiento con una sola variable de estado: 'siguiendo' o 'explorando'
  // Cuando vale "siguiendo", se muestra el panel normal de siempre.
  // Cuando vale "explorando", se muestra la barra compacta Vista general / Volver a centrar.
  // Solo se sale de "explorando" al tocar "Volver a centrar". Sin regreso automático por tiempo.
  const [modoSeguimiento, setModoSeguimiento] = useState<'siguiendo' | 'explorando'>('siguiendo');
  const [recenterTrigger, setRecenterTrigger] = useState<number>(0);
  const [overviewTrigger, setOverviewTrigger] = useState<number>(0);

  const autoRecenterTimerRef = useRef<NodeJS.Timeout | null>(null);

  const clearAutoRecenterTimer = useCallback(() => {
    if (autoRecenterTimerRef.current) {
      clearTimeout(autoRecenterTimerRef.current);
      autoRecenterTimerRef.current = null;
    }
  }, []);

  // 1) El botón "Volver a centrar" ejecuta exactamente esta función:
  // - Pone modoSeguimiento en 'siguiendo' e isFollowing en true
  // - Recentra el mapa en la posición con zoom de navegación y reanuda el giro por rumbo
  // - Oculta la barra compacta
  const handleVolver = useCallback(() => {
    clearAutoRecenterTimer();
    setModoSeguimiento('siguiendo');
    setIsFollowing(true);
    setRecenterTrigger((prev) => prev + 1);
  }, [clearAutoRecenterTimer, setIsFollowing]);

  // Disparador de "Vista general" para encuadrar la ruta completa manteniendo el modo explorando y la barra visible
  const handleOverviewRoute = useCallback(() => {
    clearAutoRecenterTimer();
    setModoSeguimiento('explorando');
    setIsFollowing(false);
    setOverviewTrigger((prev) => prev + 1);
  }, [clearAutoRecenterTimer, setIsFollowing]);

  const handleToggleFollow = useCallback((following: boolean) => {
    setIsFollowing(following);
    setModoSeguimiento((prev) => (prev !== (following ? 'siguiendo' : 'explorando') ? (following ? 'siguiendo' : 'explorando') : prev));
  }, [setIsFollowing]);

  // 2) Activación ÚNICAMENTE por gesto intencional del mapa:
  // Requirement 11 & 12: Pausa el seguimiento y elimina cualquier temporizador de regreso automático.
  // El mapa se queda exactamente como el usuario lo dejó hasta que presione "Volver a centrar".
  const handleUserExplorationGesture = useCallback(() => {
    if (navigationMode !== 'navigating') return;

    setModoSeguimiento('explorando');
    setIsFollowing(false);
    clearAutoRecenterTimer();
  }, [navigationMode, setIsFollowing, clearAutoRecenterTimer]);

  // Asegura modo 'siguiendo' y limpia temporizador solo al volver desde navegación/preview a idle
  const prevNavigationModeRef = useRef<NavigationMode>(navigationMode);
  const navigationModeRef = useRef<NavigationMode>(navigationMode);
  navigationModeRef.current = navigationMode;
  const hasPushedPreviewHistoryRef = useRef<boolean>(false);
  const ignoringPreviewPopstateRef = useRef<boolean>(false);

  const handleExitRoutePreview = useCallback(
    (fromPopstate: boolean = false) => {
      setIsAvoidMenuOpen(false);
      setNavigationMode('idle');
      setRoute(null);
      setRoutes([]);
      setSelectedDestination(null);
      setIsFollowing(true);
      voiceGuidance.clearAlertQueue();

      if (!fromPopstate && hasPushedPreviewHistoryRef.current) {
        hasPushedPreviewHistoryRef.current = false;
        if (typeof window !== 'undefined' && window.history.state?.rutaLimaRoutePreview) {
          ignoringPreviewPopstateRef.current = true;
          try {
            window.history.back();
          } catch {
            ignoringPreviewPopstateRef.current = false;
          }
          setTimeout(() => {
            ignoringPreviewPopstateRef.current = false;
          }, 150);
        }
      } else if (fromPopstate) {
        hasPushedPreviewHistoryRef.current = false;
      }
    },
    [setIsFollowing]
  );

  const handleExitRoutePreviewRef = useRef(handleExitRoutePreview);
  handleExitRoutePreviewRef.current = handleExitRoutePreview;

  useEffect(() => {
    if (navigationMode === 'preview' && !hasPushedPreviewHistoryRef.current) {
      try {
        window.history.pushState({ rutaLimaRoutePreview: true }, '');
        hasPushedPreviewHistoryRef.current = true;
      } catch {}
    } else if (navigationMode === 'idle' && hasPushedPreviewHistoryRef.current) {
      hasPushedPreviewHistoryRef.current = false;
      if (typeof window !== 'undefined' && window.history.state?.rutaLimaRoutePreview) {
        ignoringPreviewPopstateRef.current = true;
        try {
          window.history.back();
        } catch {
          ignoringPreviewPopstateRef.current = false;
        }
        setTimeout(() => {
          ignoringPreviewPopstateRef.current = false;
        }, 150);
      }
    }
  }, [navigationMode]);

  useEffect(() => {
    const handlePreviewPopState = (e: PopStateEvent) => {
      if (ignoringPreviewPopstateRef.current) {
        ignoringPreviewPopstateRef.current = false;
        return;
      }
      // If popping back INTO preview (e.g., closing long-press popup inside preview), stay in preview
      if (e.state?.rutaLimaRoutePreview) {
        return;
      }
      if (hasPushedPreviewHistoryRef.current && navigationModeRef.current === 'preview') {
        handleExitRoutePreviewRef.current(true);
      }
    };
    window.addEventListener('popstate', handlePreviewPopState);
    return () => {
      window.removeEventListener('popstate', handlePreviewPopState);
    };
  }, []);

  useEffect(() => {
    const prevMode = prevNavigationModeRef.current;
    prevNavigationModeRef.current = navigationMode;

    if (prevMode !== 'idle' && navigationMode === 'idle') {
      clearAutoRecenterTimer();
      setModoSeguimiento('siguiendo');
      setIsFollowing(true);
    }
  }, [navigationMode, clearAutoRecenterTimer, setIsFollowing]);

  // 2) Pantalla encendida: Screen Wake Lock durante navegación activa
  useEffect(() => {
    let wakeLockSentinel: any = null;

    const requestWakeLock = async () => {
      if (navigationMode === 'navigating' && 'wakeLock' in navigator) {
        try {
          wakeLockSentinel = await (navigator as any).wakeLock.request('screen');
        } catch (err) {
          console.warn('Screen Wake Lock request failed:', err);
        }
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && navigationMode === 'navigating') {
        requestWakeLock();
      }
    };

    if (navigationMode === 'navigating') {
      requestWakeLock();
      document.addEventListener('visibilitychange', handleVisibilityChange);
    } else {
      if (wakeLockSentinel) {
        try {
          wakeLockSentinel.release();
        } catch {}
        wakeLockSentinel = null;
      }
    }

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (wakeLockSentinel) {
        try {
          wakeLockSentinel.release();
        } catch {}
        wakeLockSentinel = null;
      }
    };
  }, [navigationMode]);

  // Map Tile Mode (direct 2-state Day / Night toggle for top selector)
  type ThemePreference = 'day' | 'night' | 'manual_satellite';

  const [themePreference, setThemePreference] = useState<ThemePreference>(() => {
    try {
      const savedPref = localStorage.getItem('ruta_lima_theme_preference');
      if (savedPref === 'night' || savedPref === 'manual_satellite') {
        return savedPref;
      }
    } catch {}
    return 'day';
  });

  const [mapTileMode, setMapTileMode] = useState<MapTileMode>(() => {
    try {
      const savedPref = localStorage.getItem('ruta_lima_theme_preference');
      if (savedPref === 'night') return 'night';
      if (savedPref === 'manual_satellite') return 'satellite';
    } catch {}
    return 'day';
  });

  const handleCycleThemePreference = useCallback(() => {
    const nextMode: 'day' | 'night' = mapTileMode === 'night' ? 'day' : 'night';
    setThemePreference(nextMode);
    setMapTileMode(nextMode);
    try {
      localStorage.setItem('ruta_lima_theme_preference', nextMode);
    } catch {}
  }, [mapTileMode]);

  const handleTileModeChange = useCallback((mode: MapTileMode) => {
    const nextPref: 'day' | 'night' | 'manual_satellite' =
      mode === 'satellite' ? 'manual_satellite' : mode;
    setThemePreference(nextPref);
    try {
      localStorage.setItem('ruta_lima_theme_preference', nextPref);
    } catch {}
    setMapTileMode(mode);
  }, []);

  const [mapSettings, setMapSettings] = useState<MapSettingsData>(() =>
    getInitialSettings(mapTileMode)
  );

  useEffect(() => {
    voiceGuidance.setRerouteSoundEnabled(mapSettings.rerouteSoundEnabled !== false);
    voiceGuidance.setRerouteSoundVolume(mapSettings.rerouteSoundVolume || 'high');
  }, [mapSettings.rerouteSoundEnabled, mapSettings.rerouteSoundVolume]);

  // Aviso por voz cuando se pierde o se recupera el GPS o el internet durante la navegación
  const lastConnectivityVoiceAtRef = useRef<number>(0);
  const speakConnectivityNotice = useCallback((text: string) => {
    const nowMs = Date.now();
    if (nowMs - lastConnectivityVoiceAtRef.current < 8000) return;
    lastConnectivityVoiceAtRef.current = nowMs;
    voiceGuidance.speak(text, true, true);
  }, []);

  const prevGpsLostRef = useRef<boolean>(false);
  useEffect(() => {
    const wasLost = prevGpsLostRef.current;
    prevGpsLostRef.current = isGpsSignalLost;
    if (navigationMode !== 'navigating' || wasLost === isGpsSignalLost) return;
    speakConnectivityNotice(isGpsSignalLost ? 'Se perdió la señal de GPS' : 'Señal de GPS recuperada');
  }, [isGpsSignalLost, navigationMode, speakConnectivityNotice]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleOffline = () => {
      if (navigationModeRef.current === 'navigating') {
        speakConnectivityNotice('Sin conexión a internet');
      }
    };
    const handleOnline = () => {
      if (navigationModeRef.current === 'navigating') {
        speakConnectivityNotice('Conexión a internet recuperada');
      }
    };
    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, [speakConnectivityNotice]);

  const handleSettingsChange = useCallback((nextSettings: MapSettingsData) => {
    setMapSettings(nextSettings);
    setIsMuted(!nextSettings.voiceEnabled);
    voiceGuidance.setMuted(!nextSettings.voiceEnabled);
    voiceGuidance.setVolume(nextSettings.voiceVolume);
    voiceGuidance.setRerouteSoundEnabled(nextSettings.rerouteSoundEnabled !== false);
    voiceGuidance.setRerouteSoundVolume(nextSettings.rerouteSoundVolume || 'high');
    if (nextSettings.schoolZoneAlertEnabled === false) {
      voiceGuidance.clearVoiceOnlyQueue();
    }
  }, []);

  // Subscribe to synchronized voice+banner queue (Part 5)
  useEffect(() => {
    return voiceGuidance.subscribeBanner((banner) => {
      setActiveVoiceBanner(banner);
    });
  }, []);

  // Traffic / Incidents reported in Lima with LocalStorage persistence and dynamic lifecycle
  const [trafficAlerts, setTrafficAlerts] = useState<TrafficAlert[]>(() => {
    const now = Date.now();
    try {
      const stored = localStorage.getItem('ruta_lima_traffic_alerts');
      if (stored) {
        const parsed: TrafficAlert[] = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          const valid = parsed
            .map((a) => ({
              ...a,
              expiresAt: a.expiresAt || a.timestamp + getAlertOriginalDuration(a.type),
              removalVotes: a.removalVotes || 0,
            }))
            .filter((a) => !isAlertExpired(a, now));
          return valid;
        }
      }
    } catch (e) {
      console.warn('Could not read alerts from storage', e);
    }
    return [
      {
        id: 'alert_1',
        type: 'traffic',
        title: 'Congestión en Vía Expresa',
        description: 'Tráfico denso altura Av. Javier Prado hacia Miraflores',
        coords: { lat: -12.0965, lng: -77.0315 },
        timestamp: now - 12 * 60 * 1000,
        expiresAt: now - 12 * 60 * 1000 + 90 * 60 * 1000,
        status: 'active',
        isUserReport: false,
        creatorId: 'seed_system_1',
        upvotes: 8,
        isConfirmed: true,
        confirmations: 8,
        removalVotes: 0,
      },
      {
        id: 'alert_2',
        type: 'construction',
        title: 'Obras en calzada',
        description: 'Carril derecho restringido por mantenimiento',
        coords: { lat: -12.115, lng: -77.032 },
        timestamp: now - 25 * 60 * 1000,
        expiresAt: now - 25 * 60 * 1000 + 3 * 24 * 60 * 60 * 1000,
        status: 'active',
        isUserReport: false,
        creatorId: 'seed_system_2',
        upvotes: 14,
        isConfirmed: true,
        confirmations: 14,
        removalVotes: 0,
      },
      {
        id: 'alert_3',
        type: 'accident',
        title: 'Incidente vehicular',
        description: 'Choque leve en carril central, tránsito lento',
        coords: { lat: -12.088, lng: -77.05 },
        timestamp: now - 8 * 60 * 1000,
        expiresAt: now - 8 * 60 * 1000 + 90 * 60 * 1000,
        status: 'active',
        isUserReport: false,
        creatorId: 'seed_system_3',
        upvotes: 5,
        isConfirmed: true,
        confirmations: 5,
        removalVotes: 0,
      },
      {
        id: 'alert_4',
        type: 'stopped_vehicle',
        title: 'Vehículo averiado en calzada',
        description: 'Camioneta con balizas en berma de Av. Brasil',
        coords: { lat: -12.072, lng: -77.058 },
        timestamp: now - 5 * 60 * 1000,
        expiresAt: now - 5 * 60 * 1000 + 45 * 60 * 1000,
        status: 'active',
        isUserReport: false,
        creatorId: 'seed_system_4',
        upvotes: 3,
        isConfirmed: false,
        confirmations: 2,
        removalVotes: 0,
      },
    ];
  });

  // State for nearby driver verification prompt ("¿Sigue ahí?")
  const [nearbyPromptAlert, setNearbyPromptAlert] = useState<{
    alert: TrafficAlert;
    distance: number;
  } | null>(null);
  const promptedAlertIdsRef = useRef<Set<string>>(new Set());

  // Pruning interval: remove expired alerts every 10 seconds automatically
  useEffect(() => {
    const pruneExpiredAlerts = () => {
      const now = Date.now();
      setTrafficAlerts((prev) => {
        const active = prev.filter((a) => !isAlertExpired(a, now));
        if (active.length !== prev.length) {
          try {
            localStorage.setItem('ruta_lima_traffic_alerts', JSON.stringify(active));
          } catch (err) {
            console.warn('Could not save pruned alerts', err);
          }
          return active;
        }
        return prev;
      });
    };

    pruneExpiredAlerts();
    const interval = setInterval(pruneExpiredAlerts, 10000);
    return () => clearInterval(interval);
  }, []);

  const offRouteCountRef = useRef<number>(0);
  const offRouteStartTimeRef = useRef<number | null>(null);
  const lastRerouteTimestampRef = useRef<number>(0);
  const rerouteRequestIdRef = useRef<number>(0);
  const rerouteAbortControllerRef = useRef<AbortController | null>(null);
  const rerouteDebounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const rerouteChimePlayedRef = useRef<boolean>(false);

  // Último rumbo confiable conocido del vehículo (>= 5 km/h o desplazamiento real)
  const lastReliableHeadingRef = useRef<number | null>(null);
  const prevGpsForHeadingRef = useRef<{ lat: number; lng: number } | null>(null);
  const mapCarriagewaySnapperRef = useRef<
    | ((
        lat: number,
        lng: number,
        targetHeadingDeg: number,
        maxDistMeters?: number
      ) => CarriagewaySnapResult | null)
    | null
  >(null);

  const handleRegisterCarriagewaySnapper = useCallback(
    (
      snapper:
        | ((
            lat: number,
            lng: number,
            targetHeadingDeg: number,
            maxDistMeters?: number
          ) => CarriagewaySnapResult | null)
        | null
    ) => {
      mapCarriagewaySnapperRef.current = snapper;
    },
    []
  );

  useEffect(() => {
    if (!Number.isFinite(location.lat) || !Number.isFinite(location.lng)) return;
    const speedKmh = (location.speed || 0) * 3.6;

    if (speedKmh >= 5 && location.heading !== null && Number.isFinite(location.heading)) {
      lastReliableHeadingRef.current = normalizeHeadingDeg(location.heading);
      prevGpsForHeadingRef.current = { lat: location.lat, lng: location.lng };
      return;
    }

    const prev = prevGpsForHeadingRef.current;
    if (!prev) {
      prevGpsForHeadingRef.current = { lat: location.lat, lng: location.lng };
    } else {
      const movedMeters = calculateDistanceMeters(prev.lat, prev.lng, location.lat, location.lng);
      if (movedMeters >= 3.5) {
        lastReliableHeadingRef.current = normalizeHeadingDeg(
          getBearing(prev.lat, prev.lng, location.lat, location.lng)
        );
        prevGpsForHeadingRef.current = { lat: location.lat, lng: location.lng };
      }
    }

    if (
      lastReliableHeadingRef.current === null &&
      navigationMode === 'navigating' &&
      route &&
      route.coordinates.length >= 2
    ) {
      const routeMatch = matchUserToRoute(
        location.lat,
        location.lng,
        location.heading,
        route.coordinates
      );
      if (routeMatch.distanceToRoute <= 35 && Number.isFinite(routeMatch.arrowBearing)) {
        lastReliableHeadingRef.current = normalizeHeadingDeg(routeMatch.arrowBearing);
      }
    }
  }, [location.lat, location.lng, location.heading, location.speed, navigationMode, route]);

  const resolveCurrentTravelHeading = useCallback((): number | null => {
    const speedKmh = (location.speed || 0) * 3.6;
    if (speedKmh >= 5 && location.heading !== null && Number.isFinite(location.heading)) {
      return normalizeHeadingDeg(location.heading);
    }
    if (lastReliableHeadingRef.current !== null && Number.isFinite(lastReliableHeadingRef.current)) {
      return lastReliableHeadingRef.current;
    }
    if (navigationMode === 'navigating' && route && route.coordinates.length >= 2) {
      const routeMatch = matchUserToRoute(
        location.lat,
        location.lng,
        location.heading,
        route.coordinates
      );
      if (routeMatch.distanceToRoute <= 40 && Number.isFinite(routeMatch.arrowBearing)) {
        return normalizeHeadingDeg(routeMatch.arrowBearing);
      }
    }
    if (location.heading !== null && Number.isFinite(location.heading)) {
      return normalizeHeadingDeg(location.heading);
    }
    return null;
  }, [location.lat, location.lng, location.heading, location.speed, navigationMode, route]);

  // Voice guidance mute toggle
  const handleToggleMute = useCallback(() => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    voiceGuidance.setMuted(nextMuted);
  }, [isMuted]);

  // Voice guidance repeat last instruction
  const handleRepeatVoice = useCallback(() => {
    voiceGuidance.repeatLastInstruction();
  }, []);

  // Select destination and calculate routes with OSRM (driving or walking)
  const handleSelectDestination = useCallback(
    async (
      destination: SearchResult,
      overrideMode?: TravelMode,
      options?: { autoStart?: boolean }
    ) => {
      setSelectedDestination(destination);
      setRouteError(null);
      setStreetFallbackNotice(null);
      setIsLoadingRoute(true);
      setIsSearchOpenInNav(false);
      rerouteChimePlayedRef.current = false;

      const activeMode = overrideMode || travelMode;
      const originCoords: Coordinates = {
        lat: location.lat,
        lng: location.lng,
      };
      const effectiveHeading =
        (location.speed || 0) > 0.5 || isSimulating ? location.heading : null;

      try {
        let calculatedRoutes: RouteData[];
        try {
          calculatedRoutes = await fetchOSRMRoutes(
            originCoords,
            { lat: destination.lat, lng: destination.lng },
            destination.name,
            activeMode,
            avoidOptions,
            effectiveHeading
          );
          // Guardar la ruta en el teléfono para poder usarla sin internet
          saveRoutes(destination, activeMode, calculatedRoutes);
        } catch (fetchErr: any) {
          // Sin internet (o servidor caído): usar la ruta guardada hacia este destino si estás sobre su trazado
          const saved = findSavedRoutes({ lat: destination.lat, lng: destination.lng }, activeMode);
          if (!saved) throw fetchErr;
          const nearest = Math.min(
            ...saved.routes.map((r) => distanceToRouteMeters(originCoords, r.coordinates))
          );
          if (nearest > MAX_DISTANCE_TO_SAVED_ROUTE_M) {
            throw new Error(
              'Sin conexión: la ruta guardada hacia este destino no pasa cerca de tu ubicación actual.'
            );
          }
          calculatedRoutes = saved.routes;
          const offlineMsg = 'Sin conexión: usando la última ruta guardada hacia este destino.';
          logSystemNotice(offlineMsg, 'Ruta guardada sin internet');
          voiceGuidance.speak(offlineMsg);
        }

        setRoutes(calculatedRoutes);
        setRoute(calculatedRoutes[0]); // Select fastest/recommended route by default
        if (options?.autoStart && calculatedRoutes.length > 0) {
          setNavigationMode('navigating');
          setModoSeguimiento('siguiendo');
          setIsFollowing(true);
          if (activeMode === 'walking') {
            voiceGuidance.speak(
              `Iniciando caminata hacia ${destination.name}. Camina atento por las aceras y cruces peatonales.`
            );
          } else {
            voiceGuidance.speak(
              `Iniciando navegación hacia ${destination.name}. Conduce con precaución.`
            );
          }
        } else {
          setNavigationMode('preview');
          setModoSeguimiento('explorando');
          setIsFollowing(false);
        }
      } catch (err: any) {
        console.error('Route calculation error:', err);
        setRouteError(err.message || 'No se pudo calcular la ruta para este destino.');
      } finally {
        setIsLoadingRoute(false);
      }
    },
    [location.lat, location.lng, location.heading, location.speed, isSimulating, travelMode, avoidOptions, setIsFollowing]
  );

  // Navigate directly to a selected POI from the map ("Ir hasta aquí")
  const handleNavigateToPOI = useCallback(
    (poi: MapPOI) => {
      const meta = POI_CATEGORY_META[poi.category];
      const destination: SearchResult = {
        id: `poi_${poi.id}`,
        name: poi.name,
        display_name: `${poi.name} · ${meta.label}`,
        lat: poi.lat,
        lng: poi.lng,
      };
      handleSelectDestination(destination, undefined, { autoStart: true });
    },
    [handleSelectDestination]
  );

  // Toggle between Driving and Walking modes
  const handleToggleTravelMode = useCallback(
    async (mode: TravelMode) => {
      setTravelMode(mode);
      if (!selectedDestination) return;

      setIsLoadingRoute(true);
      const originCoords: Coordinates = {
        lat: location.lat,
        lng: location.lng,
      };
      const effectiveHeading =
        (location.speed || 0) > 0.5 || isSimulating ? location.heading : null;

      try {
        const calculatedRoutes = await fetchOSRMRoutes(
          originCoords,
          { lat: selectedDestination.lat, lng: selectedDestination.lng },
          selectedDestination.name,
          mode,
          avoidOptions,
          effectiveHeading
        );
        setRoutes(calculatedRoutes);
        setRoute(calculatedRoutes[0]);
      } catch (err: any) {
        console.error('Route recalculation on travel mode toggle error:', err);
        setRouteError(err.message || 'No se pudo calcular la ruta a pie.');
      } finally {
        setIsLoadingRoute(false);
      }
    },
    [selectedDestination, location.lat, location.lng, location.heading, location.speed, isSimulating, avoidOptions]
  );

  // Recalculate routes when changing avoidance options (Peajes, Autopistas, Vías sin pavimentar)
  const handleToggleAvoid = useCallback(
    async (key: 'tolls' | 'highways' | 'unpaved') => {
      const nextOptions = { ...avoidOptions, [key]: !avoidOptions[key] };
      setAvoidOptions(nextOptions);

      if (!selectedDestination) return;

      setIsLoadingRoute(true);
      setRouteError(null);
      const originCoords: Coordinates = {
        lat: location.lat,
        lng: location.lng,
      };
      const effectiveHeading =
        (location.speed || 0) > 0.5 || isSimulating ? location.heading : null;

      try {
        const calculatedRoutes = await fetchOSRMRoutes(
          originCoords,
          { lat: selectedDestination.lat, lng: selectedDestination.lng },
          selectedDestination.name,
          travelMode,
          nextOptions,
          effectiveHeading
        );

        setRoutes(calculatedRoutes);
        setRoute(calculatedRoutes[0]);
        voiceGuidance.speak(
          nextOptions[key]
            ? `Rutas recalculadas evitando ${key === 'tolls' ? 'peajes' : key === 'highways' ? 'autopistas' : 'vías sin pavimentar'}.`
            : 'Rutas recalculadas.'
        );
      } catch (err: any) {
        console.warn('Avoid recalculation error:', err);
        setRouteError(err.message || 'No encontramos una ruta que evite eso');
      } finally {
        setIsLoadingRoute(false);
      }
    },
    [avoidOptions, selectedDestination, location.lat, location.lng, location.heading, location.speed, isSimulating, travelMode]
  );

  // Switch between alternative routes
  const handleSelectRoute = useCallback((selectedRoute: RouteData) => {
    setRoute(selectedRoute);
  }, []);

  // Recalculate route on deviation (starting from arrow tip, forward direction, no U-turn)
  const handleRecalculateRoute = useCallback(async () => {
    if (!selectedDestination) return;

    // Cancel any previous pending reroute request immediately
    if (rerouteAbortControllerRef.current) {
      rerouteAbortControllerRef.current.abort();
      rerouteAbortControllerRef.current = null;
    }
    const abortController = new AbortController();
    rerouteAbortControllerRef.current = abortController;

    if (rerouteDebounceTimerRef.current) {
      clearTimeout(rerouteDebounceTimerRef.current);
      rerouteDebounceTimerRef.current = null;
    }

    setIsRerouting(true);
    offRouteCountRef.current = 0;
    offRouteStartTimeRef.current = null;
    if (!rerouteChimePlayedRef.current) {
      rerouteChimePlayedRef.current = true;
      voiceGuidance.playRerouteChime();
    }

    // Usar la posición GPS actual y el rumbo para que OSRM siga calles reales sin atajos en diagonal
    const effectiveHeading =
      location.heading !== null && location.heading !== undefined
        ? location.heading
        : 0;
    const reqLocSnapshot = { lat: location.lat, lng: location.lng };
    const thisRequestId = ++rerouteRequestIdRef.current;

    try {
      const freshRoutes = await fetchOSRMRoutes(
        reqLocSnapshot,
        { lat: selectedDestination.lat, lng: selectedDestination.lng },
        selectedDestination.name,
        travelMode,
        avoidOptions,
        effectiveHeading,
        true,
        abortController.signal
      );

      // Discard if another reroute request was started in the meantime or aborted
      if (thisRequestId !== rerouteRequestIdRef.current || abortController.signal.aborted) {
        return;
      }

      // If user moved > 45m while calculation was underway, discard stale response and re-request immediately
      const distTraveledSinceReq = calculateDistanceMeters(
        location.lat,
        location.lng,
        reqLocSnapshot.lat,
        reqLocSnapshot.lng
      );
      if (distTraveledSinceReq > 45) {
        setIsRerouting(false);
        handleRecalculateRoute();
        return;
      }

      if (freshRoutes && freshRoutes.length > 0) {
        setRouteError(null);
        setRoutes(freshRoutes);
        setRoute(freshRoutes[0]);
        lastRerouteTimestampRef.current = Date.now();
        if (isSimulating) {
          startSimulation(freshRoutes[0].coordinates);
        }
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        return;
      }
      console.warn('Recalculation error:', err);
      setRouteError(err?.message || 'No se pudo recalcular la ruta con OSRM.');
    } finally {
      if (thisRequestId === rerouteRequestIdRef.current) {
        setTimeout(() => {
          setIsRerouting(false);
        }, 800);
      }
    }
  }, [
    selectedDestination,
    location.lat,
    location.lng,
    location.heading,
    travelMode,
    avoidOptions,
    isSimulating,
    startSimulation,
  ]);

  // Start Navigation (3D perspective active)
  const handleStartNavigation = useCallback(() => {
    if (!route || !selectedDestination) return;

    voiceGuidance.unlockAudioContext();
    voiceGuidance.clearAlertQueue();
    if (hasPushedPreviewHistoryRef.current) {
      hasPushedPreviewHistoryRef.current = false;
      if (typeof window !== 'undefined' && window.history.state?.rutaLimaRoutePreview) {
        try {
          window.history.replaceState(null, '');
        } catch {}
      }
    }
    setNavigationMode('navigating');
    setModoSeguimiento('siguiendo');
    setIsFollowing(true);

    if (travelMode === 'walking') {
      voiceGuidance.speak(
        `Iniciando caminata hacia ${selectedDestination.name}. Camina atento por las aceras y cruces peatonales.`
      );
    } else {
      voiceGuidance.speak(
        `Iniciando navegación hacia ${selectedDestination.name}. Conduce con precaución.`
      );
    }
  }, [route, selectedDestination, travelMode, setIsFollowing]);

  // Start Simulation
  const handleStartSimulation = useCallback(() => {
    if (!route || !selectedDestination) return;

    voiceGuidance.unlockAudioContext();
    setNavigationMode('navigating');
    setModoSeguimiento('siguiendo');
    setIsFollowing(true);

    voiceGuidance.speak(`Iniciando simulación de ruta hacia ${selectedDestination.name}`);
    startSimulation(route.coordinates);
  }, [route, selectedDestination, setIsFollowing, startSimulation]);

  // Cancel / Finish Navigation
  const handleCancelNavigation = useCallback(() => {
    clearAutoRecenterTimer();
    if (rerouteDebounceTimerRef.current) {
      clearTimeout(rerouteDebounceTimerRef.current);
      rerouteDebounceTimerRef.current = null;
    }
    if (rerouteAbortControllerRef.current) {
      rerouteAbortControllerRef.current.abort();
      rerouteAbortControllerRef.current = null;
    }
    rerouteRequestIdRef.current += 1;
    offRouteStartTimeRef.current = null;
    rerouteChimePlayedRef.current = false;
    setIsRerouting(false);
    setIsLoadingRoute(false);
    setRouteError(null);
    setIsAvoidMenuOpen(false);
    if (isSimulating) {
      stopSimulation();
    }
    setModoSeguimiento('siguiendo');
    setNavigationMode('idle');
    setRoute(null);
    setRoutes([]);
    setSelectedDestination(null);
    setIsFollowing(true);
    setIsSearchOpenInNav(false);
    voiceGuidance.clearAlertQueue();
    voiceGuidance.resetAnnouncedIncidents();
    voiceGuidance.speak('Navegación finalizada.');
  }, [clearAutoRecenterTimer, isSimulating, stopSimulation, setIsFollowing]);

  // User reports a traffic incident with dynamic lifetime calculation, heading, speed & carriageway snapping
  const handleReportIncident = useCallback(
    (
      type: TrafficAlertType,
      title: string,
      description: string,
      policeSubtype?: PoliceSubtype,
      inspectorSubtype?: InspectorSubtype
    ) => {
      const now = Date.now();
      const originalDuration = getAlertOriginalDuration(type);
      const currentUserId = getDeviceUserId();
      const origLat = location.lat;
      const origLng = location.lng;
      const fallbackZone = getLimaZoneFallback(origLat, origLng);
      const newAlertId = `alert_${now}`;

      const speedKmh =
        location.speed !== null && Number.isFinite(location.speed)
          ? Math.round(location.speed * 3.6 * 10) / 10
          : 0;
      const userTravelHeading = resolveCurrentTravelHeading();
      const isOppositeLanePolice = type === 'police' && policeSubtype === 'opposite_lane';
      const targetReportHeading =
        userTravelHeading !== null
          ? isOppositeLanePolice
            ? getOppositeHeading(userTravelHeading)
            : userTravelHeading
          : null;

      // Ajuste inmediato contra geometría vectorial cargada (tolerancia 45°); si no hay calzada clara, se conserva el punto original
      const instantSnap =
        targetReportHeading !== null && mapCarriagewaySnapperRef.current
          ? mapCarriagewaySnapperRef.current(
              origLat,
              origLng,
              targetReportHeading,
              isOppositeLanePolice ? 54 : 38
            )
          : null;

      const initialCoords: Coordinates =
        instantSnap && instantSnap.matched ? instantSnap.coords : { lat: origLat, lng: origLng };

      // Cuando la vía es de un solo carril o de doble sentido sin separador, vale automáticamente para ambos sentidos
      const initialAutoBothDirections =
        !isOppositeLanePolice && Boolean(instantSnap?.matched && instantSnap.isUndividedOrSingleLane);

      const newAlert: TrafficAlert = {
        id: newAlertId,
        type,
        ...(type === 'police' ? { policeSubtype: policeSubtype || 'visible' } : {}),
        ...(type === 'inspectors' ? { inspectorSubtype: inspectorSubtype || 'inspector_a' } : {}),
        title,
        description,
        zone: fallbackZone,
        address: fallbackZone,
        coords: initialCoords,
        timestamp: now,
        expiresAt: now + originalDuration,
        status: 'active',
        isUserReport: true,
        creatorId: currentUserId,
        upvotes: 1,
        isConfirmed: false,
        confirmations: 1,
        removalVotes: 0,
        heading: targetReportHeading,
        speedKmh,
        roadId: instantSnap?.roadId,
        carriagewayId: instantSnap?.carriagewayId,
        bothDirections: initialAutoBothDirections,
      };

      console.log('[RUTA LIMA][Reporte] Rumbo y calzada elegidos:', {
        id: newAlertId,
        tipo: type,
        ...(policeSubtype ? { subtipoPolicia: policeSubtype } : {}),
        ...(inspectorSubtype ? { subtipoInspector: inspectorSubtype } : {}),
        rumboUsuario: userTravelHeading,
        rumboReporte: targetReportHeading,
        sentido: formatDirectionLabelSpanish(targetReportHeading, initialAutoBothDirections),
        velocidadKmh: speedKmh,
        ambosSentidos: initialAutoBothDirections,
        calzadaElegida: instantSnap?.matched
          ? {
              fuente: 'tesela_mapa',
              roadId: instantSnap.roadId,
              carriagewayId: instantSnap.carriagewayId,
              via: instantSnap.roadName || fallbackZone,
              unSentido: Boolean(instantSnap.isOneway),
              sinSeparadorOUnCarril: Boolean(instantSnap.isUndividedOrSingleLane),
              distanciaMetros:
                instantSnap.distanceMeters !== undefined
                  ? Math.round(instantSnap.distanceMeters * 10) / 10
                  : null,
              coordenadas: initialCoords,
            }
          : {
              fuente: 'gps_original',
              via: fallbackZone,
              coordenadas: initialCoords,
            },
      });

      // Si el usuario creó el reporte, no se le pregunta por ese mismo reporte
      addVotedAlertId(newAlert.id);

      setTrafficAlerts((prev) => {
        const updated = [newAlert, ...prev];
        try {
          localStorage.setItem('ruta_lima_traffic_alerts', JSON.stringify(updated));
        } catch (err) {
          console.warn('Could not persist alerts', err);
        }
        return updated;
      });
      voiceGuidance.speak('Incidente reportado en RUTA LIMA. Gracias por colaborar.');

      // Ajuste preciso contra la geometría oficial de OpenStreetMap (eje de la calzada del sentido correcto, tolerancia 45°)
      if (targetReportHeading !== null) {
        snapReportToOsmCarriageway(origLat, origLng, targetReportHeading, {
          searchRadiusMeters: 58,
          maxAngleDiffDeg: 45,
          maxPrimaryDistanceMeters: isOppositeLanePolice ? 54 : 38,
          maxOppositeDistanceMeters: 56,
          ...(isOppositeLanePolice
            ? { preferDifferentFromPoint: { lat: origLat, lng: origLng } }
            : {}),
        }).then((snapResult) => {
          const osmAutoBothDirections =
            !isOppositeLanePolice &&
            Boolean(snapResult.primary.matched && snapResult.primary.isUndividedOrSingleLane);

          console.log('[RUTA LIMA][Reporte][OSM] Calzada confirmada:', {
            id: newAlertId,
            rumboReporte: targetReportHeading,
            sentido: formatDirectionLabelSpanish(targetReportHeading, osmAutoBothDirections),
            coincidenciaOSM: snapResult.primary.matched,
            ambosSentidosAutomatico: osmAutoBothDirections,
            calzadaElegida: snapResult.primary.matched
              ? {
                  roadId: snapResult.primary.roadId,
                  carriagewayId: snapResult.primary.carriagewayId,
                  via: snapResult.primary.roadName || fallbackZone,
                  unSentido: Boolean(snapResult.primary.isOneway),
                  carriles: snapResult.primary.lanes ?? null,
                  sinSeparadorOUnCarril: Boolean(snapResult.primary.isUndividedOrSingleLane),
                  rumboCalzada:
                    snapResult.primary.headingDeg !== undefined
                      ? Math.round(snapResult.primary.headingDeg)
                      : null,
                  distanciaMetros:
                    snapResult.primary.distanceMeters !== undefined
                      ? Math.round(snapResult.primary.distanceMeters * 10) / 10
                      : null,
                  coordenadas: snapResult.primary.coords,
                }
              : {
                  motivo: 'sin_calzada_clara_conserva_original',
                  coordenadas: { lat: origLat, lng: origLng },
                },
            ...(snapResult.opposite?.matched
              ? {
                  calzadaContraria: {
                    roadId: snapResult.opposite.roadId,
                    carriagewayId: snapResult.opposite.carriagewayId,
                    coordenadas: snapResult.opposite.coords,
                  },
                }
              : {}),
          });

          if (!snapResult.primary.matched && !snapResult.opposite?.matched) return;
          setTrafficAlerts((prev) => {
            let changed = false;
            const updated = prev.map((a) => {
              if (a.id !== newAlertId) return a;
              changed = true;
              const respectManualToggle = manuallyToggledBothDirectionsIdsRef.current.has(newAlertId);
              return {
                ...a,
                ...(snapResult.primary.matched
                  ? {
                      coords: snapResult.primary.coords,
                      roadId: snapResult.primary.roadId || a.roadId,
                      carriagewayId: snapResult.primary.carriagewayId || a.carriagewayId,
                      ...(!respectManualToggle ? { bothDirections: osmAutoBothDirections } : {}),
                    }
                  : {}),
                ...(snapResult.opposite?.matched
                  ? {
                      oppositeCoords: snapResult.opposite.coords,
                      oppositeRoadId: snapResult.opposite.roadId,
                    }
                  : {}),
              };
            });
            if (changed) {
              try {
                localStorage.setItem('ruta_lima_traffic_alerts', JSON.stringify(updated));
              } catch {}
            }
            return changed ? updated : prev;
          });
        });
      }

      // Resolve exact street/district name asynchronously for live feeds & popups
      reverseGeocodeLimaZone(initialCoords.lat, initialCoords.lng).then(({ zone, address }) => {
        setTrafficAlerts((prev) => {
          let changed = false;
          const updated = prev.map((a) => {
            if (a.id === newAlertId) {
              changed = true;
              return { ...a, zone, address };
            }
            return a;
          });
          if (changed) {
            try {
              localStorage.setItem('ruta_lima_traffic_alerts', JSON.stringify(updated));
            } catch {}
          }
          return changed ? updated : prev;
        });
      });
    },
    [location.lat, location.lng, location.speed, resolveCurrentTravelHeading]
  );

  const trafficAlertsLatestRef = useRef(trafficAlerts);
  trafficAlertsLatestRef.current = trafficAlerts;
  const manuallyToggledBothDirectionsIdsRef = useRef<Set<string>>(new Set());

  // Alternar "Marcar para ambos sentidos" desde la tarjeta del reporte comunitario
  const handleToggleAlertBothDirections = useCallback((alertId: string) => {
    const existing = trafficAlertsLatestRef.current.find((a) => a.id === alertId);
    if (!existing) return;

    // Reportes existentes sin sentido guardado permanecen como "ambos sentidos" sin moverse
    if (
      existing.heading === null ||
      existing.heading === undefined ||
      !Number.isFinite(existing.heading)
    ) {
      return;
    }

    manuallyToggledBothDirectionsIdsRef.current.add(alertId);

    const nextBoth = !existing.bothDirections;
    let computedOppositeCoords = existing.oppositeCoords;
    let computedOppositeRoadId = existing.oppositeRoadId;
    const baseHeading = normalizeHeadingDeg(existing.heading);
    const needsOsmOpposite = nextBoth && !existing.oppositeCoords;

    if (nextBoth && !computedOppositeCoords) {
      if (baseHeading !== null && mapCarriagewaySnapperRef.current) {
        const oppHeading = getOppositeHeading(baseHeading);
        const snapOpp = mapCarriagewaySnapperRef.current(
          existing.coords.lat,
          existing.coords.lng,
          oppHeading,
          54
        );
        if (
          snapOpp &&
          snapOpp.matched &&
          calculateDistanceMeters(
            existing.coords.lat,
            existing.coords.lng,
            snapOpp.coords.lat,
            snapOpp.coords.lng
          ) >= 2.5
        ) {
          computedOppositeCoords = snapOpp.coords;
          computedOppositeRoadId = snapOpp.roadId;
        }
      }
      if (!computedOppositeCoords) {
        computedOppositeCoords = offsetCoordPerpendicular(
          existing.coords.lat,
          existing.coords.lng,
          baseHeading ?? 0,
          -5.5
        );
      }
    }

    setTrafficAlerts((prev) => {
      let changed = false;
      const updated = prev.map((alert) => {
        if (alert.id !== alertId) return alert;
        changed = true;
        if (!nextBoth) {
          return { ...alert, bothDirections: false };
        }
        return {
          ...alert,
          bothDirections: true,
          oppositeCoords: computedOppositeCoords,
          oppositeRoadId: computedOppositeRoadId,
        };
      });

      if (changed) {
        try {
          localStorage.setItem('ruta_lima_traffic_alerts', JSON.stringify(updated));
        } catch {}
      }
      return changed ? updated : prev;
    });

    if (needsOsmOpposite && baseHeading !== null) {
      snapReportToOsmCarriageway(existing.coords.lat, existing.coords.lng, baseHeading, {
        searchRadiusMeters: 58,
        maxAngleDiffDeg: 45,
        maxPrimaryDistanceMeters: 38,
        maxOppositeDistanceMeters: 56,
      }).then((snapResult) => {
        if (!snapResult.opposite?.matched) return;
        setTrafficAlerts((prev) => {
          let changed = false;
          const updated = prev.map((a) => {
            if (a.id !== alertId) return a;
            changed = true;
            return {
              ...a,
              oppositeCoords: snapResult.opposite!.coords,
              oppositeRoadId: snapResult.opposite!.roadId,
            };
          });
          if (changed) {
            try {
              localStorage.setItem('ruta_lima_traffic_alerts', JSON.stringify(updated));
            } catch {}
          }
          return changed ? updated : prev;
        });
      });
    }
  }, []);

  // Proximity monitor: Prompt driver when <= 150m from an active report
  useEffect(() => {
    if (!location.lat || !location.lng) return;
    if (nearbyPromptAlert) return; // Keep current active prompt until answered or auto-closed

    const currentUserId = getDeviceUserId();
    const votedIds = getVotedAlertIds();
    const now = Date.now();
    const isMovingForPrompt = (location.speed || 0) * 3.6 >= 5 || navigationMode === 'navigating';
    const currentHeading = isMovingForPrompt ? resolveCurrentTravelHeading() : null;

    const candidates = trafficAlerts
      .filter((a) => {
        if (isAlertExpired(a, now)) return false;
        // Si el usuario creó el reporte, no se le pregunta por ese mismo reporte
        if (a.creatorId === currentUserId) return false;
        // Un mismo usuario solo puede votar una vez por reporte
        if (votedIds.has(a.id)) return false;
        // Si ya fue mostrado o descartado en este recorrido, no volver a mostrar
        if (promptedAlertIdsRef.current.has(a.id)) return false;
        // No consultar por reportes del sentido contrario
        if (currentHeading !== null && !isAlertMatchingRouteHeading(a, currentHeading, 60)) {
          return false;
        }
        return true;
      })
      .map((a) => {
        const pts = getAlertTargetCoords(a);
        const minDist = Math.min(
          ...pts.map((pt) => calculateDistanceMeters(location.lat, location.lng, pt.lat, pt.lng))
        );
        return {
          alert: a,
          distance: minDist,
        };
      })
      .filter((item) => item.distance <= 150)
      .sort((a, b) => a.distance - b.distance);

    if (candidates.length > 0) {
      setNearbyPromptAlert(candidates[0]);
    }
  }, [
    location.lat,
    location.lng,
    location.speed,
    navigationMode,
    trafficAlerts,
    nearbyPromptAlert,
    resolveCurrentTravelHeading,
  ]);

  // Voto "Sigue ahí": renueva el reporte y le suma tiempo de vida (la mitad de su duración original)
  const handleConfirmStillThere = useCallback((alertId: string) => {
    addVotedAlertId(alertId);
    promptedAlertIdsRef.current.add(alertId);
    setNearbyPromptAlert(null);

    setTrafficAlerts((prev) => {
      const now = Date.now();
      const updated = prev.map((alert) => {
        if (alert.id === alertId) {
          const originalDuration = getAlertOriginalDuration(alert.type);
          const halfOriginal = Math.round(originalDuration / 2);
          const currentExpiry = Math.max(alert.expiresAt || (alert.timestamp + originalDuration), now);
          const nextConfirmations = (alert.confirmations || 1) + 1;

          return {
            ...alert,
            expiresAt: currentExpiry + halfOriginal,
            confirmations: nextConfirmations,
            isConfirmed: nextConfirmations >= 3,
            upvotes: (alert.upvotes || 0) + 1,
          };
        }
        return alert;
      });

      try {
        localStorage.setItem('ruta_lima_traffic_alerts', JSON.stringify(updated));
      } catch (err) {
        console.warn('Could not persist alerts', err);
      }
      return updated;
    });

    voiceGuidance.speak('Gracias por confirmar que el reporte sigue ahí.');
  }, []);

  // Voto "Ya no está": suma un voto de eliminación. Con 3 votos, se elimina. Con 1 o 2, se acorta su vida a la mitad.
  const handleReportNotThere = useCallback((alertId: string) => {
    addVotedAlertId(alertId);
    promptedAlertIdsRef.current.add(alertId);
    setNearbyPromptAlert(null);

    setTrafficAlerts((prev) => {
      const now = Date.now();
      let wasDeleted = false;

      const updated = prev
        .map((alert) => {
          if (alert.id === alertId) {
            const currentRemovalVotes = (alert.removalVotes || 0) + 1;

            // Con 3 votos de conductores distintos, el reporte se elimina de inmediato
            if (currentRemovalVotes >= 3) {
              wasDeleted = true;
              return null;
            }

            // Con 1 o 2 votos, se acorta su vida restante a la mitad
            const originalDuration = getAlertOriginalDuration(alert.type);
            const currentExpiry = alert.expiresAt || (alert.timestamp + originalDuration);
            const remaining = Math.max(0, currentExpiry - now);
            const halfRemaining = Math.round(remaining / 2);

            return {
              ...alert,
              removalVotes: currentRemovalVotes,
              expiresAt: now + halfRemaining,
            };
          }
          return alert;
        })
        .filter((a): a is TrafficAlert => a !== null);

      try {
        localStorage.setItem('ruta_lima_traffic_alerts', JSON.stringify(updated));
      } catch (err) {
        console.warn('Could not persist alerts', err);
      }

      if (wasDeleted) {
        voiceGuidance.cancelAlertById(alertId);
        voiceGuidance.speak('Reporte retirado del mapa por los conductores.');
      } else {
        voiceGuidance.speak('Gracias por avisar. Se actualizó el tiempo de vida del reporte.');
      }

      return updated;
    });
  }, []);

  // Descartar prompt de verificación
  const handleDismissPrompt = useCallback((alertId: string) => {
    promptedAlertIdsRef.current.add(alertId);
    setNearbyPromptAlert(null);
  }, []);

  // Confirm an existing traffic incident from popup or list
  const handleConfirmIncident = useCallback((alertId: string) => {
    handleConfirmStillThere(alertId);
  }, [handleConfirmStillThere]);

  // Active inspectors tracking for "Inspectores en vivo" (Part 2)
  const activeInspectors = useMemo(() => {
    const now = Date.now();
    return trafficAlerts.filter(
      (a) => a.type === 'inspectors' && !isAlertExpired(a, now) && (a.removalVotes || 0) < 3
    );
  }, [trafficAlerts]);

  const hasNewInspectors = useMemo(
    () => activeInspectors.some((a) => a.timestamp > lastSeenInspectorsAt),
    [activeInspectors, lastSeenInspectorsAt]
  );

  const handleOpenLiveInspectors = useCallback(() => {
    const now = Date.now();
    setIsLiveInspectorsOpen(true);
    setLastSeenInspectorsAt(now);
    try {
      localStorage.setItem('ruta_lima_last_seen_inspectors_at', String(now));
    } catch {}
  }, []);

  const handleFocusInspector = useCallback(
    (alert: TrafficAlert) => {
      setIsFollowing(false);
      if (navigationMode === 'navigating') {
        setModoSeguimiento('explorando');
      }
      setFocusCoordsTrigger({
        lat: alert.coords.lat,
        lng: alert.coords.lng,
        zoom: 17,
        seq: Date.now(),
      });
    },
    [navigationMode, setIsFollowing]
  );

  const handleFocusStreetFallback = useCallback(
    (place: SearchResult) => {
      setIsFollowing(false);
      if (navigationMode === 'navigating') {
        setModoSeguimiento('explorando');
        setIsSearchOpenInNav(false);
      }
      setFocusCoordsTrigger({
        lat: place.lat,
        lng: place.lng,
        zoom: 16,
        seq: Date.now(),
      });
      setStreetFallbackNotice({
        message:
          place.fallbackNotice ||
          'No se encontró el número exacto, se muestra la vía',
        place,
      });
    },
    [navigationMode, setIsFollowing]
  );

  useEffect(() => {
    if (!streetFallbackNotice) return;
    logSystemNotice(
      streetFallbackNotice.message,
      'Búsqueda aproximada de vía (streetFallbackNotice)'
    );
    const timer = setTimeout(() => {
      setStreetFallbackNotice(null);
    }, 6500);
    return () => clearTimeout(timer);
  }, [streetFallbackNotice]);

  // Active step and forward progress calculation along route geometry
  const { currentStep, distanceToStep, nextStep, stepIndex } = route
    ? findCurrentStep(
        { lat: location.lat, lng: location.lng },
        route.steps,
        route.coordinates
      )
    : {
        currentStep: {
          distance: 0,
          duration: 0,
          instruction: 'Sigue la ruta',
          type: 'continue' as const,
          name: '',
          coordinates: [location.lat, location.lng] as [number, number],
        },
        distanceToStep: 0,
        nextStep: undefined,
        stepIndex: 0,
      };

  // Remaining distance & duration along route polyline (accurate forward distance countdown)
  const remainingDistance = useMemo(() => {
    if (!route || !route.coordinates || route.coordinates.length < 2) return 0;
    try {
      const match = matchUserToRoute(
        location.lat,
        location.lng,
        location.heading,
        route.coordinates
      );
      if (match.remainingCoords && match.remainingCoords.length >= 2) {
        let total = 0;
        for (let i = 0; i < match.remainingCoords.length - 1; i++) {
          total += calculateDistanceMeters(
            match.remainingCoords[i][0],
            match.remainingCoords[i][1],
            match.remainingCoords[i + 1][0],
            match.remainingCoords[i + 1][1]
          );
        }
        return Math.round(total);
      }
    } catch {}
    return Math.round(
      calculateDistanceMeters(
        location.lat,
        location.lng,
        route.destinationCoords.lat,
        route.destinationCoords.lng
      )
    );
  }, [route, location.lat, location.lng, location.heading]);

  const currentSpeedKmh = Math.max(0, (location.speed || 0) * 3.6);
  const speedMetersPerSec = travelMode === 'walking'
    ? 1.28
    : (currentSpeedKmh > 12 ? currentSpeedKmh / 3.6 : 9.7);
  const remainingDuration = Math.max(30, Math.round(remainingDistance / speedMetersPerSec));

  // Monitor voice announcements, arrival and off-route deviations
  useEffect(() => {
    if (navigationMode !== 'navigating' || !route || isRerouting) return;

    const userCoords = { lat: location.lat, lng: location.lng };

    // Check Destination Arrival (< 35m)
    const distToDestination = calculateDistanceMeters(
      userCoords.lat,
      userCoords.lng,
      route.destinationCoords.lat,
      route.destinationCoords.lng
    );

    if (distToDestination < 35) {
      setNavigationMode('arrived');
      const arrivalMsg =
        travelMode === 'walking'
          ? `Has llegado a tu destino a pie, ${route.destinationName}. ¡Buen trayecto con RUTA LIMA!`
          : `Has llegado a tu destino, ${route.destinationName}. ¡Buen viaje con RUTA LIMA!`;
      voiceGuidance.speak(arrivalMsg);
      if (isSimulating) {
        stopSimulation();
      }
      return;
    }

    // Prioritize reading aloud safety announcements for approaching high-confirmation traffic incidents
    voiceGuidance.checkAndAnnounceTrafficIncidents(
      userCoords,
      trafficAlerts,
      travelMode,
      mapSettings.navAlerts ? ['inspectors'] : ALL_TRAFFIC_ALERT_TYPES,
      route.coordinates,
      resolveCurrentTravelHeading()
    );

    // Voice guidance with structured non-repetitive distance thresholds
    const stepKey = `${stepIndex}_${currentStep.instruction}`;
    voiceGuidance.speakManeuver(stepKey, distanceToStep, currentStep.instruction, travelMode);

    // Check Off-Route Deviation & Direction Reversal
    // Dispara el recálculo automático de forma inmediata (con debounce máximo de 1.5s)
    // al detectar una desviación sostenida > 25 metros o un cambio de sentido (contravía / marcha opuesta)
    const match = route && route.coordinates.length >= 2
      ? matchUserToRoute(location.lat, location.lng, location.heading, route.coordinates)
      : null;

    const currentDeviationMeters = match ? match.distanceToRoute : getDistanceToRoute(userCoords, route.coordinates);
    const isMoving = (location.speed || 0) * 3.6 >= 2.5;
    const isReversal = match ? match.isReversal && isMoving : false;
    const isGpsAccurate = !location.accuracy || location.accuracy <= 40;

    const isOff = isGpsAccurate && (currentDeviationMeters > 25 || isReversal);

    if (isOff) {
      // Si la desviación es fuerte (> 45m) o va en contravía evidente, recalcular de inmediato
      if (currentDeviationMeters > 45 || isReversal) {
        if (rerouteDebounceTimerRef.current) {
          clearTimeout(rerouteDebounceTimerRef.current);
          rerouteDebounceTimerRef.current = null;
        }
        handleRecalculateRoute();
      } else {
        // Desviación entre 25 y 45m: debounce de máximo 1.5s (1500ms) para filtrar fluctuaciones del GPS
        if (!rerouteDebounceTimerRef.current) {
          rerouteDebounceTimerRef.current = setTimeout(() => {
            rerouteDebounceTimerRef.current = null;
            handleRecalculateRoute();
          }, 1500);
        }
      }
    } else {
      // Dentro de la ruta tolerada: cancelar cualquier recálculo pendiente
      if (rerouteDebounceTimerRef.current) {
        clearTimeout(rerouteDebounceTimerRef.current);
        rerouteDebounceTimerRef.current = null;
      }
      offRouteStartTimeRef.current = null;
      rerouteChimePlayedRef.current = false;
    }
  }, [
    navigationMode,
    location.lat,
    location.lng,
    location.heading,
    location.speed,
    location.accuracy,
    route,
    distanceToStep,
    currentStep.instruction,
    stepIndex,
    travelMode,
    isRerouting,
    isSimulating,
    trafficAlerts,
    mapSettings.navAlerts,
    handleRecalculateRoute,
    stopSimulation,
    resolveCurrentTravelHeading,
  ]);

  // Seguimiento de reportes comunitarios ya avisados en conducción libre (sin ruta activa)
  const freeDriveAnnouncedInitialRef = useRef<Set<string>>(new Set());
  const freeDriveAnnouncedFinalRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (navigationMode === 'navigating' || navigationMode === 'arrived') {
      freeDriveAnnouncedInitialRef.current.clear();
      freeDriveAnnouncedFinalRef.current.clear();
    }
  }, [navigationMode]);

  // Avisos por voz y banner breve en pantalla principal (sin ruta activa) al acercarse a reportes de la comunidad (> 10 km/h)
  useEffect(() => {
    if (
      navigationMode !== 'idle' ||
      route !== null ||
      !mapSettings.navAlerts ||
      !trafficAlerts ||
      trafficAlerts.length === 0
    ) {
      return;
    }

    const speedKmh = (location.speed || 0) * 3.6;
    if (speedKmh <= 10) return;

    const events = evaluateFreeDriveCommunityAlerts(
      { lat: location.lat, lng: location.lng },
      resolveCurrentTravelHeading(),
      speedKmh,
      trafficAlerts,
      freeDriveAnnouncedInitialRef.current,
      freeDriveAnnouncedFinalRef.current
    );

    for (const ev of events) {
      voiceGuidance.enqueueAlertBanner({
        text: ev.text,
        alertId: ev.alert.id,
        variant: ev.variant,
        voiceEnabled: !isMuted && mapSettings.voiceEnabled,
      });
    }
  }, [
    navigationMode,
    route,
    location.lat,
    location.lng,
    location.speed,
    location.heading,
    trafficAlerts,
    mapSettings.navAlerts,
    mapSettings.voiceEnabled,
    isMuted,
    resolveCurrentTravelHeading,
  ]);

  // Part 3: Pre-route summary & inspector detection along preview route
  const preRouteSummary = useMemo(() => {
    if (navigationMode !== 'preview' || !route) return null;
    return buildPreRouteVoiceSummary(route.coordinates, trafficAlerts);
  }, [navigationMode, route, trafficAlerts]);

  const lastAnnouncedPreviewKeyRef = useRef<string>('');
  const [showClearRouteCheck, setShowClearRouteCheck] = useState<boolean>(false);
  const [clearRouteCheckKey, setClearRouteCheckKey] = useState<number>(0);
  const clearRouteCheckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (navigationMode !== 'preview' || !route) {
      lastAnnouncedPreviewKeyRef.current = '';
      if (clearRouteCheckTimerRef.current) {
        clearTimeout(clearRouteCheckTimerRef.current);
        clearRouteCheckTimerRef.current = null;
      }
      setShowClearRouteCheck(false);
      return;
    }

    const previewKey = `${route.id}_${Math.round(route.distance)}_${route.coordinates.length}`;
    if (lastAnnouncedPreviewKeyRef.current === previewKey) return;
    lastAnnouncedPreviewKeyRef.current = previewKey;

    const summary = buildPreRouteVoiceSummary(route.coordinates, trafficAlerts);
    voiceGuidance.clearAlertQueue();

    if (summary.totalCount === 0) {
      if (clearRouteCheckTimerRef.current) {
        clearTimeout(clearRouteCheckTimerRef.current);
        clearRouteCheckTimerRef.current = null;
      }
      setClearRouteCheckKey((prev) => prev + 1);
      setShowClearRouteCheck(true);
      clearRouteCheckTimerRef.current = setTimeout(() => {
        setShowClearRouteCheck(false);
        clearRouteCheckTimerRef.current = null;
      }, 1980);

      if (mapSettings.preRouteAlertsEnabled && !isMuted && mapSettings.voiceEnabled) {
        voiceGuidance.speak(summary.speechText, true);
      }
      return;
    }

    if (clearRouteCheckTimerRef.current) {
      clearTimeout(clearRouteCheckTimerRef.current);
      clearRouteCheckTimerRef.current = null;
    }
    setShowClearRouteCheck(false);

    if (!mapSettings.preRouteAlertsEnabled) return;

    voiceGuidance.enqueueAlertBanner({
      text: summary.speechText,
      variant: summary.inspectorCount > 0 ? 'inspector' : 'route_summary',
      voiceEnabled: !isMuted && mapSettings.voiceEnabled,
    });
  }, [
    navigationMode,
    route,
    trafficAlerts,
    mapSettings.preRouteAlertsEnabled,
    mapSettings.voiceEnabled,
    isMuted,
  ]);

  useEffect(() => {
    return () => {
      if (clearRouteCheckTimerRef.current) {
        clearTimeout(clearRouteCheckTimerRef.current);
        clearRouteCheckTimerRef.current = null;
      }
    };
  }, []);

  // Part 4: Active navigation inspector monitoring (ahead on route & direction of travel)
  const upcomingInspectors = useMemo<RouteMatchedAlert[]>(() => {
    if (navigationMode !== 'navigating' || !route || !mapSettings.inspectorNavAlertsEnabled) {
      return [];
    }
    const isMoving = (location.speed || 0) * 3.6 >= 2.5;
    return getUpcomingInspectorsOnRoute(
      { lat: location.lat, lng: location.lng },
      location.heading,
      isMoving,
      route.coordinates,
      trafficAlerts,
      38
    );
  }, [
    navigationMode,
    route,
    mapSettings.inspectorNavAlertsEnabled,
    location.lat,
    location.lng,
    location.heading,
    location.speed,
    trafficAlerts,
  ]);

  const closestUpcomingInspector = upcomingInspectors[0] || null;
  const announcedInspectorEntryRef = useRef<Set<string>>(new Set());
  const announcedInspector500Ref = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (navigationMode === 'idle' || navigationMode === 'arrived') {
      announcedInspectorEntryRef.current.clear();
      announcedInspector500Ref.current.clear();
      voiceGuidance.clearAlertQueue();
    }
  }, [navigationMode]);

  useEffect(() => {
    if (navigationMode !== 'navigating' || !mapSettings.inspectorNavAlertsEnabled) return;
    if (!closestUpcomingInspector) return;

    const { alert, distanceAheadMeters } = closestUpcomingInspector;
    const thresholdMeters = (mapSettings.inspectorAlertDistanceKm || 2) * 1000;

    if (distanceAheadMeters <= 530 && distanceAheadMeters >= 40) {
      if (!announcedInspector500Ref.current.has(alert.id)) {
        announcedInspector500Ref.current.add(alert.id);
        announcedInspectorEntryRef.current.add(alert.id);
        const text = formatInspectorDistanceAnnouncement(
          distanceAheadMeters,
          true,
          alert.inspectorSubtype
        );
        voiceGuidance.enqueueAlertBanner({
          text,
          alertId: alert.id,
          variant: 'inspector',
          voiceEnabled: !isMuted && mapSettings.voiceEnabled,
        });
      }
    } else if (distanceAheadMeters <= thresholdMeters && distanceAheadMeters > 530) {
      if (!announcedInspectorEntryRef.current.has(alert.id)) {
        announcedInspectorEntryRef.current.add(alert.id);
        const text = formatInspectorDistanceAnnouncement(
          distanceAheadMeters,
          false,
          alert.inspectorSubtype
        );
        voiceGuidance.enqueueAlertBanner({
          text,
          alertId: alert.id,
          variant: 'inspector',
          voiceEnabled: !isMuted && mapSettings.voiceEnabled,
        });
      }
    }
  }, [
    navigationMode,
    closestUpcomingInspector,
    mapSettings.inspectorNavAlertsEnabled,
    mapSettings.inspectorAlertDistanceKm,
    mapSettings.voiceEnabled,
    isMuted,
  ]);

  // Cancel active voice/banner alert immediately if the inspector report was removed/expired
  useEffect(() => {
    if (!activeVoiceBanner?.alertId) return;
    const now = Date.now();
    const stillValid = trafficAlerts.some(
      (a) =>
        a.id === activeVoiceBanner.alertId &&
        !isAlertExpired(a, now) &&
        (a.removalVotes || 0) < 3
    );
    if (!stillValid) {
      voiceGuidance.cancelAlertById(activeVoiceBanner.alertId);
    }
  }, [activeVoiceBanner, trafficAlerts]);

  const activeNavInspectorCard =
    navigationMode === 'navigating' &&
    mapSettings.inspectorNavAlertsEnabled &&
    closestUpcomingInspector &&
    closestUpcomingInspector.distanceAheadMeters <=
      (mapSettings.inspectorAlertDistanceKm || 2) * 1000
      ? closestUpcomingInspector
      : null;

  // Monitor de zonas escolares (solo por voz) y hospitales (voz + banner) a < 300m adelante durante navegación activa
  const announcedPoiIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (navigationMode === 'idle' || navigationMode === 'arrived') {
      announcedPoiIdsRef.current.clear();
    }
  }, [navigationMode, route?.id]);

  useEffect(() => {
    if (navigationMode !== 'navigating' || !route || cachedPois.length === 0) return;

    const isMoving = (location.speed || 0) * 3.6 >= 2.5;
    const upcomingPois = getUpcomingSchoolOrHospitalOnRoute(
      { lat: location.lat, lng: location.lng },
      location.heading,
      isMoving,
      route.coordinates,
      cachedPois,
      300,
      55
    );

    const schoolZoneAlertEnabled = mapSettings.schoolZoneAlertEnabled !== false;
    const nextToAnnounce = upcomingPois.find(
      (item) =>
        !announcedPoiIdsRef.current.has(item.poi.id) &&
        (item.poi.category !== 'school' || schoolZoneAlertEnabled)
    );
    if (!nextToAnnounce) return;

    announcedPoiIdsRef.current.add(nextToAnnounce.poi.id);

    if (nextToAnnounce.poi.category === 'school') {
      if (!isMuted && mapSettings.voiceEnabled) {
        voiceGuidance.speakQueuedVoiceOnlyAlert(
          'Te acercas a una zona escolar, reduce la velocidad.'
        );
      }
      return;
    }

    voiceGuidance.enqueueAlertBanner({
      text: 'Hospital cercano, reduce la velocidad.',
      alertId: nextToAnnounce.poi.id,
      variant: 'hospital',
      voiceEnabled: !isMuted && mapSettings.voiceEnabled,
    });
  }, [
    navigationMode,
    route,
    cachedPois,
    location.lat,
    location.lng,
    location.heading,
    location.speed,
    isMuted,
    mapSettings.voiceEnabled,
    mapSettings.schoolZoneAlertEnabled,
  ]);

  // Monitor de radares fijos urbanos (1 km y 300 m) y tramos de carretera Sutran (entrada y salida)
  const enteredRadarStretchIdsRef = useRef<Set<string>>(new Set());
  const announcedFixedRadarKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (navigationMode === 'idle' || navigationMode === 'arrived') {
      enteredRadarStretchIdsRef.current.clear();
      announcedFixedRadarKeysRef.current.clear();
    }
  }, [navigationMode, route?.id]);

  useEffect(() => {
    if (
      navigationMode !== 'navigating' ||
      !route ||
      !mapSettings.fixedRadarsEnabled ||
      !mapSettings.fixedRadarVoiceEnabled ||
      fixedRadars.length === 0
    ) {
      return;
    }

    const isMoving = (location.speed || 0) * 3.6 >= 2.5;
    const events = evaluateFixedRadarsNavigation(
      { lat: location.lat, lng: location.lng },
      location.heading,
      isMoving,
      route.coordinates,
      fixedRadars,
      enteredRadarStretchIdsRef.current,
      announcedFixedRadarKeysRef.current
    );

    for (const ev of events) {
      voiceGuidance.enqueueAlertBanner({
        text: ev.text,
        alertId: ev.key,
        variant: 'radar',
        voiceEnabled:
          !isMuted && mapSettings.voiceEnabled && mapSettings.fixedRadarVoiceEnabled,
      });
    }
  }, [
    navigationMode,
    route,
    fixedRadars,
    location.lat,
    location.lng,
    location.heading,
    location.speed,
    isMuted,
    mapSettings.voiceEnabled,
    mapSettings.fixedRadarsEnabled,
    mapSettings.fixedRadarVoiceEnabled,
  ]);

  const activeCurrentRoadName =
    navigationMode === 'navigating' && route && route.steps.length > 0
      ? route.steps[Math.max(0, stepIndex - 1)]?.name || currentStep?.name || route?.summary
      : undefined;

  const { resolvedSpeedLimit, submitSpeedLimitCorrection } = useSpeedLimitResolver(
    { lat: location.lat, lng: location.lng },
    navigationMode === 'navigating' && travelMode !== 'walking',
    cachedPois,
    activeCurrentRoadName
  );

  return (
    <div
      className="fixed inset-0 w-full h-full overflow-hidden bg-slate-950 select-none font-sans"
    >
      {/* Offline Status Toast */}
      <OfflineIndicator />

      {/* MapLibre Navigation Map */}
      <div id="map" className="fixed inset-0 w-full h-full z-0">
        <NavigationMap
          userLocation={location}
          routes={navigationMode === 'preview' ? routes : []}
          activeRoute={
            navigationMode === 'preview' || navigationMode === 'navigating' ? route : null
          }
          onSelectRoute={handleSelectRoute}
          destinationCoords={
            (navigationMode === 'preview' || navigationMode === 'navigating') &&
            selectedDestination
              ? { lat: selectedDestination.lat, lng: selectedDestination.lng }
              : null
          }
          mapTileMode={mapTileMode}
          isFollowing={modoSeguimiento === 'siguiendo'}
          onToggleFollow={handleToggleFollow}
          onTileModeChange={handleTileModeChange}
          isNavigating={navigationMode === 'navigating'}
          trafficAlerts={trafficAlerts}
          onConfirmAlert={handleConfirmIncident}
          onRemoveAlert={handleReportNotThere}
          onToggleAlertBothDirections={handleToggleAlertBothDirections}
          onRegisterCarriagewaySnapper={handleRegisterCarriagewaySnapper}
          onOpenReportIncident={() => setIsIncidentReportOpen(true)}
          distanceToNextStep={distanceToStep}
          currentStep={navigationMode === 'navigating' ? currentStep : undefined}
          nextStep={navigationMode === 'navigating' ? nextStep : undefined}
          currentRoadName={
            navigationMode === 'navigating' && route && route.steps.length > 0
              ? route.steps[Math.max(0, stepIndex - 1)]?.name || ''
              : undefined
          }
          speedKmh={currentSpeedKmh}
          travelMode={travelMode}
          onRequestLocation={requestLocation}
          overviewTrigger={overviewTrigger}
          recenterTrigger={recenterTrigger}
          focusCoordsTrigger={focusCoordsTrigger}
          onSettingsChange={handleSettingsChange}
          onSettingsOpenChange={setIsMapSettingsOpen}
          onAddFixedRadarOpenChange={setIsAddFixedRadarOpen}
          onUserExplorationGesture={handleUserExplorationGesture}
          onNavigateToPOI={handleNavigateToPOI}
          onPoisUpdated={setCachedPois}
          onFixedRadarsUpdated={setFixedRadars}
          onStartRouteToDestination={handleSelectDestination}
          isOverlayModalOpen={isAnyLargeModalOpen || navigationMode === 'arrived'}
          isLoadingRoute={isLoadingRoute}
        />
      </div>

      {/* Incident Report Modal (triggered from right floating control column) */}
      <IncidentReportModal
        isOpen={isIncidentReportOpen}
        onClose={() => setIsIncidentReportOpen(false)}
        userCoords={{ lat: location.lat, lng: location.lng }}
        onReport={handleReportIncident}
      />

      {/* Live Inspectors Panel (Part 2) */}
      <LiveInspectorsModal
        isOpen={isLiveInspectorsOpen}
        onClose={() => setIsLiveInspectorsOpen(false)}
        alerts={trafficAlerts}
        userCoords={{ lat: location.lat, lng: location.lng }}
        onFocusInspector={handleFocusInspector}
        onConfirmStillThere={handleConfirmStillThere}
        onReportNotThere={handleReportNotThere}
      />

      {/* Top Interface: Search Bar & Turn-by-Turn Banner */}
      <div
        className={`${
          navigationMode === 'navigating' || navigationMode === 'idle'
            ? 'top-navigation-bar !p-0'
            : 'top-navigation-bar'
        } transition-all duration-300 ease-out ${
          isAnyLargeModalOpen ? '-translate-y-full opacity-0 pointer-events-none' : 'translate-y-0 opacity-100'
        }`}
        aria-hidden={isAnyLargeModalOpen}
      >
        <div
          className={
            navigationMode === 'navigating' || navigationMode === 'idle'
              ? 'w-full flex flex-col'
              : 'max-w-lg mx-auto flex flex-col gap-2'
          }
        >
          {/* Top Search Bar (when idle only) */}
          {navigationMode === 'idle' && (
            <>
              <div className={`${isAnyLargeModalOpen ? 'pointer-events-none' : 'pointer-events-auto'} w-full`}>
                <SearchPanel
                  userCoords={{ lat: location.lat, lng: location.lng }}
                  cachedPois={cachedPois}
                  onSelectDestination={handleSelectDestination}
                  onFocusStreetFallback={handleFocusStreetFallback}
                  mapTileMode={mapTileMode}
                  onTileModeChange={handleTileModeChange}
                  themePreference={themePreference}
                  onCycleThemePreference={handleCycleThemePreference}
                  onCenterUser={handleVolver}
                  onOpenLiveInspectors={handleOpenLiveInspectors}
                  hasNewInspectors={hasNewInspectors}
                  activeInspectorsCount={activeInspectors.length}
                />
              </div>

              {/* Aviso corto cuando se centró solo la vía por no hallar número exacto */}
              {streetFallbackNotice && (
                <div className="max-w-lg mx-auto w-full px-3 mt-2">
                  <div className="pointer-events-auto w-full rounded-2xl bg-slate-900/95 border border-amber-400/50 shadow-[0_10px_28px_rgba(0,0,0,0.75)] backdrop-blur-xl px-3.5 py-2.5 flex items-center justify-between gap-2.5 text-white animate-in fade-in slide-in-from-top-1 duration-200">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-amber-200 leading-snug">
                        {streetFallbackNotice.message}
                      </p>
                      <p className="text-[11px] text-slate-300 truncate mt-0.5">
                        {streetFallbackNotice.place.name}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          const target = streetFallbackNotice.place;
                          setStreetFallbackNotice(null);
                          handleSelectDestination(target);
                        }}
                        className="px-2.5 py-1 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-black active:scale-95 transition cursor-pointer"
                      >
                        Ruta
                      </button>
                      <button
                        type="button"
                        onClick={() => setStreetFallbackNotice(null)}
                        className="p-1 text-slate-400 hover:text-white rounded-lg cursor-pointer"
                        aria-label="Cerrar aviso"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Voice alert banner below top search bar (Part 5) */}
              <VoiceAlertBanner
                banner={activeVoiceBanner}
                onDismiss={(id) => voiceGuidance.dismissActiveBanner(id)}
              />

              {/* Nearby driver verification prompt when idle */}
              {nearbyPromptAlert && (
                <div className="max-w-lg mx-auto w-full px-3 mt-2">
                  <div className="pointer-events-auto w-full">
                    <NearbyAlertVerificationCard
                      alert={nearbyPromptAlert.alert}
                      distanceMeters={nearbyPromptAlert.distance}
                      onConfirmStillThere={handleConfirmStillThere}
                      onReportNotThere={handleReportNotThere}
                      onDismiss={handleDismissPrompt}
                    />
                  </div>
                </div>
              )}
            </>
          )}

          {/* Pantalla "Elegir ruta" (preview): Botón discreto de volver arriba a la izquierda + botón píldora "Evitar" */}
          {navigationMode === 'preview' && selectedDestination && (
            <>
              <div className={`${isAnyLargeModalOpen ? 'pointer-events-none' : 'pointer-events-auto'} self-start`}>
                <button
                  type="button"
                  onClick={() => handleExitRoutePreview(false)}
                  className="w-9 h-9 rounded-full bg-slate-900/90 hover:bg-slate-800 active:scale-95 text-white flex items-center justify-center transition border border-slate-700/80 shadow-lg backdrop-blur-md cursor-pointer"
                  title="Volver atrás"
                  aria-label="Volver atrás"
                >
                  <ArrowLeft className="w-4 h-4 stroke-[2.5]" />
                </button>
              </div>

              {/* Botón píldora "Evitar" flotando a la izquierda */}
              <div className="pointer-events-auto self-start relative z-30">
                <button
                  type="button"
                  data-small-overlay-trigger="avoid_menu"
                  onClick={() => setIsAvoidMenuOpen((prev) => !prev)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-900/95 hover:bg-slate-850 text-sky-300 border border-sky-400/60 shadow-[0_4px_16px_rgba(0,0,0,0.7)] backdrop-blur-md text-xs font-bold transition active:scale-95 cursor-pointer"
                  title="Opciones de evitar"
                  aria-label="Evitar opciones"
                >
                  <span>Evitar</span>
                  <ChevronDown
                    className={`w-3.5 h-3.5 text-sky-400 transition-transform duration-200 ${
                      isAvoidMenuOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {/* Menú desplegable con interruptores: Peajes, Autopistas, Vías sin pavimentar */}
                {isAvoidMenuOpen && (
                  <div
                    data-small-overlay="avoid_menu"
                    className="mt-2 w-64 rounded-2xl bg-slate-900/98 border border-sky-500/40 shadow-2xl backdrop-blur-2xl p-3.5 text-white animate-in fade-in slide-in-from-top-1 duration-200"
                  >
                    <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-slate-800">
                      <span className="text-[11px] font-black uppercase tracking-wider text-sky-400 font-mono">
                        Evitar en la ruta
                      </span>
                      <button
                        type="button"
                        onClick={() => setIsAvoidMenuOpen(false)}
                        className="p-0.5 text-slate-400 hover:text-white rounded-md cursor-pointer"
                        aria-label="Cerrar menú evitar"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="space-y-3">
                      {/* Peajes */}
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-200">Peajes</span>
                        <button
                          type="button"
                          onClick={() => handleToggleAvoid('tolls')}
                          className={`w-10 h-5 rounded-full transition-colors p-0.5 flex items-center cursor-pointer ${
                            avoidOptions.tolls ? 'bg-sky-500 justify-end' : 'bg-slate-800 justify-start'
                          }`}
                        >
                          <div className="w-4 h-4 rounded-full bg-white shadow-sm" />
                        </button>
                      </div>

                      {/* Autopistas */}
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-200">Autopistas</span>
                        <button
                          type="button"
                          onClick={() => handleToggleAvoid('highways')}
                          className={`w-10 h-5 rounded-full transition-colors p-0.5 flex items-center cursor-pointer ${
                            avoidOptions.highways ? 'bg-sky-500 justify-end' : 'bg-slate-800 justify-start'
                          }`}
                        >
                          <div className="w-4 h-4 rounded-full bg-white shadow-sm" />
                        </button>
                      </div>

                      {/* Vías sin pavimentar */}
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-200">Vías sin pavimentar</span>
                        <button
                          type="button"
                          onClick={() => handleToggleAvoid('unpaved')}
                          className={`w-10 h-5 rounded-full transition-colors p-0.5 flex items-center cursor-pointer ${
                            avoidOptions.unpaved ? 'bg-sky-500 justify-end' : 'bg-slate-800 justify-start'
                          }`}
                        >
                          <div className="w-4 h-4 rounded-full bg-white shadow-sm" />
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Synchronized Voice Alert Banner below preview header (Part 5) */}
              <VoiceAlertBanner
                banner={activeVoiceBanner}
                onDismiss={(id) => voiceGuidance.dismissActiveBanner(id)}
                topOffsetClass="mt-1"
              />

              {/* Check verde grande centrado a la altura del botón "Evitar" cuando la ruta seleccionada está despejada */}
              {showClearRouteCheck && (
                <div
                  className="fixed inset-x-0 z-30 pointer-events-none flex justify-center"
                  style={{ top: 'calc(env(safe-area-inset-top, 0px) + 42px)' }}
                  aria-hidden="true"
                >
                  <svg
                    key={clearRouteCheckKey}
                    viewBox="0 0 28 28"
                    className="w-14 h-14 overflow-visible"
                    fill="none"
                    style={{ filter: 'drop-shadow(0 3px 10px rgba(34, 197, 94, 0.45))' }}
                  >
                    <path
                      d="M5.5 14.8L11.2 20.5L22.5 7.5"
                      pathLength={36}
                      stroke="#22c55e"
                      strokeWidth="3.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="animate-clear-route-check"
                    />
                  </svg>
                </div>
              )}
            </>
          )}

          {/* When actively navigating */}
          {navigationMode === 'navigating' && (
            <>
              {/* 1. Barra de giro: Fija arriba, borde a borde */}
              <div className={`${isAnyLargeModalOpen ? 'pointer-events-none' : 'pointer-events-auto'} w-full`}>
                <TurnByTurnBanner
                  currentStep={currentStep}
                  distanceToStep={distanceToStep}
                  nextStep={nextStep}
                  isRerouting={isRerouting}
                  isMuted={isMuted}
                  onToggleMute={handleToggleMute}
                  onRepeatVoice={handleRepeatVoice}
                  onOpenSearch={() => setIsSearchOpenInNav((prev) => !prev)}
                  isSearchOpen={isSearchOpenInNav}
                  speedKmh={currentSpeedKmh}
                  isGpsSignalLost={isGpsSignalLost}
                  travelMode={travelMode}
                  mapTileMode={mapTileMode}
                  onTileModeChange={handleTileModeChange}
                  themePreference={themePreference}
                  onCycleThemePreference={handleCycleThemePreference}
                />
              </div>

              {/* Synchronized Voice Alert Banner below turn-by-turn header (Part 5) */}
              <VoiceAlertBanner
                banner={activeVoiceBanner}
                onDismiss={(id) => voiceGuidance.dismissActiveBanner(id)}
              />

              {/* Live Inspector Countdown Card during active navigation (Part 4) */}
              {activeNavInspectorCard && (
                <div className="max-w-lg mx-auto w-full px-3 mt-2">
                  <div className="pointer-events-auto w-full rounded-2xl bg-gradient-to-r from-red-700/95 via-orange-600/95 to-amber-600/95 border-2 border-amber-300/80 shadow-[0_10px_28px_rgba(220,38,38,0.55)] backdrop-blur-xl px-3.5 py-2.5 flex items-center justify-between gap-3 text-white">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-black/25 border border-white/30 flex items-center justify-center flex-shrink-0">
                        <svg viewBox="0 0 24 24" className="w-5 h-5 text-white" fill="none" stroke="currentColor">
                          <path
                            d="M12 2.5L4.5 5.6v5.9c0 4.9 3.2 9.2 7.5 10.5 4.3-1.3 7.5-5.6 7.5-10.5V5.6L12 2.5z"
                            fill="currentColor"
                            fillOpacity="0.22"
                            stroke="currentColor"
                            strokeWidth="1.9"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M12 7.1l1.45 2.95 3.25.47-2.35 2.29.55 3.24L12 14.52l-2.9 1.53.55-3.24-2.35-2.29 3.25-.47L12 7.1z"
                            fill="currentColor"
                            stroke="none"
                          />
                        </svg>
                      </div>
                      <div className="min-w-0">
                        <span className="text-[10px] font-black uppercase tracking-wider text-amber-200 block leading-none">
                          {getInspectorSubtypeLabel(normalizeInspectorSubtype(activeNavInspectorCard.alert))} adelante en tu ruta
                        </span>
                        <span className="text-xs sm:text-sm font-black text-white truncate block mt-0.5">
                          {activeNavInspectorCard.alert.address ||
                            activeNavInspectorCard.alert.zone ||
                            getInspectorSubtypeLabel(normalizeInspectorSubtype(activeNavInspectorCard.alert))}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="px-2.5 py-1 rounded-xl bg-black/35 border border-white/25 font-mono font-black text-sm sm:text-base text-white">
                        {formatDistance(activeNavInspectorCard.distanceAheadMeters)}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleReportNotThere(activeNavInspectorCard.alert.id)}
                        className="px-2 py-1 rounded-xl bg-black/30 hover:bg-black/45 text-[11px] font-bold text-amber-100 border border-white/20 transition cursor-pointer"
                        title="Reportar que ya no está"
                      >
                        Ya no está
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {streetFallbackNotice && (
                <div className="max-w-lg mx-auto w-full px-3 mt-2">
                  <div className="pointer-events-auto w-full rounded-2xl bg-slate-900/95 border border-amber-400/50 shadow-[0_10px_28px_rgba(0,0,0,0.75)] backdrop-blur-xl px-3.5 py-2.5 flex items-center justify-between gap-2.5 text-white animate-in fade-in slide-in-from-top-1 duration-200">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-amber-200 leading-snug">
                        {streetFallbackNotice.message}
                      </p>
                      <p className="text-[11px] text-slate-300 truncate mt-0.5">
                        {streetFallbackNotice.place.name}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          const target = streetFallbackNotice.place;
                          setStreetFallbackNotice(null);
                          handleSelectDestination(target);
                        }}
                        className="px-2.5 py-1 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-black active:scale-95 transition cursor-pointer"
                      >
                        Ruta
                      </button>
                      <button
                        type="button"
                        onClick={() => setStreetFallbackNotice(null)}
                        className="p-1 text-slate-400 hover:text-white rounded-lg cursor-pointer"
                        aria-label="Cerrar aviso"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {(nearbyPromptAlert || isSearchOpenInNav) && (
                <div className="max-w-lg mx-auto w-full px-3 mt-2 flex flex-col gap-2">
                  {/* 2. Tarjeta de verificación por otros conductores: Debajo del banner sin taparlo */}
                  {nearbyPromptAlert && (
                    <div className="pointer-events-auto w-full">
                      <NearbyAlertVerificationCard
                        alert={nearbyPromptAlert.alert}
                        distanceMeters={nearbyPromptAlert.distance}
                        onConfirmStillThere={handleConfirmStillThere}
                        onReportNotThere={handleReportNotThere}
                        onDismiss={handleDismissPrompt}
                      />
                    </div>
                  )}

                  {/* 3. Panel desplegable de búsqueda: Se abre hacia abajo */}
                  {isSearchOpenInNav && (
                    <div className="pointer-events-auto w-full animate-in fade-in slide-in-from-top-1 duration-200">
                      <SearchPanel
                        userCoords={{ lat: location.lat, lng: location.lng }}
                        cachedPois={cachedPois}
                        onSelectDestination={(dest) => {
                          setIsSearchOpenInNav(false);
                          handleSelectDestination(dest);
                        }}
                        onFocusStreetFallback={handleFocusStreetFallback}
                        mapTileMode={mapTileMode}
                        onTileModeChange={handleTileModeChange}
                        themePreference={themePreference}
                        onCycleThemePreference={handleCycleThemePreference}
                        onCenterUser={handleVolver}
                        onClose={() => setIsSearchOpenInNav(false)}
                        forceExpanded={true}
                        hideTopBar={true}
                        className="w-full"
                      />
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Navigation Card Container */}
      <div className="bottom-trip-panel">
        {/* Route Preview Card: Pantalla "Elegir ruta" */}
        {navigationMode === 'preview' && route && (
          <div className="pointer-events-auto pb-[env(safe-area-inset-bottom)]">
            <RoutePreviewCard
              routes={routes}
              activeRoute={route}
              onSelectRoute={handleSelectRoute}
              onStartNavigation={handleStartNavigation}
              onClose={() => handleExitRoutePreview(false)}
              isLoading={isLoadingRoute}
              inspectorCount={preRouteSummary?.inspectorCount || 0}
              preRouteSummary={preRouteSummary}
              travelMode={travelMode}
              onTravelModeChange={handleToggleTravelMode}
            />
          </div>
        )}

        {/* Bottom Navigation HUD Card (when actively driving or walking) */}
        {navigationMode === 'navigating' && route && (
          <div className="pointer-events-auto">
            <BottomNavCard
              route={route}
              remainingDistance={remainingDistance}
              remainingDuration={remainingDuration}
              currentStep={currentStep}
              distanceToStep={distanceToStep}
              nextStep={nextStep}
              speedKmh={currentSpeedKmh}
              speedLimit={resolvedSpeedLimit?.limitKmh ?? null}
              speedLimitSource={resolvedSpeedLimit?.source ?? null}
              resolvedRoadName={resolvedSpeedLimit?.roadName}
              resolvedRoadCategoryLabel={resolvedSpeedLimit?.categoryLabel}
              onCorrectSpeedLimit={submitSpeedLimitCorrection}
              currentRoadName={activeCurrentRoadName || currentStep?.name || route?.summary}
              userCoords={{ lat: location.lat, lng: location.lng }}
              onCancelNavigation={handleCancelNavigation}
              onRecalculate={handleRecalculateRoute}
              onRepeatVoice={handleRepeatVoice}
              onReportIncident={handleReportIncident}
              isSimulating={isSimulating}
              onToggleSimulation={() => {
                if (isSimulating) {
                  stopSimulation();
                } else {
                  handleStartSimulation();
                }
              }}
              travelMode={travelMode}
              modoSeguimiento={modoSeguimiento}
              isFollowing={modoSeguimiento === 'siguiendo'}
              onRecenter={handleVolver}
              onOverviewRoute={handleOverviewRoute}
            />
          </div>
        )}
      </div>

      {/* Arrived at Destination Modal */}
      {navigationMode === 'arrived' && route && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="w-full max-w-sm rounded-3xl bg-slate-900 border border-slate-700 p-6 text-center shadow-2xl text-white">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center mx-auto mb-4 text-emerald-400">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <h3 className="text-xl font-black text-white">¡Has llegado a tu destino!</h3>
            <p className="mt-2 text-sm text-slate-300 font-semibold">{route.destinationName}</p>
            <p className="mt-1 text-xs text-slate-400">Ruta finalizada con éxito.</p>
            <button
              onClick={handleCancelNavigation}
              className="mt-6 w-full py-3.5 px-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-sm shadow-lg shadow-emerald-500/30 transition"
            >
              Aceptar y Cerrar
            </button>
          </div>
        </div>
      )}

      {/* Loading Route Calculation Toast */}
      {isLoadingRoute && (
        <div className="absolute top-24 inset-x-4 z-50 max-w-sm mx-auto p-3.5 rounded-2xl bg-slate-900/95 border border-sky-500/50 text-white shadow-2xl backdrop-blur-xl flex items-center gap-3">
          <Loader2 className="w-5 h-5 text-sky-400 animate-spin flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <span className="text-xs font-black text-white block">Calculando rutas...</span>
            <span className="text-[11px] text-slate-400 block truncate">
              Consultando vías disponibles con OSRM
            </span>
          </div>
        </div>
      )}

      {/* Route Error Notification Toast */}
      {routeError && (
        <div className="absolute top-24 inset-x-4 z-50 max-w-md mx-auto p-4 rounded-3xl bg-slate-900/98 border border-rose-500/70 text-white shadow-2xl backdrop-blur-xl">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-2xl bg-rose-500/20 text-rose-400 flex-shrink-0 mt-0.5">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-black text-rose-200">No se pudo calcular la ruta</h4>
              <p className="text-xs text-slate-300 mt-1 leading-relaxed">{routeError}</p>
              <div className="flex items-center gap-2 mt-3">
                <button
                  onClick={() => {
                    setRouteError(null);
                    if (selectedDestination) {
                      handleSelectDestination(selectedDestination);
                    }
                  }}
                  className="px-3 py-1.5 rounded-xl bg-sky-500 hover:bg-sky-400 active:scale-95 text-slate-950 font-bold text-xs transition flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Reintentar</span>
                </button>
                <button
                  onClick={() => {
                    setRouteError(null);
                    setSelectedDestination(null);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-300 text-xs font-semibold transition"
                >
                  Cerrar
                </button>
              </div>
            </div>
            <button
              onClick={() => {
                setRouteError(null);
                if (navigationMode === 'idle') {
                  setSelectedDestination(null);
                  setRoute(null);
                  setRoutes([]);
                }
              }}
              className="p-1 rounded-full text-slate-400 hover:text-white cursor-pointer"
              aria-label="Cerrar error"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Android GPS Permission Onboarding Modal */}
      <PermissionModal
        permissionState={permissionState}
        errorMessage={errorMessage}
        onRequestPermission={requestLocation}
        onContinueSimulated={() => {
          setIsFollowing(true);
        }}
      />
    </div>
  );
}
