import { useState, useEffect, useCallback } from 'react';
import { Search, X, Users, User, Loader2, MessageSquare, Pencil, Check } from 'lucide-react';
import { formatPhoneFromJid, formatPhoneDisplay, isLidJid, getChatLastMessageText } from '../../lib/evolutionApi';
import { contactNameResolver } from '../../lib/contactNameResolver';
import { persistentChatService, type PersistentChat } from '../../lib/persistentChatService';
import { useWhatsAppRealtimeChats } from '../../hooks/useWhatsAppRealtime';
import { useNotifications } from '../../hooks/useNotifications';
import { useAuth } from '../../contexts/AuthContext';
import { profilePicCache } from '../../lib/profilePicCache';
import { KanbanStatusBadge } from './KanbanStatusBadge';
import { useKanbanColumns } from '../../hooks/useKanbanColumns';
import type { WhatsAppChat, UserWhatsAppInstance } from '../../lib/evolutionApi';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

interface WhatsAppChatListProps {
  instanceName: string;
  selectedChatId: string | null;
  onSelectChat: (chat: WhatsAppChat) => void;
  userId?: string | null;
  onUnreadCountChange?: (count: number) => void;
  instances?: UserWhatsAppInstance[];
  activeInstance?: string | null;
  setActiveInstance?: (name: string) => void;
}

