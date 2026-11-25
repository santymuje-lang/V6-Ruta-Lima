import React, { useState, useRef } from 'react';
import { RouteData, TravelMode } from '../../types/navigation';
import { formatDistance, formatDuration } from '../../services/osrm';
import { PreRouteSummaryResult } from '../../services/routeAlerts';
import { useSwipeToClose } from '../../hooks/useSwipeToClose';
import { Play, Clock, X, Check, Calendar, AlertTriangle, Car, Footprints } from 'lucide-react';

interface RoutePreviewCardProps {
  routes: RouteData[];
  activeRoute: RouteData;
  onSelectRoute?: (route: RouteData) => void;
  onStartNavigation: () => void;
  onClose: () => void;
  isLoading?: boolean;
  inspectorCount?: number;
  preRouteSummary?: PreRouteSummaryResult | null;
  travelMode?: TravelMode;
  onTravelModeChange?: (mode: TravelMode) => void;
}

export const RoutePreviewCard: React.FC<RoutePreviewCardProps> = ({
  routes,
  activeRoute,
  onStartNavigation,
  isLoading = false,
  inspectorCount = 0,
  preRouteSummary = null,
  travelMode = 'driving',
  onTravelModeChange,
}) => {
  const [isDepartLaterOpen, setIsDepartLaterOpen] = useState(false);
  const departBackdropDownRef = useRef(false);
  const { panelRef: departPanelRef } = useSwipeToClose({
    isOpen: isDepartLaterOpen,
    onClose: () => setIsDepartLaterOpen(false),
  });

  // Hora de salida para "Salir más tarde" (default: ahora + 30 minutos)
  const [departureTime, setDepartureTime] = useState(() => {
    const d = new Date(Date.now() + 30 * 60 * 1000);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  });

  const displayRoutes = routes.length > 0 ? routes.slice(0, 3) : [activeRoute];

  // Identificar si la ruta activa es la más rápida (Mejor ruta)
  const sortedByDuration = [...displayRoutes].sort((a, b) => a.duration - b.duration);
  const isFastest = sortedByDuration[0]?.id === activeRoute.id;
  const isSecond = sortedByDuration[1]?.id === activeRoute.id;

  const hasRouteAlerts = Boolean(preRouteSummary && preRouteSummary.totalCount > 0);

  // Formato de nombre de vía principal
  let mainRoad = activeRoute.summary || activeRoute.steps?.[0]?.name || 'vías principales de Lima';
  if (!mainRoad.toLowerCase().startsWith('av') && !mainRoad.toLowerCase().startsWith('jr') && !mainRoad.toLowerCase().startsWith('calle')) {
    mainRoad = `Av. ${mainRoad}`;
  }

  // Tipo de ruta y estado de tráfico según especificación
  let routeStatusText = 'Mejor ruta, tráfico habitual';
  if (!isFastest && isSecond) {
    routeStatusText = 'Ruta alterna, tráfico habitual';
  } else if (!isFastest) {
    routeStatusText = 'Ruta más larga, tránsito moderado';
  }

  // Cálculo de tiempo estimado según hora de salida seleccionada (horas punta en Lima)
  const calculateEstimatedDurationForTime = (timeStr: string, baseSeconds: number) => {
    const [hh, mm] = timeStr.split(':').map(Number);
    const decimalHour = hh + (mm || 0) / 60;

    // Horas punta en Lima: Mañana (7:00 a 9:30) y Tarde/Noche (17:30 a 20:30)
    const isMorningRush = decimalHour >= 7 && decimalHour <= 9.5;
    const isEveningRush = decimalHour >= 17.5 && decimalHour <= 20.5;
    const isNightLowTraffic = decimalHour >= 22.5 || decimalHour < 5.5;

    let multiplier = 1.0;
    let description = 'Tráfico habitual proyectado en Lima';

    if (isMorningRush || isEveningRush) {
      multiplier = 1.35;
      description = 'Hora punta en Lima: mayor congestión esperada';
    } else if (isNightLowTraffic) {
      multiplier = 0.85;
      description = 'Vías despejadas en horario nocturno';
    }

    const estimatedSecs = Math.round(baseSeconds * multiplier);
    return {
      durationStr: formatDuration(estimatedSecs),
      description,
      isRush: isMorningRush || isEveningRush,
    };
  };

  const departureForecast = calculateEstimatedDurationForTime(departureTime, activeRoute.duration);

  return (
    <>
      <div
        className="nav-card fixed bottom-0 inset-x-0 z-40 max-w-lg mx-auto pointer-events-auto select-none"
        style={{
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 8px)',
          order: 2,
        }}
      >
        {inspectorCount > 0 && (
          <div className="mx-3 mb-2 rounded-2xl bg-gradient-to-r from-red-600/95 via-orange-600/95 to-rose-600/95 border-2 border-amber-300/80 shadow-[0_8px_28px_rgba(220,38,38,0.55)] backdrop-blur-xl px-3.5 py-2.5 flex items-center gap-2.5 text-white animate-in fade-in slide-in-from-bottom-2 duration-200">
            <div className="w-8 h-8 rounded-xl bg-black/25 border border-white/30 flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-4.5 h-4.5 text-amber-200" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs sm:text-sm font-black leading-tight">
                {inspectorCount === 1
                  ? '¡Atención! 1 inspector reportado en esta ruta'
                  : `¡Atención! ${inspectorCount} inspectores reportados en esta ruta`}
              </p>
              <p className="text-[11px] text-amber-100/90 font-semibold leading-tight mt-0.5">
                Conduce con precaución durante el recorrido
              </p>
            </div>
          </div>
        )}

        <div className="rounded-t-[28px] bg-slate-900/98 border-t border-x border-sky-500/35 shadow-[0_-16px_45px_rgba(0,0,0,0.85)] backdrop-blur-2xl text-white px-5 pt-2.5 pb-3 transition-all">
          {/* Rayita de arrastre arriba: Diminuta y centrada */}
          <div className="w-7 h-[3px] bg-sky-300/80 rounded-full mx-auto mb-3" />

          {/* Fila superior: Tiempo grande + check verde si está despejada, distancia a la derecha */}
          <div className="flex items-baseline justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-3xl sm:text-4xl font-black text-white font-mono tracking-tight leading-none">
                {formatDuration(activeRoute.duration)}
              </span>
              {isFastest && (
                <span className="text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-sky-500/20 text-sky-400 border border-sky-400/30">
                  Mejor
                </span>
              )}
            </div>

            <span className="text-xl sm:text-2xl font-bold text-slate-300 font-mono tracking-tight leading-none">
              {formatDistance(activeRoute.distance)}
            </span>
          </div>

          {/* Debajo: Nombre de la vía principal y estado del tráfico */}
          <div className="mt-2 min-w-0">
            <h4 className="text-sm sm:text-base font-bold text-slate-100 truncate leading-snug">
              Por {mainRoad}
            </h4>

            <div className="flex items-center gap-1.5 mt-0.5">
              <span
                className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  isFastest ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]' : 'bg-sky-400'
                }`}
              />
              <span className="text-xs text-slate-300 font-medium truncate">
                {routeStatusText}
              </span>
            </div>
          </div>

          {/* Línea pequeña de texto rojo con el conteo de inspectores/peligros cuando la ruta tiene alertas */}
          {hasRouteAlerts && preRouteSummary?.panelSummaryText && (
            <p className="mt-2 text-xs font-bold text-red-400 flex items-center gap-1.5 leading-snug">
              <AlertTriangle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
              <span className="truncate">{preRouteSummary.panelSummaryText}</span>
            </p>
          )}

          {/* Selector de modo: En auto / A pie */}
          {onTravelModeChange && (
            <div className="grid grid-cols-2 gap-2 mt-3" role="group" aria-label="Modo de viaje">
              {([
                { mode: 'driving' as TravelMode, label: 'En auto', Icon: Car },
                { mode: 'walking' as TravelMode, label: 'A pie', Icon: Footprints },
              ]).map(({ mode, label, Icon }) => {
                const active = travelMode === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    disabled={isLoading}
                    aria-pressed={active}
                    onClick={() => {
                      if (!active) onTravelModeChange(mode);
                    }}
                    className={`flex items-center justify-center gap-1.5 rounded-xl py-1.5 text-xs font-bold border transition active:scale-95 disabled:opacity-60 ${
                      active
                        ? 'bg-sky-500/25 text-sky-200 border-sky-400/70'
                        : 'bg-slate-800/80 text-slate-300 border-slate-700/80 hover:bg-slate-800'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Dos botones abajo: "Salir más tarde" e "Ir ahora" */}
          <div className="grid grid-cols-2 gap-3 mt-3.5">
            {/* Botón "Salir más tarde": oscuro, texto celeste */}
            <button
              type="button"
              onClick={() => setIsDepartLaterOpen(true)}
              disabled={isLoading}
              className="py-3.5 px-3 rounded-2xl bg-slate-800/95 hover:bg-slate-750 active:scale-95 text-sky-400 border border-sky-400/30 font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-all shadow-md cursor-pointer"
            >
              <Clock className="w-4 h-4 text-sky-400 stroke-[2.2]" />
              <span>Salir más tarde</span>
            </button>

            {/* Botón "Ir ahora": azul brillante, texto oscuro, más destacado */}
            <button
              type="button"
              onClick={onStartNavigation}
              disabled={isLoading}
              className={`py-3.5 px-4 rounded-2xl bg-gradient-to-r from-sky-400 to-blue-500 hover:from-sky-300 hover:to-blue-400 active:scale-95 text-slate-950 font-black text-sm sm:text-base flex items-center justify-center gap-2 transition-all cursor-pointer ${
                hasRouteAlerts
                  ? 'animate-route-hazard-btn border border-red-400'
                  : 'shadow-[0_0_24px_rgba(56,189,248,0.55)] border border-sky-200'
              }`}
            >
              <Play className="w-4 h-4 sm:w-5 sm:h-5 fill-slate-950 stroke-none" />
              <span>Ir ahora</span>
            </button>
          </div>
        </div>
      </div>

      {/* Modal / Selector "Salir más tarde" */}
      {isDepartLaterOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-3 animate-in fade-in duration-200"
          onPointerDown={(e) => {
            departBackdropDownRef.current = e.target === e.currentTarget;
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget && departBackdropDownRef.current) {
              setIsDepartLaterOpen(false);
            }
            departBackdropDownRef.current = false;
          }}
        >
          <div
            ref={departPanelRef}
            className="w-full max-w-sm rounded-3xl bg-slate-900 border border-sky-500/40 p-5 shadow-2xl text-white"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-sky-400" />
                <h3 className="text-sm font-black uppercase tracking-wider text-sky-400 font-mono">
                  Planificar Salida
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsDepartLaterOpen(false)}
                className="p-1 rounded-full text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="py-4 space-y-4">
              <div>
                <label className="text-xs text-slate-300 font-semibold block mb-1.5">
                  Selecciona la hora de partida:
                </label>
                <input
                  type="time"
                  value={departureTime}
                  onChange={(e) => setDepartureTime(e.target.value)}
                  className="w-full bg-slate-950 border border-sky-400/40 rounded-xl px-4 py-2.5 text-xl font-mono text-center font-bold text-white outline-none focus:ring-2 focus:ring-sky-400"
                />
              </div>

              {/* Pronóstico de tráfico según la hora */}
              <div className="p-3 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Tiempo estimado de viaje:</span>
                  <span className="text-base font-black text-sky-400 font-mono">
                    {departureForecast.durationStr}
                  </span>
                </div>
                <p className="text-[11px] text-slate-300 leading-tight">
                  {departureForecast.description}
                </p>
                {departureForecast.isRush && (
                  <span className="inline-block mt-1 text-[10px] font-bold text-amber-400">
                    ⚠️ Sugerencia: Salir 20 min antes para evitar hora punta.
                  </span>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsDepartLaterOpen(false)}
              className="w-full py-3 rounded-xl bg-sky-500 hover:bg-sky-400 active:scale-95 text-slate-950 font-black text-sm transition flex items-center justify-center gap-1.5 shadow-lg shadow-sky-500/25"
            >
              <Check className="w-4 h-4 stroke-[3]" />
              <span>Aceptar</span>
            </button>
          </div>
        </div>
      )}
    </>
  );
};
