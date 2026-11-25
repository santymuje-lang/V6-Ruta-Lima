import React, { useEffect, useRef, useState } from 'react';
import { RouteStep, TravelMode, MapTileMode } from '../../types/navigation';
import { formatDistance } from '../../services/osrm';
import { logSystemNotice } from '../../services/systemNotices';
import {
  Volume2,
  VolumeX,
  RotateCw,
  RefreshCw,
  WifiOff,
  Footprints,
  ChevronDown,
  Navigation,
  Sun,
  Moon,
  X,
} from 'lucide-react';

interface TurnByTurnBannerProps {
  currentStep: RouteStep;
  distanceToStep: number;
  nextStep?: RouteStep;
  isRerouting: boolean;
  isMuted: boolean;
  onToggleMute: () => void;
  onRepeatVoice?: () => void;
  onOpenSearch?: () => void;
  isSearchOpen?: boolean;
  speedKmh: number;
  isGpsSignalLost?: boolean;
  travelMode?: TravelMode;
  mapTileMode?: MapTileMode;
  onTileModeChange?: (mode: MapTileMode) => void;
  themePreference?: 'day' | 'night' | 'manual_satellite';
  onCycleThemePreference?: () => void;
}

function abbreviateRoadNameForBanner(rawName: string): string {
  const trimmed = rawName.trim();
  if (!trimmed) return rawName;

  let formatted = trimmed;

  // 1. Abreviar tipos de vía solo al inicio del nombre (sin duplicar abreviaciones existentes)
  const leadingRoadTypePatterns: Array<[RegExp, string]> = [
    [/^v[ií]a\s+expresa(?![\p{L}\p{N}.])/iu, 'V. Exp.'],
    [/^prolongaci[oó]n(?![\p{L}\p{N}.])/iu, 'Prol.'],
    [/^avenida(?![\p{L}\p{N}.])/iu, 'Av.'],
    [/^jir[oó]n(?![\p{L}\p{N}.])/iu, 'Jr.'],
    [/^calle(?![\p{L}\p{N}.])/iu, 'Cl.'],
    [/^pasaje(?![\p{L}\p{N}.])/iu, 'Psje.'],
    [/^carretera(?![\p{L}\p{N}.])/iu, 'Carr.'],
    [/^autopista(?![\p{L}\p{N}.])/iu, 'Autop.'],
    [/^malec[oó]n(?![\p{L}\p{N}.])/iu, 'Mal.'],
    [/^alameda(?![\p{L}\p{N}.])/iu, 'Alam.'],
    [/^paseo(?![\p{L}\p{N}.])/iu, 'Ps.'],
    [/^circuito(?![\p{L}\p{N}.])/iu, 'Circ.'],
  ];

  for (const [pattern, abbr] of leadingRoadTypePatterns) {
    if (pattern.test(formatted)) {
      formatted = formatted.replace(pattern, abbr);
      break;
    }
  }

  // 2. Abreviar títulos y nombres largos dentro del nombre de la vía (sin duplicar puntos)
  const titleReplacements: Record<string, string> = {
    general: 'Gral.',
    coronel: 'Cnel.',
    doctor: 'Dr.',
    ingeniero: 'Ing.',
    san: 'S.',
    santa: 'Sta.',
    mariscal: 'Mcal.',
  };

  formatted = formatted.replace(
    /(?<![\p{L}\p{N}.])(General|Coronel|Doctor|Ingeniero|Santa|San|Mariscal)(?![\p{L}\p{N}.])/giu,
    (match) => titleReplacements[match.toLowerCase()] || match
  );

  return formatted;
}

type CoherentIconKind =
  | 'arrive'
  | 'sharp-right'
  | 'right'
  | 'slight-right'
  | 'sharp-left'
  | 'left'
  | 'slight-left'
  | 'uturn'
  | 'roundabout'
  | 'straight';

/**
 * Fuente única de verdad para el ícono de flecha y el texto del panel superior de giros:
 * garantiza coherencia total entre la flecha dibujada, el texto y la distancia de la maniobra.
 */
