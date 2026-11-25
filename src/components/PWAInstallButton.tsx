import React, { useState, useRef } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { useSwipeToClose } from '../hooks/useSwipeToClose';
import { Download, Smartphone, X } from 'lucide-react';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const backdropDownRef = useRef(false);
  const { panelRef } = useSwipeToClose({
    isOpen: showIOSGuide,
    onClose: () => setShowIOSGuide(false),
  });

  // If already running as an installed PWA, do not show button
  if (isInstalled) {
    return null;
  }

  // Chromium / Android / Desktop flow
  if (isInstallable) {
    return (
      <button
        onClick={install}
        className="flex items-center gap-1.5 rounded-full bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-lg hover:bg-emerald-500 active:scale-95 transition-all border border-emerald-400/30"
        title="Instalar RUTA LIMA en tu Android"
      >
        <Download className="w-3.5 h-3.5" />
        <span>Instalar App</span>
      </button>
    );
  }

  // iOS Safari flow
  if (isIOS) {
    return (
      <>
        <button
          onClick={() => setShowIOSGuide(true)}
          className="flex items-center gap-1.5 rounded-full bg-slate-800/90 px-3 py-1.5 text-xs font-semibold text-slate-200 border border-slate-700/80 hover:bg-slate-700 active:scale-95 transition"
        >
          <Smartphone className="w-3.5 h-3.5 text-sky-400" />
          <span>Instalar</span>
        </button>

        {showIOSGuide && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
            onPointerDown={(e) => {
              backdropDownRef.current = e.target === e.currentTarget;
            }}
            onClick={(e) => {
              if (e.target === e.currentTarget && backdropDownRef.current) {
                setShowIOSGuide(false);
              }
              backdropDownRef.current = false;
            }}
          >
            <div
              ref={panelRef}
              className="w-full max-w-sm rounded-2xl bg-slate-900 border border-slate-700 p-5 shadow-2xl text-slate-100"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-sky-400" /> Instalar en iPhone / iPad
                </h3>
                <button
                  onClick={() => setShowIOSGuide(false)}
                  className="p-1 rounded-full text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-slate-300">
                1. Toca el botón <strong>Compartir</strong> en la barra de Safari (el ícono de flecha hacia arriba).<br />
                2. Desliza hacia abajo y selecciona <strong>Agregar a Inicio</strong> (+).<br />
                3. Abre la app desde tu pantalla de inicio para pantalla completa sin barras.
              </p>
              <button
                onClick={() => setShowIOSGuide(false)}
                className="mt-4 w-full rounded-xl bg-sky-600 py-2.5 text-xs font-bold text-white hover:bg-sky-500 transition"
              >
                Entendido
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
