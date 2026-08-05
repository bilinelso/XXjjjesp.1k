import React, { useState, useEffect, useCallback } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Users, TrendingUp, DollarSign, AlertCircle, Download, Filter, Phone, Search, X, LayoutGrid, List, Calendar, Settings, LogOut, Upload, FileText, ArrowUpDown, ArrowUp, ArrowDown, RefreshCw, CreditCard as Edit2, Check, ChevronDown, Eye, ClipboardList, CheckSquare, Square, MessageCircle, BadgeCheck, User, ChevronLeft, ChevronRight, Lock, Menu, Monitor, Smartphone } from 'lucide-react';
import { useAuth } from './contexts/AuthContext';
import { Login } from './components/Login';
import { UserManagement } from './components/UserManagement';
import { AssessorManagement } from './components/AssessorManagement';
import { useClientes } from './hooks/useClientes';
import { useAgendamentos } from './hooks/useAgendamentos';
import { useKanbanColumns } from './hooks/useKanbanColumns';
import { useLeads } from './hooks/useLeads';
import { Leadboard } from './components/Leadboard';
import { ClientDetailModal } from './components/ClientDetailModal';
import { LeadTrackingModal } from './components/LeadTrackingModal';
import { BulkEditModal } from './components/BulkEditModal';
import { DatePicker } from './components/DatePicker';
import { Pagination } from './components/Pagination';
import { INVESTMENT_CATEGORIES } from './utils/investmentCategories';
import type { Cliente, Filtros, Agendamento } from './lib/api';
import type { Lead } from './hooks/useLeads';
import { capitalizeName, normalizeAssessor } from './utils/formatters';
import { supabase } from './lib/supabase';
import { WhatsAppView } from './components/whatsapp/WhatsAppView';
import { InternalChat } from './components/InternalChat';
import { NotificationBell } from './components/NotificationBell';
import { NotificationCreate } from './components/NotificationCreate';
import { LeadDistributionConfig } from './components/LeadDistributionConfig';
import { AssessorComprouConfig } from './components/AssessorComprouConfig';
import { AtendimentosView } from './components/AtendimentosView';
import { CampanhasView } from './components/CampanhasView';
import { CampanhaCostConfig } from './components/CampanhaCostConfig';
import { CampanhaMatchingConfig } from './components/CampanhaMatchingConfig';
import { FinanceiroView } from './components/FinanceiroView';
import { AddLeadManualModal } from './components/AddLeadManualModal';
import { PasswordManager } from './components/PasswordManager';
import { LeadMatchingAudit } from './components/LeadMatchingAudit';
import { ShadowClientView } from './components/ShadowClientView';
import { WabaView } from './components/waba/WabaView';
import { LeadCardList } from './components/LeadCardList';
import { LeadSortMenu } from './components/LeadSortMenu';
import { LG_QUERY, MD_QUERY, MOBILE_VIEWS, type ViewType } from './lib/viewRouting';
import { useMediaQuery } from './hooks/useMediaQuery';
import { useViewRoute } from './hooks/useViewRoute';

/** "Ver versão completa" vale pela sessão — sobrevive ao F5, não ao fechar a aba. */
const FULL_VERSION_KEY = 'crm_mobile_full_version';

function NavItem({ icon, label, active, collapsed, onClick, badge }: {
  icon: React.ReactNode; label: string; active: boolean; collapsed: boolean; onClick: () => void; badge?: string;
}) {
  return (
    <div className="relative px-2 mb-0.5">
      <button
        onClick={onClick}
        title={collapsed ? label : undefined}
        className={`w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-sm font-medium transition-colors ${
          active ? 'bg-[#E6F1FB] text-[#0C447C]' : 'text-slate-600 hover:bg-slate-100'
        }`}
      >
        <span className="flex-shrink-0 relative">
          {icon}
          {collapsed && badge && (
            <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full" />
          )}
        </span>
        {!collapsed && <span className="flex-1 text-left truncate">{label}</span>}
        {!collapsed && badge && (
          <span className="ml-auto px-1.5 py-0.5 bg-red-500 text-white text-xs rounded-full font-medium min-w-[18px] text-center leading-none">
            {badge}
          </span>
        )}
      </button>
    </div>
  );
}

function NavGroup({ label, collapsed, children }: { label: string; collapsed: boolean; children: React.ReactNode }) {
  return (
    <div className="mb-1">
      {!collapsed && (
        <p className="px-4 pt-3 pb-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{label}</p>
      )}
      {collapsed && <div className="mx-2 my-1 border-t border-slate-100" />}
      {children}
    </div>
  );
}

