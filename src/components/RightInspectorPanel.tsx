import React, { useEffect, useState } from 'react';
import {
  Sliders,
  Map as MapIcon,
  Layers,
  PanelRightClose,
  PanelRightOpen,
  Trash2,
  Target,
  Eye,
  EyeOff,
  RotateCcw,
  CopyCheck,
  Hash,
} from 'lucide-react';
import {
  CADASTRAL_COLOR_SWATCHES,
  CadastralFeature,
  CadastralFontFamily,
  CartographyConfig,
  DEFAULT_CARTOGRAPHY_CONFIG,
  FeatureStyle,
  LabelBackgroundStyle,
  LatLngTuple,
  NeighborhoodMapProject,
  ToolMode,
} from '../types/gis';
import {
  computePolygonAreaM2,
  computePolygonCentroid,
  computePolylineLengthM,
  formatArea,
  formatDistance,
} from '../utils/geometryAndGeoJson';

export type InspectorTab = 'style' | 'cartography' | 'layers';

interface RightInspectorPanelProps {
  isOpen: boolean;
  onToggleOpen: () => void;
  activeTab: InspectorTab;
  onChangeTab: (tab: InspectorTab) => void;
  project: NeighborhoodMapProject;
  activeTool: ToolMode;
  selectedFeature: CadastralFeature | null;
  onSelectFeature: (id: string | null) => void;
  onUpdateFeature: (id: string, updater: (prev: CadastralFeature) => CadastralFeature) => void;
  onDeleteFeature: (id: string) => void;
  onUpdateProjectMeta: (updater: (prev: NeighborhoodMapProject) => NeighborhoodMapProject) => void;
  onApplyStyleToAllBlocks: (stylePatch: Partial<FeatureStyle>) => void;
  onResequenceBlocks: () => void;
  cartographyConfig: CartographyConfig;
  onChangeCartography: (cfg: CartographyConfig) => void;
  visibleStreets: string[];
  onFocusCoords: (coords: LatLngTuple, zoom?: number) => void;
  /** Gira o elemento selecionado para ficar paralelo à rua mais próxima */
  onAlignToStreet: () => void;
  /** Troca a ferramenta ativa da barra lateral esquerda */
  onSelectTool: (tool: ToolMode) => void;
  /** Apaga todas as marcações do mapa (pode ser desfeito com Ctrl+Z) */
  onClearAllFeatures: () => void;
}

const FONT_OPTIONS: { value: CadastralFontFamily; label: string }[] = [
  { value: 'Inter', label: 'Inter (Técnica Limpa)' },
  { value: 'Roboto Condensed', label: 'Roboto Condensed (Cadastral)' },
  { value: 'JetBrains Mono', label: 'JetBrains Mono (Numérica)' },
  { value: 'Merriweather', label: 'Merriweather (Clássica)' },
];

