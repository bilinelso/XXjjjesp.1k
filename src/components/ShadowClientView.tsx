import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Ghost, Plus, Trash2, RefreshCw, X, QrCode, Check, Users as UsersIcon,
  Pencil, Power, AlertCircle, Clock, FileText, MessageSquare, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { shadowApi, extractQrDataUrl, type ShadowInstance, type ShadowGroup } from '../lib/shadowApi';

const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const WEEKDAYS_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const SP_TZ = 'America/Sao_Paulo';
const PAGE_SIZE = 10;
const BUCKET = 'shadow-media';

// 'all' = todas (weekly + once); número = filtrar por weekly_dow (0=Dom … 6=Sáb)
type DayFilter = 'all' | number;

interface ActiveGroup {
  group_jid: string | null;
  group_name: string | null;
}

interface ShadowSchedule {
  id: string;
  instance_id: string; // uuid → shadow_instances.id
  message_type: 'text' | 'media';
  message_text: string | null;
  media_path: string | null;
  media_mimetype: string | null;
  recurrence: 'once' | 'weekly';
  send_at: string | null;
  weekly_dow: number | null;
  weekly_time: string | null;
  use_active_group: boolean;
  target_group_jid: string | null;
  jitter_seconds: number | null;
  is_active: boolean;
  created_at?: string;
}

interface ShadowSendLog {
  id: string;
  sent_at: string | null;
  instance_id?: string | null;
  instance_name?: string | null;
  group_name?: string | null;
  group_jid?: string | null;
  status: string | null;
  error?: string | null;
  error_message?: string | null;
}

type ScheduleFormState = {
  instance_id: string;
  message_type: 'text' | 'media';
  message_text: string;
  recurrence: 'once' | 'weekly';
  send_at: string;
  weekly_dow: number;
  weekly_time: string;
  use_active_group: boolean;
  target_group_jid: string;
  jitter_seconds: string;
  is_active: boolean;
};

const emptyScheduleForm = (instanceId = ''): ScheduleFormState => ({
  instance_id: instanceId,
  message_type: 'text',
  message_text: '',
  recurrence: 'once',
  send_at: '',
  weekly_dow: 1,
  weekly_time: '09:00',
  use_active_group: true,
  target_group_jid: '',
  jitter_seconds: '0',
  is_active: true,
});

