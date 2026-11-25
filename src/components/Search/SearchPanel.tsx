import React, { useState, useEffect, useRef } from 'react';
import {
  SearchResult,
  SearchPlaceCategory,
  Coordinates,
  MapTileMode,
  SavedPlace,
  MapPOI,
} from '../../types/navigation';
import { searchPlacesInLima, POPULAR_LIMA_PLACES } from '../../services/nominatim';
import { calculateDistanceMeters, formatDistance } from '../../services/osrm';
import { PWAInstallButton } from '../PWAInstallButton';
import {
  Search,
  X,
  MapPin,
  ShoppingBag,
  ShoppingCart,
  Plane,
  Sun,
  Moon,
  Landmark,
  Navigation,
  Loader2,
  ChevronUp,
  ChevronDown,
  Home,
  Briefcase,
  Star,
  History,
  Trash2,
  Mic,
  HeartPulse,
  GraduationCap,
  Utensils,
  Coffee,
  Fuel,
  Shield,
  Trees,
  BedDouble,
  Bus,
  Train,
  Route,
  Building2,
  Cross,
  Flame,
} from 'lucide-react';
import { voiceGuidance } from '../../services/tts';
import {
  notifySmallOverlayClose,
  notifySmallOverlayOpen,
} from '../../services/overlayCoordinator';

function getSuggestionVisual(
  category?: SearchPlaceCategory,
  fallbackLabel?: string
): { icon: React.ReactNode; badgeClass: string; label: string } {
  switch (category) {
    case 'clinic':
    case 'hospital':
      return {
        icon: <HeartPulse className="w-4 h-4 text-rose-400" />,
        badgeClass: 'bg-rose-500/15 border-rose-500/40',
        label: fallbackLabel || (category === 'clinic' ? 'Clínica' : 'Hospital'),
      };
    case 'pharmacy':
      return {
        icon: <Cross className="w-4 h-4 text-emerald-400" />,
        badgeClass: 'bg-emerald-500/15 border-emerald-500/40',
        label: fallbackLabel || 'Farmacia',
      };
    case 'school':
    case 'university':
      return {
        icon: <GraduationCap className="w-4 h-4 text-amber-400" />,
        badgeClass: 'bg-amber-500/15 border-amber-500/40',
        label: fallbackLabel || (category === 'university' ? 'Universidad / Instituto' : 'Colegio'),
      };
    case 'avenue':
      return {
        icon: <Route className="w-4 h-4 text-sky-400" />,
        badgeClass: 'bg-sky-500/15 border-sky-500/40',
        label: fallbackLabel || 'Avenida',
      };
    case 'street':
      return {
        icon: <Navigation className="w-4 h-4 text-indigo-400" />,
        badgeClass: 'bg-indigo-500/15 border-indigo-500/40',
        label: fallbackLabel || 'Calle',
      };
    case 'district':
      return {
        icon: <Building2 className="w-4 h-4 text-teal-300" />,
        badgeClass: 'bg-teal-500/15 border-teal-500/40',
        label: fallbackLabel || 'Distrito',
      };
    case 'restaurant':
    case 'food':
      return {
        icon: <Utensils className="w-4 h-4 text-orange-400" />,
        badgeClass: 'bg-orange-500/15 border-orange-500/40',
        label: fallbackLabel || 'Restaurante',
      };
    case 'cafe':
      return {
        icon: <Coffee className="w-4 h-4 text-amber-300" />,
        badgeClass: 'bg-amber-700/20 border-amber-500/40',
        label: fallbackLabel || 'Cafetería',
      };
    case 'supermarket':
      return {
        icon: <ShoppingCart className="w-4 h-4 text-pink-400" />,
        badgeClass: 'bg-pink-500/15 border-pink-500/40',
        label: fallbackLabel || 'Supermercado',
      };
    case 'shopping':
      return {
        icon: <ShoppingBag className="w-4 h-4 text-pink-400" />,
        badgeClass: 'bg-pink-500/15 border-pink-500/40',
        label: fallbackLabel || 'Tienda',
      };
    case 'fuel':
      return {
        icon: <Fuel className="w-4 h-4 text-cyan-400" />,
        badgeClass: 'bg-cyan-500/15 border-cyan-500/40',
        label: fallbackLabel || 'Grifo',
      };
    case 'bank':
      return {
        icon: <Landmark className="w-4 h-4 text-emerald-300" />,
        badgeClass: 'bg-emerald-500/15 border-emerald-500/40',
        label: fallbackLabel || 'Banco',
      };
    case 'police':
      return {
        icon: <Shield className="w-4 h-4 text-blue-400" />,
        badgeClass: 'bg-blue-500/15 border-blue-500/40',
        label: fallbackLabel || 'Comisaría',
      };
    case 'fire_station':
      return {
        icon: <Flame className="w-4 h-4 text-orange-400" />,
        badgeClass: 'bg-orange-500/15 border-orange-500/40',
        label: fallbackLabel || 'Bomberos',
      };
    case 'park':
      return {
        icon: <Trees className="w-4 h-4 text-green-400" />,
        badgeClass: 'bg-green-500/15 border-green-500/40',
        label: fallbackLabel || 'Parque',
      };
    case 'hotel':
      return {
        icon: <BedDouble className="w-4 h-4 text-violet-400" />,
        badgeClass: 'bg-violet-500/15 border-violet-500/40',
        label: fallbackLabel || 'Hotel',
      };
    case 'bus_stop':
      return {
        icon: <Bus className="w-4 h-4 text-sky-300" />,
        badgeClass: 'bg-sky-500/15 border-sky-500/40',
        label: fallbackLabel || 'Paradero',
      };
    case 'subway':
      return {
        icon: <Train className="w-4 h-4 text-lime-400" />,
        badgeClass: 'bg-lime-500/15 border-lime-500/40',
        label: fallbackLabel || 'Estación',
      };
    case 'airport':
      return {
        icon: <Plane className="w-4 h-4 text-sky-400" />,
        badgeClass: 'bg-sky-500/15 border-sky-500/40',
        label: fallbackLabel || 'Aeropuerto',
      };
    default:
      return {
        icon: <MapPin className="w-4 h-4 text-sky-400" />,
        badgeClass: 'bg-sky-500/15 border-sky-500/30',
        label: fallbackLabel || 'Lugar',
      };
  }
}

