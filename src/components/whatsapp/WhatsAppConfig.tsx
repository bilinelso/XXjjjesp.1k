import { useState, useEffect } from 'react';
import { Loader2, Trash2, Plus } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface WhatsAppConfigProps {
  onConfigSaved: () => void;
  instanceName?: string;
  onHistoryCleared?: () => void;
}

interface QuickReply {
  id: string;
  title: string;
  message: string;
}

export function WhatsAppConfig({ onConfigSaved, instanceName, onHistoryCleared }: WhatsAppConfigProps) {
  const [clearing, setClearing] = useState(false);

  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);
  const [loadingReplies, setLoadingReplies] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [formTitle, setFormTitle] = useState('');
  const [formMessage, setFormMessage] = useState('');
  const [savingReply, setSavingReply] = useState(false);

  useEffect(() => {
    supabase
      .from('quick_replies')
      .select('id, title, message')
      .order('title')
      .then(({ data }) => {
        if (data) setQuickReplies(data);
        setLoadingReplies(false);
      });
  }, []);

  const handleSaveReply = async () => {
    if (!formTitle.trim() || !formMessage.trim()) return;
    setSavingReply(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data, error } = await supabase
        .from('quick_replies')
        .insert({ user_id: user.id, title: formTitle.trim(), message: formMessage.trim() })
        .select('id, title, message')
        .single();
      if (error) throw error;
      if (data) {
        setQuickReplies(prev => [...prev, data].sort((a, b) => a.title.localeCompare(b.title)));
        setShowAddForm(false);
        setFormTitle('');
        setFormMessage('');
      }
    } catch (err) {
      console.error('Error saving quick reply:', err);
    } finally {
      setSavingReply(false);
    }
  };

  const handleDeleteReply = async (id: string) => {
    setQuickReplies(prev => prev.filter(r => r.id !== id));
    await supabase.from('quick_replies').delete().eq('id', id);
  };

  const handleClearHistory = async () => {
    const confirmed = confirm(
      'Tem certeza? Isso irá apagar TODAS as conversas, mensagens e contatos do WhatsApp. Esta ação não pode ser desfeita.'
    );
    if (!confirmed) return;

    const doubleConfirmed = confirm('Confirmar novamente: apagar TODO o histórico do WhatsApp?');
    if (!doubleConfirmed) return;

    setClearing(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      const { error: msgsError } = await supabase
        .from('persistent_messages')
        .delete()
        .eq('user_id', user.id);
      if (msgsError) throw msgsError;

      const { error: chatsError } = await supabase
        .from('persistent_chats')
        .delete()
        .eq('user_id', user.id);
      if (chatsError) throw chatsError;

      alert('Histórico limpo com sucesso.');
      onHistoryCleared?.();
      window.location.reload();
    } catch (err: unknown) {
      alert('Erro ao limpar histórico.');
    } finally {
      setClearing(false);
    }
  };

/*   const handleSyncGroups = async () => {
    if (!instanceName) {
      setStatus({ type: 'error', message: 'Nenhuma instancia conectada' });
      return;
    }

    setSyncing(true);
    setStatus(null);

    try {
      const result = await evolutionApi.syncAllGroupNames(instanceName);
      setStatus({
        type: 'success',
        message: `Grupos sincronizados: ${result.success} atualizados, ${result.failed} com erro`
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro ao sincronizar grupos';
      setStatus({ type: 'error', message });
    } finally {
      setSyncing(false);
    }
  };*/

  return (
    <div className="max-w-2xl mx-auto">

      {/* Respostas Rápidas */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-4">
        <div className="px-6 py-5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Respostas Rápidas</h3>
            <p className="text-sm text-slate-500 mt-1">Digite / no chat para acessar rapidamente</p>
          </div>
          {!showAddForm && (
            <button
              onClick={() => { setShowAddForm(true); setFormTitle(''); setFormMessage(''); }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
            >
              <Plus size={15} />
              Nova resposta
            </button>
          )}
        </div>
        <div className="p-4">
          {showAddForm && (
            <div className="mb-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Nome</label>
                  <input
                    type="text"
                    value={formTitle}
                    onChange={e => setFormTitle(e.target.value)}
                    placeholder="Ex: Saudação"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Mensagem <span className="text-slate-400 font-normal">(use {'{nome_contato}'}, {'{primeiro_nome}'} ou {'{assessor}'})</span>
                  </label>
                  <textarea
                    value={formMessage}
                    onChange={e => setFormMessage(e.target.value)}
                    placeholder="Olá {nome_contato}, tudo bem?"
                    rows={3}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleSaveReply}
                    disabled={savingReply || !formTitle.trim() || !formMessage.trim()}
                    className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    {savingReply && <Loader2 size={14} className="animate-spin" />}
                    Salvar
                  </button>
                  <button
                    onClick={() => setShowAddForm(false)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium transition-colors"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            </div>
          )}
          {loadingReplies ? (
            <div className="flex justify-center py-4">
              <Loader2 className="animate-spin text-slate-400" size={20} />
            </div>
          ) : quickReplies.length === 0 && !showAddForm ? (
            <p className="text-sm text-slate-400 text-center py-4">Nenhuma resposta cadastrada</p>
          ) : (
            <div className="space-y-2">
              {quickReplies.map(reply => (
                <div key={reply.id} className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 bg-white">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800">{reply.title}</p>
                    <p className="text-xs text-slate-500 truncate mt-0.5">{reply.message}</p>
                  </div>
                  <button
                    onClick={() => handleDeleteReply(reply.id)}
                    className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0"
                    title="Deletar"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

       
      {instanceName && (
        <div className="bg-white rounded-xl border border-red-200 shadow-sm overflow-hidden mt-4">
          <div className="px-6 py-5 border-b border-red-100 bg-red-50">
            <h3 className="text-lg font-semibold text-red-900">Zona de Perigo</h3>
            <p className="text-sm text-red-600 mt-1">Ações irreversíveis</p>
          </div>
          <div className="p-6">
            <p className="text-sm text-slate-600 mb-4">
              Apaga todas as conversas, mensagens e contatos armazenados localmente. Não afeta o WhatsApp em si, apenas o histórico salvo no CRM.
            </p>
            <button
              type="button"
              onClick={handleClearHistory}
              disabled={clearing}
              className="w-full bg-red-600 hover:bg-red-700 text-white px-4 py-2.5 rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50 font-medium"
            >
              {clearing ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Limpando histórico...
                </>
              ) : (
                <>
                  <Trash2 size={18} />
                  Limpar Histórico do WhatsApp
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {!instanceName && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden p-6">
          <p className="text-sm text-slate-500 text-center">
            Conecte uma instancia do WhatsApp para acessar as configuracoes.
          </p>
          <button
            type="button"
            onClick={onConfigSaved}
            className="w-full mt-4 bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2.5 rounded-lg transition-colors font-medium"
          >
            Fechar
          </button>
        </div>
      )}
    </div>
  );
}
