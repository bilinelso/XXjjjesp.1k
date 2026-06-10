import { useState, useEffect, useMemo } from 'react';
import { X, Send, Clock, Users, ChevronRight, ChevronLeft, AlertTriangle, CheckCircle2, XCircle, Loader2, History, Radio, Eye, MessageCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useKanbanColumns } from '../../hooks/useKanbanColumns';
// Normaliza qualquer formato de telefone para 11 dígitos (padrão clientes.telefone_normalized)
// Ex: 5521980580126 → 21980580126 | 556696223637 → 66996223637
function normalizeTo11(phone: string): string {
  let d = phone.replace(/\D/g, '');
  if (d.startsWith('55') && d.length >= 12) d = d.slice(2);
  if (d.length === 10) d = d.slice(0, 2) + '9' + d.slice(2); // adiciona 9 após DDD
  return d;
}
import { INVESTMENT_CATEGORIES } from '../../utils/investmentCategories';
import type { Cliente } from '../../lib/api';

interface WhatsAppBroadcastProps {
  instanceName: string;
  onClose: () => void;
}

interface Broadcast {
  id: string;
  message: string;
  scheduled_at: string | null;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  delay_seconds: number;
  created_at: string;
}

interface BroadcastRecipient {
  id: string;
  name: string;
  phone: string;
  status: 'pending' | 'sending' | 'sent' | 'failed';
  sent_at: string | null;
  error: string | null;
  message_personalized: string | null;
}

type DateRangeOption = 'todos' | '24h' | '7d' | '30d' | 'custom';
type Step = 1 | 2 | 3;
type Tab = 'new' | 'history';

