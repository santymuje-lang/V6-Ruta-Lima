import React, { useRef } from 'react';
import { MapTileMode, POICategory } from '../../types/navigation';
import { PERU_REGIONS } from '../../data/fixedRadars';
import { RerouteSoundVolume, voiceGuidance } from '../../services/tts';
import { useSwipeToClose } from '../../hooks/useSwipeToClose';
import {
  X,
  Settings,
  Layers,
  Sun,
  Moon,
  Globe,
  Compass,
  Navigation,
  Eye,
  Building2,
  ZoomIn,
  AlertTriangle,
  Check,
  Smartphone,
  Volume2,
  VolumeX,
  MapPin,
  Camera,
  PlusCircle,
  Bell,
  Database,
} from 'lucide-react';

export interface MapSettingsData {
  tileMode: MapTileMode;
  openMapTilesEnabled: boolean;
  perspective3D: boolean;
  buildings3D: boolean;
  autoRotation: boolean;
  autoFollowGPS: boolean;
  smartZoom: boolean;
  controlsSize: 'normal' | 'large';
  voiceEnabled: boolean;
  voiceVolume: number;
  rerouteSoundEnabled: boolean;
  rerouteSoundVolume: RerouteSoundVolume;
  navAlerts: boolean;
  preRouteAlertsEnabled: boolean;
  inspectorNavAlertsEnabled: boolean;
  inspectorAlertDistanceKm: 1 | 2 | 3;
  schoolZoneAlertEnabled: boolean;
  poiEnabled: boolean;
  poiCategories: Record<POICategory, boolean>;
  fixedRadarsEnabled: boolean;
  fixedRadarVoiceEnabled: boolean;
  fixedRadarRegionFilter: string;
}

interface MapSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: MapSettingsData;
  onUpdateSettings: (newSettings: Partial<MapSettingsData>) => void;
  onOpenAddFixedRadar?: () => void;
}

