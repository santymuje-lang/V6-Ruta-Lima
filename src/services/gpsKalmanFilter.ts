/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { getDistanceMeters } from './routeMatching';

export interface KalmanGpsInput {
  lat: number;
  lng: number;
  accuracy: number;
  speed?: number | null;
  heading?: number | null;
  timestamp: number;
}

export interface KalmanGpsOutput {
  lat: number;
  lng: number;
  accuracy: number;
  kalmanGain: number;
  wasReset: boolean;
}

const METERS_PER_DEG_LAT = 110540;
const MIN_ACCURACY_METERS = 3;
const MAX_ACCURACY_METERS = 100;
const MAX_DT_BEFORE_RESET_SEC = 12;
const HARD_JUMP_BASE_METERS = 120;
const PREDICTION_VELOCITY_DAMPING = 0.75;

/**
 * Filtro de Kalman 2D adaptativo a precisión y velocidad para coordenadas GPS.
 *
 * - Suaviza el jitter y los saltos multipath (especialmente en ciudad o detenido).
 * - Incorpora predicción por velocidad/rumbo durante Δt para evitar retraso (lag)
 *   al conducir a velocidad media/alta.
 * - Ajusta dinámicamente el ruido de proceso Q según la velocidad y el ruido de medición R
 *   según la precisión reportada por el GPS (accuracy²).
 * - Se reinicia automáticamente ante pérdidas largas de señal (> 12s) o teletransportes
 *   reales (salida de túneles / cambio de ubicación).
 */
export class GpsKalmanFilter {
  private initialized = false;
  private lat = 0;
  private lng = 0;
  private variance = 0; // m²
  private timestampMs = 0;
  private vx = 0; // Este (m/s)
  private vy = 0; // Norte (m/s)

  public reset(): void {
    this.initialized = false;
    this.lat = 0;
    this.lng = 0;
    this.variance = 0;
    this.timestampMs = 0;
    this.vx = 0;
    this.vy = 0;
  }

  public isInitialized(): boolean {
    return this.initialized;
  }

