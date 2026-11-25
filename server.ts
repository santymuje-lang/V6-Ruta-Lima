import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getCliArg(flag: string): string | undefined {
  const eqPrefix = `${flag}=`;
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg === flag && i + 1 < process.argv.length) {
      return process.argv[i + 1];
    }
    if (arg.startsWith(eqPrefix)) {
      return arg.slice(eqPrefix.length);
    }
  }
  return undefined;
}

const cliPort = Number(getCliArg('--port'));
const PORT =
  Number.isFinite(cliPort) && cliPort > 0
    ? cliPort
    : process.env.NODE_ENV === 'production'
      ? Number(process.env.PORT) || 3000
      : 3000;
const HOST = getCliArg('--host') || '0.0.0.0';

function decodePolyline6(encoded: string): [number, number][] {
  const coords: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    const dlat = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    const dlng = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    // GeoJSON format: [lng, lat]
    coords.push([lng / 1e6, lat / 1e6]);
  }
  return coords;
}

function mapValhallaManeuver(valhallaType: number): { type: string; modifier?: string } {
  switch (valhallaType) {
    case 1:
    case 2:
    case 3:
      return { type: 'depart', modifier: 'straight' };
    case 4:
    case 5:
    case 6:
      return { type: 'arrive' };
    case 9:
      return { type: 'turn', modifier: 'slight-right' };
    case 10:
      return { type: 'turn', modifier: 'right' };
    case 11:
      return { type: 'turn', modifier: 'sharp-right' };
    case 12:
    case 13:
      return { type: 'turn', modifier: 'uturn' };
    case 14:
      return { type: 'turn', modifier: 'sharp-left' };
    case 15:
      return { type: 'turn', modifier: 'left' };
    case 16:
      return { type: 'turn', modifier: 'slight-left' };
    case 17:
    case 18:
    case 19:
      // Valhalla: 17 = rampa recta, 18 = rampa derecha, 19 = rampa izquierda
      return {
        type: 'on ramp',
        modifier: valhallaType === 18 ? 'right' : valhallaType === 19 ? 'left' : 'straight',
      };
    case 20:
    case 21:
      // Valhalla: 20 = salida derecha, 21 = salida izquierda
      return { type: 'off ramp', modifier: valhallaType === 20 ? 'right' : 'left' };
    case 22:
    case 23:
    case 24:
      // Valhalla: 22 = mantenerse recto, 23 = mantenerse a la derecha, 24 = mantenerse a la izquierda
      return {
        type: 'fork',
        modifier: valhallaType === 23 ? 'right' : valhallaType === 24 ? 'left' : 'straight',
      };
    case 25:
      return { type: 'merge', modifier: 'straight' };
    case 26:
    case 27:
      return { type: 'roundabout', modifier: 'right' };
    default:
      return { type: 'continue', modifier: 'straight' };
  }
}

async function fetchJsonWithTimeout(
  url: string,
  timeoutMs: number,
  init?: RequestInit
): Promise<{ status: number; data: any } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const text = await res.text();
    let parsed: any = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
    return { status: res.status, data: parsed };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function isOkOsrm(resp: { status: number; data: any } | null): boolean {
  return Boolean(
    resp &&
      resp.status >= 200 &&
      resp.status < 300 &&
      resp.data &&
      resp.data.code === 'Ok' &&
      Array.isArray(resp.data.routes) &&
      resp.data.routes.length > 0
  );
}

