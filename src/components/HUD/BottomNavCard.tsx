import React, { useState, useEffect, useRef } from 'react';
import {
  Coordinates,
  RouteData,
  RouteStep,
  TrafficAlertType,
  TravelMode,
} from '../../types/navigation';
import {
  formatDistance,
  formatDuration,
  calculateETA,
  formatWalkingSteps,
} from '../../services/osrm';
import { analyzeLimaSpeed } from '../../services/speedLimits';
import { voiceGuidance } from '../../services/tts';
import { SpeedLimitSource } from '../../services/speedLimitResolver';
import {
  notifySmallOverlayClose,
  notifySmallOverlayOpen,
} from '../../services/overlayCoordinator';
import {
  X,
  RotateCw,
  AlertTriangle,
  Car,
  Volume2,
  Footprints,
  Navigation,
  Maximize2,
  Share2,
} from 'lucide-react';

interface BottomNavCardProps {
  route: RouteData;
  remainingDistance: number;
  remainingDuration: number;
  currentStep?: RouteStep | null;
  distanceToStep?: number;
  nextStep?: RouteStep | null;
  speedKmh: number;
  speedLimit?: number | null;
  speedLimitSource?: SpeedLimitSource | null;
  resolvedRoadName?: string;
  resolvedRoadCategoryLabel?: string;
  onCorrectSpeedLimit?: (limitKmh: number) => void;
  currentRoadName?: string;
  userCoords: Coordinates;
  onCancelNavigation: () => void;
  onRecalculate: () => void;
  onRepeatVoice?: () => void;
  onReportIncident?: (type: TrafficAlertType, title: string, description: string) => void;
  isSimulating: boolean;
  onToggleSimulation: () => void;
  travelMode?: TravelMode;
  modoSeguimiento?: 'siguiendo' | 'explorando';
  isFollowing?: boolean;
  onRecenter?: () => void;
  onOverviewRoute?: () => void;
}

