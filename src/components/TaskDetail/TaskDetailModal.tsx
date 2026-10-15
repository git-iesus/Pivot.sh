import React, { useState, useEffect } from 'react';
import { Task, SubTask } from '../../types/project';
import { X, Plus, CheckSquare, Square, Trash2, CheckCircle2, GripVertical, Pencil, Check } from 'lucide-react';

interface TaskDetailModalProps {
  task: Task | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdateTask: (taskId: string, updates: Partial<Task>) => void;
}

// Formata data de YYYY-MM-DD para DD-MM-YYYY
function formatDateBR(dateStr?: string): string {
  if (!dateStr || dateStr === '—') return '—';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const [y, m, d] = parts;
    return `${d}-${m}-${y}`;
  }
  return dateStr;
}

export const TaskDetailModal: React.FC<TaskDetailModalProps> = ({
  task,
  isOpen,
  onClose,
  onUpdateTask,
}) => {
  const [taskName, setTaskName] = useState('');
  const [cost, setCost] = useState<number>(0);
  const [subTasks, setSubTasks] = useState<SubTask[]>([]);
  const [newSubTaskTitle, setNewSubTaskTitle] = useState('');
  const [notes, setNotes] = useState('');

  // Reordenação via Drag and Drop
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Edição de Sub-tarefa
  const [editingSubTaskId, setEditingSubTaskId] = useState<string | null>(null);
  const [editingSubTaskTitle, setEditingSubTaskTitle] = useState('');

  useEffect(() => {
    if (task) {
      setTaskName(task.name || '');
      setCost(task.cost ?? 0);
      setSubTasks(task.subTasks || []);
      setNotes(task.notes || '');
      setEditingSubTaskId(null);
      setEditingSubTaskTitle('');
      setDraggedIndex(null);
      setDragOverIndex(null);
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
    if (editingSubTaskId === id) {
      setEditingSubTaskId(null);
      setEditingSubTaskTitle('');
    }
  };

  // Funções de Edição de Sub-tarefa
  const handleStartEditSubTask = (id: string, currentTitle: string) => {
    setEditingSubTaskId(id);
    setEditingSubTaskTitle(currentTitle);
  };

  const handleSaveSubTaskEdit = (id: string) => {
    const trimmed = editingSubTaskTitle.trim();
    if (trimmed) {
      setSubTasks((prev) =>
        prev.map((st) => (st.id === id ? { ...st, title: trimmed } : st))
      );
    }
    setEditingSubTaskId(null);
    setEditingSubTaskTitle('');
  };

  const handleCancelSubTaskEdit = () => {
    setEditingSubTaskId(null);
    setEditingSubTaskTitle('');
  };

  // Funções de Drag & Drop para Re-ordenação
  const handleDragStart = (e: React.DragEvent<HTMLLIElement>, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', index.toString());
  };

  const handleDragOver = (e: React.DragEvent<HTMLLIElement>, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLLIElement>, targetIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === targetIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    const updated = [...subTasks];
    const [movedItem] = updated.splice(draggedIndex, 1);
    updated.splice(targetIndex, 0, movedItem);

    setSubTasks(updated);
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleMarkComplete = () => {
    // Sem sub-tarefas: checkbox master → 100%
    const finalName = taskName.trim() || task.name;
    onUpdateTask(task.id, { name: finalName, progress: 100, subTasks: [], notes, cost });
    onClose();
  };

  const handleSave = () => {
    const newProgress = hasSubTasks
      ? Math.round((subTasks.filter((st) => st.done).length / subTasks.length) * 100)
      : task.progress;
    const finalName = taskName.trim() || task.name;
    onUpdateTask(task.id, { name: finalName, subTasks, progress: newProgress, notes, cost });
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleAddSubTask();
  };

  const progressColor =
    computedProgress === 100 ? '#2e7d32' : computedProgress >= 50 ? '#1976d2' : '#e65100';

  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) handleSave(); }}>
      <div className="modal-window task-detail-modal">
        {/* Cabeçalho */}
        <div className="modal-titlebar">
          <div className="title-with-icon">
            <CheckCircle2 size={18} />
            <span>Detalhe da Tarefa</span>
            <span className="modal-autosave-badge" title="Todas as alterações neste card são salvas automaticamente sem necessidade de botão">
              <Check size={11} /> Salvo automaticamente
            </span>
          </div>
          <button className="close-btn" onClick={handleSave} title="Fechar (salva automaticamente)">
            <X size={16} />
          </button>
        </div>

        <div className="modal-form-content task-detail-body">
          {/* Nome e Custo com edição direta */}
          <div className="task-detail-header">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px', gap: '12px', marginBottom: '8px' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px', display: 'block' }}>
                  Nome da Tarefa:
                </label>
                <input
                  type="text"
                  className="office-input"
                  style={{ fontSize: '13.5px', fontWeight: 600, color: '#194d33', width: '100%' }}
                  value={taskName}
                  onChange={(e) => setTaskName(e.target.value)}
                  placeholder="Digite o nome da tarefa..."
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px', display: 'block' }}>
                  Custo Previsto (R$):
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  className="office-input"
                  style={{ fontSize: '13.5px', fontWeight: 600, color: '#1e3a8a', width: '100%' }}
                  value={cost}
                  onChange={(e) => setCost(Math.max(0, parseFloat(e.target.value) || 0))}
                  placeholder="0,00"
                />
              </div>
            </div>
            <div className="task-detail-meta">
              <span>EAP: <strong>{task.wbsIndex || '—'}</strong></span>
              <span>Início: <strong>{formatDateBR(task.startDate)}</strong></span>
              <span>Término: <strong>{formatDateBR(task.endDate)}</strong></span>
              <span>Duração: <strong>{task.durationDays}d</strong></span>
              <span>Predecessoras: <strong>{task.predecessorText || '—'}</strong></span>
              <span>Custo: <strong>{(cost || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong></span>
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
                {subTasks.map((st, index) => {
                  const isEditing = editingSubTaskId === st.id;
                  const isDragging = draggedIndex === index;
                  const isDragOver = dragOverIndex === index && draggedIndex !== index;

                  return (
                    <li
                      key={st.id}
                      className={`subtask-item ${st.done ? 'done' : ''} ${isDragging ? 'dragging' : ''} ${isDragOver ? 'drag-over' : ''}`}
                      draggable={!isEditing}
                      onDragStart={(e) => handleDragStart(e, index)}
                      onDragOver={(e) => handleDragOver(e, index)}
                      onDrop={(e) => handleDrop(e, index)}
                      onDragEnd={handleDragEnd}
                    >
                      {/* Alça de Arraste (Grip) */}
                      <div
                        className="subtask-drag-handle"
                        title="Clique e arraste para reordenar para cima ou para baixo"
                      >
                        <GripVertical size={16} />
                      </div>

                      {/* Checkbox de Conclusão */}
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

                      {/* Título da Sub-tarefa ou Input de Edição */}
                      {isEditing ? (
                        <div className="subtask-edit-box">
                          <input
                            type="text"
                            className="office-input subtask-inline-input"
                            value={editingSubTaskTitle}
                            autoFocus
                            placeholder="Nome da sub-tarefa..."
                            onChange={(e) => setEditingSubTaskTitle(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveSubTaskEdit(st.id);
                              if (e.key === 'Escape') handleCancelSubTaskEdit();
                            }}
                          />
                          <button
                            className="subtask-btn-action save"
                            onClick={() => handleSaveSubTaskEdit(st.id)}
                            title="Salvar alteração (Enter)"
                          >
                            <Check size={14} />
                          </button>
                          <button
                            className="subtask-btn-action cancel"
                            onClick={handleCancelSubTaskEdit}
                            title="Cancelar (Esc)"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ) : (
                        <span
                          className="subtask-title"
                          onDoubleClick={() => handleStartEditSubTask(st.id, st.title)}
                          title="Duplo clique para editar"
                        >
                          {st.title}
                        </span>
                      )}

                      {/* Ações (Editar e Apagar) */}
                      {!isEditing && (
                        <div className="subtask-actions">
                          <button
                            className="subtask-edit-btn"
                            onClick={() => handleStartEditSubTask(st.id, st.title)}
                            title="Editar sub-tarefa"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            className="subtask-remove-btn"
                            onClick={() => handleRemoveSubTask(st.id)}
                            title="Remover sub-tarefa"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}
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
