import React, { useState } from 'react';
import {
  Save,
  RotateCcw,
  RotateCw,
  Plus,
  Trash2,
  Indent,
  Outdent,
  Link2,
  Unlink2,
  Calendar,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Users,
  Info,
  CheckCircle,
  Flag,
  FolderPlus,
  Clock,
  Sparkles,
  Grid,
  BarChart3,
  CalendarDays
} from 'lucide-react';
import { ViewMode, ZoomLevel } from '../../types/project';

interface RibbonProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  zoomLevel: ZoomLevel;
  setZoomLevel: (zoom: ZoomLevel) => void;
  showCriticalPath: boolean;
  setShowCriticalPath: (show: boolean) => void;
  showGridLines: boolean;
  setShowGridLines: (show: boolean) => void;
  onOpenBackstage: () => void;
  onSave: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onAddTask: () => void;
  onAddMilestone: () => void;
  onAddSummaryTask: () => void;
  onDeleteSelected: () => void;
  onIndentTask: () => void;
  onOutdentTask: () => void;
  onLinkTasks: () => void;
  onUnlinkTasks: () => void;
  onSetProgress: (progress: number) => void;
  onSetTaskMode: (mode: 'manual' | 'auto') => void;
  onOpenResourceSheet: () => void;
  onOpenProjectInfo: () => void;
  onSetBaseline: () => void;
  selectedTaskId: string | null;
}

