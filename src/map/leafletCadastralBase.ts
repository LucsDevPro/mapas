import * as L from 'leaflet';
import { VectorTile } from '@mapbox/vector-tile';
import { PbfReader } from 'pbf';
import { CartographyConfig } from '../types/gis';

/**
 * Camada cartográfica cadastral 100% Leaflet (SVG/DOM, sem WebGL).
 * - Ruas desenhadas como polilinhas SVG finas (fundo branco puro)
 * - Nomes de ruas como rótulos DOM de TAMANHO FIXO (não variam com o zoom)
 * - Alta densidade de nomes, alinhados à direção de cada via e sem sobreposição
 * - Dados vetoriais OpenStreetMap (OpenFreeMap / OpenMapTiles), com fallback raster
 */

const TILEJSON_URL = 'https://tiles.openfreemap.org/planet';
const FALLBACK_TILE_TEMPLATE =
  'https://tiles.openfreemap.org/planet/20261025_080012_pt/{z}/{x}/{y}.pbf';

const MAJOR_CLASSES = new Set([
  'motorway',
  'trunk',
  'primary',
  'secondary',
  'tertiary',
  'motorway_link',
  'trunk_link',
  'primary_link',
  'secondary_link',
  'tertiary_link',
]);

const MINOR_CLASSES = new Set([
  'minor',
  'residential',
  'living_street',
  'unclassified',
  'pedestrian',
  'service',
  'road',
]);

interface RawStreet {
  klass: string;
  name?: string;
  coords: [number, number][];
}

interface ParsedTile {
  streets: RawStreet[];
  labels: RawStreet[];
  fetchedAt: number;
}

/**
 * Executa uma requisição com tempo-limite. Sem isso, uma requisição que trava
 * (rede lenta, bloqueio, servidor fora) deixa o mapa em branco para sempre,
 * porque a camada de contingência só entra quando a busca termina.
 */
async function withTimeout<T>(
  run: (signal: AbortSignal) => Promise<T>,
  outer: AbortSignal | undefined,
  ms: number
): Promise<T> {
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), ms);
  const onAbort = () => ctrl.abort();
  outer?.addEventListener('abort', onAbort);
  try {
    return await run(ctrl.signal);
  } finally {
    window.clearTimeout(timer);
    outer?.removeEventListener('abort', onAbort);
  }
}

function tilePointToLatLng(
  z: number,
  x: number,
  y: number,
  px: number,
  py: number,
  extent: number
): [number, number] {
  const lng = ((x + px / extent) / Math.pow(2, z)) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * (y + py / extent)) / Math.pow(2, z);
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return [lat, lng];
}

function latLngToTile(lat: number, lng: number, z: number) {
  const n = Math.pow(2, z);
  const x = ((lng + 180) / 360) * n;
  const latRad = (lat * Math.PI) / 180;
  const y =
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  return { x, y };
}

export class CadastralBaseLayer {
  private map: L.Map;
  private lineGroup: L.LayerGroup;
  private labelGroup: L.LayerGroup;
  private config: CartographyConfig;
  private cache = new Map<string, ParsedTile>();
  private templatePromise: Promise<string> | null = null;
  private abortController: AbortController | null = null;
  private refreshToken = 0;
  private refreshTimer: number | null = null;
  private fallbackLayer: L.TileLayer | null = null;
  private streetNames: string[] = [];
  private measureCanvas = document.createElement('canvas');
  private destroyed = false;
  private onNames?: (names: string[]) => void;
  private pendingRefresh: Promise<void> = Promise.resolve();
  private working = false;
  private completedKey = '';

