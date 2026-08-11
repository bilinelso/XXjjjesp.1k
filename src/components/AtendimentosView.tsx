import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Search, MessageCircle, ChevronDown, X, ArrowLeft, AlertCircle } from 'lucide-react';
import { DatePicker } from './DatePicker';
import { WhatsAppChannelMenu } from './waba/WhatsAppChannelMenu';
import { WabaSelectionBroadcast } from './waba/WabaSelectionBroadcast';
import { WabaQuickBroadcast } from './waba/WabaQuickBroadcast';
import { computeWindow, formatRemaining } from './waba/wabaUtils';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { MD_QUERY } from '../lib/viewRouting';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { wabaApi } from '../lib/wabaApi';
import type { WabaTemplate } from '../lib/wabaApi';
import type { Cliente } from '../lib/api';

interface AtendimentosViewProps {
  clientes: Cliente[];
  assessores: { id: string; nome: string }[];
  onOpenWhatsApp: (phone: string) => void;
  onOpenWabaChat: (chatId: string) => void;
  onSelectCliente: (cliente: Cliente) => void;
}

type TabType = 'todos' | 'iniciado' | 'nao_iniciado' | 'problema';
type ClienteClass = 'problema' | 'nao_iniciado' | 'iniciado';

interface QuickReply {
  id: string;
  title: string;
  message: string;
}

interface ChatMessage {
  id: string;
  from_me: boolean;
  message_text: string | null;
  timestamp: string;
  message_type: string;
}

interface MeuContato {
  timestamp: string;
  fonte: 'WhatsApp' | 'WABA' | 'ligação';
}

/** Uma linha do `waba_selecao_janela` — a fonte da verdade sobre o canal. */
interface JanelaInfo {
  tem_telefone: boolean;
  janela_aberta: boolean;
  opt_out: boolean;
  ultimo_inbound_at: string | null;
}

// Pure helpers (no external deps)
function getInitials(nome: string): string {
  return nome.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('');
}

