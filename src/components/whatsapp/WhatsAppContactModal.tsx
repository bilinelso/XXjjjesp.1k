import { useState, useEffect } from 'react';
import { X, User, Phone, Mail, Calendar, Loader2, Plus, ExternalLink, Building2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { formatPhoneFromJid, normalizePhoneForMatching } from '../../lib/phoneUtils';
import { capitalizeName } from '../../utils/formatters';
import type { Cliente } from '../../lib/api';

interface WhatsAppContactModalProps {
  jid: string;
  displayName: string;
  onClose: () => void;
  onViewClient?: (cliente: Cliente) => void;
}

interface FoundContact {
  type: 'cliente' | 'lead';
  id: string;
  nome: string;
  telefone: string;
  email?: string;
  status?: string;
  data_compra?: string;
  assessor?: string;
  created_at?: string;
}

export function WhatsAppContactModal({ jid, displayName, onClose, onViewClient }: WhatsAppContactModalProps) {
  const [loading, setLoading] = useState(true);
  const [foundContact, setFoundContact] = useState<FoundContact | null>(null);
  const [creating, setCreating] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newLead, setNewLead] = useState({
    nome: displayName || '',
    email: '',
    assessor: ''
  });

  const phoneNumber = formatPhoneFromJid(jid);

  useEffect(() => {
    searchContact();
  }, [jid]);

  const searchContact = async () => {
    setLoading(true);
    try {
      const normalized = normalizePhoneForMatching(phoneNumber);

      const { data: clientes } = await supabase
        .from('clientes')
        .select('id, nome, telefone, email, status, data_compra, assessor, created_at')
        .not('telefone', 'is', null);

      if (clientes) {
        for (const cliente of clientes) {
          const clienteNormalized = normalizePhoneForMatching(cliente.telefone || '');
          if (clienteNormalized.length >= 8 && normalized.length >= 8) {
            if (normalized.endsWith(clienteNormalized) || clienteNormalized.endsWith(normalized)) {
              setFoundContact({
                type: 'cliente',
                id: cliente.id,
                nome: cliente.nome,
                telefone: cliente.telefone,
                email: cliente.email,
                status: cliente.status,
                data_compra: cliente.data_compra,
                assessor: cliente.assessor,
                created_at: cliente.created_at
              });
              setLoading(false);
              return;
            }
          }
        }
      }

      const { data: leads } = await supabase
        .from('leads')
        .select('id, nome, telefone, created_at')
        .not('telefone', 'is', null);

      if (leads) {
        for (const lead of leads) {
          const leadNormalized = normalizePhoneForMatching(lead.telefone || '');
          if (leadNormalized.length >= 8 && normalized.length >= 8) {
            if (normalized.endsWith(leadNormalized) || leadNormalized.endsWith(normalized)) {
              setFoundContact({
                type: 'lead',
                id: lead.id,
                nome: lead.nome,
                telefone: lead.telefone,
                created_at: lead.created_at
              });
              setLoading(false);
              return;
            }
          }
        }
      }

      setFoundContact(null);
    } catch (err) {
      console.error('Error searching contact:', err);
      setFoundContact(null);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateLead = async () => {
    if (!newLead.nome.trim()) return;

    setCreating(true);
    try {
      const { data, error } = await supabase
        .from('clientes')
        .insert({
          nome: newLead.nome.trim(),
          email: newLead.email.trim() || `${phoneNumber}@whatsapp.local`,
          telefone: phoneNumber,
          data_compra: new Date().toLocaleDateString('pt-BR', {
            timeZone: 'America/Sao_Paulo',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
          }).split('/').reverse().join('-'),
          valor_produto: 0,
          status: 'comprou',
          assessor: newLead.assessor.trim() || null,
          oculto: false,
          postback_enviado: false,
          gclid_enviado: false
        })
        .select()
        .single();

      if (error) throw error;

      setFoundContact({
        type: 'cliente',
        id: data.id,
        nome: data.nome,
        telefone: data.telefone,
        email: data.email,
        status: data.status,
        data_compra: data.data_compra,
        assessor: data.assessor,
        created_at: data.created_at
      });
      setShowCreateForm(false);
    } catch (err) {
      console.error('Error creating lead:', err);
      alert('Erro ao criar lead. Tente novamente.');
    } finally {
      setCreating(false);
    }
  };

  const getStatusLabel = (status?: string) => {
    const labels: Record<string, string> = {
      'comprou': 'Comprou',
      'conta-criada': 'Conta Criada',
      'depositou': 'Depositou',
      'acompanhamento': 'Acompanhamento',
      'problema': 'Problema',
      'finalizado': 'Finalizado',
      'inativo': 'Inativo'
    };
    return labels[status || ''] || status || 'Desconhecido';
  };

  const getStatusColor = (status?: string) => {
    const colors: Record<string, string> = {
      'comprou': 'bg-gray-100 text-gray-700',
      'conta-criada': 'bg-blue-100 text-blue-700',
      'depositou': 'bg-green-100 text-green-700',
      'acompanhamento': 'bg-purple-100 text-purple-700',
      'problema': 'bg-red-100 text-red-700',
      'finalizado': 'bg-slate-800 text-white',
      'inativo': 'bg-orange-100 text-orange-700'
    };
    return colors[status || ''] || 'bg-gray-100 text-gray-700';
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('pt-BR');
  };

  const handleViewFullProfile = async () => {
    if (!foundContact || foundContact.type !== 'cliente') return;

    const { data } = await supabase
      .from('clientes')
      .select('*, lead:lead_id(*)')
      .eq('id', foundContact.id)
      .single();

    if (data && onViewClient) {
      onViewClient(data as Cliente);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[60]">
      <div className="bg-white rounded-xl max-w-md w-full shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">Informacoes do Contato</h2>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-5">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 className="animate-spin text-blue-600" size={32} />
              <p className="text-sm text-slate-500">Buscando contato...</p>
            </div>
          ) : foundContact ? (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className={`w-14 h-14 rounded-full flex items-center justify-center ${
                  foundContact.type === 'cliente' ? 'bg-blue-100' : 'bg-slate-100'
                }`}>
                  <User size={24} className={foundContact.type === 'cliente' ? 'text-blue-600' : 'text-slate-500'} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-semibold text-slate-900 truncate">
                    {capitalizeName(foundContact.nome)}
                  </h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      foundContact.type === 'cliente' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {foundContact.type === 'cliente' ? 'Cliente' : 'Lead (Formulario)'}
                    </span>
                    {foundContact.status && (
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(foundContact.status)}`}>
                        {getStatusLabel(foundContact.status)}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <Phone size={16} className="text-slate-400 flex-shrink-0" />
                  <span className="text-sm text-slate-700">{foundContact.telefone}</span>
                </div>
                {foundContact.email && !foundContact.email.includes('@whatsapp.local') && (
                  <div className="flex items-center gap-3">
                    <Mail size={16} className="text-slate-400 flex-shrink-0" />
                    <span className="text-sm text-slate-700">{foundContact.email}</span>
                  </div>
                )}
                {foundContact.assessor && (
                  <div className="flex items-center gap-3">
                    <Building2 size={16} className="text-slate-400 flex-shrink-0" />
                    <span className="text-sm text-slate-700">{foundContact.assessor}</span>
                  </div>
                )}
                {foundContact.data_compra && (
                  <div className="flex items-center gap-3">
                    <Calendar size={16} className="text-slate-400 flex-shrink-0" />
                    <span className="text-sm text-slate-700">Compra: {formatDate(foundContact.data_compra)}</span>
                  </div>
                )}
              </div>

              {foundContact.type === 'cliente' && (
                <button
                  onClick={handleViewFullProfile}
                  className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg transition-colors font-medium"
                >
                  <ExternalLink size={16} />
                  Ver Perfil Completo
                </button>
              )}
            </div>
          ) : showCreateForm ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
                <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                  <Plus size={20} className="text-emerald-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900">Criar Novo Lead</h3>
                  <p className="text-xs text-slate-500">{phoneNumber}</p>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Nome *</label>
                  <input
                    type="text"
                    value={newLead.nome}
                    onChange={e => setNewLead({ ...newLead, nome: e.target.value })}
                    placeholder="Nome do contato"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={newLead.email}
                    onChange={e => setNewLead({ ...newLead, email: e.target.value })}
                    placeholder="email@exemplo.com"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Assessor</label>
                  <input
                    type="text"
                    value={newLead.assessor}
                    onChange={e => setNewLead({ ...newLead, assessor: e.target.value })}
                    placeholder="Nome do assessor"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleCreateLead}
                  disabled={creating || !newLead.nome.trim()}
                  className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white px-4 py-2.5 rounded-lg transition-colors font-medium disabled:cursor-not-allowed"
                >
                  {creating ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Criando...
                    </>
                  ) : (
                    <>
                      <Plus size={16} />
                      Criar Lead
                    </>
                  )}
                </button>
                <button
                  onClick={() => setShowCreateForm(false)}
                  disabled={creating}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors font-medium disabled:opacity-50"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-col items-center py-6 text-center">
                <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-4">
                  <User size={28} className="text-slate-400" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900 mb-1">{displayName || 'Contato'}</h3>
                <p className="text-sm text-slate-500 mb-2">{phoneNumber}</p>
                <p className="text-sm text-slate-400">
                  Este contato nao esta cadastrado no CRM
                </p>
              </div>

              <button
                onClick={() => setShowCreateForm(true)}
                className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-3 rounded-lg transition-colors font-medium"
              >
                <Plus size={18} />
                Criar Lead
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
