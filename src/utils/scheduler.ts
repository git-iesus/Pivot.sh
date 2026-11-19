import { Task, CalendarException, ScheduleDirection } from '../types/project';

/**
 * Utilitários de data e cálculo de cronograma do MS Project com suporte
 * a personalização do Calendário Base de Trabalho (dias de atividade e inatividade),
 * Calendário Individual por Subprojeto (tarefas agrupadoras da EAP/WBS)
 * e Motor Global de Datas de Exceção (feriados, recessos, emendas e expedientes atípicos).
 */

const SHORT_WEEKDAY_NAMES = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

/**
 * Formata de forma compacta uma lista de dias úteis da semana (ex: "Seg–Sex", "Ter–Sáb", "Seg–Sáb").
 */
export function formatActiveWeekDaysShort(activeWeekDays: number[] = [1, 2, 3, 4, 5]): string {
  if (!activeWeekDays || activeWeekDays.length === 0) return 'Seg–Sex';
  const sorted = Array.from(new Set(activeWeekDays)).sort((a, b) => a - b);
  if (sorted.length === 7) return 'Dom–Sáb (7d)';
  if (sorted.length === 1) return SHORT_WEEKDAY_NAMES[sorted[0]] || '';

  // Verifica se forma uma sequência contínua (ex: [1,2,3,4,5] -> Seg–Sex ou [2,3,4,5,6] -> Ter–Sáb)
  let isContiguous = true;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] !== sorted[i - 1] + 1) {
      isContiguous = false;
      break;
    }
  }

  if (isContiguous) {
    return `${SHORT_WEEKDAY_NAMES[sorted[0]]}–${SHORT_WEEKDAY_NAMES[sorted[sorted.length - 1]]}`;
  }

  return sorted.map((d) => SHORT_WEEKDAY_NAMES[d]).join(', ');
}

/**
 * Encontra o Subprojeto (tarefa-resumo pai mais próxima na EAP) ao qual uma tarefa pertence.
 */
export function getParentSubproject(tasks: Task[], taskIndex: number): Task | undefined {
  const target = tasks[taskIndex];
  if (!target || target.outlineLevel <= 0) return undefined;

  for (let i = taskIndex - 1; i >= 0; i--) {
    const candidate = tasks[i];
    if (candidate.outlineLevel < target.outlineLevel && candidate.isSummary) {
      return candidate;
    }
  }
  return undefined;
}

/**
 * Retorna os dias ativos da semana efetivos para uma tarefa (por índice na lista):
 * - Se a própria tarefa for um Subprojeto com calendário próprio (`activeWeekDays`), utiliza-o;
 * - Caso contrário, herda do Subprojeto ancestral mais próximo na hierarquia EAP que possua calendário próprio;
 * - Caso nenhum ancestral defina calendário próprio, utiliza o calendário global do Projeto Macro.
 */
export function getEffectiveActiveWeekDays(
  tasks: Task[],
  taskIndex: number,
  projectActiveWeekDays: number[] = [1, 2, 3, 4, 5]
): number[] {
  const fallback =
    projectActiveWeekDays && projectActiveWeekDays.length > 0
      ? projectActiveWeekDays
      : [1, 2, 3, 4, 5];

  const target = tasks[taskIndex];
  if (!target) return fallback;

  if (target.isSummary && target.activeWeekDays && target.activeWeekDays.length > 0) {
    return target.activeWeekDays;
  }

  let requiredMaxLevel = target.outlineLevel;
  for (let i = taskIndex - 1; i >= 0; i--) {
    const candidate = tasks[i];
    if (candidate.outlineLevel < requiredMaxLevel) {
      if (candidate.isSummary && candidate.activeWeekDays && candidate.activeWeekDays.length > 0) {
        return candidate.activeWeekDays;
      }
      requiredMaxLevel = candidate.outlineLevel;
      if (requiredMaxLevel === 0) break;
    }
  }

  return fallback;
}

/**
 * Retorna as Datas de Exceção efetivas (feriados, recessos, expedientes atípicos) para uma tarefa:
 * - Se a própria tarefa for um Subprojeto (`isSummary`), retorna exclusivamente `target.exceptions || []`;
 * - Se a tarefa pertencer a um Subprojeto ancestral na hierarquia EAP, retorna exclusivamente `candidate.exceptions || []` daquele Subprojeto;
 * - Caso a tarefa esteja na raiz fora de qualquer Subprojeto, retorna `fallbackExceptions`.
 */
export function getEffectiveExceptions(
  tasks: Task[],
  taskIndex: number,
  fallbackExceptions: CalendarException[] = []
): CalendarException[] {
  const target = tasks[taskIndex];
  if (!target) return fallbackExceptions;

  if (target.isSummary) {
    return target.exceptions || [];
  }

  let requiredMaxLevel = target.outlineLevel;
  for (let i = taskIndex - 1; i >= 0; i--) {
    const candidate = tasks[i];
    if (candidate.outlineLevel < requiredMaxLevel) {
      if (candidate.isSummary) {
        return candidate.exceptions || [];
      }
      requiredMaxLevel = candidate.outlineLevel;
      if (requiredMaxLevel === 0) break;
    }
  }

  return fallbackExceptions;
}

/**
 * Retorna a configuração efetiva de direção de agendamento ('forward' ou 'backward')
 * e a Data Limite (`targetEndDate`) para uma tarefa com base no seu Subprojeto ancestral mais próximo
 * (ou na configuração global do projeto).
 */
