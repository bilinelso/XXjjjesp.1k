import React, { useEffect, useState } from 'react';
import {
  UserPlus, Video, QrCode, ShoppingCart, RotateCcw, CheckCircle, Phone, Calendar, Wallet, Circle,
  type LucideIcon,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

/** Linha devolvida pela RPC `lead_trilha` (já ordenada por `quando`, mais antigo primeiro). */
interface TrilhaItem {
  quando: string;
  tipo: string;
  titulo: string;
  detalhe: string | null;
}

const TIPO_ESTILO: Record<string, { icon: LucideIcon; cor: string }> = {
  cadastro: { icon: UserPlus, cor: 'bg-blue-100 text-blue-600' },
  webinar: { icon: Video, cor: 'bg-purple-100 text-purple-600' },
  pix: { icon: QrCode, cor: 'bg-teal-100 text-teal-600' },
  carrinho: { icon: ShoppingCart, cor: 'bg-amber-100 text-amber-600' },
  recuperacao: { icon: RotateCcw, cor: 'bg-orange-100 text-orange-600' },
  compra: { icon: CheckCircle, cor: 'bg-green-600 text-white ring-4 ring-green-100' },
  interacao: { icon: Phone, cor: 'bg-slate-100 text-slate-600' },
  agendamento: { icon: Calendar, cor: 'bg-sky-100 text-sky-600' },
  deposito: { icon: Wallet, cor: 'bg-emerald-100 text-emerald-700' },
};
const ESTILO_PADRAO = { icon: Circle, cor: 'bg-slate-100 text-slate-500' };

const SP_TZ = 'America/Sao_Paulo';
const anoSP = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: SP_TZ, year: 'numeric' }).format(d);

/** dd/MM HH:mm em São Paulo; inclui o ano só quando difere do ano atual. */
function formatarQuando(iso: string): string {
  const d = new Date(iso);
  const comAno = anoSP(d) !== anoSP(new Date());
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: SP_TZ,
    day: '2-digit',
    month: '2-digit',
    ...(comAno ? { year: 'numeric' } : {}),
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d).replace(',', '');
}

type LeadTrilhaProps = {
  telefone: string;
  /** Chamado quando a RPC recusa por `sem_permissao` — o componente não renderiza nada. */
  onSemPermissao?: () => void;
};

/**
 * Trilha cronológica de um contato (cadastros, webinar, compras, interações...).
 *
 * Busca ao montar — monte apenas quando a seção/modal for aberta. Todas as regras
 * de permissão vivem na RPC (ex.: valor do depósito só para master); aqui só se
 * renderiza o que vier.
 */
export const LeadTrilha: React.FC<LeadTrilhaProps> = ({ telefone, onSemPermissao }) => {
  const [itens, setItens] = useState<TrilhaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [semPermissao, setSemPermissao] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErro(null);
    setSemPermissao(false);

    supabase.rpc('lead_trilha', { p_telefone: telefone }).then(({ data, error }) => {
      if (cancelled) return;
      if (error) {
        if (error.message?.includes('sem_permissao')) {
          setSemPermissao(true);
          onSemPermissao?.();
        } else {
          console.error('Erro ao carregar trilha do lead:', error);
          setErro('Não foi possível carregar a trilha.');
        }
        setItens([]);
      } else {
        setItens((data || []) as TrilhaItem[]);
      }
      setLoading(false);
    });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [telefone]);

  if (semPermissao) return null;

  if (loading) return <p className="text-gray-500 text-sm">Carregando trilha...</p>;

  if (erro) return <p className="text-red-600 text-sm">{erro}</p>;

  if (itens.length === 0) {
    return <p className="text-gray-500 text-sm">Nenhum registro encontrado para este telefone</p>;
  }

  return (
    <ol className="relative">
      {itens.map((item, i) => {
        const { icon: Icon, cor } = TIPO_ESTILO[item.tipo] ?? ESTILO_PADRAO;
        const destaque = item.tipo === 'compra';
        const ultimo = i === itens.length - 1;
        return (
          <li key={`${item.quando}-${item.tipo}-${i}`} className="relative flex gap-3 pb-4 last:pb-0">
            {!ultimo && (
              <span className="absolute left-4 top-8 -bottom-0 w-px -translate-x-1/2 bg-slate-200" aria-hidden />
            )}
            <span className={`relative z-10 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${cor}`}>
              <Icon size={16} />
            </span>
            <div className="min-w-0 flex-1 pt-1">
              <p className="text-xs text-slate-500">{formatarQuando(item.quando)}</p>
              <p className={`text-sm font-semibold ${destaque ? 'text-green-700' : 'text-slate-800'}`}>
                {item.titulo}
              </p>
              {item.detalhe != null && (
                <p className="text-sm text-slate-600 whitespace-pre-wrap break-words">{item.detalhe}</p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
};
