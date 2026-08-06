import React, { useEffect, useMemo, useState } from 'react';
import { X, BadgeCheck, Loader2, AlertTriangle, CheckCircle2, ChevronLeft } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { WabaTemplate } from '../../lib/wabaApi';
import { buildTemplatePreview, parseTemplate, templateCategoryStyle } from './wabaUtils';

/** Acima disto o envio exige um segundo clique deliberado. */
const COST_CONFIRM_THRESHOLD = 100;

type BroadcastPreview = {
  total: number;
  enviaveis: number;
  opt_out: number;
  sem_assessor: number;
  categoria: string;
  preco_unitario: number;
  custo_estimado: number;
};

type Step = 'template' | 'confirm' | 'done';

type WabaSelectionBroadcastProps = {
  clienteIds: string[];
  onClose: () => void;
  /** Chamado no sucesso, antes do passo final — o pai limpa a seleção. */
  onSent: () => void;
};

const RPC_ERRORS: Record<string, string> = {
  WABA_TEMPLATE_NAO_APROVADO: 'Este template não está aprovado na Meta.',
  WABA_SEM_NUMERO_ATIVO: 'Nenhum número oficial configurado.',
  WABA_NOT_AUTHENTICATED: 'Sessão expirada. Entre novamente.',
};

function rpcErrorMessage(error: { message?: string } | null, fallback: string): string {
  const code = Object.keys(RPC_ERRORS).find(key => error?.message?.includes(key));
  return code ? RPC_ERRORS[code] : fallback;
}

function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * Disparo de template para os leads selecionados na Lista.
 *
 * Usa o mesmo backend da tela de campanhas; com `cliente_ids` no filtro, a
 * seleção manual vence os demais critérios. O envio é assíncrono (a engine
 * processa 25 por minuto) — a folha não espera terminar.
 */
