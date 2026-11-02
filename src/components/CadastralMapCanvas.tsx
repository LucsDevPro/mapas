import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as L from 'leaflet';
import '@geoman-io/leaflet-geoman-free';
import { Plus, Minus, Maximize2, Compass, Crosshair, Printer, X } from 'lucide-react';
import {
  CadastralFeature,
  CartographyConfig,
  LatLngTuple,
  NeighborhoodMapProject,
  ToolMode,
} from '../types/gis';
import { CadastralBaseLayer } from '../map/leafletCadastralBase';
import {
  computeGraphicScaleBar,
  computePolygonCentroid,
  generateId,
  getApproximateScale,
} from '../utils/geometryAndGeoJson';
import { getMapFrameViewportCrop } from '../utils/exportAndPrint';
import { PONTA_PORA_CENTER } from '../data/pontaPoraBairros';

export interface MapBridgeHandle {
  getLeafletMap: () => L.Map | null;
  getMapContainer: () => HTMLElement | null;
  /** Aguarda o término do carregamento das ruas/nomes antes de capturar a prancha */
  waitForBasemap: () => Promise<void>;
  flyTo: (center: LatLngTuple, zoom?: number) => void;
  fitToNeighborhood: () => void;
  /** Enquadra o polígono (selecionado ou do bairro) dentro da área útil de impressão com pequena margem */
  fitToFeatureForPrint: (featureId: string | null) => boolean;
}

interface CadastralMapCanvasProps {
  project: NeighborhoodMapProject;
  cartographyConfig: CartographyConfig;
  activeTool: ToolMode;
  selectedFeatureId: string | null;
  onSelectFeature: (id: string | null) => void;
  onAddFeature: (feature: CadastralFeature, incrementBlock?: boolean) => void;
  onUpdateFeature: (id: string, updater: (prev: CadastralFeature) => CadastralFeature) => void;
  onDeleteFeature: (id: string) => void;
  onViewportChange: (center: LatLngTuple, zoom: number) => void;
  onVisibleStreetsChange: (streets: string[]) => void;
  onRequestToolChange?: (tool: ToolMode) => void;
  /** Desliga a guia de enquadramento de impressão sobre o mapa */
  onCloseFrameOverlay: () => void;
  /** Reabre o compositor de impressão (depois de ajustar o enquadramento) */
  onOpenPrintModal: () => void;
  onRequestLabelInput: (params: {
    title: string;
    defaultValue: string;
    placeholder: string;
    onConfirm: (value: string) => void;
  }) => void;
  mapBridgeRef: React.MutableRefObject<MapBridgeHandle | null>;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function createLabelDivIcon(feature: CadastralFeature, isSelected: boolean): L.DivIcon {
  const st = feature.style;
  const text = escapeHtml(feature.name || '');
  const rot = st.rotation || 0;
  const weight = st.fontWeight === 'normal' ? 500 : 700;
  const fontSize = st.fontSize || 13;
  const family = st.fontFamily || 'Inter';

  let bgCss = '';
  let extraClass = '';

  if (st.labelBg === 'badge') {
    bgCss = `background: rgba(255,255,255,0.94); border: 1.5px solid ${
      st.strokeColor || st.textColor
    }; padding: 2px 7px; border-radius: 4px; box-shadow: 0 1px 2px rgba(15,23,42,0.12);`;
  } else if (st.labelBg === 'halo') {
    extraClass = 'cadastral-text-halo';
    bgCss = 'padding: 1px 3px;';
  } else {
    bgCss = 'padding: 1px 3px;';
  }

  const html = `
    <div style="transform: translate(-50%, -50%) rotate(${rot}deg); transform-origin: center center; display: inline-block; pointer-events: auto;">
      <span class="cadastral-label-inner ${extraClass}" style="font-family: '${family}', Inter, sans-serif; font-size: ${fontSize}px; font-weight: ${weight}; color: ${st.textColor}; ${bgCss}">
        ${text}
      </span>
    </div>
  `;

  return L.divIcon({
    className: `cadastral-label-marker ${isSelected ? 'cadastral-label-selected' : ''}`,
    html,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

export const CadastralMapCanvas: React.FC<CadastralMapCanvasProps> = ({
  project,
  cartographyConfig,
  activeTool,
  selectedFeatureId,
  onSelectFeature,
  onAddFeature,
  onUpdateFeature,
  onDeleteFeature,
  onViewportChange,
  onVisibleStreetsChange,
  onRequestLabelInput,
  onRequestToolChange,
  onCloseFrameOverlay,
  onOpenPrintModal,
  mapBridgeRef,
}) => {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const cadastralBaseRef = useRef<CadastralBaseLayer | null>(null);
  const rasterLayerRef = useRef<L.TileLayer | null>(null);
  const featureGroupRef = useRef<L.LayerGroup | null>(null);
  const shapeLayersMapRef = useRef<Map<string, L.Layer>>(new Map());
  const labelMarkersMapRef = useRef<Map<string, L.Marker>>(new Map());

  // Mantém refs atualizadas para callbacks de eventos do Leaflet
  const latestPropsRef = useRef({
    project,
    activeTool,
    selectedFeatureId,
    onSelectFeature,
    onAddFeature,
    onUpdateFeature,
    onDeleteFeature,
    onRequestLabelInput,
    onRequestToolChange,
  });
  latestPropsRef.current = {
    project,
    activeTool,
    selectedFeatureId,
    onSelectFeature,
    onAddFeature,
    onUpdateFeature,
    onDeleteFeature,
    onRequestLabelInput,
    onRequestToolChange,
  };

  const [cursorCoords, setCursorCoords] = useState<LatLngTuple>(project.center);
  const [liveCenter, setLiveCenter] = useState<LatLngTuple>(project.center);
  const [liveZoom, setLiveZoom] = useState<number>(project.zoom);
  const [containerDims, setContainerDims] = useState<{ w: number; h: number }>({
    w: 1200,
    h: 800,
  });
  const [streetCount, setStreetCount] = useState(0);

  const handleStreetNames = useCallback(
    (names: string[]) => {
      setStreetCount(names.length);
      onVisibleStreetsChange(names);
    },
    [onVisibleStreetsChange]
  );

  const collectVisibleStreets = useCallback(() => {
    const base = cadastralBaseRef.current;
    if (!base) return;
    onVisibleStreetsChange(base.getStreetNames());
  }, [onVisibleStreetsChange]);

  const fitToNeighborhood = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const { project: curProj } = latestPropsRef.current;
    const bairroPolys = curProj.features.filter(
      (f) => f.kind === 'bairro' && f.geometryType === 'Polygon'
    );
    const targetFeatures =
      bairroPolys.length > 0
        ? bairroPolys
        : curProj.features.filter((f) => f.geometryType === 'Polygon');

    if (targetFeatures.length > 0) {
      const allPts: L.LatLngExpression[] = [];
      for (const f of targetFeatures) {
        for (const pt of f.coordinates as LatLngTuple[]) {
          allPts.push([pt[0], pt[1]]);
        }
      }
      if (allPts.length >= 2) {
        map.fitBounds(L.latLngBounds(allPts), {
          padding: [48, 48],
          maxZoom: 18,
        });
        return;
      }
    }
    map.flyTo(curProj.center, curProj.zoom, { duration: 0.6 });
  }, []);

  const fitToFeatureForPrint = useCallback((featureId: string | null): boolean => {
    const map = mapRef.current;
    if (!map) return false;
    const { project: curProj } = latestPropsRef.current;
    let target = featureId ? curProj.features.find((f) => f.id === featureId) : undefined;
    if (!target || (target.geometryType !== 'Polygon' && target.geometryType !== 'LineString' && target.geometryType !== 'Circle')) {
      target =
        curProj.features.find((f) => f.kind === 'bairro' && f.geometryType === 'Polygon') ||
        curProj.features.find((f) => f.geometryType === 'Polygon');
    }
    if (!target) return false;

    let bounds: L.LatLngBounds;
    if (target.geometryType === 'Circle') {
      bounds = L.circle(target.coordinates as LatLngTuple, { radius: target.radius || 50 }).getBounds();
    } else {
      bounds = L.latLngBounds((target.coordinates as LatLngTuple[]).map((p) => L.latLng(p[0], p[1])));
    }

    const size = map.getSize();
    const { cropX, cropY, cropW, cropH } = getMapFrameViewportCrop(
      size.x,
      size.y,
      latestPropsRef.current.project.printConfig
    );
    const m = Math.round(Math.min(cropW, cropH) * 0.06); // pequena margem ao redor do polígono
    map.fitBounds(bounds, {
      paddingTopLeft: [cropX + m, cropY + m],
      paddingBottomRight: [size.x - cropX - cropW + m, size.y - cropY - cropH + m],
      animate: false,
      maxZoom: 20,
    });
    return true;
  }, []);

  // Inicializa o mapa Leaflet uma única vez
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: project.center,
      zoom: project.zoom,
      zoomSnap: 0.25,
      zoomDelta: 0.5,
      wheelPxPerZoomLevel: 90,
      minZoom: 11,
      maxZoom: 21,
      zoomControl: false,
      attributionControl: true,
    });

