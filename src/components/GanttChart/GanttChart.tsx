import React, { useMemo, useState } from 'react';
import { Task, ZoomLevel, CalendarException } from '../../types/project';
import {
  parseISODate,
  toISODate,
  isWeekend,
  parsePredecessors,
  getExceptionForDate,
  formatDatePTBR,
} from '../../utils/scheduler';

interface GanttChartProps {
  tasks: Task[];
  zoomLevel: ZoomLevel;
  showCriticalPath: boolean;
  showGridLines: boolean;
  selectedTaskId: string | null;
  onSelectTask: (taskId: string) => void;
  scrollTop: number;
  onScroll: (e: React.UIEvent<HTMLDivElement>) => void;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  activeWeekDays?: number[];
  exceptions?: CalendarException[];
  rowHeights?: Record<string, number>;
}

export const GanttChart: React.FC<GanttChartProps> = ({
  tasks,
  zoomLevel,
  showCriticalPath,
  showGridLines,
  selectedTaskId,
  onSelectTask,
  onScroll,
  scrollRef,
  activeWeekDays = [1, 2, 3, 4, 5],
  exceptions = [],
  rowHeights,
}) => {
  const [hoveredTask, setHoveredTask] = useState<Task | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);

  // Determinar extensão de datas do projeto
  const { startDate, totalDays, dayWidth } = useMemo(() => {
    let minDate = new Date();
    minDate.setHours(0, 0, 0, 0);
    let maxDate = new Date(minDate);

    if (tasks.length > 0) {
      minDate = parseISODate(tasks[0].startDate);
      maxDate = parseISODate(tasks[0].endDate);

      tasks.forEach((t) => {
        const s = parseISODate(t.startDate);
        const e = parseISODate(t.endDate);
        if (s < minDate) minDate = s;
        if (e > maxDate) maxDate = e;
      });
    }

    // Adiciona margem antes e depois
    const chartStart = new Date(minDate);
    chartStart.setHours(0, 0, 0, 0);
    chartStart.setDate(chartStart.getDate() - 3);

    const chartEnd = new Date(maxDate);
    chartEnd.setHours(0, 0, 0, 0);
    chartEnd.setDate(chartEnd.getDate() + 15);

    const diffTime = Math.abs(chartEnd.getTime() - chartStart.getTime());
    const totalDays = Math.max(20, Math.round(diffTime / (1000 * 60 * 60 * 24)));

    let dayWidth = 32;
    if (zoomLevel === 'weeks') dayWidth = 18;
    if (zoomLevel === 'months') dayWidth = 8;

    return {
      startDate: chartStart,
      endDate: chartEnd,
      totalDays,
      dayWidth,
      rowHeight: 40,
    };
  }, [tasks, zoomLevel]);

  // Lista de dias gerados (sincronizada com Calendário Base e Datas de Exceção)
  const daysList = useMemo(() => {
    const list: {
      date: Date;
      iso: string;
      dayNum: number;
      dayOfWeek: string;
      isWeekend: boolean;
      exception?: CalendarException;
    }[] = [];
    const cur = new Date(startDate);
    cur.setHours(0, 0, 0, 0);
    const daysNames = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

    for (let i = 0; i < totalDays; i++) {
      const iso = toISODate(cur);
      const ex = getExceptionForDate(iso, exceptions);
      list.push({
        date: new Date(cur),
        iso,
        dayNum: cur.getDate(),
        dayOfWeek: daysNames[cur.getDay()],
        isWeekend: isWeekend(cur, activeWeekDays, exceptions),
        exception: ex,
      });
      cur.setDate(cur.getDate() + 1);
    }
    return list;
  }, [startDate, totalDays, activeWeekDays, exceptions]);

  // Agrupamento por Meses para o Cabeçalho Superior
  const monthGroups = useMemo(() => {
    const months: { label: string; width: number }[] = [];
    let currentMonth = -1;
    let currentWidth = 0;
    let currentYear = 0;

    const monthNames = [
      'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
      'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];

    daysList.forEach((d) => {
      const m = d.date.getMonth();
      const y = d.date.getFullYear();
      if (m !== currentMonth || y !== currentYear) {
        if (currentMonth !== -1) {
          months.push({
            label: `${monthNames[currentMonth]} de ${currentYear}`,
            width: currentWidth,
          });
        }
        currentMonth = m;
        currentYear = y;
        currentWidth = dayWidth;
      } else {
        currentWidth += dayWidth;
      }
    });

    if (currentMonth !== -1) {
      months.push({
        label: `${monthNames[currentMonth]} de ${currentYear}`,
        width: currentWidth,
      });
    }

    return months;
  }, [daysList, dayWidth]);

  // Função para calcular a coordenada X exata de uma data (alinhada 1:1 com as células do cabeçalho)
  const getXForDate = (dateStr: string): number => {
    const target = parseISODate(dateStr);
    target.setHours(0, 0, 0, 0);
    const diff = Math.round((target.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(0, diff * dayWidth);
  };

  // Posição de "Hoje"
  const todayStr = toISODate(new Date());
  const todayX = getXForDate(todayStr) + dayWidth / 2;

  // Layout vertical acumulado com suporte a alturas de linhas dinâmicas estilo Excel
  const taskLayout = useMemo(() => {
    const positions: { y: number; height: number; centerY: number }[] = [];
    let currentY = 0;
    tasks.forEach((t) => {
      const h = (rowHeights && rowHeights[t.id]) || 40;
      positions.push({ y: currentY, height: h, centerY: currentY + h / 2 });
      currentY += h;
    });
    return { positions, totalHeight: currentY };
  }, [tasks, rowHeights]);

  // Mapa de índice para coordenadas de tarefas (para desenhar as setas de dependência)
  const taskCoordinates = useMemo(() => {
    const coords = new Map<number, { startX: number; endX: number; y: number }>();
    tasks.forEach((task, index) => {
      const startX = getXForDate(task.startDate);
      const endX = getXForDate(task.endDate) + dayWidth;
      const layout = taskLayout.positions[index] || { y: index * 40, height: 40, centerY: index * 40 + 20 };
      coords.set(index + 1, { startX, endX, y: layout.centerY });
    });
    return coords;
  }, [tasks, startDate, dayWidth, taskLayout]);

  const totalCanvasWidth = totalDays * dayWidth;

  return (
    <div className="gantt-chart-container">
      {/* Container Rolável Único: Cabeçalho e Canvas compartilham o mesmo scroll e largura exata */}
      <div
        className="gantt-chart-body"
        ref={scrollRef}
        onScroll={onScroll}
      >
        {/* Cabeçalho da Escala de Tempo Dupla (Fixo no topo durante scroll vertical) */}
        <div
          className="gantt-timeline-header"
          style={{ width: `${totalCanvasWidth}px`, minWidth: `${totalCanvasWidth}px` }}
        >
          {/* Nível 1: Meses */}
          <div className="timeline-months-row" style={{ width: `${totalCanvasWidth}px` }}>
            {monthGroups.map((mg, i) => (
              <div
                key={i}
                className="timeline-month-cell"
                style={{ width: `${mg.width}px`, minWidth: `${mg.width}px`, maxWidth: `${mg.width}px` }}
              >
                {mg.label}
              </div>
            ))}
          </div>

          {/* Nível 2: Dias da Semana */}
          <div className="timeline-days-row" style={{ width: `${totalCanvasWidth}px` }}>
            {daysList.map((d, i) => {
              const isNonWorkingException = d.exception && !d.exception.isWorkingDay;
              const isWorkingException = d.exception && d.exception.isWorkingDay;
              const tooltipTitle = d.exception
                ? `${formatDatePTBR(d.iso)} — ${d.exception.type}: ${d.exception.name} (${d.exception.isWorkingDay ? 'Dia Útil Atípico' : 'Dia Não Útil'})`
                : formatDatePTBR(d.iso);

              return (
                <div
                  key={i}
                  className={`timeline-day-cell ${d.isWeekend ? 'weekend' : ''} ${isNonWorkingException ? 'exception-off-day' : ''} ${isWorkingException ? 'exception-work-day' : ''}`}
                  style={{ width: `${dayWidth}px`, minWidth: `${dayWidth}px`, maxWidth: `${dayWidth}px` }}
                  title={tooltipTitle}
                >
                  <span className="day-num">{d.dayNum}</span>
                  <span className="day-name">{d.dayOfWeek}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div
          className="gantt-canvas"
          style={{ width: `${totalCanvasWidth}px`, minWidth: `${totalCanvasWidth}px`, height: `${taskLayout.totalHeight}px` }}
        >
          {/* Colunas de Fim de Semana, Exceções e Linhas de Grade */}
          {daysList.map((d, i) => {
            const isNonWorkingException = d.exception && !d.exception.isWorkingDay;
            return (
              <div
                key={i}
                className={`gantt-day-column ${d.isWeekend ? 'weekend-col' : ''} ${isNonWorkingException ? 'exception-off-col' : ''} ${showGridLines ? 'grid-line' : ''}`}
                style={{ left: `${i * dayWidth}px`, width: `${dayWidth}px` }}
              />
            );
          })}

          {/* Marcador da Data de Hoje */}
          <div className="today-marker-line" style={{ left: `${todayX}px` }} title="Hoje">
            <span className="today-badge">Hoje</span>
          </div>

          {/* Camada SVG para Conectores de Dependência (Setas) */}
          <svg className="gantt-dependency-svg" width={totalDays * dayWidth} height={taskLayout.totalHeight}>
            <defs>
              <marker
                id="arrowhead"
                viewBox="0 0 10 10"
                refX="7"
                refY="5"
                markerWidth="5"
                markerHeight="5"
                orient="auto-start-reverse"
              >
                <path d="M 0 1 L 9 5 L 0 9 z" fill="#444" />
              </marker>
              <marker
                id="arrowhead-critical"
                viewBox="0 0 10 10"
                refX="7"
                refY="5"
                markerWidth="5"
                markerHeight="5"
                orient="auto-start-reverse"
              >
                <path d="M 0 1 L 9 5 L 0 9 z" fill="#c00000" />
              </marker>
            </defs>

            {tasks.map((task, index) => {
              if (!task.predecessorText) return null;
              const preds = parsePredecessors(task.predecessorText);
              const toCoord = taskCoordinates.get(index + 1);
              if (!toCoord) return null;

              return preds.map(({ predId, type }) => {
                const fromCoord = taskCoordinates.get(predId);
                if (!fromCoord) return null;

                const isCrit = showCriticalPath && task.isCritical;
                let pathData = '';

                if (type === 'II') {
                  // Início para Início (Start-to-Start):
                  // Sai do início (startX) da predecessora e conecta no início (startX) da tarefa
                  const p1x = fromCoord.startX;
                  const p1y = fromCoord.y;
                  const p2x = toCoord.startX;
                  const p2y = toCoord.y;
                  const leftX = Math.min(p1x, p2x) - 12;
                  pathData = `M ${p1x} ${p1y} L ${leftX} ${p1y} L ${leftX} ${p2y} L ${p2x} ${p2y}`;
                } else if (type === 'TT') {
                  // Término para Término (Finish-to-Finish):
                  // Sai do término (endX) da predecessora e conecta no término (endX) da tarefa
                  const p1x = fromCoord.endX;
                  const p1y = fromCoord.y;
                  const p2x = toCoord.endX;
                  const p2y = toCoord.y;
                  const rightX = Math.max(p1x, p2x) + 12;
                  pathData = `M ${p1x} ${p1y} L ${rightX} ${p1y} L ${rightX} ${p2y} L ${p2x} ${p2y}`;
                } else {
                  // Padrão TI (Término para Início - Finish-to-Start):
                  // Sai do término (endX) da predecessora e conecta no início (startX) da tarefa
                  const p1x = fromCoord.endX;
                  const p1y = fromCoord.y;
                  const p2x = toCoord.startX;
                  const p2y = toCoord.y;
                  if (p2x >= p1x + 10) {
                    const midX = p1x + (p2x - p1x) / 2;
                    pathData = `M ${p1x} ${p1y} L ${midX} ${p1y} L ${midX} ${p2y} L ${p2x} ${p2y}`;
                  } else {
                    const offsetY = p2y > p1y ? 14 : -14;
                    pathData = `M ${p1x} ${p1y} L ${p1x + 8} ${p1y} L ${p1x + 8} ${p1y + offsetY} L ${p2x - 8} ${p1y + offsetY} L ${p2x - 8} ${p2y} L ${p2x} ${p2y}`;
                  }
                }

                return (
                  <path
                    key={`${predId}-${type}->${index + 1}`}
                    d={pathData}
                    fill="none"
                    stroke={isCrit ? '#c00000' : '#555'}
                    strokeWidth={isCrit ? 1.8 : 1.2}
                    markerEnd={isCrit ? 'url(#arrowhead-critical)' : 'url(#arrowhead)'}
                  />
                );
              });
            })}
          </svg>

          {/* Barras das Tarefas */}
          {tasks.map((task, index) => {
            const startX = getXForDate(task.startDate);
            const endX = getXForDate(task.endDate) + dayWidth;
            const width = Math.max(dayWidth, endX - startX);
            const layout = taskLayout.positions[index] || { y: index * 40, height: 40, centerY: index * 40 + 20 };
            const isSelected = selectedTaskId === task.id;
            const isCrit = showCriticalPath && task.isCritical;

            return (
              <div
                key={task.id}
                className={`gantt-row-layer ${isSelected ? 'selected-row' : ''}`}
                style={{ top: `${layout.y}px`, height: `${layout.height}px` }}
                onClick={() => onSelectTask(task.id)}
              >
                {/* Linha de Base (se houver) */}
                {task.baselineStartDate && task.baselineEndDate && (
                  <div
                    className="baseline-bar"
                    style={{
                      left: `${getXForDate(task.baselineStartDate)}px`,
                      width: `${getXForDate(task.baselineEndDate) + dayWidth - getXForDate(task.baselineStartDate)}px`,
                    }}
                    title="Linha de Base Planejada"
                  />
                )}

                {/* 1. Tarefa de Resumo */}
                {task.isSummary ? (
                  <div
                    className="summary-bar-wrapper"
                    style={{ left: `${startX}px`, width: `${width}px` }}
                    onMouseEnter={(e) => {
                      setHoveredTask(task);
                      setTooltipPos({ x: e.clientX, y: e.clientY });
                    }}
                    onMouseLeave={() => setHoveredTask(null)}
                  >
                    <div className={`summary-bracket-bar ${task.progress === 100 ? 'completed' : ''}`}>
                      <div className="summary-bracket-left"></div>
                      <div className="summary-bracket-center" style={{ width: `${task.progress}%` }}></div>
                      <div className="summary-bracket-right"></div>
                    </div>
                    <span className="bar-resource-label">{task.resourceNames.join(', ')}</span>
                  </div>
                ) : task.isMilestone ? (
                  /* 2. Marco (Milestone) */
                  <div
                    className="milestone-wrapper"
                    style={{ left: `${startX + dayWidth / 2}px` }}
                    onMouseEnter={(e) => {
                      setHoveredTask(task);
                      setTooltipPos({ x: e.clientX, y: e.clientY });
                    }}
                    onMouseLeave={() => setHoveredTask(null)}
                  >
                    <div className={`milestone-diamond-shape ${isCrit ? 'critical' : ''} ${task.progress === 100 ? 'completed' : ''}`}></div>
                    <span className="bar-resource-label">
                      {task.name} ({formatDatePTBR(task.startDate)})
                    </span>
                  </div>
                ) : (
                  /* 3. Tarefa Normal */
                  <div
                    className={`task-bar ${isCrit ? 'critical' : ''} ${task.progress === 100 ? 'completed' : ''}`}
                    style={{ left: `${startX}px`, width: `${width}px` }}
                    onMouseEnter={(e) => {
                      setHoveredTask(task);
                      setTooltipPos({ x: e.clientX, y: e.clientY });
                    }}
                    onMouseLeave={() => setHoveredTask(null)}
                  >
                    <div className="task-progress-fill" style={{ width: `${task.progress}%` }}></div>
                    <span className="task-bar-text">
                      {task.progress > 0 ? `${task.progress}%` : ''}
                    </span>
                    <span className="bar-resource-label">{task.resourceNames.join(', ')}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Tooltip Flutuante de Detalhes da Tarefa */}
      {hoveredTask && tooltipPos && (
        <div
          className="gantt-tooltip"
          style={{ left: `${tooltipPos.x + 15}px`, top: `${tooltipPos.y + 15}px` }}
        >
          <div className="tooltip-title">{hoveredTask.name}</div>
          <div className="tooltip-row">
            <span>Início:</span> <strong>{formatDatePTBR(hoveredTask.startDate)}</strong>
          </div>
          <div className="tooltip-row">
            <span>Término:</span> <strong>{formatDatePTBR(hoveredTask.endDate)}</strong>
          </div>
          <div className="tooltip-row">
            <span>Duração:</span> <strong>{hoveredTask.durationDays} dias</strong>
          </div>
          <div className="tooltip-row">
            <span>Progresso:</span> <strong>{hoveredTask.progress}%</strong>
          </div>
          {hoveredTask.resourceNames.length > 0 && (
            <div className="tooltip-row">
              <span>Recursos:</span> <strong>{hoveredTask.resourceNames.join(', ')}</strong>
            </div>
          )}
          {hoveredTask.isCritical && (
            <div className="tooltip-critical-tag">⚠️ Tarefa no Caminho Crítico</div>
          )}
        </div>
      )}
    </div>
  );
};
