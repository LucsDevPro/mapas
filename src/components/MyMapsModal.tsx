import React, { useState, useRef } from 'react';
import {
  FolderKanban,
  Plus,
  X,
  FolderOpen,
  Copy,
  Pencil,
  Trash2,
  Download,
  Upload,
  Check,
  MapPin,
  Search,
  Sparkles,
} from 'lucide-react';
import { LatLngTuple, NeighborhoodMapProject } from '../types/gis';
import { PONTA_PORA_BAIRROS, PONTA_PORA_CENTER } from '../data/pontaPoraBairros';

interface MyMapsModalProps {
  isOpen: boolean;
  onClose: () => void;
  projects: NeighborhoodMapProject[];
  activeProjectId: string;
  onOpenProject: (id: string) => void;
  onCreateProject: (params: {
    neighborhoodName: string;
    center: LatLngTuple;
    zoom: number;
    sectorCode: string;
    autoFetchOsmBoundary: boolean;
  }) => Promise<void> | void;
  onDuplicateProject: (id: string) => void;
  onRenameProject: (id: string, newName: string) => void;
  onDeleteProject: (id: string) => void;
  onExportProjectGeoJSON: (project: NeighborhoodMapProject) => void;
  onImportGeoJSONFile: (file: File) => void;
}

export const MyMapsModal: React.FC<MyMapsModalProps> = ({
  isOpen,
  onClose,
  projects,
  activeProjectId,
  onOpenProject,
  onCreateProject,
  onDuplicateProject,
  onRenameProject,
  onDeleteProject,
  onExportProjectGeoJSON,
  onImportGeoJSONFile,
}) => {
  const [newBairroName, setNewBairroName] = useState('');
  const [newSectorCode, setNewSectorCode] = useState('');
  const [selectedPresetCenter, setSelectedPresetCenter] =
    useState<LatLngTuple>(PONTA_PORA_CENTER);
  const [selectedPresetZoom, setSelectedPresetZoom] = useState<number>(16.25);
  const [autoFetchOsm, setAutoFetchOsm] = useState<boolean>(false);
  const [isCreating, setIsCreating] = useState<boolean>(false);

  const [filterText, setFilterText] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  const handlePickPresetBairro = (name: string) => {
    setNewBairroName(name);
    const match = PONTA_PORA_BAIRROS.find(
      (b) => b.name.toLowerCase() === name.toLowerCase()
    );
    if (match) {
      setSelectedPresetCenter(match.center);
      setSelectedPresetZoom(match.zoom || 16.25);
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newBairroName.trim();
    if (!clean) return;

    // Verifica se o nome digitado coincide com algum bairro oficial de Ponta Porã
    const matched = PONTA_PORA_BAIRROS.find(
      (b) => b.name.toLowerCase() === clean.toLowerCase()
    );
    const center = matched ? matched.center : selectedPresetCenter;
    const zoom = matched ? matched.zoom || 16.25 : selectedPresetZoom;

    setIsCreating(true);
    try {
      await onCreateProject({
        neighborhoodName: clean,
        center,
        zoom,
        sectorCode: newSectorCode.trim(),
        autoFetchOsmBoundary: autoFetchOsm,
      });
      setNewBairroName('');
      setNewSectorCode('');
      onClose();
    } finally {
      setIsCreating(false);
    }
  };

  const filteredProjects = filterText.trim()
    ? projects.filter((p) =>
        p.neighborhoodName.toLowerCase().includes(filterText.trim().toLowerCase())
      )
    : projects;

  return (
    <div className="fixed inset-0 z-[1000] bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 no-print">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[88vh] flex flex-col overflow-hidden">
        {/* Cabeçalho */}
        <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <FolderKanban className="w-5 h-5 text-amber-400" />
            <div>
              <h2 className="text-sm font-bold">
                Meus Mapas — Gerenciamento de Bairros de Ponta Porã / MS
              </h2>
              <p className="text-[11px] text-slate-300">
                Todos os mapas, limites, quarteirões e textos são salvos automaticamente no navegador
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

        {/* Corpo dividido: Criar Novo Mapa + Lista de Mapas Salvos */}
        <div className="flex-1 overflow-y-auto gis-scroll p-5 grid grid-cols-1 md:grid-cols-12 gap-5">
          {/* Coluna Esquerda: Criar Novo Mapa Independente de Bairro */}
          <div className="md:col-span-5 bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col justify-between space-y-4">
            <form onSubmit={handleCreateSubmit} className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-blue-800">
                <Plus className="w-4 h-4" />
                <span>Criar Novo Mapa de Bairro</span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nome do Bairro *
                </label>
                <input
                  type="text"
                  required
                  value={newBairroName}
                  onChange={(e) => handlePickPresetBairro(e.target.value)}
                  placeholder="Ex.: Vila Áurea, Granja, Centro..."
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-semibold text-slate-900 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Ou escolha um bairro de Ponta Porã para posicionar o mapa:
                </label>
                <select
                  value=""
                  onChange={(e) => {
                    if (e.target.value) handlePickPresetBairro(e.target.value);
                  }}
                  className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 focus:border-blue-500 focus:outline-none"
                >
                  <option value="">Selecionar na lista de bairros de Ponta Porã...</option>
                  {PONTA_PORA_BAIRROS.map((b) => (
                    <option key={b.name} value={b.name}>
                      {b.name} ({b.zone})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Código Setorial / Observação (Opcional)
                </label>
                <input
                  type="text"
                  value={newSectorCode}
                  onChange={(e) => setNewSectorCode(e.target.value)}
                  placeholder="Ex.: Setor Censitário / Equipe 02"
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <label className="flex items-start gap-2 bg-blue-50/80 border border-blue-200 rounded-lg p-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoFetchOsm}
                  onChange={(e) => setAutoFetchOsm(e.target.checked)}
                  className="mt-0.5 rounded accent-blue-600"
                />
                <div className="text-[11px] leading-snug text-blue-950">
                  <span className="font-semibold flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-blue-600" />
                    Carregar limite sugerido do OSM
                  </span>
                  <span className="text-blue-700/80">
                    Se o bairro possuir perímetro no OpenStreetMap, insere o polígono editável automaticamente.
                  </span>
                </div>
              </label>

              <button
                type="submit"
                disabled={!newBairroName.trim() || isCreating}
                className="w-full py-2.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold shadow-sm flex items-center justify-center gap-2 transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>{isCreating ? 'Criando Mapa...' : 'Criar e Abrir Mapa do Bairro'}</span>
              </button>
            </form>

            {/* Importar Projeto GeoJSON */}
            <div className="pt-3 border-t border-slate-200">
              <input
                ref={fileInputRef}
                type="file"
                accept=".geojson,.json,application/geo+json,application/json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    onImportGeoJSONFile(file);
                    e.target.value = '';
                  }
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-2 px-3 rounded-lg bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
              >
                <Upload className="w-3.5 h-3.5 text-blue-600" />
                <span>Importar Projeto GeoJSON (.geojson)</span>
              </button>
            </div>
          </div>

          {/* Coluna Direita: Lista de Mapas Existentes */}
          <div className="md:col-span-7 flex flex-col space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Mapas Salvos ({projects.length})
              </div>
              <div className="relative w-52">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={filterText}
                  onChange={(e) => setFilterText(e.target.value)}
                  placeholder="Filtrar meus mapas..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-md pl-8 pr-2.5 py-1 text-xs focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto gis-scroll space-y-2.5 max-h-[54vh] pr-1">
              {filteredProjects.map((proj) => {
                const isActive = proj.id === activeProjectId;
                const blocksCount = proj.features.filter(
                  (f) => f.kind === 'quarteirao'
                ).length;
                const bairroPolys = proj.features.filter(
                  (f) => f.kind === 'bairro'
                ).length;
                const updatedDate = new Date(proj.updatedAt).toLocaleString('pt-BR', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                });

                return (
                  <div
                    key={proj.id}
                    className={`rounded-xl border p-3.5 transition-all ${
                      isActive
                        ? 'border-blue-500 bg-blue-50/40 shadow-xs'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        {renamingId === proj.id ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              autoFocus
                              value={renameValue}
                              onChange={(e) => setRenameValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && renameValue.trim()) {
                                  onRenameProject(proj.id, renameValue.trim());
                                  setRenamingId(null);
                                }
                                if (e.key === 'Escape') setRenamingId(null);
                              }}
                              className="bg-white border border-blue-500 rounded px-2 py-1 text-xs font-bold text-slate-900 flex-1 focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                if (renameValue.trim()) {
                                  onRenameProject(proj.id, renameValue.trim());
                                }
                                setRenamingId(null);
                              }}
                              className="p-1.5 rounded bg-blue-600 text-white"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                              <MapPin className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                              {proj.neighborhoodName}
                            </span>
                            {isActive && (
                              <span className="text-[10px] font-extrabold uppercase bg-blue-600 text-white px-2 py-0.5 rounded-full">
                                Mapa Aberto
                              </span>
                            )}
                            {proj.sectorCode && (
                              <span className="text-[10px] font-semibold bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200">
                                {proj.sectorCode}
                              </span>
                            )}
                          </div>
                        )}

                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
                          <span>
                            <strong className="text-slate-700">{blocksCount}</strong>{' '}
                            {blocksCount === 1 ? 'quarteirão' : 'quarteirões'}
                          </span>
                          <span>•</span>
                          <span>
                            <strong className="text-slate-700">{bairroPolys}</strong>{' '}
                            {bairroPolys === 1 ? 'perímetro' : 'perímetros'}
                          </span>
                          <span>•</span>
                          <span>
                            <strong className="text-slate-700">
                              {proj.features.length}
                            </strong>{' '}
                            elementos totais
                          </span>
                        </div>
                        <div className="mt-0.5 text-[10.5px] text-slate-400">
                          Atualizado em {updatedDate}
                        </div>
                      </div>
                    </div>

                    {/* Botões de ação do card */}
                    <div className="mt-3 pt-2.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          onOpenProject(proj.id);
                          onClose();
                        }}
                        className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                          isActive
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-900 hover:bg-slate-800 text-white'
                        }`}
                      >
                        <FolderOpen className="w-3.5 h-3.5" />
                        <span>{isActive ? 'Continuar Editando' : 'Abrir Mapa'}</span>
                      </button>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          title="Renomear bairro/mapa"
                          onClick={() => {
                            setRenamingId(proj.id);
                            setRenameValue(proj.neighborhoodName);
                          }}
                          className="px-2 py-1.5 rounded border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-[11px] font-medium flex items-center gap-1"
                        >
                          <Pencil className="w-3 h-3" />
                          <span>Renomear</span>
                        </button>
                        <button
                          type="button"
                          title="Duplicar mapa com todos os desenhos"
                          onClick={() => onDuplicateProject(proj.id)}
                          className="px-2 py-1.5 rounded border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-[11px] font-medium flex items-center gap-1"
                        >
                          <Copy className="w-3 h-3" />
                          <span>Duplicar</span>
                        </button>
                        <button
                          type="button"
                          title="Exportar projeto em GeoJSON"
                          onClick={() => onExportProjectGeoJSON(proj)}
                          className="px-2 py-1.5 rounded border border-slate-200 bg-white hover:bg-slate-50 text-blue-700 text-[11px] font-medium flex items-center gap-1"
                        >
                          <Download className="w-3 h-3" />
                          <span>GeoJSON</span>
                        </button>
                        {projects.length > 1 && (
                          <button
                            type="button"
                            title="Excluir mapa"
                            onClick={() => onDeleteProject(proj.id)}
                            className="p-1.5 rounded border border-slate-200 bg-white hover:bg-rose-50 text-rose-600"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
