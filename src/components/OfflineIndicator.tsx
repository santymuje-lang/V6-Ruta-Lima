import React, { useEffect, useRef, useState } from 'react';
import { WifiOff, X } from 'lucide-react';
import { logSystemNotice } from '../services/systemNotices';

export const OfflineIndicator: React.FC = () => {
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [showBanner, setShowBanner] = useState<boolean>(
    typeof navigator !== 'undefined' ? !navigator.onLine : false
  );
  const shownAtRef = useRef<number>(0);
  const minHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      const elapsed = Date.now() - shownAtRef.current;
      const remaining = Math.max(0, 3000 - elapsed);
      if (remaining === 0) {
        setShowBanner(false);
      } else {
        if (minHoldTimerRef.current) clearTimeout(minHoldTimerRef.current);
        minHoldTimerRef.current = setTimeout(() => {
          minHoldTimerRef.current = null;
          setShowBanner(false);
        }, remaining);
      }
    };
    const handleOffline = () => {
      if (minHoldTimerRef.current) {
        clearTimeout(minHoldTimerRef.current);
        minHoldTimerRef.current = null;
      }
      setIsOnline(false);
      shownAtRef.current = Date.now();
      setShowBanner(true);
      logSystemNotice(
        'Modo sin conexión • Usando mapas y lugares en caché',
        'Pérdida de conexión de red (OfflineIndicator)'
      );
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (minHoldTimerRef.current) {
        clearTimeout(minHoldTimerRef.current);
        minHoldTimerRef.current = null;
      }
    };
  }, []);

  if (!showBanner && isOnline) return null;
  if (!showBanner) return null;

  return (
    <button
      type="button"
      onClick={() => setShowBanner(false)}
      className="fixed top-20 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-full bg-amber-500/95 px-4 py-1.5 text-xs font-bold text-slate-950 shadow-xl backdrop-blur-md border border-amber-300 cursor-pointer active:scale-95 transition"
      aria-label="Cerrar aviso sin conexión"
    >
      <WifiOff className="w-4 h-4 animate-pulse flex-shrink-0" />
      <span>Modo sin conexión • Usando mapas y lugares en caché</span>
      <X className="w-3.5 h-3.5 opacity-80 flex-shrink-0" />
    </button>
  );
};
