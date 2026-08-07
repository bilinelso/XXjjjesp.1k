import { X, FileText, MessageCircle, User } from 'lucide-react';
import { WhatsAppChannelMenu } from './waba/WhatsAppChannelMenu';

export interface NotificationData {
  id: string;
  title: string;
  message: string;
  image_url: string | null;
  pdf_url: string | null;
  created_at: string;
}

interface LeadAssignedData {
  type: 'lead_assigned';
  nome?: string;
  telefone?: string;
  cliente_id?: string;
}

function tryParseLeadAssigned(message: string): LeadAssignedData | null {
  try {
    const parsed = JSON.parse(message);
    if (parsed.type === 'lead_assigned') return parsed as LeadAssignedData;
  } catch { /* not JSON */ }
  return null;
}

interface NotificationModalProps {
  notification: NotificationData;
  onClose: () => void;
  onOpenWhatsApp?: (phone: string) => void;
  onOpenWabaChat?: (chatId: string) => void;
  onOpenCliente?: (clienteId: string) => void;
}

export function NotificationModal({
  notification,
  onClose,
  onOpenWhatsApp,
  onOpenWabaChat,
  onOpenCliente,
}: NotificationModalProps) {
  const lead = tryParseLeadAssigned(notification.message);

  return (
    <div className="fixed inset-0 bg-black/50 z-[200] flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col">
        <div className="flex items-start justify-between px-6 py-4 border-b border-slate-200 flex-shrink-0">
          <h2 className="text-xl font-bold text-slate-900 pr-4">{notification.title}</h2>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 rounded flex-shrink-0"
          >
            <X size={20} />
          </button>
        </div>

        <div className="overflow-y-auto p-6 space-y-5">
          {lead ? (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2 text-slate-700">
                <User size={16} className="text-slate-500 flex-shrink-0" />
                <span className="text-sm">
                  O cliente{' '}
                  {/* Sem `cliente_id` (payload antigo) não há ficha a abrir. */}
                  {lead.cliente_id && onOpenCliente ? (
                    <button
                      onClick={() => { onClose(); onOpenCliente(lead.cliente_id!); }}
                      className="font-semibold text-[#0C447C] hover:underline"
                    >
                      {lead.nome || '—'}
                    </button>
                  ) : (
                    <span className="font-semibold">{lead.nome || '—'}</span>
                  )}{' '}
                  foi atribuído a você.
                </span>
              </div>
              {/* Sem `cliente_id` (payload antigo ou malformado) não dá para
                  resolver a conversa oficial — cai no comportamento antigo. */}
              {lead.telefone && lead.cliente_id && onOpenWabaChat ? (
                <WhatsAppChannelMenu
                  clienteId={lead.cliente_id}
                  telefone={lead.telefone}
                  onOpenQr={phone => { onClose(); onOpenWhatsApp?.(phone); }}
                  onOpenWaba={chatId => { onClose(); onOpenWabaChat(chatId); }}
                  className="flex items-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  <MessageCircle size={15} />
                  Abrir conversa: {lead.telefone}
                </WhatsAppChannelMenu>
              ) : lead.telefone ? (
                <button
                  onClick={() => {
                    if (onOpenWhatsApp) {
                      onClose();
                      onOpenWhatsApp(lead.telefone!);
                    }
                  }}
                  className="flex items-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  <MessageCircle size={15} />
                  Abrir conversa: {lead.telefone}
                </button>
              ) : null}
            </div>
          ) : (
            <div
              className="notification-body text-slate-700 leading-relaxed text-sm"
              dangerouslySetInnerHTML={{ __html: notification.message }}
            />
          )}

          {notification.image_url && (
            <img
              src={notification.image_url}
              alt=""
              className="w-full rounded-lg object-contain max-h-96 border border-slate-200"
            />
          )}

          {notification.pdf_url && (
            <div className="space-y-3">
              <a
                href={notification.pdf_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors"
              >
                <FileText size={16} />
                Abrir PDF em nova aba
              </a>
              <iframe
                src={notification.pdf_url}
                className="w-full h-96 rounded-lg border border-slate-200"
                title="PDF"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