export const RightInspectorPanel: React.FC<RightInspectorPanelProps> = ({
  isOpen,
  onToggleOpen,
  activeTab,
  onChangeTab,
  project,
  activeTool,
  selectedFeature,
  onSelectFeature,
  onUpdateFeature,
  onDeleteFeature,
  onUpdateProjectMeta,
  onApplyStyleToAllBlocks,
  onResequenceBlocks,
  cartographyConfig,
  onChangeCartography,
  visibleStreets,
  onFocusCoords,
  onAlignToStreet,
  onSelectTool,
  onClearAllFeatures,
}) => {
  const [defaultPresetTarget, setDefaultPresetTarget] = useState<
    'bairro' | 'quarteirao' | 'shape' | 'text'
  >('quarteirao');
  const [streetFilter, setStreetFilter] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);

  // A confirmação some ao trocar de aba ou de mapa, para nunca ficar "armada" por engano
  useEffect(() => {
    setConfirmClear(false);
  }, [activeTab, project.id]);

  if (!isOpen) {
    return (
      <div className="bg-white border-l border-slate-200 w-10 flex flex-col items-center py-2 gap-2 z-[650] shrink-0 no-print">
        <button
          type="button"
          onClick={onToggleOpen}
          title="Abrir painel de propriedades e cartografia"
          className="p-1.5 rounded hover:bg-slate-100 text-slate-600"
        >
          <PanelRightOpen className="w-4 h-4" />
        </button>
      </div>
    );
  }

  // Determina qual estilo padrão exibir quando nenhum elemento está selecionado
  const effectivePresetKey: 'bairro' | 'quarteirao' | 'shape' | 'text' =
    activeTool === 'bairro'
      ? 'bairro'
      : activeTool === 'quarteirao_poly' || activeTool === 'quarteirao_num'
      ? 'quarteirao'
      : activeTool === 'text'
      ? 'text'
      : activeTool === 'polygon' || activeTool === 'polyline' || activeTool === 'circle'
      ? 'shape'
      : defaultPresetTarget;

  const currentStyle: FeatureStyle = selectedFeature
    ? selectedFeature.style
    : project.defaultStyles[effectivePresetKey];

  const handleStyleChange = (patch: Partial<FeatureStyle>) => {
    if (selectedFeature) {
      onUpdateFeature(selectedFeature.id, (prev) => ({
        ...prev,
        style: { ...prev.style, ...patch },
      }));
    } else {
      onUpdateProjectMeta((prev) => ({
        ...prev,
        defaultStyles: {
          ...prev.defaultStyles,
          [effectivePresetKey]: {
            ...prev.defaultStyles[effectivePresetKey],
            ...patch,
          },
        },
      }));
    }
  };

  // Métricas geodésicas do elemento selecionado
  let areaText: string | null = null;
  let perimeterText: string | null = null;
  if (selectedFeature) {
    if (selectedFeature.geometryType === 'Polygon') {
      const pts = selectedFeature.coordinates as LatLngTuple[];
      areaText = formatArea(computePolygonAreaM2(pts));
      perimeterText = formatDistance(computePolylineLengthM(pts, true));
    } else if (selectedFeature.geometryType === 'LineString') {
      const pts = selectedFeature.coordinates as LatLngTuple[];
      perimeterText = formatDistance(computePolylineLengthM(pts, false));
    } else if (selectedFeature.geometryType === 'Circle' && selectedFeature.radius) {
      const r = selectedFeature.radius;
      areaText = formatArea(Math.PI * r * r);
      perimeterText = `Raio: ${r} m`;
    }
  }

  const filteredStreets = streetFilter.trim()
    ? visibleStreets.filter((s) =>
        s.toLowerCase().includes(streetFilter.trim().toLowerCase())
      )
    : visibleStreets;

  const quarteiraoCount = project.features.filter((f) => f.kind === 'quarteirao').length;

  return (
    <aside className="w-76 bg-white border-l border-slate-200 flex flex-col shrink-0 z-[650] no-print select-none">
      {/* Abas superiores do Inspetor */}
      <div className="flex items-center border-b border-slate-200 bg-slate-50 px-1.5 pt-1.5 gap-1">
        <button
          type="button"
          onClick={() => onChangeTab('style')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-2 text-[11px] font-semibold rounded-t-md border-b-2 transition-colors ${
            activeTab === 'style'
              ? 'bg-white text-blue-700 border-blue-600'
              : 'text-slate-600 border-transparent hover:text-slate-900'
          }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>Estilo & Quadras</span>
        </button>
        <button
          type="button"
          onClick={() => onChangeTab('cartography')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-2 text-[11px] font-semibold rounded-t-md border-b-2 transition-colors ${
            activeTab === 'cartography'
              ? 'bg-white text-blue-700 border-blue-600'
              : 'text-slate-600 border-transparent hover:text-slate-900'
          }`}
        >
          <MapIcon className="w-3.5 h-3.5" />
          <span>Planta & Ruas</span>
        </button>
        <button
          type="button"
          onClick={() => onChangeTab('layers')}
          className={`flex items-center justify-center gap-1 py-2 px-2 text-[11px] font-semibold rounded-t-md border-b-2 transition-colors ${
            activeTab === 'layers'
              ? 'bg-white text-blue-700 border-blue-600'
              : 'text-slate-600 border-transparent hover:text-slate-900'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>({project.features.length})</span>
        </button>
        <button
          type="button"
          onClick={onToggleOpen}
          title="Recolher painel direito"
          className="p-1.5 rounded hover:bg-slate-200/70 text-slate-500 mb-0.5"
        >
          <PanelRightClose className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Conteúdo rolável da aba ativa */}
      <div className="flex-1 overflow-y-auto gis-scroll p-3 space-y-4 text-xs">
        {activeTab === 'style' && (
          <>
            {/* Painel de Controle de Numeração de Quarteirões */}
            <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-2.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <Hash className="w-3.5 h-3.5 text-red-600" />
                  Numeração de Quarteirões
                </span>
                <span className="text-[10.5px] font-semibold text-slate-500">
                  Total: {quarteiraoCount}
                </span>
              </div>

              {/* Modo Sequencial Automático vs Manual */}
              <div className="grid grid-cols-2 gap-1 bg-slate-200/80 p-0.5 rounded-md">
                <button
                  type="button"
                  onClick={() =>
                    onUpdateProjectMeta((p) => ({ ...p, numberingMode: 'auto' }))
                  }
                  className={`py-1 px-2 rounded text-[11px] font-semibold transition-colors ${
                    project.numberingMode === 'auto'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Sequencial Auto
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onUpdateProjectMeta((p) => ({ ...p, numberingMode: 'manual' }))
                  }
                  className={`py-1 px-2 rounded text-[11px] font-semibold transition-colors ${
                    project.numberingMode === 'manual'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Digitação Manual
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className="block text-[10.5px] font-medium text-slate-600 mb-0.5">
                    Prefixo da Identificação
                  </label>
                  <input
                    type="text"
                    value={project.blockPrefix}
                    onChange={(e) =>
                      onUpdateProjectMeta((p) => ({ ...p, blockPrefix: e.target.value }))
                    }
                    placeholder="Ex.: QUARTEIRÃO "
                    className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-xs font-medium text-slate-900 focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10.5px] font-medium text-slate-600 mb-0.5">
                    Próximo Nº
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={project.nextBlockNumber}
                    onChange={(e) =>
                      onUpdateProjectMeta((p) => ({
                        ...p,
                        nextBlockNumber: Math.max(1, Number(e.target.value) || 1),
                      }))
                    }
                    className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-xs font-bold text-slate-900 focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Atalhos rápidos de formato */}
              <div className="flex flex-wrap gap-1">
                {[
                  { label: 'QUARTEIRÃO 1', prefix: 'QUARTEIRÃO ' },
                  { label: 'QUADRA 1', prefix: 'QUADRA ' },
                  { label: 'Q-1', prefix: 'Q-' },
                  { label: 'Apenas Nº (1, 2...)', prefix: '' },
                ].map((opt) => (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => {
                      onUpdateProjectMeta((p) => ({ ...p, blockPrefix: opt.prefix }));
                      // Escolher o formato já ativa a ferramenta "Numerar Quadras"
                      onSelectTool('quarteirao_num');
                    }}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-medium border transition-colors ${
                      project.blockPrefix === opt.prefix
                        ? 'bg-red-50 border-red-300 text-red-700 font-semibold'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {quarteiraoCount > 1 && (
                <button
                  type="button"
                  onClick={onResequenceBlocks}
                  className="w-full py-1 px-2 rounded bg-white hover:bg-slate-100 border border-slate-300 text-[11px] font-medium text-slate-700 transition-colors"
                >
                  Reordenar Sequência (1 até {quarteiraoCount})
                </button>
              )}
            </div>

            {/* Propriedades do Elemento Selecionado OU Estilo Padrão */}
            <div className="space-y-3">
              {selectedFeature ? (
                <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-2.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-blue-900">
                      {selectedFeature.kind === 'bairro'
                        ? 'Perímetro do Bairro'
                        : selectedFeature.kind === 'quarteirao'
                        ? 'Quarteirão Selecionado'
                        : selectedFeature.kind === 'text'
                        ? 'Texto Selecionado'
                        : 'Elemento Selecionado'}
                    </span>
                    <button
                      type="button"
                      onClick={() => onDeleteFeature(selectedFeature.id)}
                      title="Excluir elemento selecionado (Delete)"
                      className="text-rose-600 hover:text-rose-700 p-1 rounded hover:bg-rose-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div>
                    <label className="block text-[10.5px] font-semibold text-slate-700 mb-0.5">
                      Texto / Identificação Exibida
                    </label>
                    <input
                      type="text"
                      value={selectedFeature.name}
                      onChange={(e) =>
                        onUpdateFeature(selectedFeature.id, (prev) => ({
                          ...prev,
                          name: e.target.value,
                        }))
                      }
                      placeholder="Ex.: QUARTEIRÃO 1, Centro..."
                      className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 text-xs font-semibold text-slate-900 focus:border-blue-500 focus:outline-none"
                    />
                  </div>

                  {(areaText || perimeterText) && (
                    <div className="grid grid-cols-2 gap-1.5 pt-1 text-[10.5px]">
                      {areaText && (
                        <div className="bg-white rounded border border-slate-200 px-2 py-1">
                          <div className="text-slate-400 font-medium">Área</div>
                          <div className="font-bold text-slate-800 truncate">{areaText}</div>
                        </div>
                      )}
                      {perimeterText && (
                        <div className="bg-white rounded border border-slate-200 px-2 py-1">
                          <div className="text-slate-400 font-medium">Perímetro</div>
                          <div className="font-bold text-slate-800 truncate">
                            {perimeterText}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {selectedFeature.geometryType === 'Polygon' && (
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateFeature(selectedFeature.id, (prev) => ({
                          ...prev,
                          labelPosition: computePolygonCentroid(
                            prev.coordinates as LatLngTuple[]
                          ),
                        }))
                      }
                      className="w-full py-1 px-2 rounded bg-white hover:bg-blue-50 border border-blue-200 text-blue-700 text-[11px] font-medium flex items-center justify-center gap-1.5"
                    >
                      <Target className="w-3.5 h-3.5" />
                      <span>Centralizar Número/Texto na Quadra</span>
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-1.5">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Estilo Padrão para Novos Desenhos
                  </div>
                  <div className="grid grid-cols-4 gap-1 bg-slate-100 p-0.5 rounded-md">
                    {(
                      [
                        { id: 'bairro', label: 'Bairro' },
                        { id: 'quarteirao', label: 'Quadra' },
                        { id: 'text', label: 'Texto' },
                        { id: 'shape', label: 'Forma' },
                      ] as const
                    ).map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setDefaultPresetTarget(t.id)}
                        className={`py-1 rounded text-[10.5px] font-semibold transition-colors ${
                          effectivePresetKey === t.id
                            ? 'bg-white text-blue-700 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Controles de Contorno e Preenchimento (quando aplicável a polígonos/linhas/círculos) */}
              {(!selectedFeature || selectedFeature.geometryType !== 'Point') && (
                <div className="rounded-lg border border-slate-200 p-2.5 space-y-2.5">
                  <div className="text-[11px] font-bold text-slate-700">
                    Cores de Contorno e Transparência
                  </div>

                  {/* Cor da Borda */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] text-slate-600">Cor do Contorno</span>
                      <input
                        type="color"
                        value={currentStyle.strokeColor}
                        onChange={(e) =>
                          handleStyleChange({
                            strokeColor: e.target.value,
                            fillColor: e.target.value,
                          })
                        }
                        className="w-6 h-5 rounded cursor-pointer border border-slate-300"
                      />
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {CADASTRAL_COLOR_SWATCHES.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() =>
                            handleStyleChange({ strokeColor: c, fillColor: c })
                          }
                          style={{ backgroundColor: c }}
                          className={`w-5 h-5 rounded-full border-2 transition-transform ${
                            currentStyle.strokeColor.toLowerCase() === c.toLowerCase()
                              ? 'border-slate-900 scale-110'
                              : 'border-white shadow-xs'
                          }`}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Espessura e Tipo de Linha */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10.5px] text-slate-600 mb-0.5">
                        Espessura ({currentStyle.strokeWidth}px)
                      </label>
                      <input
                        type="range"
                        min={1}
                        max={8}
                        step={0.5}
                        value={currentStyle.strokeWidth}
                        onChange={(e) =>
                          handleStyleChange({ strokeWidth: Number(e.target.value) })
                        }
                        className="w-full accent-blue-600"
                      />
                    </div>
                    <div>
                      <label className="block text-[10.5px] text-slate-600 mb-0.5">
                        Traçado
                      </label>
                      <select
                        value={currentStyle.dashArray}
                        onChange={(e) => handleStyleChange({ dashArray: e.target.value })}
                        className="w-full bg-white border border-slate-300 rounded px-1.5 py-1 text-[11px]"
                      >
                        <option value="">Contínuo</option>
                        <option value="10, 6">Tracejado</option>
                        <option value="3, 5">Pontilhado</option>
                      </select>
                    </div>
                  </div>

                  {/* Preenchimento e Transparência */}
                  <div>
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-[10.5px] text-slate-600">
                        Opacidade do Preenchimento (
                        {Math.round((currentStyle.fillOpacity ?? 0) * 100)}%)
                      </span>
                      <button
                        type="button"
                        onClick={() => handleStyleChange({ fillOpacity: 0 })}
                        className="text-[10px] font-semibold text-blue-600 hover:underline"
                      >
                        100% Transparente
                      </button>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={0.65}
                      step={0.02}
                      value={currentStyle.fillOpacity}
                      onChange={(e) =>
                        handleStyleChange({ fillOpacity: Number(e.target.value) })
                      }
                      className="w-full accent-blue-600"
                    />
                  </div>
                </div>
              )}

              {/* Tipografia: Fonte, Tamanho, Cor e Rotação dos Números e Textos */}
              <div className="rounded-lg border border-slate-200 p-2.5 space-y-2.5">
                <div className="text-[11px] font-bold text-slate-700">
                  Fonte, Tamanho e Cor dos Números / Textos
                </div>

                <div>
                  <label className="block text-[10.5px] text-slate-600 mb-0.5">
                    Família da Fonte
                  </label>
                  <select
                    value={currentStyle.fontFamily}
                    onChange={(e) =>
                      handleStyleChange({
                        fontFamily: e.target.value as CadastralFontFamily,
                      })
                    }
                    className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-xs"
                  >
                    {FONT_OPTIONS.map((f) => (
                      <option key={f.value} value={f.value}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-3 gap-2 items-end">
                  <div className="col-span-2">
                    <label className="block text-[10.5px] text-slate-600 mb-0.5">
                      Tamanho ({currentStyle.fontSize}px)
                    </label>
                    <input
                      type="range"
                      min={9}
                      max={34}
                      step={1}
                      value={currentStyle.fontSize}
                      onChange={(e) =>
                        handleStyleChange({ fontSize: Number(e.target.value) })
                      }
                      className="w-full accent-blue-600"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      handleStyleChange({
                        fontWeight:
                          currentStyle.fontWeight === 'bold' ? 'normal' : 'bold',
                      })
                    }
                    className={`py-1 px-2 rounded border text-[11px] font-bold ${
                      currentStyle.fontWeight === 'bold'
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-700 border-slate-300'
                    }`}
                  >
                    Negrito
                  </button>
                </div>

                {/* Cor do Texto/Número */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10.5px] text-slate-600">
                      Cor do Texto / Número
                    </span>
                    <input
                      type="color"
                      value={currentStyle.textColor}
                      onChange={(e) => handleStyleChange({ textColor: e.target.value })}
                      className="w-6 h-5 rounded cursor-pointer border border-slate-300"
                    />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {CADASTRAL_COLOR_SWATCHES.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => handleStyleChange({ textColor: c })}
                        style={{ backgroundColor: c }}
                        className={`w-5 h-5 rounded-full border-2 transition-transform ${
                          currentStyle.textColor.toLowerCase() === c.toLowerCase()
                            ? 'border-slate-900 scale-110'
                            : 'border-white shadow-xs'
                        }`}
                      />
                    ))}
                  </div>
                </div>

                {/* Estilo de Fundo do Rótulo */}
                <div>
                  <label className="block text-[10.5px] text-slate-600 mb-0.5">
                    Destaque / Halo de Leitura
                  </label>
                  <select
                    value={currentStyle.labelBg}
                    onChange={(e) =>
                      handleStyleChange({
                        labelBg: e.target.value as LabelBackgroundStyle,
                      })
                    }
                    className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-xs"
                  >
                    <option value="halo">Halo Branco Nítido (Planta Cadastral)</option>
                    <option value="badge">Etiqueta Retangular com Borda</option>
                    <option value="none">Texto Simples (Sem Fundo)</option>
                  </select>
                </div>

                {/* Rotação do Texto (útil para alinhar textos manuais com ruas inclinadas) */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10.5px] text-slate-600">
                      Rotação ({currentStyle.rotation || 0}°)
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-1 mb-1.5">
                    {[
                      { label: 'Horizontal', value: 0 },
                      { label: 'Vertical ↑', value: -90 },
                      { label: 'Vertical ↓', value: 90 },
                    ].map((b) => (
                      <button
                        key={b.label}
                        type="button"
                        onClick={() => handleStyleChange({ rotation: b.value })}
                        className={`text-[10.5px] font-semibold py-1 rounded border transition-colors ${
                          (currentStyle.rotation || 0) === b.value
                            ? 'bg-blue-600 text-white border-blue-700'
                            : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        {b.label}
                      </button>
                    ))}
                  </div>
                  {selectedFeature && (
                    <button
                      type="button"
                      onClick={onAlignToStreet}
                      title="Gira o texto para ficar paralelo à rua mais próxima dele"
                      className="w-full mb-1.5 text-[11px] font-bold py-1.5 rounded border border-blue-700 bg-blue-50 text-blue-800 hover:bg-blue-100 transition-colors"
                    >
                      Alinhar à rua mais próxima
                    </button>
                  )}
                  <p className="text-[10px] text-slate-500 mb-1">
                    Dica: arraste a bolinha azul acima do texto no mapa para girar livremente
                    (Shift = passos de 15°).
                  </p>
                  <input
                    type="range"
                    min={-180}
                    max={180}
                    step={1}
                    value={currentStyle.rotation || 0}
                    onChange={(e) =>
                      handleStyleChange({ rotation: Number(e.target.value) })
                    }
                    className="w-full accent-blue-600"
                  />
                </div>

                {/* Aplicar estilo em lote a todos os quarteirões do mapa */}
                {quarteiraoCount > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      onApplyStyleToAllBlocks({
                        fontFamily: currentStyle.fontFamily,
                        fontSize: currentStyle.fontSize,
                        fontWeight: currentStyle.fontWeight,
                        textColor: currentStyle.textColor,
                        labelBg: currentStyle.labelBg,
                        strokeColor: currentStyle.strokeColor,
                        strokeWidth: currentStyle.strokeWidth,
                        fillColor: currentStyle.fillColor,
                        fillOpacity: currentStyle.fillOpacity,
                      })
                    }
                    className="w-full mt-1 py-1.5 px-2.5 rounded bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <CopyCheck className="w-3.5 h-3.5" />
                    <span>Aplicar Estilo a Todos os Quarteirões ({quarteiraoCount})</span>
                  </button>
                )}
              </div>
            </div>
          </>
        )}

        {activeTab === 'cartography' && (
          <div className="space-y-3.5">
            <div className="rounded-lg border border-slate-200 p-2.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
                  Aparência da Planta Cadastral
                </span>
                <button
                  type="button"
                  onClick={() => onChangeCartography(DEFAULT_CARTOGRAPHY_CONFIG)}
                  title="Restaurar configuração cadastral padrão"
                  className="text-[10.5px] text-blue-600 hover:underline flex items-center gap-1"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Padrão</span>
                </button>
              </div>

              <div className="space-y-1.5">
                {(
                  [
                    {
                      id: 'cadastral_clean',
                      title: 'Planta Cadastral Pura (Fundo Branco)',
                      desc: 'Somente ruas finas cinza-claro, quadras nítidas e nomes das ruas',
                    },
                    {
                      id: 'cadastral_contrast',
                      title: 'Alto Contraste P&B (Campo / Impressão)',
                      desc: 'Traços mais escuros e nomes das ruas em preto absoluto',
                    },
                    {
                      id: 'osm_clean_raster',
                      title: 'Base Cartográfica Limpa (Raster)',
                      desc: 'Modo alternativo compatível com dispositivos sem WebGL',
                    },
                  ] as const
                ).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() =>
                      onChangeCartography({
                        ...cartographyConfig,
                        preset: p.id,
                      })
                    }
                    className={`w-full text-left p-2 rounded-md border transition-colors ${
                      cartographyConfig.preset === p.id
                        ? 'bg-blue-50 border-blue-500 text-blue-950'
                        : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="text-xs font-bold">{p.title}</div>
                    <div className="text-[10.5px] text-slate-500 leading-snug">
                      {p.desc}
                    </div>
                  </button>
                ))}
              </div>

              {cartographyConfig.preset !== 'osm_clean_raster' && (
                <>
                  {/* Tamanho dos Nomes das Ruas */}
                  <div className="pt-1">
                    <div className="flex justify-between text-[11px] font-medium text-slate-700 mb-0.5">
                      <span>Tamanho Fixo dos Nomes das Ruas</span>
                      <span className="font-bold text-blue-700">
                        {Math.round(cartographyConfig.streetNameScale * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0.85}
                      max={1.7}
                      step={0.05}
                      value={cartographyConfig.streetNameScale}
                      onChange={(e) =>
                        onChangeCartography({
                          ...cartographyConfig,
                          streetNameScale: Number(e.target.value),
                        })
                      }
                      className="w-full accent-blue-600"
                    />
                  </div>

                  {/* Espessura / Contraste das Ruas */}
                  <div>
                    <label className="block text-[11px] font-medium text-slate-700 mb-1">
                      Contraste das Linhas de Quadra
                    </label>
                    <div className="grid grid-cols-3 gap-1">
                      {(
                        [
                          { id: 'light', label: 'Cinza Claro' },
                          { id: 'medium', label: 'Cadastral' },
                          { id: 'dark', label: 'Forte (P&B)' },
                        ] as const
                      ).map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() =>
                            onChangeCartography({
                              ...cartographyConfig,
                              streetLineContrast: opt.id,
                            })
                          }
                          className={`py-1 rounded border text-[10.5px] font-semibold ${
                            cartographyConfig.streetLineContrast === opt.id
                              ? 'bg-slate-900 text-white border-slate-900'
                              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Densidade de Repetição dos Nomes das Ruas */}
                  <div>
                    <div className="flex justify-between text-[11px] font-medium text-slate-700 mb-0.5">
                      <span>Frequência dos Nomes nas Ruas</span>
                      <span className="text-[10.5px] text-slate-500">
                        {cartographyConfig.streetLabelSpacing <= 90
                          ? 'Máxima'
                          : cartographyConfig.streetLabelSpacing <= 150
                          ? 'Padrão'
                          : 'Espaçada'}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={40}
                      max={260}
                      step={10}
                      value={cartographyConfig.streetLabelSpacing}
                      onChange={(e) =>
                        onChangeCartography({
                          ...cartographyConfig,
                          streetLabelSpacing: Number(e.target.value),
                        })
                      }
                      className="w-full accent-blue-600"
                    />
                  </div>

                  {/* Negrito nos Nomes das Ruas */}
                  <label className="flex items-center gap-2 pt-0.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={cartographyConfig.streetNameBold}
                      onChange={(e) =>
                        onChangeCartography({
                          ...cartographyConfig,
                          streetNameBold: e.target.checked,
                        })
                      }
                      className="rounded accent-blue-600"
                    />
                    <span className="text-xs font-medium text-slate-700">
                      Nomes das ruas em fonte Negrito (Alta Nitidez)
                    </span>
                  </label>
                </>
              )}
            </div>

            {/* Índice Automático das Ruas Visíveis no Enquadramento Atual */}
            <div className="rounded-lg border border-slate-200 p-2.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
                  Ruas Visíveis na Tela ({visibleStreets.length})
                </span>
              </div>
              <input
                type="text"
                value={streetFilter}
                onChange={(e) => setStreetFilter(e.target.value)}
                placeholder="Filtrar ruas visíveis..."
                className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1 text-xs focus:border-blue-500 focus:outline-none"
              />
              <div className="max-h-56 overflow-y-auto gis-scroll divide-y divide-slate-100 border border-slate-100 rounded">
                {filteredStreets.length === 0 ? (
                  <div className="p-2.5 text-[11px] text-slate-400 text-center">
                    Aproxime o zoom sobre um bairro de Ponta Porã para listar todas as vias.
                  </div>
                ) : (
                  filteredStreets.map((stName) => (
                    <div
                      key={stName}
                      className="px-2.5 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50 flex items-center justify-between"
                    >
                      <span className="truncate">{stName}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'layers' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Elementos neste Bairro ({project.features.length})
              </div>
              {project.features.length > 0 && !confirmClear && (
                <button
                  type="button"
                  onClick={() => setConfirmClear(true)}
                  title="Apaga todos os desenhos, números e textos deste mapa"
                  className="flex items-center gap-1 text-[10.5px] font-semibold px-2 py-1 rounded border border-rose-300 text-rose-700 bg-white hover:bg-rose-50 transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                  Zerar marcações
                </button>
              )}
            </div>

            {project.features.length > 0 && confirmClear && (
              <div className="rounded-lg border border-rose-300 bg-rose-50 p-2.5 space-y-2">
                <div className="text-[11.5px] font-semibold text-rose-900">
                  Apagar todas as {project.features.length} marcações deste mapa?
                </div>
                <div className="text-[10.5px] text-rose-800">
                  Inclui o perímetro do bairro, quadras, números e textos. A numeração
                  volta ao 1. Dá para desfazer com Ctrl+Z.
                </div>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      onClearAllFeatures();
                      setConfirmClear(false);
                    }}
                    className="flex-1 py-1 rounded bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold transition-colors"
                  >
                    Sim, apagar tudo
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmClear(false)}
                    className="flex-1 py-1 rounded bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 text-[11px] font-semibold transition-colors"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            {project.features.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-slate-500 space-y-1">
                <div className="font-semibold text-slate-700">
                  Nenhum desenho neste mapa ainda
                </div>
                <p className="text-[11px]">
                  Use a barra lateral à esquerda para delimitar o perímetro do bairro,
                  desenhar e numerar quarteirões ou inserir textos.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
                {project.features.map((feat) => {
                  const isSel = feat.id === selectedFeature?.id;
                  const targetCoord: LatLngTuple =
                    feat.geometryType === 'Polygon' || feat.geometryType === 'LineString'
                      ? computePolygonCentroid(feat.coordinates as LatLngTuple[])
                      : (feat.coordinates as LatLngTuple);

                  return (
                    <div
                      key={feat.id}
                      onClick={() => onSelectFeature(feat.id)}
                      className={`px-2.5 py-2 flex items-center justify-between gap-1.5 cursor-pointer transition-colors ${
                        isSel ? 'bg-blue-50' : 'bg-white hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          style={{ backgroundColor: feat.style.strokeColor }}
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-slate-800 truncate">
                            {feat.name ||
                              (feat.kind === 'bairro'
                                ? 'Perímetro do Bairro'
                                : feat.kind === 'polygon'
                                ? 'Polígono'
                                : feat.kind === 'polyline'
                                ? 'Linha'
                                : 'Círculo')}
                          </div>
                          <div className="text-[10px] text-slate-400 uppercase">
                            {feat.kind}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-0.5 shrink-0">
                        <button
                          type="button"
                          title="Localizar no mapa"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectFeature(feat.id);
                            onFocusCoords(targetCoord, 17.25);
                          }}
                          className="p-1 rounded hover:bg-slate-200/70 text-slate-500 hover:text-blue-600"
                        >
                          <Target className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          title={feat.visible === false ? 'Mostrar' : 'Ocultar'}
                          onClick={(e) => {
                            e.stopPropagation();
                            onUpdateFeature(feat.id, (prev) => ({
                              ...prev,
                              visible: prev.visible === false ? true : false,
                            }));
                          }}
                          className="p-1 rounded hover:bg-slate-200/70 text-slate-500"
                        >
                          {feat.visible === false ? (
                            <EyeOff className="w-3.5 h-3.5 text-slate-400" />
                          ) : (
                            <Eye className="w-3.5 h-3.5" />
                          )}
                        </button>
                        <button
                          type="button"
                          title="Excluir"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteFeature(feat.id);
                          }}
                          className="p-1 rounded hover:bg-rose-50 text-slate-400 hover:text-rose-600"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
};
