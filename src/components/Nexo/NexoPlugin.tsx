import React, { useState, useEffect, useRef } from 'react';
import {
  NexoProjectState,
  NexoMilestone,
  NexoPhase,
  NexoRoleView,
  NexoRetrospectiveLog,
  Resource,
  CalendarException,
} from '../../types/project';
import {
  formatDatePTBR,
  parseISODate,
  toISODate,
  subtractWorkDays,
  toWorkDay,
} from '../../utils/scheduler';
import {
  Target,
  ArrowUp,
  ArrowDown,
  ArrowRight,
  Plus,
  Trash2,
  CheckCircle2,
  Lock,
  Unlock,
  Flame,
  ShieldCheck,
  AlertTriangle,
  Sparkles,
  Play,
  Pause,
  RotateCcw,
  Calendar,
  User,
  Wrench,
  DollarSign,
  Layers,
  CheckSquare,
  Square,
  RefreshCw,
  Compass,
  Zap,
  Flag,
  ChevronRight,
  BarChart3,
  History,
  X,
  Eye,
  EyeOff,
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
      leadTimeDays: 3,
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
      leadTimeDays: 4,
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
      leadTimeDays: 5,
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
      leadTimeDays: 6,
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
  activePhase: 1,
  roleView: 'architect',
  isFocusModeNewProject: false,
  retrospectives: [],
};

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

  // Estados do Modo Ignição (Fase 5 / Visão Executor)
  const [newChecklistText, setNewChecklistText] = useState<string>('');
  const [timerSeconds, setTimerSeconds] = useState<number>(25 * 60);
  const [isTimerRunning, setIsTimerRunning] = useState<boolean>(false);

  // Estado do Modal de Retrospectiva (Melhoria Contínua)
  const [retroModal, setRetroModal] = useState<{
    isOpen: boolean;
    type: 'completion' | 'obstacle';
    milestoneId: string;
    milestoneTitle: string;
  } | null>(null);
  const [whatWorked, setWhatWorked] = useState<string>('');
  const [whatBlocked, setWhatBlocked] = useState<string>('');
  const [whatToAdjust, setWhatToAdjust] = useState<string>('');

  const reverseInputRef = useRef<HTMLInputElement | null>(null);
  const gapInputRef = useRef<HTMLInputElement | null>(null);

  const {
    pointB,
    milestones,
    reachedPointA,
    logicValidated,
    activePhase,
    roleView,
    isFocusModeNewProject,
    retrospectives,
  } = nexoState;

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

  // Timer de Foco para o Modo Ignição
  useEffect(() => {
    if (!isTimerRunning) return;
    const interval = setInterval(() => {
      setTimerSeconds((prev) => {
        if (prev <= 1) {
          setIsTimerRunning(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isTimerRunning]);

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
    if (phase === 5 && !canEnterExecution) {
      const reasons: string[] = [];
      if (!logicValidated) reasons.push('marcar a Fase 3 (Validação Lógica A → B) como revisada');
      if (!allMilestonesHaveDeadline)
        reasons.push(
          `definir o prazo de todos os Milestones (${milestonesWithDeadlineCount}/${milestones.length} preenchidos)`
        );
      showGateAlert(
        `Trava de Processo (Gate de Execução): Não é permitido entrar no Modo Ignição sem ${reasons.join(' e ')}.`
      );
      return;
    }

    onUpdateNexoState({
      ...nexoState,
      activePhase: phase,
      isFocusModeNewProject: false,
      roleView: phase === 5 ? 'executor' : nexoState.roleView,
    });
  };

  const handleToggleRoleView = (targetView: NexoRoleView) => {
    if (targetView === 'executor' && !canEnterExecution) {
      const reasons: string[] = [];
      if (!isPointBComplete) reasons.push('calibrar o Ponto B (Fase 1)');
      if (!isPhase2Complete) reasons.push('concluir o Roadmap Reverso até o Ponto A (Fase 2)');
      if (!logicValidated) reasons.push('revisar a Validação Lógica A → B (Fase 3)');
      if (!allMilestonesHaveDeadline)
        reasons.push(
          `preencher os prazos de todos os Milestones na Fase 4 (${milestonesWithDeadlineCount}/${milestones.length})`
        );
      showGateAlert(
        `Acesso Bloqueado à Visão Executor: Para evitar executar no escuro, você precisa primeiro ${reasons.join(', ')}.`
      );
      return;
    }

    onUpdateNexoState({
      ...nexoState,
      roleView: targetView,
      activePhase: targetView === 'executor' ? 5 : nexoState.activePhase === 5 ? 4 : nexoState.activePhase,
      isFocusModeNewProject: false,
    });
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

    onUpdateNexoState({
      ...nexoState,
      pointB: nextPointB,
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
      subtractWorkDays(anchorDate, 3, activeWeekDays, exceptions)
    );

    const newMilestone: NexoMilestone = {
      id: `nx_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      title: trimmed,
      leadTimeDays: 3,
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
      leadTimeDays: 2,
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
    const next = milestones.map((m) => (m.id === id ? { ...m, ...updates } : m));
    onUpdateNexoState({
      ...nexoState,
      milestones: next,
    });
  };

  // =========================================================
  // Fase 4: Cálculo Automático de Cronograma Reverso (B -> A)
  // =========================================================
  const handleCalculateReverseSchedule = () => {
    if (!pointB.targetDate || milestones.length === 0) return;

    const updated = [...milestones];
    let currentAnchor = toWorkDay(parseISODate(pointB.targetDate), activeWeekDays, exceptions);

    // Percorre de trás para frente (do último Milestone próximo ao Ponto B até o Milestone #1 no Ponto A)
    for (let i = updated.length - 1; i >= 0; i--) {
      const m = { ...updated[i] };
      const lead = Math.max(1, Number(m.leadTimeDays) || 1);
      if (i === updated.length - 1) {
        // O último Milestone prepara a entrega do Ponto B
        const d = subtractWorkDays(currentAnchor, lead, activeWeekDays, exceptions);
        m.deadline = toISODate(d);
        currentAnchor = d;
      } else {
        const prevAnchor = new Date(currentAnchor);
        prevAnchor.setDate(prevAnchor.getDate() - 1);
        const d = subtractWorkDays(prevAnchor, lead, activeWeekDays, exceptions);
        m.deadline = toISODate(d);
        currentAnchor = d;
      }
      updated[i] = m;
    }

    onUpdateNexoState({
      ...nexoState,
      milestones: updated,
    });
  };

  const handleApproveIgnition = () => {
    if (!canEnterExecution) {
      handleSelectPhase(5);
      return;
    }
    onUpdateNexoState({
      ...nexoState,
      ignitionApproved: true,
      activePhase: 5,
      roleView: 'executor',
    });
  };

  // =========================================================
  // Fase 5: Modo Ignição & Ciclo de Melhoria Contínua
  // =========================================================
  const activeMilestoneIndex = milestones.findIndex((m) => !m.completed);
  const activeMilestone =
    activeMilestoneIndex >= 0 ? milestones[activeMilestoneIndex] : milestones[milestones.length - 1];
  const completedMilestonesCount = milestones.filter((m) => m.completed).length;
  const allMilestonesCompleted = milestones.length > 0 && completedMilestonesCount === milestones.length;

  const handleAddChecklistItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeMilestone || !newChecklistText.trim()) return;
    const nextChecklist = [
      ...(activeMilestone.checklist || []),
      { id: `chk_${Date.now()}`, text: newChecklistText.trim(), done: false },
    ];
    handleUpdateMilestone(activeMilestone.id, { checklist: nextChecklist });
    setNewChecklistText('');
  };

  const handleToggleChecklistItem = (itemId: string) => {
    if (!activeMilestone) return;
    const nextChecklist = (activeMilestone.checklist || []).map((item) =>
      item.id === itemId ? { ...item, done: !item.done } : item
    );
    handleUpdateMilestone(activeMilestone.id, { checklist: nextChecklist });
  };

  const handleOpenRetroModal = (type: 'completion' | 'obstacle', milestone: NexoMilestone) => {
    setRetroModal({
      isOpen: true,
      type,
      milestoneId: milestone.id,
      milestoneTitle: milestone.title,
    });
    setWhatWorked('');
    setWhatBlocked('');
    setWhatToAdjust('');
  };

  const handleSubmitRetrospective = (e: React.FormEvent) => {
    e.preventDefault();
    if (!retroModal) return;

    const newLog: NexoRetrospectiveLog = {
      id: `retro_${Date.now()}`,
      milestoneId: retroModal.milestoneId,
      milestoneTitle: retroModal.milestoneTitle,
      createdAt: new Date().toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
      type: retroModal.type,
      whatWorked: whatWorked.trim() || 'Execução conforme planejado.',
      whatBlocked: whatBlocked.trim() || 'Nenhum bloqueio crítico.',
      whatToAdjust: whatToAdjust.trim() || 'Manter ritmo para o próximo Milestone.',
    };

    const nextMilestones =
      retroModal.type === 'completion'
        ? milestones.map((m) => (m.id === retroModal.milestoneId ? { ...m, completed: true } : m))
        : milestones;

    onUpdateNexoState({
      ...nexoState,
      milestones: nextMilestones,
      retrospectives: [newLog, ...(retrospectives || [])],
    });

    setRetroModal(null);
  };

  const formatTimer = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
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

        {/* Alternância Rápida de Visão (Pilar 2: Visão Arquiteto vs. Visão Executor) */}
        <div className="nexo-role-switcher">
          <button
            type="button"
            className={`nexo-role-tab ${roleView === 'architect' ? 'active' : ''}`}
            onClick={() => handleToggleRoleView('architect')}
            title="Visão Arquiteto: Mostra todo o Roadmap, custos, dependências e prazos"
          >
            <Layers size={14} />
            <span>Visão Arquiteto</span>
          </button>
          <button
            type="button"
            className={`nexo-role-tab ${roleView === 'executor' ? 'active' : ''} ${!canEnterExecution ? 'locked' : ''}`}
            onClick={() => handleToggleRoleView('executor')}
            title={
              canEnterExecution
                ? 'Visão Executor: Tela limpa mostrando apenas a tarefa imediata (Colapso de Complexidade)'
                : 'Bloqueado pelas Travas de Processo: Conclua a Validação Lógica (Fase 3) e defina todos os prazos (Fase 4)'
            }
          >
            {canEnterExecution ? <Flame size={14} /> : <Lock size={13} />}
            <span>Visão Executor</span>
          </button>
        </div>

        {/* Ações Rápidas */}
        <div className="nexo-top-actions">
          <button
            type="button"
            className="nexo-btn-ghost"
            onClick={handleLoadGuidedExample}
            title="Carregar projeto de exemplo estruturado nas 5 fases"
          >
            <Sparkles size={13} />
            <span>Carregar Exemplo</span>
          </button>
          <button
            type="button"
            className="nexo-btn-secondary"
            onClick={() => onSyncToGantt(nexoState)}
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
          CORPO PRINCIPAL DO NEXO (Sidebar de 5 Fases + Canvas)
          ========================================================= */}
      <div className="nexo-workspace-body">
        {/* MENU LATERAL DAS 5 FASES SEQUENCIAIS (Escurecido no Modo Foco de Novo Projeto ou recolhido na Visão Executor) */}
        {roleView === 'architect' && (
          <aside className={`nexo-phases-sidebar ${isFocusModeNewProject ? 'dimmed-focus-mode' : ''}`}>
            <div className="nexo-sidebar-header">
              <span className="sidebar-kicker">METODOLOGIA EM 5 ETAPAS</span>
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
                className={`nexo-phase-item ${activePhase === 4 ? 'active' : ''} ${allMilestonesHaveDeadline && isPhase4Unlocked ? 'completed' : ''} ${!isPhase4Unlocked ? 'locked' : ''}`}
                onClick={() => handleSelectPhase(4)}
              >
                <div className="phase-step-indicator">
                  {!isPhase4Unlocked ? (
                    <Lock size={14} />
                  ) : allMilestonesHaveDeadline ? (
                    <CheckCircle2 size={16} />
                  ) : (
                    <span>4</span>
                  )}
                </div>
                <div className="phase-item-text">
                  <span className="phase-title">4. Matriz de Milestones</span>
                  <span className="phase-desc">Prazos Reversos, Owner e Custos</span>
                </div>
              </button>

              {/* Fase 5 */}
              <button
                type="button"
                className={`nexo-phase-item ${activePhase === 5 ? 'active' : ''} ${!canEnterExecution ? 'locked' : 'ignition-ready'}`}
                onClick={() => handleSelectPhase(5)}
              >
                <div className="phase-step-indicator">
                  {!canEnterExecution ? <Lock size={14} /> : <Flame size={16} />}
                </div>
                <div className="phase-item-text">
                  <span className="phase-title">5. Modo Ignição</span>
                  <span className="phase-desc">Ação &amp; Melhoria Contínua</span>
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
        )}

        {/* =========================================================
            ÁREA CENTRAL DE TRABALHO (CANVAS DA FASE ATIVA OU VISÃO EXECUTOR)
            ========================================================= */}
        <main className={`nexo-main-canvas ${isFocusModeNewProject && activePhase === 1 ? 'focus-spotlight-bg' : ''}`}>
          {/* =========================================================
              FASE 1: O CALIBRADOR DE FOCO (DEFINIÇÃO DO PONTO B)
              ========================================================= */}
          {roleView === 'architect' && activePhase === 1 && (
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
          {roleView === 'architect' && activePhase === 2 && (
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
          {roleView === 'architect' && activePhase === 3 && (
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
          {roleView === 'architect' && activePhase === 4 && (
            <div className="nexo-stage-container phase-4-container">
              <div className="nexo-stage-header">
                <div>
                  <span className="stage-kicker">FASE 4 • MATRIZ DE MILESTONES E RECURSOS (CAMADA ANALÍTICA)</span>
                  <h3>Engenharia de Prazos Reversos, Proprietários e Orçamento</h3>
                  <p>
                    Cada bloco validado agora é oficialmente um <strong>Milestone</strong> (pedra de medição).
                    Defina a antecedência necessária, o responsável direto (<em>Owner</em>), os recursos
                    materiais e o custo previsto de cada entrega.
                  </p>
                </div>

                <button
                  type="button"
                  className="nexo-btn-secondary"
                  onClick={handleCalculateReverseSchedule}
                  title="Calcula automaticamente as datas de todos os Milestones de trás para frente a partir da Data-Limite do Ponto B"
                >
                  <Zap size={14} />
                  <span>Calcular Cronograma Reverso (B → A)</span>
                </button>
              </div>

              <div className="milestones-matrix-grid">
                {milestones.map((ms, index) => {
                  const hasDeadline = Boolean(ms.deadline && ms.deadline.trim());
                  return (
                    <div key={ms.id} className={`nexo-milestone-card ${!hasDeadline ? 'missing-date' : ''}`}>
                      <div className="ms-card-top">
                        <span className="ms-index-badge">MILESTONE #{index + 1}</span>
                        <input
                          type="text"
                          className="ms-title-input"
                          value={ms.title}
                          onChange={(e) => handleUpdateMilestone(ms.id, { title: e.target.value })}
                        />
                        {hasDeadline ? (
                          <span className="ms-date-chip valid">
                            <Calendar size={12} /> Ate {formatDatePTBR(ms.deadline)}
                          </span>
                        ) : (
                          <span className="ms-date-chip invalid">⚠️ Sem Prazo (Trava Ativa)</span>
                        )}
                      </div>

                      <div className="ms-card-fields-grid">
                        {/* 1. Cronograma Reverso */}
                        <div className="ms-field">
                          <label>
                            <Calendar size={12} /> Cronograma Reverso (Antecedência &amp; Prazo)
                          </label>
                          <div className="ms-reverse-date-inputs">
                            <div className="lead-time-box" title="Quantos dias úteis antes da próxima entrega este Milestone deve estar pronto">
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
                              <span>dias úteis</span>
                            </div>
                            <input
                              type="date"
                              className="ms-deadline-picker"
                              value={ms.deadline}
                              onChange={(e) => handleUpdateMilestone(ms.id, { deadline: e.target.value })}
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

              {/* RODAPÉ ANALÍTICO FIXO (SOMA DE CUSTOS E DISPARO DO MODO IGNIÇÃO) */}
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
                    onClick={handleApproveIgnition}
                  >
                    <Flame size={16} />
                    <span>Aprovar Planejamento &amp; Ativar Modo Ignição</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* =========================================================
              FASE 5 / VISÃO EXECUTOR: MODO IGNIÇÃO (COLAPSO DE COMPLEXIDADE)
              ========================================================= */}
          {(roleView === 'executor' || activePhase === 5) && (
            <div className="nexo-stage-container ignition-stage-container">
              <div className="ignition-top-banner">
                <div className="collapse-shield-badge">
                  <Eye size={14} />
                  <span>
                    COLAPSO DE COMPLEXIDADE ATIVO: {Math.max(0, milestones.length - 1)} etapas futuras
                    ocultadas em segundo plano para foco absoluto no passo imediato.
                  </span>
                </div>
                {roleView === 'executor' && (
                  <button
                    type="button"
                    className="nexo-btn-ghost small"
                    onClick={() => handleToggleRoleView('architect')}
                  >
                    Voltar à Visão Arquiteto
                  </button>
                )}
              </div>

              {allMilestonesCompleted ? (
                <div className="ignition-victory-card">
                  <div className="victory-icon-ring">
                    <CheckCircle2 size={40} />
                  </div>
                  <h2>Ponto B Alcançado! Todos os Milestones foram concluídos.</h2>
                  <p className="victory-deliverable">{pointB.deliverable}</p>
                  <div className="victory-metric-box">
                    <strong>Métrica de Sucesso Atingida:</strong> {pointB.successMetric}
                  </div>
                  <button
                    type="button"
                    className="nexo-btn-secondary"
                    onClick={() => {
                      const reset = milestones.map((m) => ({ ...m, completed: false }));
                      onUpdateNexoState({ ...nexoState, milestones: reset });
                    }}
                  >
                    Reabrir Milestones
                  </button>
                </div>
              ) : activeMilestone ? (
                <div className="ignition-spotlight-card">
                  <div className="spotlight-card-header">
                    <div className="spotlight-step-pill">
                      <Flame size={14} />
                      <span>
                        PASSO IMEDIATO • MILESTONE #{activeMilestoneIndex + 1} DE {milestones.length}
                      </span>
                    </div>
                    <div className="spotlight-progress-pill">
                      <span>Progresso Macro: {completedMilestonesCount}/{milestones.length} concluídos</span>
                    </div>
                  </div>

                  <h1 className="spotlight-milestone-title">{activeMilestone.title}</h1>

                  <div className="spotlight-meta-strip">
                    <div className="spotlight-meta-chip">
                      <Calendar size={14} />
                      <span>
                        Prazo-Limite: <strong>{formatDatePTBR(activeMilestone.deadline)}</strong>
                      </span>
                    </div>
                    <div className="spotlight-meta-chip">
                      <User size={14} />
                      <span>
                        Owner: <strong>{activeMilestone.owner || 'Não atribuído'}</strong>
                      </span>
                    </div>
                    <div className="spotlight-meta-chip">
                      <Wrench size={14} />
                      <span>
                        Recursos: <strong>{activeMilestone.resources || 'Padrão'}</strong>
                      </span>
                    </div>
                    <div className="spotlight-meta-chip">
                      <DollarSign size={14} />
                      <span>
                        Orçamento:{' '}
                        <strong>
                          {(activeMilestone.budget || 0).toLocaleString('pt-BR', {
                            style: 'currency',
                            currency: 'BRL',
                          })}
                        </strong>
                      </span>
                    </div>
                  </div>

                  {/* GRID INTERNO DE EXECUÇÃO: CRONÔMETRO DE FOCO + CHECKLIST */}
                  <div className="ignition-work-grid">
                    {/* Timer de Foco Imersivo */}
                    <div className="ignition-timer-panel">
                      <span className="panel-mini-label">CRONÔMETRO DE IGNIÇÃO (SESSÃO DE FOCO)</span>
                      <div className="timer-display">{formatTimer(timerSeconds)}</div>
                      <div className="timer-controls">
                        <button
                          type="button"
                          className="nexo-btn-primary small"
                          onClick={() => setIsTimerRunning(!isTimerRunning)}
                        >
                          {isTimerRunning ? <Pause size={13} /> : <Play size={13} />}
                          <span>{isTimerRunning ? 'Pausar' : 'Iniciar Foco'}</span>
                        </button>
                        <button
                          type="button"
                          className="nexo-btn-ghost small"
                          onClick={() => {
                            setIsTimerRunning(false);
                            setTimerSeconds(25 * 60);
                          }}
                        >
                          <RotateCcw size={13} />
                          <span>25 min</span>
                        </button>
                      </div>
                    </div>

                    {/* Checklist de Micro-ações do Milestone #1 */}
                    <div className="ignition-checklist-panel">
                      <span className="panel-mini-label">MICRO-PASSOS PARA DESTRAVAR ESTE MILESTONE HOJE</span>
                      <form className="ignition-checklist-form" onSubmit={handleAddChecklistItem}>
                        <input
                          type="text"
                          placeholder="Adicionar micro-ação imediata (Enter)..."
                          value={newChecklistText}
                          onChange={(e) => setNewChecklistText(e.target.value)}
                        />
                        <button type="submit" className="nexo-btn-secondary small">
                          <Plus size={13} />
                        </button>
                      </form>
                      <ul className="ignition-checklist-items">
                        {(activeMilestone.checklist || []).length === 0 ? (
                          <li className="empty-chk">
                            Quebre este Milestone em pequenas tarefas rápidas se precisar reduzir atrito.
                          </li>
                        ) : (
                          activeMilestone.checklist.map((item) => (
                            <li
                              key={item.id}
                              className={item.done ? 'done' : ''}
                              onClick={() => handleToggleChecklistItem(item.id)}
                            >
                              {item.done ? <CheckSquare size={15} /> : <Square size={15} />}
                              <span>{item.text}</span>
                            </li>
                          ))
                        )}
                      </ul>
                    </div>
                  </div>

                  {/* RODAPÉ DE AÇÃO & MELHORIA CONTÍNUA */}
                  <div className="spotlight-card-footer">
                    <button
                      type="button"
                      className="nexo-btn-obstacle"
                      onClick={() => handleOpenRetroModal('obstacle', activeMilestone)}
                    >
                      <AlertTriangle size={15} />
                      <span>Encontrei Obstáculo / Ajustar Rota (Melhoria Contínua)</span>
                    </button>

                    <button
                      type="button"
                      className="nexo-btn-complete-ms"
                      onClick={() => handleOpenRetroModal('completion', activeMilestone)}
                    >
                      <CheckCircle2 size={16} />
                      <span>Concluir Milestone #{activeMilestoneIndex + 1} &amp; Registrar Aprendizado</span>
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
              ) : null}

              {/* HISTÓRICO DO CICLO DE MELHORIA CONTÍNUA (LOGS DE RETROSPECTIVA) */}
              {retrospectives && retrospectives.length > 0 && (
                <div className="nexo-retro-history-section">
                  <div className="retro-history-header">
                    <History size={15} />
                    <h4>Ciclo de Melhoria Contínua — Logs de Retrospectiva ({retrospectives.length})</h4>
                  </div>
                  <div className="retro-logs-list">
                    {retrospectives.map((log) => (
                      <div key={log.id} className={`retro-log-card ${log.type}`}>
                        <div className="retro-log-top">
                          <span className="retro-log-badge">
                            {log.type === 'completion' ? '✓ Milestone Concluído' : '⚠️ Ajuste de Rota'}
                          </span>
                          <strong>{log.milestoneTitle}</strong>
                          <span className="retro-log-date">{log.createdAt}</span>
                        </div>
                        <div className="retro-log-columns">
                          <div>
                            <small>🟢 O que deu certo:</small>
                            <p>{log.whatWorked}</p>
                          </div>
                          <div>
                            <small>🔴 O que travou:</small>
                            <p>{log.whatBlocked}</p>
                          </div>
                          <div>
                            <small>🔧 O que precisa de ajuste:</small>
                            <p>{log.whatToAdjust}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* =========================================================
          MODAL DE RETROSPECTIVA (4º PASSO: MELHORIA CONTÍNUA -> RESULTADO)
          ========================================================= */}
      {retroModal && retroModal.isOpen && (
        <div className="modal-backdrop">
          <div className="modal-window nexo-retro-modal">
            <div className="modal-titlebar">
              <div className="title-with-icon">
                <RefreshCw size={16} />
                <span>
                  Ciclo de Melhoria Contínua —{' '}
                  {retroModal.type === 'completion'
                    ? 'Conclusão de Milestone'
                    : 'Registro de Obstáculo & Correção'}
                </span>
              </div>
              <button className="close-btn" onClick={() => setRetroModal(null)}>
                <X size={16} />
              </button>
            </div>

            <form className="modal-form-content" onSubmit={handleSubmitRetrospective}>
              <div className="retro-modal-Context">
                <span>Milestone em análise:</span>
                <strong>{retroModal.milestoneTitle}</strong>
              </div>

              <div className="form-group">
                <label>1. O que deu certo? (Padrões e acertos para manter)</label>
                <textarea
                  className="office-input"
                  rows={2}
                  placeholder="Ex: A extração direta reduziu o tempo pela metade..."
                  value={whatWorked}
                  onChange={(e) => setWhatWorked(e.target.value)}
                  autoFocus
                />
              </div>

              <div className="form-group">
                <label>2. O que travou? (Obstáculos ou gargalos encontrados)</label>
                <textarea
                  className="office-input"
                  rows={2}
                  placeholder="Ex: Dependência de aprovação externa demorou 1 dia a mais..."
                  value={whatBlocked}
                  onChange={(e) => setWhatBlocked(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label>3. O que precisa de ajuste para o próximo passo? (Melhoria Contínua)</label>
                <textarea
                  className="office-input"
                  rows={2}
                  placeholder="Ex: Antecipar alinhamento com o Owner do próximo Milestone..."
                  value={whatToAdjust}
                  onChange={(e) => setWhatToAdjust(e.target.value)}
                />
              </div>

              <div className="modal-footer">
                <button type="button" className="btn-office" onClick={() => setRetroModal(null)}>
                  Cancelar
                </button>
                <button type="submit" className="btn-office primary">
                  {retroModal.type === 'completion'
                    ? 'Salvar Retrospectiva & Destravar Próximo Milestone'
                    : 'Registrar Ajuste de Rota'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
