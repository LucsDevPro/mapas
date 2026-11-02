import React, { useState } from 'react';
import {
  MousePointer,
  Hand,
  Pentagon,
  LayoutGrid,
  Hash,
  Type,
  Shapes,
  Spline,
  Circle as CircleIcon,
  PenTool,
  Move,
  Palette,
  Trash2,
  Undo2,
  Redo2,
  PanelLeftClose,
  PanelLeftOpen,
  Sparkles,
} from 'lucide-react';
import { ToolMode } from '../types/gis';

interface LeftToolsSidebarProps {
  activeTool: ToolMode;
  onSelectTool: (tool: ToolMode) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onOpenStyleInspector: () => void;
  onImportOsmBoundary: () => void;
  isImportingBoundary: boolean;
  nextBlockBadge: string;
}

interface ToolButtonDef {
  id: ToolMode;
  label: string;
  shortHint: string;
  icon: React.FC<{ className?: string }>;
  accent?: string;
}

export const LeftToolsSidebar: React.FC<LeftToolsSidebarProps> = ({
  activeTool,
  onSelectTool,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onOpenStyleInspector,
  onImportOsmBoundary,
  isImportingBoundary,
  nextBlockBadge,
}) => {
  const [expanded, setExpanded] = useState(true);

  const navTools: ToolButtonDef[] = [
    {
      id: 'select',
      label: 'Selecionar',
      shortHint: 'Selecionar e inspecionar elementos (Esc)',
      icon: MousePointer,
    },
    {
      id: 'pan',
      label: 'Mover Mapa',
      shortHint: 'Navegar livremente pelo mapa',
      icon: Hand,
    },
  ];

  const urbanTools: ToolButtonDef[] = [
    {
      id: 'bairro',
      label: 'Delimitar Bairro',
      shortHint: 'Desenhar polígono de contorno externo do bairro',
      icon: Pentagon,
      accent: 'text-blue-600',
    },
    {
      id: 'quarteirao_poly',
      label: 'Desenhar Quadra',
      shortHint: 'Desenhar polígono do quarteirão e numerar centro',
      icon: LayoutGrid,
      accent: 'text-red-600',
    },
    {
      id: 'quarteirao_num',
      label: 'Numerar Quadras',
      shortHint: 'Clicar no centro das quadras para numerar',
      icon: Hash,
      accent: 'text-red-600',
    },
    {
      id: 'text',
      label: 'Inserir Texto',
      shortHint: 'Inserir textos e identificações sobre o mapa',
      icon: Type,
      accent: 'text-slate-800',
    },
  ];

  const geomTools: ToolButtonDef[] = [
    {
      id: 'polygon',
      label: 'Polígono',
      shortHint: 'Desenhar polígono livre',
      icon: Shapes,
      accent: 'text-emerald-600',
    },
    {
      id: 'polyline',
      label: 'Linha',
      shortHint: 'Desenhar linhas ou trechos viários',
      icon: Spline,
      accent: 'text-emerald-600',
    },
    {
      id: 'circle',
      label: 'Círculo',
      shortHint: 'Desenhar círculo ou raio de abrangência',
      icon: CircleIcon,
      accent: 'text-emerald-600',
    },
  ];

  const editTools: ToolButtonDef[] = [
    {
      id: 'edit',
      label: 'Editar Desenhos',
      shortHint: 'Ajustar vértices de polígonos, linhas e círculos',
      icon: PenTool,
    },
    {
      id: 'move',
      label: 'Mover Elementos',
      shortHint: 'Arrastar polígonos, quarteirões e textos',
      icon: Move,
    },
    {
      id: 'delete',
      label: 'Excluir Elemento',
      shortHint: 'Clicar em elementos para excluí-los',
      icon: Trash2,
      accent: 'text-rose-600',
    },
  ];

  const renderToolBtn = (tool: ToolButtonDef) => {
    const Icon = tool.icon;
    const isActive = activeTool === tool.id;
    return (
      <button
        key={tool.id}
        type="button"
        title={tool.shortHint}
        onClick={() => onSelectTool(tool.id)}
        className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-xs font-medium transition-all ${
          isActive
            ? 'bg-blue-600 text-white shadow-sm font-semibold'
            : 'text-slate-700 hover:bg-slate-100 hover:text-slate-950'
        } ${expanded ? 'justify-start' : 'justify-center'}`}
      >
        <Icon
          className={`w-4 h-4 shrink-0 ${
            isActive ? 'text-white' : tool.accent || 'text-slate-600'
          }`}
        />
        {expanded && <span className="truncate">{tool.label}</span>}
        {expanded &&
          (tool.id === 'quarteirao_poly' || tool.id === 'quarteirao_num') && (
            <span
              className={`ml-auto text-[10px] font-bold px-1.5 py-0.2 rounded ${
                isActive
                  ? 'bg-blue-500 text-white'
                  : 'bg-red-50 text-red-700 border border-red-200'
              }`}
            >
              #{nextBlockBadge}
            </span>
          )}
      </button>
    );
  };

  return (
    <aside
      className={`${
        expanded ? 'w-52' : 'w-14'
      } bg-white border-r border-slate-200 flex flex-col justify-between shrink-0 z-[650] transition-all duration-150 no-print select-none`}
    >
      <div className="flex-1 overflow-y-auto gis-scroll p-2 space-y-3">
        {/* Topo da barra lateral */}
        <div className="flex items-center justify-between px-1">
          {expanded && (
            <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">
              Ferramentas GIS
            </span>
          )}
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            title={expanded ? 'Recolher barra lateral' : 'Expandir barra lateral'}
            className="p-1.5 rounded hover:bg-slate-100 text-slate-500 hover:text-slate-800 ml-auto"
          >
            {expanded ? (
              <PanelLeftClose className="w-4 h-4" />
            ) : (
              <PanelLeftOpen className="w-4 h-4" />
            )}
          </button>
        </div>

        {/* Grupo 1: Seleção */}
        <div className="space-y-0.5">
          {navTools.map(renderToolBtn)}
        </div>

        <div className="border-t border-slate-100" />

        {/* Grupo 2: Bairro e Quarteirões */}
        <div className="space-y-0.5">
          {expanded && (
            <div className="px-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Bairros & Quadras
            </div>
          )}
          {urbanTools.map(renderToolBtn)}

          {/* Atalho opcional: Importar limite OSM editável do bairro */}
          {expanded && activeTool === 'bairro' && (
            <button
              type="button"
              disabled={isImportingBoundary}
              onClick={onImportOsmBoundary}
              title="Carrega automaticamente o contorno cadastral do bairro a partir do OpenStreetMap (totalmente editável)"
              className="mt-1 w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-[11px] font-semibold transition-colors disabled:opacity-60"
            >
              <Sparkles className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">
                {isImportingBoundary ? 'Buscando OSM...' : 'Buscar Limite OSM'}
              </span>
            </button>
          )}
        </div>

        <div className="border-t border-slate-100" />

        {/* Grupo 3: Desenho Geométrico */}
        <div className="space-y-0.5">
          {expanded && (
            <div className="px-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Formas Livres
            </div>
          )}
          {geomTools.map(renderToolBtn)}
        </div>

        <div className="border-t border-slate-100" />

        {/* Grupo 4: Edição, Cores e Exclusão */}
        <div className="space-y-0.5">
          {expanded && (
            <div className="px-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Edição & Estilo
            </div>
          )}
          {editTools.map(renderToolBtn)}

          <button
            type="button"
            onClick={onOpenStyleInspector}
            title="Alterar cores, espessuras, fontes e transparência"
            className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-xs font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-950 transition-colors ${
              expanded ? 'justify-start' : 'justify-center'
            }`}
          >
            <Palette className="w-4 h-4 shrink-0 text-violet-600" />
            {expanded && <span className="truncate">Cores & Transparência</span>}
          </button>
        </div>
      </div>

      {/* Rodapé da barra lateral: Desfazer e Refazer */}
      <div className="p-2 border-t border-slate-200 bg-slate-50/70">
        <div className={`grid ${expanded ? 'grid-cols-2' : 'grid-cols-1'} gap-1.5`}>
          <button
            type="button"
            disabled={!canUndo}
            onClick={onUndo}
            title="Desfazer última ação (Ctrl+Z)"
            className="flex items-center justify-center gap-1.5 px-2 py-1.5 rounded border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:pointer-events-none text-xs font-medium transition-colors"
          >
            <Undo2 className="w-3.5 h-3.5" />
            {expanded && <span>Desfazer</span>}
          </button>
          <button
            type="button"
            disabled={!canRedo}
            onClick={onRedo}
            title="Refazer ação (Ctrl+Y)"
            className="flex items-center justify-center gap-1.5 px-2 py-1.5 rounded border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:pointer-events-none text-xs font-medium transition-colors"
          >
            <Redo2 className="w-3.5 h-3.5" />
            {expanded && <span>Refazer</span>}
          </button>
        </div>
      </div>
    </aside>
  );
};
