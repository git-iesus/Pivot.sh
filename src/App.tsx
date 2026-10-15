import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Task, Resource, ProjectMetadata, ViewMode, ZoomLevel } from './types/project';
import { defaultTasks, defaultResources, defaultMetadata } from './data/sampleProjects';
import { recalculateSchedule, toISODate, toWorkDay, addWorkDays } from './utils/scheduler';
import { exportToXLSX, exportToCSV } from './utils/exportImport';
import { Ribbon } from './components/Ribbon/Ribbon';
import { Backstage } from './components/Ribbon/Backstage';
import { TaskSheet } from './components/TaskSheet/TaskSheet';
import { GanttChart } from './components/GanttChart/GanttChart';
import { ResourceSheetModal } from './components/ResourceSheet/ResourceSheetModal';
import { ProjectInfoModal } from './components/ProjectInfo/ProjectInfoModal';
import { StatusBar } from './components/StatusBar/StatusBar';
import { TaskDetailModal } from './components/TaskDetail/TaskDetailModal';
import { WeekView } from './components/WeekView/WeekView';

export const App: React.FC = () => {
  // Estado Principal
  const [tasks, setTasks] = useState<Task[]>(() => {
    const saved = localStorage.getItem('ms_project_tasks');
    return saved ? JSON.parse(saved) : defaultTasks;
  });

  const [resources, setResources] = useState<Resource[]>(() => {
    const saved = localStorage.getItem('ms_project_resources');
    return saved ? JSON.parse(saved) : defaultResources;
  });

  const [metadata, setMetadata] = useState<ProjectMetadata>(() => {
    const saved = localStorage.getItem('ms_project_metadata');
    return saved ? JSON.parse(saved) : defaultMetadata;
  });

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
  const [selectedDetailTaskId, setSelectedDetailTaskId] = useState<string | null>(null);

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

  // Salvar no localStorage
  const saveToStorage = useCallback((newTasks: Task[], newRes: Resource[], newMeta: ProjectMetadata) => {
    localStorage.setItem('ms_project_tasks', JSON.stringify(newTasks));
    localStorage.setItem('ms_project_resources', JSON.stringify(newRes));
    localStorage.setItem('ms_project_metadata', JSON.stringify(newMeta));
  }, []);

  // Atualizador com histórico de Undo
  const pushTaskState = useCallback((newTasks: Task[], customActiveDays?: number[]) => {
    setHistory((prev) => [...prev.slice(-30), tasks]);
    setFuture([]);
    const activeDays = customActiveDays || metadata.activeWeekDays || [1, 2, 3, 4, 5];
    const calculated = recalculateSchedule(newTasks, activeDays);
    setTasks(calculated);
    saveToStorage(calculated, resources, metadata);
  }, [tasks, resources, metadata, saveToStorage]);

  const handleUndo = () => {
    if (history.length === 0) return;
    const previous = history[history.length - 1];
    setHistory((prev) => prev.slice(0, prev.length - 1));
    setFuture((prev) => [tasks, ...prev]);
    setTasks(previous);
    saveToStorage(previous, resources, metadata);
  };

  const handleRedo = () => {
    if (future.length === 0) return;
    const next = future[0];
    setFuture((prev) => prev.slice(1));
    setHistory((prev) => [...prev, tasks]);
    setTasks(next);
    saveToStorage(next, resources, metadata);
  };

  // Ações de Tarefas
  const handleUpdateTask = (taskId: string, updates: Partial<Task>) => {
    const updated = tasks.map((t) => (t.id === taskId ? { ...t, ...updates } : t));
    pushTaskState(updated);
  };

  const handleAddTask = () => {
    const activeDays = metadata.activeWeekDays || [1, 2, 3, 4, 5];
    const now = new Date();
    const startStr = toISODate(now);
    const endStr = toISODate(addWorkDays(now, 1, activeDays));

    const selectedIndex = tasks.findIndex((t) => t.id === selectedTaskId);
    const parentLevel = selectedIndex >= 0 ? tasks[selectedIndex].outlineLevel : 0;

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
    };

    let newTasks: Task[];
    if (selectedIndex >= 0) {
      newTasks = [...tasks.slice(0, selectedIndex + 1), newTask, ...tasks.slice(selectedIndex + 1)];
    } else {
      newTasks = [...tasks, newTask];
    }

    pushTaskState(newTasks);
    setSelectedTaskId(newTask.id);
  };

  const handleAddMilestone = () => {
    const activeDays = metadata.activeWeekDays || [1, 2, 3, 4, 5];
    const today = toWorkDay(new Date(), activeDays);
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
    };
    pushTaskState([...tasks, newTask]);
    setSelectedTaskId(newTask.id);
  };

  const handleAddSummaryTask = () => {
    const activeDays = metadata.activeWeekDays || [1, 2, 3, 4, 5];
    const today = toWorkDay(new Date(), activeDays);
    const dateStr = toISODate(today);

    const newTask: Task = {
      id: `sum_${Date.now()}`,
      wbsIndex: '',
      name: 'Nova Fase / Tarefa Resumo',
      durationDays: 5,
      startDate: dateStr,
      endDate: toISODate(addWorkDays(today, 5, activeDays)),
      progress: 0,
      mode: 'auto',
      predecessorText: '',
      resourceNames: [],
      outlineLevel: 0,
      isSummary: true,
      isMilestone: false,
    };
    pushTaskState([...tasks, newTask]);
    setSelectedTaskId(newTask.id);
  };

  const handleDeleteSelected = () => {
    if (!selectedTaskId) return;
    const newTasks = tasks.filter((t) => t.id !== selectedTaskId);
    pushTaskState(newTasks);
    setSelectedTaskId(null);
  };

  const handleIndentTask = () => {
    if (!selectedTaskId) return;
    const newTasks = tasks.map((t) =>
      t.id === selectedTaskId ? { ...t, outlineLevel: Math.min(5, t.outlineLevel + 1) } : t
    );
    pushTaskState(newTasks);
  };

  const handleOutdentTask = () => {
    if (!selectedTaskId) return;
    const newTasks = tasks.map((t) =>
      t.id === selectedTaskId ? { ...t, outlineLevel: Math.max(0, t.outlineLevel - 1) } : t
    );
    pushTaskState(newTasks);
  };

  const handleLinkTasks = () => {
    if (!selectedTaskId) return;
    const idx = tasks.findIndex((t) => t.id === selectedTaskId);
    if (idx > 0) {
      const predId = idx; // Tarefa anterior (1-based)
      const current = tasks[idx];
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

  const handleSetBaseline = () => {
    const updated = tasks.map((t) => ({
      ...t,
      baselineStartDate: t.startDate,
      baselineEndDate: t.endDate,
      baselineDurationDays: t.durationDays,
    }));
    pushTaskState(updated);
    alert('Linha de Base 0 definida com sucesso para todas as tarefas do projeto!');
  };

  // Exportação e Importação
  const handleExportXLSX = () => {
    exportToXLSX(tasks, resources, metadata);
  };

  const handleExportCSV = () => {
    exportToCSV(tasks, metadata);
  };

  const handleExportJSON = () => {
    const jsonData = JSON.stringify({ metadata, resources, tasks }, null, 2);
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
            setTasks(recalculateSchedule(parsed.tasks));
            if (parsed.resources) setResources(parsed.resources);
            if (parsed.metadata) setMetadata(parsed.metadata);
            saveToStorage(parsed.tasks, parsed.resources || resources, parsed.metadata || metadata);
            setIsBackstageOpen(false);
          }
        } catch (err) {
          alert('Erro ao carregar arquivo JSON.');
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
      setIsBackstageOpen(false);
    }
  };

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
        saveToStorage(tasks, resources, metadata);
        alert('Projeto salvo com sucesso!');
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
  }, [tasks, resources, metadata, saveToStorage]);

  return (
    <div className="ms-project-app">
      {/* Faixa de Opções (Ribbon) Estilo Office 2010 */}
      <Ribbon
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
        onSave={() => {
          saveToStorage(tasks, resources, metadata);
          alert('Projeto salvo com sucesso!');
        }}
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
        onOpenResourceSheet={() => setIsResourceModalOpen(true)}
        onOpenProjectInfo={() => setIsProjectInfoModalOpen(true)}
        onSetBaseline={handleSetBaseline}
        selectedTaskId={selectedTaskId}
      />

      {/* Área Principal de Trabalho (Split Panes: Planilha de Tarefas e Gráfico de Gantt ou Minha Semana) */}
      <div className="workspace-container">
        {viewMode === 'gantt' ? (
          <>
            <div className="sheet-pane" style={{ width: `${splitWidth}px` }}>
              <TaskSheet
                tasks={tasks}
                resources={resources}
                selectedTaskId={selectedTaskId}
                onSelectTask={setSelectedTaskId}
                onUpdateTask={handleUpdateTask}
                onToggleCollapse={(id) => {
                  const t = tasks.find((item) => item.id === id);
                  if (t) handleUpdateTask(id, { collapsed: !t.collapsed });
                }}
                onAddTask={handleAddTask}
                onOpenTaskDetail={(id) => setSelectedDetailTaskId(id)}
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
                tasks={tasks}
                zoomLevel={zoomLevel}
                showCriticalPath={showCriticalPath}
                showGridLines={showGridLines}
                selectedTaskId={selectedTaskId}
                onSelectTask={setSelectedTaskId}
                scrollTop={0}
                onScroll={handleScroll('gantt')}
                scrollRef={ganttScrollRef}
                activeWeekDays={metadata.activeWeekDays || [1, 2, 3, 4, 5]}
              />
            </div>
          </>
        ) : viewMode === 'week' ? (
          <>
            <div className="sheet-pane" style={{ width: `${splitWidth}px` }}>
              <TaskSheet
                tasks={tasks}
                resources={resources}
                selectedTaskId={selectedTaskId}
                onSelectTask={setSelectedTaskId}
                onUpdateTask={handleUpdateTask}
                onToggleCollapse={(id) => {
                  const t = tasks.find((item) => item.id === id);
                  if (t) handleUpdateTask(id, { collapsed: !t.collapsed });
                }}
                onAddTask={handleAddTask}
                onOpenTaskDetail={(id) => setSelectedDetailTaskId(id)}
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
                tasks={tasks}
                activeWeekDays={metadata.activeWeekDays || [1, 2, 3, 4, 5]}
                selectedTaskId={selectedTaskId}
                onSelectTask={setSelectedTaskId}
                onOpenTaskDetail={(id) => setSelectedDetailTaskId(id)}
              />
            </div>
          </>
        ) : (
          <div className="sheet-pane-fullscreen">
            <TaskSheet
              tasks={tasks}
              resources={resources}
              selectedTaskId={selectedTaskId}
              onSelectTask={setSelectedTaskId}
              onUpdateTask={handleUpdateTask}
              onToggleCollapse={(id) => {
                const t = tasks.find((item) => item.id === id);
                if (t) handleUpdateTask(id, { collapsed: !t.collapsed });
              }}
              onAddTask={handleAddTask}
              onOpenTaskDetail={(id) => setSelectedDetailTaskId(id)}
              scrollTop={0}
              onScroll={() => {}}
              scrollRef={taskSheetScrollRef}
            />
          </div>
        )}
      </div>

      {/* Barra de Status Inferior do Office 2010 */}
      <StatusBar
        taskCount={tasks.length}
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
        tasks={tasks}
        resources={resources}
        onNewProject={handleNewProject}
        onSaveProject={() => {
          saveToStorage(tasks, resources, metadata);
          setIsBackstageOpen(false);
          alert('Projeto salvo com sucesso!');
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
          saveToStorage(tasks, updated, metadata);
        }}
      />

      <ProjectInfoModal
        isOpen={isProjectInfoModalOpen}
        onClose={() => setIsProjectInfoModalOpen(false)}
        metadata={metadata}
        onUpdateMetadata={(updated) => {
          setMetadata(updated);
          const activeDays = updated.activeWeekDays || [1, 2, 3, 4, 5];
          const recalculated = recalculateSchedule(tasks, activeDays);
          setTasks(recalculated);
          saveToStorage(recalculated, resources, updated);
        }}
      />

      <TaskDetailModal
        task={tasks.find((t) => t.id === selectedDetailTaskId) || null}
        isOpen={selectedDetailTaskId !== null}
        onClose={() => setSelectedDetailTaskId(null)}
        onUpdateTask={handleUpdateTask}
      />
    </div>
  );
};

export default App;