export const ShadowClientView: React.FC = () => {
  const { profile } = useAuth();

  // ── Section 1: instances ──────────────────────────────────────────────────
  const [instances, setInstances] = useState<ShadowInstance[]>([]);
  const [loadingInstances, setLoadingInstances] = useState(true);
  const [instancesError, setInstancesError] = useState<string | null>(null);
  const [showAddNumber, setShowAddNumber] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [addingNumber, setAddingNumber] = useState(false);

  // connect / QR modal
  const [connectName, setConnectName] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Section 2: active group ───────────────────────────────────────────────
  const [activeGroup, setActiveGroup] = useState<ActiveGroup | null>(null);
  const [showGroupPicker, setShowGroupPicker] = useState(false);
  const [groupPickerInstance, setGroupPickerInstance] = useState('');
  const [groups, setGroups] = useState<ShadowGroup[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [groupsError, setGroupsError] = useState<string | null>(null);
  const [savingGroup, setSavingGroup] = useState(false);

  // ── Section 3: schedules ──────────────────────────────────────────────────
  const [schedules, setSchedules] = useState<ShadowSchedule[]>([]);
  const [loadingSchedules, setLoadingSchedules] = useState(true);
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<ShadowSchedule | null>(null);
  const [form, setForm] = useState<ScheduleFormState>(emptyScheduleForm());
  const [scheduleFile, setScheduleFile] = useState<File | null>(null);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [dayFilter, setDayFilter] = useState<DayFilter>('all'); // 'all' | 0-6
  const [schedulePage, setSchedulePage] = useState(1);

  // ── Section 4: send log ───────────────────────────────────────────────────
  const [sendLog, setSendLog] = useState<ShadowSendLog[]>([]);
  const [loadingLog, setLoadingLog] = useState(true);
  const [logPage, setLogPage] = useState(1);
  const [logTotal, setLogTotal] = useState(0);

  // schedules guardam instance_id (uuid); o log pode trazer id ou instance_name
  const labelFor = useCallback(
    (ref: string) => {
      const inst = instances.find(i => i.id === ref || i.instance_name === ref);
      return inst?.label || ref;
    },
    [instances],
  );

  // ── Loaders ───────────────────────────────────────────────────────────────
  const loadInstances = useCallback(async () => {
    setLoadingInstances(true);
    setInstancesError(null);
    try {
      const data = await shadowApi.listInstances();
      setInstances(Array.isArray(data) ? data : []);
    } catch (err) {
      setInstancesError(err instanceof Error ? err.message : 'Erro ao carregar números');
    } finally {
      setLoadingInstances(false);
    }
  }, []);

  const loadActiveGroup = useCallback(async () => {
    const { data } = await supabase
      .from('shadow_active_group')
      .select('group_jid, group_name')
      .eq('id', 1)
      .maybeSingle();
    setActiveGroup(data ?? { group_jid: null, group_name: null });
  }, []);

  const loadSchedules = useCallback(async () => {
    setLoadingSchedules(true);
    const { data } = await supabase
      .from('shadow_schedules')
      .select('*')
      .order('created_at', { ascending: false });
    setSchedules((data as ShadowSchedule[]) ?? []);
    setLoadingSchedules(false);
  }, []);

  // paginação real no servidor (.range) — o log tende a crescer muito
  const loadSendLog = useCallback(async (page: number) => {
    setLoadingLog(true);
    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const { data, count } = await supabase
      .from('shadow_send_log')
      .select('*', { count: 'exact' })
      .order('sent_at', { ascending: false })
      .range(from, to);
    setSendLog((data as ShadowSendLog[]) ?? []);
    setLogTotal(count ?? 0);
    setLoadingLog(false);
  }, []);

  useEffect(() => {
    loadInstances();
    loadActiveGroup();
    loadSchedules();
  }, [loadInstances, loadActiveGroup, loadSchedules]);

  // recarrega o log sempre que a página muda
  useEffect(() => {
    loadSendLog(logPage);
  }, [loadSendLog, logPage]);

  // clean up polling on unmount
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  // ── Section 1 handlers ────────────────────────────────────────────────────
  const handleAddNumber = async () => {
    if (!newLabel.trim()) return;
    setAddingNumber(true);
    try {
      await shadowApi.addInstance(newLabel.trim());
      setNewLabel('');
      setShowAddNumber(false);
      await loadInstances();
    } catch (err) {
      alert(`Erro ao adicionar número: ${err instanceof Error ? err.message : err}`);
    } finally {
      setAddingNumber(false);
    }
  };

  const handleRemoveNumber = async (inst: ShadowInstance) => {
    if (!confirm(`Remover "${inst.label}" (${inst.instance_name})? Esta ação não pode ser desfeita.`)) return;
    try {
      await shadowApi.removeInstance(inst.instance_name);
      await loadInstances();
    } catch (err) {
      alert(`Erro ao remover: ${err instanceof Error ? err.message : err}`);
    }
  };

  const stopPolling = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  };

  const closeConnectModal = () => {
    stopPolling();
    setConnectName(null);
    setQrDataUrl(null);
    setConnectError(null);
  };

  const handleConnect = async (inst: ShadowInstance) => {
    setConnectName(inst.instance_name);
    setQrDataUrl(null);
    setConnectError(null);
    try {
      const resp = await shadowApi.connect(inst.instance_name);
      const qr = extractQrDataUrl(resp);
      if (!qr) {
        setConnectError('Não foi possível obter o QR code. Tente novamente.');
        return;
      }
      setQrDataUrl(qr);

      // poll status every ~3s until connected
      stopPolling();
      pollRef.current = setInterval(async () => {
        try {
          const status = await shadowApi.status(inst.instance_name);
          if (status.is_connected) {
            closeConnectModal();
            await loadInstances();
          }
        } catch {
          /* keep polling */
        }
      }, 3000);
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : 'Erro ao conectar');
    }
  };

  // ── Section 2 handlers ────────────────────────────────────────────────────
  const connectedInstances = instances.filter(i => i.is_connected || i.live_state === 'open');

  const openGroupPicker = () => {
    setGroupPickerInstance(connectedInstances[0]?.instance_name || '');
    setGroups([]);
    setGroupsError(null);
    setShowGroupPicker(true);
  };

  const loadGroupsForInstance = async (instanceName: string) => {
    if (!instanceName) return;
    setLoadingGroups(true);
    setGroupsError(null);
    try {
      const data = await shadowApi.groups(instanceName);
      setGroups(Array.isArray(data) ? data : []);
    } catch (err) {
      setGroupsError(err instanceof Error ? err.message : 'Erro ao carregar grupos');
    } finally {
      setLoadingGroups(false);
    }
  };

  const handleSelectGroup = async (group: ShadowGroup) => {
    setSavingGroup(true);
    try {
      const { error } = await supabase
        .from('shadow_active_group')
        .update({
          group_jid: group.jid,
          group_name: group.name,
          updated_at: new Date().toISOString(),
          updated_by: profile?.id ?? null,
        })
        .eq('id', 1);
      if (error) throw error;
      await loadActiveGroup();
      setShowGroupPicker(false);
    } catch (err) {
      alert(`Erro ao trocar grupo: ${err instanceof Error ? err.message : err}`);
    } finally {
      setSavingGroup(false);
    }
  };

  // ── Section 3 handlers ────────────────────────────────────────────────────
  const openCreateSchedule = () => {
    setEditingSchedule(null);
    setForm(emptyScheduleForm(instances[0]?.id || ''));
    setScheduleFile(null);
    setScheduleError(null);
    setShowScheduleForm(true);
  };

  const openEditSchedule = (s: ShadowSchedule) => {
    setEditingSchedule(s);
    setForm({
      instance_id: s.instance_id,
      message_type: s.message_type,
      message_text: s.message_text ?? '',
      recurrence: s.recurrence,
      send_at: s.send_at ? toLocalDatetimeInput(s.send_at) : '',
      weekly_dow: s.weekly_dow ?? 1,
      weekly_time: s.weekly_time ?? '09:00',
      use_active_group: s.use_active_group,
      target_group_jid: s.target_group_jid ?? '',
      jitter_seconds: String(s.jitter_seconds ?? 0),
      is_active: s.is_active,
    });
    setScheduleFile(null);
    setScheduleError(null);
    setShowScheduleForm(true);
  };

  const handleSaveSchedule = async () => {
    setScheduleError(null);

    if (!form.instance_id) { setScheduleError('Selecione o número remetente.'); return; }
    if (form.message_type === 'text' && !form.message_text.trim()) {
      setScheduleError('Digite o texto da mensagem.'); return;
    }
    if (form.message_type === 'media' && !scheduleFile && !editingSchedule?.media_path) {
      setScheduleError('Selecione um arquivo.'); return;
    }
    if (form.recurrence === 'once' && !form.send_at) {
      setScheduleError('Informe a data e hora do envio.'); return;
    }

    setSavingSchedule(true);
    try {
      let mediaPath = editingSchedule?.media_path ?? null;
      let mediaMime = editingSchedule?.media_mimetype ?? null;

      if (form.message_type === 'media' && scheduleFile) {
        const path = `${form.instance_id}/${Date.now()}_${scheduleFile.name}`;
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, scheduleFile, {
          contentType: scheduleFile.type || undefined,
          upsert: false,
        });
        if (upErr) throw upErr;
        mediaPath = path;
        mediaMime = scheduleFile.type || null;
      }

      const payload = {
        instance_id: form.instance_id,
        message_type: form.message_type,
        message_text: form.message_text.trim() || null,
        media_path: form.message_type === 'media' ? mediaPath : null,
        media_mimetype: form.message_type === 'media' ? mediaMime : null,
        recurrence: form.recurrence,
        send_at: form.recurrence === 'once' ? new Date(form.send_at).toISOString() : null,
        weekly_dow: form.recurrence === 'weekly' ? form.weekly_dow : null,
        weekly_time: form.recurrence === 'weekly' ? form.weekly_time : null,
        use_active_group: form.use_active_group,
        target_group_jid: form.use_active_group ? null : (form.target_group_jid.trim() || null),
        jitter_seconds: Number(form.jitter_seconds) || 0,
        is_active: form.is_active,
      };

      if (editingSchedule) {
        const { error } = await supabase.from('shadow_schedules').update(payload).eq('id', editingSchedule.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('shadow_schedules').insert(payload);
        if (error) throw error;
      }

      setShowScheduleForm(false);
      await loadSchedules();
    } catch (err) {
      setScheduleError(err instanceof Error ? err.message : 'Erro ao salvar agendamento');
    } finally {
      setSavingSchedule(false);
    }
  };

  const handleToggleScheduleActive = async (s: ShadowSchedule) => {
    setSchedules(prev => prev.map(x => x.id === s.id ? { ...x, is_active: !x.is_active } : x));
    const { error } = await supabase.from('shadow_schedules').update({ is_active: !s.is_active }).eq('id', s.id);
    if (error) { await loadSchedules(); alert(`Erro ao atualizar: ${error.message}`); }
  };

  const handleDeleteSchedule = async (s: ShadowSchedule) => {
    if (!confirm('Excluir este agendamento?')) return;
    const { error } = await supabase.from('shadow_schedules').delete().eq('id', s.id);
    if (error) { alert(`Erro ao excluir: ${error.message}`); return; }
    await loadSchedules();
  };

  // ── Filtro por dia + paginação (client-side, volume baixo ~26) ─────────────
  // "Todas": weekly (ordenado por dow, depois hora) + once (ao final, por send_at).
  // Dia específico: só weekly daquele weekly_dow, ordenadas por weekly_time.
  const filteredSchedules = useMemo(() => {
    if (dayFilter === 'all') {
      const weekly = schedules
        .filter(s => s.recurrence === 'weekly')
        .sort((a, b) =>
          (a.weekly_dow ?? 0) - (b.weekly_dow ?? 0) ||
          (a.weekly_time ?? '').localeCompare(b.weekly_time ?? ''),
        );
      const once = schedules
        .filter(s => s.recurrence === 'once')
        .sort((a, b) => (a.send_at ?? '').localeCompare(b.send_at ?? ''));
      return [...weekly, ...once];
    }
    return schedules
      .filter(s => s.recurrence === 'weekly' && s.weekly_dow === dayFilter)
      .sort((a, b) => (a.weekly_time ?? '').localeCompare(b.weekly_time ?? ''));
  }, [schedules, dayFilter]);

  // ao trocar o filtro de dia, a paginação reinicia na página 1
  useEffect(() => { setSchedulePage(1); }, [dayFilter]);

  const scheduleTotalPages = Math.max(1, Math.ceil(filteredSchedules.length / PAGE_SIZE));
  // se a lista encolher (ex: exclusão) e a página atual ficar fora do range, recua
  useEffect(() => {
    if (schedulePage > scheduleTotalPages) setSchedulePage(scheduleTotalPages);
  }, [schedulePage, scheduleTotalPages]);

  const pagedSchedules = filteredSchedules.slice(
    (schedulePage - 1) * PAGE_SIZE,
    schedulePage * PAGE_SIZE,
  );

  const logTotalPages = Math.max(1, Math.ceil(logTotal / PAGE_SIZE));

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-[1400px] mx-auto px-6 py-6 space-y-8">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-slate-800 rounded-lg text-white"><Ghost size={22} /></div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Cliente Oculto</h1>
          <p className="text-sm text-slate-500">Gestão dos números e envios semanais automáticos.</p>
        </div>
      </div>

      {/* ─── 1. Números ─── */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-800 flex items-center gap-2"><QrCode size={18} /> Números</h2>
          <div className="flex items-center gap-2">
            <button onClick={loadInstances} className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100" title="Atualizar">
              <RefreshCw size={16} className={loadingInstances ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={() => setShowAddNumber(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg font-medium"
            >
              <Plus size={16} /> Adicionar número
            </button>
          </div>
        </div>

        <div className="p-6">
          {showAddNumber && (
            <div className="mb-4 flex items-end gap-2 p-4 bg-slate-50 rounded-lg border border-slate-200">
              <div className="flex-1">
                <label className="block text-xs font-medium text-slate-600 mb-1">Label do número</label>
                <input
                  autoFocus
                  value={newLabel}
                  onChange={e => setNewLabel(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleAddNumber(); }}
                  placeholder='Ex: "Número 1"'
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <button onClick={handleAddNumber} disabled={addingNumber || !newLabel.trim()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-sm rounded-lg font-medium">
                {addingNumber ? 'Criando...' : 'Criar'}
              </button>
              <button onClick={() => { setShowAddNumber(false); setNewLabel(''); }}
                className="px-3 py-2 text-slate-500 hover:text-slate-700 text-sm">Cancelar</button>
            </div>
          )}

          {instancesError && (
            <div className="mb-4 flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <AlertCircle size={16} /> {instancesError}
            </div>
          )}

          {loadingInstances ? (
            <p className="text-sm text-slate-400 py-6 text-center">Carregando números...</p>
          ) : instances.length === 0 ? (
            <p className="text-sm text-slate-400 py-6 text-center">Nenhum número cadastrado.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {instances.map(inst => {
                const connected = inst.is_connected || inst.live_state === 'open';
                return (
                  <div key={inst.instance_name} className="border border-slate-200 rounded-lg p-4 flex flex-col gap-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium text-slate-800">{inst.label}</p>
                        <p className="text-xs text-slate-400 font-mono">{inst.instance_name}</p>
                      </div>
                      <span className={`flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full ${
                        connected ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                      }`}>
                        <span className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                        {connected ? 'Conectado' : 'Desconectado'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {!connected && (
                        <button onClick={() => handleConnect(inst)}
                          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm rounded-lg font-medium">
                          <QrCode size={15} /> Conectar
                        </button>
                      )}
                      <button onClick={() => handleRemoveNumber(inst)}
                        className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 text-sm rounded-lg font-medium">
                        <Trash2 size={15} /> Remover
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* ─── 2. Grupo da semana ─── */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-800 flex items-center gap-2"><UsersIcon size={18} /> Grupo da semana</h2>
          <button onClick={openGroupPicker}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white text-sm rounded-lg font-medium">
            Trocar grupo
          </button>
        </div>
        <div className="p-6">
          <div className="flex items-center gap-3 mb-3">
            <span className="text-sm text-slate-500">Grupo ativo:</span>
            {activeGroup?.group_name ? (
              <div>
                <span className="font-medium text-slate-800">{activeGroup.group_name}</span>
                <span className="ml-2 text-xs text-slate-400 font-mono">{activeGroup.group_jid}</span>
              </div>
            ) : (
              <span className="text-sm text-slate-400">Nenhum grupo definido.</span>
            )}
          </div>
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 inline-flex items-center gap-1.5">
            <AlertCircle size={14} /> Os números precisam ser membros deste grupo no WhatsApp para conseguir postar.
          </p>
        </div>
      </section>

      {/* ─── 3. Mensagens agendadas ─── */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-800 flex items-center gap-2"><Clock size={18} /> Mensagens agendadas</h2>
          <button onClick={openCreateSchedule}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg font-medium">
            <Plus size={16} /> Nova mensagem
          </button>
        </div>

        {/* filtro por dia da semana */}
        <div className="flex flex-wrap items-center gap-1.5 px-6 py-3 border-b border-slate-100">
          <button
            onClick={() => setDayFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${
              dayFilter === 'all'
                ? 'bg-slate-800 text-white border-slate-800'
                : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
            }`}>
            Todas
          </button>
          {WEEKDAYS_SHORT.map((d, i) => (
            <button
              key={i}
              onClick={() => setDayFilter(i)}
              title={WEEKDAYS[i]}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${
                dayFilter === i
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
              }`}>
              {d}
            </button>
          ))}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-6 py-3 font-semibold text-slate-600">Remetente</th>
                <th className="text-left px-6 py-3 font-semibold text-slate-600">Tipo</th>
                <th className="text-left px-6 py-3 font-semibold text-slate-600">Mensagem</th>
                <th className="text-left px-6 py-3 font-semibold text-slate-600">Recorrência</th>
                <th className="text-left px-6 py-3 font-semibold text-slate-600">Próximo disparo</th>
                <th className="text-center px-6 py-3 font-semibold text-slate-600">Ativo</th>
                <th className="text-right px-6 py-3 font-semibold text-slate-600">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loadingSchedules ? (
                <tr><td colSpan={7} className="px-6 py-8 text-center text-slate-400">Carregando...</td></tr>
              ) : filteredSchedules.length === 0 ? (
                <tr><td colSpan={7} className="px-6 py-8 text-center text-slate-400">
                  {dayFilter === 'all'
                    ? 'Nenhuma mensagem agendada.'
                    : `Nenhuma mensagem agendada para ${WEEKDAYS[dayFilter]}.`}
                </td></tr>
              ) : pagedSchedules.map(s => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className="px-6 py-3 text-slate-800">{labelFor(s.instance_id)}</td>
                  <td className="px-6 py-3">
                    <span className="inline-flex items-center gap-1.5 text-slate-600">
                      {s.message_type === 'media' ? <FileText size={14} /> : <MessageSquare size={14} />}
                      {s.message_type === 'media' ? 'Arquivo' : 'Texto'}
                    </span>
                  </td>
                  <td className="px-6 py-3">
                    <div className="max-w-[260px]">
                      {s.message_type === 'media' && (
                        <span className="inline-flex items-center gap-1 text-xs text-slate-500 mb-0.5">
                          <FileText size={12} /> {mediaFileName(s.media_path) || 'arquivo'}
                        </span>
                      )}
                      {s.message_text ? (
                        <p className="text-slate-600 line-clamp-2 whitespace-pre-wrap break-words" title={s.message_text}>
                          {s.message_text}
                        </p>
                      ) : (
                        <span className="text-slate-300 italic">{s.message_type === 'media' ? 'sem legenda' : '—'}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-3 text-slate-600">{s.recurrence === 'weekly' ? 'Toda semana' : 'Uma vez'}</td>
                  <td className="px-6 py-3 text-slate-600">{describeNextRun(s)}</td>
                  <td className="px-6 py-3 text-center">
                    <button onClick={() => handleToggleScheduleActive(s)}
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                        s.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                      }`}>
                      <Power size={12} /> {s.is_active ? 'Ativo' : 'Inativo'}
                    </button>
                  </td>
                  <td className="px-6 py-3 text-right whitespace-nowrap">
                    <button onClick={() => openEditSchedule(s)} className="p-1.5 text-slate-400 hover:text-blue-600" title="Editar"><Pencil size={15} /></button>
                    <button onClick={() => handleDeleteSchedule(s)} className="p-1.5 text-slate-400 hover:text-red-600" title="Excluir"><Trash2 size={15} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loadingSchedules && filteredSchedules.length > 0 && (
          <div className="flex items-center justify-between px-6 py-3 border-t border-slate-100">
            <span className="text-sm text-slate-500">
              Página {schedulePage} de {scheduleTotalPages} · {filteredSchedules.length} mensagem{filteredSchedules.length === 1 ? '' : 's'}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSchedulePage(p => Math.max(1, p - 1))}
                disabled={schedulePage <= 1}
                className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed">
                <ChevronLeft size={15} /> Anterior
              </button>
              <button
                onClick={() => setSchedulePage(p => Math.min(scheduleTotalPages, p + 1))}
                disabled={schedulePage >= scheduleTotalPages}
                className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed">
                Próxima <ChevronRight size={15} />
              </button>
            </div>
          </div>
        )}
      </section>

      {/* ─── 4. Log de envios ─── */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-800">Log de envios</h2>
          <button onClick={() => loadSendLog(logPage)} className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100" title="Atualizar">
            <RefreshCw size={16} className={loadingLog ? 'animate-spin' : ''} />
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-6 py-3 font-semibold text-slate-600">Data/hora</th>
                <th className="text-left px-6 py-3 font-semibold text-slate-600">Número</th>
                <th className="text-left px-6 py-3 font-semibold text-slate-600">Grupo</th>
                <th className="text-left px-6 py-3 font-semibold text-slate-600">Status</th>
                <th className="text-left px-6 py-3 font-semibold text-slate-600">Erro</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loadingLog ? (
                <tr><td colSpan={5} className="px-6 py-8 text-center text-slate-400">Carregando...</td></tr>
              ) : sendLog.length === 0 ? (
                <tr><td colSpan={5} className="px-6 py-8 text-center text-slate-400">Nenhum envio registrado.</td></tr>
              ) : sendLog.map(log => {
                const ok = (log.status || '').toLowerCase() === 'sent';
                const err = log.error || log.error_message;
                return (
                  <tr key={log.id} className="hover:bg-slate-50">
                    <td className="px-6 py-3 text-slate-600">{formatSP(log.sent_at)}</td>
                    <td className="px-6 py-3 text-slate-700">{labelFor(log.instance_id || log.instance_name || '')}</td>
                    <td className="px-6 py-3 text-slate-600">{log.group_name || log.group_jid || '—'}</td>
                    <td className="px-6 py-3">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium ${
                        ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                      }`}>
                        <span className={`w-2 h-2 rounded-full ${ok ? 'bg-emerald-500' : 'bg-red-500'}`} />
                        {ok ? 'Enviado' : 'Falhou'}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-red-600 text-xs max-w-xs truncate" title={err || ''}>{err || ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!loadingLog && logTotal > 0 && (
          <div className="flex items-center justify-between px-6 py-3 border-t border-slate-100">
            <span className="text-sm text-slate-500">
              Página {logPage} de {logTotalPages} · {logTotal} envio{logTotal === 1 ? '' : 's'}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setLogPage(p => Math.max(1, p - 1))}
                disabled={logPage <= 1}
                className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed">
                <ChevronLeft size={15} /> Anterior
              </button>
              <button
                onClick={() => setLogPage(p => Math.min(logTotalPages, p + 1))}
                disabled={logPage >= logTotalPages}
                className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed">
                Próxima <ChevronRight size={15} />
              </button>
            </div>
          </div>
        )}
      </section>

      {/* ─── QR / connect modal ─── */}
      {connectName && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h3 className="font-semibold text-slate-800">Conectar {labelFor(connectName)}</h3>
              <button onClick={closeConnectModal} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>
            <div className="p-6 flex flex-col items-center gap-4">
              {connectError ? (
                <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-center">{connectError}</div>
              ) : qrDataUrl ? (
                <>
                  <img src={qrDataUrl} alt="QR code" className="w-56 h-56 border border-slate-200 rounded-lg" />
                  <p className="text-sm text-slate-500 text-center flex items-center gap-2">
                    <RefreshCw size={14} className="animate-spin" />
                    Escaneie pelo WhatsApp. Detectando conexão...
                  </p>
                </>
              ) : (
                <p className="text-sm text-slate-400 py-12">Gerando QR code...</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── Group picker modal ─── */}
      {showGroupPicker && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h3 className="font-semibold text-slate-800">Trocar grupo da semana</h3>
              <button onClick={() => setShowGroupPicker(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Buscar grupos a partir do número</label>
                <div className="flex gap-2">
                  <select value={groupPickerInstance} onChange={e => setGroupPickerInstance(e.target.value)}
                    className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm">
                    {connectedInstances.length === 0 && <option value="">Nenhum número conectado</option>}
                    {connectedInstances.map(i => <option key={i.instance_name} value={i.instance_name}>{i.label}</option>)}
                  </select>
                  <button onClick={() => loadGroupsForInstance(groupPickerInstance)} disabled={!groupPickerInstance || loadingGroups}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-sm rounded-lg font-medium">
                    {loadingGroups ? 'Buscando...' : 'Buscar'}
                  </button>
                </div>
              </div>

              {groupsError && (
                <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{groupsError}</div>
              )}

              <div className="max-h-72 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                {groups.length === 0 ? (
                  <p className="text-sm text-slate-400 py-6 text-center">{loadingGroups ? 'Carregando...' : 'Nenhum grupo carregado.'}</p>
                ) : groups.map(g => (
                  <button key={g.jid} onClick={() => handleSelectGroup(g)} disabled={savingGroup}
                    className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-50 disabled:opacity-50">
                    <div>
                      <p className="text-sm font-medium text-slate-800">{g.name || '(sem nome)'}</p>
                      <p className="text-xs text-slate-400 font-mono">{g.jid}</p>
                    </div>
                    {activeGroup?.group_jid === g.jid
                      ? <Check size={16} className="text-emerald-600" />
                      : <span className="text-xs text-blue-600 font-medium">Selecionar</span>}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Schedule form modal ─── */}
      {showScheduleForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 sticky top-0 bg-white">
              <h3 className="font-semibold text-slate-800">{editingSchedule ? 'Editar mensagem' : 'Nova mensagem agendada'}</h3>
              <button onClick={() => setShowScheduleForm(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              {/* remetente */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Número remetente</label>
                <select value={form.instance_id} onChange={e => setForm(f => ({ ...f, instance_id: e.target.value }))}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm">
                  <option value="">Selecione...</option>
                  {instances.map(i => <option key={i.id} value={i.id}>{i.label}</option>)}
                </select>
              </div>

              {/* tipo */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Tipo</label>
                <div className="flex gap-2">
                  {(['text', 'media'] as const).map(t => (
                    <button key={t} onClick={() => setForm(f => ({ ...f, message_type: t }))}
                      className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border ${
                        form.message_type === t ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-300'
                      }`}>
                      {t === 'text' ? 'Texto' : 'Arquivo'}
                    </button>
                  ))}
                </div>
              </div>

              {/* arquivo */}
              {form.message_type === 'media' && (
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Arquivo</label>
                  <input type="file" onChange={e => setScheduleFile(e.target.files?.[0] ?? null)}
                    className="w-full text-sm text-slate-600 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-slate-100 file:text-slate-700 file:text-sm" />
                  {editingSchedule?.media_path && !scheduleFile && (
                    <p className="text-xs text-slate-400 mt-1">Atual: {editingSchedule.media_path} (deixe vazio para manter)</p>
                  )}
                </div>
              )}

              {/* texto / legenda */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  {form.message_type === 'media' ? 'Legenda (opcional)' : 'Texto'}
                </label>
                <textarea value={form.message_text} onChange={e => setForm(f => ({ ...f, message_text: e.target.value }))}
                  rows={3} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm resize-y" />
              </div>

              {/* recorrência */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Recorrência</label>
                <div className="flex gap-2">
                  {(['once', 'weekly'] as const).map(r => (
                    <button key={r} onClick={() => setForm(f => ({ ...f, recurrence: r }))}
                      className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border ${
                        form.recurrence === r ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-300'
                      }`}>
                      {r === 'once' ? 'Uma vez' : 'Toda semana'}
                    </button>
                  ))}
                </div>
              </div>

              {form.recurrence === 'once' ? (
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Data e hora</label>
                  <input type="datetime-local" value={form.send_at} onChange={e => setForm(f => ({ ...f, send_at: e.target.value }))}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Dia da semana</label>
                    <select value={form.weekly_dow} onChange={e => setForm(f => ({ ...f, weekly_dow: Number(e.target.value) }))}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm">
                      {WEEKDAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Hora (São Paulo)</label>
                    <input type="time" value={form.weekly_time} onChange={e => setForm(f => ({ ...f, weekly_time: e.target.value }))}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                  </div>
                </div>
              )}

              {/* grupo */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={form.use_active_group}
                    onChange={e => setForm(f => ({ ...f, use_active_group: e.target.checked }))}
                    className="w-4 h-4 rounded border-slate-300" />
                  Usar grupo da semana
                </label>
                {!form.use_active_group && (
                  <input value={form.target_group_jid} onChange={e => setForm(f => ({ ...f, target_group_jid: e.target.value }))}
                    placeholder="JID do grupo (opcional)"
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono" />
                )}
              </div>

              {/* jitter */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Jitter (segundos)</label>
                <input type="number" min={0} value={form.jitter_seconds}
                  onChange={e => setForm(f => ({ ...f, jitter_seconds: e.target.value }))}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                <p className="text-xs text-slate-400 mt-1">Atraso aleatório anti-bloqueio. Sugestão: 30–120.</p>
              </div>

              {/* ativo */}
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={form.is_active}
                  onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))}
                  className="w-4 h-4 rounded border-slate-300" />
                Ativo
              </label>

              {scheduleError && (
                <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{scheduleError}</div>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100 sticky bottom-0 bg-white">
              <button onClick={() => setShowScheduleForm(false)} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800">Cancelar</button>
              <button onClick={handleSaveSchedule} disabled={savingSchedule}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-sm rounded-lg font-medium">
                {savingSchedule ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ── helpers ───────────────────────────────────────────────────────────────
function toLocalDatetimeInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// extrai o nome original do arquivo do path `${instance_id}/${timestamp}_${file.name}`
function mediaFileName(path: string | null): string {
  if (!path) return '';
  const last = path.split('/').pop() || path;
  return last.replace(/^\d+_/, '');
}

// formata um timestamptz no fuso de São Paulo (pt-BR)
function formatSP(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', { timeZone: SP_TZ });
}

function describeNextRun(s: ShadowSchedule): string {
  if (s.recurrence === 'weekly') {
    const day = WEEKDAYS[s.weekly_dow ?? 0] ?? '—';
    return `Toda ${day} às ${s.weekly_time ?? '—'}`;
  }
  return formatSP(s.send_at);
}