    map.attributionControl.setPrefix('SIG Urbano Ponta Porã – MS');

    // Configura idioma português no Leaflet-Geoman
    if ((map as any).pm) {
      (map as any).pm.setLang('pt_br');
      (map as any).pm.setGlobalOptions({
        snappable: true,
        snapDistance: 12,
        allowSelfIntersection: false,
      });
    }

    const fg = L.layerGroup().addTo(map);
    featureGroupRef.current = fg;
    mapRef.current = map;

    const updateSizeState = () => {
      const sz = map.getSize();
      setContainerDims({ w: sz.x, h: sz.y });
    };
    updateSizeState();

    map.on('mousemove', (e: L.LeafletMouseEvent) => {
      setCursorCoords([e.latlng.lat, e.latlng.lng]);
    });

    map.on('move', () => {
      const c = map.getCenter();
      setLiveCenter([c.lat, c.lng]);
      setLiveZoom(map.getZoom());
    });

    map.on('moveend', () => {
      const c = map.getCenter();
      const z = map.getZoom();
      setLiveCenter([c.lat, c.lng]);
      setLiveZoom(z);
      onViewportChange([c.lat, c.lng], z);
      setTimeout(collectVisibleStreets, 250);
    });

    map.on('resize', updateSizeState);

    // Clique direto no mapa para: desselecionar, numerar quarteirão em 1 clique ou inserir texto
    map.on('click', (e: L.LeafletMouseEvent) => {
      const {
        activeTool: tool,
        project: curProj,
        onAddFeature: addFeat,
        onSelectFeature: selFeat,
        onRequestLabelInput: reqInput,
      } = latestPropsRef.current;

      const clickCoord: LatLngTuple = [
        Number(e.latlng.lat.toFixed(6)),
        Number(e.latlng.lng.toFixed(6)),
      ];

      if (tool === 'quarteirao_num') {
        const nextNum = curProj.nextBlockNumber;
        const autoLabel = `${curProj.blockPrefix}${nextNum}`;
        if (curProj.numberingMode === 'auto') {
          const feat: CadastralFeature = {
            id: generateId('qnum'),
            kind: 'quarteirao',
            name: autoLabel,
            blockNumber: nextNum,
            geometryType: 'Point',
            coordinates: clickCoord,
            style: { ...curProj.defaultStyles.quarteirao },
          };
          addFeat(feat, true);
          selFeat(feat.id);
        } else {
          reqInput({
            title: 'Identificação do Quarteirão',
            defaultValue: autoLabel,
            placeholder: 'Ex.: QUARTEIRÃO 1',
            onConfirm: (val) => {
              const trimmed = val.trim();
              if (!trimmed) return;
              const feat: CadastralFeature = {
                id: generateId('qnum'),
                kind: 'quarteirao',
                name: trimmed,
                blockNumber: nextNum,
                geometryType: 'Point',
                coordinates: clickCoord,
                style: { ...curProj.defaultStyles.quarteirao },
              };
              addFeat(feat, true);
              selFeat(feat.id);
            },
          });
        }
        return;
      }

      if (tool === 'text') {
        reqInput({
          title: 'Inserir Texto no Mapa',
          defaultValue: '',
          placeholder: 'Ex.: QUARTEIRÃO 1, RUA PROJETADA A, PRAÇA CENTRAL...',
          onConfirm: (val) => {
            const trimmed = val.trim();
            if (!trimmed) return;
            const feat: CadastralFeature = {
              id: generateId('txt'),
              kind: 'text',
              name: trimmed,
              geometryType: 'Point',
              coordinates: clickCoord,
              style: { ...curProj.defaultStyles.text },
            };
            addFeat(feat, false);
            selFeat(feat.id);
            // Volta para Selecionar para permitir mover o texto imediatamente
            setTimeout(() => latestPropsRef.current.onRequestToolChange?.('select'), 80);
          },
        });
        return;
      }

      if (tool === 'select') {
        selFeat(null);
      }
    });

