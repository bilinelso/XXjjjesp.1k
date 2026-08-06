import { useState, useEffect, useRef, useCallback } from 'react';
import { MessageCircle, X, Send, ArrowLeft, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { WhatsAppChannelMenu } from './waba/WhatsAppChannelMenu';
import { useAuth } from '../contexts/AuthContext';
import { useNotifications } from '../hooks/useNotifications';

interface InternalMessage {
  id: string;
  sender_id: string;
  recipient_id: string | null;
  message: string;
  read_by: string[] | null;
  created_at: string;
}

interface ChatUser {
  id: string;
  email: string;
}

function getUserDisplayName(u: ChatUser): string {
  const name = u.email.split('@')[0];
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function getInitials(name: string): string {
  const parts = name.split(/[._\-\s]+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

const AVATAR_COLORS = [
  'bg-blue-500', 'bg-emerald-500', 'bg-purple-500', 'bg-orange-500',
  'bg-pink-500', 'bg-teal-500', 'bg-amber-500', 'bg-cyan-500',
  'bg-rose-500', 'bg-lime-600',
];

function getAvatarColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash) + userId.charCodeAt(i);
    hash = hash & hash;
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

interface InternalChatProps {
  onOpenWhatsApp?: (phone: string) => void;
  onOpenWabaChat?: (chatId: string) => void;
}

export function InternalChat({ onOpenWhatsApp, onOpenWabaChat }: InternalChatProps) {
  const { user, profile } = useAuth();
  const { notifyChat } = useNotifications();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'general' | 'private'>('general');

  // Messages
  const [generalMessages, setGeneralMessages] = useState<InternalMessage[]>([]);
  const [privateMessages, setPrivateMessages] = useState<InternalMessage[]>([]);
  const [loadingGeneral, setLoadingGeneral] = useState(false);
  const [loadingPrivate, setLoadingPrivate] = useState(false);

  // Users
  const [users, setUsers] = useState<ChatUser[]>([]);
  const [userMap, setUserMap] = useState<Map<string, string>>(new Map());
  const [selectedUser, setSelectedUser] = useState<ChatUser | null>(null);

  // Input
  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);

  // Unread
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadByUser, setUnreadByUser] = useState<Map<string, number>>(new Map());

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  // ── Load users ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    supabase
      .from('user_profiles')
      .select('id, email')
      .neq('id', profile?.id ?? '')
      .then(({ data }) => {
        if (!data) return;
        const others = data as ChatUser[];
        setUsers(others);
        const map = new Map<string, string>();
        data.forEach((u2: ChatUser) => map.set(u2.id, getUserDisplayName(u2)));
        setUserMap(map);
      });
  }, [user, profile?.id]);

  // ── Load unread count ────────────────────────────────────────────────────────
  const refreshUnread = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('internal_messages')
      .select('id, read_by, sender_id, recipient_id')
      .neq('sender_id', user.id);
    if (!data) return;
    const unread = data.filter(m => !(m.read_by || []).includes(user.id));
    setUnreadCount(unread.length);

    const byUser = new Map<string, number>();
    for (const m of unread) {
      if (m.recipient_id === user.id) {
        byUser.set(m.sender_id, (byUser.get(m.sender_id) || 0) + 1);
      }
    }
    setUnreadByUser(byUser);
  }, [user]);

  useEffect(() => {
    if (user) refreshUnread();
  }, [user, refreshUnread]);

  // ── Mark messages as read ────────────────────────────────────────────────────
  const markAsRead = useCallback(async (msgs: InternalMessage[]) => {
    if (!user) return;
    const unread = msgs.filter(
      m => m.sender_id !== user.id && !(m.read_by || []).includes(user.id)
    );
    if (unread.length === 0) return;
    await Promise.all(
      unread.map(m =>
        supabase
          .from('internal_messages')
          .update({ read_by: [...(m.read_by || []), user.id] })
          .eq('id', m.id)
      )
    );
    refreshUnread();
  }, [user, refreshUnread]);

  // ── Load general messages ────────────────────────────────────────────────────
  const loadGeneral = useCallback(async () => {
    if (!user) return;
    setLoadingGeneral(true);
    const { data } = await supabase
      .from('internal_messages')
      .select('*')
      .is('recipient_id', null)
      .order('created_at', { ascending: true })
      .limit(100);
    if (data) setGeneralMessages(data);
    setLoadingGeneral(false);
  }, [user]);

  useEffect(() => {
    if (user) loadGeneral();
  }, [user, loadGeneral]);

  // ── Mark general messages as read when tab is open ──────────────────────────
  useEffect(() => {
    if (!open || tab !== 'general' || !user) return;
    supabase
      .rpc('mark_general_messages_read', { p_reader_id: user.id })
      .then(() => refreshUnread());
  }, [open, tab, user?.id]);

  // ── Realtime: general messages ───────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('internal_chat_general')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'internal_messages' },
        (payload) => {
          const msg = payload.new as InternalMessage;
          if (msg.recipient_id !== null) return; // only general
          setGeneralMessages(prev => {
            if (prev.some(m => m.id === msg.id)) return prev;
            return [...prev, msg];
          });
          if (msg.sender_id !== user.id) {
            console.log('[Notification Debug] Internal chat message from:', msg.sender_id);
            if (document.visibilityState !== 'visible') {
              const senderName = userMap.get(msg.sender_id) || 'Alguém';
              notifyChat(senderName, msg.message.slice(0, 80));
            }
            // Auto-mark as read if general tab is open
            if (open && tab === 'general') {
              supabase
                .from('internal_messages')
                .update({ read_by: [...(msg.read_by || []), user.id] })
                .eq('id', msg.id)
                .then(() => refreshUnread());
            } else {
              setUnreadCount(c => c + 1);
            }
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, open, tab, refreshUnread, userMap, notifyChat]);

  // ── Load private messages ────────────────────────────────────────────────────
  const loadPrivate = useCallback(async (otherId: string) => {
    if (!user) return;
    setLoadingPrivate(true);
    const { data } = await supabase
      .from('internal_messages')
      .select('*')
      .or(
        `and(sender_id.eq.${user.id},recipient_id.eq.${otherId}),and(sender_id.eq.${otherId},recipient_id.eq.${user.id})`
      )
      .order('created_at', { ascending: true })
      .limit(100);
    if (data) setPrivateMessages(data);
    setLoadingPrivate(false);
  }, [user]);

  // ── Realtime: private messages ───────────────────────────────────────────────
  useEffect(() => {
    if (!user || !selectedUser) return;

    const channel = supabase
      .channel(`internal_chat_private_${[user.id, selectedUser.id].sort().join('_')}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'internal_messages' },
        (payload) => {
          const msg = payload.new as InternalMessage;
          const relevant =
            (msg.sender_id === user.id && msg.recipient_id === selectedUser.id) ||
            (msg.sender_id === selectedUser.id && msg.recipient_id === user.id);
          if (!relevant) return;
          setPrivateMessages(prev => {
            if (prev.some(m => m.id === msg.id)) return prev;
            return [...prev, msg];
          });
          if (msg.sender_id !== user.id) {
            console.log('[Notification Debug] Internal chat message from:', msg.sender_id);
            if (document.visibilityState !== 'visible') {
              const senderName = userMap.get(msg.sender_id) || 'Alguém';
              notifyChat(senderName, msg.message.slice(0, 80));
            }
            supabase
              .from('internal_messages')
              .update({ read_by: [...(msg.read_by || []), user.id] })
              .eq('id', msg.id)
              .then(() => refreshUnread());
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, selectedUser, refreshUnread, userMap, notifyChat]);

  // ── Mark private as read when conversation opens ─────────────────────────────
  useEffect(() => {
    if (open && tab === 'private' && selectedUser && privateMessages.length > 0) {
      markAsRead(privateMessages);
    }
  }, [open, tab, selectedUser, privateMessages, markAsRead]);

  // ── Auto-scroll ──────────────────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [generalMessages, privateMessages, selectedUser]);

  // ── Send ─────────────────────────────────────────────────────────────────────
  const handleSend = async () => {
    if (!user || !messageText.trim() || sending) return;
    const text = messageText.trim();
    const isPrivate = tab === 'private' && !!selectedUser;
    setMessageText('');
    setSending(true);
    try {
      const { data, error } = await supabase
        .from('internal_messages')
        .insert({
          sender_id: user.id,
          recipient_id: isPrivate ? selectedUser!.id : null,
          message: text,
          read_by: [user.id],
        })
        .select()
        .single();
      if (error) throw error;
      if (data) {
        // Adiciona imediatamente ao estado — Realtime deduplica por id
        if (isPrivate) {
          setPrivateMessages(prev =>
            prev.some(m => m.id === data.id) ? prev : [...prev, data]
          );
        } else {
          setGeneralMessages(prev =>
            prev.some(m => m.id === data.id) ? prev : [...prev, data]
          );
        }
      }
    } catch (err) {
      console.error('Error sending:', err);
      setMessageText(text);
    } finally {
      setSending(false);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatTime = (ts: string) => {
    const d = new Date(ts);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ' +
      d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };

  const handleSelectUser = (u: ChatUser) => {
    setSelectedUser(u);
    setPrivateMessages([]);
    loadPrivate(u.id);
    if (user) {
      supabase
        .rpc('mark_internal_messages_read', {
          p_sender_id: u.id,
          p_recipient_id: user.id,
        })
        .then(() => refreshUnread());
    }
  };

  const handleBack = () => {
    setSelectedUser(null);
    setPrivateMessages([]);
  };

  if (!user) return null;

  const currentMessages = tab === 'general' ? generalMessages : privateMessages;
  const loading = tab === 'general' ? loadingGeneral : loadingPrivate;
  const showMessages = tab === 'general' || (tab === 'private' && !!selectedUser);

  const renderMessageContent = (message: string) => {
    try {
      const parsed = JSON.parse(message);
      if (parsed.type === 'lead_assigned') {
        return (
          <div className="flex flex-col gap-0.5">
            <span className="font-semibold text-sm">📋 Novo lead atribuído</span>
            <span className="text-sm">{parsed.nome}</span>
            {/* Sem `cliente_id` (mensagem gravada antes do campo existir) não
                dá para resolver a conversa oficial — mantém o botão direto. */}
            {parsed.telefone && onOpenWhatsApp && parsed.cliente_id && onOpenWabaChat ? (
              <WhatsAppChannelMenu
                clienteId={parsed.cliente_id}
                telefone={parsed.telefone}
                onOpenQr={onOpenWhatsApp}
                onOpenWaba={onOpenWabaChat}
                className="text-left text-sm font-medium underline opacity-90 hover:opacity-100 transition-opacity"
              >
                📱 {parsed.telefone}
              </WhatsAppChannelMenu>
            ) : parsed.telefone && onOpenWhatsApp ? (
              <button
                onClick={() => onOpenWhatsApp(parsed.telefone)}
                className="text-left text-sm font-medium underline opacity-90 hover:opacity-100 transition-opacity"
              >
                📱 {parsed.telefone}
              </button>
            ) : null}
            {parsed.telefone && !onOpenWhatsApp && (
              <span className="text-sm opacity-80">📱 {parsed.telefone}</span>
            )}
          </div>
        );
      }
    } catch {
      // not JSON, render as plain text
    }
    return <span>{message}</span>;
  };

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {/* Panel */}
      {open && (
        <div className="absolute bottom-16 right-0 w-80 bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden"
          style={{ height: '480px' }}>

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-blue-600 text-white flex-shrink-0">
            <div className="flex items-center gap-2">
              {tab === 'private' && selectedUser && (
                <button
                  onClick={handleBack}
                  className="p-0.5 hover:bg-blue-700 rounded transition-colors"
                >
                  <ArrowLeft size={16} />
                </button>
              )}
              <span className="font-semibold text-sm">
                {tab === 'private' && selectedUser
                  ? getUserDisplayName(selectedUser)
                  : 'Chat Interno'}
              </span>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="p-0.5 hover:bg-blue-700 rounded transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          {/* Tabs */}
          {!(tab === 'private' && selectedUser) && (
            <div className="flex border-b border-slate-200 flex-shrink-0">
              {(['general', 'private'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                    tab === t
                      ? 'text-blue-600 border-b-2 border-blue-600'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {t === 'general' ? 'Geral' : 'Privado'}
                </button>
              ))}
            </div>
          )}

          {/* User list (private tab, no conversation selected) */}
          {tab === 'private' && !selectedUser && (
            <div className="flex-1 overflow-y-auto">
              {users.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-10">Nenhum usuário</p>
              ) : (
                users.map(u => {
                  const name = getUserDisplayName(u);
                  return (
                    <button
                      key={u.id}
                      onClick={() => handleSelectUser(u)}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-0"
                    >
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${getAvatarColor(u.id)}`}>
                        {getInitials(name)}
                      </div>
                      <span className="text-sm font-medium text-slate-800 flex-1 text-left">{name}</span>
                      {(unreadByUser.get(u.id) || 0) > 0 && (
                        <span className="ml-auto w-5 h-5 bg-emerald-500 text-white text-xs rounded-full flex items-center justify-center font-medium flex-shrink-0">
                          {unreadByUser.get(u.id)}
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          )}

          {/* Messages */}
          {showMessages && (
            <>
              <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2 bg-slate-50">
                {loading ? (
                  <div className="flex justify-center py-10">
                    <Loader2 className="animate-spin text-blue-500" size={24} />
                  </div>
                ) : currentMessages.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-10">
                    Nenhuma mensagem ainda
                  </p>
                ) : (
                  currentMessages.map(msg => {
                    const isMe = msg.sender_id === user.id;
                    const senderName = userMap.get(msg.sender_id) || 'Usuário';
                    return (
                      <div
                        key={msg.id}
                        className={`flex items-end gap-1.5 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}
                      >
                        {!isMe && (
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0 ${getAvatarColor(msg.sender_id)}`}>
                            {getInitials(senderName)}
                          </div>
                        )}
                        <div className={`max-w-[78%] flex flex-col gap-0.5 ${isMe ? 'items-end' : 'items-start'}`}>
                          {!isMe && tab === 'general' && (
                            <span className="text-[10px] text-slate-500 px-1 font-medium">{senderName}</span>
                          )}
                          <div className={`px-3 py-2 rounded-2xl text-sm leading-relaxed break-words ${
                            isMe
                              ? 'bg-blue-600 text-white rounded-br-sm'
                              : 'bg-white text-slate-900 shadow-sm rounded-bl-sm'
                          }`}>
                            {renderMessageContent(msg.message)}
                          </div>
                          <span className="text-[10px] text-slate-400 px-1">{formatTime(msg.created_at)}</span>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div className="flex-shrink-0 border-t border-slate-200 px-3 py-2 flex items-end gap-2 bg-white">
                <textarea
                  ref={inputRef}
                  value={messageText}
                  onChange={e => setMessageText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Mensagem..."
                  rows={1}
                  className="flex-1 resize-none border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all max-h-24 bg-slate-50"
                  style={{ minHeight: '38px' }}
                />
                <button
                  onClick={handleSend}
                  disabled={!messageText.trim() || sending}
                  className="w-9 h-9 bg-blue-600 hover:bg-blue-700 text-white rounded-full flex items-center justify-center transition-colors disabled:opacity-50 flex-shrink-0"
                >
                  {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Floating button */}
      <button
        onClick={() => setOpen(o => !o)}
        className="relative w-14 h-14 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg flex items-center justify-center transition-colors"
      >
        {open ? <X size={24} /> : <MessageCircle size={24} />}
        {!open && unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>
    </div>
  );
}