async function queryValhallaAsOSRM(
  originLng: number,
  originLat: number,
  destLng: number,
  destLat: number,
  profile: string,
  timeoutMs: number = 9000
): Promise<any | null> {
  const costing = profile === 'foot' ? 'pedestrian' : 'auto';
  const resp = await fetchJsonWithTimeout('https://valhalla1.openstreetmap.de/route', timeoutMs, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      locations: [
        { lat: originLat, lon: originLng },
        { lat: destLat, lon: destLng },
      ],
      costing,
      alternates: 2,
      directions_options: { units: 'kilometers', language: 'es-ES' },
    }),
  });

  if (!resp || resp.status < 200 || resp.status >= 300 || !resp.data?.trip?.legs?.length) {
    return null;
  }

  const trips = [resp.data, ...(Array.isArray(resp.data.alternates) ? resp.data.alternates : [])];
  const routes = trips
    .map((t: any) => {
      const trip = t?.trip;
      if (!trip || !Array.isArray(trip.legs) || trip.legs.length === 0) return null;

      const allCoords: [number, number][] = [];
      const osrmLegs = trip.legs.map((leg: any) => {
        const legCoords = leg.shape ? decodePolyline6(leg.shape) : [];
        if (legCoords.length > 0) {
          allCoords.push(...legCoords);
        }
        const maneuvers = Array.isArray(leg.maneuvers) ? leg.maneuvers : [];
        const steps = maneuvers.map((m: any) => {
          const shapeIdx = Math.min(
            Math.max(0, Number(m.begin_shape_index) || 0),
            Math.max(0, legCoords.length - 1)
          );
          const loc = legCoords[shapeIdx] || [originLng, originLat];
          const mapped = mapValhallaManeuver(Number(m.type));
          const roadName =
            Array.isArray(m.street_names) && m.street_names.length > 0 ? m.street_names[0] : '';
          return {
            distance: (Number(m.length) || 0) * 1000,
            duration: Number(m.time) || 0,
            name: roadName,
            maneuver: {
              type: mapped.type,
              modifier: mapped.modifier,
              location: loc,
            },
          };
        });

        return {
          distance: (Number(leg.summary?.length) || 0) * 1000,
          duration: Number(leg.summary?.time) || 0,
          summary: steps.find((s: any) => s.name)?.name || 'Vías principales de Lima',
          steps,
        };
      });

      if (allCoords.length < 2) return null;

      return {
        distance: (Number(trip.summary?.length) || 0) * 1000,
        duration: Number(trip.summary?.time) || 0,
        geometry: {
          type: 'LineString',
          coordinates: allCoords,
        },
        legs: osrmLegs,
      };
    })
    .filter(Boolean);

  if (routes.length === 0) return null;
  return { code: 'Ok', routes };
}

