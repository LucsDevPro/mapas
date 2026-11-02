import {
  CadastralFeature,
  DEFAULT_STYLE_PRESETS,
  FeatureKind,
  FeatureStyle,
  LatLngTuple,
  NeighborhoodMapProject,
} from '../types/gis';
import { PONTA_PORA_CENTER } from '../data/pontaPoraBairros';

export function generateId(prefix = 'feat'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Calcula o centroide geométrico ponderado pela área de um polígono [lat, lng][]
 * Garante o posicionamento preciso do número no centro da quadra.
 */
export function computePolygonCentroid(points: LatLngTuple[]): LatLngTuple {
  if (!points || points.length === 0) return PONTA_PORA_CENTER;
  if (points.length === 1) return [points[0][0], points[0][1]];
  if (points.length === 2) {
    return [(points[0][0] + points[1][0]) / 2, (points[0][1] + points[1][1]) / 2];
  }

  let twiceArea = 0;
  let cx = 0;
  let cy = 0;

  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const y0 = points[j][0];
    const x0 = points[j][1];
    const y1 = points[i][0];
    const x1 = points[i][1];
    const f = x0 * y1 - x1 * y0;
    twiceArea += f;
    cx += (x0 + x1) * f;
    cy += (y0 + y1) * f;
  }

  if (Math.abs(twiceArea) < 1e-11) {
    let sumLat = 0;
    let sumLng = 0;
    for (const [lat, lng] of points) {
      sumLat += lat;
      sumLng += lng;
    }
    return [sumLat / points.length, sumLng / points.length];
  }

  const factor = twiceArea * 3;
  return [cy / factor, cx / factor];
}

/**
 * Distância Haversine em metros entre dois pontos [lat, lng]
 */
export function haversineDistanceM(a: LatLngTuple, b: LatLngTuple): number {
  const R = 6371008.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function computePolylineLengthM(points: LatLngTuple[], closed = false): number {
  if (!points || points.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += haversineDistanceM(points[i - 1], points[i]);
  }
  if (closed && points.length > 2) {
    total += haversineDistanceM(points[points.length - 1], points[0]);
  }
  return total;
}

/**
 * Área geodésica aproximada em metros quadrados
 */
export function computePolygonAreaM2(points: LatLngTuple[]): number {
  if (!points || points.length < 3) return 0;
  const R = 6371008.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % points.length];
    area +=
      toRad(p2[1] - p1[1]) *
      (2 + Math.sin(toRad(p1[0])) + Math.sin(toRad(p2[0])));
  }
  return Math.abs((area * R * R) / 2);
}

export function formatArea(m2: number): string {
  if (m2 >= 10000) {
    return `${(m2 / 10000).toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} ha (${Math.round(m2).toLocaleString('pt-BR')} m²)`;
  }
  return `${Math.round(m2).toLocaleString('pt-BR')} m²`;
}

export function formatDistance(m: number): string {
  if (m >= 1000) {
    return `${(m / 1000).toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} km`;
  }
  return `${Math.round(m).toLocaleString('pt-BR')} m`;
}

/**
 * Escala cartográfica e escala gráfica real (base 96 DPI padrão de tela)
 */
export function getMetersPerPixel(lat: number, zoom: number): number {
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom);
}

export function getApproximateScale(lat: number, zoom: number): number {
  const mPerPx = getMetersPerPixel(lat, zoom);
  // 1 pixel de tela a 96 DPI = 0.0254 / 96 metros no papel
  const paperMetersPerPx = 0.0254 / 96;
  return Math.round(mPerPx / paperMetersPerPx);
}

export function getZoomForTargetScale(lat: number, targetScale: number): number {
  const paperMetersPerPx = 0.0254 / 96;
  const desiredMetersPerPx = targetScale * paperMetersPerPx;
  const cosLat = Math.cos((lat * Math.PI) / 180);
  const zoom = Math.log2((156543.03392 * cosLat) / desiredMetersPerPx);
  return Math.max(11, Math.min(20.5, Number(zoom.toFixed(2))));
}

