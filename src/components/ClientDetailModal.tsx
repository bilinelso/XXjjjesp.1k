import React from 'react';
import type { Cliente, Agendamento } from '../lib/api';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { MD_QUERY } from '../lib/viewRouting';
import { ClientDetailPanel } from './ClientDetailPanel';

type ClientDetailModalProps = {
  cliente: Cliente;
  onClose: () => void;
  onUpdate: (id: string, updates: Partial<Cliente>) => Promise<void>;
  onStatusChange: (id: string, status: string) => Promise<void>;
  onAddAgendamento?: (agendamento: Agendamento) => void;
  onRemoveAgendamento?: (agendamentoId: string) => void;
  onUpdateAgendamento?: (agendamentoId: string, updates: Partial<Agendamento>) => void;
  onOpenWhatsApp?: (phone: string) => void;
  onOpenWabaChat?: (chatId: string) => void;
  autoOpenAgendamento?: boolean;
};

export const ClientDetailModal: React.FC<ClientDetailModalProps> = (props) => {
  const isMobile = !useMediaQuery(MD_QUERY);

  return (
    <div className={`fixed inset-0 bg-black bg-opacity-50 flex justify-center z-50 ${isMobile ? '' : 'items-center p-4'}`}>
      <div
        className={
          isMobile
            ? 'bg-white w-full h-[100dvh] flex flex-col relative'
            : 'bg-white rounded-lg max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden relative'
        }
      >
        <ClientDetailPanel {...props} compact={false} />
      </div>
    </div>
  );
};
