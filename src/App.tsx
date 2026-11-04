import { useState, useEffect, useRef, useCallback } from 'react';
import {
  CadastralFeature,
  CartographyConfig,
  DEFAULT_CARTOGRAPHY_CONFIG,
  DEFAULT_STYLE_PRESETS,
  FeatureStyle,
  LatLngTuple,
  NeighborhoodMapProject,
  PrintConfig,
  ToolMode,
} from './types/gis';
import {
  computePolygonCentroid,
  createInitialProjects,
  createNewNeighborhoodProject,
  generateId,
  importGeoJSONToFeatures,
  projectToGeoJSON,
} from './utils/geometryAndGeoJson';
import { fetchOsmNeighborhoodPolygon } from './data/pontaPoraBairros';
import { CadastralMapCanvas, MapBridgeHandle } from './components/CadastralMapCanvas';
import { TopHeaderBar } from './components/TopHeaderBar';
import { LeftToolsSidebar } from './components/LeftToolsSidebar';
import { InspectorTab, RightInspectorPanel } from './components/RightInspectorPanel';
import { MyMapsModal } from './components/MyMapsModal';
import { PrintExportModal } from './components/PrintExportModal';
import { LabelDialogRequest, QuickLabelDialog } from './components/QuickLabelDialog';

const STORAGE_PROJECTS_KEY = 'sig_ponta_pora_projects_v1';
const STORAGE_ACTIVE_ID_KEY = 'sig_ponta_pora_active_id_v1';
const STORAGE_CARTOGRAPHY_KEY = 'sig_ponta_pora_cartography_v1';

interface HistorySnapshot {
  features: CadastralFeature[];
  nextBlockNumber: number;
}

function loadStoredProjects(): NeighborhoodMapProject[] {
  try {
    const raw = localStorage.getItem(STORAGE_PROJECTS_KEY);
    if (!raw) return createInitialProjects();
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed.map((p: NeighborhoodMapProject) => ({
        ...p,
        defaultStyles: {
          ...DEFAULT_STYLE_PRESETS,
          ...(p.defaultStyles || {}),
        },
      }));
    }
  } catch {
    // fallback
  }
  return createInitialProjects();
}

function loadStoredCartography(): CartographyConfig {
  try {
    const raw = localStorage.getItem(STORAGE_CARTOGRAPHY_KEY);
    if (raw) {
      return { ...DEFAULT_CARTOGRAPHY_CONFIG, ...JSON.parse(raw) };
    }
  } catch {
    // fallback
  }
  return DEFAULT_CARTOGRAPHY_CONFIG;
}

