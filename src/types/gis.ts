export type ToolMode =
  | 'select'
  | 'pan'
  | 'bairro'
  | 'quarteirao_poly'
  | 'quarteirao_num'
  | 'polygon'
  | 'polyline'
  | 'circle'
  | 'text'
  | 'edit'
  | 'move'
  | 'delete';

export type FeatureKind =
  | 'bairro'
  | 'quarteirao'
  | 'polygon'
  | 'polyline'
  | 'circle'
  | 'text';

export type CadastralFontFamily =
  | 'Inter'
  | 'Roboto Condensed'
  | 'JetBrains Mono'
  | 'Merriweather';

export type LabelBackgroundStyle = 'halo' | 'badge' | 'none';

export interface FeatureStyle {
  strokeColor: string;
  strokeWidth: number;
  strokeOpacity: number;
  dashArray: string; // '' | '8, 6' | '3, 5'
  fillColor: string;
  fillOpacity: number; // 0..1
  fontFamily: CadastralFontFamily;
  fontSize: number; // px
  fontWeight: 'normal' | 'bold';
  textColor: string;
  labelBg: LabelBackgroundStyle;
  rotation: number; // degrees (-180 to 180)
}

export type LatLngTuple = [number, number]; // [lat, lng]

export interface CadastralFeature {
  id: string;
  kind: FeatureKind;
  name: string;
  blockNumber?: number;
  geometryType: 'Polygon' | 'LineString' | 'Point' | 'Circle';
  /**
   * For Polygon / LineString: LatLngTuple[]
   * For Point / Circle: LatLngTuple
   */
  coordinates: LatLngTuple[] | LatLngTuple;
  /**
   * Optional custom position for a polygon's centered label (e.g. QUARTEIRÃO 1)
   */
  labelPosition?: LatLngTuple;
  /**
   * Radius in meters (only for Circle)
   */
  radius?: number;
  visible?: boolean;
  style: FeatureStyle;
}

export interface CartographyConfig {
  preset: 'cadastral_clean' | 'cadastral_contrast' | 'cadastral_lots' | 'osm_clean_raster';
  streetNameScale: number; // 0.85 .. 1.65
  streetNameBold: boolean;
  streetLineContrast: 'light' | 'medium' | 'dark';
  /** Quantidade de nomes repetidos ao longo de cada rua: 1 (poucos) .. 5 (máximo) */
  streetLabelDensity: 1 | 2 | 3 | 4 | 5;
  /** Fonte dos nomes das ruas (painel "Nomes das Ruas") */
  streetFontFamily: CadastralFontFamily;
  /** Cor do texto dos nomes das ruas */
  streetNameColor: string;
  /** Contorno branco atrás das letras, para ler por cima das linhas */
  streetNameHalo: boolean;
  /** Escreve os nomes em MAIÚSCULAS */
  streetNameUppercase: boolean;
  showBuildings: boolean;
  paperTone: 'pure_white' | 'soft_block';
}

export interface PrintConfig {
  paperSize: 'A4' | 'A3';
  orientation: 'landscape' | 'portrait';
  title: string;
  subtitle: string;
  showNorthArrow: boolean;
  showScaleBar: boolean;
  showLegend: boolean;
  showFrameOverlay: boolean;
  targetScale: number | 'auto';
}

export interface DefaultStylePresets {
  bairro: FeatureStyle;
  quarteirao: FeatureStyle;
  shape: FeatureStyle;
  text: FeatureStyle;
}

export interface NeighborhoodMapProject {
  id: string;
  neighborhoodName: string;
  sectorCode?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  center: LatLngTuple;
  zoom: number;
  nextBlockNumber: number;
  numberingMode: 'auto' | 'manual';
  blockPrefix: string; // e.g., 'QUARTEIRÃO '
  features: CadastralFeature[];
  defaultStyles: DefaultStylePresets;
  printConfig: PrintConfig;
}

export const DEFAULT_CARTOGRAPHY_CONFIG: CartographyConfig = {
  preset: 'cadastral_clean',
  streetNameScale: 1.15,
  streetNameBold: true,
  streetLineContrast: 'medium',
  streetLabelDensity: 4,
  streetFontFamily: 'Inter',
  streetNameColor: '#111827',
  streetNameHalo: true,
  streetNameUppercase: false,
  showBuildings: false,
  paperTone: 'pure_white',
};

export const DEFAULT_STYLE_PRESETS: DefaultStylePresets = {
  bairro: {
    strokeColor: '#1d4ed8',
    strokeWidth: 3.5,
    strokeOpacity: 0.95,
    dashArray: '10, 6',
    fillColor: '#2563eb',
    fillOpacity: 0.02, // transparent fill with colored perimeter!
    fontFamily: 'Inter',
    fontSize: 15,
    fontWeight: 'bold',
    textColor: '#1e3a8a',
    labelBg: 'badge',
    rotation: 0,
  },
  quarteirao: {
    strokeColor: '#dc2626',
    strokeWidth: 2,
    strokeOpacity: 0.9,
    dashArray: '',
    fillColor: '#ef4444',
    fillOpacity: 0.08, // subtle highlight keeping street names crystal clear
    fontFamily: 'Roboto Condensed',
    fontSize: 13,
    fontWeight: 'bold',
    textColor: '#991b1b',
    labelBg: 'halo',
    rotation: 0,
  },
  shape: {
    strokeColor: '#047857',
    strokeWidth: 2.2,
    strokeOpacity: 0.95,
    dashArray: '',
    fillColor: '#10b981',
    fillOpacity: 0.12,
    fontFamily: 'Inter',
    fontSize: 12,
    fontWeight: 'bold',
    textColor: '#065f46',
    labelBg: 'halo',
    rotation: 0,
  },
  text: {
    strokeColor: '#0f172a',
    strokeWidth: 1,
    strokeOpacity: 1,
    dashArray: '',
    fillColor: '#ffffff',
    fillOpacity: 0.9,
    fontFamily: 'Inter',
    fontSize: 13,
    fontWeight: 'bold',
    textColor: '#0f172a',
    labelBg: 'halo',
    rotation: 0,
  },
};

export const CADASTRAL_COLOR_SWATCHES = [
  '#0f172a', // Preto técnico
  '#1d4ed8', // Azul cadastral
  '#dc2626', // Vermelho quarteirão
  '#047857', // Verde esmeralda
  '#7c3aed', // Roxo setorial
  '#c2410c', // Laranja campo
  '#0369a1', // Ciano escuro
  '#be185d', // Magenta técnico
];
