import React from 'react';
import { GPSPermissionState } from '../../hooks/useGeolocation';
import { Navigation, MapPin, AlertCircle, RefreshCw } from 'lucide-react';

interface PermissionModalProps {
  permissionState: GPSPermissionState;
  errorMessage: string | null;
  onRequestPermission: () => void;
  onContinueSimulated: () => void;
}

export const PermissionModal: React.FC<PermissionModalProps> = ({
  permissionState,
  errorMessage,
  onRequestPermission,
  onContinueSimulated,
}) => {
  const [isDismissed, setIsDismissed] = React.useState<boolean>(false);
  const [isConnecting, setIsConnecting] = React.useState<boolean>(false);

  React.useEffect(() => {
    if (errorMessage || permissionState !== 'prompt') {
      setIsConnecting(false);
    }
  }, [errorMessage, permissionState]);

  if (permissionState === 'granted' || isDismissed) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
      <div className="w-full max-w-md rounded-3xl bg-slate-900 border border-slate-700/80 p-6 shadow-2xl text-slate-100">
        {/* Header Icon */}
        <div className="w-16 h-16 rounded-2xl bg-sky-500/20 border border-sky-400/30 flex items-center justify-center mx-auto mb-4 text-sky-400">
          <Navigation className="w-8 h-8" />
        </div>

        <h3 className="text-xl font-black text-center text-white tracking-tight">
          Navegación GPS RUTA LIMA
        </h3>

        <p className="mt-2 text-xs text-center text-slate-300 leading-relaxed">
          Para brindarte indicaciones en tiempo real mientras conduces por avenidas y calles de Lima,
          necesitamos acceso a la señal de GPS de tu teléfono Android.
        </p>

        {/* Error / Denied Warning */}
        {permissionState === 'denied' && (
          <div className="mt-4 p-3.5 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-200 text-xs">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
              <div>
                <strong className="block font-bold">Permiso de ubicación bloqueado</strong>
                <span>
                  Para habilitarlo: Toca el candado o icono de ajustes a la izquierda de la barra de
                  direcciones del navegador &gt; Permisos &gt; Ubicación &gt; Permitir, y luego recarga.
                </span>
              </div>
            </div>
          </div>
        )}

        {errorMessage && permissionState !== 'denied' && (
          <div className="mt-3 p-3 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-200 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="mt-6 flex flex-col gap-2.5">
          <button
            onClick={() => {
              setIsConnecting(true);
              onRequestPermission();
            }}
            disabled={isConnecting}
            className="w-full py-3.5 px-4 rounded-2xl bg-sky-500 hover:bg-sky-400 active:scale-95 text-slate-950 font-black text-sm shadow-lg shadow-sky-500/25 transition flex items-center justify-center gap-2"
          >
            {isConnecting ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin text-slate-950" />
                <span>Conectando con señal GPS...</span>
              </>
            ) : (
              <>
                <MapPin className="w-4 h-4" />
                <span>Activar GPS para Conducir</span>
              </>
            )}
          </button>

          <button
            onClick={() => {
              setIsDismissed(true);
              onContinueSimulated();
            }}
            className="w-full py-3 px-4 rounded-2xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-300 font-bold text-xs border border-slate-700 transition flex items-center justify-center gap-2"
          >
            <Navigation className="w-4 h-4 text-sky-400" />
            <span>Explorar Mapa de Lima</span>
          </button>
        </div>
      </div>
    </div>
  );
};
