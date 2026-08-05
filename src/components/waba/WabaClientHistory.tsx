import React, { useEffect, useState } from 'react';
import { BadgeCheck } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { WabaMessage } from '../../lib/wabaApi';
import { formatMessageTime, messageStatusLabel } from './wabaUtils';

const MESSAGE_LIMIT = 30;

type WabaClientHistoryProps = {
  clienteId: string;
};

/**
 * Histórico do WhatsApp oficial (WABA) do cliente.
 *
 * A RLS cuida da privacidade: o assessor vê apenas as próprias threads. Se
 * outro assessor conversou com este cliente, o histórico aparece vazio aqui —
 * é o comportamento correto.
 */
export const WabaClientHistory: React.FC<WabaClientHistoryProps> = ({ clienteId }) => {
  const [messages, setMessages] = useState<WabaMessage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);

      const { data: chats } = await supabase
        .from('waba_chats')
        .select('id, waba_contacts!inner(cliente_id)')
        .eq('waba_contacts.cliente_id', clienteId);

      const chatIds = (chats || []).map(chat => (chat as { id: string }).id);
      if (chatIds.length === 0) {
        if (!cancelled) {
          setMessages([]);
          setLoading(false);
        }
        return;
      }

      const { data } = await supabase
        .from('waba_messages')
        .select('*')
        .in('chat_id', chatIds)
        .order('timestamp', { ascending: false })
        .limit(MESSAGE_LIMIT);

      if (!cancelled) {
        setMessages(((data || []) as WabaMessage[]).slice().reverse());
        setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [clienteId]);

  return (
    <div className="mb-6">
      <h3 className="font-bold mb-3 flex items-center gap-2">
        <BadgeCheck size={20} className="text-emerald-600" />
        WhatsApp Oficial (WABA)
      </h3>

      {loading ? (
        <p className="text-gray-500 text-sm">Carregando conversas...</p>
      ) : messages.length === 0 ? (
        <p className="text-gray-500 text-sm">Nenhuma conversa sua com este cliente pelo número oficial.</p>
      ) : (
        <div className="max-h-64 overflow-y-auto space-y-2 bg-slate-50 border border-slate-200 rounded-lg p-3">
          {messages.map(message => {
            const statusLabel = messageStatusLabel(message.status);
            return (
              <div key={message.id} className={`flex ${message.from_me ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[80%] rounded-lg px-3 py-2 ${
                    message.from_me ? 'bg-[#E6F1FB]' : 'bg-white border border-slate-200'
                  }`}
                >
                  {message.template_name && (
                    <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">
                      Template · {message.template_name}
                    </p>
                  )}
                  <p className="text-sm whitespace-pre-wrap break-words">{message.message_text}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] text-slate-400">{formatMessageTime(message.timestamp)}</span>
                    {message.from_me && statusLabel && (
                      <span
                        className={`text-[10px] ${
                          message.status === 'failed' ? 'text-red-600 font-medium' : 'text-slate-400'
                        }`}
                      >
                        {statusLabel}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