export function WhatsAppBroadcast({ instanceName, onClose }: WhatsAppBroadcastProps) {
  const { profile } = useAuth();
  const { columns } = useKanbanColumns();
  const [tab, setTab] = useState<Tab>('new');
  const [step, setStep] = useState<Step>(1);

  // Step 1 state
  const [message, setMessage] = useState('');
  const [scheduled, setScheduled] = useState(false);
  const [scheduledAt, setScheduledAt] = useState('');
  const [delaySeconds, setDelaySeconds] = useState(20);

  // Step 2 state
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loadingClientes, setLoadingClientes] = useState(false);
  const [assessores, setAssessores] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filterSelectionCleared, setFilterSelectionCleared] = useState(false);

  // Existing filters
  const [filterStatus, setFilterStatus] = useState('todos');
  const [filterAssessor, setFilterAssessor] = useState('todos');

  // New filters
  const [filterChatAtivo, setFilterChatAtivo] = useState(false);
  const [filterCategoria, setFilterCategoria] = useState('todos');
  const [filterDateRange, setFilterDateRange] = useState<DateRangeOption>('todos');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  // Active chat phones set (loaded once on step 2 open)
  const [activeChatPhones, setActiveChatPhones] = useState<Set<string>>(new Set());
  // Map of normalizedPhone → last_message_timestamp for sorting
  const [chatTimestampMap, setChatTimestampMap] = useState<Map<string, string>>(new Map());

  // Search within filtered list
  const [searchQuery, setSearchQuery] = useState('');

  // Step 3 / sending state
  const [sending, setSending] = useState(false);
  const [broadcastId, setBroadcastId] = useState<string | null>(null);
  const [currentBroadcast, setCurrentBroadcast] = useState<Broadcast | null>(null);

  // History state
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [detailBroadcastId, setDetailBroadcastId] = useState<string | null>(null);
  const [detailRecipients, setDetailRecipients] = useState<BroadcastRecipient[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Load clientes + active chat phones when entering step 2
  useEffect(() => {
    if (tab !== 'new' || step !== 2) return;
    setLoadingClientes(true);

    Promise.all([
      supabase
        .from('clientes')
        .select('id, nome, telefone, telefone_normalized, status, assessor, categoria_investimento, status_updated_at')
        .eq('oculto', false)
        .not('telefone', 'is', null)
        .order('nome'),
      profile?.id
        ? supabase
            .from('persistent_chats')
            .select('contact_phone, last_message_timestamp')
            .eq('user_id', profile.id)
        : Promise.resolve({ data: [] }),
      supabase
        .from('assessores')
        .select('nome')
        .eq('ativo', true)
        .order('nome'),
    ]).then(([clientesRes, chatsRes, assessoresRes]) => {
      if (clientesRes.data) {
        setClientes(clientesRes.data as unknown as Cliente[]);
      }

      if (assessoresRes.data) {
        setAssessores(assessoresRes.data.map((a: { nome: string }) => a.nome));
      }

      if (chatsRes.data) {
        const phones = new Set<string>();
        const tsMap = new Map<string, string>();
        (chatsRes.data as { contact_phone: string; last_message_timestamp: string | null }[]).forEach(row => {
          const normalized = normalizeTo11(row.contact_phone);
          phones.add(normalized);
          if (row.last_message_timestamp) {
            tsMap.set(normalized, row.last_message_timestamp);
          }
        });
        setActiveChatPhones(phones);
        setChatTimestampMap(tsMap);
      }

      setLoadingClientes(false);
    });
  }, [tab, step, profile?.id]);

  // Load history + realtime updates
  useEffect(() => {
    if (tab !== 'history') return;
    setLoadingHistory(true);
    supabase
      .from('whatsapp_broadcasts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data }) => {
        if (data) setBroadcasts(data as Broadcast[]);
        setLoadingHistory(false);
      });

    const channel = supabase.channel('broadcast-history')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'whatsapp_broadcasts' },
        (payload) => {
          setBroadcasts(prev => prev.map(b => b.id === payload.new.id ? payload.new as Broadcast : b));
        })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [tab]);

  // Realtime subscription for active broadcast progress
  useEffect(() => {
    if (!broadcastId) return;
    supabase.from('whatsapp_broadcasts').select('*').eq('id', broadcastId).maybeSingle()
      .then(({ data }) => { if (data) setCurrentBroadcast(data as Broadcast); });

    const channel = supabase.channel(`broadcast-progress-${broadcastId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'whatsapp_broadcasts', filter: `id=eq.${broadcastId}` },
        (payload) => { setCurrentBroadcast(payload.new as Broadcast); })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [broadcastId]);

  // Clear selection and search when any filter changes
  const clearSelectionOnFilterChange = () => {
    setSearchQuery('');
    if (selectedIds.size > 0) {
      setSelectedIds(new Set());
      setFilterSelectionCleared(true);
      setTimeout(() => setFilterSelectionCleared(false), 3000);
    }
  };

  const handleFilterChange = <T,>(setter: (v: T) => void, value: T) => {
    setter(value);
    clearSelectionOnFilterChange();
  };

  // Date range helper
  const getDateBounds = (): { from: Date | null; to: Date | null } => {
    const now = new Date();

    // Returns midnight UTC of N days ago
    const utcStartOfDaysAgo = (days: number): Date => {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      d.setUTCDate(d.getUTCDate() - days);
      return d;
    };

    if (filterDateRange === '24h') return { from: utcStartOfDaysAgo(1), to: now };
    if (filterDateRange === '7d') return { from: utcStartOfDaysAgo(7), to: now };
    if (filterDateRange === '30d') return { from: utcStartOfDaysAgo(30), to: now };
    if (filterDateRange === 'custom') {
      return {
        // Parse as UTC start-of-day (YYYY-MM-DD → T00:00:00Z)
        from: filterDateFrom ? new Date(filterDateFrom + 'T00:00:00Z') : null,
        // End-of-day UTC
        to: filterDateTo ? new Date(filterDateTo + 'T23:59:59Z') : null,
      };
    }
    return { from: null, to: null };
  };

  const filteredClientes = useMemo(() => {
    const { from, to } = getDateBounds();
    const result = clientes.filter((c: Cliente) => {
      if (!c.telefone) return false;

      // Status filter
      if (filterStatus !== 'todos' && c.status !== filterStatus) return false;

      // Assessor filter — ILIKE: "Isa" matches "Isa" and "Flávio/Isa"
      if (filterAssessor !== 'todos') {
        if (!c.assessor || !c.assessor.toLowerCase().includes(filterAssessor.toLowerCase())) return false;
      }

      // Categoria filter
      if (filterCategoria !== 'todos' && c.categoria_investimento !== filterCategoria) return false;

      // Chat ativo filter
      if (filterChatAtivo) {
        const normalized = normalizeTo11(c.telefone);
        if (!activeChatPhones.has(normalized)) return false;
      }

      // Date range filter
      if (from || to) {
        const updatedAt = (c as Cliente & { status_updated_at?: string }).status_updated_at;
        if (!updatedAt) return false;
        const t = new Date(updatedAt);
        if (from && t < from) return false;
        if (to && t > to) return false;
      }

      return true;
    });

    if (!filterChatAtivo) return result;

    // Sort by last_message_timestamp desc when chat ativo filter is on
    return [...result].sort((a: Cliente, b: Cliente) => {
      const ta = chatTimestampMap.get(normalizeTo11(a.telefone!)) ?? '';
      const tb = chatTimestampMap.get(normalizeTo11(b.telefone!)) ?? '';
      if (!ta && !tb) return 0;
      if (!ta) return 1;
      if (!tb) return -1;
      return tb < ta ? -1 : tb > ta ? 1 : 0;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientes, filterStatus, filterAssessor, filterCategoria, filterChatAtivo, activeChatPhones,
      chatTimestampMap, filterDateRange, filterDateFrom, filterDateTo]);

  const displayedClientes = useMemo(() => {
    if (!searchQuery.trim()) return filteredClientes;
    const q = searchQuery.toLowerCase();
    return filteredClientes.filter(c =>
      c.nome.toLowerCase().includes(q) ||
      (c.telefone || '').includes(searchQuery)
    );
  }, [filteredClientes, searchQuery]);

  const previewCliente = filteredClientes[0] || clientes[0];
  const previewMessage = message
    .replace(/\{primeiro_nome\}/gi, (previewCliente?.nome || 'João').split(' ')[0])
    .replace(/\{nome\}/gi, previewCliente?.nome || 'João')
    .replace(/\{assessor\}/gi, previewCliente?.assessor || 'Assessor');

  const toggleSelectAll = () => {
    if (selectedIds.size === displayedClientes.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(displayedClientes.map(c => c.id)));
    }
  };

  const toggleOne = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const estimatedMinutes = Math.ceil((selectedIds.size * delaySeconds) / 60);

  const handleSend = async () => {
    if (!profile?.id || selectedIds.size === 0 || !message.trim()) return;
    setSending(true);
    try {
      const selectedClientes = clientes.filter(c => selectedIds.has(c.id));

      const { data: broadcast, error: bError } = await supabase
        .from('whatsapp_broadcasts')
        .insert({
          user_id: profile.id,
          instance_name: instanceName,
          message: message.trim(),
          scheduled_at: scheduled && scheduledAt ? new Date(scheduledAt).toISOString() : null,
          status: 'pending',
          total_recipients: selectedClientes.length,
          sent_count: 0,
          failed_count: 0,
          delay_seconds: delaySeconds,
        })
        .select('id')
        .single();

      if (bError || !broadcast) throw new Error(bError?.message || 'Erro ao criar disparo');

      const recipients = selectedClientes.map(c => ({
        broadcast_id: broadcast.id,
        cliente_id: c.id,
        phone: c.telefone!.replace(/\D/g, ''),
        name: c.nome,
        status: 'pending',
      }));

      const { error: rError } = await supabase
        .from('whatsapp_broadcast_recipients')
        .insert(recipients);

      if (rError) throw new Error(rError.message);

      setBroadcastId(broadcast.id);
      setCurrentBroadcast({
        id: broadcast.id,
        message: message.trim(),
        scheduled_at: null,
        status: 'pending',
        total_recipients: selectedClientes.length,
        sent_count: 0,
        failed_count: 0,
        delay_seconds: delaySeconds,
        created_at: new Date().toISOString(),
      });

      if (!scheduled || !scheduledAt) {
        supabase.functions.invoke('process-broadcast', {
          body: { broadcast_id: broadcast.id },
        });
      }
    } catch (err) {
      console.error('[Broadcast] Error:', err);
      alert('Erro ao iniciar disparo: ' + (err instanceof Error ? err.message : 'Erro desconhecido'));
      setBroadcastId(null);
      setCurrentBroadcast(null);
      setSending(false);
    }
  };

  const handleCancel = async (id: string) => {
    if (!confirm('Cancelar o disparo? As mensagens já enviadas não serão desfeitas.')) return;
    await supabase.from('whatsapp_broadcasts').update({ status: 'cancelled' }).eq('id', id);
  };

  const loadDetail = async (id: string) => {
    setDetailBroadcastId(id);
    setLoadingDetail(true);
    const { data } = await supabase
      .from('whatsapp_broadcast_recipients')
      .select('*')
      .eq('broadcast_id', id)
      .order('id');
    if (data) setDetailRecipients(data as BroadcastRecipient[]);
    setLoadingDetail(false);
  };

  const statusLabel: Record<string, string> = {
    pending: 'Aguardando',
    processing: 'Enviando',
    completed: 'Concluído',
    failed: 'Falhou',
    cancelled: 'Cancelado',
  };

  const statusColor: Record<string, string> = {
    pending: 'bg-slate-100 text-slate-600',
    processing: 'bg-blue-100 text-blue-700',
    completed: 'bg-emerald-100 text-emerald-700',
    failed: 'bg-red-100 text-red-700',
    cancelled: 'bg-amber-100 text-amber-700',
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[150] flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 flex-shrink-0">
          <div className="flex items-center gap-3">
            <Radio size={20} className="text-emerald-600" />
            <h2 className="text-lg font-semibold text-slate-900">Disparo em Massa</h2>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 rounded">
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 flex-shrink-0">
          <button
            onClick={() => {
              const isActive = broadcastId && currentBroadcast && (currentBroadcast.status === 'pending' || currentBroadcast.status === 'processing');
              setTab('new');
              if (!isActive) { setStep(1); setBroadcastId(null); setCurrentBroadcast(null); setSending(false); }
            }}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${tab === 'new' ? 'border-b-2 border-emerald-500 text-emerald-600' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Novo Disparo
          </button>
          <button
            onClick={() => setTab('history')}
            className={`flex-1 py-3 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${tab === 'history' ? 'border-b-2 border-emerald-500 text-emerald-600' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <History size={15} />
            Histórico
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* ── HISTORY TAB ── */}
          {tab === 'history' && (
            <div className="p-6 space-y-4">
              {detailBroadcastId ? (
                <>
                  <button
                    onClick={() => setDetailBroadcastId(null)}
                    className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-4"
                  >
                    <ChevronLeft size={16} /> Voltar ao histórico
                  </button>
                  {loadingDetail ? (
                    <div className="flex justify-center py-8"><Loader2 className="animate-spin text-slate-400" size={24} /></div>
                  ) : (
                    <div className="space-y-2">
                      {detailRecipients.map(r => (
                        <div key={r.id} className="flex items-center justify-between py-2 px-3 border border-slate-100 rounded-lg">
                          <div>
                            <p className="text-sm font-medium text-slate-800">{r.name}</p>
                            <p className="text-xs text-slate-500">{r.phone}</p>
                          </div>
                          <div className="text-right">
                            {r.status === 'sent' && <CheckCircle2 size={16} className="text-emerald-500" />}
                            {r.status === 'failed' && (
                              <div className="flex items-center gap-1">
                                <XCircle size={16} className="text-red-500" />
                                <span className="text-xs text-red-500">{r.error}</span>
                              </div>
                            )}
                            {(r.status === 'pending' || r.status === 'sending') && (
                              <Loader2 size={16} className="animate-spin text-blue-400" />
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : loadingHistory ? (
                <div className="flex justify-center py-8"><Loader2 className="animate-spin text-slate-400" size={24} /></div>
              ) : broadcasts.length === 0 ? (
                <p className="text-center text-slate-500 py-8">Nenhum disparo realizado ainda.</p>
              ) : (
                broadcasts.map(b => (
                  <div key={b.id} className="border border-slate-200 rounded-xl p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm text-slate-700 line-clamp-2 flex-1">{b.message}</p>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${statusColor[b.status]}`}>
                        {statusLabel[b.status]}
                      </span>
                    </div>
                    {(b.status === 'processing' || b.status === 'pending') && b.total_recipients > 0 && (
                      <div className="space-y-1">
                        <div className="bg-slate-100 rounded-full overflow-hidden h-1.5">
                          <div
                            className="h-full bg-emerald-500 transition-all duration-500"
                            style={{ width: `${Math.round(((b.sent_count + b.failed_count) / b.total_recipients) * 100)}%` }}
                          />
                        </div>
                        <p className="text-xs text-slate-400">{b.sent_count + b.failed_count} / {b.total_recipients} processados</p>
                      </div>
                    )}
                    <div className="flex items-center gap-4 text-xs text-slate-500">
                      <span className="flex items-center gap-1">
                        <Users size={12} />
                        {b.total_recipients} destinatários
                      </span>
                      <span className="flex items-center gap-1 text-emerald-600">
                        <CheckCircle2 size={12} />
                        {b.sent_count} enviados
                      </span>
                      {b.failed_count > 0 && (
                        <span className="flex items-center gap-1 text-red-500">
                          <XCircle size={12} />
                          {b.failed_count} falhas
                        </span>
                      )}
                      <span>{new Date(b.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <button
                        onClick={() => loadDetail(b.id)}
                        className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                      >
                        <Eye size={12} /> Ver destinatários
                      </button>
                      {(b.status === 'processing' || b.status === 'pending') && (
                        <button
                          onClick={() => handleCancel(b.id)}
                          className="text-xs text-red-500 hover:underline flex items-center gap-1"
                        >
                          <XCircle size={12} /> Cancelar
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* ── NEW BROADCAST TAB ── */}
          {tab === 'new' && (
            <>
              {/* Sending progress */}
              {(sending || broadcastId) && currentBroadcast && (
                <div className="p-6 space-y-4">
                  <div className="text-center">
                    {currentBroadcast.status === 'completed' ? (
                      <CheckCircle2 size={48} className="text-emerald-500 mx-auto mb-3" />
                    ) : currentBroadcast.status === 'failed' ? (
                      <XCircle size={48} className="text-red-500 mx-auto mb-3" />
                    ) : currentBroadcast.status === 'cancelled' ? (
                      <XCircle size={48} className="text-amber-500 mx-auto mb-3" />
                    ) : (
                      <Loader2 size={48} className="text-blue-500 animate-spin mx-auto mb-3" />
                    )}
                    <h3 className="text-lg font-semibold text-slate-800">
                      {currentBroadcast.status === 'completed' ? 'Disparo concluído!' :
                       currentBroadcast.status === 'failed' ? 'Erro no disparo' :
                       currentBroadcast.status === 'cancelled' ? 'Disparo cancelado' :
                       scheduled && scheduledAt ? 'Disparo agendado!' : 'Enviando mensagens...'}
                    </h3>
                  </div>
                  {currentBroadcast.status !== 'completed' && currentBroadcast.status !== 'cancelled' && !(scheduled && scheduledAt) && (
                    <div className="space-y-1.5">
                      <div className="bg-slate-100 rounded-full overflow-hidden h-3">
                        <div
                          className="h-full bg-emerald-500 transition-all duration-500"
                          style={{ width: `${currentBroadcast.total_recipients > 0 ? Math.round(((currentBroadcast.sent_count + currentBroadcast.failed_count) / currentBroadcast.total_recipients) * 100) : 0}%` }}
                        />
                      </div>
                      <p className="text-xs text-slate-400 text-center">
                        O disparo continua mesmo se você fechar esta janela
                      </p>
                    </div>
                  )}
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="bg-slate-50 rounded-lg p-3">
                      <p className="text-2xl font-bold text-slate-700">{currentBroadcast.total_recipients}</p>
                      <p className="text-xs text-slate-500 mt-0.5">Total</p>
                    </div>
                    <div className="bg-emerald-50 rounded-lg p-3">
                      <p className="text-2xl font-bold text-emerald-600">{currentBroadcast.sent_count}</p>
                      <p className="text-xs text-slate-500 mt-0.5">Enviados</p>
                    </div>
                    <div className="bg-red-50 rounded-lg p-3">
                      <p className="text-2xl font-bold text-red-500">{currentBroadcast.failed_count}</p>
                      <p className="text-xs text-slate-500 mt-0.5">Falhas</p>
                    </div>
                  </div>
                  {(currentBroadcast.status === 'processing' || currentBroadcast.status === 'pending') && (
                    <div className="flex gap-2">
                      <button
                        onClick={onClose}
                        className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium transition-colors"
                      >
                        Fechar (disparo continua em background)
                      </button>
                      <button
                        onClick={() => handleCancel(currentBroadcast.id)}
                        className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-sm font-medium transition-colors"
                      >
                        Cancelar
                      </button>
                    </div>
                  )}
                  {currentBroadcast.status === 'cancelled' && (
                    <button
                      onClick={() => { setBroadcastId(null); setCurrentBroadcast(null); setSending(false); setStep(1); setMessage(''); setSelectedIds(new Set()); }}
                      className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium transition-colors"
                    >
                      Novo Disparo
                    </button>
                  )}
                  {currentBroadcast.status === 'completed' && (
                    <button
                      onClick={() => { setTab('history'); setBroadcastId(null); setCurrentBroadcast(null); setSending(false); setStep(1); setMessage(''); setSelectedIds(new Set()); }}
                      className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium transition-colors"
                    >
                      Ver histórico
                    </button>
                  )}
                </div>
              )}

              {/* Steps */}
              {!sending && !broadcastId && (
                <>
                  {/* Step indicator */}
                  <div className="flex items-center px-6 py-3 border-b border-slate-100 bg-slate-50 gap-2 flex-shrink-0">
                    {([1, 2, 3] as Step[]).map((s, i) => (
                      <div key={s} className="flex items-center gap-2 flex-1">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 transition-colors ${
                          step === s ? 'bg-emerald-500 text-white' :
                          step > s ? 'bg-emerald-200 text-emerald-700' :
                          'bg-slate-200 text-slate-500'
                        }`}>
                          {step > s ? '✓' : s}
                        </div>
                        <span className={`text-xs hidden sm:block ${step === s ? 'text-emerald-600 font-medium' : 'text-slate-400'}`}>
                          {s === 1 ? 'Mensagem' : s === 2 ? 'Destinatários' : 'Confirmar'}
                        </span>
                        {i < 2 && <ChevronRight size={14} className="text-slate-300 flex-shrink-0" />}
                      </div>
                    ))}
                  </div>

                  {/* STEP 1 — Message */}
                  {step === 1 && (
                    <div className="p-6 space-y-5">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                          Mensagem
                          <span className="ml-2 text-xs font-normal text-slate-400">use {'{nome}'}, {'{primeiro_nome}'} e {'{assessor}'} como variáveis</span>
                        </label>
                        <textarea
                          value={message}
                          onChange={e => setMessage(e.target.value)}
                          rows={5}
                          placeholder="Olá {nome}, aqui é o {assessor}..."
                          className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 resize-none"
                        />
                        <p className="text-xs text-slate-400 mt-1 text-right">{message.length} caracteres</p>
                      </div>

                      {message && previewCliente && (
                        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                          <p className="text-xs font-medium text-emerald-700 mb-1.5">Preview com {previewCliente.nome}:</p>
                          <p className="text-sm text-slate-700 whitespace-pre-wrap">{previewMessage}</p>
                        </div>
                      )}

                      <div className="space-y-3">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={scheduled}
                            onChange={e => setScheduled(e.target.checked)}
                            className="rounded border-slate-300 text-emerald-500"
                          />
                          <span className="text-sm text-slate-700 flex items-center gap-1.5">
                            <Clock size={15} />
                            Agendar envio
                          </span>
                        </label>
                        {scheduled && (
                          <input
                            type="datetime-local"
                            value={scheduledAt}
                            onChange={e => setScheduledAt(e.target.value)}
                            className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 w-full"
                          />
                        )}
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                          Delay entre mensagens: <span className="text-emerald-600 font-semibold">{delaySeconds}s</span>
                        </label>
                        <input
                          type="range"
                          min={10}
                          max={60}
                          step={5}
                          value={delaySeconds}
                          onChange={e => setDelaySeconds(Number(e.target.value))}
                          className="w-full accent-emerald-500"
                        />
                        <div className="flex justify-between text-xs text-slate-400 mt-1">
                          <span>10s (mais rápido)</span>
                          <span>60s (mais seguro)</span>
                        </div>
                      </div>

                      <button
                        onClick={() => setStep(2)}
                        disabled={!message.trim()}
                        className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors"
                      >
                        Selecionar destinatários
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  )}

                  {/* STEP 2 — Recipients */}
                  {step === 2 && (
                    <div className="p-6 space-y-4">
                      {/* Row 1: Status + Assessor */}
                      <div className="flex gap-3">
                        <div className="flex-1">
                          <label className="block text-xs font-medium text-slate-600 mb-1">Status</label>
                          <select
                            value={filterStatus}
                            onChange={e => handleFilterChange(setFilterStatus, e.target.value)}
                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500"
                          >
                            <option value="todos">Todos os status</option>
                            {columns.map(c => (
                              <option key={c.status_key} value={c.status_key}>{c.display_name}</option>
                            ))}
                          </select>
                        </div>
                        <div className="flex-1">
                          <label className="block text-xs font-medium text-slate-600 mb-1">Assessor</label>
                          <select
                            value={filterAssessor}
                            onChange={e => handleFilterChange(setFilterAssessor, e.target.value)}
                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500"
                          >
                            <option value="todos">Todos</option>
                            {assessores.map(a => (
                              <option key={a} value={a}>{a}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Row 2: Categoria + Data */}
                      <div className="flex gap-3">
                        <div className="flex-1">
                          <label className="block text-xs font-medium text-slate-600 mb-1">Categoria</label>
                          <select
                            value={filterCategoria}
                            onChange={e => handleFilterChange(setFilterCategoria, e.target.value)}
                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500"
                          >
                            <option value="todos">Todas as categorias</option>
                            {INVESTMENT_CATEGORIES.map(cat => (
                              <option key={cat.value} value={cat.value}>{cat.label}</option>
                            ))}
                          </select>
                        </div>
                        <div className="flex-1">
                          <label className="block text-xs font-medium text-slate-600 mb-1">Última atualização</label>
                          <select
                            value={filterDateRange}
                            onChange={e => handleFilterChange(setFilterDateRange, e.target.value as DateRangeOption)}
                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500"
                          >
                            <option value="todos">Qualquer data</option>
                            <option value="24h">Últimas 24h</option>
                            <option value="7d">Últimos 7 dias</option>
                            <option value="30d">Último mês</option>
                            <option value="custom">Personalizado</option>
                          </select>
                        </div>
                      </div>

                      {/* Custom date inputs */}
                      {filterDateRange === 'custom' && (
                        <div className="flex gap-3">
                          <div className="flex-1">
                            <label className="block text-xs font-medium text-slate-600 mb-1">De</label>
                            <input
                              type="date"
                              value={filterDateFrom}
                              onChange={e => handleFilterChange(setFilterDateFrom, e.target.value)}
                              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500"
                            />
                          </div>
                          <div className="flex-1">
                            <label className="block text-xs font-medium text-slate-600 mb-1">Até</label>
                            <input
                              type="date"
                              value={filterDateTo}
                              onChange={e => handleFilterChange(setFilterDateTo, e.target.value)}
                              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500"
                            />
                          </div>
                        </div>
                      )}

                      {/* Chat ativo toggle */}
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={filterChatAtivo}
                          onChange={e => handleFilterChange(setFilterChatAtivo, e.target.checked)}
                          className="rounded border-slate-300 text-emerald-500"
                        />
                        <MessageCircle size={14} className="text-slate-500" />
                        <span className="text-sm text-slate-700">Apenas clientes com chat ativo</span>
                        {filterChatAtivo && (
                          <span className="ml-auto text-xs text-emerald-600 font-medium">{activeChatPhones.size} chats</span>
                        )}
                      </label>

                      {/* Selection cleared notice */}
                      {filterSelectionCleared && (
                        <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
                          Seleção limpa ao alterar filtros
                        </p>
                      )}

                      {/* Search within filtered list */}
                      <div className="relative">
                        <input
                          type="text"
                          placeholder="Buscar por nome ou telefone..."
                          value={searchQuery}
                          onChange={e => setSearchQuery(e.target.value)}
                          className="w-full pl-3 pr-8 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-slate-50"
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

                      {/* Select all + counter */}
                      <div className="flex items-center justify-between">
                        <button
                          onClick={toggleSelectAll}
                          className="text-sm text-emerald-600 hover:underline font-medium"
                        >
                          {selectedIds.size === displayedClientes.length && displayedClientes.length > 0
                            ? 'Desmarcar todos'
                            : `Selecionar todos (${displayedClientes.length})`}
                        </button>
                        <span className="text-sm font-semibold text-slate-700">
                          {selectedIds.size} selecionados
                        </span>
                      </div>

                      {/* List */}
                      {loadingClientes ? (
                        <div className="flex justify-center py-8"><Loader2 className="animate-spin text-slate-400" size={24} /></div>
                      ) : (
                        <div className="border border-slate-200 rounded-lg overflow-hidden max-h-56 overflow-y-auto">
                          {displayedClientes.length === 0 ? (
                            <p className="text-center text-slate-500 py-6 text-sm">Nenhum cliente com telefone nesse filtro.</p>
                          ) : (
                            displayedClientes.map(c => (
                              <label key={c.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 border-b border-slate-100 last:border-0 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={selectedIds.has(c.id)}
                                  onChange={() => toggleOne(c.id)}
                                  className="rounded border-slate-300 text-emerald-500 flex-shrink-0"
                                />
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-medium text-slate-800 truncate flex items-center gap-1.5">
                                    {(() => {
                                      const normalized = normalizeTo11(c.telefone || '');
                                      if (!activeChatPhones.has(normalized)) return null;
                                      const ts = chatTimestampMap.get(normalized);
                                      const old = ts ? (Date.now() - new Date(ts).getTime()) > 30 * 86400000 : true;
                                      return <span style={{ width: 7, height: 7, borderRadius: '50%', background: old ? '#E24B4A' : '#1D9E75', flexShrink: 0, display: 'inline-block' }} />;
                                    })()}
                                    {c.nome}
                                  </p>
                                  <p className="text-xs text-slate-500">{c.telefone}</p>
                                </div>
                                {c.assessor && (
                                  <span className="text-xs text-slate-400 flex-shrink-0">{c.assessor}</span>
                                )}
                              </label>
                            ))
                          )}
                        </div>
                      )}

                      <div className="flex gap-2">
                        <button
                          onClick={() => setStep(1)}
                          className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors"
                        >
                          <ChevronLeft size={16} /> Voltar
                        </button>
                        <button
                          onClick={() => setStep(3)}
                          disabled={selectedIds.size === 0}
                          className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors"
                        >
                          Confirmar
                          <ChevronRight size={16} />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* STEP 3 — Confirm */}
                  {step === 3 && (
                    <div className="p-6 space-y-5">
                      <div className="bg-slate-50 rounded-xl p-4 space-y-2 border border-slate-200">
                        <h4 className="text-sm font-semibold text-slate-700 mb-3">Resumo do disparo</h4>
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-500">Destinatários</span>
                          <span className="font-semibold text-slate-800">{selectedIds.size}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-500">Delay entre mensagens</span>
                          <span className="font-semibold text-slate-800">{delaySeconds}s</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-500">Tempo estimado</span>
                          <span className="font-semibold text-slate-800">~{estimatedMinutes} min</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-500">Envio</span>
                          <span className="font-semibold text-slate-800">
                            {scheduled && scheduledAt
                              ? new Date(scheduledAt).toLocaleString('pt-BR')
                              : 'Imediato'}
                          </span>
                        </div>
                      </div>

                      <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                        <p className="text-xs font-medium text-slate-600 mb-1">Mensagem:</p>
                        <p className="text-sm text-slate-700 whitespace-pre-wrap line-clamp-4">{message}</p>
                      </div>

                      <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex gap-2">
                        <AlertTriangle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
                        <p className="text-xs text-red-700">
                          <strong>Atenção:</strong> Envio em massa pode resultar em banimento da conta WhatsApp.
                          Recomendamos no máximo <strong>100 mensagens por dia</strong>.
                        </p>
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={() => setStep(2)}
                          className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors"
                        >
                          <ChevronLeft size={16} /> Voltar
                        </button>
                        <button
                          onClick={handleSend}
                          className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors"
                        >
                          {scheduled && scheduledAt ? (
                            <><Clock size={15} /> Agendar</>
                          ) : (
                            <><Send size={15} /> Enviar agora</>
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