  constructor(
    map: L.Map,
    config: CartographyConfig,
    onNames?: (names: string[]) => void
  ) {
    this.map = map;
    this.config = config;
    this.onNames = onNames;
    this.lineGroup = L.layerGroup([]);
    this.labelGroup = L.layerGroup([]);

    if (!map.getPane('cadastralStreets')) {
      const pane = map.createPane('cadastralStreets');
      pane.style.zIndex = '355';
      pane.style.pointerEvents = 'none';
    }
    if (!map.getPane('cadastralLabels')) {
      const pane = map.createPane('cadastralLabels');
      pane.style.zIndex = '485';
      pane.style.pointerEvents = 'none';
    }

    this.lineGroup.addTo(map);
    this.labelGroup.addTo(map);

    map.on('moveend', this.scheduleRefresh);
    map.on('zoomend', this.scheduleRefresh);
    this.refresh();
  }

  public setConfig(config: CartographyConfig) {
    this.config = config;
    this.refresh();
  }

  private computeKey(): string {
    const c = this.map.getCenter();
    return `${c.lat.toFixed(5)}|${c.lng.toFixed(5)}|${this.map
      .getZoom()
      .toFixed(2)}|${this.config.streetNameScale}|${this.config.streetLabelSpacing}|${this.config.streetNameBold}`;
  }

  /** Aguarda o carregamento/renderização dos tiles (útil antes de imprimir ou exportar) */
  public async waitUntilReady(timeoutMs = 5000): Promise<void> {
    const start = Date.now();
    if (this.working || this.completedKey !== this.computeKey()) {
      while (Date.now() - start < timeoutMs) {
        if (!this.working && this.completedKey === this.computeKey()) return;
        await new Promise<void>((resolve) => window.setTimeout(resolve, 110));
        await this.pendingRefresh.catch(() => undefined);
      }
    }
  }

  public getStreetNames(): string[] {
    return this.streetNames;
  }

  public destroy() {
    this.destroyed = true;
    this.map.off('moveend', this.scheduleRefresh);
    this.map.off('zoomend', this.scheduleRefresh);
    if (this.refreshTimer) window.clearTimeout(this.refreshTimer);
    this.abortController?.abort();
    this.lineGroup.clearLayers();
    this.labelGroup.clearLayers();
    this.map.removeLayer(this.lineGroup);
    this.map.removeLayer(this.labelGroup);
    if (this.fallbackLayer) {
      this.map.removeLayer(this.fallbackLayer);
      this.fallbackLayer = null;
    }
  }

  private scheduleRefresh = () => {
    if (this.refreshTimer) window.clearTimeout(this.refreshTimer);
    this.refreshTimer = window.setTimeout(() => this.refresh(), 160);
  };

  private getTileTemplate(): Promise<string> {
    if (!this.templatePromise) {
      this.templatePromise = (async () => {
        try {
          const json = await withTimeout(
            async (signal) => (await fetch(TILEJSON_URL, { signal })).json(),
            undefined,
            6000
          );
          const tiles: string[] = json?.tiles || [];
          const template = tiles.find((t) => t.includes('{z}'));
          if (template) return template;
        } catch {
          // usa fallback
        }
        return FALLBACK_TILE_TEMPLATE;
      })();
    }
    return this.templatePromise;
  }

  private async fetchTileParsed(
    z: number,
    x: number,
    y: number,
    template: string,
    signal: AbortSignal
  ): Promise<ParsedTile | null> {
    const key = `${z}/${x}/${y}`;
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.fetchedAt < 1000 * 60 * 30) return cached;

