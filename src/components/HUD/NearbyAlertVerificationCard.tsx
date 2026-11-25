import React, { useEffect, useState } from 'react';
import { TrafficAlert } from '../../types/navigation';
import { getAlertQuestionName } from '../../services/alertLifecycle';
import { Check, X, AlertTriangle } from 'lucide-react';

interface NearbyAlertVerificationCardProps {
  alert: TrafficAlert;
  distanceMeters?: number;
  onConfirmStillThere: (alertId: string) => void;
  onReportNotThere: (alertId: string) => void;
  onDismiss: (alertId: string) => void;
}

export const NearbyAlertVerificationCard: React.FC<NearbyAlertVerificationCardProps> = ({
  alert,
  distanceMeters,
  onConfirmStillThere,
  onReportNotThere,
  onDismiss,
}) => {
  const [secondsRemaining, setSecondsRemaining] = useState<number>(8);

  useEffect(() => {
    setSecondsRemaining(8);
    const interval = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          onDismiss(alert.id);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [alert.id, onDismiss]);

  const question = `¿Sigue ahí ${getAlertQuestionName(alert.type, alert.policeSubtype, alert.inspectorSubtype)}?`;

  return (
    <div className="w-full select-none animate-in fade-in slide-in-from-top-2 duration-300">
      <div className="relative overflow-hidden rounded-2xl bg-slate-900/98 border border-sky-500/40 shadow-[0_12px_36px_rgba(0,0,0,0.8)] backdrop-blur-2xl text-white p-3.5">
        {/* Barra de progreso de 8 segundos */}
        <div className="absolute top-0 inset-x-0 h-1 bg-slate-800">
          <div
            className="h-full bg-gradient-to-r from-sky-400 to-blue-500 transition-all duration-1000 ease-linear"
            style={{ width: `${(secondsRemaining / 8) * 100}%` }}
          />
        </div>

        {/* Cabecera con pregunta y botón cerrar */}
        <div className="flex items-start justify-between gap-2.5 pt-1">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 flex-shrink-0">
              <AlertTriangle className="w-5 h-5 text-amber-400" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] font-black uppercase tracking-wider text-sky-400 font-mono">
                  VERIFICACIÓN VIAL
                </span>
                {distanceMeters !== undefined && (
                  <span className="text-[10px] font-mono text-slate-400">
                    · a {Math.round(distanceMeters)} m
                  </span>
                )}
                <span className="text-[10px] text-slate-500 font-mono">
                  ({secondsRemaining}s)
                </span>
              </div>
              <h4 className="text-sm sm:text-base font-black text-white leading-tight capitalize truncate mt-0.5">
                {question}
              </h4>
              <p className="text-[11px] text-slate-300 truncate leading-snug mt-0.5">
                {alert.title}
              </p>
            </div>
          </div>

          <button
            onClick={() => onDismiss(alert.id)}
            className="p-1 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition active:scale-95 flex-shrink-0"
            title="Cerrar pregunta"
            aria-label="Cerrar pregunta"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Dos botones grandes: "Sigue ahí" (verde) y "Ya no está" (rojo) */}
        <div className="grid grid-cols-2 gap-2.5 mt-3">
          {/* Botón Verde: Sigue ahí */}
          <button
            onClick={() => onConfirmStillThere(alert.id)}
            className="py-2.5 sm:py-3 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-black text-xs sm:text-sm flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-950/40 border border-emerald-400/40 transition-all cursor-pointer"
          >
            <Check className="w-4 h-4 stroke-[3]" />
            <span>Sigue ahí</span>
          </button>

          {/* Botón Rojo: Ya no está */}
          <button
            onClick={() => onReportNotThere(alert.id)}
            className="py-2.5 sm:py-3 px-3 rounded-xl bg-rose-600 hover:bg-rose-500 active:scale-95 text-white font-black text-xs sm:text-sm flex items-center justify-center gap-1.5 shadow-lg shadow-rose-950/40 border border-rose-400/40 transition-all cursor-pointer"
          >
            <X className="w-4 h-4 stroke-[3]" />
            <span>Ya no está</span>
          </button>
        </div>
      </div>
    </div>
  );
};