export function getEffectiveScheduleConfig(
  tasks: Task[],
  taskIndex: number,
  projectDirection: ScheduleDirection = 'forward',
  projectTargetEndDate?: string
): {
  direction: ScheduleDirection;
  targetEndDate?: string;
  scopeKey: string;
  scopeSummaryIndex: number | null;
} {
  const target = tasks[taskIndex];
  if (!target) {
    return {
      direction: projectDirection,
      targetEndDate: projectTargetEndDate,
      scopeKey: 'project_root',
      scopeSummaryIndex: null,
    };
  }

  if (target.isSummary && target.scheduleDirection) {
    return {
      direction: target.scheduleDirection,
      targetEndDate: target.targetEndDate || target.endDate,
      scopeKey: `subproject_${taskIndex}`,
      scopeSummaryIndex: taskIndex,
    };
  }

  let requiredMaxLevel = target.outlineLevel;
  for (let i = taskIndex - 1; i >= 0; i--) {
    const candidate = tasks[i];
    if (candidate.outlineLevel < requiredMaxLevel) {
      if (candidate.isSummary && candidate.scheduleDirection) {
        return {
          direction: candidate.scheduleDirection,
          targetEndDate: candidate.targetEndDate || candidate.endDate,
          scopeKey: `subproject_${i}`,
          scopeSummaryIndex: i,
        };
      }
      requiredMaxLevel = candidate.outlineLevel;
      if (requiredMaxLevel === 0) break;
    }
  }

  return {
    direction: projectDirection,
    targetEndDate: projectTargetEndDate,
    scopeKey: 'project_root',
    scopeSummaryIndex: null,
  };
}

// Busca se existe uma Data de Exceção cadastrada para uma determinada data
export function getExceptionForDate(
  dateOrIso: Date | string,
  exceptions: CalendarException[] = []
): CalendarException | undefined {
  if (!exceptions || exceptions.length === 0) return undefined;
  const iso = typeof dateOrIso === 'string' ? dateOrIso : toISODate(dateOrIso);
  for (let i = exceptions.length - 1; i >= 0; i--) {
    const ex = exceptions[i];
    const start = ex.date;
    const end = ex.endDate && ex.endDate >= ex.date ? ex.endDate : ex.date;
    if (iso >= start && iso <= end) {
      return ex;
    }
  }
  return undefined;
}

// Verifica se uma data é dia útil de atividade com base nos dias da semana ativos e nas Datas de Exceção Globais
export function isWorkDay(
  date: Date,
  activeWeekDays: number[] = [1, 2, 3, 4, 5],
  exceptions: CalendarException[] = []
): boolean {
  const ex = getExceptionForDate(date, exceptions);
  if (ex) {
    return ex.isWorkingDay;
  }
  if (!activeWeekDays || activeWeekDays.length === 0) return true;
  return activeWeekDays.includes(date.getDay());
}

// Verifica se uma data é dia inativo (mantido para compatibilidade e colorização do Gantt)
export function isWeekend(
  date: Date,
  activeWeekDays: number[] = [1, 2, 3, 4, 5],
  exceptions: CalendarException[] = []
): boolean {
  return !isWorkDay(date, activeWeekDays, exceptions);
}

// Retorna o próximo dia útil de atividade caso a data caia em dia inativo ou feriado/exceção
export function toWorkDay(
  date: Date,
  activeWeekDays: number[] = [1, 2, 3, 4, 5],
  exceptions: CalendarException[] = []
): Date {
  const result = new Date(date);
  let attempts = 0;
  while (!isWorkDay(result, activeWeekDays, exceptions) && attempts < 365) {
    result.setDate(result.getDate() + 1);
    attempts++;
  }
  return result;
}

// Retorna o dia útil anterior caso a data caia em dia inativo ou feriado/exceção
export function toPrevWorkDay(
  date: Date,
  activeWeekDays: number[] = [1, 2, 3, 4, 5],
  exceptions: CalendarException[] = []
): Date {
  const result = new Date(date);
  let attempts = 0;
  while (!isWorkDay(result, activeWeekDays, exceptions) && attempts < 365) {
    result.setDate(result.getDate() - 1);
    attempts++;
  }
  return result;
}

// Adiciona N dias úteis de atividade a uma data (pulando finais de semana e exceções não úteis)
export function addWorkDays(
  startDate: Date,
  days: number,
  activeWeekDays: number[] = [1, 2, 3, 4, 5],
  exceptions: CalendarException[] = []
): Date {
  if (days <= 0) return toWorkDay(startDate, activeWeekDays, exceptions);
  const result = toWorkDay(startDate, activeWeekDays, exceptions);

  let added = 0;
  let safety = 0;
  while (added < days && safety < 1000) {
    if (isWorkDay(result, activeWeekDays, exceptions)) {
      added++;
      if (added === days) break;
    }
    result.setDate(result.getDate() + 1);
    safety++;
  }
  return result;
}

// Subtrai N dias úteis de atividade a partir de uma data de término (cálculo retroativo para TT)
export function subtractWorkDays(
  endDate: Date,
  days: number,
  activeWeekDays: number[] = [1, 2, 3, 4, 5],
  exceptions: CalendarException[] = []
): Date {
  if (days <= 0) return toPrevWorkDay(endDate, activeWeekDays, exceptions);
  const result = toPrevWorkDay(endDate, activeWeekDays, exceptions);

  let count = 0;
  let safety = 0;
  while (count < days && safety < 1000) {
    if (isWorkDay(result, activeWeekDays, exceptions)) {
      count++;
      if (count === days) break;
    }
    result.setDate(result.getDate() - 1);
    safety++;
  }
  return result;
}

// Calcula a diferença em dias úteis entre duas datas (inclusive)
export function getWorkDaysDifference(
  startDate: Date,
  endDate: Date,
  activeWeekDays: number[] = [1, 2, 3, 4, 5],
  exceptions: CalendarException[] = []
): number {
  if (startDate > endDate) return 0;
  let count = 0;
  const current = new Date(startDate);

  while (current <= endDate) {
    if (isWorkDay(current, activeWeekDays, exceptions)) {
      count++;
    }
    current.setDate(current.getDate() + 1);
  }
  return count;
}

