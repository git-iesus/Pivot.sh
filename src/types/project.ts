export type TaskMode = 'manual' | 'auto';

export type DependencyType = 'FS' | 'SS' | 'FF' | 'SF'; // Término-Início, Início-Início, Término-Término, Início-Término

export interface TaskDependency {
  id: string;
  fromTaskId: string;
  toTaskId: string;
  type: DependencyType;
  lagDays?: number;
}

export interface SubTask {
  id: string;
  title: string;
  done: boolean;
}

export interface Task {
  id: string;
  rowNumber?: number; // Índice 1-based real na planilha (preservado mesmo quando tarefas estão recolhidas)
  wbsIndex: string; // Ex: "1.1", "1.2.1"
  name: string;
  durationDays: number;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  progress: number; // 0 a 100
  mode: TaskMode;
  predecessorText: string; // Ex: "1", "2TI", "3+2d"
  resourceNames: string[];
  outlineLevel: number; // 0 = raiz/projeto, 1 = fase, 2 = tarefa, 3 = subtarefa
  isSummary: boolean;
  isMilestone: boolean;
  collapsed?: boolean;
  notes?: string;
  isCritical?: boolean;
  baselineStartDate?: string;
  baselineEndDate?: string;
  baselineDurationDays?: number;
  cost?: number;
  subTasks?: SubTask[]; // Checklist de sub-tarefas internas
}

export interface Resource {
  id: string;
  name: string;
  type: 'Trabalho' | 'Material' | 'Custo';
  initials: string;
  group: string;
  standardRate: number; // Ex: R$/h
  overtimeRate: number;
  email?: string;
  maxUnits: number; // Ex: 100%
}

export type ExceptionCategory = 'Feriado' | 'Recesso' | 'Emenda' | 'Expediente Atípico' | 'Outro';

export interface CalendarException {
  id: string;
  name: string;
  date: string; // YYYY-MM-DD (Data inicial)
  endDate?: string; // YYYY-MM-DD (Data final opcional para períodos)
  type: ExceptionCategory;
  isWorkingDay: boolean; // false = dia não útil (pula data), true = dia útil atípico (conta como dia de trabalho)
}

export interface ProjectMetadata {
  title: string;
  manager: string;
  startDate: string; // Data de início do projeto
  currentDate: string; // Data de status
  calendar: string;
  activeWeekDays: number[]; // 0 = Domingo, 1 = Segunda, 2 = Terça, 3 = Quarta, 4 = Quinta, 5 = Sexta, 6 = Sábado
  exceptions?: CalendarException[]; // Datas de exceção globais do projeto
  currency: 'BRL' | 'USD' | 'EUR';
}

export type ViewMode = 'gantt' | 'taskSheet' | 'networkDiagram' | 'resourceSheet' | 'week' | 'nexo';

export type ZoomLevel = 'days' | 'weeks' | 'months';

// =========================================================
// Tipos do Plugin NEXO (Arquitetura de Projetos em 5 Fases)
// =========================================================

export interface NexoChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface NexoRetrospectiveLog {
  id: string;
  milestoneId: string;
  milestoneTitle: string;
  createdAt: string;
  type: 'completion' | 'obstacle';
  whatWorked: string;
  whatBlocked: string;
  whatToAdjust: string;
}

export interface NexoMilestone {
  id: string;
  title: string;
  leadTimeDays: number; // Quantos dias úteis antes da entrega seguinte este passo precisa estar pronto
  deadline: string; // YYYY-MM-DD
  owner: string;
  resources: string;
  budget: number;
  completed: boolean;
  checklist: NexoChecklistItem[];
}

export interface NexoPointB {
  deliverable: string; // Qual é o entregável final tangível?
  successMetric: string; // Qual é a métrica de sucesso verificável?
  targetDate: string; // Qual é a Data-Limite Final? (YYYY-MM-DD)
  isCalibrated: boolean; // Convertido em Meta
}

export type NexoPhase = 1 | 2 | 3 | 4;
export type NexoRoleView = 'architect';

export interface NexoProjectState {
  pointB: NexoPointB;
  milestones: NexoMilestone[]; // Ordem cronológica A -> B
  reachedPointA: boolean; // Fase 2 concluída ("Cheguei no Dia de Hoje - Ponto A")
  logicValidated: boolean; // Gate da Fase 3 (Validação Lógica A -> B revisada)
  ignitionApproved: boolean; // Gate da Fase 4 -> 5 aprovado
  activePhase: NexoPhase;
  roleView: NexoRoleView;
  isFocusModeNewProject: boolean; // Escurece menu lateral ao clicar em "Novo Projeto" na Fase 1
  retrospectives: NexoRetrospectiveLog[];
}
