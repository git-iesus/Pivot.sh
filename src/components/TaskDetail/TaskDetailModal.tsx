import React, { useState, useEffect, useMemo } from 'react';
import { Task, SubTask, Resource, CalendarException } from '../../types/project';
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
  Sparkles,
  Clock,
  Ban,
  Info,
  Target,
} from 'lucide-react';
import { HybridNotesEditor } from './HybridNotesEditor';
import {
  getEffectiveActiveWeekDays,
  getParentSubproject,
  getSubtreeTaskCount,
  formatActiveWeekDaysShort,
  getBaselineVarianceDays,
  parseISODate,
  toISODate,
  addWorkDays,
  getWorkDaysDifference,
} from '../../utils/scheduler';

interface TaskDetailModalProps {
  task: Task | null;
  tasks?: Task[];
  resources?: Resource[];
  exceptions?: CalendarException[];
  projectActiveWeekDays?: number[];
  isOpen: boolean;
  onClose: () => void;
  onUpdateTask: (taskId: string, updates: Partial<Task>) => void;
}

const WEEK_DAYS = [
  { index: 0, name: 'Domingo', short: 'Dom' },
  { index: 1, name: 'Segunda-feira', short: 'Seg' },
  { index: 2, name: 'Terça-feira', short: 'Ter' },
  { index: 3, name: 'Quarta-feira', short: 'Qua' },
  { index: 4, name: 'Quinta-feira', short: 'Qui' },
  { index: 5, name: 'Sexta-feira', short: 'Sex' },
  { index: 6, name: 'Sábado', short: 'Sáb' },
];

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

function arraysEqual(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  const sA = [...a].sort((x, y) => x - y);
  const sB = [...b].sort((x, y) => x - y);
  return sA.every((val, i) => val === sB[i]);
}

