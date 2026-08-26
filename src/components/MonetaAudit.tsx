import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { LoadingSpinner } from './LoadingSpinner';
import { CheckCircle, XCircle, ChevronRight, ChevronDown, ArrowRight, Phone } from 'lucide-react';

interface MonetaPendingMatch {
  moneta_id: string;
  nome_moneta: string;
  valor_moneta: number | null;
  cliente_id: string;
  cliente_nome: string;
  cliente_telefone: string | null;
  cliente_valor_atual: number | null;
  cliente_status: string | null;
  cliente_assessor: string | null;
  match_type: string;
  match_score: number | null;
  synced_at: string;
}

const MATCH_TYPE_LABEL: Record<string, string> = {
  subset: 'nome parcial',
  suggestion: 'similaridade',
};

function matchKey(item: MonetaPendingMatch) {
  return `${item.moneta_id}::${item.cliente_id}`;
}

function formatMoney(value: number | null) {
  if (value == null) return '—';
  return `$${value.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}`;
}

interface MonetaCardProps {
  item: MonetaPendingMatch;
  expanded: boolean;
  onToggleExpand: () => void;
  notes: string;
  onNotesChange: (notes: string) => void;
  applyValue: boolean;
  onApplyValueChange: (apply: boolean) => void;
  onLink: () => void;
  onIgnore: () => void;
  processing: boolean;
}

