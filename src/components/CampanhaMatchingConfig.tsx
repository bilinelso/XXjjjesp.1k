import { useState, useEffect } from 'react';
import { Plus, Save, Trash2, X, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface Mapping {
  id: string;
  google_ads_nome: string;
  campanha_id: string | null;
  campanha_nome_custom: string | null;
}

interface EditForm {
  google_ads_nome: string;
  campanha_id: string;
  campanha_nome_custom: string;
}

const emptyForm = (): EditForm => ({ google_ads_nome: '', campanha_id: '', campanha_nome_custom: '' });

export function CampanhaMatchingConfig() {
  const [rows, setRows] = useState<Mapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | 'new' | null>(null);
  const [form, setForm] = useState<EditForm>(emptyForm());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase
      .from('campaign_mappings')
      .select('id, google_ads_nome, campanha_id, campanha_nome_custom')
      .order('google_ads_nome')
      .then(({ data }) => {
        if (data) setRows(data as Mapping[]);
        setLoading(false);
      });
  }, []);

  const startAdd = () => {
    setForm(emptyForm());
    setEditingId('new');
  };

  const startEdit = (row: Mapping) => {
    setForm({
      google_ads_nome: row.google_ads_nome,
      campanha_id: row.campanha_id || '',
      campanha_nome_custom: row.campanha_nome_custom || '',
    });
    setEditingId(row.id);
  };

  const handleCancel = () => {
    setEditingId(null);
    setForm(emptyForm());
  };

  const handleSave = async () => {
    if (!form.google_ads_nome.trim()) return;
    setSaving(true);
    try {
      const payload = {
        ...(editingId !== 'new' ? { id: editingId } : {}),
        google_ads_nome: form.google_ads_nome.trim(),
        campanha_id: form.campanha_id.trim() || null,
        campanha_nome_custom: form.campanha_nome_custom.trim() || null,
      };
      const { data, error } = await supabase
        .from('campaign_mappings')
        .upsert(payload, { onConflict: 'google_ads_nome' })
        .select('id, google_ads_nome, campanha_id, campanha_nome_custom')
        .single();
      if (error) throw error;
      if (data) {
        setRows(prev => {
          const without = prev.filter(r => r.id !== data.id);
          return [...without, data as Mapping].sort((a, b) => a.google_ads_nome.localeCompare(b.google_ads_nome));
        });
      }
      setEditingId(null);
      setForm(emptyForm());
    } catch (err) {
      console.error('Error saving mapping:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir este mapping?')) return;
    setRows(prev => prev.filter(r => r.id !== id));
    await supabase.from('campaign_mappings').delete().eq('id', id);
  };

  const inputCls = 'w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500';

  const EditRow = () => (
    <tr className="bg-blue-50">
      <td className="px-4 py-2">
        <input className={inputCls} placeholder="Nome no Google Ads" value={form.google_ads_nome} onChange={e => setForm(f => ({ ...f, google_ads_nome: e.target.value }))} />
      </td>
      <td className="px-4 py-2">
        <input className={inputCls} placeholder="ID da campanha (tracking)" value={form.campanha_id} onChange={e => setForm(f => ({ ...f, campanha_id: e.target.value }))} />
      </td>
      <td className="px-4 py-2">
        <input className={inputCls} placeholder="Nome amigável (opcional)" value={form.campanha_nome_custom} onChange={e => setForm(f => ({ ...f, campanha_nome_custom: e.target.value }))} />
      </td>
      <td className="px-4 py-2">
        <div className="flex gap-1.5">
          <button
            onClick={handleSave}
            disabled={saving || !form.google_ads_nome.trim()}
            className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium disabled:opacity-50 transition-colors"
          >
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
            Salvar
          </button>
          <button onClick={handleCancel} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
            <X size={14} />
          </button>
        </div>
      </td>
    </tr>
  );

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-6 py-5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Matching de Campanhas</h3>
          <p className="text-sm text-slate-500 mt-1">Vincule IDs de rastreamento aos nomes do Google Ads</p>
        </div>
        {editingId === null && (
          <button
            onClick={startAdd}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Plus size={15} />
            Adicionar
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="animate-spin text-slate-400" size={20} /></div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600">Nome no Google Ads</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600">ID da Campanha</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600">Nome customizado</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {editingId === 'new' && <EditRow />}
              {rows.length === 0 && editingId !== 'new' ? (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400 text-sm">Nenhum mapping cadastrado</td></tr>
              ) : rows.map(row =>
                editingId === row.id ? (
                  <EditRow key={row.id} />
                ) : (
                  <tr key={row.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 text-slate-800 font-medium">{row.google_ads_nome}</td>
                    <td className="px-4 py-2.5 text-slate-500 font-mono text-xs">{row.campanha_id || '—'}</td>
                    <td className="px-4 py-2.5 text-slate-600">{row.campanha_nome_custom || '—'}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex gap-1.5">
                        <button onClick={() => startEdit(row)} className="p-1.5 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors"><Save size={14} /></button>
                        <button onClick={() => handleDelete(row.id)} className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