export const Ribbon: React.FC<RibbonProps> = ({
  currentTab,
  setCurrentTab,
  viewMode,
  setViewMode,
  zoomLevel,
  setZoomLevel,
  showCriticalPath,
  setShowCriticalPath,
  showGridLines,
  setShowGridLines,
  onOpenBackstage,
  onSave,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onAddTask,
  onAddMilestone,
  onAddSummaryTask,
  onDeleteSelected,
  onIndentTask,
  onOutdentTask,
  onLinkTasks,
  onUnlinkTasks,
  onSetProgress,
  onSetTaskMode,
  onOpenResourceSheet,
  onOpenProjectInfo,
  onSetBaseline,
}) => {
  const [activeTab, setActiveTab] = useState<'tarefa' | 'recurso' | 'projeto' | 'exibir' | 'formato'>('tarefa');

  return (
    <div className="ribbon-container">
      {/* Barra de Título Superior / Quick Access Toolbar */}
      <div className="title-bar">
        <div className="quick-access">
          <div className="app-icon" title="Microsoft Project 2010 (PT-BR)">
            <span className="app-badge">P</span>
          </div>
          <button className="qa-btn" onClick={onSave} title="Salvar (Ctrl+S)">
            <Save size={14} />
          </button>
          <button className="qa-btn" onClick={onUndo} disabled={!canUndo} title="Desfazer (Ctrl+Z)">
            <RotateCcw size={14} />
          </button>
          <button className="qa-btn" onClick={onRedo} disabled={!canRedo} title="Refazer (Ctrl+Y)">
            <RotateCw size={14} />
          </button>
        </div>
        <div className="window-title">
          <span>Projeto1 - Microsoft Project (Português - Brasil)</span>
        </div>
      </div>

      {/* Guias do Ribbon */}
      <div className="ribbon-tabs-bar">
        <button className="ribbon-tab file-tab" onClick={onOpenBackstage}>
          Arquivo
        </button>
        <button
          className={`ribbon-tab ${activeTab === 'tarefa' ? 'active' : ''}`}
          onClick={() => setActiveTab('tarefa')}
        >
          Tarefa
        </button>
        <button
          className={`ribbon-tab ${activeTab === 'recurso' ? 'active' : ''}`}
          onClick={() => setActiveTab('recurso')}
        >
          Recurso
        </button>
        <button
          className={`ribbon-tab ${activeTab === 'projeto' ? 'active' : ''}`}
          onClick={() => setActiveTab('projeto')}
        >
          Projeto
        </button>
        <button
          className={`ribbon-tab ${activeTab === 'exibir' ? 'active' : ''}`}
          onClick={() => setActiveTab('exibir')}
        >
          Exibição
        </button>
        <button
          className={`ribbon-tab ${activeTab === 'formato' ? 'active' : ''}`}
          onClick={() => setActiveTab('formato')}
        >
          Formato
        </button>
      </div>

      {/* Conteúdo da Faixa de Opções (Painel de Comandos) */}
      <div className="ribbon-panel">
        {activeTab === 'tarefa' && (
          <div className="ribbon-tab-content">
            {/* Grupo: Modos de Exibição */}
            <div className="ribbon-group">
              <div className="group-content">
                <button
                  className={`large-tool-btn ${viewMode === 'gantt' ? 'selected' : ''}`}
                  onClick={() => setViewMode('gantt')}
                  title="Gráfico de Gantt"
                >
                  <BarChart3 size={26} className="tool-icon primary-color" />
                  <span>Gráfico de Gantt</span>
                </button>
                <button
                  className={`large-tool-btn ${viewMode === 'week' ? 'selected' : ''}`}
                  onClick={() => setViewMode('week')}
                  title="Visualização da Semana (Minha Semana)"
                >
                  <CalendarDays size={26} className="tool-icon success-color" />
                  <span>Minha Semana</span>
                </button>
              </div>
              <div className="group-label">Exibição</div>
            </div>

            {/* Grupo: Inserir */}
            <div className="ribbon-group">
              <div className="group-content">
                <button className="large-tool-btn" onClick={onAddTask} title="Adicionar Tarefa">
                  <Plus size={26} className="tool-icon success-color" />
                  <span>Nova Tarefa</span>
                </button>
                <div className="small-tools-column">
                  <button className="small-tool-btn" onClick={onAddMilestone} title="Adicionar Marco (Duração 0)">
                    <Flag size={14} className="accent-color" />
                    <span>Inserir Marco</span>
                  </button>
                  <button className="small-tool-btn" onClick={onAddSummaryTask} title="Adicionar Tarefa Resumo">
                    <FolderPlus size={14} className="primary-color" />
                    <span>Tarefa Resumo</span>
                  </button>
                  <button className="small-tool-btn danger" onClick={onDeleteSelected} title="Excluir Tarefa Selecionada">
                    <Trash2 size={14} />
                    <span>Excluir</span>
                  </button>
                </div>
              </div>
              <div className="group-label">Inserir</div>
            </div>

            {/* Grupo: Agendamento & Modo */}
            <div className="ribbon-group">
              <div className="group-content horizontal">
                <div className="small-tools-column">
                  <button className="small-tool-btn" onClick={() => onSetTaskMode('auto')}>
                    <Clock size={14} className="primary-color" />
                    <span>Agendamento Automático</span>
                  </button>
                  <button className="small-tool-btn" onClick={() => onSetTaskMode('manual')}>
                    <Calendar size={14} />
                    <span>Agendado Manualmente</span>
                  </button>
                </div>
              </div>
              <div className="group-label">Agendamento</div>
            </div>

            {/* Grupo: Hierarquia (EAP / WBS) */}
            <div className="ribbon-group">
              <div className="group-content">
                <button className="large-tool-btn" onClick={onIndentTask} title="Recuar Tarefa (Subtarefa)">
                  <Indent size={26} className="tool-icon primary-color" />
                  <span>Recuar Tarefa</span>
                </button>
                <button className="large-tool-btn" onClick={onOutdentTask} title="Diminuir Recuo">
                  <Outdent size={26} className="tool-icon primary-color" />
                  <span>Diminuir Recuo</span>
                </button>
              </div>
              <div className="group-label">Hierarquia EAP</div>
            </div>

            {/* Grupo: Dependências */}
            <div className="ribbon-group">
              <div className="group-content">
                <button className="large-tool-btn" onClick={onLinkTasks} title="Vincular Tarefas Selecionadas">
                  <Link2 size={26} className="tool-icon primary-color" />
                  <span>Vincular</span>
                </button>
                <button className="large-tool-btn" onClick={onUnlinkTasks} title="Desvincular Tarefas">
                  <Unlink2 size={26} className="tool-icon" />
                  <span>Desvincular</span>
                </button>
              </div>
              <div className="group-label">Dependências</div>
            </div>
          </div>
        )}

        {activeTab === 'recurso' && (
          <div className="ribbon-tab-content">
            <div className="ribbon-group">
              <div className="group-content">
                <button className="large-tool-btn" onClick={onOpenResourceSheet}>
                  <Users size={28} className="tool-icon primary-color" />
                  <span>Planilha de Recursos</span>
                </button>
              </div>
              <div className="group-label">Atribuições</div>
            </div>
          </div>
        )}

        {activeTab === 'projeto' && (
          <div className="ribbon-tab-content">
            <div className="ribbon-group">
              <div className="group-content">
                <button className="large-tool-btn" onClick={onOpenProjectInfo}>
                  <Info size={28} className="tool-icon primary-color" />
                  <span>Informações do Projeto</span>
                </button>
                <button className="large-tool-btn" onClick={onSetBaseline} title="Definir Linha de Base">
                  <CheckCircle size={28} className="tool-icon success-color" />
                  <span>Definir Linha de Base</span>
                </button>
              </div>
              <div className="group-label">Propriedades</div>
            </div>
          </div>
        )}

        {activeTab === 'exibir' && (
          <div className="ribbon-tab-content">
            {/* Grupo Modos de Exibição */}
            <div className="ribbon-group">
              <div className="group-content">
                <button
                  className={`large-tool-btn ${viewMode === 'gantt' ? 'selected' : ''}`}
                  onClick={() => setViewMode('gantt')}
                  title="Gráfico de Gantt"
                >
                  <BarChart3 size={24} className="tool-icon primary-color" />
                  <span>Gráfico de Gantt</span>
                </button>
                <button
                  className={`large-tool-btn ${viewMode === 'week' ? 'selected' : ''}`}
                  onClick={() => setViewMode('week')}
                  title="Visualização da Semana (Minha Semana)"
                >
                  <CalendarDays size={24} className="tool-icon success-color" />
                  <span>Minha Semana</span>
                </button>
              </div>
              <div className="group-label">Modos de Exibição</div>
            </div>

            {/* Grupo Zoom */}
            <div className="ribbon-group">
              <div className="group-content">
                <button className="large-tool-btn" onClick={() => setZoomLevel('days')}>
                  <ZoomIn size={24} className="tool-icon" />
                  <span>Escala em Dias</span>
                </button>
                <button className="large-tool-btn" onClick={() => setZoomLevel('weeks')}>
                  <Calendar size={24} className="tool-icon" />
                  <span>Escala em Semanas</span>
                </button>
                <button className="large-tool-btn" onClick={() => setZoomLevel('months')}>
                  <ZoomOut size={24} className="tool-icon" />
                  <span>Escala em Meses</span>
                </button>
              </div>
              <div className="group-label">Zoom & Escala</div>
            </div>

            {/* Grupo Destaques */}
            <div className="ribbon-group">
              <div className="group-content">
                <button
                  className={`large-tool-btn ${showCriticalPath ? 'selected critical-active' : ''}`}
                  onClick={() => setShowCriticalPath(!showCriticalPath)}
                >
                  <Sparkles size={24} className="tool-icon critical-color" />
                  <span>Caminho Crítico</span>
                </button>
                <button
                  className={`large-tool-btn ${showGridLines ? 'selected' : ''}`}
                  onClick={() => setShowGridLines(!showGridLines)}
                >
                  <Grid size={24} className="tool-icon" />
                  <span>Linhas de Grade</span>
                </button>
              </div>
              <div className="group-label">Destaque</div>
            </div>
          </div>
        )}

        {activeTab === 'formato' && (
          <div className="ribbon-tab-content">
            <div className="ribbon-group">
              <div className="group-content horizontal">
                <div className="legend-item">
                  <div className="legend-swatch standard-bar"></div>
                  <span>Tarefa Padrão</span>
                </div>
                <div className="legend-item">
                  <div className="legend-swatch critical-bar"></div>
                  <span>Caminho Crítico</span>
                </div>
                <div className="legend-item">
                  <div className="legend-swatch summary-bar"></div>
                  <span>Tarefa Resumo</span>
                </div>
                <div className="legend-item">
                  <div className="legend-swatch milestone-diamond"></div>
                  <span>Marco</span>
                </div>
              </div>
              <div className="group-label">Estilos de Barra do Gantt</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