// Formatação PT-BR: AAAA-MM-DD para DD/MM/AAAA
export function formatDatePTBR(isoDate: string): string {
  if (!isoDate) return '';
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

// Converte DD/MM/AAAA para AAAA-MM-DD
export function parseDatePTBR(ptDate: string): string {
  if (!ptDate) return '';
  const parts = ptDate.split('/');
  if (parts.length !== 3) return ptDate;
  return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
}

export function toISODate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseISODate(isoStr: string): Date {
  const [y, m, d] = isoStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export interface ParsedPredecessor {
  predId: number;
  type: 'TI' | 'II' | 'TT' | 'IT';
  lagValue: number; // Positivo para atraso (+), negativo para avanço (-), 0 por padrão
  lagUnit: 'days' | 'percent';
  rawToken: string;
}

const PREDECESSOR_TOKEN_REGEX =
  /^(\d+)\s*(TI|FS|II|SS|TT|FF|IT|SF)?\s*(?:([+-])\s*(\d+(?:[.,]\d+)?)\s*(%|d|dias?|days?|s|sem|semanas?|w|wks?)?)?$/i;

/**
 * Faz o parsing de strings de predecessoras no formato do MS Project:
 * Estrutura: [ID da Tarefa][Sigla do Vínculo][+/- Latência]
 * Suporta múltiplos vínculos separados por `;` (PT-BR) ou `,` (EN-US),
 * siglas em Português (`TI`, `II`, `TT`, `IT`) ou Inglês (`FS`, `SS`, `FF`, `SF`) ou omitido (`TI`),
 * e latência (`+`) / antecipação (`-`) em dias úteis (`+3d`, `-2d`) ou porcentagem (`+50%`, `-25%`).
 */
export function parsePredecessors(predText?: string): ParsedPredecessor[] {
  if (!predText) return [];
  const items = predText
    .split(/[;,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const result: ParsedPredecessor[] = [];

  for (const item of items) {
    const match = item.match(PREDECESSOR_TOKEN_REGEX);
    if (!match) continue;

    const predId = parseInt(match[1], 10);
    if (isNaN(predId)) continue;

    const rawType = (match[2] || '').toUpperCase();
    let type: 'TI' | 'II' | 'TT' | 'IT' = 'TI';
    if (rawType === 'II' || rawType === 'SS') {
      type = 'II';
    } else if (rawType === 'TT' || rawType === 'FF') {
      type = 'TT';
    } else if (rawType === 'IT' || rawType === 'SF') {
      type = 'IT';
    } else {
      type = 'TI';
    }

    let lagValue = 0;
    let lagUnit: 'days' | 'percent' = 'days';

    if (match[3] && match[4]) {
      const sign = match[3] === '-' ? -1 : 1;
      const numeric = parseFloat(match[4].replace(',', '.'));
      const rawUnit = (match[5] || '').toLowerCase();

      if (!isNaN(numeric)) {
        if (rawUnit === '%') {
          lagUnit = 'percent';
          lagValue = sign * numeric;
        } else if (rawUnit.startsWith('s') || rawUnit.startsWith('w')) {
          lagUnit = 'days';
          lagValue = sign * numeric * 5;
        } else {
          lagUnit = 'days';
          lagValue = sign * numeric;
        }
      }
    }

    result.push({ predId, type, lagValue, lagUnit, rawToken: item });
  }

  return result;
}

/**
 * Converte a latência/antecipação de uma predecessora em quantidade de dias úteis,
 * considerando porcentagem sobre a duração da tarefa predecessora quando aplicável.
 */
export function resolveLagWorkDays(pred: ParsedPredecessor, predDurationDays: number): number {
  if (!pred.lagValue) return 0;
  if (pred.lagUnit === 'percent') {
    return Math.round((Math.max(1, predDurationDays) * pred.lagValue) / 100);
  }
  return Math.round(pred.lagValue);
}

/**
 * Desloca uma data em N dias úteis para frente (`+`) ou para trás (`-`),
 * respeitando dias ativos da semana e exceções de calendário.
 */
export function offsetWorkDays(
  baseDate: Date,
  offsetDays: number,
  activeWeekDays: number[] = [1, 2, 3, 4, 5],
  exceptions: CalendarException[] = [],
  snapMode: 'next' | 'prev' = 'next'
): Date {
  const result =
    snapMode === 'prev'
      ? toPrevWorkDay(baseDate, activeWeekDays, exceptions)
      : toWorkDay(baseDate, activeWeekDays, exceptions);

  const steps = Math.round(offsetDays);
  if (steps === 0) return result;

  const direction = steps > 0 ? 1 : -1;
  let remaining = Math.abs(steps);
  let safety = 0;

  while (remaining > 0 && safety < 2000) {
    result.setDate(result.getDate() + direction);
    if (isWorkDay(result, activeWeekDays, exceptions)) {
      remaining--;
    }
    safety++;
  }

  return result;
}

/**
 * Formata uma string de predecessoras em descrição legível para tooltips.
 */
export function formatPredecessorTooltip(predText?: string): string {
  const parsed = parsePredecessors(predText);
  if (parsed.length === 0) return '';

  const typeLabel: Record<'TI' | 'II' | 'TT' | 'IT', string> = {
    TI: 'Término-Início',
    II: 'Início-Início',
    TT: 'Término-Término',
    IT: 'Início-Término',
  };

  return parsed
    .map((p) => {
      const base = `#${p.predId} (${typeLabel[p.type]})`;
      if (!p.lagValue) return base;
      const sign = p.lagValue > 0 ? '+' : '';
      const unit = p.lagUnit === 'percent' ? '%' : 'd';
      return `${base.slice(0, -1)}, ${sign}${p.lagValue}${unit})`;
    })
    .join(' • ');
}

/**
 * Remapeia os índices 1-based em `predecessorText` quando tarefas são inseridas ou excluídas,
 * preservando os vínculos com as mesmas tarefas pelo ID (incluindo siglas e latências/avanços)
 * e descartando referências excluídas ou auto-referências.
 */
export function remapPredecessorsForNewTaskOrder(oldTasks: Task[], newTasks: Task[]): Task[] {
  const oldRowToTaskId = new Map<number, string>();
  oldTasks.forEach((t, idx) => {
    oldRowToTaskId.set(idx + 1, t.id);
  });

  const taskIdToNewRow = new Map<string, number>();
  newTasks.forEach((t, idx) => {
    taskIdToNewRow.set(t.id, idx + 1);
  });

  return newTasks.map((t, idx) => {
    const currentNewRowNum = idx + 1;
    if (!t.predecessorText || !t.predecessorText.trim()) return t;

    const sep = t.predecessorText.includes(';') ? ';' : ', ';
    const remapped = t.predecessorText
      .split(/[;,]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((item) => {
        const match = item.match(/^(\d+)\s*(.*)$/);
        if (!match) return '';
        const oldPredNum = parseInt(match[1], 10);
        const predTaskId = oldRowToTaskId.get(oldPredNum);
        if (!predTaskId) return '';
        const newPredNum = taskIdToNewRow.get(predTaskId);
        if (newPredNum === undefined || newPredNum === currentNewRowNum) return '';
        const suffix = (match[2] || '').trim();
        return `${newPredNum}${suffix}`;
      })
      .filter(Boolean)
      .join(sep);

    return remapped === t.predecessorText ? t : { ...t, predecessorText: remapped };
  });
}

/**
 * Regra 5 — Prevenção de Loop Infinito:
 * Verifica se há referência circular (direta ou indireta, auto-referência ou dependência em Subprojeto pai)
 * caso `targetTaskId` receba `candidatePredecessorText` (ou no estado atual das tarefas).
 */
export function detectCircularDependency(
  tasks: Task[],
  targetTaskId?: string,
  candidatePredecessorText?: string
): {
  hasCycle: boolean;
  cyclePath?: number[];
  message?: string;
} {
  if (!tasks || tasks.length === 0) return { hasCycle: false };
  if (candidatePredecessorText !== undefined && candidatePredecessorText.trim() === '') {
    return { hasCycle: false };
  }

  const virtualTasks = tasks.map((t, i) => {
    const isSummary =
      i + 1 < tasks.length && tasks[i + 1].outlineLevel > t.outlineLevel;
    return {
      ...t,
      isSummary,
      predecessorText:
        targetTaskId && t.id === targetTaskId && candidatePredecessorText !== undefined
          ? candidatePredecessorText
          : t.predecessorText,
    };
  });

  const targetIdx = targetTaskId ? virtualTasks.findIndex((t) => t.id === targetTaskId) : -1;
  const indicesToCheck =
    targetIdx >= 0 ? [targetIdx] : virtualTasks.map((_, i) => i);

  // 1. Checar auto-referência e dependência de Subprojeto ancestral/descendente (apenas na tarefa editada quando targetTaskId for informado)
  for (const idx of indicesToCheck) {
    const task = virtualTasks[idx];
    const rowNum = idx + 1;
    if (!task.predecessorText || !task.predecessorText.trim()) continue;
    const preds = parsePredecessors(task.predecessorText);

    for (const { predId } of preds) {
      if (predId === rowNum) {
        return {
          hasCycle: true,
          cyclePath: [rowNum, rowNum],
          message: `Referência circular bloqueada: a Tarefa #${rowNum} ("${task.name}") não pode depender de si mesma.`,
        };
      }

      const predIdx = predId - 1;
      if (predIdx >= 0 && predIdx < virtualTasks.length) {
        const predTask = virtualTasks[predIdx];
        // Se predTask é Subprojeto pai/ancestral de task
        if (predTask.isSummary && predIdx < idx && predTask.outlineLevel < task.outlineLevel) {
          let isAncestor = true;
          for (let k = predIdx + 1; k <= idx; k++) {
            if (virtualTasks[k].outlineLevel <= predTask.outlineLevel) {
              isAncestor = false;
              break;
            }
          }
          if (isAncestor) {
            return {
              hasCycle: true,
              cyclePath: [rowNum, predId],
              message: `Referência circular bloqueada: a Tarefa #${rowNum} não pode ter seu próprio Subprojeto agrupador (#${predId}) como predecessora.`,
            };
          }
        }
      }
    }
  }

  // 2. Detecção de ciclo no grafo direcionado via DFS (coloração: 0 = não visitado, 1 = na pilha atual, 2 = concluído)
  const n = virtualTasks.length;
  const state = new Array<number>(n + 1).fill(0);
  const parentStack: number[] = [];

  const dfs = (u: number): { found: boolean; cycle?: number[] } => {
    state[u] = 1;
    parentStack.push(u);

    const taskU = virtualTasks[u - 1];
    if (taskU && !taskU.isSummary && taskU.predecessorText) {
      const preds = parsePredecessors(taskU.predecessorText);
      for (const { predId: v } of preds) {
        if (v < 1 || v > n) continue;
        if (state[v] === 1) {
          const cycleStartIdx = parentStack.indexOf(v);
          const cycle =
            cycleStartIdx >= 0
              ? [...parentStack.slice(cycleStartIdx), v]
              : [u, v, u];
          return { found: true, cycle };
        }
        if (state[v] === 0) {
          const res = dfs(v);
          if (res.found) return res;
        }
      }
    }

    parentStack.pop();
    state[u] = 2;
    return { found: false };
  };

  const startNodes =
    targetIdx >= 0 ? [targetIdx + 1] : Array.from({ length: n }, (_, i) => i + 1);
  for (const i of startNodes) {
    if (state[i] === 0) {
      const res = dfs(i);
      if (res.found && res.cycle) {
        const pathStr = res.cycle.map((id) => `#${id}`).join(' ➔ ');
        return {
          hasCycle: true,
          cyclePath: res.cycle,
          message: `Referência circular bloqueada (${pathStr}): duas ou mais tarefas dependem mutuamente uma da outra.`,
        };
      }
    }
  }

  return { hasCycle: false };
}

/**
 * Identifica arestas que formam ciclo para ignorá-las com segurança durante o cálculo,
 * garantindo prevenção absoluta contra loops infinitos mesmo em dados importados.
 */
function getSafeCycleEdges(tasks: Task[]): Set<string> {
  const n = tasks.length;
  const state = new Array<number>(n + 1).fill(0);
  const backEdges = new Set<string>();

  const dfs = (u: number) => {
    state[u] = 1;
    const taskU = tasks[u - 1];
    if (taskU && !taskU.isSummary && taskU.predecessorText) {
      const preds = parsePredecessors(taskU.predecessorText);
      for (const { predId: v } of preds) {
        if (v < 1 || v > n) continue;
        if (u === v || state[v] === 1) {
          backEdges.add(`${u}->${v}`);
        } else if (state[v] === 0) {
          dfs(v);
        }
      }
    }
    state[u] = 2;
  };

  for (let i = 1; i <= n; i++) {
    if (state[i] === 0) dfs(i);
  }
  return backEdges;
}

/**
 * Recalcula o cronograma completo (Classificação Automática de Subprojetos, Calendários por Subprojeto,
 * Agendamento Forward ASAP, Agendamento Reverso ALAP "A partir da Data de Término",
 * Predecessoras/Sucessoras, Datas de Exceção Globais, Alerta de Prazo Estourado e Caminho Crítico)
 * atuando como Fonte Única da Verdade (Single Source of Truth) para o Grid, Minha Semana e Gráfico de Gantt.
 */
export function recalculateSchedule(
  tasks: Task[],
  activeWeekDays: number[] = [1, 2, 3, 4, 5],
  exceptions: CalendarException[] = [],
  projectScheduleDirection: ScheduleDirection = 'forward',
  projectTargetEndDate?: string
): Task[] {
  if (!tasks || tasks.length === 0) return [];

  const updatedTasks: Task[] = tasks.map((t) => ({
    ...t,
    isOverdueStart: false,
  }));

  // 1. Classificar automaticamente como Subprojeto (isSummary = true) toda tarefa que possuir subtarefas abaixo na EAP
  for (let i = 0; i < updatedTasks.length; i++) {
    const current = updatedTasks[i];
    const next = updatedTasks[i + 1];
    if (next && next.outlineLevel > current.outlineLevel) {
      current.isSummary = true;
    } else {
      current.isSummary = false;
    }
    current.isMilestone = current.durationDays === 0 && !current.isSummary;
  }

  // 1B. Auto-Saneamento de auto-referências em predecessorText (ex: "4" na linha 4 causado por deslocamento legado)
  for (let i = 0; i < updatedTasks.length; i++) {
    const task = updatedTasks[i];
    const currentRowNum = i + 1;
    if (!task.predecessorText || !task.predecessorText.trim()) continue;
    const rawItems = task.predecessorText
      .split(/[;,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const cleanedItems = rawItems.filter((item) => {
      const match = item.match(/^(\d+)/);
      if (!match) return true;
      return parseInt(match[1], 10) !== currentRowNum;
    });
    if (cleanedItems.length !== rawItems.length) {
      const sep = task.predecessorText.includes(';') ? ';' : ', ';
      task.predecessorText = cleanedItems.join(sep);
    }
  }

  // 2. Criar mapa de índice 1-based e conjunto de arestas cíclicas ignoradas (Prevenção de Loop Infinito - Regra 5)
  const taskMap = new Map<number, Task>();
  updatedTasks.forEach((t, idx) => {
    taskMap.set(idx + 1, t);
  });
  const ignoredCycleEdges = getSafeCycleEdges(updatedTasks);

  // Mapear configuração de agendamento efetiva por índice de tarefa
  const scheduleConfigs = updatedTasks.map((_, idx) =>
    getEffectiveScheduleConfig(updatedTasks, idx, projectScheduleDirection, projectTargetEndDate)
  );

  // 3A. Propagação de Agendamento FORWARD (Padrão: "A partir da Data de Início" - ASAP)
  const maxPasses = Math.max(15, updatedTasks.length + 2);
  let scheduleChanged = true;
  let pass = 0;
  while (scheduleChanged && pass < maxPasses) {
    scheduleChanged = false;
    pass++;

    updatedTasks.forEach((task, idx) => {
      if (task.isSummary) return;
      const cfg = scheduleConfigs[idx];
      if (cfg.direction === 'backward' && cfg.targetEndDate) return; // Calculado no motor ALAP reverso (3B)

      const currentTaskNum = idx + 1;
      const taskActiveDays = getEffectiveActiveWeekDays(updatedTasks, idx, activeWeekDays);
      const taskExceptions = getEffectiveExceptions(updatedTasks, idx, exceptions);

      if (task.predecessorText && task.predecessorText.trim() !== '') {
        const parsedPreds = parsePredecessors(task.predecessorText);
        if (parsedPreds.length > 0) {
          let maxReqStart: Date | null = null;
          let maxReqEnd: Date | null = null;

          for (const pred of parsedPreds) {
            const { predId, type } = pred;
            if (predId === currentTaskNum) continue;
            if (ignoredCycleEdges.has(`${currentTaskNum}->${predId}`)) continue;
            const predTask = taskMap.get(predId);
            if (!predTask) continue;

            const lagDays = resolveLagWorkDays(pred, predTask.durationDays);

            if (type === 'II') {
              const predStart = parseISODate(predTask.startDate);
              const reqStart = offsetWorkDays(
                predStart,
                lagDays,
                taskActiveDays,
                taskExceptions,
                'next'
              );
              if (!maxReqStart || reqStart > maxReqStart) {
                maxReqStart = reqStart;
              }
            } else if (type === 'TT') {
              const predEnd = parseISODate(predTask.endDate);
              const reqEnd = offsetWorkDays(
                predEnd,
                lagDays,
                taskActiveDays,
                taskExceptions,
                'prev'
              );
              if (!maxReqEnd || reqEnd > maxReqEnd) {
                maxReqEnd = reqEnd;
              }
            } else if (type === 'IT') {
              const predStart = parseISODate(predTask.startDate);
              const reqEnd = offsetWorkDays(
                predStart,
                lagDays,
                taskActiveDays,
                taskExceptions,
                'prev'
              );
              if (!maxReqEnd || reqEnd > maxReqEnd) {
                maxReqEnd = reqEnd;
              }
            } else {
              // Padrão TI: Término-Início (começa no dia útil seguinte ao término + latência/antecipação)
              const predEnd = parseISODate(predTask.endDate);
              const reqStart = offsetWorkDays(
                predEnd,
                1 + lagDays,
                taskActiveDays,
                taskExceptions,
                'prev'
              );
              if (!maxReqStart || reqStart > maxReqStart) {
                maxReqStart = reqStart;
              }
            }
          }

          let newStartDate = task.startDate;
          let newEndDate = task.endDate;

          if (maxReqEnd && !maxReqStart) {
            const finalEnd = maxReqEnd;
            const finalStart =
              task.durationDays === 0
                ? finalEnd
                : subtractWorkDays(finalEnd, task.durationDays, taskActiveDays, taskExceptions);
            newStartDate = toISODate(finalStart);
            newEndDate = toISODate(finalEnd);
          } else if (maxReqStart && !maxReqEnd) {
            const finalStart = maxReqStart;
            const finalEnd =
              task.durationDays === 0
                ? finalStart
                : addWorkDays(finalStart, task.durationDays, taskActiveDays, taskExceptions);
            newStartDate = toISODate(finalStart);
            newEndDate = toISODate(finalEnd);
          } else if (maxReqStart && maxReqEnd) {
            const tentativeStart = maxReqStart;
            const tentativeEnd =
              task.durationDays === 0
                ? tentativeStart
                : addWorkDays(tentativeStart, task.durationDays, taskActiveDays, taskExceptions);
            if (tentativeEnd < maxReqEnd) {
              const finalEnd = maxReqEnd;
              const finalStart =
                task.durationDays === 0
                  ? finalEnd
                  : subtractWorkDays(finalEnd, task.durationDays, taskActiveDays, taskExceptions);
              newStartDate = toISODate(finalStart);
              newEndDate = toISODate(finalEnd);
            } else {
              newStartDate = toISODate(tentativeStart);
              newEndDate = toISODate(tentativeEnd);
            }
          }

          if (newStartDate !== task.startDate || newEndDate !== task.endDate) {
            task.startDate = newStartDate;
            task.endDate = newEndDate;
            scheduleChanged = true;
          }
          return;
        }
      }

      // Tarefas sem predecessoras em modo Forward: valida início em dia útil e recalcula término
      const start = toWorkDay(parseISODate(task.startDate), taskActiveDays, taskExceptions);
      const newStartDate = toISODate(start);
      const newEndDate =
        task.durationDays === 0
          ? newStartDate
          : toISODate(addWorkDays(start, task.durationDays, taskActiveDays, taskExceptions));
      if (newStartDate !== task.startDate || newEndDate !== task.endDate) {
        task.startDate = newStartDate;
        task.endDate = newEndDate;
        scheduleChanged = true;
      }
    });
  }

  // 3B. Propagação de Agendamento REVERSO (De Trás para Frente: "A partir da Data de Término" - ALAP)
  // Agrupa tarefas executáveis por escopo reverso (Subprojeto reverso ou Projeto reverso)
  const backwardScopes = new Map<
    string,
    { targetEndDate: string; taskIndices: number[]; summaryIndex: number | null }
  >();

  updatedTasks.forEach((task, idx) => {
    if (task.isSummary) return;
    const cfg = scheduleConfigs[idx];
    if (cfg.direction === 'backward' && cfg.targetEndDate) {
      const existing = backwardScopes.get(cfg.scopeKey);
      if (existing) {
        existing.taskIndices.push(idx);
      } else {
        backwardScopes.set(cfg.scopeKey, {
          targetEndDate: cfg.targetEndDate,
          taskIndices: [idx],
          summaryIndex: cfg.scopeSummaryIndex,
        });
      }
    }
  });

  backwardScopes.forEach(({ targetEndDate, taskIndices }) => {
    const scopeRowNums = new Set<number>(taskIndices.map((i) => i + 1));

    // Nota técnica (Regra 3): Mapear o inverso na memória — descobrir quem são as Sucessoras de cada tarefa
    const successorsMap = new Map<
      number,
      { succRowNum: number; predLink: ParsedPredecessor }[]
    >();
    taskIndices.forEach((idx) => {
      successorsMap.set(idx + 1, []);
    });

    taskIndices.forEach((idx) => {
      const succRowNum = idx + 1;
      const task = updatedTasks[idx];
      if (!task.predecessorText || !task.predecessorText.trim()) return;
      const preds = parsePredecessors(task.predecessorText);
      for (const predLink of preds) {
        const { predId } = predLink;
        if (predId === succRowNum) continue;
        if (ignoredCycleEdges.has(`${succRowNum}->${predId}`)) continue;
        if (scopeRowNums.has(predId)) {
          const list = successorsMap.get(predId) || [];
          list.push({ succRowNum, predLink });
          successorsMap.set(predId, list);
        }
      }
    });

    // Inicializar todas as tarefas Finais/Âncora (Regra 1: ninguém depende delas) na Data Limite do Projeto
    taskIndices.forEach((idx) => {
      const task = updatedTasks[idx];
      const taskActiveDays = getEffectiveActiveWeekDays(updatedTasks, idx, activeWeekDays);
      const taskExceptions = getEffectiveExceptions(updatedTasks, idx, exceptions);
      const anchorEnd = toPrevWorkDay(parseISODate(targetEndDate), taskActiveDays, taskExceptions);
      const anchorStart =
        task.durationDays === 0
          ? anchorEnd
          : subtractWorkDays(anchorEnd, task.durationDays, taskActiveDays, taskExceptions);
      task.endDate = toISODate(anchorEnd);
      task.startDate = toISODate(anchorStart);
    });

    // Propagar de trás para frente (da última tarefa até a primeira) respeitando Regra 1, 2, 3 e 4 (Gargalo)
    let backChanged = true;
    let backPass = 0;
    const maxBackPasses = Math.max(15, taskIndices.length + 2);

    while (backChanged && backPass < maxBackPasses) {
      backChanged = false;
      backPass++;

      // Percorre de trás para frente
      for (let k = taskIndices.length - 1; k >= 0; k--) {
        const idx = taskIndices[k];
        const rowNum = idx + 1;
        const task = updatedTasks[idx];
        const taskActiveDays = getEffectiveActiveWeekDays(updatedTasks, idx, activeWeekDays);
        const taskExceptions = getEffectiveExceptions(updatedTasks, idx, exceptions);
        const succs = successorsMap.get(rowNum) || [];

        if (succs.length === 0) {
          // Regra 1 — Tarefa Final (Âncora): termina exatamente na Data Limite do Projeto/Subprojeto
          const anchorEnd = toPrevWorkDay(parseISODate(targetEndDate), taskActiveDays, taskExceptions);
          const anchorStart =
            task.durationDays === 0
              ? anchorEnd
              : subtractWorkDays(anchorEnd, task.durationDays, taskActiveDays, taskExceptions);
          const nextStartStr = toISODate(anchorStart);
          const nextEndStr = toISODate(anchorEnd);
          if (task.startDate !== nextStartStr || task.endDate !== nextEndStr) {
            task.startDate = nextStartStr;
            task.endDate = nextEndStr;
            backChanged = true;
          }
          continue;
        }

        // Regra 3 & Regra 4 (Múltiplas Dependentes / Regra do Gargalo):
        // Se a Tarefa A for predecessora de duas ou mais tarefas (ex: B e C), A precisa terminar
        // antes daquela que começar mais cedo (menor data máxima permitida).
        let minAllowedEnd: Date | null = null;

        for (const { succRowNum, predLink } of succs) {
          const succTask = taskMap.get(succRowNum);
          if (!succTask) continue;

          const lagDays = resolveLagWorkDays(predLink, task.durationDays);
          let candidateMaxEnd: Date;

          if (predLink.type === 'TT') {
            // Término-Término: A termina considerando inverso da latência em relação ao término de B
            const succEnd = parseISODate(succTask.endDate);
            candidateMaxEnd = offsetWorkDays(
              succEnd,
              -lagDays,
              taskActiveDays,
              taskExceptions,
              'prev'
            );
          } else if (predLink.type === 'II') {
            // Início-Início: A começa no máximo no início de B descontada a latência
            const succStart = parseISODate(succTask.startDate);
            const maxStart = offsetWorkDays(
              succStart,
              -lagDays,
              taskActiveDays,
              taskExceptions,
              'prev'
            );
            candidateMaxEnd =
              task.durationDays === 0
                ? maxStart
                : addWorkDays(maxStart, task.durationDays, taskActiveDays, taskExceptions);
          } else if (predLink.type === 'IT') {
            // Início-Término: A começa no máximo no término de B descontada a latência
            const succEnd = parseISODate(succTask.endDate);
            const maxStart = offsetWorkDays(
              succEnd,
              -lagDays,
              taskActiveDays,
              taskExceptions,
              'prev'
            );
            candidateMaxEnd =
              task.durationDays === 0
                ? maxStart
                : addWorkDays(maxStart, task.durationDays, taskActiveDays, taskExceptions);
          } else {
            // Regra 3 — Vínculo Fim-Início (TI / Padrão):
            // A Tarefa A precisa terminar (1 + lagDays) dias úteis antes de a Tarefa B começar.
            const succStart = parseISODate(succTask.startDate);
            candidateMaxEnd = offsetWorkDays(
              succStart,
              -(1 + lagDays),
              taskActiveDays,
              taskExceptions,
              'prev'
            );
          }

          if (!minAllowedEnd || candidateMaxEnd < minAllowedEnd) {
            minAllowedEnd = candidateMaxEnd;
          }
        }

        if (minAllowedEnd) {
          // Regra 2 — Cálculo da Duração (Inclusivo): o próprio dia de início/fim conta como 1 dia trabalhado
          const finalEnd = minAllowedEnd;
          const finalStart =
            task.durationDays === 0
              ? finalEnd
              : subtractWorkDays(finalEnd, task.durationDays, taskActiveDays, taskExceptions);
          const nextStartStr = toISODate(finalStart);
          const nextEndStr = toISODate(finalEnd);

          if (task.startDate !== nextStartStr || task.endDate !== nextEndStr) {
            task.startDate = nextStartStr;
            task.endDate = nextEndStr;
            backChanged = true;
          }
        }
      }
    }
  });

  // 3C. Alerta de Prazo Estourado (Item 4 de UX/UI):
  // Se o cálculo de trás para frente resultar em uma data de início anterior à data de hoje, sinalizar inviabilidade
  const todayIso = toISODate(new Date());
  updatedTasks.forEach((task, idx) => {
    if (task.isSummary) return;
    const cfg = scheduleConfigs[idx];
    if (cfg.direction === 'backward' && task.startDate < todayIso && task.progress < 100) {
      task.isOverdueStart = true;
    }
  });

  // 4. Calcular Subprojetos / Tarefas Agrupadoras (De baixo para cima)
  for (let i = updatedTasks.length - 1; i >= 0; i--) {
    const task = updatedTasks[i];
    if (task.isSummary) {
      const summaryActiveDays = getEffectiveActiveWeekDays(updatedTasks, i, activeWeekDays);
      const summaryExceptions = getEffectiveExceptions(updatedTasks, i, exceptions);
      let minStart: Date | null = null;
      let maxEnd: Date | null = null;
      let totalDuration = 0;
      let weightedProgress = 0;
      let totalChildCost = 0;
      let minBaseStart: Date | null = null;
      let maxBaseEnd: Date | null = null;
      let hasChildOverdueStart = false;

      for (let j = i + 1; j < updatedTasks.length; j++) {
        const child = updatedTasks[j];
        if (child.outlineLevel <= task.outlineLevel) break; // Saiu da sub-árvore do Subprojeto

        const cStart = parseISODate(child.startDate);
        const cEnd = parseISODate(child.endDate);

        if (!minStart || cStart < minStart) minStart = cStart;
        if (!maxEnd || cEnd > maxEnd) maxEnd = cEnd;
        if (child.isOverdueStart) hasChildOverdueStart = true;

        if (child.baselineEndDate) {
          const bStart = parseISODate(child.baselineStartDate || child.startDate);
          const bEnd = parseISODate(child.baselineEndDate);
          if (!minBaseStart || bStart < minBaseStart) minBaseStart = bStart;
          if (!maxBaseEnd || bEnd > maxBaseEnd) maxBaseEnd = bEnd;
        }

        if (!child.isSummary) {
          totalDuration += Math.max(1, child.durationDays);
          weightedProgress += child.progress * Math.max(1, child.durationDays);
          totalChildCost += child.cost || 0;
        }
      }

      if (minStart && maxEnd) {
        task.startDate = toISODate(minStart);
        if (task.scheduleDirection === 'backward' && task.targetEndDate) {
          const lockedEnd = toPrevWorkDay(
            parseISODate(task.targetEndDate),
            summaryActiveDays,
            summaryExceptions
          );
          task.endDate = toISODate(lockedEnd > maxEnd ? lockedEnd : maxEnd);
        } else {
          task.endDate = toISODate(maxEnd);
        }
        task.durationDays = getWorkDaysDifference(
          minStart,
          parseISODate(task.endDate),
          summaryActiveDays,
          summaryExceptions
        );
        task.progress = totalDuration > 0 ? Math.round(weightedProgress / totalDuration) : 0;
        if (totalChildCost > 0) {
          task.cost = totalChildCost;
        }

        const cfg = scheduleConfigs[i];
        if (
          (task.scheduleDirection === 'backward' || cfg.direction === 'backward') &&
          (task.startDate < todayIso || hasChildOverdueStart) &&
          task.progress < 100
        ) {
          task.isOverdueStart = true;
        }
      }

      if (minBaseStart && maxBaseEnd) {
        task.baselineStartDate = toISODate(minBaseStart);
        task.baselineEndDate = toISODate(maxBaseEnd);
        task.baselineDurationDays = getWorkDaysDifference(
          minBaseStart,
          maxBaseEnd,
          summaryActiveDays,
          summaryExceptions
        );
      } else {
        task.baselineStartDate = undefined;
        task.baselineEndDate = undefined;
        task.baselineDurationDays = undefined;
      }
    }
  }

  // 5. Determinar Caminho Crítico (CPM) — apenas para tarefas executáveis (!isSummary)
  let projectEndDate: Date | null = null;
  updatedTasks.forEach((t) => {
    const end = parseISODate(t.endDate);
    if (!projectEndDate || end > projectEndDate) {
      projectEndDate = end;
    }
  });

  if (projectEndDate) {
    const projectEndStr = toISODate(projectEndDate);
    const criticalIndices = new Set<number>();

    updatedTasks.forEach((t, idx) => {
      if (!t.isSummary && t.endDate === projectEndStr) {
        criticalIndices.add(idx + 1);
      }
    });

    let changed = true;
    while (changed) {
      changed = false;
      updatedTasks.forEach((t, idx) => {
        const tIndex = idx + 1;
        if (criticalIndices.has(tIndex) && t.predecessorText) {
          const preds = parsePredecessors(t.predecessorText).map((p) => p.predId);
          preds.forEach((p) => {
            if (!criticalIndices.has(p)) {
              criticalIndices.add(p);
              changed = true;
            }
          });
        }
      });
    }

    updatedTasks.forEach((t, idx) => {
      t.isCritical = !t.isSummary && criticalIndices.has(idx + 1);
    });
  }

  // 6. Atualizar numeração da EAP (WBS) e o número real da linha (1-based)
  const levelCounters: number[] = [];
  updatedTasks.forEach((task, idx) => {
    task.rowNumber = idx + 1;
    const level = task.outlineLevel;
    while (levelCounters.length <= level) {
      levelCounters.push(0);
    }
    levelCounters[level]++;
    levelCounters.splice(level + 1); // Zera níveis inferiores
    task.wbsIndex = levelCounters.join('.');
  });

  return updatedTasks;
}

/**
 * Filtra as tarefas visíveis, ocultando subtarefas aninhadas abaixo de Subprojetos recolhidos (collapsed).
 */
export function getVisibleTasks(tasks: Task[]): Task[] {
  const visible: Task[] = [];
  let collapsedBelowLevel: number | null = null;

  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i];
    if (collapsedBelowLevel !== null) {
      if (t.outlineLevel > collapsedBelowLevel) {
        continue;
      } else {
        collapsedBelowLevel = null;
      }
    }

    visible.push(t);

    if (t.isSummary && t.collapsed) {
      collapsedBelowLevel = t.outlineLevel;
    }
  }

  return visible;
}

/**
 * Conta quantas subtarefas pertencem a um Subprojeto específico.
 */
export function getSubtreeTaskCount(tasks: Task[], summaryTaskId: string): number {
  const idx = tasks.findIndex((t) => t.id === summaryTaskId);
  if (idx < 0) return 0;
  const baseLevel = tasks[idx].outlineLevel;
  let count = 0;
  for (let j = idx + 1; j < tasks.length; j++) {
    if (tasks[j].outlineLevel > baseLevel) {
      count++;
    } else {
      break;
    }
  }
  return count;
}


/**
 * Calcula a variação (desvio em dias úteis) entre a Data Fim Base (teórica) e a Data Fim Atual (prática):
 * - Retorna `null` se a tarefa não possuir Linha de Base (`baselineEndDate`) definida
 * - Retorna `0` se `endDate === baselineEndDate` (No prazo)
 * - Retorna `> 0` (ex: +3) se a tarefa estiver atrasada em relação à Linha de Base
 * - Retorna `< 0` (ex: -2) se a tarefa estiver adiantada em relação à Linha de Base
 */
export function getBaselineVarianceDays(
  task: Task,
  activeWeekDays: number[] = [1, 2, 3, 4, 5],
  exceptions: CalendarException[] = []
): number | null {
  if (!task.baselineEndDate || !task.endDate) return null;
  if (task.endDate === task.baselineEndDate) return 0;

  const baseEnd = parseISODate(task.baselineEndDate);
  const actualEnd = parseISODate(task.endDate);

  if (actualEnd > baseEnd) {
    const nextDay = new Date(baseEnd);
    nextDay.setDate(nextDay.getDate() + 1);
    const workDiff = getWorkDaysDifference(nextDay, actualEnd, activeWeekDays, exceptions);
    return Math.max(1, workDiff);
  } else {
    const nextDay = new Date(actualEnd);
    nextDay.setDate(nextDay.getDate() + 1);
    const workDiff = getWorkDaysDifference(nextDay, baseEnd, activeWeekDays, exceptions);
    return -Math.max(1, workDiff);
  }
}
