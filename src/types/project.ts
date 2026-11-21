export type TaskMode = 'manual' | 'auto';

export type ScheduleDirection = 'forward' | 'backward';

export type DependencyType = 'FS' | 'SS' | 'FF' | 'SF'; // Término-Início, Início-Início, Término-Término, Início-Término

export interface TaskDependency {
  id: string;
  fromTaskId: string;
  toTaskId: string;
  type: DependencyType;
  lagDays?: number;
}

export type ProjectMethodology = 'linear' | 'agile';

export type KanbanStatus =
  | 'icebox'
  | 'backlog'
  | 'sprint_todo'
  | 'in_progress'
  | 'done';

export interface SubTask {
  id: string;
  title: string;
  done: boolean;
}

export interface TaskAttachment {
  id: string;
  name: string;
  size: number; // bytes
  mimeType: string;
  extension: string; // ex: 'pdf', 'docx', 'xlsx', 'pptx'
  storageProvider: 'supabase' | 'indexeddb';
  storagePath: string; // '{userId}/{taskId}/{id}_{safeName}' no Supabase ou '{id}' no IndexedDB
  uploadedAt: string; // ISO timestamp
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
  isSummary: boolean; // true = classificado automaticamente como Subprojeto (possui subtarefas abaixo na EAP)
  activeWeekDays?: number[]; // Calendário de dias ativos exclusivo do Subprojeto (0=Dom..6=Sáb)
  exceptions?: CalendarException[]; // Datas de exceção (feriados, recessos, expedientes atípicos) exclusivas deste Subprojeto
  scheduleDirection?: ScheduleDirection; // 'forward' (padrão) ou 'backward' (de trás para frente - ALAP)
  targetEndDate?: string; // Data Limite do Subprojeto quando scheduleDirection === 'backward' (YYYY-MM-DD)
  isOverdueStart?: boolean; // true quando o cálculo reverso gera data de início no passado (< Hoje) e a tarefa não está 100% concluída
  isMilestone: boolean;
  collapsed?: boolean;
  notes?: string;
  isCritical?: boolean;
  baselineStartDate?: string;
  baselineEndDate?: string;
  baselineDurationDays?: number;
  cost?: number;
  subTasks?: SubTask[]; // Checklist de sub-tarefas internas
  attachments?: TaskAttachment[]; // Documentos anexados na Tarefa ou Subprojeto
  methodology?: ProjectMethodology; // Metodologia do Subprojeto ('linear' padrão ou 'agile' no Scrumble)
  kanbanStatus?: KanbanStatus; // Coluna atual no quadro Kanban do Scrumble
  sprintId?: string; // ID da Sprint associada no Scrumble
  storyPoints?: number; // Pontos de esforço / complexidade no Scrumble
  isBlocked?: boolean; // Sinalizador de impedimento na Daily / Kanban
  blockerNote?: string; // Descrição curta do impedimento
  pomodorosEstimated?: number; // Estimativa em blocos Pomodoro
  pomodorosCompleted?: number; // Blocos Pomodoro concluídos nesta tarefa
  completedAt?: string; // Data ISO (YYYY-MM-DD) da conclusão para histórico da Daily
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
  scheduleDirection?: ScheduleDirection; // Modo de agendamento global opcional
  targetEndDate?: string; // Data Limite global quando scheduleDirection === 'backward'
  currency: 'BRL' | 'USD' | 'EUR';
}

export type ViewMode =
  | 'gantt'
  | 'taskSheet'
  | 'networkDiagram'
  | 'resourceSheet'
  | 'week'
  | 'nexo'
  | 'drafts'
  | 'scrumble';

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
  leadTimeDays: number; // Duração em dias úteis (inclusivo)
  startDate?: string; // YYYY-MM-DD (Data de início calculada de trás para frente ou para a frente)
  deadline: string; // YYYY-MM-DD (Data de término calculada)
  predecessorText?: string; // Predecessoras (ex: "1", "1, 2") — se vazio, segue encadeamento ou livre
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
  scheduleDirection?: ScheduleDirection; // 'backward' (padrão no Nexo: a partir da Data de Término do Ponto B) ou 'forward' (a partir da Data de Início)
  projectStartDate?: string; // Data de início quando scheduleDirection === 'forward'
  reachedPointA: boolean; // Fase 2 concluída ("Cheguei no Dia de Hoje - Ponto A")
  logicValidated: boolean; // Gate da Fase 3 (Validação Lógica A -> B revisada)
  ignitionApproved: boolean; // Gate da Fase 4 -> 5 aprovado
  activePhase: NexoPhase;
  roleView: NexoRoleView;
  isFocusModeNewProject: boolean; // Escurece menu lateral ao clicar em "Novo Projeto" na Fase 1
  retrospectives: NexoRetrospectiveLog[];
}

