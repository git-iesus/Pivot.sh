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
  Users
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
  onExportTXT: () => void;
  onExportJSON: () => void;
  onImportJSON: () => void;
  onOpenProjectInfo: () => void;
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
  onExportTXT,
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
          <button className="backstage-menu-item" onClick={onExportXLSX}>
            <Download size={18} />
            <span>Exportar XLSX</span>
          </button>
          <button className="backstage-menu-item" onClick={onExportCSV}>
            <Download size={18} />
            <span>Exportar CSV</span>
          </button>
          <button className="backstage-menu-item" onClick={onExportTXT}>
            <Download size={18} />
            <span>Exportar TXT</span>
          </button>
          <button className="backstage-menu-item" onClick={onExportJSON}>
            <Download size={18} />
            <span>Exportar Backup (JSON)</span>
          </button>
          <button className="backstage-menu-item" onClick={onOpenProjectInfo}>
            <Calendar size={18} />
            <span>Propriedades do Projeto</span>
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
                <span className="value">{metadata.startDate}</span>
              </div>
              <div className="info-row">
                <span className="label">Término Previsto:</span>
                <span className="value">{projectEndDate}</span>
              </div>
              <div className="info-row">
                <span className="label">Data de Status:</span>
                <span className="value">{metadata.currentDate}</span>
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
        </div>

        <div className="backstage-actions-box">
          <h3>Exportar Projeto</h3>
          <p>Exporte seu projeto para planilha, CSV ou relatório de texto para compartilhamento e análise.</p>
          <div className="actions-row">
            <button className="btn-office primary" onClick={onExportXLSX}>
              <Download size={16} /> Exportar como XLSX (Excel)
            </button>
            <button className="btn-office" onClick={onExportCSV}>
              <Download size={16} /> Exportar como CSV
            </button>
            <button className="btn-office" onClick={onExportTXT}>
              <Download size={16} /> Exportar como TXT
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
