import React, { useState, useEffect, useRef } from 'react';
import {
  NexoProjectState,
  NexoMilestone,
  NexoPhase,
  Resource,
  CalendarException,
  ScheduleDirection,
} from '../../types/project';
import {
  formatDatePTBR,
  parseISODate,
  toISODate,
  subtractWorkDays,
  addWorkDays,
  toWorkDay,
  toPrevWorkDay,
  parsePredecessors,
  resolveLagWorkDays,
  offsetWorkDays,
  ParsedPredecessor,
} from '../../utils/scheduler';
import {
  Target,
  ArrowUp,
  ArrowDown,
  ArrowRight,
  ArrowLeft,
  Plus,
  Trash2,
  CheckCircle2,
  Lock,
  ShieldCheck,
  AlertTriangle,
  Sparkles,
  Calendar,
  User,
  Wrench,
  DollarSign,
  RefreshCw,
  Compass,
  Zap,
  Flag,
  BarChart3,
  X,
  EyeOff,
  Link2,
} from 'lucide-react';

interface NexoPluginProps {
  nexoState: NexoProjectState;
  onUpdateNexoState: (next: NexoProjectState) => void;
  onSyncToGantt: (nexoState: NexoProjectState) => void;
  resources: Resource[];
  activeWeekDays: number[];
  exceptions: CalendarException[];
}

export const defaultNexoState: NexoProjectState = {
  pointB: {
    deliverable: 'Lançamento Oficial do Novo Módulo de Logística & Transporte em Produção',
    successMetric: '100% das análises de expedição replicadas com 0 erros críticos e tempo de resposta < 2s',
    targetDate: '2026-11-13',
    isCalibrated: true,
  },
  milestones: [
    {
      id: 'nx_1',
      title: 'Extrair e auditar a nova base de dados bruta com a equipe responsável',
      leadTimeDays: 1,
      deadline: '2026-10-21',
      owner: 'Gerente de Projeto',
      resources: 'Acesso ao banco SQL, Planilha de Validação',
      budget: 1200,
      completed: false,
      checklist: [
        { id: 'chk_1', text: 'Solicitar exportação atualizada da base', done: true },
        { id: 'chk_2', text: 'Validar integridade das colunas obrigatórias', done: false },
      ],
    },
    {
      id: 'nx_2',
      title: 'Tratar dados e garantir que a base esteja no nível correto de granularidade',
      leadTimeDays: 1,
      deadline: '2026-10-27',
      owner: 'Arquiteto de Software',
      resources: 'Scripts Python/ETL, Ambiente de Staging',
      budget: 2400,
      completed: false,
      checklist: [],
    },
    {
      id: 'nx_3',
      title: 'Entregar análise consolidada da Expedição + Lista de investigação validada',
      leadTimeDays: 1,
      deadline: '2026-11-03',
      owner: 'Desenvolvedor Backend',
      resources: 'Dashboard BI, Relatório de Anomalias',
      budget: 3500,
      completed: false,
      checklist: [],
    },
    {
      id: 'nx_4',
      title: 'Replicar análise da Expedição para o Transporte e homologar indicadores finais',
      leadTimeDays: 1,
      deadline: '2026-11-11',
      owner: 'Especialista de QA',
      resources: 'Ambiente de Homologação, Checklist de QA',
      budget: 2800,
      completed: false,
      checklist: [],
    },
  ],
  reachedPointA: true,
  logicValidated: true,
  ignitionApproved: false,
  scheduleDirection: 'backward',
  activePhase: 1,
  roleView: 'architect',
  isFocusModeNewProject: false,
  retrospectives: [],
};

/**
 * Regra 5 — Prevenção de Loop Infinito no Nexo:
 * Detecta referências circulares diretas ou indiretas entre Milestones (1..N).
 */
function detectNexoCircularDependency(
  milestones: NexoMilestone[],
  targetId?: string,
  candidatePredText?: string
): { hasCycle: boolean; message?: string } {
  const n = milestones.length;
  if (n === 0) return { hasCycle: false };

  const getEffectivePreds = (idx: number): number[] => {
    const m = milestones[idx];
    const raw =
      targetId && m.id === targetId && candidatePredText !== undefined
        ? candidatePredText
        : m.predecessorText !== undefined
          ? m.predecessorText
          : idx > 0
            ? String(idx)
            : '';
    return parsePredecessors(raw).map((p) => p.predId);
  };

  for (let i = 0; i < n; i++) {
    const rowNum = i + 1;
    const preds = getEffectivePreds(i);
    if (preds.includes(rowNum)) {
      return {
        hasCycle: true,
        message: `Referência circular bloqueada no Nexo: o Milestone #${rowNum} não pode depender de si mesmo.`,
      };
    }
  }

  const state = new Array<number>(n + 1).fill(0);
  const stack: number[] = [];

  const dfs = (u: number): { found: boolean; cycle?: number[] } => {
    state[u] = 1;
    stack.push(u);
    const preds = getEffectivePreds(u - 1);
    for (const v of preds) {
      if (v < 1 || v > n) continue;
      if (state[v] === 1) {
        const idx = stack.indexOf(v);
        const cycle = idx >= 0 ? [...stack.slice(idx), v] : [u, v, u];
        return { found: true, cycle };
      }
      if (state[v] === 0) {
        const r = dfs(v);
        if (r.found) return r;
      }
    }
    stack.pop();
    state[u] = 2;
    return { found: false };
  };

  for (let i = 1; i <= n; i++) {
    if (state[i] === 0) {
      const r = dfs(i);
      if (r.found && r.cycle) {
        return {
          hasCycle: true,
          message: `Referência circular bloqueada no Nexo (${r.cycle.map((c) => `#${c}`).join(' ➔ ')}): dois ou mais Milestones dependem mutuamente um do outro.`,
        };
      }
    }
  }

  return { hasCycle: false };
}

/**
 * Calcula automaticamente as datas de Início (`startDate`) e Término (`deadline`)
 * de todos os Milestones do Nexo respeitando:
 * - Modo 'backward' (Agendamento Reverso ALAP — Regras 1, 2, 3, 4 e 5)
 * - Modo 'forward' (Agendamento a partir da Data de Início ASAP)
 */
