import { Task, CalendarException } from '../types/project';

/**
 * Utilitários de data e cálculo de cronograma do MS Project com suporte
 * a personalização do Calendário Base de Trabalho (dias de atividade e inatividade)
 * e Motor de Datas de Exceção (feriados, recessos, emendas e expedientes atípicos).
 */

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

// Verifica se uma data é dia útil de atividade com base nos dias da semana ativos e nas Datas de Exceção
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
}

/**
 * Faz o parsing de strings de predecessoras no formato do MS Project
 * Suporta: "3", "3ii", "3II", "3tt", "3TT", "3ti", "3TI", "3it", "3IT", "3ss", "3ff", etc.
 */
export function parsePredecessors(predText?: string): ParsedPredecessor[] {
  if (!predText) return [];
  const items = predText.split(',').map((s) => s.trim()).filter(Boolean);
  const result: ParsedPredecessor[] = [];

  for (const item of items) {
    const match = item.match(/^(\d+)\s*([a-zA-Z]*)/);
    if (match) {
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
      result.push({ predId, type });
    }
  }

  return result;
}

/**
 * Recalcula o cronograma completo (Predecessoras, Datas de Exceção, Resumo e Caminho Crítico)
 * atuando como Fonte Única da Verdade (Single Source of Truth) para o Grid e para o Gantt.
 */