export const TaskDetailModal: React.FC<TaskDetailModalProps> = ({
  task,
  tasks = [],
  resources = [],
  exceptions = [],
  projectActiveWeekDays = [1, 2, 3, 4, 5],
  isOpen,
  onClose,
  onUpdateTask,
}) => {
  const [taskName, setTaskName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [durationDays, setDurationDays] = useState<number>(1);
  const [predecessorText, setPredecessorText] = useState('');
  const [resourceNames, setResourceNames] = useState<string[]>([]);
  const [customResourceInput, setCustomResourceInput] = useState('');
  const [cost, setCost] = useState<number>(0);
  const [localProgress, setLocalProgress] = useState<number>(0);
  const [subTasks, setSubTasks] = useState<SubTask[]>([]);
  const [newSubTaskTitle, setNewSubTaskTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [baselineEndDate, setBaselineEndDate] = useState<string>('');
  const [subprojectActiveDays, setSubprojectActiveDays] = useState<number[] | undefined>(undefined);

  // Reordenação via Drag and Drop
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Edição de Sub-tarefa
  const [editingSubTaskId, setEditingSubTaskId] = useState<string | null>(null);
  const [editingSubTaskTitle, setEditingSubTaskTitle] = useState('');

  const taskIndex = useMemo(() => {
    if (!task) return -1;
    return tasks.findIndex((t) => t.id === task.id);
  }, [task, tasks]);

  const parentSubproject = useMemo(() => {
    if (taskIndex < 0) return undefined;
    return getParentSubproject(tasks, taskIndex);
  }, [tasks, taskIndex]);

  const inheritedActiveDays = useMemo(() => {
    if (taskIndex < 0) return projectActiveWeekDays;
    if (parentSubproject) {
      const parentIdx = tasks.findIndex((t) => t.id === parentSubproject.id);
      if (parentIdx >= 0) {
        return getEffectiveActiveWeekDays(tasks, parentIdx, projectActiveWeekDays);
      }
    }
    return projectActiveWeekDays;
  }, [tasks, taskIndex, parentSubproject, projectActiveWeekDays]);

  useEffect(() => {
    if (task) {
      setTaskName(task.name || '');
      setStartDate(task.startDate || '');
      setEndDate(task.endDate || '');
      setDurationDays(task.isMilestone ? 0 : Math.max(1, task.durationDays || 1));
      setPredecessorText(task.predecessorText || '');
      setResourceNames(task.resourceNames ? [...task.resourceNames] : []);
      setCustomResourceInput('');
      setCost(task.cost ?? 0);
      setLocalProgress(task.progress ?? 0);
      setSubTasks(task.subTasks || []);
      setNotes(task.notes || '');
      setBaselineEndDate(task.baselineEndDate || '');
      setSubprojectActiveDays(
        task.activeWeekDays && task.activeWeekDays.length > 0 ? [...task.activeWeekDays] : undefined
      );
      setEditingSubTaskId(null);
      setEditingSubTaskTitle('');
      setDraggedIndex(null);
      setDragOverIndex(null);
    }
  }, [task, isOpen]);

  if (!isOpen || !task) return null;

  const isSubproject = Boolean(task.isSummary);
  const effectiveSubprojectDays =
    subprojectActiveDays && subprojectActiveDays.length > 0
      ? subprojectActiveDays
      : inheritedActiveDays;

  const linkedSubtaskCount = isSubproject ? getSubtreeTaskCount(tasks, task.id) : 0;

  const hasSubTasks = subTasks.length > 0;
  const doneCount = subTasks.filter((st) => st.done).length;
  const computedProgress = isSubproject
    ? task.progress
    : hasSubTasks
      ? Math.round((doneCount / subTasks.length) * 100)
      : task.progress;

  // Handlers de edição interativa de Datas, Duração e Recursos dentro do Modal
  const handleModalStartDateChange = (nextStart: string) => {
    if (!nextStart) return;
    setStartDate(nextStart);
    const startDt = parseISODate(nextStart);
    const dur = task.isMilestone ? 0 : Math.max(1, durationDays);
    const computedEnd = toISODate(addWorkDays(startDt, dur, effectiveSubprojectDays, exceptions));
    setEndDate(computedEnd);
  };

  const handleModalDurationChange = (nextDurRaw: number) => {
    const validDur = task.isMilestone ? 0 : Math.max(1, nextDurRaw || 1);
    setDurationDays(validDur);
    if (startDate) {
      const startDt = parseISODate(startDate);
      const computedEnd = toISODate(addWorkDays(startDt, validDur, effectiveSubprojectDays, exceptions));
      setEndDate(computedEnd);
    }
  };

  const handleModalEndDateChange = (nextEnd: string) => {
    if (!nextEnd) return;
    setEndDate(nextEnd);
    if (startDate) {
      const startDt = parseISODate(startDate);
      const endDt = parseISODate(nextEnd);
      if (endDt >= startDt) {
        const diffDays = getWorkDaysDifference(startDt, endDt, effectiveSubprojectDays, exceptions);
        setDurationDays(task.isMilestone ? 0 : Math.max(1, diffDays));
      } else {
        setStartDate(nextEnd);
        setDurationDays(task.isMilestone ? 0 : 1);
      }
    }
  };

  const handleToggleResourceName = (resName: string) => {
    setResourceNames((prev) =>
      prev.includes(resName) ? prev.filter((r) => r !== resName) : [...prev, resName]
    );
  };

  const handleAddCustomResource = () => {
    const trimmed = customResourceInput.trim();
    if (!trimmed) return;
    if (!resourceNames.includes(trimmed)) {
      setResourceNames((prev) => [...prev, trimmed]);
    }
    setCustomResourceInput('');
  };

  const handleToggleSubprojectDay = (dayIndex: number) => {
    const current = effectiveSubprojectDays;
    let nextActive: number[];
    if (current.includes(dayIndex)) {
      if (current.length === 1) {
        alert('O Subprojeto precisa ter pelo menos 1 dia de atividade na semana.');
        return;
      }
      nextActive = current.filter((d) => d !== dayIndex);
    } else {
      nextActive = [...current, dayIndex].sort((a, b) => a - b);
    }
    setSubprojectActiveDays(nextActive);
  };

  const handleApplySubprojectPreset = (
    preset: 'inherit' | 'mon-fri' | 'tue-sat' | 'mon-sat' | 'all-7'
  ) => {
    if (preset === 'inherit') {
      setSubprojectActiveDays(undefined);
    } else if (preset === 'mon-fri') {
      setSubprojectActiveDays([1, 2, 3, 4, 5]);
    } else if (preset === 'tue-sat') {
      setSubprojectActiveDays([2, 3, 4, 5, 6]);
    } else if (preset === 'mon-sat') {
      setSubprojectActiveDays([1, 2, 3, 4, 5, 6]);
    } else if (preset === 'all-7') {
      setSubprojectActiveDays([0, 1, 2, 3, 4, 5, 6]);
    }
  };

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

  const handleToggleMasterComplete = () => {
    if (isSubproject) return;
    setLocalProgress((prev) => (prev === 100 ? 0 : 100));
  };

  const handleSave = () => {
    const finalName = taskName.trim() || task.name;
    if (isSubproject) {
      onUpdateTask(task.id, {
        name: finalName,
        notes,
        activeWeekDays: subprojectActiveDays,
      });
      onClose();
      return;
    }

    const newProgress = hasSubTasks
      ? Math.round((subTasks.filter((st) => st.done).length / subTasks.length) * 100)
      : localProgress;
    onUpdateTask(task.id, {
      name: finalName,
      startDate,
      endDate,
      durationDays: Math.max(0, durationDays),
      predecessorText: predecessorText.trim(),
      resourceNames,
      subTasks,
      progress: newProgress,
      notes,
      cost,
      baselineEndDate: baselineEndDate || undefined,
      baselineStartDate: baselineEndDate ? task.baselineStartDate || startDate : undefined,
    });
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleAddSubTask();
  };

  const effectiveTaskProgress = hasSubTasks ? computedProgress : localProgress;
  const progressColor =
    effectiveTaskProgress === 100 ? '#2e7d32' : effectiveTaskProgress >= 50 ? '#1976d2' : '#e65100';

  const activeDaysNames = WEEK_DAYS.filter((d) => effectiveSubprojectDays.includes(d.index)).map(
    (d) => d.name
  );
  const inactiveDaysNames = WEEK_DAYS.filter((d) => !effectiveSubprojectDays.includes(d.index)).map(
    (d) => d.name
  );

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleSave();
      }}
    >
      <div className="modal-window task-detail-modal">
        {/* Cabeçalho */}
        <div className="modal-titlebar">
          <div className="title-with-icon">
            {isSubproject ? <Layers size={18} /> : <CheckCircle2 size={18} />}
            <span>
              {isSubproject ? 'Detalhes e Calendário do Subprojeto' : 'Detalhe da Tarefa'}
            </span>
          </div>
          <button className="close-btn" onClick={handleSave} title="Fechar (salva automaticamente)">
            <X size={16} />
          </button>
        </div>

        <div className="modal-form-content task-detail-body">
          {/* Nome da Tarefa/Subprojeto como Título Real (Borderless) e Custo elegante */}
          <div className="task-detail-header">
            {isSubproject && (
              <div className="subproject-modal-kicker-row">
                <span className="subproject-modal-badge">
                  <Layers size={12} /> SUBPROJETO (AGRUPADOR EAP)
                </span>
                <span className="subproject-modal-subtitle">
                  {linkedSubtaskCount}{' '}
                  {linkedSubtaskCount === 1
                    ? 'subtarefa vinculada abaixo na hierarquia'
                    : 'subtarefas vinculadas abaixo na hierarquia'}
                </span>
              </div>
            )}

            <div className="task-title-header-row">
              <input
                type="text"
                className="task-title-input"
                value={taskName}
                onChange={(e) => setTaskName(e.target.value)}
                placeholder={isSubproject ? 'Nome do subprojeto...' : 'Nome da tarefa...'}
                title="Clique para editar o nome"
              />
              <div
                className="task-cost-badge"
                title={
                  isSubproject
                    ? 'Custo total agregado das subtarefas deste Subprojeto (R$)'
                    : 'Custo previsto da tarefa (R$)'
                }
              >
                <DollarSign size={13} className="cost-badge-icon" />
                <span className="cost-badge-prefix">R$</span>
                {isSubproject ? (
                  <span className="cost-badge-readonly">
                    {(task.cost ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                ) : (
                  <input
                    type="number"
                    min="0"
                    step="any"
                    className="cost-badge-input"
                    value={cost}
                    onChange={(e) => setCost(Math.max(0, parseFloat(e.target.value) || 0))}
                    placeholder="0,00"
                  />
                )}
              </div>
            </div>

            {/* Agrupamento de Metadados e Edição Direta de Cronograma / Recursos */}
            <div className="task-metadata-chips-bar">
              {isSubproject ? (
                <div className="meta-chip date-chip" title="Data de Início, Término e Duração consolidada das subtarefas">
                  <Calendar size={13} className="chip-icon" />
                  <span>
                    {formatDateBR(task.startDate)} ➔ {formatDateBR(task.endDate)} ({task.durationDays}d úteis)
                  </span>
                </div>
              ) : (
                <div className="meta-chip date-chip" title="Resumo do agendamento atual">
                  <Calendar size={13} className="chip-icon" />
                  <span>
                    {formatDateBR(startDate)} ➔ {formatDateBR(endDate)} ({durationDays}d úteis)
                  </span>
                </div>
              )}
              <div className="meta-chip eap-chip" title="Estrutura Analítica do Projeto (EAP / WBS)">
                <Layers size={13} className="chip-icon" />
                <span>
                  EAP: <strong>{task.wbsIndex || '—'}</strong>
                </span>
              </div>
              {!isSubproject && parentSubproject && (
                <div
                  className="meta-chip subproject-parent-chip"
                  title={`Vinculada ao Subprojeto "${parentSubproject.name}"`}
                >
                  <Layers size={13} className="chip-icon" />
                  <span>
                    Subprojeto: <strong>{parentSubproject.name}</strong> (
                    {formatActiveWeekDaysShort(inheritedActiveDays)})
                  </span>
                </div>
              )}
            </div>

            {!isSubproject && (
              <div className="task-detail-schedule-editor">
                <div className="schedule-fields-row">
                  <label className="schedule-field-group">
                    <span className="schedule-field-label">
                      <Calendar size={12} /> Início
                    </span>
                    <input
                      type="date"
                      className="schedule-field-input"
                      value={startDate}
                      onChange={(e) => handleModalStartDateChange(e.target.value)}
                    />
                  </label>
                  <label className="schedule-field-group">
                    <span className="schedule-field-label">
                      <Clock size={12} /> Duração (d úteis)
                    </span>
                    <input
                      type="number"
                      min="0"
                      className="schedule-field-input duration-input"
                      value={durationDays}
                      onChange={(e) => handleModalDurationChange(parseInt(e.target.value, 10) || 0)}
                    />
                  </label>
                  <label className="schedule-field-group">
                    <span className="schedule-field-label">
                      <Calendar size={12} /> Término
                    </span>
                    <input
                      type="date"
                      className="schedule-field-input"
                      value={endDate}
                      onChange={(e) => handleModalEndDateChange(e.target.value)}
                    />
                  </label>
                  <label className="schedule-field-group pred-group">
                    <span className="schedule-field-label">
                      <Link2 size={12} /> Predecessoras
                    </span>
                    <input
                      type="text"
                      className="schedule-field-input"
                      value={predecessorText}
                      onChange={(e) => setPredecessorText(e.target.value)}
                      placeholder="Ex: 2, 3FS+1d"
                    />
                  </label>
                </div>

                <div className="schedule-resources-row">
                  <span className="schedule-field-label">
                    <Users size={12} /> Recursos Atribuídos:
                  </span>
                  <div className="schedule-resources-pills">
                    {Array.from(
                      new Set([
                        ...resources.map((r) => r.name),
                        ...resourceNames,
                      ])
                    ).map((resName) => {
                      const isAssigned = resourceNames.includes(resName);
                      return (
                        <button
                          key={resName}
                          type="button"
                          className={`resource-toggle-pill ${isAssigned ? 'assigned' : ''}`}
                          onClick={() => handleToggleResourceName(resName)}
                          title={isAssigned ? `Remover ${resName}` : `Atribuir ${resName}`}
                        >
                          {isAssigned ? '✓ ' : '+ '}
                          {resName}
                        </button>
                      );
                    })}
                    <div className="resource-inline-add">
                      <input
                        type="text"
                        className="resource-inline-input"
                        value={customResourceInput}
                        onChange={(e) => setCustomResourceInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddCustomResource();
                          }
                        }}
                        placeholder="+ Novo recurso..."
                      />
                      {customResourceInput.trim() && (
                        <button
                          type="button"
                          className="resource-inline-btn"
                          onClick={handleAddCustomResource}
                          title="Adicionar recurso"
                        >
                          <Plus size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

            {/* Barra de Linha de Base (Teórico vs. Prático) */}
            <div className="task-detail-baseline-bar">
              <div className="baseline-bar-left">
                <Target size={14} className="baseline-bar-icon" />
                <span className="baseline-bar-label">Linha de Base (Data Fim Teórica):</span>
                {isSubproject ? (
                  <span className="baseline-subproject-readonly">
                    {task.baselineEndDate
                      ? `${formatDateBR(task.baselineStartDate || task.startDate)} ➔ ${formatDateBR(task.baselineEndDate)} (Consolidada das subtarefas)`
                      : 'Sem Linha de Base nas subtarefas'}
                  </span>
                ) : (
                  <div className="baseline-inline-controls">
                    <input
                      type="date"
                      className="baseline-date-input"
                      value={baselineEndDate}
                      onChange={(e) => setBaselineEndDate(e.target.value)}
                      title="Defina a Data Fim Base (teórica) para comparar com o término prático"
                    />
                    <button
                      type="button"
                      className="baseline-quick-btn"
                      onClick={() => setBaselineEndDate(endDate)}
                      title="Usar a Data de Término atual como Linha de Base"
                    >
                      Fixar Atual ({formatDateBR(endDate)})
                    </button>
                    {baselineEndDate && (
                      <button
                        type="button"
                        className="baseline-quick-btn clear"
                        onClick={() => setBaselineEndDate('')}
                        title="Remover Linha de Base desta tarefa"
                      >
                        Limpar
                      </button>
                    )}
                  </div>
                )}
              </div>

              {(() => {
                const effectiveBaseEnd = isSubproject ? task.baselineEndDate : baselineEndDate;
                if (!effectiveBaseEnd) return null;
                const v = getBaselineVarianceDays(
                  {
                    ...task,
                    startDate: isSubproject ? task.startDate : startDate,
                    endDate: isSubproject ? task.endDate : endDate,
                    baselineEndDate: effectiveBaseEnd,
                  },
                  effectiveSubprojectDays,
                  exceptions
                );
                if (v === null) return null;
                if (v === 0) {
                  return (
                    <span className="variance-pill on-track" title="Término prático exatamente igual à Linha de Base">
                      ✓ No prazo (0d de variação)
                    </span>
                  );
                }
                if (v < 0) {
                  return (
                    <span className="variance-pill ahead" title={`Adiantada em ${Math.abs(v)} dia(s) útil(eis) em relação à Linha de Base`}>
                      ⚡ {v}d úteis (Adiantada)
                    </span>
                  );
                }
                return (
                  <span className="variance-pill delayed" title={`Atraso de ${v} dia(s) útil(eis) em relação à Linha de Base`}>
                    ⚠️ +{v}d úteis (Desvio / Atraso)
                  </span>
                );
              })()}
            </div>

          <hr className="task-detail-divider" />

          {isSubproject ? (
            /* =========================================================
               MODO SUBPROJETO: CALENDÁRIO DE DIAS ATIVOS INDIVIDUAL
               ========================================================= */
            <>
              <div className="subtask-progress-area">
                <div className="subtask-progress-header">
                  <span className="progress-label">
                    Progresso consolidado do Subprojeto: <strong>{computedProgress}%</strong> (calculado a partir das{' '}
                    {linkedSubtaskCount} subtarefas)
                  </span>
                </div>
                <div className="progress-bar-track">
                  <div
                    className="progress-bar-fill"
                    style={{ width: `${computedProgress}%`, background: progressColor }}
                  />
                </div>
              </div>

              <div className="calendar-config-box subproject-calendar-config-box">
                <div className="calendar-header-row">
                  <div className="calendar-title">
                    <Clock size={16} className="text-primary" />
                    <strong>Calendário de Dias Úteis / Ativos deste Subprojeto</strong>
                  </div>
                  <div className="calendar-preset-buttons">
                    <button
                      type="button"
                      className={`btn-preset ${subprojectActiveDays === undefined ? 'active' : ''}`}
                      onClick={() => handleApplySubprojectPreset('inherit')}
                      title="Usar o mesmo calendário padrão do Projeto Macro"
                    >
                      Padrão ({formatActiveWeekDaysShort(inheritedActiveDays)})
                    </button>
                    <button
                      type="button"
                      className={`btn-preset ${subprojectActiveDays !== undefined && arraysEqual(effectiveSubprojectDays, [1, 2, 3, 4, 5]) ? 'active' : ''}`}
                      onClick={() => handleApplySubprojectPreset('mon-fri')}
                      title="Segunda a Sexta-feira úteis"
                    >
                      Seg–Sex
                    </button>
                    <button
                      type="button"
                      className={`btn-preset ${subprojectActiveDays !== undefined && arraysEqual(effectiveSubprojectDays, [2, 3, 4, 5, 6]) ? 'active' : ''}`}
                      onClick={() => handleApplySubprojectPreset('tue-sat')}
                      title="Terça a Sábado úteis"
                    >
                      Ter–Sáb
                    </button>
                    <button
                      type="button"
                      className={`btn-preset ${subprojectActiveDays !== undefined && arraysEqual(effectiveSubprojectDays, [1, 2, 3, 4, 5, 6]) ? 'active' : ''}`}
                      onClick={() => handleApplySubprojectPreset('mon-sat')}
                      title="Segunda a Sábado úteis (6 dias)"
                    >
                      Seg–Sáb (6d)
                    </button>
                    <button
                      type="button"
                      className={`btn-preset ${subprojectActiveDays !== undefined && effectiveSubprojectDays.length === 7 ? 'active' : ''}`}
                      onClick={() => handleApplySubprojectPreset('all-7')}
                      title="Todos os 7 dias úteis"
                    >
                      7 dias
                    </button>
                  </div>
                </div>

                <p className="calendar-description">
                  Configure de forma independente quais dias da semana são úteis para este{' '}
                  <strong>Subprojeto</strong> e todas as subtarefas vinculadas abaixo dele na EAP (ex.:{' '}
                  <em>Seg–Sex</em> ou <em>Ter–Sáb</em>).
                </p>

                <div className="weekdays-grid">
                  {WEEK_DAYS.map((day) => {
                    const isActive = effectiveSubprojectDays.includes(day.index);
                    return (
                      <button
                        key={day.index}
                        type="button"
                        className={`weekday-card ${isActive ? 'active-day' : 'inactive-day'}`}
                        onClick={() => handleToggleSubprojectDay(day.index)}
                      >
                        <div className="weekday-header">
                          <span className="weekday-short">{day.short}</span>
                          {isActive ? (
                            <Check size={14} className="icon-status active" />
                          ) : (
                            <Ban size={14} className="icon-status inactive" />
                          )}
                        </div>
                        <span className="weekday-full">{day.name}</span>
                        <span className="weekday-badge">{isActive ? 'Atividade' : 'Inativo'}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="calendar-summary">
                  <div className="summary-item">
                    <span className="summary-label">
                      🟢 Dias Ativos no Subprojeto ({activeDaysNames.length}):
                    </span>
                    <span className="summary-value active">{activeDaysNames.join(', ')}</span>
                  </div>
                  <div className="summary-item">
                    <span className="summary-label">
                      ⚪ Dias Inativos ({inactiveDaysNames.length}):
                    </span>
                    <span className="summary-value inactive">
                      {inactiveDaysNames.length > 0
                        ? inactiveDaysNames.join(', ')
                        : 'Nenhum (Ativo todos os dias)'}
                    </span>
                  </div>
                </div>

                <div className="subproject-global-exceptions-note">
                  <Info size={14} />
                  <span>
                    <strong>Escopo Global de Exceções:</strong> As Datas de Exceção (feriados, recessos e
                    emendas) permanecem globais e aplicam-se uniformemente ao projeto macro e a todos os
                    seus subprojetos.
                  </span>
                </div>
              </div>
            </>
          ) : (
            /* =========================================================
               MODO TAREFA EXECUTÁVEL: CONCLUSÃO & CHECKLIST DE SUB-TAREFAS
               ========================================================= */
            <>
              {!hasSubTasks ? (
                <div className="master-checkbox-area">
                  <p className="subtask-hint">
                    Esta tarefa não possui sub-tarefas. Você pode marcá-la como concluída diretamente ou adicionar um checklist abaixo.
                  </p>
                  <button
                    type="button"
                    className={`master-checkbox-btn ${localProgress === 100 ? 'completed' : ''}`}
                    onClick={handleToggleMasterComplete}
                    title={
                      localProgress === 100
                        ? 'Clique para desmarcar e voltar para Pendente (0%)'
                        : 'Marcar como 100% Concluída'
                    }
                  >
                    {localProgress === 100 ? (
                      <CheckSquare size={22} className="icon-done" />
                    ) : (
                      <Square size={22} className="icon-pending" />
                    )}
                    <span>
                      {localProgress === 100
                        ? 'Concluída (100%) — Clique para reabrir'
                        : 'Marcar como Concluída (100%)'}
                    </span>
                  </button>
                </div>
              ) : (
                <div className="subtask-progress-area">
                  <div className="subtask-progress-header">
                    <span className="progress-label">
                      Progresso: <strong>{computedProgress}%</strong> ({doneCount}/{subTasks.length}{' '}
                      sub-tarefas)
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
                  {hasSubTasks
                    ? `Checklist de Sub-tarefas (${doneCount}/${subTasks.length})`
                    : 'Adicionar Sub-tarefas'}
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
                          <div
                            className="subtask-drag-handle"
                            title="Clique e arraste para reordenar para cima ou para baixo"
                          >
                            <GripVertical size={16} />
                          </div>

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
            </>
          )}

          {/* Notas / Observações com Editor Híbrido Live Markdown / WYSIWYG */}
          <div className="notes-section-container">
            <div className="notes-header-row">
              <label className="notes-label">Notas / Observações:</label>
              <span
                className="notes-discovery-hint"
                title="Digite marcadores de Markdown para formatar na hora ou selecione um trecho de texto"
              >
                <Sparkles size={11} className="notes-hint-icon" />
                Suporta: <code># título</code>, <code>*negrito*</code>, <code>_sublinhado_</code>,{' '}
                <code>::destaque::</code>
              </span>
            </div>
            <HybridNotesEditor
              value={notes}
              onChange={setNotes}
              placeholder="Escreva notas ou observações... Suporta # títulos, *negrito*, _sublinhado_, ::destaque:: e listas."
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
