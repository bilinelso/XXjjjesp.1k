import { useState, useEffect } from 'react';
import { ToggleLeft, ToggleRight, Loader2, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface DistributionConfig {
  id: string;
  mode: 'round_robin' | 'by_load' | 'by_availability';
  is_active: boolean;
}

interface AssessorRow {
  id: string;
  nome: string;
  last_received_at: string | null;
  is_available: boolean;
  load: number;
}

const MODE_LABELS: Record<string, string> = {
  round_robin: 'Round Robin (revezamento)',
  by_load: 'Por Carga (menor fila)',
  by_availability: 'Por Disponibilidade',
};

export function LeadDistributionConfig() {
  const { profile } = useAuth();
  const [config, setConfig] = useState<DistributionConfig | null>(null);
  const [assessores, setAssessores] = useState<AssessorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Estado para disponibilidade do próprio assessor (não-master)
  const [myAssessorId, setMyAssessorId] = useState<string | null>(null);
  const [myAvailability, setMyAvailability] = useState<boolean>(false);
  const [savingAvail, setSavingAvail] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      // Config de distribuição
      const { data: cfg } = await supabase
        .from('lead_distribution_config')
        .select('id, mode, is_active')
        .limit(1)
        .maybeSingle();
      setConfig(cfg ?? null);

      if (profile?.is_master) {
        // Buscar assessores com carga e disponibilidade
        const { data: assessoresRaw } = await supabase
          .from('assessores')
          .select('id, nome, last_received_at, user_id')
          .eq('ativo', true)
          .not('user_id', 'is', null);

        if (assessoresRaw) {
          const { data: avail } = await supabase
            .from('assessor_availability')
            .select('assessor_id, is_available');

          const availMap = new Map((avail || []).map(a => [a.assessor_id, a.is_available]));

          // Contar carga de cada assessor
          const rows: AssessorRow[] = await Promise.all(
            assessoresRaw.map(async a => {
              const { count } = await supabase
                .from('clientes')
                .select('*', { count: 'exact', head: true })
                .ilike('assessor', `%${a.nome}%`)
                .not('status', 'in', '("finalizado","inativo","problema")');
              return {
                id: a.id,
                nome: a.nome,
                last_received_at: a.last_received_at,
                is_available: availMap.get(a.id) ?? true,
                load: count ?? 0,
              };
            })
          );
          setAssessores(rows);
        }
      } else {
        // Buscar se o usuário é assessor
        const { data: myAssessor } = await supabase
          .from('assessores')
          .select('id')
          .eq('user_id', profile?.id)
          .maybeSingle();

        if (myAssessor) {
          setMyAssessorId(myAssessor.id);
          const { data: avail } = await supabase
            .from('assessor_availability')
            .select('is_available')
            .eq('assessor_id', myAssessor.id)
            .maybeSingle();
          setMyAvailability(avail?.is_available ?? true);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, [profile?.id]);

  const handleToggleActive = async () => {
    if (!config) return;
    setSaving(true);
    const newValue = !config.is_active;
    const { error } = await supabase
      .from('lead_distribution_config')
      .update({ is_active: newValue })
      .eq('id', config.id);
    if (!error) setConfig(prev => prev ? { ...prev, is_active: newValue } : prev);
    setSaving(false);
  };

  const handleModeChange = async (mode: DistributionConfig['mode']) => {
    if (!config) return;
    setSaving(true);
    const { error } = await supabase
      .from('lead_distribution_config')
      .update({ mode })
      .eq('id', config.id);
    if (!error) setConfig(prev => prev ? { ...prev, mode } : prev);
    setSaving(false);
  };

  const handleToggleAssessorAvail = async (assessorId: string, current: boolean) => {
    const newValue = !current;
    setAssessores(prev =>
      prev.map(a => a.id === assessorId ? { ...a, is_available: newValue } : a)
    );
    await supabase
      .from('assessor_availability')
      .upsert({ assessor_id: assessorId, is_available: newValue }, { onConflict: 'assessor_id' });
  };

  const handleToggleMyAvailability = async () => {
    if (!myAssessorId) return;
    setSavingAvail(true);
    const newValue = !myAvailability;
    await supabase
      .from('assessor_availability')
      .upsert({ assessor_id: myAssessorId, is_available: newValue }, { onConflict: 'assessor_id' });
    setMyAvailability(newValue);
    setSavingAvail(false);
  };

  const formatLastReceived = (ts: string | null) => {
    if (!ts) return 'Nunca';
    const d = new Date(ts);
    const now = new Date();
    const diffMin = Math.floor((now.getTime() - d.getTime()) / 60000);
    if (diffMin < 1) return 'Agora mesmo';
    if (diffMin < 60) return `${diffMin}min atrás`;
    if (diffMin < 1440) return `${Math.floor(diffMin / 60)}h atrás`;
    return d.toLocaleDateString('pt-BR');
  };

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="animate-spin text-blue-600" size={24} />
      </div>
    );
  }

  // Assessor não-master: só vê o toggle de disponibilidade
  if (!profile?.is_master) {
    if (!myAssessorId) return null;
    return (
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-bold text-slate-800 mb-4">Minha Disponibilidade</h3>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-700">Disponível para receber leads</p>
            <p className="text-xs text-slate-500 mt-0.5">
              {myAvailability ? 'Você receberá novos leads automaticamente' : 'Você não receberá novos leads'}
            </p>
          </div>
          <button
            onClick={handleToggleMyAvailability}
            disabled={savingAvail}
            className="flex items-center gap-2"
          >
            {savingAvail ? (
              <Loader2 size={20} className="animate-spin text-slate-400" />
            ) : myAvailability ? (
              <ToggleRight size={36} className="text-emerald-500" />
            ) : (
              <ToggleLeft size={36} className="text-slate-300" />
            )}
          </button>
        </div>
      </div>
    );
  }

  // Master: painel completo
  return (
    <div className="bg-white p-6 rounded-lg shadow space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-slate-800">Distribuição Automática de Leads</h3>
        <button onClick={loadData} className="p-1.5 text-slate-400 hover:text-slate-600 rounded hover:bg-slate-100">
          <RefreshCw size={16} />
        </button>
      </div>

      {!config ? (
        <p className="text-sm text-slate-500">
          Nenhuma configuração encontrada. Crie um registro em <code>lead_distribution_config</code>.
        </p>
      ) : (
        <>
          {/* Toggle ativo/inativo */}
          <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
            <div>
              <p className="text-sm font-semibold text-slate-800">Distribuição automática</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {config.is_active
                  ? 'Leads serão distribuídos ao mover para Depositou'
                  : 'Distribuição desativada — leads não serão atribuídos'}
              </p>
            </div>
            <button onClick={handleToggleActive} disabled={saving} className="flex items-center gap-2">
              {saving ? (
                <Loader2 size={20} className="animate-spin text-slate-400" />
              ) : config.is_active ? (
                <ToggleRight size={36} className="text-emerald-500" />
              ) : (
                <ToggleLeft size={36} className="text-slate-300" />
              )}
            </button>
          </div>

          {/* Seletor de modo */}
          <div>
            <p className="text-sm font-semibold text-slate-700 mb-2">Modo de distribuição</p>
            <div className="grid grid-cols-3 gap-3">
              {(['round_robin', 'by_load', 'by_availability'] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => handleModeChange(mode)}
                  disabled={saving}
                  className={`p-3 rounded-lg border-2 text-sm font-medium transition-colors text-left ${
                    config.mode === mode
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}
                >
                  {MODE_LABELS[mode]}
                </button>
              ))}
            </div>
          </div>

          {/* Lista de assessores */}
          <div>
            <p className="text-sm font-semibold text-slate-700 mb-3">Assessores</p>
            {assessores.length === 0 ? (
              <p className="text-sm text-slate-400">Nenhum assessor ativo com usuário vinculado.</p>
            ) : (
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
                {assessores.map(a => (
                  <div key={a.id} className="flex items-center gap-4 px-4 py-3 bg-white hover:bg-slate-50">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800">{a.nome}</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Último lead: {formatLastReceived(a.last_received_at)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        a.load === 0 ? 'bg-slate-100 text-slate-500' :
                        a.load < 5 ? 'bg-emerald-100 text-emerald-700' :
                        a.load < 10 ? 'bg-yellow-100 text-yellow-700' :
                        'bg-red-100 text-red-700'
                      }`}>
                        {a.load} lead{a.load !== 1 ? 's' : ''}
                      </span>
                      <button
                        onClick={() => handleToggleAssessorAvail(a.id, a.is_available)}
                        title={a.is_available ? 'Disponível — clique para indisponibilizar' : 'Indisponível — clique para disponibilizar'}
                      >
                        {a.is_available
                          ? <ToggleRight size={28} className="text-emerald-500" />
                          : <ToggleLeft size={28} className="text-slate-300" />
                        }
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
