import { useState, useEffect, useCallback, useRef } from 'react';
import { Settings, LogOut, Loader2, MessageSquarePlus, RefreshCw, Trash2, Eye, X, Radio } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { evolutionApi } from '../../lib/evolutionApi';
import type { WhatsAppChat, EvolutionConnectionState, UserWhatsAppInstance } from '../../lib/evolutionApi';
import type { Cliente } from '../../lib/api';
import { formatJidFromPhone } from '../../lib/phoneUtils';
import { WhatsAppConfig } from './WhatsAppConfig';
import { WhatsAppQRCode } from './WhatsAppQRCode';
import { WhatsAppChatList } from './WhatsAppChatList';
import { WhatsAppMessageView } from './WhatsAppMessageView';
import { WhatsAppBroadcast } from './WhatsAppBroadcast';
import { ClientDetailModal } from '../ClientDetailModal';
import { useClientes } from '../../hooks/useClientes';
import { supabase } from '../../lib/supabase';

type WhatsAppStep = 'loading' | 'qrcode' | 'chat';

interface WhatsAppViewProps {
  targetPhone?: string | null;
  onTargetPhoneHandled?: () => void;
  onUnreadCountChange?: (count: number) => void;
}

export function WhatsAppView({ targetPhone, onTargetPhoneHandled, onUnreadCountChange }: WhatsAppViewProps) {
  const { profile } = useAuth();
  const [step, setStep] = useState<WhatsAppStep>('loading');
  const [instanceName, setInstanceName] = useState<string | null>(null);
  const [userInstance, setUserInstance] = useState<UserWhatsAppInstance | null>(null);
  const [connectionState, setConnectionState] = useState<EvolutionConnectionState['state']>('close');
  const [instances, setInstances] = useState<UserWhatsAppInstance[]>([]);
  const [activeInstance, setActiveInstance] = useState<string | null>(null);
  const [selectedChat, setSelectedChat] = useState<WhatsAppChat | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [showBroadcast, setShowBroadcast] = useState(false);
  const [showReconnectModal, setShowReconnectModal] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [reconnectLoading, setReconnectLoading] = useState(false);
  const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(null);
  const { updateCliente } = useClientes();

  // "Visualizar como" — apenas para masters
  const [viewingUserId, setViewingUserId] = useState<string | null>(null);
  const [viewingUserEmail, setViewingUserEmail] = useState<string | null>(null);
  const [usersList, setUsersList] = useState<{ id: string; email: string }[]>([]);
  const effectiveUserId = viewingUserId || profile?.id || null;
  const isViewingOther = !!viewingUserId;

  useEffect(() => {
    if (!profile?.is_master) return;
    const isMasterOriginal = profile.email === 'contato@stratefinance.com.br';
    supabase
      .from('user_profiles')
      .select('id, email, is_master')
      .order('email')
      .then(({ data }) => {
        if (data) {
          setUsersList(data.filter(u => {
            if (u.id === profile.id) return false;
            if (!isMasterOriginal && u.is_master) return false;
            return true;
          }));
        }
      });
  }, [profile?.is_master, profile?.id, profile?.email]);

  const handleViewAs = useCallback(async (targetUserId: string, targetEmail: string) => {
    setSelectedChat(null);
    setViewingUserId(targetUserId);
    setViewingUserEmail(targetEmail);

    const { data: targetInstance } = await supabase
      .from('whatsapp_instances')
      .select('*')
      .eq('user_id', targetUserId)
      .maybeSingle();

    if (targetInstance) {
      setUserInstance(targetInstance as UserWhatsAppInstance);
      setInstanceName(targetInstance.instance_name);
      setInstances([targetInstance as UserWhatsAppInstance]);
      setActiveInstance(targetInstance.instance_name);
      setConnectionState(targetInstance.is_connected ? 'open' : 'close');
      setStep('chat');
    } else {
      setUserInstance(null);
      setInstanceName(`view-only-${targetUserId}`);
      setInstances([]);
      setActiveInstance(`view-only-${targetUserId}`);
      setConnectionState('close');
      setStep('chat');
    }
  }, []);

  const handleStopViewingAs = useCallback(() => {
    setViewingUserId(null);
    setViewingUserEmail(null);
    setSelectedChat(null);
    setInstances([]);
    setActiveInstance(null);
    setStep('loading');
  }, []);

  const checkSetup = useCallback(async () => {
    try {
      const { data: allInstances } = await supabase
        .from('whatsapp_instances')
        .select('*')
        .eq('user_id', profile!.id)
        .eq('is_active', true);

      const inst = (allInstances || []) as UserWhatsAppInstance[];
      setInstances(inst);

      const ownInstance = inst.find(i => i.user_id === profile!.id) ?? null;

      if (ownInstance) {
        setUserInstance(ownInstance);
        setInstanceName(ownInstance.instance_name);
        setActiveInstance(ownInstance.instance_name);

        try {
          const stateResult = await evolutionApi.getConnectionState(ownInstance.instance_name);
          const rawState = stateResult as unknown as Record<string, unknown>;
          const state = rawState?.state as string | undefined;
          const instanceState = (rawState?.instance as Record<string, unknown>)?.state as string | undefined;
          const connState = rawState?.connectionState as string | undefined;
          const resolvedState = state || instanceState || connState || 'close';
          setConnectionState(resolvedState as EvolutionConnectionState['state']);

          if (resolvedState === 'open' && !ownInstance.is_connected) {
            await evolutionApi.updateInstanceStatus(true);
          }
        } catch {
          setConnectionState('close');
        }

        // Masters and users with existing instance always go to chat
        setStep('chat');
      } else if (profile?.is_master) {
        // Master without instance: show chat with offline placeholder
        const placeholder = `offline-${profile.id}`;
        setInstanceName(placeholder);
        setActiveInstance(placeholder);
        setConnectionState('close');
        setStep('chat');
      } else {
        // Regular user without instance: check for saved chats
        const { data: existingChats } = await supabase
          .from('persistent_chats')
          .select('id')
          .eq('user_id', profile!.id)
          .limit(1);

        if (existingChats && existingChats.length > 0) {
          // Has chat history: show in read-only mode
          const placeholder = `offline-${profile!.id}`;
          setInstanceName(placeholder);
          setActiveInstance(placeholder);
          setConnectionState('close');
          setStep('chat');
        } else {
          // First time ever: create instance and show QR code
          const newInstance = await evolutionApi.createUserInstance();
          setInstanceName(newInstance.instance_name);
          setActiveInstance(newInstance.instance_name);
          setStep('qrcode');
        }
      }
    } catch (err) {
      console.error('Setup check failed:', err);
      setStep('qrcode');
    }
  }, [profile?.is_master, profile?.id]);

  useEffect(() => {
    if (!viewingUserId) checkSetup();
  }, [checkSetup, viewingUserId]);

  const stepRef = useRef(step);
  useEffect(() => { stepRef.current = step; }, [step]);

  const handledPhoneRef = useRef<string | null>(null);

  useEffect(() => {
    if (!targetPhone || targetPhone === handledPhoneRef.current) return;

    if (step === 'loading') {
      // Ainda inicializando — não marca como handled, re-executa quando step mudar
      return;
    }

    handledPhoneRef.current = targetPhone;

    if (step === 'chat') {
      const cleaned = targetPhone.replace(/\D/g, '');
      const jid = formatJidFromPhone(cleaned);
      setSelectedChat({ id: jid, name: '' });
      onTargetPhoneHandled?.();
    } else if (step === 'qrcode') {
      alert('⚠️ Conecte seu WhatsApp primeiro para enviar mensagem');
      onTargetPhoneHandled?.();
    }
  }, [step, targetPhone, onTargetPhoneHandled]);

  useEffect(() => {
    if (!profile?.id) return;

    const channel = supabase
      .channel(`whatsapp_instance_${profile.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'whatsapp_instances',
          filter: `user_id=eq.${profile.id}`,
        },
        (payload) => {
          const updated = payload.new as UserWhatsAppInstance;
          setUserInstance(updated);

          if (updated.is_connected) {
            setConnectionState('open');
            if (stepRef.current !== 'chat') {
              setStep('chat');
            }
          } else {
            // Stay on chat in read-only mode, don't redirect to qrcode
            setConnectionState('close');
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.id]);

  const handleDisconnect = async () => {
    if (!instanceName) return;
    setDisconnecting(true);
    try {
      await evolutionApi.logoutInstance(instanceName);
      await evolutionApi.updateInstanceStatus(false);
      setConnectionState('close');
      setSelectedChat(null);
      // Stay on chat in read-only mode
    } catch (err) {
      console.error('Error disconnecting:', err);
    } finally {
      setDisconnecting(false);
    }
  };

  const handleDeleteInstance = async () => {
    if (!confirm('Tem certeza que deseja remover sua instancia do WhatsApp? Voce precisara escanear o QR Code novamente.')) {
      return;
    }

    setDeleting(true);
    try {
      await evolutionApi.deleteUserInstance();
      setUserInstance(null);
      setInstanceName(null);
      setConnectionState('close');
      setSelectedChat(null);
      checkSetup();
    } catch (err) {
      console.error('Error deleting instance:', err);
    } finally {
      setDeleting(false);
    }
  };

  const handleConnected = async () => {
    setConnectionState('open');
    await evolutionApi.updateInstanceStatus(true);
    setStep('chat');
    setShowConfig(false);
  };

  const handleReconnectModalConnected = async () => {
    setConnectionState('open');
    await evolutionApi.updateInstanceStatus(true);
    const updatedInstance = await evolutionApi.getUserInstance();
    if (updatedInstance) setUserInstance(updatedInstance);
    setShowReconnectModal(false);
  };

  const handleOpenReconnectModal = async () => {
    // If only an offline placeholder exists, create a real instance first
    if (instanceName?.startsWith('offline-')) {
      setReconnectLoading(true);
      try {
        const newInstance = await evolutionApi.createUserInstance();
        setInstanceName(newInstance.instance_name);
      } catch (err) {
        console.error('Error creating instance for reconnect:', err);
        setReconnectLoading(false);
        return;
      }
      setReconnectLoading(false);
    }
    setShowReconnectModal(true);
  };

  const handleViewClient = (cliente: Cliente) => {
    setSelectedCliente(cliente);
  };

  const handleUpdateCliente = async (id: string, updates: Partial<Cliente>) => {
    await updateCliente(id, updates);
    if (selectedCliente && selectedCliente.id === id) {
      setSelectedCliente(prev => prev ? { ...prev, ...updates } : null);
    }
  };

  const handleStatusChange = async (id: string, status: string) => {
    await updateCliente(id, { status: status as Cliente['status'] });
    if (selectedCliente && selectedCliente.id === id) {
      setSelectedCliente(prev => prev ? { ...prev, status: status as Cliente['status'] } : null);
    }
  };

  if (step === 'loading') {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-200px)]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="animate-spin text-blue-600" size={36} />
          <p className="text-sm text-slate-500">Verificando conexao WhatsApp...</p>
        </div>
      </div>
    );
  }

  if (step === 'qrcode' && instanceName) {
    return (
      <div className="flex flex-col items-center py-8">
        <WhatsAppQRCode
          instanceName={instanceName}
          onConnected={handleConnected}
          isAlreadyConnected={false}
          phoneNumber={userInstance?.phone_number}
        />
        <div className="flex items-center gap-4 mt-6">
          {profile?.is_master && (
            <button
              onClick={() => setShowConfig(true)}
              className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 transition-colors"
            >
              <Settings size={16} />
              Configuracao do Servidor
            </button>
          )}
          {userInstance && (
            <button
              onClick={handleDeleteInstance}
              disabled={deleting}
              className="flex items-center gap-2 text-sm text-red-500 hover:text-red-700 transition-colors"
            >
              {deleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
              Remover Instancia
            </button>
          )}
        </div>
      </div>
    );
  }

  if (!instanceName) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-200px)]">
        <Loader2 className="animate-spin text-blue-600" size={36} />
      </div>
    );
  }

  const isOffline = connectionState !== 'open';

  return (
    <div className="h-[calc(100vh-180px)] flex flex-col">
      <div className="flex items-center justify-between px-4 py-2 bg-white border-b border-slate-200 flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className={`w-2.5 h-2.5 rounded-full ${
            connectionState === 'open' ? 'bg-emerald-500' : 'bg-red-500'
          }`} />
          <span className="text-sm text-slate-600">
            {connectionState === 'open' ? 'Conectado' : 'Desconectado'}
          </span>
          {userInstance?.phone_number && (
            <span className="text-xs text-slate-400">({userInstance.phone_number})</span>
          )}
          {profile?.is_master && (
            isViewingOther ? (
              <div className="flex items-center gap-1.5 ml-2 px-2 py-1 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
                <Eye size={13} />
                <span className="font-medium truncate max-w-[160px]">{viewingUserEmail}</span>
                <button
                  onClick={handleStopViewingAs}
                  className="ml-1 hover:text-amber-900"
                  title="Voltar para minha conta"
                >
                  <X size={13} />
                </button>
              </div>
            ) : (
              <select
                className="ml-2 text-xs border border-slate-200 rounded-lg px-2 py-1 text-slate-600 bg-white cursor-pointer max-w-[180px]"
                value=""
                onChange={e => {
                  const selected = usersList.find(u => u.id === e.target.value);
                  if (selected) handleViewAs(selected.id, selected.email);
                }}
              >
                <option value="" disabled>👁 Visualizar como...</option>
                {usersList.map(u => (
                  <option key={u.id} value={u.id}>{u.email}</option>
                ))}
              </select>
            )
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSelectedChat(null)}
            className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            title="Atualizar conversas"
          >
            <RefreshCw size={16} />
          </button>
          {!isViewingOther && (
            <>
              {isOffline ? (
                <button
                  onClick={handleOpenReconnectModal}
                  disabled={reconnectLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-blue-600 hover:bg-blue-50 rounded-lg transition-colors border border-blue-200 disabled:opacity-50"
                  title="Reconectar WhatsApp"
                >
                  {reconnectLoading ? <Loader2 size={14} className="animate-spin" /> : <LogOut size={14} />}
                  Reconectar
                </button>
              ) : (
                <>
                  <button
                    onClick={() => setShowBroadcast(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors border border-emerald-200"
                    title="Disparo em massa"
                  >
                    <Radio size={14} />
                    Disparo
                  </button>
                  <button
                    onClick={() => setShowConfig(true)}
                    className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                    title="Configuracoes"
                  >
                    <Settings size={16} />
                  </button>
                  <button
                    onClick={handleDisconnect}
                    disabled={disconnecting}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-red-200"
                    title="Desconectar WhatsApp"
                  >
                    {disconnecting ? <Loader2 size={14} className="animate-spin" /> : <LogOut size={14} />}
                    Desconectar
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        <div className="w-80 flex-shrink-0 border-r border-slate-200 bg-white">
          <WhatsAppChatList
            instanceName={instanceName}
            selectedChatId={selectedChat?.id || null}
            onSelectChat={setSelectedChat}
            userId={effectiveUserId}
            onUnreadCountChange={onUnreadCountChange}
            instances={instances}
            activeInstance={activeInstance}
            setActiveInstance={setActiveInstance}
          />
        </div>

        <div className="flex-1 relative">
          {selectedChat ? (
            <WhatsAppMessageView
              instanceName={activeInstance || instanceName || ''}
              chat={selectedChat}
              onViewClient={isViewingOther ? undefined : handleViewClient}
              readOnly={isViewingOther || connectionState !== 'open'}
              userId={effectiveUserId}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full bg-slate-50 gap-4">
              <div className="w-24 h-24 bg-slate-100 rounded-full flex items-center justify-center">
                <MessageSquarePlus className="text-slate-300" size={44} />
              </div>
              <div className="text-center">
                <h3 className="text-lg font-semibold text-slate-700">
                  {isViewingOther ? 'WhatsApp de outro usuário' : 'Seu WhatsApp'}
                </h3>
                <p className="text-sm text-slate-400 mt-1">Selecione uma conversa para comecar</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {selectedCliente && (
        <ClientDetailModal
          cliente={selectedCliente}
          onClose={() => setSelectedCliente(null)}
          onUpdate={handleUpdateCliente}
          onStatusChange={handleStatusChange}
          onOpenWhatsApp={(phone) => {
            const cleaned = phone.replace(/\D/g, '');
            const jid = formatJidFromPhone(cleaned);
            setSelectedChat({ id: jid, name: '' });
            setSelectedCliente(null);
          }}
        />
      )}

      {showBroadcast && instanceName && (
        <WhatsAppBroadcast
          instanceName={instanceName}
          onClose={() => setShowBroadcast(false)}
        />
      )}

      {showConfig && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 sticky top-0 bg-white">
              <h2 className="text-lg font-semibold text-slate-900">Configuracoes</h2>
              <button
                onClick={() => setShowConfig(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>
            <div className="p-6">
              <WhatsAppConfig
                onConfigSaved={() => {
                  setShowConfig(false);
                  checkSetup();
                }}
                instanceName={instanceName || undefined}
                onHistoryCleared={() => {
                  setSelectedChat(null);
                  setShowConfig(false);
                }}
              />
            </div>
          </div>
        </div>
      )}

      {showReconnectModal && instanceName && !instanceName.startsWith('offline-') && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-900">Reconectar WhatsApp</h2>
              <button
                onClick={() => setShowReconnectModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={18} />
              </button>
            </div>
            <WhatsAppQRCode
              instanceName={instanceName}
              onConnected={handleReconnectModalConnected}
              isAlreadyConnected={false}
              phoneNumber={userInstance?.phone_number}
            />
          </div>
        </div>
      )}
    </div>
  );
}
