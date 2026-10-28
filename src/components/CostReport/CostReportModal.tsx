import React, { useState, useMemo } from 'react';
import { Task, Resource, ProjectMetadata } from '../../types/project';
import { 
  X, 
  DollarSign, 
  Download, 
  FileSpreadsheet, 
  Printer, 
  TrendingUp, 
  PieChart, 
  Wallet, 
  AlertCircle,
  Search,
  CheckCircle2
} from 'lucide-react';
import * as XLSX from 'xlsx';

interface CostReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  tasks: Task[];
  resources: Resource[];
  metadata: ProjectMetadata;
}

export const CostReportModal: React.FC<CostReportModalProps> = ({
  isOpen,
  onClose,
  tasks,
  metadata
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'withCost' | 'zeroCost' | 'completed' | 'inProgress'>('all');

  // Cálculos financeiros
  const financialSummary = useMemo(() => {
    // Para evitar duplicidade de valores de tarefas-resumo
    const nonSummaryTasks = tasks.filter(t => !t.isSummary);

    const totalPlanned = nonSummaryTasks.reduce((acc, t) => acc + (t.cost || 0), 0);
    const totalExecuted = nonSummaryTasks.reduce((acc, t) => {
      const cost = t.cost || 0;
      return acc + (cost * (t.progress / 100));
    }, 0);
    const remainingBalance = Math.max(0, totalPlanned - totalExecuted);
    const financialProgressPercent = totalPlanned > 0 ? (totalExecuted / totalPlanned) * 100 : 0;

    const tasksWithCostCount = nonSummaryTasks.filter(t => (t.cost || 0) > 0).length;
    const completedTasksCount = nonSummaryTasks.filter(t => t.progress === 100).length;

    // Tarefa mais custosa
    const highestCostTask = nonSummaryTasks.reduce<Task | null>((max, t) => {
      if (!max) return (t.cost || 0) > 0 ? t : null;
      return (t.cost || 0) > (max.cost || 0) ? t : max;
    }, null);

    return {
      totalPlanned,
      totalExecuted,
      remainingBalance,
      financialProgressPercent,
      tasksWithCostCount,
      completedTasksCount,
      totalTasksCount: nonSummaryTasks.length,
      highestCostTask
    };
  }, [tasks]);

  // Lista de tarefas filtradas
  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      // Busca por texto
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const matchName = t.name.toLowerCase().includes(query);
        const matchWbs = t.wbsIndex.toLowerCase().includes(query);
        if (!matchName && !matchWbs) return false;
      }

      // Filtro por tipo
      if (filterType === 'withCost') return (t.cost || 0) > 0;
      if (filterType === 'zeroCost') return !t.cost || t.cost === 0;
      if (filterType === 'completed') return t.progress === 100;
      if (filterType === 'inProgress') return t.progress > 0 && t.progress < 100;

      return true;
    });
  }, [tasks, searchTerm, filterType]);

  if (!isOpen) return null;

  const formatCurrency = (val: number) => {
    return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  // Exportar Relatório de Custos para XLSX
  const handleExportCostXLSX = () => {
    const headers = [
      'ID',
      'EAP',
      'Nome da Tarefa',
      'Tipo',
      'Duração (dias)',
      '% Concluída',
      'Custo Orçado (R$)',
      'Custo Realizado (R$)',
      'Saldo a Executar (R$)',
      'Status'
    ];

    const rows = tasks.map((t, idx) => {
      const planned = t.cost || 0;
      const executed = planned * (t.progress / 100);
      const balance = Math.max(0, planned - executed);
      const statusStr = t.progress === 100 ? 'Concluída' : t.progress > 0 ? 'Em Andamento' : 'Não Iniciada';
      const typeStr = t.isSummary ? 'Subprojeto' : t.isMilestone ? 'Marco' : 'Tarefa';

      return [
        idx + 1,
        t.wbsIndex,
        t.name,
        typeStr,
        t.durationDays,
        `${t.progress}%`,
        planned,
        executed,
        balance,
        statusStr
      ];
    });

    // Linha de totalização
    const totalRow = [
      '',
      '',
      'TOTAL GERAL DO PROJETO',
      '',
      '',
      `${Math.round(financialSummary.financialProgressPercent)}%`,
      financialSummary.totalPlanned,
      financialSummary.totalExecuted,
      financialSummary.remainingBalance,
      ''
    ];

    const wsData = [
      ['RELATÓRIO FINANCEIRO E DE CUSTOS DO PROJETO'],
      [`Projeto: ${metadata.title}`, `Data: ${new Date().toLocaleDateString('pt-BR')}`],
      [],
      headers,
      ...rows,
      [],
      totalRow
    ];

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = [
      { wch: 6 },
      { wch: 10 },
      { wch: 45 },
      { wch: 12 },
      { wch: 14 },
      { wch: 14 },
      { wch: 18 },
      { wch: 18 },
      { wch: 18 },
      { wch: 16 }
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Relatório de Custos');

    const fileName = `Relatorio_Custos_${(metadata.title || 'projeto').replace(/\s+/g, '_')}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

  // Exportar Relatório de Custos para CSV
  const handleExportCostCSV = () => {
    const headers = [
      'ID',
      'EAP',
      'Nome da Tarefa',
      'Tipo',
      'Duração (dias)',
      '% Concluída',
      'Custo Orçado (R$)',
      'Custo Realizado (R$)',
      'Saldo a Executar (R$)',
      'Status'
    ];

    const rows = tasks.map((t, idx) => {
      const planned = (t.cost || 0).toFixed(2);
      const executed = ((t.cost || 0) * (t.progress / 100)).toFixed(2);
      const balance = Math.max(0, (t.cost || 0) - (t.cost || 0) * (t.progress / 100)).toFixed(2);
      const statusStr = t.progress === 100 ? 'Concluída' : t.progress > 0 ? 'Em Andamento' : 'Não Iniciada';
      const typeStr = t.isSummary ? 'Subprojeto' : t.isMilestone ? 'Marco' : 'Tarefa';

      return [
        idx + 1,
        t.wbsIndex,
        t.name,
        typeStr,
        t.durationDays,
        `${t.progress}%`,
        planned,
        executed,
        balance,
        statusStr
      ];
    });

    const csvLines = [
      headers.join(';'),
      ...rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';')),
      `"";"";"TOTAL GERAL DO PROJETO";"";"";"${Math.round(financialSummary.financialProgressPercent)}%";"${financialSummary.totalPlanned.toFixed(2)}";"${financialSummary.totalExecuted.toFixed(2)}";"${financialSummary.remainingBalance.toFixed(2)}";""`
    ];

    const bom = '\uFEFF';
    const blob = new Blob([bom + csvLines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Relatorio_Custos_${(metadata.title || 'projeto').replace(/\s+/g, '_')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-window cost-report-modal">
        {/* Cabeçalho */}
        <div className="modal-titlebar">
          <div className="title-with-icon">
            <DollarSign size={18} className="success-color" />
            <span>Relatório de Custos &amp; Orçamento do Projeto</span>
          </div>
          <button className="close-btn" onClick={onClose} title="Fechar">
            <X size={16} />
          </button>
        </div>

        <div className="cost-report-content">
          {/* Top Info Bar */}
          <div className="cost-report-meta-bar">
            <div>
              <span className="cost-report-proj-title">{metadata.title || 'Projeto Sem Título'}</span>
              <span className="cost-report-proj-manager">Gerente: {metadata.manager || 'Não definido'}</span>
            </div>
            <div className="cost-report-actions">
              <button className="btn-office" onClick={handleExportCostXLSX} title="Exportar planilha Excel completa">
                <FileSpreadsheet size={15} className="success-color" />
                <span>Exportar .xlsx</span>
              </button>
              <button className="btn-office" onClick={handleExportCostCSV} title="Exportar arquivo CSV separado por ponto e vírgula">
                <Download size={15} />
                <span>Exportar .csv</span>
              </button>
              <button className="btn-office" onClick={() => window.print()} title="Imprimir este relatório">
                <Printer size={15} />
                <span>Imprimir</span>
              </button>
            </div>
          </div>

          {/* Cards de KPIs Financeiros */}
          <div className="cost-kpis-grid">
            <div className="cost-kpi-card planned">
              <div className="kpi-icon-wrapper">
                <Wallet size={22} />
              </div>
              <div className="kpi-content">
                <div className="kpi-label">Custo Total Orçado</div>
                <div className="kpi-value">{formatCurrency(financialSummary.totalPlanned)}</div>
                <div className="kpi-subtitle">
                  {financialSummary.tasksWithCostCount} de {financialSummary.totalTasksCount} tarefas com custo
                </div>
              </div>
            </div>

            <div className="cost-kpi-card executed">
              <div className="kpi-icon-wrapper">
                <TrendingUp size={22} />
              </div>
              <div className="kpi-content">
                <div className="kpi-label">Custo Realizado (Valor Agregado)</div>
                <div className="kpi-value">{formatCurrency(financialSummary.totalExecuted)}</div>
                <div className="kpi-subtitle">
                  Proporcional ao progresso físico
                </div>
              </div>
            </div>

            <div className="cost-kpi-card balance">
              <div className="kpi-icon-wrapper">
                <PieChart size={22} />
              </div>
              <div className="kpi-content">
                <div className="kpi-label">Saldo a Desembolsar</div>
                <div className="kpi-value">{formatCurrency(financialSummary.remainingBalance)}</div>
                <div className="kpi-subtitle">
                  Restante previsto para conclusão
                </div>
              </div>
            </div>

            <div className="cost-kpi-card progress-card">
              <div className="kpi-icon-wrapper">
                <CheckCircle2 size={22} />
              </div>
              <div className="kpi-content">
                <div className="kpi-label">Execução Financeira</div>
                <div className="kpi-value">
                  {financialSummary.financialProgressPercent.toFixed(1)}%
                </div>
                <div className="kpi-subtitle">
                  {financialSummary.completedTasksCount} tarefas concluídas
                </div>
              </div>
            </div>
          </div>

          {/* Barra de Progresso Financeiro Visual */}
          <div className="cost-progress-section">
            <div className="cost-progress-header">
              <span>Execução Orçamentária</span>
              <span>
                {formatCurrency(financialSummary.totalExecuted)} de {formatCurrency(financialSummary.totalPlanned)} ({financialSummary.financialProgressPercent.toFixed(1)}%)
              </span>
            </div>
            <div className="cost-progress-bar-track">
              <div 
                className="cost-progress-bar-fill" 
                style={{ width: `${Math.min(100, financialSummary.financialProgressPercent)}%` }}
              />
            </div>
          </div>

          {/* Filtros e Busca */}
          <div className="cost-filter-toolbar">
            <div className="cost-search-box">
              <Search size={15} className="cost-search-icon" />
              <input 
                type="text" 
                placeholder="Filtrar por nome ou EAP..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="office-input cost-search-input"
              />
              {searchTerm && (
                <button className="clear-search-btn" onClick={() => setSearchTerm('')}>
                  <X size={13} />
                </button>
              )}
            </div>

            <div className="cost-filter-buttons">
              <button 
                className={`cost-filter-btn ${filterType === 'all' ? 'active' : ''}`}
                onClick={() => setFilterType('all')}
              >
                Todas ({tasks.length})
              </button>
              <button 
                className={`cost-filter-btn ${filterType === 'withCost' ? 'active' : ''}`}
                onClick={() => setFilterType('withCost')}
              >
                Com Custo
              </button>
              <button 
                className={`cost-filter-btn ${filterType === 'zeroCost' ? 'active' : ''}`}
                onClick={() => setFilterType('zeroCost')}
              >
                Sem Custo (R$ 0)
              </button>
              <button 
                className={`cost-filter-btn ${filterType === 'completed' ? 'active' : ''}`}
                onClick={() => setFilterType('completed')}
              >
                Concluídas
              </button>
              <button 
                className={`cost-filter-btn ${filterType === 'inProgress' ? 'active' : ''}`}
                onClick={() => setFilterType('inProgress')}
              >
                Em Andamento
              </button>
            </div>
          </div>

          {/* Tabela Detalhada de Custos */}
          <div className="cost-table-container">
            <table className="cost-table">
              <thead>
                <tr>
                  <th style={{ width: '45px', textAlign: 'center' }}>ID</th>
                  <th style={{ width: '65px' }}>EAP</th>
                  <th>Nome da Tarefa</th>
                  <th style={{ width: '70px', textAlign: 'center' }}>Duração</th>
                  <th style={{ width: '100px', textAlign: 'center' }}>Progresso</th>
                  <th style={{ width: '130px', textAlign: 'right' }}>Custo Orçado</th>
                  <th style={{ width: '130px', textAlign: 'right' }}>Custo Realizado</th>
                  <th style={{ width: '130px', textAlign: 'right' }}>Saldo Restante</th>
                  <th style={{ width: '110px', textAlign: 'center' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredTasks.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="cost-empty-message">
                      <AlertCircle size={20} />
                      <span>Nenhuma tarefa encontrada com os filtros selecionados.</span>
                    </td>
                  </tr>
                ) : (
                  filteredTasks.map((t) => {
                    const idx = tasks.indexOf(t) + 1;
                    const planned = t.cost || 0;
                    const executed = planned * (t.progress / 100);
                    const balance = Math.max(0, planned - executed);
                    const isSummary = t.isSummary;

                    return (
                      <tr 
                        key={t.id} 
                        className={`cost-row ${isSummary ? 'summary-row' : ''} ${t.isMilestone ? 'milestone-row' : ''}`}
                      >
                        <td style={{ textAlign: 'center', color: '#64748b' }}>{idx}</td>
                        <td style={{ fontWeight: 600 }}>{t.wbsIndex}</td>
                        <td style={{ paddingLeft: `${(t.outlineLevel || 0) * 16 + 8}px` }}>
                          <span className={isSummary ? 'summary-task-name' : ''}>{t.name}</span>
                        </td>
                        <td style={{ textAlign: 'center' }}>{t.durationDays}d</td>
                        <td>
                          <div className="cost-mini-progress">
                            <div className="cost-mini-bar" style={{ width: `${t.progress}%` }} />
                            <span>{t.progress}%</span>
                          </div>
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: planned > 0 ? 600 : 400 }}>
                          {formatCurrency(planned)}
                        </td>
                        <td style={{ textAlign: 'right', color: executed > 0 ? '#1b5e20' : '#64748b' }}>
                          {formatCurrency(executed)}
                        </td>
                        <td style={{ textAlign: 'right', color: balance > 0 ? '#b71c1c' : '#64748b' }}>
                          {formatCurrency(balance)}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span className={`status-pill ${t.progress === 100 ? 'done' : t.progress > 0 ? 'running' : 'pending'}`}>
                            {t.progress === 100 ? 'Concluída' : t.progress > 0 ? 'Em curso' : 'Não iniciada'}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              <tfoot>
                <tr className="cost-total-row">
                  <td colSpan={5} style={{ textAlign: 'right', fontWeight: 'bold' }}>
                    TOTAL GERAL DO PROJETO:
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 'bold', color: '#0f172a' }}>
                    {formatCurrency(financialSummary.totalPlanned)}
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 'bold', color: '#1b5e20' }}>
                    {formatCurrency(financialSummary.totalExecuted)}
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 'bold', color: '#b71c1c' }}>
                    {formatCurrency(financialSummary.remainingBalance)}
                  </td>
                  <td style={{ textAlign: 'center', fontWeight: 'bold' }}>
                    {financialSummary.financialProgressPercent.toFixed(1)}%
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Rodapé do Modal */}
        <div className="modal-footer">
          <button className="btn-office primary" onClick={onClose}>
            Fechar Relatório
          </button>
        </div>
      </div>
    </div>
  );
};
