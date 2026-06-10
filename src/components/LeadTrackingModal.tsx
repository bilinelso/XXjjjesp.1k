import { X, MousePointerClick, Globe, MapPin } from 'lucide-react';

interface Lead {
  id: string;
  nome: string;
  email?: string;
  telefone: string;
  click_id: string | null;
  gclid: string | null;
  ip: string | null;
  url_acesso: string | null;
  campanha: string | null;
  created_at: string;
}

interface LeadTrackingModalProps {
  lead: Lead;
  onClose: () => void;
}

export function LeadTrackingModal({ lead, onClose }: LeadTrackingModalProps) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Dados de Rastreamento</h2>
            <p className="text-sm text-slate-500 mt-1">{lead.nome}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X size={24} className="text-slate-600" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-lg p-6 border border-blue-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-blue-600 p-3 rounded-lg">
                <MousePointerClick className="text-white" size={24} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">Identificadores de Clique</h3>
                <p className="text-sm text-slate-600">IDs usados para rastreamento de origem</p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="bg-white rounded-lg p-4 border border-blue-100">
                <label className="block text-sm font-medium text-slate-600 mb-1">Click ID</label>
                <div className="font-mono text-sm text-slate-900 bg-slate-50 px-3 py-2 rounded border border-slate-200 break-all overflow-wrap-anywhere">
                  {lead.click_id || 'Não disponível'}
                </div>
              </div>

              <div className="bg-white rounded-lg p-4 border border-blue-100">
                <label className="block text-sm font-medium text-slate-600 mb-1">Google Click ID (GCLID)</label>
                <div className="font-mono text-sm text-slate-900 bg-slate-50 px-3 py-2 rounded border border-slate-200 break-all overflow-wrap-anywhere">
                  {lead.gclid || 'Não disponível'}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-lg p-6 border border-emerald-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-emerald-600 p-3 rounded-lg">
                <MapPin className="text-white" size={24} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">Informações de Localização</h3>
                <p className="text-sm text-slate-600">Endereço IP e dados de acesso</p>
              </div>
            </div>

            <div className="bg-white rounded-lg p-4 border border-emerald-100">
              <label className="block text-sm font-medium text-slate-600 mb-1">Endereço IP</label>
              <div className="font-mono text-sm text-slate-900 bg-slate-50 px-3 py-2 rounded border border-slate-200 break-all overflow-wrap-anywhere">
                {lead.ip || 'Não disponível'}
              </div>
            </div>
          </div>

          {(lead.url_acesso || lead.campanha) && (
            <div className="bg-gradient-to-br from-violet-50 to-purple-50 rounded-lg p-6 border border-violet-200">
              <div className="flex items-center gap-3 mb-4">
                <div className="bg-violet-600 p-3 rounded-lg">
                  <Globe className="text-white" size={24} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Detalhes de Origem</h3>
                  <p className="text-sm text-slate-600">URL e campanha de acesso</p>
                </div>
              </div>

              <div className="space-y-3">
                {lead.campanha && (
                  <div className="bg-white rounded-lg p-4 border border-violet-100">
                    <label className="block text-sm font-medium text-slate-600 mb-1">Campanha</label>
                    <div className="text-sm text-slate-900 bg-slate-50 px-3 py-2 rounded border border-slate-200 break-all overflow-wrap-anywhere">
                      {lead.campanha}
                    </div>
                  </div>
                )}

                {lead.url_acesso && (
                  <div className="bg-white rounded-lg p-4 border border-violet-100">
                    <label className="block text-sm font-medium text-slate-600 mb-1">URL de Acesso</label>
                    <div className="text-sm text-slate-900 bg-slate-50 px-3 py-2 rounded border border-slate-200 break-all">
                      {lead.url_acesso}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
            <h4 className="font-semibold text-slate-900 mb-3">Informacoes de Contato</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Telefone</label>
                <div className="text-slate-900">{lead.telefone}</div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Data de Cadastro</label>
                <div className="text-slate-900">
                  {new Date(lead.created_at).toLocaleString('pt-BR')}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="sticky bottom-0 bg-white border-t border-slate-200 px-6 py-4 flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg transition-colors font-medium"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