export interface ScaleBarSpec {
  totalMeters: number;
  pixelWidth: number;
  label: string;
  halfLabel: string;
}

export function computeGraphicScaleBar(
  lat: number,
  zoom: number,
  maxWidthPx = 150
): ScaleBarSpec {
  const mPerPx = getMetersPerPixel(lat, zoom);
  const maxMeters = mPerPx * maxWidthPx;
  const niceSteps = [10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000];
  let chosen = niceSteps[0];
  for (const step of niceSteps) {
    if (step <= maxMeters) chosen = step;
  }
  const pixelWidth = Math.max(44, Math.round(chosen / mPerPx));
  const label = chosen >= 1000 ? `${chosen / 1000} km` : `${chosen} m`;
  const half = chosen / 2;
  const halfLabel = chosen >= 1000 ? `${half / 1000} km` : `${half} m`;
  return {
    totalMeters: chosen,
    pixelWidth,
    label,
    halfLabel,
  };
}

/**
 * Exportação do projeto de bairro para GeoJSON padrão RFC 7946 (compatível com QGIS/ArcGIS e reimportação)
 */
export function projectToGeoJSON(project: NeighborhoodMapProject): object {
  const features = project.features.map((f) => {
    let geometry: any;
    if (f.geometryType === 'Polygon') {
      const pts = f.coordinates as LatLngTuple[];
      const ring = pts.map(([lat, lng]) => [lng, lat]);
      if (
        ring.length > 0 &&
        (ring[0][0] !== ring[ring.length - 1][0] ||
          ring[0][1] !== ring[ring.length - 1][1])
      ) {
        ring.push([...ring[0]]);
      }
      geometry = {
        type: 'Polygon',
        coordinates: [ring],
      };
    } else if (f.geometryType === 'LineString') {
      const pts = f.coordinates as LatLngTuple[];
      geometry = {
        type: 'LineString',
        coordinates: pts.map(([lat, lng]) => [lng, lat]),
      };
    } else {
      const pt = f.coordinates as LatLngTuple;
      geometry = {
        type: 'Point',
        coordinates: [pt[1], pt[0]],
      };
    }

    return {
      type: 'Feature',
      id: f.id,
      properties: {
        name: f.name,
        kind: f.kind,
        geometrySubtype: f.geometryType,
        blockNumber: f.blockNumber ?? null,
        radius: f.radius ?? null,
        labelPosition: f.labelPosition ?? null,
        neighborhood: project.neighborhoodName,
        municipality: 'Ponta Porã - MS',
        style: f.style,
      },
      geometry,
    };
  });

  return {
    type: 'FeatureCollection',
    metadata: {
      system: 'SIG Urbano Ponta Porã – MS',
      projectId: project.id,
      neighborhoodName: project.neighborhoodName,
      sectorCode: project.sectorCode || '',
      notes: project.notes || '',
      center: project.center,
      zoom: project.zoom,
      nextBlockNumber: project.nextBlockNumber,
      blockPrefix: project.blockPrefix,
      exportedAt: new Date().toISOString(),
    },
    features,
  };
}

/**
 * Importa um arquivo GeoJSON externo ou salvo anteriormente para lista de elementos cadastrais
 */
