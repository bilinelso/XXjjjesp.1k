import React from 'react';
import { Phone, CheckSquare, Square } from 'lucide-react';
import type { Cliente } from '../lib/api';
import { capitalizeName } from '../utils/formatters';
import { WhatsAppChannelMenu } from './waba/WhatsAppChannelMenu';

type LeadCardListProps = {
  clientes: Cliente[];
  isMaster: boolean;
  selectedIds: Set<string>;
  onToggleSelection: (id: string) => void;
  onSelectCliente: (cliente: Cliente) => void;
  onOpenWhatsApp: (phone: string) => void;
  onOpenWabaChat: (chatId: string) => void;
  getStatusColor: (status: string) => string;
  getStatusLabel: (status: string, useKanbanNames?: boolean) => string;
  formatarData: (data: string) => string;
};

/**
 * A Lista em tela pequena.
 *
 * Uma tabela de oito colunas não fica utilizável em 380px por ajuste de CSS, e
 * repetir todas elas num card só troca o scroll horizontal por um card
 * ilegível. Ficam só os campos que o assessor usa para decidir se abre o
 * cliente; o resto está a um toque de distância, no modal.
 */
export const LeadCardList: React.FC<LeadCardListProps> = ({
  clientes,
  isMaster,
  selectedIds,
  onToggleSelection,
  onSelectCliente,
  onOpenWhatsApp,
  onOpenWabaChat,
  getStatusColor,
  getStatusLabel,
  formatarData,
}) => {
  if (clientes.length === 0) {
    return (
      <div className="px-4 py-10 text-center text-sm text-slate-500">
        Nenhum cliente encontrado.
      </div>
    );
  }

  return (
    <div className="divide-y divide-slate-100">
      {clientes.map(cliente => {
        const deposito = cliente.valor_deposito ?? 0;
        const selected = selectedIds.has(cliente.id);

        return (
          <div key={cliente.id} className={`px-4 py-3 ${selected ? 'bg-blue-50' : 'bg-white'}`}>
            <div className="flex items-start gap-2">
              <button
                onClick={() => onToggleSelection(cliente.id)}
                aria-label={selected ? 'Desmarcar cliente' : 'Marcar cliente'}
                className="w-11 h-11 -ml-2 flex items-center justify-center rounded-lg hover:bg-slate-100 transition-colors flex-shrink-0"
              >
                {selected ? (
                  <CheckSquare size={18} className="text-blue-600" />
                ) : (
                  <Square size={18} className="text-slate-400" />
                )}
              </button>

              <div className="flex-1 min-w-0">
                {/* Nome e selo na mesma linha: quem cede espaço é o nome. */}
                <div className="flex items-start gap-2">
                  <button
                    onClick={() => onSelectCliente(cliente)}
                    className="flex-1 min-w-0 text-left font-semibold text-slate-900 truncate"
                  >
                    {capitalizeName(cliente.nome)}
                  </button>
                  <span
                    className={`flex-shrink-0 inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${getStatusColor(
                      cliente.status
                    )}`}
                  >
                    {getStatusLabel(cliente.status, true)}
                  </span>
                </div>

                {cliente.telefone && (
                  <WhatsAppChannelMenu
                    clienteId={cliente.id}
                    telefone={cliente.telefone}
                    onOpenQr={onOpenWhatsApp}
                    onOpenWaba={onOpenWabaChat}
                    className="inline-flex items-center gap-1.5 min-h-[44px] text-sm text-green-700 font-medium"
                  >
                    <Phone size={14} />
                    {cliente.telefone}
                  </WhatsAppChannelMenu>
                )}

                <div className="flex items-center justify-between gap-3 text-xs text-slate-500">
                  <span className="truncate">
                    {cliente.assessor || 'Sem assessor'}
                    {deposito >= 1 && (
                      <span className="ml-2 font-semibold text-emerald-600">
                        $ {isMaster ? deposito.toLocaleString('pt-BR') : '***'}
                      </span>
                    )}
                  </span>
                  <span className="flex-shrink-0">{formatarData(cliente.data_compra)}</span>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
