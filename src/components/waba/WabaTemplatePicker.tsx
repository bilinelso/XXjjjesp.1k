import React, { useMemo, useRef, useState } from 'react';
import { Send, FileText } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { WabaTemplate } from '../../lib/wabaApi';
import { buildTemplatePreview, parseTemplate, templateCategoryStyle } from './wabaUtils';

type WabaTemplatePickerProps = {
  templates: WabaTemplate[];
  sending: boolean;
  onSend: (template: WabaTemplate, variables: string[]) => void;
  /** Substitui o texto padrão quando não há template aprovado — o que dizer
   *  depende de o usuário poder sincronizar ou não. */
  emptyState?: React.ReactNode;
  /** Nome do cliente da conversa — resolve `cliente_primeiro_nome`. */
  contactName?: string | null;
  /** Nome do assessor logado — resolve `assessor_nome`. */
  assessorName?: string | null;
};

/** Linha de `waba_template_vars` — o mapeamento que o master configurou. */
type TemplateVarMapping = {
  component: string | null;
  position: number;
  source: string | null;
  fixed_value: string | null;
  label: string | null;
};

export const WabaTemplatePicker: React.FC<WabaTemplatePickerProps> = ({
  templates,
  sending,
  onSend,
  emptyState,
  contactName,
  assessorName,
}) => {
  const [selectedId, setSelectedId] = useState<string>('');
  const [values, setValues] = useState<Record<number, string>>({});
  /** Rótulos vindos do mapeamento, por posição — substituem `Variável {{n}}`. */
  const [varLabels, setVarLabels] = useState<Record<number, string>>({});
  const [loadingVars, setLoadingVars] = useState(false);
  /** Última seleção pedida — descarta resposta de uma seleção já abandonada. */
  const selectionRef = useRef<string>('');

  const selected = templates.find(t => t.id === selectedId) || null;
  const shape = useMemo(() => (selected ? parseTemplate(selected) : null), [selected]);

  /**
   * Aplica o mapeamento do master ao template escolhido.
   *
   * O auto-preenchimento é sugestão: os campos continuam editáveis, e variável
   * sem mapeamento (ou cujo dado não existe nesta conversa) fica vazia para o
   * assessor completar à mão.
   */
  const handleSelect = async (id: string) => {
    selectionRef.current = id;
    setSelectedId(id);
    setValues({});
    setVarLabels({});
    if (!id) {
      setLoadingVars(false);
      return;
    }

    setLoadingVars(true);
    const { data } = await supabase
      .from('waba_template_vars')
      .select('component, position, source, fixed_value, label')
      .eq('template_id', id);

    // Trocar de template no meio da query não pode deixar o resultado antigo
    // sobrescrever a seleção nova.
    if (selectionRef.current !== id) return;

    const autoValues: Record<number, string> = {};
    const labels: Record<number, string> = {};

    for (const mapping of (data || []) as TemplateVarMapping[]) {
      // `parseTemplate` funde os índices de HEADER/BODY/FOOTER num espaço só,
      // então em caso de colisão de posição o BODY (o caso real) prevalece.
      const isBody = mapping.component?.toUpperCase() === 'BODY';
      if (labels[mapping.position] !== undefined && !isBody) continue;

      if (mapping.label) labels[mapping.position] = mapping.label;

      if (mapping.fixed_value) {
        autoValues[mapping.position] = mapping.fixed_value;
      } else if (mapping.source === 'cliente_primeiro_nome' && contactName) {
        autoValues[mapping.position] = contactName.split(' ')[0];
      } else if (mapping.source === 'assessor_nome' && assessorName) {
        autoValues[mapping.position] = assessorName;
      }
    }

    setValues(autoValues);
    setVarLabels(labels);
    setLoadingVars(false);
  };

  const missingVariable = !!shape && shape.variableIndexes.some(i => !values[i]?.trim());

  const handleSend = () => {
    if (!selected || !shape || missingVariable || sending) return;
    const variables = shape.variableIndexes.map(i => values[i].trim());
    onSend(selected, variables);
    selectionRef.current = '';
    setSelectedId('');
    setValues({});
    setVarLabels({});
  };

  if (templates.length === 0) {
    return (
      <>
        {emptyState ?? (
          <p className="text-sm text-slate-500">
            Nenhum template aprovado disponível. Os templates são criados e aprovados na Meta
            e precisam ser sincronizados no CRM.
          </p>
        )}
      </>
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
          onChange={e => { void handleSelect(e.target.value); }}
          disabled={loadingVars}
          // text-base no mobile: abaixo de 16px o iOS dá zoom ao focar.
          className="w-full border border-slate-200 rounded-lg px-3 py-2 min-h-[44px] text-base md:text-sm bg-white disabled:opacity-60"
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
                  <label className="block text-[11px] text-slate-500 mb-1">
                    {varLabels[index] ?? `Variável {{${index}}}`}
                  </label>
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
