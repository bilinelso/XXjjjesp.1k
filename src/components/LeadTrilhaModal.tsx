import { X } from 'lucide-react';
import { LeadTrilha } from './LeadTrilha';

interface LeadTrilhaModalProps {
  nome: string;
  telefone: string;
  onClose: () => void;
}

export function LeadTrilhaModal({ nome, telefone, onClose }: LeadTrilhaModalProps) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 z-20 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-slate-900">Trilha do lead</h2>
            <p className="text-sm text-slate-500 mt-1 truncate">{nome} · {telefone}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
            <X size={24} className="text-slate-600" />
          </button>
        </div>
        <div className="p-6">
          {/* Sem permissão: fecha o modal em silêncio, sem expor o erro. */}
          <LeadTrilha telefone={telefone} onSemPermissao={onClose} />
        </div>
      </div>
    </div>
  );
}
