import React, { useState } from 'react';
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
  Plus
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
  scrollTop: number;
  onScroll: (e: React.UIEvent<HTMLDivElement>) => void;
  scrollRef: React.RefObject<HTMLDivElement | null>;
}

export const TaskSheet: React.FC<TaskSheetProps> = ({
  tasks,
  resources,
  selectedTaskId,
  onSelectTask,
  onUpdateTask,
  onToggleCollapse,
  onAddTask,
  onOpenTaskDetail,
  onScroll,
  scrollRef
}) => {
  const [editingCell, setEditingCell] = useState<{ taskId: string; field: keyof Task } | null>(null);

  const handleCellBlur = () => {
    setEditingCell(null);
  };

  const handleDurationChange = (task: Task, text: string) => {
    const num = parseInt(text.replace(/\D/g, ''), 10);
    const valid = isNaN(num) ? 1 : num;
    onUpdateTask(task.id, { durationDays: valid });
  };

  return (
    <div className="task-sheet-container">
      {/* Cabeçalho da Tabela */}
      <div className="task-sheet-header">
        <div className="sheet-col col-id">ID</div>
        <div className="sheet-col col-info" title="Indicadores">i</div>
        <div className="sheet-col col-mode" title="Modo da Tarefa">Modo</div>
        <div className="sheet-col col-name">Nome da Tarefa</div>
        <div className="sheet-col col-duration">Duração</div>
        <div className="sheet-col col-date">Início</div>
        <div className="sheet-col col-date">Término</div>
        <div className="sheet-col col-pred">Predecessoras</div>
        <div className="sheet-col col-res">Nomes dos Recursos</div>
        <div className="sheet-col col-progress">% Concluída</div>
      </div>

      {/* Corpo Rolável */}
      <div 
        className="task-sheet-body" 
        ref={scrollRef} 
        onScroll={onScroll}
      >
        {tasks.map((task, index) => {
          const isSelected = selectedTaskId === task.id;
          const isEditing = (field: keyof Task) =>
            editingCell?.taskId === task.id && editingCell?.field === field;

          return (
            <div
              key={task.id}
              className={`sheet-row ${isSelected ? 'selected' : ''} ${task.isSummary ? 'summary-row' : ''} ${task.isCritical ? 'critical-row' : ''}`}
              onClick={() => onSelectTask(task.id)}
            >
              {/* ID */}
              <div className="sheet-cell col-id">{index + 1}</div>

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

              {/* Nome da Tarefa com recuo EAP */}
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
                  <span
                    className={`task-name-text ${task.isSummary ? 'font-bold' : ''} task-name-link`}
                    onClick={(e) => { e.stopPropagation(); onOpenTaskDetail(task.id); }}
                    title="Clique para ver detalhes e sub-tarefas"
                  >
                    {task.name}
                    {/* Indicador de sub-tarefas */}
                    {task.subTasks && task.subTasks.length > 0 && (
                      <span className="subtask-badge" title={`${task.subTasks.filter(s => s.done).length}/${task.subTasks.length} sub-tarefas`}>
                        {task.subTasks.filter(s => s.done).length}/{task.subTasks.length}
                      </span>
                    )}
                  </span>
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
                    placeholder="Ex: 1, 2"
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
                    {task.resourceNames.join('; ') || '-'}
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
        <div className="sheet-row add-row" onClick={onAddTask}>
          <div className="sheet-cell col-id">+</div>
          <div className="sheet-cell add-cell-prompt" style={{ gridColumn: 'span 9' }}>
            <Plus size={14} /> <span>Clique para adicionar uma nova tarefa...</span>
          </div>
        </div>
      </div>
    </div>
  );
};
