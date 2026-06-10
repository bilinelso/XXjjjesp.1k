import { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Loader2, ArrowDown, User, Image, FileText, Mic, Video, Check, CheckCheck, CircleUser as UserCircle, ExternalLink } from 'lucide-react';
import { evolutionApi, formatPhoneFromJid, formatPhoneDisplay, isLidJid } from '../../lib/evolutionApi';
import { contactNameResolver } from '../../lib/contactNameResolver';
import { persistentChatService, type PersistentMessage } from '../../lib/persistentChatService';
import { useWhatsAppRealtimeMessages } from '../../hooks/useWhatsAppRealtime';
import { useNotifications } from '../../hooks/useNotifications';
import { WhatsAppContactModal } from './WhatsAppContactModal';
import { KanbanStatusBadge } from './KanbanStatusBadge';
import { AudioPlayer } from './AudioPlayer';
import { useKanbanColumns } from '../../hooks/useKanbanColumns';
import type { WhatsAppChat } from '../../lib/evolutionApi';
import type { Cliente } from '../../lib/api';
import { supabase } from '../../lib/supabase';

interface WhatsAppMessageViewProps {
  instanceName: string;
  chat: WhatsAppChat & { alternateJids?: string[] };
  onViewClient?: (cliente: Cliente) => void;
  readOnly?: boolean;
  userId?: string | null;
}

interface QuickReply {
  id: string;
  title: string;
  message: string;
}

interface UnifiedMessage {
  id: string;
  fromMe: boolean;
  text: string;
  timestamp: number;
  pushName?: string;
  status?: number;
  messageType?: string;
  instanceName?: string;
  isPersistent?: boolean;
  participantJid?: string;
  participantName?: string;
  messageId?: string;
  mediaBase64?: string | null;
}

