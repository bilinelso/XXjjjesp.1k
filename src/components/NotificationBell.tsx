import { useState, useEffect, useRef, useCallback } from 'react';
import { Bell, X, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { NotificationModal, type NotificationData } from './NotificationModal';
import { useNotifications } from '../hooks/useNotifications';

interface RecipientEntry {
  id: string;
  notification_id: string;
  read_at: string | null;
  notifications: NotificationData;
}

interface NotificationBellProps {
  onOpenWhatsApp?: (phone: string) => void;
  onOpenWabaChat?: (chatId: string) => void;
  onOpenCliente?: (clienteId: string) => void;
}

export function NotificationBell({ onOpenWhatsApp, onOpenWabaChat, onOpenCliente }: NotificationBellProps) {
  const { user, profile } = useAuth();
  const { notifyAnnouncement } = useNotifications();
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<RecipientEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedNotification, setSelectedNotification] = useState<NotificationData | null>(null);
  const [toast, setToast] = useState<{ notification: NotificationData; recipientId: string } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const unreadCount = entries.filter(e => !e.read_at).length;

  const tryParseLeadAssigned = (message: string): { telefone: string; nome?: string } | null => {
    try {
      const parsed = JSON.parse(message);
      if (parsed.type === 'lead_assigned' && parsed.telefone) return parsed;
    } catch { /* not JSON */ }
    return null;
  };

  const loadNotifications = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from('notification_recipients')
      .select('id, notification_id, read_at, notifications(id, title, message, image_url, pdf_url, created_at)')
      .eq('user_id', user.id)
      .is('dismissed_at', null)
      .order('created_at', { referencedTable: 'notifications', ascending: false });
    if (data) {
      const sorted = (data as unknown as RecipientEntry[]).sort((a, b) =>
        new Date(b.notifications.created_at).getTime() - new Date(a.notifications.created_at).getTime()
      );
      setEntries(sorted);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (user) loadNotifications();
  }, [user, loadNotifications]);

  useEffect(() => {
    if (!profile?.is_master) return;
    supabase.rpc('cleanup_old_notifications');
    supabase.rpc('cleanup_old_audio_media');
  }, [profile?.is_master]);

  // Realtime: novos notification_recipients para este usuário
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`notif_bell_${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notification_recipients',
          filter: `user_id=eq.${user.id}`,
        },
        async (payload) => {
          const rec = payload.new as { id: string; notification_id: string };
          const { data } = await supabase
            .from('notifications')
            .select('id, title, message, image_url, pdf_url, created_at')
            .eq('id', rec.notification_id)
            .single();
          if (!data) return;
          const notification = data as NotificationData;
          const newEntry: RecipientEntry = {
            id: rec.id,
            notification_id: rec.notification_id,
            read_at: null,
            notifications: notification,
          };
          setEntries(prev => [newEntry, ...prev]);
          const lead = tryParseLeadAssigned(notification.message);
          const preview = lead
            ? `Novo lead atribuído: ${lead.nome || ''}`
            : stripHtml(notification.message);
          notifyAnnouncement(notification.title, preview.slice(0, 80));
          // Toast
          if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
          setToast({ notification, recipientId: rec.id });
          toastTimerRef.current = setTimeout(() => setToast(null), 5000);
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const markAsRead = async (recipientId: string) => {
    const now = new Date().toISOString();
    await supabase
      .from('notification_recipients')
      .update({ read_at: now })
      .eq('id', recipientId);
    setEntries(prev =>
      prev.map(e => e.id === recipientId ? { ...e, read_at: now } : e)
    );
  };

  const handleClickEntry = async (entry: RecipientEntry) => {
    if (!entry.read_at) await markAsRead(entry.id);
    setOpen(false);
    setSelectedNotification(entry.notifications);
  };

  const handleClickToast = async () => {
    if (!toast) return;
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    await markAsRead(toast.recipientId);
    setToast(null);
    setSelectedNotification(toast.notification);
  };

  // Fecha dropdown ao clicar fora
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const stripHtml = (html: string) => {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
  };

  const getMessagePreview = (message: string) => {
    const lead = tryParseLeadAssigned(message);
    if (lead) return `Novo lead atribuído: ${lead.nome || ''}`;
    return stripHtml(message);
  };

  const formatDate = (ts: string) => {
    const d = new Date(ts);
    const diff = Date.now() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Agora';
    if (mins < 60) return `${mins}m atrás`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h atrás`;
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
  };

  if (!user) return null;

  return (
    <>
      {/* Botão sino */}
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setOpen(o => !o)}
          className="relative p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
          title="Notificações"
        >
          <Bell size={20} />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center font-bold leading-none">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>

        {/* Dropdown */}
        {open && (
          <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl shadow-2xl border border-slate-200 z-50 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
              <h3 className="font-semibold text-slate-900 text-sm">Notificações</h3>
              {unreadCount > 0 && (
                <span className="text-xs text-slate-400">
                  {unreadCount} não lida{unreadCount > 1 ? 's' : ''}
                </span>
              )}
            </div>
            <div className="max-h-80 overflow-y-auto">
              {loading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="animate-spin text-blue-500" size={20} />
                </div>
              ) : entries.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-8">Nenhuma notificação</p>
              ) : (
                entries.map(entry => (
                  <button
                    key={entry.id}
                    onClick={() => handleClickEntry(entry)}
                    className={`w-full text-left px-4 py-3 border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors ${
                      !entry.read_at ? 'bg-blue-50/60' : ''
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      {!entry.read_at && (
                        <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0 mt-1.5" />
                      )}
                      <div className={`min-w-0 flex-1 ${entry.read_at ? 'pl-4' : ''}`}>
                        <p className={`text-sm font-medium truncate ${!entry.read_at ? 'text-slate-900' : 'text-slate-600'}`}>
                          {entry.notifications.title}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">
                          {getMessagePreview(entry.notifications.message).slice(0, 60)}
                          {getMessagePreview(entry.notifications.message).length > 60 ? '…' : ''}
                        </p>
                        <p className="text-[10px] text-slate-400 mt-1">
                          {formatDate(entry.notifications.created_at)}
                        </p>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-[100] w-80 bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden">
          <div className="flex items-start gap-3 p-4">
            <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
              <Bell size={15} className="text-blue-600" />
            </div>
            <button className="flex-1 text-left" onClick={handleClickToast}>
              <p className="text-sm font-semibold text-slate-900 leading-snug">
                {toast.notification.title}
              </p>
              <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">
                {getMessagePreview(toast.notification.message).slice(0, 80)}
                {getMessagePreview(toast.notification.message).length > 80 ? '…' : ''}
              </p>
            </button>
            <button
              onClick={() => setToast(null)}
              className="p-0.5 text-slate-400 hover:text-slate-600 flex-shrink-0"
            >
              <X size={14} />
            </button>
          </div>
          {/* Barra de progresso */}
          <div className="h-0.5 bg-slate-100">
            <div
              className="h-full bg-blue-500"
              style={{ animation: 'toast-shrink 5s linear forwards' }}
            />
          </div>
        </div>
      )}

      {/* Modal */}
      {selectedNotification && (
        <NotificationModal
          notification={selectedNotification}
          onClose={() => setSelectedNotification(null)}
          onOpenWhatsApp={onOpenWhatsApp}
          onOpenWabaChat={onOpenWabaChat}
          onOpenCliente={onOpenCliente}
        />
      )}
    </>
  );
}