  public process(input: KalmanGpsInput): KalmanGpsOutput {
    const rawLat = input.lat;
    const rawLng = input.lng;
    const nowMs = Number.isFinite(input.timestamp) && input.timestamp > 0 ? input.timestamp : Date.now();
    const clampedAcc = Math.max(
      MIN_ACCURACY_METERS,
      Math.min(MAX_ACCURACY_METERS, Number.isFinite(input.accuracy) && input.accuracy > 0 ? input.accuracy : 12)
    );
    const rawSpeed =
      input.speed !== null && input.speed !== undefined && Number.isFinite(input.speed) && input.speed > 0
        ? input.speed
        : 0;
    const hasValidHeading =
      input.heading !== null &&
      input.heading !== undefined &&
      Number.isFinite(input.heading) &&
      input.heading >= 0;

    // 1. Inicialización con el primer fix válido
    if (!this.initialized) {
      this.initialized = true;
      this.lat = rawLat;
      this.lng = rawLng;
      this.variance = clampedAcc * clampedAcc;
      this.timestampMs = nowMs;
      this.updateVelocityFromSensors(rawSpeed, hasValidHeading ? (input.heading as number) : null, 1);
      return {
        lat: this.lat,
        lng: this.lng,
        accuracy: Math.round(clampedAcc),
        kalmanGain: 1,
        wasReset: true,
      };
    }

    const dtSec = (nowMs - this.timestampMs) / 1000;
    const distFromState = getDistanceMeters(this.lat, this.lng, rawLat, rawLng);

    // Ignorar timestamps fuera de orden manteniendo el estado actual
    if (dtSec < -0.5) {
      return {
        lat: this.lat,
        lng: this.lng,
        accuracy: Math.round(Math.max(MIN_ACCURACY_METERS, Math.sqrt(this.variance))),
        kalmanGain: 0,
        wasReset: false,
      };
    }

    const safeDt = Math.max(0.05, Math.min(MAX_DT_BEFORE_RESET_SEC, dtSec > 0 ? dtSec : 0.25));
    const maxPlausibleMove = Math.max(
      HARD_JUMP_BASE_METERS,
      Math.max(rawSpeed, Math.hypot(this.vx, this.vy)) * safeDt * 2.8 + clampedAcc * 2.5
    );

    // 2. Reinicio limpio ante pausas largas (> 12s) o salto real grande (ej. salida de túnel)
    if (dtSec > MAX_DT_BEFORE_RESET_SEC || (distFromState > maxPlausibleMove && clampedAcc <= 45)) {
      this.lat = rawLat;
      this.lng = rawLng;
      this.variance = clampedAcc * clampedAcc;
      this.timestampMs = nowMs;
      this.vx = 0;
      this.vy = 0;
      this.updateVelocityFromSensors(rawSpeed, hasValidHeading ? (input.heading as number) : null, 1);
      return {
        lat: this.lat,
        lng: this.lng,
        accuracy: Math.round(clampedAcc),
        kalmanGain: 1,
        wasReset: true,
      };
    }

    // 3. Zona muerta estacionaria: evita micro-derivas GPS cuando el vehículo está detenido
    const currentSpeedEst = Math.max(rawSpeed, Math.hypot(this.vx, this.vy));
    if (rawSpeed < 0.5 && distFromState < Math.min(2.2, clampedAcc * 0.22)) {
      this.vx *= 0.3;
      this.vy *= 0.3;
      this.timestampMs = nowMs;
      return {
        lat: this.lat,
        lng: this.lng,
        accuracy: Math.round(Math.min(clampedAcc, Math.max(MIN_ACCURACY_METERS, Math.sqrt(this.variance)))),
        kalmanGain: 0,
        wasReset: false,
      };
    }

    // 4. Paso de PREDICCIÓN (avance según velocidad estimada amortiguada para evitar lag)
    const metersPerDegLng = Math.max(1e-5, 111320 * Math.cos((this.lat * Math.PI) / 180));
    let predLat = this.lat;
    let predLng = this.lng;

    if (currentSpeedEst >= 1.0 && dtSec > 0 && dtSec <= 4.0) {
      predLat += (this.vy * safeDt * PREDICTION_VELOCITY_DAMPING) / METERS_PER_DEG_LAT;
      predLng += (this.vx * safeDt * PREDICTION_VELOCITY_DAMPING) / metersPerDegLng;
    }

    // Ruido de proceso Q adaptativo según velocidad (bajo detenido, ágil en movimiento/curvas)
    let qMetersPerSec: number;
    if (rawSpeed < 0.8 && distFromState < 4) {
      qMetersPerSec = 0.45;
    } else if (currentSpeedEst <= 15) {
      qMetersPerSec = Math.max(2.5, currentSpeedEst * 0.48);
    } else {
      qMetersPerSec = Math.min(12, currentSpeedEst * 0.52);
    }

    this.variance += safeDt * qMetersPerSec * qMetersPerSec;

    // 5. Paso de ACTUALIZACIÓN (fusión con medición GPS ponderada por precisión²)
    let effectiveAcc = clampedAcc;
    // Penalizar picos de mala precisión si el filtro ya convergió bien
    if (clampedAcc > 65 && Math.sqrt(this.variance) < 15) {
      effectiveAcc = clampedAcc * 2.0;
    }

    const measurementVariance = effectiveAcc * effectiveAcc;
    const kalmanGain = this.variance / (this.variance + measurementVariance);

    const prevLat = this.lat;
    const prevLng = this.lng;

    this.lat = predLat + kalmanGain * (rawLat - predLat);
    this.lng = predLng + kalmanGain * (rawLng - predLng);
    this.variance = Math.max(
      MIN_ACCURACY_METERS * MIN_ACCURACY_METERS,
      (1 - kalmanGain) * this.variance
    );
    this.timestampMs = nowMs;

    // 6. Actualizar vector de velocidad suavizado para el próximo paso de predicción
    const stepDx = (this.lng - prevLng) * metersPerDegLng;
    const stepDy = (this.lat - prevLat) * METERS_PER_DEG_LAT;
    const stepVx = stepDx / safeDt;
    const stepVy = stepDy / safeDt;

    if (rawSpeed >= 1.0 && hasValidHeading) {
      this.updateVelocityFromSensors(rawSpeed, input.heading as number, 0.55);
    } else if (safeDt >= 0.15) {
      const alphaVel = rawSpeed < 0.5 ? 0.25 : 0.45;
      this.vx = this.vx * (1 - alphaVel) + stepVx * alphaVel;
      this.vy = this.vy * (1 - alphaVel) + stepVy * alphaVel;
      if (Math.hypot(this.vx, this.vy) < 0.35) {
        this.vx = 0;
        this.vy = 0;
      }
    }

    const filteredAccuracy = Math.round(
      Math.max(MIN_ACCURACY_METERS, Math.min(clampedAcc, Math.sqrt(this.variance)))
    );

    return {
      lat: this.lat,
      lng: this.lng,
      accuracy: filteredAccuracy,
      kalmanGain,
      wasReset: false,
    };
  }

  private updateVelocityFromSensors(
    speedMps: number,
    headingDeg: number | null,
    alpha: number
  ): void {
    if (speedMps < 0.5 || headingDeg === null || !Number.isFinite(headingDeg)) {
      this.vx *= 1 - alpha;
      this.vy *= 1 - alpha;
      return;
    }
    const rad = (headingDeg * Math.PI) / 180;
    const targetVx = speedMps * Math.sin(rad);
    const targetVy = speedMps * Math.cos(rad);
    this.vx = this.vx * (1 - alpha) + targetVx * alpha;
    this.vy = this.vy * (1 - alpha) + targetVy * alpha;
  }
}