export const BottomNavCard: React.FC<BottomNavCardProps> = ({
  route,
  remainingDistance,
  remainingDuration,
  speedKmh,
  speedLimit = null,
  speedLimitSource = null,
  resolvedRoadName,
  resolvedRoadCategoryLabel,
  onCorrectSpeedLimit,
  currentRoadName,
  userCoords,
  onCancelNavigation,
  onRecalculate,
  onRepeatVoice,
  isSimulating,
  onToggleSimulation,
  travelMode = 'driving',
  modoSeguimiento,
  isFollowing = true,
  onRecenter,
  onOverviewRoute,
}) => {
  const isNormalMode = modoSeguimiento ? modoSeguimiento === 'siguiendo' : isFollowing;
  const isWalking = travelMode === 'walking';
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [isWarningDismissed, setIsWarningDismissed] = useState<boolean>(false);
  const [isLimitPickerOpen, setIsLimitPickerOpen] = useState<boolean>(false);
  const lastDismissedSpeedRef = useRef<number>(0);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressStartRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (isLimitPickerOpen && !isWalking && onCorrectSpeedLimit) {
      notifySmallOverlayOpen('limit_picker', () => setIsLimitPickerOpen(false));
    } else {
      notifySmallOverlayClose('limit_picker');
    }
    return () => {
      notifySmallOverlayClose('limit_picker');
    };
  }, [isLimitPickerOpen, isWalking, onCorrectSpeedLimit]);

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    pressStartRef.current = null;
  };

  const handleSpeedCirclePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isWalking || !onCorrectSpeedLimit) return;
    clearLongPressTimer();
    pressStartRef.current = { x: e.clientX, y: e.clientY };
    longPressTimerRef.current = setTimeout(() => {
      longPressTimerRef.current = null;
      pressStartRef.current = null;
      setIsLimitPickerOpen(true);
    }, 480);
  };

  const handleSpeedCirclePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pressStartRef.current) return;
    const moved = Math.hypot(
      e.clientX - pressStartRef.current.x,
      e.clientY - pressStartRef.current.y
    );
    if (moved > 10) {
      clearLongPressTimer();
    }
  };

  // Compartir el viaje por WhatsApp: destino, hora estimada de llegada y ubicación actual
  const handleShareTrip = () => {
    const arrival = new Date(Date.now() + Math.max(0, remainingDuration) * 1000);
    const arrivalText = arrival.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
    const destination = route?.destinationName ? ` a ${route.destinationName}` : '';
    const mapsLink = `https://www.google.com/maps?q=${userCoords.lat.toFixed(6)},${userCoords.lng.toFixed(6)}`;
    const message =
      `Voy en camino${destination} con RUTA LIMA.\n` +
      `Llegada estimada: ${arrivalText} (${Math.max(1, Math.round(remainingDuration / 60))} min).\n` +
      `Mi ubicación ahora: ${mapsLink}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
  };

  // Speed Limit evaluation in Metropolitan Lima according to MTC D.S. 025-2021
  const speedAnalysis = analyzeLimaSpeed(
    speedKmh,
    currentRoadName,
    userCoords,
    speedLimit,
    {
      roadName: resolvedRoadName || currentRoadName,
      categoryLabel: resolvedRoadCategoryLabel,
      requireExplicitLimit: true,
    }
  );
  const effectiveLimit = speedAnalysis.limitKmh;
  const isOverSpeed = !isWalking && speedAnalysis.isOverLimit;
  const isSignificantlyOverSpeed = !isWalking && speedAnalysis.isSignificant;

  // Aviso sonoro al superar el límite: suena al pasarte y se repite cada 15 s mientras sigas excediéndolo
  const lastSpeedBeepAtRef = useRef<number>(0);
  useEffect(() => {
    if (!isOverSpeed) {
      lastSpeedBeepAtRef.current = 0;
      return;
    }
    const nowMs = Date.now();
    if (nowMs - lastSpeedBeepAtRef.current >= 15000) {
      lastSpeedBeepAtRef.current = nowMs;
      voiceGuidance.playSpeedWarningBeep();
    }
  }, [isOverSpeed, speedKmh]);

  useEffect(() => {
    if (!isSignificantlyOverSpeed) {
      if (isWarningDismissed) {
        setIsWarningDismissed(false);
      }
      lastDismissedSpeedRef.current = 0;
    } else if (isWarningDismissed && speedKmh > lastDismissedSpeedRef.current + 8) {
      setIsWarningDismissed(false);
    }
  }, [isSignificantlyOverSpeed, speedKmh, isWarningDismissed]);

  const handleDismissWarning = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsWarningDismissed(true);
    lastDismissedSpeedRef.current = speedKmh;
  };

  return (
    <div
      className="nav-card absolute bottom-0 inset-x-0 z-40 max-w-lg mx-auto pointer-events-auto"
      style={{
        order: 2,
      }}
    >
      {/* 4. Aviso de velocidad: círculo en una esquina del mapa (inferior izquierda) */}
      <div
        className="fixed left-3.5 z-40 pointer-events-auto select-none transition-all duration-300 flex flex-col items-center"
        style={{
          bottom: isNormalMode
            ? 'calc(env(safe-area-inset-bottom, 0px) + 98px)'
            : 'calc(env(safe-area-inset-bottom, 0px) + 78px)',
        }}
      >
        {/* Ventanita pequeña para corregir el límite del tramo al mantener presionado */}
        {isLimitPickerOpen && !isWalking && onCorrectSpeedLimit && (
          <div
            data-small-overlay="limit_picker"
            className="absolute bottom-full left-0 mb-2 w-52 rounded-2xl bg-slate-900/98 border border-sky-400/60 shadow-2xl backdrop-blur-xl p-2.5 text-white animate-in fade-in zoom-in-95 duration-150 z-50"
          >
            <div className="flex items-center justify-between gap-2 pb-1.5 mb-2 border-b border-slate-800">
              <span className="text-[11px] font-bold text-sky-300 leading-tight">
                Corregir límite (km/h)
              </span>
              <button
                type="button"
                onClick={() => setIsLimitPickerOpen(false)}
                className="p-0.5 rounded-md text-slate-400 hover:text-white cursor-pointer"
                aria-label="Cerrar selector de límite"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {[30, 40, 50, 60, 80, 100].map((val) => {
                const isSelected = effectiveLimit === val;
                return (
                  <button
                    key={val}
                    type="button"
                    onClick={() => {
                      onCorrectSpeedLimit(val);
                      setIsLimitPickerOpen(false);
                    }}
                    className={`py-1.5 rounded-xl font-mono text-xs font-black transition active:scale-95 cursor-pointer border ${
                      isSelected
                        ? 'bg-sky-500 text-slate-950 border-sky-300'
                        : 'bg-slate-800 hover:bg-slate-700 text-white border-slate-700'
                    }`}
                  >
                    {val}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div
          data-small-overlay-trigger="limit_picker"
          onPointerDown={handleSpeedCirclePointerDown}
          onPointerMove={handleSpeedCirclePointerMove}
          onPointerUp={clearLongPressTimer}
          onPointerCancel={clearLongPressTimer}
          onPointerLeave={clearLongPressTimer}
          onContextMenu={(e) => {
            if (!isWalking && onCorrectSpeedLimit) {
              e.preventDefault();
            }
          }}
          className={`flex flex-col items-center justify-center w-[68px] h-[68px] sm:w-[78px] sm:h-[78px] rounded-full border-2 transition-colors duration-300 select-none shadow-xl backdrop-blur-md ${
            isOverSpeed
              ? 'bg-rose-600 border-rose-400 text-white shadow-rose-600/50 animate-pulse'
              : 'bg-slate-900/95 border-emerald-500 text-white shadow-emerald-500/20'
          }`}
          title={
            effectiveLimit
              ? isOverSpeed
                ? `¡Exceso de velocidad! ${Math.round(speedKmh)} km/h (Límite legal: ${effectiveLimit} km/h)`
                : `Velocidad actual: ${Math.round(speedKmh)} km/h (Límite legal: ${effectiveLimit} km/h). Mantén presionado para corregir.`
              : `Velocidad actual: ${Math.round(speedKmh)} km/h. Mantén presionado para indicar límite.`
          }
        >
          {/* Velocidad actual en número grande */}
          <span className="text-[22px] sm:text-[25px] font-black font-mono leading-none tracking-tight">
            {isWalking ? Math.round(speedKmh) || 4 : Math.round(speedKmh)}
          </span>
          {/* Límite debajo o km/h */}
          <span
            className={`text-[11px] sm:text-[12px] font-extrabold tracking-tight uppercase leading-none mt-1 ${
              isOverSpeed ? 'text-white' : 'text-emerald-400'
            }`}
          >
            {isWalking ? 'A PIE' : effectiveLimit ? `MÁX ${effectiveLimit}` : 'km/h'}
          </span>
        </div>

        {/* Etiqueta muy pequeña con la fuente del dato bajo el número */}
        {!isWalking && effectiveLimit !== null && speedLimitSource && (
          <span className="mt-1 px-1.5 py-0.5 rounded bg-slate-950/85 border border-slate-700/70 text-[8.5px] sm:text-[9px] font-semibold text-slate-300 leading-none text-center max-w-[116px] truncate shadow">
            {speedLimitSource}
          </span>
        )}
      </div>

      {/* 1. Panel completo: desciende y desaparece con animación suave al mover el mapa */}
      <div
        className={`transition-all duration-300 ease-out ${
          isNormalMode
            ? 'translate-y-0 opacity-100 pointer-events-auto'
            : 'translate-y-full opacity-0 pointer-events-none absolute bottom-0 inset-x-0'
        }`}
      >
        {/* Visual Warning Overlay for Significantly Excessive Speed in Lima */}
        {isSignificantlyOverSpeed && !isWarningDismissed && (
          <div className="mx-3 mb-2 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-rose-950/98 via-rose-900/98 to-amber-950/98 border-2 border-rose-500 shadow-[0_0_30px_rgba(244,63,94,0.6)] p-3.5 backdrop-blur-xl text-white">
              <div className="relative z-10 flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  {/* Peruvian Circular Regulatory Speed Limit Sign Replica */}
                  <div className="flex-shrink-0 flex flex-col items-center justify-center w-12 h-12 rounded-full border-[3.5px] border-rose-600 bg-white text-slate-950 font-black shadow-lg">
                    <span className="text-base font-black font-mono leading-none">{effectiveLimit}</span>
                    <span className="text-[7.5px] font-extrabold tracking-tight leading-none text-slate-700">MÁX</span>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-600 text-white text-[10px] font-black uppercase tracking-wider animate-pulse">
                        <AlertTriangle className="w-3 h-3" /> ¡Exceso de Velocidad!
                      </span>
                      <span className="text-[10px] font-black text-rose-200 bg-rose-950/90 px-2 py-0.5 rounded-md border border-rose-700 font-mono">
                        +{speedAnalysis.excessKmh} km/h
                      </span>
                    </div>

                    <h5 className="text-xs sm:text-sm font-black text-white mt-1 leading-tight truncate">
                      {speedAnalysis.info.categoryLabel}: {speedAnalysis.info.roadName}
                    </h5>

                    <p className="text-[11px] text-rose-200/90 mt-0.5 leading-snug">
                      Velocidad: <strong className="text-white font-mono">{Math.round(speedKmh)} km/h</strong> (Límite legal: <span className="font-mono">{effectiveLimit} km/h</span>). Reduce la marcha.
                    </p>
                  </div>
                </div>

                {/* Dismiss button */}
                <button
                  onClick={handleDismissWarning}
                  className="p-1.5 rounded-full bg-rose-900/60 hover:bg-rose-800 text-rose-300 hover:text-white transition active:scale-95 flex-shrink-0 cursor-pointer"
                  title="Descartar aviso temporalmente"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Regulatory context stripe */}
              <div className="relative z-10 mt-2 pt-1.5 border-t border-rose-500/30 flex items-center justify-between text-[10px] text-rose-300/80">
                <span className="truncate">{speedAnalysis.info.legalNorm}</span>
                <span className="font-bold text-rose-200 flex-shrink-0 ml-2">Normativa MTC Lima</span>
              </div>
            </div>
          </div>
        )}

        {/* Modern Compact Trip Summary Panel */}
        <div
          className={`relative rounded-t-[26px] bg-slate-900/98 border-t border-x ${
            isSignificantlyOverSpeed
              ? 'border-t-rose-500 border-x-rose-500/70 shadow-[0_-10px_30px_rgba(244,63,94,0.4)]'
              : 'border-slate-700/80 shadow-[0_-12px_36px_rgba(0,0,0,0.7)]'
          } backdrop-blur-2xl text-white transition-all duration-300 select-none`}
          style={{
            paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 8px)',
          }}
        >
          {/* Rayita de despliegue: 28px de ancho, 3px de alto, color celeste claro, redondeada, centrada y a 4px del límite superior, con área táctil de 44px de alto */}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="absolute left-1/2 -translate-x-1/2 top-0 h-[44px] w-20 p-0 flex items-start justify-center bg-transparent border-0 outline-none cursor-pointer z-30 group"
            title={isExpanded ? 'Contraer opciones' : 'Desplegar opciones'}
            aria-label={isExpanded ? 'Contraer opciones' : 'Desplegar opciones'}
          >
            <div
              className={`w-[28px] h-[3px] bg-sky-300 rounded-full mt-[4px] shadow-sm shadow-sky-400/30 transition-all duration-200 group-hover:bg-sky-200 group-active:scale-95 ${
                isExpanded ? 'opacity-80' : 'opacity-100'
              }`}
            />
          </button>

          {/* Main Row:
              [Izquierda: LLEGADA (fuente más grande) + línea recta de tiempo restante y distancia con mayor separación]
              [Derecha: Botón Finalizar solo a la derecha, sin nada a su lado]
          */}
          <div className="px-3.5 pt-3.5 pb-3 sm:px-4 sm:py-3.5 flex items-center justify-between gap-2.5">
            {/* Bloque Izquierdo: Hora estimada de llegada (fuente más grande) y recta de tiempo/distancia con más separación */}
            <div className="flex flex-col justify-center min-w-0 flex-1 pr-1.5">
              <div className="flex items-baseline gap-2 leading-none">
                <span className="text-[10px] sm:text-[11px] font-black uppercase text-slate-400 tracking-wider flex-shrink-0">
                  LLEGADA
                </span>
                {/* Hora de llegada completa, sin puntos suspensivos ni saltos de línea */}
                <span className="text-[28px] xs:text-[32px] sm:text-[40px] font-black text-emerald-400 font-mono tracking-tight leading-none whitespace-nowrap flex-shrink-0">
                  {calculateETA(remainingDuration)}
                </span>
              </div>

              {/* Tiempo restante y distancia en una sola línea recta (~40% del tamaño de la hora de llegada) */}
              <div className="flex items-center gap-2 sm:gap-3.5 mt-2 leading-none whitespace-nowrap">
                <span className="text-[15px] sm:text-[18px] font-black text-white font-mono tracking-tight flex-shrink-0">
                  {formatDuration(remainingDuration)}
                </span>
                <span className="text-slate-400 font-bold text-[15px] sm:text-[18px] leading-none flex-shrink-0 select-none">·</span>
                <span className="text-[15px] sm:text-[18px] font-extrabold text-sky-300 font-mono tracking-tight flex-shrink-0">
                  {formatDistance(remainingDistance)}
                </span>
              </div>
            </div>

            {/* Bloque Derecho: Botón Finalizar solo a la derecha, sin nada a su lado */}
            <div className="flex items-center justify-end flex-shrink-0 z-10 pl-1">
              <button
                onClick={onCancelNavigation}
                className="flex items-center justify-center gap-1.5 sm:gap-2 py-2.5 px-3 sm:py-3 sm:px-4.5 rounded-2xl bg-rose-600 hover:bg-rose-500 active:scale-95 text-white font-black text-xs sm:text-sm shadow-lg shadow-rose-900/40 transition-all border border-rose-400/40 cursor-pointer whitespace-nowrap"
                title="Finalizar navegación"
                aria-label="Finalizar navegación"
              >
                <X className="w-4 h-4 sm:w-4.5 sm:h-4.5 stroke-[2.5]" />
                <span className="font-sans font-bold">Finalizar</span>
              </button>
            </div>
          </div>

          {/* Expanded Drawer: Extra Tools (Voice Repeat, Recalculate, Simulation, Pedestrian Steps) */}
          {isExpanded && (
            <div className="px-4 pb-3.5 pt-2 border-t border-slate-800/80 animate-in fade-in slide-in-from-bottom-2 duration-200">
              <div className="flex items-center gap-2 pt-1 pb-1">
                {onRepeatVoice && (
                  <button
                    onClick={onRepeatVoice}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold active:scale-95 transition cursor-pointer"
                  >
                    <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Repetir voz</span>
                  </button>
                )}

                <button
                  onClick={onRecalculate}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold active:scale-95 transition cursor-pointer"
                >
                  <RotateCw className="w-3.5 h-3.5 text-sky-400" />
                  <span>Recalcular</span>
                </button>

                <button
                  onClick={handleShareTrip}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold active:scale-95 transition cursor-pointer"
                  aria-label="Compartir viaje por WhatsApp"
                >
                  <Share2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Compartir</span>
                </button>

                <button
                  onClick={onToggleSimulation}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border text-xs font-bold active:scale-95 transition cursor-pointer ${
                    isSimulating
                      ? 'bg-purple-600/30 border-purple-500 text-purple-300'
                      : 'bg-slate-800 border-slate-700 text-slate-300'
                  }`}
                >
                  {isWalking ? <Footprints className="w-3.5 h-3.5 text-emerald-400" /> : <Car className="w-3.5 h-3.5" />}
                  <span>{isSimulating ? 'Detener' : 'Simular'}</span>
                </button>
              </div>

              {isWalking && (
                <div className="flex items-center justify-between pt-2 border-t border-slate-800/60 text-xs text-slate-300">
                  <span className="flex items-center gap-1 text-slate-400">
                    <Footprints className="w-3 h-3 text-emerald-400" /> Pasos restantes:
                  </span>
                  <span className="font-mono font-bold text-emerald-400">
                    {formatWalkingSteps(remainingDistance)}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 2. Barra compacta en modo "explorando" con dos opciones: Vista general y Volver a centrar (Reglas 13 y 14) */}
      {!isNormalMode && (
        <div
          id="nav-compact-bar"
          className="px-3 pt-1 animate-in fade-in slide-in-from-bottom-2 duration-200 pointer-events-auto"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 8px)' }}
        >
          <div className="flex items-center gap-2 max-w-sm mx-auto p-2 rounded-2xl bg-slate-900/98 border border-slate-700/80 shadow-[0_8px_32px_rgba(0,0,0,0.65)] backdrop-blur-xl">
            {/* Opción 1: Vista general (ajusta el zoom para ver la ruta entera sin perder la flecha) */}
            {onOverviewRoute && (
              <button
                type="button"
                onClick={onOverviewRoute}
                className="flex-1 flex items-center justify-center gap-2 py-3 px-3.5 rounded-xl bg-slate-800/95 hover:bg-slate-700 text-slate-200 border border-slate-700/80 shadow-md active:scale-95 transition-all cursor-pointer font-bold text-xs sm:text-sm whitespace-nowrap"
                title="Ajustar zoom para ver la ruta completa hasta el destino"
                aria-label="Vista general"
              >
                <Maximize2 className="w-4 h-4 text-sky-400 stroke-[2.2]" />
                <span>Vista general</span>
              </button>
            )}

            {/* Opción 2: Volver a centrar (centra en la flecha, recupera zoom de navegación y rotación) */}
            {onRecenter && (
              <button
                type="button"
                onClick={onRecenter}
                className="flex-1 flex items-center justify-center gap-2 py-3 px-3.5 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-slate-950 font-black text-xs sm:text-sm shadow-lg shadow-sky-500/35 border border-sky-300/60 active:scale-95 transition-all cursor-pointer whitespace-nowrap"
                title="Volver a centrar en la flecha y recuperar orientación"
                aria-label="Volver a centrar"
              >
                <Navigation className="w-4 h-4 fill-slate-950 text-slate-950 stroke-[2.5]" />
                <span>Volver a centrar</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
