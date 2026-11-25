import { useState, useEffect, useRef, useCallback } from 'react';
import { Coordinates, GPSLocation } from '../types/navigation';
import { calculateDistanceMeters } from '../services/osrm';
import { getLastKnownLocation, saveLastKnownLocation } from '../services/lastKnownLocation';
import { GpsKalmanFilter } from '../services/gpsKalmanFilter';

// Default Lima center (near San Isidro / Miraflores / Javier Prado hub)
export const DEFAULT_LIMA_COORDS: Coordinates = {
  lat: -12.0975,
  lng: -77.0345,
};

function isWithinPeru(lat: number, lng: number): boolean {
  return lat >= -18.5 && lat <= 0.0 && lng >= -81.5 && lng <= -68.5;
}

export type GPSPermissionState = 'prompt' | 'granted' | 'denied' | 'error';

export function useGeolocation() {
  const [location, setLocation] = useState<GPSLocation>(() => {
    // Arranca en la última ubicación real conocida; solo usa Lima si nunca hubo una
    const start = getLastKnownLocation() ?? DEFAULT_LIMA_COORDS;
    return {
      lat: start.lat,
      lng: start.lng,
      accuracy: 12,
      speed: 0,
      heading: 0,
      altitude: null,
      timestamp: Date.now(),
    };
  });

  const [permissionState, setPermissionState] = useState<GPSPermissionState>('prompt');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isGpsSignalLost, setIsGpsSignalLost] = useState<boolean>(false);
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [isFollowing, setIsFollowing] = useState<boolean>(true);

  // References to keep track of reliable states
  const kalmanFilterRef = useRef<GpsKalmanFilter>(new GpsKalmanFilter());
  const lastPositionRef = useRef<{ lat: number; lng: number; time: number } | null>(null);
  const lastReliableHeadingRef = useRef<number>(0);
  const hasEverMovedRef = useRef<boolean>(false);
  const watchIdRef = useRef<number | null>(null);
  const simulationTimerRef = useRef<number | null>(null);
  const lastFixTimeRef = useRef<number>(Date.now());
  const watchdogTimerRef = useRef<number | null>(null);

  // Compute bearing between two coordinates
  const calculateBearing = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const y = Math.sin(((lon2 - lon1) * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180);
    const x =
      Math.cos((lat1 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180) -
      Math.sin((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.cos(((lon2 - lon1) * Math.PI) / 180);
    const bearing = (Math.atan2(y, x) * 180) / Math.PI;
    return (bearing + 360) % 360;
  };

  // Start continuous tracking with high accuracy or standard network fallback
  const startContinuousWatch = useCallback((useHighAccuracy: boolean = true) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;

    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    try {
      watchIdRef.current = navigator.geolocation.watchPosition(
        (position) => {
          setPermissionState('granted');
          setIsGpsSignalLost(false);
          setErrorMessage(null);
          lastFixTimeRef.current = Date.now();
          const { latitude, longitude, accuracy, speed, heading, altitude } = position.coords;

          // If browser GPS is outside Peru (e.g. cloud preview / VPN), stay anchored in Lima
          if (!isWithinPeru(latitude, longitude)) {
            return;
          }

          const posTime = position.timestamp || Date.now();
          const rawAccuracy = Math.round(accuracy || (useHighAccuracy ? 8 : 25));
          const rawSpeed =
            speed !== null && speed !== undefined && !isNaN(speed) && speed > 0 ? speed : 0;

          // Filtrado de Kalman 2D adaptativo para suavizar ruido GPS sin lag en movimiento
          const filtered = kalmanFilterRef.current.process({
            lat: latitude,
            lng: longitude,
            accuracy: rawAccuracy,
            speed: rawSpeed,
            heading,
            timestamp: posTime,
          });
          const filteredLat = filtered.lat;
          const filteredLng = filtered.lng;
          const currentAccuracy = filtered.accuracy;

          saveLastKnownLocation(filteredLat, filteredLng);

          let currentSpeed = rawSpeed;

          // 4. Cálculo de velocidad real (evitar velocímetro en 0):
          // Si position.coords.speed es null o 0 pero las coordenadas filtradas cambian,
          // calcula la velocidad dividiendo la distancia recorrida entre el tiempo transcurrido
          if (currentSpeed === 0 && lastPositionRef.current) {
            const distMoved = calculateDistanceMeters(
              lastPositionRef.current.lat,
              lastPositionRef.current.lng,
              filteredLat,
              filteredLng
            );
            const timeDiffSec = Math.max(0.2, (posTime - lastPositionRef.current.time) / 1000);

            // Si se desplazó >= 1.2 metros en un lapso válido (menor a 8s para evitar saltos aislados)
            if (distMoved >= 1.2 && timeDiffSec <= 8) {
              currentSpeed = distMoved / timeDiffSec; // en m/s (multiplicado por 3.6 da km/h)
            }
          }

          const isMoving = currentSpeed > 0.8 && rawAccuracy < 45;

          let derivedHeading = lastReliableHeadingRef.current;

          if (isMoving && heading !== null && !isNaN(heading) && heading >= 0) {
            derivedHeading = heading;
            lastReliableHeadingRef.current = heading;
            hasEverMovedRef.current = true;
          } else if (lastPositionRef.current) {
            const dist = calculateDistanceMeters(
              lastPositionRef.current.lat,
              lastPositionRef.current.lng,
              filteredLat,
              filteredLng
            );

            if (dist >= 2.5 && (currentSpeed > 0.5 || dist > 4.5)) {
              const b = calculateBearing(
                lastPositionRef.current.lat,
                lastPositionRef.current.lng,
                filteredLat,
                filteredLng
              );
              derivedHeading = b;
              lastReliableHeadingRef.current = b;
              hasEverMovedRef.current = true;
            }
          }

          setLocation({
            lat: filteredLat,
            lng: filteredLng,
            accuracy: currentAccuracy,
            speed: currentSpeed,
            heading: derivedHeading,
            altitude,
            timestamp: posTime,
          });

          if (rawAccuracy < 50) {
            lastPositionRef.current = {
              lat: filteredLat,
              lng: filteredLng,
              time: posTime,
            };
          }
        },
        (err) => {
          console.warn('GPS watch warning:', err.message);
          // If high accuracy fails, gracefully retry continuous watch
          if (useHighAccuracy) {
            startContinuousWatch(true);
          } else {
            setIsGpsSignalLost(true);
          }
        },
        {
          enableHighAccuracy: true,
          timeout: 3000,
          maximumAge: 0,
        }
      );
    } catch (e) {
      console.warn('Could not start watchPosition:', e);
    }
  }, []);

  // Request GPS fix with automatic fallback from High Accuracy to Standard Network Triangulation
  const requestLocation = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setPermissionState('error');
      setErrorMessage('Geolocalización no soportada en este navegador.');
      return;
    }

    setErrorMessage(null);
    setIsGpsSignalLost(false);
    lastFixTimeRef.current = Date.now();

    // Start continuous tracking immediately so coordinates stream in without delay
    startContinuousWatch(true);

    // Helper to process valid position fix
    const handleSuccess = (position: GeolocationPosition, highAcc: boolean) => {
      setPermissionState('granted');
      setIsGpsSignalLost(false);
      setErrorMessage(null);
      lastFixTimeRef.current = Date.now();

      const { latitude, longitude, accuracy, speed, heading, altitude } = position.coords;

      // If browser GPS is outside Peru (e.g. cloud preview / VPN), stay anchored in Lima
      if (!isWithinPeru(latitude, longitude)) {
        startContinuousWatch(highAcc);
        return;
      }

      const posTime = position.timestamp || Date.now();
      const rawAccuracy = Math.round(accuracy || (highAcc ? 10 : 25));
      const rawSpeed =
        speed !== null && speed !== undefined && !isNaN(speed) && speed > 0 ? speed : 0;

      const filtered = kalmanFilterRef.current.process({
        lat: latitude,
        lng: longitude,
        accuracy: rawAccuracy,
        speed: rawSpeed,
        heading,
        timestamp: posTime,
      });
      const filteredLat = filtered.lat;
      const filteredLng = filtered.lng;

      saveLastKnownLocation(filteredLat, filteredLng);

      let currentSpeed = rawSpeed;

      if (currentSpeed === 0 && lastPositionRef.current) {
        const distMoved = calculateDistanceMeters(
          lastPositionRef.current.lat,
          lastPositionRef.current.lng,
          filteredLat,
          filteredLng
        );
        const timeDiffSec = Math.max(0.2, (posTime - lastPositionRef.current.time) / 1000);
        if (distMoved >= 1.2 && timeDiffSec <= 8) {
          currentSpeed = distMoved / timeDiffSec;
        }
      }

      if (heading !== null && !isNaN(heading) && heading >= 0) {
        lastReliableHeadingRef.current = heading;
        hasEverMovedRef.current = true;
      }

      setLocation({
        lat: filteredLat,
        lng: filteredLng,
        accuracy: filtered.accuracy,
        speed: currentSpeed,
        heading: lastReliableHeadingRef.current,
        altitude,
        timestamp: posTime,
      });

      lastPositionRef.current = {
        lat: filteredLat,
        lng: filteredLng,
        time: posTime,
      };

      // Ensure continuous background watch is running with appropriate accuracy
      startContinuousWatch(highAcc);
    };

    // Tier 1: Try High Accuracy GPS
    navigator.geolocation.getCurrentPosition(
      (pos) => handleSuccess(pos, true),
      (error) => {
        console.warn('High-accuracy GPS attempt note:', error.message);
        if (error.code === error.PERMISSION_DENIED) {
          setPermissionState('denied');
          setErrorMessage(
            'Permiso de GPS denegado. Habilítalo en los permisos del navegador para navegar en tiempo real.'
          );
          return;
        }

        // Tier 2: Immediately fallback to standard network positioning
        navigator.geolocation.getCurrentPosition(
          (pos) => handleSuccess(pos, false),
          (fallbackErr) => {
            console.warn('Standard-accuracy GPS attempt note:', fallbackErr.message);
            if (fallbackErr.code === fallbackErr.PERMISSION_DENIED) {
              setPermissionState('denied');
              setErrorMessage('Permiso de GPS denegado.');
            } else {
              setPermissionState('error');
              setErrorMessage('Buscando satélites GPS. Puedes explorar el mapa mientras se sincroniza.');
            }
            // Still maintain standard watch in case signal connects
            startContinuousWatch(false);
          },
          {
            enableHighAccuracy: false,
            timeout: 15000,
            maximumAge: 30000,
          }
        );
      },
      {
        enableHighAccuracy: true,
        timeout: 3000,
        maximumAge: 0,
      }
    );
  }, [startContinuousWatch]);

  // Check browser Permissions API on mount
  useEffect(() => {
    if (typeof navigator !== 'undefined' && 'permissions' in navigator) {
      navigator.permissions
        .query({ name: 'geolocation' as PermissionName })
        .then((result) => {
          if (result.state === 'granted') {
            setPermissionState('granted');
            requestLocation();
          } else if (result.state === 'denied') {
            setPermissionState('denied');
          }
          result.onchange = () => {
            if (result.state === 'granted') {
              setPermissionState('granted');
              requestLocation();
            } else if (result.state === 'denied') {
              setPermissionState('denied');
            }
          };
        })
        .catch(() => {});
    }
  }, [requestLocation]);

  // Intelligent watchdog timer: avoids false alarms when parked or stationary
  useEffect(() => {
    watchdogTimerRef.current = window.setInterval(() => {
      if (!isSimulating && watchIdRef.current !== null) {
        const elapsed = Date.now() - lastFixTimeRef.current;
        // Only trigger signal lost if stationary without any fix for > 35 seconds
        if (elapsed > 35000) {
          setIsGpsSignalLost(true);
          // Ping standard location to verify if connection is alive
          if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
              () => {
                setIsGpsSignalLost(false);
                lastFixTimeRef.current = Date.now();
              },
              () => {},
              { enableHighAccuracy: false, timeout: 5000, maximumAge: 30000 }
            );
          }
        }
      }
    }, 5000);

    return () => {
      if (watchdogTimerRef.current !== null) {
        window.clearInterval(watchdogTimerRef.current);
      }
    };
  }, [isSimulating]);

  // Request permission on mount
  useEffect(() => {
    requestLocation();

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      if (simulationTimerRef.current !== null) {
        window.clearInterval(simulationTimerRef.current);
      }
      if (watchdogTimerRef.current !== null) {
        window.clearInterval(watchdogTimerRef.current);
      }
    };
  }, [requestLocation]);

  // Simulation mode along a polyline (for testing)
  const startSimulation = useCallback((routeCoords: [number, number][]) => {
    if (routeCoords.length < 2) return;

    if (simulationTimerRef.current !== null) {
      window.clearInterval(simulationTimerRef.current);
    }
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    kalmanFilterRef.current.reset();
    lastPositionRef.current = null;
    setIsSimulating(true);
    let index = 0;

    const startPt = routeCoords[0];
    const nextPt = routeCoords[1];
    const initialHeading = calculateBearing(startPt[0], startPt[1], nextPt[0], nextPt[1]);
    lastReliableHeadingRef.current = initialHeading;

    setLocation({
      lat: startPt[0],
      lng: startPt[1],
      accuracy: 4,
      speed: 11.5, // ~41 km/h
      heading: initialHeading,
      altitude: 120,
      timestamp: Date.now(),
    });

    simulationTimerRef.current = window.setInterval(() => {
      index++;
      if (index >= routeCoords.length) {
        if (simulationTimerRef.current !== null) {
          window.clearInterval(simulationTimerRef.current);
          simulationTimerRef.current = null;
        }
        setIsSimulating(false);
        return;
      }

      const current = routeCoords[index];
      const prev = routeCoords[index - 1];
      const heading = calculateBearing(prev[0], prev[1], current[0], current[1]);
      lastReliableHeadingRef.current = heading;

      // Realistic city driving speed
      const speedKmh = 35 + Math.sin(index / 4) * 12;
      const speedMs = speedKmh / 3.6;

      setLocation({
        lat: current[0],
        lng: current[1],
        accuracy: 4,
        speed: speedMs,
        heading: heading,
        altitude: 110,
        timestamp: Date.now(),
      });
    }, 1000);
  }, []);

  const stopSimulation = useCallback(() => {
    if (simulationTimerRef.current !== null) {
      window.clearInterval(simulationTimerRef.current);
      simulationTimerRef.current = null;
    }
    kalmanFilterRef.current.reset();
    lastPositionRef.current = null;
    setIsSimulating(false);
    requestLocation();
  }, [requestLocation]);

  return {
    location,
    permissionState,
    errorMessage,
    isGpsSignalLost,
    isSimulating,
    isFollowing,
    setIsFollowing,
    requestLocation,
    startSimulation,
    stopSimulation,
  };
}
