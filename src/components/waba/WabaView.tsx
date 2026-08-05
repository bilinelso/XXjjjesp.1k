import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BadgeCheck, Search, AlertTriangle, Clock, User, Send, ExternalLink, MessageSquare, ArrowLeft, MoreVertical, Copy, RotateCw, RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { MD_QUERY } from '../../lib/viewRouting';
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
  formatTimeAgo,
  formatWabaPhone,
  messageStatusLabel,
  resolveChatName,
  WINDOW_WARNING_MS,
} from './wabaUtils';

const CHAT_SELECT = '*, waba_contacts(*, clientes(id, nome))';

type WabaViewProps = {
  onUnreadCountChange?: (count: number) => void;
  onOpenCliente?: (clienteId: string) => void;
  /** Conversa a abrir ao chegar de fora (menu do telefone). */
  openChatId?: string | null;
  /** Avisa o App para limpar o `openChatId` e não reabrir a cada re-render. */
  onOpenChatHandled?: () => void;
};

type Feedback = { type: 'error' | 'info' | 'success'; text: string } | null;

/** O que precisa ser guardado para reenviar uma mensagem que falhou. */
type SendPayload =
  | { kind: 'text'; text: string }
  | { kind: 'template'; template: WabaTemplate; variables: string[] };

/**
 * Mensagem na lista. Enquanto o `waba-proxy` não responde ela existe só no
 * cliente, identificada por `localId` — a linha real chega depois pelo realtime
 * (ou pela resposta do proxy) e substitui esta.
 */
type LocalMessage = WabaMessage & {
  localId?: string;
  pendingState?: 'sending' | 'failed';
  retry?: SendPayload;
};

/** Mesmo formato que o backend grava, para não haver salto visual na troca. */
function templateLogText(name: string, variables: string[]): string {
  return variables.length > 0 ? `[Template: ${name}] ${variables.join(' | ')}` : `[Template: ${name}]`;
}

