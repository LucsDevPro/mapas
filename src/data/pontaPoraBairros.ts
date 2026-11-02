import { LatLngTuple } from '../types/gis';

export const PONTA_PORA_CENTER: LatLngTuple = [-22.5356, -55.7268];

export interface PontaPoraNeighborhoodInfo {
  name: string;
  zone: string;
  center: LatLngTuple;
  zoom?: number;
}

/**
 * Coordenadas reais verificadas diretamente na base OpenStreetMap de Ponta Porã – MS
 */
export const PONTA_PORA_BAIRROS: PontaPoraNeighborhoodInfo[] = [
  { name: 'Centro', zone: 'Região Central', center: [-22.5376, -55.7277], zoom: 16.25 },
  { name: 'Bairro da Saudade', zone: 'Região Central', center: [-22.5253, -55.7260], zoom: 16.25 },
  { name: 'Granja', zone: 'Região Sul', center: [-22.5538, -55.7111], zoom: 16 },
  { name: 'Marambaia', zone: 'Região Sul', center: [-22.5667, -55.6904], zoom: 16 },
  { name: 'Jardim Aeroporto', zone: 'Região Sul / Leste', center: [-22.5445, -55.7052], zoom: 16 },
  { name: 'Vila Áurea', zone: 'Região Norte', center: [-22.5158, -55.7324], zoom: 16.25 },
  { name: 'Vila Ferroviária', zone: 'Região Central / Norte', center: [-22.5194, -55.7327], zoom: 16.5 },
  { name: 'Vila Renô', zone: 'Região Norte / Leste', center: [-22.5179, -55.7204], zoom: 16.25 },
  { name: 'Vila Brandão', zone: 'Região Norte', center: [-22.5195, -55.7270], zoom: 16.5 },
  { name: 'Vila dos Professores', zone: 'Região Central', center: [-22.5247, -55.7293], zoom: 16.5 },
  { name: 'Vila Dr. Rezende', zone: 'Região Central / Leste', center: [-22.5349, -55.7217], zoom: 16.5 },
  { name: 'Vila Vitória', zone: 'Região Leste', center: [-22.5323, -55.7174], zoom: 16.5 },
  { name: 'Vila Luiz Curvo', zone: 'Região Leste', center: [-22.5290, -55.7145], zoom: 16.25 },
  { name: 'Vila Lacíria', zone: 'Região Leste', center: [-22.5257, -55.7162], zoom: 16.5 },
  { name: 'Vila Alegrete', zone: 'Região Noroeste', center: [-22.5078, -55.7361], zoom: 16.25 },
  { name: 'Vila São Vicente de Paulo', zone: 'Região Noroeste', center: [-22.5113, -55.7416], zoom: 16.25 },
  { name: 'Vila Maisa', zone: 'Região Norte', center: [-22.4923, -55.7218], zoom: 16.25 },
  { name: 'Vila Jockei Clube', zone: 'Região Sul', center: [-22.5542, -55.7014], zoom: 16.25 },
  { name: 'Vila Aral Moreira', zone: 'Região Sul', center: [-22.5577, -55.6922], zoom: 16.25 },
  { name: 'Vila Min. Salgado Filho', zone: 'Região Sudeste', center: [-22.5470, -55.6939], zoom: 16.25 },
  { name: 'Residencial Ponta Porã I', zone: 'Região Norte', center: [-22.5100, -55.7261], zoom: 16.25 },
  { name: 'Residencial Ponta Porã II', zone: 'Região Norte', center: [-22.5029, -55.7214], zoom: 16.25 },
  { name: 'Residencial Kamel Saad', zone: 'Região Extremo Norte', center: [-22.4844, -55.7378], zoom: 16.25 },
  { name: 'Residencial Vila Verde', zone: 'Região Central', center: [-22.5284, -55.7263], zoom: 16.5 },
  { name: 'Residencial Carandá', zone: 'Região Noroeste', center: [-22.5052, -55.7385], zoom: 16.25 },
  { name: 'Residencial Guy Vilela', zone: 'Região Extremo Norte', center: [-22.4866, -55.7222], zoom: 16.25 },
  { name: 'Residencial Manuel Padial', zone: 'Região Extremo Norte', center: [-22.4890, -55.7196], zoom: 16.25 },
  { name: 'Residencial Jamil Saldanha Derzi', zone: 'Região Nordeste', center: [-22.5021, -55.7124], zoom: 16.25 },
  { name: 'Flamboyant Residencial Park', zone: 'Região Sudeste', center: [-22.5509, -55.6974], zoom: 16.25 },
  { name: 'Bela Vista Parque Residencial', zone: 'Região Nordeste', center: [-22.5021, -55.7076], zoom: 16.25 },
  { name: 'Fernando Saldanha Residencial', zone: 'Região Norte', center: [-22.4987, -55.7324], zoom: 16.25 },
  { name: 'Jardim Universitário', zone: 'Região Sul', center: [-22.5678, -55.6941], zoom: 16.25 },
  { name: 'Jardim Altos da Glória', zone: 'Região Sul / Sudeste', center: [-22.5650, -55.6836], zoom: 16.25 },
  { name: 'Jardim Panambi', zone: 'Região Norte', center: [-22.5153, -55.7274], zoom: 16.5 },
  { name: 'Jardim Planalto', zone: 'Região Norte', center: [-22.5002, -55.7286], zoom: 16.25 },
  { name: 'Jardim América', zone: 'Região Sul', center: [-22.5584, -55.6940], zoom: 16.25 },
  { name: 'Jardim Primavera', zone: 'Região Sudeste', center: [-22.5615, -55.6812], zoom: 16.25 },
  { name: 'Jardim Vitória', zone: 'Região Sul', center: [-22.5644, -55.6877], zoom: 16.25 },
  { name: 'Jardim dos Estados', zone: 'Região Sul', center: [-22.5635, -55.6854], zoom: 16.25 },
  { name: 'Jardim Primor', zone: 'Região Noroeste', center: [-22.5155, -55.7369], zoom: 16.5 },
  { name: 'Jardim Manlaiver', zone: 'Região Leste', center: [-22.5214, -55.7105], zoom: 16.25 },
  { name: 'Jardim Ivone I', zone: 'Região Extremo Norte', center: [-22.4846, -55.7294], zoom: 16.25 },
  { name: 'Jardim Ibirapuera', zone: 'Região Noroeste', center: [-22.5007, -55.7422], zoom: 16.25 },
  { name: 'Jardim das Oliveiras', zone: 'Região Extremo Norte', center: [-22.4884, -55.7365], zoom: 16.25 },
  { name: 'Jardim Itaipu', zone: 'Região Norte', center: [-22.4918, -55.7239], zoom: 16.25 },
];

