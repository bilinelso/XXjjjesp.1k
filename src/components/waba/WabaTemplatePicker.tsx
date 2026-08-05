import React, { useMemo, useState } from 'react';
import { Send, FileText } from 'lucide-react';
import type { WabaTemplate } from '../../lib/wabaApi';
import { buildTemplatePreview, parseTemplate, templateCategoryStyle } from './wabaUtils';

type WabaTemplatePickerProps = {
  templates: WabaTemplate[];
  sending: boolean;
  onSend: (template: WabaTemplate, variables: string[]) => void;
};

export const WabaTemplatePicker: React.FC<WabaTemplatePickerProps> = ({ templates, sending, onSend }) => {
  const [selectedId, setSelectedId] = useState<string>('');
  const [values, setValues] = useState<Record<number, string>>({});

  const selected = templates.find(t => t.id === selectedId) || null;
  const shape = useMemo(() => (selected ? parseTemplate(selected) : null), [selected]);

  const handleSelect = (id: string) => {
    setSelectedId(id);
    setValues({});
  };

  const missingVariable = !!shape && shape.variableIndexes.some(i => !values[i]?.trim());

  const handleSend = () => {
    if (!selected || !shape || missingVariable || sending) return;
    const variables = shape.variableIndexes.map(i => values[i].trim());
    onSend(selected, variables);
    setSelectedId('');
    setValues({});
  };

  if (templates.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        Nenhum template aprovado disponível. Os templates são criados e aprovados na Meta e sincronizados automaticamente.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
          Template aprovado
        </label>
        <select
          value={selectedId}
          onChange={e => handleSelect(e.target.value)}
          // text-base no mobile: abaixo de 16px o iOS dá zoom ao focar.
          className="w-full border border-slate-200 rounded-lg px-3 py-2 min-h-[44px] text-base md:text-sm bg-white"
        >
          <option value="">Selecione um template...</option>
          {templates.map(t => (
            <option key={t.id} value={t.id}>
              {t.name} · {t.category} · {t.language}
            </option>
          ))}
        </select>
      </div>

      {selected && shape && (
        <>
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded border ${templateCategoryStyle(selected.category)}`}>
              {selected.category}
            </span>
            {selected.category?.toUpperCase() === 'MARKETING' && (
              <span className="text-[11px] text-amber-700">
                Categoria MARKETING custa cerca de 10x mais que UTILITY.
              </span>
            )}
          </div>

          {shape.variableIndexes.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {shape.variableIndexes.map(index => (
                <div key={index}>
                  <label className="block text-[11px] text-slate-500 mb-1">{`Variável {{${index}}}`}</label>
                  <input
                    type="text"
                    value={values[index] || ''}
                    onChange={e => setValues(prev => ({ ...prev, [index]: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-1.5 min-h-[44px] text-base md:text-sm"
                    placeholder={`Valor para {{${index}}}`}
                  />
                </div>
              ))}
            </div>
          )}

          <div className="bg-white border border-slate-200 rounded-lg p-3">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1 flex items-center gap-1">
              <FileText size={12} /> Preview
            </p>
            <p className="text-sm text-slate-700 whitespace-pre-wrap">
              {buildTemplatePreview(shape, values)}
            </p>
          </div>

          <button
            onClick={handleSend}
            disabled={sending || missingVariable}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 min-h-[44px] bg-[#0C447C] text-white rounded-lg text-sm font-medium hover:bg-[#0a3a68] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send size={15} />
            {sending ? 'Enviando...' : 'Enviar template'}
          </button>
          {missingVariable && (
            <p className="text-[11px] text-slate-500 text-center">Preencha todas as variáveis para enviar.</p>
          )}
        </>
      )}
    </div>
  );
};