function daysSince(iso: string | null | undefined): number {
  if (!iso) return Infinity;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

function fmtDDMM(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function fmtMsgTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function avatarClass(status: string): string {
  if (status === 'depositou' || status === 'acompanhamento') return 'bg-green-100 text-green-700';
  if (status === 'comprou') return 'bg-amber-100 text-amber-700';
  if (status === 'problema') return 'bg-red-100 text-red-700';
  if (status === 'conta-criada') return 'bg-slate-100 text-slate-600';
  return 'bg-blue-100 text-blue-700';
}

function pillClass(status: string): string {
  if (status === 'depositou') return 'bg-green-100 text-green-700';
  if (status === 'acompanhamento') return 'bg-blue-100 text-blue-700';
  if (status === 'comprou') return 'bg-amber-100 text-amber-700';
  if (status === 'problema') return 'bg-red-100 text-red-700';
  if (status === 'conta-criada') return 'bg-slate-100 text-slate-600';
  return 'bg-slate-100 text-slate-500';
}

const STATUS_LABELS: Record<string, string> = {
  depositou: 'Depositou', acompanhamento: 'Acompanhamento',
  comprou: 'Comprou', problema: 'Problema', 'conta-criada': 'Conta criada',
};

function rowBorder(cls: ClienteClass): string {
  if (cls === 'problema') return 'border-l-[3px] border-l-red-400';
  if (cls === 'nao_iniciado') return 'border-l-[3px] border-l-amber-400';
  return 'border-l-[3px] border-l-emerald-500';
}

function contactColor(days: number): string {
  if (days < 7) return 'text-green-700';
  if (days <= 30) return 'text-amber-600';
  return 'text-red-600';
}

function getPhoneVariants(phone: string): string[] {
  const cleaned = phone.replace(/\D/g, '');
  const variants: string[] = [cleaned];
  if (cleaned.startsWith('55') && cleaned.length >= 12) {
    variants.push(cleaned.slice(2));
    const ddd = cleaned.slice(2, 4);
    const rest = cleaned.slice(4);
    if (rest.length === 9 && rest.startsWith('9')) {
      variants.push('55' + ddd + rest.slice(1));
      variants.push(ddd + rest.slice(1));
    } else if (rest.length === 8) {
      variants.push('55' + ddd + '9' + rest);
      variants.push(ddd + '9' + rest);
    }
  }
  return [...new Set(variants)];
}

function applyVars(template: string, c: Cliente): string {
  return template
    .replace(/\{nome_contato\}/g, c.nome || '')
    .replace(/\{primeiro_nome\}/g, (c.nome || '').split(' ')[0])
    .replace(/\{nome\}/g, c.nome || '')
    .replace(/\{assessor\}/g, c.assessor || '');
}

export function AtendimentosView({ clientes, assessores, onOpenWhatsApp, onOpenWabaChat, onSelectCliente }: AtendimentosViewProps) {
  // Abaixo de `md` lista e preview se alternam, como no WABA.
  const isMobile = !useMediaQuery(MD_QUERY);
  const { profile } = useAuth();

  const [selectedAssessor, setSelectedAssessor] = useState('');
  const [assessorNome, setAssessorNome] = useState<string | null>(null);
  const [viewingUserId, setViewingUserId] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('todos');

  // Date range filter — default to last 30 days
  const todayISO = () => new Date().toISOString().split('T')[0];
  const daysAgoISO = (n: number) => {
    const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().split('T')[0];
  };
  const [filterDateFrom, setFilterDateFrom] = useState(() => daysAgoISO(30));
  const [filterDateTo, setFilterDateTo] = useState(() => todayISO());
  const [activePreset, setActivePreset] = useState<'1D' | '1S' | '1M' | 'todos'>('1M');

  const applyPreset = (preset: '1D' | '1S' | '1M' | 'todos') => {
    setActivePreset(preset);
    if (preset === 'todos') { setFilterDateFrom(''); setFilterDateTo(''); return; }
    const hoje = todayISO();
    setFilterDateTo(hoje);
    if (preset === '1D') setFilterDateFrom(hoje);
    else if (preset === '1S') setFilterDateFrom(daysAgoISO(7));
    else if (preset === '1M') setFilterDateFrom(daysAgoISO(30));
  };
  const [activeTab, setActiveTab] = useState<TabType>('todos');

  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);

  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [sentId, setSentId] = useState<string | null>(null);
  /** Falha de envio por linha — substitui o `catch {}` silencioso de antes. */
  const [sendError, setSendError] = useState<{ id: string; message: string } | null>(null);
  const dropdownRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // ── Janela de 24h e seleção ────────────────────────────────────────────────
  /** Situação de cada cliente exibido, vinda do `waba_selecao_janela`. */
  const [janelaMap, setJanelaMap] = useState<Map<string, JanelaInfo>>(new Map());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  /** A janela expira sozinha com o tempo — este relógio força o recálculo. */
  const [now, setNow] = useState(() => Date.now());
  /** Templates aprovados, só para estimar o custo do lado pago da barra. */
  const [approvedTemplates, setApprovedTemplates] = useState<WabaTemplate[]>([]);
  const [custoTemplate, setCustoTemplate] = useState<number | null>(null);
  /** Folha aberta: texto livre, ou template para uma lista de ids. */
  const [quickSheetOpen, setQuickSheetOpen] = useState(false);
  const [templateSheetIds, setTemplateSheetIds] = useState<string[] | null>(null);

  // User's own ligacoes: clienteId → created_at (most recent)
  const [myLigMap, setMyLigMap] = useState<Map<string, string>>(new Map());
  // User's own chats: phone(last10) → { id, ts }
  const [myChatByPhone, setMyChatByPhone] = useState<Map<string, { id: string; ts: string }>>(new Map());
  // User's own WABA conversations: clienteId → timestamp do último contato
  const [myWabaMap, setMyWabaMap] = useState<Map<string, string>>(new Map());

  // phone → chatId (for preview modal lookup)
  const [chatPhoneMap, setChatPhoneMap] = useState<Map<string, string>>(new Map());

  // Preview modal state
  const [previewCliente, setPreviewCliente] = useState<Cliente | null>(null);
  const [previewMessages, setPreviewMessages] = useState<ChatMessage[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Resolve own assessor name (applies to masters too — visibility defaults to own clients)
  useEffect(() => {
    if (!profile?.assessor_id) { setAssessorNome(null); return; }
    supabase.from('assessores').select('nome').eq('id', profile.assessor_id).maybeSingle()
      .then(({ data }) => setAssessorNome(data?.nome ?? null));
  }, [profile?.assessor_id]);

  // When master selects an assessor, resolve that assessor's user_id
  useEffect(() => {
    if (!profile?.is_master || !selectedAssessor) { setViewingUserId(null); return; }
    supabase
      .from('assessores')
      .select('user_id')
      .eq('nome', selectedAssessor)
      .not('user_id', 'is', null)
      .maybeSingle()
      .then(({ data }) => setViewingUserId(data?.user_id ?? null));
  }, [profile?.is_master, selectedAssessor]);

  // Load ligacoes + chats for the effective user (viewed assessor or self)
  useEffect(() => {
    const effectiveUserId = viewingUserId || profile?.id;
    if (!effectiveUserId) return;
    Promise.all([
      supabase
        .from('ligacoes')
        .select('cliente_id, created_at')
        .eq('user_id', effectiveUserId)
        .order('created_at', { ascending: false }),
      supabase
        .from('persistent_chats')
        .select('id, contact_phone, last_message_timestamp')
        .eq('user_id', effectiveUserId)
        .not('last_message_timestamp', 'is', null),
    ]).then(([ligRes, chatRes]) => {
      // own ligacoes: max per cliente_id (already ordered DESC)
      const ligMap = new Map<string, string>();
      for (const l of (ligRes.data || [])) {
        if (!ligMap.has(l.cliente_id)) ligMap.set(l.cliente_id, l.created_at);
      }
      setMyLigMap(ligMap);

      // own chats: last10 → { id, ts }; also build full chatPhoneMap for preview lookup
      const chatByPhone = new Map<string, { id: string; ts: string }>();
      const fullPhoneMap = new Map<string, string>();
      for (const ch of (chatRes.data || [])) {
        const cleaned = (ch.contact_phone || '').replace(/\D/g, '');
        const variants = getPhoneVariants(cleaned);
        for (const v of variants) {
          const key = v.slice(-10);
          const existing = chatByPhone.get(key);
          if (!existing || ch.last_message_timestamp > existing.ts) {
            chatByPhone.set(key, { id: ch.id, ts: ch.last_message_timestamp });
          }
        }
        fullPhoneMap.set(cleaned, ch.id);
      }
      setMyChatByPhone(chatByPhone);
      setChatPhoneMap(fullPhoneMap);
    });
  }, [profile?.id, viewingUserId]);

  /**
   * Terceira fonte de contato: WhatsApp oficial (WABA).
   *
   * A RPC devolve, por cliente, o último envio e o último recebimento. Ela
   * ignora o parâmetro para quem não é master, então passar `viewingUserId`
   * (null quando é o próprio usuário) cobre os dois casos.
   */
  useEffect(() => {
    if (!profile?.id) return;
    let cancelled = false;

    supabase
      .rpc('waba_ultimo_contato_por_cliente', { p_assessor_user_id: viewingUserId })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error('[Atendimentos] Falha ao carregar contatos do WABA:', error.message);
          setMyWabaMap(new Map());
          return;
        }

        const map = new Map<string, string>();
        for (const row of (data || []) as {
          cliente_id: string;
          ultimo_envio_at: string | null;
          ultimo_inbound_at: string | null;
        }[]) {
          // Só um envio meu conta como atendimento iniciado — template
          // incluído, que hoje é como toda primeira mensagem sai.
          if (!row.ultimo_envio_at) continue;
          // O timestamp exibido é o da última interação, como no módulo QR.
          const ts =
            row.ultimo_inbound_at && row.ultimo_inbound_at > row.ultimo_envio_at
              ? row.ultimo_inbound_at
              : row.ultimo_envio_at;
          map.set(row.cliente_id, ts);
        }
        setMyWabaMap(map);
      });

    return () => { cancelled = true; };
  }, [profile?.id, viewingUserId]);

  // Load quick replies once on mount
  useEffect(() => {
    if (!profile?.id) return;
    supabase
      .from('quick_replies')
      .select('id, title, message')
      .eq('user_id', profile.id)
      .order('title')
      .then(({ data }) => { if (data) setQuickReplies(data); });
  }, [profile?.id]);

  // A janela de 24h vira com o tempo, não só com eventos — mesmo padrão do WabaView.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  // Templates aprovados: só alimentam a estimativa de custo da barra de seleção.
  useEffect(() => {
    let cancelled = false;
    supabase
      .from('waba_templates')
      .select('*')
      .eq('status', 'APPROVED')
      .order('name')
      .then(({ data }) => {
        if (!cancelled) setApprovedTemplates((data || []) as WabaTemplate[]);
      });
    return () => { cancelled = true; };
  }, []);

  // Scroll to bottom when preview messages load
  useEffect(() => {
    if (previewMessages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [previewMessages]);

  // Close dropdown on click outside
  useEffect(() => {
    if (!openDropdown) return;
    const handleClick = (e: MouseEvent) => {
      const ref = dropdownRefs.current.get(openDropdown);
      if (ref && !ref.contains(e.target as Node)) setOpenDropdown(null);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [openDropdown]);

  // Build per-client "my last contact" map from user's own data
  const meuUltimoContato = useMemo((): Map<string, MeuContato> => {
    const map = new Map<string, MeuContato>();
    for (const c of clientes) {
      const ligTs = myLigMap.get(c.id);
      const variants = getPhoneVariants((c.telefone || '').replace(/\D/g, ''));
      const chatEntry = variants.map(v => myChatByPhone.get(v.slice(-10))).find(Boolean);
      const chatTs = chatEntry?.ts;

      const wabaTs = myWabaMap.get(c.id);

      // Três fontes concorrendo: vence o timestamp mais recente.
      const candidatos: MeuContato[] = [];
      if (chatTs) candidatos.push({ timestamp: chatTs, fonte: 'WhatsApp' });
      if (wabaTs) candidatos.push({ timestamp: wabaTs, fonte: 'WABA' });
      if (ligTs) candidatos.push({ timestamp: ligTs, fonte: 'ligação' });
      if (candidatos.length === 0) continue;

      map.set(
        c.id,
        candidatos.reduce((maisRecente, atual) =>
          atual.timestamp > maisRecente.timestamp ? atual : maisRecente
        )
      );
    }
    return map;
  }, [clientes, myLigMap, myChatByPhone, myWabaMap]);

  // Find chat ID for a client phone using all variants (for preview modal)
  const getChatId = useCallback((telefone: string): string | null => {
    const variants = getPhoneVariants(telefone.replace(/\D/g, ''));
    for (const v of variants) {
      if (chatPhoneMap.has(v)) return chatPhoneMap.get(v)!;
    }
    return null;
  }, [chatPhoneMap]);

  /**
   * No celular o preview ocupa a tela: empilha uma entrada de histórico para
   * que o botão voltar do aparelho retorne à lista em vez de sair da tela.
   */
  useEffect(() => {
    if (!isMobile || !previewCliente) return;

    window.history.pushState({ ...window.history.state, atendimentoPreview: true }, '');
    const onPopState = () => setPreviewCliente(null);

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [isMobile, previewCliente]);

  /** Consome a entrada empilhada acima; no desktop apenas fecha. */
  const handleClosePreview = useCallback(() => {
    if (isMobile) window.history.back();
    else setPreviewCliente(null);
  }, [isMobile]);

  const showList = !isMobile || !previewCliente;

  const handleOpenPreview = useCallback(async (c: Cliente) => {
    if (!c.telefone) return;
    const chatId = getChatId(c.telefone);
    if (!chatId) return;

    setPreviewCliente(c);
    setPreviewMessages([]);
    setPreviewLoading(true);

    const { data } = await supabase
      .from('persistent_messages')
      .select('id, from_me, message_text, timestamp, message_type')
      .eq('chat_id', chatId)
      .order('timestamp', { ascending: false })
      .limit(20);

    setPreviewMessages((data || []).reverse() as ChatMessage[]);
    setPreviewLoading(false);
  }, [getChatId]);

  /**
   * Envio individual pelo número oficial (WABA).
   *
   * Caminho direto (`open_chat` + `send_text`) em vez da engine de disparos: uma
   * linha só não pode esperar até um minuto pelo cron. Aqui as variáveis são
   * resolvidas no frontend — no lote quem resolve é o servidor.
   *
   * Falha nunca é silenciosa: um "Enviado!" numa mensagem que não saiu é pior
   * do que não ter o botão.
   */
  const handleSendQuickReply = useCallback(async (c: Cliente, reply: QuickReply) => {
    const text = applyVars(reply.message, c);

    setOpenDropdown(null);
    setSendError(prev => (prev?.id === c.id ? null : prev));
    setSendingId(c.id);
    try {
      const chat = await wabaApi.openChat(c.id);
      if (!chat.success) {
        setSendError({ id: c.id, message: chat.message });
        return;
      }

      const result = await wabaApi.sendText(chat.chat_id, text);
      if (!result.success) {
        setSendError({
          id: c.id,
          message: result.message || 'Não foi possível enviar a mensagem.',
        });
        return;
      }

      setSentId(c.id);
      setTimeout(() => setSentId(prev => prev === c.id ? null : prev), 2000);
    } catch (err) {
      setSendError({
        id: c.id,
        message: err instanceof Error ? err.message : 'Não foi possível enviar a mensagem.',
      });
    } finally {
      setSendingId(prev => prev === c.id ? null : prev);
    }
  }, []);

  // Classify using user's own contact data (not global ultimo_contato_at)
  const classifyC = useCallback((c: Cliente): ClienteClass => {
    if (c.status === 'problema') return 'problema';
    if (!meuUltimoContato.has(c.id)) return 'nao_iniciado';
    return 'iniciado';
  }, [meuUltimoContato]);

  const baseClientes = useMemo(() => {
    return clientes.filter(c => {
      if (c.oculto) return false;
      if (['finalizado', 'inativo'].includes(c.status)) return false;
      // Visibility filter: master with selectedAssessor → that assessor; everyone else → own
      if (profile?.is_master && selectedAssessor) {
        if (!c.assessor || !c.assessor.toLowerCase().includes(selectedAssessor.toLowerCase())) return false;
      } else {
        if (!assessorNome) return false;
        if (!c.assessor || !c.assessor.toLowerCase().includes(assessorNome.toLowerCase())) return false;
      }
      if (filterDateFrom || filterDateTo) {
        const da = c.data_atribuicao;
        if (!da) return false;
        const date = da.slice(0, 10);
        if (filterDateFrom && date < filterDateFrom) return false;
        if (filterDateTo && date > filterDateTo) return false;
      }
      return true;
    });
  }, [clientes, profile?.is_master, assessorNome, selectedAssessor, filterDateFrom, filterDateTo]);

  const summary = useMemo(() => ({
    total: baseClientes.length,
    iniciado: baseClientes.filter(c => classifyC(c) === 'iniciado').length,
    nao_iniciado: baseClientes.filter(c => classifyC(c) === 'nao_iniciado').length,
    problema: baseClientes.filter(c => classifyC(c) === 'problema').length,
  }), [baseClientes, classifyC]);

  const rows = useMemo(() => {
    const filtered = baseClientes.filter(c => {
      if (activeTab !== 'todos' && classifyC(c) !== activeTab) return false;
      if (filterStatus !== 'todos' && c.status !== filterStatus) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        if (!c.nome.toLowerCase().includes(q) && !(c.telefone || '').includes(search)) return false;
      }
      return true;
    });

    const sort = (arr: Cliente[], key: (c: Cliente) => string) =>
      [...arr].sort((a, b) => { const aK = key(a), bK = key(b); return aK < bK ? -1 : aK > bK ? 1 : 0; });

    const problema  = sort(filtered.filter(c => classifyC(c) === 'problema'),    c => meuUltimoContato.get(c.id)?.timestamp || '');
    const naoInic   = sort(filtered.filter(c => classifyC(c) === 'nao_iniciado'), c => (c as Cliente & { status_updated_at?: string }).status_updated_at || c.created_at);
    const iniciado  = sort(filtered.filter(c => classifyC(c) === 'iniciado'),     c => meuUltimoContato.get(c.id)?.timestamp || '');

    if (activeTab === 'problema')    return problema;
    if (activeTab === 'nao_iniciado') return naoInic;
    if (activeTab === 'iniciado')    return iniciado;
    return [...problema, ...naoInic, ...iniciado];
  }, [baseClientes, activeTab, filterStatus, search, classifyC, meuUltimoContato]);

  const showDividers = activeTab === 'todos';
  const problemRows  = showDividers ? rows.filter(c => classifyC(c) === 'problema') : [];
  const naoInicRows  = showDividers ? rows.filter(c => classifyC(c) === 'nao_iniciado') : [];
  const iniciadoRows = showDividers ? rows.filter(c => classifyC(c) === 'iniciado') : [];

  // ── Janela de 24h ──────────────────────────────────────────────────────────

  /** Só o conteúdo importa: recriar o array de `rows` não deve refazer a query. */
  const rowIdsKey = useMemo(() => rows.map(c => c.id).join(','), [rows]);

  /**
   * Situação de janela de todos os clientes exibidos — não só dos selecionados.
   * A linha precisa do indicador antes de qualquer seleção, e como a seleção é
   * sempre um subconjunto das linhas, uma consulta serve aos dois usos.
   */
  useEffect(() => {
    if (!rowIdsKey) { setJanelaMap(new Map()); return; }

    let cancelled = false;
    const timer = setTimeout(() => {
      supabase
        .rpc('waba_selecao_janela', { p_cliente_ids: rowIdsKey.split(',') })
        .then(({ data, error }) => {
          if (cancelled) return;
          if (error) {
            console.error('[Atendimentos] Falha ao carregar janelas do WABA:', error.message);
            return;
          }
          const map = new Map<string, JanelaInfo>();
          for (const row of (data || []) as ({ cliente_id: string } & JanelaInfo)[]) {
            map.set(row.cliente_id, {
              tem_telefone: row.tem_telefone,
              janela_aberta: row.janela_aberta,
              opt_out: row.opt_out,
              ultimo_inbound_at: row.ultimo_inbound_at,
            });
          }
          setJanelaMap(map);
        });
    }, 300);

    return () => { cancelled = true; clearTimeout(timer); };
  }, [rowIdsKey]);

  /**
   * A janela está aberta agora?
   *
   * O `janela_aberta` da RPC é uma foto do momento da consulta; recalcular pelo
   * `ultimo_inbound_at` com o relógio local mantém a resposta correta enquanto a
   * tela fica aberta.
   */
  const janelaAberta = useCallback(
    (id: string): boolean => {
      const info = janelaMap.get(id);
      if (!info) return false;
      return computeWindow(info.ultimo_inbound_at, now).open;
    },
    [janelaMap, now]
  );

  // ── Seleção ────────────────────────────────────────────────────────────────

  // Trocar de aba, status, busca ou data muda o conjunto visível: manter a
  // seleção antiga faria o assessor disparar para quem não está mais na tela.
  useEffect(() => {
    setSelectedIds(new Set());
  }, [activeTab, filterStatus, search, filterDateFrom, filterDateTo, selectedAssessor]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  /** Marca ou desmarca de uma vez as linhas de uma seção (já filtradas). */
  const toggleSection = useCallback((sectionRows: Cliente[]) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      const allSelected = sectionRows.every(c => next.has(c.id));
      for (const c of sectionRows) {
        if (allSelected) next.delete(c.id); else next.add(c.id);
      }
      return next;
    });
  }, []);

  /**
   * A seleção dividida pelo canal possível. Sem telefone ou com opt-out fica
   * fora dos dois grupos — não há envio possível por nenhum caminho.
   */
  const grupos = useMemo(() => {
    const comJanela: string[] = [];
    const semJanela: string[] = [];
    const ignorados: string[] = [];

    for (const id of selectedIds) {
      const info = janelaMap.get(id);
      if (!info || !info.tem_telefone || info.opt_out) { ignorados.push(id); continue; }
      if (janelaAberta(id)) comJanela.push(id);
      else semJanela.push(id);
    }
    return { comJanela, semJanela, ignorados };
  }, [selectedIds, janelaMap, janelaAberta]);

  /**
   * Custo estimado do lado pago. A RPC de prévia exige um template, e o preço
   * varia ~10x entre UTILITY e MARKETING — a estimativa usa o mais barato
   * disponível e é exibida como "a partir de".
   */
  const templateBarato = useMemo(
    () =>
      approvedTemplates.find(t => t.category?.toUpperCase() === 'UTILITY') ??
      approvedTemplates[0] ??
      null,
    [approvedTemplates]
  );

  const semJanelaKey = grupos.semJanela.join(',');

  useEffect(() => {
    if (!semJanelaKey || !templateBarato) { setCustoTemplate(null); return; }

    let cancelled = false;
    const timer = setTimeout(() => {
      supabase
        .rpc('waba_broadcast_preview', {
          p_filtro: { cliente_ids: semJanelaKey.split(',') },
          p_template_id: templateBarato.id,
          p_modo: 'nunca',
        })
        .then(({ data, error }) => {
          if (cancelled || error || !data) return;
          setCustoTemplate((data as { custo_estimado: number }).custo_estimado);
        });
    }, 300);

    return () => { cancelled = true; clearTimeout(timer); };
  }, [semJanelaKey, templateBarato]);

  /** Primeiro destinatário do texto livre — alimenta a prévia da folha. */
  const exemploQuick = useMemo(() => {
    const first = grupos.comJanela[0];
    const cliente = first ? clientes.find(c => c.id === first) : null;
    return cliente ? { nome: cliente.nome, assessor: cliente.assessor ?? null } : null;
  }, [grupos.comJanela, clientes]);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const renderRow = (c: Cliente) => {
    const cls = classifyC(c);
    const myContact = meuUltimoContato.get(c.id);
    const days = daysSince(myContact?.timestamp ?? null);
    // Quando o cliente caiu na mão deste assessor. O `status_updated_at` é o
    // fallback para as linhas antigas, sem `data_atribuicao` preenchida.
    const atribuidoEm =
      c.data_atribuicao ?? (c as Cliente & { status_updated_at?: string }).status_updated_at;
    const isDropdownOpen = openDropdown === c.id;
    const isSending = sendingId === c.id;
    const isSent = sentId === c.id;
    const hasChat = !!c.telefone && !!getChatId(c.telefone);
    const janela = janelaMap.get(c.id);
    const windowState = computeWindow(janela?.ultimo_inbound_at, now);
    // Sem telefone ou com opt-out não há envio por nenhum caminho.
    const enviavel = !!janela && janela.tem_telefone && !janela.opt_out;
    const isSelected = selectedIds.has(c.id);
    const rowError = sendError?.id === c.id ? sendError.message : null;

    return (
      <div
        key={c.id}
        className={`flex flex-col md:flex-row md:items-center gap-3 bg-white border border-slate-200 rounded-xl px-4 py-3 hover:border-slate-300 transition-all ${rowBorder(cls)} ${hasChat ? 'cursor-pointer' : ''}`}
        onClick={() => hasChat && handleOpenPreview(c)}
      >
        {/* Central area — no click handler, handled by parent */}
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {/* Seleção — área de clique própria, não abre o preview */}
          <label
            className="flex items-center justify-center w-6 h-11 -my-2 flex-shrink-0 cursor-pointer"
            onClick={e => e.stopPropagation()}
          >
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => toggleSelect(c.id)}
              aria-label={`Selecionar ${c.nome}`}
              className="w-4 h-4 rounded border-slate-300 accent-[#0C447C] cursor-pointer"
            />
          </label>

          {/* Avatar */}
          <div className={`w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-semibold ${avatarClass(c.status)}`}>
            {getInitials(c.nome)}
          </div>

          {/* Client info */}
          <div className="flex-1 min-w-0">
            <p
              className="text-sm font-medium text-slate-800 truncate hover:text-blue-600 cursor-pointer"
              onClick={e => { e.stopPropagation(); onSelectCliente(c); }}
            >{c.nome}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${pillClass(c.status)}`}>
                {STATUS_LABELS[c.status] || c.status}
              </span>
              {(c.valor_deposito ?? 0) >= 1 && (
                <span className="text-xs text-slate-500">$ {profile?.is_master ? c.valor_deposito?.toLocaleString('pt-BR') : '***'}</span>
              )}
            </div>
          </div>

          {/* Assigned date */}
          <div className="text-xs text-slate-400 flex-shrink-0 text-right min-w-[80px]">
            {atribuidoEm ? `atribuído ${fmtDDMM(atribuidoEm)}` : ''}
          </div>

          {/* Contact badge */}
          <div className="flex flex-col items-end flex-shrink-0 min-w-[160px]">
            {cls === 'nao_iniciado' || !myContact ? (
              <>
                <span className="text-xs font-medium text-slate-400">Nunca contatado</span>
                {atribuidoEm && (
                  <span className="text-[11px] text-slate-400 mt-0.5">há {daysSince(atribuidoEm)} dias</span>
                )}
              </>
            ) : (
              <>
                <span className={`text-xs font-semibold ${contactColor(days)}`}>
                  {days === 0 ? 'Hoje' : days === 1 ? '1 dia sem contato' : `${days} dias sem contato`}
                </span>
                <span className="text-[11px] text-slate-400 mt-0.5">
                  último: {fmtDDMM(myContact.timestamp)} via {myContact.fonte}
                </span>
              </>
            )}

            {/* Janela de 24h: só aparece quando aberta — é ela que libera o
                texto livre gratuito. Fechada é o caso comum e silencioso. */}
            {windowState.open && (
              <span className="flex items-center gap-1 text-[11px] text-emerald-700 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
                janela {formatRemaining(windowState.remainingMs)}
              </span>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div
          className="flex-shrink-0 flex flex-col gap-1 items-stretch"
          onClick={e => e.stopPropagation()}
        >
          {c.telefone && (
            <WhatsAppChannelMenu
              clienteId={c.id}
              telefone={c.telefone}
              onOpenQr={onOpenWhatsApp}
              onOpenWaba={onOpenWabaChat}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 transition-colors"
            >
              <MessageCircle size={13} />
              WhatsApp
            </WhatsAppChannelMenu>
          )}

          <div
            className="relative"
            ref={el => {
              if (el) dropdownRefs.current.set(c.id, el);
              else dropdownRefs.current.delete(c.id);
            }}
          >
            {/* O canal é decidido pela janela de 24h, nunca pela aba: fechada,
                o único caminho é template aprovado (pago). */}
            <button
              disabled={isSending || !enviavel}
              title={enviavel ? undefined : 'Cliente sem telefone ou que pediu para não receber'}
              onClick={() => {
                if (windowState.open) setOpenDropdown(prev => prev === c.id ? null : c.id);
                else setTemplateSheetIds([c.id]);
              }}
              className={`w-full flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                isSent
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
              } disabled:opacity-60 disabled:cursor-not-allowed`}
            >
              {isSending ? (
                <span className="animate-pulse">Enviando...</span>
              ) : isSent ? (
                'Enviado!'
              ) : windowState.open ? (
                <>
                  Mensagem rápida
                  <ChevronDown size={11} className={`transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
                </>
              ) : (
                'Enviar template'
              )}
            </button>

            {isDropdownOpen && (
              <div className="absolute right-0 top-full mt-1 w-56 bg-white border border-slate-200 rounded-lg shadow-lg z-50 py-1 overflow-hidden">
                {quickReplies.length === 0 ? (
                  <p className="text-xs text-slate-400 px-3 py-2">Nenhuma mensagem rápida</p>
                ) : (
                  quickReplies.map(reply => (
                    <button
                      key={reply.id}
                      onClick={() => handleSendQuickReply(c, reply)}
                      className="w-full text-left px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 transition-colors truncate"
                      title={reply.title}
                    >
                      {reply.title}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Falha de envio fica visível na própria linha, com o motivo. */}
          {rowError && (
            <p className="flex items-start gap-1 text-[11px] text-red-700 max-w-[220px] leading-snug">
              <AlertCircle size={12} className="flex-shrink-0 mt-px" />
              <span className="flex-1">{rowError}</span>
              <button
                onClick={() => setSendError(null)}
                aria-label="Descartar erro"
                className="flex-shrink-0 text-red-400 hover:text-red-600"
              >
                <X size={12} />
              </button>
            </p>
          )}
        </div>
      </div>
    );
  };

  /**
   * Cabeçalho de seção com "selecionar todos". O checkbox marca apenas as
   * linhas passadas em `sectionRows`, que já vêm filtradas pela tela.
   */
  const SectionDivider = ({
    color,
    label,
    sectionRows,
  }: { color: string; label: string; sectionRows: Cliente[] }) => {
    const allSelected = sectionRows.length > 0 && sectionRows.every(c => selectedIds.has(c.id));
    const someSelected = !allSelected && sectionRows.some(c => selectedIds.has(c.id));

    return (
      <div className="flex items-center gap-2 text-xs text-slate-500 font-medium pt-3 pb-2 border-b border-slate-100 mb-2">
        <label className="flex items-center justify-center w-6 h-11 -my-3 flex-shrink-0 cursor-pointer">
          <input
            type="checkbox"
            checked={allSelected}
            ref={el => { if (el) el.indeterminate = someSelected; }}
            onChange={() => toggleSection(sectionRows)}
            aria-label={`Selecionar todos — ${label}`}
            className="w-4 h-4 rounded border-slate-300 accent-[#0C447C] cursor-pointer"
          />
        </label>
        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color }} />
        {label}
      </div>
    );
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">
      {/* No mobile é uma coisa por vez: ou a lista, ou o preview. */}
      {showList && (
      <>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-800">Atendimentos</h2>
        {profile?.is_master && (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <span>Visualizando:</span>
            <select
              value={selectedAssessor}
              onChange={e => setSelectedAssessor(e.target.value)}
              className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white focus:ring-2 focus:ring-blue-400"
            >
              <option value="">Todos</option>
              {assessores.map(a => (
                <option key={a.id} value={a.nome}>{a.nome}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Summary bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total atribuídos',       value: summary.total,       cls: 'text-slate-800' },
          { label: 'Atendimento iniciado',   value: summary.iniciado,    cls: 'text-green-700' },
          { label: 'Não iniciado',           value: summary.nao_iniciado, cls: 'text-amber-600' },
          { label: 'Problema',               value: summary.problema,    cls: 'text-red-600' },
        ].map(s => (
          <div key={s.label} className="bg-white border border-slate-200 rounded-xl px-4 py-3">
            <p className="text-xs text-slate-500 mb-1">{s.label}</p>
            <p className={`text-2xl font-medium ${s.cls}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 bg-slate-100 rounded-lg p-1">
        {([
          { key: 'todos',        label: `Todos (${summary.total})` },
          { key: 'iniciado',     label: `Iniciados (${summary.iniciado})` },
          { key: 'nao_iniciado', label: `Não iniciados (${summary.nao_iniciado})` },
          { key: 'problema',     label: `Problema (${summary.problema})` },
        ] as const).map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`flex-1 py-1.5 px-2 rounded-md text-xs font-medium transition-all ${
              activeTab === t.key
                ? 'bg-white text-slate-800 shadow-sm border border-slate-200'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="space-y-2">
        {/* Linha 1: busca + status */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input
              type="text"
              placeholder="Buscar cliente..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-400 focus:border-blue-400"
            />
          </div>
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-blue-400"
          >
            <option value="todos">Todos os status</option>
            <option value="depositou">Depositou</option>
            <option value="acompanhamento">Acompanhamento</option>
            <option value="conta-criada">Conta criada</option>
            <option value="comprou">Comprou</option>
            <option value="problema">Problema</option>
          </select>
        </div>

        {/* Linha 2: filtro por data de atribuição ao assessor */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 font-medium whitespace-nowrap">Data atribuição:</span>
          <div className="flex items-center gap-1">
            {(['1D', '1S', '1M', 'todos'] as const).map(p => (
              <button
                key={p}
                type="button"
                onClick={() => applyPreset(p)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                  activePreset === p
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-white border border-slate-300 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {p === 'todos' ? 'Todos' : p}
              </button>
            ))}
          </div>
          <div className="w-px h-4 bg-slate-200 mx-1" />
          <span className="text-xs text-slate-400 whitespace-nowrap">De</span>
          <div className="w-[150px]">
            <DatePicker
              value={filterDateFrom}
              onChange={v => { setFilterDateFrom(v); setActivePreset('todos'); }}
              maxDate={filterDateTo || undefined}
            />
          </div>
          <span className="text-xs text-slate-400">–</span>
          <span className="text-xs text-slate-400 whitespace-nowrap">Até</span>
          <div className="w-[150px]">
            <DatePicker
              value={filterDateTo}
              onChange={v => { setFilterDateTo(v); setActivePreset('todos'); }}
              minDate={filterDateFrom || undefined}
            />
          </div>
        </div>
      </div>

      {/* List */}
      <div className="space-y-2">
        {rows.length === 0 ? (
          <div className="text-center py-16 text-slate-400 text-sm">Nenhum cliente encontrado</div>
        ) : showDividers ? (
          <>
            {problemRows.length > 0 && (
              <>
                <SectionDivider color="#E24B4A" label="Problema — atenção urgente" sectionRows={problemRows} />
                {problemRows.map(renderRow)}
              </>
            )}
            {naoInicRows.length > 0 && (
              <>
                <SectionDivider color="#EF9F27" label="Não iniciados — primeiro contato pendente" sectionRows={naoInicRows} />
                {naoInicRows.map(renderRow)}
              </>
            )}
            {iniciadoRows.length > 0 && (
              <>
                <SectionDivider color="#1D9E75" label="Iniciados — em atendimento" sectionRows={iniciadoRows} />
                {iniciadoRows.map(renderRow)}
              </>
            )}
          </>
        ) : (
          <>
            <SectionDivider color="#94a3b8" label={`${rows.length} clientes`} sectionRows={rows} />
            {rows.map(renderRow)}
          </>
        )}
      </div>

      {/* Espaço para a barra de seleção não cobrir a última linha. */}
      {selectedIds.size > 0 && <div className="h-24" aria-hidden="true" />}
      </>
      )}

      {/* Barra de seleção — a divisão vem da janela de 24h, não da aba */}
      {showList && selectedIds.size > 0 && (
        <div
          className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-200 shadow-[0_-4px_12px_rgba(0,0,0,0.06)]"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <div className="max-w-5xl mx-auto px-4 py-3 flex flex-col md:flex-row md:items-center gap-3">
            <div className="flex-1 min-w-0 text-xs text-slate-600 leading-relaxed">
              <strong className="text-slate-800">{selectedIds.size} selecionados</strong>
              {' → '}
              <span className="text-emerald-700">
                {grupos.comJanela.length} com janela aberta (texto livre, grátis)
              </span>
              {' · '}
              <span className="text-slate-700">
                {grupos.semJanela.length} sem janela (template
                {grupos.semJanela.length > 0 && custoTemplate !== null
                  ? `, a partir de ${custoTemplate.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`
                  : ''}
                )
              </span>
              {grupos.ignorados.length > 0 && (
                <span className="block text-slate-400 mt-0.5">
                  {grupos.ignorados.length} ignorado{grupos.ignorados.length === 1 ? '' : 's'}: sem
                  telefone ou opt-out
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={clearSelection}
                className="px-3 min-h-[40px] rounded-lg text-xs font-medium text-slate-500 hover:bg-slate-100 transition-colors"
              >
                Limpar
              </button>
              <button
                onClick={() => setQuickSheetOpen(true)}
                disabled={grupos.comJanela.length === 0}
                className="px-3 min-h-[40px] rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Mensagem rápida ({grupos.comJanela.length})
              </button>
              <button
                onClick={() => setTemplateSheetIds(grupos.semJanela)}
                disabled={grupos.semJanela.length === 0}
                className="px-3 min-h-[40px] rounded-lg text-xs font-semibold bg-[#0C447C] text-white hover:bg-[#0a3a68] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Enviar template ({grupos.semJanela.length})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Folha de texto livre — só os ids com janela aberta */}
      {quickSheetOpen && (
        <WabaQuickBroadcast
          clienteIds={grupos.comJanela}
          exemplo={exemploQuick}
          onClose={() => setQuickSheetOpen(false)}
          onSent={clearSelection}
        />
      )}

      {/* Folha de template. `modoFixo="nunca"`: esta lista já é a carteira de
          alguém, disparar daqui não pode transferir a posse de ninguém. */}
      {templateSheetIds && (
        <WabaSelectionBroadcast
          clienteIds={templateSheetIds}
          modoFixo="nunca"
          onClose={() => setTemplateSheetIds(null)}
          onSent={clearSelection}
        />
      )}

      {/* Chat preview — modal no desktop, tela cheia no mobile */}
      {previewCliente && (
        <div
          className={
            isMobile
              ? 'fixed inset-0 bg-white z-50 flex flex-col'
              : 'fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4'
          }
          onMouseDown={e => { if (!isMobile && e.target === e.currentTarget) setPreviewCliente(null); }}
        >
          <div
            className={
              isMobile
                ? 'bg-white w-full flex-1 min-h-0 flex flex-col'
                : 'bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden max-h-[80vh]'
            }
          >
            {/* Header */}
            <div
              className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 flex-shrink-0"
              style={isMobile ? { paddingTop: 'calc(0.75rem + env(safe-area-inset-top))' } : undefined}
            >
              {isMobile && (
                <button
                  onClick={handleClosePreview}
                  aria-label="Voltar para a lista"
                  className="w-11 h-11 -ml-2 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 transition-colors flex-shrink-0"
                >
                  <ArrowLeft size={20} />
                </button>
              )}
              <div className={`w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-semibold ${avatarClass(previewCliente.status)}`}>
                {getInitials(previewCliente.nome)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800 truncate">{previewCliente.nome}</p>
                {previewCliente.telefone && (
                  <p className="text-xs text-slate-400">{previewCliente.telefone}</p>
                )}
              </div>
              {!isMobile && (
                <button
                  onClick={handleClosePreview}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  <X size={16} />
                </button>
              )}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 bg-slate-50">
              {previewLoading ? (
                <div className="flex items-center justify-center py-10">
                  <div className="w-5 h-5 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
                </div>
              ) : previewMessages.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-10">Nenhuma mensagem encontrada</p>
              ) : (
                previewMessages.map(msg => (
                  <div key={msg.id} className={`flex ${msg.from_me ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className="max-w-[75%] rounded-2xl px-3 py-2"
                      style={msg.from_me
                        ? { background: '#1D9E75', color: '#E1F5EE' }
                        : { background: '#ffffff', color: '#1e293b', border: '1px solid #e2e8f0' }
                      }
                    >
                      <p className="text-sm whitespace-pre-wrap break-words">
                        {msg.message_text || (msg.message_type !== 'text' ? `[${msg.message_type}]` : '—')}
                      </p>
                      <p className="text-[10px] mt-1 opacity-60 text-right">
                        {fmtMsgTime(msg.timestamp)}
                      </p>
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Footer */}
            <div className="px-4 py-3 border-t border-slate-100">
              {previewCliente.telefone ? (
                <WhatsAppChannelMenu
                  clienteId={previewCliente.id}
                  telefone={previewCliente.telefone}
                  onOpenQr={phone => { handleClosePreview(); onOpenWhatsApp(phone); }}
                  onOpenWaba={chatId => { handleClosePreview(); onOpenWabaChat(chatId); }}
                  className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-medium bg-green-600 text-white hover:bg-green-700 transition-colors"
                >
                  <MessageCircle size={15} />
                  Abrir conversa completa
                </WhatsAppChannelMenu>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
