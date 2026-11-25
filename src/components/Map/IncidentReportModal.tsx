import React, { useState, useRef, useCallback } from 'react';
import { Coordinates, InspectorSubtype, PoliceSubtype, TrafficAlertType } from '../../types/navigation';
import {
  POLICE_SUBTYPE_OPTIONS,
  renderPoliceMarkerSvg,
  renderPolicePanelButtonIconSvg,
} from '../../services/policeReports';
import { INSPECTOR_SUBTYPE_OPTIONS } from '../../services/inspectorReports';
import { useSwipeToClose } from '../../hooks/useSwipeToClose';
import {
  AlertTriangle,
  X,
  Check,
  ArrowLeft,
} from 'lucide-react';

interface IncidentReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  userCoords: Coordinates;
  onReport: (
    type: TrafficAlertType,
    title: string,
    description: string,
    policeSubtype?: PoliceSubtype,
    inspectorSubtype?: InspectorSubtype
  ) => void;
}

interface IncidentOption {
  type: TrafficAlertType;
  label: string;
  defaultTitle: string;
  themeColor: string;
  bgClass: string;
  borderClass: string;
  textClass: string;
  renderIcon: () => React.ReactNode;
}

export const IncidentReportModal: React.FC<IncidentReportModalProps> = ({
  isOpen,
  onClose,
  userCoords,
  onReport,
}) => {
  const [selectedType, setSelectedType] = useState<TrafficAlertType | null>(null);
  const [selectedTitle, setSelectedTitle] = useState<string>('');
  const [customNote, setCustomNote] = useState('');
  const [isPoliceSubmenuOpen, setIsPoliceSubmenuOpen] = useState(false);
  const [isInspectorSubmenuOpen, setIsInspectorSubmenuOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const backdropDownRef = useRef(false);

  const handleClose = useCallback(() => {
    setSelectedType(null);
    setSelectedTitle('');
    setCustomNote('');
    setIsPoliceSubmenuOpen(false);
    setIsInspectorSubmenuOpen(false);
    onClose();
  }, [onClose]);

  const { panelRef } = useSwipeToClose({
    isOpen: isOpen && !isPoliceSubmenuOpen && !isInspectorSubmenuOpen,
    onClose: handleClose,
    scrollRef,
  });

  if (!isOpen) return null;

  // 1-Touch Quick Report: Guardar con un solo toque y ubicación actual
  const handleQuickReport = (
    type: TrafficAlertType,
    defaultTitle: string,
    policeSubtype?: PoliceSubtype,
    inspectorSubtype?: InspectorSubtype
  ) => {
    const finalDescription = customNote.trim() || defaultTitle;
    onReport(type, defaultTitle, finalDescription, policeSubtype, inspectorSubtype);
    setSelectedType(null);
    setSelectedTitle('');
    setCustomNote('');
    setIsPoliceSubmenuOpen(false);
    setIsInspectorSubmenuOpen(false);
    onClose();
  };

  const handleSelectOption = (type: TrafficAlertType, title: string) => {
    if (type === 'police') {
      setIsInspectorSubmenuOpen(false);
      setIsPoliceSubmenuOpen(true);
      return;
    }
    if (type === 'inspectors') {
      setIsPoliceSubmenuOpen(false);
      setIsInspectorSubmenuOpen(true);
      return;
    }
    handleQuickReport(type, title);
  };

  const incidentOptions: IncidentOption[] = [
    // 1. Tráfico
    {
      type: 'traffic',
      label: 'Tráfico',
      defaultTitle: 'Tráfico pesado',
      themeColor: 'amber',
      bgClass: 'bg-amber-500/15',
      borderClass: 'border-amber-500/35',
      textClass: 'text-amber-400',
      renderIcon: () => (
        <svg viewBox="0 0 24 24" className="w-6 h-6 text-amber-400" fill="none" stroke="currentColor">
          <path d="M4 14l1.5-4.5h5L12 14v4H4v-4z" strokeWidth="1.6" strokeLinejoin="round" fill="currentColor" fillOpacity="0.25" />
          <circle cx="6" cy="18" r="1.3" fill="currentColor" />
          <circle cx="10" cy="18" r="1.3" fill="currentColor" />
          <path d="M13 11l1.2-3.5h4L19.5 11v3H13v-3z" strokeWidth="1.5" strokeLinejoin="round" />
          <circle cx="15" cy="14" r="1.1" fill="currentColor" />
          <circle cx="18" cy="14" r="1.1" fill="currentColor" />
        </svg>
      ),
    },
    // 2. Accidente: dos carros chocados de frente con chispitas/estrellitas en el punto de impacto (rosado/rojo)
    {
      type: 'accident',
      label: 'Accidente',
      defaultTitle: 'Accidente de tránsito',
      themeColor: 'rose',
      bgClass: 'bg-rose-500/15',
      borderClass: 'border-rose-500/35',
      textClass: 'text-rose-400',
      renderIcon: () => (
        <svg viewBox="0 0 24 24" className="w-6 h-6 text-rose-400" fill="none" stroke="currentColor">
          {/* Carro izquierdo chocado */}
          <path
            d="M2 15h6l2-2.5V11L7 8H3.5L2 11v4z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
            fill="currentColor"
            fillOpacity="0.25"
          />
          <circle cx="4.5" cy="15.5" r="1.3" fill="currentColor" />
          {/* Carro derecho chocado */}
          <path
            d="M22 15h-6l-2-2.5V11l3-3h3.5L22 11v4z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
            fill="currentColor"
            fillOpacity="0.25"
          />
          <circle cx="19.5" cy="15.5" r="1.3" fill="currentColor" />
          {/* Chispitas / estrellitas de choque en el impacto */}
          <path
            d="M12 3.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"
            fill="#fb7185"
            stroke="#fb7185"
            strokeWidth="0.5"
          />
          <circle cx="9.5" cy="4" r="0.8" fill="#fda4af" />
          <circle cx="14.5" cy="4.5" r="0.8" fill="#fda4af" />
          <circle cx="12" cy="11.5" r="0.9" fill="#fda4af" />
        </svg>
      ),
    },
    // 3. Policía: personaje con gorra verde oliva en el panel "Reportar con un toque"
    {
      type: 'police',
      label: 'Policía',
      defaultTitle: 'Policía visible',
      themeColor: 'sky',
      bgClass: 'bg-sky-500/15',
      borderClass: 'border-sky-500/35',
      textClass: 'text-sky-400',
      renderIcon: () => (
        <span
          className="inline-flex items-center justify-center w-7 h-7"
          dangerouslySetInnerHTML={{ __html: renderPolicePanelButtonIconSvg(26) }}
        />
      ),
    },
    // 4. Peligro en la vía
    {
      type: 'hazard',
      label: 'Peligro',
      defaultTitle: 'Peligro en la vía',
      themeColor: 'yellow',
      bgClass: 'bg-yellow-500/15',
      borderClass: 'border-yellow-500/35',
      textClass: 'text-yellow-400',
      renderIcon: () => (
        <svg viewBox="0 0 24 24" className="w-6 h-6 text-yellow-400" fill="none">
          <path
            d="M10.3 3.6a2 2 0 0 1 3.4 0l8.1 14.2A2 2 0 0 1 20.1 21H3.9a2 2 0 0 1-1.7-3.2L10.3 3.6z"
            fill="#eab308"
            fillOpacity="0.2"
            stroke="#facc15"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          <line x1="12" y1="9" x2="12" y2="13.5" stroke="#fef08a" strokeWidth="2" strokeLinecap="round" />
          <circle cx="12" cy="17" r="1.2" fill="#fef08a" />
        </svg>
      ),
    },
    // 5. Vía Cerrada
    {
      type: 'road_closed',
      label: 'Vía cerrada',
      defaultTitle: 'Vía cerrada',
      themeColor: 'red',
      bgClass: 'bg-red-600/15',
      borderClass: 'border-red-500/35',
      textClass: 'text-red-400',
      renderIcon: () => (
        <svg viewBox="0 0 24 24" className="w-6 h-6 text-red-400" fill="none">
          <circle cx="12" cy="12" r="9" fill="#dc2626" fillOpacity="0.2" stroke="#ef4444" strokeWidth="1.8" />
          <rect x="6" y="10.5" width="12" height="3" rx="1" fill="#ef4444" />
          <line x1="8" y1="12" x2="16" y2="12" stroke="#ffffff" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      ),
    },
    // 6. Obras: cono naranja con franjas blancas reflectantes
    {
      type: 'construction',
      label: 'Obras',
      defaultTitle: 'Obras en la vía',
      themeColor: 'orange',
      bgClass: 'bg-orange-500/15',
      borderClass: 'border-orange-500/35',
      textClass: 'text-orange-400',
      renderIcon: () => (
        <svg viewBox="0 0 24 24" className="w-6 h-6 text-orange-400" fill="none">
          {/* Plataforma base del cono */}
          <rect x="3" y="19" width="18" height="2.5" rx="1.2" fill="#ea580c" stroke="#f97316" strokeWidth="1" />
          {/* Cúspide naranja */}
          <polygon points="12,2.5 10.5,8 13.5,8" fill="#ea580c" />
          {/* Franja blanca reflectante superior */}
          <polygon points="10.5,8 9.2,11.5 14.8,11.5 13.5,8" fill="#ffffff" stroke="#cbd5e1" strokeWidth="0.5" />
          {/* Franja naranja intermedia */}
          <polygon points="9.2,11.5 8,15 16,15 14.8,11.5" fill="#ea580c" />
          {/* Franja blanca reflectante inferior */}
          <polygon points="8,15 6.8,19 17.2,19 16,15" fill="#ffffff" stroke="#cbd5e1" strokeWidth="0.5" />
        </svg>
      ),
    },
    // 7. Varado
    {
      type: 'stopped_vehicle',
      label: 'Varado',
      defaultTitle: 'Vehículo averiado',
      themeColor: 'purple',
      bgClass: 'bg-purple-500/15',
      borderClass: 'border-purple-500/35',
      textClass: 'text-purple-400',
      renderIcon: () => (
        <svg viewBox="0 0 24 24" className="w-6 h-6 text-purple-400" fill="none" stroke="currentColor">
          <path d="M3 15h18v3H3z" strokeWidth="1.5" />
          <path d="M5 15l2-5h5l2 5" strokeWidth="1.5" strokeLinejoin="round" fill="currentColor" fillOpacity="0.2" />
          {/* Capó abierto */}
          <line x1="14" y1="15" x2="19" y2="10.5" strokeWidth="1.8" strokeLinecap="round" />
          {/* Chispas de avería */}
          <path d="M17 6.5l2 2m-2 0l2-2" stroke="#c084fc" strokeWidth="1.8" strokeLinecap="round" />
          <circle cx="7" cy="18" r="1.4" fill="currentColor" />
          <circle cx="17" cy="18" r="1.4" fill="currentColor" />
        </svg>
      ),
    },
    // 8. Bache: hoyo en pavimento con llanta cayendo dentro (color naranja notable)
    {
      type: 'pothole',
      label: 'Bache',
      defaultTitle: 'Bache o pista en mal estado',
      themeColor: 'amber',
      bgClass: 'bg-amber-600/15',
      borderClass: 'border-amber-600/35',
      textClass: 'text-amber-400',
      renderIcon: () => (
        <svg viewBox="0 0 24 24" className="w-6 h-6 text-amber-500" fill="none">
          {/* Pistas asfálticas y bache hundido */}
          <path
            d="M2 13h4.5c1 1.5 2 3.5 5.5 3.5s4.5-2 5.5-3.5H22"
            stroke="#f59e0b"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Grietas alrededor del bache */}
          <path d="M8 15.5l-2 2.5m10-2.5l2 2.5" stroke="#d97706" strokeWidth="1.4" strokeLinecap="round" />
          {/* Rueda / llanta cayendo dentro con inclinación */}
          <g transform="translate(12, 11) rotate(22) translate(-12, -11)">
            <circle cx="12" cy="11" r="5" stroke="#f59e0b" strokeWidth="2.4" fill="#78350f" fillOpacity="0.4" />
            <circle cx="12" cy="11" r="2.2" fill="#fbbf24" />
            <circle cx="12" cy="11" r="0.9" fill="#1e293b" />
          </g>
        </svg>
      ),
    },
    // 9. Semáforo dañado: semáforo con luces apagadas y chispa eléctrica (amarillo/ámbar)
    {
      type: 'broken_light',
      label: 'Semáforo dañado',
      defaultTitle: 'Semáforo dañado o apagado',
      themeColor: 'yellow',
      bgClass: 'bg-yellow-500/15',
      borderClass: 'border-yellow-500/35',
      textClass: 'text-yellow-400',
      renderIcon: () => (
        <svg viewBox="0 0 24 24" className="w-6 h-6 text-yellow-400" fill="none">
          {/* Cuerpo del semáforo */}
          <rect x="7.5" y="2" width="9" height="17" rx="3.5" fill="#1e293b" stroke="#eab308" strokeWidth="1.6" />
          {/* Luces apagadas */}
          <circle cx="12" cy="5.5" r="1.8" fill="#ef4444" fillOpacity="0.35" stroke="#7f1d1d" strokeWidth="0.8" />
          <circle cx="12" cy="10.5" r="1.8" fill="#eab308" fillOpacity="0.35" stroke="#713f12" strokeWidth="0.8" />
          <circle cx="12" cy="15.5" r="1.8" fill="#22c55e" fillOpacity="0.25" stroke="#14532d" strokeWidth="0.8" />
          {/* Poste */}
          <path d="M12 19v3.5" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" />
          {/* Chispa eléctrica / avería */}
          <path
            d="M17.5 7l-3.5 4h3l-4 5.5"
            stroke="#facc15"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ),
    },
    // 10. Inspectores: persona con chaleco reflectante y escudo (verde azulado / teal)
    {
      type: 'inspectors',
      label: 'Inspectores',
      defaultTitle: 'Control de inspectores',
      themeColor: 'teal',
      bgClass: 'bg-teal-500/15',
      borderClass: 'border-teal-500/35',
      textClass: 'text-teal-400',
      renderIcon: () => (
        <svg viewBox="0 0 24 24" className="w-6 h-6 text-teal-400" fill="none" stroke="currentColor">
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
      ),
    },
    // 11. Radar temporal: cámara de velocidad (fucsia / magenta)
    {
      type: 'speed_camera',
      label: 'Radar temporal',
      defaultTitle: 'Radar temporal de velocidad',
      themeColor: 'fuchsia',
      bgClass: 'bg-fuchsia-500/15',
      borderClass: 'border-fuchsia-500/35',
      textClass: 'text-fuchsia-400',
      renderIcon: () => (
        <svg viewBox="0 0 24 24" className="w-6 h-6 text-fuchsia-400" fill="none" stroke="currentColor">
          {/* Cuerpo de cámara */}
          <rect
            x="4"
            y="6"
            width="13.5"
            height="8.5"
            rx="2.2"
            strokeWidth="1.6"
            fill="currentColor"
            fillOpacity="0.22"
          />
          {/* Lente */}
          <circle cx="10.8" cy="10.2" r="2.3" strokeWidth="1.6" fill="#f0abfc" fillOpacity="0.3" />
          {/* Soporte / trípode */}
          <path d="M10.8 14.5v5.5M7.5 20h6.6" strokeWidth="1.6" strokeLinecap="round" />
          {/* Ondas de radar */}
          <path d="M19 8.2a3.2 3.2 0 0 1 0 4.1M21 6.6a5.5 5.5 0 0 1 0 7.3" stroke="#f0abfc" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      ),
    },
    // 12. Inundación: gotas y olas de agua (azul cian)
    {
      type: 'flood',
      label: 'Inundación',
      defaultTitle: 'Zona inundada o lluvia fuerte',
      themeColor: 'cyan',
      bgClass: 'bg-cyan-500/15',
      borderClass: 'border-cyan-500/35',
      textClass: 'text-cyan-400',
      renderIcon: () => (
        <svg viewBox="0 0 24 24" className="w-6 h-6 text-cyan-400" fill="none" stroke="currentColor">
          {/* Gotas de lluvia / agua */}
          <path
            d="M8 4.2s2.2 2.7 2.2 4a2.2 2.2 0 1 1-4.4 0c0-1.3 2.2-4 2.2-4z"
            fill="currentColor"
            fillOpacity="0.3"
            strokeWidth="1.5"
          />
          <path
            d="M16 3.5s2.2 2.7 2.2 4a2.2 2.2 0 1 1-4.4 0c0-1.3 2.2-4 2.2-4z"
            fill="currentColor"
            fillOpacity="0.3"
            strokeWidth="1.5"
          />
          {/* Olas de inundación */}
          <path
            d="M3 15.2c1.5 1.3 3 1.3 4.5 0s3-1.3 4.5 0 3 1.3 4.5 0 3-1.3 4.5 0"
            strokeWidth="1.9"
            strokeLinecap="round"
          />
          <path
            d="M3 19c1.5 1.3 3 1.3 4.5 0s3-1.3 4.5 0 3 1.3 4.5 0 3-1.3 4.5 0"
            stroke="#67e8f9"
            strokeWidth="1.9"
            strokeLinecap="round"
          />
        </svg>
      ),
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200"
      onPointerDown={(e) => {
        backdropDownRef.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && backdropDownRef.current) {
          handleClose();
        }
        backdropDownRef.current = false;
      }}
    >
      {isPoliceSubmenuOpen ? (
        <div
          className="w-full max-w-xs sm:max-w-sm rounded-3xl bg-slate-900 border border-slate-700/80 shadow-2xl p-4 sm:p-5 text-white animate-in zoom-in-95 duration-150"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Submenu Header */}
          <div className="flex items-center justify-between pb-2.5 border-b border-slate-800">
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setIsPoliceSubmenuOpen(false)}
                className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 flex items-center justify-center text-slate-300 hover:text-white transition active:scale-95 cursor-pointer"
                aria-label="Volver al panel de reportes"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div>
                <h3 className="text-sm font-black text-white">Reportar policía</h3>
                <p className="text-[11px] text-slate-400">Elige una opción para enviar de inmediato</p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="p-1.5 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition cursor-pointer"
              aria-label="Cerrar modal"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* 4 Police Subtype Options */}
          <div className="grid grid-cols-2 gap-2.5 py-3.5">
            {POLICE_SUBTYPE_OPTIONS.map((opt) => (
              <button
                key={opt.subtype}
                type="button"
                onClick={() => handleQuickReport('police', opt.label, opt.subtype)}
                className={`flex flex-col items-center justify-center gap-1.5 p-3 rounded-2xl border transition-all duration-150 text-center active:scale-95 cursor-pointer ${opt.bgClass} ${opt.borderClass}`}
              >
                <span
                  className="inline-flex items-center justify-center"
                  dangerouslySetInnerHTML={{ __html: renderPoliceMarkerSvg(opt.subtype, 44) }}
                />
                <span className={`text-xs font-extrabold leading-tight ${opt.accentClass}`}>
                  {opt.label}
                </span>
              </button>
            ))}
          </div>

          {/* Cancel returns to the main report panel without sending anything */}
          <div className="pt-2.5 border-t border-slate-800">
            <button
              type="button"
              onClick={() => setIsPoliceSubmenuOpen(false)}
              className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-bold text-xs transition active:scale-95 border border-slate-700 cursor-pointer"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : isInspectorSubmenuOpen ? (
        <div
          className="w-full max-w-xs sm:max-w-sm rounded-3xl bg-slate-900 border border-slate-700/80 shadow-2xl p-4 sm:p-5 text-white animate-in zoom-in-95 duration-150"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Inspector Submenu Header */}
          <div className="flex items-center justify-between pb-2.5 border-b border-slate-800">
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setIsInspectorSubmenuOpen(false)}
                className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 flex items-center justify-center text-slate-300 hover:text-white transition active:scale-95 cursor-pointer"
                aria-label="Volver al panel de reportes"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div>
                <h3 className="text-sm font-black text-white">Reportar inspectores</h3>
                <p className="text-[11px] text-slate-400">Elige una opción para enviar de inmediato</p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="p-1.5 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition cursor-pointer"
              aria-label="Cerrar modal"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* 3 Inspector Subtype Options */}
          <div className="grid grid-cols-3 gap-2 py-3.5">
            {INSPECTOR_SUBTYPE_OPTIONS.map((opt) => (
              <button
                key={opt.subtype}
                type="button"
                onClick={() => handleQuickReport('inspectors', opt.label, undefined, opt.subtype)}
                className={`flex flex-col items-center justify-start gap-2 p-2.5 rounded-2xl border transition-all duration-150 text-center active:scale-95 cursor-pointer ${opt.bgClass} ${opt.borderClass}`}
              >
                <div className="w-14 h-14 rounded-full overflow-hidden border-2 border-white shadow-md bg-white flex-shrink-0">
                  <img
                    src={opt.imageSrc}
                    alt={opt.label}
                    className="w-full h-full object-cover scale-[1.04] block pointer-events-none"
                    draggable={false}
                  />
                </div>
                <span className={`text-[11px] font-extrabold leading-tight ${opt.accentClass}`}>
                  {opt.label}
                </span>
              </button>
            ))}
          </div>

          {/* Cancel returns to the main report panel without sending anything */}
          <div className="pt-2.5 border-t border-slate-800">
            <button
              type="button"
              onClick={() => setIsInspectorSubmenuOpen(false)}
              className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-bold text-xs transition active:scale-95 border border-slate-700 cursor-pointer"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div
          ref={panelRef}
          className="w-full max-w-sm max-h-[90vh] flex flex-col rounded-3xl bg-slate-900 border border-slate-700/80 shadow-2xl p-4 sm:p-5 text-white animate-in zoom-in-95 duration-200"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header (Pinned) */}
          <div className="flex items-center justify-between pb-2.5 border-b border-slate-800 flex-shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
                <AlertTriangle className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-black text-white">Reportar con un toque</h3>
                <p className="text-[11px] text-slate-400">Toca un ícono para alertar de inmediato a la comunidad</p>
              </div>
            </div>
            <button
              onClick={handleClose}
              className="p-1.5 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition cursor-pointer"
              aria-label="Cerrar modal"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Scrollable Body: 3x4 Grid & Optional Note */}
          <div
            ref={scrollRef}
            className="overflow-y-auto flex-1 min-h-0 py-2 space-y-2.5 overscroll-contain"
          >
            {/* 3x4 Incident Type Grid: íconos sólidos, vistosos y uniformes */}
            <div className="grid grid-cols-3 gap-2">
              {incidentOptions.map((opt) => {
                const isSelected = selectedType === opt.type;
                return (
                  <button
                    key={opt.type}
                    onClick={() => handleSelectOption(opt.type, opt.defaultTitle)}
                    title={`Reportar ${opt.label} con un solo toque`}
                    className={`relative flex flex-col items-center justify-center p-2.5 rounded-2xl transition-all duration-200 text-center select-none cursor-pointer ${
                      isSelected
                        ? 'bg-slate-800 ring-2 ring-sky-400 border-2 border-sky-400 shadow-[0_0_16px_rgba(56,189,248,0.4)] scale-[1.02]'
                        : `${opt.bgClass} border ${opt.borderClass} hover:bg-slate-800/80 active:scale-95`
                    }`}
                  >
                    {/* Indicador de Check cuando está seleccionado */}
                    {isSelected && (
                      <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-sky-500 text-white flex items-center justify-center shadow-md animate-in zoom-in-75 duration-150">
                        <Check className="w-2.5 h-2.5 stroke-[3.5]" />
                      </div>
                    )}

                    <div className="flex items-center justify-center w-7 h-7 mb-1">
                      {opt.renderIcon()}
                    </div>
                    <span className={`text-[11px] font-bold leading-tight ${isSelected ? 'text-white' : opt.textClass}`}>
                      {opt.label}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Optional note */}
            <div>
              <input
                type="text"
                placeholder="Nota adicional previa (opcional)..."
                value={customNote}
                onChange={(e) => setCustomNote(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl bg-slate-800/90 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
              />
            </div>
          </div>

          {/* Action Button: Botón Cancelar (Pinned at bottom) */}
          <div className="flex flex-col gap-2 pt-2.5 border-t border-slate-800 flex-shrink-0">
            <button
              onClick={handleClose}
              className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white font-bold text-xs transition active:scale-95 border border-slate-700 cursor-pointer"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
