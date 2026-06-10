import { supabase } from './supabase';
import { normalizePhone, getPhoneVariants } from './phoneUtils';
import type { WhatsAppMessage } from './evolutionApi';
import { getMessageText } from './evolutionApi';

export interface PersistentChat {
  id: string;
  user_id: string;
  contact_phone: string;
  contact_name: string;
  contact_jid: string | null;
  is_group: boolean;
  last_message_text: string;
  last_message_timestamp: string | null;
  last_message_from_me: boolean;
  unread_count: number;
  is_active: boolean;
  cliente_id: string | null;
  created_at: string;
  updated_at: string;
  clientes?: { status: string; nome?: string } | null;
}

export interface PersistentMessage {
  id: string;
  user_id: string;
  chat_id: string;
  message_id: string | null;
  from_me: boolean;
  message_text: string;
  message_type: string;
  timestamp: string;
  instance_name: string | null;
  participant_jid: string | null;
  participant_name: string | null;
  created_at: string;
  media_url?: string | null;
  media_base64?: string | null;
}

class PersistentChatService {
  private async getUserId(): Promise<string | null> {
    const { data: { user } } = await supabase.auth.getUser();
    return user?.id || null;
  }

  async getPersistentChats(overrideUserId?: string): Promise<PersistentChat[]> {
    const userId = overrideUserId || await this.getUserId();
    if (!userId) return [];

    const { data, error } = await supabase
      .from('persistent_chats')
      .select('*, clientes(status, nome)')
      .eq('user_id', userId)
      .eq('is_active', true)
      .eq('is_group', false)
      .order('last_message_timestamp', { ascending: false, nullsFirst: false });

    if (error) {
      console.error('Error fetching persistent chats:', error);
      return [];
    }

    return data || [];
  }