export function App() {
  const [projects, setProjects] = useState<NeighborhoodMapProject[]>(loadStoredProjects);
  const [activeProjectId, setActiveProjectId] = useState<string>(() => {
    const savedId = localStorage.getItem(STORAGE_ACTIVE_ID_KEY);
    const initial = loadStoredProjects();
    if (savedId && initial.some((p) => p.id === savedId)) return savedId;
    return initial[0].id;
  });

  const [cartographyConfig, setCartographyConfig] =
    useState<CartographyConfig>(loadStoredCartography);

  const [activeTool, setActiveTool] = useState<ToolMode>('select');
  const [selectedFeatureId, setSelectedFeatureId] = useState<string | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState<boolean>(true);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('style');

  const [myMapsOpen, setMyMapsOpen] = useState<boolean>(false);
  const [printModalOpen, setPrintModalOpen] = useState<boolean>(false);
  const [labelDialog, setLabelDialog] = useState<LabelDialogRequest | null>(null);
  const [visibleStreets, setVisibleStreets] = useState<string[]>([]);
  const [isImportingBoundary, setIsImportingBoundary] = useState<boolean>(false);
  const [lastSavedAt, setLastSavedAt] = useState<string>(() =>
    new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  );
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Pilhas de Undo e Redo por projeto
  const [undoStacks, setUndoStacks] = useState<Record<string, HistorySnapshot[]>>({});
  const [redoStacks, setRedoStacks] = useState<Record<string, HistorySnapshot[]>>({});

  const mapBridgeRef = useRef<MapBridgeHandle | null>(null);

  const activeProject =
    projects.find((p) => p.id === activeProjectId) || projects[0];

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
  }, []);

  useEffect(() => {
    if (!toastMessage) return;
    const t = setTimeout(() => setToastMessage(null), 3200);
    return () => clearTimeout(t);
  }, [toastMessage]);

  // Salvamento automático contínuo em localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_PROJECTS_KEY, JSON.stringify(projects));
      localStorage.setItem(STORAGE_ACTIVE_ID_KEY, activeProject.id);
      setLastSavedAt(
        new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      );
    } catch {
      // Caso o armazenamento local atinja limite
    }
  }, [projects, activeProject.id]);

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_CARTOGRAPHY_KEY,
        JSON.stringify(cartographyConfig)
      );
    } catch {
      // noop
    }
  }, [cartographyConfig]);

  // Helper para atualizar o projeto ativo registrando histórico de Desfazer/Refazer quando recordHistory = true
  const mutateActiveProject = useCallback(
    (
      updater: (prev: NeighborhoodMapProject) => NeighborhoodMapProject,
      recordHistory = false
    ) => {
      setProjects((prevList) =>
        prevList.map((proj) => {
          if (proj.id !== activeProject.id) return proj;
          if (recordHistory) {
            const snap: HistorySnapshot = {
              features: JSON.parse(JSON.stringify(proj.features)),
              nextBlockNumber: proj.nextBlockNumber,
            };
            setUndoStacks((u) => ({
              ...u,
              [proj.id]: [...(u[proj.id] || []).slice(-49), snap],
            }));
            setRedoStacks((r) => ({
              ...r,
              [proj.id]: [],
            }));
          }
          const updated = updater(proj);
          return {
            ...updated,
            updatedAt: new Date().toISOString(),
          };
        })
      );
    },
    [activeProject.id]
  );

  const canUndo = (undoStacks[activeProject.id]?.length || 0) > 0;
  const canRedo = (redoStacks[activeProject.id]?.length || 0) > 0;

  const handleUndo = useCallback(() => {
    const stack = undoStacks[activeProject.id] || [];
    if (stack.length === 0) return;
    const previous = stack[stack.length - 1];
    const currentSnap: HistorySnapshot = {
      features: JSON.parse(JSON.stringify(activeProject.features)),
      nextBlockNumber: activeProject.nextBlockNumber,
    };

    setUndoStacks((u) => ({
      ...u,
      [activeProject.id]: stack.slice(0, -1),
    }));
    setRedoStacks((r) => ({
      ...r,
      [activeProject.id]: [...(r[activeProject.id] || []), currentSnap],
    }));

    setProjects((prevList) =>
      prevList.map((p) =>
        p.id === activeProject.id
          ? {
              ...p,
              features: previous.features,
              nextBlockNumber: previous.nextBlockNumber,
              updatedAt: new Date().toISOString(),
            }
          : p
      )
    );
    setSelectedFeatureId(null);
  }, [activeProject, undoStacks]);

  const handleRedo = useCallback(() => {
    const stack = redoStacks[activeProject.id] || [];
    if (stack.length === 0) return;
    const nextSnap = stack[stack.length - 1];
    const currentSnap: HistorySnapshot = {
      features: JSON.parse(JSON.stringify(activeProject.features)),
      nextBlockNumber: activeProject.nextBlockNumber,
    };

    setRedoStacks((r) => ({
      ...r,
      [activeProject.id]: stack.slice(0, -1),
    }));
    setUndoStacks((u) => ({
      ...u,
      [activeProject.id]: [...(u[activeProject.id] || []), currentSnap],
    }));

    setProjects((prevList) =>
      prevList.map((p) =>
        p.id === activeProject.id
          ? {
              ...p,
              features: nextSnap.features,
              nextBlockNumber: nextSnap.nextBlockNumber,
              updatedAt: new Date().toISOString(),
            }
          : p
      )
    );
    setSelectedFeatureId(null);
  }, [activeProject, redoStacks]);

  const handleAddFeature = useCallback(
    (feature: CadastralFeature, incrementBlock = false) => {
      mutateActiveProject(
        (prev) => ({
          ...prev,
          features: [...prev.features, feature],
          nextBlockNumber: incrementBlock
            ? prev.nextBlockNumber + 1
            : prev.nextBlockNumber,
        }),
        true
      );
    },
    [mutateActiveProject]
  );

  const handleUpdateFeature = useCallback(
    (id: string, updater: (prev: CadastralFeature) => CadastralFeature) => {
      mutateActiveProject(
        (prev) => ({
          ...prev,
          features: prev.features.map((f) => (f.id === id ? updater(f) : f)),
        }),
        true
      );
    },
    [mutateActiveProject]
  );

  const handleDeleteFeature = useCallback(
    (id: string) => {
      mutateActiveProject(
        (prev) => ({
          ...prev,
          features: prev.features.filter((f) => f.id !== id),
        }),
        true
      );
      if (selectedFeatureId === id) {
        setSelectedFeatureId(null);
      }
    },
    [mutateActiveProject, selectedFeatureId]
  );

  // Atalhos globais de teclado (Ctrl+Z, Ctrl+Y, Delete, Escape)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const isTyping = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
      if (isTyping) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
        return;
      }
      if (
        ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'z')
      ) {
        e.preventDefault();
        handleRedo();
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedFeatureId) {
        e.preventDefault();
        handleDeleteFeature(selectedFeatureId);
        return;
      }
      if (e.key === 'Escape') {
        setActiveTool('select');
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleUndo, handleRedo, handleDeleteFeature, selectedFeatureId]);

  const handleViewportChange = useCallback(
    (center: LatLngTuple, zoom: number) => {
      setProjects((prevList) =>
        prevList.map((p) =>
          p.id === activeProject.id ? { ...p, center, zoom } : p
        )
      );
    },
    [activeProject.id]
  );

  const handleRenameActiveNeighborhood = (newName: string) => {
    mutateActiveProject((prev) => ({
      ...prev,
      neighborhoodName: newName,
      printConfig: {
        ...prev.printConfig,
        title: `BAIRRO ${newName.toUpperCase()}`,
      },
    }));
    showToast(`Bairro renomeado para "${newName}"`);
  };

  const handleApplyStyleToAllBlocks = (stylePatch: Partial<FeatureStyle>) => {
    mutateActiveProject(
      (prev) => ({
        ...prev,
        defaultStyles: {
          ...prev.defaultStyles,
          quarteirao: { ...prev.defaultStyles.quarteirao, ...stylePatch },
        },
        features: prev.features.map((f) =>
          f.kind === 'quarteirao'
            ? { ...f, style: { ...f.style, ...stylePatch } }
            : f
        ),
      }),
      true
    );
    showToast('Estilo aplicado a todos os quarteirões do bairro');
  };

  const handleResequenceBlocks = () => {
    let counter = 1;
    mutateActiveProject(
      (prev) => {
        const updatedFeatures = prev.features.map((f) => {
          if (f.kind !== 'quarteirao') return f;
          const num = counter++;
          return {
            ...f,
            blockNumber: num,
            name: `${prev.blockPrefix}${num}`,
          };
        });
        return {
          ...prev,
          features: updatedFeatures,
          nextBlockNumber: counter,
        };
      },
      true
    );
    showToast('Quarteirões renumerados em sequência');
  };

  // Busca opcional de perímetro administrativo do bairro no OpenStreetMap
  const handleImportOsmBoundaryForActive = async () => {
    setIsImportingBoundary(true);
    try {
      const poly = await fetchOsmNeighborhoodPolygon(activeProject.neighborhoodName);
      if (!poly || poly.length < 3) {
        showToast(
          `Limite automático não encontrado no OSM para "${activeProject.neighborhoodName}". Desenhe o contorno clicando nos vértices do mapa.`
        );
        return;
      }
      const feat: CadastralFeature = {
        id: generateId('bairro'),
        kind: 'bairro',
        name: activeProject.neighborhoodName,
        geometryType: 'Polygon',
        coordinates: poly,
        labelPosition: computePolygonCentroid(poly),
        style: { ...activeProject.defaultStyles.bairro },
      };
      handleAddFeature(feat, false);
      setSelectedFeatureId(feat.id);
      setActiveTool('select');
      setTimeout(() => mapBridgeRef.current?.fitToNeighborhood(), 120);
      showToast(
        `Perímetro de "${activeProject.neighborhoodName}" importado do OpenStreetMap (${poly.length} vértices editáveis)`
      );
    } finally {
      setIsImportingBoundary(false);
    }
  };

  // Gerenciamento de "Meus Mapas"
  const handleCreateProject = async (params: {
    neighborhoodName: string;
    center: LatLngTuple;
    zoom: number;
    sectorCode: string;
    autoFetchOsmBoundary: boolean;
  }) => {
    let initialFeatures: CadastralFeature[] = [];
    if (params.autoFetchOsmBoundary) {
      const poly = await fetchOsmNeighborhoodPolygon(params.neighborhoodName);
      if (poly && poly.length >= 3) {
        initialFeatures = [
          {
            id: generateId('bairro'),
            kind: 'bairro',
            name: params.neighborhoodName,
            geometryType: 'Polygon',
            coordinates: poly,
            labelPosition: computePolygonCentroid(poly),
            style: { ...DEFAULT_STYLE_PRESETS.bairro },
          },
        ];
      }
    }

    const created = createNewNeighborhoodProject({
      neighborhoodName: params.neighborhoodName,
      center: params.center,
      zoom: params.zoom,
      sectorCode: params.sectorCode,
      features: initialFeatures,
    });

    setProjects((prev) => [created, ...prev]);
    setActiveProjectId(created.id);
    setSelectedFeatureId(initialFeatures[0]?.id || null);
    setActiveTool('select');

    if (initialFeatures.length > 0) {
      setTimeout(() => mapBridgeRef.current?.fitToNeighborhood(), 260);
      showToast(`Mapa de "${params.neighborhoodName}" criado com perímetro OSM editável`);
    } else {
      showToast(`Novo mapa criado para o bairro "${params.neighborhoodName}"`);
    }
  };

  const handleDuplicateProject = (id: string) => {
    const source = projects.find((p) => p.id === id);
    if (!source) return;
    const now = new Date().toISOString();
    const copy: NeighborhoodMapProject = {
      ...JSON.parse(JSON.stringify(source)),
      id: generateId('map'),
      neighborhoodName: `${source.neighborhoodName} (Cópia)`,
      createdAt: now,
      updatedAt: now,
    };
    copy.printConfig.title = `BAIRRO ${copy.neighborhoodName.toUpperCase()}`;
    setProjects((prev) => [copy, ...prev]);
    showToast(`Mapa "${source.neighborhoodName}" duplicado`);
  };

  const handleRenameProjectById = (id: string, newName: string) => {
    setProjects((prev) =>
      prev.map((p) =>
        p.id === id
          ? {
              ...p,
              neighborhoodName: newName,
              printConfig: {
                ...p.printConfig,
                title: `BAIRRO ${newName.toUpperCase()}`,
              },
              updatedAt: new Date().toISOString(),
            }
          : p
      )
    );
    showToast(`Mapa renomeado para "${newName}"`);
  };

  const handleDeleteProjectById = (id: string) => {
    if (projects.length <= 1) return;
    const remaining = projects.filter((p) => p.id !== id);
    setProjects(remaining);
    if (activeProjectId === id) {
      setActiveProjectId(remaining[0].id);
      setSelectedFeatureId(null);
    }
    showToast('Mapa excluído');
  };

  const handleExportGeoJSON = (proj: NeighborhoodMapProject) => {
    const geojson = projectToGeoJSON(proj);
    const blob = new Blob([JSON.stringify(geojson, null, 2)], {
      type: 'application/geo+json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const slug =
      proj.neighborhoodName
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9_-]+/g, '_') || 'Bairro';
    const a = document.createElement('a');
    a.href = url;
    a.download = `Mapa_${slug}_Ponta_Pora.geojson`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(`Projeto "${proj.neighborhoodName}" exportado em GeoJSON`);
  };

  const handleImportGeoJSONFile = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const { features, neighborhoodName, center, zoom } =
        importGeoJSONToFeatures(parsed);

      if (features.length === 0) {
        showToast('Nenhum elemento geométrico válido encontrado no GeoJSON.');
        return;
      }

      const fallbackName = file.name.replace(/\.(geo)?json$/i, '');
      const firstCoord: LatLngTuple | undefined =
        center ||
        (features[0].geometryType === 'Polygon' ||
        features[0].geometryType === 'LineString'
          ? computePolygonCentroid(features[0].coordinates as LatLngTuple[])
          : (features[0].coordinates as LatLngTuple));

      const importedProj = createNewNeighborhoodProject({
        neighborhoodName: neighborhoodName || fallbackName || 'Bairro Importado',
        center: firstCoord,
        zoom: zoom || 16.25,
        features,
      });

      const maxBlock = features.reduce(
        (acc, f) =>
          typeof f.blockNumber === 'number' && f.blockNumber >= acc
            ? f.blockNumber + 1
            : acc,
        1
      );
      importedProj.nextBlockNumber = maxBlock;

      setProjects((prev) => [importedProj, ...prev]);
      setActiveProjectId(importedProj.id);
      setMyMapsOpen(false);
      showToast(
        `GeoJSON importado com ${features.length} elementos para "${importedProj.neighborhoodName}"`
      );
    } catch {
      showToast('Erro ao ler o arquivo GeoJSON selecionado.');
    }
  };

  const handleUpdatePrintConfig = (patch: Partial<PrintConfig>) => {
    mutateActiveProject((prev) => ({
      ...prev,
      printConfig: { ...prev.printConfig, ...patch },
    }));
  };

  const handleNavigateToPlace = (
    center: LatLngTuple,
    zoom: number,
    suggestedBairroName?: string
  ) => {
    mapBridgeRef.current?.flyTo(center, zoom);
    // Se o mapa atual ainda está vazio e o usuário escolheu um bairro específico, atualiza o nome para agilizar o fluxo
    if (suggestedBairroName && activeProject.features.length === 0) {
      mutateActiveProject((prev) => ({
        ...prev,
        neighborhoodName: suggestedBairroName,
        center,
        zoom,
        printConfig: {
          ...prev.printConfig,
          title: `BAIRRO ${suggestedBairroName.toUpperCase()}`,
        },
      }));
      showToast(`Localizado: Bairro ${suggestedBairroName}`);
    }
  };

  const selectedFeature =
    activeProject.features.find((f) => f.id === selectedFeatureId) || null;

  const handleClearAllFeatures = () => {
    const total = activeProject.features.length;
    if (total === 0) return;
    mutateActiveProject(
      (prev) => ({ ...prev, features: [], nextBlockNumber: 1 }),
      true // entra no histórico: Ctrl+Z restaura tudo
    );
    setSelectedFeatureId(null);
    showToast(`${total} marcações apagadas. Ctrl+Z desfaz.`);
  };

  const handleAlignSelectedToStreet = () => {
    const f = selectedFeature;
    if (!f) return;
    let pos: LatLngTuple | null = null;
    if (f.geometryType === 'Point' || f.geometryType === 'Circle') {
      pos = f.coordinates as LatLngTuple;
    } else if (f.geometryType === 'Polygon') {
      pos =
        f.labelPosition || computePolygonCentroid(f.coordinates as LatLngTuple[]);
    }
    if (!pos) return;
    const angle = mapBridgeRef.current?.getStreetAngleAt(pos[0], pos[1]);
    if (angle === null || angle === undefined) {
      showToast(
        'Nenhuma rua encontrada perto do texto. Arraste o texto para perto da rua (e use a planta com ruas, não o raster).'
      );
      return;
    }
    handleUpdateFeature(f.id, (prev) => ({
      ...prev,
      style: { ...prev.style, rotation: angle },
    }));
    showToast(`Texto alinhado com a rua (${angle}°).`);
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-slate-100 overflow-hidden">
      {/* Painel Superior GIS */}
      <TopHeaderBar
        project={activeProject}
        totalProjects={projects.length}
        lastSavedAt={lastSavedAt}
        onRenameNeighborhood={handleRenameActiveNeighborhood}
        onManualSave={() => {
          localStorage.setItem(STORAGE_PROJECTS_KEY, JSON.stringify(projects));
          showToast('Todos os desenhos e identificações foram salvos.');
        }}
        onOpenMyMaps={() => setMyMapsOpen(true)}
        onExportGeoJSON={() => handleExportGeoJSON(activeProject)}
        onOpenPrintModal={() => setPrintModalOpen(true)}
        onNavigateToPlace={handleNavigateToPlace}
      />

      {/* Área Principal de Trabalho: Barra Lateral de Ferramentas + Mapa Cadastral + Inspetor */}
      <div className="flex-1 flex min-h-0 relative">
        <LeftToolsSidebar
          activeTool={activeTool}
          onSelectTool={(tool) => {
            setActiveTool(tool);
            if (tool === 'quarteirao_poly' || tool === 'quarteirao_num') {
              setInspectorTab('style');
            }
          }}
          canUndo={canUndo}
          canRedo={canRedo}
          onUndo={handleUndo}
          onRedo={handleRedo}
          onOpenStyleInspector={() => {
            setInspectorOpen(true);
            setInspectorTab('style');
          }}
          onImportOsmBoundary={handleImportOsmBoundaryForActive}
          isImportingBoundary={isImportingBoundary}
          nextBlockBadge={String(activeProject.nextBlockNumber)}
        />

        <CadastralMapCanvas
          project={activeProject}
          cartographyConfig={cartographyConfig}
          activeTool={activeTool}
          selectedFeatureId={selectedFeatureId}
          onSelectFeature={(id) => {
            setSelectedFeatureId(id);
            if (id) {
              setInspectorOpen(true);
              setInspectorTab('style');
            }
          }}
          onAddFeature={handleAddFeature}
          onUpdateFeature={handleUpdateFeature}
          onDeleteFeature={handleDeleteFeature}
          onViewportChange={handleViewportChange}
          onVisibleStreetsChange={setVisibleStreets}
          onRequestLabelInput={(req) => setLabelDialog(req)}
          onRequestToolChange={(tool) => setActiveTool(tool)}
          onCloseFrameOverlay={() => handleUpdatePrintConfig({ showFrameOverlay: false })}
          onOpenPrintModal={() => setPrintModalOpen(true)}
          mapBridgeRef={mapBridgeRef}
        />

        <RightInspectorPanel
          isOpen={inspectorOpen}
          onToggleOpen={() => setInspectorOpen((v) => !v)}
          activeTab={inspectorTab}
          onChangeTab={setInspectorTab}
          project={activeProject}
          activeTool={activeTool}
          selectedFeature={selectedFeature}
          onSelectFeature={setSelectedFeatureId}
          onUpdateFeature={handleUpdateFeature}
          onDeleteFeature={handleDeleteFeature}
          onUpdateProjectMeta={(updater) => mutateActiveProject(updater, false)}
          onApplyStyleToAllBlocks={handleApplyStyleToAllBlocks}
          onResequenceBlocks={handleResequenceBlocks}
          cartographyConfig={cartographyConfig}
          onChangeCartography={setCartographyConfig}
          visibleStreets={visibleStreets}
          onFocusCoords={(coords, z) => mapBridgeRef.current?.flyTo(coords, z)}
          onAlignToStreet={handleAlignSelectedToStreet}
          onSelectTool={(tool) => setActiveTool(tool)}
          onClearAllFeatures={handleClearAllFeatures}
        />
      </div>

      {/* Modal: Meus Mapas */}
      <MyMapsModal
        isOpen={myMapsOpen}
        onClose={() => setMyMapsOpen(false)}
        projects={projects}
        activeProjectId={activeProject.id}
        onOpenProject={(id) => {
          setActiveProjectId(id);
          setSelectedFeatureId(null);
          setActiveTool('select');
        }}
        onCreateProject={handleCreateProject}
        onDuplicateProject={handleDuplicateProject}
        onRenameProject={handleRenameProjectById}
        onDeleteProject={handleDeleteProjectById}
        onExportProjectGeoJSON={handleExportGeoJSON}
        onImportGeoJSONFile={handleImportGeoJSONFile}
      />

      {/* Modal: Compositor de Impressão A4/A3 e Exportação PDF/PNG */}
      <PrintExportModal
        isOpen={printModalOpen}
        onClose={() => setPrintModalOpen(false)}
        project={activeProject}
        onUpdatePrintConfig={handleUpdatePrintConfig}
        mapBridgeRef={mapBridgeRef}
        selectedFeatureId={selectedFeatureId}
      />

      {/* Diálogo Rápido para Inserir / Editar Textos e Identificações de Quarteirões */}
      <QuickLabelDialog
        request={labelDialog}
        onClose={() => setLabelDialog(null)}
        nextSequentialSuggestion={`${activeProject.blockPrefix}${activeProject.nextBlockNumber}`}
      />

      {/* Notificação Flutuante Discreta */}
      {toastMessage && (
        <div className="fixed bottom-4 right-4 z-[1200] bg-slate-900 text-white text-xs font-medium px-4 py-2.5 rounded-lg shadow-xl border border-slate-700 no-print">
          {toastMessage}
        </div>
      )}
    </div>
  );
}

export default App;
