import { useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface Props {
  onClose: () => void;
  onSaved: () => void;
}

function toLocalDatetimeValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function AddLeadManualModal({ onClose, onSaved }: Props) {
  const [form, setForm] = useState({
    nome: '',
    telefone: '',
    email: '',
    campanha: '',
    click_id: '',
    gclid: '',
    url_acesso: '',
    created_at: toLocalDatetimeValue(new Date()),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (field: string, value: string) =>
    setForm(f => ({ ...f, [field]: value }));

  const handleSave = async () => {
    if (!form.nome.trim()) { setError('Nome é obrigatório.'); return; }
    if (!form.telefone.trim()) { setError('Telefone é obrigatório.'); return; }
    setSaving(true);
    setError('');
    const { error: err } = await supabase.from('leads').insert({
      nome: form.nome.trim(),
      telefone: form.telefone.trim(),
      email: form.email.trim() || null,
      campanha: form.campanha.trim() || null,
      click_id: form.click_id.trim() || null,
      gclid: form.gclid.trim() || null,
      url_acesso: form.url_acesso.trim() || null,
      created_at: form.created_at ? new Date(form.created_at).toISOString() : new Date().toISOString(),
    });
    setSaving(false);
    if (err) { setError(err.message); return; }
    onSaved();
    onClose();
  };

  const Field = ({ label, field, placeholder, required }: { label: string; field: string; placeholder?: string; required?: boolean }) => (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <input
        value={(form as Record<string, string>)[field]}
        onChange={e => set(field, e.target.value)}
        placeholder={placeholder}
        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      />
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 flex-shrink-0">
          <h3 className="font-semibold text-slate-800">Adicionar Lead Manual</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto">
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg p-2">{error}</p>}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Nome" field="nome" placeholder="João Silva" required />
            <Field label="Telefone" field="telefone" placeholder="+5581989646751" required />
          </div>

          <Field label="Email" field="email" placeholder="joao@email.com" />

          <div className="grid grid-cols-2 gap-3">
            <Field label="Campanha" field="campanha" placeholder="23173495352" />
            <Field label="Click ID" field="click_id" placeholder="" />
          </div>

          <Field label="GCLID" field="gclid" placeholder="" />
          <Field label="URL de Acesso" field="url_acesso" placeholder="https://..." />

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Data de Cadastro</label>
            <input
              type="datetime-local"
              value={form.created_at}
              onChange={e => set('created_at', e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-200 flex-shrink-0">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-slate-600 border border-slate-300 hover:bg-slate-50">
            Cancelar
          </button>
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-2 rounded-lg text-sm bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-400 flex items-center gap-2">
            {saving && <Loader2 size={14} className="animate-spin" />}
            Salvar Lead
          </button>
        </div>
      </div>
    </div>
  );
}