function MonetaCard({
  item,
  expanded,
  onToggleExpand,
  notes,
  onNotesChange,
  applyValue,
  onApplyValueChange,
  onLink,
  onIgnore,
  processing,
}: MonetaCardProps) {
  const atual = item.cliente_valor_atual ?? 0;
  const moneta = item.valor_moneta ?? 0;
  const isDrop = item.valor_moneta != null && moneta < atual;
  const diff = atual - moneta;

  const score = item.match_score != null ? `${Math.round(item.match_score)}%` : null;
  const typeLabel = MATCH_TYPE_LABEL[item.match_type] || item.match_type;

  const scoreBadge = isDrop
    ? 'bg-orange-100 text-orange-800 border-orange-200'
    : item.match_type === 'subset'
    ? 'bg-blue-100 text-blue-800 border-blue-200'
    : 'bg-slate-100 text-slate-700 border-slate-200';

  const phoneDigits = (item.cliente_telefone || '').replace(/\D/g, '');

  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
      <div
        className="p-4 cursor-pointer hover:bg-slate-50 transition-colors select-none"
        onClick={onToggleExpand}
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-slate-900 capitalize truncate">{item.nome_moneta}</span>
              <span className="text-xs text-slate-400 font-mono">#{item.moneta_id}</span>
              <ArrowRight size={14} className="text-slate-400 flex-shrink-0" />
              <span className="text-slate-700 capitalize truncate">{item.cliente_nome}</span>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${scoreBadge}`}>
                {typeLabel}{score ? ` · ${score}` : ''}
              </span>
              <span className="text-slate-400">•</span>
              <span className="text-slate-600">
                {formatMoney(item.cliente_valor_atual)} no CRM
              </span>
              <ArrowRight size={12} className="text-slate-400" />
              <span className={isDrop ? 'text-red-600 font-semibold' : 'text-green-700 font-medium'}>
                {formatMoney(item.valor_moneta)} na Moneta
              </span>
              {isDrop && (
                <span className="text-red-600 text-xs font-medium">
                  (queda de {formatMoney(diff)})
                </span>
              )}
            </div>
          </div>
          <div className="flex-shrink-0 text-slate-400">
            {expanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
          </div>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-slate-200 p-4 space-y-4 bg-slate-50">
          {/* Dados do candidato no CRM */}
          <div className="bg-white rounded-lg border border-slate-200 p-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
              Candidato no CRM
            </p>
            <div className="space-y-1.5 text-sm text-slate-700">
              <p className="capitalize font-medium text-slate-900">{item.cliente_nome}</p>
              {phoneDigits ? (
                <a
                  href={`whatsapp://send?phone=${phoneDigits}`}
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1.5 text-blue-600 hover:text-blue-700 hover:underline"
                >
                  <Phone size={13} />
                  {item.cliente_telefone}
                </a>
              ) : (
                <p className="text-slate-400">Sem telefone</p>
              )}
              <p className="text-slate-600">
                <span className="capitalize">{item.cliente_status || 'sem status'}</span>
                {' · '}
                {item.cliente_assessor || 'sem assessor'}
              </p>
              <p className="text-xs text-slate-400">
                Sync de {new Date(item.synced_at).toLocaleDateString('pt-BR')}
              </p>
            </div>
          </div>

          {/* Notas */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Notas <span className="text-slate-400 font-normal">(opcional)</span>
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => onNotesChange(e.target.value)}
              placeholder="Ex: Confirmado com o assessor"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
              disabled={processing}
            />
          </div>

          {/* Atualizar valor */}
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={applyValue}
              onChange={(e) => onApplyValueChange(e.target.checked)}
              disabled={processing}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-slate-700">
              Atualizar também o valor do depósito
              {item.valor_moneta != null && (
                <span className="text-slate-400"> ({formatMoney(item.valor_moneta)})</span>
              )}
            </span>
          </label>

          {/* Ações */}
          <div className="flex gap-3">
            <button
              onClick={(e) => { e.stopPropagation(); onLink(); }}
              disabled={processing}
              className="flex-1 flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2.5 rounded-lg font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {processing ? (
                <><LoadingSpinner size="sm" color="white" /> Processando...</>
              ) : (
                <><CheckCircle size={16} /> Vincular</>
              )}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onIgnore(); }}
              disabled={processing}
              className="flex-1 flex items-center justify-center gap-2 bg-slate-500 hover:bg-slate-600 text-white px-4 py-2.5 rounded-lg font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {processing ? (
                <><LoadingSpinner size="sm" color="white" /> Processando...</>
              ) : (
                <><XCircle size={16} /> Não é este</>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

interface MonetaAuditProps {
  onCountChange?: (count: number) => void;
}

export function MonetaAudit({ onCountChange }: MonetaAuditProps) {
  const [items, setItems] = useState<MonetaPendingMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [actionNotes, setActionNotes] = useState<Record<string, string>>({});
  const [applyValues, setApplyValues] = useState<Record<string, boolean>>({});
  const [processingItem, setProcessingItem] = useState<string | null>(null);

  useEffect(() => {
    async function loadPending() {
      setLoading(true);
      const { data, error } = await supabase
        .from('moneta_revisao_pendente')
        .select('*')
        .order('valor_moneta', { ascending: false });

      if (error) {
        console.error('Erro ao carregar pendências da Moneta:', error);
      } else {
        setItems(data || []);
        onCountChange?.((data || []).length);
      }
      setLoading(false);
    }

    loadPending();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function removeItem(item: MonetaPendingMatch) {
    const key = matchKey(item);
    setItems(prev => {
      const next = prev.filter(i => matchKey(i) !== key);
      onCountChange?.(next.length);
      return next;
    });
    setActionNotes(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setApplyValues(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    if (expandedItem === key) setExpandedItem(null);
  }

  async function handleLink(item: MonetaPendingMatch) {
    const key = matchKey(item);
    const notes = actionNotes[key] || '';
    const aplicarValor = applyValues[key] || false;
    setProcessingItem(key);

    const { data, error } = await supabase.rpc('moneta_vincular_cliente', {
      p_moneta_id: item.moneta_id,
      p_cliente_id: item.cliente_id,
      p_valor: aplicarValor ? item.valor_moneta : null,
      p_notas: notes || null,
    });

    setProcessingItem(null);

    if (error) {
      alert(`Erro ao vincular: ${error.message}`);
    } else if (data?.success) {
      removeItem(item);
    } else {
      alert(data?.message || 'Não foi possível vincular o investidor.');
    }
  }

  async function handleIgnore(item: MonetaPendingMatch) {
    const key = matchKey(item);
    const notes = actionNotes[key] || '';
    setProcessingItem(key);

    const { data, error } = await supabase.rpc('moneta_ignorar_match', {
      p_moneta_id: item.moneta_id,
      p_cliente_id: item.cliente_id,
      p_nome_moneta: item.nome_moneta,
      p_notas: notes || null,
    });

    setProcessingItem(null);

    if (error) {
      alert(`Erro ao ignorar: ${error.message}`);
    } else if (data?.success) {
      removeItem(item);
    } else {
      alert(data?.message || 'Não foi possível ignorar o match.');
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <LoadingSpinner />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg p-8 text-center">
        <CheckCircle className="mx-auto text-green-500 mb-3" size={36} />
        <p className="text-green-800 font-semibold">Nenhuma pendência da Moneta</p>
        <p className="text-green-600 text-sm mt-1">
          Rode uma sincronização pela extensão para gerar novas pendências.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.map(item => {
        const key = matchKey(item);
        return (
          <MonetaCard
            key={key}
            item={item}
            expanded={expandedItem === key}
            onToggleExpand={() => setExpandedItem(expandedItem === key ? null : key)}
            notes={actionNotes[key] || ''}
            onNotesChange={(notes) => setActionNotes(prev => ({ ...prev, [key]: notes }))}
            applyValue={applyValues[key] || false}
            onApplyValueChange={(apply) => setApplyValues(prev => ({ ...prev, [key]: apply }))}
            onLink={() => handleLink(item)}
            onIgnore={() => handleIgnore(item)}
            processing={processingItem === key}
          />
        );
      })}
    </div>
  );
}