function resolveCoherentManeuver(
  step: RouteStep,
  isWalking: boolean
): { iconKind: CoherentIconKind; instructionText: string; abbreviatedRoad: string } {
  const abbreviatedRoad = step.name ? abbreviateRoadNameForBanner(step.name) : '';
  const { type, modifier } = step;

  if (type === 'arrive') {
    return {
      iconKind: 'arrive',
      instructionText: isWalking ? 'Has llegado a tu destino a pie' : 'Has llegado a tu destino',
      abbreviatedRoad,
    };
  }

  if (type === 'roundabout') {
    return {
      iconKind: 'roundabout',
      instructionText: abbreviatedRoad
        ? `En la rotonda, toma la salida hacia ${abbreviatedRoad}`
        : 'En la rotonda, toma la salida',
      abbreviatedRoad,
    };
  }

  if (modifier === 'uturn') {
    return {
      iconKind: 'uturn',
      instructionText: abbreviatedRoad
        ? `Da la vuelta en U en ${abbreviatedRoad}`
        : 'Da la vuelta en U',
      abbreviatedRoad,
    };
  }

  if (modifier === 'sharp-right' || modifier === 'right' || modifier === 'slight-right') {
    return {
      iconKind: modifier,
      instructionText: abbreviatedRoad
        ? `Gira a la derecha en ${abbreviatedRoad}`
        : 'Gira a la derecha',
      abbreviatedRoad,
    };
  }

  if (modifier === 'sharp-left' || modifier === 'left' || modifier === 'slight-left') {
    return {
      iconKind: modifier,
      instructionText: abbreviatedRoad
        ? `Gira a la izquierda en ${abbreviatedRoad}`
        : 'Gira a la izquierda',
      abbreviatedRoad,
    };
  }

  // Flecha recta: seguir recto por la vía indicada
  return {
    iconKind: 'straight',
    instructionText: abbreviatedRoad ? `Sigue por ${abbreviatedRoad}` : 'Sigue recto',
    abbreviatedRoad,
  };
}