async function startServer() {
  const app = express();
  app.use(express.urlencoded({ extended: false, limit: '32kb' }));
  app.use(express.json({ limit: '32kb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  // Streaming HTTP Range proxy for PMTiles hosted on GitHub Releases (GitHub lacks CORS headers on release redirects)
  const ALLOWED_PMTILES_HOSTS = new Set([
    'github.com',
    'release-assets.githubusercontent.com',
    'objects.githubusercontent.com',
    'raw.githubusercontent.com',
  ]);
  const resolvedPmtilesRedirectCache = new Map<string, { finalUrl: string; expiresAt: number }>();

  const handlePmtilesProxy = async (req: express.Request, res: express.Response) => {
    const rawUrl = String(req.query.url || '').trim();
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(rawUrl);
    } catch {
      res.status(400).json({ error: 'URL de PMTiles inválida' });
      return;
    }

    if (parsedUrl.protocol !== 'https:' || !ALLOWED_PMTILES_HOSTS.has(parsedUrl.hostname)) {
      res.status(403).json({ error: 'Host de PMTiles no permitido' });
      return;
    }

    const fetchWithManualRedirects = async (
      targetUrl: string,
      rangeHeader?: string
    ): Promise<{ upstream: Response; resolvedUrl: string }> => {
      let currentUrl = targetUrl;
      for (let hop = 0; hop < 6; hop++) {
        const currentParsed = new URL(currentUrl);
        if (currentParsed.protocol !== 'https:' || !ALLOWED_PMTILES_HOSTS.has(currentParsed.hostname)) {
          throw new Error('Redirect host not allowed');
        }
        const headers: Record<string, string> = {
          'User-Agent': 'RutaLimaNav/1.0',
        };
        if (rangeHeader) {
          headers['Range'] = rangeHeader;
        }
        if (
          process.env.GITHUB_PMTILES_TOKEN &&
          (currentParsed.hostname === 'github.com' || currentParsed.hostname === 'api.github.com')
        ) {
          headers['Authorization'] = `Bearer ${process.env.GITHUB_PMTILES_TOKEN}`;
        }

        const resp = await fetch(currentUrl, {
          method: req.method === 'HEAD' ? 'HEAD' : 'GET',
          headers,
          redirect: 'manual',
        });

        if (resp.status >= 300 && resp.status < 400) {
          const loc = resp.headers.get('location');
          if (!loc) return { upstream: resp, resolvedUrl: currentUrl };
          currentUrl = new URL(loc, currentUrl).toString();
          continue;
        }
        return { upstream: resp, resolvedUrl: currentUrl };
      }
      throw new Error('Too many redirects');
    };

    try {
      const rangeHeader = typeof req.headers.range === 'string' ? req.headers.range : undefined;
      const now = Date.now();
      const cached = resolvedPmtilesRedirectCache.get(rawUrl);
      const startUrl = cached && cached.expiresAt > now ? cached.finalUrl : rawUrl;

      let { upstream, resolvedUrl } = await fetchWithManualRedirects(startUrl, rangeHeader);

      if (startUrl !== rawUrl && (upstream.status === 401 || upstream.status === 403 || upstream.status === 404)) {
        resolvedPmtilesRedirectCache.delete(rawUrl);
        ({ upstream, resolvedUrl } = await fetchWithManualRedirects(rawUrl, rangeHeader));
      }

      if (upstream.ok && resolvedUrl !== rawUrl) {
        resolvedPmtilesRedirectCache.set(rawUrl, {
          finalUrl: resolvedUrl,
          expiresAt: now + 3 * 60 * 1000,
        });
      }

      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', 'Range, If-Match');
      res.setHeader(
        'Access-Control-Expose-Headers',
        'Content-Range, Content-Length, Accept-Ranges, ETag, Cache-Control'
      );

      for (const h of [
        'content-type',
        'content-length',
        'content-range',
        'accept-ranges',
        'etag',
        'cache-control',
        'last-modified',
      ]) {
        const val = upstream.headers.get(h);
        if (val) res.setHeader(h, val);
      }
      if (!upstream.headers.get('accept-ranges')) {
        res.setHeader('Accept-Ranges', 'bytes');
      }

      res.status(upstream.status);
      if (req.method === 'HEAD') {
        res.end();
        return;
      }

      const buf = Buffer.from(await upstream.arrayBuffer());
      res.send(buf);
    } catch (err: any) {
      res.status(502).json({ error: err?.message || 'Error al obtener PMTiles' });
    }
  };

  app.head('/api/pmtiles', handlePmtilesProxy);
  app.get('/api/pmtiles', handlePmtilesProxy);

  const overpassProxyCache = new Map<
    string,
    { elements: any[]; endpoint: string; status: number; timestamp: number }
  >();
  const OVERPASS_PROXY_CACHE_TTL_MS = 10 * 60 * 1000;
  const OVERPASS_PROXY_CACHE_MAX = 120;

  app.post('/api/overpass', async (req, res) => {
    const query = String(req.body?.data || req.body?.query || '').trim();
    if (!query || query.length > 4500) {
      res.status(400).json({ elements: [], error: 'Query inválida o demasiado larga' });
      return;
    }

    const now = Date.now();
    const cached = overpassProxyCache.get(query);
    if (cached && now - cached.timestamp <= OVERPASS_PROXY_CACHE_TTL_MS) {
      res.json({
        elements: cached.elements,
        endpoint: `${cached.endpoint} (cache)`,
        status: cached.status,
      });
      return;
    }
    if (cached) {
      overpassProxyCache.delete(query);
    }

    const mirrors = [
      { url: 'https://overpass.openstreetmap.fr/api/interpreter', timeoutMs: 8000 },
      { url: 'https://overpass-api.de/api/interpreter', timeoutMs: 5500 },
      { url: 'https://overpass.kumi.systems/api/interpreter', timeoutMs: 5500 },
    ];

    const mirrorErrors: string[] = [];

    for (const mirror of mirrors) {
      const resp = await fetchJsonWithTimeout(mirror.url, mirror.timeoutMs, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          Accept: 'application/json, */*',
          'User-Agent': 'RutaLimaNav/1.0 (+https://rutalima.app)',
        },
        body: `data=${encodeURIComponent(query)}`,
      });
      const count = Array.isArray(resp?.data?.elements) ? resp!.data.elements.length : 0;
      const status = resp?.status ?? 0;
      const hasValidElementsArray =
        resp !== null &&
        resp.status >= 200 &&
        resp.status < 300 &&
        Array.isArray(resp.data?.elements);

      console.log(`[Overpass Proxy] ${mirror.url} -> status=${status}, elements=${count}`);
      if (hasValidElementsArray) {
        if (overpassProxyCache.size >= OVERPASS_PROXY_CACHE_MAX) {
          const oldestKey = overpassProxyCache.keys().next().value;
          if (oldestKey) overpassProxyCache.delete(oldestKey);
        }
        overpassProxyCache.set(query, {
          elements: resp!.data.elements,
          endpoint: mirror.url,
          status: resp!.status,
          timestamp: Date.now(),
        });

        res.json({
          elements: resp!.data.elements,
          endpoint: mirror.url,
          status: resp!.status,
        });
        return;
      }
      mirrorErrors.push(
        `${new URL(mirror.url).hostname}: ${status === 0 ? 'timeout/red' : `HTTP ${status}`}`
      );
    }

    res.status(502).json({
      elements: [],
      status: 502,
      error: mirrorErrors.join(' | ') || 'Overpass no disponible',
    });
  });

  app.get('/api/route', async (req, res) => {
    const origin = String(req.query.origin || '');
    const destination = String(req.query.destination || '');
    const waypoint = req.query.waypoint ? String(req.query.waypoint) : '';
    const profile = String(req.query.profile || 'driving') === 'foot' ? 'foot' : 'driving';
    const bearings = req.query.bearings ? String(req.query.bearings) : '';
    const continueStraight = req.query.continue_straight === 'true';
    const radiuses = req.query.radiuses ? String(req.query.radiuses) : '';
    const strict = req.query.strict === 'true';
    const tScale = Math.min(3, Math.max(1, Number(req.query.tscale) || 1));

    const parseCoordPair = (val: string): [number, number] | null => {
      const parts = val.split(',').map((s) => Number(s.trim()));
      if (parts.length !== 2 || !Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) {
        return null;
      }
      return [parts[0], parts[1]];
    };

    const origPair = parseCoordPair(origin);
    const destPair = parseCoordPair(destination);
    if (!origPair || !destPair) {
      res.status(400).json({ code: 'InvalidQuery', message: 'Invalid origin or destination coordinates' });
      return;
    }

    const coordPath = waypoint ? `${origin};${waypoint};${destination}` : `${origin};${destination}`;
    const alternativesParam = waypoint ? '' : '&alternatives=true';
    const straightParam = continueStraight ? '&continue_straight=true' : '';
    const bearingsParam = bearings ? `&bearings=${encodeURIComponent(bearings)}` : '';
    const radiusesParam = radiuses ? `&radiuses=${encodeURIComponent(radiuses)}` : '';

    // 1. Primary OSRM with exact requested parameters
    const primaryUrl = `https://router.project-osrm.org/route/v1/${profile}/${coordPath}?overview=full&geometries=geojson&steps=true${alternativesParam}${straightParam}${bearingsParam}${radiusesParam}`;
    const primaryResp = await fetchJsonWithTimeout(primaryUrl, Math.round(8000 * tScale));
    if (isOkOsrm(primaryResp)) {
      res.json(primaryResp!.data);
      return;
    }

    // If caller requested strict mode (e.g. Attempt 1 heading-constrained / Attempt 2 forward-waypoint),
    // return early so caller can proceed to its next intentional tier cleanly.
    if (strict) {
      res.status(200).json({ code: primaryResp?.data?.code || 'NoRoute', routes: [] });
      return;
    }

    // 2. Primary OSRM plain fallback (no bearings, no continue_straight)
    if (bearings || continueStraight || waypoint) {
      const plainUrl = `https://router.project-osrm.org/route/v1/${profile}/${origin};${destination}?overview=full&geometries=geojson&steps=true&alternatives=true`;
      const plainResp = await fetchJsonWithTimeout(plainUrl, Math.round(8000 * tScale));
      if (isOkOsrm(plainResp)) {
        res.json(plainResp!.data);
        return;
      }
    }

    // 3. Primary OSRM unlimited snap radius fallback
    const unlimitedUrl = `https://router.project-osrm.org/route/v1/${profile}/${origin};${destination}?overview=full&geometries=geojson&steps=true&alternatives=true&radiuses=unlimited;unlimited`;
    const unlimitedResp = await fetchJsonWithTimeout(unlimitedUrl, Math.round(8000 * tScale));
    if (isOkOsrm(unlimitedResp)) {
      res.json(unlimitedResp!.data);
      return;
    }

    // 4. Secondary OSRM (routing.openstreetmap.de)
    const osmDeRouter = profile === 'foot' ? 'routed-foot' : 'routed-car';
    const secondaryUrl = `https://routing.openstreetmap.de/${osmDeRouter}/route/v1/driving/${origin};${destination}?overview=full&geometries=geojson&steps=true&alternatives=true`;
    const secondaryResp = await fetchJsonWithTimeout(secondaryUrl, Math.round(9000 * tScale));
    if (isOkOsrm(secondaryResp)) {
      res.json(secondaryResp!.data);
      return;
    }

    // 5. Driving fallback when foot profile failed
    if (profile === 'foot') {
      const footDriveUrl = `https://router.project-osrm.org/route/v1/driving/${origin};${destination}?overview=full&geometries=geojson&steps=true&alternatives=true&radiuses=unlimited;unlimited`;
      const footDriveResp = await fetchJsonWithTimeout(footDriveUrl, Math.round(8000 * tScale));
      if (isOkOsrm(footDriveResp)) {
        res.json(footDriveResp!.data);
        return;
      }
    }

    // 6. Valhalla OpenStreetMap.de fallback (handles cases where OSRM fails or rate-limits)
    const valhallaData = await queryValhallaAsOSRM(
      origPair[0],
      origPair[1],
      destPair[0],
      destPair[1],
      profile,
      Math.round(9000 * tScale)
    );
    if (valhallaData) {
      res.json(valhallaData);
      return;
    }

    res.status(200).json({
      code: primaryResp?.data?.code || 'NoRoute',
      routes: [],
      message: 'No routable path returned by upstream engines',
    });
  });

  const httpServer = http.createServer(app);

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: true,
        ws: { server: httpServer },
        hmr: process.env.DISABLE_HMR === 'true' ? false : true,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, HOST, () => {
    console.log(`Ruta Lima server listening on http://${HOST}:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
