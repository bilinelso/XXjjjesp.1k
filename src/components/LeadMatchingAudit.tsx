import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { LoadingSpinner } from './LoadingSpinner';
import { CheckCircle, XCircle, ChevronRight, ChevronDown, ShieldCheck } from 'lucide-react';

interface PotentialMatch {
  lead_id: string;
  lead_nome: string;
  lead_telefone: string;
  lead_tel_norm: string;
  lead_created_at: string;
  click_id: string | null;
  gclid: string | null;
  campanha: string | null;
  cliente_id: string;
  cliente_nome: string;
  cliente_telefone: string;
  cliente_tel_norm: string;
  cliente_created_at: string;
  cliente_status: string;
  assessor: string | null;
  valor_deposito: number | null;
  phone_distance: number;
  exact_name_match: boolean;
}

function highlightPhoneDifferences(phone1: string, phone2: string) {
  const arr1 = phone1.split('');
  const arr2 = phone2.split('');
  const maxLen = Math.max(arr1.length, arr2.length);

  const highlighted1: React.ReactNode[] = [];
  const highlighted2: React.ReactNode[] = [];

  for (let i = 0; i < maxLen; i++) {
    const char1 = arr1[i] || '';
    const char2 = arr2[i] || '';
    const isDifferent = char1 !== char2;

    highlighted1.push(
      <span key={i} className={isDifferent ? 'bg-red-200 text-red-900 font-bold rounded px-0.5' : ''}>
        {char1}
      </span>
    );
    highlighted2.push(
      <span key={i} className={isDifferent ? 'bg-red-200 text-red-900 font-bold rounded px-0.5' : ''}>
        {char2}
      </span>
    );
  }

  return { highlighted1, highlighted2 };
}

interface MatchCardProps {
  match: PotentialMatch;
  expanded: boolean;
  onToggleExpand: () => void;
  notes: string;
  onNotesChange: (notes: string) => void;
  onLink: () => void;
  onIgnore: () => void;
  processing: boolean;
}