function computeNexoSchedule(
  list: NexoMilestone[],
  direction: ScheduleDirection,
  targetEndDate: string,
  projectStartDate: string,
  activeWeekDays: number[],
  exceptions: CalendarException[]
): NexoMilestone[] {
  if (!list || list.length === 0) return [];
  const n = list.length;
  const updated: NexoMilestone[] = list.map((m) => ({
    ...m,
    leadTimeDays: Math.max(1, Number(m.leadTimeDays) || 1),
  }));

  const getPredsForIndex = (idx: number) => {
    const m = updated[idx];
    const raw = m.predecessorText !== undefined ? m.predecessorText : idx > 0 ? String(idx) : '';
    return parsePredecessors(raw).filter((p) => p.predId >= 1 && p.predId <= n && p.predId !== idx + 1);
  };

  if (direction === 'forward') {
    const baseStart = toWorkDay(
      parseISODate(projectStartDate || toISODate(new Date())),
      activeWeekDays,
      exceptions
    );
    updated.forEach((m) => {
      const end = addWorkDays(baseStart, m.leadTimeDays, activeWeekDays, exceptions);
      m.startDate = toISODate(baseStart);
      m.deadline = toISODate(end);
    });

    let changed = true;
    let pass = 0;
    while (changed && pass < n + 5) {
      changed = false;
      pass++;
      for (let i = 0; i < n; i++) {
        const m = updated[i];
        const preds = getPredsForIndex(i);
        if (preds.length === 0) {
          const st = baseStart;
          const en = addWorkDays(st, m.leadTimeDays, activeWeekDays, exceptions);
          const sIso = toISODate(st);
          const eIso = toISODate(en);
          if (m.startDate !== sIso || m.deadline !== eIso) {
            m.startDate = sIso;
            m.deadline = eIso;
            changed = true;
          }
          continue;
        }

        let maxStart: Date | null = null;
        let maxEnd: Date | null = null;
        for (const pred of preds) {
          const predM = updated[pred.predId - 1];
          if (!predM || !predM.deadline) continue;
          const lagDays = resolveLagWorkDays(pred, predM.leadTimeDays);
          if (pred.type === 'II') {
            const pStart = parseISODate(predM.startDate || predM.deadline);
            const reqStart = offsetWorkDays(pStart, lagDays, activeWeekDays, exceptions, 'next');
            if (!maxStart || reqStart > maxStart) maxStart = reqStart;
          } else if (pred.type === 'TT') {
            const pEnd = parseISODate(predM.deadline);
            const reqEnd = offsetWorkDays(pEnd, lagDays, activeWeekDays, exceptions, 'prev');
            if (!maxEnd || reqEnd > maxEnd) maxEnd = reqEnd;
          } else if (pred.type === 'IT') {
            const pStart = parseISODate(predM.startDate || predM.deadline);
            const reqEnd = offsetWorkDays(pStart, lagDays, activeWeekDays, exceptions, 'prev');
            if (!maxEnd || reqEnd > maxEnd) maxEnd = reqEnd;
          } else {
            const pEnd = parseISODate(predM.deadline);
            const reqStart = offsetWorkDays(pEnd, 1 + lagDays, activeWeekDays, exceptions, 'prev');
            if (!maxStart || reqStart > maxStart) maxStart = reqStart;
          }
        }

        if (maxEnd && !maxStart) {
          const st = subtractWorkDays(maxEnd, m.leadTimeDays, activeWeekDays, exceptions);
          const sIso = toISODate(st);
          const eIso = toISODate(maxEnd);
          if (m.startDate !== sIso || m.deadline !== eIso) {
            m.startDate = sIso;
            m.deadline = eIso;
            changed = true;
          }
        } else if (maxStart) {
          let en = addWorkDays(maxStart, m.leadTimeDays, activeWeekDays, exceptions);
          let st = maxStart;
          if (maxEnd && en < maxEnd) {
            en = maxEnd;
            st = subtractWorkDays(en, m.leadTimeDays, activeWeekDays, exceptions);
          }
          const sIso = toISODate(st);
          const eIso = toISODate(en);
          if (m.startDate !== sIso || m.deadline !== eIso) {
            m.startDate = sIso;
            m.deadline = eIso;
            changed = true;
          }
        }
      }
    }
    return updated;
  }

  // Modo 'backward' (De Trás para Frente / ALAP):
  if (!targetEndDate) return updated;
  const anchorLimit = toPrevWorkDay(parseISODate(targetEndDate), activeWeekDays, exceptions);

  // Regra 3 — Mapear o inverso na memória (Sucessoras de cada Milestone)
  const successorsMap = new Map<number, { succNum: number; predLink: ParsedPredecessor }[]>();
  for (let i = 1; i <= n; i++) successorsMap.set(i, []);

  for (let i = 0; i < n; i++) {
    const succNum = i + 1;
    const preds = getPredsForIndex(i);
    for (const predLink of preds) {
      const arr = successorsMap.get(predLink.predId) || [];
      arr.push({ succNum, predLink });
      successorsMap.set(predLink.predId, arr);
    }
  }

  // Inicializar na âncora final (Regra 1 & Regra 2)
  updated.forEach((m) => {
    const startDt = subtractWorkDays(anchorLimit, m.leadTimeDays, activeWeekDays, exceptions);
    m.deadline = toISODate(anchorLimit);
    m.startDate = toISODate(startDt);
  });

  // Propagar de trás para frente (da última tarefa até a primeira) respeitando Regra 1, 2, 3 e 4 (Gargalo)
  let changed = true;
  let pass = 0;
  while (changed && pass < n + 5) {
    changed = false;
    pass++;

    for (let i = n - 1; i >= 0; i--) {
      const rowNum = i + 1;
      const m = updated[i];
      const succs = successorsMap.get(rowNum) || [];

      if (succs.length === 0) {
        // Regra 1 — Tarefa Final (Âncora): termina exatamente na Data Limite do Projeto
        const st = subtractWorkDays(anchorLimit, m.leadTimeDays, activeWeekDays, exceptions);
        const sIso = toISODate(st);
        const eIso = toISODate(anchorLimit);
        if (m.startDate !== sIso || m.deadline !== eIso) {
          m.startDate = sIso;
          m.deadline = eIso;
          changed = true;
        }
        continue;
      }

      // Regra 3 & Regra 4 (Múltiplas Dependentes / Regra do Gargalo):
      let minAllowedEnd: Date | null = null;
      for (const { succNum, predLink } of succs) {
        const succM = updated[succNum - 1];
        if (!succM) continue;
        const lagDays = resolveLagWorkDays(predLink, m.leadTimeDays);
        let candidateEnd: Date;

        if (predLink.type === 'TT') {
          const succEnd = parseISODate(succM.deadline);
          candidateEnd = offsetWorkDays(succEnd, -lagDays, activeWeekDays, exceptions, 'prev');
        } else if (predLink.type === 'II') {
          const succStart = parseISODate(succM.startDate || succM.deadline);
          const maxStart = offsetWorkDays(succStart, -lagDays, activeWeekDays, exceptions, 'prev');
          candidateEnd = addWorkDays(maxStart, m.leadTimeDays, activeWeekDays, exceptions);
        } else if (predLink.type === 'IT') {
          const succEnd = parseISODate(succM.deadline);
          const maxStart = offsetWorkDays(succEnd, -lagDays, activeWeekDays, exceptions, 'prev');
          candidateEnd = addWorkDays(maxStart, m.leadTimeDays, activeWeekDays, exceptions);
        } else {
          const succStart = parseISODate(succM.startDate || succM.deadline);
          candidateEnd = offsetWorkDays(
            succStart,
            -(1 + lagDays),
            activeWeekDays,
            exceptions,
            'prev'
          );
        }

        if (!minAllowedEnd || candidateEnd < minAllowedEnd) {
          minAllowedEnd = candidateEnd;
        }
      }

      if (minAllowedEnd) {
        // Regra 2 — Cálculo da Duração (Inclusivo)
        const finalStart = subtractWorkDays(minAllowedEnd, m.leadTimeDays, activeWeekDays, exceptions);
        const sIso = toISODate(finalStart);
        const eIso = toISODate(minAllowedEnd);
        if (m.startDate !== sIso || m.deadline !== eIso) {
          m.startDate = sIso;
          m.deadline = eIso;
          changed = true;
        }
      }
    }
  }

  return updated;
}

