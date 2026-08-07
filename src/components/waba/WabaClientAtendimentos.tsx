import React, { useEffect, useState } from 'react';
import { Headset, ChevronRight } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { atendimentoMotivoLabel, type WabaAtendimento } from '../../lib/wabaApi';
import { formatMessageTime } from './wabaUtils';

type WabaClientAtendimentosProps = {
  clienteId: string;
  /** Abre a conversa WABA do atendimento — mesmo caminho do menu do telefone. */
  onOpenChat?: (chatId: string) => void;
};

/**
 * Ciclos de atendimento do cliente pelo WhatsApp oficial, do mais recente ao
 * mais antigo.
 *
 * Como no restante do módulo, a RLS decide o que aparece: o assessor vê apenas
 * os próprios atendimentos. Sem nenhum, a seção não é renderizada.
 */
export const WabaClientAtendimentos: React.FC<WabaClientAtendimentosProps> = ({
  clienteId,
  onOpenChat,
}) => {
  const [atendimentos, setAtendimentos] = useState<WabaAtendimento[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    supabase
      .from('waba_atendimentos')
      .select('*')
      .eq('cliente_id', clienteId)
      .order('aberto_em', { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (!error) setAtendimentos((data || []) as WabaAtendimento[]);
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [clienteId]);

  // Sem atendimentos (ou ainda carregando) a seção não ocupa espaço na ficha.
  if (loading || atendimentos.length === 0) return null;

  return (
    <div className="mb-6">
      <h3 className="font-bold mb-3 flex items-center gap-2">
        <Headset size={20} className="text-[#0C447C]" />
        Atendimentos (WABA)
      </h3>

      <div className="space-y-2">
        {atendimentos.map(atendimento => {
          const emAndamento = !atendimento.fechado_em;
          const clickable = !!onOpenChat;

          const content = (
            <>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-700">
                  Aberto em {formatMessageTime(atendimento.aberto_em)}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {emAndamento
                    ? 'Em andamento'
                    : `${atendimentoMotivoLabel(atendimento.fechado_motivo)} · ${formatMessageTime(atendimento.fechado_em)}`}
                </p>
              </div>
              {emAndamento && (
                <span className="flex-shrink-0 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[11px] font-semibold">
                  Em andamento
                </span>
              )}
              {clickable && <ChevronRight size={16} className="text-slate-400 flex-shrink-0" />}
            </>
          );

          const boxClass = `w-full flex items-center gap-3 text-left px-3 py-2.5 rounded-lg border ${
            emAndamento ? 'border-emerald-300 bg-emerald-50/50' : 'border-slate-200 bg-white'
          }`;

          return clickable ? (
            <button
              key={atendimento.id}
              onClick={() => onOpenChat!(atendimento.chat_id)}
              className={`${boxClass} min-h-[44px] hover:bg-slate-50 transition-colors`}
            >
              {content}
            </button>
          ) : (
            <div key={atendimento.id} className={boxClass}>
              {content}
            </div>
          );
        })}
      </div>
    </div>
  );
};