function AppContent() {
  const { profile, signOut, canAccess } = useAuth();

  const isDesktop = useMediaQuery(LG_QUERY);
  const isMdUp = useMediaQuery(MD_QUERY);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [fullVersion, setFullVersion] = useState(() => {
    try {
      return sessionStorage.getItem(FULL_VERSION_KEY) === '1';
    } catch {
      return false;
    }
  });
  /** Abaixo de `lg`, só as telas responsivas — até o usuário pedir a versão completa. */
  const mobileRestricted = !isDesktop && !fullVersion;

  /**
   * Permissão real de cada tela. Espelha exatamente as condições da sidebar —
   * `canAccess` não cobre as telas sem flag própria (atendimentos, waba,
   * senhas, auditoria, cliente oculto), que têm regra própria abaixo.
   */
  const canView = useCallback((target: ViewType): boolean => {
    if (!profile) return false;
    switch (target) {
      case 'atendimentos':
      case 'waba':
        return true;
      case 'cliente-oculto':
      case 'lead-audit':
        return !!profile.is_master;
      case 'campanhas':
        return !!(profile.is_master || profile.can_access_campanhas);
      case 'financeiro':
        return !!(profile.is_master || profile.can_access_financeiro);
      case 'senhas':
        return !!(profile.is_master || profile.can_access_passwords);
      default:
        return canAccess(target);
    }
  }, [profile, canAccess]);

  const { view, setView } = useViewRoute({
    ready: !!profile,
    isMobile: !isDesktop,
    restrictToMobileViews: mobileRestricted,
    canView,
  });

  /**
   * No celular o WABA ocupa a tela inteira e o composer fica colado no rodapé:
   * o botão flutuante do chat interno sentava em cima do botão de enviar. Não
   * existe posição segura para ele ali, então não é montado nessa combinação.
   */
  const hideInternalChat = view === 'waba' && !isMdUp;

  /** Navegação a partir da gaveta: troca a tela e fecha o overlay. */
  const navigate = useCallback((target: ViewType) => {
    setView(target);
    setDrawerOpen(false);
  }, [setView]);

  /** Item visível no menu: precisa de permissão e, no mobile, ser responsivo. */
  const navVisible = (target: ViewType) =>
    canView(target) && (!mobileRestricted || MOBILE_VIEWS.includes(target));

  const enableFullVersion = () => {
    try { sessionStorage.setItem(FULL_VERSION_KEY, '1'); } catch { /* sessão indisponível */ }
    setFullVersion(true);
  };

  const disableFullVersion = () => {
    try { sessionStorage.removeItem(FULL_VERSION_KEY); } catch { /* sessão indisponível */ }
    setFullVersion(false);
  };

  // A gaveta só existe abaixo de `lg`; ao voltar para o desktop ela some.
  useEffect(() => {
    if (isDesktop) setDrawerOpen(false);
  }, [isDesktop]);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [drawerOpen]);

  const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [autoOpenAgendamento, setAutoOpenAgendamento] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [showLeadModal, setShowLeadModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [datePreset, setDatePreset] = useState<string>('todos');
  const [mostrarOcultos, setMostrarOcultos] = useState(false);
  const [filtros, setFiltros] = useState<Filtros>({
    dataInicio: '',
    dataFim: '',
    assessor: 'todas',
    status: 'todos',
    categoriaInvestimento: 'todas'
  });
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  const [agendTab, setAgendTab] = useState<'atrasadas' | 'hoje' | 'proximos' | 'sem_agendamento' | 'inativos'>('atrasadas');
  const [agendSearch, setAgendSearch] = useState('');
  const [agendFilterAssessor, setAgendFilterAssessor] = useState('todas');
  const [agendFilterStatus, setAgendFilterStatus] = useState('todos');
  const [, setLastLigacaoByCliente] = useState<Map<string, string>>(new Map());
  const [, setUserProfilesMap] = useState<Map<string, string>>(new Map());
  const [, setLastContactUserByCliente] = useState<Map<string, string>>(new Map());
  // Per-user last contact: clienteId → { timestamp, fonte }
  const [agendMeuContato, setAgendMeuContato] = useState<Map<string, { timestamp: string; fonte: 'WhatsApp' | 'ligação' }>>(new Map());
  const [agendAssessorNome, setAgendAssessorNome] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [manualImportForm, setManualImportForm] = useState({
    nome: '',
    email: '',
    telefone: '',
    data_compra: '',
    valor_produto: '',
    status: 'comprou'
  });
  const [submittingManual, setSubmittingManual] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [ocultarDuplicados, setOcultarDuplicados] = useState(false);
  const [formularioSearchQuery, setFormularioSearchQuery] = useState('');
  const [showAddLeadModal, setShowAddLeadModal] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [currentPageClientes, setCurrentPageClientes] = useState(1);
  const [currentPageFormularios, setCurrentPageFormularios] = useState(1);
  const itemsPerPage = 100;
  const [selectedClienteIds, setSelectedClienteIds] = useState<Set<string>>(new Set());
  const [showBulkEditModal, setShowBulkEditModal] = useState(false);
  const [whatsappTargetPhone, setWhatsappTargetPhone] = useState<string | null>(null);
  const [whatsappUnread, setWhatsappUnread] = useState(0);
  // Contagem do módulo WABA (WhatsApp oficial) — independente do badge do módulo QR.
  const [wabaUnread, setWabaUnread] = useState(0);
  const [wabaOpenChatId, setWabaOpenChatId] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  // Na gaveta do mobile o modo colapsado não faz sentido — ela é sempre completa.
  const navCollapsed = isDesktop && sidebarCollapsed;

  useEffect(() => {
    if (view === 'whatsapp') setWhatsappUnread(0);
  }, [view]);


  const handleOpenWhatsApp = (phone: string) => {
    setWhatsappTargetPhone(phone);
    setSelectedCliente(null);
    setShowModal(false);
    setView('whatsapp');
  };

  /** Vem do menu do telefone com o chat já resolvido pela RPC `waba_open_chat`. */
  const handleOpenWabaChat = (chatId: string) => {
    setWabaOpenChatId(chatId);
    setSelectedCliente(null);
    setShowModal(false);
    setView('waba');
  };

  const handleWabaOpenChatHandled = useCallback(() => setWabaOpenChatId(null), []);

  const { clientes, loading, filtrarClientes, updateCliente, fetchClientes, createCliente } = useClientes();
  const { fetchAllAgendamentos, deleteAgendamento } = useAgendamentos();
  const [assessoresDisponiveis, setAssessoresDisponiveis] = useState<{ id: string; nome: string }[]>([]);
  const { columns: kanbanColumns, loading: kanbanLoading, updateColumnName, getDisplayName } = useKanbanColumns();
  const { leads, loading: leadsLoading, fetchLeads } = useLeads();
  const [editingColumnId, setEditingColumnId] = useState<string | null>(null);
  const [editingColumnName, setEditingColumnName] = useState('');
  const [draggedClienteId, setDraggedClienteId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('crm_hidden_kanban_columns');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });
  const [meuNomeAssessor, setMeuNomeAssessor] = useState<string | null>(null);

  // Abre a ficha do cliente a partir de uma conversa WABA.
  const handleOpenClienteFromWaba = async (clienteId: string) => {
    const local = clientes.find(c => c.id === clienteId);
    if (local) {
      setSelectedCliente(local);
      setShowModal(true);
      return;
    }
    const { data } = await supabase.from('clientes').select('*').eq('id', clienteId).maybeSingle();
    if (data) {
      setSelectedCliente(data as Cliente);
      setShowModal(true);
    }
  };

  const clientesFiltrados = filtrarClientes(filtros)
    .filter(cliente => mostrarOcultos ? cliente.oculto : !cliente.oculto)
    .filter(cliente => {
      if (filtros.categoriaInvestimento !== 'todas') {
        if (!cliente.categoria_investimento || cliente.categoria_investimento !== filtros.categoriaInvestimento) {
          return false;
        }
      }
      return true;
    })
    .filter(cliente => {
      if (!searchQuery.trim()) return true;
      const query = searchQuery.toLowerCase();
      return (
        cliente.nome.toLowerCase().includes(query) ||
        (cliente.email?.toLowerCase() || '').includes(query) ||
        (cliente.telefone || '').includes(query) ||
        (cliente.assessor?.toLowerCase() || '').includes(query)
      );
    });

  const clientesOrdenados = React.useMemo(() => {
    if (!sortConfig) return clientesFiltrados;

    const sorted = [...clientesFiltrados].sort((a, b) => {
      let aValue: any;
      let bValue: any;

      switch (sortConfig.key) {
        case 'nome':
          aValue = a.nome.toLowerCase();
          bValue = b.nome.toLowerCase();
          break;
        case 'email':
          aValue = (a.email || '').toLowerCase();
          bValue = (b.email || '').toLowerCase();
          break;
        case 'status':
          aValue = a.status;
          bValue = b.status;
          break;
        case 'assessor':
          aValue = (a.assessor || '').toLowerCase();
          bValue = (b.assessor || '').toLowerCase();
          break;
        case 'valor_deposito': {
          // Vazios sempre no fim, nos dois sentidos: quase metade da base não
          // tem depósito, e no ascendente eles enterrariam quem tem.
          const aEmpty = (a.valor_deposito ?? 0) < 1;
          const bEmpty = (b.valor_deposito ?? 0) < 1;
          if (aEmpty !== bEmpty) return aEmpty ? 1 : -1;
          aValue = a.valor_deposito ?? 0;
          bValue = b.valor_deposito ?? 0;
          break;
        }
        case 'performance':
          aValue = a.performance ?? -Infinity;
          bValue = b.performance ?? -Infinity;
          break;
        case 'profit_pct': {
          const calcPct = (c: typeof a) => {
            const depositoReal = (c.valor_deposito ?? 0) - (c.profit_moneta ?? 0);
            return depositoReal > 0 ? (c.profit_moneta ?? 0) / depositoReal * 100 : -Infinity;
          };
          aValue = a.profit_moneta != null ? calcPct(a) : -Infinity;
          bValue = b.profit_moneta != null ? calcPct(b) : -Infinity;
          break;
        }
        case 'data_compra':
          aValue = new Date(a.data_compra).getTime();
          bValue = new Date(b.data_compra).getTime();
          break;
        default:
          return 0;
      }

      if (aValue < bValue) {
        return sortConfig.direction === 'asc' ? -1 : 1;
      }
      if (aValue > bValue) {
        return sortConfig.direction === 'asc' ? 1 : -1;
      }
      return 0;
    });

    return sorted;
  }, [clientesFiltrados, sortConfig]);


  const normalizarTelefone = (telefone: string): string => {
    return telefone.replace(/\D/g, '');
  };

  const leadsFiltrados = React.useMemo(() => {
    let filtered = leads.filter(lead => {
      if (!formularioSearchQuery.trim()) return true;
      const query = formularioSearchQuery.toLowerCase();
      return (
        (lead.nome || '').toLowerCase().includes(query) ||
        (lead.telefone || '').includes(query) ||
        (lead.click_id && lead.click_id.toLowerCase().includes(query)) ||
        (lead.gclid && lead.gclid.toLowerCase().includes(query))
      );
    });

    if (ocultarDuplicados && filtered.length > 0) {
      const seenTelefones = new Set<string>();

      filtered = filtered.filter(lead => {
        const telefoneNorm = normalizarTelefone(lead.telefone);

        if (seenTelefones.has(telefoneNorm)) {
          return false;
        }

        seenTelefones.add(telefoneNorm);
        return true;
      });
    }

    return filtered;
  }, [leads, formularioSearchQuery, ocultarDuplicados]);

  const totalPagesClientes = Math.ceil(clientesOrdenados.length / itemsPerPage);
  const totalPagesFormularios = Math.ceil(leadsFiltrados.length / itemsPerPage);

  const clientesPaginados = React.useMemo(() => {
    const startIndex = (currentPageClientes - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return clientesOrdenados.slice(startIndex, endIndex);
  }, [clientesOrdenados, currentPageClientes, itemsPerPage]);

  const formulariosPaginados = React.useMemo(() => {
    const startIndex = (currentPageFormularios - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return leadsFiltrados.slice(startIndex, endIndex);
  }, [leadsFiltrados, currentPageFormularios, itemsPerPage]);

  const handleSort = (key: string) => {
    setSortConfig(current => {
      if (!current || current.key !== key) {
        return { key, direction: 'asc' };
      }
      if (current.direction === 'asc') {
        return { key, direction: 'desc' };
      }
      return null;
    });
  };

  const getSortIcon = (columnKey: string) => {
    if (!sortConfig || sortConfig.key !== columnKey) {
      return <ArrowUpDown size={16} className="text-slate-400" />;
    }
    return sortConfig.direction === 'asc'
      ? <ArrowUp size={16} className="text-blue-600" />
      : <ArrowDown size={16} className="text-blue-600" />;
  };

  useEffect(() => {
    loadAgendamentos();
    loadSavedFilters();
    loadAssessores();
  }, []);

  const loadAssessores = async () => {
    try {
      const { data } = await supabase
        .from('assessores')
        .select('id, nome')
        .eq('ativo', true)
        .order('nome');
      setAssessoresDisponiveis(data || []);
    } catch (error) {
      console.error('Error loading assessores:', error);
    }
  };

  useEffect(() => {
    setCurrentPageClientes(1);
  }, [filtros, searchQuery, mostrarOcultos, sortConfig]);

  useEffect(() => {
    setCurrentPageFormularios(1);
  }, [searchQuery]);

  const loadSavedFilters = () => {
    try {
      const savedPreset = localStorage.getItem('crm_date_preset');
      const savedFilters = localStorage.getItem('crm_filters');

      if (savedPreset) {
        setDatePreset(savedPreset);
        applyDatePreset(savedPreset);
      }

      if (savedFilters) {
        const filters = JSON.parse(savedFilters);
        setFiltros(prev => ({
          ...prev,
          assessor: filters.assessor || 'todas',
          status: filters.status || 'todos',
          categoriaInvestimento: filters.categoriaInvestimento || 'todas'
        }));
      }
    } catch (error) {
      console.error('Error loading saved filters:', error);
    }
  };

  const saveFilters = (preset: string, filters: Filtros) => {
    try {
      localStorage.setItem('crm_date_preset', preset);
      localStorage.setItem('crm_filters', JSON.stringify({
        assessor: filters.assessor,
        status: filters.status,
        categoriaInvestimento: filters.categoriaInvestimento
      }));
    } catch (error) {
      console.error('Error saving filters:', error);
    }
  };

  const applyDatePreset = (preset: string) => {
    const hoje = new Date();
    let dataInicio = '';
    let dataFim = hoje.toISOString().split('T')[0];

    switch (preset) {
      case '7dias':
        const sete = new Date(hoje);
        sete.setDate(sete.getDate() - 7);
        dataInicio = sete.toISOString().split('T')[0];
        break;
      case '15dias':
        const quinze = new Date(hoje);
        quinze.setDate(quinze.getDate() - 15);
        dataInicio = quinze.toISOString().split('T')[0];
        break;
      case '30dias':
        const trinta = new Date(hoje);
        trinta.setDate(trinta.getDate() - 30);
        dataInicio = trinta.toISOString().split('T')[0];
        break;
      case 'este-mes':
        const primeiroDia = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
        dataInicio = primeiroDia.toISOString().split('T')[0];
        break;
      case 'mes-passado':
        const mesPassadoInicio = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
        const mesPassadoFim = new Date(hoje.getFullYear(), hoje.getMonth(), 0);
        dataInicio = mesPassadoInicio.toISOString().split('T')[0];
        dataFim = mesPassadoFim.toISOString().split('T')[0];
        break;
      case 'custom':
        return;
      case 'todos':
      default:
        dataInicio = '';
        dataFim = '';
        break;
    }

    setFiltros(prev => ({
      ...prev,
      dataInicio,
      dataFim
    }));
  };

  const handleDatePresetChange = (preset: string) => {
    setDatePreset(preset);
    applyDatePreset(preset);
    saveFilters(preset, filtros);
  };

  const handleCustomDateChange = (field: 'dataInicio' | 'dataFim', value: string) => {
    setDatePreset('custom');
    const newFiltros = { ...filtros, [field]: value };
    setFiltros(newFiltros);
    saveFilters('custom', newFiltros);
  };

  const handleFilterChange = (field: keyof Filtros, value: string) => {
    const newFiltros = { ...filtros, [field]: value };
    setFiltros(newFiltros);
    saveFilters(datePreset, newFiltros);
  };

  useEffect(() => {
    loadAgendamentos();
  }, []);

  const loadAgendamentos = async () => {
    const data = await fetchAllAgendamentos();
    setAgendamentos(data);
  };

  useEffect(() => {
    if (view !== 'agendamentos') return;

    // Load own assessor name (applies to masters too — visibility defaults to own clients)
    if (profile?.assessor_id) {
      supabase
        .from('assessores')
        .select('nome')
        .eq('id', profile.assessor_id)
        .maybeSingle()
        .then(({ data }) => setAgendAssessorNome(data?.nome ?? null));
    } else {
      setAgendAssessorNome(null);
    }

    Promise.all([
      supabase.from('ligacoes').select('cliente_id, user_id, created_at').order('created_at', { ascending: false }),
      supabase.from('user_profiles').select('id, email'),
      supabase.from('persistent_chats').select('user_id, contact_phone, last_message_timestamp').not('last_message_timestamp', 'is', null),
    ]).then(([ligRes, userRes, chatRes]) => {
      // ── last ligacao per client ──────────────────────────────────────────
      const ligMap = new Map<string, string>();
      const ligUserMap = new Map<string, { userId: string; ts: string }>();
      (ligRes.data || []).forEach((l: { cliente_id: string; user_id: string | null; created_at: string }) => {
        if (!ligMap.has(l.cliente_id)) {
          ligMap.set(l.cliente_id, l.created_at);
          if (l.user_id) ligUserMap.set(l.cliente_id, { userId: l.user_id, ts: l.created_at });
        }
      });
      setLastLigacaoByCliente(ligMap);

      // ── user name map (email before @) ───────────────────────────────────
      const uMap = new Map<string, string>();
      (userRes.data || []).forEach((u: { id: string; email: string }) => {
        uMap.set(u.id, u.email.split('@')[0]);
      });
      setUserProfilesMap(uMap);

      // ── last chat contact user per client (matched by phone suffix) ──────
      // Build map: last10digits(contact_phone) → { userId, ts }
      const chatByPhone = new Map<string, { userId: string; ts: string }>();
      (chatRes.data || []).forEach((ch: { user_id: string; contact_phone: string; last_message_timestamp: string }) => {
        const key = ch.contact_phone.replace(/\D/g, '').slice(-10);
        const existing = chatByPhone.get(key);
        if (!existing || ch.last_message_timestamp > existing.ts) {
          chatByPhone.set(key, { userId: ch.user_id, ts: ch.last_message_timestamp });
        }
      });

      // Merge ligUserMap and chatByPhone per client
      const contactUserMap = new Map<string, string>();
      clientes.forEach(c => {
        const phoneKey = (c.telefone || '').replace(/\D/g, '').slice(-10);
        const ligEntry   = ligUserMap.get(c.id);
        const chatEntry  = chatByPhone.get(phoneKey);

        if (!ligEntry && !chatEntry) return;
        if (!ligEntry) { contactUserMap.set(c.id, chatEntry!.userId); return; }
        if (!chatEntry) { contactUserMap.set(c.id, ligEntry.userId); return; }
        // Use whichever has the more recent timestamp
        contactUserMap.set(c.id, ligEntry.ts >= chatEntry.ts ? ligEntry.userId : chatEntry.userId);
      });
      setLastContactUserByCliente(contactUserMap);
    });

    // ── user-specific last contact (own chats + own ligacoes only) ──────────
    if (profile?.id) {
      Promise.all([
        supabase
          .from('ligacoes')
          .select('cliente_id, created_at')
          .eq('user_id', profile.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('persistent_chats')
          .select('contact_phone, last_message_timestamp')
          .eq('user_id', profile.id)
          .not('last_message_timestamp', 'is', null),
      ]).then(([myLigRes, myChatRes]) => {
        // own ligacoes: max created_at per cliente_id
        const myLigMap = new Map<string, string>();
        for (const l of (myLigRes.data || [])) {
          if (!myLigMap.has(l.cliente_id)) myLigMap.set(l.cliente_id, l.created_at);
        }
        // own chats: phone → last_message_timestamp
        const myChatByPhone = new Map<string, string>();
        for (const ch of (myChatRes.data || [])) {
          const key = (ch.contact_phone || '').replace(/\D/g, '').slice(-10);
          const existing = myChatByPhone.get(key);
          if (!existing || ch.last_message_timestamp > existing) {
            myChatByPhone.set(key, ch.last_message_timestamp);
          }
        }
        // build per-client map
        const meuMap = new Map<string, { timestamp: string; fonte: 'WhatsApp' | 'ligação' }>();
        clientes.forEach(c => {
          const ligTs = myLigMap.get(c.id);
          const chatTs = myChatByPhone.get((c.telefone || '').replace(/\D/g, '').slice(-10));
          if (!ligTs && !chatTs) return;
          if (!ligTs) { meuMap.set(c.id, { timestamp: chatTs!, fonte: 'WhatsApp' }); return; }
          if (!chatTs) { meuMap.set(c.id, { timestamp: ligTs, fonte: 'ligação' }); return; }
          if (chatTs >= ligTs) {
            meuMap.set(c.id, { timestamp: chatTs, fonte: 'WhatsApp' });
          } else {
            meuMap.set(c.id, { timestamp: ligTs, fonte: 'ligação' });
          }
        });
        setAgendMeuContato(meuMap);
      });
    }
  }, [view, clientes]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        fetchClientes(true),
        loadAgendamentos(),
        fetchLeads()
      ]);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleAddAgendamento = (agendamento: Agendamento) => {
    setAgendamentos(prev => [...prev, agendamento]);
  };

  const handleRemoveAgendamento = (agendamentoId: string) => {
    setAgendamentos(prev => prev.filter(a => a.id !== agendamentoId));
  };

  const handleUpdateAgendamento = (agendamentoId: string, updates: Partial<Agendamento>) => {
    setAgendamentos(prev => prev.map(a => a.id === agendamentoId ? { ...a, ...updates } : a));
  };

  const getStatusLabel = (status: string, useKanbanNames = false): string => {
    if (useKanbanNames && kanbanColumns.length > 0) {
      return getDisplayName(status);
    }

    const labels: Record<string, string> = {
      comprou: 'Aguardando Conta',
      'conta-criada': 'Conta Criada',
      depositou: 'Depositou',
      acompanhamento: 'Primeiro Saque',
      problema: 'Realizando Saque',
      finalizado: 'Finalizado'
    };
    return labels[status] || status;
  };

  const getStatusColor = (status: string): string => {
    const colors: Record<string, string> = {
      comprou: 'bg-slate-100 text-slate-700',
      'conta-criada': 'bg-blue-100 text-blue-700',
      depositou: 'bg-emerald-100 text-emerald-700',
      acompanhamento: 'bg-cyan-100 text-cyan-700',
      problema: 'bg-red-100 text-red-700',
      finalizado: 'bg-slate-800 text-white'
    };
    return colors[status] || 'bg-slate-100';
  };

  const formatarData = (dataString: string): string => {
    const [ano, mes, dia] = dataString.split('-');
    return `${dia.padStart(2, '0')}/${mes.padStart(2, '0')}/${ano}`;
  };

  const calcularMetricas = () => {
    const totalClientes = clientesFiltrados.length;
    const depositaram = clientesFiltrados.filter(c =>
      ['depositou', 'acompanhamento'].includes(c.status)
    ).length;
    const valorTotal = clientesFiltrados.reduce(
      (sum, c) => sum + (c.valor_deposito || 0),
      0
    );
    const comProblema = clientesFiltrados.filter(c => c.status === 'problema').length;

    return {
      totalClientes,
      depositaram,
      valorTotal,
      comProblema,
      taxaConversao: totalClientes > 0 ? ((depositaram / totalClientes) * 100).toFixed(1) : 0
    };
  };

  const limparFiltros = () => {
    setDatePreset('todos');
    const clearedFilters = {
      dataInicio: '',
      dataFim: '',
      assessor: 'todas',
      status: 'todos',
      categoriaInvestimento: 'todas'
    };
    setFiltros(clearedFilters);
    saveFilters('todos', clearedFilters);
  };

  const exportarDados = () => {
    const dadosExport = clientesFiltrados.map(c => ({
      Nome: capitalizeName(c.nome),
      Email: c.email,
      Telefone: c.telefone,
      'Data Compra': c.data_compra,
      Status: getStatusLabel(c.status, true),
      Assessor: c.assessor || 'N/A',
      'Fundos': c.valor_deposito || 0,
      'Performance (%)': c.performance !== undefined ? c.performance : 'N/A'
    }));

    const headers = Object.keys(dadosExport[0]);
    const csv = [
      headers.join(','),
      ...dadosExport.map(row =>
        headers.map(header => {
          const value = row[header as keyof typeof row];
          return typeof value === 'string' && value.includes(',')
            ? `"${value}"`
            : value;
        }).join(',')
      )
    ].join('\n');

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `crm-clientes-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleUpdateCliente = async (id: string, updates: Partial<Cliente>) => {
    const result = await updateCliente(id, updates);
    if (result.success && selectedCliente && selectedCliente.id === id) {
      setSelectedCliente(prev => prev ? { ...prev, ...updates } : prev);
    }
  };

  useEffect(() => {
    if (selectedCliente) {
      const updated = clientes.find(c => c.id === selectedCliente.id);
      if (updated) {
        setSelectedCliente(updated);
      }
    }
  }, [clientes]);

  const toggleClienteSelection = (clienteId: string) => {
    setSelectedClienteIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(clienteId)) {
        newSet.delete(clienteId);
      } else {
        newSet.add(clienteId);
      }
      return newSet;
    });
  };

  const toggleAllClientesSelection = () => {
    const visibleClienteIds = clientesPaginados.map(c => c.id);
    const allSelected = visibleClienteIds.every(id => selectedClienteIds.has(id));

    setSelectedClienteIds(prev => {
      const newSet = new Set(prev);
      if (allSelected) {
        visibleClienteIds.forEach(id => newSet.delete(id));
      } else {
        visibleClienteIds.forEach(id => newSet.add(id));
      }
      return newSet;
    });
  };

  const handleBulkUpdate = async (updates: Partial<Cliente>) => {
    const selectedClientes = Array.from(selectedClienteIds);
    let successCount = 0;

    for (const clienteId of selectedClientes) {
      try {
        await handleUpdateCliente(clienteId, updates);
        successCount++;
      } catch (error) {
        console.error(`Erro ao atualizar cliente ${clienteId}:`, error);
      }
    }

    await fetchClientes(true);
    setSelectedClienteIds(new Set());
    alert(`${successCount} de ${selectedClientes.length} cliente(s) atualizado(s) com sucesso!`);
  };

  const handleBulkSendPostback = async () => {
    const selectedClientes = clientes.filter(c =>
      selectedClienteIds.has(c.id) && c.lead?.click_id && !c.postback_enviado
    );

    let successCount = 0;
    const total = selectedClientes.length;

    for (const cliente of selectedClientes) {
      try {
        const clickId = cliente.lead!.click_id!;
        const payout = cliente.valor_produto || '';
        const postbackUrl = `https://lp.stratefinance.com.br/postback?ce=Comprapayt&clickId=${encodeURIComponent(clickId)}${payout ? `&payout=${encodeURIComponent(payout)}` : ''}`;

        await fetch(postbackUrl, {
          method: 'GET',
          mode: 'no-cors'
        });

        await handleUpdateCliente(cliente.id, {
          postback_enviado: true,
          postback_enviado_em: new Date().toISOString()
        });

        successCount++;
      } catch (error) {
        console.error(`Erro ao enviar postback para cliente ${cliente.id}:`, error);
      }
    }

    await fetchClientes(true);
    return { successCount, total };
  };

  const handleBulkSendGclid = async () => {
    const selectedClientes = clientes.filter(c =>
      selectedClienteIds.has(c.id) && (c.valor_produto ?? 0) > 0 && !c.gclid_enviado
    );

    let successCount = 0;
    const total = selectedClientes.length;

    for (const cliente of selectedClientes) {
      try {
        const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-gclid-conversion`;

        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ clienteId: cliente.id })
        });

        if (!response.ok) {
          throw new Error('Erro ao enviar conversão GCLID');
        }

        await handleUpdateCliente(cliente.id, {
          gclid_enviado: true,
          gclid_enviado_em: new Date().toISOString()
        });

        successCount++;
      } catch (error) {
        console.error(`Erro ao enviar GCLID para cliente ${cliente.id}:`, error);
      }
    }

    await fetchClientes(true);
    return { successCount, total };
  };

  const handleStatusChange = async (id: string, status: string) => {
    await handleUpdateCliente(id, { status: status as any });

    if (status === 'depositou') {
      const cliente = clientes.find(c => c.id === id);
      try {
        const { data, error } = await supabase.functions.invoke('assign-lead', {
          body: { cliente_id: id },
        });

          if (!error && data?.assessor_nome) {
            // Notificação no sininho
            const { data: notif } = await supabase
              .from('notifications')
              .insert({
                created_by: profile?.id,
                title: 'Novo lead atribuído',
                message: JSON.stringify({
                  type: 'lead_assigned',
                  nome: cliente?.nome,
                  telefone: cliente?.telefone || null,
                  cliente_id: id,
                }),
              })
              .select('id')
              .single();

            if (notif?.id && data.user_id) {
              await supabase.from('notification_recipients').insert({
                notification_id: notif.id,
                user_id: data.user_id,
              });
            }

            // Mensagem no chat interno
            if (profile?.id && data.user_id && profile.id !== data.user_id) {
              await supabase.from('internal_messages').insert({
                sender_id: profile.id,
                recipient_id: data.user_id,
                message: JSON.stringify({
                  type: 'lead_assigned',
                  nome: cliente?.nome,
                  telefone: cliente?.telefone || null,
                  cliente_id: id,
                }),
              });
            }

            // Inserir na tabela de junção cliente_assessores
            await supabase
              .from('cliente_assessores')
              .delete()
              .eq('cliente_id', id);
            await supabase
              .from('cliente_assessores')
              .insert({ cliente_id: id, assessor_id: data.assessor_id });

            // Atualização otimista do modal aberto
            if (selectedCliente && selectedCliente.id === id) {
              setSelectedCliente(prev => prev ? { ...prev, assessor: data.assessor_nome } : prev);
            }
          }
      } catch (err) {
        console.error('[LeadDistribution] Erro ao distribuir lead:', err);
      }
    }

    await fetchClientes(true);
  };

  const handleStartEditColumn = (columnId: string, currentName: string) => {
    setEditingColumnId(columnId);
    setEditingColumnName(currentName);
  };

  const handleSaveColumnName = async (columnId: string) => {
    if (!editingColumnName.trim()) {
      setEditingColumnId(null);
      return;
    }

    const result = await updateColumnName(columnId, editingColumnName.trim());
    if (result.success) {
      setEditingColumnId(null);
      setEditingColumnName('');
    }
  };

  const handleCancelEditColumn = () => {
    setEditingColumnId(null);
    setEditingColumnName('');
  };

  useEffect(() => {
    if (!profile?.id) return;
    supabase
      .from('assessores')
      .select('nome')
      .eq('user_id', profile.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setMeuNomeAssessor(data.nome);
      });
  }, [profile?.id]);

  const handleFiltrarMeusClientes = () => {
    if (!meuNomeAssessor) return;
    if (filtros.assessor === meuNomeAssessor) {
      handleFilterChange('assessor', 'todas');
    } else {
      handleFilterChange('assessor', meuNomeAssessor);
    }
  };

  const toggleColumnVisibility = (statusKey: string) => {
    setHiddenColumns(prev => {
      const newSet = new Set(prev);
      if (newSet.has(statusKey)) {
        newSet.delete(statusKey);
      } else {
        newSet.add(statusKey);
      }
      localStorage.setItem('crm_hidden_kanban_columns', JSON.stringify([...newSet]));
      return newSet;
    });
  };

  const handleDragStart = (clienteId: string) => {
    setDraggedClienteId(clienteId);
  };

  const handleDragEnd = () => {
    setDraggedClienteId(null);
    setDragOverColumn(null);
  };

  const handleDragOver = (e: React.DragEvent, columnStatusKey: string) => {
    e.preventDefault();
    setDragOverColumn(columnStatusKey);
  };

  const handleDragLeave = () => {
    setDragOverColumn(null);
  };

  const handleDrop = async (e: React.DragEvent, newStatus: string) => {
    e.preventDefault();

    if (!draggedClienteId) return;

    const cliente = clientes.find(c => c.id === draggedClienteId);
    if (!cliente) return;

    if (cliente.status !== newStatus) {
      await handleStatusChange(draggedClienteId, newStatus);
    }

    setDraggedClienteId(null);
    setDragOverColumn(null);
  };

  const baixarTemplateCSV = () => {
    const headers = [
      'nome',
      'email',
      'telefone',
      'data_compra',
      'valor_produto',
      'status',
      'assessor',
      'valor_deposito',
      'performance',
      'pais',
      'pais_iso',
      'moeda',
      'valor_pago_moeda_original'
    ];

    const exemploLinha = [
      'João Silva',
      'joao@email.com',
      '+5511999999999',
      '2024-01-15',
      '997',
      'comprou',
      'XP Investimentos',
      '5000',
      '15.5',
      'Brasil',
      'BR',
      'BRL',
      '997'
    ];

    const csv = [
      headers.join(','),
      exemploLinha.join(','),
      '',
      '# INSTRUÇÕES:',
      '# - status pode ser: comprou, conta-criada, depositou, acompanhamento, problema, finalizado',
      '# - data_compra formato: AAAA-MM-DD (ex: 2024-01-15)',
      '# - valores numéricos use ponto como decimal (ex: 15.5)',
      '# - campos obrigatórios: nome, email, telefone, data_compra, valor_produto, status',
      '# - remova estas linhas de instrução antes do upload'
    ].join('\n');

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'template-conversoes.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const processarCSV = (texto: string): any[] => {
    const linhas = texto.split('\n').filter(linha => {
      const trimmed = linha.trim();
      return trimmed && !trimmed.startsWith('#');
    });

    if (linhas.length < 2) {
      throw new Error('Arquivo CSV vazio ou inválido');
    }

    const headers = linhas[0].split(',').map(h => h.trim());
    const dados = [];

    for (let i = 1; i < linhas.length; i++) {
      const valores = linhas[i].split(',').map(v => v.trim());

      if (valores.length !== headers.length) {
        continue;
      }

      const obj: any = {};
      headers.forEach((header, index) => {
        obj[header] = valores[index];
      });

      dados.push(obj);
    }

    return dados;
  };

  const validarCliente = (cliente: any): { valido: boolean; erros: string[] } => {
    const erros: string[] = [];

    if (!cliente.nome || cliente.nome.trim() === '') {
      erros.push('Nome é obrigatório');
    }

    if (!cliente.email || cliente.email.trim() === '') {
      erros.push('Email é obrigatório');
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cliente.email)) {
      erros.push('Email inválido');
    }

    if (!cliente.telefone || cliente.telefone.trim() === '') {
      erros.push('Telefone é obrigatório');
    }

    if (!cliente.data_compra || cliente.data_compra.trim() === '') {
      erros.push('Data de compra é obrigatória');
    }

    if (!cliente.valor_produto || isNaN(parseFloat(cliente.valor_produto))) {
      erros.push('Valor do produto é obrigatório e deve ser numérico');
    }

    if (!cliente.status || cliente.status.trim() === '') {
      erros.push('Status é obrigatório');
    } else if (!['comprou', 'conta-criada', 'depositou', 'acompanhamento', 'problema', 'finalizado'].includes(cliente.status)) {
      erros.push('Status deve ser: comprou, conta-criada, depositou, acompanhamento, problema ou finalizado');
    }

    return {
      valido: erros.length === 0,
      erros
    };
  };

  const handleUploadCSV = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadStatus({ message: 'Processando arquivo...', type: 'info' });

    try {
      const texto = await file.text();
      const dados = processarCSV(texto);

      if (dados.length === 0) {
        throw new Error('Nenhum dado válido encontrado no arquivo');
      }

      let sucessos = 0;
      let erros = 0;
      const errosDetalhados: string[] = [];

      for (let i = 0; i < dados.length; i++) {
        const cliente = dados[i];
        const validacao = validarCliente(cliente);

        if (!validacao.valido) {
          erros++;
          errosDetalhados.push(`Linha ${i + 2}: ${validacao.erros.join(', ')}`);
          continue;
        }

        const clienteData = {
          nome: cliente.nome,
          email: cliente.email,
          telefone: cliente.telefone,
          data_compra: cliente.data_compra,
          valor_produto: parseFloat(cliente.valor_produto),
          status: cliente.status as any,
          assessor: cliente.assessor || undefined,
          valor_deposito: cliente.valor_deposito ? parseFloat(cliente.valor_deposito) : undefined,
          performance: cliente.performance ? parseFloat(cliente.performance) : undefined,
          pais: cliente.pais || undefined,
          pais_iso: cliente.pais_iso || undefined,
          moeda: cliente.moeda || undefined,
          valor_pago_moeda_original: cliente.valor_pago_moeda_original ? parseFloat(cliente.valor_pago_moeda_original) : undefined,
          oculto: false,
          postback_enviado: false,
          gclid_enviado: false
        };

        const result = await createCliente(clienteData);

        if (result.success) {
          sucessos++;
        } else {
          erros++;
          errosDetalhados.push(`Linha ${i + 2}: ${result.error || 'Erro ao criar cliente'}`);
        }
      }

      await fetchClientes(true);

      if (erros === 0) {
        setUploadStatus({
          message: `✓ Upload concluído com sucesso! ${sucessos} conversões importadas.`,
          type: 'success'
        });
      } else {
        const mensagem = `Upload parcialmente concluído. ${sucessos} sucessos, ${erros} erros.${errosDetalhados.length > 0 ? '\n\nErros:\n' + errosDetalhados.slice(0, 5).join('\n') : ''}${errosDetalhados.length > 5 ? `\n... e mais ${errosDetalhados.length - 5} erros` : ''}`;
        setUploadStatus({
          message: mensagem,
          type: erros > sucessos ? 'error' : 'success'
        });
      }
    } catch (error) {
      console.error('Erro ao processar CSV:', error);
      setUploadStatus({
        message: `✗ Erro ao processar arquivo: ${error instanceof Error ? error.message : 'Erro desconhecido'}`,
        type: 'error'
      });
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  const handleManualImport = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingManual(true);
    setUploadStatus(null);

    try {
      const validacao = validarCliente({
        ...manualImportForm,
        valor_produto: manualImportForm.valor_produto
      });

      if (!validacao.valido) {
        setUploadStatus({
          message: `✗ Erro na validação: ${validacao.erros.join(', ')}`,
          type: 'error'
        });
        return;
      }

      const clienteData = {
        nome: manualImportForm.nome.trim(),
        email: manualImportForm.email.trim(),
        telefone: manualImportForm.telefone.trim(),
        data_compra: manualImportForm.data_compra,
        valor_produto: parseFloat(manualImportForm.valor_produto),
        status: manualImportForm.status as any,
        oculto: false,
        postback_enviado: false,
        gclid_enviado: false
      };

      const result = await createCliente(clienteData);

      if (result.success) {
        setUploadStatus({
          message: '✓ Cliente importado com sucesso!',
          type: 'success'
        });
        setManualImportForm({
          nome: '',
          email: '',
          telefone: '',
          data_compra: '',
          valor_produto: '',
          status: 'comprou'
        });
      } else {
        throw new Error(result.error || 'Erro ao criar cliente');
      }
    } catch (error) {
      console.error('Erro ao importar cliente:', error);
      setUploadStatus({
        message: `✗ Erro ao importar: ${error instanceof Error ? error.message : 'Erro desconhecido'}`,
        type: 'error'
      });
    } finally {
      setSubmittingManual(false);
    }
  };

  const listaAssessores = ['todas', ...assessoresDisponiveis.map(a => a.nome)];
  const metricas = calcularMetricas();
  const filtrosAtivos =
    filtros.dataInicio || filtros.dataFim || filtros.assessor !== 'todas' || filtros.status !== 'todos' || filtros.categoriaInvestimento !== 'todas';

  /** Quantos filtros estão ativos — vira o contador do botão no mobile. */
  const filtrosAtivosCount = [
    !!(filtros.dataInicio || filtros.dataFim),
    filtros.assessor !== 'todas',
    filtros.status !== 'todos',
    filtros.categoriaInvestimento !== 'todas',
  ].filter(Boolean).length;

  const dadosGrafico = [
    { nome: 'Compraram', valor: clientesFiltrados.length },
    {
      nome: 'Conta Criada',
      valor: clientesFiltrados.filter(c => c.valor_deposito && c.valor_deposito > 0).length
    },
    {
      nome: 'Depositaram',
      valor: clientesFiltrados.filter(c => c.valor_deposito && c.valor_deposito > 0).length
    }
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Carregando dados...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-50 flex h-[100dvh] overflow-hidden">
      {/* Fundo escurecido da gaveta (apenas < lg) */}
      {!isDesktop && drawerOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40"
          onClick={() => setDrawerOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ─── Sidebar (>= lg) / Gaveta (< lg) ─── */}
      <aside
        style={
          isDesktop
            ? {
                width: sidebarCollapsed ? 52 : 220,
                minWidth: sidebarCollapsed ? 52 : 220,
                transition: 'width 0.2s ease, min-width 0.2s ease',
              }
            : undefined
        }
        className={
          isDesktop
            ? 'bg-white border-r border-slate-200 flex flex-col z-40 flex-shrink-0'
            : `bg-white border-r border-slate-200 flex flex-col fixed inset-y-0 left-0 w-[260px] max-w-[85vw] z-50 transition-transform duration-200 ${
                drawerOpen ? 'translate-x-0' : '-translate-x-full'
              }`
        }
      >
        <div className="h-[52px] flex items-center justify-between border-b border-slate-200 px-3 overflow-hidden flex-shrink-0">
          {(!isDesktop || !sidebarCollapsed) && (
            <img
              src="http://stratefinance.com.br/wp-content/uploads/2025/09/cropped-10131057334828919434-1.png"
              alt="Strate Finance"
              className="h-7 w-auto object-contain"
            />
          )}
          {isDesktop ? (
            <button
              onClick={() => setSidebarCollapsed(c => !c)}
              className={`p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors flex-shrink-0 ${sidebarCollapsed ? 'mx-auto' : ''}`}
            >
              {sidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
            </button>
          ) : (
            <button
              onClick={() => setDrawerOpen(false)}
              aria-label="Fechar menu"
              className="p-2 -mr-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors flex-shrink-0"
            >
              <X size={18} />
            </button>
          )}
        </div>
        <nav className="flex-1 overflow-y-auto overflow-x-hidden py-2">
          {navVisible('dashboard') && (
            <NavItem icon={<TrendingUp size={18} />} label="Dashboard" active={view === 'dashboard'} collapsed={navCollapsed} onClick={() => navigate('dashboard')} />
          )}
          {(navVisible('leads') || navVisible('kanban') || navVisible('formularios')) && (
            <NavGroup label="Clientes" collapsed={navCollapsed}>
              {navVisible('leads') && (
                <NavItem icon={<List size={18} />} label="Lista" active={view === 'leads'} collapsed={navCollapsed} onClick={() => navigate('leads')} />
              )}
              {navVisible('kanban') && (
                <NavItem icon={<LayoutGrid size={18} />} label="Kanban" active={view === 'kanban'} collapsed={navCollapsed} onClick={() => navigate('kanban')} />
              )}
              {navVisible('formularios') && (
                <NavItem icon={<ClipboardList size={18} />} label="Formulários" active={view === 'formularios'} collapsed={navCollapsed} onClick={() => navigate('formularios')} />
              )}
            </NavGroup>
          )}
          {(navVisible('agendamentos') || navVisible('atendimentos') || navVisible('cliente-oculto')) && (
            <NavGroup label="Operacional" collapsed={navCollapsed}>
              {navVisible('agendamentos') && (
                <NavItem icon={<Calendar size={18} />} label="Agendamentos" active={view === 'agendamentos'} collapsed={navCollapsed} onClick={() => navigate('agendamentos')} />
              )}
              {navVisible('atendimentos') && (
                <NavItem icon={<Users size={18} />} label="Atendimentos" active={view === 'atendimentos'} collapsed={navCollapsed} onClick={() => navigate('atendimentos')} />
              )}
              {navVisible('cliente-oculto') && (
                <NavItem icon={<Eye size={18} />} label="Cliente Oculto" active={view === 'cliente-oculto'} collapsed={navCollapsed} onClick={() => navigate('cliente-oculto')} />
              )}
            </NavGroup>
          )}
          {(navVisible('campanhas') || navVisible('whatsapp') || navVisible('waba')) && (
            <NavGroup label="Marketing" collapsed={navCollapsed}>
              {navVisible('campanhas') && (
                <NavItem icon={<TrendingUp size={18} />} label="Campanhas" active={view === 'campanhas'} collapsed={navCollapsed} onClick={() => navigate('campanhas')} />
              )}
              {navVisible('whatsapp') && (
                <NavItem
                  icon={<MessageCircle size={18} />}
                  label="WhatsApp"
                  active={view === 'whatsapp'}
                  collapsed={navCollapsed}
                  onClick={() => navigate('whatsapp')}
                  badge={whatsappUnread > 0 && view !== 'whatsapp' ? (whatsappUnread > 99 ? '99+' : String(whatsappUnread)) : undefined}
                />
              )}
              {navVisible('waba') && (
                <NavItem
                  icon={<BadgeCheck size={18} />}
                  label="WABA"
                  active={view === 'waba'}
                  collapsed={navCollapsed}
                  onClick={() => navigate('waba')}
                  badge={wabaUnread > 0 && view !== 'waba' ? (wabaUnread > 99 ? '99+' : String(wabaUnread)) : undefined}
                />
              )}
            </NavGroup>
          )}
          {navVisible('financeiro') && (
            <NavGroup label="Financeiro" collapsed={navCollapsed}>
              <NavItem icon={<DollarSign size={18} />} label="Financeiro" active={view === 'financeiro'} collapsed={navCollapsed} onClick={() => navigate('financeiro')} />
            </NavGroup>
          )}
          {(navVisible('configuracoes') || navVisible('senhas') || navVisible('lead-audit')) && (
            <NavGroup label="Sistema" collapsed={navCollapsed}>
              {navVisible('configuracoes') && (
                <NavItem icon={<Settings size={18} />} label="Config" active={view === 'configuracoes'} collapsed={navCollapsed} onClick={() => navigate('configuracoes')} />
              )}
              {navVisible('senhas') && (
                <NavItem icon={<Lock size={18} />} label="Senhas" active={view === 'senhas'} collapsed={navCollapsed} onClick={() => navigate('senhas')} />
              )}
              {navVisible('lead-audit') && (
                <NavItem icon={<Search size={18} />} label="Auditoria Leads" active={view === 'lead-audit'} collapsed={navCollapsed} onClick={() => navigate('lead-audit')} />
              )}
            </NavGroup>
          )}
        </nav>

        {/* Rodapé da gaveta — saída para quem precisa de algo que ainda não é responsivo */}
        {!isDesktop && (
          <div className="border-t border-slate-200 p-3 flex-shrink-0">
            {mobileRestricted ? (
              <button
                onClick={enableFullVersion}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <Monitor size={16} />
                Ver versão completa
              </button>
            ) : (
              <button
                onClick={disableFullVersion}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <Smartphone size={16} />
                Voltar ao modo celular
              </button>
            )}
            <button
              onClick={signOut}
              className="mt-1 w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
            >
              <LogOut size={16} />
              Sair
            </button>
          </div>
        )}
      </aside>

      {/* ─── Main ─── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Compact 52px header */}
        {isDesktop ? (
          <div className="h-[52px] bg-white border-b border-slate-200 flex items-center justify-between px-6 flex-shrink-0">
            <p className="text-sm text-slate-700">
              <span className="font-semibold">{profile?.email}</span>
              {profile?.is_master && (
                <span className="ml-2 px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-semibold rounded">Master</span>
              )}
            </p>
            <div className="flex items-center gap-2">
              <NotificationBell onOpenWhatsApp={handleOpenWhatsApp} />
              <button
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1.5 text-sm transition-colors disabled:bg-blue-400 disabled:cursor-not-allowed"
              >
                <RefreshCw size={15} className={isRefreshing ? 'animate-spin' : ''} />
                {isRefreshing ? 'Atualizando...' : 'Atualizar'}
              </button>
              <button
                onClick={exportarDados}
                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5 text-sm transition-colors"
              >
                <Download size={15} />
                Exportar
              </button>
              <button
                onClick={signOut}
                className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white flex items-center gap-1.5 text-sm transition-colors"
              >
                <LogOut size={15} />
                Sair
              </button>
            </div>
          </div>
        ) : (
          <div className="h-[52px] bg-white border-b border-slate-200 flex items-center justify-between px-2 flex-shrink-0">
            <button
              onClick={() => setDrawerOpen(true)}
              aria-label="Abrir menu"
              className="p-2.5 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors"
            >
              <Menu size={22} />
            </button>
            <img
              src="http://stratefinance.com.br/wp-content/uploads/2025/09/cropped-10131057334828919434-1.png"
              alt="Strate Finance"
              className="h-7 w-auto object-contain"
            />
            <NotificationBell onOpenWhatsApp={handleOpenWhatsApp} />
          </div>
        )}

        {/* Filter bar — leads / kanban / formularios */}
        {(view === 'leads' || view === 'kanban' || view === 'formularios') && (
          <div className="bg-white border-b border-slate-200 px-4 md:px-6 py-3 flex-shrink-0">
            <div className="flex items-center gap-2 md:gap-4">
              <div className="flex-1 max-w-md">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={20} />
                  {view === 'formularios' ? (
                    <>
                      <input
                        type="text"
                        placeholder="Buscar por nome, telefone, Click ID ou Gclid..."
                        value={formularioSearchQuery}
                        onChange={e => { setFormularioSearchQuery(e.target.value); setCurrentPageFormularios(1); }}
                        className="w-full pl-10 pr-10 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                      />
                      {formularioSearchQuery && (
                        <button
                          onClick={() => setFormularioSearchQuery('')}
                          className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        >
                          <X size={18} />
                        </button>
                      )}
                    </>
                  ) : (
                    <>
                      <input
                        type="text"
                        placeholder="Buscar por nome, email, telefone, Click ID ou Gclid..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-10 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                      />
                      {searchQuery && (
                        <button
                          onClick={() => setSearchQuery('')}
                          className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        >
                          <X size={18} />
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
              {/* Ordenação: controle próprio no mobile, ao lado de Filtros.
                  No desktop a ordenação continua sendo pelas colunas. */}
              {view === 'leads' && !isMdUp && (
                <LeadSortMenu sortConfig={sortConfig} onChange={setSortConfig} />
              )}
              {view !== 'formularios' && (
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`px-4 py-2 min-h-[44px] md:min-h-0 rounded-lg flex items-center gap-2 transition-all flex-shrink-0 ${
                  showFilters || filtrosAtivos
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <Filter size={18} />
                {/* Em 380px o rótulo cede espaço; o critério de ordenação, não. */}
                <span className="hidden md:inline">Filtros</span>
                {filtrosAtivos && (
                  <span className="bg-white text-blue-600 px-2 py-0.5 rounded-full text-xs font-semibold">
                    {isMdUp ? '✓' : filtrosAtivosCount}
                  </span>
                )}
              </button>
              )}
            </div>

            {/* No mobile os filtros viram folha inferior — a barra horizontal não cabe. */}
            {showFilters && !isMdUp && (
              <div
                className="fixed inset-0 bg-black/40 z-40"
                onClick={() => setShowFilters(false)}
                aria-hidden="true"
              />
            )}
            {showFilters && (
              <div
                className={
                  isMdUp
                    ? 'mt-4 p-4 bg-slate-50 rounded-lg border border-slate-200'
                    : 'fixed inset-x-0 bottom-0 z-50 p-4 bg-white border-t border-slate-200 rounded-t-2xl shadow-2xl max-h-[85dvh] overflow-y-auto'
                }
                style={isMdUp ? undefined : { paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-slate-900">Filtros Avançados</h3>
                  {filtrosAtivos && (
                    <button
                      onClick={limparFiltros}
                      className="text-sm text-blue-600 hover:text-blue-800 underline"
                    >
                      Limpar Filtros
                    </button>
                  )}
                </div>

                <div className="mb-4">
                  <label className="block text-sm font-medium text-slate-700 mb-2">Período</label>
                  <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
                    <button
                      onClick={() => handleDatePresetChange('todos')}
                      className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                        datePreset === 'todos'
                          ? 'bg-blue-600 text-white shadow-md'
                          : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      Todos
                    </button>
                    <button
                      onClick={() => handleDatePresetChange('7dias')}
                      className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                        datePreset === '7dias'
                          ? 'bg-blue-600 text-white shadow-md'
                          : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      7 dias
                    </button>
                    <button
                      onClick={() => handleDatePresetChange('15dias')}
                      className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                        datePreset === '15dias'
                          ? 'bg-blue-600 text-white shadow-md'
                          : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      15 dias
                    </button>
                    <button
                      onClick={() => handleDatePresetChange('30dias')}
                      className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                        datePreset === '30dias'
                          ? 'bg-blue-600 text-white shadow-md'
                          : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      30 dias
                    </button>
                    <button
                      onClick={() => handleDatePresetChange('este-mes')}
                      className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                        datePreset === 'este-mes'
                          ? 'bg-blue-600 text-white shadow-md'
                          : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      Este mês
                    </button>
                    <button
                      onClick={() => handleDatePresetChange('mes-passado')}
                      className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                        datePreset === 'mes-passado'
                          ? 'bg-blue-600 text-white shadow-md'
                          : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      Mês passado
                    </button>
                    <button
                      onClick={() => handleDatePresetChange('custom')}
                      className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                        datePreset === 'custom'
                          ? 'bg-blue-600 text-white shadow-md'
                          : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      Customizado
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                  <div>
                    <DatePicker
                      label="Data Inicio"
                      value={filtros.dataInicio}
                      onChange={value => handleCustomDateChange('dataInicio', value)}
                      maxDate={filtros.dataFim || undefined}
                    />
                  </div>
                  <div>
                    <DatePicker
                      label="Data Fim"
                      value={filtros.dataFim}
                      onChange={value => handleCustomDateChange('dataFim', value)}
                      minDate={filtros.dataInicio || undefined}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Assessor</label>
                    <select
                      value={filtros.assessor}
                      onChange={e => handleFilterChange('assessor', e.target.value)}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      {listaAssessores.map(assess => (
                        <option key={assess} value={assess}>
                          {assess === 'todas' ? 'Todas' : assess}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
                    <select
                      value={filtros.status}
                      onChange={e => handleFilterChange('status', e.target.value)}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="todos">Todos</option>
                      {kanbanColumns.map(column => (
                        <option key={column.status_key} value={column.status_key}>
                          {column.display_name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Categoria</label>
                    <select
                      value={filtros.categoriaInvestimento}
                      onChange={e => handleFilterChange('categoriaInvestimento', e.target.value)}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="todas">Todas</option>
                      {INVESTMENT_CATEGORIES.map(cat => (
                        <option key={cat.value} value={cat.value}>
                          {cat.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-slate-200">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={mostrarOcultos}
                      onChange={(e) => setMostrarOcultos(e.target.checked)}
                      className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                    />
                    <span className="text-sm font-medium text-slate-700">
                      Mostrar apenas leads ocultados
                    </span>
                  </label>
                  {mostrarOcultos && (
                    <p className="text-xs text-slate-500 mt-1 ml-6">
                      Exibindo apenas os leads que foram ocultados
                    </p>
                  )}
                </div>

                {datePreset !== 'todos' && (
                  <div className="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <p className="text-sm text-blue-800">
                      <strong>Filtro ativo:</strong> {datePreset === '7dias' ? 'Últimos 7 dias' : datePreset === '15dias' ? 'Últimos 15 dias' : datePreset === '30dias' ? 'Últimos 30 dias' : datePreset === 'este-mes' ? 'Este mês' : datePreset === 'mes-passado' ? 'Mês passado' : 'Período customizado'}
                      {filtros.dataInicio && filtros.dataFim && (
                        <> ({formatarData(filtros.dataInicio)} até {formatarData(filtros.dataFim)})</>
                      )}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
      {isRefreshing ? (
        <div className="min-h-[calc(100vh-180px)] bg-white flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-slate-600 text-lg">Atualizando dados...</p>
          </div>
        </div>
      ) : (
        <>
          {view === 'leads' && canAccess('leads') && (
        <div className="max-w-[1600px] mx-auto px-0 md:px-6 py-4 md:py-6">
          {selectedClienteIds.size > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4 mx-4 md:mx-0 flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
              <div className="flex items-center gap-3">
                <CheckSquare className="text-blue-600" size={20} />
                <span className="font-semibold text-blue-800">
                  {selectedClienteIds.size} cliente(s) selecionado(s)
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowBulkEditModal(true)}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
                >
                  <Edit2 size={16} />
                  Editar em Massa
                </button>
                <button
                  onClick={() => setSelectedClienteIds(new Set())}
                  className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300 transition-colors"
                >
                  Limpar Seleção
                </button>
              </div>
            </div>
          )}
          <div className="bg-white md:rounded-lg shadow-sm border-y md:border border-slate-200 overflow-hidden">
            {!isMdUp ? (
              <LeadCardList
                clientes={clientesPaginados}
                isMaster={!!profile?.is_master}
                selectedIds={selectedClienteIds}
                onToggleSelection={toggleClienteSelection}
                onSelectCliente={c => { setSelectedCliente(c); setShowModal(true); }}
                onOpenWhatsApp={handleOpenWhatsApp}
                onOpenWabaChat={handleOpenWabaChat}
                getStatusColor={getStatusColor}
                getStatusLabel={getStatusLabel}
                formatarData={formatarData}
              />
            ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-4 text-center w-12">
                      <button
                        onClick={toggleAllClientesSelection}
                        className="hover:bg-slate-200 p-1 rounded transition-colors"
                      >
                        {clientesPaginados.every(c => selectedClienteIds.has(c.id)) ? (
                          <CheckSquare size={18} className="text-blue-600" />
                        ) : (
                          <Square size={18} className="text-slate-400" />
                        )}
                      </button>
                    </th>
                    <th
                      className="text-left px-6 py-4 text-sm font-semibold text-slate-700 cursor-pointer hover:bg-slate-100 transition-colors"
                      onClick={() => handleSort('nome')}
                    >
                      <div className="flex items-center gap-2">
                        Nome
                        {getSortIcon('nome')}
                      </div>
                    </th>
                    <th
                      className="text-left px-6 py-4 text-sm font-semibold text-slate-700 cursor-pointer hover:bg-slate-100 transition-colors"
                      onClick={() => handleSort('email')}
                    >
                      <div className="flex items-center gap-2">
                        Contato
                        {getSortIcon('email')}
                      </div>
                    </th>
                    <th
                      className="text-left px-6 py-4 text-sm font-semibold text-slate-700 cursor-pointer hover:bg-slate-100 transition-colors"
                      onClick={() => handleSort('status')}
                    >
                      <div className="flex items-center gap-2">
                        Status
                        {getSortIcon('status')}
                      </div>
                    </th>
                    <th
                      className="text-left px-6 py-4 text-sm font-semibold text-slate-700 cursor-pointer hover:bg-slate-100 transition-colors"
                      onClick={() => handleSort('assessor')}
                    >
                      <div className="flex items-center gap-2">
                        Assessor
                        {getSortIcon('assessor')}
                      </div>
                    </th>
                    <th
                      className="text-left px-6 py-4 text-sm font-semibold text-slate-700 cursor-pointer hover:bg-slate-100 transition-colors"
                      onClick={() => handleSort('valor_deposito')}
                    >
                      <div className="flex items-center gap-2">
                        Fundos
                        {getSortIcon('valor_deposito')}
                      </div>
                    </th>
                    <th
                      className="text-left px-6 py-4 text-sm font-semibold text-slate-700 cursor-pointer hover:bg-slate-100 transition-colors"
                      onClick={() => handleSort('profit_pct')}
                    >
                      <div className="flex items-center gap-2">
                        Profit
                        {getSortIcon('profit_pct')}
                      </div>
                    </th>
                    <th
                      className="text-left px-6 py-4 text-sm font-semibold text-slate-700 cursor-pointer hover:bg-slate-100 transition-colors"
                      onClick={() => handleSort('data_compra')}
                    >
                      <div className="flex items-center gap-2">
                        Data Compra
                        {getSortIcon('data_compra')}
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {clientesOrdenados.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-6 py-12 text-center">
                        <div className="flex flex-col items-center justify-center">
                          <Search className="text-slate-300 mb-3" size={48} />
                          <p className="text-slate-500 text-lg">Nenhum lead encontrado</p>
                          <p className="text-slate-400 text-sm mt-1">
                            {searchQuery ? 'Tente ajustar sua busca' : 'Comece importando leads'}
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    clientesPaginados.map(cliente => (
                      <tr
                        key={cliente.id}
                        className="hover:bg-slate-50 transition-colors"
                      >
                        <td
                          className="px-4 py-4 text-center"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleClienteSelection(cliente.id);
                          }}
                        >
                          <button className="hover:bg-slate-200 p-1 rounded transition-colors">
                            {selectedClienteIds.has(cliente.id) ? (
                              <CheckSquare size={18} className="text-blue-600" />
                            ) : (
                              <Square size={18} className="text-slate-400" />
                            )}
                          </button>
                        </td>
                        <td
                          className="px-6 py-4 cursor-pointer"
                          onClick={() => {
                            setSelectedCliente(cliente);
                            setShowModal(true);
                          }}
                        >
                          <div>
                            <div className="font-semibold text-slate-900">{capitalizeName(cliente.nome)}</div>
                            {cliente.pais && (
                              <div className="text-xs text-slate-500 mt-1">{cliente.pais}</div>
                            )}
                          </div>
                        </td>
                        <td
                          className="px-6 py-4 cursor-pointer"
                          onClick={() => {
                            setSelectedCliente(cliente);
                            setShowModal(true);
                          }}
                        >
                          <div className="text-sm">
                            <div className="text-slate-700">{cliente.email}</div>
                            <div className="text-slate-500">{cliente.telefone}</div>
                          </div>
                        </td>
                        <td
                          className="px-6 py-4 cursor-pointer"
                          onClick={() => {
                            setSelectedCliente(cliente);
                            setShowModal(true);
                          }}
                        >
                          <span
                            className={`inline-flex px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(
                              cliente.status
                            )}`}
                          >
                            {getStatusLabel(cliente.status, true)}
                          </span>
                        </td>
                        <td
                          className="px-6 py-4 cursor-pointer"
                          onClick={() => {
                            setSelectedCliente(cliente);
                            setShowModal(true);
                          }}
                        >
                          <span className="text-sm text-slate-700">{cliente.assessor || '-'}</span>
                        </td>
                        <td
                          className="px-6 py-4 cursor-pointer"
                          onClick={() => {
                            setSelectedCliente(cliente);
                            setShowModal(true);
                          }}
                        >
                          {cliente.valor_deposito ? (
                            <span className="text-sm font-semibold text-emerald-600">
                              $ {profile?.is_master ? cliente.valor_deposito.toLocaleString('pt-BR') : '***'}
                            </span>
                          ) : (
                            <span className="text-sm text-slate-400">-</span>
                          )}
                        </td>
                        <td
                          className="px-6 py-4 cursor-pointer"
                          onClick={() => {
                            setSelectedCliente(cliente);
                            setShowModal(true);
                          }}
                        >
                          {profile?.is_master && cliente.profit_moneta != null ? (() => {
                            const depositoReal = (cliente.valor_deposito ?? 0) - (cliente.profit_moneta ?? 0);
                            const pct = depositoReal > 0 ? (cliente.profit_moneta ?? 0) / depositoReal * 100 : 0;
                            const isPos = pct >= 0;
                            return (
                              <span className={`text-sm font-semibold ${isPos ? 'text-emerald-600' : 'text-red-600'}`}>
                                {isPos ? '+' : ''}{pct.toFixed(2)}%
                              </span>
                            );
                          })() : (
                            <span className="text-sm text-slate-400">-</span>
                          )}
                        </td>
                        <td
                          className="px-6 py-4 cursor-pointer"
                          onClick={() => {
                            setSelectedCliente(cliente);
                            setShowModal(true);
                          }}
                        >
                          <span className="text-sm text-slate-600">
                            {formatarData(cliente.data_compra)}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            )}
            <Pagination
              currentPage={currentPageClientes}
              totalPages={totalPagesClientes}
              onPageChange={(page) => {
                setCurrentPageClientes(page);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              totalItems={clientesOrdenados.length}
              itemsPerPage={itemsPerPage}
            />
          </div>
        </div>
      )}

      {view === 'dashboard' && canAccess('dashboard') && (
        <div className="max-w-[1600px] mx-auto px-6 py-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
            <div className="bg-gradient-to-br from-blue-500 to-blue-600 p-6 rounded-xl shadow-lg text-white transform hover:scale-105 transition-all duration-200">
              <div className="flex items-start justify-between mb-4">
                <div className="bg-white/20 p-3 rounded-lg backdrop-blur-sm">
                  <Users size={24} />
                </div>
                <div className="text-right">
                  <p className="text-blue-100 text-sm font-medium">Total</p>
                  <p className="text-4xl font-bold mt-1">{metricas.totalClientes}</p>
                </div>
              </div>
              <div className="border-t border-white/20 pt-3">
                <p className="text-sm font-medium text-blue-50">Clientes no Sistema</p>
              </div>
            </div>

            <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 p-6 rounded-xl shadow-lg text-white transform hover:scale-105 transition-all duration-200">
              <div className="flex items-start justify-between mb-4">
                <div className="bg-white/20 p-3 rounded-lg backdrop-blur-sm">
                  <TrendingUp size={24} />
                </div>
                <div className="text-right">
                  <p className="text-emerald-100 text-sm font-medium">Depositaram</p>
                  <p className="text-4xl font-bold mt-1">{metricas.depositaram}</p>
                </div>
              </div>
              <div className="border-t border-white/20 pt-3 flex items-center justify-between">
                <p className="text-sm font-medium text-emerald-50">Taxa de Conversão</p>
                <span className="bg-white/20 px-3 py-1 rounded-full text-sm font-bold backdrop-blur-sm">
                  {metricas.taxaConversao}%
                </span>
              </div>
            </div>

            <div className="bg-gradient-to-br from-violet-500 to-violet-600 p-6 rounded-xl shadow-lg text-white transform hover:scale-105 transition-all duration-200">
              <div className="flex items-start justify-between mb-4">
                <div className="bg-white/20 p-3 rounded-lg backdrop-blur-sm">
                  <DollarSign size={24} />
                </div>
                <div className="text-right">
                  <p className="text-violet-100 text-sm font-medium">Valor Total</p>
                  <p className="text-4xl font-bold mt-1">
                    {metricas.valorTotal >= 1000
                      ? `${(metricas.valorTotal / 1000).toFixed(0)}k`
                      : metricas.valorTotal}
                  </p>
                </div>
              </div>
              <div className="border-t border-white/20 pt-3">
                <p className="text-sm font-medium text-violet-50">
                  $ {metricas.valorTotal.toLocaleString('pt-BR')}
                </p>
              </div>
            </div>

            <div className="bg-gradient-to-br from-red-500 to-red-600 p-6 rounded-xl shadow-lg text-white transform hover:scale-105 transition-all duration-200">
              <div className="flex items-start justify-between mb-4">
                <div className="bg-white/20 p-3 rounded-lg backdrop-blur-sm">
                  <AlertCircle size={24} />
                </div>
                <div className="text-right">
                  <p className="text-red-100 text-sm font-medium">Problemas</p>
                  <p className="text-4xl font-bold mt-1">{metricas.comProblema}</p>
                </div>
              </div>
              <div className="border-t border-white/20 pt-3">
                <p className="text-sm font-medium text-red-50">
                  {metricas.comProblema > 0 ? 'Requer Atenção' : 'Tudo em Ordem'}
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-slate-200">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Funil de Conversão</h2>
                  <p className="text-sm text-slate-500 mt-1">Progressão dos clientes no processo</p>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={dadosGrafico}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis
                    dataKey="nome"
                    tick={{ fill: '#64748b', fontSize: 12 }}
                    axisLine={{ stroke: '#cbd5e1' }}
                  />
                  <YAxis
                    tick={{ fill: '#64748b', fontSize: 12 }}
                    axisLine={{ stroke: '#cbd5e1' }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1e293b',
                      border: 'none',
                      borderRadius: '8px',
                      color: '#fff'
                    }}
                  />
                  <Bar dataKey="valor" fill="url(#colorGradient)" radius={[8, 8, 0, 0]} />
                  <defs>
                    <linearGradient id="colorGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3b82f6" stopOpacity={1} />
                      <stop offset="100%" stopColor="#1d4ed8" stopOpacity={1} />
                    </linearGradient>
                  </defs>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
              <h2 className="text-xl font-bold text-slate-900 mb-2">Status Distribution</h2>
              <p className="text-sm text-slate-500 mb-6">Distribuição por status</p>
              <div className="space-y-4">
                {[
                  { status: 'comprou', label: 'Aguardando Conta', color: 'bg-slate-500' },
                  { status: 'conta-criada', label: 'Conta Criada', color: 'bg-blue-500' },
                  { status: 'depositou', label: 'Depositou', color: 'bg-emerald-500' },
                  { status: 'acompanhamento', label: 'Acompanhamento', color: 'bg-cyan-500' },
                  { status: 'problema', label: 'Com Problema', color: 'bg-red-500' },
                  { status: 'finalizado', label: 'Finalizado', color: 'bg-slate-800' }
                ].map(({ status, label, color }) => {
                  let count;
                  if (status === 'conta-criada' || status === 'depositou') {
                    count = clientesFiltrados.filter(c => c.valor_deposito && c.valor_deposito > 0).length;
                  } else {
                    count = clientesFiltrados.filter(c => c.status === status).length;
                  }
                  const percentage = metricas.totalClientes > 0
                    ? ((count / metricas.totalClientes) * 100).toFixed(0)
                    : 0;
                  return (
                    <div key={status}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-slate-700">{label}</span>
                        <span className="text-sm font-bold text-slate-900">{count}</span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                        <div
                          className={`${color} h-2.5 rounded-full transition-all duration-500`}
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                      <div className="text-xs text-slate-500 mt-1">{percentage}%</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Clientes que Precisam de Atenção</h2>
                <p className="text-sm text-slate-500 mt-1">Ações prioritárias e clientes com problema</p>
              </div>
            </div>
            <div className="space-y-3">
              {clientesFiltrados
                .filter(c => c.status === 'depositou' && !agendamentos.find(a => a.cliente_id === c.id))
                .map(cliente => (
                  <div
                    key={cliente.id}
                    className="flex items-center justify-between p-4 bg-gradient-to-r from-amber-50 to-yellow-50 rounded-lg border border-amber-200 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-center gap-4">
                      <div className="bg-amber-100 p-3 rounded-lg">
                        <Phone className="text-amber-600" size={20} />
                      </div>
                      <div>
                        <p className="font-semibold text-slate-900">{capitalizeName(cliente.nome)}</p>
                        <p className="text-sm text-slate-600">
                          Depositou mas não teve ligação de acompanhamento
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setSelectedCliente(cliente);
                        setShowModal(true);
                      }}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg flex items-center gap-2 transition-colors font-medium shadow-sm"
                    >
                      <Phone size={16} />
                      Registrar Ligação
                    </button>
                  </div>
                ))}
              {clientesFiltrados.filter(c => c.status === 'problema').map(cliente => (
                <div
                  key={cliente.id}
                  className="flex items-center justify-between p-4 bg-gradient-to-r from-red-50 to-rose-50 rounded-lg border border-red-200 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-center gap-4">
                    <div className="bg-red-100 p-3 rounded-lg">
                      <AlertCircle className="text-red-600" size={20} />
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900">{capitalizeName(cliente.nome)}</p>
                      <p className="text-sm text-slate-600">Cliente com problema detectado</p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setSelectedCliente(cliente);
                      setShowModal(true);
                    }}
                    className="bg-red-600 hover:bg-red-700 text-white px-5 py-2.5 rounded-lg transition-colors font-medium shadow-sm"
                  >
                    Ver Detalhes
                  </button>
                </div>
              ))}
              {clientesFiltrados.filter(
                c =>
                  (c.status === 'depositou' && !agendamentos.find(a => a.cliente_id === c.id)) ||
                  c.status === 'problema'
              ).length === 0 && (
                <div className="text-center py-12">
                  <div className="inline-flex items-center justify-center w-16 h-16 bg-emerald-100 rounded-full mb-4">
                    <svg className="w-8 h-8 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <p className="text-slate-900 font-semibold text-lg">Tudo em ordem!</p>
                  <p className="text-slate-500 mt-1">Nenhum cliente precisa de atenção no momento</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {view === 'kanban' && canAccess('kanban') && (
        <div className="max-w-7xl mx-auto px-4 py-6">
          {kanbanLoading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-gray-600">Carregando colunas...</p>
            </div>
          ) : (
            <div className="space-y-4">
              {meuNomeAssessor && (
                <div className="flex items-center gap-3 flex-wrap">
                  {(() => {
                    const meuFiltroAtivo = filtros.assessor === meuNomeAssessor;
                    return (
                      <button
                        onClick={handleFiltrarMeusClientes}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-2 transition-all ${
                          meuFiltroAtivo
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                      >
                        <User size={14} />
                        {meuFiltroAtivo ? 'Todos os clientes' : 'Meus clientes'}
                      </button>
                    );
                  })()}
                </div>
              )}
              {hiddenColumns.size > 0 && (
                <div className="bg-slate-100 rounded-lg p-3 flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <Eye size={16} />
                    <span className="font-medium">Colunas ocultas:</span>
                  </div>
                  {kanbanColumns
                    .filter(col => hiddenColumns.has(col.status_key))
                    .map(col => (
                      <button
                        key={col.status_key}
                        onClick={() => toggleColumnVisibility(col.status_key)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-2 transition-all hover:scale-105 ${getStatusColor(col.status_key)}`}
                      >
                        <span>{col.display_name}</span>
                        <span className="opacity-75">({clientesFiltrados.filter(c => c.status === col.status_key).length})</span>
                        <ChevronDown size={14} />
                      </button>
                    ))}
                </div>
              )}
              {kanbanColumns.map(column => {
                const isHidden = hiddenColumns.has(column.status_key);
                const columnCount = clientesFiltrados
                  .filter(c => c.status === column.status_key).length;

                if (isHidden) return null;

                return (
                  <div key={column.status_key} className="space-y-4">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => toggleColumnVisibility(column.status_key)}
                        className="p-1 hover:bg-slate-200 rounded transition-colors text-slate-500"
                        title="Ocultar coluna"
                      >
                        <ChevronDown size={20} />
                      </button>
                      <div className={`inline-flex items-center gap-2 px-6 py-2 rounded-lg font-bold ${getStatusColor(column.status_key)}`}>
                        {editingColumnId === column.id ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={editingColumnName}
                              onChange={(e) => setEditingColumnName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  handleSaveColumnName(column.id);
                                } else if (e.key === 'Escape') {
                                  handleCancelEditColumn();
                                }
                              }}
                              className="px-2 py-1 border border-slate-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-slate-900"
                              autoFocus
                            />
                            <button
                              onClick={() => handleSaveColumnName(column.id)}
                              className="p-1 hover:bg-white/20 rounded transition-colors"
                              title="Salvar"
                            >
                              <Check size={18} />
                            </button>
                            <button
                              onClick={handleCancelEditColumn}
                              className="p-1 hover:bg-white/20 rounded transition-colors"
                              title="Cancelar"
                            >
                              <X size={18} />
                            </button>
                          </div>
                        ) : (
                          <>
                            <span>{column.display_name}</span>
                            <button
                              onClick={() => handleStartEditColumn(column.id, column.display_name)}
                              className="p-1 hover:bg-white/20 rounded transition-colors"
                              title="Editar nome"
                            >
                              <Edit2 size={16} />
                            </button>
                          </>
                        )}
                        <span className="ml-2 text-sm font-normal">
                          ({columnCount})
                        </span>
                      </div>
                    </div>
                    <div
                      className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 min-h-[100px] p-4 rounded-lg transition-colors ml-8 ${
                        dragOverColumn === column.status_key
                          ? 'bg-blue-50 border-2 border-dashed border-blue-400'
                          : 'bg-transparent'
                      }`}
                      onDragOver={(e) => handleDragOver(e, column.status_key)}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleDrop(e, column.status_key)}
                    >
                      {clientesFiltrados
                        .filter(c => c.status === column.status_key)
                        .sort((a, b) => {
                          const aTime = a.status_updated_at ? new Date(a.status_updated_at).getTime() : 0;
                          const bTime = b.status_updated_at ? new Date(b.status_updated_at).getTime() : 0;
                          if (aTime === 0 && bTime === 0) return 0;
                          if (aTime === 0) return 1;
                          if (bTime === 0) return -1;
                          return bTime - aTime;
                        })
                        .map(cliente => (
                          <div
                            key={cliente.id}
                            draggable
                            onDragStart={() => handleDragStart(cliente.id)}
                            onDragEnd={handleDragEnd}
                            className={`cursor-move ${draggedClienteId === cliente.id ? 'opacity-50' : ''}`}
                          >
                            <Leadboard
                              cliente={cliente}
                              onClick={() => {
                                if (!draggedClienteId) {
                                  setSelectedCliente(cliente);
                                  setShowModal(true);
                                }
                              }}
                              onOpenWhatsApp={handleOpenWhatsApp}
                              context="kanban"
                            />
                          </div>
                        ))}
                      {columnCount === 0 && (
                        <div className="col-span-full text-center py-8 text-slate-400 text-sm">
                          Nenhum cliente nesta fase
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {view === 'agendamentos' && canAccess('agendamentos') && (() => {
        const hoje = new Date().toISOString().split('T')[0];
        const agora = new Date();

        // ── helpers ────────────────────────────────────────────────────────
        const getIniciaisCli = (nome: string) =>
          nome.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('');

        const avatarCls = (status: string) => {
          if (status === 'depositou')    return 'bg-green-100 text-green-700';
          if (status === 'acompanhamento') return 'bg-blue-100 text-blue-700';
          if (status === 'problema')     return 'bg-red-100 text-red-700';
          return 'bg-amber-100 text-amber-700';
        };

        const pillCls = (status: string) => {
          if (status === 'depositou')    return 'bg-green-100 text-green-700';
          if (status === 'acompanhamento') return 'bg-blue-100 text-blue-700';
          if (status === 'conta-criada') return 'bg-amber-100 text-amber-700';
          if (status === 'comprou')      return 'bg-purple-100 text-purple-700';
          return 'bg-slate-100 text-slate-500';
        };

        const pillLabel = (status: string) => {
          const map: Record<string, string> = {
            'depositou': 'Depositou', 'acompanhamento': 'Acompanhamento',
            'conta-criada': 'Conta criada', 'comprou': 'Comprou',
            'problema': 'Problema', 'finalizado': 'Finalizado', 'inativo': 'Inativo',
          };
          return map[status] || status;
        };

        const diasSemContato = (c: Cliente): number => {
          const dt = agendMeuContato.get(c.id)?.timestamp;
          if (!dt) return 9999;
          return Math.floor((Date.now() - new Date(dt).getTime()) / 86400000);
        };

        const contato_corClass = (dias: number) => {
          if (dias > 30) return 'text-red-600 font-semibold';
          if (dias >= 7) return 'text-amber-600 font-semibold';
          return 'text-green-700 font-semibold';
        };

        const fonteContato = (c: Cliente): 'ligação' | 'WhatsApp' => {
          return agendMeuContato.get(c.id)?.fonte ?? 'WhatsApp';
        };

        const fmtDateShort = (iso: string) => {
          const d = new Date(iso);
          return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
        };

        const clienteTemAssessor = (c: Cliente, assessorNome: string | null | undefined) => {
          if (!assessorNome || !c.assessor) return false;
          const assessorNormalized = normalizeAssessor(assessorNome);
          return c.assessor
            .split('/')
            .map(a => normalizeAssessor(a))
            .includes(assessorNormalized);
        };

        // ── base filters (local to this view) ─────────────────────────────
        const clientesBase = clientes
          .filter(c => c.status !== 'finalizado')
          .filter(c => !c.oculto)
          .filter(c => {
            if (!agendSearch.trim()) return true;
            const q = agendSearch.toLowerCase();
            return c.nome.toLowerCase().includes(q) ||
              (c.telefone || '').includes(agendSearch);
          })
          .filter(c => agendFilterAssessor === 'todas' || clienteTemAssessor(c, agendFilterAssessor))
          .filter(c => agendFilterStatus === 'todos' || c.status === agendFilterStatus)
          .filter(c => {
            // Master overriding via the UI assessor dropdown → that filter handles visibility
            if (profile?.is_master) return true;
            // Everyone else (incl. masters without override): only own assessor's clients
            if (!agendAssessorNome) return false;
            return clienteTemAssessor(c, agendAssessorNome);
          });

        // ── scheduled tabs ─────────────────────────────────────────────────
        const clientesAtivos = clientesBase.filter(c => c.status !== 'inativo' && !c.oculto);

        const atrasadas: Array<{ cliente: Cliente; agendamento: Agendamento }> = [];
        const hoje_ligacoes: Array<{ cliente: Cliente; agendamento: Agendamento }> = [];
        const proximos: Array<{ cliente: Cliente; agendamento: Agendamento }> = [];

        clientesAtivos.forEach(cliente => {
          const agend = agendamentos.find(a => a.cliente_id === cliente.id && !a.realizado);
          if (!agend) return;
          const dt = new Date(`${agend.data}T${agend.hora}`);
          if (agend.data < hoje || (agend.data === hoje && dt < agora)) {
            atrasadas.push({ cliente, agendamento: agend });
          } else if (agend.data === hoje) {
            hoje_ligacoes.push({ cliente, agendamento: agend });
          } else {
            proximos.push({ cliente, agendamento: agend });
          }
        });

        // ── sem agendamento ────────────────────────────────────────────────
        const semAgendamento = clientesAtivos
          .filter(c => !['finalizado', 'inativo'].includes(c.status))
          .filter(c => !agendamentos.find(a => a.cliente_id === c.id && !a.realizado && a.data >= hoje))
          .filter(c => agendMeuContato.has(c.id))
          .sort((a, b) => {
            const aD = agendMeuContato.get(a.id)?.timestamp || '';
            const bD = agendMeuContato.get(b.id)?.timestamp || '';
            return aD < bD ? -1 : aD > bD ? 1 : 0;
          });

        // ── inativos (never contacted) ─────────────────────────────────────
        const inativos = clientesBase
          .filter(c => c.status !== 'inativo' && c.status !== 'finalizado')
          .filter(c => !agendMeuContato.has(c.id))
          .filter(c => !agendamentos.find(a => a.cliente_id === c.id && !a.realizado && a.data >= hoje))
          .sort((a, b) => a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0);

        // ── tab data ────────────────────────────────────────────────────────
        type RowData =
          | { type: 'scheduled'; cliente: Cliente; agendamento: Agendamento }
          | { type: 'sem'; cliente: Cliente }
          | { type: 'inativo'; cliente: Cliente };

        const tabRows: RowData[] =
          agendTab === 'atrasadas'      ? atrasadas.map(r => ({ type: 'scheduled', ...r })) :
          agendTab === 'hoje'           ? hoje_ligacoes.map(r => ({ type: 'scheduled', ...r })) :
          agendTab === 'proximos'       ? proximos.map(r => ({ type: 'scheduled', ...r })) :
          agendTab === 'sem_agendamento' ? semAgendamento.map(c => ({ type: 'sem', cliente: c })) :
          inativos.map(c => ({ type: 'inativo', cliente: c }));

        const actionLabel = (type: string) => {
          if (type === 'scheduled') return 'Reagendar';
          if (type === 'sem')       return 'Agendar';
          return 'Iniciar contato';
        };

        return (
          <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">
            {/* Summary bar */}
            <div className="grid grid-cols-5 gap-3">
              {[
                { label: 'Atrasadas',        count: atrasadas.length,      cls: 'text-red-600',    tab: 'atrasadas' as const },
                { label: 'Para hoje',        count: hoje_ligacoes.length,  cls: 'text-amber-600',  tab: 'hoje' as const },
                { label: 'Próximos dias',    count: proximos.length,       cls: 'text-blue-600',   tab: 'proximos' as const },
                { label: 'Sem agendamento',  count: semAgendamento.length, cls: 'text-slate-700',  tab: 'sem_agendamento' as const },
                { label: 'Inativos',         count: inativos.length,       cls: 'text-slate-400',  tab: 'inativos' as const },
              ].map(s => (
                <button
                  key={s.tab}
                  onClick={() => setAgendTab(s.tab)}
                  className={`bg-white border rounded-xl p-3 text-left transition-all hover:border-slate-300 ${agendTab === s.tab ? 'border-blue-400 ring-1 ring-blue-200' : 'border-slate-200'}`}
                >
                  <p className="text-xs text-slate-500 mb-1">{s.label}</p>
                  <p className={`text-2xl font-medium ${s.cls}`}>{s.count}</p>
                </button>
              ))}
            </div>

            {/* Tabs */}
            <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
              {([
                { key: 'atrasadas',       label: `Atrasadas (${atrasadas.length})` },
                { key: 'hoje',            label: `Hoje (${hoje_ligacoes.length})` },
                { key: 'proximos',        label: `Próximos (${proximos.length})` },
                { key: 'sem_agendamento', label: `Sem agendamento (${semAgendamento.length})` },
                { key: 'inativos',        label: `Inativos (${inativos.length})` },
              ] as const).map(t => (
                <button
                  key={t.key}
                  onClick={() => setAgendTab(t.key)}
                  className={`flex-1 py-1.5 px-2 rounded-md text-xs font-medium transition-all ${
                    agendTab === t.key
                      ? 'bg-white text-slate-800 shadow-sm border border-slate-200'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Filters */}
            <div className="flex gap-2 items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                <input
                  type="text"
                  placeholder="Buscar cliente..."
                  value={agendSearch}
                  onChange={e => setAgendSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-400 focus:border-blue-400"
                />
                {agendSearch && (
                  <button onClick={() => setAgendSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    <X size={13} />
                  </button>
                )}
              </div>
              <select
                value={agendFilterAssessor}
                onChange={e => setAgendFilterAssessor(e.target.value)}
                className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-blue-400"
              >
                <option value="todas">Todos assessores</option>
                {assessoresDisponiveis.map(a => (
                  <option key={a.id} value={a.nome}>{a.nome}</option>
                ))}
              </select>
              <select
                value={agendFilterStatus}
                onChange={e => setAgendFilterStatus(e.target.value)}
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

            {/* List */}
            <div className="space-y-2">
              {tabRows.length === 0 ? (
                <div className="text-center py-16 text-slate-400 text-sm">Nenhum cliente nesta seção</div>
              ) : (
                tabRows.map(row => {
                  const c = row.cliente;
                  const dias = row.type === 'sem' ? diasSemContato(c) : 0;
                  const fonte = row.type === 'sem' ? fonteContato(c) : 'ligação';
                  const ultimoAt = agendMeuContato.get(c.id)?.timestamp;

                  return (
                    <div
                      key={c.id}
                      className="flex items-center gap-3 bg-white border border-slate-200 rounded-xl px-4 py-3 hover:border-slate-300 transition-all"
                    >
                      {/* Avatar */}
                      <div className={`w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-semibold ${avatarCls(c.status)}`}>
                        {getIniciaisCli(c.nome)}
                      </div>

                      {/* Client info */}
                      <div className="flex-1 min-w-0">
                        <button
                          type="button"
                          onClick={() => {
                            setAutoOpenAgendamento(false);
                            setSelectedCliente(c);
                            setShowModal(true);
                          }}
                          className="block max-w-full truncate text-left text-sm font-medium text-blue-700 hover:text-blue-900 hover:underline focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 rounded"
                          title={`Abrir cliente ${c.nome}`}
                        >
                          {capitalizeName(c.nome)}
                        </button>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${pillCls(c.status)}`}>
                            {pillLabel(c.status)}
                          </span>
                          {(c.valor_deposito ?? 0) >= 1 && (
                            <span className="text-xs text-slate-500">$ {profile?.is_master ? c.valor_deposito?.toLocaleString('pt-BR') : '***'}</span>
                          )}
                          {row.type === 'sem' && ultimoAt && (
                            <span className="flex items-center gap-1 text-xs text-slate-400">
                              <span className={`inline-block w-1.5 h-1.5 rounded-full ${fonte === 'ligação' ? 'bg-blue-400' : 'bg-emerald-400'}`} />
                              via {fonte}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Assessor */}
                      {c.assessor && (
                        <span className="text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-500 border border-slate-200 flex-shrink-0 whitespace-nowrap">
                          {c.assessor}
                        </span>
                      )}

                      {/* Time badge */}
                      <div className="flex flex-col items-end flex-shrink-0 min-w-[110px]">
                        {row.type === 'scheduled' && (
                          <>
                            <span className="text-xs font-medium text-slate-700">
                              {row.agendamento.data === hoje ? 'Hoje' : formatarData(row.agendamento.data)} às {row.agendamento.hora.slice(0, 5)}
                            </span>
                            <span className="text-xs text-slate-400 mt-0.5">
                              {agendTab === 'atrasadas' ? 'Atrasada' : ''}
                            </span>
                          </>
                        )}
                        {row.type === 'sem' && (
                          <>
                            <span className={`text-xs ${contato_corClass(dias)}`}>
                              {dias === 9999 ? '—' : `${dias} dia${dias !== 1 ? 's' : ''} sem contato`}
                            </span>
                            {ultimoAt && (
                              <span className="text-xs text-slate-400 mt-0.5">
                                último: {fmtDateShort(ultimoAt)} via {fonte}
                              </span>
                            )}
                          </>
                        )}
                        {row.type === 'inativo' && (
                          <>
                            <span className="text-xs text-slate-400 font-medium">Nunca contatado</span>
                            <span className="text-xs text-slate-400 mt-0.5">
                              desde {fmtDateShort(c.created_at)}/{new Date(c.created_at).getFullYear()}
                            </span>
                          </>
                        )}
                      </div>

                      {/* Action */}
                      {row.type === 'scheduled' && (agendTab === 'atrasadas' || agendTab === 'hoje') ? (
                        <div className="flex-shrink-0 flex gap-1.5">
                          <button
                            onClick={() => { setAutoOpenAgendamento(true); setSelectedCliente(c); setShowModal(true); }}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium border bg-emerald-700 text-emerald-50 border-emerald-700 hover:bg-emerald-800 transition-all"
                          >
                            Finalizar
                          </button>
                          <button
                            onClick={async () => {
                              if (!confirm(`Cancelar agendamento de ${c.nome}?`)) return;
                              await deleteAgendamento(row.agendamento.id);
                              handleRemoveAgendamento(row.agendamento.id);
                            }}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium border bg-white text-red-600 border-red-200 hover:bg-red-50 transition-all"
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setSelectedCliente(c); setShowModal(true); }}
                          className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                            row.type === 'inativo'
                              ? 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                              : 'bg-emerald-700 text-emerald-50 border-emerald-700 hover:bg-emerald-800'
                          }`}
                        >
                          {actionLabel(row.type)}
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        );
      })()}

      {view === 'atendimentos' && (
        <AtendimentosView
          clientes={clientes}
          assessores={assessoresDisponiveis}
          onOpenWhatsApp={handleOpenWhatsApp}
          onOpenWabaChat={handleOpenWabaChat}
          onSelectCliente={c => { setSelectedCliente(c); setShowModal(true); }}
        />
      )}

      {view === 'campanhas' && (profile?.is_master || profile?.can_access_campanhas) && (
        <CampanhasView
          clientes={clientes}
          onSelectCliente={c => { setSelectedCliente(c); setShowModal(true); }}
          onRefreshClientes={() => fetchClientes(true)}
        />
      )}

      {view === 'financeiro' && (profile?.is_master || profile?.can_access_financeiro) && (
        <FinanceiroView clientes={clientes} />
      )}

      {view === 'senhas' && (profile?.is_master || profile?.can_access_passwords) && (
        <div className="max-w-7xl mx-auto px-4 py-6">
          <PasswordManager />
        </div>
      )}

      {view === 'lead-audit' && profile?.is_master && (
        <LeadMatchingAudit />
      )}

      {view === 'cliente-oculto' && profile?.is_master && (
        <ShadowClientView />
      )}

      {view === 'formularios' && canAccess('formularios') && (
        <div className="max-w-[1600px] mx-auto px-6 py-6">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="ocultarDuplicados"
                checked={ocultarDuplicados}
                onChange={(e) => {
                  setOcultarDuplicados(e.target.checked);
                  setCurrentPageFormularios(1);
                }}
                className="w-4 h-4 text-blue-600 bg-white border-gray-300 rounded focus:ring-blue-500"
              />
              <label htmlFor="ocultarDuplicados" className="text-sm font-medium text-slate-700 cursor-pointer">
                Ocultar Duplicados
              </label>
              <span className="text-xs text-slate-500">
                (Verifica telefone)
              </span>
            </div>
            <button
              onClick={() => setShowAddLeadModal(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
            >
              <span className="text-base leading-none">+</span> Adicionar Lead Manual
            </button>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-6 py-4 text-sm font-semibold text-slate-700">Nome</th>
                    <th className="text-left px-6 py-4 text-sm font-semibold text-slate-700">Telefone</th>
                    <th className="text-left px-6 py-4 text-sm font-semibold text-slate-700">Data de Cadastro</th>
                    <th className="text-right px-6 py-4 text-sm font-semibold text-slate-700">Acoes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {leadsLoading ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-12 text-center">
                        <div className="flex flex-col items-center justify-center">
                          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-3"></div>
                          <p className="text-slate-500 text-lg">Carregando formulários...</p>
                        </div>
                      </td>
                    </tr>
                  ) : leadsFiltrados.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-12 text-center">
                        <div className="flex flex-col items-center justify-center">
                          <ClipboardList className="text-slate-300 mb-3" size={48} />
                          <p className="text-slate-500 text-lg">Nenhum formulário encontrado</p>
                          <p className="text-slate-400 text-sm mt-1">
                            Os formulários preenchidos aparecerão aqui
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    formulariosPaginados.map(lead => (
                      <tr
                        key={lead.id}
                        className="hover:bg-slate-50 transition-colors"
                      >
                        <td className="px-6 py-4">
                          <button
                            onClick={() => {
                              setSelectedLead(lead);
                              setShowLeadModal(true);
                            }}
                            className="font-semibold text-blue-600 hover:text-blue-800 transition-colors text-left"
                          >
                            {capitalizeName(lead.nome)}
                          </button>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm text-slate-700">{lead.telefone}</span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm text-slate-600">
                            {new Date(lead.created_at).toLocaleString('pt-BR')}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={() => {
                              setSelectedLead(lead);
                              setShowLeadModal(true);
                            }}
                            className="text-blue-600 hover:text-blue-800 text-sm font-medium transition-colors"
                          >
                            Ver rastreamento
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <Pagination
              currentPage={currentPageFormularios}
              totalPages={totalPagesFormularios}
              onPageChange={(page) => {
                setCurrentPageFormularios(page);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              totalItems={leadsFiltrados.length}
              itemsPerPage={itemsPerPage}
            />
          </div>
        </div>
      )}

      {canAccess('whatsapp') && (
        <div style={{ display: view === 'whatsapp' ? 'block' : 'none' }} className="max-w-[1600px] mx-auto px-4">
          <WhatsAppView
            targetPhone={whatsappTargetPhone}
            onTargetPhoneHandled={() => setWhatsappTargetPhone(null)}
            onUnreadCountChange={setWhatsappUnread}
          />
        </div>
      )}

      {/* Módulo WABA (WhatsApp oficial) — sempre montado para manter a contagem de não lidas. */}
      <div style={{ display: view === 'waba' ? 'block' : 'none' }} className="max-w-[1600px] mx-auto px-0 lg:px-4">
        <WabaView
          onUnreadCountChange={setWabaUnread}
          onOpenCliente={handleOpenClienteFromWaba}
          openChatId={wabaOpenChatId}
          onOpenChatHandled={handleWabaOpenChatHandled}
        />
      </div>

      {view === 'configuracoes' && canAccess('configuracoes') && (
        <div className="max-w-7xl mx-auto px-4 py-6">
          <h2 className="text-2xl font-bold mb-6">Configurações do Sistema</h2>

          <div className="space-y-6">
            {profile?.is_master && (
              <div className="bg-white p-6 rounded-lg shadow">
                <UserManagement />
              </div>
            )}
            {profile?.is_master && <NotificationCreate />}
            <LeadDistributionConfig />
            {profile?.is_master && <AssessorComprouConfig />}
            {profile?.is_master && <CampanhaCostConfig />}
            {profile?.is_master && <CampanhaMatchingConfig />}
            <AssessorManagement />
            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-xl font-bold mb-4">Webhook Hotmart</h3>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    URL do Webhook
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/hotmart-webhook`}
                      readOnly
                      className="flex-1 border rounded px-3 py-2 bg-gray-50 text-gray-600 font-mono text-sm"
                    />
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(
                          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/hotmart-webhook`
                        );
                      }}
                      className="bg-blue-600 text-white px-4 py-2 rounded"
                    >
                      Copiar
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Evento a Configurar
                  </label>
                  <input
                    type="text"
                    value="PURCHASE_APPROVED"
                    readOnly
                    className="border rounded px-3 py-2 bg-gray-50 text-gray-600 w-64"
                  />
                </div>

                <div className="border-t pt-4 mt-4">
                  <h4 className="font-semibold mb-2">Status da Integração</h4>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                    <span className="text-sm text-gray-600">Webhook configurado e ativo</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    Total de clientes: {clientes.length}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-blue-50 p-6 rounded-lg border border-blue-200">
              <h3 className="text-lg font-bold mb-3 text-blue-900">
                Como Configurar o Webhook na Hotmart
              </h3>
              <ol className="space-y-2 text-sm text-blue-800">
                <li>
                  <strong>1.</strong> Acesse:{' '}
                  <a
                    href="https://app.hotmart.com/tools/webhooks"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                  >
                    https://app.hotmart.com/tools/webhooks
                  </a>
                </li>
                <li>
                  <strong>2.</strong> Clique em "Novo Webhook"
                </li>
                <li>
                  <strong>3.</strong> Cole a URL acima no campo "URL"
                </li>
                <li>
                  <strong>4.</strong> Selecione o evento: "PURCHASE_APPROVED"
                </li>
                <li>
                  <strong>5.</strong> Clique em "Salvar"
                </li>
                <li>
                  <strong>6.</strong> Teste com uma venda de simulação ou real
                </li>
              </ol>
            </div>

            <div className="bg-white p-6 rounded-lg shadow">
              <div className="flex items-center gap-3 mb-4">
                <Upload className="text-blue-600" size={24} />
                <h3 className="text-xl font-bold">Importar Conversões Antigas</h3>
              </div>

              <p className="text-sm text-gray-600 mb-4">
                Importe suas conversões antigas através de uma planilha CSV. Baixe o modelo, preencha com seus dados e faça o upload.
              </p>

              <div className="space-y-4">
                <div className="flex gap-3">
                  <button
                    onClick={baixarTemplateCSV}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                  >
                    <FileText size={20} />
                    Baixar Modelo de Planilha
                  </button>

                  <label className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors cursor-pointer">
                    <Upload size={20} />
                    {uploading ? 'Processando...' : 'Fazer Upload CSV'}
                    <input
                      type="file"
                      accept=".csv"
                      onChange={handleUploadCSV}
                      disabled={uploading}
                      className="hidden"
                    />
                  </label>
                </div>

                {uploadStatus && (
                  <div
                    className={`p-4 rounded-lg border ${
                      uploadStatus.type === 'success'
                        ? 'bg-green-50 border-green-200 text-green-800'
                        : uploadStatus.type === 'error'
                        ? 'bg-red-50 border-red-200 text-red-800'
                        : 'bg-blue-50 border-blue-200 text-blue-800'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <div className="flex-1">
                        <p className="text-sm whitespace-pre-line font-medium">{uploadStatus.message}</p>
                      </div>
                      <button
                        onClick={() => setUploadStatus(null)}
                        className="text-gray-500 hover:text-gray-700"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </div>
                )}

                <div className="border-t pt-4 mt-4">
                  <h4 className="font-semibold mb-3 text-base">Ou Adicione Manualmente</h4>
                  <form onSubmit={handleManualImport} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Nome Completo <span className="text-red-600">*</span>
                        </label>
                        <input
                          type="text"
                          value={manualImportForm.nome}
                          onChange={(e) => setManualImportForm({ ...manualImportForm, nome: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          placeholder="João Silva"
                          required
                          disabled={submittingManual}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Email <span className="text-red-600">*</span>
                        </label>
                        <input
                          type="email"
                          value={manualImportForm.email}
                          onChange={(e) => setManualImportForm({ ...manualImportForm, email: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          placeholder="joao@email.com"
                          required
                          disabled={submittingManual}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Telefone <span className="text-red-600">*</span>
                        </label>
                        <input
                          type="tel"
                          value={manualImportForm.telefone}
                          onChange={(e) => setManualImportForm({ ...manualImportForm, telefone: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          placeholder="(11) 99999-9999"
                          required
                          disabled={submittingManual}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Data da Compra <span className="text-red-600">*</span>
                        </label>
                        <input
                          type="date"
                          value={manualImportForm.data_compra}
                          onChange={(e) => setManualImportForm({ ...manualImportForm, data_compra: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          required
                          disabled={submittingManual}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Valor do Produto <span className="text-red-600">*</span>
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={manualImportForm.valor_produto}
                          onChange={(e) => setManualImportForm({ ...manualImportForm, valor_produto: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          placeholder="997.00"
                          required
                          disabled={submittingManual}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Status <span className="text-red-600">*</span>
                        </label>
                        <select
                          value={manualImportForm.status}
                          onChange={(e) => setManualImportForm({ ...manualImportForm, status: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          required
                          disabled={submittingManual}
                        >
                          <option value="comprou">Comprou</option>
                          <option value="conta-criada">Conta Criada</option>
                          <option value="depositou">Depositou</option>
                          <option value="acompanhamento">Acompanhamento</option>
                          <option value="problema">Problema</option>
                          <option value="finalizado">Finalizado</option>
                        </select>
                      </div>
                    </div>

                    <div className="flex justify-end">
                      <button
                        type="submit"
                        disabled={submittingManual}
                        className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
                      >
                        {submittingManual ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                            Importando...
                          </>
                        ) : (
                          <>
                            <Upload size={18} />
                            Importar Cliente
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                </div>

                <div className="border-t pt-4 mt-4">
                  <h4 className="font-semibold mb-2 text-sm">Campos da Planilha</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                    <div className="space-y-1">
                      <p><span className="font-semibold text-red-600">* nome:</span> Nome completo do cliente</p>
                      <p><span className="font-semibold text-red-600">* email:</span> Email válido</p>
                      <p><span className="font-semibold text-red-600">* telefone:</span> Telefone com DDD</p>
                      <p><span className="font-semibold text-red-600">* data_compra:</span> Formato AAAA-MM-DD</p>
                      <p><span className="font-semibold text-red-600">* valor_produto:</span> Valor numérico</p>
                      <p><span className="font-semibold text-red-600">* status:</span> comprou, conta-criada, depositou, acompanhamento, problema, finalizado</p>
                    </div>
                    <div className="space-y-1">
                      <p><span className="font-semibold">assessor:</span> Nome do assessor (opcional)</p>
                      <p><span className="font-semibold">valor_deposito:</span> Fundos (opcional)</p>
                      <p><span className="font-semibold">performance:</span> Performance em % (opcional)</p>
                      <p><span className="font-semibold">pais:</span> Nome do país (opcional)</p>
                      <p><span className="font-semibold">pais_iso:</span> Código ISO do país (opcional)</p>
                      <p><span className="font-semibold">moeda:</span> Código da moeda (opcional)</p>
                      <p><span className="font-semibold">valor_pago_moeda_original:</span> Valor na moeda original (opcional)</p>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    <span className="text-red-600">*</span> Campos obrigatórios
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
        </>
      )}
        </div>

      {showModal && selectedCliente && (
        <ClientDetailModal
          cliente={selectedCliente}
          autoOpenAgendamento={autoOpenAgendamento}
          onClose={() => {
            setShowModal(false);
            setSelectedCliente(null);
            setAutoOpenAgendamento(false);
          }}
          onUpdate={handleUpdateCliente}
          onStatusChange={handleStatusChange}
          onAddAgendamento={handleAddAgendamento}
          onRemoveAgendamento={handleRemoveAgendamento}
          onUpdateAgendamento={handleUpdateAgendamento}
          onOpenWhatsApp={handleOpenWhatsApp}
          onOpenWabaChat={handleOpenWabaChat}
        />
      )}

      {showBulkEditModal && selectedClienteIds.size > 0 && (
        <BulkEditModal
          selectedClientes={clientes.filter(c => selectedClienteIds.has(c.id))}
          onClose={() => setShowBulkEditModal(false)}
          onBulkUpdate={handleBulkUpdate}
          onBulkSendPostback={handleBulkSendPostback}
          onBulkSendGclid={handleBulkSendGclid}
        />
      )}

      {showLeadModal && selectedLead && (
        <LeadTrackingModal
          lead={selectedLead}
          onClose={() => {
            setShowLeadModal(false);
            setSelectedLead(null);
          }}
        />
      )}

      {!hideInternalChat && <InternalChat onOpenWhatsApp={handleOpenWhatsApp} />}

      {showAddLeadModal && (
        <AddLeadManualModal
          onClose={() => setShowAddLeadModal(false)}
          onSaved={() => { fetchLeads(); setShowAddLeadModal(false); }}
        />
      )}
      </div>
    </div>
  );
}

export default function App() {
  const { user, loading: authLoading } = useAuth();

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  return <AppContent />;
}
