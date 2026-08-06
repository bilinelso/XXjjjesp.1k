import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { X, CreditCard as Edit2, Save, Phone, Plus, EyeOff, Eye, Info, CheckCircle, Calendar, History, ChevronLeft, ChevronRight, Send } from 'lucide-react';
import type { Cliente, Ligacao, Agendamento } from '../lib/api';
import { useLigacoes } from '../hooks/useLigacoes';
import { useAgendamentos } from '../hooks/useAgendamentos';
import { useKanbanColumns } from '../hooks/useKanbanColumns';
import { useAssessores } from '../hooks/useAssessores';
import { INVESTMENT_CATEGORIES, getCategoryByValue, formatCategoryDisplay } from '../utils/investmentCategories';
import { DateTimePicker } from './DateTimePicker';
import { LoadingOverlay, LoadingSpinner } from './LoadingSpinner';
import { capitalizeName } from '../utils/formatters';
import { DepositoHistoricoModal } from './DepositoHistoricoModal';
import { WabaClientHistory } from './waba/WabaClientHistory';
import { WhatsAppChannelMenu } from './waba/WhatsAppChannelMenu';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { MD_QUERY } from '../lib/viewRouting';

type ClientDetailModalProps = {
  cliente: Cliente;
  onClose: () => void;
  onUpdate: (id: string, updates: Partial<Cliente>) => Promise<void>;
  onStatusChange: (id: string, status: string) => Promise<void>;
  onAddAgendamento?: (agendamento: Agendamento) => void;
  onRemoveAgendamento?: (agendamentoId: string) => void;
  onUpdateAgendamento?: (agendamentoId: string, updates: Partial<Agendamento>) => void;
  onOpenWhatsApp?: (phone: string) => void;
  onOpenWabaChat?: (chatId: string) => void;
  autoOpenAgendamento?: boolean;
};

const getStatusColor = (status: string): string => {
  const colors: Record<string, string> = {
    'comprou': 'bg-gray-100 text-gray-700',
    'conta-criada': 'bg-blue-100 text-blue-700',
    'depositou': 'bg-green-100 text-green-700',
    'acompanhamento': 'bg-purple-100 text-purple-700',
    'problema': 'bg-red-100 text-red-700',
    'finalizado': 'bg-slate-800 text-white',
    'inativo': 'bg-orange-100 text-orange-700'
  };
  return colors[status] || 'bg-gray-100';
};

const formatarData = (dataString: string | null | undefined): string => {
  if (!dataString) return 'Data não disponível';
  const [ano, mes, dia] = dataString.split('-');
  return `${dia.padStart(2, '0')}/${mes.padStart(2, '0')}/${ano}`;
};

const formatarDataHora = (dataString: string | null | undefined): string => {
  if (!dataString) return 'Data não disponível';
  const date = new Date(dataString);
  const dia = String(date.getDate()).padStart(2, '0');
  const mes = String(date.getMonth() + 1).padStart(2, '0');
  const ano = date.getFullYear();
  const hora = String(date.getHours()).padStart(2, '0');
  const minuto = String(date.getMinutes()).padStart(2, '0');
  return `${dia}/${mes}/${ano} às ${hora}:${minuto}`;
};