function newLocalId(): string {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Insere ou atualiza uma linha vinda do banco.
 *
 * Casa por `id` e também por `wamid`: a mensagem otimista carrega o `wamid`
 * devolvido pelo proxy mas tem `id` temporário, então sem a comparação por
 * `wamid` o INSERT do realtime entraria como uma segunda cópia.
 *
 * Quando encontra a correspondente, substitui **na posição já ocupada**. O
 * relógio local e o do servidor divergem, e reordenar faria a mensagem saltar.
 */
function upsertMessage(prev: LocalMessage[], incoming: WabaMessage): LocalMessage[] {
  let index = prev.findIndex(
    m => m.id === incoming.id || (!!incoming.wamid && m.wamid === incoming.wamid)
  );

  // Corrida: o INSERT pode chegar antes de o proxy devolver o `wamid`, e aí a
  // otimista ainda não tem por onde casar. Casa pelo texto para não piscar uma
  // duplicata. Só uma otimista com o mesmo texto pode estar em voo por vez
  // (ver `inFlightRef`), então não há ambiguidade.
  if (index < 0 && incoming.from_me) {
    index = prev.findIndex(
      m => m.pendingState === 'sending' && m.message_text === incoming.message_text
    );
  }

  if (index >= 0) {
    const next = [...prev];
    next[index] = incoming;
    return next;
  }

  return [...prev, incoming].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
}

export const WabaView: React.FC<WabaViewProps> = ({
  onUnreadCountChange,
  onOpenCliente,
  openChatId,
  onOpenChatHandled,
}) => {
  const { user, profile } = useAuth();
  // Abaixo de `md` o módulo vira coluna única: ou a lista, ou a conversa.
  const isMobile = !useMediaQuery(MD_QUERY);
  // Sincronizar template é configuração, não atendimento.
  const isMaster = !!profile?.is_master;

  const [chats, setChats] = useState<WabaChatWithContact[]>([]);
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [templates, setTemplates] = useState<WabaTemplate[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [loadingChats, setLoadingChats] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [draft, setDraft] = useState('');
  const [feedback, setFeedback] = useState<Feedback>(null);
  /** Texto salvo quando a janela fecha no meio do envio — volta se ela reabrir. */
  const [recoveredDraft, setRecoveredDraft] = useState('');
  // Menu do header no mobile (telefone e ficha do cliente saíram da barra).
  const [menuOpen, setMenuOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<Feedback>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [lastSyncLoaded, setLastSyncLoaded] = useState(false);
  // A janela de 24h pode virar com a tela aberta — este relógio força o recálculo.
  const [now, setNow] = useState(() => Date.now());

  const selectedChatIdRef = useRef<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  /** Única trava que sobrou: impede o duplo clique reenviar o mesmo texto. */
  const inFlightRef = useRef<Set<string>>(new Set());

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

  /** Quando a Meta foi espelhada pela última vez — vale para qualquer status. */
  const loadLastSyncedAt = useCallback(async () => {
    const { data } = await supabase
      .from('waba_templates')
      .select('synced_at')
      .order('synced_at', { ascending: false })
      .limit(1);

    const row = (data || [])[0] as { synced_at?: string | null } | undefined;
    setLastSyncedAt(row?.synced_at || null);
    setLastSyncLoaded(true);
  }, []);

  useEffect(() => {
    if (!user) return;
    loadChats();
    loadTemplates();
    loadLastSyncedAt();
  }, [user, loadChats, loadTemplates, loadLastSyncedAt]);

  const handleSyncTemplates = async () => {
    if (syncing) return;

    setSyncing(true);
    setSyncFeedback(null);
    const result = await wabaApi.syncTemplates();

    if (!result.success) {
      setSyncFeedback({ type: 'error', text: result.error });
      setSyncing(false);
      return;
    }

    const approved = result.por_status?.APPROVED ?? 0;
    setSyncFeedback({
      type: 'success',
      text: `${result.sincronizados} template(s) sincronizado(s) · ${approved} aprovado(s)${
        result.marcados_removidos > 0 ? ` · ${result.marcados_removidos} removido(s) na Meta` : ''
      }`,
    });
    setLastSyncedAt(result.synced_at);
    setLastSyncLoaded(true);
    await loadTemplates();
    setSyncing(false);
  };

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

          setMessages(prev => upsertMessage(prev, message));
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

  /**
   * No mobile o status da janela vira subtítulo do header em vez de disputar
   * espaço horizontal com o nome. A lógica é a mesma do `computeWindow`; muda
   * só onde aparece e a cor.
   */
  const windowSubtitle = windowState.open
    ? {
        text: `Janela aberta · ${formatRemaining(windowState.remainingMs)}`,
        className:
          windowState.remainingMs < WINDOW_WARNING_MS ? 'text-amber-600' : 'text-emerald-600',
      }
    : { text: 'Janela fechada · só template', className: 'text-slate-400' };

  // Texto resgatado de um WINDOW_CLOSED volta ao campo assim que a janela reabre.
  useEffect(() => {
    if (!recoveredDraft || !windowState.open) return;
    setDraft(current => current || recoveredDraft);
    setRecoveredDraft('');
  }, [recoveredDraft, windowState.open]);

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
  const selectChat = useCallback((chatId: string) => {
    setSelectedChatId(chatId);
    selectedChatIdRef.current = chatId;
    setMessages([]);
    setDraft('');
    setRecoveredDraft('');
    setFeedback(null);
    loadMessages(chatId);
  }, [loadMessages]);

  const handleSelectChat = (chat: WabaChatWithContact) => selectChat(chat.id);

  /**
   * Abre uma conversa vinda de fora do módulo (menu do telefone).
   *
   * A conversa pode ter acabado de ser criada pela RPC e não estar em `chats` —
   * daí o SELECT antes de selecionar, senão a tela abriria vazia.
   */
  useEffect(() => {
    if (!openChatId || !user) return;
    let cancelled = false;

    (async () => {
      const { data } = await supabase
        .from('waba_chats')
        .select(CHAT_SELECT)
        .eq('id', openChatId)
        .maybeSingle();

      if (cancelled) return;

      if (data) {
        const chat = data as WabaChatWithContact;
        setChats(prev =>
          prev.some(c => c.id === chat.id)
            ? prev.map(c => (c.id === chat.id ? chat : c))
            : [chat, ...prev]
        );
      }

      selectChat(openChatId);
      onOpenChatHandled?.();
    })();

    return () => { cancelled = true; };
  }, [openChatId, user, selectChat, onOpenChatHandled]);

  // No celular, abrir uma conversa empilha uma entrada de histórico: o botão
  // voltar do aparelho retorna à lista em vez de sair do módulo. A URL não muda
  // (continua `?view=waba`), então o roteador do App não é afetado.
  useEffect(() => {
    if (!isMobile || !selectedChatId) return;

    window.history.pushState({ ...window.history.state, wabaChat: selectedChatId }, '');
    const onPopState = () => setSelectedChatId(null);

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [isMobile, selectedChatId]);

  /** Seta de voltar do header: consome a entrada empilhada acima. */
  const handleBack = () => {
    window.history.back();
  };

  // O menu nunca sobrevive à troca de conversa nem à volta para o desktop.
  useEffect(() => {
    setMenuOpen(false);
  }, [selectedChatId, isMobile]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [menuOpen]);

  const handleCopyPhone = async (phone: string) => {
    setMenuOpen(false);
    try {
      await navigator.clipboard.writeText(phone);
      setFeedback({ type: 'success', text: `Telefone copiado: ${phone}` });
    } catch {
      setFeedback({ type: 'info', text: `Telefone: ${phone}` });
    }
  };

  /** Recarrega apenas o chat selecionado — usado após WINDOW_CLOSED. */
  const reloadSelectedChat = useCallback(async (chatId: string) => {
    const { data } = await supabase.from('waba_chats').select(CHAT_SELECT).eq('id', chatId).maybeSingle();
    if (data) {
      setChats(prev => prev.map(c => (c.id === chatId ? (data as WabaChatWithContact) : c)));
    }
  }, []);

  /** Atualiza a prévia na lista sem refazer o SELECT — o realtime confirma depois. */
  const touchChatPreview = (chatId: string, text: string, timestamp: string) => {
    setChats(prev =>
      prev
        .map(c =>
          c.id === chatId
            ? { ...c, last_message_text: text, last_message_timestamp: timestamp, last_message_from_me: true }
            : c
        )
        .sort(
          (a, b) =>
            new Date(b.last_message_timestamp || 0).getTime() -
            new Date(a.last_message_timestamp || 0).getTime()
        )
    );
  };

  const markFailed = (localId: string, payload: SendPayload) => {
    setMessages(prev =>
      prev.map(m =>
        m.localId === localId ? { ...m, pendingState: 'failed', status: 'failed', retry: payload } : m
      )
    );
  };

  const dropOptimistic = (localId: string) => {
    setMessages(prev => prev.filter(m => m.localId !== localId));
  };

  const handleSendFailure = async (
    result: Extract<WabaSendResult, { success: false }>,
    chatId: string,
    localId: string,
    payload: SendPayload
  ) => {
    switch (result.error_code) {
      case 'WINDOW_CLOSED': {
        // O composer vira modo template, então devolver o texto ao campo seria
        // inútil: ele vai para o aviso (para copiar) e fica guardado para
        // reaparecer se a janela reabrir. O que foi escrito nunca se perde.
        dropOptimistic(localId);
        if (payload.kind === 'text') setRecoveredDraft(payload.text);

        // O backend já corrigiu o last_inbound_at — recarregar o contato faz o
        // composer trocar sozinho para o modo template.
        await reloadSelectedChat(chatId);
        setNow(Date.now());
        setFeedback({
          type: 'error',
          text:
            payload.kind === 'text'
              ? `A janela de 24h fechou e a mensagem não foi enviada. Seu texto: "${payload.text}"`
              : 'A janela de 24h fechou. Só é possível enviar um template aprovado.',
        });
        break;
      }
      case 'TEMPLATE_NOT_APPROVED':
        markFailed(localId, payload);
        await loadTemplates();
        setFeedback({
          type: 'error',
          text: 'Este template não está mais aprovado na Meta. A lista foi atualizada.',
        });
        break;
      case 'RATE_LIMITED':
        markFailed(localId, payload);
        setFeedback({ type: 'error', text: 'Limite de envio atingido. Tente novamente em instantes.' });
        break;
      default:
        markFailed(localId, payload);
        setFeedback({ type: 'error', text: result.message || 'Não foi possível enviar a mensagem.' });
    }
  };

  /**
   * Dispara o envio e reconcilia a mensagem otimista com a resposta.
   *
   * A UI já foi atualizada antes desta chamada — aqui só se resolve o desfecho.
   */
  const dispatchSend = async (chatId: string, payload: SendPayload, localId: string) => {
    const guardKey = `${chatId}::${payload.kind === 'text' ? payload.text : templateLogText(payload.template.name, payload.variables)}`;
    inFlightRef.current.add(guardKey);

    try {
      const result =
        payload.kind === 'text'
          ? await wabaApi.sendText(chatId, payload.text)
          : await wabaApi.sendTemplate(
              chatId,
              payload.template.name,
              payload.template.language,
              payload.variables
            );

      if (!result.success) {
        await handleSendFailure(result, chatId, localId, payload);
        return;
      }

      setMessages(prev => {
        // Corrida: o INSERT do realtime pode ter chegado antes desta resposta.
        // Se a linha real já está na lista, a otimista simplesmente sai.
        const realAlreadyArrived = prev.some(m => !m.localId && m.wamid === result.wamid);
        if (realAlreadyArrived) return prev.filter(m => m.localId !== localId);

        return prev.map(m =>
          m.localId === localId
            ? { ...m, wamid: result.wamid, status: 'sent', pendingState: undefined, retry: undefined }
            : m
        );
      });
    } finally {
      inFlightRef.current.delete(guardKey);
    }
  };

  /** Coloca a mensagem na tela na hora e devolve o controle ao assessor. */
  const startSend = (chatId: string, payload: SendPayload) => {
    const text =
      payload.kind === 'text'
        ? payload.text
        : templateLogText(payload.template.name, payload.variables);

    const guardKey = `${chatId}::${text}`;
    if (inFlightRef.current.has(guardKey)) return;

    const localId = newLocalId();
    const timestamp = new Date().toISOString();

    const optimistic: LocalMessage = {
      id: localId,
      chat_id: chatId,
      wamid: null,
      from_me: true,
      sent_by_user_id: user?.id ?? null,
      message_text: text,
      message_type: payload.kind === 'template' ? 'template' : 'text',
      media_url: null,
      status: null,
      timestamp,
      template_name: payload.kind === 'template' ? payload.template.name : null,
      template_variables: payload.kind === 'template' ? payload.variables : null,
      pricing_category: null,
      localId,
      pendingState: 'sending',
    };

    setFeedback(null);
    setMessages(prev => [...prev, optimistic]);
    touchChatPreview(chatId, text, timestamp);

    void dispatchSend(chatId, payload, localId);
  };

  // Nenhum `await` aqui: o campo limpa, a mensagem aparece e o foco volta na
  // hora. Sem `loadMessages`/`loadChats` — a mensagem já está na lista e o
  // realtime confirma o resto.
  const handleSendText = () => {
    const text = draft.trim();
    if (!selectedChat || !text) return;

    setDraft('');
    startSend(selectedChat.id, { kind: 'text', text });
    textareaRef.current?.focus();
  };

  const handleSendTemplate = (template: WabaTemplate, variables: string[]) => {
    if (!selectedChat) return;
    startSend(selectedChat.id, { kind: 'template', template, variables });
  };

  /** Nova tentativa a partir de uma mensagem que falhou. */
  const handleRetry = (message: LocalMessage) => {
    if (!message.localId || !message.retry) return;
    dropOptimistic(message.localId);
    startSend(message.chat_id, message.retry);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  // No mobile, uma coisa por vez — renderizado condicionalmente (e não escondido
  // com `hidden`) para não manter as duas colunas montadas à toa.
  const showList = !isMobile || selectedChatId === null;
  const showConversation = !isMobile || selectedChatId !== null;

  // Mesmo botão no cabeçalho do módulo e no aviso do modo template — os dois
  // compartilham o estado de `syncing`, então nunca divergem.
  const syncButton = (
    <button
      onClick={handleSyncTemplates}
      disabled={syncing}
      className="flex items-center gap-1.5 px-2.5 py-1.5 min-h-[36px] rounded-lg text-xs font-medium text-slate-600 border border-slate-200 hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
    >
      <RefreshCw size={13} className={syncing ? 'animate-spin' : ''} />
      {syncing ? 'Sincronizando...' : 'Sincronizar templates'}
    </button>
  );

  /** O texto depende de quem está vendo: master resolve, assessor pede. */
  const templateEmptyState = isMaster ? (
    <div className="space-y-2">
      <p className="text-sm text-slate-600">
        Nenhum template aprovado no CRM. Os templates são criados e aprovados na Meta e só
        aparecem aqui depois de sincronizados.
      </p>
      <div>{syncButton}</div>
      {syncFeedback && (
        <p className={`text-xs ${syncFeedback.type === 'error' ? 'text-red-700' : 'text-emerald-700'}`}>
          {syncFeedback.text}
        </p>
      )}
    </div>
  ) : (
    <p className="text-sm text-slate-600">
      Nenhum template aprovado disponível. Peça a um administrador para sincronizar os
      templates aprovados na Meta.
    </p>
  );

  return (
    // 100dvh porque no iOS o 100vh ignora a barra do Safari e esconde o composer.
    // Mobile desconta só a barra superior; no desktop o espaçamento é o de antes.
    <div className="h-[calc(100dvh-52px)] lg:h-[calc(100dvh-180px)] flex flex-col">
      {showList && (
        <>
          <div className="flex items-center gap-2 px-4 py-2 bg-white border-b border-slate-200 flex-shrink-0">
            <BadgeCheck size={16} className="text-emerald-600" />
            <span className="text-sm font-medium text-slate-700">WhatsApp Oficial (API)</span>
            <span className="text-xs text-slate-400">+55 11 93623-5989</span>

            {isMaster && (
              <div className="ml-auto flex items-center gap-2 flex-shrink-0">
                {lastSyncLoaded && (
                  <span className="text-[11px] text-slate-400 whitespace-nowrap hidden sm:inline">
                    {lastSyncedAt
                      ? `Templates: ${formatTimeAgo(lastSyncedAt)}`
                      : 'Templates: nunca sincronizado'}
                  </span>
                )}
                {syncButton}
              </div>
            )}
          </div>

          {isMaster && syncFeedback && (
            <div
              className={`px-4 py-2 text-xs border-b flex-shrink-0 ${
                syncFeedback.type === 'error'
                  ? 'bg-red-50 text-red-700 border-red-200'
                  : 'bg-emerald-50 text-emerald-700 border-emerald-200'
              }`}
            >
              {syncFeedback.text}
            </div>
          )}
        </>
      )}

      <div className="flex-1 flex min-h-0 bg-white border border-t-0 border-slate-200 md:rounded-b-lg overflow-hidden">
        {/* Lista de conversas */}
        {showList && (
        <div className="w-full md:w-[320px] md:flex-shrink-0 md:border-r border-slate-200 flex flex-col min-h-0">
          <div className="p-3 border-b border-slate-100">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar por nome ou telefone"
                // text-base no mobile: abaixo de 16px o iOS dá zoom ao focar.
                className="w-full pl-9 pr-3 py-2 text-base md:text-sm border border-slate-200 rounded-lg"
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
                    className={`w-full text-left px-3 py-3 min-h-[44px] border-b border-slate-100 transition-colors ${
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
        )}

        {/* Conversa */}
        {showConversation && (
        <div className="flex-1 flex flex-col min-h-0">
          {!selectedChat ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
              <BadgeCheck size={36} className="text-slate-300 mb-3" />
              <p className="text-sm text-slate-500">Selecione uma conversa para começar.</p>
              <p className="text-xs text-slate-400 mt-1 max-w-sm">
                Você vê apenas as suas próprias conversas — cada assessor tem uma thread separada com o contato.
              </p>
              {/* No mobile este estado só aparece se a conversa selecionada sumiu
                  da lista — sem esta saída o usuário ficaria sem botão de voltar. */}
              {isMobile && (
                <button
                  onClick={handleBack}
                  className="mt-4 flex items-center gap-1.5 px-4 py-2 min-h-[44px] text-sm font-medium text-[#0C447C] hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <ArrowLeft size={16} />
                  Voltar para as conversas
                </button>
              )}
            </div>
          ) : (
            <>
              {isMobile ? (
                /* Header mobile: voltar · nome + status em duas linhas · menu.
                   O telefone saiu da barra — era ele que quebrava em quatro
                   linhas — e agora vive no menu. */
                <div className="relative px-1 py-1 border-b border-slate-200 flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={handleBack}
                    aria-label="Voltar para a lista de conversas"
                    className="w-11 h-11 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 transition-colors flex-shrink-0"
                  >
                    <ArrowLeft size={20} />
                  </button>

                  <div className="flex-1 min-w-0">
                    <p className="text-[15px] font-medium text-slate-800 truncate leading-tight">
                      {resolveChatName(selectedChat)}
                    </p>
                    <p className={`text-xs whitespace-nowrap leading-tight mt-0.5 ${windowSubtitle.className}`}>
                      {windowSubtitle.text}
                    </p>
                  </div>

                  <button
                    onClick={() => setMenuOpen(open => !open)}
                    aria-label="Mais opções"
                    aria-expanded={menuOpen}
                    className="w-11 h-11 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 transition-colors flex-shrink-0"
                  >
                    <MoreVertical size={20} />
                  </button>

                  {menuOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-40"
                        onClick={() => setMenuOpen(false)}
                        aria-hidden="true"
                      />
                      <div className="absolute right-1 top-[calc(100%-4px)] z-50 w-60 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden">
                        {selectedChat.waba_contacts?.cliente_id && onOpenCliente && (
                          <button
                            onClick={() => {
                              setMenuOpen(false);
                              onOpenCliente(selectedChat.waba_contacts!.cliente_id!);
                            }}
                            className="w-full min-h-[44px] px-3 py-2 flex items-center gap-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors text-left"
                          >
                            <User size={16} className="text-slate-400 flex-shrink-0" />
                            <span className="flex-1">Ficha do cliente</span>
                            <ExternalLink size={13} className="text-slate-400 flex-shrink-0" />
                          </button>
                        )}
                        <button
                          onClick={() => handleCopyPhone(formatWabaPhone(selectedChat.waba_contacts?.contact_phone))}
                          className="w-full min-h-[44px] px-3 py-2 flex items-center gap-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors text-left border-t border-slate-100 first:border-t-0"
                        >
                          <Copy size={16} className="text-slate-400 flex-shrink-0" />
                          <span className="flex-1 truncate">
                            {formatWabaPhone(selectedChat.waba_contacts?.contact_phone)}
                          </span>
                          <span className="text-[11px] text-slate-400 flex-shrink-0">Copiar</span>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ) : (
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
              )}

              <div className="flex-1 overflow-y-auto px-4 py-3 bg-slate-50 space-y-2">
                {loadingMessages ? (
                  <p className="text-sm text-slate-400">Carregando mensagens...</p>
                ) : messages.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center mt-6 max-w-sm mx-auto">
                    {selectedChat.waba_contacts?.last_inbound_at
                      ? 'Nenhuma mensagem nesta conversa ainda.'
                      : 'Nenhuma mensagem ainda. Como o cliente nunca escreveu para o número oficial, o primeiro contato precisa ser um template aprovado.'}
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
                          className={`max-w-[70%] rounded-lg px-3 py-2 transition-opacity ${
                            message.pendingState === 'failed'
                              ? 'bg-red-50 border border-red-300 text-slate-800'
                              : message.from_me
                                ? `bg-[#E6F1FB] text-slate-800 ${message.pendingState === 'sending' ? 'opacity-70' : ''}`
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
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <span className="text-[10px] text-slate-400">
                              {formatMessageTime(message.timestamp)}
                            </span>

                            {message.pendingState === 'sending' && (
                              <span className="text-[10px] text-slate-400 flex items-center gap-1">
                                <Clock size={10} />
                                Enviando...
                              </span>
                            )}

                            {message.pendingState === 'failed' && (
                              <>
                                <span className="text-[10px] text-red-600 font-medium">
                                  Falha ao enviar
                                </span>
                                <button
                                  onClick={() => handleRetry(message)}
                                  className="text-[10px] text-red-700 font-semibold flex items-center gap-1 hover:underline"
                                >
                                  <RotateCw size={10} />
                                  Tentar novamente
                                </button>
                              </>
                            )}

                            {message.from_me && !message.pendingState && statusLabel && (
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
              <div
                className="border-t border-slate-200 p-3 flex-shrink-0"
                // Sem isto o composer fica atrás da barra inferior do iPhone.
                style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
              >
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
                      ref={textareaRef}
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
                      // text-base no mobile: abaixo de 16px o iOS dá zoom ao focar.
                      className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-base md:text-sm resize-none"
                    />
                    <button
                      onClick={handleSendText}
                      disabled={!draft.trim()}
                      className="flex items-center justify-center gap-1.5 px-4 py-2 min-h-[44px] bg-[#0C447C] text-white rounded-lg text-sm font-medium hover:bg-[#0a3a68] disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0"
                    >
                      <Send size={15} />
                      <span className="hidden sm:inline">Enviar</span>
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
                    {/* O envio é otimista, então nunca há espera a sinalizar. O
                        próprio picker limpa a seleção ao enviar, o que já
                        desabilita o botão e barra o duplo clique. */}
                    <WabaTemplatePicker
                      templates={templates}
                      sending={false}
                      onSend={handleSendTemplate}
                      emptyState={templateEmptyState}
                    />
                  </div>
                )}
              </div>
            </>
          )}
        </div>
        )}
      </div>
    </div>
  );
};
