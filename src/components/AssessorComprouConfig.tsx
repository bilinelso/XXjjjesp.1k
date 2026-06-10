import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface AssessorOption {
  id: string;
  nome: string;
}

export function AssessorComprouConfig() {
  const [assessores, setAssessores] = useState<AssessorOption[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const [{ data: setting }, { data: assessoresRaw }] = await Promise.all([
          supabase
            .from('app_settings')
            .select('setting_value')
            .eq('setting_key', 'assessor_comprou_id')
            .maybeSingle(),
          supabase
            .from('assessores')
            .select('id, nome')
            .eq('ativo', true)
            .not('user_id', 'is', null)
            .order('nome'),
        ]);

        if (assessoresRaw) setAssessores(assessoresRaw);
        if (setting?.setting_value) setSelectedId(setting.setting_value);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  const handleChange = async (newId: string) => {
    setSelectedId(newId);
    setSaving(true);
    setSaved(false);

    await supabase
      .from('app_settings')
      .update({ setting_value: newId })
      .eq('setting_key', 'assessor_comprou_id');

    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="animate-spin text-blue-600" size={24} />
      </div>
    );
  }

  return (
    <div className="bg-white p-6 rounded-lg shadow space-y-4">
      <h3 className="text-lg font-bold text-slate-800">Assessor — Cliente Comprou</h3>
      <p className="text-sm text-slate-500">
        Assessor atribuído automaticamente quando um cliente é marcado como <strong>Comprou</strong>.
      </p>

      <div className="flex items-center gap-3">
        <select
          value={selectedId}
          onChange={e => handleChange(e.target.value)}
          disabled={saving}
          className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
        >
          <option value="">— Selecionar assessor —</option>
          {assessores.map(a => (
            <option key={a.id} value={a.id}>
              {a.nome}
            </option>
          ))}
        </select>

        {saving && <Loader2 size={18} className="animate-spin text-slate-400 shrink-0" />}
        {saved && !saving && (
          <span className="text-sm font-medium text-emerald-600 shrink-0">Salvo!</span>
        )}
      </div>
    </div>
  );
}
