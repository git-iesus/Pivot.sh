import React, { useState, useMemo } from 'react';
import { Task, CalendarException } from '../../types/project';
import {
  formatDatePTBR,
  getBaselineVarianceDays,
} from '../../utils/scheduler';
import {
  X,
  Target,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  Calendar,
  Camera,
  Sliders,
  Info,
} from 'lucide-react';

interface BaselineModalProps {
  isOpen: boolean;
  onClose: () => void;
  tasks: Task[];
  selectedTaskIds: string[];
  activeWeekDays: number[];
  exceptions: CalendarException[];
  onSetBaselineSnapshot: (scope: 'all' | 'selected') => void;
  onSetCustomBaselineDate: (scope: 'all' | 'selected', customEndDate: string) => void;
  onClearBaseline: (scope: 'all' | 'selected') => void;
}

export const BaselineModal: React.FC<BaselineModalProps> = ({
  isOpen,
  onClose,
  tasks,
  selectedTaskIds,
  activeWeekDays,
  exceptions,
  onSetBaselineSnapshot,
  onSetCustomBaselineDate,
  onClearBaseline,
}) => {
  const hasSelection = selectedTaskIds.length > 0;
  const [scope, setScope] = useState<'all' | 'selected'>(hasSelection ? 'selected' : 'all');
  const [method, setMethod] = useState<'snapshot' | 'customDate'>('snapshot');
  const [customDate, setCustomDate] = useState<string>(() => {
    if (selectedTaskIds.length === 1) {
      const found = tasks.find((t) => t.id === selectedTaskIds[0]);
      if (found) return found.baselineEndDate || found.endDate;
    }
    const exec = tasks.find((t) => !t.isSummary);
    return exec?.endDate || new Date().toISOString().slice(0, 10);
  });

  // Estatísticas da Linha de Base do Projeto (apenas tarefas executáveis)
  const stats = useMemo(() => {
    const executables = tasks.filter((t) => !t.isSummary);
    let withBaseline = 0;
    let onTrackOrAhead = 0;
    let delayed = 0;

    executables.forEach((t) => {
      if (t.baselineEndDate) {
        withBaseline++;
        const variance = getBaselineVarianceDays(t, activeWeekDays, exceptions);
        if (variance !== null && variance > 0) {
          delayed++;
        } else {
          onTrackOrAhead++;
        }
      }
    });

    return {
      totalExecutable: executables.length,
      withBaseline,
      onTrackOrAhead,
      delayed,
    };
  }, [tasks, activeWeekDays, exceptions]);

  if (!isOpen) return null;

  const effectiveScope = scope === 'selected' && !hasSelection ? 'all' : scope;

  const handleApply = (e: React.FormEvent) => {
    e.preventDefault();
    if (method === 'snapshot') {
      onSetBaselineSnapshot(effectiveScope);
    } else {
      if (!customDate) return;
      onSetCustomBaselineDate(effectiveScope, customDate);
    }
    onClose();
  };

  const handleClear = () => {
    onClearBaseline(effectiveScope);
    onClose();
  };

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-window baseline-modal">
        <div className="modal-titlebar">
          <div className="title-with-icon">
            <Target size={17} />
            <span>Gerenciar Linha de Base (Teórico × Prático)</span>
          </div>
          <button className="close-btn" onClick={onClose} title="Fechar">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleApply} className="modal-form-content baseline-modal-body">
          {/* Painel Resumo de Status da Linha de Base */}
          <div className="baseline-stats-banner">
            <div className="baseline-stat-box">
              <span className="stat-label">Tarefas c/ Base</span>
              <strong className="stat-value">
                {stats.withBaseline} / {stats.totalExecutable}
              </strong>
            </div>
            <div className="baseline-stat-box success">
              <CheckCircle2 size={15} />
              <div>
                <span className="stat-label">No Prazo / Adiantadas</span>
                <strong className="stat-value">{stats.onTrackOrAhead}</strong>
              </div>
            </div>
            <div className="baseline-stat-box warning">
              <AlertTriangle size={15} />
              <div>
                <span className="stat-label">Com Desvio (Atraso)</span>
                <strong className="stat-value">{stats.delayed}</strong>
              </div>
            </div>
          </div>

          {/* 1. Como Definir a Linha de Base */}
          <div className="baseline-section">
            <label className="baseline-section-label">1. Método de Definição da Linha de Base</label>
            <div className="baseline-method-cards">
              <button
                type="button"
                className={`baseline-method-card ${method === 'snapshot' ? 'active' : ''}`}
                onClick={() => setMethod('snapshot')}
              >
                <div className="method-card-top">
                  <Camera size={16} className="method-icon" />
                  <strong>Fotografar Cronograma Atual (Padrão MS Project)</strong>
                </div>
                <p>
                  Salva as datas de <em>Início</em>, <em>Término</em> e <em>Duração</em> atuais como a
                  meta teórica para medir variações futuras.
                </p>
              </button>

              <button
                type="button"
                className={`baseline-method-card ${method === 'customDate' ? 'active' : ''}`}
                onClick={() => setMethod('customDate')}
              >
                <div className="method-card-top">
                  <Sliders size={16} className="method-icon" />
                  <strong>Definir Data Fim Base Específica</strong>
                </div>
                <p>
                  Crava manualmente uma data-limite teórica (<em>Término Base</em>) para comparar com a
                  data fim prática atual.
                </p>
              </button>
            </div>

            {method === 'customDate' && (
              <div className="baseline-custom-date-box">
                <label htmlFor="baseline-custom-date-input">
                  <Calendar size={14} />
                  <span>Data Fim Base (Teórica):</span>
                </label>
                <input
                  id="baseline-custom-date-input"
                  type="date"
                  className="office-input"
                  value={customDate}
                  onChange={(e) => setCustomDate(e.target.value)}
                  required
                />
                {customDate && (
                  <span className="baseline-date-preview">
                    Meta: <strong>{formatDatePTBR(customDate)}</strong>
                  </span>
                )}
              </div>
            )}
          </div>

          {/* 2. Escopo de Aplicação */}
          <div className="baseline-section">
            <label className="baseline-section-label">2. Aplicar Linha de Base Para</label>
            <div className="baseline-scope-options">
              <label className={`baseline-scope-radio ${effectiveScope === 'all' ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="baselineScope"
                  checked={effectiveScope === 'all'}
                  onChange={() => setScope('all')}
                />
                <div>
                  <strong>Projeto Inteiro ({stats.totalExecutable} tarefas executáveis)</strong>
                  <span>Atualiza a Linha de Base de todas as tarefas e recalcula os Subprojetos.</span>
                </div>
              </label>

              <label
                className={`baseline-scope-radio ${effectiveScope === 'selected' ? 'selected' : ''} ${!hasSelection ? 'disabled' : ''}`}
              >
                <input
                  type="radio"
                  name="baselineScope"
                  checked={effectiveScope === 'selected'}
                  disabled={!hasSelection}
                  onChange={() => setScope('selected')}
                />
                <div>
                  <strong>
                    Tarefas Selecionadas ({selectedTaskIds.length}{' '}
                    {selectedTaskIds.length === 1 ? 'selecionada' : 'selecionadas'})
                  </strong>
                  <span>
                    {hasSelection
                      ? 'Aplica ou limpa a Linha de Base apenas nas linhas selecionadas na planilha.'
                      : 'Selecione uma ou mais tarefas na planilha para habilitar esta opção.'}
                  </span>
                </div>
              </label>
            </div>
          </div>

          <div className="baseline-info-note">
            <Info size={14} />
            <span>
              <strong>Leitura Visual (Teórico × Prático):</strong> Após salvar, a coluna{' '}
              <em>Término</em> exibirá o desvio em dias úteis (ex: <code className="var-ok">0d</code>,{' '}
              <code className="var-ahead">-2d</code> ou <code className="var-late">+3d</code>) e o
              Gráfico de Gantt mostrará o trilho cinza da Linha de Base sob cada barra.
            </span>
          </div>

          <div className="modal-footer baseline-modal-footer">
            <button
              type="button"
              className="btn-office danger-outline"
              onClick={handleClear}
              disabled={stats.withBaseline === 0}
              title="Remover a Linha de Base do escopo selecionado"
            >
              <Trash2 size={13} />
              <span>
                Limpar Linha de Base ({effectiveScope === 'all' ? 'Projeto' : 'Selecionadas'})
              </span>
            </button>

            <div className="baseline-footer-right">
              <button type="button" className="btn-office" onClick={onClose}>
                Cancelar
              </button>
              <button type="submit" className="btn-office primary">
                Salvar Linha de Base
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