export function importGeoJSONToFeatures(geojson: any): {
  features: CadastralFeature[];
  neighborhoodName?: string;
  center?: LatLngTuple;
  zoom?: number;
} {
  if (!geojson || typeof geojson !== 'object') {
    return { features: [] };
  }

  const rawList =
    geojson.type === 'FeatureCollection'
      ? geojson.features || []
      : geojson.type === 'Feature'
      ? [geojson]
      : [];

  const imported: CadastralFeature[] = [];

  for (const item of rawList) {
    const geom = item?.geometry;
    if (!geom) continue;
    const props = item.properties || {};

    let kind: FeatureKind = props.kind || 'polygon';
    if (!['bairro', 'quarteirao', 'polygon', 'polyline', 'circle', 'text'].includes(kind)) {
      kind = geom.type === 'Point' ? 'text' : geom.type === 'LineString' ? 'polyline' : 'polygon';
    }

    const fallbackPreset =
      kind === 'bairro'
        ? DEFAULT_STYLE_PRESETS.bairro
        : kind === 'quarteirao'
        ? DEFAULT_STYLE_PRESETS.quarteirao
        : kind === 'text'
        ? DEFAULT_STYLE_PRESETS.text
        : DEFAULT_STYLE_PRESETS.shape;

    const style: FeatureStyle = {
      ...fallbackPreset,
      ...(props.style || {}),
    };

    if (geom.type === 'Polygon' || geom.type === 'MultiPolygon') {
      const ring =
        geom.type === 'Polygon'
          ? geom.coordinates?.[0] || []
          : geom.coordinates?.[0]?.[0] || [];
      if (ring.length < 3) continue;
      const trimmed =
        ring.length > 3 &&
        ring[0][0] === ring[ring.length - 1][0] &&
        ring[0][1] === ring[ring.length - 1][1]
          ? ring.slice(0, -1)
          : ring;
      const coords: LatLngTuple[] = trimmed.map(([lng, lat]: number[]) => [
        Number(lat),
        Number(lng),
      ]);
      imported.push({
        id: generateId(kind),
        kind,
        name: props.name || (kind === 'bairro' ? 'Perímetro do Bairro' : ''),
        blockNumber: typeof props.blockNumber === 'number' ? props.blockNumber : undefined,
        geometryType: 'Polygon',
        coordinates: coords,
        labelPosition: Array.isArray(props.labelPosition)
          ? [Number(props.labelPosition[0]), Number(props.labelPosition[1])]
          : computePolygonCentroid(coords),
        style,
      });
    } else if (geom.type === 'LineString') {
      const coords: LatLngTuple[] = (geom.coordinates || []).map(
        ([lng, lat]: number[]) => [Number(lat), Number(lng)]
      );
      if (coords.length < 2) continue;
      imported.push({
        id: generateId('line'),
        kind: 'polyline',
        name: props.name || '',
        geometryType: 'LineString',
        coordinates: coords,
        style,
      });
    } else if (geom.type === 'Point') {
      const [lng, lat] = geom.coordinates || [];
      if (typeof lat !== 'number' || typeof lng !== 'number') continue;
      const isCircle = props.geometrySubtype === 'Circle' || typeof props.radius === 'number';
      imported.push({
        id: generateId(isCircle ? 'circle' : kind),
        kind: isCircle ? 'circle' : kind === 'quarteirao' ? 'quarteirao' : 'text',
        name: props.name || (isCircle ? '' : 'Texto'),
        blockNumber: typeof props.blockNumber === 'number' ? props.blockNumber : undefined,
        geometryType: isCircle ? 'Circle' : 'Point',
        coordinates: [Number(lat), Number(lng)],
        radius: isCircle ? Number(props.radius || 60) : undefined,
        style,
      });
    }
  }

  return {
    features: imported,
    neighborhoodName: geojson.metadata?.neighborhoodName,
    center: geojson.metadata?.center,
    zoom: geojson.metadata?.zoom,
  };
}

export function createNewNeighborhoodProject(params: {
  neighborhoodName: string;
  center?: LatLngTuple;
  zoom?: number;
  sectorCode?: string;
  notes?: string;
  features?: CadastralFeature[];
}): NeighborhoodMapProject {
  const now = new Date().toISOString();
  const cleanName = params.neighborhoodName.trim() || 'Novo Bairro';
  return {
    id: generateId('map'),
    neighborhoodName: cleanName,
    sectorCode: params.sectorCode || '',
    notes: params.notes || '',
    createdAt: now,
    updatedAt: now,
    center: params.center || PONTA_PORA_CENTER,
    zoom: params.zoom ?? 16.25,
    nextBlockNumber: 1,
    numberingMode: 'auto',
    blockPrefix: 'QUARTEIRÃO ',
    features: params.features || [],
    defaultStyles: JSON.parse(JSON.stringify(DEFAULT_STYLE_PRESETS)),
    printConfig: {
      paperSize: 'A4',
      orientation: 'landscape',
      title: `BAIRRO ${cleanName.toUpperCase()}`,
      subtitle: 'PLANTA CADASTRAL URBANA • MUNICÍPIO DE PONTA PORÃ – MS',
      showNorthArrow: true,
      showScaleBar: true,
      showLegend: true,
      showFrameOverlay: false,
      targetScale: 'auto',
    },
  };
}

