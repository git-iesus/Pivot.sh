import React, { useState, useEffect } from 'react';
import { Task, SubTask } from '../../types/project';
import { 
  X, 
  Plus, 
  CheckSquare, 
  Square, 
  Trash2, 
  CheckCircle2, 
  GripVertical, 
  Pencil, 
  Check,
  Calendar,
  Link2,
  Layers,
  Users,
  DollarSign,
  Sparkles
} from 'lucide-react';
import { HybridNotesEditor } from './HybridNotesEditor';

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
          </div>
          <button className="close-btn" onClick={handleSave} title="Fechar (salva automaticamente)">
            <X size={16} />
          </button>
        </div>

        <div className="modal-form-content task-detail-body">
          {/* Nome da Tarefa como Título Real (Borderless) e Custo elegante */}
          <div className="task-detail-header">
            <div className="task-title-header-row">
              <input
                type="text"
                className="task-title-input"
                value={taskName}
                onChange={(e) => setTaskName(e.target.value)}
                placeholder="Nome da tarefa..."
                title="Clique para editar o nome da tarefa"
              />
              <div className="task-cost-badge" title="Custo previsto da tarefa (R$)">
                <DollarSign size={13} className="cost-badge-icon" />
                <span className="cost-badge-prefix">R$</span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  className="cost-badge-input"
                  value={cost}
                  onChange={(e) => setCost(Math.max(0, parseFloat(e.target.value) || 0))}
                  placeholder="0,00"
                />
              </div>
            </div>

            {/* Agrupamento de Metadados em Chips / Badges elegantes */}
            <div className="task-metadata-chips-bar">
              <div className="meta-chip date-chip" title="Data de Início, Término e Duração">
                <Calendar size={13} className="chip-icon" />
                <span>{formatDateBR(task.startDate)} ➔ {formatDateBR(task.endDate)} ({task.durationDays}d)</span>
              </div>
              <div className="meta-chip pred-chip" title="Predecessoras da tarefa">
                <Link2 size={13} className="chip-icon" />
                <span>Pred: <strong>{task.predecessorText || 'Nenhuma'}</strong></span>
              </div>
              <div className="meta-chip eap-chip" title="Estrutura Analítica do Projeto (EAP / WBS)">
                <Layers size={13} className="chip-icon" />
                <span>EAP: <strong>{task.wbsIndex || '—'}</strong></span>
              </div>
              {task.resourceNames.length > 0 && (
                <div className="meta-chip res-chip" title="Recursos atribuídos">
                  <Users size={13} className="chip-icon" />
                  <span>{task.resourceNames.join(', ')}</span>
                </div>
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

            {/* Input para nova sub-tarefa com ícone + interno e botão sob demanda */}
            <div className="subtask-add-row">
              <div className="subtask-input-wrapper">
                <Plus size={15} className="subtask-input-icon" />
                <input
                  type="text"
                  className="office-input subtask-input-field"
                  placeholder="Nova sub-tarefa... (Enter para adicionar)"
                  value={newSubTaskTitle}
                  onChange={(e) => setNewSubTaskTitle(e.target.value)}
                  onKeyDown={handleKeyDown}
                />
                {newSubTaskTitle.trim().length > 0 && (
                  <button
                    className="subtask-add-btn-active"
                    onClick={handleAddSubTask}
                    title="Adicionar sub-tarefa"
                  >
                    Adicionar
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Notas / Observações com Editor Híbrido Live Markdown / WYSIWYG */}
          <div className="notes-section-container">
            <div className="notes-header-row">
              <label className="notes-label">Notas / Observações:</label>
              <span className="notes-discovery-hint" title="Digite marcadores de Markdown para formatar na hora ou selecione um trecho de texto">
                <Sparkles size={11} className="notes-hint-icon" />
                Suporta: <code># título</code>, <code>*negrito*</code>, <code>_sublinhado_</code>, <code>::destaque::</code>
              </span>
            </div>
            <HybridNotesEditor
              value={notes}
              onChange={setNotes}
              placeholder="Escreva notas ou observações sobre esta tarefa... Suporta # títulos, *negrito*, _sublinhado_, ::destaque:: e listas."
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
