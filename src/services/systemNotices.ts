export interface SystemNoticeEntry {
  id: string;
  text: string;
  cause: string;
  timeLabel: string;
  timestamp: number;
}

const LEGACY_STORAGE_KEY = 'ruta_lima_system_notices_v1';

// Limpiar cualquier historial previo guardado en localStorage para no ocupar espacio
if (typeof window !== 'undefined') {
  try {
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {}
}

let lastLoggedSignature = '';
let lastLoggedAt = 0;

export function logSystemNotice(text: string, cause: string): void {
  const cleanText = (text || '').trim();
  if (!cleanText) return;

  const now = Date.now();
  const signature = `${cleanText}::${cause}`;
  if (signature === lastLoggedSignature && now - lastLoggedAt < 800) {
    return;
  }
  lastLoggedSignature = signature;
  lastLoggedAt = now;

  const d = new Date(now);
  const timeLabel = d.toLocaleTimeString('es-PE', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  console.log(`[Aviso del sistema ${timeLabel}] Causa: ${cause} | Texto: ${cleanText}`);
}