export function WhatsAppChatList({ selectedChatId, onSelectChat, userId, onUnreadCountChange, instances = [], activeInstance, setActiveInstance }: WhatsAppChatListProps) {
  const { profile } = useAuth();
  const effectiveUserId = userId || profile?.id || null;
  const { getDisplayName } = useKanbanColumns();
  const { notifyWhatsApp } = useNotifications();
  const [chats, setChats] = useState<WhatsAppChat[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [resolvedNames, setResolvedNames] = useState<Map<string, string>>(new Map());
  const [contactPhotos, setContactPhotos] = useState<Map<string, string>>(new Map());
  const [editingJid, setEditingJid] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [savingName, setSavingName] = useState(false);

  const loadChats = useCallback(async () => {
    try {
      await contactNameResolver.initialize();

      const persistentChats = await persistentChatService.getPersistentChats(effectiveUserId ?? undefined);
      console.log('[ChatList] Chats retornados:', persistentChats.length, 'para userId:', effectiveUserId);

      const chatsFromDB: WhatsAppChat[] = [];
      const allJids: string[] = [];

      for (const pc of persistentChats) {
        const jid = pc.contact_jid || `${pc.contact_phone}@s.whatsapp.net`;
        allJids.push(jid);

        chatsFromDB.push({
          id: jid,
          name: pc.clientes?.nome || pc.contact_name || '',
          lastMessage: pc.last_message_timestamp ? {
            message: pc.last_message_text,
            timestamp: Math.floor(new Date(pc.last_message_timestamp).getTime() / 1000),
            fromMe: pc.last_message_from_me,
          } : undefined,
          unreadCount: pc.unread_count,
          isGroup: pc.is_group,
          clienteStatus: pc.cliente_id ? (pc.clientes?.status ?? undefined) : undefined,
        });
      }

      await profilePicCache.loadFromDatabase(allJids);

      const photosMap = new Map<string, string>();
      for (const jid of allJids) {
        const cached = profilePicCache.getCached(jid);
        if (cached) photosMap.set(jid, cached);
      }

      setChats(chatsFromDB);
      setContactPhotos(photosMap);

      const jids = chatsFromDB.filter(c => !c.name && !c.isGroup).map(c => c.id);
      if (jids.length > 0) {
        const names = await contactNameResolver.resolveNames(jids);
        setResolvedNames(names);
      } else {
        setResolvedNames(new Map());
      }
    } catch (err) {
      console.error('Error loading chats:', err);
    } finally {
      setLoading(false);
    }
  }, [effectiveUserId, activeInstance]);

  useEffect(() => {
    console.log('[ChatList] userId prop mudou para:', userId, 'effectiveUserId:', effectiveUserId, 'activeInstance:', activeInstance);
    loadChats();
  }, [loadChats]);

  const handleChatChange = useCallback((payload: RealtimePostgresChangesPayload<PersistentChat>) => {
    if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
      loadChats();
    }
  }, [loadChats]);

  useWhatsAppRealtimeChats(
    effectiveUserId,
    handleChatChange,
    notifyWhatsApp
  );

  useEffect(() => {
    const total = chats.reduce((sum, c) => sum + (c.unreadCount || 0), 0);
    onUnreadCountChange?.(total);
  }, [chats, onUnreadCountChange]);

  const filteredChats = chats.filter(chat => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    const name = (chat.name || '').toLowerCase();
    const phone = formatPhoneFromJid(chat.id).toLowerCase();
    return name.includes(query) || phone.includes(query);
  });

  const formatTime = (timestamp?: number) => {
    if (!timestamp) return '';
    const date = new Date(timestamp * 1000);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();

    if (isToday) {
      return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    }

    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) {
      return 'Ontem';
    }

    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  };

  const getInitials = (name: string) => {
    return name.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('');
  };

  const handleStartEdit = (e: React.MouseEvent, jid: string, currentName: string) => {
    e.stopPropagation();
    setEditingJid(jid);
    setEditName(currentName);
  };

  const handleSaveName = async (e: React.MouseEvent, jid: string) => {
    e.stopPropagation();
    if (!editName.trim()) return;
    setSavingName(true);
    try {
      await contactNameResolver.setManualName(jid, editName.trim());
      setResolvedNames(prev => {
        const updated = new Map(prev);
        updated.set(jid, editName.trim());
        return updated;
      });
      setEditingJid(null);
    } finally {
      setSavingName(false);
    }
  };

  const handleCancelEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingJid(null);
    setEditName('');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="animate-spin text-blue-600" size={28} />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-slate-200">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            type="text"
            placeholder="Buscar conversa..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-8 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-slate-50 transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X size={14} />
            </button>
          )}
        </div>
        {instances.length > 1 && setActiveInstance && (
          <div className="flex gap-1 mt-2 flex-wrap">
            {instances.map(inst => (
              <button
                key={inst.instance_name}
                onClick={() => setActiveInstance(inst.instance_name)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  activeInstance === inst.instance_name
                    ? 'bg-emerald-500 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {inst.user_id === profile?.id ? 'Meu WhatsApp' : inst.instance_name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {filteredChats.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-2 text-slate-400">
            <MessageSquare size={32} />
            <p className="text-sm">Nenhuma conversa encontrada</p>
          </div>
        ) : (
          filteredChats.map(chat => {
            const isSelected = selectedChatId === chat.id;
            const lid = isLidJid(chat.id);
            const cachedName = resolvedNames.get(chat.id);
            const displayName = chat.name || cachedName || (lid ? `Contato ${formatPhoneFromJid(chat.id).slice(-4)}` : formatPhoneDisplay(chat.id));
            const isGroup = chat.id.includes('@g.us');
            const profilePicUrl = chat.profilePicUrl || contactPhotos.get(chat.id);

            return (
              <div
                key={chat.id}
                role="button"
                tabIndex={0}
                onClick={() => onSelectChat(chat)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelectChat(chat); }}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-all border-b border-slate-100 hover:bg-slate-50 cursor-pointer ${
                  isSelected ? 'bg-blue-50 border-l-2 border-l-blue-600' : ''
                }`}
              >
                <div className={`w-11 h-11 rounded-full flex-shrink-0 flex items-center justify-center text-sm font-semibold ${
                  isGroup
                    ? 'bg-teal-100 text-teal-700'
                    : 'bg-blue-100 text-blue-700'
                }`}>
                  {profilePicUrl
                    ? <img src={profilePicUrl} alt="" className="w-11 h-11 rounded-full object-cover" />
                    : isGroup
                      ? <Users size={18} />
                      : (getInitials(displayName) || <User size={18} />)
                  }
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    {editingJid === chat.id ? (
                      <div className="flex items-center gap-1 flex-1 min-w-0" onClick={e => e.stopPropagation()}>
                        <input
                          type="text"
                          value={editName}
                          onChange={e => setEditName(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') handleSaveName(e as unknown as React.MouseEvent, chat.id);
                            if (e.key === 'Escape') handleCancelEdit(e as unknown as React.MouseEvent);
                          }}
                          className="flex-1 min-w-0 text-sm px-2 py-0.5 border border-blue-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                          autoFocus
                        />
                        <button
                          onClick={e => handleSaveName(e, chat.id)}
                          disabled={savingName}
                          className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"
                        >
                          {savingName ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                        </button>
                        <button
                          onClick={handleCancelEdit}
                          className="p-1 text-slate-400 hover:bg-slate-100 rounded"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 min-w-0 flex-1 group/name">
                        <span className={`text-sm font-medium truncate ${isSelected ? 'text-blue-900' : 'text-slate-900'}`}>
                          {displayName}
                        </span>
                        <button
                          onClick={e => handleStartEdit(e, chat.id, displayName)}
                          className="p-1 text-slate-300 hover:text-slate-600 hover:bg-slate-100 rounded opacity-0 group-hover/name:opacity-100 transition-opacity flex-shrink-0"
                          title="Editar nome"
                        >
                          <Pencil size={12} />
                        </button>
                      </div>
                    )}
                    <span className="text-xs text-slate-400 flex-shrink-0 ml-2">
                      {formatTime(chat.lastMessage?.timestamp)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-0.5">
                    <p className="text-xs text-slate-500 truncate">
                      {chat.lastMessage?.fromMe && <span className="text-slate-400">Voce: </span>}
                      {getChatLastMessageText(chat)}
                    </p>
                    {(chat.unreadCount || 0) > 0 && (
                      <span className="ml-2 flex-shrink-0 w-5 h-5 bg-emerald-500 text-white text-xs rounded-full flex items-center justify-center font-medium">
                        {chat.unreadCount}
                      </span>
                    )}
                  </div>
                  {chat.clienteStatus && (
                    <div className="mt-1">
                      <KanbanStatusBadge status={chat.clienteStatus} label={getDisplayName(chat.clienteStatus)} />
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
