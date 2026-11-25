import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Coordinates, InspectorSubtype, TrafficAlert } from '../../types/navigation';
import {
  INSPECTOR_FADE_START_MS,
  formatRelativeTime,
  getLimaZoneFallback,
  isAlertExpired,
} from '../../services/alertLifecycle';
import {
  INSPECTOR_SUBTYPE_OPTIONS,
  getInspectorSubtypeImage,
  getInspectorSubtypeLabel,
  normalizeInspectorSubtype,
} from '../../services/inspectorReports';
import { calculateDistanceMeters, formatDistance } from '../../services/osrm';
import { useSwipeToClose } from '../../hooks/useSwipeToClose';
import { X, MapPin, Clock, Navigation, ShieldCheck, ArrowUpDown } from 'lucide-react';

// Abreviatura del tipo de vía (solo la primera palabra) para esta tarjeta únicamente
const STREET_TYPE_ABBREVIATIONS: Record<string, string> = {
  avenida: 'Av.',
  jirón: 'Jr.',
  jiron: 'Jr.',
  pasaje: 'Psje.',
  carretera: 'Carr.',
  urbanización: 'Urb.',
  urbanizacion: 'Urb.',
  malecón: 'Malec.',
  malecon: 'Malec.',
};

const abbreviateStreetType = (label: string): string => {
  const trimmed = (label || '').trim();
  const match = trimmed.match(/^(\S+)(\s+.*)?$/);
  if (!match) return trimmed;
  const abbr = STREET_TYPE_ABBREVIATIONS[match[1].toLowerCase()];
  return abbr ? `${abbr}${match[2] ?? ''}` : trimmed;
};

interface LiveInspectorsModalProps {
  isOpen: boolean;
  onClose: () => void;
  alerts: TrafficAlert[];
  userCoords: Coordinates;
  onFocusInspector: (alert: TrafficAlert) => void;
  onConfirmStillThere?: (alertId: string) => void;
  onReportNotThere?: (alertId: string) => void;
}

