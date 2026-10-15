import React, { useState, useEffect } from 'react';
import { ProjectMetadata } from '../../types/project';
import { X, Calendar, Check, Ban, Clock, RotateCcw } from 'lucide-react';

interface ProjectInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  metadata: ProjectMetadata;
  onUpdateMetadata: (metadata: ProjectMetadata) => void;
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
  onUpdateMetadata,
}) => {
  const [data, setData] = useState<ProjectMetadata>(metadata);

  useEffect(() => {
    setData({
      ...metadata,
      activeWeekDays: metadata.activeWeekDays || [1, 2, 3, 4, 5],
    });
  }, [metadata, isOpen]);

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

  const handleApplyPreset = (preset: 'standard' | 'commercial' | 'continuous') => {
    if (preset === 'standard') {
      setData({
        ...data,
        calendar: 'Padrão (Seg-Sex)',
        activeWeekDays: [1, 2, 3, 4, 5],
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

  const handleSave = () => {
    onUpdateMetadata(data);
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
            <span>Informações sobre o Projeto & Calendário Base</span>
          </div>
          <button className="close-btn" onClick={onClose} title="Fechar">
            <X size={16} />
          </button>
        </div>

        <div className="modal-form-content">
          {/* Dados Gerais do Projeto */}
          <div className="form-group">
            <label>Título do Projeto:</label>
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

          {/* Seção Expandida do Calendário Base de Trabalho */}
          <div className="calendar-config-box">
            <div className="calendar-header-row">
              <div className="calendar-title">
                <Clock size={16} className="text-primary" />
                <strong>Calendário Base de Trabalho (Dias de Atividade e Inatividade)</strong>
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
              Clique sobre os dias da semana para alternar entre <strong>Dia de Atividade</strong> (trabalho) e <strong>Dia de Inatividade</strong> (folga). O cronograma e o gráfico de Gantt se adaptarão a essa escala.
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
                    <span className="weekday-badge">
                      {isActive ? 'Atividade' : 'Inativo'}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Resumo do Calendário */}
            <div className="calendar-summary">
              <div className="summary-item">
                <span className="summary-label">🟢 Dias de Atividade ({activeDaysList.length}):</span>
                <span className="summary-value active">
                  {activeDaysList.join(', ')}
                </span>
              </div>
              <div className="summary-item">
                <span className="summary-label">⚪ Dias de Inatividade ({inactiveDaysList.length}):</span>
                <span className="summary-value inactive">
                  {inactiveDaysList.length > 0 ? inactiveDaysList.join(', ') : 'Nenhum (Trabalho todos os dias)'}
                </span>
              </div>
            </div>
          </div>

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
            Salvar e Aplicar Calendário
          </button>
        </div>
      </div>
    </div>
  );
};
