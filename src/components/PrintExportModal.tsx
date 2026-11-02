import React, { useState, useEffect, useCallback } from 'react';
import {
  Printer,
  FileDown,
  ImageDown,
  X,
  Maximize2,
  ZoomIn,
  ZoomOut,
  RefreshCw,
  Crop,
} from 'lucide-react';
import { NeighborhoodMapProject, PrintConfig } from '../types/gis';
import { MapBridgeHandle } from './CadastralMapCanvas';
import {
  exportProjectAsPDF,
  exportProjectAsPNG,
  printProjectSheet,
  renderCadastralSheetCanvas,
} from '../utils/exportAndPrint';
import {
  getApproximateScale,
  getZoomForTargetScale,
} from '../utils/geometryAndGeoJson';

interface PrintExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: NeighborhoodMapProject;
  onUpdatePrintConfig: (patch: Partial<PrintConfig>) => void;
  mapBridgeRef: React.MutableRefObject<MapBridgeHandle | null>;
  selectedFeatureId: string | null;
}

const SCALE_PRESETS = [1000, 2000, 2500, 5000, 7500, 10000];

export const PrintExportModal: React.FC<PrintExportModalProps> = ({
  isOpen,
  onClose,
  project,
  onUpdatePrintConfig,
  mapBridgeRef,
  selectedFeatureId,
}) => {
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [isRenderingPreview, setIsRenderingPreview] = useState<boolean>(false);
  const [busyAction, setBusyAction] = useState<'pdf' | 'png' | 'print' | null>(null);
  const [currentScaleLabel, setCurrentScaleLabel] = useState<number>(2500);

  const cfg = project.printConfig;

  const refreshPreview = useCallback(async () => {
    const bridge = mapBridgeRef.current;
    const leafletMap = bridge?.getLeafletMap();
    if (!isOpen || !leafletMap) return;

    setIsRenderingPreview(true);
    try {
      const center = leafletMap.getCenter();
      setCurrentScaleLabel(getApproximateScale(center.lat, leafletMap.getZoom()));

      await bridge.waitForBasemap();
      const canvas = await renderCadastralSheetCanvas({
        leafletMap,
        mapElement: bridge?.getMapContainer() || null,
        beforeCapture: bridge?.waitForBasemap,
        project,
        printConfig: cfg,
        pixelScale: 1.35,
      });
      setPreviewUrl(canvas.toDataURL('image/png', 0.92));
    } finally {
      setIsRenderingPreview(false);
    }
  }, [isOpen, mapBridgeRef, project, cfg]);

  // Ao abrir (ou trocar formato/orientação), enquadra o polígono selecionado / bairro com pequena margem
  useEffect(() => {
    if (!isOpen) return;
    mapBridgeRef.current?.fitToFeatureForPrint(selectedFeatureId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, cfg.paperSize, cfg.orientation, cfg.showLegend]);

  useEffect(() => {
    if (!isOpen) return;
    const t = setTimeout(() => {
      refreshPreview();
    }, 420);
    return () => clearTimeout(t);
  }, [isOpen, refreshPreview]);

  if (!isOpen) return null;

  const handleApplyNumericScale = (targetScale: number) => {
    const bridge = mapBridgeRef.current;
    const map = bridge?.getLeafletMap();
    if (!map) return;
    const z = getZoomForTargetScale(map.getCenter().lat, targetScale);
    map.setZoom(z, { animate: false });
    onUpdatePrintConfig({ targetScale });
    setTimeout(refreshPreview, 360);
  };

  const handleZoomAdjust = (delta: number) => {
    const map = mapBridgeRef.current?.getLeafletMap();
    if (!map) return;
    map.setZoom(map.getZoom() + delta, { animate: false });
    onUpdatePrintConfig({ targetScale: 'auto' });
    setTimeout(refreshPreview, 360);
  };

  const handleFitNeighborhood = () => {
    const ok = mapBridgeRef.current?.fitToFeatureForPrint(selectedFeatureId);
    if (!ok) mapBridgeRef.current?.fitToNeighborhood();
    onUpdatePrintConfig({ targetScale: 'auto' });
    setTimeout(refreshPreview, 420);
  };

  const buildRenderCtx = () => {
    const bridge = mapBridgeRef.current;
    const leafletMap = bridge?.getLeafletMap();
    if (!leafletMap) return null;
    return {
      leafletMap,
      mapElement: bridge?.getMapContainer() || null,
      beforeCapture: mapBridgeRef.current?.waitForBasemap,
      project,
      printConfig: cfg,
    };
  };

  const handleDownloadPDF = async () => {
    const ctx = buildRenderCtx();
    if (!ctx) return;
    setBusyAction('pdf');
    try {
      await exportProjectAsPDF(ctx);
    } finally {
      setBusyAction(null);
    }
  };

  const handleDownloadPNG = async () => {
    const ctx = buildRenderCtx();
    if (!ctx) return;
    setBusyAction('png');
    try {
      await exportProjectAsPNG(ctx);
    } finally {
      setBusyAction(null);
    }
  };

  const handlePrintNow = async () => {
    const ctx = buildRenderCtx();
    if (!ctx) return;
    setBusyAction('print');
    try {
      await printProjectSheet(ctx);
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] bg-slate-950/65 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 no-print">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Topo do Compositor */}
        <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Printer className="w-5 h-5 text-blue-400" />
            <div>
              <h2 className="text-sm font-bold">
                Compositor de Impressão e Exportação — Planta Cadastral ({cfg.paperSize})
              </h2>
              <p className="text-[11px] text-slate-300">
                Alta nitidez dos nomes das ruas e números dos quarteirões • Menus ocultados automaticamente
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Corpo: Pré-visualização da Prancha + Controles */}
        <div className="flex-1 overflow-y-auto gis-scroll p-4 sm:p-5 grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Esquerda: Pré-visualização Real da Folha A4/A3 */}
          <div className="lg:col-span-7 flex flex-col bg-slate-100 border border-slate-200 rounded-xl p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
              <div className="text-xs font-bold text-slate-700">
                Pré-visualização da Folha {cfg.paperSize} (
                {cfg.orientation === 'landscape' ? 'Paisagem' : 'Retrato'}) • Escala ~ 1:
                {currentScaleLabel.toLocaleString('pt-BR')}
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => handleZoomAdjust(0.35)}
                  title="Aproximar enquadramento"
                  className="px-2 py-1 rounded bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 text-[11px] font-medium flex items-center gap-1"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                  <span>+</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleZoomAdjust(-0.35)}
                  title="Afastar enquadramento"
                  className="px-2 py-1 rounded bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 text-[11px] font-medium flex items-center gap-1"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                  <span>-</span>
                </button>
                <button
                  type="button"
                  onClick={handleFitNeighborhood}
                  title="Enquadrar automaticamente todo o bairro"
                  className="px-2 py-1 rounded bg-white hover:bg-slate-50 border border-slate-300 text-blue-700 text-[11px] font-semibold flex items-center gap-1"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                  <span>Enquadrar Polígono</span>
                </button>
                <button
                  type="button"
                  onClick={refreshPreview}
                  title="Atualizar pré-visualização"
                  className="p-1 rounded bg-white hover:bg-slate-50 border border-slate-300 text-slate-600"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${isRenderingPreview ? 'animate-spin' : ''}`}
                  />
                </button>
              </div>
            </div>

            <div className="flex-1 min-h-[300px] flex items-center justify-center bg-slate-200/70 rounded-lg p-3 overflow-hidden relative">
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt="Pré-visualização da Planta Cadastral"
                  className="max-h-[52vh] max-w-full object-contain shadow-lg border border-slate-300 bg-white"
                />
              ) : (
                <div className="text-xs text-slate-500">
                  Gerando pré-visualização da prancha cadastral...
                </div>
              )}
              {isRenderingPreview && (
                <div className="absolute top-2 right-2 bg-slate-900/80 text-white text-[10.5px] font-medium px-2.5 py-1 rounded-full">
                  Atualizando prancha...
                </div>
              )}
            </div>

            <div className="mt-2.5 flex items-center justify-between gap-2 text-[11px] text-slate-600">
              <span>
                Para reposicionar manualmente o corte, ative a guia e mova o mapa principal.
              </span>
              <button
                type="button"
                onClick={() => {
                  onUpdatePrintConfig({ showFrameOverlay: true });
                  onClose();
                }}
                className="px-2.5 py-1 rounded bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 font-semibold flex items-center gap-1 shrink-0"
              >
                <Crop className="w-3.5 h-3.5" />
                <span>Ajustar no Mapa</span>
              </button>
            </div>
          </div>

          {/* Direita: Configurações de Papel, Escala, Título e Botões de Exportação */}
          <div className="lg:col-span-5 flex flex-col justify-between space-y-4 text-xs">
            <div className="space-y-3.5">
              {/* Formato A4 / A3 e Orientação Retrato / Paisagem */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                    Formato da Folha
                  </label>
                  <div className="grid grid-cols-2 gap-1 bg-slate-100 p-1 rounded-lg">
                    {(['A4', 'A3'] as const).map((sz) => (
                      <button
                        key={sz}
                        type="button"
                        onClick={() => onUpdatePrintConfig({ paperSize: sz })}
                        className={`py-1.5 rounded-md font-bold transition-colors ${
                          cfg.paperSize === sz
                            ? 'bg-slate-900 text-white shadow-xs'
                            : 'text-slate-700 hover:bg-slate-200/70'
                        }`}
                      >
                        {sz}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                    Orientação
                  </label>
                  <div className="grid grid-cols-2 gap-1 bg-slate-100 p-1 rounded-lg">
                    <button
                      type="button"
                      onClick={() => onUpdatePrintConfig({ orientation: 'landscape' })}
                      className={`py-1.5 rounded-md font-semibold transition-colors ${
                        cfg.orientation === 'landscape'
                          ? 'bg-slate-900 text-white shadow-xs'
                          : 'text-slate-700 hover:bg-slate-200/70'
                      }`}
                    >
                      Paisagem
                    </button>
                    <button
                      type="button"
                      onClick={() => onUpdatePrintConfig({ orientation: 'portrait' })}
                      className={`py-1.5 rounded-md font-semibold transition-colors ${
                        cfg.orientation === 'portrait'
                          ? 'bg-slate-900 text-white shadow-xs'
                          : 'text-slate-700 hover:bg-slate-200/70'
                      }`}
                    >
                      Retrato
                    </button>
                  </div>
                </div>
              </div>

              {/* Ajuste de Escala Cartográfica */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Escala Cartográfica
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {SCALE_PRESETS.map((sc) => (
                    <button
                      key={sc}
                      type="button"
                      onClick={() => handleApplyNumericScale(sc)}
                      className={`px-2 py-1 rounded border text-[11px] font-semibold transition-colors ${
                        cfg.targetScale === sc
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      1:{sc.toLocaleString('pt-BR')}
                    </button>
                  ))}
                </div>
              </div>

              {/* Título com o Nome do Bairro */}
              <div className="space-y-2">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                    Título Principal (Nome do Bairro)
                  </label>
                  <input
                    type="text"
                    value={cfg.title}
                    onChange={(e) => onUpdatePrintConfig({ title: e.target.value })}
                    placeholder={`BAIRRO ${project.neighborhoodName.toUpperCase()}`}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-900 focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Subtítulo Técnico / Cabeçalho
                  </label>
                  <input
                    type="text"
                    value={cfg.subtitle}
                    onChange={(e) => onUpdatePrintConfig({ subtitle: e.target.value })}
                    placeholder="PLANTA CADASTRAL URBANA • MUNICÍPIO DE PONTA PORÃ – MS"
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-700 focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Elementos Técnicos da Prancha */}
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
                  Elementos Cartográficos na Prancha
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={cfg.showNorthArrow}
                    onChange={(e) =>
                      onUpdatePrintConfig({ showNorthArrow: e.target.checked })
                    }
                    className="rounded accent-blue-600"
                  />
                  <span className="text-slate-700 font-medium">
                    Inserir Orientação Norte (Rosa dos Ventos)
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={cfg.showScaleBar}
                    onChange={(e) =>
                      onUpdatePrintConfig({ showScaleBar: e.target.checked })
                    }
                    className="rounded accent-blue-600"
                  />
                  <span className="text-slate-700 font-medium">
                    Inserir Escala Gráfica Métrica
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={cfg.showLegend}
                    onChange={(e) =>
                      onUpdatePrintConfig({ showLegend: e.target.checked })
                    }
                    className="rounded accent-blue-600"
                  />
                  <span className="text-slate-700 font-medium">
                    Inserir Rodapé com Legenda Cadastral
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={cfg.showFrameOverlay}
                    onChange={(e) =>
                      onUpdatePrintConfig({ showFrameOverlay: e.target.checked })
                    }
                    className="rounded accent-blue-600"
                  />
                  <span className="text-slate-700 font-medium">
                    Mostrar guia tracejada {cfg.paperSize} sobre o mapa interativo
                  </span>
                </label>
              </div>
            </div>

            {/* Ações de Impressão e Exportação Alta Resolução */}
            <div className="space-y-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                disabled={busyAction !== null}
                onClick={handlePrintNow}
                className="w-full py-2.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white text-xs font-bold shadow-sm flex items-center justify-center gap-2 transition-colors"
              >
                <Printer className="w-4 h-4" />
                <span>
                  {busyAction === 'print'
                    ? 'Preparando Impressão...'
                    : `Imprimir Mapa (${cfg.paperSize} ${
                        cfg.orientation === 'landscape' ? 'Paisagem' : 'Retrato'
                      })`}
                </span>
              </button>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={busyAction !== null}
                  onClick={handleDownloadPDF}
                  className="py-2.5 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                >
                  <FileDown className="w-4 h-4 text-rose-400" />
                  <span>
                    {busyAction === 'pdf' ? 'Gerando PDF...' : `Exportar PDF (${cfg.paperSize})`}
                  </span>
                </button>

                <button
                  type="button"
                  disabled={busyAction !== null}
                  onClick={handleDownloadPNG}
                  className="py-2.5 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                >
                  <ImageDown className="w-4 h-4 text-emerald-400" />
                  <span>
                    {busyAction === 'png' ? 'Gerando PNG...' : 'Exportar PNG (300 DPI)'}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
