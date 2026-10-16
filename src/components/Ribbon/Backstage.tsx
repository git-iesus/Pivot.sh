import React from 'react';
import { 
  FileText, 
  FolderOpen, 
  Save, 
  Download, 
  Info, 
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Users,
  DollarSign
} from 'lucide-react';
import { ProjectMetadata, Task, Resource } from '../../types/project';

interface BackstageProps {
  isOpen: boolean;
  onClose: () => void;
  metadata: ProjectMetadata;
  tasks: Task[];
  resources: Resource[];
  onNewProject: () => void;
  onSaveProject: () => void;
  onExportXLSX: () => void;
  onExportCSV: () => void;
  onExportJSON: () => void;
  onImportJSON: () => void;
  onOpenProjectInfo: () => void;
}

// Formata data de YYYY-MM-DD para DD-MM-YYYY
function formatDateBR(dateStr?: string): string {
  if (!dateStr || dateStr === '—') return '—';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const [y, m, d] = parts;
    return `${d}-${m}-${y}`;
  }
  return dateStr;
}

export const Backstage: React.FC<BackstageProps> = ({
  isOpen,
  onClose,
  metadata,
  tasks,
  resources,
  onNewProject,
  onSaveProject,
  onExportXLSX,
  onExportCSV,
  onExportJSON,
  onImportJSON,
  onOpenProjectInfo
}) => {
  if (!isOpen) return null;

  const totalTasks = tasks.length;
  const completedTasks = tasks.filter(t => t.progress === 100).length;
  const criticalTasks = tasks.filter(t => t.isCritical).length;

  // Calcular data de término previsto (max endDate de todas as tarefas)
  const projectEndDate = tasks.length > 0
    ? tasks.reduce((max, t) => (t.endDate > max ? t.endDate : max), tasks[0].endDate)
    : '—';

  // Soma total de custos simples (tarefas não-resumo para evitar dupla contagem)
  const totalProjectCost = tasks
    .filter((t) => !t.isSummary)
    .reduce((sum, t) => sum + (t.cost || 0), 0);
  const tasksWithCost = tasks.filter((t) => !t.isSummary && (t.cost || 0) > 0).length;

  return (
    <div className="backstage-overlay">
      <div className="backstage-nav">
        <button className="backstage-back-btn" onClick={onClose} title="Voltar ao Projeto">
          <ArrowLeft size={20} />
          <span>Voltar</span>
        </button>

        <div className="backstage-menu-items">
          <button className="backstage-menu-item active">
            <Info size={18} />
            <span>Informações</span>
          </button>
          <button className="backstage-menu-item" onClick={onOpenProjectInfo}>
            <Calendar size={18} />
            <span>Propriedades do Projeto</span>
          </button>
          <button className="backstage-menu-item" onClick={onNewProject}>
            <FileText size={18} />
            <span>Novo</span>
          </button>
          <button className="backstage-menu-item" onClick={onImportJSON}>
            <FolderOpen size={18} />
            <span>Abrir (JSON)</span>
          </button>
          <button className="backstage-menu-item" onClick={onSaveProject}>
            <Save size={18} />
            <span>Salvar</span>
          </button>
          <button className="backstage-menu-item" onClick={onExportJSON}>
            <Download size={18} />
            <span>Exportar Backup (JSON)</span>
          </button>
          <button className="backstage-menu-item" onClick={onExportXLSX}>
            <Download size={18} />
            <span>Exportar XLSX</span>
          </button>
          <button className="backstage-menu-item" onClick={onExportCSV}>
            <Download size={18} />
            <span>Exportar CSV</span>
          </button>
        </div>
      </div>

      <div className="backstage-content">
        <div className="backstage-header">
          <h2>Informações sobre {metadata.title}</h2>
          <p className="subtitle">Gerenciado por {metadata.manager || 'Não definido'}</p>
        </div>

        <div className="backstage-cards-grid">
          <div className="backstage-card">
            <div className="card-header">
              <Calendar size={20} className="card-icon" />
              <h3>Datas &amp; Cronograma</h3>
            </div>
            <div className="card-body">
              <div className="info-row">
                <span className="label">Início do Projeto:</span>
                <span className="value">{formatDateBR(metadata.startDate)}</span>
              </div>
              <div className="info-row">
                <span className="label">Término Previsto:</span>
                <span className="value">{formatDateBR(projectEndDate)}</span>
              </div>
              <div className="info-row">
                <span className="label">Data de Status:</span>
                <span className="value">{formatDateBR(metadata.currentDate)}</span>
              </div>
              <div className="info-row">
                <span className="label">Calendário Base:</span>
                <span className="value">{metadata.calendar}</span>
              </div>
            </div>
          </div>

          <div className="backstage-card">
            <div className="card-header">
              <CheckCircle2 size={20} className="card-icon" />
              <h3>Status das Tarefas</h3>
            </div>
            <div className="card-body">
              <div className="info-row">
                <span className="label">Total de Tarefas:</span>
                <span className="value">{totalTasks}</span>
              </div>
              <div className="info-row">
                <span className="label">Tarefas Concluídas:</span>
                <span className="value">{completedTasks} ({totalTasks ? Math.round((completedTasks/totalTasks)*100) : 0}%)</span>
              </div>
              <div className="info-row">
                <span className="label">Tarefas no Caminho Crítico:</span>
                <span className="value critical-badge">{criticalTasks}</span>
              </div>
            </div>
          </div>

          <div className="backstage-card">
            <div className="card-header">
              <Users size={20} className="card-icon" />
              <h3>Equipe &amp; Recursos</h3>
            </div>
            <div className="card-body">
              <div className="info-row">
                <span className="label">Recursos Cadastrados:</span>
                <span className="value">{resources.length}</span>
              </div>
              <div className="info-row">
                <span className="label">Moeda Padrão:</span>
                <span className="value">{metadata.currency === 'BRL' ? 'R$ (Real Brasileiro)' : metadata.currency}</span>
              </div>
            </div>
          </div>

          <div className="backstage-card">
            <div className="card-header">
              <DollarSign size={20} className="card-icon" />
              <h3>Custos do Projeto</h3>
            </div>
            <div className="card-body">
              <div className="info-row">
                <span className="label">Custo Total Previsto:</span>
                <span className="value font-bold" style={{ color: '#166534', fontSize: '13.5px' }}>
                  {totalProjectCost.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </span>
              </div>
              <div className="info-row">
                <span className="label">Tarefas com Custo:</span>
                <span className="value">{tasksWithCost} de {totalTasks}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="backstage-actions-box">
          <h3>Exportar Projeto</h3>
          <p>Exporte seu projeto para planilha XLSX ou CSV para compartilhamento e análise.</p>
          <div className="actions-row">
            <button className="btn-office primary" onClick={onExportXLSX}>
              <Download size={16} /> Exportar como XLSX (Excel)
            </button>
            <button className="btn-office" onClick={onExportCSV}>
              <Download size={16} /> Exportar como CSV
            </button>
            <button className="btn-office" onClick={onExportJSON}>
              <Save size={16} /> Baixar Cópia JSON
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
