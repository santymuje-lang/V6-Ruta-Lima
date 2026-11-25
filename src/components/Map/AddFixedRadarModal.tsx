import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  FixedRadar,
  FixedRadarPriority,
  FixedRadarType,
  PERU_REGIONS,
} from '../../data/fixedRadars';
import { Coordinates } from '../../types/navigation';
import { detectRegionFromCoords, suggestCommunityFixedRadar } from '../../services/fixedRadars';
import {
  forwardGeocodeAddress,
  reverseGeocodeDetailed,
  ReverseGeocodeDetailedResult,
} from '../../services/nominatim';
import { useSwipeToClose } from '../../hooks/useSwipeToClose';
import { X, MapPin, Loader2, Check, PlusCircle } from 'lucide-react';

interface AddFixedRadarModalProps {
  isOpen: boolean;
  isHiddenForMapPick?: boolean;
  onStartMapPick?: () => void;
  pickedMapCoords?: { lat: number; lng: number; seq: number } | null;
  onClose: () => void;
  userCoords: Coordinates;
  mapCenterCoords?: Coordinates | null;
  onAdded: (radar: FixedRadar) => void;
}

type EditableFieldKey = 'nombre' | 'direccion' | 'distrito' | 'provincia' | 'region' | 'tipo';

export const AddFixedRadarModal: React.FC<AddFixedRadarModalProps> = ({
  isOpen,
  isHiddenForMapPick = false,
  onStartMapPick,
  pickedMapCoords = null,
  onClose,
  userCoords,
  mapCenterCoords,
  onAdded,
}) => {
  const [nombre, setNombre] = useState('');
  const [direccion, setDireccion] = useState('');
  const [distrito, setDistrito] = useState('');
  const [provincia, setProvincia] = useState('');
  const [region, setRegion] = useState('Lima y Callao');
  const [tipo, setTipo] = useState<FixedRadarType>('urbano');
  const [prioridad, setPrioridad] = useState<FixedRadarPriority>('normal');
  const [coordMode, setCoordMode] = useState<'nominatim' | 'current_location' | 'map_pick'>(
    'current_location'
  );
  const [currentLocationCoords, setCurrentLocationCoords] = useState<Coordinates | null>(null);
  const [mapPickedCoords, setMapPickedCoords] = useState<Coordinates | null>(null);
  const [searchedCoords, setSearchedCoords] = useState<Coordinates | null>(null);
  const [isReverseGeocoding, setIsReverseGeocoding] = useState(false);
  const [isForwardSearching, setIsForwardSearching] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const scrollRef = useRef<HTMLFormElement | null>(null);
  const backdropDownRef = useRef(false);
  const wasOpenRef = useRef(false);
  const lastPickedSeqRef = useRef<number>(pickedMapCoords?.seq ?? 0);
  const dirtyFieldsRef = useRef<Record<EditableFieldKey, boolean>>({
    nombre: false,
    direccion: false,
    distrito: false,
    provincia: false,
    region: false,
    tipo: false,
  });
  const reverseCacheRef = useRef<Map<string, ReverseGeocodeDetailedResult | null>>(new Map());
  const forwardCacheRef = useRef<Map<string, Coordinates | null>>(new Map());
  const lastReverseKeyRef = useRef<string | null>(null);
  const lastForwardKeyRef = useRef<string | null>(null);
  const reverseAbortRef = useRef<AbortController | null>(null);
  const forwardAbortRef = useRef<AbortController | null>(null);
  const forwardTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { panelRef } = useSwipeToClose({
    isOpen: isOpen && !isHiddenForMapPick,
    onClose,
    scrollRef,
  });

  const applyReverseResult = useCallback((geo: ReverseGeocodeDetailedResult | null) => {
    if (!geo) return;

    setDireccion((prev) =>
      !prev.trim() || !dirtyFieldsRef.current.direccion ? geo.streetAddress : prev
    );
    setNombre((prev) =>
      !prev.trim() || !dirtyFieldsRef.current.nombre ? geo.shortName : prev
    );
    setDistrito((prev) =>
      !prev.trim() || !dirtyFieldsRef.current.distrito ? geo.district : prev
    );
    setProvincia((prev) =>
      !prev.trim() || !dirtyFieldsRef.current.provincia ? geo.province : prev
    );
    setRegion((prev) =>
      !dirtyFieldsRef.current.region && geo.region ? geo.region : prev
    );
    setTipo((prev) => (!dirtyFieldsRef.current.tipo ? geo.tipo : prev));
  }, []);

  // Inicializar solo al abrir por primera vez (de false -> true) para no borrar lo escrito
  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      wasOpenRef.current = true;
      const refCoords = mapCenterCoords || userCoords;
      const detected = detectRegionFromCoords(refCoords.lat, refCoords.lng);

      setNombre('');
      setDireccion('');
      setDistrito('');
      setProvincia('');
      setRegion(detected);
      setTipo('urbano');
      setPrioridad('normal');
      setCoordMode('current_location');
      setCurrentLocationCoords({ lat: refCoords.lat, lng: refCoords.lng });
      setMapPickedCoords(null);
      setSearchedCoords(null);
      setErrorMsg(null);
      setIsReverseGeocoding(false);
      setIsForwardSearching(false);
      dirtyFieldsRef.current = {
        nombre: false,
        direccion: false,
        distrito: false,
        provincia: false,
        region: false,
        tipo: false,
      };
      lastReverseKeyRef.current = null;
      lastForwardKeyRef.current = null;
      lastPickedSeqRef.current = pickedMapCoords?.seq ?? 0;
    } else if (!isOpen && wasOpenRef.current) {
      wasOpenRef.current = false;
      if (reverseAbortRef.current) {
        reverseAbortRef.current.abort();
        reverseAbortRef.current = null;
      }
      if (forwardAbortRef.current) {
        forwardAbortRef.current.abort();
        forwardAbortRef.current = null;
      }
      if (forwardTimerRef.current) {
        clearTimeout(forwardTimerRef.current);
        forwardTimerRef.current = null;
      }
      setIsReverseGeocoding(false);
      setIsForwardSearching(false);
    }
  }, [isOpen, mapCenterCoords, userCoords, pickedMapCoords?.seq]);

  // Recibir coordenadas cuando el usuario confirma un punto en el mapa
  useEffect(() => {
    if (!isOpen || !pickedMapCoords) return;
    if (pickedMapCoords.seq !== lastPickedSeqRef.current) {
      lastPickedSeqRef.current = pickedMapCoords.seq;
      setMapPickedCoords({ lat: pickedMapCoords.lat, lng: pickedMapCoords.lng });
      setCoordMode('map_pick');
    }
  }, [isOpen, pickedMapCoords]);

  const activePoint: Coordinates | null =
    coordMode === 'map_pick'
      ? mapPickedCoords
      : coordMode === 'current_location'
      ? currentLocationCoords
      : searchedCoords;

  const activePointKey = activePoint
    ? `${activePoint.lat.toFixed(5)},${activePoint.lng.toFixed(5)}`
    : null;

  // Consulta inversa única a Nominatim (con espera de 500 ms y caché por coordenada)
  useEffect(() => {
    if (!isOpen || isHiddenForMapPick || !activePoint || !activePointKey) return;
    if (lastReverseKeyRef.current === activePointKey) return;

    const cached = reverseCacheRef.current.get(activePointKey);
    if (cached !== undefined) {
      lastReverseKeyRef.current = activePointKey;
      applyReverseResult(cached);
      return;
    }

    const timer = setTimeout(() => {
      if (reverseAbortRef.current) {
        reverseAbortRef.current.abort();
      }
      const ctrl = new AbortController();
      reverseAbortRef.current = ctrl;
      setIsReverseGeocoding(true);

      reverseGeocodeDetailed(activePoint.lat, activePoint.lng, ctrl.signal)
        .then((res) => {
          if (ctrl.signal.aborted) return;
          reverseCacheRef.current.set(activePointKey, res);
          lastReverseKeyRef.current = activePointKey;
          applyReverseResult(res);
        })
        .catch(() => {
          // Silencioso si no se encontraron datos en OpenStreetMap
        })
        .finally(() => {
          if (!ctrl.signal.aborted) {
            setIsReverseGeocoding(false);
          }
        });
    }, 500);

    return () => {
      clearTimeout(timer);
    };
  }, [isOpen, isHiddenForMapPick, activePoint, activePointKey, applyReverseResult]);

  // Búsqueda por dirección en OpenStreetMap cuando está activo el modo "Buscar dirección"
  const triggerForwardLookup = useCallback(
    (addrText: string, regionText: string) => {
      const trimmed = addrText.trim();
      if (trimmed.length < 3) {
        setSearchedCoords(null);
        return;
      }
      const normKey = `${trimmed.toLowerCase()}|${regionText.toLowerCase()}`;
      if (lastForwardKeyRef.current === normKey) return;

      const cached = forwardCacheRef.current.get(normKey);
      if (cached !== undefined) {
        lastForwardKeyRef.current = normKey;
        setSearchedCoords(cached);
        return;
      }

      if (forwardAbortRef.current) {
        forwardAbortRef.current.abort();
      }
      const ctrl = new AbortController();
      forwardAbortRef.current = ctrl;
      setIsForwardSearching(true);

      forwardGeocodeAddress(trimmed, regionText, ctrl.signal)
        .then((coords) => {
          if (ctrl.signal.aborted) return;
          forwardCacheRef.current.set(normKey, coords);
          lastForwardKeyRef.current = normKey;
          setSearchedCoords(coords);
        })
        .catch(() => {
          // Sin error visual si OSM no ubica la dirección todavía
        })
        .finally(() => {
          if (!ctrl.signal.aborted) {
            setIsForwardSearching(false);
          }
        });
    },
    []
  );

  useEffect(() => {
    if (!isOpen || isHiddenForMapPick || coordMode !== 'nominatim') return;
    if (forwardTimerRef.current) {
      clearTimeout(forwardTimerRef.current);
      forwardTimerRef.current = null;
    }
    const trimmed = direccion.trim();
    if (trimmed.length < 4) return;

    forwardTimerRef.current = setTimeout(() => {
      triggerForwardLookup(trimmed, region);
    }, 850);

    return () => {
      if (forwardTimerRef.current) {
        clearTimeout(forwardTimerRef.current);
        forwardTimerRef.current = null;
      }
    };
  }, [isOpen, isHiddenForMapPick, coordMode, direccion, region, triggerForwardLookup]);

  if (!isOpen) return null;

  const isGeocodingPlace = isReverseGeocoding || isForwardSearching;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!direccion.trim()) {
      setErrorMsg('Ingresa la dirección, avenida o carretera del radar.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      const targetCoords =
        coordMode === 'map_pick'
          ? mapPickedCoords
          : coordMode === 'current_location'
          ? currentLocationCoords || mapCenterCoords || userCoords
          : searchedCoords;

      const result = await suggestCommunityFixedRadar({
        nombre: nombre.trim() || direccion.trim(),
        direccion: direccion.trim(),
        distrito: distrito.trim() || provincia.trim() || region,
        provincia: provincia.trim() || region,
        region,
        tipo,
        prioridad,
        coords: targetCoords,
      });

      if (!result.success || !result.radar) {
        setErrorMsg(result.error || 'No se pudo registrar el radar.');
        return;
      }

      setNombre('');
      setDireccion('');
      setDistrito('');
      setProvincia('');
      onAdded(result.radar);
      onClose();
    } catch {
      setErrorMsg('Error al guardar la sugerencia de radar.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-3 pt-[max(0.75rem,env(safe-area-inset-top))] bg-black/75 backdrop-blur-sm animate-in fade-in duration-150 ${
        isHiddenForMapPick ? 'hidden pointer-events-none' : ''
      }`}
      onPointerDown={(e) => {
        backdropDownRef.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && backdropDownRef.current) {
          onClose();
        }
        backdropDownRef.current = false;
      }}
    >
      <div
        ref={panelRef}
        className="w-full max-w-sm max-h-[calc(100dvh-24px-env(safe-area-inset-top,0px))] flex flex-col rounded-3xl bg-slate-900 border border-pink-500/40 shadow-2xl text-white p-4 sm:p-5 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex-shrink-0 flex items-center justify-between pb-3 mb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-pink-600/20 border border-pink-400/40 flex items-center justify-center text-pink-400">
              <PlusCircle className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-black text-white">Agregar radar fijo</h3>
              <p className="text-[10px] text-slate-400">
                Cobertura nacional (Perú) · Inicia como aproximado
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white cursor-pointer"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form
          ref={scrollRef}
          onSubmit={handleSubmit}
          className="flex-1 min-h-0 overflow-y-auto overscroll-contain space-y-3 text-xs"
        >
          <div>
            <div className="flex items-center justify-between gap-2 mb-1">
              <label className="block font-bold text-slate-300">Dirección o tramo *</label>
              {onStartMapPick && (
                <button
                  type="button"
                  onClick={onStartMapPick}
                  className="px-2 py-1 rounded-lg bg-pink-600/20 hover:bg-pink-600/35 border border-pink-400/50 text-pink-200 text-[11px] font-bold flex items-center gap-1 transition active:scale-95 cursor-pointer"
                >
                  <MapPin className="w-3 h-3" />
                  <span>Elegir en el mapa</span>
                </button>
              )}
            </div>
            <input
              type="text"
              value={direccion}
              onChange={(e) => {
                const val = e.target.value;
                dirtyFieldsRef.current.direccion = val.trim().length > 0;
                setDireccion(val);
              }}
              placeholder="Ej. Av. Ejército cdra. 5 / Panamericana Norte km 24"
              className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-pink-500"
              required
            />
          </div>

          {isGeocodingPlace && (
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-sky-300 px-1">
              <Loader2 className="w-3 h-3 animate-spin flex-shrink-0" />
              <span>Buscando datos del lugar...</span>
            </div>
          )}

          <div>
            <label className="block font-bold text-slate-300 mb-1">Nombre corto (opcional)</label>
            <input
              type="text"
              value={nombre}
              onChange={(e) => {
                const val = e.target.value;
                dirtyFieldsRef.current.nombre = val.trim().length > 0;
                setNombre(val);
              }}
              placeholder="Ej. Radar Av. Ejército"
              className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-pink-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block font-bold text-slate-300 mb-1">Distrito / Ciudad</label>
              <input
                type="text"
                value={distrito}
                onChange={(e) => {
                  const val = e.target.value;
                  dirtyFieldsRef.current.distrito = val.trim().length > 0;
                  setDistrito(val);
                }}
                placeholder="Ej. Miraflores / Cayma"
                className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-pink-500"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-300 mb-1">Provincia</label>
              <input
                type="text"
                value={provincia}
                onChange={(e) => {
                  const val = e.target.value;
                  dirtyFieldsRef.current.provincia = val.trim().length > 0;
                  setProvincia(val);
                }}
                placeholder="Ej. Lima / Arequipa"
                className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-pink-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block font-bold text-slate-300 mb-1">Región</label>
              <select
                value={region}
                onChange={(e) => {
                  dirtyFieldsRef.current.region = true;
                  setRegion(e.target.value);
                }}
                className="w-full px-2.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-pink-500"
              >
                {PERU_REGIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-bold text-slate-300 mb-1">Tipo</label>
              <select
                value={tipo}
                onChange={(e) => {
                  dirtyFieldsRef.current.tipo = true;
                  setTipo(e.target.value as FixedRadarType);
                }}
                className="w-full px-2.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-pink-500"
              >
                <option value="urbano">Urbano</option>
                <option value="carretera">Carretera</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block font-bold text-slate-300 mb-1">Ubicación inicial</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  const nextRef = mapCenterCoords || userCoords;
                  setCoordMode('current_location');
                  setCurrentLocationCoords({ lat: nextRef.lat, lng: nextRef.lng });
                }}
                className={`py-2 px-2.5 rounded-xl border font-bold text-[11px] flex items-center justify-center gap-1 transition cursor-pointer ${
                  coordMode === 'current_location'
                    ? 'bg-pink-600/25 border-pink-400 text-pink-200'
                    : 'bg-slate-800 border-slate-700 text-slate-400'
                }`}
              >
                <MapPin className="w-3.5 h-3.5" />
                <span>Centro / GPS actual</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setCoordMode('nominatim');
                  if (direccion.trim().length >= 3) {
                    if (forwardTimerRef.current) {
                      clearTimeout(forwardTimerRef.current);
                      forwardTimerRef.current = null;
                    }
                    triggerForwardLookup(direccion, region);
                  }
                }}
                className={`py-2 px-2.5 rounded-xl border font-bold text-[11px] flex items-center justify-center gap-1 transition cursor-pointer ${
                  coordMode === 'nominatim'
                    ? 'bg-pink-600/25 border-pink-400 text-pink-200'
                    : 'bg-slate-800 border-slate-700 text-slate-400'
                }`}
              >
                <span>Buscar dirección</span>
              </button>
            </div>
            {coordMode === 'map_pick' && mapPickedCoords && (
              <div className="mt-1.5 px-2.5 py-1.5 rounded-xl bg-pink-600/15 border border-pink-400/40 text-pink-200 text-[11px] font-semibold flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-pink-400 flex-shrink-0" />
                <span className="truncate">
                  Punto elegido en el mapa ({mapPickedCoords.lat.toFixed(5)},{' '}
                  {mapPickedCoords.lng.toFixed(5)})
                </span>
              </div>
            )}
          </div>

          <div>
            <label className="block font-bold text-slate-300 mb-1">Prioridad visual</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPrioridad('normal')}
                className={`py-1.5 rounded-xl border font-bold transition cursor-pointer ${
                  prioridad === 'normal'
                    ? 'bg-slate-700 border-pink-400 text-white'
                    : 'bg-slate-800 border-slate-700 text-slate-400'
                }`}
              >
                Normal
              </button>
              <button
                type="button"
                onClick={() => setPrioridad('alta')}
                className={`py-1.5 rounded-xl border font-bold transition cursor-pointer ${
                  prioridad === 'alta'
                    ? 'bg-slate-700 border-pink-400 text-white'
                    : 'bg-slate-800 border-slate-700 text-slate-400'
                }`}
              >
                Alta (vía principal)
              </button>
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-400/30 text-[11px] text-amber-200 leading-snug">
            Se guardará como <strong>aproximado</strong> hasta que 3 conductores distintos lo confirmen en el mapa.
          </div>

          {errorMsg && (
            <div className="p-2 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-200 text-[11px] font-semibold">
              {errorMsg}
            </div>
          )}

          <div className="pt-2 flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold transition cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 py-2.5 rounded-xl bg-pink-600 hover:bg-pink-500 disabled:opacity-60 text-white font-black flex items-center justify-center gap-1.5 transition cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Guardando...</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                  <span>Guardar radar</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
