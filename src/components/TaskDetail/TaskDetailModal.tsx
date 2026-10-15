import React, { useState, useEffect } from 'react';
import { Task, SubTask } from '../../types/project';
import { X, Plus, CheckSquare, Square, Trash2, CheckCircle2 } from 'lucide-react';

interface TaskDetailModalProps {
  task: Task | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdateTask: (taskId: string, updates: Partial<Task>) => void;
}

export const TaskDetailModal: React.FC<TaskDetailModalProps> = ({
  task,
  isOpen,
  onClose,
  onUpdateTask,
}) => {
  const [subTasks, setSubTasks] = useState<SubTask[]>([]);
  const [newSubTaskTitle, setNewSubTaskTitle] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (task) {
      setSubTasks(task.subTasks || []);
      setNotes(task.notes || '');
    }
  }, [task, isOpen]);

  if (!isOpen || !task) return null;

  const hasSubTasks = subTasks.length > 0;
  const doneCount = subTasks.filter((st) => st.done).length;
  const computedProgress = hasSubTasks ? Math.round((doneCount / subTasks.length) * 100) : task.progress;

  const handleToggleSubTask = (id: string) => {
    const updated = subTasks.map((st) =>
      st.id === id ? { ...st, done: !st.done } : st
    );
    setSubTasks(updated);
  };

  const handleAddSubTask = () => {
    const title = newSubTaskTitle.trim();
    if (!title) return;
    const newSt: SubTask = {
      id: `st_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      title,
      done: false,
    };
    setSubTasks([...subTasks, newSt]);
    setNewSubTaskTitle('');
  };

  const handleRemoveSubTask = (id: string) => {
    setSubTasks(subTasks.filter((st) => st.id !== id));
  };

  const handleMarkComplete = () => {
    // Sem sub-tarefas: checkbox master → 100%
    onUpdateTask(task.id, { progress: 100, subTasks: [], notes });
    onClose();
  };

  const handleSave = () => {
    const newProgress = hasSubTasks
      ? Math.round((subTasks.filter((st) => st.done).length / subTasks.length) * 100)
      : task.progress;
    onUpdateTask(task.id, { subTasks, progress: newProgress, notes });
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleAddSubTask();
  };

  const progressColor =
    computedProgress === 100 ? '#2e7d32' : computedProgress >= 50 ? '#1976d2' : '#e65100';

  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-window task-detail-modal">
        {/* Cabeçalho */}
        <div className="modal-titlebar">
          <div className="title-with-icon">
            <CheckCircle2 size={18} />
            <span>Detalhe da Tarefa</span>
          </div>
          <button className="close-btn" onClick={onClose} title="Fechar">
            <X size={16} />
          </button>
        </div>

        <div className="modal-form-content task-detail-body">
          {/* Nome e infos básicas */}
          <div className="task-detail-header">
            <h3 className="task-detail-title">{task.name}</h3>
            <div className="task-detail-meta">
              <span>EAP: <strong>{task.wbsIndex || '—'}</strong></span>
              <span>Início: <strong>{task.startDate}</strong></span>
              <span>Término: <strong>{task.endDate}</strong></span>
              <span>Duração: <strong>{task.durationDays}d</strong></span>
              {task.resourceNames.length > 0 && (
                <span>Recursos: <strong>{task.resourceNames.join(', ')}</strong></span>
              )}
            </div>
          </div>

          <hr className="task-detail-divider" />

          {/* Área de Conclusão / Sub-tarefas */}
          {!hasSubTasks ? (
            /* --- Sem sub-tarefas: checkbox master --- */
            <div className="master-checkbox-area">
              <p className="subtask-hint">
                Esta tarefa não possui sub-tarefas. Você pode marcá-la como concluída diretamente ou adicionar um checklist abaixo.
              </p>
              <button
                className={`master-checkbox-btn ${task.progress === 100 ? 'completed' : ''}`}
                onClick={handleMarkComplete}
                title={task.progress === 100 ? 'Tarefa já concluída' : 'Marcar como 100% Concluída'}
              >
                {task.progress === 100 ? (
                  <CheckSquare size={22} className="icon-done" />
                ) : (
                  <Square size={22} className="icon-pending" />
                )}
                <span>{task.progress === 100 ? 'Concluída (100%)' : 'Marcar como Concluída'}</span>
              </button>
            </div>
          ) : (
            /* --- Com sub-tarefas: barra de progresso calculada --- */
            <div className="subtask-progress-area">
              <div className="subtask-progress-header">
                <span className="progress-label">
                  Progresso: <strong>{computedProgress}%</strong> ({doneCount}/{subTasks.length} sub-tarefas)
                </span>
              </div>
              <div className="progress-bar-track">
                <div
                  className="progress-bar-fill"
                  style={{ width: `${computedProgress}%`, background: progressColor }}
                />
              </div>
            </div>
          )}

          {/* Lista de Sub-tarefas */}
          <div className="subtask-section">
            <h4 className="subtask-section-title">
              {hasSubTasks ? `Checklist de Sub-tarefas (${doneCount}/${subTasks.length})` : 'Adicionar Sub-tarefas'}
            </h4>

            {hasSubTasks && (
              <ul className="subtask-list">
                {subTasks.map((st) => (
                  <li key={st.id} className={`subtask-item ${st.done ? 'done' : ''}`}>
                    <button
                      className="subtask-toggle-btn"
                      onClick={() => handleToggleSubTask(st.id)}
                      title={st.done ? 'Desmarcar' : 'Marcar como feito'}
                    >
                      {st.done ? (
                        <CheckSquare size={18} className="icon-done" />
                      ) : (
                        <Square size={18} className="icon-pending" />
                      )}
                    </button>
                    <span className="subtask-title">{st.title}</span>
                    <button
                      className="subtask-remove-btn"
                      onClick={() => handleRemoveSubTask(st.id)}
                      title="Remover sub-tarefa"
                    >
                      <Trash2 size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {/* Input para nova sub-tarefa */}
            <div className="subtask-add-row">
              <input
                type="text"
                className="office-input subtask-input"
                placeholder="Nova sub-tarefa... (Enter para adicionar)"
                value={newSubTaskTitle}
                onChange={(e) => setNewSubTaskTitle(e.target.value)}
                onKeyDown={handleKeyDown}
              />
              <button
                className="btn-office primary"
                onClick={handleAddSubTask}
                disabled={!newSubTaskTitle.trim()}
                title="Adicionar sub-tarefa"
              >
                <Plus size={15} />
                Adicionar
              </button>
            </div>
          </div>

          {/* Notas */}
          <div className="form-group" style={{ marginTop: '12px' }}>
            <label>Notas / Observações:</label>
            <textarea
              className="office-input"
              rows={3}
              style={{ resize: 'vertical', fontFamily: 'inherit' }}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anotações sobre esta tarefa..."
            />
          </div>
        </div>

        {/* Rodapé */}
        <div className="modal-footer">
          <button className="btn-office" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn-office primary" onClick={handleSave}>
            Salvar Alterações
          </button>
        </div>
      </div>
    </div>
  );
};
