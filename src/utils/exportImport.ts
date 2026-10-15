import * as XLSX from 'xlsx';
import { Task, Resource, ProjectMetadata } from '../types/project';

/**
 * Utilitários para exportar projetos nos formatos XLSX, CSV e TXT.
 */

// --- Colunas padrão para exportação ---
const HEADERS = [
  'ID',
  'EAP (WBS)',
  'Nome da Tarefa',
  'Duração (dias)',
  'Início',
  'Término',
  'Predecessoras',
  'Recursos',
  'Custo (R$)',
  '% Concluída',
  'Tipo',
  'Caminho Crítico',
];

function getTaskRows(tasks: Task[]): (string | number)[][] {
  return tasks.map((t) => [
    String(tasks.indexOf(t) + 1),
    t.wbsIndex,
    t.name,
    String(t.durationDays),
    t.startDate,
    t.endDate,
    t.predecessorText || '',
    t.resourceNames.join('; '),
    t.cost || 0,
    `${t.progress}%`,
    t.isMilestone ? 'Marco' : t.isSummary ? 'Resumo' : 'Tarefa',
    t.isCritical ? 'Sim' : 'Não',
  ]);
}

export function exportToXLSX(tasks: Task[], _resources: Resource[], metadata: ProjectMetadata): void {
  const wsData: (string | number)[][] = [HEADERS, ...getTaskRows(tasks)];
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Ajustar largura das colunas
  ws['!cols'] = [
    { wch: 5 },  // ID
    { wch: 10 }, // EAP
    { wch: 45 }, // Nome
    { wch: 14 }, // Duração
    { wch: 12 }, // Início
    { wch: 12 }, // Término
    { wch: 14 }, // Predecessoras
    { wch: 30 }, // Recursos
    { wch: 14 }, // Custo
    { wch: 12 }, // % Concluída
    { wch: 10 }, // Tipo
    { wch: 14 }, // Caminho Crítico
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Tarefas');

  // Aba de informações do projeto
  const infoData = [
    ['Título do Projeto', metadata.title],
    ['Gerente', metadata.manager],
    ['Data de Início', metadata.startDate],
    ['Data de Status', metadata.currentDate],
    ['Calendário', metadata.calendar],
    ['Moeda', metadata.currency],
  ];
  const wsInfo = XLSX.utils.aoa_to_sheet(infoData);
  wsInfo['!cols'] = [{ wch: 20 }, { wch: 35 }];
  XLSX.utils.book_append_sheet(wb, wsInfo, 'Informações do Projeto');

  const filename = `${metadata.title || 'projeto'}.xlsx`;
  XLSX.writeFile(wb, filename);
}

export function exportToCSV(tasks: Task[], metadata: ProjectMetadata): void {
  const rows = [HEADERS, ...getTaskRows(tasks)];
  const csvContent = rows.map((row) =>
    row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')
  ).join('\r\n');

  // BOM UTF-8 para compatibilidade com Excel em pt-BR
  const bom = '\uFEFF';
  const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${metadata.title || 'projeto'}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function downloadFile(filename: string, content: string, contentType: string) {
  const blob = new Blob([content], { type: contentType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