export function recalculateSchedule(
  tasks: Task[],
  activeWeekDays: number[] = [1, 2, 3, 4, 5],
  exceptions: CalendarException[] = []
): Task[] {
  if (!tasks || tasks.length === 0) return [];

  const updatedTasks: Task[] = tasks.map((t) => ({ ...t }));

  // 1. Identificar Tarefas de Resumo com base nos níveis de recuo (outlineLevel)
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

  // 2. Criar mapa de índice para tarefas para resolver predecessoras
  const taskMap = new Map<number, Task>();
  updatedTasks.forEach((t, idx) => {
    taskMap.set(idx + 1, t); // 1-based index conforme tabela do MS Project
  });

  // 3. Propagação de Agendamento via Predecessoras e Calendário/Exceções
  const maxPasses = Math.max(15, updatedTasks.length + 2);
  let scheduleChanged = true;
  let pass = 0;
  while (scheduleChanged && pass < maxPasses) {
    scheduleChanged = false;
    pass++;

    updatedTasks.forEach((task, idx) => {
      const currentTaskNum = idx + 1;

      if (!task.isSummary && task.predecessorText && task.predecessorText.trim() !== '') {
        const parsedPreds = parsePredecessors(task.predecessorText);
        if (parsedPreds.length > 0) {
          let maxReqStart: Date | null = null;
          let maxReqEnd: Date | null = null;

          for (const { predId, type } of parsedPreds) {
            if (predId === currentTaskNum) continue; // Evita auto-referência
            const predTask = taskMap.get(predId);
            if (!predTask) continue;

            if (type === 'II') {
              // Início-Início: a tarefa deve iniciar junto com o início da tarefa referenciada
              const predStart = parseISODate(predTask.startDate);
              const reqStart = toWorkDay(predStart, activeWeekDays, exceptions);
              if (!maxReqStart || reqStart > maxReqStart) {
                maxReqStart = reqStart;
              }
            } else if (type === 'TT') {
              // Término-Término: a tarefa deve finalizar junto com o término da tarefa referenciada
              const predEnd = parseISODate(predTask.endDate);
              const reqEnd = toPrevWorkDay(predEnd, activeWeekDays, exceptions);
              if (!maxReqEnd || reqEnd > maxReqEnd) {
                maxReqEnd = reqEnd;
              }
            } else if (type === 'IT') {
              // Início-Término: a tarefa finaliza no início da predecessora
              const predStart = parseISODate(predTask.startDate);
              const reqEnd = toPrevWorkDay(predStart, activeWeekDays, exceptions);
              if (!maxReqEnd || reqEnd > maxReqEnd) {
                maxReqEnd = reqEnd;
              }
            } else {
              // Padrão TI: Término-Início (começa no dia útil seguinte ao término)
              const predEnd = parseISODate(predTask.endDate);
              const nextDay = new Date(predEnd);
              nextDay.setDate(nextDay.getDate() + 1);
              const reqStart = toWorkDay(nextDay, activeWeekDays, exceptions);
              if (!maxReqStart || reqStart > maxReqStart) {
                maxReqStart = reqStart;
              }
            }
          }

          let newStartDate = task.startDate;
          let newEndDate = task.endDate;

          if (maxReqEnd && !maxReqStart) {
            // Apenas restrição TT: finaliza junto com o término referenciado
            const finalEnd = maxReqEnd;
            const finalStart = task.durationDays === 0
              ? finalEnd
              : subtractWorkDays(finalEnd, task.durationDays, activeWeekDays, exceptions);
            newStartDate = toISODate(finalStart);
            newEndDate = toISODate(finalEnd);
          } else if (maxReqStart && !maxReqEnd) {
            // Apenas restrição TI ou II: inicia junto ou após
            const finalStart = maxReqStart;
            const finalEnd = task.durationDays === 0
              ? finalStart
              : addWorkDays(finalStart, task.durationDays, activeWeekDays, exceptions);
            newStartDate = toISODate(finalStart);
            newEndDate = toISODate(finalEnd);
          } else if (maxReqStart && maxReqEnd) {
            // Combinação de restrições de início e término
            const tentativeStart = maxReqStart;
            const tentativeEnd = task.durationDays === 0
              ? tentativeStart
              : addWorkDays(tentativeStart, task.durationDays, activeWeekDays, exceptions);
            if (tentativeEnd < maxReqEnd) {
              const finalEnd = maxReqEnd;
              const finalStart = task.durationDays === 0
                ? finalEnd
                : subtractWorkDays(finalEnd, task.durationDays, activeWeekDays, exceptions);
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

      if (!task.isSummary) {
        // Tarefas sem predecessoras (manuais ou automáticas): valida início em dia útil e recalcula término conforme duração e exceções
        const start = toWorkDay(parseISODate(task.startDate), activeWeekDays, exceptions);
        const newStartDate = toISODate(start);
        const newEndDate = task.durationDays === 0
          ? newStartDate
          : toISODate(addWorkDays(start, task.durationDays, activeWeekDays, exceptions));
        if (newStartDate !== task.startDate || newEndDate !== task.endDate) {
          task.startDate = newStartDate;
          task.endDate = newEndDate;
          scheduleChanged = true;
        }
      }
    });
  }

  // 4. Calcular Tarefas de Resumo (De baixo para cima)
  for (let i = updatedTasks.length - 1; i >= 0; i--) {
    const task = updatedTasks[i];
    if (task.isSummary) {
      let minStart: Date | null = null;
      let maxEnd: Date | null = null;
      let totalDuration = 0;
      let weightedProgress = 0;

      for (let j = i + 1; j < updatedTasks.length; j++) {
        const child = updatedTasks[j];
        if (child.outlineLevel <= task.outlineLevel) break; // Saiu da sub-árvore

        const cStart = parseISODate(child.startDate);
        const cEnd = parseISODate(child.endDate);

        if (!minStart || cStart < minStart) minStart = cStart;
        if (!maxEnd || cEnd > maxEnd) maxEnd = cEnd;

        totalDuration += Math.max(1, child.durationDays);
        weightedProgress += child.progress * Math.max(1, child.durationDays);
      }

      if (minStart && maxEnd) {
        task.startDate = toISODate(minStart);
        task.endDate = toISODate(maxEnd);
        task.durationDays = getWorkDaysDifference(minStart, maxEnd, activeWeekDays, exceptions);
        task.progress = totalDuration > 0 ? Math.round(weightedProgress / totalDuration) : 0;
      }
    }
  }

  // 5. Determinar Caminho Crítico (CPM)
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
      t.isCritical = criticalIndices.has(idx + 1);
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
 * Filtra as tarefas visíveis, ocultando subtarefas aninhadas abaixo de tarefas-resumo recolhidas (collapsed).
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
 * Conta quantas subtarefas pertencem a uma tarefa-resumo específica.
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