export interface PlaceSearchResult {
  id: string;
  label: string;
  sublabel: string;
  center: LatLngTuple;
  zoom: number;
  isNeighborhood?: boolean;
}

/**
 * Busca combinada nos bairros cadastrados de Ponta Porã + base de ruas do OpenStreetMap (Photon)
 */
export async function searchPontaPoraPlaces(query: string): Promise<PlaceSearchResult[]> {
  const q = query.trim();
  if (!q) return [];

  const norm = q
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  const localMatches: PlaceSearchResult[] = PONTA_PORA_BAIRROS.filter((b) => {
    const bNorm = b.name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    return bNorm.includes(norm);
  })
    .slice(0, 6)
    .map((b) => ({
      id: `local-${b.name}`,
      label: b.name,
      sublabel: `Bairro • ${b.zone} — Ponta Porã / MS`,
      center: b.center,
      zoom: b.zoom || 16.25,
      isNeighborhood: true,
    }));

  try {
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(
      `${q} Ponta Porã`
    )}&lat=-22.5356&lon=-55.7268&limit=10`;
    const res = await fetch(url);
    if (!res.ok) return localMatches;
    const data = await res.json();

    const remoteMatches: PlaceSearchResult[] = [];
    for (const f of data.features || []) {
      const coords = f.geometry?.coordinates;
      if (!coords || coords.length < 2) continue;
      const lng = Number(coords[0]);
      const lat = Number(coords[1]);
      // Restringe estritamente à área urbana e entorno de Ponta Porã – MS
      if (lat < -22.64 || lat > -22.42 || lng < -55.82 || lng > -55.62) continue;

      const props = f.properties || {};
      const title = props.name || props.street || 'Logradouro em Ponta Porã';
      const parts = [props.street, props.district, props.city || 'Ponta Porã – MS'].filter(
        (p) => p && p !== title
      );
      const id = `osm-${props.osm_id || `${lat}-${lng}`}`;
      if (localMatches.some((m) => m.label.toLowerCase() === String(title).toLowerCase())) {
        continue;
      }
      remoteMatches.push({
        id,
        label: title,
        sublabel: parts.join(' • ') || 'Ponta Porã – MS (OpenStreetMap)',
        center: [lat, lng],
        zoom: props.osm_key === 'highway' ? 17 : 16.25,
      });
    }

    return [...localMatches, ...remoteMatches.slice(0, 7)];
  } catch {
    return localMatches;
  }
}

/**
 * Busca opcional do polígono administrativo do bairro em Ponta Porã diretamente do OpenStreetMap (Nominatim)
 * Retorna lista de vértices [lat, lng][] prontos para edição no Leaflet-Geoman.
 */
export async function fetchOsmNeighborhoodPolygon(
  neighborhoodName: string
): Promise<LatLngTuple[] | null> {
  const clean = neighborhoodName.trim();
  if (!clean) return null;
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
      `${clean}, Ponta Porã`
    )}&polygon_geojson=1&format=json&limit=5&viewbox=-55.80,-22.44,-55.64,-22.61&bounded=1`;
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
      },
    });
    if (!res.ok) return null;
    const items = await res.json();
    if (!Array.isArray(items) || items.length === 0) return null;

    const polyItem = items.find(
      (item: any) =>
        item.geojson &&
        (item.geojson.type === 'Polygon' || item.geojson.type === 'MultiPolygon')
    );
    if (!polyItem) return null;

    let ring: number[][] = [];
    if (polyItem.geojson.type === 'Polygon') {
      ring = polyItem.geojson.coordinates?.[0] || [];
    } else if (polyItem.geojson.type === 'MultiPolygon') {
      // Escolhe o maior anel do MultiPolygon
      let best: number[][] = [];
      for (const poly of polyItem.geojson.coordinates || []) {
        const outer = poly?.[0] || [];
        if (outer.length > best.length) best = outer;
      }
      ring = best;
    }

    if (ring.length < 3) return null;

    // Remove o ponto duplicado de fechamento do GeoJSON se existir
    const pts =
      ring.length > 3 &&
      ring[0][0] === ring[ring.length - 1][0] &&
      ring[0][1] === ring[ring.length - 1][1]
        ? ring.slice(0, -1)
        : ring;

    return pts.map(([lng, lat]) => [Number(lat), Number(lng)] as LatLngTuple);
  } catch {
    return null;
  }
}
