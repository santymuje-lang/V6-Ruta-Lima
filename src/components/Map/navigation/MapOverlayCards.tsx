import React from 'react';
import * as maplibregl from 'maplibre-gl';
import {
  Coordinates,
  GPSLocation,
  MapPOI,
  SearchResult,
  TrafficAlert,
} from '../../../types/navigation';
import { FixedRadar } from '../../../data/fixedRadars';
import {
  confirmFixedRadarLocation,
  reportFixedRadarRemoved,
} from '../../../services/fixedRadars';
import {
  getPoliceSubtypeLabel,
  normalizePoliceSubtype,
  renderPoliceMarkerSvg,
} from '../../../services/policeReports';
import {
  getInspectorSubtypeImage,
  getInspectorSubtypeLabel,
  normalizeInspectorSubtype,
} from '../../../services/inspectorReports';
import {
  PIZZA_ICON_SVG,
  POI_CATEGORY_META,
  formatPoiDistance,
} from '../../../services/overpassPoi';
import { formatDirectionLabelSpanish } from '../../../services/reportDirection';
import {
  Check,
  Loader2,
  MapPin,
  Navigation,
  PlusCircle,
  Share2,
  Trash2,
  X,
} from 'lucide-react';
import { getDistanceMeters } from './routeGeometry';
import { getCommunityAlertVisual } from './mapLayers';

export interface LongPressPointState {
  lat: number;
  lng: number;
  label: string;
  address: string | null;
  district?: string;
  isLoadingLabel: boolean;
  addressFound: boolean;
}

export interface MapOverlayCardsProps {
  userLocation: GPSLocation;
  isNavigating: boolean;
  isOverviewActive: boolean;
  mapInstanceRef: React.MutableRefObject<maplibregl.Map | null>;
  // Selected POI card
  selectedPoi: MapPOI | null;
  onClosePoi: () => void;
  onNavigateToPOI?: (poi: MapPOI) => void;
  // Selected Fixed Radar card
  selectedFixedRadar: FixedRadar | null;
  setSelectedFixedRadar: React.Dispatch<React.SetStateAction<FixedRadar | null>>;
  draggingRadarId: string | null;
  setDraggingRadarId: React.Dispatch<React.SetStateAction<string | null>>;
  draggedRadarCoords: Coordinates | null;
  setDraggedRadarCoords: React.Dispatch<React.SetStateAction<Coordinates | null>>;
  radarActionFeedback: string | null;
  setRadarActionFeedback: React.Dispatch<React.SetStateAction<string | null>>;
  refreshFixedRadarsData: () => void;
  onOpenAddFixedRadar: () => void;
  // Selected Community Alert card
  selectedCommunityAlert: TrafficAlert | null;
  isCommunityAlertClosing: boolean;
  onCloseCommunityAlertImmediate: () => void;
  onCloseCommunityAlertSmooth: () => void;
  onConfirmAlert?: (alertId: string) => void;
  onRemoveAlert?: (alertId: string) => void;
  onToggleAlertBothDirections?: (alertId: string) => void;
  // Radar map-pick mode
  isAddFixedRadarOpen: boolean;
  isPickingRadarLocation: boolean;
  onCancelRadarMapPick: () => void;
  onConfirmRadarPickAtCoords: (lat: number, lng: number) => void;
  // Long-press location card
  longPressPoint: LongPressPointState | null;
  longPressScreenPos: { x: number; y: number } | null;
  shareCopiedToast: boolean;
  setShareCopiedToast: React.Dispatch<React.SetStateAction<boolean>>;
  onDismissLongPress: () => void;
  onStartRouteToDestination?: (dest: SearchResult) => void;
}