export const MapSettingsModal: React.FC<MapSettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
  onOpenAddFixedRadar,
}) => {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const backdropDownRef = useRef(false);
  const { panelRef } = useSwipeToClose({ isOpen, onClose, scrollRef });

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/75 backdrop-blur-sm animate-fade-in"
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
        className="relative w-full max-w-sm max-h-[90vh] flex flex-col rounded-3xl bg-slate-900/98 border border-slate-700/90 shadow-[0_20px_50px_rgba(0,0,0,0.85)] backdrop-blur-2xl text-white overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header (Fijo arriba) */}
        <div className="flex-shrink-0 flex items-center justify-between px-5 pt-5 pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-sky-500/15 border border-sky-400/30 text-sky-400">
              <Settings className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-black text-white tracking-wide">
                Configuración del Mapa
              </h3>
              <p className="text-[10px] text-slate-400 font-medium">
                Personaliza la navegación y visualización
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-400 hover:text-white bg-slate-800/80 hover:bg-slate-700 active:scale-95 transition"
            aria-label="Cerrar configuración"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div
          ref={scrollRef}
          className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 py-4 space-y-4"
        >
          {/* 1. Selector de Capa del Mapa (Claro, Oscuro, Satélite) */}
          <div>
            <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5 mb-2">
              <Layers className="w-3.5 h-3.5 text-sky-400" />
              <span>Capa del mapa</span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              {/* Mapa Claro */}
              <button
                type="button"
                onClick={() => onUpdateSettings({ tileMode: 'day' })}
                className={`flex flex-col items-center justify-center p-2.5 rounded-2xl border transition active:scale-95 ${
                  settings.tileMode === 'day'
                    ? 'bg-amber-500/20 border-amber-400 text-amber-300 shadow-md shadow-amber-500/10'
                    : 'bg-slate-800/70 border-slate-700/80 text-slate-400 hover:bg-slate-800'
                }`}
              >
                <Sun className="w-5 h-5 mb-1 text-amber-400" />
                <span className="text-[10px] font-bold">Claro</span>
              </button>

              {/* Mapa Oscuro */}
              <button
                type="button"
                onClick={() => onUpdateSettings({ tileMode: 'night' })}
                className={`flex flex-col items-center justify-center p-2.5 rounded-2xl border transition active:scale-95 ${
                  settings.tileMode === 'night'
                    ? 'bg-sky-500/20 border-sky-400 text-sky-300 shadow-md shadow-sky-500/10'
                    : 'bg-slate-800/70 border-slate-700/80 text-slate-400 hover:bg-slate-800'
                }`}
              >
                <Moon className="w-5 h-5 mb-1 text-sky-400" />
                <span className="text-[10px] font-bold">Oscuro</span>
              </button>

              {/* Satélite */}
              <button
                type="button"
                onClick={() => onUpdateSettings({ tileMode: 'satellite' })}
                className={`flex flex-col items-center justify-center p-2.5 rounded-2xl border transition active:scale-95 ${
                  settings.tileMode === 'satellite'
                    ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300 shadow-md shadow-emerald-500/10'
                    : 'bg-slate-800/70 border-slate-700/80 text-slate-400 hover:bg-slate-800'
                }`}
              >
                <Globe className="w-5 h-5 mb-1 text-emerald-400" />
                <span className="text-[10px] font-bold">Satélite</span>
              </button>
            </div>

            {/* Interruptor Fuente OpenMapTiles (para aislar y verificar la capa PMTiles de Perú) */}
            <div className="mt-2.5 flex items-center justify-between p-2.5 rounded-2xl bg-slate-800/60 border border-slate-700/60">
              <div className="flex items-center gap-2 pr-2">
                <Database className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                <div>
                  <div className="text-xs font-bold text-slate-200">Fuente OpenMapTiles</div>
                  <div className="text-[10px] text-slate-400">
                    {settings.openMapTilesEnabled !== false
                      ? 'Activa · Desactívala para ver solo PMTiles Perú'
                      : 'Desactivada · Mostrando solo PMTiles de Perú'}
                  </div>
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={settings.openMapTilesEnabled !== false}
                aria-label="Activar o desactivar fuente OpenMapTiles"
                onClick={() =>
                  onUpdateSettings({
                    openMapTilesEnabled: !(settings.openMapTilesEnabled !== false),
                  })
                }
                className={`w-11 h-6 rounded-full transition-colors relative p-0.5 flex-shrink-0 ${
                  settings.openMapTilesEnabled !== false ? 'bg-cyan-500' : 'bg-slate-700'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white transition-transform ${
                    settings.openMapTilesEnabled !== false ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* 2. Visualización y Perspectiva 3D */}
          <div className="pt-2 border-t border-slate-800/80 space-y-2.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Perspectiva y Vista 3D
            </span>

            {/* Switch Vista 3D */}
            <div className="flex items-center justify-between p-2.5 rounded-2xl bg-slate-800/60 border border-slate-700/60">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-sky-400 flex-shrink-0" />
                <div>
                  <div className="text-xs font-bold text-slate-200">Perspectiva 3D</div>
                  <div className="text-[10px] text-slate-400">Inclinación 55° para conducción</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onUpdateSettings({ perspective3D: !settings.perspective3D })}
                className={`w-11 h-6 rounded-full transition-colors relative p-0.5 ${
                  settings.perspective3D ? 'bg-sky-500' : 'bg-slate-700'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white transition-transform ${
                    settings.perspective3D ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Switch Edificios 3D */}
            <div className="flex items-center justify-between p-2.5 rounded-2xl bg-slate-800/60 border border-slate-700/60">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                <div>
                  <div className="text-xs font-bold text-slate-200">Edificios 3D</div>
                  <div className="text-[10px] text-slate-400">Extrusión tridimensional en el mapa</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onUpdateSettings({ buildings3D: !settings.buildings3D })}
                className={`w-11 h-6 rounded-full transition-colors relative p-0.5 ${
                  settings.buildings3D ? 'bg-indigo-500' : 'bg-slate-700'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white transition-transform ${
                    settings.buildings3D ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Switch Rotación Automática */}
            <div className="flex items-center justify-between p-2.5 rounded-2xl bg-slate-800/60 border border-slate-700/60">
              <div className="flex items-center gap-2">
                <Compass className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <div>
                  <div className="text-xs font-bold text-slate-200">Rotación automática</div>
                  <div className="text-[10px] text-slate-400">Gira el mapa según tu rumbo real</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onUpdateSettings({ autoRotation: !settings.autoRotation })}
                className={`w-11 h-6 rounded-full transition-colors relative p-0.5 ${
                  settings.autoRotation ? 'bg-emerald-500' : 'bg-slate-700'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white transition-transform ${
                    settings.autoRotation ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* 3. Navegación GPS y Zoom */}
          <div className="pt-2 border-t border-slate-800/80 space-y-2.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              GPS y Zoom Inteligente
            </span>

            {/* Switch Seguimiento GPS */}
            <div className="flex items-center justify-between p-2.5 rounded-2xl bg-slate-800/60 border border-slate-700/60">
              <div className="flex items-center gap-2">
                <Navigation className="w-4 h-4 text-sky-400 flex-shrink-0" />
                <div>
                  <div className="text-xs font-bold text-slate-200">Seguimiento GPS</div>
                  <div className="text-[10px] text-slate-400">Mantiene tu vehículo centrado</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onUpdateSettings({ autoFollowGPS: !settings.autoFollowGPS })}
                className={`w-11 h-6 rounded-full transition-colors relative p-0.5 ${
                  settings.autoFollowGPS ? 'bg-sky-500' : 'bg-slate-700'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white transition-transform ${
                    settings.autoFollowGPS ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Switch Zoom Automático */}
            <div className="flex items-center justify-between p-2.5 rounded-2xl bg-slate-800/60 border border-slate-700/60">
              <div className="flex items-center gap-2">
                <ZoomIn className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                <div>
                  <div className="text-xs font-bold text-slate-200">Zoom automático</div>
                  <div className="text-[10px] text-slate-400">Se acerca en cruces y giros</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onUpdateSettings({ smartZoom: !settings.smartZoom })}
                className={`w-11 h-6 rounded-full transition-colors relative p-0.5 ${
                  settings.smartZoom ? 'bg-indigo-500' : 'bg-slate-700'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white transition-transform ${
                    settings.smartZoom ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* 4. Navegación por Voz en Español (Perú) */}
          <div className="pt-2 border-t border-slate-800/80 space-y-2.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Navegación por Voz
            </span>

            {/* Switch Voz */}
            <div className="flex items-center justify-between p-2.5 rounded-2xl bg-slate-800/60 border border-slate-700/60">
              <div className="flex items-center gap-2">
                {settings.voiceEnabled ? (
                  <Volume2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                ) : (
                  <VolumeX className="w-4 h-4 text-slate-500 flex-shrink-0" />
                )}
                <div>
                  <div className="text-xs font-bold text-slate-200">Indicaciones por voz</div>
                  <div className="text-[10px] text-slate-400">Español de Perú (giros y distancia)</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onUpdateSettings({ voiceEnabled: !settings.voiceEnabled })}
                className={`w-11 h-6 rounded-full transition-colors relative p-0.5 ${
                  settings.voiceEnabled ? 'bg-emerald-500' : 'bg-slate-700'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white transition-transform ${
                    settings.voiceEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Selector de Volumen */}
            {settings.voiceEnabled && (
              <div className="p-2.5 rounded-2xl bg-slate-800/60 border border-slate-700/60 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-300">Volumen de voz</span>
                <div className="flex items-center gap-1.5">
                  {[0.5, 0.8, 1.0].map((vol) => (
                    <button
                      key={vol}
                      type="button"
                      onClick={() => onUpdateSettings({ voiceVolume: vol })}
                      className={`px-2 py-1 rounded-lg text-xs font-bold border transition ${
                        settings.voiceVolume === vol
                          ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300'
                          : 'bg-slate-800 border-slate-700 text-slate-400'
                      }`}
                    >
                      {vol === 0.5 ? 'Bajo' : vol === 0.8 ? 'Medio' : 'Alto'}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Switch Sonido de recálculo y control deslizante de volumen */}
            <div className="p-2.5 rounded-2xl bg-slate-800/60 border border-slate-700/60 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bell className="w-4 h-4 text-sky-400 flex-shrink-0" />
                  <div>
                    <div className="text-xs font-bold text-slate-200">Sonido de recálculo</div>
                    <div className="text-[10px] text-slate-400">Tono breve al desviarse de la ruta</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    onUpdateSettings({
                      rerouteSoundEnabled: !(settings.rerouteSoundEnabled !== false),
                    })
                  }
                  className={`w-11 h-6 rounded-full transition-colors relative p-0.5 ${
                    settings.rerouteSoundEnabled !== false ? 'bg-sky-500' : 'bg-slate-700'
                  }`}
                  aria-label="Alternar sonido de recálculo"
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-white transition-transform ${
                      settings.rerouteSoundEnabled !== false ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {(() => {
                const levels: RerouteSoundVolume[] = ['normal', 'high', 'max'];
                const levelLabels: Record<RerouteSoundVolume, string> = {
                  normal: 'Normal',
                  high: 'Alto',
                  max: 'Máximo',
                };
                const currentLevel: RerouteSoundVolume =
                  settings.rerouteSoundVolume === 'normal' ||
                  settings.rerouteSoundVolume === 'high' ||
                  settings.rerouteSoundVolume === 'max'
                    ? settings.rerouteSoundVolume
                    : 'high';
                const currentIndex = levels.indexOf(currentLevel);
                const selectVolumeLevel = (nextLevel: RerouteSoundVolume) => {
                  if (nextLevel !== currentLevel) {
                    onUpdateSettings({ rerouteSoundVolume: nextLevel });
                    voiceGuidance.setRerouteSoundVolume(nextLevel);
                  }
                  voiceGuidance.previewRerouteChime(nextLevel);
                };

                return (
                  <div
                    className={`pt-2 border-t border-slate-700/60 space-y-1.5 transition-opacity ${
                      settings.rerouteSoundEnabled !== false
                        ? 'opacity-100'
                        : 'opacity-45 pointer-events-none'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-slate-300">
                        Volumen del tono
                      </span>
                      <span className="text-[11px] font-bold text-sky-300">
                        {levelLabels[currentLevel]}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={2}
                      step={1}
                      value={currentIndex}
                      onChange={(e) => {
                        const idx = Number(e.target.value);
                        const nextLevel = levels[idx] || 'high';
                        selectVolumeLevel(nextLevel);
                      }}
                      aria-label="Volumen del sonido de recálculo"
                      className="w-full accent-sky-400 cursor-pointer h-1.5 bg-slate-700 rounded-lg"
                    />
                    <div className="flex items-center justify-between text-[10px] font-bold">
                      {levels.map((lvl) => (
                        <button
                          key={lvl}
                          type="button"
                          onClick={() => selectVolumeLevel(lvl)}
                          className={`px-1.5 py-0.5 rounded transition ${
                            currentLevel === lvl
                              ? 'text-sky-300'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {levelLabels[lvl]}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>

          {/* 5. Tamaño de Controles y Alertas */}
          <div className="pt-2 border-t border-slate-800/80 space-y-2.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Personalización de Interfaz
            </span>

            {/* Tamaño de Controles */}
            <div className="p-2.5 rounded-2xl bg-slate-800/60 border border-slate-700/60">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-200">
                  <Smartphone className="w-3.5 h-3.5 text-sky-400" />
                  <span>Tamaño de controles laterales</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => onUpdateSettings({ controlsSize: 'normal' })}
                  className={`py-2 px-3 rounded-xl border text-xs font-bold transition ${
                    settings.controlsSize === 'normal'
                      ? 'bg-sky-500/20 border-sky-400 text-sky-300'
                      : 'bg-slate-800 border-slate-700 text-slate-400'
                  }`}
                >
                  Normal (40px)
                </button>
                <button
                  type="button"
                  onClick={() => onUpdateSettings({ controlsSize: 'large' })}
                  className={`py-2 px-3 rounded-xl border text-xs font-bold transition ${
                    settings.controlsSize === 'large'
                      ? 'bg-sky-500/20 border-sky-400 text-sky-300'
                      : 'bg-slate-800 border-slate-700 text-slate-400'
                  }`}
                >
                  Grande (48px)
                </button>
              </div>
            </div>

            {/* Switch Alertas de Navegación */}
            <div className="flex items-center justify-between p-2.5 rounded-2xl bg-slate-800/60 border border-slate-700/60">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                <div>
                  <div className="text-xs font-bold text-slate-200">Alertas de tránsito</div>
                  <div className="text-[10px] text-slate-400">Obras, accidentes y peligros</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onUpdateSettings({ navAlerts: !settings.navAlerts })}
                className={`w-11 h-6 rounded-full transition-colors relative p-0.5 ${
                  settings.navAlerts ? 'bg-amber-500' : 'bg-slate-700'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white transition-transform ${
                    settings.navAlerts ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Switch Resumen por voz antes de iniciar ruta (Parte 3) */}
            <div className="flex items-center justify-between p-2.5 rounded-2xl bg-slate-800/60 border border-slate-700/60">
              <div className="flex items-center gap-2">
                <Volume2 className="w-4 h-4 text-sky-400 flex-shrink-0" />
                <div>
                  <div className="text-xs font-bold text-slate-200">Resumen al elegir ruta</div>
                  <div className="text-[10px] text-slate-400">Lee reportes antes de iniciar</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() =>
                  onUpdateSettings({ preRouteAlertsEnabled: !settings.preRouteAlertsEnabled })
                }
                className={`w-11 h-6 rounded-full transition-colors relative p-0.5 ${
                  settings.preRouteAlertsEnabled ? 'bg-sky-500' : 'bg-slate-700'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white transition-transform ${
                    settings.preRouteAlertsEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Switch Alerta de inspectores en ruta (Parte 4) */}
            <div className="p-2.5 rounded-2xl bg-slate-800/60 border border-slate-700/60 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-teal-400 flex-shrink-0" />
                  <div>
                    <div className="text-xs font-bold text-slate-200">Alertas de inspectores</div>
                    <div className="text-[10px] text-slate-400">Aviso anticipado en tu ruta</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    onUpdateSettings({
                      inspectorNavAlertsEnabled: !settings.inspectorNavAlertsEnabled,
                    })
                  }
                  className={`w-11 h-6 rounded-full transition-colors relative p-0.5 ${
                    settings.inspectorNavAlertsEnabled ? 'bg-teal-500' : 'bg-slate-700'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-white transition-transform ${
                      settings.inspectorNavAlertsEnabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {settings.inspectorNavAlertsEnabled && (
                <div className="flex items-center justify-between pt-2 border-t border-slate-700/60">
                  <span className="text-[11px] font-bold text-slate-300">Distancia de aviso</span>
                  <div className="flex items-center gap-1.5">
                    {([1, 2, 3] as const).map((km) => (
                      <button
                        key={km}
                        type="button"
                        onClick={() => onUpdateSettings({ inspectorAlertDistanceKm: km })}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition ${
                          settings.inspectorAlertDistanceKm === km
                            ? 'bg-teal-500/20 border-teal-400 text-teal-300'
                            : 'bg-slate-800 border-slate-700 text-slate-400'
                        }`}
                      >
                        {km} km
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Switch Aviso de zona escolar (solo por voz) */}
            <div className="flex items-center justify-between p-2.5 rounded-2xl bg-slate-800/60 border border-slate-700/60">
              <div className="flex items-center gap-2">
                <Volume2 className="w-4 h-4 text-amber-400 flex-shrink-0" />
                <div>
                  <div className="text-xs font-bold text-slate-200">Aviso de zona escolar</div>
                  <div className="text-[10px] text-slate-400">Aviso por voz al acercarte a un colegio</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() =>
                  onUpdateSettings({
                    schoolZoneAlertEnabled: !(settings.schoolZoneAlertEnabled !== false),
                  })
                }
                className={`w-11 h-6 rounded-full transition-colors relative p-0.5 ${
                  settings.schoolZoneAlertEnabled !== false ? 'bg-amber-500' : 'bg-slate-700'
                }`}
                aria-label="Alternar aviso de zona escolar"
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white transition-transform ${
                    settings.schoolZoneAlertEnabled !== false ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* 6. Lugares importantes (POIs de OpenStreetMap) */}
          <div className="pt-2 border-t border-slate-800/80 space-y-2.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Lugares importantes
            </span>

            {/* Interruptor general */}
            <div className="flex items-center justify-between p-2.5 rounded-2xl bg-slate-800/60 border border-slate-700/60">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-sky-400 flex-shrink-0" />
                <div>
                  <div className="text-xs font-bold text-slate-200">Mostrar lugares en el mapa</div>
                  <div className="text-[10px] text-slate-400">Hospitales, tiendas, cafés y servicios</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onUpdateSettings({ poiEnabled: !settings.poiEnabled })}
                className={`w-11 h-6 rounded-full transition-colors relative p-0.5 ${
                  settings.poiEnabled ? 'bg-sky-500' : 'bg-slate-700'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white transition-transform ${
                    settings.poiEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* 7. Radares fijos referenciales y tramos Sutran */}
          <div className="pt-2 border-t border-slate-800/80 space-y-2.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Radares Fijos (Perú)
            </span>

            {/* Interruptor Radares fijos */}
            <div className="flex items-center justify-between p-2.5 rounded-2xl bg-slate-800/60 border border-slate-700/60">
              <div className="flex items-center gap-2">
                <Camera className="w-4 h-4 text-pink-400 flex-shrink-0" />
                <div>
                  <div className="text-xs font-bold text-slate-200">Radares fijos</div>
                  <div className="text-[10px] text-slate-400">
                    Puntos urbanos referenciales y tramos Sutran
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() =>
                  onUpdateSettings({ fixedRadarsEnabled: !settings.fixedRadarsEnabled })
                }
                className={`w-11 h-6 rounded-full transition-colors relative p-0.5 ${
                  settings.fixedRadarsEnabled ? 'bg-pink-600' : 'bg-slate-700'
                }`}
                aria-label="Alternar radares fijos"
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white transition-transform ${
                    settings.fixedRadarsEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Interruptor Aviso por voz de radares */}
            <div className="flex items-center justify-between p-2.5 rounded-2xl bg-slate-800/60 border border-slate-700/60">
              <div className="flex items-center gap-2">
                <Volume2 className="w-4 h-4 text-pink-400 flex-shrink-0" />
                <div>
                  <div className="text-xs font-bold text-slate-200">Aviso por voz de radares</div>
                  <div className="text-[10px] text-slate-400">
                    Alerta a 1 km, 300 m y al entrar/salir de tramos
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() =>
                  onUpdateSettings({ fixedRadarVoiceEnabled: !settings.fixedRadarVoiceEnabled })
                }
                className={`w-11 h-6 rounded-full transition-colors relative p-0.5 ${
                  settings.fixedRadarVoiceEnabled ? 'bg-pink-600' : 'bg-slate-700'
                }`}
                aria-label="Alternar aviso por voz de radares"
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white transition-transform ${
                    settings.fixedRadarVoiceEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Filtro por región */}
            <div className="p-2.5 rounded-2xl bg-slate-800/60 border border-slate-700/60 space-y-1.5">
              <label className="block text-xs font-bold text-slate-200">
                Filtro por región
              </label>
              <select
                value={settings.fixedRadarRegionFilter || 'auto'}
                onChange={(e) =>
                  onUpdateSettings({ fixedRadarRegionFilter: e.target.value })
                }
                className="w-full px-2.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs font-semibold text-white focus:outline-none focus:border-pink-500"
              >
                <option value="auto">Automático (mi ubicación y ruta activa)</option>
                <option value="all">Todas las regiones del Perú</option>
                {PERU_REGIONS.map((reg) => (
                  <option key={reg} value={reg}>
                    {reg}
                  </option>
                ))}
              </select>
            </div>

            {/* Botón Agregar radar */}
            {onOpenAddFixedRadar && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenAddFixedRadar();
                }}
                className="w-full py-2.5 px-3 rounded-2xl bg-pink-600/20 hover:bg-pink-600/30 border border-pink-400/50 text-pink-200 font-bold text-xs flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer"
              >
                <PlusCircle className="w-4 h-4 text-pink-400" />
                <span>Agregar radar en cualquier ciudad</span>
              </button>
            )}
          </div>
        </div>

        {/* Footer (Fijo abajo) */}
        <div className="flex-shrink-0 px-5 pb-5 pt-3 border-t border-slate-800 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 rounded-2xl bg-sky-500 hover:bg-sky-400 active:scale-95 text-slate-950 font-black text-xs shadow-lg shadow-sky-500/20 transition flex items-center justify-center gap-1.5"
          >
            <Check className="w-4 h-4 stroke-[3]" />
            <span>Guardar y volver al mapa</span>
          </button>
        </div>
      </div>
    </div>
  );
};
