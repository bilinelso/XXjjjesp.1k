import React from 'react';
import { Calendar } from 'lucide-react';
import type { Cliente } from '../lib/api';
import { capitalizeName } from '../utils/formatters';
import { useAuth } from '../contexts/AuthContext';

type LeadboardProps = {
  cliente: Cliente;
  onClick: () => void;
  onOpenWhatsApp?: (phone: string) => void;
  context: 'kanban' | 'agendamentos' | 'atencao';
  appointmentInfo?: { data: string; hora: string };
};

const formatStatusDate = (dateStr?: string): string => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const getBorderColorByStatus = (status: string): string => {
  const colors: Record<string, string> = {
    'comprou': 'border-gray-400',
    'conta-criada': 'border-blue-500',
    'depositou': 'border-green-500',
    'acompanhamento': 'border-purple-500',
    'problema': 'border-red-500',
    'finalizado': 'border-slate-700'
  };
  return colors[status] || 'border-gray-400';
};

const getBorderColorByContext = (context: string, status?: string): string => {
  if (context === 'kanban' && status) {
    return getBorderColorByStatus(status);
  }
  if (context === 'atencao') {
    return 'border-yellow-500';
  }
  return 'border-blue-500';
};

const getBadgeByContext = (context: string): JSX.Element | null => {
  if (context === 'atencao') {
    return (
      <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-1 rounded">
        Atenção
      </span>
    );
  }
  return null;
};

export const Leadboard: React.FC<LeadboardProps> = ({
  cliente,
  onClick,
  onOpenWhatsApp,
  context,
  appointmentInfo
}) => {
  const { profile } = useAuth();
  const borderColor = getBorderColorByContext(context, cliente.status);

  return (
    <div
      className={`bg-white p-4 rounded shadow cursor-pointer hover:shadow-lg hover:scale-[1.02] transition-all duration-200 border-l-4 ${borderColor}`}
      onClick={onClick}
    >
      <div className="flex justify-between items-start mb-2">
        <p className="font-semibold text-sm">{capitalizeName(cliente.nome)}</p>
        {getBadgeByContext(context)}
      </div>

      {cliente.email && (
        <p className="text-xs text-gray-600 mt-1">{cliente.email}</p>
      )}

      {cliente.telefone && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpenWhatsApp?.(cliente.telefone!);
          }}
          className="text-xs text-gray-600 mt-1 hover:text-green-600 transition-colors inline-block text-left"
        >
          📞 {cliente.telefone}
        </button>
      )}

      {cliente.assessor && (
        <p className="text-xs text-blue-600 mt-1">📍 {cliente.assessor}</p>
      )}

      {(cliente.valor_deposito ?? 0) >= 1 && (
        <p className="text-xs text-green-600 mt-2 font-semibold">
          💰 $ {profile?.is_master ? cliente.valor_deposito!.toLocaleString('pt-BR') : '***'}
        </p>
      )}

      {context === 'agendamentos' && appointmentInfo && (
        <p className="text-xs mt-2 text-blue-600 font-semibold">
          {appointmentInfo.data} as {appointmentInfo.hora}
        </p>
      )}

      {context === 'kanban' && cliente.status_updated_at && (
        <div className="flex items-center gap-1 mt-2 text-xs text-slate-400">
          <Calendar size={12} />
          <span>{formatStatusDate(cliente.status_updated_at)}</span>
        </div>
      )}
    </div>
  );
};
