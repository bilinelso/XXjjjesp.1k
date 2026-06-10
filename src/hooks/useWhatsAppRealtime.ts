import { useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import type { PersistentChat, PersistentMessage } from '../lib/persistentChatService';

const lastNotifiedTimestamp = new Map<string, string>();

type ChatChangeHandler = (payload: RealtimePostgresChangesPayload<PersistentChat>) => void;
type MessageChangeHandler = (payload: RealtimePostgresChangesPayload<PersistentMessage>) => void;

export function useWhatsAppRealtimeChats(
  userId: string | null,
  onChatChange: ChatChangeHandler,
  onNotify?: (name: string, message: string) => void
) {
  useEffect(() => {
    if (!userId) return;

    const channelName = `persistent-chats-${userId}`;
    const filter = `user_id=eq.${userId}`;

    const channel = supabase
      .channel(channelName)
      .on<PersistentChat>(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'persistent_chats',
          filter,
        },
        (payload) => {
          onChatChange(payload);

          if (onNotify && payload.eventType === 'UPDATE') {
            const chat = payload.new as PersistentChat;
            const prev = payload.old as Partial<PersistentChat>;

            if (
              !chat.last_message_from_me &&
              chat.last_message_text &&
              chat.last_message_timestamp &&
              chat.last_message_timestamp !== prev?.last_message_timestamp &&
              chat.last_message_timestamp !== lastNotifiedTimestamp.get(chat.id)
            ) {
              const isRecent = (Date.now() - new Date(chat.last_message_timestamp).getTime()) < 30000;
              if (isRecent) {
                lastNotifiedTimestamp.set(chat.id, chat.last_message_timestamp);
                onNotify(chat.contact_name || chat.contact_phone, chat.last_message_text);
              }
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);
}

export function useWhatsAppRealtimeMessages(
  chatId: string | null,
  onMessageChange: MessageChangeHandler
) {
  useEffect(() => {
    if (!chatId) return;

    const handleMessageChange = (payload: RealtimePostgresChangesPayload<PersistentMessage>) => {
      console.log('[WhatsApp Realtime] Received message:', payload);
      if (payload.new && 'chat_id' in payload.new && payload.new.chat_id === chatId) {
        console.log('[WhatsApp Realtime] Message matched chat ID, forwarding to handler');
        onMessageChange(payload);
      } else {
        console.log('[WhatsApp Realtime] Message did NOT match chat ID filter');
      }
    };

    const channel = supabase
      .channel(`persistent-messages-${chatId}`)
      .on<PersistentMessage>(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'persistent_messages',
          filter: `chat_id=eq.${chatId}`,
        },
        handleMessageChange
      )
      .subscribe();

    console.log('[WhatsApp Realtime] Subscribed to messages for chat:', chatId);

    return () => {
      console.log('[WhatsApp Realtime] Unsubscribed from chat:', chatId);
      supabase.removeChannel(channel);
    };
    // Removendo onMessageChange das dependências para evitar resubscrições desnecessárias
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId]);
}

export function useWhatsAppConnectionStatus(
  instanceName: string | null,
  onStatusChange: (isConnected: boolean) => void
) {
  useEffect(() => {
    if (!instanceName) return;

    const channel = supabase
      .channel(`instance-status-${instanceName}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'whatsapp_instances',
          filter: `instance_name=eq.${instanceName}`,
        },
        (payload) => {
          if (payload.new && 'is_connected' in payload.new) {
            onStatusChange(payload.new.is_connected as boolean);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [instanceName, onStatusChange]);
}