  async getChatByJid(jid: string, userId: string): Promise<PersistentChat | null> {
    const contactPhone = normalizePhone(jid);
    const phoneVariants = contactPhone ? getPhoneVariants(contactPhone) : [jid];

    const { data } = await supabase
      .from('persistent_chats')
      .select('*')
      .eq('user_id', userId)
      .in('contact_phone', phoneVariants)
      .order('last_message_timestamp', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    return data || null;
  }

  async getOrCreateChat(jid: string, name: string, isGroup: boolean = false): Promise<PersistentChat | null> {
    const userId = await this.getUserId();
    if (!userId) return null;

    const contactPhone = normalizePhone(jid);
    if (!contactPhone) return null;

    const phoneVariants = getPhoneVariants(contactPhone);

    const { data: existingList } = await supabase
      .from('persistent_chats')
      .select('*')
      .eq('user_id', userId)
      .in('contact_phone', phoneVariants)
      .order('last_message_timestamp', { ascending: false, nullsFirst: false });

    const existing = existingList?.[0] || null;

    if (existing) {
      if (existing.contact_jid !== jid || (name && existing.contact_name !== name)) {
        const { data: updated } = await supabase
          .from('persistent_chats')
          .update({
            contact_jid: jid,
            contact_name: name || existing.contact_name,
            is_active: true,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id)
          .select()
          .single();
        return updated || existing;
      }
      return existing;
    }

    const { data: newChat, error } = await supabase
      .from('persistent_chats')
      .insert({
        user_id: userId,
        contact_phone: contactPhone,
        contact_name: name || contactPhone,
        contact_jid: jid,
        is_group: isGroup,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating persistent chat:', error);
      return null;
    }

    return newChat;
  }

  async linkChatToCliente(chatId: string, clienteId: string): Promise<void> {
    await supabase
      .from('persistent_chats')
      .update({
        cliente_id: clienteId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', chatId);
  }

  async findAndLinkCliente(chatId: string, contactPhone: string): Promise<string | null> {
    const phoneVariants = getPhoneVariants(contactPhone);

    const { data: cliente } = await supabase
      .from('clientes')
      .select('id')
      .in('telefone_normalized', phoneVariants)
      .maybeSingle();

    if (cliente) {
      await this.linkChatToCliente(chatId, cliente.id);
      return cliente.id;
    }

    return null;
  }

  async updateLastMessage(chatId: string, text: string, fromMe: boolean): Promise<void> {
    await supabase
      .from('persistent_chats')
      .update({
        last_message_text: text,
        last_message_timestamp: new Date().toISOString(),
        last_message_from_me: fromMe,
        updated_at: new Date().toISOString(),
      })
      .eq('id', chatId);
  }

  async saveMessage(
    chatId: string,
    messageId: string | null,
    text: string,
    fromMe: boolean,
    messageType: string = 'text',
    instanceName: string | null = null,
    timestamp?: Date,
    participantJid?: string | null,
    participantName?: string | null
  ): Promise<PersistentMessage | null> {
    const userId = await this.getUserId();
    if (!userId) return null;

    const insertData: Record<string, unknown> = {
      user_id: userId,
      chat_id: chatId,
      message_id: messageId,
      from_me: fromMe,
      message_text: text,
      message_type: messageType,
      instance_name: instanceName,
      timestamp: (timestamp || new Date()).toISOString(),
    };

    if (participantJid) {
      insertData.participant_jid = participantJid;
      insertData.participant_name = participantName || null;
    }

    const { data, error } = await supabase
      .from('persistent_messages')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error('Error saving persistent message:', error);
      return null;
    }

    await this.updateLastMessage(chatId, text, fromMe);

    return data;
  }

  async getMessages(chatId: string, limit: number = 100): Promise<PersistentMessage[]> {
    const { data, error } = await supabase
      .from('persistent_messages')
      .select('*')
      .eq('chat_id', chatId)
      .order('timestamp', { ascending: true })
      .limit(limit);

    if (error) {
      console.error('Error fetching persistent messages:', error);
      return [];
    }

    return data || [];
  }

  async syncMessagesFromInstance(
    chatId: string,
    messages: WhatsAppMessage[],
    instanceName: string
  ): Promise<void> {
    const userId = await this.getUserId();
    if (!userId) return;

    const { data: existingMsgs } = await supabase
      .from('persistent_messages')
      .select('message_id')
      .eq('chat_id', chatId);

    const existingIds = new Set((existingMsgs || []).map(m => m.message_id));

    const newMessages = messages.filter(m => m.key?.id && !existingIds.has(m.key.id));

    const { data: chatData } = await supabase
      .from('persistent_chats')
      .select('is_group')
      .eq('id', chatId)
      .maybeSingle();

    const isGroup = chatData?.is_group || false;

    for (const msg of newMessages) {
      const text = getMessageText(msg);
      if (!text) continue;

      const timestamp = msg.messageTimestamp
        ? new Date(typeof msg.messageTimestamp === 'string'
            ? parseInt(msg.messageTimestamp) * 1000
            : msg.messageTimestamp * 1000)
        : new Date();

      const participantJid = isGroup && msg.key.participant ? msg.key.participant : null;
      const participantName = isGroup && msg.key.participant && msg.pushName ? msg.pushName : null;

      await this.saveMessage(
        chatId,
        msg.key.id,
        text,
        msg.key.fromMe,
        'text',
        instanceName,
        timestamp,
        participantJid,
        participantName
      );
    }
  }

  async updateGroupName(chatId: string, groupName: string): Promise<void> {
    const userId = await this.getUserId();
    if (!userId) return;

    await supabase
      .from('persistent_chats')
      .update({
        contact_name: groupName,
        updated_at: new Date().toISOString(),
      })
      .eq('id', chatId)
      .eq('user_id', userId)
      .eq('is_group', true);
  }

  async getAllGroupChats(): Promise<PersistentChat[]> {
    const userId = await this.getUserId();
    if (!userId) return [];

    const { data, error } = await supabase
      .from('persistent_chats')
      .select('*')
      .eq('user_id', userId)
      .eq('is_group', true)
      .eq('is_active', true);

    if (error) {
      console.error('Error fetching group chats:', error);
      return [];
    }

    return data || [];
  }

}

export const persistentChatService = new PersistentChatService();
