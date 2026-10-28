import React, { useState, useEffect } from 'react';
import { ProjectMetadata, Task } from '../../types/project';
import { X, Calendar, Check, Ban, Clock, Layers } from 'lucide-react';
import { formatActiveWeekDaysShort } from '../../utils/scheduler';

interface ProjectInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  metadata: ProjectMetadata;
  tasks?: Task[];
  onUpdateMetadata: (metadata: ProjectMetadata) => void;
  onUpdateSubprojectCalendars?: (subprojectCalendars: Record<string, number[] | undefined>) => void;
}

const WEEK_DAYS = [
  { index: 0, name: 'Domingo', short: 'Dom' },
  { index: 1, name: 'Segunda-feira', short: 'Seg' },
  { index: 2, name: 'Terça-feira', short: 'Ter' },
  { index: 3, name: 'Quarta-feira', short: 'Qua' },
  { index: 4, name: 'Quinta-feira', short: 'Qui' },
  { index: 5, name: 'Sexta-feira', short: 'Sex' },
  { index: 6, name: 'Sábado', short: 'Sáb' },
];

export const ProjectInfoModal: React.FC<ProjectInfoModalProps> = ({
  isOpen,
  onClose,
  metadata,
  tasks = [],
  onUpdateMetadata,
  onUpdateSubprojectCalendars,
}) => {
  const [data, setData] = useState<ProjectMetadata>(metadata);
  const [subCalendars, setSubCalendars] = useState<Record<string, number[] | undefined>>({});

  const subprojects = tasks.filter((t) => t.isSummary);

  useEffect(() => {
    setData({
      ...metadata,
      activeWeekDays: metadata.activeWeekDays || [1, 2, 3, 4, 5],
    });
    const map: Record<string, number[] | undefined> = {};
    tasks.forEach((t) => {
      if (t.isSummary) {
        map[t.id] = t.activeWeekDays && t.activeWeekDays.length > 0 ? [...t.activeWeekDays] : undefined;
      }
    });
    setSubCalendars(map);
  }, [metadata, tasks, isOpen]);

  if (!isOpen) return null;

  const currentActive = data.activeWeekDays || [1, 2, 3, 4, 5];

  const handleToggleDay = (dayIndex: number) => {
    let nextActive: number[];
    if (currentActive.includes(dayIndex)) {
      if (currentActive.length === 1) {
        alert('O projeto precisa ter pelo menos 1 dia de atividade na semana.');
        return;
      }
      nextActive = currentActive.filter((d) => d !== dayIndex);
    } else {
      nextActive = [...currentActive, dayIndex].sort((a, b) => a - b);
    }

    let calName = 'Personalizado';
    if (nextActive.length === 5 && [1, 2, 3, 4, 5].every((d) => nextActive.includes(d))) {
      calName = 'Padrão (Seg-Sex)';
    } else if (nextActive.length === 6 && [1, 2, 3, 4, 5, 6].every((d) => nextActive.includes(d))) {
      calName = 'Comercial (Seg-Sáb)';
    } else if (nextActive.length === 7) {
      calName = '24 Horas / Contínuo (7 dias)';
    }

    setData({
      ...data,
      calendar: calName,
      activeWeekDays: nextActive,
    });
  };

  const handleApplyPreset = (preset: 'standard' | 'tue-sat' | 'commercial' | 'continuous') => {
    if (preset === 'standard') {
      setData({
        ...data,
        calendar: 'Padrão (Seg-Sex)',
        activeWeekDays: [1, 2, 3, 4, 5],
      });
    } else if (preset === 'tue-sat') {
      setData({
        ...data,
        calendar: 'Terça a Sábado (Ter-Sáb)',
        activeWeekDays: [2, 3, 4, 5, 6],
      });
    } else if (preset === 'commercial') {
      setData({
        ...data,
        calendar: 'Comercial (Seg-Sáb)',
        activeWeekDays: [1, 2, 3, 4, 5, 6],
      });
    } else if (preset === 'continuous') {
      setData({
        ...data,
        calendar: '24 Horas / Contínuo (7 dias)',
        activeWeekDays: [0, 1, 2, 3, 4, 5, 6],
      });
    }
  };

  const handleToggleSubprojectDay = (subId: string, dayIndex: number) => {
    const current = subCalendars[subId] || currentActive;
    let nextActive: number[];
    if (current.includes(dayIndex)) {
      if (current.length === 1) {
        alert('O Subprojeto precisa ter pelo menos 1 dia de atividade na semana.');
        return;
      }
      nextActive = current.filter((d) => d !== dayIndex);
    } else {
      nextActive = [...current, dayIndex].sort((a, b) => a - b);
    }
    setSubCalendars((prev) => ({ ...prev, [subId]: nextActive }));
  };

  const handleSubprojectPreset = (
    subId: string,
    preset: 'inherit' | 'mon-fri' | 'tue-sat' | 'mon-sat' | 'all-7'
  ) => {
    if (preset === 'inherit') {
      setSubCalendars((prev) => ({ ...prev, [subId]: undefined }));
    } else if (preset === 'mon-fri') {
      setSubCalendars((prev) => ({ ...prev, [subId]: [1, 2, 3, 4, 5] }));
    } else if (preset === 'tue-sat') {
      setSubCalendars((prev) => ({ ...prev, [subId]: [2, 3, 4, 5, 6] }));
    } else if (preset === 'mon-sat') {
      setSubCalendars((prev) => ({ ...prev, [subId]: [1, 2, 3, 4, 5, 6] }));
    } else if (preset === 'all-7') {
      setSubCalendars((prev) => ({ ...prev, [subId]: [0, 1, 2, 3, 4, 5, 6] }));
    }
  };

  const handleSave = () => {
    onUpdateMetadata(data);
    if (onUpdateSubprojectCalendars) {
      onUpdateSubprojectCalendars(subCalendars);
    }
    onClose();
  };

  const activeDaysList = WEEK_DAYS.filter((d) => currentActive.includes(d.index)).map((d) => d.name);
  const inactiveDaysList = WEEK_DAYS.filter((d) => !currentActive.includes(d.index)).map((d) => d.name);

  return (
    <div className="modal-backdrop">
      <div className="modal-window project-info-modal expanded">
        <div className="modal-titlebar">
          <div className="title-with-icon">
            <Calendar size={18} />
            <span>Informações sobre o Projeto &amp; Calendários de Subprojetos</span>
          </div>
          <button className="close-btn" onClick={onClose} title="Fechar">
            <X size={16} />
          </button>
        </div>

        <div className="modal-form-content">
          {/* Dados Gerais do Projeto */}
          <div className="form-group">
            <label>Título do Projeto (Nível Macro):</label>
            <input
              type="text"
              className="office-input"
              value={data.title}
              onChange={(e) => setData({ ...data, title: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label>Gerente do Projeto:</label>
            <input
              type="text"
              className="office-input"
              value={data.manager}
              onChange={(e) => setData({ ...data, manager: e.target.value })}
            />
          </div>

          <div className="form-row-2">
            <div className="form-group">
              <label>Data de Início do Projeto:</label>
              <input
                type="date"
                className="office-input"
                value={data.startDate}
                onChange={(e) => setData({ ...data, startDate: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label>Data de Status Atual:</label>
              <input
                type="date"
                className="office-input"
                value={data.currentDate}
                onChange={(e) => setData({ ...data, currentDate: e.target.value })}
              />
            </div>
          </div>

          {/* Seção Expandida do Calendário Base de Trabalho (Projeto Macro) */}
          <div className="calendar-config-box">
            <div className="calendar-header-row">
              <div className="calendar-title">
                <Clock size={16} className="text-primary" />
                <strong>Calendário Base do Projeto Macro (Padrão Geral)</strong>
              </div>
              <div className="calendar-preset-buttons">
                <button
                  type="button"
                  className={`btn-preset ${data.calendar === 'Padrão (Seg-Sex)' ? 'active' : ''}`}
                  onClick={() => handleApplyPreset('standard')}
                  title="Segunda a Sexta-feira úteis"
                >
                  Padrão (Seg-Sex)
                </button>
                <button
                  type="button"
                  className={`btn-preset ${data.calendar === 'Terça a Sábado (Ter-Sáb)' ? 'active' : ''}`}
                  onClick={() => handleApplyPreset('tue-sat')}
                  title="Terça a Sábado úteis"
                >
                  Ter-Sáb (5d)
                </button>
                <button
                  type="button"
                  className={`btn-preset ${data.calendar === 'Comercial (Seg-Sáb)' ? 'active' : ''}`}
                  onClick={() => handleApplyPreset('commercial')}
                  title="Segunda a Sábado úteis"
                >
                  Seg-Sáb (6d)
                </button>
                <button
                  type="button"
                  className={`btn-preset ${data.calendar === '24 Horas / Contínuo (7 dias)' ? 'active' : ''}`}
                  onClick={() => handleApplyPreset('continuous')}
                  title="Todos os 7 dias úteis"
                >
                  Todos os 7 dias
                </button>
              </div>
            </div>

            <p className="calendar-description">
              Clique sobre os dias da semana para alternar entre <strong>Dia de Atividade</strong> (trabalho) e{' '}
              <strong>Dia de Inatividade</strong> (folga) no projeto macro. As Datas de Exceção (feriados e
              folgas) são globais para todo o projeto e seus subprojetos.
            </p>

            {/* Grid dos 7 dias da semana */}
            <div className="weekdays-grid">
              {WEEK_DAYS.map((day) => {
                const isActive = currentActive.includes(day.index);
                return (
                  <button
                    key={day.index}
                    type="button"
                    className={`weekday-card ${isActive ? 'active-day' : 'inactive-day'}`}
                    onClick={() => handleToggleDay(day.index)}
                  >
                    <div className="weekday-header">
                      <span className="weekday-short">{day.short}</span>
                      {isActive ? (
                        <Check size={14} className="icon-status active" />
                      ) : (
                        <Ban size={14} className="icon-status inactive" />
                      )}
                    </div>
                    <span className="weekday-full">{day.name}</span>
                    <span className="weekday-badge">{isActive ? 'Atividade' : 'Inativo'}</span>
                  </button>
                );
              })}
            </div>

            {/* Resumo do Calendário */}
            <div className="calendar-summary">
              <div className="summary-item">
                <span className="summary-label">🟢 Dias de Atividade ({activeDaysList.length}):</span>
                <span className="summary-value active">{activeDaysList.join(', ')}</span>
              </div>
              <div className="summary-item">
                <span className="summary-label">⚪ Dias de Inatividade ({inactiveDaysList.length}):</span>
                <span className="summary-value inactive">
                  {inactiveDaysList.length > 0
                    ? inactiveDaysList.join(', ')
                    : 'Nenhum (Trabalho todos os dias)'}
                </span>
              </div>
            </div>
          </div>

          {/* Seção de Calendários Individuais por Subprojeto */}
          {subprojects.length > 0 && (
            <div className="calendar-config-box subprojects-calendars-section">
              <div className="calendar-header-row">
                <div className="calendar-title">
                  <Layers size={16} className="text-primary" />
                  <strong>Calendário de Dias Ativos por Subprojeto ({subprojects.length})</strong>
                </div>
              </div>
              <p className="calendar-description">
                Cada <strong>Subprojeto</strong> (tarefa com subtarefas vinculadas na EAP) pode operar com seu
                próprio calendário de dias úteis (ex.: <em>Subprojeto A</em> de Seg–Sex e{' '}
                <em>Subprojeto B</em> de Ter–Sáb).
              </p>

              <div className="subprojects-calendar-list">
                {subprojects.map((sub) => {
                  const customDays = subCalendars[sub.id];
                  const effectiveDays =
                    customDays && customDays.length > 0 ? customDays : currentActive;

                  return (
                    <div key={sub.id} className="subproject-calendar-row-card">
                      <div className="subproject-cal-top">
                        <div className="subproject-cal-name-group">
                          <span className="subproject-classification-badge">Subprojeto</span>
                          <strong>{sub.name}</strong>
                          <span className="subproject-cal-summary-pill">
                            {formatActiveWeekDaysShort(effectiveDays)}
                            {customDays === undefined ? ' (Padrão)' : ' (Personalizado)'}
                          </span>
                        </div>
                        <div className="subproject-cal-presets">
                          <button
                            type="button"
                            className={`btn-preset ${customDays === undefined ? 'active' : ''}`}
                            onClick={() => handleSubprojectPreset(sub.id, 'inherit')}
                          >
                            Padrão
                          </button>
                          <button
                            type="button"
                            className="btn-preset"
                            onClick={() => handleSubprojectPreset(sub.id, 'mon-fri')}
                          >
                            Seg–Sex
                          </button>
                          <button
                            type="button"
                            className="btn-preset"
                            onClick={() => handleSubprojectPreset(sub.id, 'tue-sat')}
                          >
                            Ter–Sáb
                          </button>
                          <button
                            type="button"
                            className="btn-preset"
                            onClick={() => handleSubprojectPreset(sub.id, 'mon-sat')}
                          >
                            Seg–Sáb
                          </button>
                        </div>
                      </div>

                      <div className="subproject-mini-days-row">
                        {WEEK_DAYS.map((day) => {
                          const isDayOn = effectiveDays.includes(day.index);
                          return (
                            <button
                              key={day.index}
                              type="button"
                              className={`subproject-mini-day-btn ${isDayOn ? 'active' : 'inactive'}`}
                              onClick={() => handleToggleSubprojectDay(sub.id, day.index)}
                              title={`${day.name}: ${isDayOn ? 'Dia Útil Ativo' : 'Inativo'} neste Subprojeto`}
                            >
                              <span>{day.short}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="form-group">
            <label>Moeda do Projeto:</label>
            <select
              className="office-select"
              value={data.currency}
              onChange={(e) => setData({ ...data, currency: e.target.value as any })}
            >
              <option value="BRL">R$ (Real Brasileiro)</option>
              <option value="USD">$ (Dólar Americano)</option>
              <option value="EUR">€ (Euro)</option>
            </select>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-office" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn-office primary" onClick={handleSave}>
            Salvar e Aplicar Calendários
          </button>
        </div>
      </div>
    </div>
  );
};
