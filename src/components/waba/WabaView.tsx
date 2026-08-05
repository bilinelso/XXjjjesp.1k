import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BadgeCheck, Search, AlertTriangle, Clock, User, Send, ExternalLink, MessageSquare } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { wabaApi } from '../../lib/wabaApi';
import type {
  WabaChatWithContact,
  WabaMessage,
  WabaSendResult,
  WabaTemplate,
} from '../../lib/wabaApi';
import { WabaTemplatePicker } from './WabaTemplatePicker';
import {
  computeWindow,
  formatMessageTime,
  formatRelativeTime,
  formatRemaining,
  formatWabaPhone,
  messageStatusLabel,
  resolveChatName,
  WINDOW_WARNING_MS,
} from './wabaUtils';

const CHAT_SELECT = '*, waba_contacts(*, clientes(id, nome))';

type WabaViewProps = {
  onUnreadCountChange?: (count: number) => void;
  onOpenCliente?: (clienteId: string) => void;
};

type Feedback = { type: 'error' | 'info' | 'success'; text: string } | null;

export const WabaView: React.FC<WabaViewProps> = ({ onUnreadCountChange, onOpenCliente }) => {
  const { user } = useAuth();

  const [chats, setChats] = useState<WabaChatWithContact[]>([]);
  const [messages, setMessages] = useState<WabaMessage[]>([]);
  const [templates, setTemplates] = useState<WabaTemplate[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [loadingChats, setLoadingChats] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  // A janela de 24h pode virar com a tela aberta — este relógio força o recálculo.
  const [now, setNow] = useState(() => Date.now());

  const selectedChatIdRef = useRef<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    selectedChatIdRef.current = selectedChatId;
  }, [selectedChatId]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  // ── Carregamento ───────────────────────────────────────────────────────────
  // Sem filtro por usuário: a RLS já devolve apenas as threads do assessor logado.

  const loadChats = useCallback(async () => {
    const { data, error } = await supabase
      .from('waba_chats')
      .select(CHAT_SELECT)
      .order('last_message_timestamp', { ascending: false, nullsFirst: false });

    if (!error) setChats((data || []) as WabaChatWithContact[]);
    setLoadingChats(false);
  }, []);

  const loadTemplates = useCallback(async () => {
    const { data, error } = await supabase
      .from('waba_templates')
      .select('*')
      .eq('status', 'APPROVED')
      .order('name', { ascending: true });

    if (!error) setTemplates((data || []) as WabaTemplate[]);
  }, []);

  const loadMessages = useCallback(async (chatId: string) => {
    setLoadingMessages(true);
    const { data, error } = await supabase
      .from('waba_messages')
      .select('*')
      .eq('chat_id', chatId)
      .order('timestamp', { ascending: true });

    if (!error && selectedChatIdRef.current === chatId) {
      setMessages((data || []) as WabaMessage[]);
    }
    setLoadingMessages(false);
  }, []);

  useEffect(() => {
    if (!user) return;
    loadChats();
    loadTemplates();
  }, [user, loadChats, loadTemplates]);

  // ── Realtime ───────────────────────────────────────────────────────────────
  // UM canal só para o módulo, com callbacks para as duas tabelas.

  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`waba-module-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'waba_chats' },
        () => { loadChats(); }
      )
      .on<WabaMessage>(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'waba_messages' },
        payload => {
          const message = payload.new as WabaMessage | undefined;
          if (!message || message.chat_id !== selectedChatIdRef.current) return;

          setMessages(prev => {
            const index = prev.findIndex(m => m.id === message.id);
            if (index >= 0) {
              const next = [...prev];
              next[index] = message;
              return next;
            }
            return [...prev, message].sort(
              (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
            );
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, loadChats]);

  // ── Derivados ──────────────────────────────────────────────────────────────

  const totalUnread = useMemo(
    () => chats.reduce((sum, chat) => sum + (chat.unread_count || 0), 0),
    [chats]
  );

  useEffect(() => {
    onUnreadCountChange?.(totalUnread);
  }, [totalUnread, onUnreadCountChange]);

  const filteredChats = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return chats;
    const digits = term.replace(/\D/g, '');
    return chats.filter(chat => {
      const name = resolveChatName(chat).toLowerCase();
      const phone = chat.waba_contacts?.contact_phone || '';
      return name.includes(term) || (digits.length > 0 && phone.includes(digits));
    });
  }, [chats, search]);

  const selectedChat = useMemo(
    () => chats.find(chat => chat.id === selectedChatId) || null,
    [chats, selectedChatId]
  );

  const windowState = useMemo(
    () => computeWindow(selectedChat?.waba_contacts?.last_inbound_at, now),
    [selectedChat, now]
  );

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, selectedChatId]);

  // Enquanto a conversa está aberta ela permanece lida, mesmo que chegue mensagem nova.
  useEffect(() => {
    if (!selectedChat || (selectedChat.unread_count || 0) === 0) return;
    const chatId = selectedChat.id;
    setChats(prev => prev.map(c => (c.id === chatId ? { ...c, unread_count: 0 } : c)));
    supabase.from('waba_chats').update({ unread_count: 0 }).eq('id', chatId).then(() => {});
  }, [selectedChat]);

  // ── Ações ──────────────────────────────────────────────────────────────────

  // A zeragem do unread_count fica no efeito acima, que também cobre mensagens
  // que chegam com a conversa já aberta.
  const handleSelectChat = (chat: WabaChatWithContact) => {
    setSelectedChatId(chat.id);
    selectedChatIdRef.current = chat.id;
    setMessages([]);
    setDraft('');
    setFeedback(null);
    loadMessages(chat.id);
  };

  /** Recarrega apenas o chat selecionado — usado após WINDOW_CLOSED. */
  const reloadSelectedChat = useCallback(async (chatId: string) => {
    const { data } = await supabase.from('waba_chats').select(CHAT_SELECT).eq('id', chatId).maybeSingle();
    if (data) {
      setChats(prev => prev.map(c => (c.id === chatId ? (data as WabaChatWithContact) : c)));
    }
  }, []);

  const handleSendResult = async (result: WabaSendResult, chatId: string): Promise<boolean> => {
    if (result.success) return true;

    switch (result.error_code) {
      case 'WINDOW_CLOSED':
        // O backend já corrigiu o last_inbound_at — recarregar o contato faz o
        // composer trocar sozinho para o modo template.
        await reloadSelectedChat(chatId);
        setNow(Date.now());
        setFeedback({
          type: 'error',
          text: 'A janela de 24h fechou. Só é possível enviar um template aprovado.',
        });
        break;
      case 'TEMPLATE_NOT_APPROVED':
        await loadTemplates();
        setFeedback({
          type: 'error',
          text: 'Este template não está mais aprovado na Meta. A lista foi atualizada.',
        });
        break;
      case 'RATE_LIMITED':
        setFeedback({ type: 'error', text: 'Limite de envio atingido. Tente novamente em instantes.' });
        break;
      default:
        setFeedback({ type: 'error', text: result.message || 'Não foi possível enviar a mensagem.' });
    }
    return false;
  };

  const handleSendText = async () => {
    const text = draft.trim();
    if (!selectedChat || !text || sending) return;

    setSending(true);
    setFeedback(null);
    const result = await wabaApi.sendText(selectedChat.id, text);
    const ok = await handleSendResult(result, selectedChat.id);
    if (ok) {
      setDraft('');
      loadMessages(selectedChat.id);
      loadChats();
    }
    setSending(false);
  };

  const handleSendTemplate = async (template: WabaTemplate, variables: string[]) => {
    if (!selectedChat || sending) return;

    setSending(true);
    setFeedback(null);
    const result = await wabaApi.sendTemplate(
      selectedChat.id,
      template.name,
      template.language,
      variables
    );
    const ok = await handleSendResult(result, selectedChat.id);
    if (ok) {
      setFeedback({ type: 'success', text: 'Template enviado.' });
      loadMessages(selectedChat.id);
      loadChats();
    }
    setSending(false);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="h-[calc(100vh-180px)] flex flex-col">
      <div className="flex items-center gap-2 px-4 py-2 bg-white border-b border-slate-200 flex-shrink-0">
        <BadgeCheck size={16} className="text-emerald-600" />
        <span className="text-sm font-medium text-slate-700">WhatsApp Oficial (API)</span>
        <span className="text-xs text-slate-400">+55 11 93623-5989</span>
      </div>

      <div className="flex-1 flex min-h-0 bg-white border border-t-0 border-slate-200 rounded-b-lg overflow-hidden">
        {/* Lista de conversas */}
        <div className="w-[320px] flex-shrink-0 border-r border-slate-200 flex flex-col min-h-0">
          <div className="p-3 border-b border-slate-100">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar por nome ou telefone"
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loadingChats ? (
              <p className="p-4 text-sm text-slate-400">Carregando conversas...</p>
            ) : filteredChats.length === 0 ? (
              <div className="p-6 text-center">
                <MessageSquare size={28} className="mx-auto text-slate-300 mb-2" />
                <p className="text-sm text-slate-500">
                  {search ? 'Nenhuma conversa encontrada.' : 'Nenhuma conversa ainda.'}
                </p>
                {!search && (
                  <p className="text-xs text-slate-400 mt-1">
                    As conversas aparecem aqui quando um cliente escreve para o número oficial.
                  </p>
                )}
              </div>
            ) : (
              filteredChats.map(chat => {
                const chatWindow = computeWindow(chat.waba_contacts?.last_inbound_at, now);
                const unread = chat.unread_count || 0;
                return (
                  <button
                    key={chat.id}
                    onClick={() => handleSelectChat(chat)}
                    className={`w-full text-left px-3 py-2.5 border-b border-slate-100 transition-colors ${
                      chat.id === selectedChatId ? 'bg-[#E6F1FB]' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        title={chatWindow.open ? 'Janela de 24h aberta' : 'Janela de 24h fechada'}
                        className={`w-2 h-2 rounded-full flex-shrink-0 ${
                          chatWindow.open ? 'bg-emerald-500' : 'bg-slate-300'
                        }`}
                      />
                      <span className="flex-1 text-sm font-medium text-slate-800 truncate">
                        {resolveChatName(chat)}
                      </span>
                      <span className="text-[11px] text-slate-400 flex-shrink-0">
                        {formatRelativeTime(chat.last_message_timestamp)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1 pl-4">
                      <span className="flex-1 text-xs text-slate-500 truncate">
                        {chat.last_message_from_me ? 'Você: ' : ''}
                        {chat.last_message_text || 'Sem mensagens'}
                      </span>
                      {unread > 0 && (
                        <span className="px-1.5 py-0.5 bg-red-500 text-white text-[10px] rounded-full font-medium min-w-[18px] text-center leading-none">
                          {unread > 99 ? '99+' : unread}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Conversa */}
        <div className="flex-1 flex flex-col min-h-0">
          {!selectedChat ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
              <BadgeCheck size={36} className="text-slate-300 mb-3" />
              <p className="text-sm text-slate-500">Selecione uma conversa para começar.</p>
              <p className="text-xs text-slate-400 mt-1 max-w-sm">
                Você vê apenas as suas próprias conversas — cada assessor tem uma thread separada com o contato.
              </p>
            </div>
          ) : (
            <>
              <div className="px-4 py-2.5 border-b border-slate-200 flex items-center gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">
                    {resolveChatName(selectedChat)}
                  </p>
                  <p className="text-xs text-slate-400">
                    {formatWabaPhone(selectedChat.waba_contacts?.contact_phone)}
                  </p>
                </div>

                <div className="ml-auto flex items-center gap-3">
                  {windowState.open ? (
                    <span
                      className={`flex items-center gap-1.5 text-xs ${
                        windowState.remainingMs < WINDOW_WARNING_MS ? 'text-amber-600 font-medium' : 'text-slate-500'
                      }`}
                    >
                      <Clock size={13} />
                      Janela aberta · {formatRemaining(windowState.remainingMs)}
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 text-xs text-slate-500">
                      <Clock size={13} />
                      Janela fechada
                    </span>
                  )}

                  {selectedChat.waba_contacts?.cliente_id && onOpenCliente && (
                    <button
                      onClick={() => onOpenCliente(selectedChat.waba_contacts!.cliente_id!)}
                      className="flex items-center gap-1 text-xs text-[#0C447C] hover:underline"
                    >
                      <User size={13} />
                      Ficha do cliente
                      <ExternalLink size={11} />
                    </button>
                  )}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-4 py-3 bg-slate-50 space-y-2">
                {loadingMessages ? (
                  <p className="text-sm text-slate-400">Carregando mensagens...</p>
                ) : messages.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center mt-6">
                    Nenhuma mensagem nesta conversa ainda.
                  </p>
                ) : (
                  messages.map(message => {
                    const statusLabel = messageStatusLabel(message.status);
                    return (
                      <div
                        key={message.id}
                        className={`flex ${message.from_me ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[70%] rounded-lg px-3 py-2 ${
                            message.from_me
                              ? 'bg-[#E6F1FB] text-slate-800'
                              : 'bg-white border border-slate-200 text-slate-800'
                          }`}
                        >
                          {message.template_name && (
                            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">
                              Template · {message.template_name}
                            </p>
                          )}
                          <p className="text-sm whitespace-pre-wrap break-words">
                            {message.message_text}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] text-slate-400">
                              {formatMessageTime(message.timestamp)}
                            </span>
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
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Composer — alterna conforme a janela de 24h */}
              <div className="border-t border-slate-200 p-3 flex-shrink-0">
                {feedback && (
                  <div
                    className={`mb-2 px-3 py-2 rounded-lg text-xs ${
                      feedback.type === 'error'
                        ? 'bg-red-50 text-red-700 border border-red-200'
                        : feedback.type === 'success'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-slate-50 text-slate-600 border border-slate-200'
                    }`}
                  >
                    {feedback.text}
                  </div>
                )}

                {windowState.open ? (
                  <div className="flex items-end gap-2">
                    <textarea
                      value={draft}
                      onChange={e => setDraft(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSendText();
                        }
                      }}
                      placeholder="Escreva uma mensagem..."
                      rows={2}
                      className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none"
                    />
                    <button
                      onClick={handleSendText}
                      disabled={sending || !draft.trim()}
                      className="flex items-center gap-1.5 px-4 py-2 bg-[#0C447C] text-white rounded-lg text-sm font-medium hover:bg-[#0a3a68] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <Send size={15} />
                      {sending ? 'Enviando' : 'Enviar'}
                    </button>
                  </div>
                ) : (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                    <p className="flex items-center gap-2 text-sm font-medium text-amber-800 mb-1">
                      <AlertTriangle size={15} />
                      Modo template
                    </p>
                    <p className="text-xs text-amber-700 mb-3">
                      O cliente não responde há mais de 24h. Só é possível enviar um template aprovado.
                    </p>
                    <WabaTemplatePicker
                      templates={templates}
                      sending={sending}
                      onSend={handleSendTemplate}
                    />
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
