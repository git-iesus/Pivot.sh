import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Task,
  Resource,
  ProjectMetadata,
  ViewMode,
  ZoomLevel,
  CalendarException,
  NexoProjectState,
  NexoPhase,
  NexoRoleView,
} from './types/project';
import { defaultTasks, defaultResources, defaultMetadata } from './data/sampleProjects';
import {
  recalculateSchedule,
  toISODate,
  toWorkDay,
  addWorkDays,
  parseISODate,
  getWorkDaysDifference,
} from './utils/scheduler';
import { exportToXLSX, exportToCSV } from './utils/exportImport';
import { Ribbon } from './components/Ribbon/Ribbon';
import { Backstage } from './components/Ribbon/Backstage';
import { TaskSheet } from './components/TaskSheet/TaskSheet';
import { GanttChart } from './components/GanttChart/GanttChart';
import { ResourceSheetModal } from './components/ResourceSheet/ResourceSheetModal';
import { ProjectInfoModal } from './components/ProjectInfo/ProjectInfoModal';
import { StatusBar } from './components/StatusBar/StatusBar';
import { TaskDetailModal } from './components/TaskDetail/TaskDetailModal';
import { CostReportModal } from './components/CostReport/CostReportModal';
import { CalendarExceptionsModal } from './components/CalendarExceptions/CalendarExceptionsModal';
import { WeekView } from './components/WeekView/WeekView';
import { NexoPlugin, defaultNexoState } from './components/Nexo/NexoPlugin';
import { CheckCircle2 } from 'lucide-react';

