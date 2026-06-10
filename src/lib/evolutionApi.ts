import { supabase } from './supabase';
import { contactNameResolver } from './contactNameResolver';
import { isLidJid } from './phoneUtils';

const PROXY_BASE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/evolution-proxy`;

async function getHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY;

  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };
}

async function proxyRequest<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const headers = await getHeaders();

  const response = await fetch(`${PROXY_BASE_URL}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      endpoint,
      method: options?.method || 'GET',
      body: options?.body ? JSON.parse(options.body as string) : undefined,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

export interface EvolutionInstance {
  instance: {
    instanceName: string;
    instanceId: string;
    status: string;
  };
}

export interface EvolutionQRCode {
  pairingCode?: string;
  code?: string;
  base64?: string;
  count?: number;
}

export interface EvolutionConnectionState {
  instance: string;
  state: 'open' | 'close' | 'connecting';
}

export interface WhatsAppChat {
  id: string;
  name: string;
  lastMessage?: {
    message?: string | Record<string, unknown>;
    timestamp?: number;
    fromMe?: boolean;
  };
  unreadCount?: number;
  profilePicUrl?: string;
  isGroup?: boolean;
  alternateJids?: string[];
  clienteStatus?: string;
}

export interface WhatsAppMessage {
  key: {
    remoteJid: string;
    fromMe: boolean;
    id: string;
    participant?: string;
  };
  message?: {
    conversation?: string;
    extendedTextMessage?: {
      text?: string;
    };
    imageMessage?: {
      caption?: string;
      url?: string;
      mimetype?: string;
    };
    audioMessage?: {
      url?: string;
      mimetype?: string;
    };
    documentMessage?: {
      fileName?: string;
      url?: string;
      mimetype?: string;
    };
    videoMessage?: {
      caption?: string;
      url?: string;
      mimetype?: string;
    };
  };
  messageTimestamp?: number | string;
  pushName?: string;
  status?: number;
}

export interface WhatsAppContact {
  id: string;
  pushName?: string;
  profilePictureUrl?: string;
}

export interface UserWhatsAppInstance {
  id: string;
  user_id: string;
  instance_name: string;
  phone_number: string | null;
  is_connected: boolean;
  is_active?: boolean;
  created_at: string;
  updated_at: string;
}

export function getMessageText(msg: WhatsAppMessage): string {
  if (!msg.message) return '';
  if (typeof msg.message === 'string') return msg.message;
  const m = msg.message as Record<string, unknown>;
  if (m.conversation) return String(m.conversation);
  if (m.extendedTextMessage && typeof m.extendedTextMessage === 'object') {
    return String((m.extendedTextMessage as Record<string, unknown>).text || '');
  }
  if (m.imageMessage && typeof m.imageMessage === 'object') {
    const caption = (m.imageMessage as Record<string, unknown>).caption;
    return caption ? `[Imagem] ${caption}` : '[Imagem]';
  }
  if (m.audioMessage) return '[Audio]';
  if (m.documentMessage && typeof m.documentMessage === 'object') {
    const fileName = (m.documentMessage as Record<string, unknown>).fileName;
    return fileName ? `[Documento] ${fileName}` : '[Documento]';
  }
  if (m.videoMessage && typeof m.videoMessage === 'object') {
    const caption = (m.videoMessage as Record<string, unknown>).caption;
    return caption ? `[Video] ${caption}` : '[Video]';
  }
  if (m.stickerMessage) return '[Sticker]';
  if (m.contactMessage) return '[Contato]';
  if (m.locationMessage) return '[Localizacao]';
  if (m.reactionMessage) return '';
  if (m.protocolMessage) return '';
  return '[Mensagem]';
}

export function getChatLastMessageText(chat: WhatsAppChat): string {
  const msg = chat.lastMessage?.message;
  if (!msg) return '';
  if (typeof msg === 'string') return msg;
  if (typeof msg === 'object') {
    const obj = msg as Record<string, unknown>;
    if (obj.conversation) return String(obj.conversation);
    if (obj.extendedTextMessage && typeof obj.extendedTextMessage === 'object') {
      return String((obj.extendedTextMessage as Record<string, unknown>).text || '');
    }
    if (obj.imageMessage) return '[Imagem]';
    if (obj.audioMessage) return '[Audio]';
    if (obj.documentMessage) return '[Documento]';
    if (obj.videoMessage) return '[Video]';
    if (obj.stickerMessage) return '[Sticker]';
    if (obj.contactMessage) return '[Contato]';
    if (obj.locationMessage) return '[Localizacao]';
    return '[Mensagem]';
  }
  return '';
}

export { formatPhoneFromJid, isLidJid, formatPhoneDisplay, formatJidFromPhone } from './phoneUtils';