interface SearchPanelProps {
  userCoords: Coordinates;
  cachedPois?: MapPOI[];
  onSelectDestination: (destination: SearchResult) => void;
  onFocusStreetFallback?: (destination: SearchResult) => void;
  mapTileMode: MapTileMode;
  onTileModeChange: (mode: MapTileMode) => void;
  onCenterUser?: () => void;
  className?: string;
  onClose?: () => void;
  forceExpanded?: boolean;
  hideTopBar?: boolean;
  themePreference?: 'day' | 'night' | 'manual_satellite';
  onCycleThemePreference?: () => void;
  onOpenLiveInspectors?: () => void;
  hasNewInspectors?: boolean;
  activeInspectorsCount?: number;
}

const FAVORITES_STORAGE_KEY = 'ruta_lima_favorites';
const HISTORY_STORAGE_KEY = 'ruta_lima_history';

export const SearchPanel: React.FC<SearchPanelProps> = ({
  userCoords,
  cachedPois,
  onSelectDestination,
  onFocusStreetFallback,
  mapTileMode,
  onTileModeChange,
  className = '',
  onClose,
  forceExpanded = false,
  hideTopBar = false,
  onCycleThemePreference,
  onOpenLiveInspectors,
  hasNewInspectors = false,
  activeInspectorsCount = 0,
}) => {
  const [query, setQuery] = useState<string>('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isFocused, setIsFocused] = useState<boolean>(false);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [isCollapsed, setIsCollapsed] = useState<boolean>(!forceExpanded && true);
  const [activeTab, setActiveTab] = useState<'recents' | 'favorites'>('recents');
  const [searchError, setSearchError] = useState<string | null>(null);

  // Speech Recognition state for Lima voice search
  const [isListening, setIsListening] = useState<boolean>(false);
  const [isSpeechSupported, setIsSpeechSupported] = useState<boolean>(true);
  const [voiceNotice, setVoiceNotice] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);
  const silenceTimerRef = useRef<any>(null);
  const speechDetectedRef = useRef<boolean>(false);

  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setIsSpeechSupported(false);
    }

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {}
      }
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (forceExpanded) {
      setIsCollapsed(false);
    }
  }, [forceExpanded]);

  // Favorites & History State persisted in localStorage
  const [favorites, setFavorites] = useState<SavedPlace[]>(() => {
    try {
      const stored = localStorage.getItem(FAVORITES_STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const [history, setHistory] = useState<SavedPlace[]>(() => {
    try {
      const stored = localStorage.getItem(HISTORY_STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  // Estado de conexión: sin internet se busca solo en recientes, favoritos y lugares guardados
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator === 'undefined' ? true : navigator.onLine !== false
  );
  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  const abortControllerRef = useRef<AbortController | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Registrar el panel desplegable de búsqueda para cerrarlo al tocar fuera
  useEffect(() => {
    if (!isCollapsed) {
      notifySmallOverlayOpen('search_panel', () => {
        setIsFocused(false);
        setVoiceNotice(null);
        if (hideTopBar && onCloseRef.current) {
          onCloseRef.current();
        } else {
          setIsCollapsed(true);
        }
      });
    } else {
      notifySmallOverlayClose('search_panel');
    }
    return () => {
      notifySmallOverlayClose('search_panel');
    };
  }, [isCollapsed, hideTopBar]);

  // Notify map to recalculate dimensions via invalidateSize() when panel collapses or expands
  useEffect(() => {
    window.dispatchEvent(new Event('resize'));
    window.dispatchEvent(new CustomEvent('ruta-lima-layout-resize'));
  }, [isCollapsed]);

  // Debounced search logic (desde la 3ra letra, pausa de 500ms)
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      if (activeCategory) {
        const filtered = POPULAR_LIMA_PLACES.filter((p) => p.category === activeCategory);
        setResults(filtered);
      } else {
        setResults([]);
      }
      setSearchError(null);
      setIsLoading(false);
      return;
    }

    if (trimmed.length < 3) {
      abortControllerRef.current?.abort();
      setResults([]);
      setSearchError(null);
      setIsLoading(false);
      return;
    }

    if (!isOnline) {
      // Sin internet: filtrar recientes, favoritos y lugares ya cargados en la app
      abortControllerRef.current?.abort();
      const norm = (v: string) =>
        (v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      const q = norm(trimmed);
      const pool: SearchResult[] = [];
      const seen = new Set<string>();
      const addIfMatch = (p: { id: string; name: string; display_name?: string; lat: number; lng: number; district?: string }) => {
        const key = `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`;
        if (seen.has(key)) return;
        const displayName = p.display_name || p.name;
        if (norm(`${p.name} ${displayName} ${p.district || ''}`).includes(q)) {
          seen.add(key);
          pool.push({
            id: p.id,
            name: p.name,
            display_name: displayName,
            lat: p.lat,
            lng: p.lng,
            district: p.district,
          });
        }
      };
      favorites.forEach(addIfMatch);
      history.forEach(addIfMatch);
      POPULAR_LIMA_PLACES.forEach(addIfMatch);
      setResults(pool.slice(0, 10));
      setSearchError(
        pool.length === 0
          ? 'Sin conexión: solo se pueden buscar recientes, favoritos y lugares guardados.'
          : null
      );
      setIsLoading(false);
      return;
    }

    setSearchError(null);
    setIsLoading(true);

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const timer = setTimeout(async () => {
      let didTimeout = false;
      const controller = new AbortController();
      abortControllerRef.current = controller;
      const timeoutId = setTimeout(() => {
        didTimeout = true;
        controller.abort();
      }, 16000);

      try {
        const hits = await searchPlacesInLima(trimmed, controller.signal, {
          userCoords,
          localPois: cachedPois,
        });
        if (!controller.signal.aborted) {
          setResults(hits);
          setSearchError(null);
        }
      } catch (e: any) {
        if (didTimeout) {
          setSearchError('El servidor de búsqueda tardó demasiado en responder.');
        } else if (e?.name !== 'AbortError') {
          setSearchError('No se pudo conectar con el servidor de búsqueda.');
        }
      } finally {
        clearTimeout(timeoutId);
        if (abortControllerRef.current === controller) {
          setIsLoading(false);
        }
      }
    }, 500);

    return () => {
      clearTimeout(timer);
      abortControllerRef.current?.abort();
    };
  }, [query, activeCategory, userCoords.lat, userCoords.lng, cachedPois, isOnline]);

  const saveToHistory = (place: SearchResult) => {
    const newEntry: SavedPlace = {
      id: `hist_${place.id}_${Date.now()}`,
      name: place.name,
      display_name: place.display_name,
      lat: place.lat,
      lng: place.lng,
      district: place.district,
      type: 'recent',
      timestamp: Date.now(),
    };

    setHistory((prev) => {
      const filtered = prev.filter((item) => item.lat !== place.lat || item.lng !== place.lng);
      const updated = [newEntry, ...filtered].slice(0, 15);
      try {
        localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(updated));
      } catch (err) {
        console.warn('Could not save history to localStorage', err);
      }
      return updated;
    });
  };

  const handleSelect = (place: SearchResult) => {
    setQuery(place.name);
    setIsFocused(false);
    setIsCollapsed(true);
    saveToHistory(place);
    if (place.isStreetFallback && onFocusStreetFallback) {
      onFocusStreetFallback(place);
      return;
    }
    onSelectDestination(place);
  };

  const handleSelectSavedPlace = (saved: SavedPlace) => {
    const searchResult: SearchResult = {
      id: saved.id,
      name: saved.name,
      display_name: saved.display_name || saved.address || saved.name,
      lat: saved.lat,
      lng: saved.lng,
      district: saved.district,
    };
    handleSelect(searchResult);
  };

  const handleToggleFavorite = (place: SearchResult, type: 'favorite' | 'home' | 'work' = 'favorite') => {
    setFavorites((prev) => {
      const existsIndex = prev.findIndex(
        (f) => (type === 'home' && f.type === 'home') ||
               (type === 'work' && f.type === 'work') ||
               (f.lat === place.lat && f.lng === place.lng)
      );

      let updated: SavedPlace[];
      if (existsIndex >= 0 && type === 'favorite') {
        updated = prev.filter((_, i) => i !== existsIndex);
      } else {
        const newFav: SavedPlace = {
          id: `fav_${type}_${Date.now()}`,
          name: type === 'home' ? 'Casa' : type === 'work' ? 'Trabajo' : place.name,
          display_name: place.display_name,
          lat: place.lat,
          lng: place.lng,
          district: place.district,
          type,
          timestamp: Date.now(),
        };
        if (type === 'home' || type === 'work') {
          updated = [newFav, ...prev.filter((f) => f.type !== type)];
        } else {
          updated = [newFav, ...prev];
        }
      }

      try {
        localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(updated));
      } catch (err) {
        console.warn('Could not save favorites to localStorage', err);
      }
      return updated;
    });
  };

  const handleDeleteHistoryItem = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setHistory((prev) => {
      const updated = prev.filter((item) => item.id !== id);
      try {
        localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(updated));
      } catch (err) {
        console.warn('Could not update history in localStorage', err);
      }
      return updated;
    });
  };

  const handleClearAllHistory = () => {
    setHistory([]);
    try {
      localStorage.removeItem(HISTORY_STORAGE_KEY);
    } catch (err) {
      console.warn('Could not clear history', err);
    }
  };

  const handleClear = () => {
    setQuery('');
    setResults([]);
    setActiveCategory(null);
  };

  const handleCategoryClick = (category: string) => {
    if (activeCategory === category) {
      setActiveCategory(null);
      setResults([]);
    } else {
      setActiveCategory(category);
      setQuery('');
      setIsFocused(true);
      setIsCollapsed(false);
      const filtered = POPULAR_LIMA_PLACES.filter((p) => p.category === category);
      setResults(filtered);
    }
  };

  // Cancel ongoing voice recognition
  const cancelVoiceSearch = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {}
    }
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
    }
    setIsListening(false);
  };

  // Process speech transcription and auto-route if "ir" or "llévame" was said
  const handleProcessSpokenText = async (spokenText: string) => {
    const trimmed = spokenText.trim();
    if (!trimmed) return;

    // Requisito 3: Comprueba si dijo "ir" o "llévame" después o junto al nombre del lugar
    const autoRouteRegex = /\b(ir|ll[eé]vame)\b/i;
    const shouldAutoNavigate = autoRouteRegex.test(trimmed);

    // Extrae y limpia el nombre del lugar quitando palabras de comando y puntuación
    let cleaned = trimmed
      .replace(/^[¿?¡!.,\s]+|[¿?¡!.,\s]+$/g, '')
      .replace(/^(ll[eé]vame\s+(a\s+la|al|a)?|ir\s+(a\s+la|al|a)?)\s+/i, '')
      .replace(/\s+(ll[eé]vame|ir)[.!?]?$/i, '')
      .replace(/\b(ll[eé]vame|ir)\b/gi, '')
      .trim();

    if (!cleaned) {
      cleaned = trimmed;
    }

    setQuery(cleaned);
    setIsCollapsed(false);
    setIsFocused(true);
    setIsLoading(true);

    try {
      const hits = await searchPlacesInLima(cleaned, undefined, {
        userCoords,
        localPois: cachedPois,
      });
      setResults(hits);

      if (shouldAutoNavigate && hits.length > 0) {
        // Requisito 3: Elige el primer resultado, traza la ruta (o centra la vía si es respaldo sin número)
        const chosen = hits[0];
        handleSelect(chosen);
        if (chosen.isStreetFallback && onFocusStreetFallback) {
          voiceGuidance.speak(
            chosen.fallbackNotice || 'No se encontró el número exacto, se muestra la vía'
          );
        } else {
          voiceGuidance.speak(`Ruta trazada hacia ${chosen.name}. Toca Iniciar.`);
        }
      } else if (shouldAutoNavigate && hits.length === 0) {
        setVoiceNotice(`No se encontraron lugares para "${cleaned}"`);
        setTimeout(() => setVoiceNotice(null), 3500);
      }
    } catch (err) {
      console.warn('Voice search error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle toggle microphone button with prior getUserMedia permission verification
  const handleToggleVoiceSearch = async (e: React.MouseEvent) => {
    e.stopPropagation();

    // Requisito 7: Si el navegador no soporta reconocimiento de voz, el ícono aparece apagado con un aviso al tocarlo
    if (!isSpeechSupported) {
      setVoiceNotice('Tu navegador no soporta reconocimiento de voz. Usa Chrome, Edge o Safari.');
      setTimeout(() => setVoiceNotice(null), 4000);
      return;
    }

    // Requisito 6: Si toco el micrófono otra vez mientras escucha, se cancela
    if (isListening) {
      cancelVoiceSearch();
      return;
    }

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setVoiceNotice('Tu navegador no soporta reconocimiento de voz. Usa Chrome, Edge o Safari.');
      setTimeout(() => setVoiceNotice(null), 4000);
      return;
    }

    cancelVoiceSearch();

    // 2) Primero pide el permiso con navigator.mediaDevices.getUserMedia({ audio: true }),
    // cierra ese stream de inmediato y recién después inicia el reconocimiento de voz.
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        // Cierra ese stream de inmediato
        stream.getTracks().forEach((track) => track.stop());
      } catch (mediaErr: any) {
        console.warn('Microphone getUserMedia permission error:', mediaErr);
        setIsListening(false);
        // 3) Si el permiso se niega, muestra un aviso claro con instrucciones.
        setVoiceNotice('Permiso de micrófono bloqueado. Toca el candado o ícono 🔒 en la barra de direcciones de tu navegador y activa "Permitir micrófono".');
        setTimeout(() => setVoiceNotice(null), 6000);
        return;
      }
    }

    // Recién después inicia el reconocimiento de voz
    try {
      const recognition = new SpeechRecognition();
      // Requisito 1: Reconocimiento de voz en español de Perú (es-PE)
      recognition.lang = 'es-PE';
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      speechDetectedRef.current = false;
      setVoiceNotice(null);
      setIsListening(true);

      // Requisito 4: Si no entiende o hay silencio por más de 5 segundos, se detiene y muestra "No te escuché, intenta de nuevo"
      silenceTimerRef.current = setTimeout(() => {
        if (!speechDetectedRef.current) {
          try {
            recognition.abort();
          } catch {}
          setIsListening(false);
          setVoiceNotice('No te escuché, intenta de nuevo');
          setTimeout(() => setVoiceNotice(null), 3500);
        }
      }, 5000);

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onspeechstart = () => {
        speechDetectedRef.current = true;
        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current);
        }
      };

      recognition.onresult = (event: any) => {
        speechDetectedRef.current = true;
        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current);
        }

        let interim = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const item = event.results[i];
          if (item.isFinal) {
            finalTranscript += item[0].transcript;
          } else {
            interim += item[0].transcript;
          }
        }

        const text = (finalTranscript || interim).trim();
        if (text) {
          setQuery(text);
        }

        if (finalTranscript) {
          handleProcessSpokenText(finalTranscript);
        }
      };

      recognition.onerror = (event: any) => {
        console.warn('Speech recognition error event:', event.error);
        setIsListening(false);
        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current);
        }

        // Si el permiso se niega o no está permitido
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          setVoiceNotice('Permiso de micrófono bloqueado. Toca el candado o ícono 🔒 en la barra de direcciones de tu navegador y activa "Permitir micrófono".');
          setTimeout(() => setVoiceNotice(null), 6000);
        } else if (event.error === 'no-speech') {
          // Requisito 4: Silencio o no se entendió
          setVoiceNotice('No te escuché, intenta de nuevo');
          setTimeout(() => setVoiceNotice(null), 3500);
        }
      };

      recognition.onend = () => {
        setIsListening(false);
        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current);
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err: any) {
      console.error('Speech recognition start failed:', err);
      setIsListening(false);
      if (err.name === 'NotAllowedError') {
        setVoiceNotice('Permiso de micrófono bloqueado. Toca el candado o ícono 🔒 en la barra de direcciones de tu navegador y activa "Permitir micrófono".');
        setTimeout(() => setVoiceNotice(null), 6000);
      } else {
        setVoiceNotice('No te escuché, intenta de nuevo');
        setTimeout(() => setVoiceNotice(null), 3500);
      }
    }
  };

  const homePlace = favorites.find((f) => f.type === 'home');
  const workPlace = favorites.find((f) => f.type === 'work');
  const customFavorites = favorites.filter((f) => f.type === 'favorite');

  return (
    <div
      data-small-overlay={!isCollapsed ? 'search_panel' : undefined}
      className={`${hideTopBar ? 'dropdown-panel' : 'search-bar'} select-none transition-all duration-300 w-full ${className || 'relative inset-x-0 w-full'}`}
      style={{ order: hideTopBar ? 2 : 1 }}
    >
      {/* Top Search Bar Container - Modern Glassmorphic Box */}
      <div
        className={
          hideTopBar
            ? 'rounded-2xl bg-slate-900/95 border border-slate-700/80 shadow-[0_10px_35px_rgba(0,0,0,0.7)] backdrop-blur-xl p-2 sm:p-2.5 transition-all'
            : 'w-full rounded-b-2xl rounded-t-none bg-slate-900/95 border-b border-slate-700/80 shadow-[0_10px_35px_rgba(0,0,0,0.7)] backdrop-blur-xl px-2.5 pb-2 sm:px-3 sm:pb-2.5 transition-all'
        }
        style={
          hideTopBar
            ? undefined
            : { paddingTop: 'calc(env(safe-area-inset-top, 0px) + 8px)' }
        }
      >
        {/* Collapsed Mode: Ultra-Compact Single Row (~42px height) -> Frees up >88% of screen for Map */}
        {isCollapsed ? (
          <div className="flex items-center justify-between gap-2">
            {/* Logo Emblem */}
            <div
              onClick={() => setIsCollapsed(false)}
              className="flex items-center gap-1.5 flex-shrink-0 cursor-pointer active:scale-95 transition"
              title="Expandir RUTA LIMA"
            >
              <div className="w-7 h-7 rounded-lg bg-sky-500/20 border border-sky-400 flex items-center justify-center shadow-sm">
                <Navigation className="w-3.5 h-3.5 text-sky-400" />
              </div>
              <span className="text-[11px] font-black tracking-widest uppercase text-white font-mono hidden xs:inline">
                RUTA <span className="text-sky-400">LIMA</span>
              </span>
            </div>

            {/* Quick Search Input Trigger with Mic Icon */}
            <div
              className="flex-1 flex items-center justify-between gap-1 pl-3 pr-0.5 py-0.5 rounded-xl bg-slate-950/70 hover:bg-slate-950 border border-slate-800 text-xs text-slate-300 transition min-w-0"
            >
              <div
                onClick={() => {
                  setIsCollapsed(false);
                  setIsFocused(true);
                }}
                className="flex-1 flex items-center gap-2 cursor-pointer min-w-0 py-1"
                title="Toca para buscar destino"
              >
                <Search className="w-3.5 h-3.5 text-sky-400 flex-shrink-0" />
                <span className={`truncate ${isListening ? 'text-sky-400 font-bold animate-pulse' : 'text-slate-400 font-medium'}`}>
                  {isListening ? 'Escuchando...' : (query || '¿A dónde vas?')}
                </span>
              </div>

              {/* Botón de micrófono al lado derecho, dentro del propio campo de búsqueda, antes del botón del globo */}
              <button
                type="button"
                onClick={handleToggleVoiceSearch}
                className={`min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg transition-all flex-shrink-0 cursor-pointer ${
                  isListening
                    ? 'text-sky-300 bg-sky-500/25 border border-sky-400 shadow-[0_0_16px_rgba(56,189,248,0.85)] animate-pulse'
                    : isSpeechSupported
                    ? 'text-sky-400 hover:text-sky-200 hover:bg-slate-800/80 active:scale-95'
                    : 'text-slate-600 opacity-40 cursor-not-allowed'
                }`}
                title={
                  isListening
                    ? 'Toca para cancelar escucha'
                    : isSpeechSupported
                    ? 'Buscar por voz'
                    : 'Reconocimiento de voz no soportado'
                }
                aria-label="Buscar por voz"
              >
                <Mic className={`w-4 h-4 ${isListening ? 'text-sky-300' : isSpeechSupported ? 'text-sky-400' : 'text-slate-600'}`} />
              </button>
            </div>

            {/* Actions: Live Inspectors, Map Tile Layer & Expand Chevron */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {onOpenLiveInspectors && (
                <button
                  type="button"
                  onClick={onOpenLiveInspectors}
                  className={`relative w-9 h-9 rounded-xl bg-gradient-to-br from-orange-500 to-red-600 hover:from-orange-400 hover:to-red-500 text-white border-2 border-amber-200/95 shadow-[0_0_14px_rgba(249,115,22,0.75)] flex items-center justify-center active:scale-95 transition cursor-pointer ${
                    hasNewInspectors ? 'animate-inspector-pulse' : ''
                  }`}
                  title={
                    activeInspectorsCount > 0
                      ? `Inspectores en vivo (${activeInspectorsCount} activos)`
                      : 'Inspectores en vivo'
                  }
                  aria-label="Inspectores en vivo"
                >
                  <svg viewBox="0 0 24 24" className="w-5 h-5 text-white drop-shadow-sm" fill="none" stroke="currentColor">
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
                  {hasNewInspectors && (
                    <span
                      className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-red-600 ring-2 ring-white shadow-sm"
                      aria-hidden="true"
                    />
                  )}
                </button>
              )}

              <button
                onClick={() => {
                  if (onCycleThemePreference) {
                    onCycleThemePreference();
                  } else {
                    onTileModeChange(mapTileMode === 'night' ? 'day' : 'night');
                  }
                }}
                className="relative w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 flex items-center justify-center active:scale-95 transition"
                title={
                  mapTileMode === 'night'
                    ? 'Modo Noche (toca para cambiar a Día)'
                    : 'Modo Día (toca para cambiar a Noche)'
                }
                aria-label="Cambiar entre modo día y noche"
              >
                {mapTileMode === 'night' ? (
                  <Moon className="w-3.5 h-3.5 text-sky-300" />
                ) : (
                  <Sun className="w-3.5 h-3.5 text-amber-400" />
                )}
              </button>

              <button
                onClick={() => setIsCollapsed(false)}
                className="w-8 h-8 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 border border-sky-400/30 text-sky-400 flex items-center justify-center active:scale-95 transition"
                title="Expandir panel de búsqueda"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>

            {/* Aviso de voz en modo colapsado */}
            {voiceNotice && (
              <div className="w-full mt-2 p-2 rounded-xl bg-slate-900/98 border border-sky-500/50 text-white shadow-xl flex items-center justify-between gap-2 text-xs animate-in fade-in slide-in-from-top-1 duration-200">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-6 h-6 rounded-lg bg-sky-500/20 border border-sky-400/40 flex items-center justify-center flex-shrink-0 text-sky-400">
                    <Mic className="w-3.5 h-3.5" />
                  </div>
                  <span className="font-semibold text-slate-200 leading-snug">{voiceNotice}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setVoiceNotice(null)}
                  className="p-1 text-slate-400 hover:text-white rounded-lg flex-shrink-0"
                  title="Cerrar aviso"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        ) : (
          /* Expanded Mode: Refined, Slim & Elegant */
          <div className="space-y-2">
            {/* Barra superior del panel: Solo se muestra si NO está en hideTopBar */}
            {!hideTopBar && (
              <div className="flex items-center justify-end pb-1 border-b border-slate-800/80">
                <div className="flex items-center gap-1.5 ml-auto">
                  <PWAInstallButton />
                  {onClose ? (
                    <button
                      type="button"
                      onClick={onClose}
                      className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition border border-slate-700 active:scale-95"
                      title="Plegar panel"
                    >
                      <ChevronUp className="w-4 h-4 text-sky-400" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setIsCollapsed(true)}
                      className="flex items-center gap-1 px-2 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700/80 active:scale-95 transition text-[10px] font-bold"
                      title="Contraer panel"
                    >
                      <ChevronUp className="w-3.5 h-3.5 text-sky-400" />
                      <span className="text-slate-400 hidden xs:inline">Mapa</span>
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Modern Search Input Box with Mic Icon */}
            <div className="relative flex items-center bg-slate-950/80 rounded-xl border border-slate-700/80 pl-3 pr-0.5 py-0.5 text-white focus-within:border-sky-400 focus-within:ring-2 focus-within:ring-sky-500/30 transition-all shadow-inner">
              <Search className="w-4 h-4 text-sky-400 flex-shrink-0" />
              <input
                type="text"
                value={isListening ? 'Escuchando...' : query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => setIsFocused(true)}
                onKeyDown={async (e) => {
                  if (e.key === 'Enter' && query.trim().length >= 3) {
                    e.preventDefault();
                    if (results.length > 0 && !isLoading) {
                      handleSelect(results[0]);
                      return;
                    }
                    setIsLoading(true);
                    setSearchError(null);
                    try {
                      const hits = await searchPlacesInLima(query, undefined, {
                        userCoords,
                        localPois: cachedPois,
                      });
                      setResults(hits);
                      if (hits.length > 0) {
                        handleSelect(hits[0]);
                      }
                    } catch {
                      setSearchError('No se pudo conectar con el servidor de búsqueda.');
                    } finally {
                      setIsLoading(false);
                    }
                  }
                }}
                placeholder={isListening ? 'Escuchando...' : "¿A dónde vas? (ej. Larcomar, Ayacucho, Plaza Norte...)"}
                className="w-full bg-transparent px-2.5 py-1.5 text-xs sm:text-sm font-medium text-white placeholder:text-slate-500 outline-none"
              />

              {isLoading ? (
                <div className="w-8 h-8 flex items-center justify-center flex-shrink-0">
                  <Loader2 className="w-4 h-4 text-sky-400 animate-spin" />
                </div>
              ) : query && !isListening ? (
                <button
                  type="button"
                  onClick={handleClear}
                  className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-white rounded-full transition flex-shrink-0 cursor-pointer"
                  title="Limpiar búsqueda"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              ) : null}

              {/* Botón de micrófono dentro del campo al lado derecho */}
              <button
                type="button"
                onClick={handleToggleVoiceSearch}
                className={`min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg transition-all flex-shrink-0 cursor-pointer ${
                  isListening
                    ? 'text-sky-300 bg-sky-500/25 border border-sky-400 shadow-[0_0_16px_rgba(56,189,248,0.85)] animate-pulse'
                    : isSpeechSupported
                    ? 'text-sky-400 hover:text-sky-200 hover:bg-slate-800/80 active:scale-95'
                    : 'text-slate-600 opacity-40 cursor-not-allowed'
                }`}
                title={
                  isListening
                    ? 'Toca para cancelar escucha'
                    : isSpeechSupported
                    ? 'Buscar por voz'
                    : 'Reconocimiento de voz no soportado'
                }
                aria-label="Buscar por voz"
              >
                <Mic className={`w-4 h-4 ${isListening ? 'text-sky-300' : isSpeechSupported ? 'text-sky-400' : 'text-slate-600'}`} />
              </button>
            </div>

            {/* Aviso de voz en modo expandido */}
            {voiceNotice && (
              <div className="p-2.5 rounded-xl bg-slate-900/98 border border-sky-500/50 text-white shadow-xl flex items-center justify-between gap-2 text-xs animate-in fade-in slide-in-from-top-1 duration-200">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-6 h-6 rounded-lg bg-sky-500/20 border border-sky-400/40 flex items-center justify-center flex-shrink-0 text-sky-400">
                    <Mic className="w-3.5 h-3.5" />
                  </div>
                  <span className="font-semibold text-slate-200 leading-snug">{voiceNotice}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setVoiceNotice(null)}
                  className="p-1 text-slate-400 hover:text-white rounded-lg flex-shrink-0"
                  title="Cerrar aviso"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Quick Favorites Row: Casa, Trabajo + Categories */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-0.5 text-xs">
              {/* Home Quick Shortcut */}
              <button
                onClick={() => {
                  if (homePlace) {
                    handleSelectSavedPlace(homePlace);
                  } else {
                    setQuery('Casa');
                    setIsFocused(true);
                  }
                }}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl border whitespace-nowrap text-xs transition-all active:scale-95 ${
                  homePlace
                    ? 'bg-sky-950/60 text-sky-300 border-sky-600/50 hover:bg-sky-900/60 font-bold'
                    : 'bg-slate-800/80 text-slate-400 border-dashed border-slate-700 hover:text-white font-medium'
                }`}
                title={homePlace ? `Ir a Casa: ${homePlace.name}` : 'Establecer ubicación de Casa'}
              >
                <Home className="w-3.5 h-3.5 text-sky-400 flex-shrink-0" />
                <span className="truncate max-w-[100px]">{homePlace ? 'Casa' : '+ Casa'}</span>
              </button>

              {/* Work Quick Shortcut */}
              <button
                onClick={() => {
                  if (workPlace) {
                    handleSelectSavedPlace(workPlace);
                  } else {
                    setQuery('Trabajo');
                    setIsFocused(true);
                  }
                }}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl border whitespace-nowrap text-xs transition-all active:scale-95 ${
                  workPlace
                    ? 'bg-emerald-950/60 text-emerald-300 border-emerald-600/50 hover:bg-emerald-900/60 font-bold'
                    : 'bg-slate-800/80 text-slate-400 border-dashed border-slate-700 hover:text-white font-medium'
                }`}
                title={workPlace ? `Ir a Trabajo: ${workPlace.name}` : 'Establecer ubicación de Trabajo'}
              >
                <Briefcase className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                <span className="truncate max-w-[100px]">{workPlace ? 'Trabajo' : '+ Trabajo'}</span>
              </button>

              <span className="text-slate-700 select-none">|</span>

              {/* Quick Category Chips for Lima */}
              <button
                onClick={() => handleCategoryClick('shopping')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-xl border whitespace-nowrap text-xs transition-all active:scale-95 ${
                  activeCategory === 'shopping'
                    ? 'bg-sky-500 text-slate-950 font-bold border-sky-400 shadow-sm'
                    : 'bg-slate-800/80 text-slate-300 border-slate-700/70 hover:bg-slate-700'
                }`}
              >
                <ShoppingBag className="w-3.5 h-3.5" />
                <span>Malls</span>
              </button>

              <button
                onClick={() => handleCategoryClick('landmark')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-xl border whitespace-nowrap text-xs transition-all active:scale-95 ${
                  activeCategory === 'landmark'
                    ? 'bg-sky-500 text-slate-950 font-bold border-sky-400 shadow-sm'
                    : 'bg-slate-800/80 text-slate-300 border-slate-700/70 hover:bg-slate-700'
                }`}
              >
                <Landmark className="w-3.5 h-3.5" />
                <span>Lugares</span>
              </button>

              <button
                onClick={() => handleCategoryClick('airport')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-xl border whitespace-nowrap text-xs transition-all active:scale-95 ${
                  activeCategory === 'airport'
                    ? 'bg-sky-500 text-slate-950 font-bold border-sky-400 shadow-sm'
                    : 'bg-slate-800/80 text-slate-300 border-slate-700/70 hover:bg-slate-700'
                }`}
              >
                <Plane className="w-3.5 h-3.5" />
                <span>Aeropuerto</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Autocomplete / Favorites / History Dropdown */}
      {!isCollapsed && isFocused && (
        <div className="mt-2 max-h-[50vh] sm:max-h-80 overflow-y-auto rounded-3xl bg-slate-900/98 border border-slate-700 shadow-2xl backdrop-blur-2xl p-2 space-y-1 text-slate-100 overscroll-contain">
          {searchError ? (
            <div className="py-4 px-3 text-center space-y-2">
              <p className="text-xs text-rose-300 font-semibold">{searchError}</p>
              <button
                type="button"
                  onClick={() => {
                  setSearchError(null);
                  setIsLoading(true);
                  searchPlacesInLima(query, undefined, {
                    userCoords,
                    localPois: cachedPois,
                  })
                    .then((hits) => setResults(hits))
                    .catch(() => setSearchError('El servidor de búsqueda no responde.'))
                    .finally(() => setIsLoading(false));
                }}
                className="px-3 py-1.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-bold active:scale-95 transition cursor-pointer"
              >
                Reintentar
              </button>
            </div>
          ) : results.length > 0 ? (
            <>
              <div className="px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                <span>Sugerencias de Destino</span>
                <button onClick={() => setIsFocused(false)} className="text-slate-500 hover:text-slate-300">
                  Cerrar
                </button>
              </div>

              {results.some((r) => r.isStreetFallback) && (
                <div className="mx-1.5 mb-1 px-3 py-1.5 rounded-xl bg-amber-500/15 border border-amber-400/40 text-amber-200 text-[11px] font-semibold leading-snug">
                  {results.find((r) => r.fallbackNotice)?.fallbackNotice ||
                    'No se encontró el número exacto, se muestra la vía'}
                </div>
              )}

              {results.map((place) => {
                const distMeters = calculateDistanceMeters(
                  userCoords.lat,
                  userCoords.lng,
                  place.lat,
                  place.lng
                );
                const isFav = customFavorites.some((f) => f.lat === place.lat && f.lng === place.lng);
                const visual = getSuggestionVisual(place.category, place.placeTypeLabel);

                return (
                  <div
                    key={place.id}
                    className="w-full flex items-center gap-2 p-2.5 rounded-2xl hover:bg-slate-800/90 active:bg-slate-700/90 transition text-left group"
                  >
                    <button
                      onClick={() => handleSelect(place)}
                      className="flex-1 flex items-center gap-3 min-w-0"
                    >
                      <div
                        className={`w-9 h-9 rounded-xl border flex items-center justify-center flex-shrink-0 transition ${visual.badgeClass}`}
                        title={visual.label}
                      >
                        {visual.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-sm font-bold text-white truncate">{place.name}</span>
                          <span className="text-xs font-mono font-bold text-sky-400 flex-shrink-0">
                            {formatDistance(distMeters)}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
                          <span className="text-[10px] font-bold uppercase px-1.5 py-0.2 rounded bg-sky-500/15 text-sky-300 border border-sky-500/30 flex-shrink-0">
                            {visual.label}
                          </span>
                          {place.district && (
                            <span className="text-[10px] font-bold uppercase px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 border border-slate-700 flex-shrink-0">
                              {place.district}
                            </span>
                          )}
                          <span className="text-xs text-slate-400 truncate">{place.display_name}</span>
                        </div>
                      </div>
                    </button>

                    {/* Star Favorite Button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleFavorite(place, 'favorite');
                      }}
                      className={`p-2 rounded-xl transition ${
                        isFav
                          ? 'text-amber-400 bg-amber-400/20'
                          : 'text-slate-500 hover:text-amber-300 hover:bg-slate-800'
                      }`}
                      title={isFav ? 'Quitar de favoritos' : 'Guardar en favoritos'}
                    >
                      <Star className={`w-4 h-4 ${isFav ? 'fill-amber-400' : ''}`} />
                    </button>
                  </div>
                );
              })}
            </>
          ) : query.trim() ? (
            /* Under 3 chars or No results for query */
            <div className="py-6 text-center text-slate-400 text-xs">
              {query.trim().length < 3
                ? 'Escribe al menos 3 letras para ver sugerencias...'
                : isLoading
                ? 'Buscando...'
                : 'Sin resultados, prueba con otra palabra'}
            </div>
          ) : (
            /* When empty query: show Favorites & History tabs */
            <div>
              {/* Segmented Tab Header: Historial Reciente vs Favoritos */}
              <div className="flex items-center justify-between px-2 pt-1 pb-2 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setActiveTab('recents')}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold transition ${
                      activeTab === 'recents'
                        ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <History className="w-3.5 h-3.5" />
                    <span>Recientes ({history.length})</span>
                  </button>

                  <button
                    onClick={() => setActiveTab('favorites')}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold transition ${
                      activeTab === 'favorites'
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Star className="w-3.5 h-3.5" />
                    <span>Favoritos ({favorites.length})</span>
                  </button>
                </div>

                {activeTab === 'recents' && history.length > 0 && (
                  <button
                    onClick={handleClearAllHistory}
                    className="text-[11px] text-rose-400 hover:text-rose-300 flex items-center gap-1"
                    title="Borrar todo el historial"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Limpiar</span>
                  </button>
                )}
              </div>

              {/* Tab 1: Historial Reciente */}
              {activeTab === 'recents' && (
                <div className="pt-1 space-y-0.5">
                  {history.length === 0 ? (
                    <div className="py-6 text-center text-slate-500 text-xs">
                      No hay búsquedas recientes aún en Lima.
                    </div>
                  ) : (
                    history.map((item) => (
                      <div
                        key={item.id}
                        onClick={() => handleSelectSavedPlace(item)}
                        className="flex items-center justify-between p-2.5 rounded-2xl hover:bg-slate-800/80 cursor-pointer group transition"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <History className="w-4 h-4 text-slate-500 group-hover:text-sky-400 transition flex-shrink-0" />
                          <div className="min-w-0">
                            <span className="text-xs font-bold text-slate-200 truncate block">
                              {item.name}
                            </span>
                            <span className="text-[11px] text-slate-500 truncate block">
                              {item.display_name}
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={(e) => handleDeleteHistoryItem(item.id, e)}
                          className="p-1.5 text-slate-500 hover:text-rose-400 rounded-lg hover:bg-slate-700/60"
                          title="Eliminar de historial"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Tab 2: Lugares Favoritos */}
              {activeTab === 'favorites' && (
                <div className="pt-1 space-y-1">
                  {/* Home and Work entries */}
                  <div className="grid grid-cols-2 gap-2 p-1">
                    <div
                      onClick={() => {
                        if (homePlace) handleSelectSavedPlace(homePlace);
                      }}
                      className={`p-2.5 rounded-2xl border cursor-pointer transition ${
                        homePlace
                          ? 'bg-sky-950/40 border-sky-600/40 hover:bg-sky-900/40'
                          : 'bg-slate-800/40 border-slate-700/60 opacity-60'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 text-sky-400 mb-1">
                        <Home className="w-4 h-4" />
                        <span className="text-xs font-black">Casa</span>
                      </div>
                      <p className="text-[11px] text-slate-300 truncate">
                        {homePlace ? homePlace.display_name : 'No asignada aún'}
                      </p>
                    </div>

                    <div
                      onClick={() => {
                        if (workPlace) handleSelectSavedPlace(workPlace);
                      }}
                      className={`p-2.5 rounded-2xl border cursor-pointer transition ${
                        workPlace
                          ? 'bg-emerald-950/40 border-emerald-600/40 hover:bg-emerald-900/40'
                          : 'bg-slate-800/40 border-slate-700/60 opacity-60'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 text-emerald-400 mb-1">
                        <Briefcase className="w-4 h-4" />
                        <span className="text-xs font-black">Trabajo</span>
                      </div>
                      <p className="text-[11px] text-slate-300 truncate">
                        {workPlace ? workPlace.display_name : 'No asignado aún'}
                      </p>
                    </div>
                  </div>

                  {customFavorites.length === 0 ? (
                    <div className="py-4 text-center text-slate-500 text-xs">
                      Toca la estrella ⭐ en cualquier búsqueda para guardarlo como favorito.
                    </div>
                  ) : (
                    customFavorites.map((fav) => (
                      <div
                        key={fav.id}
                        onClick={() => handleSelectSavedPlace(fav)}
                        className="flex items-center justify-between p-2.5 rounded-2xl hover:bg-slate-800/80 cursor-pointer group transition"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Star className="w-4 h-4 text-amber-400 fill-amber-400 flex-shrink-0" />
                          <div className="min-w-0">
                            <span className="text-xs font-bold text-white truncate block">
                              {fav.name}
                            </span>
                            <span className="text-[11px] text-slate-400 truncate block">
                              {fav.display_name}
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleFavorite(
                              {
                                id: fav.id,
                                name: fav.name,
                                display_name: fav.display_name || fav.address || fav.name,
                                lat: fav.lat,
                                lng: fav.lng,
                                district: fav.district,
                              },
                              'favorite'
                            );
                          }}
                          className="p-1.5 text-slate-500 hover:text-rose-400 rounded-lg hover:bg-slate-700/60"
                          title="Eliminar favorito"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
