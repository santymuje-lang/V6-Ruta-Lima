import React, { useEffect, useRef, useState } from 'react';
import { QueuedVoiceBannerItem } from '../../services/tts';
import { AlertTriangle, X } from 'lucide-react';

interface VoiceAlertBannerProps {
  banner: QueuedVoiceBannerItem | null;
  onDismiss: (id: string) => void;
  topOffsetClass?: string;
}

export const VoiceAlertBanner: React.FC<VoiceAlertBannerProps> = ({
  banner,
  onDismiss,
  topOffsetClass = 'mt-2',
}) => {
  const [renderedBanner, setRenderedBanner] = useState<QueuedVoiceBannerItem | null>(banner);
  const [isVisible, setIsVisible] = useState<boolean>(Boolean(banner));
  const touchStartYRef = useRef<number | null>(null);
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (exitTimerRef.current) {
      clearTimeout(exitTimerRef.current);
      exitTimerRef.current = null;
    }

    if (banner) {
      setRenderedBanner(banner);
      // Next frame ensures slide-down transition runs cleanly on mount
      const raf = requestAnimationFrame(() => setIsVisible(true));
      return () => cancelAnimationFrame(raf);
    } else {
      setIsVisible(false);
      exitTimerRef.current = setTimeout(() => {
        setRenderedBanner(null);
      }, 240);
      return () => {
        if (exitTimerRef.current) {
          clearTimeout(exitTimerRef.current);
        }
      };
    }
  }, [banner]);

  if (!renderedBanner) return null;

  const isInspectorAlert =
    renderedBanner.variant === 'inspector' ||
    renderedBanner.text.toLowerCase().includes('inspector');
  const isSchoolAlert = renderedBanner.variant === 'school';
  const isHospitalAlert = renderedBanner.variant === 'hospital';
  const isRadarAlert = renderedBanner.variant === 'radar';

  const bannerThemeClass = isRadarAlert
    ? 'bg-gradient-to-r from-pink-700/95 via-rose-600/95 to-fuchsia-700/95 border-pink-200/85 text-white'
    : isSchoolAlert
    ? 'bg-gradient-to-r from-amber-500/95 via-yellow-500/95 to-amber-600/95 border-yellow-200/90 text-slate-950'
    : isHospitalAlert
    ? 'bg-gradient-to-r from-red-600/95 via-rose-600/95 to-red-700/95 border-red-200/85 text-white'
    : isInspectorAlert
    ? 'bg-gradient-to-r from-red-600/95 via-orange-600/95 to-rose-600/95 border-amber-300/85 text-white'
    : 'bg-gradient-to-r from-orange-600/95 to-amber-600/95 border-amber-200/80 text-white';

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartYRef.current = e.touches[0]?.clientY ?? null;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartYRef.current === null) return;
    const currentY = e.touches[0]?.clientY ?? touchStartYRef.current;
    if (currentY - touchStartYRef.current < -28) {
      touchStartYRef.current = null;
      onDismiss(renderedBanner.id);
    }
  };

  const handleTouchEnd = () => {
    touchStartYRef.current = null;
  };

  return (
    <div
      className={`pointer-events-none w-full max-w-lg mx-auto px-3 ${topOffsetClass} z-40`}
      aria-live="assertive"
    >
      <div
        role="alert"
        onClick={() => onDismiss(renderedBanner.id)}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className={`pointer-events-auto cursor-pointer select-none rounded-2xl px-3.5 py-3 shadow-[0_14px_38px_rgba(0,0,0,0.65)] backdrop-blur-xl border-2 flex items-center gap-3 transition-all duration-250 ease-out ${
          isVisible ? 'translate-y-0 opacity-100' : '-translate-y-4 opacity-0'
        } ${bannerThemeClass}`}
      >
        {/* Left Icon */}
        <div
          className={`w-10 h-10 rounded-xl border flex items-center justify-center flex-shrink-0 ${
            isSchoolAlert
              ? 'bg-slate-950/20 border-slate-950/25'
              : 'bg-black/25 border-white/30'
          }`}
        >
          {isRadarAlert ? (
            <svg viewBox="0 0 24 24" className="w-6 h-6 text-white" fill="none" stroke="currentColor">
              <rect x="4" y="4.5" width="14" height="10" rx="2.5" strokeWidth="1.8" fill="currentColor" fillOpacity="0.22" />
              <circle cx="11" cy="9.5" r="2.6" strokeWidth="1.7" fill="#fbcfe8" fillOpacity="0.35" />
              <path d="M11 14.5v6M7.5 20.5h7" strokeWidth="1.8" strokeLinecap="round" />
              <circle cx="15.5" cy="7" r="1" fill="#fde047" stroke="none" />
            </svg>
          ) : isSchoolAlert ? (
            <svg
              viewBox="0 0 24 24"
              className="w-6 h-6 text-slate-950"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M2 5.5A2.5 2.5 0 0 1 4.5 3H12v16H4.5A2.5 2.5 0 0 0 2 21V5.5z" fill="currentColor" fillOpacity="0.2" />
              <path d="M22 5.5A2.5 2.5 0 0 0 19.5 3H12v16h7.5a2.5 2.5 0 0 1 2.5 2V5.5z" fill="currentColor" fillOpacity="0.2" />
            </svg>
          ) : isHospitalAlert ? (
            <svg viewBox="0 0 24 24" className="w-6 h-6 text-white" fill="none">
              <path d="M9.5 4h5v5.5H20v5h-5.5V20h-5v-5.5H4v-5h5.5V4z" fill="currentColor" />
            </svg>
          ) : isInspectorAlert ? (
            <svg viewBox="0 0 24 24" className="w-6 h-6 text-white" fill="none" stroke="currentColor">
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
          ) : (
            <AlertTriangle className="w-6 h-6 text-white" />
          )}
        </div>

        {/* Exact Spoken Text */}
        <div className="min-w-0 flex-1">
          <p
            className={`text-sm sm:text-base font-black leading-snug ${
              isSchoolAlert ? 'text-slate-950' : 'text-white drop-shadow-sm'
            }`}
          >
            {renderedBanner.text}
          </p>
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDismiss(renderedBanner.id);
          }}
          className="p-1.5 rounded-full bg-black/20 hover:bg-black/35 text-white/90 hover:text-white flex-shrink-0 transition"
          aria-label="Cerrar alerta"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