/**
 * Cria os projetos iniciais quando o usuário abre o aplicativo pela primeira vez:
 * 1) Projeto limpo "Centro" aberto diretamente sobre a planta cadastral real de Ponta Porã – MS
 * 2) Projeto salvo de referência em "Meus Mapas" demonstrando delimitação e quarteirões numerados
 */
export function createInitialProjects(): NeighborhoodMapProject[] {
  const mainProject = createNewNeighborhoodProject({
    neighborhoodName: 'Centro',
    center: [-22.5362, -55.7274],
    zoom: 16.25,
    sectorCode: 'SETOR 01',
    notes: 'Mapa cadastral do Bairro Centro de Ponta Porã – MS',
  });

  // Segundo mapa salvo em "Meus Mapas" como modelo demonstrativo opcional
  const demoBairroCoords: LatLngTuple[] = [
    [-22.5338, -55.7295],
    [-22.5331, -55.7262],
    [-22.5364, -55.7253],
    [-22.5371, -55.7286],
  ];
  const q1Coords: LatLngTuple[] = [
    [-22.5340, -55.7292],
    [-22.5337, -55.7277],
    [-22.5351, -55.7273],
    [-22.5354, -55.7288],
  ];
  const q2Coords: LatLngTuple[] = [
    [-22.5336, -55.7275],
    [-22.5333, -55.7263],
    [-22.5347, -55.7259],
    [-22.5350, -55.7271],
  ];
  const q3Coords: LatLngTuple[] = [
    [-22.5355, -55.7287],
    [-22.5352, -55.7272],
    [-22.5366, -55.7268],
    [-22.5369, -55.7283],
  ];

  const demoProject = createNewNeighborhoodProject({
    neighborhoodName: 'Recorte Modelo – Centro (Exemplo)',
    center: [-22.5352, -55.7274],
    zoom: 16.75,
    sectorCode: 'EXEMPLO-01',
    notes: 'Exemplo demonstrativo com perímetro de bairro e quarteirões numerados',
    features: [
      {
        id: generateId('bairro'),
        kind: 'bairro',
        name: 'Setor Central',
        geometryType: 'Polygon',
        coordinates: demoBairroCoords,
        labelPosition: [-22.5334, -55.7278],
        style: { ...DEFAULT_STYLE_PRESETS.bairro },
      },
      {
        id: generateId('quarteirao'),
        kind: 'quarteirao',
        name: 'QUARTEIRÃO 1',
        blockNumber: 1,
        geometryType: 'Polygon',
        coordinates: q1Coords,
        labelPosition: computePolygonCentroid(q1Coords),
        style: { ...DEFAULT_STYLE_PRESETS.quarteirao },
      },
      {
        id: generateId('quarteirao'),
        kind: 'quarteirao',
        name: 'QUARTEIRÃO 2',
        blockNumber: 2,
        geometryType: 'Polygon',
        coordinates: q2Coords,
        labelPosition: computePolygonCentroid(q2Coords),
        style: { ...DEFAULT_STYLE_PRESETS.quarteirao },
      },
      {
        id: generateId('quarteirao'),
        kind: 'quarteirao',
        name: 'QUARTEIRÃO 3',
        blockNumber: 3,
        geometryType: 'Polygon',
        coordinates: q3Coords,
        labelPosition: computePolygonCentroid(q3Coords),
        style: { ...DEFAULT_STYLE_PRESETS.quarteirao },
      },
    ],
  });
  demoProject.nextBlockNumber = 4;

  return [mainProject, demoProject];
}