export const LiveInspectorsModal: React.FC<LiveInspectorsModalProps> = ({
  isOpen,
  onClose,
  alerts,
  userCoords,
  onFocusInspector,
}) => {
  const [sortBy, setSortBy] = useState<'recent' | 'distance'>('recent');
  const [subtypeFilter, setSubtypeFilter] = useState<'all' | InspectorSubtype>('all');
  const [now, setNow] = useState<number>(() => Date.now());
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const backdropDownRef = useRef(false);
  const { panelRef } = useSwipeToClose({ isOpen, onClose, scrollRef });

  useEffect(() => {
    if (!isOpen) return;
    setNow(Date.now());
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 15000);
    return () => clearInterval(interval);
  }, [isOpen, alerts]);

  const allInspectorItems = useMemo(() => {
    const active = alerts
      .filter((a) => a.type === 'inspectors' && !isAlertExpired(a, now) && (a.removalVotes || 0) < 3)
      .map((alert) => {
        const subtype = normalizeInspectorSubtype(alert);
        const subtypeLabel = getInspectorSubtypeLabel(subtype);
        const subtypeImage = getInspectorSubtypeImage(subtype);
        const distanceMeters = calculateDistanceMeters(
          userCoords.lat,
          userCoords.lng,
          alert.coords.lat,
          alert.coords.lng
        );
        const ageMs = Math.max(0, now - alert.timestamp);
        const isFading = ageMs >= INSPECTOR_FADE_START_MS;
        const zoneLabel =
          alert.address ||
          alert.zone ||
          (alert.description &&
          alert.description !== 'Control de inspectores' &&
          alert.description !== subtypeLabel
            ? alert.description
            : getLimaZoneFallback(alert.coords.lat, alert.coords.lng));

        return {
          alert,
          subtype,
          subtypeLabel,
          subtypeImage,
          distanceMeters,
          isFading,
          zoneLabel,
        };
      });

    if (sortBy === 'distance') {
      return active.sort((a, b) => a.distanceMeters - b.distanceMeters);
    }
    return active.sort((a, b) => b.alert.timestamp - a.alert.timestamp);
  }, [alerts, userCoords.lat, userCoords.lng, sortBy, now]);

  const inspectorItems = useMemo(() => {
    if (subtypeFilter === 'all') return allInspectorItems;
    return allInspectorItems.filter((item) => item.subtype === subtypeFilter);
  }, [allInspectorItems, subtypeFilter]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-2.5 sm:p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200"
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
        className="w-full max-w-md max-h-[86vh] flex flex-col rounded-3xl bg-slate-900/98 border border-teal-500/40 shadow-[0_20px_50px_rgba(0,0,0,0.85)] text-white overflow-hidden animate-in slide-in-from-bottom-3 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-800 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-orange-500 to-red-600 border border-amber-300/60 flex items-center justify-center text-white shadow-md">
              <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor">
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
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm sm:text-base font-black text-white">Inspectores en vivo</h3>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-black bg-teal-500/20 text-teal-300 border border-teal-500/35 font-mono">
                  {inspectorItems.length}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">Reportes activos en toda la ciudad (máx. 2 h)</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition cursor-pointer"
            aria-label="Cerrar panel de inspectores"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Subtype Filter Row: Todos, A, S, Municipales */}
        <div className="flex items-center gap-1.5 px-4 py-2 bg-slate-950/70 border-b border-slate-800/80 flex-shrink-0 overflow-x-auto">
          <button
            type="button"
            onClick={() => setSubtypeFilter('all')}
            className={`px-3 py-1 rounded-xl text-xs font-bold border transition cursor-pointer flex-shrink-0 ${
              subtypeFilter === 'all'
                ? 'bg-teal-500/20 border-teal-400 text-teal-200'
                : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
            }`}
          >
            Todos
          </button>
          {INSPECTOR_SUBTYPE_OPTIONS.map((opt) => {
            const isActive = subtypeFilter === opt.subtype;
            return (
              <button
                key={opt.subtype}
                type="button"
                onClick={() => setSubtypeFilter(opt.subtype)}
                className={`px-2.5 py-1 rounded-xl text-xs font-bold border transition cursor-pointer flex items-center gap-1.5 flex-shrink-0 ${
                  isActive
                    ? 'bg-teal-500/20 border-teal-400 text-teal-200'
                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
                }`}
              >
                <span className="w-4 h-4 rounded-full overflow-hidden border border-white/70 bg-white flex-shrink-0">
                  <img
                    src={opt.imageSrc}
                    alt={opt.label}
                    className="w-full h-full object-cover scale-[1.04] block pointer-events-none"
                    draggable={false}
                  />
                </span>
                <span>{opt.filterLabel}</span>
              </button>
            );
          })}
        </div>

        {/* Sort Controls */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-slate-950/50 border-b border-slate-800/80 flex-shrink-0">
          <span className="text-[11px] font-bold text-slate-400 flex items-center gap-1">
            <ArrowUpDown className="w-3.5 h-3.5 text-teal-400" />
            <span>Ordenar por:</span>
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setSortBy('recent')}
              className={`px-3 py-1 rounded-xl text-xs font-bold border transition cursor-pointer ${
                sortBy === 'recent'
                  ? 'bg-teal-500/20 border-teal-400 text-teal-300'
                  : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
              }`}
            >
              Más reciente
            </button>
            <button
              type="button"
              onClick={() => setSortBy('distance')}
              className={`px-3 py-1 rounded-xl text-xs font-bold border transition cursor-pointer ${
                sortBy === 'distance'
                  ? 'bg-teal-500/20 border-teal-400 text-teal-300'
                  : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
              }`}
            >
              Cercanía
            </button>
          </div>
        </div>

        {/* Scrollable List */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-3 space-y-2.5 overscroll-contain min-h-0"
        >
          {inspectorItems.length === 0 ? (
            <div className="py-10 px-4 text-center space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-slate-800/80 border border-slate-700 flex items-center justify-center mx-auto text-teal-400/70">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <p className="text-sm font-bold text-slate-200">
                {allInspectorItems.length > 0
                  ? 'Sin reportes activos para este filtro'
                  : 'Sin reportes activos de inspectores'}
              </p>
              <p className="text-xs text-slate-400">
                {allInspectorItems.length > 0
                  ? 'Prueba seleccionando "Todos" u otro tipo de inspectores.'
                  : 'Cuando la comunidad reporte controles en Lima, aparecerán aquí en tiempo real.'}
              </p>
            </div>
          ) : (
            inspectorItems.map(({ alert, subtypeLabel, subtypeImage, distanceMeters, isFading, zoneLabel }) => {
              return (
                <div
                  key={alert.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    onFocusInspector(alert);
                    onClose();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onFocusInspector(alert);
                      onClose();
                    }
                  }}
                  className={`rounded-2xl bg-slate-800/75 hover:bg-slate-800 border border-slate-700/80 p-3 cursor-pointer transition active:scale-[0.99] ${
                    isFading ? 'opacity-70' : 'opacity-100'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full overflow-hidden border border-white/80 bg-white flex-shrink-0 shadow-sm">
                      <img
                        src={subtypeImage}
                        alt={subtypeLabel}
                        className="w-full h-full object-cover scale-[1.04] block pointer-events-none"
                        draggable={false}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 text-teal-300 text-sm font-bold">
                        <MapPin className="w-3.5 h-3.5 flex-shrink-0 text-teal-400" />
                        <span className="truncate">{abbreviateStreetType(zoneLabel)}</span>
                      </div>
                      <div className="flex items-center flex-wrap gap-2 mt-1 text-[11px] text-slate-400">
                        <span className="inline-flex items-center gap-1 font-semibold text-slate-300">
                          <Clock className="w-3 h-3 text-teal-400" />
                          {formatRelativeTime(alert.timestamp, now)}
                        </span>
                        <span className="text-slate-600">•</span>
                        <span className="inline-flex items-center gap-1 font-mono font-bold text-sky-300">
                          <Navigation className="w-3 h-3" />
                          {formatDistance(distanceMeters)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
