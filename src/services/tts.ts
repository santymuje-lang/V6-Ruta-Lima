import { Coordinates, TrafficAlert, TrafficAlertType, TravelMode } from '../types/navigation';
import { calculateDistanceMeters } from './osrm';
import { logSystemNotice } from './systemNotices';
import { getPoliceSubtypeLabel, normalizePoliceSubtype } from './policeReports';
import { getInspectorSubtypeLabel, normalizeInspectorSubtype } from './inspectorReports';
import { buildCumulativeDistances, projectPointOnPolyline } from './routeAlerts';
import { getBearing } from './routeMatching';
import {
  getAlertTargetCoords,
  isAlertMatchingRouteHeading,
  shortestAngularDiffDeg,
} from './reportDirection';

export type RerouteSoundVolume = 'normal' | 'high' | 'max';

export interface QueuedVoiceBannerItem {
  id: string;
  alertId?: string;
  text: string;
  variant: 'inspector' | 'route_summary' | 'school' | 'hospital' | 'radar';
}

type BannerListener = (item: QueuedVoiceBannerItem | null) => void;

class VoiceGuidanceService {
  private isMuted: boolean = false;
  private volume: number = 1.0;
  private lastSpokenText: string = '';
  private lastSpokenTime: number = 0;
  private lastInstruction: string = 'Sigue la ruta marcada en el mapa.';
  private voice: SpeechSynthesisVoice | null = null;
  private announcedThresholds: Set<string> = new Set();
  private currentStepKey: string = '';

  // Priority queue & incident announcement deduplication
  private announcedIncidents: Map<string, number> = new Map();
  private priorityUntil: number = 0;

  // Synchronized alert queue for Part 3, 4 & 5 banner + voice
  private alertQueue: QueuedVoiceBannerItem[] = [];
  private activeBanner: QueuedVoiceBannerItem | null = null;
  private activeBannerTimer: ReturnType<typeof setTimeout> | null = null;
  private activeBannerMinHoldTimer: ReturnType<typeof setTimeout> | null = null;
  private bannerListeners: Set<BannerListener> = new Set();

  // Two-note reroute chime
  private rerouteSoundEnabled: boolean = true;
  private rerouteSoundVolume: RerouteSoundVolume = 'high';
  private audioCtx: AudioContext | null = null;
  private audioCtxUnlocked: boolean = false;
  private pendingRerouteChimeTimer: ReturnType<typeof setInterval> | null = null;
  private rerouteChimeWaitStart: number = 0;

  // Cola de avisos solo por voz (sin banner) que espera sin cortar avisos activos
  private voiceOnlyQueue: string[] = [];
  private voiceOnlyWaitTimer: ReturnType<typeof setInterval> | null = null;
  private voiceOnlyFallbackTimer: ReturnType<typeof setTimeout> | null = null;
  private voiceOnlyWaitStart: number = 0;
  private isSpeakingVoiceOnly: boolean = false;
  private voiceOnlyReservedUntil: number = 0;

  constructor() {
    if (typeof window !== 'undefined') {
      if ('speechSynthesis' in window) {
        this.initVoice();
        window.speechSynthesis.onvoiceschanged = () => {
          this.initVoice();
        };
      }
      const handleFirstGesture = () => {
        this.unlockAudioContext();
        window.removeEventListener('touchstart', handleFirstGesture, true);
        window.removeEventListener('pointerdown', handleFirstGesture, true);
        window.removeEventListener('keydown', handleFirstGesture, true);
      };
      window.addEventListener('touchstart', handleFirstGesture, { passive: true, capture: true });
      window.addEventListener('pointerdown', handleFirstGesture, { passive: true, capture: true });
      window.addEventListener('keydown', handleFirstGesture, { passive: true, capture: true });
    }
  }

  public subscribeBanner(listener: BannerListener): () => void {
    this.bannerListeners.add(listener);
    listener(this.activeBanner);
    return () => {
      this.bannerListeners.delete(listener);
    };
  }

  private notifyBannerListeners() {
    this.bannerListeners.forEach((cb) => cb(this.activeBanner));
  }