    const url = template
      .replace('{z}', String(z))
      .replace('{x}', String(x))
      .replace('{y}', String(y));
    try {
      const buffer = await withTimeout(
        async (s) => {
          const res = await fetch(url, { signal: s });
          if (!res.ok) return null;
          return res.arrayBuffer();
        },
        signal,
        10000
      );
      if (!buffer) return null;
      if (buffer.byteLength === 0) {
        const empty: ParsedTile = { streets: [], labels: [], fetchedAt: Date.now() };
        this.cache.set(key, empty);
        return empty;
      }
      const vt = new VectorTile(new PbfReader(new Uint8Array(buffer)));
      const streets: RawStreet[] = [];
      const labels: RawStreet[] = [];

      const transport = vt.layers['transportation'];
      if (transport) {
        for (let i = 0; i < transport.length; i++) {
          const f = transport.feature(i);
          if (f.type !== 2) continue;
          const klass = String(f.properties.class || '');
          if (!MAJOR_CLASSES.has(klass) && !MINOR_CLASSES.has(klass)) continue;
          if (f.properties.brunnel === 'tunnel') continue;
          const rows = f.loadGeometry();
          for (const row of rows) {
            if (row.length < 2) continue;
            streets.push({
              klass,
              coords: row.map((p) =>
                tilePointToLatLng(z, x, y, p.x, p.y, transport.extent)
              ),
            });
          }
        }
      }

      const transportNames = vt.layers['transportation_name'];
      if (transportNames) {
        for (let i = 0; i < transportNames.length; i++) {
          const f = transportNames.feature(i);
          if (f.type !== 2) continue;
          const name = f.properties['name:pt'] || f.properties.name;
          if (!name || typeof name !== 'string' || name.trim().length < 2) continue;
          const klass = String(f.properties.class || '');
          const rows = f.loadGeometry();
          for (const row of rows) {
            if (row.length < 2) continue;
            labels.push({
              klass,
              name: name.trim(),
              coords: row.map((p) =>
                tilePointToLatLng(z, x, y, p.x, p.y, transportNames.extent)
              ),
            });
          }
        }
      }

      const parsed: ParsedTile = { streets, labels, fetchedAt: Date.now() };
      this.cache.set(key, parsed);
      if (this.cache.size > 90) {
        const oldest = Array.from(this.cache.entries())
          .sort((a, b) => a[1].fetchedAt - b[1].fetchedAt)
          .slice(0, 20);
        for (const [k] of oldest) this.cache.delete(k);
      }
      return parsed;
    } catch {
      return null;
    }
  }

  private lineStyle(klass: string): L.PathOptions {
    const contrast = this.config.streetLineContrast;
    const major = MAJOR_CLASSES.has(klass);
    const color = major
      ? contrast === 'dark'
        ? '#475569'
        : contrast === 'light'
        ? '#94a3b8'
        : '#6b7280'
      : contrast === 'dark'
      ? '#64748b'
      : contrast === 'light'
      ? '#b6bfca'
      : '#9aa5b1';
    return {
      color,
      weight: major ? 2.4 : 1.25,
      opacity: major ? 0.92 : 0.82,
      lineCap: 'round',
      lineJoin: 'round',
      interactive: false,
      pane: 'cadastralStreets',
    };
  }

  private getLabelFont(klass: string): { size: number; weight: number } {
    const major = MAJOR_CLASSES.has(klass);
    const base = major ? 12.4 : 11.4;
    const scale = Math.max(0.8, Math.min(1.9, this.config.streetNameScale || 1.15));
    return {
      size: Math.round(base * scale * 10) / 10,
      weight: this.config.streetNameBold ? 700 : 500,
    };
  }

  public refresh(): Promise<void> {
    const run = this.doRefresh().catch(() => undefined);
    this.pendingRefresh = run;
    return run;
  }

  private async doRefresh() {
    if (this.destroyed) return;
    const token = ++this.refreshToken;
    this.abortController?.abort();
    const controller = new AbortController();
    this.abortController = controller;

    const zoom = this.map.getZoom();
    const size = this.map.getSize();
    if (size.x < 10 || size.y < 10) {
      this.working = false;
      window.setTimeout(() => this.refresh(), 400);
      return;
    }
    const startedKey = this.computeKey();
    this.working = true;

    const dataZoom = zoom >= 13.5 ? 14 : 13;
    const tileTemplate = await this.getTileTemplate();
    if (this.destroyed || token !== this.refreshToken) return;

    const n = Math.pow(2, dataZoom);
    const bounds = this.map.getBounds().pad(0.18);
    const nw = latLngToTile(bounds.getNorth(), bounds.getWest(), dataZoom);
    const se = latLngToTile(bounds.getSouth(), bounds.getEast(), dataZoom);
    const x0 = Math.max(0, Math.floor(nw.x));
    const x1 = Math.min(n - 1, Math.floor(se.x));
    const y0 = Math.max(0, Math.floor(nw.y));
    const y1 = Math.min(n - 1, Math.floor(se.y));

    const jobs: Promise<ParsedTile | null>[] = [];
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        jobs.push(
          this.fetchTileParsed(dataZoom, x, y, tileTemplate, controller.signal)
        );
      }
    }

    let parsedTiles: (ParsedTile | null)[] = [];
    try {
      parsedTiles = await Promise.all(jobs);
    } catch {
      parsedTiles = [];
    }
    if (this.destroyed || token !== this.refreshToken) {
      if (token === this.refreshToken) this.working = false;
      return;
    }

    const valid = parsedTiles.filter((t): t is ParsedTile => Boolean(t));
    const totalStreets = valid.reduce((acc, t) => acc + t.streets.length, 0);

    // Ativa camada raster de emergência somente se a base vetorial falhar por completo
    if (totalStreets === 0) {
      if (!this.fallbackLayer) {
        this.fallbackLayer = L.tileLayer(
          'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
          {
            subdomains: 'abcd',
            maxZoom: 20,
            maxNativeZoom: 19,
            crossOrigin: true,
            attribution: '© OpenStreetMap • © CARTO',
            pane: 'tilePane',
          }
        ).addTo(this.map);
      }
      this.working = false;
      this.completedKey = startedKey;
      return;
    }
    if (this.fallbackLayer) {
      this.map.removeLayer(this.fallbackLayer);
      this.fallbackLayer = null;
    }

    // ---------- 1) Ruas como linhas SVG ----------
    this.lineGroup.clearLayers();
    const maxLat = bounds.getNorth() + 0.02;
    const minLat = bounds.getSouth() - 0.02;
    const maxLng = bounds.getEast() + 0.02;
    const minLng = bounds.getWest() - 0.02;
    const lineLayers: L.Polyline[] = [];
    for (const tile of valid) {
      for (const street of tile.streets) {
        const inside = street.coords.some(
          ([lat, lng]) =>
            lat <= maxLat && lat >= minLat && lng <= maxLng && lng >= minLng
        );
        if (!inside) continue;
        lineLayers.push(
          L.polyline(street.coords, this.lineStyle(street.klass))
        );
      }
    }
    for (const l of lineLayers) l.addTo(this.lineGroup);

    // ---------- 2) Nomes das ruas: rótulos fixos, densos e alinhados ----------
    this.labelGroup.clearLayers();
    const namesFound = new Set<string>();
    const occupied: { x0: number; y0: number; x1: number; y1: number }[] = [];
    const ctx = this.measureCanvas.getContext('2d');
    const spacing = Math.max(45, Math.min(300, this.config.streetLabelSpacing || 110));
    const viewport = L.bounds([0, 0], [size.x, size.y]);
    let labelCount = 0;

    // Prioriza avenidas/ruas principais e depois as locais
    const sortedLabels = valid
      .flatMap((t) => t.labels)
      .sort((a, b) => {
        const am = MAJOR_CLASSES.has(a.klass) ? 0 : 1;
        const bm = MAJOR_CLASSES.has(b.klass) ? 0 : 1;
        return am - bm;
      });

    for (const street of sortedLabels) {
      if (!street.name) continue;
      namesFound.add(street.name);
      if (labelCount >= 480) continue;

      const pts = street.coords.map(([lat, lng]) =>
        this.map.latLngToContainerPoint(L.latLng(lat, lng))
      );
      // Comprimento total em pixels
      let total = 0;
      const segLens: number[] = [];
      for (let i = 1; i < pts.length; i++) {
        const d = pts[i].distanceTo(pts[i - 1]);
        segLens.push(d);
        total += d;
      }
      if (total < 48) continue;

      const { size: fontSize, weight } = this.getLabelFont(street.klass);
      if (ctx) {
        ctx.font = `${weight} ${fontSize}px Inter, "Noto Sans", sans-serif`;
      }
      const textWidth = ctx
        ? ctx.measureText(street.name).width
        : street.name.length * fontSize * 0.55;
      const textHeight = fontSize * 1.32;

      const effectiveSpacing = Math.max(spacing, textWidth + 34);
      const attempts = Math.max(1, Math.floor(total / effectiveSpacing));

      for (let a = 0; a < attempts; a++) {
        const targetDist =
          attempts === 1
            ? total / 2
            : effectiveSpacing * (a + 0.5) + (total % effectiveSpacing) / 2;
        let dist = 0;
        let segIndex = 0;
        for (; segIndex < pts.length - 1; segIndex++) {
          if (dist + segLens[segIndex] >= targetDist) break;
          dist += segLens[segIndex];
        }
        if (segIndex >= pts.length - 1) continue;
        const p0 = pts[segIndex];
        const p1 = pts[segIndex + 1];
        const segLen = segLens[segIndex] || 1;
        const t = Math.max(0, Math.min(1, (targetDist - dist) / segLen));
        const cx = p0.x + (p1.x - p0.x) * t;
        const cy = p0.y + (p1.y - p0.y) * t;

        // Ângulo da rua (mantém o texto sempre legível, sem virar de cabeça para baixo)
        let angle = (Math.atan2(p1.y - p0.y, p1.x - p0.x) * 180) / Math.PI;
        if (angle > 90) angle -= 180;
        if (angle < -90) angle += 180;

        const diagonal =
          Math.abs(Math.cos((angle * Math.PI) / 180)) * textWidth +
          Math.abs(Math.sin((angle * Math.PI) / 180)) * textHeight;
        const boxW = diagonal + 6;
        const boxH = textHeight + 6;
        const rect = {
          x0: cx - boxW / 2,
          y0: cy - boxH / 2,
          x1: cx + boxW / 2,
          y1: cy + boxH / 2,
        };

        if (!viewport.contains(L.point(cx, cy))) continue;
        if (
          rect.x0 < -10 ||
          rect.y0 < -10 ||
          rect.x1 > size.x + 10 ||
          rect.y1 > size.y + 10
        ) {
          continue;
        }
        const collides = occupied.some(
          (o) =>
            rect.x0 < o.x1 + 2 &&
            rect.x1 > o.x0 - 2 &&
            rect.y0 < o.y1 + 1 &&
            rect.y1 > o.y0 - 1
        );
        if (collides) continue;

        occupied.push(rect);
        labelCount += 1;

        const halo = 'rgba(255,255,255,1)';
        const icon = L.divIcon({
          className: 'cadastral-street-label',
          html: `<div style="transform: translate(-50%,-50%) rotate(${angle.toFixed(
            2
          )}deg); transform-origin: center center; white-space: nowrap; pointer-events: none;">
              <span style="font-family: Inter, 'Noto Sans', sans-serif; font-size: ${fontSize}px; font-weight: ${weight}; color: #111827; letter-spacing: 0.01em; text-shadow: 0 0 2px ${halo}, 0 0 3px ${halo}, 1px 1px 0 ${halo}, -1px 1px 0 ${halo}, 1px -1px 0 ${halo}, -1px -1px 0 ${halo};">${street.name
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')}</span>
            </div>`,
          iconSize: [0, 0],
          iconAnchor: [0, 0],
        });
        L.marker([street.coords[0][0], street.coords[0][1]], {
          icon,
          interactive: false,
          keyboard: false,
          pane: 'cadastralLabels',
          zIndexOffset: MAJOR_CLASSES.has(street.klass) ? 20 : 0,
        })
          .setLatLng(this.map.containerPointToLatLng(L.point(cx, cy)))
          .addTo(this.labelGroup);
      }
    }

    this.streetNames = Array.from(namesFound).sort((a, b) =>
      a.localeCompare(b, 'pt-BR')
    );
    this.working = false;
    this.completedKey = startedKey;
    this.onNames?.(this.streetNames);
  }
}
