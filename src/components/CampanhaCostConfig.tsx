import { useState, useEffect } from 'react';
import { RefreshCw, Trash2, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { DatePicker } from './DatePicker';

interface SyncGroup {
  periodo_inicio: string;
  periodo_fim: string;
  campaigns: string[];
  totalCusto: number;
}

function fmtDate(iso: string) {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

const todayISO = () => new Date().toISOString().split('T')[0];
const daysAgoISO = (n: number) => {
  const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().split('T')[0];
};

export function CampanhaCostConfig() {
  const [from, setFrom] = useState(() => daysAgoISO(7));
  const [to, setTo] = useState(() => todayISO());
  const [syncing, setSyncing] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [groups, setGroups] = useState<SyncGroup[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(true);
  const [histPage, setHistPage] = useState(1);
  const HIST_PER_PAGE = 10;

  const loadGroups = () => {
    supabase
      .from('campaign_costs')
      .select('campanha_nome, periodo_inicio, periodo_fim, custo')
      .order('periodo_inicio', { ascending: false })
      .then(({ data }) => {
        if (!data) { setLoadingGroups(false); return; }
        const map = new Map<string, SyncGroup>();
        for (const r of data) {
          const key = `${r.periodo_inicio}|${r.periodo_fim}`;
          if (!map.has(key)) map.set(key, { periodo_inicio: r.periodo_inicio, periodo_fim: r.periodo_fim, campaigns: [], totalCusto: 0 });
          const g = map.get(key)!;
          g.campaigns.push(r.campanha_nome);
          g.totalCusto += r.custo;
        }
        setGroups([...map.values()]);
        setLoadingGroups(false);
        setHistPage(1);
      });
  };

  useEffect(() => { loadGroups(); }, []);

  const handleSync = async () => {
    if (!from || !to) {
      setStatus({ type: 'error', message: 'Selecione o período antes de sincronizar.' });
      return;
    }
    setSyncing(true);
    setStatus({ type: 'info', message: 'Sincronizando com Skro...' });
    try {
      const { data, error } = await supabase.functions.invoke('skro-sync', {
        body: { from, to },
      });
      if (error) throw error;
      const count: number = data?.count ?? data?.campaigns ?? 0;
      setStatus({ type: 'success', message: `${count} campanha${count !== 1 ? 's' : ''} sincronizada${count !== 1 ? 's' : ''} com sucesso.` });
      loadGroups();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao sincronizar.';
      const isToken = msg.toLowerCase().includes('token') || msg.toLowerCase().includes('auth') || msg.toLowerCase().includes('skro');
      setStatus({
        type: 'error',
        message: isToken ? 'Token do Skro não configurado ou inválido. Verifique as variáveis de ambiente da edge function.' : msg,
      });
    } finally {
      setSyncing(false);
    }
  };

  const handleDelete = async (g: SyncGroup) => {
    if (!confirm(`Excluir todos os custos do período ${fmtDate(g.periodo_inicio)} – ${fmtDate(g.periodo_fim)}?`)) return;
    await supabase
      .from('campaign_costs')
      .delete()
      .eq('periodo_inicio', g.periodo_inicio)
      .eq('periodo_fim', g.periodo_fim);
    setGroups(prev => prev.filter(x => !(x.periodo_inicio === g.periodo_inicio && x.periodo_fim === g.periodo_fim)));
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-6 py-5 border-b border-slate-200 bg-slate-50">
        <h3 className="text-lg font-semibold text-slate-900">Sincronizar com Skro</h3>
        <p className="text-sm text-slate-500 mt-1">Busca custos de campanhas diretamente da API Skro</p>
      </div>

      <div className="p-6 space-y-5">
        {/* Period + Sync button */}
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <p className="text-xs font-medium text-slate-600 mb-1">Período</p>
            <div className="flex items-center gap-2">
              <div className="w-[160px]"><DatePicker label="De" value={from} onChange={setFrom} maxDate={to || undefined} /></div>
              <span className="text-slate-400 text-sm">–</span>
              <div className="w-[160px]"><DatePicker label="Até" value={to} onChange={setTo} minDate={from || undefined} /></div>
            </div>
          </div>
          <button
            onClick={handleSync}
            disabled={syncing || !from || !to}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              from && to && !syncing
                ? 'bg-blue-600 hover:bg-blue-700 text-white'
                : 'bg-slate-100 text-slate-400 cursor-not-allowed'
            }`}
          >
            {syncing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            Sincronizar
          </button>
        </div>

        {status && (
          <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${
            status.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
            : status.type === 'error' ? 'bg-red-50 text-red-700 border border-red-200'
            : 'bg-blue-50 text-blue-700 border border-blue-200'
          }`}>
            {status.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
            {status.message}
          </div>
        )}

        {/* Synced periods table */}
        <div>
          <p className="text-xs font-semibold text-slate-600 mb-2">Dados sincronizados</p>
          {loadingGroups ? (
            <div className="flex justify-center py-4"><Loader2 className="animate-spin text-slate-400" size={18} /></div>
          ) : groups.length === 0 ? (
            <p className="text-sm text-slate-400">Nenhum dado sincronizado ainda.</p>
          ) : (() => {
            const totalPages = Math.ceil(groups.length / HIST_PER_PAGE);
            const pageGroups = groups.slice((histPage - 1) * HIST_PER_PAGE, histPage * HIST_PER_PAGE);
            return (
              <>
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 z-20 bg-slate-50 [&>tr>th]:bg-slate-50 [&>tr>th]:border-b [&>tr>th]:border-slate-200">
                      <tr>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-600">Período</th>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-600">Campanhas</th>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-600">Custo Total</th>
                        <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-600">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {pageGroups.map(g => (
                        <tr key={`${g.periodo_inicio}|${g.periodo_fim}`} className="hover:bg-slate-50">
                          <td className="px-4 py-2.5 text-slate-700 whitespace-nowrap">{fmtDate(g.periodo_inicio)} – {fmtDate(g.periodo_fim)}</td>
                          <td className="px-4 py-2.5 text-slate-500">{g.campaigns.length} campanha{g.campaigns.length !== 1 ? 's' : ''}</td>
                          <td className="px-4 py-2.5 text-slate-700 font-medium">R$ {g.totalCusto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                          <td className="px-4 py-2.5 text-right">
                            <button onClick={() => handleDelete(g)} className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-3">
                    <span className="text-xs text-slate-500">
                      {(histPage - 1) * HIST_PER_PAGE + 1}–{Math.min(histPage * HIST_PER_PAGE, groups.length)} de {groups.length} períodos
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setHistPage(p => Math.max(1, p - 1))}
                        disabled={histPage === 1}
                        className="px-2.5 py-1 rounded text-xs font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        ← Anterior
                      </button>
                      {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                        <button
                          key={p}
                          onClick={() => setHistPage(p)}
                          className={`w-7 h-7 rounded text-xs font-medium transition-colors ${
                            p === histPage
                              ? 'bg-blue-600 text-white'
                              : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          {p}
                        </button>
                      ))}
                      <button
                        onClick={() => setHistPage(p => Math.min(totalPages, p + 1))}
                        disabled={histPage === totalPages}
                        className="px-2.5 py-1 rounded text-xs font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        Próximo →
                      </button>
                    </div>
                  </div>
                )}
              </>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
