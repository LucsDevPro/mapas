import React, { useState, useEffect, useRef } from 'react';
import {
  Map as MapIcon,
  FolderKanban,
  Save,
  CheckCircle2,
  Printer,
  Download,
  Search,
  MapPin,
  ChevronDown,
  X,
} from 'lucide-react';
import { LatLngTuple, NeighborhoodMapProject } from '../types/gis';
import {
  PONTA_PORA_BAIRROS,
  PlaceSearchResult,
  searchPontaPoraPlaces,
} from '../data/pontaPoraBairros';

interface TopHeaderBarProps {
  project: NeighborhoodMapProject;
  totalProjects: number;
  lastSavedAt: string;
  onRenameNeighborhood: (newName: string) => void;
  onManualSave: () => void;
  onOpenMyMaps: () => void;
  onExportGeoJSON: () => void;
  onOpenPrintModal: () => void;
  onNavigateToPlace: (center: LatLngTuple, zoom: number, suggestedName?: string) => void;
}

export const TopHeaderBar: React.FC<TopHeaderBarProps> = ({
  project,
  totalProjects,
  lastSavedAt,
  onRenameNeighborhood,
  onManualSave,
  onOpenMyMaps,
  onExportGeoJSON,
  onOpenPrintModal,
  onNavigateToPlace,
}) => {
  const [editingName, setEditingName] = useState(false);
  const [tempName, setTempName] = useState(project.neighborhoodName);
  const [saveFlash, setSaveFlash] = useState(false);

  // Busca de ruas e bairros de Ponta Porã
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PlaceSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showBairrosList, setShowBairrosList] = useState(false);

  const searchContainerRef = useRef<HTMLDivElement | null>(null);
  const bairrosMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setTempName(project.neighborhoodName);
  }, [project.neighborhoodName]);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
      if (
        bairrosMenuRef.current &&
        !bairrosMenuRef.current.contains(e.target as Node)
      ) {
        setShowBairrosList(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    const timer = setTimeout(async () => {
      const results = await searchPontaPoraPlaces(q);
      setSearchResults(results);
      setIsSearching(false);
      setShowDropdown(true);
    }, 320);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const commitName = () => {
    setEditingName(false);
    const cleaned = tempName.trim();
    if (cleaned && cleaned !== project.neighborhoodName) {
      onRenameNeighborhood(cleaned);
    } else {
      setTempName(project.neighborhoodName);
    }
  };

  const handleSaveClick = () => {
    onManualSave();
    setSaveFlash(true);
    setTimeout(() => setSaveFlash(false), 1600);
  };

  const quarteiraoCount = project.features.filter((f) => f.kind === 'quarteirao').length;

  return (
    <header className="h-13 bg-slate-900 text-white border-b border-slate-800 px-3 flex items-center justify-between gap-2 z-[700] shrink-0 no-print">
      {/* Identidade do Sistema + Nome do Bairro/Projeto Ativo */}
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="flex items-center gap-2 bg-slate-800/90 border border-slate-700/80 rounded-lg px-2.5 py-1.5 shrink-0">
          <div className="w-6 h-6 rounded bg-blue-600 flex items-center justify-center shadow-inner">
            <MapIcon className="w-3.5 h-3.5 text-white" />
          </div>
          <div className="leading-tight hidden md:block">
            <div className="text-[11px] font-extrabold tracking-wider text-white">
              SIG URBANO
            </div>
            <div className="text-[9.5px] font-medium text-blue-300 tracking-tight">
              PONTA PORÃ – MS
            </div>
          </div>
        </div>

        {/* Nome do Bairro Editável */}
        <div className="flex items-center gap-2 min-w-0">
          <div className="min-w-0">
            <div className="text-[9.5px] uppercase tracking-wider text-slate-400 font-semibold leading-none mb-0.5">
              Bairro / Projeto Ativo
            </div>
            {editingName ? (
              <input
                type="text"
                autoFocus
                value={tempName}
                onChange={(e) => setTempName(e.target.value)}
                onBlur={commitName}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitName();
                  if (e.key === 'Escape') {
                    setTempName(project.neighborhoodName);
                    setEditingName(false);
                  }
                }}
                className="bg-slate-800 text-white text-sm font-bold px-2 py-0.5 rounded border border-blue-500 focus:outline-none w-48"
              />
            ) : (
              <button
                type="button"
                onClick={() => setEditingName(true)}
                title="Clique para renomear o bairro deste mapa"
                className="text-sm font-bold text-white hover:text-blue-300 truncate max-w-[180px] sm:max-w-[240px] flex items-center gap-1.5 text-left"
              >
                <span className="truncate">{project.neighborhoodName}</span>
                <span className="text-[10px] font-semibold bg-slate-800 text-slate-300 border border-slate-700 px-1.5 py-0.2 rounded shrink-0">
                  {quarteiraoCount} {quarteiraoCount === 1 ? 'quadra' : 'quadras'}
                </span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Buscador Rápido de Ruas e Bairros de Ponta Porã – MS */}
      <div className="flex items-center gap-1.5 flex-1 max-w-md mx-1">
        <div ref={searchContainerRef} className="relative flex-1">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onFocus={() => {
              if (searchResults.length > 0) setShowDropdown(true);
            }}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Localizar bairro ou rua em Ponta Porã..."
            className="w-full bg-slate-800/90 hover:bg-slate-800 focus:bg-slate-800 text-xs text-white placeholder-slate-400 pl-8 pr-7 py-1.5 rounded-md border border-slate-700 focus:border-blue-500 focus:outline-none transition-colors"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setSearchResults([]);
                setShowDropdown(false);
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}

          {showDropdown && (searchResults.length > 0 || isSearching) && (
            <div className="absolute left-0 right-0 mt-1.5 bg-white text-slate-900 rounded-lg shadow-xl border border-slate-200 max-h-72 overflow-y-auto gis-scroll z-[900]">
              {isSearching ? (
                <div className="px-3 py-2.5 text-xs text-slate-500">
                  Buscando em Ponta Porã – MS...
                </div>
              ) : (
                searchResults.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      onNavigateToPlace(
                        item.center,
                        item.zoom,
                        item.isNeighborhood ? item.label : undefined
                      );
                      setShowDropdown(false);
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-blue-50 border-b border-slate-100 last:border-0 flex items-start gap-2 transition-colors"
                  >
                    <MapPin className="w-3.5 h-3.5 text-blue-600 mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-900 truncate">
                        {item.label}
                      </div>
                      <div className="text-[10.5px] text-slate-500 truncate">
                        {item.sublabel}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* Seletor Rápido dos 45 Bairros de Ponta Porã */}
        <div ref={bairrosMenuRef} className="relative hidden lg:block">
          <button
            type="button"
            onClick={() => setShowBairrosList((v) => !v)}
            className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium px-2.5 py-1.5 rounded-md border border-slate-700 flex items-center gap-1.5 whitespace-nowrap transition-colors"
          >
            <MapPin className="w-3.5 h-3.5 text-blue-400" />
            <span>Ir ao Bairro</span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>

          {showBairrosList && (
            <div className="absolute right-0 mt-1.5 w-68 bg-white text-slate-900 rounded-lg shadow-xl border border-slate-200 z-[900] overflow-hidden">
              <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                Bairros de Ponta Porã – MS ({PONTA_PORA_BAIRROS.length})
              </div>
              <div className="max-h-80 overflow-y-auto gis-scroll divide-y divide-slate-100">
                {PONTA_PORA_BAIRROS.map((b) => (
                  <button
                    key={b.name}
                    type="button"
                    onClick={() => {
                      onNavigateToPlace(b.center, b.zoom || 16.25, b.name);
                      setShowBairrosList(false);
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-blue-50 flex items-center justify-between gap-2 transition-colors"
                  >
                    <div>
                      <div className="text-xs font-semibold text-slate-800">
                        {b.name}
                      </div>
                      <div className="text-[10px] text-slate-500">{b.zone}</div>
                    </div>
                    <span className="text-[10px] font-medium text-blue-600">
                      Ver →
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Ações Principais: Salvar, Meus Mapas, Exportar GeoJSON, Imprimir / PDF / PNG */}
      <div className="flex items-center gap-1.5 shrink-0">
        {/* Status de Auto-Save + Botão Salvar */}
        <button
          type="button"
          onClick={handleSaveClick}
          title={`Salvo automaticamente às ${lastSavedAt}. Clique para forçar salvamento.`}
          className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium px-2.5 py-1.5 rounded-md border border-slate-700 flex items-center gap-1.5 transition-colors"
        >
          {saveFlash ? (
            <>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden xl:inline text-emerald-300">Salvo!</span>
            </>
          ) : (
            <>
              <Save className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden xl:inline">Salvo</span>
            </>
          )}
        </button>

        {/* Meus Mapas */}
        <button
          type="button"
          onClick={onOpenMyMaps}
          className="bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold px-2.5 py-1.5 rounded-md border border-slate-700 flex items-center gap-1.5 transition-colors"
        >
          <FolderKanban className="w-3.5 h-3.5 text-amber-400" />
          <span className="hidden sm:inline">Meus Mapas</span>
          <span className="bg-slate-700 text-slate-200 text-[10px] px-1.5 py-0.2 rounded-full">
            {totalProjects}
          </span>
        </button>

        {/* Exportar GeoJSON */}
        <button
          type="button"
          onClick={onExportGeoJSON}
          title="Exportar projeto do bairro em formato GeoJSON"
          className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium px-2.5 py-1.5 rounded-md border border-slate-700 flex items-center gap-1.5 transition-colors"
        >
          <Download className="w-3.5 h-3.5 text-sky-400" />
          <span className="hidden md:inline">GeoJSON</span>
        </button>

        {/* Imprimir & Exportar PDF / PNG */}
        <button
          type="button"
          onClick={onOpenPrintModal}
          className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-3 py-1.5 rounded-md shadow-sm flex items-center gap-1.5 transition-colors"
        >
          <Printer className="w-3.5 h-3.5" />
          <span>Imprimir / Exportar</span>
        </button>
      </div>
    </header>
  );
};