export function WhatsAppMessageView({ instanceName, chat, onViewClient, readOnly = false, userId }: WhatsAppMessageViewProps) {
  const { getDisplayName } = useKanbanColumns();
  const { notifyWhatsApp } = useNotifications();
  const [messages, setMessages] = useState<UnifiedMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const [fetchedProfileName, setFetchedProfileName] = useState<string>('');
  const [fetchedProfilePic, setFetchedProfilePic] = useState<string>('');
  const [showContactModal, setShowContactModal] = useState(false);
  const [persistentChatId, setPersistentChatId] = useState<string | null>(null);
  const [linkedCliente, setLinkedCliente] = useState<Cliente | null>(null);
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);
  const [showQuickMenu, setShowQuickMenu] = useState(false);
  const [selectedQuickIndex, setSelectedQuickIndex] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const quickMenuRef = useRef<HTMLDivElement>(null);

  // Carrega quick replies uma vez ao montar
  useEffect(() => {
    supabase
      .from('quick_replies')
      .select('id, title, message')
      .order('title')
      .then(({ data }) => { if (data) setQuickReplies(data); });
  }, []);

  // Fecha menu ao clicar fora (exceto no próprio textarea)
  useEffect(() => {
    if (!showQuickMenu) return;
    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        quickMenuRef.current && !quickMenuRef.current.contains(target) &&
        inputRef.current && !inputRef.current.contains(target)
      ) {
        setShowQuickMenu(false);
      }
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [showQuickMenu]);

  const convertPersistentToUnified = (msg: PersistentMessage): UnifiedMessage => ({
    id: msg.id,
    fromMe: msg.from_me,
    text: msg.message_text,
    timestamp: Math.floor(new Date(msg.timestamp).getTime() / 1000),
    messageType: msg.message_type,
    instanceName: msg.instance_name || undefined,
    isPersistent: true,
    participantJid: msg.participant_jid || undefined,
    participantName: msg.participant_name || undefined,
    messageId: msg.message_id || undefined,
    mediaBase64: msg.media_base64 || undefined,
  });

  const loadMessages = useCallback(async () => {
    try {
      const isGroup = chat.id.includes('@g.us');

      let persistentChat;
      if (readOnly && userId) {
        persistentChat = await persistentChatService.getChatByJid(chat.id, userId);
      } else {
        persistentChat = await persistentChatService.getOrCreateChat(chat.id, chat.name || '', isGroup);
      }

      if (persistentChat) {
        setPersistentChatId(persistentChat.id);

        if (!readOnly) {
          if (persistentChat.cliente_id) {
            const { data: cliente } = await supabase
              .from('clientes')
              .select('*')
              .eq('id', persistentChat.cliente_id)
              .maybeSingle();
            if (cliente) {
              setLinkedCliente(cliente);
            }
          } else if (!isGroup) {
            const clienteId = await persistentChatService.findAndLinkCliente(
              persistentChat.id,
              persistentChat.contact_phone
            );
            if (clienteId) {
              const { data: cliente } = await supabase
                .from('clientes')
                .select('*')
                .eq('id', clienteId)
                .maybeSingle();
              if (cliente) {
                setLinkedCliente(cliente);
              }
            }
          }
        }

        const persistentMsgs = await persistentChatService.getMessages(persistentChat.id, 500);
        const unifiedMsgs = persistentMsgs.map(convertPersistentToUnified);
        const sorted = unifiedMsgs.sort((a, b) => a.timestamp - b.timestamp);
        setMessages(sorted);
        setLoading(false);
      } else {
        setLoading(false);
      }
    } catch (err) {
      console.error('Error loading messages:', err);
      setLoading(false);
    }
  // instanceName, alternateJids e profilePicUrl removidos das deps:
  // não são usados no corpo da função após remoção do sync/fetchContact
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat.id, chat.name]);

  useEffect(() => {
    setLoading(true);
    setMessages([]);
    setFetchedProfileName('');
    setFetchedProfilePic('');
    setLinkedCliente(null);
    setPersistentChatId(null);
    loadMessages();
    // Depende apenas de chat.id — não recria quando name/profilePicUrl mudam
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat.id]);

  useEffect(() => {
    const cachedName = contactNameResolver.getNameFromJid(chat.id);
    if (cachedName) setFetchedProfileName(cachedName);
  }, [chat.id]);

  useEffect(() => {
    if (!persistentChatId || readOnly) return;

    supabase
      .from('persistent_chats')
      .update({ unread_count: 0, updated_at: new Date().toISOString() })
      .eq('id', persistentChatId)
      .then(() => {});
  }, [persistentChatId, readOnly]);

  const handleNewMessage = useCallback((payload: any) => {
    if (payload.eventType === 'INSERT' && payload.new) {
      const newMsg = payload.new as PersistentMessage;
      console.log('[Notification Debug] New message:', {
        from_me: newMsg.from_me,
        text: newMsg.message_text,
        chat: chat.name || chat.id,
      });
      setMessages(prev => {
        const exists = prev.some(m => m.id === newMsg.id || (newMsg.message_id && m.id === newMsg.message_id));
        if (exists) return prev;

        const unified: UnifiedMessage = {
          id: newMsg.id,
          fromMe: newMsg.from_me,
          text: newMsg.message_text,
          timestamp: Math.floor(new Date(newMsg.timestamp).getTime() / 1000),
          messageType: newMsg.message_type,
          instanceName: newMsg.instance_name || undefined,
          isPersistent: true,
          participantJid: newMsg.participant_jid || undefined,
          participantName: newMsg.participant_name || undefined,
        };

        const updated = [...prev, unified].sort((a, b) => a.timestamp - b.timestamp);
        return updated;
      });

      if (!newMsg.from_me && document.visibilityState !== 'visible') {
        console.log('[Notification Debug] Calling notifyWhatsApp');
        const contactName = chat.name || formatPhoneDisplay(chat.id);
        const preview = newMsg.message_text?.slice(0, 80) || '';
        notifyWhatsApp(contactName, preview);
      }

      scrollToBottom();
    }
  }, [chat.name, chat.id, notifyWhatsApp]);

  useWhatsAppRealtimeMessages(persistentChatId, (payload) => {
    handleNewMessage({ ...payload, eventType: payload.eventType || 'INSERT' });
  });

  useEffect(() => {
    if (!loading && messages.length > 0) {
      scrollToBottom();
    }
  }, [loading, messages.length]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleScroll = () => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const { scrollTop, scrollHeight, clientHeight } = container;
    setShowScrollDown(scrollHeight - scrollTop - clientHeight > 200);
  };

  const handleSend = async () => {
    const text = messageText.trim();
    if (!text || sending) return;

    setSending(true);
    setMessageText('');

    const messageToSend = text;

    try {
      const number = formatPhoneFromJid(chat.id);
      await evolutionApi.sendText(instanceName, number, messageToSend);

      const { data: { user } } = await supabase.auth.getUser();
      if (user && persistentChatId) {
        const now = new Date().toISOString();
        await supabase
          .from('persistent_messages')
          .insert({
            user_id: user.id,
            chat_id: persistentChatId,
            message_id: `3EB${Date.now().toString(16).toUpperCase()}`,
            from_me: true,
            message_text: messageToSend,
            message_type: 'text',
            timestamp: now,
            instance_name: instanceName,
          });

        await supabase
          .from('persistent_chats')
          .update({
            last_message_text: messageToSend,
            last_message_timestamp: now,
            last_message_from_me: true,
            updated_at: now,
          })
          .eq('id', persistentChatId);
      }
    } catch (err) {
      console.error('Error sending message:', err);
      setMessageText(text);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const quickFilter = messageText.startsWith('/') ? messageText.slice(1).toLowerCase() : '';
  const filteredQuickReplies = showQuickMenu
    ? quickReplies.filter(r => !quickFilter || r.title.toLowerCase().includes(quickFilter))
    : [];

  const handleSelectQuickReply = (reply: QuickReply) => {
    const resolveNomeContato = (): string => {
      const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
      if (linkedCliente?.nome) {
        return capitalize(linkedCliente.nome.split(' ')[0]);
      }
      const isPhone = /^[\+\d\s\-\(\)]+$/.test(displayName);
      if (!isPhone && displayName) {
        return capitalize(displayName.split(' ')[0]);
      }
      return '';
    };
    const nome = resolveNomeContato();
    const primeiroNome = nome.split(' ')[0];
    const finalMessage = reply.message
      .replace(/\{nome_contato\}/g, nome)
      .replace(/\{primeiro_nome\}/g, primeiroNome)
      .replace(/\{nome\}/g, linkedCliente?.nome || nome)
      .replace(/\{assessor\}/g, linkedCliente?.assessor || '')
      .trim();
    setMessageText(finalMessage);
    setShowQuickMenu(false);
    setSelectedQuickIndex(0);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showQuickMenu && filteredQuickReplies.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedQuickIndex(i => Math.min(i + 1, filteredQuickReplies.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedQuickIndex(i => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSelectQuickReply(filteredQuickReplies[selectedQuickIndex]);
        return;
      }
      if (e.key === 'Escape') {
        setShowQuickMenu(false);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatTime = (timestamp?: number) => {
    if (!timestamp) return '';
    const date = new Date(timestamp * 1000);
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };

  const formatDateSeparator = (timestamp?: number) => {
    if (!timestamp) return '';
    const date = new Date(timestamp * 1000);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    if (isToday) return 'Hoje';

    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) return 'Ontem';

    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  };

  const getMessageIcon = (msg: UnifiedMessage) => {
    if (!msg.messageType) return null;
    if (msg.messageType === 'image') return <Image size={14} className="text-blue-400" />;
    if (msg.messageType === 'audio') return <Mic size={14} className="text-emerald-400" />;
    if (msg.messageType === 'document') return <FileText size={14} className="text-orange-400" />;
    if (msg.messageType === 'video') return <Video size={14} className="text-rose-400" />;
    return null;
  };

  const getStatusIcon = (msg: UnifiedMessage) => {
    if (!msg.fromMe) return null;
    if (msg.status === 4 || msg.status === 5) return <CheckCheck size={14} className="text-blue-400" />;
    if (msg.status === 3) return <CheckCheck size={14} className="text-slate-400" />;
    return <Check size={14} className="text-slate-400" />;
  };

  const getParticipantColor = (participantJid?: string): string => {
    if (!participantJid) return 'text-blue-600';

    const colors = [
      'text-blue-600',
      'text-emerald-600',
      'text-purple-600',
      'text-orange-600',
      'text-pink-600',
      'text-teal-600',
      'text-amber-600',
      'text-cyan-600',
      'text-rose-600',
      'text-lime-600',
    ];

    let hash = 0;
    for (let i = 0; i < participantJid.length; i++) {
      hash = ((hash << 5) - hash) + participantJid.charCodeAt(i);
      hash = hash & hash;
    }

    return colors[Math.abs(hash) % colors.length];
  };

  const formatPhoneNumber = (jid: string): string => {
    const phone = jid.split('@')[0];
    if (phone.length > 10) {
      return `+${phone}`;
    }
    return phone;
  };

  const shouldShowDateSeparator = (msg: UnifiedMessage, index: number) => {
    if (index === 0) return true;
    const prevMsg = messages[index - 1];
    const currentDate = new Date(msg.timestamp * 1000).toDateString();
    const prevDate = new Date(prevMsg.timestamp * 1000).toDateString();
    return currentDate !== prevDate;
  };

  const pushNameFromMessages = messages.find(m => !m.fromMe && m.pushName)?.pushName || '';
  const isGroup = chat.id.includes('@g.us');
  const isLid = isLidJid(chat.id);
  const resolvedName = chat.name || fetchedProfileName || pushNameFromMessages;
  const displayName = resolvedName || (isLid ? `Contato ${formatPhoneFromJid(chat.id).slice(-4)}` : formatPhoneDisplay(chat.id));

  const getSubtitle = () => {
    if (isGroup) return 'Grupo';
    if (!isLid) return formatPhoneDisplay(chat.id);
    const altJids = chat.alternateJids || [];
    const normalJid = altJids.find(jid => !isLidJid(jid));
    if (normalJid) return formatPhoneDisplay(normalJid);
    return '';
  };
  const subtitle = getSubtitle();
  const canShowContactInfo = !isGroup;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-5 py-3 bg-white border-b border-slate-200 flex-shrink-0">
        <div
          className={`flex items-center gap-3 flex-1 min-w-0 ${
            canShowContactInfo ? 'cursor-pointer hover:bg-slate-50 transition-colors rounded-lg -m-2 p-2' : ''
          }`}
          onClick={canShowContactInfo ? () => setShowContactModal(true) : undefined}
        >
          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0 ${
            isGroup ? 'bg-teal-100 text-teal-700' : 'bg-blue-100 text-blue-700'
          }`}>
            {(chat.profilePicUrl || fetchedProfilePic)
              ? <img src={chat.profilePicUrl || fetchedProfilePic} alt="" className="w-10 h-10 rounded-full object-cover" />
              : <User size={18} />
            }
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="text-sm font-semibold text-slate-900 truncate">{displayName}</h4>
            {subtitle && (
              <p className="text-xs text-slate-500">{subtitle}</p>
            )}
          </div>
        </div>
        {linkedCliente && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (onViewClient) {
                onViewClient(linkedCliente as Cliente);
              }
            }}
            className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg hover:bg-emerald-100 transition-colors text-sm"
          >
            <UserCircle size={16} />
            <span className="font-medium truncate max-w-[120px]">{linkedCliente.nome}</span>
            {linkedCliente.status && <KanbanStatusBadge status={linkedCliente.status} label={getDisplayName(linkedCliente.status)} />}
            <ExternalLink size={14} />
          </button>
        )}
        {!linkedCliente && canShowContactInfo && (
          <span className="text-xs text-slate-400 flex-shrink-0">Clique para ver info</span>
        )}
      </div>

      <div
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-3 space-y-1 bg-[#efeae2]"
        style={{
          backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23d5cfc4\' fill-opacity=\'0.15\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")',
        }}
      >
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="animate-spin text-blue-600" size={28} />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-slate-400 text-sm">
            Nenhuma mensagem encontrada
          </div>
        ) : (
          messages.map((msg, index) => {
            if (!msg.text && msg.messageType !== 'audio') return null;

            const isMe = msg.fromMe;
            const icon = getMessageIcon(msg);
            const uniqueKey = `${msg.id}-${msg.timestamp}-${index}`;

            return (
              <div key={uniqueKey}>
                {shouldShowDateSeparator(msg, index) && (
                  <div className="flex justify-center my-3">
                    <span className="bg-white/90 px-4 py-1 rounded-full text-xs text-slate-500 shadow-sm">
                      {formatDateSeparator(msg.timestamp)}
                    </span>
                  </div>
                )}
                <div className={`flex ${isMe ? 'justify-end' : 'justify-start'} mb-0.5`}>
                  <div className={`max-w-[70%] rounded-lg px-3 py-2 shadow-sm ${
                    isMe
                      ? 'bg-[#d9fdd3] text-slate-900'
                      : 'bg-white text-slate-900'
                  }`}>
                    {!isMe && isGroup && (
                      <p className={`text-xs font-semibold mb-0.5 ${getParticipantColor(msg.participantJid)}`}>
                        {(msg.participantName && msg.participantName.trim())
                          ? msg.participantName
                          : msg.participantJid
                            ? formatPhoneNumber(msg.participantJid)
                            : (msg.pushName && msg.pushName.trim())
                              ? msg.pushName
                              : 'Participante'}
                      </p>
                    )}
                    {msg.messageType === 'audio' ? (
                      <AudioPlayer
                        messageId={msg.messageId}
                        instanceName={msg.instanceName || instanceName}
                        existingBase64={msg.mediaBase64}
                        fromMe={msg.fromMe}
                      />
                    ) : (
                      <>
                        {icon && <div className="mb-1">{icon}</div>}
                        <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">{msg.text}</p>
                      </>
                    )}
                    <div className={`flex items-center gap-1 mt-0.5 ${isMe ? 'justify-end' : 'justify-start'}`}>
                      <span className="text-[10px] text-slate-500">{formatTime(msg.timestamp)}</span>
                      {getStatusIcon(msg)}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {showScrollDown && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-24 right-8 w-10 h-10 bg-white rounded-full shadow-lg flex items-center justify-center hover:bg-slate-50 transition-colors border border-slate-200"
        >
          <ArrowDown size={20} className="text-slate-600" />
        </button>
      )}

      <div className="flex-shrink-0 bg-white border-t border-slate-200 px-4 py-3 relative">
        {readOnly ? (
          <div className="flex items-center justify-center py-2 text-xs text-slate-400 gap-2">
            <span>👁</span>
            <span>Visualizando em modo leitura — envio desabilitado</span>
          </div>
        ) : (
          <>
            {showQuickMenu && filteredQuickReplies.length > 0 && (
              <div
                ref={quickMenuRef}
                className="absolute bottom-full left-4 right-4 mb-1 bg-white rounded-xl shadow-lg border border-slate-200 max-h-52 overflow-y-auto z-10"
              >
                {filteredQuickReplies.map((reply, index) => (
                  <button
                    key={reply.id}
                    onMouseDown={e => { e.preventDefault(); handleSelectQuickReply(reply); }}
                    className={`w-full text-left px-4 py-2.5 flex flex-col gap-0.5 transition-colors ${
                      index === selectedQuickIndex
                        ? 'bg-blue-50 text-blue-900'
                        : 'hover:bg-slate-50 text-slate-800'
                    }`}
                  >
                    <span className="text-sm font-medium">{reply.title}</span>
                    <span className="text-xs text-slate-400 truncate">{reply.message}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={messageText}
              onChange={e => {
                const val = e.target.value;
                setMessageText(val);
                setSelectedQuickIndex(0);
                setShowQuickMenu(val.startsWith('/'));
              }}
              onKeyDown={handleKeyDown}
              placeholder="Digite uma mensagem... (/ para respostas rápidas)"
              rows={1}
              className="flex-1 resize-none border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all max-h-32 bg-slate-50"
              style={{ minHeight: '42px' }}
            />
            <button
              onClick={handleSend}
              disabled={!messageText.trim() || sending}
              className="w-10 h-10 bg-emerald-600 hover:bg-emerald-700 text-white rounded-full flex items-center justify-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
            >
              {sending ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <Send size={18} />
              )}
            </button>
            </div>
          </>
        )}
      </div>

      {showContactModal && (
        <WhatsAppContactModal
          jid={chat.id}
          displayName={displayName}
          onClose={() => setShowContactModal(false)}
          onViewClient={onViewClient}
        />
      )}
    </div>
  );
}