export const ClientDetailModal: React.FC<ClientDetailModalProps> = ({
  cliente,
  onClose,
  onUpdate,
  onStatusChange,
  onAddAgendamento,
  onRemoveAgendamento,
  onOpenWhatsApp,
  onOpenWabaChat,
  autoOpenAgendamento,
}) => {
  // Abaixo de `md` o modal ocupa a tela inteira em vez de imitar card.
  const isMobile = !useMediaQuery(MD_QUERY);
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState<Partial<Cliente>>(cliente);
  const [ligacoes, setLigacoes] = useState<Ligacao[]>([]);
  const [agendamento, setAgendamento] = useState<Agendamento | null>(null);
  const [showAgendamentoModal, setShowAgendamentoModal] = useState(false);
  const [showLeadDetailsModal, setShowLeadDetailsModal] = useState(false);
  const [sendingPostback, setSendingPostback] = useState(false);
  const [sendingGclid, setSendingGclid] = useState(false);
  const [novaLigacao, setNovaLigacao] = useState({
    descricao: '',
    status: 'positivo' as 'positivo' | 'atencao' | 'problema'
  });
  const [novoAgendamento, setNovoAgendamento] = useState({ data: '', hora: '' });
  const [showCompleteAgendamentoModal, setShowCompleteAgendamentoModal] = useState(false);
  const [observacaoAgendamento, setObservacaoAgendamento] = useState('');
  const [moverParaInativo, setMoverParaInativo] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [savingData, setSavingData] = useState(false);
  const [addingLigacao, setAddingLigacao] = useState(false);
  const [creatingAgendamento, setCreatingAgendamento] = useState(false);
  const [completingAgendamento, setCompletingAgendamento] = useState(false);
  const [togglingVisibility, setTogglingVisibility] = useState(false);
  const [showDepositoHistorico, setShowDepositoHistorico] = useState(false);
  const [ligacaoPage, setLigacaoPage] = useState(0);
  // Non-masters see an empty deposit input; track what they type separately
  const [nonMasterDeposito, setNonMasterDeposito] = useState('');

  const calcularRetornoPercentual = (fundos: number | null, profit: number | null): number => {
    const depositoReal = (fundos ?? 0) - (profit ?? 0);
    if (depositoReal <= 0) return 0;
    return ((profit ?? 0) / depositoReal) * 100;
  };

  const categoriaDisplay = cliente.categoria_investimento || getCategoryByValue(cliente.valor_deposito ?? 0);

  // Enhanced Conversions for Leads: a conversão pode ser enviada para qualquer
  // cliente com compra registrada, mesmo sem GCLID (casa por email/telefone).
  const temCompra = (cliente.valor_produto ?? 0) > 0;

  const { profile } = useAuth();
  const { fetchLigacoes, createLigacao } = useLigacoes();
  const {
    fetchAgendamento,
    createAgendamento,
    deleteAgendamento
  } = useAgendamentos();
  const { columns, getDisplayName } = useKanbanColumns();
  const { assessores, getClienteAssessores, updateClienteAssessor } = useAssessores();
  /** Seleção única: '' significa sem assessor. */
  const [selectedAssessorId, setSelectedAssessorId] = useState<string>('');

  useEffect(() => {
    loadClientData();
  }, [cliente.id]);

  useEffect(() => {
    setEditData(cliente);
  }, [cliente]);

  useEffect(() => {
    getClienteAssessores(cliente.id).then(data => {
      setSelectedAssessorId(data[0]?.id ?? '');
    });
  }, [cliente.assessor]);

  // Auto-open the complete agendamento modal when requested (e.g. from agendamentos tab)
  useEffect(() => {
    if (autoOpenAgendamento && !loadingData && agendamento) {
      setShowCompleteAgendamentoModal(true);
    }
  }, [autoOpenAgendamento, loadingData, agendamento]);

  useEffect(() => {
    if (editMode && editData.valor_deposito !== undefined) {
      const newCategory = getCategoryByValue(editData.valor_deposito);
      if (newCategory && newCategory !== editData.categoria_investimento) {
        setEditData(prev => ({ ...prev, categoria_investimento: newCategory }));
      }
    }
  }, [editData.valor_deposito, editMode]);

  const loadClientData = async (showLoading = true) => {
    if (showLoading) setLoadingData(true);
    try {
      const [ligacoesData, agendamentoData, clienteAssessores] = await Promise.all([
        fetchLigacoes(cliente.id),
        fetchAgendamento(cliente.id),
        getClienteAssessores(cliente.id)
      ]);
      setLigacoes(ligacoesData);
      setAgendamento(agendamentoData);
      setSelectedAssessorId(clienteAssessores[0]?.id ?? '');
    } finally {
      setLoadingData(false);
    }
  };

  const handleSave = async () => {
    setSavingData(true);
    try {
      await updateClienteAssessor(cliente.id, selectedAssessorId || null);

      const assessorNome = assessores.find(a => a.id === selectedAssessorId)?.nome;

      const updates: Partial<Cliente> = {
        nome: editData.nome,
        email: editData.email,
        telefone: editData.telefone,
        assessor: assessorNome || undefined,
        valor_deposito: profile?.is_master
          ? editData.valor_deposito
          : (nonMasterDeposito !== '' ? parseFloat(nonMasterDeposito) : undefined),
        categoria_investimento: editData.categoria_investimento,
      };

      await onUpdate(cliente.id, updates);

      const STATUS_APOS_DEPOSITO = ['depositou', 'acompanhamento', 'finalizado'];
      const savedDeposito = updates.valor_deposito;
      if (savedDeposito && savedDeposito > 0 &&
          !STATUS_APOS_DEPOSITO.includes(cliente.status)) {
        await onStatusChange(cliente.id, 'depositou');
      }

      setEditMode(false);
    } finally {
      setSavingData(false);
    }
  };

  const handleAddLigacao = async () => {
    if (!novaLigacao.descricao.trim()) {
      return;
    }

    setAddingLigacao(true);
    try {
      const result = await createLigacao({
        cliente_id: cliente.id,
        data: new Date().toISOString(),
        descricao: novaLigacao.descricao,
        status: novaLigacao.status,
        user_id: undefined
      });

      if (result.success) {
        setNovaLigacao({ descricao: '', status: 'positivo' });
        await loadClientData(false);
      }
    } finally {
      setAddingLigacao(false);
    }
  };

  const handleCreateAgendamento = async () => {
    if (!novoAgendamento.data || !novoAgendamento.hora) {
      return;
    }

    setCreatingAgendamento(true);
    try {
      const result = await createAgendamento({
        cliente_id: cliente.id,
        data: novoAgendamento.data,
        hora: novoAgendamento.hora,
        realizado: false,
        user_id: undefined
      });

      if (result.success && result.data) {
        setAgendamento(result.data);
        if (onAddAgendamento) {
          onAddAgendamento(result.data);
        }

        if (cliente.status !== 'acompanhamento') {
          await onStatusChange(cliente.id, 'acompanhamento');
        }

        setNovoAgendamento({ data: '', hora: '' });
        setShowAgendamentoModal(false);
      }
    } finally {
      setCreatingAgendamento(false);
    }
  };

  const handleDeleteAgendamento = async () => {
    if (!agendamento) return;

    const agendamentoId = agendamento.id;
    const result = await deleteAgendamento(agendamentoId);

    if (result.success) {
      setAgendamento(null);
      if (onRemoveAgendamento) {
        onRemoveAgendamento(agendamentoId);
      }
    }
  };

  const handleCompleteAgendamento = async () => {
    if (!agendamento || !agendamento.data || !agendamento.hora) return;

    const descricao = agendamento.descricao || 'Ligação agendada realizada';
    const agendamentoId = agendamento.id;
    const shouldMoveToInativo = moverParaInativo;
    const obsAgendamento = observacaoAgendamento;

    setShowCompleteAgendamentoModal(false);
    setObservacaoAgendamento('');
    setMoverParaInativo(false);
    setCompletingAgendamento(true);

    try {
      const result = await createLigacao({
        cliente_id: cliente.id,
        data: new Date().toISOString(),
        descricao: descricao,
        status: 'positivo',
        user_id: undefined,
        tipo_origem: 'agendamento',
        agendamento_id: agendamentoId,
        observacao_agendamento: obsAgendamento || undefined
      });

      if (result.success) {
        const deleteResult = await deleteAgendamento(agendamentoId);

        if (deleteResult.success) {
          setAgendamento(null);
          if (onRemoveAgendamento) {
            onRemoveAgendamento(agendamentoId);
          }

          if (shouldMoveToInativo) {
            await onStatusChange(cliente.id, 'inativo');
          } else if (cliente.status === 'depositou') {
            await onStatusChange(cliente.id, 'acompanhamento');
          }

          await loadClientData(false);
        }
      }
    } finally {
      setCompletingAgendamento(false);
    }
  };

  const handlePostback = async () => {
    if (!cliente.lead?.click_id || sendingPostback || cliente.postback_enviado) return;

    setSendingPostback(true);
    try {
      const clickId = cliente.lead.click_id;
      const payout = cliente.valor_produto || '';
      const postbackUrl = `https://lp.stratefinance.com.br/postback?ce=Comprapayt&clickId=${encodeURIComponent(clickId)}${payout ? `&payout=${encodeURIComponent(payout)}` : ''}`;

      await fetch(postbackUrl, {
        method: 'GET',
        mode: 'no-cors'
      });

      await onUpdate(cliente.id, {
        postback_enviado: true,
        postback_enviado_em: new Date().toISOString()
      });

      alert('Postback enviado com sucesso!');
    } catch (error) {
      console.error('Erro ao enviar postback:', error);
      alert('Erro ao enviar postback. Tente novamente.');
    } finally {
      setSendingPostback(false);
    }
  };

  const handleGclidSend = async () => {
    if (sendingGclid || cliente.gclid_enviado) return;

    setSendingGclid(true);
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

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Erro ao enviar conversão GCLID');
      }

      await onUpdate(cliente.id, {
        gclid_enviado: true,
        gclid_enviado_em: new Date().toISOString()
      });

      alert('Conversão GCLID enviada com sucesso para o Google Sheets!');
    } catch (error) {
      console.error('Erro ao enviar conversão GCLID:', error);
      alert(error instanceof Error ? error.message : 'Erro ao enviar conversão GCLID. Tente novamente.');
    } finally {
      setSendingGclid(false);
    }
  };

  return (
    <>
      <div className={`fixed inset-0 bg-black bg-opacity-50 flex justify-center z-50 ${isMobile ? '' : 'items-center p-4'}`}>
        <div
          className={
            isMobile
              ? 'bg-white w-full h-[100dvh] flex flex-col relative'
              : 'bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto relative p-6'
          }
        >
          {(loadingData || completingAgendamento) && (
            <LoadingOverlay message={completingAgendamento ? 'Finalizando agendamento...' : 'Carregando dados...'} />
          )}
          {/* Cabeçalho — no mobile fica fixo no topo, fora da área que rola. */}
          <div
            className={
              isMobile
                ? 'flex justify-between items-start gap-2 px-4 pb-3 border-b border-slate-200 flex-shrink-0'
                : 'flex justify-between items-start mb-6'
            }
            style={isMobile ? { paddingTop: 'calc(0.75rem + env(safe-area-inset-top))' } : undefined}
          >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-xl md:text-2xl font-bold truncate">{capitalizeName(cliente.nome)}</h2>
                  <button
                    onClick={async () => {
                      setTogglingVisibility(true);
                      try {
                        await onUpdate(cliente.id, { oculto: !cliente.oculto });
                      } finally {
                        setTogglingVisibility(false);
                      }
                    }}
                    disabled={togglingVisibility}
                    title={cliente.oculto ? 'Desocultar lead' : 'Ocultar lead'}
                    className="text-gray-400 hover:text-gray-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {togglingVisibility
                      ? <LoadingSpinner size="sm" />
                      : cliente.oculto ? <Eye size={18} /> : <EyeOff size={18} />
                    }
                  </button>
                </div>
                <span className={`inline-block px-3 py-1 rounded text-sm mt-2 ${getStatusColor(cliente.status)}`}>
                  {getDisplayName(cliente.status)}
                </span>
              </div>
              <button
                onClick={onClose}
                aria-label="Fechar"
                className="text-gray-500 hover:text-gray-700 flex-shrink-0 flex items-center justify-center w-11 h-11 -mr-2 md:w-auto md:h-auto md:mr-0"
              >
                <X size={24} />
              </button>
            </div>

          {/* Corpo — no mobile é ele que rola, não a janela inteira. */}
          <div
            className={isMobile ? 'flex-1 min-h-0 overflow-y-auto px-4 pt-4' : ''}
            style={isMobile ? { paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' } : undefined}
          >

            {editMode ? (
              <div className="space-y-4 mb-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Nome</label>
                    <input
                      type="text"
                      value={editData.nome}
                      onChange={(e) => setEditData({ ...editData, nome: e.target.value })}
                      className="w-full border rounded px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Email</label>
                    <input
                      type="email"
                      value={editData.email}
                      onChange={(e) => setEditData({ ...editData, email: e.target.value })}
                      className="w-full border rounded px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Telefone</label>
                    <input
                      type="text"
                      value={editData.telefone}
                      onChange={(e) => setEditData({ ...editData, telefone: e.target.value })}
                      className="w-full border rounded px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Assessor</label>
                    <select
                      value={selectedAssessorId}
                      onChange={(e) => setSelectedAssessorId(e.target.value)}
                      className="w-full border rounded px-3 py-2"
                    >
                      <option value="">Sem assessor</option>
                      {assessores.map(a => (
                        <option key={a.id} value={a.id}>
                          {a.nome}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Valor Fundos</label>
                    <input
                      type="number"
                      value={profile?.is_master ? (editData.valor_deposito || '') : nonMasterDeposito}
                      onChange={(e) => {
                        if (profile?.is_master) {
                          setEditData({ ...editData, valor_deposito: parseFloat(e.target.value) || 0 });
                        } else {
                          setNonMasterDeposito(e.target.value);
                        }
                      }}
                      className="w-full border rounded px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Categoria de investimento</label>
                    <select
                      value={editData.categoria_investimento || ''}
                      onChange={(e) => setEditData({ ...editData, categoria_investimento: e.target.value })}
                      className="w-full border rounded px-3 py-2"
                    >
                      <option value="">Selecione uma categoria</option>
                      {INVESTMENT_CATEGORIES.map(cat => (
                        <option key={cat.value} value={cat.value}>
                          {formatCategoryDisplay(cat.minValue)} | {cat.label}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-gray-500 mt-1">
                      Sincronizado automaticamente com valor depositado
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleSave}
                    disabled={savingData}
                    className="bg-green-600 text-white px-4 py-2 rounded flex items-center gap-2 disabled:bg-green-400 disabled:cursor-not-allowed transition-all"
                  >
                    {savingData ? (
                      <LoadingSpinner size="sm" color="white" />
                    ) : (
                      <Save size={16} />
                    )}
                    {savingData ? 'Salvando...' : 'Salvar'}
                  </button>
                  <button
                    onClick={() => {
                      setEditMode(false);
                      setEditData(cliente);
                    }}
                    disabled={savingData}
                    className="bg-gray-300 text-gray-700 px-4 py-2 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4 mb-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-600">Email</p>
                    <p className="font-semibold">{cliente.email || ''}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Telefone</p>
                    {cliente.telefone ? (
                      <WhatsAppChannelMenu
                        clienteId={cliente.id}
                        telefone={cliente.telefone}
                        onOpenQr={phone => onOpenWhatsApp?.(phone)}
                        onOpenWaba={chatId => onOpenWabaChat?.(chatId)}
                        className="font-semibold text-green-600 hover:text-green-700 hover:underline transition-colors inline-flex items-center gap-1"
                      >
                        📱 {cliente.telefone}
                      </WhatsAppChannelMenu>
                    ) : (
                      <p className="font-semibold"></p>
                    )}
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Data da Compra</p>
                    <p className="font-semibold">{formatarData(cliente.data_compra)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Assessor</p>
                    <p className="font-semibold">{cliente.assessor || ''}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Fundos</p>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-green-600">
                        {(cliente.valor_deposito ?? 0) >= 1
                          ? `$ ${profile?.is_master ? (cliente.valor_deposito ?? 0).toLocaleString('pt-BR') : '***'}`
                          : ''}
                      </p>
                      {profile?.is_master && (cliente.valor_deposito ?? 0) >= 1 && (
                        <button
                          onClick={() => setShowDepositoHistorico(true)}
                          className="p-1 text-slate-400 hover:text-slate-600 rounded transition-colors"
                          title="Ver histórico de depósitos"
                        >
                          <History size={15} />
                        </button>
                      )}
                    </div>
                    {profile?.is_master && cliente.profit_moneta != null && (() => {
                      const profit = cliente.profit_moneta ?? 0;
                      const isPos = profit >= 0;
                      const pct = calcularRetornoPercentual(cliente.valor_deposito, cliente.profit_moneta);
                      return (
                        <span
                          title={cliente.profit_updated_at ? `Atualizado em ${new Date(cliente.profit_updated_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}` : undefined}
                          className={`mt-1 inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold border ${isPos ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}
                        >
                          <span>Profit: {isPos ? '+' : ''}$ {profit.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                          {profit !== 0 && <span className="opacity-75">({isPos ? '+' : ''}{pct.toFixed(2)}%)</span>}
                        </span>
                      );
                    })()}
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Categoria de investimento</p>
                    <p className="font-semibold">{categoriaDisplay || ''}</p>
                  </div>
                </div>

                {/* Link Perfil Moneta */}
                {profile?.is_master && cliente.moneta_id && (
                  <div className="mt-3">
                    <a
                      href={`https://pamm9.monetamarkets.com/app/investments/${cliente.moneta_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 border border-blue-200 text-blue-700 text-xs font-medium rounded-md hover:bg-blue-100 transition-colors"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                      Perfil
                    </a>
                  </div>
                )}
                <div className="flex gap-2 items-center">
                  <button
                    onClick={() => setEditMode(true)}
                    className="bg-blue-600 text-white px-4 py-2 rounded flex items-center gap-2 hover:bg-blue-700 transition-colors"
                  >
                    <Edit2 size={16} />
                    Editar Informações
                  </button>
                  {cliente.lead && (
                    <button
                      onClick={() => setShowLeadDetailsModal(true)}
                      className="border-2 border-blue-500 text-blue-600 px-3 py-2 rounded flex items-center gap-2 hover:bg-blue-50 transition-colors"
                      title="Mostrar detalhes do lead"
                    >
                      <Info size={16} />
                      <span className="text-sm">Detalhes</span>
                    </button>
                  )}
                  {/* Clientes sem lead vinculado não têm o card de conversão no modal de
                      detalhes; expõe o envio (Enhanced Conversions) aqui fora. */}
                  {temCompra && !cliente.lead && (
                    <button
                      onClick={handleGclidSend}
                      disabled={sendingGclid || cliente.gclid_enviado}
                      className={`px-3 py-2 rounded flex items-center gap-2 text-sm transition-colors ${
                        cliente.gclid_enviado
                          ? 'bg-gray-100 border-2 border-gray-300 text-gray-500 cursor-not-allowed'
                          : 'border-2 border-yellow-500 text-yellow-700 hover:bg-yellow-50 disabled:opacity-50 disabled:cursor-wait'
                      }`}
                      title={cliente.gclid_enviado ? 'Conversão já enviada' : 'Enviar conversão ao Google Ads (Enhanced Conversions)'}
                    >
                      {cliente.gclid_enviado ? <CheckCircle size={16} /> : <Send size={16} />}
                      <span>
                        {cliente.gclid_enviado
                          ? 'Conversão enviada'
                          : sendingGclid
                          ? 'Enviando...'
                          : 'Enviar Conversão'}
                      </span>
                    </button>
                  )}
                </div>
              </div>
            )}

            <div className="mb-6">
              <p className="text-sm font-medium mb-2">Mover para:</p>
              <div className="flex gap-2 flex-wrap">
                {columns
                  .filter(col => col.status_key !== cliente.status)
                  .map(col => (
                    <button
                      key={col.status_key}
                      onClick={() => onStatusChange(cliente.id, col.status_key)}
                      className={`px-3 py-1 min-h-[44px] md:min-h-0 rounded text-sm ${getStatusColor(col.status_key)} hover:opacity-80 transition-opacity`}
                    >
                      {col.display_name}
                    </button>
                  ))}
              </div>
            </div>

            <div className="mb-6 p-4 bg-blue-50 rounded-lg">
              <div className="flex justify-between items-center mb-3">
                <h3 className="font-bold flex items-center gap-2">
                  📅 Agendamento de Contato
                </h3>
                {agendamento && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowCompleteAgendamentoModal(true)}
                      className="text-xs bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700 flex items-center gap-1"
                    >
                      <CheckCircle size={14} />
                      Concluir
                    </button>
                    <button
                      onClick={handleDeleteAgendamento}
                      className="text-xs text-red-600 hover:text-red-800"
                    >
                      Remover
                    </button>
                  </div>
                )}
              </div>
              {agendamento && agendamento.data && agendamento.hora ? (
                <div className="bg-white p-3 rounded border">
                  <p className="text-sm font-semibold text-blue-600">
                    {formatarData(agendamento.data)} às {agendamento.hora}
                  </p>
                  {agendamento.descricao && (
                    <p className="text-xs text-gray-600 mt-1">{agendamento.descricao}</p>
                  )}
                  <button
                    onClick={() => setShowAgendamentoModal(true)}
                    className="mt-2 text-xs text-blue-600 hover:text-blue-800"
                  >
                    Reagendar
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowAgendamentoModal(true)}
                  className="w-full bg-blue-600 text-white px-4 py-2 rounded"
                >
                  Agendar Contato
                </button>
              )}
            </div>

            <div className="mb-6">
              <h3 className="font-bold mb-3 flex items-center gap-2">
                <Phone size={20} />
                Registro de interações
              </h3>
              {ligacoes.length > 0 ? (() => {
                const sorted = [...ligacoes].sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());
                const page = Math.min(ligacaoPage, sorted.length - 1);
                const lig = sorted[page];
                const isFromAgendamento = lig.tipo_origem === 'agendamento';
                return (
                  <div>
                    <div className={`p-3 rounded border ${
                      isFromAgendamento
                        ? 'bg-gradient-to-r from-blue-50 to-green-50 border-blue-300 border-l-4'
                        : lig.status === 'positivo'
                        ? 'bg-green-50 border-green-200'
                        : lig.status === 'atencao'
                        ? 'bg-yellow-50 border-yellow-200'
                        : 'bg-red-50 border-red-200'
                    }`}>
                      <div className="flex items-start gap-2">
                        {isFromAgendamento && (
                          <div className="flex-shrink-0 mt-0.5">
                            <Calendar size={16} className="text-blue-600" />
                          </div>
                        )}
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold">{formatarDataHora(lig.data)}</p>
                            {isFromAgendamento && (
                              <span className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded">
                                Agendamento concluído
                              </span>
                            )}
                          </div>
                          <p className="text-sm mt-1 whitespace-pre-wrap">{lig.descricao}</p>
                          {isFromAgendamento && lig.observacao_agendamento && (
                            <div className="mt-2 pl-3 border-l-2 border-blue-300">
                              <p className="text-xs text-gray-600 font-semibold">Observação:</p>
                              <p className="text-xs text-gray-700">{lig.observacao_agendamento}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Navegação */}
                    {sorted.length > 1 && (
                      <div className="flex items-center justify-between mt-2">
                        <button
                          onClick={() => setLigacaoPage(p => Math.max(0, p - 1))}
                          disabled={page === 0}
                          className="flex items-center gap-1 px-2.5 py-1 text-xs text-slate-600 border border-slate-200 rounded hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                          <ChevronLeft size={13} /> Mais recente
                        </button>
                        <span className="text-xs text-slate-400">
                          {page + 1} / {sorted.length}
                        </span>
                        <button
                          onClick={() => setLigacaoPage(p => Math.min(sorted.length - 1, p + 1))}
                          disabled={page === sorted.length - 1}
                          className="flex items-center gap-1 px-2.5 py-1 text-xs text-slate-600 border border-slate-200 rounded hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                          Mais antigo <ChevronRight size={13} />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })() : (
                <p className="text-gray-500 text-sm">Nenhuma interação registrada</p>
              )}
            </div>

            <WabaClientHistory clienteId={cliente.id} />

            <div className="border-t pt-4">
              <h3 className="font-bold mb-3">Novo registro</h3>
              <div className="space-y-3">
                <textarea
                  value={novaLigacao.descricao}
                  onChange={(e) => setNovaLigacao({ ...novaLigacao, descricao: e.target.value })}
                  placeholder="Descreva o que foi conversado..."
                  className="w-full border rounded px-3 py-2 h-24"
                />
                <div className="flex gap-2">
                  <select
                    value={novaLigacao.status}
                    onChange={(e) => setNovaLigacao({ ...novaLigacao, status: e.target.value as any })}
                    disabled={addingLigacao}
                    className="border rounded px-3 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <option value="positivo">Positivo</option>
                    <option value="atencao">Atenção</option>
                    <option value="problema">Problema</option>
                  </select>
                  <button
                    onClick={handleAddLigacao}
                    disabled={addingLigacao || !novaLigacao.descricao.trim()}
                    className="bg-blue-600 text-white px-4 py-2 rounded flex items-center gap-2 disabled:bg-blue-400 disabled:cursor-not-allowed transition-all hover:bg-blue-700"
                  >
                    {addingLigacao ? (
                      <LoadingSpinner size="sm" color="white" />
                    ) : (
                      <Plus size={16} />
                    )}
                    {addingLigacao ? 'Adicionando...' : 'Adicionar interação'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showAgendamentoModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[60]">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <div className="flex justify-between items-start mb-4">
              <h2 className="text-xl font-bold">Agendar Contato</h2>
              <button
                onClick={() => setShowAgendamentoModal(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <X size={24} />
              </button>
            </div>

            <div className="mb-4">
              <p className="text-sm text-gray-600 mb-2">
                Cliente: <span className="font-semibold">{capitalizeName(cliente.nome)}</span>
              </p>
            </div>

            <div className="space-y-4">
              <DateTimePicker
                date={novoAgendamento.data}
                time={novoAgendamento.hora || '09:00'}
                onDateChange={(data) => setNovoAgendamento({ ...novoAgendamento, data })}
                onTimeChange={(hora) => setNovoAgendamento({ ...novoAgendamento, hora })}
                minDate={new Date().toISOString().split('T')[0]}
              />

              <div className="flex gap-2 mt-6">
                <button
                  onClick={handleCreateAgendamento}
                  disabled={!novoAgendamento.data || !novoAgendamento.hora || creatingAgendamento}
                  className="flex-1 bg-blue-600 text-white px-4 py-2 rounded disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all"
                >
                  {creatingAgendamento ? (
                    <>
                      <LoadingSpinner size="sm" color="white" />
                      Agendando...
                    </>
                  ) : (
                    'Confirmar Agendamento'
                  )}
                </button>
                <button
                  onClick={() => setShowAgendamentoModal(false)}
                  disabled={creatingAgendamento}
                  className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showCompleteAgendamentoModal && agendamento && agendamento.data && agendamento.hora && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[60]">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <div className="flex justify-between items-start mb-4">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <CheckCircle className="text-green-600" size={24} />
                Concluir Agendamento
              </h2>
              <button
                onClick={() => {
                  setShowCompleteAgendamentoModal(false);
                  setObservacaoAgendamento('');
                  setMoverParaInativo(false);
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                <X size={24} />
              </button>
            </div>

            <div className="mb-4 p-3 bg-blue-50 rounded border border-blue-200">
              <p className="text-sm text-gray-600 mb-1">Cliente:</p>
              <p className="font-semibold">{capitalizeName(cliente.nome)}</p>
              <p className="text-sm text-gray-600 mt-2 mb-1">Agendamento:</p>
              <p className="font-semibold text-blue-600">
                {formatarData(agendamento.data)} às {agendamento.hora}
              </p>
              {agendamento.descricao && (
                <>
                  <p className="text-sm text-gray-600 mt-2 mb-1">Descrição:</p>
                  <p className="text-sm">{agendamento.descricao}</p>
                </>
              )}
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Observações adicionais (opcional)
                </label>
                <textarea
                  value={observacaoAgendamento}
                  onChange={(e) => setObservacaoAgendamento(e.target.value)}
                  placeholder="Adicione observações sobre esta ligação..."
                  className="w-full border rounded px-3 py-2 h-24 resize-none"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Esta interação será registrada no histórico do cliente
                </p>
              </div>

              <label
                className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                  moverParaInativo
                    ? 'bg-orange-100 border-orange-400'
                    : 'bg-gray-50 border-gray-200 hover:border-gray-300'
                }`}
              >
                <input
                  type="checkbox"
                  checked={moverParaInativo}
                  onChange={(e) => setMoverParaInativo(e.target.checked)}
                  className="w-5 h-5 rounded border-gray-300 text-orange-600 focus:ring-orange-500"
                />
                <div>
                  <p className="font-medium text-gray-800">Mover para Inativo</p>
                  <p className="text-xs text-gray-500">O lead será movido para a coluna "Inativo" do kanban</p>
                </div>
              </label>

              <div className="flex gap-2 mt-6">
                <button
                  onClick={handleCompleteAgendamento}
                  className="flex-1 bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 flex items-center justify-center gap-2"
                >
                  <CheckCircle size={16} />
                  Confirmar Conclusão
                </button>
                <button
                  onClick={() => {
                    setShowCompleteAgendamentoModal(false);
                    setObservacaoAgendamento('');
                    setMoverParaInativo(false);
                  }}
                  className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showLeadDetailsModal && cliente.lead && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[60]">
          <div className="bg-white rounded-lg max-w-2xl w-full p-6 shadow-xl">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                  <Info className="text-blue-600" size={28} />
                  Detalhes do Lead
                </h2>
                <p className="text-sm text-gray-500 mt-1">Informações de origem e rastreamento</p>
              </div>
              <button
                onClick={() => setShowLeadDetailsModal(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            <div className="space-y-4">
              {cliente.lead.campanha && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-1">Campanha</p>
                  <p className="text-lg font-semibold text-gray-800">{cliente.lead.campanha}</p>
                </div>
              )}

              {cliente.lead.url_acesso && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">URL de Acesso</p>
                  <a
                    href={cliente.lead.url_acesso}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-800 break-all text-sm underline"
                  >
                    {cliente.lead.url_acesso}
                  </a>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                {cliente.lead.click_id && (
                  <div
                    onClick={cliente.postback_enviado ? undefined : handlePostback}
                    className={`rounded-lg p-4 transition-all ${
                      cliente.postback_enviado
                        ? 'bg-gray-100 border border-gray-300 cursor-not-allowed'
                        : `bg-green-50 border border-green-200 cursor-pointer hover:bg-green-100 hover:border-green-300 hover:shadow-md ${sendingPostback ? 'opacity-50 cursor-wait' : ''}`
                    }`}
                    title={cliente.postback_enviado ? 'Postback já enviado' : 'Clique para enviar postback'}
                  >
                    <p className={`text-xs font-semibold uppercase tracking-wide mb-1 ${
                      cliente.postback_enviado ? 'text-gray-600' : 'text-green-700'
                    }`}>
                      Click ID {sendingPostback && '(enviando...)'} {cliente.postback_enviado && '✓ ENVIADO'}
                    </p>
                    <p className="text-sm font-mono text-gray-800 break-all">{cliente.lead.click_id}</p>
                    {cliente.postback_enviado && cliente.postback_enviado_em && (
                      <p className="text-xs text-gray-500 mt-2">
                        Enviado em {new Date(cliente.postback_enviado_em).toLocaleString('pt-BR')}
                      </p>
                    )}
                  </div>
                )}

                {temCompra && (
                  <div
                    onClick={cliente.gclid_enviado ? undefined : handleGclidSend}
                    className={`rounded-lg p-4 transition-all ${
                      cliente.gclid_enviado
                        ? 'bg-gray-100 border border-gray-300 cursor-not-allowed'
                        : `bg-yellow-50 border border-yellow-200 cursor-pointer hover:bg-yellow-100 hover:border-yellow-300 hover:shadow-md ${sendingGclid ? 'opacity-50 cursor-wait' : ''}`
                    }`}
                    title={cliente.gclid_enviado ? 'Conversão já enviada' : 'Clique para enviar conversão ao Google Ads'}
                  >
                    <p className={`text-xs font-semibold uppercase tracking-wide mb-1 ${
                      cliente.gclid_enviado ? 'text-gray-600' : 'text-yellow-700'
                    }`}>
                      Conversão {sendingGclid && '(enviando...)'} {cliente.gclid_enviado && '✓ ENVIADO'}
                    </p>
                    <p className="text-sm font-mono text-gray-800 break-all">
                      {cliente.lead?.gclid || 'Sem GCLID (Enhanced Conversions)'}
                    </p>
                    {cliente.gclid_enviado && cliente.gclid_enviado_em && (
                      <p className="text-xs text-gray-500 mt-2">
                        Enviado em {new Date(cliente.gclid_enviado_em).toLocaleString('pt-BR')}
                      </p>
                    )}
                  </div>
                )}

                {cliente.lead.ip && (
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                    <p className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">IP</p>
                    <p className="text-sm font-mono text-gray-800">{cliente.lead.ip}</p>
                  </div>
                )}
              </div>

              {!cliente.lead.campanha && !cliente.lead.url_acesso && !cliente.lead.click_id && !cliente.lead.gclid && !cliente.lead.ip && (
                <div className="text-center py-8">
                  <p className="text-gray-500">Nenhum detalhe disponível para este lead</p>
                </div>
              )}
            </div>

            <div className="mt-6 pt-4 border-t flex justify-end">
              <button
                onClick={() => setShowLeadDetailsModal(false)}
                className="bg-gray-600 hover:bg-gray-700 text-white px-6 py-2 rounded-lg transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {showDepositoHistorico && (
        <DepositoHistoricoModal
          clienteId={cliente.id}
          clienteNome={cliente.nome}
          onClose={() => setShowDepositoHistorico(false)}
        />
      )}
    </>
  );
};
