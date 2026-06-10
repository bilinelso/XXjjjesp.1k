import { useState, useEffect } from 'react';
import { X, TrendingUp, TrendingDown, Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { fetchDepositoHistorico, type DepositoHistorico } from '../lib/api';
import { LoadingSpinner } from './LoadingSpinner';

const PAGE_SIZE = 5;

interface Props {
  clienteId: string;
  clienteNome: string;
  onClose: () => void;
}

function fmtBRL(value: number): string {
  return '$ ' + value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso));
}

export function DepositoHistoricoModal({ clienteId, clienteNome, onClose }: Props) {
  const [historico, setHistorico] = useState<DepositoHistorico[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  useEffect(() => {
    fetchDepositoHistorico(clienteId)
      .then(setHistorico)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [clienteId]);

  const totalPages = Math.ceil(historico.length / PAGE_SIZE);
  const paginated = historico.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[200] p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Histórico de Fundos</h2>
            <p className="text-sm text-slate-500 mt-0.5">{clienteNome}</p>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 rounded">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex justify-center py-12">
              <LoadingSpinner />
            </div>
          ) : historico.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <p>Nenhuma alteração registrada ainda.</p>
              <p className="text-sm text-slate-400 mt-1">
                As mudanças no valor de depósito são rastreadas automaticamente.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {paginated.map((item) => {
                const isPrimeiro = item.valor_anterior === null;
                const isAumento = !isPrimeiro && item.diferenca > 0;
                const isReducao = !isPrimeiro && item.diferenca < 0;

                let borderClass = 'border-blue-200 bg-blue-50';
                if (isAumento) borderClass = 'border-green-200 bg-green-50';
                if (isReducao) borderClass = 'border-red-200 bg-red-50';

                return (
                  <div key={item.id} className={`border rounded-lg p-4 ${borderClass}`}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-3">
                        {isPrimeiro && (
                          <div className="p-2 bg-blue-100 rounded-full flex-shrink-0">
                            <Calendar size={18} className="text-blue-600" />
                          </div>
                        )}
                        {isAumento && (
                          <div className="p-2 bg-green-100 rounded-full flex-shrink-0">
                            <TrendingUp size={18} className="text-green-600" />
                          </div>
                        )}
                        {isReducao && (
                          <div className="p-2 bg-red-100 rounded-full flex-shrink-0">
                            <TrendingDown size={18} className="text-red-600" />
                          </div>
                        )}

                        <div>
                          {isPrimeiro ? (
                            <>
                              <p className="text-xs text-slate-500">Primeiro depósito</p>
                              <p className="text-base font-bold text-blue-700">{fmtBRL(item.valor_novo)}</p>
                            </>
                          ) : (
                            <>
                              <p className="text-xs text-slate-500">
                                {fmtBRL(item.valor_anterior!)} → {fmtBRL(item.valor_novo)}
                              </p>
                              <p className={`text-base font-bold ${isAumento ? 'text-green-700' : 'text-red-700'}`}>
                                {isAumento ? '+' : ''}{fmtBRL(item.diferenca)}
                                {item.percentual_mudanca != null && (
                                  <span className="text-sm font-normal ml-2">
                                    ({isAumento ? '+' : ''}{item.percentual_mudanca.toFixed(2)}%)
                                  </span>
                                )}
                              </p>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="text-right text-xs text-slate-500 flex-shrink-0">
                        <p>{fmtDate(item.created_at)}</p>
                        <p className="text-slate-400 mt-0.5 capitalize">{item.fonte}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 px-6 py-3 bg-slate-50 rounded-b-xl space-y-3">
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="flex items-center gap-1 px-3 py-1.5 text-sm text-slate-600 hover:text-slate-900 disabled:opacity-30 disabled:cursor-not-allowed rounded-lg hover:bg-slate-100 transition-colors"
              >
                <ChevronLeft size={16} />
                Anterior
              </button>
              <span className="text-sm text-slate-500">
                Página {page} de {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="flex items-center gap-1 px-3 py-1.5 text-sm text-slate-600 hover:text-slate-900 disabled:opacity-30 disabled:cursor-not-allowed rounded-lg hover:bg-slate-100 transition-colors"
              >
                Próximo
                <ChevronRight size={16} />
              </button>
            </div>
          )}
          <button
            onClick={onClose}
            className="w-full py-2 bg-slate-600 hover:bg-slate-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