    // Evento de criação de geometria do Leaflet-Geoman
    map.on('pm:create', (e: any) => {
      const layer = e.layer;
      const shape = e.shape; // 'Polygon' | 'Line' | 'Circle'
      const {
        activeTool: tool,
        project: curProj,
        onAddFeature: addFeat,
        onSelectFeature: selFeat,
        onRequestLabelInput: reqInput,
      } = latestPropsRef.current;

      // Remove a camada temporária do Geoman e grava no estado controlado (com Undo/Redo)
      map.removeLayer(layer);

      if (shape === 'Polygon') {
        const rawLatLngs = layer.getLatLngs();
        const ring: L.LatLng[] = Array.isArray(rawLatLngs[0])
          ? rawLatLngs[0]
          : rawLatLngs;
        const coords: LatLngTuple[] = ring.map((ll: L.LatLng) => [
          Number(ll.lat.toFixed(6)),
          Number(ll.lng.toFixed(6)),
        ]);
        if (coords.length < 3) return;
        const centroid = computePolygonCentroid(coords);

        if (tool === 'bairro') {
          const feat: CadastralFeature = {
            id: generateId('bairro'),
            kind: 'bairro',
            name: curProj.neighborhoodName,
            geometryType: 'Polygon',
            coordinates: coords,
            labelPosition: centroid,
            style: { ...curProj.defaultStyles.bairro },
          };
          addFeat(feat, false);
          selFeat(feat.id);
        } else if (tool === 'quarteirao_poly') {
          const nextNum = curProj.nextBlockNumber;
          const autoLabel = `${curProj.blockPrefix}${nextNum}`;

          if (curProj.numberingMode === 'auto') {
            const feat: CadastralFeature = {
              id: generateId('quadra'),
              kind: 'quarteirao',
              name: autoLabel,
              blockNumber: nextNum,
              geometryType: 'Polygon',
              coordinates: coords,
              labelPosition: centroid,
              style: { ...curProj.defaultStyles.quarteirao },
            };
            addFeat(feat, true);
            selFeat(feat.id);
          } else {
            reqInput({
              title: 'Numerar / Identificar Quarteirão',
              defaultValue: autoLabel,
              placeholder: 'Ex.: QUARTEIRÃO 1',
              onConfirm: (val) => {
                const feat: CadastralFeature = {
                  id: generateId('quadra'),
                  kind: 'quarteirao',
                  name: val.trim() || autoLabel,
                  blockNumber: nextNum,
                  geometryType: 'Polygon',
                  coordinates: coords,
                  labelPosition: centroid,
                  style: { ...curProj.defaultStyles.quarteirao },
                };
                addFeat(feat, true);
                selFeat(feat.id);
              },
            });
          }

          // Reativa o desenho contínuo para permitir desenhar várias quadras em sequência!
          setTimeout(() => {
            if (
              mapRef.current &&
              latestPropsRef.current.activeTool === 'quarteirao_poly'
            ) {
              const st = latestPropsRef.current.project.defaultStyles.quarteirao;
              (mapRef.current as any).pm.enableDraw('Polygon', {
                snappable: true,
                snapDistance: 12,
                pathOptions: {
                  color: st.strokeColor,
                  weight: st.strokeWidth,
                  fillColor: st.fillColor,
                  fillOpacity: st.fillOpacity,
                },
              });
            }
          }, 60);
        } else {
          const feat: CadastralFeature = {
            id: generateId('poly'),
            kind: 'polygon',
            name: '',
            geometryType: 'Polygon',
            coordinates: coords,
            labelPosition: centroid,
            style: { ...curProj.defaultStyles.shape },
          };
          addFeat(feat, false);
          selFeat(feat.id);
        }
      } else if (shape === 'Line') {
        const lls: L.LatLng[] = layer.getLatLngs();
        const coords: LatLngTuple[] = lls.map((ll: L.LatLng) => [
          Number(ll.lat.toFixed(6)),
          Number(ll.lng.toFixed(6)),
        ]);
        if (coords.length < 2) return;
        const feat: CadastralFeature = {
          id: generateId('line'),
          kind: 'polyline',
          name: '',
          geometryType: 'LineString',
          coordinates: coords,
          style: { ...curProj.defaultStyles.shape },
        };
        addFeat(feat, false);
        selFeat(feat.id);
      } else if (shape === 'Circle') {
        const c: L.LatLng = layer.getLatLng();
        const radius: number = Math.round(layer.getRadius());
        const feat: CadastralFeature = {
          id: generateId('circle'),
          kind: 'circle',
          name: '',
          geometryType: 'Circle',
          coordinates: [Number(c.lat.toFixed(6)), Number(c.lng.toFixed(6))],
          radius,
          style: { ...curProj.defaultStyles.shape },
        };
        addFeat(feat, false);
        selFeat(feat.id);
      }
    });

    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize();
      updateSizeState();
    });
    resizeObserver.observe(mapContainerRef.current);

    return () => {
      resizeObserver.disconnect();
      cadastralBaseRef.current?.destroy();
      cadastralBaseRef.current = null;
      map.remove();
      mapRef.current = null;
      rasterLayerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Expõe a ponte imperativa para exportação PDF/PNG, impressão e navegação
  useEffect(() => {
    mapBridgeRef.current = {
      getLeafletMap: () => mapRef.current,
      getMapContainer: () => mapRef.current?.getContainer() || null,
      waitForBasemap: () =>
        cadastralBaseRef.current?.waitUntilReady(3500) ?? Promise.resolve(),
      flyTo: (center: LatLngTuple, zoom?: number) => {
        const map = mapRef.current;
        if (!map) return;
        map.flyTo(center, zoom ?? map.getZoom(), { duration: 0.65 });
      },
      fitToNeighborhood,
      fitToFeatureForPrint,
    };
  }, [mapBridgeRef, fitToNeighborhood, fitToFeatureForPrint]);

  // Quando troca de projeto em "Meus Mapas", posiciona a câmera no bairro correspondente
  const prevProjectIdRef = useRef<string>(project.id);
  useEffect(() => {
    if (prevProjectIdRef.current !== project.id) {
      prevProjectIdRef.current = project.id;
      const map = mapRef.current;
      if (map) {
        map.setView(project.center, project.zoom, { animate: false });
        setLiveCenter(project.center);
        setLiveZoom(project.zoom);
        setTimeout(collectVisibleStreets, 450);
      }
    }
  }, [project.id, project.center, project.zoom, collectVisibleStreets]);

  // Base cartográfica cadastral nativa do Leaflet (SVG/DOM, sem WebGL)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (cartographyConfig.preset === 'osm_clean_raster') {
      cadastralBaseRef.current?.destroy();
      cadastralBaseRef.current = null;
      if (!rasterLayerRef.current) {
        rasterLayerRef.current = L.tileLayer(
          'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
          {
            subdomains: 'abcd',
            maxZoom: 20,
            maxNativeZoom: 19,
            crossOrigin: true,
            attribution: '© OpenStreetMap • © CARTO',
          }
        ).addTo(map);
      }
      return;
    }

    if (rasterLayerRef.current) {
      map.removeLayer(rasterLayerRef.current);
      rasterLayerRef.current = null;
    }

    if (!cadastralBaseRef.current) {
      cadastralBaseRef.current = new CadastralBaseLayer(
        map,
        cartographyConfig,
        handleStreetNames
      );
    } else {
      cadastralBaseRef.current.setConfig(cartographyConfig);
    }
  }, [cartographyConfig, handleStreetNames]);

  // Sincroniza a ferramenta ativa do menu lateral com o Leaflet-Geoman
  useEffect(() => {
    const map = mapRef.current as any;
    if (!map || !map.pm) return;

    map.pm.disableDraw();
    map.pm.disableGlobalEditMode();
    map.pm.disableGlobalDragMode();

    const styles = project.defaultStyles;

    if (activeTool === 'bairro') {
      map.pm.enableDraw('Polygon', {
        snappable: true,
        snapDistance: 12,
        pathOptions: {
          color: styles.bairro.strokeColor,
          weight: styles.bairro.strokeWidth,
          dashArray: styles.bairro.dashArray || undefined,
          fillColor: styles.bairro.fillColor,
          fillOpacity: styles.bairro.fillOpacity,
        },
      });
    } else if (activeTool === 'quarteirao_poly') {
      map.pm.enableDraw('Polygon', {
        snappable: true,
        snapDistance: 12,
        pathOptions: {
          color: styles.quarteirao.strokeColor,
          weight: styles.quarteirao.strokeWidth,
          fillColor: styles.quarteirao.fillColor,
          fillOpacity: styles.quarteirao.fillOpacity,
        },
      });
    } else if (activeTool === 'polygon') {
      map.pm.enableDraw('Polygon', {
        snappable: true,
        snapDistance: 12,
        pathOptions: {
          color: styles.shape.strokeColor,
          weight: styles.shape.strokeWidth,
          fillColor: styles.shape.fillColor,
          fillOpacity: styles.shape.fillOpacity,
        },
      });
    } else if (activeTool === 'polyline') {
      map.pm.enableDraw('Line', {
        snappable: true,
        snapDistance: 12,
        pathOptions: {
          color: styles.shape.strokeColor,
          weight: styles.shape.strokeWidth,
        },
      });
    } else if (activeTool === 'circle') {
      map.pm.enableDraw('Circle', {
        pathOptions: {
          color: styles.shape.strokeColor,
          weight: styles.shape.strokeWidth,
          fillColor: styles.shape.fillColor,
          fillOpacity: styles.shape.fillOpacity,
        },
      });
    }
  }, [activeTool, project.defaultStyles]);

  // Renderiza e sincroniza todos os elementos desenhados (Bairros, Quarteirões, Formas e Textos)
  useEffect(() => {
    const fg = featureGroupRef.current;
    const map = mapRef.current;
    if (!fg || !map) return;

    // Desativa explicitamente alças de vértices e arraste do Geoman antes de atualizar as camadas
    shapeLayersMapRef.current.forEach((existingLayer: any) => {
      try {
        if (existingLayer?.pm) {
          existingLayer.pm.disable();
          existingLayer.pm.disableLayerDrag();
        }
      } catch {
        // noop
      }
    });

    fg.clearLayers();
    shapeLayersMapRef.current.clear();
    labelMarkersMapRef.current.clear();

    // Ordem de desenho: Bairros abaixo -> Formas -> Quarteirões -> Linhas -> Rótulos acima
    const sorted = [
      ...project.features.filter((f) => f.kind === 'bairro'),
      ...project.features.filter((f) => f.kind === 'polygon' || f.kind === 'circle'),
      ...project.features.filter((f) => f.kind === 'quarteirao' && f.geometryType === 'Polygon'),
      ...project.features.filter((f) => f.kind === 'polyline'),
      ...project.features.filter((f) => f.geometryType === 'Point'),
    ];

    for (const feat of sorted) {
      if (feat.visible === false) continue;
      const isSelected = feat.id === selectedFeatureId;
      const st = feat.style;

      const pathOpts: L.PathOptions = {
        color: st.strokeColor,
        weight: isSelected ? st.strokeWidth + 1.5 : st.strokeWidth,
        opacity: st.strokeOpacity ?? 1,
        dashArray: st.dashArray || undefined,
        fillColor: st.fillColor,
        fillOpacity: st.fillOpacity ?? 0.08,
        lineJoin: 'round',
        lineCap: 'round',
      };

      let shapeLayer: L.Layer | null = null;

      if (feat.geometryType === 'Polygon') {
        const poly = L.polygon(feat.coordinates as LatLngTuple[], pathOpts);
        shapeLayer = poly;
      } else if (feat.geometryType === 'LineString') {
        const line = L.polyline(feat.coordinates as LatLngTuple[], pathOpts);
        shapeLayer = line;
      } else if (feat.geometryType === 'Circle') {
        const circle = L.circle(feat.coordinates as LatLngTuple, {
          ...pathOpts,
          radius: feat.radius || 50,
        });
        shapeLayer = circle;
      }

      if (shapeLayer) {
        shapeLayer.on('click', (ev: L.LeafletMouseEvent) => {
          const curTool = latestPropsRef.current.activeTool;
          if (
            curTool === 'bairro' ||
            curTool === 'quarteirao_poly' ||
            curTool === 'polygon' ||
            curTool === 'polyline' ||
            curTool === 'circle' ||
            curTool === 'quarteirao_num' ||
            curTool === 'text'
          ) {
            return;
          }
          L.DomEvent.stopPropagation(ev);
          if (curTool === 'delete') {
            latestPropsRef.current.onDeleteFeature(feat.id);
          } else {
            latestPropsRef.current.onSelectFeature(feat.id);
          }
        });

        fg.addLayer(shapeLayer);
        shapeLayersMapRef.current.set(feat.id, shapeLayer);

        // Modo Editar Vértices (Geoman)
        const pmLayer = (shapeLayer as any).pm;
        if (pmLayer && (activeTool === 'edit' || (activeTool === 'select' && isSelected))) {
          if (activeTool === 'edit') {
            pmLayer.enable({
              allowSelfIntersection: false,
              snappable: true,
              snapDistance: 10,
            });
          }

          shapeLayer.on('pm:edit', () => {
            if (feat.geometryType === 'Polygon') {
              const raw = (shapeLayer as L.Polygon).getLatLngs();
              const ring: L.LatLng[] = Array.isArray(raw[0])
                ? (raw[0] as L.LatLng[])
                : (raw as L.LatLng[]);
              const newCoords: LatLngTuple[] = ring.map((ll) => [
                Number(ll.lat.toFixed(6)),
                Number(ll.lng.toFixed(6)),
              ]);
              const newCentroid = computePolygonCentroid(newCoords);
              latestPropsRef.current.onUpdateFeature(feat.id, (prev) => ({
                ...prev,
                coordinates: newCoords,
                labelPosition: newCentroid,
              }));
            } else if (feat.geometryType === 'LineString') {
              const lls = (shapeLayer as L.Polyline).getLatLngs() as L.LatLng[];
              const newCoords: LatLngTuple[] = lls.map((ll) => [
                Number(ll.lat.toFixed(6)),
                Number(ll.lng.toFixed(6)),
              ]);
              latestPropsRef.current.onUpdateFeature(feat.id, (prev) => ({
                ...prev,
                coordinates: newCoords,
              }));
            } else if (feat.geometryType === 'Circle') {
              const c = (shapeLayer as L.Circle).getLatLng();
              const r = Math.round((shapeLayer as L.Circle).getRadius());
              latestPropsRef.current.onUpdateFeature(feat.id, (prev) => ({
                ...prev,
                coordinates: [Number(c.lat.toFixed(6)), Number(c.lng.toFixed(6))],
                radius: r,
              }));
            }
          });
        }

        // Modo Mover Elementos (Geoman Drag)
        if (pmLayer && activeTool === 'move') {
          pmLayer.enableLayerDrag();
          shapeLayer.on('pm:dragend', () => {
            if (feat.geometryType === 'Polygon') {
              const raw = (shapeLayer as L.Polygon).getLatLngs();
              const ring: L.LatLng[] = Array.isArray(raw[0])
                ? (raw[0] as L.LatLng[])
                : (raw as L.LatLng[]);
              const newCoords: LatLngTuple[] = ring.map((ll) => [
                Number(ll.lat.toFixed(6)),
                Number(ll.lng.toFixed(6)),
              ]);
              const newCentroid = computePolygonCentroid(newCoords);
              latestPropsRef.current.onUpdateFeature(feat.id, (prev) => ({
                ...prev,
                coordinates: newCoords,
                labelPosition: newCentroid,
              }));
            } else if (feat.geometryType === 'LineString') {
              const lls = (shapeLayer as L.Polyline).getLatLngs() as L.LatLng[];
              const newCoords: LatLngTuple[] = lls.map((ll) => [
                Number(ll.lat.toFixed(6)),
                Number(ll.lng.toFixed(6)),
              ]);
              latestPropsRef.current.onUpdateFeature(feat.id, (prev) => ({
                ...prev,
                coordinates: newCoords,
              }));
            } else if (feat.geometryType === 'Circle') {
              const c = (shapeLayer as L.Circle).getLatLng();
              latestPropsRef.current.onUpdateFeature(feat.id, (prev) => ({
                ...prev,
                coordinates: [Number(c.lat.toFixed(6)), Number(c.lng.toFixed(6))],
              }));
            }
          });
        }
      }

      // Renderiza marcador de texto (Números de Quarteirão no centro da quadra, Textos livres e Etiqueta de Bairro)
      const hasVisibleText =
        Boolean(feat.name && feat.name.trim()) &&
        !(feat.kind === 'bairro' && feat.style.labelBg === 'none');

      if (hasVisibleText) {
        let labelLatLng: LatLngTuple | null = null;
        if (feat.geometryType === 'Point' || feat.geometryType === 'Circle') {
          labelLatLng = feat.coordinates as LatLngTuple;
        } else if (feat.geometryType === 'Polygon') {
          labelLatLng =
            feat.labelPosition ||
            computePolygonCentroid(feat.coordinates as LatLngTuple[]);
        }

        if (labelLatLng) {
          // Textos e números são sempre livres para arrastar (exceto durante desenho de geometrias)
          const canDragLabel = !(
            activeTool === 'bairro' ||
            activeTool === 'quarteirao_poly' ||
            activeTool === 'polygon' ||
            activeTool === 'polyline' ||
            activeTool === 'circle'
          );

          const marker = L.marker(labelLatLng, {
            icon: createLabelDivIcon(feat, isSelected),
            draggable: canDragLabel,
            zIndexOffset: feat.kind === 'bairro' ? 300 : 600,
          });

          // Evita que o Geoman tente colocar alças de polígono sobre o divIcon
          (marker as any).pmIgnore = true;

          marker.on('click', (ev: L.LeafletMouseEvent) => {
            const curTool = latestPropsRef.current.activeTool;
            if (
              curTool === 'bairro' ||
              curTool === 'quarteirao_poly' ||
              curTool === 'polygon' ||
              curTool === 'polyline' ||
              curTool === 'circle'
            ) {
              return;
            }
            L.DomEvent.stopPropagation(ev);
            if (curTool === 'delete') {
              latestPropsRef.current.onDeleteFeature(feat.id);
            } else {
              latestPropsRef.current.onSelectFeature(feat.id);
            }
          });

          marker.on('dblclick', (ev: L.LeafletMouseEvent) => {
            L.DomEvent.stopPropagation(ev);
            latestPropsRef.current.onRequestLabelInput({
              title:
                feat.kind === 'quarteirao'
                  ? 'Editar Identificação do Quarteirão'
                  : feat.kind === 'bairro'
                  ? 'Editar Nome do Bairro'
                  : 'Editar Texto no Mapa',
              defaultValue: feat.name,
              placeholder: 'Digite a identificação...',
              onConfirm: (newText) => {
                latestPropsRef.current.onUpdateFeature(feat.id, (prev) => ({
                  ...prev,
                  name: newText.trim(),
                }));
              },
            });
          });

          marker.on('dragend', () => {
            const pos = marker.getLatLng();
            const newPt: LatLngTuple = [
              Number(pos.lat.toFixed(6)),
              Number(pos.lng.toFixed(6)),
            ];
            latestPropsRef.current.onUpdateFeature(feat.id, (prev) => {
              if (prev.geometryType === 'Point' || prev.geometryType === 'Circle') {
                return { ...prev, coordinates: newPt };
              }
              return { ...prev, labelPosition: newPt };
            });
          });

          fg.addLayer(marker);
          labelMarkersMapRef.current.set(feat.id, marker);
        }
      }
    }
  }, [project.features, selectedFeatureId, activeTool]);

  const scaleSpec = computeGraphicScaleBar(liveCenter[0], liveZoom, 140);
  const approxScale = getApproximateScale(liveCenter[0], liveZoom);

  const cursorModeClass =
    activeTool === 'bairro' ||
    activeTool === 'quarteirao_poly' ||
    activeTool === 'quarteirao_num' ||
    activeTool === 'polygon' ||
    activeTool === 'polyline' ||
    activeTool === 'circle'
      ? 'gis-cursor-draw'
      : activeTool === 'text'
      ? 'gis-cursor-text'
      : activeTool === 'delete'
      ? 'gis-cursor-delete'
      : '';

  const frameCrop = project.printConfig.showFrameOverlay
    ? getMapFrameViewportCrop(containerDims.w, containerDims.h, project.printConfig)
    : null;

  // Esc fecha a guia de impressão enquanto ela estiver visível
  const frameOverlayActive = project.printConfig.showFrameOverlay;
  useEffect(() => {
    if (!frameOverlayActive) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      onCloseFrameOverlay();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [frameOverlayActive, onCloseFrameOverlay]);

  return (
    <div
      ref={wrapperRef}
      className={`relative flex-1 h-full w-full bg-white overflow-hidden select-none ${cursorModeClass}`}
    >
      {/* Container principal do Mapa Leaflet */}
      <div ref={mapContainerRef} className="h-full w-full" />

      {/* Guia visual de Enquadramento de Impressão A4 / A3 sobre o mapa */}
      {frameCrop && (
        <div className="pointer-events-none absolute inset-0 z-[500]">
          <div
            style={{
              position: 'absolute',
              left: `${frameCrop.cropX}px`,
              top: `${frameCrop.cropY}px`,
              width: `${frameCrop.cropW}px`,
              height: `${frameCrop.cropH}px`,
              boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.24)',
            }}
            className="border-2 border-dashed border-blue-700 rounded-xs"
          >
            <div className="absolute -top-6 left-0 bg-blue-700 text-white text-[11px] font-semibold px-2 py-0.5 rounded-t shadow">
              Área de Impressão {project.printConfig.paperSize} (
              {project.printConfig.orientation === 'landscape' ? 'Paisagem' : 'Retrato'}) •
              1:{approxScale.toLocaleString('pt-BR')}
            </div>
          </div>
        </div>
      )}

      {/* Controles da guia de impressão: sempre há como sair dela */}
      {frameCrop && (
        <div className="absolute top-3 left-3 z-[650] flex items-center gap-1.5 no-print">
          <button
            type="button"
            onClick={onOpenPrintModal}
            title="Voltar ao compositor de impressão"
            className="flex items-center gap-1.5 bg-blue-700 hover:bg-blue-600 text-white text-xs font-semibold px-3 py-1.5 rounded-md shadow-lg border border-blue-900 transition-colors"
          >
            <Printer className="w-3.5 h-3.5" />
            Concluir e imprimir
          </button>
          <button
            type="button"
            onClick={onCloseFrameOverlay}
            title="Fechar a guia de impressão (Esc)"
            className="flex items-center gap-1.5 bg-white hover:bg-slate-100 text-slate-800 text-xs font-semibold px-3 py-1.5 rounded-md shadow-lg border border-slate-300 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
            Fechar guia
          </button>
        </div>
      )}

      {/* Banner sutil da ferramenta ativa no topo do mapa */}
      {activeTool !== 'select' && activeTool !== 'pan' && (
        <div className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 z-[600]">
          <div className="bg-slate-900/92 text-white text-xs font-medium px-3.5 py-1.5 rounded-full shadow-lg border border-slate-700 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            {activeTool === 'bairro' &&
              'Delimitando Bairro: clique nos vértices do contorno externo e feche no primeiro ponto'}
            {activeTool === 'quarteirao_poly' &&
              `Desenhando Quarteirão (${project.blockPrefix}${project.nextBlockNumber}): contorne a quadra para numerar o centro`}
            {activeTool === 'quarteirao_num' &&
              `Numerando Quarteirões (${project.blockPrefix}${project.nextBlockNumber}): clique no centro de cada quadra`}
            {activeTool === 'text' &&
              'Inserir Texto: clique em qualquer ponto do mapa para digitar uma identificação'}
            {activeTool === 'polygon' &&
              'Desenhar Polígono: clique nos cantos e feche no ponto inicial'}
            {activeTool === 'polyline' &&
              'Desenhar Linha: clique nos pontos e dê duplo-clique para concluir'}
            {activeTool === 'circle' &&
              'Desenhar Círculo: clique no centro e arraste para definir o raio'}
            {activeTool === 'edit' &&
              'Editar Vértices: arraste os pontos brancos/azuis para ajustar qualquer desenho'}
            {activeTool === 'move' &&
              'Mover Elementos: clique e arraste polígonos, quarteirões ou textos'}
            {activeTool === 'delete' &&
              'Excluir Elementos: clique sobre qualquer polígono, número ou texto para removê-lo'}
          </div>
        </div>
      )}

      {/* Rosa dos Ventos / Orientação Norte + Controles de Zoom Flutuantes */}
      <div className="absolute top-3 right-3 z-[600] flex flex-col items-center gap-2 no-print">
        {/* Seta Norte Técnica */}
        <div
          title="Orientação Geográfica Norte"
          className="w-11 h-11 rounded-lg bg-white/95 backdrop-blur border border-slate-300 shadow-sm flex flex-col items-center justify-center"
        >
          <span className="text-[10px] font-extrabold text-slate-900 leading-none mb-0.5">
            N
          </span>
          <svg width="18" height="22" viewBox="0 0 18 22" fill="none">
            <path d="M9 1L2 20L9 15.5V1Z" fill="#0f172a" stroke="#0f172a" strokeWidth="1" />
            <path d="M9 1L16 20L9 15.5V1Z" fill="#ffffff" stroke="#0f172a" strokeWidth="1" />
          </svg>
        </div>

        {/* Botões de Zoom e Enquadramento */}
        <div className="flex flex-col bg-white/95 backdrop-blur border border-slate-300 rounded-lg shadow-sm overflow-hidden">
          <button
            type="button"
            onClick={() => mapRef.current?.zoomIn(0.5)}
            title="Aproximar Zoom (+)"
            className="p-2 text-slate-700 hover:bg-slate-100 hover:text-slate-950 border-b border-slate-200 transition-colors"
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => mapRef.current?.zoomOut(0.5)}
            title="Afastar Zoom (-)"
            className="p-2 text-slate-700 hover:bg-slate-100 hover:text-slate-950 border-b border-slate-200 transition-colors"
          >
            <Minus className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={fitToNeighborhood}
            title="Enquadrar Perímetro do Bairro"
            className="p-2 text-slate-700 hover:bg-slate-100 hover:text-blue-700 border-b border-slate-200 transition-colors"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => mapRef.current?.flyTo(PONTA_PORA_CENTER, 15.5, { duration: 0.7 })}
            title="Centralizar em Ponta Porã – MS"
            className="p-2 text-slate-700 hover:bg-slate-100 hover:text-blue-700 transition-colors"
          >
            <Compass className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Barra de Status Cartográfico Inferior (Escala Gráfica Real + Escala Numérica + Coordenadas) */}
      <div className="absolute bottom-2.5 left-3 z-[600] flex flex-wrap items-center gap-2.5 no-print pointer-events-none">
        {/* Escala Gráfica */}
        <div className="bg-white/95 backdrop-blur border border-slate-300 rounded-md px-2.5 py-1.5 shadow-sm flex items-center gap-3">
          <div>
            <div className="flex justify-between text-[10px] font-bold text-slate-900 leading-none mb-1">
              <span>0</span>
              <span>{scaleSpec.halfLabel}</span>
              <span>{scaleSpec.label}</span>
            </div>
            <div
              style={{ width: `${scaleSpec.pixelWidth}px` }}
              className="h-2 border border-slate-900 grid grid-cols-4 overflow-hidden"
            >
              <div className="bg-slate-900" />
              <div className="bg-white" />
              <div className="bg-slate-900" />
              <div className="bg-white" />
            </div>
          </div>
          <div className="border-l border-slate-200 pl-2.5 text-[11px] font-semibold text-slate-700">
            <div>Escala ~ 1:{approxScale.toLocaleString('pt-BR')}</div>
            <div className="text-[10px] text-slate-500 font-mono">
              Zoom {liveZoom.toFixed(2)}
            </div>
          </div>
        </div>

        {/* Coordenadas Geográficas de Ponta Porã */}
        <div className="hidden sm:flex items-center gap-1.5 bg-white/95 backdrop-blur border border-slate-300 rounded-md px-2.5 py-1.5 shadow-sm text-[11px] font-mono text-slate-700">
          <Crosshair className="w-3.5 h-3.5 text-slate-500" />
          <span>
            {cursorCoords[0].toFixed(5)}°, {cursorCoords[1].toFixed(5)}°
          </span>
          <span className="text-slate-400">|</span>
          <span className="font-sans font-medium text-slate-600">Ponta Porã – MS</span>
        </div>

        <div className="bg-white/95 backdrop-blur border border-slate-300 rounded-md px-2.5 py-1.5 shadow-sm text-[10.5px] font-semibold text-slate-600">
          {streetCount > 0
            ? `${streetCount} ruas nomeadas`
            : 'Base cartográfica OSM'}
        </div>
      </div>
    </div>
  );
};
