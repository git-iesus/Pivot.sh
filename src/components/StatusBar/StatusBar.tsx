import React from 'react';
import { Clock, Calendar, ZoomIn, ZoomOut, BarChart3, Table, CalendarDays } from 'lucide-react';
import { ViewMode, ZoomLevel } from '../../types/project';

interface StatusBarProps {
  taskCount: number;
  selectedTaskId: string | null;
  taskMode: 'manual' | 'auto';
  onToggleTaskMode: () => void;
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  zoomLevel: ZoomLevel;
  setZoomLevel: (zoom: ZoomLevel) => void;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  taskCount,
  selectedTaskId,
  taskMode,
  onToggleTaskMode,
  viewMode,
  setViewMode,
  zoomLevel,
  setZoomLevel,
}) => {
  return (
    <div className="status-bar-container">
      <div className="status-left">
        <button className="status-mode-btn" onClick={onToggleTaskMode} title="Clique para alternar o modo padrão">
          {taskMode === 'auto' ? (
            <>
              <Clock size={13} className="text-primary" />
              <span>Novas tarefas: Agendadas Automaticamente</span>
            </>
          ) : (
            <>
              <Calendar size={13} />
              <span>Novas tarefas: Agendadas Manualmente</span>
            </>
          )}
        </button>
      </div>

      <div className="status-center">
        <span>{taskCount} tarefas no cronograma</span>
        {selectedTaskId && <span className="selection-info">· Tarefa selecionada</span>}
      </div>

      <div className="status-right">
        <div className="view-mode-shortcuts">
          <button
            className={`view-btn ${viewMode === 'gantt' ? 'active' : ''}`}
            onClick={() => setViewMode('gantt')}
            title="Gráfico de Gantt"
          >
            <BarChart3 size={14} />
          </button>
          <button
            className={`view-btn ${viewMode === 'week' ? 'active' : ''}`}
            onClick={() => setViewMode('week')}
            title="Visualização da Semana (Minha Semana)"
          >
            <CalendarDays size={14} />
          </button>
          <button
            className={`view-btn ${viewMode === 'taskSheet' ? 'active' : ''}`}
            onClick={() => setViewMode('taskSheet')}
            title="Planilha de Tarefas"
          >
            <Table size={14} />
          </button>
        </div>

        <div className="zoom-controls">
          <button
            className="zoom-btn"
            onClick={() => setZoomLevel(zoomLevel === 'days' ? 'weeks' : 'months')}
            title="Diminuir Zoom"
          >
            <ZoomOut size={13} />
          </button>
          <span className="zoom-label">
            {zoomLevel === 'days' ? 'Dias' : zoomLevel === 'weeks' ? 'Semanas' : 'Meses'}
          </span>
          <button
            className="zoom-btn"
            onClick={() => setZoomLevel(zoomLevel === 'months' ? 'weeks' : 'days')}
            title="Aumentar Zoom"
          >
            <ZoomIn size={13} />
          </button>
        </div>
      </div>
    </div>
  );
};