class EvolutionApi {
  async getUserInstance(): Promise<UserWhatsAppInstance | null> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
      .from('whatsapp_instances')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  }

  async createUserInstance(): Promise<{ instance_name: string }> {
    return proxyRequest('/user-instance', {
      method: 'POST',
      body: JSON.stringify({}),
    });
  }

  async updateInstanceStatus(is_connected: boolean, phone_number?: string): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const updates: Record<string, unknown> = { is_connected, updated_at: new Date().toISOString() };
    if (phone_number !== undefined) updates.phone_number = phone_number;

    const { error } = await supabase
      .from('whatsapp_instances')
      .update(updates)
      .eq('user_id', user.id);
    if (error) throw new Error(error.message);
  }

  async deleteUserInstance(): Promise<void> {
    await proxyRequest('/user-instance', {
      method: 'DELETE',
      body: JSON.stringify({}),
    });
  }

  async reconnectInstance(): Promise<{ instance_name: string; recreated: boolean }> {
    return proxyRequest('/user-instance/reconnect', {
      method: 'POST',
      body: JSON.stringify({}),
    });
  }

  async createInstance(instanceName: string): Promise<EvolutionInstance & { qrcode?: EvolutionQRCode }> {
    return proxyRequest('/instance/create', {
      method: 'POST',
      body: JSON.stringify({ instanceName }),
    });
  }

  async getQRCode(instanceName: string): Promise<EvolutionQRCode> {
    return proxyRequest(`/instance/connect/${instanceName}`, { method: 'GET' });
  }

  async getConnectionState(instanceName: string): Promise<EvolutionConnectionState> {
    return proxyRequest(`/instance/connectionState/${instanceName}`, { method: 'GET' });
  }

  async logoutInstance(instanceName: string): Promise<void> {
    return proxyRequest(`/instance/logout/${instanceName}`, {
      method: 'DELETE',
    });
  }

  async fetchContacts(instanceName: string): Promise<Record<string, { name: string; profilePicUrl?: string }>> {
    try {
      const raw: any[] = await proxyRequest(`/chat/findContacts/${instanceName}`, { method: 'POST', body: JSON.stringify({}) });
      if (!Array.isArray(raw)) return {};
      const map: Record<string, { name: string; profilePicUrl?: string }> = {};
      for (const c of raw) {
        const jid = c.remoteJid || c.id || '';
        const name = c.pushName || c.profileName || c.name || '';
        if (jid && name) {
          map[jid] = {
            name,
            profilePicUrl: c.profilePictureUrl || c.profilePicUrl || undefined,
          };
        }
      }
      return map;
    } catch {
      return {};
    }
  }

  private _lidNameCache: Record<string, string> = {};

  async fetchChats(instanceName: string): Promise<WhatsAppChat[]> {
    const [raw, contactsMap] = await Promise.all([
      proxyRequest<any[]>(`/chat/findChats/${instanceName}`, { method: 'POST', body: JSON.stringify({}) }),
      this.fetchContacts(instanceName),
    ]);
    if (!Array.isArray(raw)) return [];

    const nameFromLastMessage: Record<string, string> = {};
    for (const chat of raw) {
      const jid = chat.remoteJid || chat.id || '';
      const isGroup = jid.includes('@g.us');
      const lm = chat.lastMessage;
      if (lm?.pushName && !lm?.key?.fromMe && !isGroup) {
        nameFromLastMessage[jid] = lm.pushName;
        contactNameResolver.setName(jid, lm.pushName, 'pushname');
      }
    }

    const chats = raw.map(chat => {
      const remoteJid = chat.remoteJid || chat.id || '';
      const isGroup = remoteJid.includes('@g.us');
      const lastMsg = chat.lastMessage;
      let lastMessage: WhatsAppChat['lastMessage'] = undefined;
      if (lastMsg) {
        const ts = lastMsg.messageTimestamp
          ? (typeof lastMsg.messageTimestamp === 'string' ? parseInt(lastMsg.messageTimestamp) : lastMsg.messageTimestamp)
          : (chat.updatedAt ? Math.floor(new Date(chat.updatedAt).getTime() / 1000) : 0);
        lastMessage = {
          message: lastMsg.message || lastMsg.messageType || '',
          timestamp: ts,
          fromMe: lastMsg.key?.fromMe ?? false,
        };
      } else if (chat.updatedAt) {
        lastMessage = {
          message: '',
          timestamp: Math.floor(new Date(chat.updatedAt).getTime() / 1000),
          fromMe: false,
        };
      }

      const contactInfo = contactsMap[remoteJid];
      let name = '';

      if (isGroup) {
        name = chat.name || chat.subject || '';
      } else {
        name = chat.pushName
          || contactInfo?.name
          || nameFromLastMessage[remoteJid]
          || chat.name
          || this._lidNameCache[remoteJid]
          || '';
      }

      const profilePicUrl = chat.profilePicUrl
        || contactInfo?.profilePicUrl
        || undefined;

      return {
        id: remoteJid,
        name,
        lastMessage,
        unreadCount: chat.unreadCount || 0,
        profilePicUrl,
        isGroup,
        alternateJids: [] as string[],
      };
    }).filter(c => c.id && c.id.includes('@'));

    return this.deduplicateChats(chats);
  }

  private deduplicateChats(chats: WhatsAppChat[]): WhatsAppChat[] {
    const normalChats: WhatsAppChat[] = [];
    const lidChats: WhatsAppChat[] = [];

    for (const chat of chats) {
      if (chat.isGroup) {
        normalChats.push(chat);
      } else if (isLidJid(chat.id)) {
        lidChats.push(chat);
      } else {
        normalChats.push(chat);
      }
    }

    const normalByName = new Map<string, WhatsAppChat>();
    for (const chat of normalChats) {
      if (chat.name && !chat.isGroup) {
        const normalizedName = chat.name.toLowerCase().trim();
        if (!normalByName.has(normalizedName)) {
          normalByName.set(normalizedName, chat);
        }
      }
    }

    for (const lidChat of lidChats) {
      if (!lidChat.name) {
        normalChats.push(lidChat);
        continue;
      }

      const normalizedName = lidChat.name.toLowerCase().trim();
      const matchingNormal = normalByName.get(normalizedName);

      if (matchingNormal && !matchingNormal.isGroup) {
        if (!matchingNormal.alternateJids) {
          matchingNormal.alternateJids = [];
        }
        matchingNormal.alternateJids.push(lidChat.id);

        this._lidNameCache[lidChat.id] = lidChat.name;

        const lidTime = lidChat.lastMessage?.timestamp || 0;
        const normalTime = matchingNormal.lastMessage?.timestamp || 0;
        if (lidTime > normalTime && lidChat.lastMessage) {
          matchingNormal.lastMessage = lidChat.lastMessage;
        }

        matchingNormal.unreadCount = (matchingNormal.unreadCount || 0) + (lidChat.unreadCount || 0);

        if (!matchingNormal.profilePicUrl && lidChat.profilePicUrl) {
          matchingNormal.profilePicUrl = lidChat.profilePicUrl;
        }
      } else {
        normalChats.push(lidChat);
      }
    }

    return normalChats;
  }

  async fetchMessages(instanceName: string, remoteJid: string, count: number = 50): Promise<WhatsAppMessage[]> {
    const raw: any = await proxyRequest(`/chat/findMessages/${instanceName}`, {
      method: 'POST',
      body: JSON.stringify({
        where: {
          key: { remoteJid },
        },
        limit: count,
      }),
    });
    let msgs: any[];
    if (Array.isArray(raw)) {
      msgs = raw;
    } else if (raw?.messages?.records && Array.isArray(raw.messages.records)) {
      msgs = raw.messages.records;
    } else if (Array.isArray(raw?.messages)) {
      msgs = raw.messages;
    } else if (Array.isArray(raw?.records)) {
      msgs = raw.records;
    } else {
      msgs = [];
    }
    return msgs.filter((m: any) => m && m.key);
  }

  async sendText(instanceName: string, number: string, text: string): Promise<unknown> {
    return proxyRequest(`/message/sendText/${instanceName}`, {
      method: 'POST',
      body: JSON.stringify({ number, text }),
    });
  }

  async fetchProfile(instanceName: string, number: string): Promise<{ name?: string; pushName?: string; isBusiness?: boolean }> {
    try {
      const result: any = await proxyRequest(`/chat/fetchProfile/${instanceName}`, {
        method: 'POST',
        body: JSON.stringify({ number }),
      });
      return {
        name: result?.name || result?.pushName || result?.verifiedName || '',
        pushName: result?.pushName || '',
        isBusiness: result?.isBusiness || false,
      };
    } catch {
      return {};
    }
  }

  async fetchGroupInfo(instanceName: string, groupJid: string): Promise<{ subject?: string; profilePicUrl?: string } | null> {
    try {
      const result: any = await proxyRequest(`/group/findGroupInfos/${instanceName}?groupJid=${groupJid}`, {
        method: 'GET',
      });
      return {
        subject: result?.subject || result?.name || '',
        profilePicUrl: result?.profilePicUrl || result?.profilePictureUrl || undefined,
      };
    } catch {
      return null;
    }
  }

  async syncAllGroupNames(instanceName: string): Promise<{ success: number; failed: number }> {
    const { persistentChatService } = await import('./persistentChatService');
    const groupChats = await persistentChatService.getAllGroupChats();

    let success = 0;
    let failed = 0;

    for (const chat of groupChats) {
      const jid = chat.contact_jid;
      if (!jid || !jid.includes('@g.us')) continue;

      try {
        const groupInfo = await this.fetchGroupInfo(instanceName, jid);
        if (groupInfo?.subject) {
          await persistentChatService.updateGroupName(chat.id, groupInfo.subject);
          console.log(`Updated group ${jid} to "${groupInfo.subject}"`);
          success++;
        } else {
          failed++;
        }
      } catch (error) {
        console.error(`Failed to sync group ${jid}:`, error);
        failed++;
      }
    }

    return { success, failed };
  }
}

export const evolutionApi = new EvolutionApi();
