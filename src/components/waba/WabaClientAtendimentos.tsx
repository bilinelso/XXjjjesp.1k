import React, { useEffect, useMemo, useState } from 'react';
import { Headset, ChevronRight, ChevronLeft, RotateCcw, User } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { atendimentoFechamentoLabel, type WabaAtendimentoDetalhe } from '../../lib/wabaApi';
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
  const [atendimentos, setAtendimentos] = useState<WabaAtendimentoDetalhe[]>([]);
  const [loading, setLoading] = useState(true);
  /** Um atendimento por página, igual ao "Registro de interações". */
  const [page, setPage] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setPage(0); // trocar de cliente sempre abre na primeira página

    // A view traz os nomes já resolvidos; as policies são as mesmas da tabela.
    supabase
      .from('waba_atendimentos_detalhe')
      .select('*')
      .eq('cliente_id', clienteId)
      .order('aberto_em', { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (!error) setAtendimentos((data || []) as WabaAtendimentoDetalhe[]);
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [clienteId]);

  /**
   * O atendimento em aberto vem sempre primeiro — é a informação mais
   * importante da seção e não pode cair para uma página do meio conforme o
   * histórico cresce. Os demais seguem do mais recente ao mais antigo.
   */
  const sorted = useMemo(() => {
    return [...atendimentos].sort((a, b) => {
      const abertoA = a.fechado_em ? 1 : 0;
      const abertoB = b.fechado_em ? 1 : 0;
      if (abertoA !== abertoB) return abertoA - abertoB;
      return new Date(b.aberto_em).getTime() - new Date(a.aberto_em).getTime();
    });
  }, [atendimentos]);

  /**
   * O nome do assessor só aparece quando o cliente passou por mais de um —
   * com um só, seria a mesma informação repetida em todas as linhas.
   */
  const variosAssessores = useMemo(() => {
    const nomes = new Set(atendimentos.map(a => a.assessor_user_id));
    return nomes.size > 1;
  }, [atendimentos]);

  // Sem atendimentos (ou ainda carregando) a seção não ocupa espaço na ficha.
  if (loading || sorted.length === 0) return null;

  const currentPage = Math.min(page, sorted.length - 1);
  const atendimento = sorted[currentPage];
  const emAndamento = !atendimento.fechado_em;
  const clickable = !!onOpenChat;
  const reaberturas = atendimento.reaberturas ?? 0;

  const content = (
    <>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-700">
          Aberto em {formatMessageTime(atendimento.aberto_em)}
        </p>
        <p className="text-xs text-slate-500 mt-0.5">
          {emAndamento
            ? 'Em andamento'
            : `${atendimentoFechamentoLabel(atendimento.fechado_motivo, atendimento.fechado_por_nome)} · ${formatMessageTime(atendimento.fechado_em)}`}
        </p>

        {variosAssessores && atendimento.assessor_nome && (
          <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
            <User size={12} className="flex-shrink-0" />
            Atendimento de {atendimento.assessor_nome}
          </p>
        )}
        {/* Sem reabertura, a linha fica exatamente como era. */}
        {reaberturas > 0 && (
          <p className="text-xs text-amber-700 mt-0.5 flex items-center gap-1">
            <RotateCcw size={12} className="flex-shrink-0" />
            Reaberto {reaberturas}{reaberturas === 1 ? ' vez' : ' vezes'} — o cliente voltou
            depois de finalizado
          </p>
        )}
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

  return (
    <div className="mb-6">
      <h3 className="font-bold mb-3 flex items-center gap-2">
        <Headset size={20} className="text-[#0C447C]" />
        Atendimentos (WABA)
      </h3>

      <div>
        {clickable ? (
          <button
            onClick={() => onOpenChat!(atendimento.chat_id)}
            className={`${boxClass} min-h-[44px] hover:bg-slate-50 transition-colors`}
          >
            {content}
          </button>
        ) : (
          <div className={boxClass}>{content}</div>
        )}

        {/* Navegação — mesmo componente e comportamento do "Registro de interações" */}
        {sorted.length > 1 && (
          <div className="flex items-center justify-between mt-2">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={currentPage === 0}
              className="flex items-center gap-1 px-2.5 py-1 text-xs text-slate-600 border border-slate-200 rounded hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={13} /> Mais recente
            </button>
            <span className="text-xs text-slate-400">
              {currentPage + 1} / {sorted.length}
            </span>
            <button
              onClick={() => setPage(p => Math.min(sorted.length - 1, p + 1))}
              disabled={currentPage === sorted.length - 1}
              className="flex items-center gap-1 px-2.5 py-1 text-xs text-slate-600 border border-slate-200 rounded hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Mais antigo <ChevronRight size={13} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
