import { Task } from '../types/project';

/**
 * Utilitários de data e cálculo de cronograma do MS Project com suporte
 * a personalização do Calendário Base de Trabalho (dias de atividade e inatividade).
 */

// Verifica se uma data é dia útil de atividade com base nos dias da semana ativos
export function isWorkDay(date: Date, activeWeekDays: number[] = [1, 2, 3, 4, 5]): boolean {
  if (!activeWeekDays || activeWeekDays.length === 0) return true;
  return activeWeekDays.includes(date.getDay());
}

// Verifica se uma data é dia inativo (mantido para compatibilidade e colorização do Gantt)
export function isWeekend(date: Date, activeWeekDays: number[] = [1, 2, 3, 4, 5]): boolean {
  return !isWorkDay(date, activeWeekDays);
}

// Retorna o próximo dia útil de atividade caso a data caia em dia inativo
export function toWorkDay(date: Date, activeWeekDays: number[] = [1, 2, 3, 4, 5]): Date {
  const result = new Date(date);
  if (!activeWeekDays || activeWeekDays.length === 0) return result;

  let attempts = 0;
  while (!isWorkDay(result, activeWeekDays) && attempts < 14) {
    result.setDate(result.getDate() + 1);
    attempts++;
  }
  return result;
}

// Adiciona N dias úteis de atividade a uma data
export function addWorkDays(startDate: Date, days: number, activeWeekDays: number[] = [1, 2, 3, 4, 5]): Date {
  if (days <= 0) return new Date(startDate);
  const result = new Date(startDate);
  if (!activeWeekDays || activeWeekDays.length === 0) {
    result.setDate(result.getDate() + days - 1);
    return result;
  }

  let added = 0;
  
  // Se começou em dia útil, conta o primeiro dia se for > 1
  while (added < days) {
    if (isWorkDay(result, activeWeekDays)) {
      added++;
      if (added === days) break;
    }
    result.setDate(result.getDate() + 1);
  }
  return result;
}

// Calcula a diferença em dias úteis entre duas datas (inclusive)
export function getWorkDaysDifference(startDate: Date, endDate: Date, activeWeekDays: number[] = [1, 2, 3, 4, 5]): number {
  if (startDate > endDate) return 0;
  let count = 0;
  const current = new Date(startDate);
  
  while (current <= endDate) {
    if (isWorkDay(current, activeWeekDays)) {
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

/**
 * Recalcula o cronograma completo (Predecessoras, Resumo e Caminho Crítico)
 * respeitando o Calendário Base de Trabalho (dias ativos e inativos)
 */
export function recalculateSchedule(tasks: Task[], activeWeekDays: number[] = [1, 2, 3, 4, 5]): Task[] {
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

  // 3. Propagação de Agendamento Automático via Predecessoras
  updatedTasks.forEach((task, idx) => {
    if (task.mode === 'auto' && !task.isSummary && task.predecessorText) {
      const predIds = task.predecessorText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      let maxPredEndDate: Date | null = null;

      for (const predStr of predIds) {
        // Suporta formato "1", "1TI", "1FS"
        const cleanMatch = predStr.match(/^(\d+)/);
        if (cleanMatch) {
          const predNum = parseInt(cleanMatch[1], 10);
          const predTask = taskMap.get(predNum);
          if (predTask && predNum < idx + 1) {
            const predEnd = parseISODate(predTask.endDate);
            // Próximo dia útil após o término da predecessora
            const nextStart = new Date(predEnd);
            nextStart.setDate(nextStart.getDate() + 1);
            const validStart = toWorkDay(nextStart, activeWeekDays);

            if (!maxPredEndDate || validStart > maxPredEndDate) {
              maxPredEndDate = validStart;
            }
          }
        }
      }

      if (maxPredEndDate) {
        task.startDate = toISODate(maxPredEndDate);
        if (task.durationDays === 0) {
          task.endDate = task.startDate;
        } else {
          const end = addWorkDays(maxPredEndDate, task.durationDays, activeWeekDays);
          task.endDate = toISODate(end);
        }
      }
    } else if (task.mode === 'auto' && !task.isSummary) {
      // Ajustar data de término com base na duração e início válido
      const start = toWorkDay(parseISODate(task.startDate), activeWeekDays);
      task.startDate = toISODate(start);
      if (task.durationDays === 0) {
        task.endDate = task.startDate;
      } else {
        const end = addWorkDays(start, task.durationDays, activeWeekDays);
        task.endDate = toISODate(end);
      }
    }
  });

  // 4. Calcular Tarefas de Resumo (De baixo para cima)
  for (let i = updatedTasks.length - 1; i >= 0; i--) {
    const task = updatedTasks[i];
    if (task.isSummary) {
      let minStart: Date | null = null;
      let maxEnd: Date | null = null;
      let totalDuration = 0;
      let weightedProgress = 0;
      let childCount = 0;

      for (let j = i + 1; j < updatedTasks.length; j++) {
        const child = updatedTasks[j];
        if (child.outlineLevel <= task.outlineLevel) break; // Saiu da sub-árvore

        const cStart = parseISODate(child.startDate);
        const cEnd = parseISODate(child.endDate);

        if (!minStart || cStart < minStart) minStart = cStart;
        if (!maxEnd || cEnd > maxEnd) maxEnd = cEnd;

        totalDuration += Math.max(1, child.durationDays);
        weightedProgress += child.progress * Math.max(1, child.durationDays);
        childCount++;
      }

      if (minStart && maxEnd) {
        task.startDate = toISODate(minStart);
        task.endDate = toISODate(maxEnd);
        task.durationDays = getWorkDaysDifference(minStart, maxEnd, activeWeekDays);
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
          const preds = t.predecessorText.split(',').map((p) => parseInt(p.trim(), 10)).filter(Boolean);
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

  // 6. Atualizar numeração da EAP (WBS)
  const levelCounters: number[] = [];
  updatedTasks.forEach((task) => {
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