  public enqueueAlertBanner(params: {
    text: string;
    alertId?: string;
    variant: 'inspector' | 'route_summary' | 'school' | 'hospital' | 'radar';
    voiceEnabled?: boolean;
  }) {
    const cleanText = params.text.trim();
    if (!cleanText) return;

    // Avoid duplicating exact text if already active or pending
    if (
      this.activeBanner?.text === cleanText ||
      this.alertQueue.some((q) => q.text === cleanText)
    ) {
      return;
    }

    const item: QueuedVoiceBannerItem = {
      id: `vbanner_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      alertId: params.alertId,
      text: cleanText,
      variant: params.variant,
    };

    this.alertQueue.push(item);
    if (!this.activeBanner) {
      this.processNextBanner(params.voiceEnabled !== false);
    }
  }

  private processNextBanner(voiceEnabled: boolean = true) {
    if (this.activeBannerTimer) {
      clearTimeout(this.activeBannerTimer);
      this.activeBannerTimer = null;
    }
    if (this.activeBannerMinHoldTimer) {
      clearTimeout(this.activeBannerMinHoldTimer);
      this.activeBannerMinHoldTimer = null;
    }

    const next = this.alertQueue.shift() || null;
    this.activeBanner = next;
    this.notifyBannerListeners();

    if (!next) {
      this.priorityUntil = 0;
      return;
    }

    const shownAt = Date.now();
    const MIN_VISIBLE_MS = 3200;
    logSystemNotice(next.text, `Franja de aviso en ruta (${next.variant})`);

    const scheduleFinishAfterMinHold = () => {
      if (this.activeBanner?.id !== next.id) return;
      const elapsed = Date.now() - shownAt;
      const remaining = Math.max(0, MIN_VISIBLE_MS - elapsed);
      if (remaining === 0) {
        this.finishActiveBanner(next.id, voiceEnabled);
        return;
      }
      if (!this.activeBannerMinHoldTimer) {
        this.activeBannerMinHoldTimer = setTimeout(() => {
          this.activeBannerMinHoldTimer = null;
          this.finishActiveBanner(next.id, voiceEnabled);
        }, remaining);
      }
    };

    const canSpeak =
      !this.isMuted &&
      voiceEnabled &&
      typeof window !== 'undefined' &&
      'speechSynthesis' in window;

    if (!canSpeak) {
      // Si la voz está desactivada, mostrar el banner 5 segundos (mínimo 3s garantizado)
      this.activeBannerTimer = setTimeout(() => {
        scheduleFinishAfterMinHold();
      }, 5000);
      return;
    }

    try {
      this.isSpeakingVoiceOnly = false;
      if (this.voiceOnlyFallbackTimer) {
        clearTimeout(this.voiceOnlyFallbackTimer);
        this.voiceOnlyFallbackTimer = null;
      }
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(next.text);
      utterance.lang = 'es-PE';
      utterance.rate = 1.03;
      utterance.pitch = 1.04;
      utterance.volume = this.volume;
      if (this.voice) {
        utterance.voice = this.voice;
      }

      const estimatedMs = Math.max(4500, Math.min(14000, next.text.length * 95 + 1800));
      this.priorityUntil = Date.now() + estimatedMs;

      let completed = false;
      const onComplete = () => {
        if (completed) return;
        completed = true;
        scheduleFinishAfterMinHold();
      };

      utterance.onend = onComplete;
      utterance.onerror = onComplete;

      // Safety fallback in case mobile SpeechSynthesis fails to trigger onend
      this.activeBannerTimer = setTimeout(onComplete, estimatedMs);

      this.lastSpokenText = next.text;
      this.lastSpokenTime = Date.now();
      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.warn('Queued voice alert error:', err);
      this.activeBannerTimer = setTimeout(() => {
        scheduleFinishAfterMinHold();
      }, 5000);
    }
  }

  private finishActiveBanner(itemId: string, voiceEnabled: boolean = true) {
    if (this.activeBanner?.id !== itemId) return;
    if (this.activeBannerTimer) {
      clearTimeout(this.activeBannerTimer);
      this.activeBannerTimer = null;
    }
    if (this.activeBannerMinHoldTimer) {
      clearTimeout(this.activeBannerMinHoldTimer);
      this.activeBannerMinHoldTimer = null;
    }
    this.activeBanner = null;
    this.processNextBanner(voiceEnabled);
  }

  public dismissActiveBanner(itemId?: string) {
    if (!this.activeBanner) return;
    if (itemId && this.activeBanner.id !== itemId) return;

    if (this.activeBannerTimer) {
      clearTimeout(this.activeBannerTimer);
      this.activeBannerTimer = null;
    }
    if (this.activeBannerMinHoldTimer) {
      clearTimeout(this.activeBannerMinHoldTimer);
      this.activeBannerMinHoldTimer = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }
    this.priorityUntil = 0;
    this.activeBanner = null;
    this.processNextBanner(true);
  }

  public cancelAlertById(alertId: string) {
    this.alertQueue = this.alertQueue.filter((item) => item.alertId !== alertId);
    if (this.activeBanner?.alertId === alertId) {
      this.dismissActiveBanner(this.activeBanner.id);
    }
  }

  public clearAlertQueue() {
    this.alertQueue = [];
    this.clearVoiceOnlyQueue();
    if (this.activeBannerTimer) {
      clearTimeout(this.activeBannerTimer);
      this.activeBannerTimer = null;
    }
    if (this.activeBannerMinHoldTimer) {
      clearTimeout(this.activeBannerMinHoldTimer);
      this.activeBannerMinHoldTimer = null;
    }
    if (this.activeBanner) {
      this.activeBanner = null;
      this.notifyBannerListeners();
    }
    this.priorityUntil = 0;
  }

  private initVoice() {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const voices = window.speechSynthesis.getVoices();
    // Prioritize Peruvian / Latin American Spanish voices
    const spanishVoice =
      voices.find((v) => v.lang.startsWith('es-PE')) ||
      voices.find((v) => v.lang.startsWith('es-419')) ||
      voices.find((v) => v.lang.startsWith('es-US')) ||
      voices.find((v) => v.lang.startsWith('es-ES')) ||
      voices.find((v) => v.lang.startsWith('es')) ||
      null;

    this.voice = spanishVoice;
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    if (muted) {
      this.clearVoiceOnlyQueue();
    }
    if (muted && typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }

  public getIsMuted(): boolean {
    return this.isMuted;
  }

  public setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol));
  }

  public getVolume(): number {
    return this.volume;
  }

  public setRerouteSoundEnabled(enabled: boolean) {
    this.rerouteSoundEnabled = enabled;
    if (!enabled && this.pendingRerouteChimeTimer) {
      clearInterval(this.pendingRerouteChimeTimer);
      this.pendingRerouteChimeTimer = null;
    }
  }

  public getRerouteSoundEnabled(): boolean {
    return this.rerouteSoundEnabled;
  }

  public setRerouteSoundVolume(level: RerouteSoundVolume) {
    this.rerouteSoundVolume = level;
  }

  public getRerouteSoundVolume(): RerouteSoundVolume {
    return this.rerouteSoundVolume;
  }

  /**
   * Crea o reanuda el AudioContext en un gesto del usuario (móviles/iOS/Android)
   * para evitar bloqueos de reproducción automática.
   */
  public unlockAudioContext() {
    if (typeof window === 'undefined') return;
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;

      if (!this.audioCtx || this.audioCtx.state === 'closed') {
        this.audioCtx = new AudioCtx();
        this.audioCtxUnlocked = false;
      }
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume().catch(() => {});
      }
      if (!this.audioCtxUnlocked) {
        try {
          const buffer = this.audioCtx.createBuffer(1, 1, 22050);
          const source = this.audioCtx.createBufferSource();
          source.buffer = buffer;
          source.connect(this.audioCtx.destination);
          source.start(0);
          this.audioCtxUnlocked = true;
        } catch {}
      }
    } catch {}
  }

  private isPriorityAudioPlaying(): boolean {
    const now = Date.now();
    const isSpeaking =
      typeof window !== 'undefined' &&
      'speechSynthesis' in window &&
      Boolean(window.speechSynthesis.speaking || window.speechSynthesis.pending);
    return Boolean(
      this.activeBanner !== null ||
        this.isSpeakingVoiceOnly ||
        now < this.priorityUntil ||
        isSpeaking
    );
  }

  private stopVoiceOnlyWaitTimer() {
    if (this.voiceOnlyWaitTimer) {
      clearInterval(this.voiceOnlyWaitTimer);
      this.voiceOnlyWaitTimer = null;
    }
  }

  public clearVoiceOnlyQueue() {
    this.voiceOnlyQueue = [];
    this.stopVoiceOnlyWaitTimer();
    if (this.voiceOnlyFallbackTimer) {
      clearTimeout(this.voiceOnlyFallbackTimer);
      this.voiceOnlyFallbackTimer = null;
    }
    this.isSpeakingVoiceOnly = false;
    if (this.voiceOnlyReservedUntil > 0 && this.priorityUntil === this.voiceOnlyReservedUntil) {
      this.priorityUntil = 0;
    }
    this.voiceOnlyReservedUntil = 0;
  }

  private canPlayVoiceOnlyNow(): boolean {
    if (this.isMuted) return false;
    if (this.activeBanner !== null || this.alertQueue.length > 0) return false;
    if (this.isSpeakingVoiceOnly) return false;
    if (Date.now() < this.priorityUntil) return false;
    if (
      typeof window !== 'undefined' &&
      'speechSynthesis' in window &&
      (window.speechSynthesis.speaking || window.speechSynthesis.pending)
    ) {
      return false;
    }
    return true;
  }

  private ensureVoiceOnlyWaitTimer() {
    if (this.voiceOnlyWaitTimer) return;
    this.voiceOnlyWaitStart = Date.now();
    this.voiceOnlyWaitTimer = setInterval(() => {
      if (this.isMuted || this.voiceOnlyQueue.length === 0) {
        this.stopVoiceOnlyWaitTimer();
        return;
      }
      if (Date.now() - this.voiceOnlyWaitStart > 25000) {
        this.voiceOnlyQueue = [];
        this.stopVoiceOnlyWaitTimer();
        return;
      }
      if (this.canPlayVoiceOnlyNow()) {
        this.playNextVoiceOnlyAlert();
      }
    }, 250);
  }

  private playNextVoiceOnlyAlert() {
    if (!this.canPlayVoiceOnlyNow()) {
      this.ensureVoiceOnlyWaitTimer();
      return;
    }

    const nextText = this.voiceOnlyQueue.shift();
    if (!nextText) {
      this.stopVoiceOnlyWaitTimer();
      return;
    }

    this.stopVoiceOnlyWaitTimer();

    try {
      const utterance = new SpeechSynthesisUtterance(nextText);
      utterance.lang = 'es-PE';
      utterance.rate = 1.03;
      utterance.pitch = 1.04;
      utterance.volume = this.volume;
      if (this.voice) {
        utterance.voice = this.voice;
      }

      const estimatedMs = Math.max(4000, Math.min(12000, nextText.length * 95 + 1600));
      const reservedUntil = Date.now() + estimatedMs;
      this.isSpeakingVoiceOnly = true;
      this.voiceOnlyReservedUntil = reservedUntil;
      this.priorityUntil = Math.max(this.priorityUntil, reservedUntil);

      let completed = false;
      const onComplete = () => {
        if (completed) return;
        completed = true;
        if (this.voiceOnlyFallbackTimer) {
          clearTimeout(this.voiceOnlyFallbackTimer);
          this.voiceOnlyFallbackTimer = null;
        }
        this.isSpeakingVoiceOnly = false;
        if (this.voiceOnlyReservedUntil > 0 && this.priorityUntil === this.voiceOnlyReservedUntil) {
          this.priorityUntil = 0;
        }
        this.voiceOnlyReservedUntil = 0;
        if (this.voiceOnlyQueue.length > 0) {
          this.playNextVoiceOnlyAlert();
        }
      };

      utterance.onend = onComplete;
      utterance.onerror = onComplete;
      this.voiceOnlyFallbackTimer = setTimeout(onComplete, estimatedMs);

      this.lastSpokenText = nextText;
      this.lastSpokenTime = Date.now();
      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.warn('Voice-only alert error:', err);
      this.isSpeakingVoiceOnly = false;
      this.voiceOnlyReservedUntil = 0;
    }
  }

  /**
   * Reproduce un aviso solo por voz (sin mostrar banner) esperando a que termine
   * cualquier otro aviso por voz activo sin cortarlo.
   */
  public speakQueuedVoiceOnlyAlert(text: string) {
    const cleanText = text.trim();
    if (!cleanText || this.isMuted) return;
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

    if (!this.voiceOnlyQueue.includes(cleanText)) {
      this.voiceOnlyQueue.push(cleanText);
    }

    if (this.canPlayVoiceOnlyNow()) {
      this.playNextVoiceOnlyAlert();
    } else {
      this.ensureVoiceOnlyWaitTimer();
    }
  }

  private getRerouteChimeGain(level: RerouteSoundVolume): number {
    switch (level) {
      case 'normal':
        return 0.48;
      case 'max':
        return 0.98;
      case 'high':
      default:
        return 0.76;
    }
  }

  private triggerTwoNoteWazeChime(overrideLevel?: RerouteSoundVolume) {
    if (typeof window === 'undefined') return;
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;

      if (!this.audioCtx || this.audioCtx.state === 'closed') {
        this.audioCtx = new AudioCtx();
        this.audioCtxUnlocked = false;
      }

      const ctx = this.audioCtx;
      const level = overrideLevel || this.rerouteSoundVolume || 'high';
      const masterVol = this.getRerouteChimeGain(level);

      const scheduleChimeNotes = () => {
        const now = ctx.currentTime;

        // Limitador suave para alcanzar máximo volumen sin recorte ni distorsión
        const compressor = ctx.createDynamicsCompressor();
        compressor.threshold.setValueAtTime(-2.5, now);
        compressor.knee.setValueAtTime(3, now);
        compressor.ratio.setValueAtTime(12, now);
        compressor.attack.setValueAtTime(0.001, now);
        compressor.release.setValueAtTime(0.06, now);
        compressor.connect(ctx.destination);

        // Dos notas agudas, claras y notorias (~0.40s en total): A5 (880 Hz) -> E6 (1318.51 Hz)
        const notes = [
          { freq: 880.0, startOffset: 0.0, dur: 0.145 },
          { freq: 1318.51, startOffset: 0.15, dur: 0.25 },
        ];

        for (const note of notes) {
          const start = now + note.startOffset;
          const end = start + note.dur;

          // Oscilador principal triangular (rico en armónicos audibles en cabina sin sonar áspero)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(note.freq, start);

          gain.gain.setValueAtTime(0.0001, start);
          gain.gain.linearRampToValueAtTime(masterVol, start + 0.008);
          gain.gain.setValueAtTime(masterVol * 0.88, start + Math.min(0.05, note.dur * 0.4));
          gain.gain.exponentialRampToValueAtTime(0.0001, end);

          osc.connect(gain);
          gain.connect(compressor);
          osc.start(start);
          osc.stop(end + 0.015);

          // Refuerzo armónico agudo sutil para destacar sobre el ruido del tráfico
          const harmonicOsc = ctx.createOscillator();
          const harmonicGain = ctx.createGain();
          harmonicOsc.type = 'sine';
          harmonicOsc.frequency.setValueAtTime(note.freq * 2, start);

          harmonicGain.gain.setValueAtTime(0.0001, start);
          harmonicGain.gain.linearRampToValueAtTime(masterVol * 0.22, start + 0.008);
          harmonicGain.gain.exponentialRampToValueAtTime(0.0001, end);

          harmonicOsc.connect(harmonicGain);
          harmonicGain.connect(compressor);
          harmonicOsc.start(start);
          harmonicOsc.stop(end + 0.015);
        }
      };

      if (ctx.state === 'suspended') {
        ctx
          .resume()
          .then(() => {
            scheduleChimeNotes();
          })
          .catch(() => {});
      } else {
        scheduleChimeNotes();
      }
    } catch (err) {
      console.warn('Reroute chime audio error:', err);
    }
  }

  /**
   * Aviso sonoro (tres pitidos cortos) cuando se supera el límite de velocidad.
   * Respeta el silencio de voz y el volumen general de la app.
   */
  public playSpeedWarningBeep() {
    if (this.isMuted || typeof window === 'undefined') return;
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;

      if (!this.audioCtx || this.audioCtx.state === 'closed') {
        this.audioCtx = new AudioCtx();
        this.audioCtxUnlocked = false;
      }
      const ctx = this.audioCtx;
      const masterVol = 0.3 + 0.6 * Math.max(0, Math.min(1, this.volume));

      const scheduleBeeps = () => {
        const now = ctx.currentTime;
        const compressor = ctx.createDynamicsCompressor();
        compressor.connect(ctx.destination);
        for (let i = 0; i < 3; i++) {
          const start = now + i * 0.2;
          const end = start + 0.12;
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'square';
          osc.frequency.setValueAtTime(1000, start);
          gain.gain.setValueAtTime(0.0001, start);
          gain.gain.linearRampToValueAtTime(masterVol * 0.5, start + 0.01);
          gain.gain.exponentialRampToValueAtTime(0.0001, end);
          osc.connect(gain);
          gain.connect(compressor);
          osc.start(start);
          osc.stop(end + 0.02);
        }
      };

      if (ctx.state === 'suspended') {
        ctx.resume().then(scheduleBeeps).catch(() => {});
      } else {
        scheduleBeeps();
      }
    } catch (err) {
      console.warn('Speed warning beep error:', err);
    }
  }

  /**
   * Reproduce una muestra inmediata del sonido de recálculo (por ejemplo al cambiar volumen en Ajustes).
   */
  public previewRerouteChime(level?: RerouteSoundVolume) {
    this.unlockAudioContext();
    this.triggerTwoNoteWazeChime(level);
  }

  /**
   * Reproduce un sonido corto de dos notas al recalcular la ruta sin hablar.
   * Nunca corta avisos prioritarios (inspectores, radares, escuelas, peligros); espera a que terminen.
   */
  public playRerouteChime() {
    if (this.isMuted || !this.rerouteSoundEnabled) return;

    if (this.pendingRerouteChimeTimer) {
      clearInterval(this.pendingRerouteChimeTimer);
      this.pendingRerouteChimeTimer = null;
    }

    if (!this.isPriorityAudioPlaying()) {
      this.triggerTwoNoteWazeChime();
      return;
    }

    // Esperar a que termine el aviso prioritario actual antes de reproducir el sonido
    this.rerouteChimeWaitStart = Date.now();
    this.pendingRerouteChimeTimer = setInterval(() => {
      if (this.isMuted || !this.rerouteSoundEnabled) {
        if (this.pendingRerouteChimeTimer) {
          clearInterval(this.pendingRerouteChimeTimer);
          this.pendingRerouteChimeTimer = null;
        }
        return;
      }
      if (!this.isPriorityAudioPlaying()) {
        if (this.pendingRerouteChimeTimer) {
          clearInterval(this.pendingRerouteChimeTimer);
          this.pendingRerouteChimeTimer = null;
        }
        this.triggerTwoNoteWazeChime();
        return;
      }
      if (Date.now() - this.rerouteChimeWaitStart > 16000) {
        if (this.pendingRerouteChimeTimer) {
          clearInterval(this.pendingRerouteChimeTimer);
          this.pendingRerouteChimeTimer = null;
        }
      }
    }, 250);
  }

  /**
   * Speaks navigation prompts with priority management.
   * Priority alerts (traffic incidents, hazards) interrupt routine speech and reserve the audio channel.
   */
  public speak(text: string, force: boolean = false, isPriority: boolean = false) {
    if (this.isMuted) return;
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    if (this.activeBanner) return; // Yield while a queued alert banner is speaking

    const now = Date.now();

    // If an urgent safety priority prompt was recently announced, do not allow normal maneuver speech to override it
    if (!isPriority && now < this.priorityUntil) {
      return;
    }

    // Avoid repeating identical prompt within 7 seconds unless forced or priority
    if (!force && !isPriority && this.lastSpokenText === text && now - this.lastSpokenTime < 7000) {
      return;
    }

    try {
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'es-PE';
      utterance.rate = isPriority ? 1.04 : 1.02;
      utterance.pitch = isPriority ? 1.04 : 1.0;
      utterance.volume = this.volume;

      if (this.voice) {
        utterance.voice = this.voice;
      }

      this.lastSpokenText = text;
      this.lastSpokenTime = now;
      this.lastInstruction = text;

      if (isPriority) {
        // Reserve audio channel for ~4.5 seconds for priority alert
        this.priorityUntil = now + 4500;
      }

      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.warn('Voice guidance error:', err);
    }
  }

  /**
   * Repeats the last spoken navigation guidance
   */
  public repeatLastInstruction() {
    if (this.lastInstruction) {
      this.speak(this.lastInstruction, true);
    }
  }

  /**
   * Resets incident tracking memory (e.g., when route finishes or reroutes)
   */
  public resetAnnouncedIncidents() {
    this.announcedIncidents.clear();
    this.priorityUntil = 0;
  }

  /**
   * Formats a clear, concise Spanish voice alert for a traffic incident.
   * Prioritizes phrases like 'Accidente reportado adelante' to alert drivers without looking at the screen.
   */
  public formatIncidentAlertText(alert: TrafficAlert, distanceMeters?: number): string {
    const rawTitle = (alert.title || '').trim();

    let phrase = '';
    switch (alert.type) {
      case 'accident':
        phrase = 'Accidente reportado adelante';
        break;
      case 'police': {
        const policeLabel = getPoliceSubtypeLabel(normalizePoliceSubtype(alert));
        let policeDist = '';
        if (distanceMeters && distanceMeters >= 950) {
          const kmRounded = Math.max(1, Math.round(distanceMeters / 500) * 0.5);
          if (Math.abs(kmRounded - Math.round(kmRounded)) < 0.01) {
            const intKm = Math.round(kmRounded);
            policeDist = ` a ${intKm} ${intKm === 1 ? 'kilómetro' : 'kilómetros'} en tu ruta`;
          } else {
            policeDist = ` a ${kmRounded.toFixed(1)} kilómetros en tu ruta`;
          }
        } else if (distanceMeters && distanceMeters >= 150) {
          const rounded = Math.round(distanceMeters / 50) * 50;
          policeDist = ` a ${rounded} metros adelante`;
        } else {
          policeDist = ' reportado adelante';
        }
        const confirms = alert.confirmations ?? (alert.isConfirmed ? 4 : 1);
        const reliabilityNote = confirms >= 5 ? ' Verificado por la comunidad.' : '';
        return `${policeLabel}${policeDist}.${reliabilityNote}`;
      }
      case 'inspectors': {
        const inspectorLabel = getInspectorSubtypeLabel(normalizeInspectorSubtype(alert));
        let inspectorDist = '';
        if (distanceMeters && distanceMeters >= 950) {
          const kmRounded = Math.max(1, Math.round(distanceMeters / 500) * 0.5);
          if (Math.abs(kmRounded - Math.round(kmRounded)) < 0.01) {
            const intKm = Math.round(kmRounded);
            inspectorDist = ` a ${intKm} ${intKm === 1 ? 'kilómetro' : 'kilómetros'} en tu ruta`;
          } else {
            inspectorDist = ` a ${kmRounded.toFixed(1)} kilómetros en tu ruta`;
          }
        } else if (distanceMeters && distanceMeters >= 150) {
          const rounded = Math.round(distanceMeters / 50) * 50;
          inspectorDist = ` a ${rounded} metros adelante`;
        } else {
          inspectorDist = ' reportado adelante';
        }
        const confirms = alert.confirmations ?? (alert.isConfirmed ? 4 : 1);
        const reliabilityNote = confirms >= 5 ? ' Verificado por la comunidad.' : '';
        return `${inspectorLabel}${inspectorDist}.${reliabilityNote}`;
      }
      case 'speed_camera':
        phrase = 'Radar temporal de velocidad reportado adelante';
        break;
      case 'flood':
        phrase = 'Zona inundada reportada adelante';
        break;
      case 'road_closed':
        phrase = 'Vía cerrada reportada adelante';
        break;
      case 'construction':
        phrase = 'Obras en la vía reportadas adelante';
        break;
      case 'stopped_vehicle':
        phrase = 'Vehículo averiado reportado adelante';
        break;
      case 'hazard':
        phrase = 'Peligro en la vía reportado adelante';
        break;
      case 'pothole':
        phrase = 'Bache peligroso reportado adelante';
        break;
      case 'traffic':
        phrase = 'Congestión vehicular reportada adelante';
        break;
      default:
        phrase = rawTitle ? `${rawTitle} reportado adelante` : 'Incidente reportado adelante';
        break;
    }

    // Distance contextual phrasing if applicable
    let distancePhrase = '';
    if (distanceMeters && distanceMeters >= 150) {
      const rounded = Math.round(distanceMeters / 50) * 50;
      distancePhrase = ` a ${rounded} metros`;
    }

    const confirms = alert.confirmations ?? (alert.isConfirmed ? 4 : 1);
    const reliabilityNote = confirms >= 5 ? ' Verificado por la comunidad.' : '';

    return `Atención: ${phrase}${distancePhrase}.${reliabilityNote}`;
  }

  /**
   * Directly triggers high-priority spoken alert for a traffic incident
   */
  public speakTrafficIncident(alert: TrafficAlert, distanceMeters?: number) {
    const text = this.formatIncidentAlertText(alert, distanceMeters);
    this.speak(text, true, true);
  }

  /**
   * Evaluates approaching traffic incidents and prioritizes reading aloud high-confirmation
   * incidents (e.g. 'Accidente reportado adelante') to maximize driver safety.
   */
  public checkAndAnnounceTrafficIncidents(
    userCoords: Coordinates,
    alerts: TrafficAlert[],
    travelMode: TravelMode = 'driving',
    skipTypes: TrafficAlertType[] = [],
    routeCoordinates?: [number, number][],
    userHeading?: number | null
  ): boolean {
    if (this.isMuted || !alerts || alerts.length === 0) return false;

    const now = Date.now();
    // Proximity triggers: ~420m ahead for vehicles, ~100m for walking
    const maxWarningDistance = travelMode === 'walking' ? 100 : 420;
    const minWarningDistance = 25; // Ignore if user has already passed directly through it
    const maxLateralRouteMeters = 45;

    const hasRoute = Boolean(routeCoordinates && routeCoordinates.length >= 2);
    const cumDist = hasRoute ? buildCumulativeDistances(routeCoordinates!) : null;
    const userProj =
      hasRoute && cumDist
        ? projectPointOnPolyline(userCoords.lat, userCoords.lng, routeCoordinates!, cumDist)
        : null;
    const hasReliableUserHeading =
      userHeading !== null && userHeading !== undefined && Number.isFinite(userHeading);

    const candidateIncidents: Array<{
      alert: TrafficAlert;
      distance: number;
      confirms: number;
    }> = [];

    for (const alert of alerts) {
      if (alert.status === 'resolved') continue;
      if (skipTypes.includes(alert.type)) continue;

      // Identify high-confirmation incidents (>= 3 confirmations or marked confirmed)
      const confirms = alert.confirmations ?? (alert.isConfirmed ? 4 : 1);
      const isHighConfirmation = confirms >= 3 || alert.isConfirmed === true;

      // Prioritize high-confirmation incidents
      if (!isHighConfirmation) continue;

      // Deduplication: Avoid re-announcing the same incident within 2.5 minutes (150s)
      const lastAnnounced = this.announcedIncidents.get(alert.id);
      if (lastAnnounced && now - lastAnnounced < 150000) {
        continue;
      }

      const targetPoints = getAlertTargetCoords(alert);
      let bestDistance = Infinity;

      if (hasRoute && cumDist && userProj) {
        for (const pt of targetPoints) {
          const alertProj = projectPointOnPolyline(pt.lat, pt.lng, routeCoordinates!, cumDist);
          if (alertProj.distanceToRoute > maxLateralRouteMeters) continue;

          // Solo avisar si el sentido de la ruta en ese punto coincide con el reporte (<= 60°) o si es ambos sentidos
          if (!isAlertMatchingRouteHeading(alert, alertProj.segmentBearing, 60)) continue;

          const distanceAhead = alertProj.alongRouteMeters - userProj.alongRouteMeters;
          if (distanceAhead >= minWarningDistance && distanceAhead <= maxWarningDistance) {
            if (distanceAhead < bestDistance) {
              bestDistance = distanceAhead;
            }
          }
        }
      } else {
        // Sin ruta activa: filtrar por sentido de marcha del vehículo (<= 60°) y solo reportes adelante
        if (hasReliableUserHeading && !isAlertMatchingRouteHeading(alert, userHeading!, 60)) {
          continue;
        }
        for (const pt of targetPoints) {
          const distance = calculateDistanceMeters(
            userCoords.lat,
            userCoords.lng,
            pt.lat,
            pt.lng
          );
          if (distance < minWarningDistance || distance > maxWarningDistance) continue;

          if (hasReliableUserHeading) {
            const bearingToAlert = getBearing(userCoords.lat, userCoords.lng, pt.lat, pt.lng);
            if (shortestAngularDiffDeg(userHeading!, bearingToAlert) > 65) continue;
          }

          if (distance < bestDistance) {
            bestDistance = distance;
          }
        }
      }

      if (Number.isFinite(bestDistance)) {
        candidateIncidents.push({ alert, distance: bestDistance, confirms });
      }
    }

    if (candidateIncidents.length === 0) return false;

    // Sort to prioritize closest upcoming high-confirmation incident
    candidateIncidents.sort((a, b) => a.distance - b.distance);
    const target = candidateIncidents[0];

    // Build the high-priority alert text and announce immediately
    const text = this.formatIncidentAlertText(target.alert, target.distance);
    this.announcedIncidents.set(target.alert.id, now);
    this.speak(text, true, true);

    return true;
  }

  /**
   * Intelligently announces turn maneuvers at structured distances without repeating
   */
  public speakManeuver(
    stepKey: string,
    distanceMeters: number,
    instruction: string,
    travelMode: 'driving' | 'walking' = 'driving'
  ) {
    // If a priority safety announcement is active, yield and do not talk over it
    if (Date.now() < this.priorityUntil) {
      return;
    }

    if (this.currentStepKey !== stepKey) {
      this.currentStepKey = stepKey;
      this.announcedThresholds.clear();
    }

    let prompt = '';
    let threshold = '';

    if (travelMode === 'walking') {
      // Pedestrian thresholds (closer, matched to walking pace ~1.3 m/s)
      if (distanceMeters <= 15 && !this.announcedThresholds.has('w15')) {
        threshold = 'w15';
        prompt = `Ahora, ${instruction.toLowerCase()}`;
      } else if (distanceMeters > 15 && distanceMeters <= 50 && !this.announcedThresholds.has('w50')) {
        threshold = 'w50';
        prompt = `En 50 metros, ${instruction.toLowerCase()}`;
      } else if (distanceMeters > 50 && distanceMeters <= 120 && !this.announcedThresholds.has('w100')) {
        threshold = 'w100';
        prompt = `En 100 metros, ${instruction.toLowerCase()}`;
      } else if (distanceMeters > 120 && distanceMeters <= 250 && !this.announcedThresholds.has('w200')) {
        threshold = 'w200';
        prompt = `En 200 metros, ${instruction.toLowerCase()}`;
      }
    } else {
      // Driving thresholds
      if (distanceMeters <= 30 && !this.announcedThresholds.has('30')) {
        threshold = '30';
        prompt = `Ahora, ${instruction.toLowerCase()}`;
      } else if (distanceMeters > 30 && distanceMeters <= 120 && !this.announcedThresholds.has('100')) {
        threshold = '100';
        prompt = `En 100 metros, ${instruction.toLowerCase()}`;
      } else if (distanceMeters > 120 && distanceMeters <= 300 && !this.announcedThresholds.has('300')) {
        threshold = '300';
        prompt = `En 300 metros, ${instruction.toLowerCase()}`;
      } else if (distanceMeters > 300 && distanceMeters <= 550 && !this.announcedThresholds.has('500')) {
        threshold = '500';
        prompt = `En 500 metros, ${instruction.toLowerCase()}`;
      } else if (distanceMeters > 550 && distanceMeters <= 1100 && !this.announcedThresholds.has('1000')) {
        threshold = '1000';
        prompt = `En 1 kilómetro, ${instruction.toLowerCase()}`;
      }
    }

    if (prompt && threshold) {
      this.announcedThresholds.add(threshold);
      this.speak(prompt);
    }
  }
}

export const voiceGuidance = new VoiceGuidanceService();