export const WabaSelectionBroadcast: React.FC<WabaSelectionBroadcastProps> = ({
  clienteIds,
  onClose,
  onSent,
}) => {
  const [step, setStep] = useState<Step>('template');
  const [templates, setTemplates] = useState<WabaTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [selectedId, setSelectedId] = useState('');
  const [preview, setPreview] = useState<BroadcastPreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Primeiro clique acima do teto só "arma" o envio; o segundo dispara. */
  const [costArmed, setCostArmed] = useState(false);

  const selected = templates.find(t => t.id === selectedId) || null;

  /** Corpo com as variáveis preenchidas com valores de exemplo. */
  const examplePreview = useMemo(() => {
    if (!selected) return '';
    const shape = parseTemplate(selected);
    const values: Record<number, string> = {};
    shape.variableIndexes.forEach(i => { values[i] = `Exemplo ${i}`; });
    return buildTemplatePreview(shape, values);
  }, [selected]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('waba_templates')
        .select('*')
        .eq('status', 'APPROVED')
        .order('name');
      if (!cancelled) {
        setTemplates((data || []) as WabaTemplate[]);
        setLoadingTemplates(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !sending) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [sending, onClose]);

  const handlePickTemplate = async (template: WabaTemplate) => {
    setSelectedId(template.id);
    setStep('confirm');
    setLoadingPreview(true);
    setPreview(null);
    setError(null);
    setCostArmed(false);

    const { data, error: rpcError } = await supabase.rpc('waba_broadcast_preview', {
      p_filtro: { cliente_ids: clienteIds },
      p_template_id: template.id,
    });

    if (rpcError) {
      setError(rpcErrorMessage(rpcError, 'Não foi possível calcular a prévia do disparo.'));
    } else {
      setPreview(data as BroadcastPreview);
    }
    setLoadingPreview(false);
  };

  const handleSend = async () => {
    if (!selected || !preview || sending || preview.enviaveis === 0) return;

    // Custo alto: o primeiro clique arma, o segundo confirma.
    if (preview.custo_estimado > COST_CONFIRM_THRESHOLD && !costArmed) {
      setCostArmed(true);
      return;
    }

    setSending(true);
    setError(null);

    const { data: broadcastId, error: createError } = await supabase.rpc('waba_broadcast_criar', {
      p_template_id: selected.id,
      p_filtro: { cliente_ids: clienteIds },
      p_nome: `Seleção — ${clienteIds.length} clientes`,
      p_delay_ms: 1200,
      p_scheduled_at: null,
    });

    if (createError || !broadcastId) {
      setError(rpcErrorMessage(createError, 'Não foi possível criar o disparo.'));
      setSending(false);
      return;
    }

    // Nasce como rascunho; só envia ao virar 'executando'.
    const { error: startError } = await supabase
      .from('waba_broadcasts')
      .update({ status: 'executando' })
      .eq('id', broadcastId);

    if (startError) {
      setError('O disparo foi criado mas não pôde ser iniciado. Verifique em Disparos.');
      setSending(false);
      return;
    }

    onSent();
    setSending(false);
    setStep('done');
  };

  const sendDisabled = !preview || loadingPreview || sending || preview.enviaveis === 0;

  return (
    <div
      className="fixed inset-0 z-[70] bg-black/50 flex items-end md:items-center justify-center"
      onClick={e => { if (e.target === e.currentTarget && !sending) onClose(); }}
    >
      <div
        className="bg-white w-full md:max-w-md rounded-t-2xl md:rounded-2xl shadow-2xl flex flex-col max-h-[85dvh]"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {/* Cabeçalho */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 flex-shrink-0">
          {step === 'confirm' && (
            <button
              onClick={() => { setStep('template'); setCostArmed(false); setError(null); }}
              disabled={sending}
              aria-label="Voltar para a escolha de template"
              className="w-11 h-11 -ml-2 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-50"
            >
              <ChevronLeft size={20} />
            </button>
          )}
          <p className="flex-1 text-sm font-semibold text-slate-800 flex items-center gap-2">
            <BadgeCheck size={16} className="text-emerald-600" />
            {step === 'done' ? 'Disparo criado' : `Enviar template · ${clienteIds.length} selecionados`}
          </p>
          <button
            onClick={onClose}
            disabled={sending}
            aria-label="Fechar"
            className="w-11 h-11 -mr-2 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 disabled:opacity-50"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-4">
          {/* Passo 1 — escolha do template */}
          {step === 'template' && (
            loadingTemplates ? (
              <p className="text-sm text-slate-400 py-6 text-center">Carregando templates...</p>
            ) : templates.length === 0 ? (
              <p className="text-sm text-slate-500 py-6 text-center">
                Nenhum template aprovado disponível. Sincronize os templates no módulo WABA.
              </p>
            ) : (
              <div className="space-y-2">
                {templates.map(template => (
                  <button
                    key={template.id}
                    onClick={() => handlePickTemplate(template)}
                    className="w-full min-h-[44px] text-left border border-slate-200 rounded-xl px-3 py-2.5 hover:border-[#0C447C] hover:bg-slate-50 transition-colors"
                  >
                    <span className="flex items-center gap-2">
                      <span className="flex-1 text-sm font-medium text-slate-800 truncate">
                        {template.name}
                      </span>
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded border ${templateCategoryStyle(template.category)}`}>
                        {template.category}
                      </span>
                    </span>
                    {template.category?.toUpperCase() === 'MARKETING' && (
                      <span className="block text-[11px] text-amber-700 mt-1">
                        MARKETING custa cerca de 10x mais que UTILITY.
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )
          )}

          {/* Passo 2 — confirmação */}
          {step === 'confirm' && selected && (
            <div className="space-y-4">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">
                  {selected.name}
                </p>
                <p className="text-sm text-slate-700 whitespace-pre-wrap">{examplePreview}</p>
              </div>

              {loadingPreview ? (
                <p className="text-sm text-slate-400 flex items-center gap-2">
                  <Loader2 size={15} className="animate-spin" /> Calculando prévia...
                </p>
              ) : preview ? (
                <div className="space-y-2">
                  <p className="text-base font-semibold text-slate-800">
                    {preview.enviaveis} destinatário{preview.enviaveis === 1 ? '' : 's'}
                  </p>

                  {/* Atribuição é irreversível pela interface — destaque, não letra miúda. */}
                  {preview.sem_assessor > 0 && (
                    <p className="flex items-start gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
                      <span>
                        <strong>{preview.sem_assessor} sem assessor passarão a ser seus.</strong>{' '}
                        Isso não pode ser desfeito pela interface.
                      </span>
                    </p>
                  )}

                  {preview.opt_out > 0 && (
                    <p className="text-sm text-slate-500">
                      {preview.opt_out} pediram para não receber e serão pulados.
                    </p>
                  )}

                  <p className="text-sm text-slate-700">
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded border mr-2 ${templateCategoryStyle(preview.categoria)}`}>
                      {preview.categoria}
                    </span>
                    {formatBRL(preview.custo_estimado)}
                    <span className="text-slate-400"> · {formatBRL(preview.preco_unitario)} por mensagem</span>
                  </p>

                  {preview.enviaveis === 0 && (
                    <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                      Nenhum destinatário enviável — todos pediram para não receber ou não têm
                      telefone. O disparo não pode ser criado.
                    </p>
                  )}
                </div>
              ) : null}

              {error && (
                <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              <button
                onClick={handleSend}
                disabled={sendDisabled}
                className={`w-full min-h-[48px] flex items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  costArmed
                    ? 'bg-amber-500 text-white hover:bg-amber-600'
                    : 'bg-[#0C447C] text-white hover:bg-[#0a3a68]'
                }`}
              >
                {sending ? (
                  <>
                    <Loader2 size={17} className="animate-spin" /> Criando disparo...
                  </>
                ) : costArmed && preview ? (
                  `Confirmar custo de ${formatBRL(preview.custo_estimado)} — toque de novo`
                ) : (
                  'Criar e iniciar disparo'
                )}
              </button>
            </div>
          )}

          {/* Passo 3 — criado */}
          {step === 'done' && (
            <div className="py-6 text-center space-y-3">
              <CheckCircle2 size={40} className="mx-auto text-emerald-600" />
              <p className="text-sm text-slate-700">
                Disparo criado — o envio é feito aos poucos pela engine (cerca de 25 por minuto).
              </p>
              <p className="text-xs text-slate-500">Acompanhe o andamento em Disparos.</p>
              <button
                onClick={onClose}
                className="mt-2 px-6 min-h-[44px] rounded-xl bg-slate-100 text-slate-700 text-sm font-medium hover:bg-slate-200 transition-colors"
              >
                Fechar
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