export const MapOverlayCards: React.FC<MapOverlayCardsProps> = ({
  userLocation,
  isNavigating,
  isOverviewActive,
  mapInstanceRef,
  selectedPoi,
  onClosePoi,
  onNavigateToPOI,
  selectedFixedRadar,
  setSelectedFixedRadar,
  draggingRadarId,
  setDraggingRadarId,
  draggedRadarCoords,
  setDraggedRadarCoords,
  radarActionFeedback,
  setRadarActionFeedback,
  refreshFixedRadarsData,
  onOpenAddFixedRadar,
  selectedCommunityAlert,
  isCommunityAlertClosing,
  onCloseCommunityAlertImmediate,
  onCloseCommunityAlertSmooth,
  onConfirmAlert,
  onRemoveAlert,
  onToggleAlertBothDirections,
  isAddFixedRadarOpen,
  isPickingRadarLocation,
  onCancelRadarMapPick,
  onConfirmRadarPickAtCoords,
  longPressPoint,
  longPressScreenPos,
  shareCopiedToast,
  setShareCopiedToast,
  onDismissLongPress,
  onStartRouteToDestination,
}) => {
  return (
    <>
      {/* Compact Selected POI Card */}
      {selectedPoi && !isOverviewActive && (() => {
        const meta = POI_CATEGORY_META[selectedPoi.category];
        const distMeters = getDistanceMeters(
          userLocation.lat,
          userLocation.lng,
          selectedPoi.lat,
          selectedPoi.lng
        );
        let cardBadgeColor = meta.color;
        let iconMarkup =
          selectedPoi.category === 'restaurant' && selectedPoi.isPizza
            ? PIZZA_ICON_SVG
            : meta.iconSvg;

        if (selectedPoi.category === 'school' && selectedPoi.schoolType === 'private_small') {
          cardBadgeColor = '#b45309';
          iconMarkup = `<span style="color:#ffffff;font-size:15px;font-weight:900;line-height:1;">P</span>`;
        } else if (selectedPoi.category === 'military_academy') {
          switch (selectedPoi.militaryBranch) {
            case 'police_academy':
              cardBadgeColor = '#1e3a8a';
              iconMarkup = `<span style="font-size:17px;line-height:1;">👮</span>`;
              break;
            case 'air_force':
              cardBadgeColor = '#0369a1';
              iconMarkup = `<span style="font-size:17px;line-height:1;">✈️</span>`;
              break;
            case 'navy':
              cardBadgeColor = '#1e293b';
              iconMarkup = `<span style="font-size:17px;line-height:1;">⚓</span>`;
              break;
            case 'army':
            default:
              cardBadgeColor = '#3f6212';
              iconMarkup = `<span style="font-size:17px;line-height:1;">🪖</span>`;
              break;
          }
        }

        const typeDisplayLabel =
          selectedPoi.category === 'hospital' && selectedPoi.amenityTag === 'clinic'
            ? 'Clínica'
            : selectedPoi.category === 'hospital' && selectedPoi.amenityTag === 'hospital'
            ? 'Hospital'
            : selectedPoi.category === 'school'
            ? selectedPoi.schoolType === 'private_small'
              ? 'Colegio privado'
              : 'Colegio nacional'
            : selectedPoi.category === 'institute'
            ? 'Instituto civil'
            : selectedPoi.category === 'university'
            ? 'Universidad'
            : selectedPoi.category === 'military_academy'
            ? selectedPoi.militaryBranch === 'police_academy'
              ? 'Escuela de la Policía Nacional'
              : selectedPoi.militaryBranch === 'air_force'
              ? 'Escuela de la Fuerza Aérea'
              : selectedPoi.militaryBranch === 'navy'
              ? 'Escuela de la Marina de Guerra'
              : 'Escuela del Ejército'
            : selectedPoi.category === 'park'
            ? 'Parque'
            : selectedPoi.isPizza
            ? 'Pizzería'
            : meta.label;
        return (
          <div
            data-small-overlay="poi_card"
            className="fixed inset-x-3 z-40 max-w-sm mx-auto pointer-events-auto animate-in fade-in slide-in-from-bottom-2 duration-200"
            style={{
              bottom: isNavigating
                ? 'calc(env(safe-area-inset-bottom, 0px) + 150px)'
                : 'calc(env(safe-area-inset-bottom, 0px) + 20px)',
            }}
          >
            <div className="rounded-2xl bg-slate-900/95 border border-slate-700/90 shadow-[0_16px_40px_rgba(0,0,0,0.75)] backdrop-blur-xl p-3.5 text-white">
              <div className="flex items-start gap-3">
                <div
                  className={`w-9 h-9 ${
                    selectedPoi.category === 'hospital' ? 'rounded-xl' : 'rounded-full'
                  } border-2 border-white/90 flex items-center justify-center flex-shrink-0 shadow-md mt-0.5`}
                  style={{ backgroundColor: cardBadgeColor }}
                  dangerouslySetInnerHTML={{ __html: iconMarkup }}
                />
                <div className="min-w-0 flex-1">
                  <h4 className="text-sm font-black text-white leading-snug line-clamp-2">
                    {selectedPoi.name}
                  </h4>
                  <div className="flex items-center flex-wrap gap-1.5 mt-0.5 text-[11px] font-semibold text-slate-300">
                    <span className={meta.textClass}>{typeDisplayLabel}</span>
                    <span className="text-slate-500">•</span>
                    <span>A {formatPoiDistance(distMeters)}</span>
                    {selectedPoi.category === 'hospital' && selectedPoi.hasEmergency === true && (
                      <span className="px-1.5 py-0.5 rounded-md bg-red-500/25 border border-red-400/60 text-red-200 text-[10px] font-extrabold">
                        Emergencias
                      </span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClosePoi}
                  className="p-1.5 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white active:scale-95 transition flex-shrink-0"
                  aria-label="Cerrar tarjeta de lugar"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    const target = selectedPoi;
                    onClosePoi();
                    onNavigateToPOI?.(target);
                  }}
                  className="w-full py-2.5 px-4 rounded-xl bg-sky-500 hover:bg-sky-400 active:scale-95 text-slate-950 font-black text-xs shadow-lg shadow-sky-500/25 transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Navigation className="w-3.5 h-3.5 fill-slate-950" />
                  <span>Ir hasta aquí</span>
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Compact Selected Fixed Radar Card */}
      {selectedFixedRadar && (() => {
        const isConfirmed = selectedFixedRadar.precision === 'confirmado';
        const isEditingThis = draggingRadarId === selectedFixedRadar.id;
        const isHighway = selectedFixedRadar.tipo === 'carretera';
        const hasCoords =
          selectedFixedRadar.latitud !== null && selectedFixedRadar.longitud !== null;
        const distMeters = hasCoords
          ? getDistanceMeters(
              userLocation.lat,
              userLocation.lng,
              selectedFixedRadar.latitud!,
              selectedFixedRadar.longitud!
            )
          : null;

        return (
          <div
            data-small-overlay="radar_card"
            className="fixed inset-x-3 z-40 max-w-sm mx-auto pointer-events-auto animate-in fade-in slide-in-from-bottom-2 duration-200"
            style={{
              bottom: isNavigating
                ? 'calc(env(safe-area-inset-bottom, 0px) + 150px)'
                : 'calc(env(safe-area-inset-bottom, 0px) + 20px)',
            }}
          >
            <div className="rounded-2xl bg-slate-900/95 border border-pink-500/50 shadow-[0_16px_40px_rgba(0,0,0,0.78)] backdrop-blur-xl p-3.5 text-white">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-pink-700 border-2 border-white/90 flex items-center justify-center flex-shrink-0 shadow-md mt-0.5 text-white">
                  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="4" y="4" width="14" height="10" rx="2.5" fill="rgba(255,255,255,0.18)" />
                    <circle cx="11" cy="9" r="2.6" fill="#fbcfe8" />
                    <path d="M11 14v6M8 20h6" />
                  </svg>
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center flex-wrap gap-1.5 mb-1">
                    <span
                      className={`px-2 py-0.5 rounded-md text-[10px] font-black border ${
                        isConfirmed
                          ? 'bg-emerald-500/20 border-emerald-400/60 text-emerald-200'
                          : 'bg-amber-500/20 border-amber-400/60 text-amber-200'
                      }`}
                    >
                      {isConfirmed ? 'Confirmada' : 'Ubicación referencial, puede variar'}
                    </span>
                    {selectedFixedRadar.fuente === 'Sutran' && (
                      <span className="px-2 py-0.5 rounded-md bg-pink-500/20 border border-pink-400/50 text-pink-200 text-[10px] font-black">
                        Fuente: Sutran
                      </span>
                    )}
                  </div>

                  <h4 className="text-sm font-black text-white leading-snug line-clamp-2">
                    {selectedFixedRadar.direccion}
                  </h4>
                  <div className="flex items-center flex-wrap gap-1.5 mt-0.5 text-[11px] font-semibold text-slate-300">
                    <span>{selectedFixedRadar.distrito}</span>
                    <span className="text-slate-500">•</span>
                    <span>{selectedFixedRadar.region}</span>
                    {distMeters !== null && (
                      <>
                        <span className="text-slate-500">•</span>
                        <span>A {formatPoiDistance(distMeters)}</span>
                      </>
                    )}
                  </div>

                  {selectedFixedRadar.isCommunitySuggested && (
                    <p className="mt-1 text-[10px] text-slate-400 font-semibold">
                      Confirmaciones comunitarias: {selectedFixedRadar.confirmations || 1}/3
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setDraggingRadarId(null);
                    setDraggedRadarCoords(null);
                    setRadarActionFeedback(null);
                    setSelectedFixedRadar(null);
                  }}
                  className="p-1.5 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white active:scale-95 transition flex-shrink-0"
                  aria-label="Cerrar tarjeta de radar"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {isEditingThis && (
                <div className="mt-2.5 p-2 rounded-xl bg-amber-500/15 border border-amber-400/50 text-[11px] text-amber-100 font-semibold">
                  Arrastra el marcador del radar en el mapa hasta el punto exacto y luego presiona Guardar ubicación.
                </div>
              )}

              {radarActionFeedback && (
                <div className="mt-2 p-2 rounded-xl bg-emerald-500/15 border border-emerald-400/40 text-[11px] text-emerald-200 font-semibold">
                  {radarActionFeedback}
                </div>
              )}

              <div className="mt-3 flex flex-wrap gap-2">
                {isEditingThis ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        const lat =
                          draggedRadarCoords?.lat ?? selectedFixedRadar.latitud ?? undefined;
                        const lng =
                          draggedRadarCoords?.lng ?? selectedFixedRadar.longitud ?? undefined;
                        const res = confirmFixedRadarLocation(selectedFixedRadar, lat, lng);
                        setDraggingRadarId(null);
                        setDraggedRadarCoords(null);
                        refreshFixedRadarsData();
                        setSelectedFixedRadar((prev) =>
                          prev
                            ? {
                                ...prev,
                                ...(typeof lat === 'number' && typeof lng === 'number'
                                  ? { latitud: lat, longitud: lng }
                                  : {}),
                                precision: res.precision,
                                confirmations: res.confirmations,
                              }
                            : null
                        );
                        setRadarActionFeedback(
                          res.precision === 'confirmado'
                            ? 'Ubicación guardada como Confirmada.'
                            : `Confirmación registrada (${res.confirmations}/3).`
                        );
                      }}
                      className="flex-1 py-2 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs flex items-center justify-center gap-1 cursor-pointer transition"
                    >
                      <Check className="w-3.5 h-3.5 stroke-[3]" />
                      <span>Guardar ubicación</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDraggingRadarId(null);
                        setDraggedRadarCoords(null);
                      }}
                      className="py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs cursor-pointer transition"
                    >
                      Cancelar
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        if (!isHighway) {
                          setDraggingRadarId(selectedFixedRadar.id);
                          setDraggedRadarCoords(
                            hasCoords
                              ? {
                                  lat: selectedFixedRadar.latitud!,
                                  lng: selectedFixedRadar.longitud!,
                                }
                              : null
                          );
                          setRadarActionFeedback(null);
                        } else {
                          const res = confirmFixedRadarLocation(selectedFixedRadar);
                          refreshFixedRadarsData();
                          setSelectedFixedRadar((prev) =>
                            prev ? { ...prev, precision: res.precision } : null
                          );
                          setRadarActionFeedback('Tramo confirmado.');
                        }
                      }}
                      className="flex-1 py-2 px-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-black text-[11px] flex items-center justify-center gap-1 cursor-pointer transition"
                    >
                      <MapPin className="w-3.5 h-3.5" />
                      <span>Confirmar ubicación</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        const res = reportFixedRadarRemoved(selectedFixedRadar);
                        refreshFixedRadarsData();
                        if (res.isHidden) {
                          setSelectedFixedRadar(null);
                        } else {
                          setRadarActionFeedback(
                            `Reporte "Ya no está" registrado (${res.removedVotes}/3).`
                          );
                        }
                      }}
                      className="py-2 px-2.5 rounded-xl bg-rose-600/85 hover:bg-rose-500 active:scale-95 text-white font-bold text-[11px] flex items-center justify-center gap-1 cursor-pointer transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Ya no está</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setSelectedFixedRadar(null);
                        onOpenAddFixedRadar();
                      }}
                      className="py-2 px-2.5 rounded-xl bg-pink-600/30 hover:bg-pink-600/45 border border-pink-400/50 text-pink-200 font-bold text-[11px] flex items-center justify-center gap-1 cursor-pointer transition"
                    >
                      <PlusCircle className="w-3.5 h-3.5" />
                      <span>Agregar radar</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Tarjeta unificada y simplificada para TODOS los reportes de la comunidad */}
      {selectedCommunityAlert && (() => {
        const isPolice = selectedCommunityAlert.type === 'police';
        const isInspector = selectedCommunityAlert.type === 'inspectors';

        const titleLabel = isPolice
          ? getPoliceSubtypeLabel(normalizePoliceSubtype(selectedCommunityAlert))
          : isInspector
          ? getInspectorSubtypeLabel(normalizeInspectorSubtype(selectedCommunityAlert))
          : selectedCommunityAlert.title;

        const locationLine = (
          selectedCommunityAlert.address ||
          selectedCommunityAlert.zone ||
          ''
        ).trim();

        const rawDesc = (selectedCommunityAlert.description || '').trim();
        const normalizedDesc = rawDesc.toLowerCase();
        const normalizedTitle = titleLabel.trim().toLowerCase();
        const normalizedAlertTitle = (selectedCommunityAlert.title || '').trim().toLowerCase();
        const customNoteText =
          rawDesc &&
          normalizedDesc !== normalizedTitle &&
          normalizedDesc !== normalizedAlertTitle &&
          normalizedDesc !== 'control de inspectores' &&
          normalizedDesc !== 'reporte de policía' &&
          normalizedDesc !== 'reporte de policia'
            ? rawDesc
            : null;

        const alertVisual =
          !isPolice && !isInspector
            ? getCommunityAlertVisual(selectedCommunityAlert.type)
            : null;

        return (
          <div
            data-small-overlay="alert_popup"
            className={`fixed inset-x-3 z-40 max-w-sm mx-auto transition-all duration-150 ease-out ${
              isCommunityAlertClosing
                ? 'opacity-0 translate-y-2 scale-[0.98] pointer-events-none'
                : 'pointer-events-auto animate-in fade-in slide-in-from-bottom-2 duration-150 opacity-100 translate-y-0 scale-100'
            }`}
            style={{
              bottom: isNavigating
                ? 'calc(env(safe-area-inset-bottom, 0px) + 150px)'
                : 'calc(env(safe-area-inset-bottom, 0px) + 20px)',
            }}
          >
            <div className="rounded-2xl bg-slate-900/95 border border-slate-700/90 shadow-[0_16px_40px_rgba(0,0,0,0.78)] backdrop-blur-xl p-3.5 text-white">
              <div className="flex items-start gap-3">
                {isPolice ? (
                  <div
                    className="flex-shrink-0"
                    dangerouslySetInnerHTML={{
                      __html: renderPoliceMarkerSvg(
                        normalizePoliceSubtype(selectedCommunityAlert),
                        44
                      ),
                    }}
                  />
                ) : isInspector ? (
                  <div className="w-11 h-11 rounded-full overflow-hidden border-2 border-white shadow-md bg-white flex-shrink-0">
                    <img
                      src={getInspectorSubtypeImage(
                        normalizeInspectorSubtype(selectedCommunityAlert)
                      )}
                      alt={titleLabel}
                      className="w-full h-full object-cover scale-[1.04] block pointer-events-none"
                      draggable={false}
                    />
                  </div>
                ) : alertVisual ? (
                  <div
                    className="w-11 h-11 rounded-full border-2 border-white shadow-md flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: alertVisual.bgHex }}
                    dangerouslySetInnerHTML={{ __html: alertVisual.cardIconSvg }}
                  />
                ) : null}

                <div className="min-w-0 flex-1">
                  <h4 className="text-sm font-black text-white leading-snug">
                    {titleLabel}
                  </h4>

                  {locationLine && (
                    <p className="mt-0.5 text-xs font-medium text-slate-300 truncate">
                      {locationLine}
                    </p>
                  )}

                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] leading-snug">
                    <span className="font-medium text-slate-400">
                      {formatDirectionLabelSpanish(
                        selectedCommunityAlert.heading,
                        selectedCommunityAlert.bothDirections
                      )}
                    </span>
                    {selectedCommunityAlert.heading !== null &&
                      selectedCommunityAlert.heading !== undefined &&
                      Number.isFinite(selectedCommunityAlert.heading) && (
                        <button
                          type="button"
                          onClick={() =>
                            onToggleAlertBothDirections?.(selectedCommunityAlert.id)
                          }
                          className="font-semibold text-sky-400 hover:text-sky-300 underline underline-offset-2 cursor-pointer"
                        >
                          {selectedCommunityAlert.bothDirections
                            ? 'Solo un sentido'
                            : 'Marcar para ambos sentidos'}
                        </button>
                      )}
                  </div>

                  {customNoteText && (
                    <p className="mt-1 text-xs text-slate-300 leading-snug truncate">
                      {customNoteText}
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={onCloseCommunityAlertImmediate}
                  className="p-1.5 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white active:scale-95 transition flex-shrink-0"
                  aria-label="Cerrar tarjeta de reporte"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    onConfirmAlert?.(selectedCommunityAlert.id);
                    onCloseCommunityAlertSmooth();
                  }}
                  className="py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-black text-sm flex items-center justify-center gap-1.5 shadow-md transition cursor-pointer"
                >
                  <Check className="w-4 h-4 stroke-[3]" />
                  <span>Sigue ahí</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onRemoveAlert?.(selectedCommunityAlert.id);
                    onCloseCommunityAlertSmooth();
                  }}
                  className="py-2.5 px-3 rounded-xl bg-rose-600 hover:bg-rose-500 active:scale-95 text-white font-black text-sm flex items-center justify-center gap-1.5 shadow-md transition cursor-pointer"
                >
                  <X className="w-4 h-4 stroke-[3]" />
                  <span>Ya no está</span>
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Modo "Elegir en el mapa": barra discreta superior + pin fijo central + confirmar */}
      {isAddFixedRadarOpen && isPickingRadarLocation && (
        <>
          {/* Barra superior discreta */}
          <div
            className="fixed inset-x-3 z-[46] max-w-md mx-auto pointer-events-auto animate-in fade-in slide-in-from-top-2 duration-150"
            style={{ top: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}
          >
            <div className="flex items-center justify-between gap-2.5 px-3.5 py-2.5 rounded-2xl bg-slate-900/95 border border-pink-500/50 shadow-[0_12px_32px_rgba(0,0,0,0.75)] backdrop-blur-xl text-white">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-xl bg-pink-600/25 border border-pink-400/50 flex items-center justify-center text-pink-300 flex-shrink-0">
                  <MapPin className="w-4 h-4" />
                </div>
                <span className="text-xs font-bold text-white leading-snug">
                  Mueve el mapa y toca el lugar del radar
                </span>
              </div>
              <button
                type="button"
                onClick={onCancelRadarMapPick}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 border border-slate-700 text-slate-200 text-xs font-bold flex-shrink-0 cursor-pointer transition"
              >
                Cancelar
              </button>
            </div>
          </div>

          {/* Pin fijo en el centro exacto de la pantalla */}
          <div className="fixed inset-0 pointer-events-none z-[44]">
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-pink-500/35 border border-pink-300/80 shadow-[0_0_12px_rgba(236,72,153,0.7)]" />
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full pb-0.5 flex flex-col items-center drop-shadow-[0_6px_12px_rgba(0,0,0,0.65)]">
              <div className="w-9 h-9 rounded-full rounded-bl-sm -rotate-45 bg-gradient-to-br from-pink-500 to-rose-600 border-2 border-white flex items-center justify-center">
                <div className="w-3 h-3 rounded-full bg-white rotate-45" />
              </div>
            </div>
          </div>

          {/* Botón inferior para confirmar el punto del pin central */}
          <div
            className="fixed inset-x-3 z-[46] max-w-xs mx-auto pointer-events-auto animate-in fade-in slide-in-from-bottom-2 duration-150"
            style={{
              bottom: isNavigating
                ? 'calc(env(safe-area-inset-bottom, 0px) + 150px)'
                : 'calc(env(safe-area-inset-bottom, 0px) + 24px)',
            }}
          >
            <button
              type="button"
              onClick={() => {
                const map = mapInstanceRef.current;
                if (map) {
                  const canvas = map.getCanvas();
                  const rect = canvas.getBoundingClientRect();
                  const lngLat = map.unproject([
                    window.innerWidth / 2 - rect.left,
                    window.innerHeight / 2 - rect.top,
                  ]);
                  onConfirmRadarPickAtCoords(lngLat.lat, lngLat.lng);
                } else {
                  onCancelRadarMapPick();
                }
              }}
              className="w-full py-3 px-4 rounded-2xl bg-pink-600 hover:bg-pink-500 active:scale-95 text-white font-black text-xs shadow-[0_10px_28px_rgba(219,39,119,0.5)] border border-pink-300/60 flex items-center justify-center gap-1.5 cursor-pointer transition"
            >
              <Check className="w-4 h-4 stroke-[3]" />
              <span>Confirmar ubicación</span>
            </button>
          </div>
        </>
      )}

      {/* Ventanita pequeña de presión larga junto al marcador temporal ("Ruta" y "Compartir") */}
      {longPressPoint && longPressScreenPos && !isNavigating && (() => {
        const vw = typeof window !== 'undefined' ? window.innerWidth : 390;
        const vh = typeof window !== 'undefined' ? window.innerHeight : 844;
        const cardWidth = Math.min(268, vw - 24);
        const clampedLeft = Math.max(
          12,
          Math.min(vw - cardWidth - 12, Math.round(longPressScreenPos.x - cardWidth / 2))
        );
        const placeBelow = longPressScreenPos.y < 190;
        const cardTop = placeBelow
          ? Math.min(vh - 155, Math.round(longPressScreenPos.y + 14))
          : Math.max(76, Math.round(longPressScreenPos.y - 44));

        const coordsSubtitle = `${longPressPoint.lat.toFixed(5)}, ${longPressPoint.lng.toFixed(5)}`;
        const shareAddressText = longPressPoint.address || longPressPoint.label;
        const osmShareUrl = `https://www.openstreetmap.org/?mlat=${longPressPoint.lat.toFixed(
          6
        )}&mlon=${longPressPoint.lng.toFixed(6)}#map=17/${longPressPoint.lat.toFixed(
          6
        )}/${longPressPoint.lng.toFixed(6)}`;

        const handleCopyLink = async (textToCopy: string) => {
          try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
              await navigator.clipboard.writeText(textToCopy);
            } else {
              const ta = document.createElement('textarea');
              ta.value = textToCopy;
              ta.style.position = 'fixed';
              ta.style.opacity = '0';
              document.body.appendChild(ta);
              ta.select();
              document.execCommand('copy');
              document.body.removeChild(ta);
            }
          } catch {}
          setShareCopiedToast(true);
          setTimeout(() => setShareCopiedToast(false), 2200);
        };

        const handleShareLongPress = async () => {
          const shareMessage = `Mira este lugar: ${shareAddressText}`;
          if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
            try {
              await navigator.share({
                title: longPressPoint.label,
                text: shareMessage,
                url: osmShareUrl,
              });
              return;
            } catch (err: any) {
              if (err?.name === 'AbortError') {
                return;
              }
            }
          }
          await handleCopyLink(osmShareUrl);
        };

        const handleRouteToLongPress = () => {
          const dest: SearchResult = {
            id: `longpress_${Date.now()}`,
            name: longPressPoint.label,
            display_name: shareAddressText,
            lat: longPressPoint.lat,
            lng: longPressPoint.lng,
            district: longPressPoint.district,
            category: 'street',
          };
          onDismissLongPress();
          onStartRouteToDestination?.(dest);
        };

        return (
          <div
            data-small-overlay="long_press"
            className="fixed z-[45] pointer-events-auto animate-in fade-in zoom-in-95 duration-150"
            style={{
              left: `${clampedLeft}px`,
              top: `${cardTop}px`,
              width: `${cardWidth}px`,
              transform: placeBelow ? 'translateY(0)' : 'translateY(-100%)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="rounded-2xl bg-slate-900/95 border border-slate-700/90 shadow-[0_14px_36px_rgba(0,0,0,0.8)] backdrop-blur-xl p-3 text-white">
              <div className="flex items-start gap-2">
                <div className="w-7 h-7 rounded-xl bg-sky-500/20 border border-sky-400/40 flex items-center justify-center flex-shrink-0 text-sky-400 mt-0.5">
                  <MapPin className="w-3.5 h-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    {longPressPoint.isLoadingLabel && (
                      <Loader2 className="w-3 h-3 text-sky-400 animate-spin flex-shrink-0" />
                    )}
                    <p className="text-xs font-black text-white leading-snug line-clamp-2">
                      {longPressPoint.address || longPressPoint.label}
                    </p>
                  </div>
                  {longPressPoint.addressFound && (
                    <p className="text-[10px] text-slate-400 font-mono mt-0.5 truncate">
                      {coordsSubtitle}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={onDismissLongPress}
                  className="p-1 rounded-full bg-slate-800/90 hover:bg-slate-700 text-slate-400 hover:text-white active:scale-95 transition flex-shrink-0 cursor-pointer"
                  aria-label="Cerrar marcador temporal"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {shareCopiedToast && (
                <div className="mt-2 px-2.5 py-1 rounded-lg bg-emerald-500/20 border border-emerald-400/50 text-emerald-200 text-[11px] font-bold text-center">
                  Enlace copiado
                </div>
              )}

              <div className="mt-2.5 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handleRouteToLongPress}
                  className="py-2 px-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 active:scale-95 text-slate-950 font-black text-xs shadow-md shadow-sky-500/25 transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Navigation className="w-3.5 h-3.5 fill-slate-950" />
                  <span>Ruta</span>
                </button>
                <button
                  type="button"
                  onClick={handleShareLongPress}
                  className="py-2 px-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-100 border border-slate-600/80 font-bold text-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Share2 className="w-3.5 h-3.5 text-sky-400" />
                  <span>Compartir</span>
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </>
  );
};