export const NexoPlugin: React.FC<NexoPluginProps> = ({
  nexoState,
  onUpdateNexoState,
  onSyncToGantt,
  resources,
  activeWeekDays,
  exceptions,
}) => {
  // Estados locais para inputs rápidos (Keyboard-First)
  const [reverseStepInput, setReverseStepInput] = useState<string>('');
  const [selectedMilestoneId, setSelectedMilestoneId] = useState<string | null>(null);
  const [gapInsertIndex, setGapInsertIndex] = useState<number | null>(null);
  const [gapStepTitle, setGapStepTitle] = useState<string>('');
  const [chronologicalOrderInPhase3, setChronologicalOrderInPhase3] = useState<boolean>(true);
  const [gateAlertMessage, setGateAlertMessage] = useState<string | null>(null);

  const reverseInputRef = useRef<HTMLInputElement | null>(null);
  const gapInputRef = useRef<HTMLInputElement | null>(null);

  const {
    pointB,
    milestones,
    reachedPointA,
    logicValidated,
    activePhase,
    isFocusModeNewProject,
  } = nexoState;

  const scheduleDirection: ScheduleDirection = nexoState.scheduleDirection || 'backward';
  const projectStartDate: string = nexoState.projectStartDate || toISODate(new Date());
  const todayIso = toISODate(new Date());

  // Calcula datas efetivas em tempo real conforme o modo (Backward ALAP ou Forward ASAP)
  const scheduledMilestones = computeNexoSchedule(
    milestones,
    scheduleDirection,
    pointB.targetDate,
    projectStartDate,
    activeWeekDays,
    exceptions
  );

  // Alerta de Prazo Estourado (Item 4 de UX/UI): verifica se no modo Reverso alguma etapa precisaria iniciar no passado
  const overdueMilestones =
    scheduleDirection === 'backward'
      ? scheduledMilestones.filter(
          (m) => !m.completed && Boolean(m.startDate && m.startDate < todayIso)
        )
      : [];
  const earliestRequiredStartDate =
    overdueMilestones.length > 0
      ? overdueMilestones.reduce(
          (min, m) => (!min || (m.startDate && m.startDate < min) ? m.startDate || min : min),
          ''
        )
      : null;

  // =========================================================
  // Cálculo de Travas de Processo (Gates do Perfil Lobo)
  // =========================================================
  const isPointBComplete =
    pointB.deliverable.trim().length > 0 &&
    pointB.successMetric.trim().length > 0 &&
    pointB.targetDate.trim().length > 0;

  const hasMilestones = milestones.length > 0;
  const isPhase2Complete = isPointBComplete && hasMilestones && reachedPointA;
  const isPhase3Unlocked = isPhase2Complete;
  const isPhase4Unlocked = isPhase2Complete;

  const milestonesWithDeadlineCount = milestones.filter(
    (m) => m.deadline && m.deadline.trim().length > 0
  ).length;
  const allMilestonesHaveDeadline =
    hasMilestones && milestonesWithDeadlineCount === milestones.length;

  // Trava estrita para o Modo Ignição (Fase 5) e Visão Executor:
  // "O sistema não permite entrar no modo de execução se houver um Milestone sem prazo
  // ou se a Fase 3 (Validação Lógica) não tiver sido marcada como revisada."
  const canEnterExecution =
    isPointBComplete &&
    hasMilestones &&
    reachedPointA &&
    logicValidated &&
    allMilestonesHaveDeadline;

  const totalBudget = milestones.reduce((acc, m) => acc + (Number(m.budget) || 0), 0);

  // Atalhos de Teclado (Keyboard-First): Cmd/Ctrl + Setas para reordenar na Fase 3
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (activePhase === 3 && selectedMilestoneId && (e.ctrlKey || e.metaKey)) {
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          handleMoveMilestone(selectedMilestoneId, 'up');
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          handleMoveMilestone(selectedMilestoneId, 'down');
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activePhase, selectedMilestoneId, milestones]);

  // Auto-focus no input do Gap Finder
  useEffect(() => {
    if (gapInsertIndex !== null && gapInputRef.current) {
      gapInputRef.current.focus();
    }
  }, [gapInsertIndex]);

  const showGateAlert = (msg: string) => {
    setGateAlertMessage(msg);
    setTimeout(() => {
      setGateAlertMessage(null);
    }, 4500);
  };

  // =========================================================
  // Navegação Controlada por Gates
  // =========================================================
  const handleSelectPhase = (phase: NexoPhase) => {
    if (phase === 1) {
      onUpdateNexoState({ ...nexoState, activePhase: 1 });
      return;
    }
    if (phase >= 2 && !isPointBComplete) {
      showGateAlert(
        'Trava de Processo (Gate 1): Preencha o Entregável, a Métrica de Sucesso e a Data-Limite Final do Ponto B antes de avançar.'
      );
      return;
    }
    if (phase >= 3 && !isPhase2Complete) {
      showGateAlert(
        'Trava de Processo (Gate 2): Construa pelo menos 1 passo no Roadmap Reverso e clique em "Cheguei no Dia de Hoje (Ponto A)" para liberar a Auditoria.'
      );
      return;
    }
    if (phase === 4 && !logicValidated) {
      showGateAlert(
        'Trava de Processo (Gate 3): Marque a Fase 3 (Validação Lógica A → B) como revisada antes de avançar para a Matriz de Milestones.'
      );
      return;
    }

    onUpdateNexoState({
      ...nexoState,
      activePhase: phase,
      isFocusModeNewProject: false,
      roleView: 'architect',
    });
  };

  const handleFinalizeAndSyncGantt = () => {
    const syncedState: NexoProjectState = {
      ...nexoState,
      milestones: scheduledMilestones,
      scheduleDirection,
    };
    const withDeadlines = scheduledMilestones.filter(
      (m) => m.deadline && m.deadline.trim().length > 0
    ).length;
    const allReady =
      isPointBComplete &&
      scheduledMilestones.length > 0 &&
      reachedPointA &&
      logicValidated &&
      withDeadlines === scheduledMilestones.length;

    if (!allReady) {
      const reasons: string[] = [];
      if (!logicValidated) reasons.push('marcar a Fase 3 (Validação Lógica A → B) como revisada');
      if (withDeadlines < scheduledMilestones.length)
        reasons.push(
          `definir o prazo de todos os Milestones (${withDeadlines}/${scheduledMilestones.length} preenchidos)`
        );
      showGateAlert(
        `Trava de Processo (Gate): Para sincronizar os passos com o Gantt com clareza total, você precisa ${reasons.join(' e ')}.`
      );
      return;
    }
    onUpdateNexoState(syncedState);
    onSyncToGantt(syncedState);
  };

  // =========================================================
  // Ações de Projeto (Novo Projeto / Exemplo / Ponto B)
  // =========================================================
  const handleStartNewProjectFocus = () => {
    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + 30);
    onUpdateNexoState({
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
      isFocusModeNewProject: true, // Escurece o menu lateral e foca exclusivamente no Canvas de Ponto B
      retrospectives: [],
    });
  };

  const handleLoadGuidedExample = () => {
    onUpdateNexoState({
      ...defaultNexoState,
      isFocusModeNewProject: false,
    });
  };

  const handleUpdatePointB = (updates: Partial<typeof pointB>) => {
    const nextPointB = { ...pointB, ...updates };
    nextPointB.isCalibrated =
      nextPointB.deliverable.trim().length > 0 &&
      nextPointB.successMetric.trim().length > 0 &&
      nextPointB.targetDate.trim().length > 0;

    const nextMilestones =
      updates.targetDate !== undefined && milestones.length > 0
        ? computeNexoSchedule(
            milestones,
            scheduleDirection,
            nextPointB.targetDate,
            projectStartDate,
            activeWeekDays,
            exceptions
          )
        : milestones;

    onUpdateNexoState({
      ...nexoState,
      pointB: nextPointB,
      milestones: nextMilestones,
    });
  };

  // =========================================================
  // Fase 2: Engenharia Reversa (B -> A)
  // =========================================================
  const handleAddReverseStep = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = reverseStepInput.trim();
    if (!trimmed) return;

    // Calcula uma data reversa sugerida inicial com base no elo seguinte (ou Ponto B)
    const anchorDateStr =
      milestones.length > 0 && milestones[0].deadline
        ? milestones[0].deadline
        : pointB.targetDate || toISODate(new Date());

    const anchorDate = parseISODate(anchorDateStr);
    const suggestedDeadline = toISODate(
      subtractWorkDays(anchorDate, 1, activeWeekDays, exceptions)
    );

    const newMilestone: NexoMilestone = {
      id: `nx_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      title: trimmed,
      leadTimeDays: 1,
      deadline: suggestedDeadline,
      owner: '',
      resources: '',
      budget: 0,
      completed: false,
      checklist: [],
    };

    // Na engenharia reversa, cada resposta aconteceu IMEDIATAMENTE ANTES do último bloco criado,
    // logo entra no início da lista cronológica (mais próximo do Ponto A - Hoje)
    const nextMilestones = [newMilestone, ...milestones];

    onUpdateNexoState({
      ...nexoState,
      milestones: nextMilestones,
      logicValidated: false,
    });
    setReverseStepInput('');
    if (reverseInputRef.current) {
      reverseInputRef.current.focus();
    }
  };

  const handleReachPointA = () => {
    if (milestones.length === 0) {
      showGateAlert('Adicione pelo menos uma etapa antes de marcar que chegou ao Dia de Hoje (Ponto A).');
      return;
    }
    onUpdateNexoState({
      ...nexoState,
      reachedPointA: true,
      activePhase: 3,
    });
    setChronologicalOrderInPhase3(true);
  };

  // =========================================================
  // Fase 3: O Validador Lógico (Auditoria A -> B & Gap Finder)
  // =========================================================
  const handleInsertIntermediateStep = (insertAtIndex: number) => {
    const trimmed = gapStepTitle.trim();
    if (!trimmed) return;

    const refDateStr =
      milestones[insertAtIndex]?.deadline ||
      milestones[insertAtIndex - 1]?.deadline ||
      pointB.targetDate ||
      toISODate(new Date());

    const newStep: NexoMilestone = {
      id: `nx_gap_${Date.now()}`,
      title: trimmed,
      leadTimeDays: 1,
      deadline: refDateStr,
      owner: '',
      resources: '',
      budget: 0,
      completed: false,
      checklist: [],
    };

    const nextMilestones = [
      ...milestones.slice(0, insertAtIndex),
      newStep,
      ...milestones.slice(insertAtIndex),
    ];

    onUpdateNexoState({
      ...nexoState,
      milestones: nextMilestones,
      logicValidated: false, // Exige nova confirmação após inserir etapa intermediária
    });

    setGapStepTitle('');
    setGapInsertIndex(null);
    setSelectedMilestoneId(newStep.id);
  };

  const handleMoveMilestone = (id: string, direction: 'up' | 'down') => {
    const idx = milestones.findIndex((m) => m.id === id);
    if (idx < 0) return;
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= milestones.length) return;

    const copy = [...milestones];
    const [item] = copy.splice(idx, 1);
    copy.splice(targetIdx, 0, item);

    onUpdateNexoState({
      ...nexoState,
      milestones: copy,
      logicValidated: false,
    });
  };

  const handleDeleteMilestone = (id: string) => {
    const next = milestones.filter((m) => m.id !== id);
    onUpdateNexoState({
      ...nexoState,
      milestones: next,
      reachedPointA: next.length > 0 ? nexoState.reachedPointA : false,
      logicValidated: false,
    });
  };

  const handleUpdateMilestone = (id: string, updates: Partial<NexoMilestone>) => {
    // Regra 5 — Prevenção de Loop Infinito: bloquear referência circular antes de atualizar Predecessoras
    if (updates.predecessorText !== undefined) {
      const cycleCheck = detectNexoCircularDependency(milestones, id, updates.predecessorText);
      if (cycleCheck.hasCycle) {
        showGateAlert(
          cycleCheck.message ||
            'Referência circular bloqueada: dois Milestones não podem depender mutuamente um do outro.'
        );
        return;
      }
    }

    const rawNext = milestones.map((m) => (m.id === id ? { ...m, ...updates } : m));
    const shouldRecalc =
      updates.leadTimeDays !== undefined || updates.predecessorText !== undefined;
    const next = shouldRecalc
      ? computeNexoSchedule(
          rawNext,
          scheduleDirection,
          pointB.targetDate,
          projectStartDate,
          activeWeekDays,
          exceptions
        )
      : rawNext;

    onUpdateNexoState({
      ...nexoState,
      milestones: next,
    });
  };

  const handleChangeNexoScheduleDirection = (
    nextDirection: ScheduleDirection,
    nextStartDate?: string
  ) => {
    const effStart = nextStartDate !== undefined ? nextStartDate : projectStartDate;
    const recalculated = computeNexoSchedule(
      milestones,
      nextDirection,
      pointB.targetDate,
      effStart,
      activeWeekDays,
      exceptions
    );
    onUpdateNexoState({
      ...nexoState,
      scheduleDirection: nextDirection,
      projectStartDate: effStart,
      milestones: recalculated,
    });
  };

  // =========================================================
  // Fase 4: Cálculo Automático de Cronograma Reverso (B -> A)
  // =========================================================
  const handleCalculateReverseSchedule = () => {
    if (milestones.length === 0) return;
    if (scheduleDirection === 'backward' && !pointB.targetDate) return;

    const updated = computeNexoSchedule(
      milestones,
      scheduleDirection,
      pointB.targetDate,
      projectStartDate,
      activeWeekDays,
      exceptions
    );

    onUpdateNexoState({
      ...nexoState,
      milestones: updated,
    });
  };

  // Referência dinâmica para a pergunta da Engenharia Reversa (Fase 2)
  const latestReverseAnchorTitle =
    milestones.length === 0 ? pointB.deliverable || 'o Ponto B' : milestones[0].title;
  const latestReverseAnchorDate =
    milestones.length === 0
      ? formatDatePTBR(pointB.targetDate)
      : formatDatePTBR(milestones[0].deadline) || formatDatePTBR(pointB.targetDate);

  return (
    <div className="nexo-plugin-root">
      {/* =========================================================
          BARRA SUPERIOR DO NEXO (Estética "Zero Ruído" - Linear/Obsidian)
          ========================================================= */}
      <div className="nexo-topbar">
        <div className="nexo-brand-group">
          <div className="nexo-logo-badge">
            <Compass size={16} />
            <span>NEXO</span>
          </div>
          <span className="nexo-brand-divider">|</span>
          <span className="nexo-brand-subtitle">
            Arquitetura de Projetos &amp; Clareza Executiva
          </span>
          {pointB.isCalibrated && (
            <span className="nexo-meta-active-pill" title="Meta Final Calibrada">
              <Target size={12} />
              <span>Meta: {formatDatePTBR(pointB.targetDate)}</span>
            </span>
          )}
        </div>

        {/* Ações Rápidas */}
        <div className="nexo-top-actions">
          <button
            type="button"
            className="nexo-btn-ghost"
            onClick={handleLoadGuidedExample}
            title="Carregar projeto de exemplo estruturado nas 4 fases"
          >
            <Sparkles size={13} />
            <span>Carregar Exemplo</span>
          </button>
          <button
            type="button"
            className="nexo-btn-secondary"
            onClick={handleFinalizeAndSyncGantt}
            disabled={!isPointBComplete || milestones.length === 0}
            title="Converter os Milestones e o Ponto B do Nexo em tarefas no Gráfico de Gantt"
          >
            <BarChart3 size={13} />
            <span>Sincronizar com Gantt</span>
          </button>
          <button
            type="button"
            className="nexo-btn-primary"
            onClick={handleStartNewProjectFocus}
            title="Iniciar um Novo Projeto no Calibrador de Foco (escurece o menu lateral)"
          >
            <Plus size={14} />
            <span>Novo Projeto</span>
          </button>
        </div>
      </div>

      {/* Alerta de Trava de Processo (Gate Notification) */}
      {gateAlertMessage && (
        <div className="nexo-gate-alert-banner">
          <AlertTriangle size={16} className="gate-alert-icon" />
          <span>{gateAlertMessage}</span>
          <button type="button" onClick={() => setGateAlertMessage(null)} className="gate-alert-close">
            <X size={14} />
          </button>
        </div>
      )}

      {/* =========================================================
          CORPO PRINCIPAL DO NEXO (Sidebar de 4 Fases + Canvas)
          ========================================================= */}
      <div className="nexo-workspace-body">
        {/* MENU LATERAL DAS 4 FASES SEQUENCIAIS (Escurecido no Modo Foco de Novo Projeto) */}
        <aside className={`nexo-phases-sidebar ${isFocusModeNewProject ? 'dimmed-focus-mode' : ''}`}>
            <div className="nexo-sidebar-header">
              <span className="sidebar-kicker">METODOLOGIA EM 4 ETAPAS</span>
              <h4>Fluxo Sequencial Destravável</h4>
            </div>

            <div className="nexo-phases-nav">
              {/* Fase 1 */}
              <button
                type="button"
                className={`nexo-phase-item ${activePhase === 1 ? 'active' : ''} ${isPointBComplete ? 'completed' : ''}`}
                onClick={() => handleSelectPhase(1)}
              >
                <div className="phase-step-indicator">
                  {isPointBComplete ? <CheckCircle2 size={16} /> : <span>1</span>}
                </div>
                <div className="phase-item-text">
                  <span className="phase-title">1. Calibrador de Foco</span>
                  <span className="phase-desc">Definição do Ponto B (Meta)</span>
                </div>
              </button>

              {/* Fase 2 */}
              <button
                type="button"
                className={`nexo-phase-item ${activePhase === 2 ? 'active' : ''} ${isPhase2Complete ? 'completed' : ''} ${!isPointBComplete ? 'locked' : ''}`}
                onClick={() => handleSelectPhase(2)}
              >
                <div className="phase-step-indicator">
                  {!isPointBComplete ? (
                    <Lock size={14} />
                  ) : isPhase2Complete ? (
                    <CheckCircle2 size={16} />
                  ) : (
                    <span>2</span>
                  )}
                </div>
                <div className="phase-item-text">
                  <span className="phase-title">2. Engenharia Reversa</span>
                  <span className="phase-desc">Construtor Roadmap B → A</span>
                </div>
              </button>

              {/* Fase 3 */}
              <button
                type="button"
                className={`nexo-phase-item ${activePhase === 3 ? 'active' : ''} ${logicValidated ? 'completed' : ''} ${!isPhase3Unlocked ? 'locked' : ''}`}
                onClick={() => handleSelectPhase(3)}
              >
                <div className="phase-step-indicator">
                  {!isPhase3Unlocked ? (
                    <Lock size={14} />
                  ) : logicValidated ? (
                    <CheckCircle2 size={16} />
                  ) : (
                    <span>3</span>
                  )}
                </div>
                <div className="phase-item-text">
                  <span className="phase-title">3. Validador Lógico</span>
                  <span className="phase-desc">Auditoria A → B &amp; Gap Finder</span>
                </div>
              </button>

              {/* Fase 4 */}
              <button
                type="button"
                className={`nexo-phase-item ${activePhase === 4 ? 'active' : ''} ${allMilestonesHaveDeadline && isPhase4Unlocked ? 'completed' : ''} ${!isPhase4Unlocked || !logicValidated ? 'locked' : ''}`}
                onClick={() => handleSelectPhase(4)}
              >
                <div className="phase-step-indicator">
                  {!isPhase4Unlocked || !logicValidated ? (
                    <Lock size={14} />
                  ) : allMilestonesHaveDeadline ? (
                    <CheckCircle2 size={16} />
                  ) : (
                    <span>4</span>
                  )}
                </div>
                <div className="phase-item-text">
                  <span className="phase-title">4. Matriz de Milestones</span>
                  <span className="phase-desc">Clareza Final &amp; Sincronia Gantt</span>
                </div>
              </button>
            </div>

            {/* Painel de Status das Travas (Gates do Perfil Lobo) */}
            <div className="nexo-gates-box">
              <div className="gates-box-header">
                <ShieldCheck size={14} />
                <span>Travas de Processo (Gates)</span>
              </div>
              <ul className="gates-checklist">
                <li className={isPointBComplete ? 'pass' : 'pending'}>
                  <span>{isPointBComplete ? '✓' : '○'}</span>
                  <span>Ponto B convertido em Meta</span>
                </li>
                <li className={isPhase2Complete ? 'pass' : 'pending'}>
                  <span>{isPhase2Complete ? '✓' : '○'}</span>
                  <span>Caminho reverso até Hoje (Ponto A)</span>
                </li>
                <li className={logicValidated ? 'pass' : 'pending'}>
                  <span>{logicValidated ? '✓' : '○'}</span>
                  <span>Fase 3 (Auditoria A → B) revisada</span>
                </li>
                <li className={allMilestonesHaveDeadline ? 'pass' : 'pending'}>
                  <span>{allMilestonesHaveDeadline ? '✓' : '○'}</span>
                  <span>
                    Todos os Milestones com prazo ({milestonesWithDeadlineCount}/{milestones.length})
                  </span>
                </li>
              </ul>
            </div>

            {isFocusModeNewProject && (
              <div className="sidebar-focus-overlay-hint">
                <EyeOff size={15} />
                <span>Menu escurecido para foco absoluto na definição do Ponto B.</span>
                <button
                  type="button"
                  className="nexo-btn-unfocus"
                  onClick={() =>
                    onUpdateNexoState({ ...nexoState, isFocusModeNewProject: false })
                  }
                >
                  Restaurar menu lateral
                </button>
              </div>
            )}
          </aside>

        {/* =========================================================
            ÁREA CENTRAL DE TRABALHO (CANVAS DA FASE ATIVA)
            ========================================================= */}
        <main className={`nexo-main-canvas ${isFocusModeNewProject && activePhase === 1 ? 'focus-spotlight-bg' : ''}`}>
          {/* =========================================================
              FASE 1: O CALIBRADOR DE FOCO (DEFINIÇÃO DO PONTO B)
              ========================================================= */}
          {activePhase === 1 && (
            <div className="nexo-stage-container phase-1-container">
              <div className="nexo-pointb-card">
                <div className="pointb-card-header">
                  <div className="pointb-phase-tag">FASE 1 • O CALIBRADOR DE FOCO (DEFINIÇÃO DO PONTO B)</div>
                  <div className={`pointb-status-badge ${isPointBComplete ? 'calibrated' : 'dream'}`}>
                    {isPointBComplete ? (
                      <>
                        <Target size={14} />
                        <span>META CALIBRADA (PONTO B ATIVO)</span>
                      </>
                    ) : (
                      <>
                        <Compass size={14} />
                        <span>SONHO / OBJETIVO (AGUARDANDO PRAZO &amp; CRITÉRIO)</span>
                      </>
                    )}
                  </div>
                </div>

                <h2 className="pointb-title">Canvas de Ponto B: Onde exatamente este projeto termina?</h2>
                <p className="pointb-subtitle">
                  Planejar sem clareza do destino é como arrumar uma mala sem saber se vai para o frio ou
                  para o calor. Responda às 3 perguntas analíticas abaixo para converter seu objetivo em uma{' '}
                  <strong>Meta verificável</strong>.
                </p>

                <div className="pointb-inputs-grid">
                  {/* Pergunta 1 */}
                  <div className="nexo-field-group">
                    <label>
                      <span className="field-num">1</span>
                      <span>Qual é o entregável final tangível?</span>
                      <small>(O que estará pronto e visível quando o projeto acabar?)</small>
                    </label>
                    <input
                      type="text"
                      className="nexo-input-large"
                      placeholder="Ex: Livro publicado na editora / Sistema de Logística em produção..."
                      value={pointB.deliverable}
                      onChange={(e) => handleUpdatePointB({ deliverable: e.target.value })}
                      autoFocus
                    />
                  </div>

                  {/* Pergunta 2 */}
                  <div className="nexo-field-group">
                    <label>
                      <span className="field-num">2</span>
                      <span>Qual é a métrica de sucesso verificável?</span>
                      <small>(Para o perfil Lobo, objetivos subjetivos não funcionam; defina o critério exato)</small>
                    </label>
                    <input
                      type="text"
                      className="nexo-input-large"
                      placeholder="Ex: 1.000 exemplares impressos e pré-venda ativa / 100% dos fluxos auditados sem erro..."
                      value={pointB.successMetric}
                      onChange={(e) => handleUpdatePointB({ successMetric: e.target.value })}
                    />
                  </div>

                  {/* Pergunta 3 */}
                  <div className="nexo-field-group">
                    <label>
                      <span className="field-num">3</span>
                      <span>Qual é a Data-Limite Final?</span>
                      <small>(Sem prazo, o objetivo é apenas um sonho; ao inserir o prazo, vira uma Meta)</small>
                    </label>
                    <div className="pointb-date-row">
                      <input
                        type="date"
                        className="nexo-input-date"
                        value={pointB.targetDate}
                        onChange={(e) => handleUpdatePointB({ targetDate: e.target.value })}
                      />
                      {pointB.targetDate && (
                        <div className="meta-conversion-callout">
                          <CheckCircle2 size={15} />
                          <span>
                            Prazo fixado para <strong>{formatDatePTBR(pointB.targetDate)}</strong> — Card
                            convertido em <strong>Meta</strong>!
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="pointb-card-footer">
                  <div className="pointb-footer-hint">
                    {isPointBComplete
                      ? '✓ Clareza de Ponto B extraída! Pronto para construir o Roadmap Reverso (B → A).'
                      : 'Preencha os 3 campos acima para destravar a Fase 2 (Engenharia Reversa).'}
                  </div>
                  <button
                    type="button"
                    className="nexo-btn-cta"
                    disabled={!isPointBComplete}
                    onClick={() => handleSelectPhase(2)}
                  >
                    <span>Avançar para Engenharia Reversa (B → A)</span>
                    <ArrowRight size={16} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* =========================================================
              FASE 2: ENGENHARIA REVERSA (O CONSTRUTOR DE ROADMAP B -> A)
              ========================================================= */}
          {activePhase === 2 && (
            <div className="nexo-stage-container">
              <div className="nexo-stage-header">
                <div>
                  <span className="stage-kicker">FASE 2 • ENGENHARIA REVERSA (ROADMAP DE TRÁS PARA FRENTE)</span>
                  <h3>Construtor de Roadmap Reverso (Ponto B ➔ Ponto A)</h3>
                  <p>
                    Em vez de tentar adivinhar o primeiro passo, parta do seu <strong>Ponto B</strong> fixado no
                    topo e responda repetidamente o que precisou acontecer imediatamente antes até chegar ao{' '}
                    <strong>Dia de Hoje (Ponto A)</strong>.
                  </p>
                </div>
                <div className="keyboard-hint-pill">
                  <span>⌨️ Keyboard-First: Digite e pressione</span>
                  <kbd>Enter</kbd>
                  <span>para empilhar o passo anterior</span>
                </div>
              </div>

              <div className="reverse-roadmap-timeline">
                {/* TOPO: PONTO B FIXADO */}
                <div className="roadmap-anchor-card point-b-anchor">
                  <div className="anchor-badge">🎯 PONTO B • META FINAL (TOPO DA LINHA DO TEMPO)</div>
                  <div className="anchor-main-row">
                    <h4>{pointB.deliverable}</h4>
                    <span className="anchor-date-pill">
                      <Calendar size={13} /> {formatDatePTBR(pointB.targetDate)}
                    </span>
                  </div>
                  <p className="anchor-metric">
                    <strong>Métrica de Sucesso:</strong> {pointB.successMetric}
                  </p>
                </div>

                {/* BLOCOS CONECTADOS POR SETA REVERSA (EXIBIDOS DO PONTO B PARA O PONTO A) */}
                {[...milestones].reverse().map((step, revIdx) => {
                  const chronologicalNumber = milestones.length - revIdx;
                  return (
                    <React.Fragment key={step.id}>
                      <div className="reverse-connector">
                        <ArrowUp size={16} className="reverse-arrow-icon" />
                        <span>precisou acontecer imediatamente antes</span>
                      </div>

                      <div className="reverse-step-card">
                        <div className="reverse-step-left">
                          <span className="reverse-step-badge">Passo #{chronologicalNumber}</span>
                          <input
                            type="text"
                            className="reverse-step-inline-input"
                            value={step.title}
                            onChange={(e) => handleUpdateMilestone(step.id, { title: e.target.value })}
                          />
                        </div>
                        <div className="reverse-step-actions">
                          <button
                            type="button"
                            className="nexo-icon-btn danger"
                            onClick={() => handleDeleteMilestone(step.id)}
                            title="Remover este bloco"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </React.Fragment>
                  );
                })}

                {/* PROMPT FLUTUANTE DINÂMICO */}
                <div className="reverse-connector active-prompt-connector">
                  <ArrowUp size={16} className="reverse-arrow-icon pulse" />
                  <span>qual foi o elo imediatamente anterior?</span>
                </div>

                <form className="nexo-floating-prompt-card" onSubmit={handleAddReverseStep}>
                  <div className="floating-prompt-question">
                    <Sparkles size={15} className="prompt-sparkle" />
                    <span>
                      Se em <strong>{latestReverseAnchorDate}</strong> você já concluiu{' '}
                      <strong>"{latestReverseAnchorTitle}"</strong>, o que precisou acontecer{' '}
                      <u>imediatamente antes disso</u>?
                    </span>
                  </div>
                  <div className="floating-prompt-input-row">
                    <input
                      ref={reverseInputRef}
                      type="text"
                      className="floating-prompt-input"
                      placeholder="Digite a etapa imediatamente anterior e pressione [Enter]..."
                      value={reverseStepInput}
                      onChange={(e) => setReverseStepInput(e.target.value)}
                      autoFocus
                    />
                    <button type="submit" className="nexo-btn-primary">
                      <Plus size={14} />
                      <span>Adicionar Elo (Enter)</span>
                    </button>
                  </div>
                </form>

                {/* BASE: PONTO A (HOJE) */}
                <div className="reverse-connector">
                  <ArrowUp size={16} className="reverse-arrow-icon" />
                  <span>ponto de partida atual</span>
                </div>

                <div className={`roadmap-anchor-card point-a-anchor ${reachedPointA ? 'reached' : ''}`}>
                  <div className="point-a-info">
                    <div className="anchor-badge point-a">📍 PONTO A • BASE (DIA DE HOJE)</div>
                    <h4> Ponto de Partida: Onde você está hoje</h4>
                    <p>
                      Quando o último passo adicionado acima for uma ação simples que você já pode iniciar hoje
                      ou nesta semana, clique no botão ao lado para travar o caminho e auditar a lógica.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="nexo-btn-cta"
                    disabled={milestones.length === 0}
                    onClick={handleReachPointA}
                  >
                    <Flag size={15} />
                    <span>Cheguei no Dia de Hoje (Ponto A)</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* =========================================================
              FASE 3: O VALIDADOR LÓGICO (AUDITORIA A -> B & GAP FINDER)
              ========================================================= */}
          {activePhase === 3 && (
            <div className="nexo-stage-container">
              <div className="nexo-stage-header">
                <div>
                  <span className="stage-kicker">FASE 3 • O VALIDADOR LÓGICO (AUDITORIA DE CONSISTÊNCIA)</span>
                  <h3>Auditoria de Causa e Efeito (Ponto A ➔ Ponto B)</h3>
                  <p>
                    Agora lemos o caminho de <strong>Hoje (Ponto A)</strong> para o{' '}
                    <strong>Futuro (Ponto B)</strong>. Passe o mouse entre dois blocos conectados para inserir
                    etapas intermediárias esquecidas (<em>Gap Finder</em>) ou use{' '}
                    <kbd>Ctrl + ↑/↓</kbd> para reordenar.
                  </p>
                </div>

                <div className="phase3-header-controls">
                  <button
                    type="button"
                    className="nexo-btn-secondary"
                    onClick={() => setChronologicalOrderInPhase3(!chronologicalOrderInPhase3)}
                  >
                    <RefreshCw size={13} />
                    <span>
                      {chronologicalOrderInPhase3
                        ? 'Visualizando: Ponto A ➔ Ponto B (Cronológico)'
                        : 'Visualizando: Ponto B ➔ Ponto A (Reverso)'}
                    </span>
                  </button>
                </div>
              </div>

              <div className="validator-flow-list">
                {chronologicalOrderInPhase3 ? (
                  <>
                    {/* PONTO A NO INÍCIO */}
                    <div className="validator-endpoint-node point-a">
                      <Flag size={15} />
                      <span>PONTO A (HOJE) — Início da Jornada</span>
                    </div>

                    {milestones.map((step, idx) => (
                      <React.Fragment key={step.id}>
                        {/* GAP FINDER ENTRE BLOCOS */}
                        <div className="gap-finder-zone">
                          {gapInsertIndex === idx ? (
                            <div className="gap-inline-editor">
                              <input
                                ref={gapInputRef}
                                type="text"
                                className="gap-inline-input"
                                placeholder="Nome da etapa intermediária faltante (Enter para inserir)..."
                                value={gapStepTitle}
                                onChange={(e) => setGapStepTitle(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleInsertIntermediateStep(idx);
                                  if (e.key === 'Escape') {
                                    setGapInsertIndex(null);
                                    setGapStepTitle('');
                                  }
                                }}
                              />
                              <button
                                type="button"
                                className="nexo-btn-primary small"
                                onClick={() => handleInsertIntermediateStep(idx)}
                              >
                                Inserir
                              </button>
                              <button
                                type="button"
                                className="nexo-btn-ghost small"
                                onClick={() => {
                                  setGapInsertIndex(null);
                                  setGapStepTitle('');
                                }}
                              >
                                Cancelar
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              className="gap-finder-trigger"
                              onClick={() => {
                                setGapInsertIndex(idx);
                                setGapStepTitle('');
                              }}
                            >
                              <Plus size={12} />
                              <span>+ Inserir Etapa Intermediária</span>
                            </button>
                          )}
                        </div>

                        {/* BLOCO DA ETAPA */}
                        <div
                          className={`validator-step-card ${selectedMilestoneId === step.id ? 'selected' : ''}`}
                          onClick={() => setSelectedMilestoneId(step.id)}
                          tabIndex={0}
                        >
                          <div className="validator-step-number">Etapa #{idx + 1}</div>
                          <input
                            type="text"
                            className="validator-step-input"
                            value={step.title}
                            onChange={(e) => handleUpdateMilestone(step.id, { title: e.target.value })}
                          />
                          <div className="validator-step-controls">
                            <button
                              type="button"
                              className="nexo-icon-btn"
                              disabled={idx === 0}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleMoveMilestone(step.id, 'up');
                              }}
                              title="Mover para antes (Ctrl + Seta Acima)"
                            >
                              <ArrowUp size={14} />
                            </button>
                            <button
                              type="button"
                              className="nexo-icon-btn"
                              disabled={idx === milestones.length - 1}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleMoveMilestone(step.id, 'down');
                              }}
                              title="Mover para depois (Ctrl + Seta Abaixo)"
                            >
                              <ArrowDown size={14} />
                            </button>
                            <button
                              type="button"
                              className="nexo-icon-btn danger"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteMilestone(step.id);
                              }}
                              title="Excluir etapa"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      </React.Fragment>
                    ))}

                    {/* GAP FINDER FINAL ANTES DO PONTO B */}
                    <div className="gap-finder-zone">
                      {gapInsertIndex === milestones.length ? (
                        <div className="gap-inline-editor">
                          <input
                            ref={gapInputRef}
                            type="text"
                            className="gap-inline-input"
                            placeholder="Nome da etapa final antes do Ponto B (Enter para inserir)..."
                            value={gapStepTitle}
                            onChange={(e) => setGapStepTitle(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleInsertIntermediateStep(milestones.length);
                              if (e.key === 'Escape') {
                                setGapInsertIndex(null);
                                setGapStepTitle('');
                              }
                            }}
                          />
                          <button
                            type="button"
                            className="nexo-btn-primary small"
                            onClick={() => handleInsertIntermediateStep(milestones.length)}
                          >
                            Inserir
                          </button>
                          <button
                            type="button"
                            className="nexo-btn-ghost small"
                            onClick={() => {
                              setGapInsertIndex(null);
                              setGapStepTitle('');
                            }}
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="gap-finder-trigger"
                          onClick={() => {
                            setGapInsertIndex(milestones.length);
                            setGapStepTitle('');
                          }}
                        >
                          <Plus size={12} />
                          <span>+ Inserir Etapa Intermediária</span>
                        </button>
                      )}
                    </div>

                    {/* PONTO B NO FIM */}
                    <div className="validator-endpoint-node point-b">
                      <Target size={16} />
                      <span>
                        PONTO B (META EM {formatDatePTBR(pointB.targetDate)}): {pointB.deliverable}
                      </span>
                    </div>
                  </>
                ) : (
                  /* Visualização Reversa opcional na Fase 3 */
                  <>
                    <div className="validator-endpoint-node point-b">
                      <Target size={16} />
                      <span>PONTO B (META): {pointB.deliverable}</span>
                    </div>
                    {[...milestones].reverse().map((step, rIdx) => (
                      <div key={step.id} className="validator-step-card">
                        <div className="validator-step-number">
                          Etapa #{milestones.length - rIdx}
                        </div>
                        <span className="validator-step-readonly">{step.title}</span>
                      </div>
                    ))}
                    <div className="validator-endpoint-node point-a">
                      <Flag size={15} />
                      <span>PONTO A (HOJE)</span>
                    </div>
                  </>
                )}
              </div>

              {/* BARRA DE AUDITORIA E TRAVA DA FASE 3 */}
              <div className={`validator-approval-bar ${logicValidated ? 'validated' : ''}`}>
                <label className="validator-checkbox-label">
                  <input
                    type="checkbox"
                    checked={logicValidated}
                    onChange={(e) =>
                      onUpdateNexoState({
                        ...nexoState,
                        logicValidated: e.target.checked,
                      })
                    }
                  />
                  <span>
                    <strong>Auditoria Lógica Concluída (Gate 3):</strong> Confirmo que revisei a sequência{' '}
                    <em>Ponto A → Ponto B</em> e não há lacunas lógicas entre as etapas.
                  </span>
                </label>

                <button
                  type="button"
                  className="nexo-btn-cta"
                  onClick={() => {
                    onUpdateNexoState({
                      ...nexoState,
                      logicValidated: true,
                      activePhase: 4,
                    });
                  }}
                >
                  <span>Validar Lógica e Abrir Matriz de Milestones (Fase 4)</span>
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>
          )}

          {/* =========================================================
              FASE 4: MATRIZ DE MILESTONES E RECURSOS (CAMADA ANALÍTICA)
              ========================================================= */}
          {activePhase === 4 && (
            <div className="nexo-stage-container phase-4-container">
              <div className="nexo-stage-header">
                <div>
                  <span className="stage-kicker">FASE 4 • MATRIZ DE MILESTONES E RECURSOS (CAMADA ANALÍTICA)</span>
                  <h3>Engenharia de Prazos Reversos (ALAP), Predecessoras e Orçamento</h3>
                  <p>
                    Escolha o modo de agendamento do cronograma, trave a Data Limite final e o sistema calculará automaticamente o <strong>Início</strong> e <strong>Término</strong> de cada Milestone respeitando durações (dias úteis inclusivos) e predecessoras.
                  </p>
                </div>

                <button
                  type="button"
                  className="nexo-btn-secondary"
                  onClick={handleCalculateReverseSchedule}
                  title="Recalcular e gravar as datas de todos os Milestones"
                >
                  <Zap size={14} />
                  <span>
                    {scheduleDirection === 'backward'
                      ? 'Recalcular De Trás para Frente (ALAP)'
                      : 'Recalcular Do Início para Frente (ASAP)'}
                  </span>
                </button>
              </div>

              {/* Painel de Configuração do Modo de Agendamento no Nexo (Forward vs. Backward ALAP) */}
              <div className="nexo-schedule-mode-panel">
                <div className="nexo-schedule-mode-options">
                  <button
                    type="button"
                    className={`nexo-mode-option-btn ${scheduleDirection === 'backward' ? 'active backward' : ''}`}
                    onClick={() => handleChangeNexoScheduleDirection('backward')}
                  >
                    <ArrowLeft size={15} />
                    <div>
                      <strong>A partir da Data de Término (Reverso - Backward / ALAP)</strong>
                      <span>
                        Trava a Data Limite do Ponto B e puxa todas as entregas de trás para frente respeitando durações e gargalos de múltiplas dependentes.
                      </span>
                    </div>
                  </button>

                  <button
                    type="button"
                    className={`nexo-mode-option-btn ${scheduleDirection === 'forward' ? 'active forward' : ''}`}
                    onClick={() => handleChangeNexoScheduleDirection('forward')}
                  >
                    <ArrowRight size={15} />
                    <div>
                      <strong>A partir da Data de Início (Padrão - Forward / ASAP)</strong>
                      <span>
                        Define a data inicial do projeto e empurra os Milestones para a frente conforme suas predecessoras.
                      </span>
                    </div>
                  </button>
                </div>

                <div className="nexo-schedule-anchor-input-row">
                  {scheduleDirection === 'backward' ? (
                    <>
                      <label className="nexo-anchor-label">
                        <Target size={14} />
                        <span>Data Limite do Projeto (Ponto B):</span>
                      </label>
                      <input
                        type="date"
                        className="nexo-anchor-date-picker"
                        value={pointB.targetDate}
                        onChange={(e) => handleUpdatePointB({ targetDate: e.target.value })}
                      />
                      <span className="nexo-anchor-hint">
                        Regra 1 (Âncora): Milestones sem sucessoras terminam exatamente em{' '}
                        <strong>{formatDatePTBR(pointB.targetDate)}</strong>.
                      </span>
                    </>
                  ) : (
                    <>
                      <label className="nexo-anchor-label">
                        <Calendar size={14} />
                        <span>Data de Início do Projeto (Ponto A):</span>
                      </label>
                      <input
                        type="date"
                        className="nexo-anchor-date-picker"
                        value={projectStartDate}
                        onChange={(e) => handleChangeNexoScheduleDirection('forward', e.target.value)}
                      />
                      <span className="nexo-anchor-hint">
                        Milestones iniciais começam em{' '}
                        <strong>{formatDatePTBR(projectStartDate)}</strong> e empurram os seguintes.
                      </span>
                    </>
                  )}
                </div>

                {/* Alerta Visual de Prazo Estourado no Nexo (Item 4 de UX/UI) */}
                {scheduleDirection === 'backward' && overdueMilestones.length > 0 && (
                  <div className="nexo-overdue-alert-banner">
                    <AlertTriangle size={18} className="nexo-overdue-icon" />
                    <div>
                      <strong>Alerta de Prazo Estourado (Inviável com as durações atuais):</strong> O cálculo de trás para frente exige que o projeto tivesse começado em{' '}
                      <strong>{formatDatePTBR(earliestRequiredStartDate || '')}</strong> (anterior à data de hoje,{' '}
                      {formatDatePTBR(todayIso)}). Há <strong>{overdueMilestones.length}</strong>{' '}
                      {overdueMilestones.length === 1 ? 'Milestone com início no passado' : 'Milestones com início no passado'}. Reduza as durações, paraleliza predecessoras ou postergue a Data Limite do Ponto B.
                    </div>
                  </div>
                )}
              </div>

              {/* Stepper Guiado de Prontidão da Matriz (Fase 4) */}
              {(() => {
                const ownersCount = scheduledMilestones.filter((m) => m.owner && m.owner.trim().length > 0).length;
                const withDatesCount = scheduledMilestones.filter((m) => m.deadline && m.deadline.trim().length > 0).length;
                const readinessPct =
                  scheduledMilestones.length > 0
                    ? Math.round((withDatesCount / scheduledMilestones.length) * 100)
                    : 0;
                return (
                  <div className={`nexo-phase4-readiness-bar ${withDatesCount === scheduledMilestones.length ? 'ready' : ''}`}>
                    <div className="readiness-bar-top">
                      <div className="readiness-status-text">
                        <ShieldCheck size={15} />
                        <span>
                          <strong>Progresso de Calibração da Matriz:</strong>{' '}
                          {withDatesCount} de {scheduledMilestones.length} prazos calculados ({readinessPct}%) •{' '}
                          {ownersCount} de {scheduledMilestones.length} responsáveis (Owners) atribuídos
                        </span>
                      </div>
                      {withDatesCount < scheduledMilestones.length ? (
                        <button
                          type="button"
                          className="nexo-btn-primary small"
                          onClick={handleCalculateReverseSchedule}
                          title="Preencher automaticamente todos os prazos de trás para frente a partir do Ponto B"
                        >
                          <Zap size={12} />
                          <span>Preencher Prazos Automaticamente</span>
                        </button>
                      ) : (
                        <span className="readiness-complete-pill">
                          ✓ Matriz 100% Destravada para Sincronizar com o Gantt
                        </span>
                      )}
                    </div>
                    <div className="readiness-progress-track">
                      <div
                        className="readiness-progress-fill"
                        style={{ width: `${readinessPct}%` }}
                      />
                    </div>
                  </div>
                );
              })()}

              <div className="milestones-matrix-grid">
                {scheduledMilestones.map((ms, index) => {
                  const hasDeadline = Boolean(ms.deadline && ms.deadline.trim());
                  const isOverdue =
                    scheduleDirection === 'backward' &&
                    !ms.completed &&
                    Boolean(ms.startDate && ms.startDate < todayIso);
                  const effectivePred =
                    ms.predecessorText !== undefined
                      ? ms.predecessorText
                      : index > 0
                        ? String(index)
                        : '';

                  return (
                    <div
                      key={ms.id}
                      className={`nexo-milestone-card ${!hasDeadline ? 'missing-date' : ''} ${isOverdue ? 'overdue-card' : ''}`}
                    >
                      <div className="ms-card-top">
                        <span className="ms-index-badge">MILESTONE #{index + 1}</span>
                        <input
                          type="text"
                          className="ms-title-input"
                          value={ms.title}
                          onChange={(e) => handleUpdateMilestone(ms.id, { title: e.target.value })}
                        />
                        {isOverdue && (
                          <span
                            className="ms-date-chip invalid"
                            title={`Prazo Estourado: este Milestone precisaria começar em ${formatDatePTBR(ms.startDate || '')} (anterior a hoje)`}
                          >
                            ⚠️ Início no Passado ({formatDatePTBR(ms.startDate || '')})
                          </span>
                        )}
                        {hasDeadline ? (
                          <span className="ms-date-chip valid">
                            <Calendar size={12} />{' '}
                            {ms.startDate
                              ? `${formatDatePTBR(ms.startDate)} ➔ ${formatDatePTBR(ms.deadline)}`
                              : `Até ${formatDatePTBR(ms.deadline)}`}
                          </span>
                        ) : (
                          <span className="ms-date-chip invalid">⚠️ Sem Prazo (Trava Ativa)</span>
                        )}
                      </div>

                      <div className="ms-card-fields-grid">
                        {/* 1. Duração (Inclusiva), Predecessoras e Datas Calculadas */}
                        <div className="ms-field">
                          <label>
                            <Calendar size={12} /> Duração (Dias Úteis), Predecessoras &amp; Término
                          </label>
                          <div className="ms-reverse-date-inputs">
                            <div
                              className="lead-time-box"
                              title="Regra 2: Duração em dias úteis (inclusiva: o próprio dia conta como 1 dia trabalhado)"
                            >
                              <input
                                type="number"
                                min="1"
                                value={ms.leadTimeDays}
                                onChange={(e) =>
                                  handleUpdateMilestone(ms.id, {
                                    leadTimeDays: Math.max(1, parseInt(e.target.value, 10) || 1),
                                  })
                                }
                              />
                              <span>{ms.leadTimeDays === 1 ? 'dia útil' : 'dias úteis'}</span>
                            </div>
                            <div
                              className="lead-time-box pred-box"
                              title="Predecessoras (MS Project): [ID][TI|FS|II|SS|TT|FF|IT|SF][+/-dias ou %] — Ex: 1; 2TI+2d; 3II+50%; 4TT-1d"
                            >
                              <Link2 size={11} />
                              <span>Pred:</span>
                              <input
                                type="text"
                                className="ms-pred-inline-input"
                                value={effectivePred}
                                onChange={(e) =>
                                  handleUpdateMilestone(ms.id, {
                                    predecessorText: e.target.value,
                                  })
                                }
                                placeholder="Ex: 1;2II+50%"
                              />
                            </div>
                            <input
                              type="date"
                              className="ms-deadline-picker"
                              value={ms.deadline}
                              onChange={(e) => handleUpdateMilestone(ms.id, { deadline: e.target.value })}
                              title="Data de Término calculada para este Milestone"
                            />
                          </div>
                        </div>

                        {/* 2. Proprietário (Owner) */}
                        <div className="ms-field">
                          <label>
                            <User size={12} /> Proprietário (Owner / Responsável Direto)
                          </label>
                          <input
                            type="text"
                            list="nexo-resources-list"
                            placeholder="Quem responde por esta entrega?"
                            value={ms.owner}
                            onChange={(e) => handleUpdateMilestone(ms.id, { owner: e.target.value })}
                          />
                        </div>

                        {/* 3. Recursos Humanos e Materiais */}
                        <div className="ms-field">
                          <label>
                            <Wrench size={12} /> Recursos Humanos, Ferramentas e Insumos
                          </label>
                          <input
                            type="text"
                            placeholder="Softwares, apoios, materiais necessários..."
                            value={ms.resources}
                            onChange={(e) => handleUpdateMilestone(ms.id, { resources: e.target.value })}
                          />
                        </div>

                        {/* 4. Recurso Financeiro */}
                        <div className="ms-field">
                          <label>
                            <DollarSign size={12} /> Recurso Financeiro (Orçamento da Etapa)
                          </label>
                          <div className="ms-budget-input-wrapper">
                            <span className="currency-prefix">R$</span>
                            <input
                              type="number"
                              min="0"
                              step="any"
                              placeholder="0,00"
                              value={ms.budget || ''}
                              onChange={(e) =>
                                handleUpdateMilestone(ms.id, {
                                  budget: Math.max(0, parseFloat(e.target.value) || 0),
                                })
                              }
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <datalist id="nexo-resources-list">
                {resources.map((r) => (
                  <option key={r.id} value={r.name} />
                ))}
              </datalist>

              {/* RODAPÉ ANALÍTICO FIXO (SOMA DE CUSTOS E SINCRONIZAÇÃO COM O GANTT) */}
              <div className="nexo-matrix-footer">
                <div className="matrix-footer-metrics">
                  <div className="footer-metric-item">
                    <span className="metric-label">Total de Milestones:</span>
                    <strong>{milestones.length} etapas</strong>
                  </div>
                  <div className="footer-metric-item">
                    <span className="metric-label">Prazos Definidos:</span>
                    <strong className={allMilestonesHaveDeadline ? 'text-emerald' : 'text-amber'}>
                      {milestonesWithDeadlineCount} / {milestones.length}
                    </strong>
                  </div>
                  <div className="footer-metric-item total-cost-highlight">
                    <span className="metric-label">Orçamento Total Previsto:</span>
                    <strong>
                      {totalBudget.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </strong>
                  </div>
                </div>

                <div className="matrix-footer-actions">
                  <button
                    type="button"
                    className="nexo-btn-cta ignition-btn"
                    onClick={handleFinalizeAndSyncGantt}
                  >
                    <BarChart3 size={16} />
                    <span>Concluir Arquitetura &amp; Sincronizar com Gantt</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};
