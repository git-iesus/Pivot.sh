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

export interface ProjectMetadata {
  title: string;
  manager: string;
  startDate: string; // Data de início do projeto
  currentDate: string; // Data de status
  calendar: string;
  activeWeekDays: number[]; // 0 = Domingo, 1 = Segunda, 2 = Terça, 3 = Quarta, 4 = Quinta, 5 = Sexta, 6 = Sábado
  currency: 'BRL' | 'USD' | 'EUR';
}

export type ViewMode = 'gantt' | 'taskSheet' | 'networkDiagram' | 'resourceSheet' | 'week';

export type ZoomLevel = 'days' | 'weeks' | 'months';