function MatchCard({ match, expanded, onToggleExpand, notes, onNotesChange, onLink, onIgnore, processing }: MatchCardProps) {
  const { highlighted1, highlighted2 } = highlightPhoneDifferences(
    match.lead_tel_norm,
    match.cliente_tel_norm
  );

  const confidenceBadge =
    match.phone_distance === 1
      ? 'bg-green-100 text-green-800 border-green-200'
      : match.phone_distance === 2
      ? 'bg-yellow-100 text-yellow-800 border-yellow-200'
      : 'bg-orange-100 text-orange-800 border-orange-200';

  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
      <div
        className="p-4 cursor-pointer hover:bg-slate-50 transition-colors select-none"
        onClick={onToggleExpand}
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-slate-900 capitalize truncate">{match.cliente_nome}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${confidenceBadge}`}>
                {match.phone_distance} dígito{match.phone_distance > 1 ? 's' : ''} diferente{match.phone_distance > 1 ? 's' : ''}
              </span>
              <span className="text-slate-400">•</span>
              <span className="text-slate-600 capitalize">{match.cliente_status}</span>
              {match.assessor && (
                <>
                  <span className="text-slate-400">•</span>
                  <span className="text-slate-600">{match.assessor}</span>
                </>
              )}
              {match.valor_deposito != null && match.valor_deposito >= 1 && (
                <>
                  <span className="text-slate-400">•</span>
                  <span className="text-green-700 font-medium">
                    ${match.valor_deposito.toLocaleString('pt-BR')}
                  </span>
                </>
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
          {/* Phone comparison */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white rounded-lg border border-slate-200 p-3">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Lead (Formulário)</p>
              <p className="font-mono text-sm text-slate-800">{highlighted1}</p>
              <p className="text-xs text-slate-500 mt-1.5">
                {new Date(match.lead_created_at).toLocaleDateString('pt-BR')}
              </p>
            </div>
            <div className="bg-white rounded-lg border border-slate-200 p-3">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Cliente (CRM)</p>
              <p className="font-mono text-sm text-slate-800">{highlighted2}</p>
              <p className="text-xs text-slate-500 mt-1.5">
                {new Date(match.cliente_created_at).toLocaleDateString('pt-BR')}
              </p>
            </div>
          </div>

          {/* Tracking data */}
          {(match.click_id || match.gclid || match.campanha) && (
            <div className="bg-white rounded-lg border border-slate-200 p-3">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Dados de Tracking</p>
              <div className="space-y-1 text-xs text-slate-700">
                {match.campanha && (
                  <p>Campanha: <code className="bg-slate-100 px-1 rounded">{match.campanha}</code></p>
                )}
                {match.click_id && (
                  <p>Click ID: <code className="bg-slate-100 px-1 rounded">{match.click_id}</code></p>
                )}
                {match.gclid && (
                  <p>GCLID: <code className="bg-slate-100 px-1 rounded">{match.gclid.length > 40 ? match.gclid.substring(0, 40) + '…' : match.gclid}</code></p>
                )}
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Notas <span className="text-slate-400 font-normal">(opcional)</span>
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => onNotesChange(e.target.value)}
              placeholder="Ex: Telefone confirmado com o cliente"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
              disabled={processing}
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={(e) => { e.stopPropagation(); onLink(); }}
              disabled={processing}
              className="flex-1 flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2.5 rounded-lg font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {processing ? (
                <><LoadingSpinner size="sm" color="white" /> Processando...</>
              ) : (
                <><CheckCircle size={16} /> Vincular Lead</>
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

export function LeadMatchingAudit() {
  const [matches, setMatches] = useState<PotentialMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedMatch, setExpandedMatch] = useState<string | null>(null);
  const [actionNotes, setActionNotes] = useState<Record<string, string>>({});
  const [processingMatch, setProcessingMatch] = useState<string | null>(null);

  useEffect(() => {
    async function loadMatches() {
      setLoading(true);
      const { data, error } = await supabase
        .from('potential_lead_matches')
        .select('*')
        .order('phone_distance', { ascending: true });

      if (error) {
        console.error('Erro ao carregar matches:', error);
      } else {
        setMatches(data || []);
      }
      setLoading(false);
    }

    loadMatches();
  }, []);

  async function handleLinkMatch(match: PotentialMatch) {
    const notes = actionNotes[match.cliente_id] || '';
    setProcessingMatch(match.cliente_id);

    const { data, error } = await supabase.rpc('link_lead_to_cliente', {
      p_lead_id: match.lead_id,
      p_cliente_id: match.cliente_id,
      p_notes: notes || null,
    });

    setProcessingMatch(null);

    if (error) {
      alert(`Erro ao vincular: ${error.message}`);
    } else if (data?.success) {
      setMatches(prev => prev.filter(m => m.cliente_id !== match.cliente_id));
      setActionNotes(prev => {
        const next = { ...prev };
        delete next[match.cliente_id];
        return next;
      });
      if (expandedMatch === match.cliente_id) setExpandedMatch(null);
    } else {
      alert(data?.message || 'Não foi possível vincular o lead.');
    }
  }

  async function handleIgnoreMatch(match: PotentialMatch) {
    const notes = actionNotes[match.cliente_id] || '';
    setProcessingMatch(match.cliente_id);

    const { data, error } = await supabase.rpc('ignore_lead_match', {
      p_lead_id: match.lead_id,
      p_cliente_id: match.cliente_id,
      p_notes: notes || null,
    });

    setProcessingMatch(null);

    if (error) {
      alert(`Erro ao ignorar: ${error.message}`);
    } else if (data?.success) {
      setMatches(prev => prev.filter(m => m.cliente_id !== match.cliente_id));
      setActionNotes(prev => {
        const next = { ...prev };
        delete next[match.cliente_id];
        return next;
      });
      if (expandedMatch === match.cliente_id) setExpandedMatch(null);
    } else {
      alert(data?.message || 'Não foi possível ignorar o match.');
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-6">
      <div className="mb-6 flex items-start gap-3">
        <div className="p-2 bg-blue-100 rounded-lg flex-shrink-0">
          <ShieldCheck size={24} className="text-blue-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Auditoria de Leads</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {loading ? 'Carregando…' : `${matches.length} possíve${matches.length === 1 ? 'l match aguardando revisão' : 'is matches aguardando revisão'}`}
          </p>
        </div>
      </div>

      {loading && (
        <div className="flex justify-center py-16">
          <LoadingSpinner />
        </div>
      )}

      {!loading && matches.length === 0 && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-8 text-center">
          <CheckCircle className="mx-auto text-green-500 mb-3" size={36} />
          <p className="text-green-800 font-semibold">Nenhum match pendente no momento</p>
          <p className="text-green-600 text-sm mt-1">Todos os leads foram revisados ou não há sugestões novas.</p>
        </div>
      )}

      {!loading && matches.length > 0 && (
        <div className="space-y-3">
          {matches.map(match => (
            <MatchCard
              key={match.cliente_id}
              match={match}
              expanded={expandedMatch === match.cliente_id}
              onToggleExpand={() =>
                setExpandedMatch(expandedMatch === match.cliente_id ? null : match.cliente_id)
              }
              notes={actionNotes[match.cliente_id] || ''}
              onNotesChange={(notes) =>
                setActionNotes(prev => ({ ...prev, [match.cliente_id]: notes }))
              }
              onLink={() => handleLinkMatch(match)}
              onIgnore={() => handleIgnoreMatch(match)}
              processing={processingMatch === match.cliente_id}
            />
          ))}
        </div>
      )}
    </div>
  );
}
