import React, { useState, useEffect, useMemo } from 'react';
import { Task, CalendarException, ExceptionCategory } from '../../types/project';
import { formatDatePTBR, parseISODate, getParentSubproject } from '../../utils/scheduler';
import {
  X,
  CalendarOff,
  Plus,
  Trash2,
  CalendarCheck,
  Ban,
  CheckCircle2,
  Info,
  Layers,
} from 'lucide-react';

interface CalendarExceptionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  tasks: Task[];
  selectedTaskId?: string | null;
  onUpdateSubprojectExceptions: (subprojectId: string, exceptions: CalendarException[]) => void;
  defaultDate?: string;
}

const WEEKDAY_NAMES = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
];

export const CalendarExceptionsModal: React.FC<CalendarExceptionsModalProps> = ({
  isOpen,
  onClose,
  tasks,
  selectedTaskId,
  onUpdateSubprojectExceptions,
  defaultDate = '2026-10-16',
}) => {
  const subprojects = useMemo(() => tasks.filter((t) => t.isSummary), [tasks]);

  const initialSubprojectId = useMemo(() => {
    if (selectedTaskId) {
      const idx = tasks.findIndex((t) => t.id === selectedTaskId);
      if (idx >= 0) {
        const t = tasks[idx];
        if (t.isSummary) return t.id;
        const parent = getParentSubproject(tasks, idx);
        if (parent) return parent.id;
      }
    }
    return subprojects[0]?.id || '';
  }, [tasks, selectedTaskId, subprojects]);

  const [activeSubprojectId, setActiveSubprojectId] = useState<string>(initialSubprojectId);
  const [name, setName] = useState<string>('');
  const [date, setDate] = useState<string>(defaultDate);
  const [endDate, setEndDate] = useState<string>(defaultDate);
  const [type, setType] = useState<ExceptionCategory>('Feriado');
  const [isWorkingDay, setIsWorkingDay] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      setActiveSubprojectId(initialSubprojectId);
      setDate(defaultDate);
      setEndDate(defaultDate);
    }
  }, [isOpen, initialSubprojectId, defaultDate]);

  if (!isOpen) return null;

  const activeSubproject =
    subprojects.find((s) => s.id === activeSubprojectId) || subprojects[0] || null;
  const currentExceptions: CalendarException[] = activeSubproject?.exceptions || [];

  const handleTypeChange = (newType: ExceptionCategory) => {
    setType(newType);
    if (newType === 'Expediente Atípico') {
      setIsWorkingDay(true);
    } else if (newType === 'Feriado' || newType === 'Recesso' || newType === 'Emenda') {
      setIsWorkingDay(false);
    }
  };

  const handleStartDateChange = (newStart: string) => {
    setDate(newStart);
    if (!endDate || endDate < newStart || endDate === date) {
      setEndDate(newStart);
    }
  };

  const handleAddException = (e: React.FormEvent) => {
    e.preventDefault();
    if (!date || !activeSubproject) return;

    const finalEndDate = endDate && endDate >= date ? endDate : date;
    const trimmedName = name.trim() || type;

    const newException: CalendarException = {
      id: `exc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: trimmedName,
      date,
      endDate: finalEndDate,
      type,
      isWorkingDay,
    };

    const updated = [...currentExceptions, newException].sort((a, b) =>
      a.date.localeCompare(b.date)
    );
    onUpdateSubprojectExceptions(activeSubproject.id, updated);
    setName('');
  };

  const handleDeleteException = (id: string) => {
    if (!activeSubproject) return;
    const updated = currentExceptions.filter((ex) => ex.id !== id);
    onUpdateSubprojectExceptions(activeSubproject.id, updated);
  };

  const handleToggleWorkingStatus = (id: string) => {
    if (!activeSubproject) return;
    const updated = currentExceptions.map((ex) =>
      ex.id === id ? { ...ex, isWorkingDay: !ex.isWorkingDay } : ex
    );
    onUpdateSubprojectExceptions(activeSubproject.id, updated);
  };

  const getDayOfWeekLabel = (isoStr: string) => {
    try {
      const d = parseISODate(isoStr);
      return WEEKDAY_NAMES[d.getDay()] || '';
    } catch {
      return '';
    }
  };

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-window exceptions-modal">
        <div className="modal-titlebar">
          <div className="title-with-icon">
            <CalendarOff size={18} />
            <span>Datas de Exceção por Subprojeto (Feriados, Recessos e Expedientes)</span>
          </div>
          <button className="close-btn" onClick={onClose} title="Fechar">
            <X size={16} />
          </button>
        </div>

        <div className="modal-form-content">
          {/* Banner explicativo da regra de negócio */}
          <div className="exceptions-info-banner">
            <Info size={16} className="exceptions-info-icon" />
            <div>
              <strong>Datas de Exceção Individuais por Subprojeto:</strong> Cada Subprojeto opera
              com suas próprias datas de exceção de forma independente. Feriados, Recessos, Emendas
              e Expedientes Atípicos cadastrados abaixo aplicam-se{' '}
              <strong>exclusivamente ao Subprojeto selecionado</strong> e às suas subtarefas, sem
              afetar os demais subprojetos.
            </div>
          </div>

          {subprojects.length === 0 ? (
            <div className="exceptions-empty-state">
              Nenhum Subprojeto cadastrado no cronograma. Crie um Subprojeto (ou recue uma subtarefa
              abaixo de uma tarefa principal) para configurar Datas de Exceção individuais por
              Subprojeto.
            </div>
          ) : (
            <>
              {/* Seletor de Subprojeto Alvo */}
              <div className="exception-subproject-selector-box">
                <div className="exception-subproject-selector-header">
                  <Layers size={15} />
                  <strong>Selecione o Subprojeto para gerenciar suas Datas de Exceção:</strong>
                </div>
                <div className="exception-subproject-pills">
                  {subprojects.map((sub) => {
                    const isSelected = activeSubproject?.id === sub.id;
                    const count = (sub.exceptions || []).length;
                    return (
                      <button
                        key={sub.id}
                        type="button"
                        className={`exception-subproject-pill ${isSelected ? 'active' : ''}`}
                        onClick={() => setActiveSubprojectId(sub.id)}
                      >
                        <span className="sub-pill-name">{sub.name}</span>
                        <span className={`sub-pill-count ${count > 0 ? 'has-items' : ''}`}>
                          {count} {count === 1 ? 'exceção' : 'exceções'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Formulário de Cadastro Rápido para o Subprojeto Ativo */}
              {activeSubproject && (
                <form className="exception-add-form" onSubmit={handleAddException}>
                  <div className="exception-form-title">
                    Cadastrar Nova Data de Exceção em: <strong>{activeSubproject.name}</strong>
                  </div>

                  <div className="exception-form-grid">
                    <div className="form-group">
                      <label>Tipo de Exceção:</label>
                      <select
                        className="office-select"
                        value={type}
                        onChange={(e) => handleTypeChange(e.target.value as ExceptionCategory)}
                      >
                        <option value="Feriado">Feriado</option>
                        <option value="Recesso">Recesso</option>
                        <option value="Emenda">Emenda de Feriado</option>
                        <option value="Expediente Atípico">
                          Expediente Atípico (Ex: Sábado Útil)
                        </option>
                        <option value="Outro">Outro</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label>Descrição / Nome (opcional):</label>
                      <input
                        type="text"
                        className="office-input"
                        placeholder={`Ex: ${
                          type === 'Feriado'
                            ? 'Feriado Local'
                            : type === 'Expediente Atípico'
                              ? 'Plantão / Sábado Útil'
                              : type
                        }`}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                      />
                    </div>

                    <div className="form-group">
                      <label>Data Inicial:</label>
                      <input
                        type="date"
                        className="office-input"
                        value={date}
                        onChange={(e) => handleStartDateChange(e.target.value)}
                        required
                      />
                    </div>

                    <div className="form-group">
                      <label>Data Final (mesmo dia ou período):</label>
                      <input
                        type="date"
                        className="office-input"
                        value={endDate}
                        min={date}
                        onChange={(e) => setEndDate(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  <div className="exception-form-bottom-row">
                    <div className="exception-behavior-selector">
                      <span className="behavior-label">Classificação neste Subprojeto:</span>
                      <button
                        type="button"
                        className={`behavior-pill ${!isWorkingDay ? 'non-working active' : ''}`}
                        onClick={() => setIsWorkingDay(false)}
                      >
                        <Ban size={13} />
                        <span>Dia Não Útil (Pula data / Folga)</span>
                      </button>
                      <button
                        type="button"
                        className={`behavior-pill ${isWorkingDay ? 'working active' : ''}`}
                        onClick={() => setIsWorkingDay(true)}
                      >
                        <CalendarCheck size={13} />
                        <span>Dia Útil (Expediente normal)</span>
                      </button>
                    </div>

                    <button type="submit" className="btn-office primary add-exception-btn">
                      <Plus size={15} />
                      <span>Inserir no Subprojeto</span>
                    </button>
                  </div>
                </form>
              )}

              {/* Lista de Exceções Cadastradas no Subprojeto Ativo */}
              {activeSubproject && (
                <div className="exceptions-list-section">
                  <div className="exceptions-list-header">
                    <strong>
                      Exceções Exclusivas de "{activeSubproject.name}" ({currentExceptions.length})
                    </strong>
                  </div>

                  {currentExceptions.length === 0 ? (
                    <div className="exceptions-empty-state">
                      Nenhuma data de exceção cadastrada para{' '}
                      <strong>{activeSubproject.name}</strong>. Insira um feriado, recesso ou
                      expediente acima para recalcular apenas as tarefas deste Subprojeto.
                    </div>
                  ) : (
                    <div className="exceptions-table-wrapper">
                      <table className="office-table exceptions-table">
                        <thead>
                          <tr>
                            <th>Data / Período</th>
                            <th>Dia da Semana</th>
                            <th>Descrição</th>
                            <th>Tipo</th>
                            <th>Regra no Subprojeto</th>
                            <th style={{ width: '50px', textAlign: 'center' }}>Ação</th>
                          </tr>
                        </thead>
                        <tbody>
                          {currentExceptions.map((ex) => {
                            const isRange = ex.endDate && ex.endDate !== ex.date;
                            return (
                              <tr key={ex.id}>
                                <td className="font-semibold">
                                  {isRange
                                    ? `${formatDatePTBR(ex.date)} até ${formatDatePTBR(ex.endDate!)}`
                                    : formatDatePTBR(ex.date)}
                                </td>
                                <td className="text-muted">
                                  {isRange
                                    ? `${getDayOfWeekLabel(ex.date)} ➔ ${getDayOfWeekLabel(ex.endDate!)}`
                                    : getDayOfWeekLabel(ex.date)}
                                </td>
                                <td>{ex.name}</td>
                                <td>
                                  <span
                                    className={`exception-type-badge ${ex.type
                                      .toLowerCase()
                                      .replace(/\s+/g, '-')}`}
                                  >
                                    {ex.type}
                                  </span>
                                </td>
                                <td>
                                  <button
                                    type="button"
                                    className={`exception-status-toggle ${
                                      ex.isWorkingDay ? 'work' : 'off'
                                    }`}
                                    onClick={() => handleToggleWorkingStatus(ex.id)}
                                    title="Clique para alternar entre Dia Não Útil e Dia Útil neste Subprojeto"
                                  >
                                    {ex.isWorkingDay ? (
                                      <>
                                        <CheckCircle2 size={12} />
                                        <span>Dia Útil</span>
                                      </>
                                    ) : (
                                      <>
                                        <Ban size={12} />
                                        <span>Dia Não Útil</span>
                                      </>
                                    )}
                                  </button>
                                </td>
                                <td style={{ textAlign: 'center' }}>
                                  <button
                                    type="button"
                                    className="icon-delete-btn"
                                    onClick={() => handleDeleteException(ex.id)}
                                    title="Remover exceção deste Subprojeto"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn-office primary" onClick={onClose}>
            Concluir e Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
