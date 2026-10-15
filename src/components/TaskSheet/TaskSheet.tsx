import React, { useState, useRef } from 'react';
import { 
  Task, 
  Resource 
} from '../../types/project';
import { 
  ChevronRight, 
  ChevronDown, 
  Clock, 
  Calendar, 
  Flag, 
  CheckCircle,
  Plus,
  ListTodo
} from 'lucide-react';
import { formatDatePTBR } from '../../utils/scheduler';

interface TaskSheetProps {
  tasks: Task[];
  resources: Resource[];
  selectedTaskId: string | null;
  onSelectTask: (taskId: string) => void;
  onUpdateTask: (taskId: string, updates: Partial<Task>) => void;
  onToggleCollapse: (taskId: string) => void;
  onAddTask: () => void;
  onOpenTaskDetail: (taskId: string) => void;
  rowHeights?: Record<string, number>;
  onUpdateRowHeight?: (taskId: string, height: number) => void;
  scrollTop: number;
  onScroll: (e: React.UIEvent<HTMLDivElement>) => void;
  scrollRef: React.RefObject<HTMLDivElement | null>;
}

export interface ColumnWidths {
  id: number;
  info: number;
  mode: number;
  name: number;
  duration: number;
  startDate: number;
  endDate: number;
  predecessors: number;
  resources: number;
  progress: number;
}

interface ColumnDef {
  key: keyof ColumnWidths;
  label: string;
  title?: string;
  minWidth: number;
  className: string;
}

const COLUMNS: ColumnDef[] = [
  { key: 'id', label: 'ID', minWidth: 32, className: 'col-id' },
  { key: 'info', label: 'i', title: 'Indicadores', minWidth: 22, className: 'col-info' },
  { key: 'mode', label: 'Modo', title: 'Modo da Tarefa', minWidth: 40, className: 'col-mode' },
  { key: 'name', label: 'Nome da Tarefa', minWidth: 160, className: 'col-name' },
  { key: 'duration', label: 'Duração', minWidth: 65, className: 'col-duration' },
  { key: 'startDate', label: 'Início', minWidth: 80, className: 'col-date' },
  { key: 'endDate', label: 'Término', minWidth: 80, className: 'col-date' },
  { key: 'predecessors', label: 'Predecessoras', minWidth: 85, className: 'col-pred' },
  { key: 'resources', label: 'Nomes dos Recursos', minWidth: 100, className: 'col-res' },
  { key: 'progress', label: '% Concluída', minWidth: 80, className: 'col-progress' },
];

const DEFAULT_COL_WIDTHS: ColumnWidths = {
  id: 38,
  info: 24,
  mode: 46,
  name: 330,
  duration: 75,
  startDate: 92,
  endDate: 92,
  predecessors: 95,
  resources: 140,
  progress: 90,
};

