import React, { useState } from 'react';
import { Resource } from '../../types/project';
import { X, Plus, Trash2, Users } from 'lucide-react';

interface ResourceSheetModalProps {
  isOpen: boolean;
  onClose: () => void;
  resources: Resource[];
  onUpdateResources: (resources: Resource[]) => void;
}

export const ResourceSheetModal: React.FC<ResourceSheetModalProps> = ({
  isOpen,
  onClose,
  resources,
  onUpdateResources,
}) => {
  const [list, setList] = useState<Resource[]>(resources);

  if (!isOpen) return null;

  const handleAdd = () => {
    const newRes: Resource = {
      id: `res_${Date.now()}`,
      name: 'Novo Recurso',
      type: 'Trabalho',
      initials: 'NR',
      group: 'Geral',
      standardRate: 100,
      overtimeRate: 150,
      maxUnits: 100,
    };
    const updated = [...list, newRes];
    setList(updated);
    onUpdateResources(updated);
  };

  const handleDelete = (id: string) => {
    const updated = list.filter((r) => r.id !== id);
    setList(updated);
    onUpdateResources(updated);
  };

  const handleUpdate = (id: string, field: keyof Resource, val: any) => {
    const updated = list.map((r) => (r.id === id ? { ...r, [field]: val } : r));
    setList(updated);
    onUpdateResources(updated);
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-window resource-modal">
        <div className="modal-titlebar">
          <div className="title-with-icon">
            <Users size={18} />
            <span>Planilha de Recursos - Atribuição e Custos</span>
          </div>
          <button className="close-btn" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="modal-toolbar">
          <button className="btn-office" onClick={handleAdd}>
            <Plus size={14} /> Adicionar Recurso
          </button>
        </div>

        <div className="modal-table-container">
          <table className="office-table">
            <thead>
              <tr>
                <th>Nome do Recurso</th>
                <th>Tipo</th>
                <th>Iniciais</th>
                <th>Grupo</th>
                <th>Taxa Padrão (R$/h)</th>
                <th>Taxa Hora Extra (R$/h)</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {list.map((res) => (
                <tr key={res.id}>
                  <td>
                    <input
                      type="text"
                      className="table-input"
                      value={res.name}
                      onChange={(e) => handleUpdate(res.id, 'name', e.target.value)}
                    />
                  </td>
                  <td>
                    <select
                      className="table-select"
                      value={res.type}
                      onChange={(e) => handleUpdate(res.id, 'type', e.target.value)}
                    >
                      <option value="Trabalho">Trabalho</option>
                      <option value="Material">Material</option>
                      <option value="Custo">Custo</option>
                    </select>
                  </td>
                  <td>
                    <input
                      type="text"
                      className="table-input small"
                      value={res.initials}
                      onChange={(e) => handleUpdate(res.id, 'initials', e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      className="table-input"
                      value={res.group}
                      onChange={(e) => handleUpdate(res.id, 'group', e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      className="table-input number"
                      value={res.standardRate}
                      onChange={(e) => handleUpdate(res.id, 'standardRate', parseFloat(e.target.value) || 0)}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      className="table-input number"
                      value={res.overtimeRate}
                      onChange={(e) => handleUpdate(res.id, 'overtimeRate', parseFloat(e.target.value) || 0)}
                    />
                  </td>
                  <td className="text-center">
                    <button className="icon-action-btn danger" onClick={() => handleDelete(res.id)} title="Excluir">
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="modal-footer">
          <button className="btn-office primary" onClick={onClose}>
            Concluir
          </button>
        </div>
      </div>
    </div>
  );
};
