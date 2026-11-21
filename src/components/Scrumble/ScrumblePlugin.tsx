import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Task,
  Resource,
  ProjectMetadata,
  ScrumbleState,
  ScrumbleSprint,
  ScrumbleDailyLog,
  KanbanStatus,
  ProjectMethodology,
} from '../../types/project';
import {
  ScrumbleExternalCommand,
  getTodayISO,
  getYesterdayISO,
  getMondayOfCurrentWeekISO,
  computeSprintEndFridayISO,
  playPomodoroChime,
} from './scrumbleDefaults';
import {
  deriveEffectiveKanbanStatus,
  formatDatePTBR,
  getParentSubproject,
} from '../../utils/scheduler';
import {
  Zap,
  Snowflake,
  Plus,
  Play,
  Pause,
  RotateCcw,
  Settings2,
  Calendar,
  Sun,
  Flag,
  History,
  AlertTriangle,
  Ban,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ListChecks,
  Paperclip,
  ExternalLink,
  Search,
  X,
  Clock,
  SlidersHorizontal,
  FolderKanban,
  Flame,
  GanttChartSquare,
  Check,
} from 'lucide-react';

interface ScrumblePluginProps {
  tasks: Task[];
  resources: Resource[];
  metadata: ProjectMetadata;
  scrumbleState: ScrumbleState;
  onUpdateScrumbleState: (updater: (prev: ScrumbleState) => ScrumbleState) => void;
  onUpdateTask: (taskId: string, updates: Partial<Task>) => void;
  onBatchUpdateTasks: (updater: (prev: Task[]) => Task[]) => void;
  onAddQuickTask: (
    name: string,
    opts: {
      subprojectId?: string;
      kanbanStatus: KanbanStatus;
      sprintId?: string;
      storyPoints?: number;
    }
  ) => void;
  onOpenTaskDetail: (taskId: string) => void;
  onSwitchToGantt: (subprojectId?: string) => void;
  externalCommand?: ScrumbleExternalCommand | null;
  onClearExternalCommand?: () => void;
  onShowToast: (msg: string) => void;
}

type PomodoroPhase = 'work' | 'short_break' | 'long_break';
type ActiveModalType = 'planning' | 'daily' | 'review' | 'history' | null;

interface ColumnDef {
  key: KanbanStatus;
  title: string;
  subtitle: string;
  accentColor: string;
  emptyText: string;
}

const BOARD_COLUMNS: ColumnDef[] = [
  {
    key: 'icebox',
    title: 'Talvez / Futuro',
    subtitle: 'Isolado do Gantt e do Caminho Crítico',
    accentColor: '#0284c7',
    emptyText: 'Arraste para cá ideias que não entram agora.',
  },
  {
    key: 'backlog',
    title: 'Backlog',
    subtitle: 'Priorizado e pronto para Planning',
    accentColor: '#475569',
    emptyText: 'Nenhuma tarefa aguardando no Backlog.',
  },
  {
    key: 'sprint_todo',
    title: 'A Fazer na Sprint',
    subtitle: 'Compromisso desta semana',
    accentColor: '#2563eb',
    emptyText: 'Puxe tarefas do Backlog no Planning.',
  },
  {
    key: 'in_progress',
    title: 'Em Andamento',
    subtitle: 'Foco simultâneo (WIP Limit)',
    accentColor: '#d97706',
    emptyText: 'Mova 1 tarefa para iniciar o foco.',
  },
  {
    key: 'done',
    title: 'Concluído',
    subtitle: 'Sincronizado com 100% na Planilha',
    accentColor: '#16a34a',
    emptyText: 'Conclua cartões para registrar entregas.',
  },
];

const STORY_POINT_CYCLE = [1, 2, 3, 5, 8];

function formatTimerClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export const ScrumblePlugin: React.FC<ScrumblePluginProps> = ({
  tasks,
  scrumbleState,
  onUpdateScrumbleState,
  onUpdateTask,
  onBatchUpdateTasks,
  onAddQuickTask,
  onOpenTaskDetail,
  onSwitchToGantt,
  externalCommand,
  onClearExternalCommand,
  onShowToast,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<KanbanStatus | null>(null);

  // Quick-add card bar
  const [quickAddText, setQuickAddText] = useState('');
  const [quickAddTargetCol, setQuickAddTargetCol] = useState<KanbanStatus>('backlog');
  const [quickAddSubprojectId, setQuickAddSubprojectId] = useState<string>('');
  const [quickAddPoints, setQuickAddPoints] = useState<number>(2);
  const [showQuickAddBar, setShowQuickAddBar] = useState(false);
  const quickAddInputRef = useRef<HTMLInputElement>(null);

  // Blocker inline editor on card
  const [editingBlockerTaskId, setEditingBlockerTaskId] = useState<string | null>(null);
  const [blockerDraftText, setBlockerDraftText] = useState('');

  // Methodology manager popover (when viewing 'all')
  const [showMethodologyPopover, setShowMethodologyPopover] = useState(false);

  // Modals
  const [activeModal, setActiveModal] = useState<ActiveModalType>(null);
  const [historyTab, setHistoryTab] = useState<'sprints' | 'dailies'>('sprints');

  // Planning form state
  const [planName, setPlanName] = useState('');
  const [planGoal, setPlanGoal] = useState('');
  const [planWeeks, setPlanWeeks] = useState<1 | 2>(1);
  const [planStartDate, setPlanStartDate] = useState(getMondayOfCurrentWeekISO());
  const [planEndDate, setPlanEndDate] = useState(
    computeSprintEndFridayISO(getMondayOfCurrentWeekISO(), 1)
  );
  const [planSelectedIds, setPlanSelectedIds] = useState<Set<string>>(new Set());

  // Daily 5-min modal state
  const [dailyYesterday, setDailyYesterday] = useState('');
  const [dailyToday, setDailyToday] = useState('');
  const [dailyBlockers, setDailyBlockers] = useState('');
  const [dailyTimerSeconds, setDailyTimerSeconds] = useState(300);
  const [dailyTimerRunning, setDailyTimerRunning] = useState(false);

  // Review & Retro modal state
  const [reviewDelivered, setReviewDelivered] = useState('');
  const [reviewWorked, setReviewWorked] = useState('');
  const [reviewImprove, setReviewImprove] = useState('');
  const [reviewUnfinishedAction, setReviewUnfinishedAction] = useState<'backlog' | 'carry_over'>(
    'carry_over'
  );

  // Pomodoro state
  const [pomodoroPhase, setPomodoroPhase] = useState<PomodoroPhase>('work');
  const [pomodoroRunning, setPomodoroRunning] = useState(false);
  const [pomodoroSecondsLeft, setPomodoroSecondsLeft] = useState(
    (scrumbleState.pomodoroConfig.workMinutes || 25) * 60
  );
  const [pomodoroCycleCount, setPomodoroCycleCount] = useState(0);
  const [showPomodoroSettings, setShowPomodoroSettings] = useState(false);

  // Refs para callbacks estáveis no tick do Pomodoro e Daily
  const scrumbleStateRef = useRef(scrumbleState);
  const tasksRef = useRef(tasks);
  const pomodoroSecondsRef = useRef(pomodoroSecondsLeft);
  const dailySecondsRef = useRef(dailyTimerSeconds);

  useEffect(() => {
    scrumbleStateRef.current = scrumbleState;
    tasksRef.current = tasks;
  }, [scrumbleState, tasks]);

  useEffect(() => {
    pomodoroSecondsRef.current = pomodoroSecondsLeft;
  }, [pomodoroSecondsLeft]);

  useEffect(() => {
    dailySecondsRef.current = dailyTimerSeconds;
  }, [dailyTimerSeconds]);

  // Mapas de Subprojetos e Ancestrais
  const subprojects = useMemo(() => tasks.filter((t) => t.isSummary), [tasks]);

  const parentSubprojectByTaskId = useMemo(() => {
    const map = new Map<string, Task | undefined>();
    tasks.forEach((t, idx) => {
      if (!t.isSummary) {
        map.set(t.id, getParentSubproject(tasks, idx));
      }
    });
    return map;
  }, [tasks]);

  const activeScopeSubproject = useMemo(() => {
    if (
      scrumbleState.activeSubprojectId === 'all' ||
      scrumbleState.activeSubprojectId === 'agile_only'
    ) {
      return undefined;
    }
    return subprojects.find((s) => s.id === scrumbleState.activeSubprojectId);
  }, [subprojects, scrumbleState.activeSubprojectId]);

  const agileSubprojectCount = useMemo(
    () => subprojects.filter((s) => s.methodology === 'agile').length,
    [subprojects]
  );

  // Tarefas executáveis filtradas pelo escopo (Todos / Apenas Ágeis / Subprojeto específico)
  const scopedExecutableTasks = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    let scopeAllowedIds: Set<string> | null = null;
    if (
      scrumbleState.activeSubprojectId !== 'all' &&
      scrumbleState.activeSubprojectId !== 'agile_only'
    ) {
      const sIdx = tasks.findIndex((t) => t.id === scrumbleState.activeSubprojectId);
      if (sIdx >= 0) {
        scopeAllowedIds = new Set<string>();
        const baseLevel = tasks[sIdx].outlineLevel;
        for (let j = sIdx + 1; j < tasks.length; j++) {
          if (tasks[j].outlineLevel > baseLevel) {
            if (!tasks[j].isSummary) {
              scopeAllowedIds.add(tasks[j].id);
            }
          } else {
            break;
          }
        }
      }
    }

    return tasks.filter((t) => {
      if (t.isSummary) return false;
      if (scopeAllowedIds && !scopeAllowedIds.has(t.id)) return false;

      if (scrumbleState.activeSubprojectId === 'agile_only') {
        const parent = parentSubprojectByTaskId.get(t.id);
        if (!parent || parent.methodology !== 'agile') return false;
      }

      if (query) {
        const parent = parentSubprojectByTaskId.get(t.id);
        const matchName = t.name.toLowerCase().includes(query);
        const matchSub = parent?.name.toLowerCase().includes(query);
        const matchNotes = (t.notes || '').toLowerCase().includes(query);
        if (!matchName && !matchSub && !matchNotes) return false;
      }

      return true;
    });
  }, [tasks, scrumbleState.activeSubprojectId, parentSubprojectByTaskId, searchQuery]);

  // Agrupamento nas 5 colunas
  const tasksByColumn = useMemo(() => {
    const buckets: Record<KanbanStatus, Task[]> = {
      icebox: [],
      backlog: [],
      sprint_todo: [],
      in_progress: [],
      done: [],
    };
    scopedExecutableTasks.forEach((t) => {
      const col = deriveEffectiveKanbanStatus(t);
      buckets[col].push(t);
    });
    return buckets;
  }, [scopedExecutableTasks]);

  const iceboxCount = tasksByColumn.icebox.length;
  const wipCount = tasksByColumn.in_progress.length;
  const isWipExceeded = wipCount > scrumbleState.wipLimitInProgress;

  // Métricas da Sprint atual
  const sprintStats = useMemo(() => {
    const sprintTasks = scopedExecutableTasks.filter((t) => {
      const status = deriveEffectiveKanbanStatus(t);
      if (status === 'sprint_todo' || status === 'in_progress') return true;
      if (status === 'done') {
        if (!scrumbleState.currentSprint) return true;
        return (
          t.sprintId === scrumbleState.currentSprint.id ||
          (t.completedAt && t.completedAt >= scrumbleState.currentSprint.startDate)
        );
      }
      return false;
    });
    const doneTasks = sprintTasks.filter((t) => deriveEffectiveKanbanStatus(t) === 'done');
    const totalPoints = sprintTasks.reduce((acc, t) => acc + (t.storyPoints || 0), 0);
    const donePoints = doneTasks.reduce((acc, t) => acc + (t.storyPoints || 0), 0);
    const pomodorosInSprint = sprintTasks.reduce(
      (acc, t) => acc + (t.pomodorosCompleted || 0),
      0
    );
    const pct =
      sprintTasks.length > 0 ? Math.round((doneTasks.length / sprintTasks.length) * 100) : 0;

    return {
      totalCount: sprintTasks.length,
      doneCount: doneTasks.length,
      totalPoints,
      donePoints,
      pomodorosInSprint,
      pct,
    };
  }, [scopedExecutableTasks, scrumbleState.currentSprint]);

  const activePomodoroTask = useMemo(
    () => tasks.find((t) => t.id === scrumbleState.activePomodoroTaskId) || null,
    [tasks, scrumbleState.activePomodoroTaskId]
  );

  // Abrir Planning modal com valores pré-preenchidos
  const openPlanningModal = () => {
    const existing = scrumbleStateRef.current.currentSprint;
    const nextNum =
      existing?.number || (scrumbleStateRef.current.sprintHistory.length || 0) + 1;
    const monday = existing?.startDate || getMondayOfCurrentWeekISO();
    const weeks = existing?.durationWeeks || 1;
    const friday = existing?.endDate || computeSprintEndFridayISO(monday, weeks);

    setPlanName(existing?.name || `Sprint #${nextNum}`);
    setPlanGoal(existing?.goal || '');
    setPlanWeeks(weeks);
    setPlanStartDate(monday);
    setPlanEndDate(friday);

    const alreadyCommitted = new Set<string>();
    tasksRef.current.forEach((t) => {
      if (!t.isSummary) {
        const st = deriveEffectiveKanbanStatus(t);
        if (st === 'sprint_todo' || st === 'in_progress') {
          alreadyCommitted.add(t.id);
        }
      }
    });
    setPlanSelectedIds(alreadyCommitted);
    setActiveModal('planning');
  };

  // Abrir Daily 5-min modal com sugestões automáticas
  const openDailyModal = () => {
    const yesterdayIso = getYesterdayISO();
    const todayIso = getTodayISO();

    const completedRecently = tasksRef.current.filter(
      (t) =>
        !t.isSummary &&
        t.progress === 100 &&
        (t.completedAt === yesterdayIso || t.completedAt === todayIso)
    );
    const inProg = tasksRef.current.filter(
      (t) => !t.isSummary && deriveEffectiveKanbanStatus(t) === 'in_progress'
    );
    const todo = tasksRef.current.filter(
      (t) => !t.isSummary && deriveEffectiveKanbanStatus(t) === 'sprint_todo'
    );
    const blocked = tasksRef.current.filter((t) => !t.isSummary && t.isBlocked);

    setDailyYesterday(
      completedRecently.length > 0
        ? completedRecently.map((t) => `• #${t.rowNumber || '?'} ${t.name}`).join('\n')
        : ''
    );
    setDailyToday(
      [...inProg, ...todo.slice(0, 3)]
        .map((t) => `• #${t.rowNumber || '?'} ${t.name}`)
        .join('\n')
    );
    setDailyBlockers(
      blocked.length > 0
        ? blocked
            .map(
              (t) =>
                `• #${t.rowNumber || '?'} ${t.name}${t.blockerNote ? `: ${t.blockerNote}` : ''}`
            )
            .join('\n')
        : 'Nenhum impedimento no momento.'
    );
    dailySecondsRef.current = 300;
    setDailyTimerSeconds(300);
    setDailyTimerRunning(true);
    setActiveModal('daily');
  };

  const openReviewModal = () => {
    const sprint = scrumbleStateRef.current.currentSprint;
    const deliveredNames = scopedExecutableTasks
      .filter((t) => deriveEffectiveKanbanStatus(t) === 'done')
      .slice(0, 8)
      .map((t) => `• #${t.rowNumber || '?'} ${t.name}`)
      .join('\n');

    setReviewDelivered(
      deliveredNames ||
        (sprint ? `Sprint "${sprint.name}" finalizada.` : 'Entregas da semana.')
    );
    setReviewWorked('');
    setReviewImprove('');
    setReviewUnfinishedAction('carry_over');
    setActiveModal('review');
  };

  // Efeito do relógio Pomodoro (Timeboxing — sem side effects dentro de state updaters)
  useEffect(() => {
    if (!pomodoroRunning) return;
    const timer = window.setInterval(() => {
      const next = pomodoroSecondsRef.current - 1;
      if (next > 0) {
        pomodoroSecondsRef.current = next;
        setPomodoroSecondsLeft(next);
        return;
      }

      // Bloco zerou!
      playPomodoroChime();
      const cfg = scrumbleStateRef.current.pomodoroConfig;

      if (pomodoroPhase === 'work') {
        const nextCycle = pomodoroCycleCount + 1;
        setPomodoroCycleCount(nextCycle);

        const focusedTaskId = scrumbleStateRef.current.activePomodoroTaskId;
        if (focusedTaskId) {
          const target = tasksRef.current.find((t) => t.id === focusedTaskId);
          if (target) {
            onUpdateTask(focusedTaskId, {
              pomodorosCompleted: (target.pomodorosCompleted || 0) + 1,
            });
          }
        }

        onUpdateScrumbleState((s) => ({
          ...s,
          totalPomodorosCompleted: (s.totalPomodorosCompleted || 0) + 1,
        }));

        const isLong = nextCycle % (cfg.cyclesBeforeLongBreak || 4) === 0;
        const nextPhase: PomodoroPhase = isLong ? 'long_break' : 'short_break';
        const breakSecs = (isLong ? cfg.longBreakMinutes : cfg.shortBreakMinutes) * 60;
        pomodoroSecondsRef.current = breakSecs;
        setPomodoroSecondsLeft(breakSecs);
        setPomodoroPhase(nextPhase);
        setPomodoroRunning(false);
        onShowToast(
          isLong
            ? '🍅 Ciclo completo! Bloco Pomodoro concluído — hora da Pausa Longa.'
            : '🍅 Bloco Pomodoro concluído! Faça uma Pausa Curta.'
        );
      } else {
        const workSecs = (cfg.workMinutes || 25) * 60;
        pomodoroSecondsRef.current = workSecs;
        setPomodoroSecondsLeft(workSecs);
        setPomodoroPhase('work');
        setPomodoroRunning(false);
        onShowToast('⚡ Pausa finalizada! Pronto para o próximo bloco de foco.');
      }
    }, 1000);

    return () => window.clearInterval(timer);
  }, [
    pomodoroRunning,
    pomodoroPhase,
    pomodoroCycleCount,
    onUpdateTask,
    onUpdateScrumbleState,
    onShowToast,
  ]);

  // Efeito do cronômetro de 5 minutos da Daily
  useEffect(() => {
    if (activeModal !== 'daily' || !dailyTimerRunning) return;
    const t = window.setInterval(() => {
      const next = dailySecondsRef.current - 1;
      if (next <= 0) {
        dailySecondsRef.current = 0;
        setDailyTimerSeconds(0);
        setDailyTimerRunning(false);
        playPomodoroChime();
      } else {
        dailySecondsRef.current = next;
        setDailyTimerSeconds(next);
      }
    }, 1000);
    return () => window.clearInterval(t);
  }, [activeModal, dailyTimerRunning]);

  // Comandos disparados pela aba Scrumble do Ribbon
  useEffect(() => {
    if (!externalCommand) return;
    const t = window.setTimeout(() => {
      switch (externalCommand.type) {
        case 'open_planning':
          openPlanningModal();
          break;
        case 'open_daily':
          openDailyModal();
          break;
        case 'open_review':
          openReviewModal();
          break;
        case 'toggle_icebox':
          onUpdateScrumbleState((prev) => ({
            ...prev,
            showIceboxColumn: !prev.showIceboxColumn,
          }));
          break;
        case 'new_card':
          setShowQuickAddBar(true);
          window.setTimeout(() => quickAddInputRef.current?.focus(), 40);
          break;
        case 'toggle_pomodoro':
          setPomodoroRunning((r) => !r);
          break;
        case 'open_history':
          setActiveModal('history');
          break;
      }
      onClearExternalCommand?.();
    }, 0);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalCommand?.id]);

  // Movimentação de cartão com sincronização bidirecional total (progress <-> kanbanStatus)
  const moveTaskToColumn = (taskId: string, targetCol: KanbanStatus) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.isSummary) return;

    const currentCol = deriveEffectiveKanbanStatus(task);
    if (currentCol === targetCol) return;

    const updates: Partial<Task> = {
      kanbanStatus: targetCol,
    };

    if (targetCol === 'done') {
      updates.progress = 100;
      updates.completedAt = getTodayISO();
      updates.isBlocked = false;
      updates.blockerNote = undefined;
      if (scrumbleState.currentSprint && !task.sprintId) {
        updates.sprintId = scrumbleState.currentSprint.id;
      }
      if (scrumbleState.activePomodoroTaskId === taskId) {
        onUpdateScrumbleState((s) => ({ ...s, activePomodoroTaskId: null }));
      }
    } else if (targetCol === 'in_progress') {
      if (task.progress >= 100 || currentCol === 'done') {
        updates.progress = 50;
        updates.completedAt = undefined;
      } else if (task.progress === 0) {
        updates.progress = 25;
      }
      if (scrumbleState.currentSprint && !task.sprintId) {
        updates.sprintId = scrumbleState.currentSprint.id;
      }
      if (currentCol !== 'in_progress' && wipCount >= scrumbleState.wipLimitInProgress) {
        onShowToast(
          `⚠️ Limite WIP (${scrumbleState.wipLimitInProgress}) atingido em "Em Andamento" — finalize algo para manter o foco!`
        );
      }
    } else if (targetCol === 'sprint_todo') {
      if (task.progress >= 100) {
        updates.progress = 0;
        updates.completedAt = undefined;
      }
      if (scrumbleState.currentSprint) {
        updates.sprintId = scrumbleState.currentSprint.id;
      }
    } else if (targetCol === 'backlog') {
      if (task.progress >= 100) {
        updates.progress = 0;
        updates.completedAt = undefined;
      }
      updates.sprintId = undefined;
    } else if (targetCol === 'icebox') {
      if (task.progress >= 100) {
        updates.progress = 0;
        updates.completedAt = undefined;
      }
      updates.sprintId = undefined;
      onShowToast(
        `🧊 "${task.name}" isolada em Talvez/Futuro (oculta da Planilha, Gantt e Semana).`
      );
    }

    if (currentCol === 'icebox' && targetCol !== 'icebox') {
      onShowToast(`✨ "${task.name}" restaurada ao cronograma e ao quadro ativo!`);
    }

    onUpdateTask(taskId, updates);
  };

  const handleToggleMethodology = (subproject: Task, target?: ProjectMethodology) => {
    const next: ProjectMethodology =
      target || (subproject.methodology === 'agile' ? 'linear' : 'agile');
    onUpdateTask(subproject.id, { methodology: next });
    onShowToast(
      next === 'agile'
        ? `⚡ "${subproject.name}" alternado para Ágil (Scrumble)`
        : `📐 "${subproject.name}" alternado para Linear (Gantt)`
    );
  };

  const handleCycleStoryPoints = (task: Task) => {
    const curr = task.storyPoints || 0;
    const idx = STORY_POINT_CYCLE.indexOf(curr);
    const next = idx < 0 || idx === STORY_POINT_CYCLE.length - 1 ? 1 : STORY_POINT_CYCLE[idx + 1];
    onUpdateTask(task.id, { storyPoints: next });
  };

  const handleFocusPomodoroOnTask = (task: Task) => {
    const isAlreadyFocused = scrumbleState.activePomodoroTaskId === task.id;
    if (isAlreadyFocused) {
      setPomodoroRunning((r) => !r);
      return;
    }
    const workSecs = (scrumbleState.pomodoroConfig.workMinutes || 25) * 60;
    pomodoroSecondsRef.current = workSecs;
    setPomodoroPhase('work');
    setPomodoroSecondsLeft(workSecs);
    setPomodoroRunning(true);
    onUpdateScrumbleState((prev) => ({
      ...prev,
      activePomodoroTaskId: task.id,
    }));
    onShowToast(`🍅 Foco Pomodoro iniciado em "${task.name}"!`);
  };

  const handleSwitchPomodoroPhase = (phase: PomodoroPhase) => {
    const cfg = scrumbleState.pomodoroConfig;
    const mins =
      phase === 'work'
        ? cfg.workMinutes
        : phase === 'short_break'
          ? cfg.shortBreakMinutes
          : cfg.longBreakMinutes;
    setPomodoroRunning(false);
    setPomodoroPhase(phase);
    setPomodoroSecondsLeft((mins || 25) * 60);
  };

  const handleSaveQuickCard = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = quickAddText.trim();
    if (!clean) return;
    const chosenSubId =
      quickAddSubprojectId ||
      (activeScopeSubproject ? activeScopeSubproject.id : undefined);

    onAddQuickTask(clean, {
      subprojectId: chosenSubId,
      kanbanStatus: quickAddTargetCol,
      sprintId:
        quickAddTargetCol === 'sprint_todo' || quickAddTargetCol === 'in_progress'
          ? scrumbleState.currentSprint?.id
          : undefined,
      storyPoints: quickAddPoints,
    });
    setQuickAddText('');
    onShowToast(`Cartão "${clean}" criado em sincronia com o cronograma!`);
  };

  // Salvar Planning & comprometer tarefas
  const handleSavePlanning = (e: React.FormEvent) => {
    e.preventDefault();
    const nextNum =
      scrumbleState.currentSprint?.number || (scrumbleState.sprintHistory.length || 0) + 1;
    const sprintId =
      scrumbleState.currentSprint?.id || `sprint_${Date.now()}`;
    const sprintObj: ScrumbleSprint = {
      id: sprintId,
      number: nextNum,
      name: planName.trim() || `Sprint #${nextNum}`,
      goal: planGoal.trim() || 'Entregar as prioridades da semana sem sobrecarga',
      startDate: planStartDate,
      endDate: planEndDate,
      durationWeeks: planWeeks,
      status: 'active',
    };

    onBatchUpdateTasks((prev) =>
      prev.map((t) => {
        if (t.isSummary) return t;
        const status = deriveEffectiveKanbanStatus(t);
        if (planSelectedIds.has(t.id)) {
          return {
            ...t,
            kanbanStatus: status === 'in_progress' || status === 'done' ? status : 'sprint_todo',
            sprintId,
          };
        }
        // Se estava em sprint_todo e foi desmarcada no Planning, volta ao Backlog
        if (status === 'sprint_todo' && !planSelectedIds.has(t.id)) {
          return {
            ...t,
            kanbanStatus: 'backlog',
            sprintId: undefined,
          };
        }
        return t;
      })
    );

    onUpdateScrumbleState((prev) => ({
      ...prev,
      currentSprint: sprintObj,
    }));

    setActiveModal(null);
    onShowToast(
      `📅 ${sprintObj.name} ativa (${planSelectedIds.size} tarefa(s) comprometida(s))!`
    );
  };

  // Salvar Daily 5 min
  const handleSaveDaily = (e: React.FormEvent) => {
    e.preventDefault();
    const spent = Math.max(0, 300 - dailyTimerSeconds);
    const entry: ScrumbleDailyLog = {
      id: `daily_${Date.now()}`,
      date: getTodayISO(),
      sprintId: scrumbleState.currentSprint?.id,
      yesterdaySummary: dailyYesterday.trim(),
      todayFocus: dailyToday.trim(),
      blockers: dailyBlockers.trim(),
      durationSecondsSpent: spent,
      createdAt: new Date().toISOString(),
    };

    onUpdateScrumbleState((prev) => ({
      ...prev,
      dailyLogs: [entry, ...prev.dailyLogs].slice(0, 60),
    }));
    setDailyTimerRunning(false);
    setActiveModal(null);
    onShowToast('☀️ Daily registrada com sucesso!');
  };

  // Encerrar Sprint (Review & Retro)
  const handleCloseSprint = (startNextImmediately: boolean) => {
    const curr = scrumbleState.currentSprint;
    const completedSprint: ScrumbleSprint | null = curr
      ? {
          ...curr,
          status: 'completed',
          review: {
            deliveredSummary: reviewDelivered.trim(),
            whatWorked: reviewWorked.trim(),
            whatToImprove: reviewImprove.trim(),
            completedCount: sprintStats.doneCount,
            plannedCount: sprintStats.totalCount,
            pomodorosCompleted: sprintStats.pomodorosInSprint,
            closedAt: new Date().toISOString(),
          },
        }
      : null;

    let nextSprint: ScrumbleSprint | null = null;
    if (startNextImmediately) {
      const nextNum = (curr?.number || scrumbleState.sprintHistory.length) + 1;
      const startIso = getMondayOfCurrentWeekISO();
      const weeks = curr?.durationWeeks || 1;
      nextSprint = {
        id: `sprint_${Date.now()}`,
        number: nextNum,
        name: `Sprint #${nextNum}`,
        goal: '',
        startDate: startIso,
        endDate: computeSprintEndFridayISO(startIso, weeks),
        durationWeeks: weeks,
        status: 'active',
      };
    }

    onBatchUpdateTasks((prev) =>
      prev.map((t) => {
        if (t.isSummary) return t;
        const st = deriveEffectiveKanbanStatus(t);
        if (st === 'sprint_todo' || st === 'in_progress') {
          if (reviewUnfinishedAction === 'backlog') {
            return {
              ...t,
              kanbanStatus: 'backlog',
              sprintId: undefined,
            };
          }
          return {
            ...t,
            sprintId: nextSprint ? nextSprint.id : undefined,
          };
        }
        return t;
      })
    );

    onUpdateScrumbleState((prev) => ({
      ...prev,
      currentSprint: nextSprint,
      sprintHistory: completedSprint
        ? [completedSprint, ...prev.sprintHistory].slice(0, 50)
        : prev.sprintHistory,
    }));

    setActiveModal(null);
    if (startNextImmediately && nextSprint) {
      onShowToast(`🏁 Sprint encerrada e ${nextSprint.name} criada!`);
      window.setTimeout(() => openPlanningModal(), 60);
    } else {
      onShowToast('🏁 Sprint arquivada no Histórico com sucesso!');
    }
  };

  // Candidatas do Planning (Backlog + Sprint atual não concluídas)
  const planningCandidateTasks = useMemo(() => {
    return scopedExecutableTasks.filter((t) => {
      const st = deriveEffectiveKanbanStatus(t);
      return st === 'backlog' || st === 'sprint_todo' || st === 'in_progress';
    });
  }, [scopedExecutableTasks]);

  const planningLoadStats = useMemo(() => {
    let points = 0;
    let days = 0;
    planningCandidateTasks.forEach((t) => {
      if (planSelectedIds.has(t.id)) {
        points += t.storyPoints || 0;
        days += Math.max(1, t.durationDays || 1);
      }
    });
    return { count: planSelectedIds.size, points, days };
  }, [planningCandidateTasks, planSelectedIds]);

  const visibleColumns = useMemo(() => {
    return BOARD_COLUMNS.filter((c) => c.key !== 'icebox' || scrumbleState.showIceboxColumn);
  }, [scrumbleState.showIceboxColumn]);

  const getNeighborColumns = (
    col: KanbanStatus
  ): { prev?: KanbanStatus; next?: KanbanStatus } => {
    switch (col) {
      case 'icebox':
        return { next: 'backlog' };
      case 'backlog':
        return { prev: 'icebox', next: 'sprint_todo' };
      case 'sprint_todo':
        return { prev: 'backlog', next: 'in_progress' };
      case 'in_progress':
        return { prev: 'sprint_todo', next: 'done' };
      case 'done':
        return { prev: 'in_progress' };
    }
  };

  return (
    <div className="scrumble-shell">
      {/* ================================================================
          1. BARRA DE CABEÇALHO: ESCOPO & ALTERNÂNCIA LINEAR <-> ÁGIL
         ================================================================ */}
      <div className="scrumble-topbar">
        <div className="scrumble-brand">
          <div className="scrumble-brand-icon">
            <Zap size={16} />
          </div>
          <div>
            <div className="scrumble-brand-title">
              Scrumble
              <span className="scrumble-solo-pill">Solo Scrum + Kanban</span>
            </div>
            <div className="scrumble-brand-sub">
              Sincronia bidirecional ao vivo com Planilha, Gantt e Semana
            </div>
          </div>
        </div>

        {/* Seletor de Escopo & Alternância de Metodologia */}
        <div className="scrumble-scope-controls">
          <div className="scrumble-scope-select-wrap">
            <FolderKanban size={13} />
            <select
              className="scrumble-scope-select"
              value={scrumbleState.activeSubprojectId}
              onChange={(e) =>
                onUpdateScrumbleState((prev) => ({
                  ...prev,
                  activeSubprojectId: e.target.value,
                }))
              }
              title="Filtrar cartões por Subprojeto ou visualizar todo o Projeto"
            >
              <option value="all">
                Todos os Subprojetos ({tasks.filter((t) => !t.isSummary).length} tarefas)
              </option>
              <option value="agile_only">
                ⚡ Somente Subprojetos Ágeis ({agileSubprojectCount})
              </option>
              {subprojects.map((sub) => (
                <option key={sub.id} value={sub.id}>
                  {sub.methodology === 'agile' ? '⚡ ' : '📐 '}
                  {sub.name} ({sub.methodology === 'agile' ? 'Ágil' : 'Linear'})
                </option>
              ))}
            </select>
          </div>

          {activeScopeSubproject ? (
            <div className="scrumble-methodology-switch" title="Alternar metodologia deste Subprojeto">
              <button
                type="button"
                className={`scrumble-meth-btn ${activeScopeSubproject.methodology !== 'agile' ? 'active' : ''}`}
                onClick={() => handleToggleMethodology(activeScopeSubproject, 'linear')}
              >
                Linear (Gantt)
              </button>
              <button
                type="button"
                className={`scrumble-meth-btn agile ${activeScopeSubproject.methodology === 'agile' ? 'active' : ''}`}
                onClick={() => handleToggleMethodology(activeScopeSubproject, 'agile')}
              >
                ⚡ Ágil (Scrumble)
              </button>
            </div>
          ) : (
            subprojects.length > 0 && (
              <div className="scrumble-meth-popover-anchor">
                <button
                  type="button"
                  className={`scrumble-ghost-btn ${showMethodologyPopover ? 'active' : ''}`}
                  onClick={() => setShowMethodologyPopover((v) => !v)}
                  title="Definir quais Subprojetos usam metodologia Ágil ou Linear"
                >
                  <SlidersHorizontal size={13} />
                  <span>Metodologia ({agileSubprojectCount}/{subprojects.length} Ágil)</span>
                </button>

                {showMethodologyPopover && (
                  <div className="scrumble-popover-card">
                    <div className="scrumble-popover-head">
                      <span>Metodologia por Subprojeto</span>
                      <button
                        type="button"
                        onClick={() => setShowMethodologyPopover(false)}
                        aria-label="Fechar"
                      >
                        <X size={13} />
                      </button>
                    </div>
                    <p className="scrumble-popover-hint">
                      Alterne livremente a qualquer momento. Todos os dados permanecem no mesmo cronograma.
                    </p>
                    <div className="scrumble-popover-list">
                      {subprojects.map((sub) => {
                        const isAgile = sub.methodology === 'agile';
                        return (
                          <div key={sub.id} className="scrumble-popover-row">
                            <span className="scrumble-popover-subname" title={sub.name}>
                              {sub.name}
                            </span>
                            <button
                              type="button"
                              className={`scrumble-meth-pill-toggle ${isAgile ? 'agile' : 'linear'}`}
                              onClick={() => handleToggleMethodology(sub)}
                            >
                              {isAgile ? '⚡ Ágil' : '📐 Linear'}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )
          )}
        </div>

        {/* Busca & Ações Direitas */}
        <div className="scrumble-topbar-actions">
          <div className="scrumble-search-box">
            <Search size={13} />
            <input
              type="text"
              placeholder="Buscar cartão..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button type="button" onClick={() => setSearchQuery('')} title="Limpar busca">
                <X size={12} />
              </button>
            )}
          </div>

          <button
            type="button"
            className={`scrumble-icebox-toggle-btn ${scrumbleState.showIceboxColumn ? 'active' : ''}`}
            onClick={() =>
              onUpdateScrumbleState((prev) => ({
                ...prev,
                showIceboxColumn: !prev.showIceboxColumn,
              }))
            }
            title="Mostrar ou ocultar coluna Talvez / Futuro (tarefas isoladas do Gantt/Planilha)"
          >
            <Snowflake size={13} />
            <span>Futuro ({iceboxCount})</span>
          </button>

          <button
            type="button"
            className="scrumble-primary-btn"
            onClick={() => {
              setShowQuickAddBar((v) => !v);
              window.setTimeout(() => quickAddInputRef.current?.focus(), 40);
            }}
          >
            <Plus size={14} />
            <span>Novo Cartão</span>
          </button>

          <button
            type="button"
            className="scrumble-ghost-btn"
            onClick={() => onSwitchToGantt(activeScopeSubproject?.id)}
            title="Alternar para visão Linear (Gráfico de Gantt + Planilha)"
          >
            <GanttChartSquare size={14} />
            <span>Ver no Gantt</span>
          </button>
        </div>
      </div>

      {/* ================================================================
          2. BARRA DA SPRINT + RITOS SOLO + POMODORO TIMEBOXING
         ================================================================ */}
      <div className="scrumble-sprint-pomodoro-bar">
        {/* Bloco Sprint */}
        <div className="scrumble-sprint-strip">
          {scrumbleState.currentSprint ? (
            <>
              <div className="scrumble-sprint-badge">
                <Flag size={13} />
                <strong>{scrumbleState.currentSprint.name}</strong>
                <span className="scrumble-sprint-dates">
                  {formatDatePTBR(scrumbleState.currentSprint.startDate)} →{' '}
                  {formatDatePTBR(scrumbleState.currentSprint.endDate)}
                </span>
              </div>
              <div
                className="scrumble-sprint-goal"
                title={scrumbleState.currentSprint.goal || 'Meta da Sprint'}
              >
                Meta: <em>{scrumbleState.currentSprint.goal || 'Sem meta definida'}</em>
              </div>
              <div className="scrumble-sprint-progress-box">
                <div className="scrumble-sprint-progress-track">
                  <div
                    className="scrumble-sprint-progress-fill"
                    style={{ width: `${sprintStats.pct}%` }}
                  />
                </div>
                <span>
                  {sprintStats.doneCount}/{sprintStats.totalCount} tarefas ({sprintStats.pct}%) ·{' '}
                  {sprintStats.donePoints}/{sprintStats.totalPoints} pts
                </span>
              </div>
            </>
          ) : (
            <div className="scrumble-no-sprint-banner">
              <Calendar size={14} />
              <span>
                Nenhuma Sprint ativa nesta semana — defina sua meta no <strong>Planning</strong> e puxe tarefas do Backlog.
              </span>
            </div>
          )}

          <div className="scrumble-rites-group">
            <button
              type="button"
              className="scrumble-rite-btn planning"
              onClick={openPlanningModal}
              title="Planning (Segunda-feira): configurar Sprint e puxar tarefas do Backlog"
            >
              <Calendar size={13} />
              <span>Planning</span>
            </button>
            <button
              type="button"
              className="scrumble-rite-btn daily"
              onClick={openDailyModal}
              title="Daily Solo (máximo 5 minutos): ontem, hoje e impedimentos"
            >
              <Sun size={13} />
              <span>Daily (5 min)</span>
            </button>
            <button
              type="button"
              className="scrumble-rite-btn review"
              onClick={openReviewModal}
              title="Review & Retrospectiva (Sexta-feira): revisar entregas e encerrar Sprint"
            >
              <Flag size={13} />
              <span>Review & Retro</span>
            </button>
            <button
              type="button"
              className="scrumble-rite-btn history"
              onClick={() => setActiveModal('history')}
              title="Ver Sprints encerradas e histórico de Dailies"
            >
              <History size={13} />
              <span>Histórico</span>
            </button>
          </div>
        </div>

        {/* Widget Timeboxing / Pomodoro */}
        <div className={`scrumble-pomodoro-widget phase-${pomodoroPhase} ${pomodoroRunning ? 'running' : ''}`}>
          <div className="scrumble-pomo-phase-pills">
            <button
              type="button"
              className={pomodoroPhase === 'work' ? 'active' : ''}
              onClick={() => handleSwitchPomodoroPhase('work')}
              title="Bloco de Foco"
            >
              🍅 Foco
            </button>
            <button
              type="button"
              className={pomodoroPhase === 'short_break' ? 'active' : ''}
              onClick={() => handleSwitchPomodoroPhase('short_break')}
              title="Pausa Curta"
            >
              ☕ Curta
            </button>
            <button
              type="button"
              className={pomodoroPhase === 'long_break' ? 'active' : ''}
              onClick={() => handleSwitchPomodoroPhase('long_break')}
              title="Pausa Longa"
            >
              🌿 Longa
            </button>
          </div>

          <div className="scrumble-pomo-clock">{formatTimerClock(pomodoroSecondsLeft)}</div>

          <div className="scrumble-pomo-controls">
            <button
              type="button"
              className="scrumble-pomo-play-btn"
              onClick={() => setPomodoroRunning((r) => !r)}
              title={pomodoroRunning ? 'Pausar Pomodoro' : 'Iniciar Pomodoro'}
            >
              {pomodoroRunning ? <Pause size={13} /> : <Play size={13} />}
            </button>
            <button
              type="button"
              className="scrumble-pomo-icon-btn"
              onClick={() => handleSwitchPomodoroPhase(pomodoroPhase)}
              title="Reiniciar timer atual"
            >
              <RotateCcw size={12} />
            </button>
            <div className="scrumble-pomo-cfg-anchor">
              <button
                type="button"
                className="scrumble-pomo-icon-btn"
                onClick={() => setShowPomodoroSettings((v) => !v)}
                title="Configurar tempos do Pomodoro"
              >
                <Settings2 size={12} />
              </button>

              {showPomodoroSettings && (
                <div className="scrumble-popover-card right">
                  <div className="scrumble-popover-head">
                    <span>Configurar Timeboxing</span>
                    <button type="button" onClick={() => setShowPomodoroSettings(false)}>
                      <X size={13} />
                    </button>
                  </div>
                  <div className="scrumble-pomo-cfg-grid">
                    <label>
                      <span>Foco (min)</span>
                      <input
                        type="number"
                        min={5}
                        max={90}
                        value={scrumbleState.pomodoroConfig.workMinutes}
                        onChange={(e) => {
                          const val = Math.max(5, Math.min(90, Number(e.target.value) || 25));
                          onUpdateScrumbleState((prev) => ({
                            ...prev,
                            pomodoroConfig: { ...prev.pomodoroConfig, workMinutes: val },
                          }));
                          if (pomodoroPhase === 'work' && !pomodoroRunning) {
                            setPomodoroSecondsLeft(val * 60);
                          }
                        }}
                      />
                    </label>
                    <label>
                      <span>Pausa Curta (min)</span>
                      <input
                        type="number"
                        min={1}
                        max={30}
                        value={scrumbleState.pomodoroConfig.shortBreakMinutes}
                        onChange={(e) => {
                          const val = Math.max(1, Math.min(30, Number(e.target.value) || 5));
                          onUpdateScrumbleState((prev) => ({
                            ...prev,
                            pomodoroConfig: { ...prev.pomodoroConfig, shortBreakMinutes: val },
                          }));
                          if (pomodoroPhase === 'short_break' && !pomodoroRunning) {
                            setPomodoroSecondsLeft(val * 60);
                          }
                        }}
                      />
                    </label>
                    <label>
                      <span>Pausa Longa (min)</span>
                      <input
                        type="number"
                        min={5}
                        max={60}
                        value={scrumbleState.pomodoroConfig.longBreakMinutes}
                        onChange={(e) => {
                          const val = Math.max(5, Math.min(60, Number(e.target.value) || 15));
                          onUpdateScrumbleState((prev) => ({
                            ...prev,
                            pomodoroConfig: { ...prev.pomodoroConfig, longBreakMinutes: val },
                          }));
                          if (pomodoroPhase === 'long_break' && !pomodoroRunning) {
                            setPomodoroSecondsLeft(val * 60);
                          }
                        }}
                      />
                    </label>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="scrumble-pomo-meta">
            {activePomodoroTask ? (
              <span className="scrumble-pomo-target" title={`Focando em: ${activePomodoroTask.name}`}>
                Foco: #{activePomodoroTask.rowNumber || '?'} {activePomodoroTask.name}
                <button
                  type="button"
                  onClick={() =>
                    onUpdateScrumbleState((prev) => ({ ...prev, activePomodoroTaskId: null }))
                  }
                  title="Desvincular tarefa do Pomodoro"
                >
                  <X size={10} />
                </button>
              </span>
            ) : (
              <span className="scrumble-pomo-total">
                🍅 {scrumbleState.totalPomodorosCompleted} blocos concluídos
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ================================================================
          3. BARRA RÁPIDA DE CRIAÇÃO DE CARTÃO (Opcional / Expandível)
         ================================================================ */}
      {showQuickAddBar && (
        <form className="scrumble-quickadd-bar" onSubmit={handleSaveQuickCard}>
          <input
            ref={quickAddInputRef}
            type="text"
            className="scrumble-quickadd-input"
            placeholder="Nome da nova tarefa (já entra sincronizada com Planilha, Gantt e Minha Semana)..."
            value={quickAddText}
            onChange={(e) => setQuickAddText(e.target.value)}
          />
          <select
            className="scrumble-quickadd-select"
            value={quickAddTargetCol}
            onChange={(e) => setQuickAddTargetCol(e.target.value as KanbanStatus)}
          >
            <option value="backlog">📋 Backlog</option>
            <option value="sprint_todo">🎯 A Fazer na Sprint</option>
            <option value="in_progress">⚡ Em Andamento</option>
            <option value="icebox">🧊 Talvez / Futuro</option>
          </select>
          {subprojects.length > 0 && !activeScopeSubproject && (
            <select
              className="scrumble-quickadd-select"
              value={quickAddSubprojectId}
              onChange={(e) => setQuickAddSubprojectId(e.target.value)}
            >
              <option value="">Sem Subprojeto (Avulsa)</option>
              {subprojects.map((sub) => (
                <option key={sub.id} value={sub.id}>
                  {sub.name}
                </option>
              ))}
            </select>
          )}
          <select
            className="scrumble-quickadd-select pts"
            value={quickAddPoints}
            onChange={(e) => setQuickAddPoints(Number(e.target.value))}
          >
            {STORY_POINT_CYCLE.map((pt) => (
              <option key={pt} value={pt}>
                {pt} pts
              </option>
            ))}
          </select>
          <button type="submit" className="scrumble-primary-btn">
            <Check size={14} /> Adicionar
          </button>
          <button
            type="button"
            className="scrumble-ghost-btn"
            onClick={() => setShowQuickAddBar(false)}
          >
            Fechar
          </button>
        </form>
      )}

      {/* ================================================================
          4. QUADRO KANBAN (5 COLUNAS + ICEBOX RECOLHÍVEL)
         ================================================================ */}
      <div className="scrumble-board-wrap">
        {/* Faixa lateral recolhida do Icebox (clique para expandir ou solte cartões aqui!) */}
        {!scrumbleState.showIceboxColumn && (
          <div
            className={`scrumble-icebox-collapsed-rail ${dragOverColumn === 'icebox' ? 'drag-over' : ''}`}
            onClick={() =>
              onUpdateScrumbleState((prev) => ({ ...prev, showIceboxColumn: true }))
            }
            onDragOver={(e) => {
              e.preventDefault();
              setDragOverColumn('icebox');
            }}
            onDragLeave={() => setDragOverColumn(null)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOverColumn(null);
              if (draggedTaskId) {
                moveTaskToColumn(draggedTaskId, 'icebox');
                setDraggedTaskId(null);
              }
            }}
            title="Talvez / Futuro (Icebox) — Clique para expandir ou solte uma tarefa aqui para isolá-la do cronograma"
          >
            <Snowflake size={15} />
            <span className="scrumble-rail-badge">{iceboxCount}</span>
            <span className="scrumble-rail-label">Talvez / Futuro</span>
          </div>
        )}

        <div className="scrumble-columns-grid">
          {visibleColumns.map((col) => {
            const colTasks = tasksByColumn[col.key];
            const isOver = dragOverColumn === col.key;
            const isInProgressCol = col.key === 'in_progress';

            return (
              <div
                key={col.key}
                className={`scrumble-column col-${col.key} ${isOver ? 'drag-over' : ''} ${
                  isInProgressCol && isWipExceeded ? 'wip-exceeded' : ''
                }`}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (dragOverColumn !== col.key) setDragOverColumn(col.key);
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                    setDragOverColumn(null);
                  }
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOverColumn(null);
                  const droppedId = e.dataTransfer.getData('text/plain') || draggedTaskId;
                  if (droppedId) {
                    moveTaskToColumn(droppedId, col.key);
                  }
                  setDraggedTaskId(null);
                }}
              >
                {/* Cabeçalho da Coluna */}
                <div
                  className="scrumble-col-header"
                  style={{ borderTopColor: col.accentColor }}
                >
                  <div className="scrumble-col-title-row">
                    <div className="scrumble-col-title">
                      {col.key === 'icebox' && <Snowflake size={14} />}
                      <span>{col.title}</span>
                      <span className="scrumble-col-count">
                        {isInProgressCol
                          ? `${colTasks.length}/${scrumbleState.wipLimitInProgress}`
                          : colTasks.length}
                      </span>
                    </div>

                    {col.key === 'icebox' && (
                      <button
                        type="button"
                        className="scrumble-col-action-btn"
                        onClick={() =>
                          onUpdateScrumbleState((prev) => ({
                            ...prev,
                            showIceboxColumn: false,
                          }))
                        }
                        title="Recolher coluna Talvez / Futuro"
                      >
                        <X size={13} />
                      </button>
                    )}

                    {col.key === 'backlog' && (
                      <button
                        type="button"
                        className="scrumble-col-action-btn"
                        onClick={() => {
                          setQuickAddTargetCol('backlog');
                          setShowQuickAddBar(true);
                          window.setTimeout(() => quickAddInputRef.current?.focus(), 40);
                        }}
                        title="Adicionar tarefa no Backlog"
                      >
                        <Plus size={14} />
                      </button>
                    )}

                    {col.key === 'sprint_todo' && (
                      <button
                        type="button"
                        className="scrumble-col-action-btn"
                        onClick={openPlanningModal}
                        title="Abrir Planning da Sprint"
                      >
                        <Calendar size={13} />
                      </button>
                    )}

                    {isInProgressCol && (
                      <div className="scrumble-wip-stepper" title="Ajustar Limite WIP">
                        <span>WIP:</span>
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateScrumbleState((prev) => ({
                              ...prev,
                              wipLimitInProgress: Math.max(1, prev.wipLimitInProgress - 1),
                            }))
                          }
                        >
                          −
                        </button>
                        <strong>{scrumbleState.wipLimitInProgress}</strong>
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateScrumbleState((prev) => ({
                              ...prev,
                              wipLimitInProgress: Math.min(6, prev.wipLimitInProgress + 1),
                            }))
                          }
                        >
                          +
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="scrumble-col-subtitle">{col.subtitle}</div>

                  {isInProgressCol && isWipExceeded && (
                    <div className="scrumble-wip-alert">
                      <AlertTriangle size={12} />
                      <span>
                        Limite WIP excedido! Conclua uma tarefa antes de puxar outra.
                      </span>
                    </div>
                  )}
                </div>

                {/* Lista de Cartões */}
                <div className="scrumble-cards-list">
                  {colTasks.length === 0 ? (
                    <div className="scrumble-empty-col">{col.emptyText}</div>
                  ) : (
                    colTasks.map((task) => {
                      const parentSub = parentSubprojectByTaskId.get(task.id);
                      const checklistTotal = task.subTasks?.length || 0;
                      const checklistDone =
                        task.subTasks?.filter((st) => st.done).length || 0;
                      const attachCount = task.attachments?.length || 0;
                      const isFocusedPomo = scrumbleState.activePomodoroTaskId === task.id;
                      const neighbors = getNeighborColumns(col.key);

                      return (
                        <div
                          key={task.id}
                          draggable
                          onDragStart={(e) => {
                            setDraggedTaskId(task.id);
                            e.dataTransfer.setData('text/plain', task.id);
                            e.dataTransfer.effectAllowed = 'move';
                          }}
                          onDragEnd={() => {
                            setDraggedTaskId(null);
                            setDragOverColumn(null);
                          }}
                          className={`scrumble-card ${
                            draggedTaskId === task.id ? 'dragging' : ''
                          } ${task.isBlocked ? 'blocked' : ''} ${
                            isFocusedPomo ? 'pomodoro-focused' : ''
                          } ${task.progress === 100 ? 'done-card' : ''}`}
                        >
                          {/* Top Badges: #Row, Subprojeto, Crítica, Bloqueada */}
                          <div className="scrumble-card-top">
                            <div className="scrumble-card-badges">
                              <span className="scrumble-card-id">#{task.rowNumber || '?'}</span>
                              {parentSub && (
                                <span
                                  className={`scrumble-card-sub-badge ${
                                    parentSub.methodology === 'agile' ? 'agile' : ''
                                  }`}
                                  title={`Subprojeto: ${parentSub.name} (${
                                    parentSub.methodology === 'agile' ? 'Ágil' : 'Linear'
                                  })`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onUpdateScrumbleState((prev) => ({
                                      ...prev,
                                      activeSubprojectId: parentSub.id,
                                    }));
                                  }}
                                >
                                  {parentSub.methodology === 'agile' ? '⚡ ' : ''}
                                  {parentSub.name}
                                </span>
                              )}
                              {task.isCritical && col.key !== 'icebox' && col.key !== 'done' && (
                                <span
                                  className="scrumble-card-critical-badge"
                                  title="Caminho Crítico no Gantt"
                                >
                                  <Flame size={10} /> Crítica
                                </span>
                              )}
                            </div>

                            <button
                              type="button"
                              className="scrumble-card-pts-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCycleStoryPoints(task);
                              }}
                              title="Clique para alternar Story Points (1, 2, 3, 5, 8)"
                            >
                              {task.storyPoints ? `${task.storyPoints} pts` : '+ pts'}
                            </button>
                          </div>

                          {/* Título (Clique abre TaskDetailModal) */}
                          <div
                            className="scrumble-card-title"
                            onClick={() => onOpenTaskDetail(task.id)}
                            title="Clique para abrir detalhes completos, anexos e checklist"
                          >
                            {task.name}
                          </div>

                          {/* Barra de Impedimento */}
                          {task.isBlocked && (
                            <div className="scrumble-card-blocker-pill">
                              <Ban size={11} />
                              <span>
                                {task.blockerNote
                                  ? `Bloqueado: ${task.blockerNote}`
                                  : 'Impedimento sinalizado'}
                              </span>
                            </div>
                          )}

                          {/* Editor inline rápido do motivo do bloqueio */}
                          {editingBlockerTaskId === task.id && (
                            <div
                              className="scrumble-inline-blocker-box"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <input
                                type="text"
                                placeholder="Qual o impedimento?"
                                value={blockerDraftText}
                                onChange={(e) => setBlockerDraftText(e.target.value)}
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    onUpdateTask(task.id, {
                                      isBlocked: true,
                                      blockerNote: blockerDraftText.trim() || undefined,
                                    });
                                    setEditingBlockerTaskId(null);
                                  } else if (e.key === 'Escape') {
                                    setEditingBlockerTaskId(null);
                                  }
                                }}
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  onUpdateTask(task.id, {
                                    isBlocked: true,
                                    blockerNote: blockerDraftText.trim() || undefined,
                                  });
                                  setEditingBlockerTaskId(null);
                                }}
                              >
                                OK
                              </button>
                            </div>
                          )}

                          {/* Metadados: Data, Duração, Checklist, Anexos, Pomodoros */}
                          <div className="scrumble-card-meta">
                            {col.key !== 'icebox' && (
                              <span title="Prazo no Cronograma / Duração">
                                📅 {formatDatePTBR(task.endDate)} · {task.durationDays}d
                              </span>
                            )}
                            {checklistTotal > 0 && (
                              <span title="Sub-tarefas do Checklist">
                                <ListChecks size={11} /> {checklistDone}/{checklistTotal}
                              </span>
                            )}
                            {attachCount > 0 && (
                              <span title="Arquivos anexados na tarefa">
                                <Paperclip size={11} /> {attachCount}
                              </span>
                            )}
                            {(task.pomodorosCompleted || 0) > 0 && (
                              <span
                                className="scrumble-card-pomo-count"
                                title="Blocos Pomodoro concluídos"
                              >
                                🍅 {task.pomodorosCompleted}
                              </span>
                            )}
                            {task.progress > 0 && task.progress < 100 && (
                              <span className="scrumble-card-pct">{task.progress}%</span>
                            )}
                          </div>

                          {/* Barra de Ações do Cartão */}
                          <div className="scrumble-card-actions">
                            <div className="scrumble-card-actions-left">
                              {col.key !== 'done' && col.key !== 'icebox' && (
                                <button
                                  type="button"
                                  className={`scrumble-card-pomo-btn ${
                                    isFocusedPomo && pomodoroRunning ? 'active' : ''
                                  }`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleFocusPomodoroOnTask(task);
                                  }}
                                  title={
                                    isFocusedPomo && pomodoroRunning
                                      ? 'Pausar foco nesta tarefa'
                                      : 'Iniciar bloco Pomodoro (25 min) focado nesta tarefa'
                                  }
                                >
                                  <span>🍅</span>
                                  <span>
                                    {isFocusedPomo && pomodoroRunning ? 'Focando' : 'Focar'}
                                  </span>
                                </button>
                              )}

                              <button
                                type="button"
                                className={`scrumble-card-mini-btn ${task.isBlocked ? 'blocked' : ''}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (task.isBlocked) {
                                    onUpdateTask(task.id, {
                                      isBlocked: false,
                                      blockerNote: undefined,
                                    });
                                    setEditingBlockerTaskId(null);
                                  } else {
                                    setBlockerDraftText(task.blockerNote || '');
                                    setEditingBlockerTaskId(task.id);
                                  }
                                }}
                                title={
                                  task.isBlocked
                                    ? 'Remover impedimento'
                                    : 'Sinalizar impedimento / bloqueio'
                                }
                              >
                                <Ban size={11} />
                              </button>

                              <button
                                type="button"
                                className="scrumble-card-mini-btn"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onOpenTaskDetail(task.id);
                                }}
                                title="Abrir detalhes, subtarefas, notas e anexos"
                              >
                                <ExternalLink size={11} />
                              </button>
                            </div>

                            <div className="scrumble-card-actions-right">
                              {neighbors.prev && (
                                <button
                                  type="button"
                                  className="scrumble-card-move-btn"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    moveTaskToColumn(task.id, neighbors.prev!);
                                  }}
                                  title="Mover para coluna anterior"
                                >
                                  <ArrowLeft size={11} />
                                </button>
                              )}
                              {col.key !== 'done' && (
                                <button
                                  type="button"
                                  className="scrumble-card-move-btn done-quick"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    moveTaskToColumn(task.id, 'done');
                                  }}
                                  title="Marcar como Concluído (100%)"
                                >
                                  <CheckCircle2 size={11} />
                                </button>
                              )}
                              {neighbors.next && (
                                <button
                                  type="button"
                                  className="scrumble-card-move-btn"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    moveTaskToColumn(task.id, neighbors.next!);
                                  }}
                                  title="Avançar para próxima coluna"
                                >
                                  <ArrowRight size={11} />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ================================================================
          5. MODAIS DOS RITOS SOLO (PLANNING / DAILY / REVIEW / HISTÓRICO)
         ================================================================ */}

      {/* MODAL 1: PLANNING (SEGUNDA-FEIRA) */}
      {activeModal === 'planning' && (
        <div className="modal-overlay" onClick={() => setActiveModal(null)}>
          <div
            className="scrumble-modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="scrumble-modal-header">
              <div>
                <h3>📅 Sprint Planning (Segunda-feira)</h3>
                <p>Defina a meta da semana e selecione apenas o que realmente cabe nela.</p>
              </div>
              <button type="button" onClick={() => setActiveModal(null)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSavePlanning} className="scrumble-modal-body">
              <div className="scrumble-form-grid">
                <label>
                  <span>Nome da Sprint</span>
                  <input
                    type="text"
                    value={planName}
                    onChange={(e) => setPlanName(e.target.value)}
                    required
                  />
                </label>

                <label>
                  <span>Duração</span>
                  <select
                    value={planWeeks}
                    onChange={(e) => {
                      const w = (Number(e.target.value) === 2 ? 2 : 1) as 1 | 2;
                      setPlanWeeks(w);
                      setPlanEndDate(computeSprintEndFridayISO(planStartDate, w));
                    }}
                  >
                    <option value={1}>1 semana (Seg → Sex)</option>
                    <option value={2}>2 semanas (Seg → Sex)</option>
                  </select>
                </label>

                <label>
                  <span>Início</span>
                  <input
                    type="date"
                    value={planStartDate}
                    onChange={(e) => {
                      setPlanStartDate(e.target.value);
                      setPlanEndDate(computeSprintEndFridayISO(e.target.value, planWeeks));
                    }}
                    required
                  />
                </label>

                <label>
                  <span>Término</span>
                  <input
                    type="date"
                    value={planEndDate}
                    onChange={(e) => setPlanEndDate(e.target.value)}
                    required
                  />
                </label>
              </div>

              <label className="scrumble-full-field">
                <span>Meta Principal da Sprint (O que define semana bem-sucedida?)</span>
                <input
                  type="text"
                  placeholder="Ex: Finalizar entrega do módulo X e concluir documentação Y"
                  value={planGoal}
                  onChange={(e) => setPlanGoal(e.target.value)}
                />
              </label>

              <div className="scrumble-planning-picker-head">
                <strong>
                  Selecionar tarefas do Backlog para esta Sprint ({planningLoadStats.count}{' '}
                  selecionadas · {planningLoadStats.points} pts · {planningLoadStats.days}d estimados)
                </strong>
              </div>

              <div className="scrumble-planning-list">
                {planningCandidateTasks.length === 0 ? (
                  <div className="scrumble-empty-col">
                    Nenhuma tarefa pendente no escopo atual. Crie novos cartões no Backlog!
                  </div>
                ) : (
                  planningCandidateTasks.map((t) => {
                    const checked = planSelectedIds.has(t.id);
                    const sub = parentSubprojectByTaskId.get(t.id);
                    return (
                      <label
                        key={t.id}
                        className={`scrumble-planning-row ${checked ? 'selected' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            const next = new Set(planSelectedIds);
                            if (next.has(t.id)) next.delete(t.id);
                            else next.add(t.id);
                            setPlanSelectedIds(next);
                          }}
                        />
                        <span className="scrumble-card-id">#{t.rowNumber || '?'}</span>
                        <span className="scrumble-planning-taskname">{t.name}</span>
                        {sub && <span className="scrumble-card-sub-badge">{sub.name}</span>}
                        <span className="scrumble-card-pts-btn">
                          {t.storyPoints ? `${t.storyPoints} pts` : `${t.durationDays}d`}
                        </span>
                      </label>
                    );
                  })
                )}
              </div>

              <div className="scrumble-modal-footer">
                <button
                  type="button"
                  className="scrumble-ghost-btn"
                  onClick={() => setActiveModal(null)}
                >
                  Cancelar
                </button>
                <button type="submit" className="scrumble-primary-btn">
                  <Check size={14} /> Confirmar Planning & Iniciar Sprint
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: DAILY SOLO (5 MINUTOS) */}
      {activeModal === 'daily' && (
        <div className="modal-overlay" onClick={() => setActiveModal(null)}>
          <div
            className="scrumble-modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="scrumble-modal-header">
              <div>
                <h3>☀️ Daily Check-in Solo (Timebox: 5 min)</h3>
                <p>Alinhamento rápido de foco: máximo 5 minutos por dia.</p>
              </div>
              <div className="scrumble-daily-timer-box">
                <Clock size={14} />
                <strong className={dailyTimerSeconds <= 60 ? 'urgent' : ''}>
                  {formatTimerClock(dailyTimerSeconds)}
                </strong>
                <button
                  type="button"
                  onClick={() => setDailyTimerRunning((r) => !r)}
                  title={dailyTimerRunning ? 'Pausar timer' : 'Retomar timer'}
                >
                  {dailyTimerRunning ? <Pause size={12} /> : <Play size={12} />}
                </button>
              </div>
            </div>

            <form onSubmit={handleSaveDaily} className="scrumble-modal-body">
              <label className="scrumble-full-field">
                <span>1. O que concluí ontem (ou desde o último check-in)?</span>
                <textarea
                  rows={3}
                  value={dailyYesterday}
                  onChange={(e) => setDailyYesterday(e.target.value)}
                  placeholder="Liste as conquistas ou avanços concretos..."
                />
              </label>

              <label className="scrumble-full-field">
                <span>2. Qual é meu foco principal de hoje?</span>
                <textarea
                  rows={3}
                  value={dailyToday}
                  onChange={(e) => setDailyToday(e.target.value)}
                  placeholder="Escolha 1 a 3 entregáveis essenciais de hoje..."
                />
              </label>

              <label className="scrumble-full-field">
                <span>3. Existe algum impedimento ou trava?</span>
                <textarea
                  rows={2}
                  value={dailyBlockers}
                  onChange={(e) => setDailyBlockers(e.target.value)}
                  placeholder="Dependências, falta de informação, gargalos..."
                />
              </label>

              <div className="scrumble-modal-footer">
                <button
                  type="button"
                  className="scrumble-ghost-btn"
                  onClick={() => {
                    setDailyTimerRunning(false);
                    setActiveModal(null);
                  }}
                >
                  Fechar
                </button>
                <button type="submit" className="scrumble-primary-btn">
                  <Check size={14} /> Registrar Daily
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: REVIEW & RETROSPECTIVA (SEXTA-FEIRA) */}
      {activeModal === 'review' && (
        <div className="modal-overlay" onClick={() => setActiveModal(null)}>
          <div
            className="scrumble-modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="scrumble-modal-header">
              <div>
                <h3>🏁 Sprint Review & Retrospectiva</h3>
                <p>Inspecione o que foi entregue e ajuste o fluxo antes da próxima Sprint.</p>
              </div>
              <button type="button" onClick={() => setActiveModal(null)}>
                <X size={18} />
              </button>
            </div>

            <div className="scrumble-modal-body">
              <div className="scrumble-review-kpis">
                <div className="scrumble-kpi-card">
                  <span>Entregas Concluídas</span>
                  <strong>
                    {sprintStats.doneCount} / {sprintStats.totalCount}
                  </strong>
                </div>
                <div className="scrumble-kpi-card">
                  <span>Story Points</span>
                  <strong>
                    {sprintStats.donePoints} / {sprintStats.totalPoints} pts
                  </strong>
                </div>
                <div className="scrumble-kpi-card">
                  <span>Blocos Pomodoro</span>
                  <strong>🍅 {sprintStats.pomodorosInSprint}</strong>
                </div>
              </div>

              <label className="scrumble-full-field">
                <span>Review — O que foi entregue nesta Sprint?</span>
                <textarea
                  rows={3}
                  value={reviewDelivered}
                  onChange={(e) => setReviewDelivered(e.target.value)}
                />
              </label>

              <div className="scrumble-form-grid two">
                <label className="scrumble-full-field">
                  <span>Retro — O que funcionou bem?</span>
                  <textarea
                    rows={3}
                    placeholder="Bons hábitos, blocos de foco, acertos..."
                    value={reviewWorked}
                    onChange={(e) => setReviewWorked(e.target.value)}
                  />
                </label>

                <label className="scrumble-full-field">
                  <span>Retro — O que ajustar na próxima Sprint?</span>
                  <textarea
                    rows={3}
                    placeholder="Reduzir escopo, fatiar melhor, proteger horários..."
                    value={reviewImprove}
                    onChange={(e) => setReviewImprove(e.target.value)}
                  />
                </label>
              </div>

              <div className="scrumble-rollover-box">
                <span>Destino de tarefas ainda abertas na Sprint:</span>
                <div className="scrumble-rollover-options">
                  <label>
                    <input
                      type="radio"
                      name="unfinishedAction"
                      checked={reviewUnfinishedAction === 'carry_over'}
                      onChange={() => setReviewUnfinishedAction('carry_over')}
                    />
                    <span>Manter na fila da próxima Sprint</span>
                  </label>
                  <label>
                    <input
                      type="radio"
                      name="unfinishedAction"
                      checked={reviewUnfinishedAction === 'backlog'}
                      onChange={() => setReviewUnfinishedAction('backlog')}
                    />
                    <span>Devolver para o Backlog</span>
                  </label>
                </div>
              </div>

              <div className="scrumble-modal-footer">
                <button
                  type="button"
                  className="scrumble-ghost-btn"
                  onClick={() => handleCloseSprint(false)}
                >
                  Apenas Encerrar Sprint
                </button>
                <button
                  type="button"
                  className="scrumble-primary-btn"
                  onClick={() => handleCloseSprint(true)}
                >
                  <Zap size={14} /> Encerrar & Planejar Próxima Sprint
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: HISTÓRICO DE SPRINTS & DAILIES */}
      {activeModal === 'history' && (
        <div className="modal-overlay" onClick={() => setActiveModal(null)}>
          <div
            className="scrumble-modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="scrumble-modal-header">
              <div>
                <h3>📜 Histórico Scrumble</h3>
                <p>Memória das Sprints encerradas e diários rápidos de 5 minutos.</p>
              </div>
              <button type="button" onClick={() => setActiveModal(null)}>
                <X size={18} />
              </button>
            </div>

            <div className="scrumble-modal-body">
              <div className="scrumble-history-tabs">
                <button
                  type="button"
                  className={historyTab === 'sprints' ? 'active' : ''}
                  onClick={() => setHistoryTab('sprints')}
                >
                  Sprints Concluídas ({scrumbleState.sprintHistory.length})
                </button>
                <button
                  type="button"
                  className={historyTab === 'dailies' ? 'active' : ''}
                  onClick={() => setHistoryTab('dailies')}
                >
                  Registros de Daily ({scrumbleState.dailyLogs.length})
                </button>
              </div>

              <div className="scrumble-history-list">
                {historyTab === 'sprints' ? (
                  scrumbleState.sprintHistory.length === 0 ? (
                    <div className="scrumble-empty-col">
                      Nenhuma Sprint foi encerrada ainda. Use Review & Retro na sexta-feira para registrar.
                    </div>
                  ) : (
                    scrumbleState.sprintHistory.map((sp) => (
                      <div key={sp.id} className="scrumble-history-item">
                        <div className="scrumble-history-item-head">
                          <strong>{sp.name}</strong>
                          <span>
                            {formatDatePTBR(sp.startDate)} → {formatDatePTBR(sp.endDate)}
                          </span>
                        </div>
                        {sp.goal && (
                          <div className="scrumble-history-goal">Meta: {sp.goal}</div>
                        )}
                        {sp.review && (
                          <div className="scrumble-history-stats">
                            <span>
                              ✅ {sp.review.completedCount}/{sp.review.plannedCount} entregues
                            </span>
                            <span>🍅 {sp.review.pomodorosCompleted} pomodoros</span>
                            {sp.review.whatWorked && (
                              <p>
                                <strong>Funcionou:</strong> {sp.review.whatWorked}
                              </p>
                            )}
                            {sp.review.whatToImprove && (
                              <p>
                                <strong>Ajustar:</strong> {sp.review.whatToImprove}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    ))
                  )
                ) : scrumbleState.dailyLogs.length === 0 ? (
                  <div className="scrumble-empty-col">
                    Nenhuma Daily registrada ainda. Clique em "Daily (5 min)" para começar.
                  </div>
                ) : (
                  scrumbleState.dailyLogs.map((dl) => (
                    <div key={dl.id} className="scrumble-history-item">
                      <div className="scrumble-history-item-head">
                        <strong>☀️ {formatDatePTBR(dl.date)}</strong>
                        <span>
                          Duração: {formatTimerClock(dl.durationSecondsSpent || 0)}
                        </span>
                      </div>
                      {dl.yesterdaySummary && (
                        <p>
                          <strong>Ontem:</strong> {dl.yesterdaySummary}
                        </p>
                      )}
                      {dl.todayFocus && (
                        <p>
                          <strong>Foco hoje:</strong> {dl.todayFocus}
                        </p>
                      )}
                      {dl.blockers && (
                        <p>
                          <strong>Bloqueios:</strong> {dl.blockers}
                        </p>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