export const App: React.FC = () => {
  // Metadados e Calendário Global (carregado primeiro para alimentar o motor de agendamento)
  const [metadata, setMetadata] = useState<ProjectMetadata>(() => {
    const saved = localStorage.getItem('ms_project_metadata');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return {
          ...defaultMetadata,
          ...parsed,
          activeWeekDays: parsed.activeWeekDays || [1, 2, 3, 4, 5],
          exceptions: parsed.exceptions || [],
        };
      } catch (e) {
        // fallback
      }
    }
    return { ...defaultMetadata, exceptions: defaultMetadata.exceptions || [] };
  });

  // Estado Principal de Tarefas (Sempre validado pelo motor de agendamento ao inicializar)
  const [tasks, setTasks] = useState<Task[]>(() => {
    const saved = localStorage.getItem('ms_project_tasks');
    const rawTasks: Task[] = saved ? JSON.parse(saved) : defaultTasks;
    const savedMeta = localStorage.getItem('ms_project_metadata');
    let activeDays = [1, 2, 3, 4, 5];
    let exceptions: CalendarException[] = [];
    if (savedMeta) {
      try {
        const parsedMeta = JSON.parse(savedMeta);
        activeDays = parsedMeta.activeWeekDays || [1, 2, 3, 4, 5];
        exceptions = parsedMeta.exceptions || [];
      } catch (e) {
        // fallback
      }
    }
    return recalculateSchedule(rawTasks, activeDays, exceptions);
  });

  const [resources, setResources] = useState<Resource[]>(() => {
    const saved = localStorage.getItem('ms_project_resources');
    return saved ? JSON.parse(saved) : defaultResources;
  });

  // Fonte Única da Verdade (Single Source of Truth) compartilhada entre Planilha e Gantt
  const scheduledTasks = useMemo(() => {
    const activeDays = metadata.activeWeekDays || [1, 2, 3, 4, 5];
    const exceptions = metadata.exceptions || [];
    return recalculateSchedule(tasks, activeDays, exceptions);
  }, [tasks, metadata.activeWeekDays, metadata.exceptions]);

  // Histórico de Desfazer/Refazer
  const [history, setHistory] = useState<Task[][]>([]);
  const [future, setFuture] = useState<Task[][]>([]);

  // Estados de Interface
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [currentTab, setCurrentTab] = useState<string>('tarefa');
  const [viewMode, setViewMode] = useState<ViewMode>('gantt');
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>('days');
  const [showCriticalPath, setShowCriticalPath] = useState<boolean>(true);
  const [showGridLines, setShowGridLines] = useState<boolean>(true);
  const [defaultTaskMode, setDefaultTaskMode] = useState<'manual' | 'auto'>('auto');

  // Modais
  const [isBackstageOpen, setIsBackstageOpen] = useState<boolean>(false);
  const [isResourceModalOpen, setIsResourceModalOpen] = useState<boolean>(false);
  const [isProjectInfoModalOpen, setIsProjectInfoModalOpen] = useState<boolean>(false);
  const [isCostReportOpen, setIsCostReportOpen] = useState<boolean>(false);
  const [isExceptionsModalOpen, setIsExceptionsModalOpen] = useState<boolean>(false);
  const [selectedDetailTaskId, setSelectedDetailTaskId] = useState<string | null>(null);

  // Estado do Plugin NEXO (persistido com Auto-Save no localStorage)
  const [nexoState, setNexoState] = useState<NexoProjectState>(() => {
    const saved = localStorage.getItem('ms_project_nexo');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return {
          ...defaultNexoState,
          ...parsed,
          activePhase: parsed.activePhase > 4 ? 4 : parsed.activePhase || 1,
          roleView: 'architect',
        };
      } catch (e) {
        // fallback
      }
    }
    return defaultNexoState;
  });

  // Alturas individuais das linhas estilo Excel
  const [rowHeights, setRowHeights] = useState<Record<string, number>>(() => {
    const saved = localStorage.getItem('ms_project_row_heights');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        // fallback
      }
    }
    return {};
  });

  const handleUpdateRowHeight = useCallback((taskId: string, height: number) => {
    setRowHeights((prev) => {
      const next = { ...prev, [taskId]: height };
      localStorage.setItem('ms_project_row_heights', JSON.stringify(next));
      return next;
    });
  }, []);

  // Divisor de Painéis (Splitter)
  const [splitWidth, setSplitWidth] = useState<number>(() => {
    return Math.floor(window.innerWidth * 0.44);
  });
  const isDraggingSplitter = useRef(false);

  // Sincronização de Scroll Vertical
  const taskSheetScrollRef = useRef<HTMLDivElement | null>(null);
  const ganttScrollRef = useRef<HTMLDivElement | null>(null);
  const isSyncingScroll = useRef(false);

  const handleScroll = (source: 'sheet' | 'gantt') => (e: React.UIEvent<HTMLDivElement>) => {
    if (isSyncingScroll.current) return;
    isSyncingScroll.current = true;

    const scrollTop = (e.target as HTMLDivElement).scrollTop;
    if (source === 'sheet' && ganttScrollRef.current) {
      ganttScrollRef.current.scrollTop = scrollTop;
    } else if (source === 'gantt' && taskSheetScrollRef.current) {
      taskSheetScrollRef.current.scrollTop = scrollTop;
    }

    setTimeout(() => {
      isSyncingScroll.current = false;
    }, 10);
  };

  // Status de Salvamento Automático (Estilo Google Sheets)
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving'>('saved');
  const [lastSavedTime, setLastSavedTime] = useState<string>(() => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  });
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimeoutRef = useRef<any>(null);
  const saveTimeoutRef = useRef<any>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage(null);
    }, 2800);
  }, []);

  // Salvar no localStorage com indicador em tempo real (Auto-save)
  const saveToStorage = useCallback((newTasks: Task[], newRes: Resource[], newMeta: ProjectMetadata) => {
    setSaveStatus('saving');
    localStorage.setItem('ms_project_tasks', JSON.stringify(newTasks));
    localStorage.setItem('ms_project_resources', JSON.stringify(newRes));
    localStorage.setItem('ms_project_metadata', JSON.stringify(newMeta));

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      setSaveStatus('saved');
      const now = new Date();
      const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      setLastSavedTime(timeStr);
    }, 400);
  }, []);

  const handleManualSave = useCallback(() => {
    saveToStorage(scheduledTasks, resources, metadata);
    showToast('Todas as alterações já foram salvas automaticamente!');
  }, [scheduledTasks, resources, metadata, saveToStorage, showToast]);

  // Atualizador com histórico de Undo (garantindo sincronia total via recalculateSchedule)
  const pushTaskState = useCallback(
    (newTasks: Task[], customActiveDays?: number[], customExceptions?: CalendarException[]) => {
      setHistory((prev) => [...prev.slice(-30), scheduledTasks]);
      setFuture([]);
      const activeDays = customActiveDays || metadata.activeWeekDays || [1, 2, 3, 4, 5];
      const exceptions = customExceptions !== undefined ? customExceptions : metadata.exceptions || [];
      const calculated = recalculateSchedule(newTasks, activeDays, exceptions);
      setTasks(calculated);
      saveToStorage(calculated, resources, metadata);
    },
    [scheduledTasks, resources, metadata, saveToStorage]
  );

  const handleUndo = () => {
    if (history.length === 0) return;
    const previous = history[history.length - 1];
    const activeDays = metadata.activeWeekDays || [1, 2, 3, 4, 5];
    const exceptions = metadata.exceptions || [];
    const calculatedPrev = recalculateSchedule(previous, activeDays, exceptions);
    setHistory((prev) => prev.slice(0, prev.length - 1));
    setFuture((prev) => [scheduledTasks, ...prev]);
    setTasks(calculatedPrev);
    saveToStorage(calculatedPrev, resources, metadata);
  };

  const handleRedo = () => {
    if (future.length === 0) return;
    const next = future[0];
    const activeDays = metadata.activeWeekDays || [1, 2, 3, 4, 5];
    const exceptions = metadata.exceptions || [];
    const calculatedNext = recalculateSchedule(next, activeDays, exceptions);
    setFuture((prev) => prev.slice(1));
    setHistory((prev) => [...prev, scheduledTasks]);
    setTasks(calculatedNext);
    saveToStorage(calculatedNext, resources, metadata);
  };

  // Ações de Tarefas (centralizadas no motor de agendamento)
  const handleUpdateTask = (taskId: string, updates: Partial<Task>) => {
    const activeDays = metadata.activeWeekDays || [1, 2, 3, 4, 5];
    const exceptions = metadata.exceptions || [];

    const updated = scheduledTasks.map((t) => {
      if (t.id !== taskId) return t;
      const merged = { ...t, ...updates };

      // Se o usuário editou a Data de Término diretamente na planilha, sincroniza a Duração em dias úteis
      if (updates.endDate && updates.durationDays === undefined && !t.isSummary) {
        const start = parseISODate(merged.startDate);
        const end = parseISODate(updates.endDate);
        if (end >= start) {
          const diffDays = getWorkDaysDifference(start, end, activeDays, exceptions);
          merged.durationDays = t.isMilestone ? 0 : Math.max(1, diffDays);
        }
      }
      return merged;
    });
    pushTaskState(updated);
  };

  const handleUpdateExceptions = (newExceptions: CalendarException[]) => {
    const activeDays = metadata.activeWeekDays || [1, 2, 3, 4, 5];
    const updatedMeta: ProjectMetadata = {
      ...metadata,
      exceptions: newExceptions,
    };
    setMetadata(updatedMeta);
    const recalculated = recalculateSchedule(scheduledTasks, activeDays, newExceptions);
    setTasks(recalculated);
    saveToStorage(recalculated, resources, updatedMeta);
    showToast('Cronograma atualizado com as Datas de Exceção!');
  };

  const handleAddTask = () => {
    const activeDays = metadata.activeWeekDays || [1, 2, 3, 4, 5];
    const exceptions = metadata.exceptions || [];
    const now = toWorkDay(new Date(), activeDays, exceptions);
    const startStr = toISODate(now);
    const endStr = toISODate(addWorkDays(now, 1, activeDays, exceptions));

    const selectedIndex = scheduledTasks.findIndex((t) => t.id === selectedTaskId);
    const parentLevel = selectedIndex >= 0 ? scheduledTasks[selectedIndex].outlineLevel : 0;

    const newTask: Task = {
      id: `task_${Date.now()}`,
      wbsIndex: '',
      name: 'Nova Tarefa',
      durationDays: 1,
      startDate: startStr,
      endDate: endStr,
      progress: 0,
      mode: defaultTaskMode,
      predecessorText: '',
      resourceNames: [],
      outlineLevel: parentLevel,
      isSummary: false,
      isMilestone: false,
      cost: 0,
    };

    let newTasks: Task[];
    if (selectedIndex >= 0) {
      newTasks = [
        ...scheduledTasks.slice(0, selectedIndex + 1),
        newTask,
        ...scheduledTasks.slice(selectedIndex + 1),
      ];
    } else {
      newTasks = [...scheduledTasks, newTask];
    }

    pushTaskState(newTasks);
    setSelectedTaskId(newTask.id);
  };

  const handleAddMilestone = () => {
    const activeDays = metadata.activeWeekDays || [1, 2, 3, 4, 5];
    const exceptions = metadata.exceptions || [];
    const today = toWorkDay(new Date(), activeDays, exceptions);
    const dateStr = toISODate(today);

    const newTask: Task = {
      id: `mstone_${Date.now()}`,
      wbsIndex: '',
      name: 'Novo Marco',
      durationDays: 0,
      startDate: dateStr,
      endDate: dateStr,
      progress: 0,
      mode: 'auto',
      predecessorText: '',
      resourceNames: [],
      outlineLevel: 1,
      isSummary: false,
      isMilestone: true,
      cost: 0,
    };
    pushTaskState([...scheduledTasks, newTask]);
    setSelectedTaskId(newTask.id);
  };

  const handleAddSummaryTask = () => {
    const activeDays = metadata.activeWeekDays || [1, 2, 3, 4, 5];
    const exceptions = metadata.exceptions || [];
    const today = toWorkDay(new Date(), activeDays, exceptions);
    const dateStr = toISODate(today);

    const newTask: Task = {
      id: `sum_${Date.now()}`,
      wbsIndex: '',
      name: 'Nova Fase / Tarefa Resumo',
      durationDays: 5,
      startDate: dateStr,
      endDate: toISODate(addWorkDays(today, 5, activeDays, exceptions)),
      progress: 0,
      mode: 'auto',
      predecessorText: '',
      resourceNames: [],
      outlineLevel: 0,
      isSummary: true,
      isMilestone: false,
      cost: 0,
    };
    pushTaskState([...scheduledTasks, newTask]);
    setSelectedTaskId(newTask.id);
  };

  const handleDeleteSelected = () => {
    if (!selectedTaskId) return;
    const newTasks = scheduledTasks.filter((t) => t.id !== selectedTaskId);
    pushTaskState(newTasks);
    setSelectedTaskId(null);
  };

  const handleIndentTask = () => {
    if (!selectedTaskId) return;
    const newTasks = scheduledTasks.map((t) =>
      t.id === selectedTaskId ? { ...t, outlineLevel: Math.min(5, t.outlineLevel + 1) } : t
    );
    pushTaskState(newTasks);
  };

  const handleOutdentTask = () => {
    if (!selectedTaskId) return;
    const newTasks = scheduledTasks.map((t) =>
      t.id === selectedTaskId ? { ...t, outlineLevel: Math.max(0, t.outlineLevel - 1) } : t
    );
    pushTaskState(newTasks);
  };

  const handleLinkTasks = () => {
    if (!selectedTaskId) return;
    const idx = scheduledTasks.findIndex((t) => t.id === selectedTaskId);
    if (idx > 0) {
      const predId = idx; // Tarefa anterior (1-based)
      const current = scheduledTasks[idx];
      const newPreds = current.predecessorText
        ? `${current.predecessorText}, ${predId}`
        : `${predId}`;
      handleUpdateTask(selectedTaskId, { predecessorText: newPreds });
    }
  };

  const handleUnlinkTasks = () => {
    if (!selectedTaskId) return;
    handleUpdateTask(selectedTaskId, { predecessorText: '' });
  };

  const handleSetProgress = (progress: number) => {
    if (!selectedTaskId) return;
    handleUpdateTask(selectedTaskId, { progress });
  };

  const handleSetTaskMode = (mode: 'manual' | 'auto') => {
    setDefaultTaskMode(mode);
    if (selectedTaskId) {
      handleUpdateTask(selectedTaskId, { mode });
    }
  };

  // Exportação e Importação
  const handleExportXLSX = () => {
    exportToXLSX(scheduledTasks, resources, metadata);
  };

  const handleExportCSV = () => {
    exportToCSV(scheduledTasks, metadata);
  };

  const handleExportJSON = () => {
    const jsonData = JSON.stringify({ metadata, resources, tasks: scheduledTasks }, null, 2);
    const blob = new Blob([jsonData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${metadata.title || 'projeto'}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportJSON = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e: any) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const parsed = JSON.parse(event.target?.result as string);
          if (parsed.tasks) {
            const nextMeta: ProjectMetadata = parsed.metadata
              ? {
                  ...defaultMetadata,
                  ...parsed.metadata,
                  activeWeekDays: parsed.metadata.activeWeekDays || [1, 2, 3, 4, 5],
                  exceptions: parsed.metadata.exceptions || [],
                }
              : metadata;
            const recalculated = recalculateSchedule(
              parsed.tasks,
              nextMeta.activeWeekDays || [1, 2, 3, 4, 5],
              nextMeta.exceptions || []
            );
            setTasks(recalculated);
            if (parsed.resources) setResources(parsed.resources);
            if (parsed.metadata) setMetadata(nextMeta);
            saveToStorage(recalculated, parsed.resources || resources, nextMeta);
            setIsBackstageOpen(false);
            showToast('Projeto importado com sucesso!');
          }
        } catch (err) {
          showToast('Erro ao carregar arquivo JSON.');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const handleNewProject = () => {
    if (confirm('Deseja iniciar um novo projeto? As alterações atuais serão salvas como cópia.')) {
      setTasks([]);
      setSelectedTaskId(null);
      saveToStorage([], resources, metadata);
      setIsBackstageOpen(false);
      showToast('Novo projeto iniciado.');
    }
  };

  // Atualizador do Plugin NEXO com Auto-Save
  const handleUpdateNexoState = useCallback(
    (next: NexoProjectState) => {
      setSaveStatus('saving');
      setNexoState(next);
      localStorage.setItem('ms_project_nexo', JSON.stringify(next));
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        setSaveStatus('saved');
        const now = new Date();
        const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        setLastSavedTime(timeStr);
      }, 350);
    },
    []
  );

  const handleStartNewNexoProject = useCallback(() => {
    handleUpdateNexoState({
      pointB: {
        deliverable: '',
        successMetric: '',
        targetDate: '',
        isCalibrated: false,
      },
      milestones: [],
      reachedPointA: false,
      logicValidated: false,
      ignitionApproved: false,
      activePhase: 1,
      roleView: 'architect',
      isFocusModeNewProject: true,
      retrospectives: nexoState.retrospectives || [],
    });
    showToast('Calibrador de Foco ativado: defina seu Ponto B.');
  }, [handleUpdateNexoState, nexoState.retrospectives, showToast]);

  const handleSelectNexoPhase = useCallback(
    (phase: NexoPhase) => {
      handleUpdateNexoState({
        ...nexoState,
        activePhase: phase,
        roleView: 'architect',
      });
    },
    [handleUpdateNexoState, nexoState]
  );

  const handleToggleNexoRoleView = useCallback(
    (role: NexoRoleView) => {
      handleUpdateNexoState({
        ...nexoState,
        roleView: role,
      });
    },
    [handleUpdateNexoState, nexoState]
  );

  // Sincroniza os Milestones da Arquitetura Nexo para a Planilha / Gráfico de Gantt
  const handleSyncNexoToGantt = useCallback(
    (stateToSync?: NexoProjectState) => {
      const targetState = stateToSync || nexoState;
      if (targetState.milestones.length === 0) {
        showToast('Adicione pelo menos 1 Milestone no Nexo para enviar ao Gantt.');
        return;
      }
      const activeDays = metadata.activeWeekDays || [1, 2, 3, 4, 5];
      const exceptions = metadata.exceptions || [];
      const today = toWorkDay(new Date(), activeDays, exceptions);

      // Cria uma tarefa resumo com o Ponto B + subtarefas encadeadas na ordem cronológica A → B
      const summaryId = `nexo_sum_${Date.now()}`;
      const summaryTask: Task = {
        id: summaryId,
        wbsIndex: '',
        name: `[NEXO Ponto B] ${targetState.pointB.deliverable || 'Projeto Nexo'}`,
        durationDays: 1,
        startDate: toISODate(today),
        endDate: targetState.pointB.targetDate || toISODate(today),
        progress: 0,
        mode: 'auto',
        predecessorText: '',
        resourceNames: [],
        outlineLevel: 0,
        isSummary: true,
        isMilestone: false,
        cost: 0,
        notes: `Métrica de Sucesso: ${targetState.pointB.successMetric || '-'}`,
      };

      const baseRowNumber = scheduledTasks.length + 2; // +1 para summary, +1 para 1-based index
      const generatedTasks: Task[] = targetState.milestones.map((m, idx) => {
        const dur = Math.max(1, m.leadTimeDays || 1);
        const endDt = m.deadline ? parseISODate(m.deadline) : addWorkDays(today, dur, activeDays, exceptions);
        const startDt = addWorkDays(endDt, -(dur - 1), activeDays, exceptions);
        const predText = idx > 0 ? String(baseRowNumber + idx - 1) : '';
        return {
          id: `nexo_task_${m.id}_${Date.now()}`,
          wbsIndex: '',
          name: m.title,
          durationDays: dur,
          startDate: toISODate(startDt),
          endDate: toISODate(endDt),
          progress: m.completed ? 100 : 0,
          mode: 'auto',
          predecessorText: predText,
          resourceNames: m.owner ? [m.owner] : [],
          outlineLevel: 1,
          isSummary: false,
          isMilestone: false,
          cost: Number(m.budget) || 0,
          notes: m.resources ? `Recursos Nexo: ${m.resources}` : undefined,
          subTasks: m.checklist.map((c) => ({
            id: c.id,
            title: c.text,
            done: c.done,
          })),
        };
      });

      pushTaskState([...scheduledTasks, summaryTask, ...generatedTasks]);
      setViewMode('gantt');
      showToast(`${generatedTasks.length} Milestones do Nexo sincronizados no Gráfico de Gantt!`);
    },
    [nexoState, metadata.activeWeekDays, metadata.exceptions, scheduledTasks, pushTaskState, showToast]
  );

  // Redimensionamento do Splitter
  const handleMouseDownSplitter = () => {
    isDraggingSplitter.current = true;
    document.body.style.cursor = 'col-resize';
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingSplitter.current) return;
      const newWidth = Math.max(300, Math.min(window.innerWidth - 300, e.clientX));
      setSplitWidth(newWidth);
    };

    const handleMouseUp = () => {
      if (isDraggingSplitter.current) {
        isDraggingSplitter.current = false;
        document.body.style.cursor = 'default';
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  // Atalhos de teclado
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleManualSave();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        handleUndo();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo, handleManualSave]);

  const selectedTaskObj = scheduledTasks.find((t) => t.id === selectedTaskId);

  return (
    <div className="ms-project-app">
      {/* Faixa de Opções (Ribbon) Estilo Office 2010 */}
      <Ribbon
        saveStatus={saveStatus}
        lastSavedTime={lastSavedTime}
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        viewMode={viewMode}
        setViewMode={setViewMode}
        zoomLevel={zoomLevel}
        setZoomLevel={setZoomLevel}
        showCriticalPath={showCriticalPath}
        setShowCriticalPath={setShowCriticalPath}
        showGridLines={showGridLines}
        setShowGridLines={setShowGridLines}
        onOpenBackstage={() => setIsBackstageOpen(true)}
        onSave={handleManualSave}
        onUndo={handleUndo}
        onRedo={handleRedo}
        canUndo={history.length > 0}
        canRedo={future.length > 0}
        onAddTask={handleAddTask}
        onAddMilestone={handleAddMilestone}
        onAddSummaryTask={handleAddSummaryTask}
        onDeleteSelected={handleDeleteSelected}
        onIndentTask={handleIndentTask}
        onOutdentTask={handleOutdentTask}
        onLinkTasks={handleLinkTasks}
        onUnlinkTasks={handleUnlinkTasks}
        onSetProgress={handleSetProgress}
        onSetTaskMode={handleSetTaskMode}
        onOpenExceptionsModal={() => setIsExceptionsModalOpen(true)}
        exceptionsCount={(metadata.exceptions || []).length}
        onOpenResourceSheet={() => setIsResourceModalOpen(true)}
        onOpenCostReport={() => setIsCostReportOpen(true)}
        selectedTaskId={selectedTaskId}
        nexoActivePhase={nexoState.activePhase}
        nexoRoleView={nexoState.roleView}
        onSelectNexoPhase={handleSelectNexoPhase}
        onToggleNexoRoleView={handleToggleNexoRoleView}
        onStartNewNexoProject={handleStartNewNexoProject}
        onSyncNexoToGantt={handleSyncNexoToGantt}
      />

      {/* Área Principal de Trabalho (Split Panes: Planilha de Tarefas, Gráfico de Gantt, Minha Semana ou Plugin Nexo) */}
      <div className="workspace-container">
        {viewMode === 'nexo' ? (
          <NexoPlugin
            nexoState={nexoState}
            onUpdateNexoState={handleUpdateNexoState}
            resources={resources}
            activeWeekDays={metadata.activeWeekDays || [1, 2, 3, 4, 5]}
            exceptions={metadata.exceptions || []}
            onSyncToGantt={handleSyncNexoToGantt}
          />
        ) : viewMode === 'gantt' ? (
          <>
            <div className="sheet-pane" style={{ width: `${splitWidth}px` }}>
              <TaskSheet
                tasks={scheduledTasks}
                resources={resources}
                selectedTaskId={selectedTaskId}
                onSelectTask={setSelectedTaskId}
                onUpdateTask={handleUpdateTask}
                onToggleCollapse={(id) => {
                  const t = scheduledTasks.find((item) => item.id === id);
                  if (t) handleUpdateTask(id, { collapsed: !t.collapsed });
                }}
                onAddTask={handleAddTask}
                onOpenTaskDetail={(id) => setSelectedDetailTaskId(id)}
                rowHeights={rowHeights}
                onUpdateRowHeight={handleUpdateRowHeight}
                scrollTop={0}
                onScroll={handleScroll('sheet')}
                scrollRef={taskSheetScrollRef}
              />
            </div>

            <div className="splitter-handle" onMouseDown={handleMouseDownSplitter}>
              <div className="splitter-bar"></div>
            </div>

            <div className="gantt-pane">
              <GanttChart
                tasks={scheduledTasks}
                zoomLevel={zoomLevel}
                showCriticalPath={showCriticalPath}
                showGridLines={showGridLines}
                selectedTaskId={selectedTaskId}
                onSelectTask={setSelectedTaskId}
                rowHeights={rowHeights}
                scrollTop={0}
                onScroll={handleScroll('gantt')}
                scrollRef={ganttScrollRef}
                activeWeekDays={metadata.activeWeekDays || [1, 2, 3, 4, 5]}
                exceptions={metadata.exceptions || []}
              />
            </div>
          </>
        ) : viewMode === 'week' ? (
          <>
            <div className="sheet-pane" style={{ width: `${splitWidth}px` }}>
              <TaskSheet
                tasks={scheduledTasks}
                resources={resources}
                selectedTaskId={selectedTaskId}
                onSelectTask={setSelectedTaskId}
                onUpdateTask={handleUpdateTask}
                onToggleCollapse={(id) => {
                  const t = scheduledTasks.find((item) => item.id === id);
                  if (t) handleUpdateTask(id, { collapsed: !t.collapsed });
                }}
                onAddTask={handleAddTask}
                onOpenTaskDetail={(id) => setSelectedDetailTaskId(id)}
                rowHeights={rowHeights}
                onUpdateRowHeight={handleUpdateRowHeight}
                scrollTop={0}
                onScroll={() => {}}
                scrollRef={taskSheetScrollRef}
              />
            </div>

            <div className="splitter-handle" onMouseDown={handleMouseDownSplitter}>
              <div className="splitter-bar"></div>
            </div>

            <div className="gantt-pane">
              <WeekView
                tasks={scheduledTasks}
                activeWeekDays={metadata.activeWeekDays || [1, 2, 3, 4, 5]}
                exceptions={metadata.exceptions || []}
                selectedTaskId={selectedTaskId}
                onSelectTask={setSelectedTaskId}
                onOpenTaskDetail={(id) => setSelectedDetailTaskId(id)}
              />
            </div>
          </>
        ) : (
          <div className="sheet-pane-fullscreen">
            <TaskSheet
              tasks={scheduledTasks}
              resources={resources}
              selectedTaskId={selectedTaskId}
              onSelectTask={setSelectedTaskId}
              onUpdateTask={handleUpdateTask}
              onToggleCollapse={(id) => {
                const t = scheduledTasks.find((item) => item.id === id);
                if (t) handleUpdateTask(id, { collapsed: !t.collapsed });
              }}
              onAddTask={handleAddTask}
              onOpenTaskDetail={(id) => setSelectedDetailTaskId(id)}
              rowHeights={rowHeights}
              onUpdateRowHeight={handleUpdateRowHeight}
              scrollTop={0}
              onScroll={() => {}}
              scrollRef={taskSheetScrollRef}
            />
          </div>
        )}
      </div>

      {/* Barra de Status Inferior do Office 2010 */}
      <StatusBar
        saveStatus={saveStatus}
        lastSavedTime={lastSavedTime}
        taskCount={scheduledTasks.length}
        selectedTaskId={selectedTaskId}
        taskMode={defaultTaskMode}
        onToggleTaskMode={() =>
          setDefaultTaskMode(defaultTaskMode === 'auto' ? 'manual' : 'auto')
        }
        viewMode={viewMode}
        setViewMode={setViewMode}
        zoomLevel={zoomLevel}
        setZoomLevel={setZoomLevel}
      />

      {/* Modais do Sistema */}
      <Backstage
        isOpen={isBackstageOpen}
        onClose={() => setIsBackstageOpen(false)}
        metadata={metadata}
        tasks={scheduledTasks}
        resources={resources}
        onNewProject={handleNewProject}
        onSaveProject={() => {
          handleManualSave();
          setIsBackstageOpen(false);
        }}
        onExportXLSX={handleExportXLSX}
        onExportCSV={handleExportCSV}
        onExportJSON={handleExportJSON}
        onImportJSON={handleImportJSON}
        onOpenProjectInfo={() => {
          setIsBackstageOpen(false);
          setIsProjectInfoModalOpen(true);
        }}
      />

      <ResourceSheetModal
        isOpen={isResourceModalOpen}
        onClose={() => setIsResourceModalOpen(false)}
        resources={resources}
        onUpdateResources={(updated) => {
          setResources(updated);
          saveToStorage(scheduledTasks, updated, metadata);
        }}
      />

      <ProjectInfoModal
        isOpen={isProjectInfoModalOpen}
        onClose={() => setIsProjectInfoModalOpen(false)}
        metadata={metadata}
        onUpdateMetadata={(updated) => {
          const mergedMeta: ProjectMetadata = {
            ...updated,
            exceptions: updated.exceptions || metadata.exceptions || [],
          };
          setMetadata(mergedMeta);
          const activeDays = mergedMeta.activeWeekDays || [1, 2, 3, 4, 5];
          const recalculated = recalculateSchedule(scheduledTasks, activeDays, mergedMeta.exceptions || []);
          setTasks(recalculated);
          saveToStorage(recalculated, resources, mergedMeta);
        }}
      />

      <CalendarExceptionsModal
        isOpen={isExceptionsModalOpen}
        onClose={() => setIsExceptionsModalOpen(false)}
        exceptions={metadata.exceptions || []}
        onUpdateExceptions={handleUpdateExceptions}
        defaultDate={selectedTaskObj?.startDate || metadata.startDate || '2026-10-16'}
      />

      <TaskDetailModal
        task={scheduledTasks.find((t) => t.id === selectedDetailTaskId) || null}
        isOpen={selectedDetailTaskId !== null}
        onClose={() => setSelectedDetailTaskId(null)}
        onUpdateTask={handleUpdateTask}
      />

      <CostReportModal
        isOpen={isCostReportOpen}
        onClose={() => setIsCostReportOpen(false)}
        tasks={scheduledTasks}
        resources={resources}
        metadata={metadata}
      />

      {/* Notificação Toast Estilo Google Sheets */}
      {toastMessage && (
        <div className="office-toast-notification">
          <CheckCircle2 size={16} className="toast-icon" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
};

export default App;