export const TaskSheet: React.FC<TaskSheetProps> = ({
  tasks,
  selectedTaskId,
  onSelectTask,
  onUpdateTask,
  onToggleCollapse,
  onAddTask,
  onOpenTaskDetail,
  rowHeights,
  onUpdateRowHeight,
  onScroll,
  scrollRef
}) => {
  const [editingCell, setEditingCell] = useState<{ taskId: string; field: keyof Task } | null>(null);

  // Larguras das colunas estilo Excel (com persistência no localStorage)
  const [colWidths, setColWidths] = useState<ColumnWidths>(() => {
    const saved = localStorage.getItem('ms_project_col_widths');
    if (saved) {
      try {
        return { ...DEFAULT_COL_WIDTHS, ...JSON.parse(saved) };
      } catch (e) {
        // fallback
      }
    }
    return DEFAULT_COL_WIDTHS;
  });

  const resizingCol = useRef<{ key: keyof ColumnWidths; startX: number; startWidth: number } | null>(null);
  const resizingRow = useRef<{ taskId: string; startY: number; startHeight: number } | null>(null);

  const handleMouseDownResize = (key: keyof ColumnWidths, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    resizingCol.current = {
      key,
      startX: e.clientX,
      startWidth: colWidths[key],
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!resizingCol.current) return;
      const { key, startX, startWidth } = resizingCol.current;
      const delta = moveEvent.clientX - startX;
      const minW = COLUMNS.find((c) => c.key === key)?.minWidth || 30;
      const newWidth = Math.max(minW, startWidth + delta);

      setColWidths((prev) => {
        const next = { ...prev, [key]: newWidth };
        localStorage.setItem('ms_project_col_widths', JSON.stringify(next));
        return next;
      });
    };

    const handleMouseUp = () => {
      resizingCol.current = null;
      document.body.style.cursor = 'default';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // Redimensionamento de linhas individualmente estilo Excel
  const handleMouseDownRowResize = (taskId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const currentH = (rowHeights && rowHeights[taskId]) || 40;
    resizingRow.current = {
      taskId,
      startY: e.clientY,
      startHeight: currentH,
    };

    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!resizingRow.current) return;
      const { taskId, startY, startHeight } = resizingRow.current;
      const deltaY = moveEvent.clientY - startY;
      const newHeight = Math.max(26, startHeight + deltaY);
      if (onUpdateRowHeight) {
        onUpdateRowHeight(taskId, newHeight);
      }
    };

    const handleMouseUp = () => {
      resizingRow.current = null;
      document.body.style.cursor = 'default';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleCellBlur = () => {
    setEditingCell(null);
  };

  const handleDurationChange = (task: Task, text: string) => {
    const num = parseInt(text.replace(/\D/g, ''), 10);
    const valid = isNaN(num) ? 1 : num;
    onUpdateTask(task.id, { durationDays: valid });
  };

  // Grid Template e Largura Total calculados dinamicamente
  const gridTemplateColumns = `${colWidths.id}px ${colWidths.info}px ${colWidths.mode}px ${colWidths.name}px ${colWidths.duration}px ${colWidths.startDate}px ${colWidths.endDate}px ${colWidths.predecessors}px ${colWidths.resources}px ${colWidths.progress}px`;
  const totalRowWidth = Object.values(colWidths).reduce((a, b) => a + b, 0);

  return (
    <div className="task-sheet-container">
      {/* Container Rolável Único: o cabeçalho e as linhas compartilham o mesmo scroll horizontal, eliminando qualquer desalinhamento */}
      <div 
        className="task-sheet-body" 
        ref={scrollRef} 
        onScroll={onScroll}
      >
        {/* Cabeçalho da Tabela - Fixo no topo e redimensionável por coluna */}
        <div 
          className="task-sheet-header"
          style={{ width: `${totalRowWidth}px`, gridTemplateColumns }}
        >
          {COLUMNS.map((col) => (
            <div 
              key={col.key} 
              className={`sheet-col ${col.className}`}
              title={col.title}
            >
              <span className="col-header-text">{col.label}</span>
              {/* Alça de redimensionamento estilo Excel */}
              <div 
                className="col-resizer" 
                onMouseDown={(e) => handleMouseDownResize(col.key, e)}
                title="Arraste para redimensionar a coluna (como no Excel)"
              />
            </div>
          ))}
        </div>

        {/* Linhas de Tarefas */}
        {tasks.map((task, index) => {
          const isSelected = selectedTaskId === task.id;
          const isEditing = (field: keyof Task) =>
            editingCell?.taskId === task.id && editingCell?.field === field;

          const rowHeight = (rowHeights && rowHeights[task.id]) || 40;

          return (
            <div
              key={task.id}
              className={`sheet-row ${isSelected ? 'selected' : ''} ${task.isSummary ? 'summary-row' : ''} ${task.isCritical ? 'critical-row' : ''}`}
              style={{ width: `${totalRowWidth}px`, gridTemplateColumns, height: `${rowHeight}px`, minHeight: `${rowHeight}px` }}
              onClick={() => onSelectTask(task.id)}
            >
              {/* ID com alça de redimensionamento estilo Excel */}
              <div className="sheet-cell col-id">
                <span>{index + 1}</span>
                <div 
                  className="row-resizer"
                  onMouseDown={(e) => handleMouseDownRowResize(task.id, e)}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    if (onUpdateRowHeight) onUpdateRowHeight(task.id, 40);
                  }}
                  title="Arraste para redimensionar a altura da linha (ou clique duplo para restaurar)"
                />
              </div>

              {/* Indicadores */}
              <div className="sheet-cell col-info">
                {task.progress === 100 && <CheckCircle size={13} className="text-success" />}
                {task.isMilestone && <Flag size={13} className="text-accent" />}
              </div>

              {/* Modo */}
              <div className="sheet-cell col-mode" title={task.mode === 'auto' ? 'Agendamento Automático' : 'Agendado Manualmente'}>
                {task.mode === 'auto' ? (
                  <Clock size={14} className="mode-icon auto" />
                ) : (
                  <Calendar size={14} className="mode-icon manual" />
                )}
              </div>

              {/* Nome da Tarefa com recuo EAP e Badge de sub-tarefas elegante */}
              <div 
                className="sheet-cell col-name"
                style={{ paddingLeft: `${8 + task.outlineLevel * 18}px` }}
                onDoubleClick={() => setEditingCell({ taskId: task.id, field: 'name' })}
              >
                {task.isSummary && (
                  <button 
                    className="collapse-btn" 
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleCollapse(task.id);
                    }}
                  >
                    {task.collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                  </button>
                )}
                {isEditing('name') ? (
                  <input
                    type="text"
                    className="cell-input"
                    defaultValue={task.name}
                    autoFocus
                    onBlur={(e) => {
                      onUpdateTask(task.id, { name: e.target.value });
                      handleCellBlur();
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        onUpdateTask(task.id, { name: (e.target as HTMLInputElement).value });
                        handleCellBlur();
                      }
                    }}
                  />
                ) : (
                  <div 
                    className="task-name-content"
                    onClick={(e) => { e.stopPropagation(); onOpenTaskDetail(task.id); }}
                    title="Clique para abrir detalhes e checklist"
                  >
                    <span className={`task-name-text ${task.isSummary ? 'font-bold' : ''}`}>
                      {task.name}
                    </span>
                    {task.subTasks && task.subTasks.length > 0 && (
                      <span 
                        className="subtask-pill-badge" 
                        title={`${task.subTasks.filter(s => s.done).length} de ${task.subTasks.length} sub-tarefas concluídas`}
                      >
                        <ListTodo size={11} className="subtask-pill-icon" />
                        <span>{task.subTasks.filter(s => s.done).length}/{task.subTasks.length}</span>
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Duração */}
              <div 
                className="sheet-cell col-duration text-right"
                onDoubleClick={() => !task.isSummary && setEditingCell({ taskId: task.id, field: 'durationDays' })}
              >
                {isEditing('durationDays') ? (
                  <input
                    type="text"
                    className="cell-input text-right"
                    defaultValue={`${task.durationDays} dias`}
                    autoFocus
                    onBlur={(e) => {
                      handleDurationChange(task, e.target.value);
                      handleCellBlur();
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleDurationChange(task, (e.target as HTMLInputElement).value);
                        handleCellBlur();
                      }
                    }}
                  />
                ) : (
                  <span>
                    {task.isMilestone ? '0 dias' : `${task.durationDays} ${task.durationDays === 1 ? 'dia' : 'dias'}`}
                  </span>
                )}
              </div>

              {/* Data Início */}
              <div 
                className="sheet-cell col-date"
                onDoubleClick={() => !task.isSummary && setEditingCell({ taskId: task.id, field: 'startDate' })}
              >
                {isEditing('startDate') ? (
                  <input
                    type="date"
                    className="cell-input"
                    defaultValue={task.startDate}
                    autoFocus
                    onBlur={(e) => {
                      if (e.target.value) onUpdateTask(task.id, { startDate: e.target.value });
                      handleCellBlur();
                    }}
                  />
                ) : (
                  <span>{formatDatePTBR(task.startDate)}</span>
                )}
              </div>

              {/* Data Término */}
              <div 
                className="sheet-cell col-date"
                onDoubleClick={() => !task.isSummary && setEditingCell({ taskId: task.id, field: 'endDate' })}
              >
                {isEditing('endDate') ? (
                  <input
                    type="date"
                    className="cell-input"
                    defaultValue={task.endDate}
                    autoFocus
                    onBlur={(e) => {
                      if (e.target.value) onUpdateTask(task.id, { endDate: e.target.value });
                      handleCellBlur();
                    }}
                  />
                ) : (
                  <span>{formatDatePTBR(task.endDate)}</span>
                )}
              </div>

              {/* Predecessoras */}
              <div 
                className="sheet-cell col-pred"
                onDoubleClick={() => !task.isSummary && setEditingCell({ taskId: task.id, field: 'predecessorText' })}
              >
                {isEditing('predecessorText') ? (
                  <input
                    type="text"
                    className="cell-input"
                    defaultValue={task.predecessorText}
                    autoFocus
                    placeholder="Ex: 1, 2ii, 3tt"
                    onBlur={(e) => {
                      onUpdateTask(task.id, { predecessorText: e.target.value });
                      handleCellBlur();
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        onUpdateTask(task.id, { predecessorText: (e.target as HTMLInputElement).value });
                        handleCellBlur();
                      }
                    }}
                  />
                ) : (
                  <span>{task.predecessorText || ''}</span>
                )}
              </div>

              {/* Recursos */}
              <div 
                className="sheet-cell col-res"
                onDoubleClick={() => !task.isSummary && setEditingCell({ taskId: task.id, field: 'resourceNames' })}
              >
                {isEditing('resourceNames') ? (
                  <input
                    type="text"
                    className="cell-input"
                    defaultValue={task.resourceNames.join('; ')}
                    placeholder="Recursos separados por ;"
                    autoFocus
                    onBlur={(e) => {
                      const resList = e.target.value.split(';').map(s => s.trim()).filter(Boolean);
                      onUpdateTask(task.id, { resourceNames: resList });
                      handleCellBlur();
                    }}
                  />
                ) : (
                  <span title={task.resourceNames.join(', ')}>
                    {task.resourceNames.join('; ')}
                  </span>
                )}
              </div>

              {/* % Concluída */}
              <div 
                className="sheet-cell col-progress"
                onDoubleClick={() => setEditingCell({ taskId: task.id, field: 'progress' })}
              >
                {isEditing('progress') ? (
                  <input
                    type="number"
                    min="0"
                    max="100"
                    className="cell-input text-right"
                    defaultValue={task.progress}
                    autoFocus
                    onBlur={(e) => {
                      const val = Math.min(100, Math.max(0, parseInt(e.target.value, 10) || 0));
                      onUpdateTask(task.id, { progress: val });
                      handleCellBlur();
                    }}
                  />
                ) : (
                  <div className="progress-cell-wrapper">
                    <div className="progress-mini-bar" style={{ width: `${task.progress}%` }}></div>
                    <span className="progress-text">{task.progress}%</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Linha para Adicionar Nova Tarefa */}
        <div 
          className="sheet-row add-row" 
          style={{ width: `${totalRowWidth}px`, gridTemplateColumns }}
          onClick={onAddTask}
        >
          <div className="sheet-cell col-id">+</div>
          <div className="sheet-cell add-cell-prompt" style={{ gridColumn: 'span 9' }}>
            <Plus size={14} /> <span>Clique para adicionar uma nova tarefa...</span>
          </div>
        </div>
      </div>
    </div>
  );
};