// =========================================================
// Tipos do Plugin DRAFTS (Quadro Branco Interativo estilo Miro)
// =========================================================

export type DraftTool =
  | 'select'
  | 'pan'
  | 'text'
  | 'sticky'
  | 'rect'
  | 'triangle'
  | 'ellipse'
  | 'connector'
  | 'image';

export type DraftElementType = 'sticky' | 'shape' | 'text' | 'image';

export type DraftShapeKind = 'rectangle' | 'triangle' | 'ellipse';

export type DraftAnchorSide = 'top' | 'right' | 'bottom' | 'left';

export interface DraftTextStyle {
  fontSize: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  textAlign?: 'left' | 'center' | 'right';
  textColor?: string;
}

export interface DraftElement {
  id: string;
  type: DraftElementType;
  shapeKind?: DraftShapeKind;
  x: number;
  y: number;
  width: number;
  height: number;
  fillColor: string;
  strokeColor?: string;
  strokeWidth?: number;
  htmlContent?: string;
  textStyle?: DraftTextStyle;
  imageUrl?: string;
  imageStorageProvider?: 'supabase' | 'indexeddb' | 'inline';
  imageStoragePath?: string;
  imageName?: string;
  zIndex: number;
}

export interface DraftConnector {
  id: string;
  fromElementId?: string;
  fromAnchor?: DraftAnchorSide;
  fromPoint: { x: number; y: number };
  toElementId?: string;
  toAnchor?: DraftAnchorSide;
  toPoint: { x: number; y: number };
  color: string;
  strokeWidth: number;
  dashed?: boolean;
  startArrow?: boolean;
  endArrow?: boolean;
}

export interface DraftsState {
  boardTitle: string;
  elements: DraftElement[];
  connectors: DraftConnector[];
  viewport: { x: number; y: number; zoom: number };
}

// =========================================================
// Tipos do Plugin SCRUMBLE (Scrum Solo + Kanban + Timeboxing)
// =========================================================

export interface ScrumbleSprintReview {
  deliveredSummary: string;
  whatWorked: string;
  whatToImprove: string;
  completedCount: number;
  plannedCount: number;
  pomodorosCompleted: number;
  closedAt: string;
}

export interface ScrumbleSprint {
  id: string;
  number: number;
  name: string;
  goal: string;
  startDate: string; // YYYY-MM-DD (preferencialmente Segunda-feira)
  endDate: string; // YYYY-MM-DD (Sexta-feira da semana 1 ou 2)
  durationWeeks: 1 | 2;
  status: 'planning' | 'active' | 'completed';
  review?: ScrumbleSprintReview;
}

export interface ScrumbleDailyLog {
  id: string;
  date: string; // YYYY-MM-DD
  sprintId?: string;
  yesterdaySummary: string;
  todayFocus: string;
  blockers: string;
  durationSecondsSpent?: number;
  createdAt: string;
}

export interface ScrumblePomodoroConfig {
  workMinutes: number; // Padrão: 25 min
  shortBreakMinutes: number; // Padrão: 5 min
  longBreakMinutes: number; // Padrão: 15 min
  cyclesBeforeLongBreak: number; // Padrão: 4 ciclos
}

export interface ScrumbleState {
  activeSubprojectId: string | 'all' | 'agile_only';
  wipLimitInProgress: number;
  showIceboxColumn: boolean;
  currentSprint: ScrumbleSprint | null;
  sprintHistory: ScrumbleSprint[];
  dailyLogs: ScrumbleDailyLog[];
  pomodoroConfig: ScrumblePomodoroConfig;
  totalPomodorosCompleted: number;
  activePomodoroTaskId?: string | null;
}
