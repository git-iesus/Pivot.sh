import React, { useState } from 'react';
import {
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
  CalendarDays,
  Cloud,
  Check,
  Loader2,
  DollarSign,
  CalendarOff,
  Compass,
  Flame,
  Target,
  Layers
} from 'lucide-react';
import { ViewMode, ZoomLevel, NexoPhase, NexoRoleView } from '../../types/project';

interface RibbonProps {
  saveStatus?: 'saved' | 'saving';
  lastSavedTime?: string;
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
  onOpenExceptionsModal: () => void;
  exceptionsCount?: number;
  onOpenResourceSheet: () => void;
  onOpenCostReport: () => void;
  selectedTaskId: string | null;
  nexoActivePhase?: NexoPhase;
  nexoRoleView?: NexoRoleView;
  onSelectNexoPhase?: (phase: NexoPhase) => void;
  onToggleNexoRoleView?: (role: NexoRoleView) => void;
  onStartNewNexoProject?: () => void;
  onSyncNexoToGantt?: () => void;
}

export const Ribbon: React.FC<RibbonProps> = ({
  saveStatus = 'saved',
  lastSavedTime = 'agora',
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
  onOpenExceptionsModal,
  exceptionsCount = 0,
  onOpenResourceSheet,
  onOpenCostReport,
  nexoActivePhase = 1,
  nexoRoleView = 'architect',
  onSelectNexoPhase,
  onToggleNexoRoleView,
  onStartNewNexoProject,
  onSyncNexoToGantt,
}) => {
  const [activeTab, setActiveTab] = useState<'tarefa' | 'recursos' | 'exibir' | 'formato' | 'nexo'>('tarefa');

  return (
    <div className="ribbon-container">
      {/* Barra de Título Superior / Quick Access Toolbar */}
      <div className="title-bar">
        <div className="quick-access">
          <div className="app-icon">
            <span className="app-badge">P</span>
          </div>
          <button className="qa-btn" onClick={onUndo} disabled={!canUndo} title="Desfazer (Ctrl+Z)">
            <RotateCcw size={14} />
          </button>
          <button className="qa-btn" onClick={onRedo} disabled={!canRedo} title="Refazer (Ctrl+Y)">
            <RotateCw size={14} />
          </button>
        </div>

        <div className="title-center-group">
          <span className="window-title">Pivot.sh</span>
          <div
            className={`autosave-pill ${saveStatus}`}
            title={saveStatus === 'saving' ? 'Salvando alterações em tempo real...' : `Todas as alterações são salvas automaticamente sem precisar clicar em salvar (estilo Google Sheets). Último salvamento: ${lastSavedTime}`}
          >
            {saveStatus === 'saving' ? (
              <>
                <Loader2 size={12} className="spin-icon" />
                <span>Salvando...</span>
              </>
            ) : (
              <>
                <Cloud size={13} className="cloud-icon" />
                <Check size={10} className="check-badge-icon" />
                <span>Salvo automaticamente</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Guias do Ribbon */}
      <div className="ribbon-tabs-bar">
        <button className="ribbon-tab file-tab" onClick={onOpenBackstage}>
          Arquivo
        </button>
        <button
          className={`ribbon-tab ${activeTab === 'tarefa' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('tarefa');
            if (viewMode === 'nexo') setViewMode('gantt');
          }}
        >
          Tarefa
        </button>
        <button
          className={`ribbon-tab ${activeTab === 'recursos' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('recursos');
            if (viewMode === 'nexo') setViewMode('gantt');
          }}
        >
          Recursos
        </button>
        <button
          className={`ribbon-tab ${activeTab === 'exibir' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('exibir');
            if (viewMode === 'nexo') setViewMode('gantt');
          }}
        >
          Exibição
        </button>
        <button
          className={`ribbon-tab ${activeTab === 'formato' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('formato');
            if (viewMode === 'nexo') setViewMode('gantt');
          }}
        >
          Formato
        </button>
        <button
          className={`ribbon-tab nexo-ribbon-tab ${activeTab === 'nexo' || viewMode === 'nexo' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('nexo');
            setViewMode('nexo');
          }}
          title="Abrir Plugin NEXO — Arquitetura de Projetos em 5 Fases"
        >
          <Compass size={13} style={{ marginRight: 5, verticalAlign: '-2px' }} />
          Nexo
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
                  <button className="small-tool-btn" onClick={() => onSetTaskMode('auto')} title="Agendamento Automático">
                    <Clock size={14} className="primary-color" />
                    <span>Agendamento Automático</span>
                  </button>
                  <button className="small-tool-btn" onClick={() => onSetTaskMode('manual')} title="Agendado Manualmente">
                    <Calendar size={14} />
                    <span>Agendado Manualmente</span>
                  </button>
                  <button
                    className="small-tool-btn"
                    onClick={onOpenExceptionsModal}
                    title="Gerenciar Datas de Exceção (Feriados, Recessos, Emendas e Expedientes Atípicos)"
                  >
                    <CalendarOff size={14} className="accent-color" />
                    <span>Datas de Exceção</span>
                    {exceptionsCount > 0 && (
                      <span className="ribbon-exception-badge">{exceptionsCount}</span>
                    )}
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

        {activeTab === 'recursos' && (
          <div className="ribbon-tab-content">
            <div className="ribbon-group">
              <div className="group-content">
                <button className="large-tool-btn" onClick={onOpenResourceSheet} title="Abrir planilha de recursos">
                  <Users size={28} className="tool-icon primary-color" />
                  <span>Planilha de Recursos</span>
                </button>
                <button className="large-tool-btn" onClick={onOpenCostReport} title="Visualizar Relatório de Custos do Projeto">
                  <DollarSign size={28} className="tool-icon success-color" />
                  <span>Relatório de Custos</span>
                </button>
              </div>
              <div className="group-label">Recursos &amp; Custos</div>
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

        {activeTab === 'nexo' && (
          <div className="ribbon-tab-content">
            {/* Grupo: Alternância de Visão (Perfil Lobo) */}
            <div className="ribbon-group">
              <div className="group-content">
                <button
                  className={`large-tool-btn ${viewMode === 'nexo' && nexoRoleView === 'architect' ? 'selected' : ''}`}
                  onClick={() => {
                    setViewMode('nexo');
                    if (onToggleNexoRoleView) onToggleNexoRoleView('architect');
                  }}
                  title="Visão Arquiteto: Roadmap completo, custos, dependências e prazos"
                >
                  <Layers size={24} className="tool-icon primary-color" />
                  <span>Visão Arquiteto</span>
                </button>
                <button
                  className={`large-tool-btn ${viewMode === 'nexo' && nexoRoleView === 'executor' ? 'selected' : ''}`}
                  onClick={() => {
                    setViewMode('nexo');
                    if (onToggleNexoRoleView) onToggleNexoRoleView('executor');
                  }}
                  title="Visão Executor: Modo Ignição focado apenas no Milestone imediato"
                >
                  <Flame size={24} className="tool-icon accent-color" />
                  <span>Visão Executor</span>
                </button>
              </div>
              <div className="group-label">Alternância de Visão</div>
            </div>

            {/* Grupo: As 5 Fases da Metodologia Nexo */}
            <div className="ribbon-group">
              <div className="group-content">
                <div className="small-tools-column">
                  <button
                    className={`small-tool-btn ${nexoActivePhase === 1 ? 'selected-small' : ''}`}
                    onClick={() => {
                      setViewMode('nexo');
                      if (onSelectNexoPhase) onSelectNexoPhase(1);
                    }}
                  >
                    <Target size={13} className="primary-color" />
                    <span>Fase 1: Calibrador Ponto B</span>
                  </button>
                  <button
                    className={`small-tool-btn ${nexoActivePhase === 2 ? 'selected-small' : ''}`}
                    onClick={() => {
                      setViewMode('nexo');
                      if (onSelectNexoPhase) onSelectNexoPhase(2);
                    }}
                  >
                    <RotateCcw size={13} className="primary-color" />
                    <span>Fase 2: Engenharia Reversa (B → A)</span>
                  </button>
                  <button
                    className={`small-tool-btn ${nexoActivePhase === 3 ? 'selected-small' : ''}`}
                    onClick={() => {
                      setViewMode('nexo');
                      if (onSelectNexoPhase) onSelectNexoPhase(3);
                    }}
                  >
                    <CheckCircle size={13} className="success-color" />
                    <span>Fase 3: Validador Lógico (A → B)</span>
                  </button>
                </div>
                <div className="small-tools-column">
                  <button
                    className={`small-tool-btn ${nexoActivePhase === 4 ? 'selected-small' : ''}`}
                    onClick={() => {
                      setViewMode('nexo');
                      if (onSelectNexoPhase) onSelectNexoPhase(4);
                    }}
                  >
                    <DollarSign size={13} className="primary-color" />
                    <span>Fase 4: Matriz de Milestones</span>
                  </button>
                  <button
                    className={`small-tool-btn ${nexoActivePhase === 5 ? 'selected-small' : ''}`}
                    onClick={() => {
                      setViewMode('nexo');
                      if (onSelectNexoPhase) onSelectNexoPhase(5);
                    }}
                  >
                    <Flame size={13} className="accent-color" />
                    <span>Fase 5: Modo Ignição</span>
                  </button>
                </div>
              </div>
              <div className="group-label">As 5 Fases (Metodologia Nexo)</div>
            </div>

            {/* Grupo: Ações Nexo & Integração Gantt */}
            <div className="ribbon-group">
              <div className="group-content">
                <button
                  className="large-tool-btn"
                  onClick={() => {
                    setViewMode('nexo');
                    if (onStartNewNexoProject) onStartNewNexoProject();
                  }}
                  title="Novo Projeto no Calibrador de Foco (escurece menu lateral e apresenta apenas o Canvas de Ponto B)"
                >
                  <Plus size={24} className="tool-icon success-color" />
                  <span>Novo Projeto</span>
                </button>
                <button
                  className="large-tool-btn"
                  onClick={() => {
                    if (onSyncNexoToGantt) onSyncNexoToGantt();
                  }}
                  title="Converter Milestones do Nexo em tarefas no Gráfico de Gantt"
                >
                  <BarChart3 size={24} className="tool-icon primary-color" />
                  <span>Enviar p/ Gantt</span>
                </button>
              </div>
              <div className="group-label">Arquitetura &amp; Gantt</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