export const TurnByTurnBanner: React.FC<TurnByTurnBannerProps> = ({
  currentStep,
  distanceToStep,
  isRerouting,
  isMuted,
  onToggleMute,
  onRepeatVoice,
  onOpenSearch,
  isSearchOpen = false,
  isGpsSignalLost = false,
  travelMode = 'driving',
  mapTileMode = 'day',
  onTileModeChange,
  onCycleThemePreference,
}) => {
  const isWalking = travelMode === 'walking';

  const [showGpsNotice, setShowGpsNotice] = useState<boolean>(isGpsSignalLost);
  const gpsNoticeShownAtRef = useRef<number>(0);
  const gpsNoticeMinTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevGpsLostPropRef = useRef<boolean>(false);

  useEffect(() => {
    if (isGpsSignalLost && !prevGpsLostPropRef.current) {
      if (gpsNoticeMinTimerRef.current) {
        clearTimeout(gpsNoticeMinTimerRef.current);
        gpsNoticeMinTimerRef.current = null;
      }
      gpsNoticeShownAtRef.current = Date.now();
      setShowGpsNotice(true);
      logSystemNotice(
        'Buscando señal GPS...',
        'Pérdida temporal de señal GPS (TurnByTurnBanner)'
      );
    } else if (!isGpsSignalLost && prevGpsLostPropRef.current) {
      const elapsed = Date.now() - gpsNoticeShownAtRef.current;
      const remaining = Math.max(0, 3000 - elapsed);
      if (remaining === 0) {
        setShowGpsNotice(false);
      } else {
        if (gpsNoticeMinTimerRef.current) clearTimeout(gpsNoticeMinTimerRef.current);
        gpsNoticeMinTimerRef.current = setTimeout(() => {
          gpsNoticeMinTimerRef.current = null;
          setShowGpsNotice(false);
        }, remaining);
      }
    }
    prevGpsLostPropRef.current = isGpsSignalLost;
  }, [isGpsSignalLost]);

  useEffect(() => {
    return () => {
      if (gpsNoticeMinTimerRef.current) {
        clearTimeout(gpsNoticeMinTimerRef.current);
        gpsNoticeMinTimerRef.current = null;
      }
    };
  }, []);

  // Render unboxed Waze-style white maneuver arrow (52px, thick stroke, rounded caps/joins)
  const renderManeuverIcon = (iconKind: CoherentIconKind) => {
    const svgProps = {
      viewBox: '0 0 48 48',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 4.6,
      strokeLinecap: 'round' as const,
      strokeLinejoin: 'round' as const,
      className: 'w-[52px] h-[52px] text-white flex-shrink-0',
      'aria-hidden': true,
    };

    if (iconKind === 'arrive') {
      return (
        <svg {...svgProps}>
          <path d="M13 40 V9" />
          <path d="M13 10 H35 L30 17.5 L35 25 H13" fill="currentColor" fillOpacity="0.22" />
        </svg>
      );
    }

    if (iconKind === 'sharp-right') {
      return (
        <svg {...svgProps}>
          <path d="M14 40 V22 Q14 14 21 17 L35 26" />
          <path d="M32 15 L37 27 L24 27" />
        </svg>
      );
    }

    if (iconKind === 'right') {
      return (
        <svg {...svgProps}>
          <path d="M14 40 V22 Q14 15 21 15 H36" />
          <path d="M28 7 L37 15 L28 23" />
        </svg>
      );
    }

    if (iconKind === 'slight-right') {
      return (
        <svg {...svgProps}>
          <path d="M18 40 V27 L34 11" />
          <path d="M23 11 H35 V23" />
        </svg>
      );
    }

    if (iconKind === 'sharp-left') {
      return (
        <svg {...svgProps}>
          <path d="M34 40 V22 Q34 14 27 17 L13 26" />
          <path d="M16 15 L11 27 L24 27" />
        </svg>
      );
    }

    if (iconKind === 'left') {
      return (
        <svg {...svgProps}>
          <path d="M34 40 V22 Q34 15 27 15 H12" />
          <path d="M20 7 L11 15 L20 23" />
        </svg>
      );
    }

    if (iconKind === 'slight-left') {
      return (
        <svg {...svgProps}>
          <path d="M30 40 V27 L14 11" />
          <path d="M25 11 H13 V23" />
        </svg>
      );
    }

    if (iconKind === 'uturn') {
      return (
        <svg {...svgProps}>
          <path d="M32 39 V19 A9 9 0 0 0 14 19 V33" />
          <path d="M7 26 L14 35 L21 26" />
        </svg>
      );
    }

    if (iconKind === 'roundabout') {
      return (
        <svg {...svgProps}>
          <path d="M24 41 V30" />
          <circle cx="24" cy="21" r="9" />
          <path d="M30.5 14.5 L38 7" />
          <path d="M30 7 H38 V15" />
        </svg>
      );
    }

    return (
      <svg {...svgProps}>
        <path d="M24 41 V9" />
        <path d="M13 19 L24 8 L35 19" />
      </svg>
    );
  };

  const getAnticipationBadge = (dist: number, step: RouteStep) => {
    const isTurn =
      step.type === 'turn' ||
      step.type === 'roundabout' ||
      step.modifier === 'left' ||
      step.modifier === 'sharp-left' ||
      step.modifier === 'slight-left' ||
      step.modifier === 'right' ||
      step.modifier === 'sharp-right' ||
      step.modifier === 'slight-right' ||
      step.modifier === 'uturn';

    if (!isTurn) return null;

    if (isWalking) {
      if (dist <= 15) {
        return {
          text: '¡GIRA AHORA!',
          className: 'bg-emerald-500 text-slate-950 animate-pulse',
        };
      }
      if (dist <= 45) {
        return {
          text: 'PREPÁRATE',
          className: 'bg-amber-400 text-slate-950',
        };
      }
      return null;
    }

    if (dist <= 30) {
      return {
        text: '¡GIRA AHORA!',
        className: 'bg-emerald-500 text-slate-950 animate-pulse',
      };
    }
    if (dist <= 90) {
      return {
        text: 'PREPÁRATE',
        className: 'bg-amber-400 text-slate-950',
      };
    }
    return null;
  };

  const anticipation = getAnticipationBadge(distanceToStep, currentStep);
  const isNightActive = mapTileMode === 'night';
  const coherentManeuver = resolveCoherentManeuver(currentStep, isWalking);
  const abbreviatedRoadName = coherentManeuver.abbreviatedRoad;
  const displayInstruction = coherentManeuver.instructionText;

  const handleThemeClick = () => {
    if (onCycleThemePreference) {
      onCycleThemePreference();
    } else if (onTileModeChange) {
      onTileModeChange(isNightActive ? 'day' : 'night');
    }
  };

  return (
    <div id="turn-by-turn-banner" className="nav-card relative w-full pointer-events-none" style={{ order: 1 }}>
      {/* Turn-by-Turn Navigation Banner: ancho completo borde a borde y pegado arriba respetando safe-area */}
      <div
        className="pointer-events-auto relative overflow-hidden w-full rounded-b-2xl rounded-t-none bg-slate-900/95 border-b border-slate-700/80 shadow-[0_8px_30px_rgba(0,0,0,0.6)] backdrop-blur-xl text-white px-3.5 pb-2"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 6px)' }}
      >
        {/* Fila superior: Logotipo RUTA LIMA a la izquierda; Repetir voz, Parlante y Día/Noche alineados a la derecha */}
        <div className="flex items-center justify-between pb-1.5 mb-2 border-b border-slate-800/80 gap-2">
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-5 rounded-md bg-sky-500/20 border border-sky-400/50 flex items-center justify-center shadow-sm">
              <Navigation className="w-3 h-3 text-sky-400" />
            </div>
            <span className="text-[10px] sm:text-[11px] font-black tracking-widest uppercase text-white font-mono leading-none">
              RUTA <span className="text-sky-400">LIMA</span>
            </span>
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            {/* Repeat Voice Button */}
            {onRepeatVoice && !isMuted && (
              <button
                type="button"
                onClick={onRepeatVoice}
                className="p-1.5 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-emerald-400 border border-slate-700/80 active:scale-95 transition cursor-pointer"
                title="Repetir indicación"
                aria-label="Repetir indicación"
              >
                <RotateCw className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Audio Mute/Unmute */}
            <button
              type="button"
              onClick={onToggleMute}
              className={`p-1.5 rounded-xl border transition-all active:scale-95 cursor-pointer ${
                isMuted
                  ? 'bg-rose-500/20 border-rose-500/40 text-rose-300'
                  : 'bg-slate-800/90 border-slate-700/80 text-sky-400 hover:bg-slate-700'
              }`}
              title={isMuted ? 'Activar voz' : 'Silenciar voz'}
              aria-label={isMuted ? 'Activar voz' : 'Silenciar voz'}
            >
              {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
            </button>

            {/* Botón Día / Noche (alterna directamente entre Día y Noche) */}
            {(onCycleThemePreference || onTileModeChange) && (
              <button
                type="button"
                onClick={handleThemeClick}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl border transition-all active:scale-95 shadow-sm text-xs font-bold cursor-pointer ${
                  isNightActive
                    ? 'bg-slate-800 text-sky-300 border-sky-500/50 hover:bg-slate-700'
                    : 'bg-amber-500/15 text-amber-300 border-amber-400/50 hover:bg-amber-500/25'
                }`}
                title={
                  isNightActive
                    ? 'Modo Noche activo. Toca para cambiar a Día.'
                    : 'Modo Día activo. Toca para cambiar a Noche.'
                }
                aria-label="Cambiar entre modo día y noche"
              >
                {isNightActive ? (
                  <>
                    <Moon className="w-3.5 h-3.5 text-sky-300" />
                    <span className="text-[11px] font-bold">Noche</span>
                  </>
                ) : (
                  <>
                    <Sun className="w-3.5 h-3.5 text-amber-400" />
                    <span className="text-[11px] font-bold">Día</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Fila principal de giro: Flecha de maniobra suelta a la izquierda, Distancia, Texto completo de maniobra y Botón de desplegar */}
        <div className="flex items-center justify-between gap-3">
          {/* Unboxed White Waze-style Maneuver Arrow */}
          <div className="flex-shrink-0 flex items-center justify-center">
            {renderManeuverIcon(coherentManeuver.iconKind)}
          </div>

          {/* Distance & Street Name / Full Multi-line Maneuver Instruction */}
          <div className="flex-1 min-w-0 pr-1 flex flex-col justify-center">
            <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
              <span className="text-xl sm:text-2xl font-black tracking-tight text-white font-mono leading-none whitespace-nowrap shrink-0 min-w-max">
                {formatDistance(distanceToStep)}
              </span>
              {anticipation && (
                <div className="inline-flex items-center shrink-0">
                  <span
                    className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md whitespace-nowrap shadow-sm ${anticipation.className}`}
                  >
                    {anticipation.text}
                  </span>
                </div>
              )}
              {isWalking && (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-400 text-[8px] font-black border border-emerald-500/30 whitespace-nowrap shrink-0">
                  <Footprints className="w-2.5 h-2.5" /> A pie
                </span>
              )}
            </div>
            {/* Nombre de vía abreviado solo en panel visual, con puntos suspensivos si supera el ancho/alto */}
            <p className="text-xs sm:text-sm font-black text-white mt-1 leading-snug break-words line-clamp-2">
              {displayInstruction}
            </p>
            {abbreviatedRoadName &&
              !displayInstruction.toLowerCase().includes(abbreviatedRoadName.toLowerCase()) && (
                <p className="text-[11px] font-semibold text-slate-300 leading-tight truncate">
                  {abbreviatedRoadName}
                </p>
              )}
          </div>

          {/* Ícono de despliegue / repliegue del panel Ruta Lima (flecha rotatoria) */}
          <div className="flex items-center flex-shrink-0">
            {onOpenSearch && (
              <button
                type="button"
                data-small-overlay-trigger="search_panel"
                onClick={onOpenSearch}
                className={`p-2 rounded-xl border transition-all active:scale-95 cursor-pointer ${
                  isSearchOpen
                    ? 'bg-sky-500/20 border-sky-400 text-sky-300 ring-1 ring-sky-400/40'
                    : 'bg-slate-800/90 hover:bg-slate-700 text-slate-300 border-slate-700/80'
                }`}
                title={isSearchOpen ? 'Plegar panel Ruta Lima' : 'Desplegar panel Ruta Lima'}
                aria-label={isSearchOpen ? 'Plegar panel Ruta Lima' : 'Desplegar panel Ruta Lima'}
              >
                <ChevronDown
                  className={`w-4 h-4 text-sky-400 transition-transform duration-300 ${
                    isSearchOpen ? 'rotate-180' : 'rotate-0'
                  }`}
                />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* GPS Signal Warning (compact, below flush top bar, mínimo 3s visible, cerrable con toque) */}
      {showGpsNotice && (
        <button
          type="button"
          onClick={() => setShowGpsNotice(false)}
          className="pointer-events-auto w-[calc(100%-1.5rem)] mx-3 mt-1.5 flex items-center justify-between gap-2 rounded-xl bg-amber-500 text-slate-950 px-3 py-1.5 text-xs font-black shadow-lg border border-amber-300 cursor-pointer active:scale-[0.99] transition"
          aria-label="Cerrar aviso de señal GPS"
        >
          <span className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
          <span className="flex items-center justify-center gap-1.5">
            <WifiOff className="w-3.5 h-3.5 animate-pulse flex-shrink-0" />
            <span>Buscando señal GPS...</span>
          </span>
          <X className="w-3.5 h-3.5 opacity-80 flex-shrink-0" />
        </button>
      )}

      {/* Rerouting Alert Banner (compact, below flush top bar) */}
      {isRerouting && (
        <div className="pointer-events-auto mx-3 mt-1.5 flex items-center justify-center gap-2 rounded-xl bg-sky-500 text-slate-950 px-3.5 py-1.5 text-xs font-black shadow-lg animate-pulse border border-sky-300">
          <RefreshCw className="w-3.5 h-3.5 animate-spin flex-shrink-0" />
          <span className="tracking-wide uppercase">Recalculando...</span>
        </div>
      )}
    </div>
  );
};
