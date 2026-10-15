import React, { useState, useMemo } from 'react';
import { Task } from '../../types/project';
import { 
  ChevronLeft, 
  ChevronRight, 
  Calendar as CalendarIcon, 
  CheckCircle2, 
  Clock, 
  AlertTriangle,
  Flag,
  User,
  ListTodo
} from 'lucide-react';
import { parseISODate, toISODate, isWorkDay } from '../../utils/scheduler';

interface WeekViewProps {
  tasks: Task[];
  activeWeekDays: number[];
  selectedTaskId: string | null;
  onSelectTask: (taskId: string) => void;
  onOpenTaskDetail: (taskId: string) => void;
}

export const WeekView: React.FC<WeekViewProps> = ({
  tasks,
  activeWeekDays,
  selectedTaskId,
  onSelectTask,
  onOpenTaskDetail,
}) => {
  // Data de referência da semana exibida (inicia com hoje ou início do projeto)
  const [currentWeekDate, setCurrentWeekDate] = useState<Date>(() => {
    if (tasks.length > 0 && tasks[0].startDate) {
      return parseISODate(tasks[0].startDate);
    }
    return new Date();
  });

  // Obter o primeiro dia da semana (Segunda-feira)
  const mondayDate = useMemo(() => {
    const d = new Date(currentWeekDate);
    const day = d.getDay();
    // No JS: 0=Domingo, 1=Segunda, ..., 6=Sábado
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [currentWeekDate]);

  // Lista dos 7 dias da semana (Segunda a Domingo)
  const weekDays = useMemo(() => {
    const days: { date: Date; iso: string; dayName: string; shortName: string; isWork: boolean; isToday: boolean }[] = [];
    const names = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
    const shortNames = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

    const todayIso = toISODate(new Date());

    for (let i = 0; i < 7; i++) {
      const d = new Date(mondayDate);
      d.setDate(mondayDate.getDate() + i);
      const iso = toISODate(d);
      days.push({
        date: d,
        iso,
        dayName: names[i],
        shortName: shortNames[i],
        isWork: isWorkDay(d, activeWeekDays),
        isToday: iso === todayIso,
      });
    }
    return days;
  }, [mondayDate, activeWeekDays]);

  // Intervalo formatado para exibição no cabeçalho
  const formattedRange = useMemo(() => {
    const start = weekDays[0].date;
    const end = weekDays[6].date;
    const monthNames = [
      'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
      'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];

    if (start.getMonth() === end.getMonth()) {
      return `${start.getDate()} a ${end.getDate()} de ${monthNames[start.getMonth()]} de ${start.getFullYear()}`;
    }
    return `${start.getDate()} de ${monthNames[start.getMonth()]} a ${end.getDate()} de ${monthNames[end.getMonth()]} de ${end.getFullYear()}`;
  }, [weekDays]);

  // Tarefas presentes em cada dia da semana
  const tasksByDay = useMemo(() => {
    const map = new Map<string, Task[]>();
    weekDays.forEach((day) => {
      const dayTasks = tasks.filter((t) => {
        // Tarefas ativas naquele dia: startDate <= iso e endDate >= iso
        return t.startDate <= day.iso && t.endDate >= day.iso;
      });
      map.set(day.iso, dayTasks);
    });
    return map;
  }, [weekDays, tasks]);

  // Total de tarefas únicas nesta semana
  const weekSummary = useMemo(() => {
    const mondayIso = weekDays[0].iso;
    const sundayIso = weekDays[6].iso;
    const activeTasks = tasks.filter((t) => t.startDate <= sundayIso && t.endDate >= mondayIso);
    const completed = activeTasks.filter((t) => t.progress === 100).length;
    const critical = activeTasks.filter((t) => t.isCritical).length;

    return {
      total: activeTasks.length,
      completed,
      critical,
    };
  }, [weekDays, tasks]);

  const handlePrevWeek = () => {
    const d = new Date(currentWeekDate);
    d.setDate(d.getDate() - 7);
    setCurrentWeekDate(d);
  };

  const handleNextWeek = () => {
    const d = new Date(currentWeekDate);
    d.setDate(d.getDate() + 7);
    setCurrentWeekDate(d);
  };

  const handleCurrentWeek = () => {
    setCurrentWeekDate(new Date());
  };

  return (
    <div className="week-view-container">
      {/* Barra Superior de Navegação Semanal */}
      <div className="week-view-toolbar">
        <div className="week-nav-controls">
          <button className="btn-office" onClick={handlePrevWeek} title="Semana Anterior">
            <ChevronLeft size={16} />
            <span>Semana Anterior</span>
          </button>
          <button className="btn-office" onClick={handleCurrentWeek} title="Ir para a Semana Atual">
            <CalendarIcon size={15} />
            <span>Semana Atual</span>
          </button>
          <button className="btn-office" onClick={handleNextWeek} title="Próxima Semana">
            <span>Próxima Semana</span>
            <ChevronRight size={16} />
          </button>
        </div>

        <div className="week-range-title">
          <h3>{formattedRange}</h3>
          <span className="week-badge-summary">
            {weekSummary.total} {weekSummary.total === 1 ? 'tarefa na semana' : 'tarefas na semana'} · {weekSummary.completed} concluídas {weekSummary.critical > 0 && `· ${weekSummary.critical} críticas`}
          </span>
        </div>
      </div>

      {/* Grade dos 7 Dias da Semana */}
      <div className="week-grid">
        {weekDays.map((day) => {
          const dayTasks = tasksByDay.get(day.iso) || [];
          return (
            <div
              key={day.iso}
              className={`week-day-column ${!day.isWork ? 'day-off' : ''} ${day.isToday ? 'day-today' : ''}`}
            >
              {/* Cabeçalho do Dia */}
              <div className="week-day-header">
                <div className="day-title-row">
                  <span className="day-name">{day.dayName}</span>
                  <span className="day-date-number">{day.date.getDate()}</span>
                </div>
                <div className="day-status-tags">
                  {day.isToday && <span className="tag-today">Hoje</span>}
                  {!day.isWork ? (
                    <span className="tag-inactive">Inativo / Folga</span>
                  ) : (
                    <span className="tag-task-count">
                      {dayTasks.length} {dayTasks.length === 1 ? 'tarefa' : 'tarefas'}
                    </span>
                  )}
                </div>
              </div>

              {/* Lista de Cartões de Tarefas do Dia */}
              <div className="week-day-tasks-list">
                {dayTasks.length === 0 ? (
                  <div className="empty-day-state">
                    <span>Sem tarefas</span>
                  </div>
                ) : (
                  dayTasks.map((task) => {
                    const isSelected = selectedTaskId === task.id;
                    const isStartDay = task.startDate === day.iso;
                    const isEndDay = task.endDate === day.iso;
                    const hasSubtasks = task.subTasks && task.subTasks.length > 0;
                    const subtasksDone = hasSubtasks ? task.subTasks!.filter((s) => s.done).length : 0;
                    const totalSubtasks = hasSubtasks ? task.subTasks!.length : 0;

                    let statusClass = 'task-card-in-progress';
                    if (task.progress === 100) statusClass = 'task-card-completed';
                    else if (task.isCritical) statusClass = 'task-card-critical';
                    else if (task.isMilestone) statusClass = 'task-card-milestone';

                    return (
                      <div
                        key={`${day.iso}-${task.id}`}
                        className={`week-task-card ${statusClass} ${isSelected ? 'selected' : ''}`}
                        onClick={() => onSelectTask(task.id)}
                        onDoubleClick={() => onOpenTaskDetail(task.id)}
                        title="Clique duplo para abrir checklist e detalhes"
                      >
                        {/* Indicadores contextuais */}
                        <div className="task-card-top">
                          <div className="task-card-type-indicator">
                            {task.isMilestone ? (
                              <span className="badge-milestone"><Flag size={11} /> Marco</span>
                            ) : task.isCritical ? (
                              <span className="badge-critical"><AlertTriangle size={11} /> Crítica</span>
                            ) : task.progress === 100 ? (
                              <span className="badge-done"><CheckCircle2 size={11} /> 100%</span>
                            ) : (
                              <span className="badge-progress"><Clock size={11} /> {task.progress}%</span>
                            )}
                          </div>

                          {/* Tag de início/término no dia */}
                          {isStartDay && isEndDay ? (
                            <span className="badge-date-event">Hoje</span>
                          ) : isStartDay ? (
                            <span className="badge-date-event start">Inicia</span>
                          ) : isEndDay ? (
                            <span className="badge-date-event end">Entrega</span>
                          ) : null}
                        </div>

                        {/* Nome da Tarefa */}
                        <h4 className="task-card-name" onClick={(e) => { e.stopPropagation(); onOpenTaskDetail(task.id); }}>
                          {task.name}
                        </h4>

                        {/* Checklist info se houver */}
                        {hasSubtasks && (
                          <div className="task-card-subtasks-preview">
                            <ListTodo size={12} />
                            <span>{subtasksDone}/{totalSubtasks} sub-tarefas</span>
                          </div>
                        )}

                        {/* Barra de Progresso */}
                        <div className="task-card-progress-bar">
                          <div
                            className="task-card-progress-fill"
                            style={{
                              width: `${task.progress}%`,
                              backgroundColor: task.progress === 100 ? '#16a34a' : task.isCritical ? '#dc2626' : '#2563eb'
                            }}
                          />
                        </div>

                        {/* Recursos da Tarefa */}
                        {task.resourceNames.length > 0 && (
                          <div className="task-card-resources">
                            <User size={11} />
                            <span>{task.resourceNames.join(', ')}</span>
                          </div>
                        )}
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
  );
};
