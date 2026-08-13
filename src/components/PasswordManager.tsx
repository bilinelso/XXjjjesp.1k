import React, { useState, useEffect, useMemo } from 'react';
import CryptoJS from 'crypto-js';
import { Plus, Search, Star, Eye, EyeOff, Copy, Check, Pencil, Trash2, X, Save, Lock, AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase';

const SECRET_KEY = import.meta.env.VITE_CRYPTO_KEY ?? '';
const hasCryptoKey = SECRET_KEY.trim().length > 0;

function encrypt(plain: string): string {
  if (!hasCryptoKey) throw new Error('Chave de criptografia ausente');
  return CryptoJS.AES.encrypt(plain, SECRET_KEY).toString();
}

function decrypt(encrypted: string): string {
  if (!hasCryptoKey) return '';
  try {
    const bytes = CryptoJS.AES.decrypt(encrypted, SECRET_KEY);
    return bytes.toString(CryptoJS.enc.Utf8);
  } catch {
    return '';
  }
}

interface PasswordEntry {
  id: string;
  site: string;
  username: string;
  password: string;
  description: string | null;
  is_favorite: boolean;
  created_at: string;
}

interface FormState {
  site: string;
  username: string;
  password: string;
  description: string;
  is_favorite: boolean;
}

const emptyForm: FormState = {
  site: '',
  username: '',
  password: '',
  description: '',
  is_favorite: false,
};

export function PasswordManager() {
  const [entries, setEntries] = useState<PasswordEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [visiblePasswords, setVisiblePasswords] = useState<Set<string>>(new Set());
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [showFormPassword, setShowFormPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    if (!hasCryptoKey) {
      setLoading(false);
      return;
    }
    loadEntries();
  }, []);

  const loadEntries = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('passwords')
        .select('*')
        .order('is_favorite', { ascending: false })
        .order('site', { ascending: true });

      if (error) throw error;
      setEntries(data || []);
    } catch (err) {
      console.error('Error loading passwords:', err);
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return entries;
    return entries.filter(e =>
      e.site.toLowerCase().includes(q) ||
      e.username.toLowerCase().includes(q) ||
      (e.description || '').toLowerCase().includes(q)
    );
  }, [entries, search]);

  const toggleVisibility = (id: string) => {
    setVisiblePasswords(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const copyToClipboard = async (text: string, key: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedField(key);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setShowFormPassword(false);
    setShowModal(true);
  };

  const openEdit = (entry: PasswordEntry) => {
    setEditingId(entry.id);
    setForm({
      site: entry.site,
      username: entry.username,
      password: decrypt(entry.password),
      description: entry.description || '',
      is_favorite: entry.is_favorite,
    });
    setShowFormPassword(false);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingId(null);
    setForm(emptyForm);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        site: form.site.trim(),
        username: form.username.trim(),
        password: encrypt(form.password),
        description: form.description.trim() || null,
        is_favorite: form.is_favorite,
      };

      if (editingId) {
        const { error } = await supabase.from('passwords').update(payload).eq('id', editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('passwords').insert(payload);
        if (error) throw error;
      }

      closeModal();
      await loadEntries();
    } catch (err) {
      console.error('Error saving password:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.from('passwords').delete().eq('id', id);
      if (error) throw error;
      setDeleteConfirm(null);
      await loadEntries();
    } catch (err) {
      console.error('Error deleting password:', err);
    }
  };

  const handleToggleFavorite = async (entry: PasswordEntry) => {
    try {
      const { error } = await supabase
        .from('passwords')
        .update({ is_favorite: !entry.is_favorite })
        .eq('id', entry.id);
      if (error) throw error;
      setEntries(prev =>
        prev
          .map(e => e.id === entry.id ? { ...e, is_favorite: !e.is_favorite } : e)
          .sort((a, b) => {
            if (b.is_favorite !== a.is_favorite) return b.is_favorite ? 1 : -1;
            return a.site.localeCompare(b.site);
          })
      );
    } catch (err) {
      console.error('Error toggling favorite:', err);
    }
  };

  if (!hasCryptoKey) {
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <div className="bg-purple-100 p-2 rounded-lg">
            <Lock className="text-purple-600" size={20} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900">Gerenciador de Senhas</h3>
            <p className="text-xs text-slate-500">Indisponível</p>
          </div>
        </div>
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
          <AlertTriangle className="text-amber-500 flex-shrink-0 mt-0.5" size={18} />
          <div className="text-sm text-amber-900">
            <p className="font-semibold">Configuração de criptografia ausente</p>
            <p className="mt-1 text-amber-800">
              O gerenciador de senhas está desativado porque a chave de criptografia não foi
              configurada. O administrador precisa definir a variável de ambiente{' '}
              <code className="font-mono bg-amber-100 px-1 py-0.5 rounded">VITE_CRYPTO_KEY</code>{' '}
              e reiniciar a aplicação.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-purple-100 p-2 rounded-lg">
            <Lock className="text-purple-600" size={20} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900">Gerenciador de Senhas</h3>
            <p className="text-xs text-slate-500">Criptografia AES · {entries.length} {entries.length === 1 ? 'entrada' : 'entradas'}</p>
          </div>
        </div>
        <button
          onClick={openCreate}
          className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg flex items-center gap-2 transition-colors text-sm font-medium"
        >
          <Plus size={15} />
          Nova Senha
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
        <input
          type="text"
          placeholder="Buscar por site, usuário ou descrição..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
        />
      </div>

      {/* Grid de cards */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <Lock size={36} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">{search ? 'Nenhuma senha encontrada.' : 'Nenhuma senha cadastrada ainda.'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {filtered.map(entry => {
            const isVisible = visiblePasswords.has(entry.id);
            const plain = decrypt(entry.password);
            const confirmingDelete = deleteConfirm === entry.id;

            return (
              <div
                key={entry.id}
                className={`bg-white border rounded-xl p-4 shadow-sm flex flex-col gap-3 hover:shadow-md transition-shadow ${
                  entry.is_favorite ? 'border-amber-300' : 'border-slate-200'
                }`}
              >
                {/* Topo: site + ações */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {entry.is_favorite && (
                      <Star className="text-amber-400 flex-shrink-0" size={13} fill="currentColor" />
                    )}
                    <span className="font-semibold text-slate-800 text-sm truncate" title={entry.site}>
                      {entry.site}
                    </span>
                  </div>
                  <div className="flex items-center gap-0.5 flex-shrink-0">
                    <button
                      onClick={() => handleToggleFavorite(entry)}
                      title={entry.is_favorite ? 'Remover favorito' : 'Favoritar'}
                      className={`p-1 rounded transition-colors ${
                        entry.is_favorite
                          ? 'text-amber-400 hover:bg-amber-50'
                          : 'text-slate-300 hover:text-amber-400 hover:bg-amber-50'
                      }`}
                    >
                      <Star size={13} fill={entry.is_favorite ? 'currentColor' : 'none'} />
                    </button>
                    <button
                      onClick={() => openEdit(entry)}
                      className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                      title="Editar"
                    >
                      <Pencil size={13} />
                    </button>
                    {confirmingDelete ? (
                      <>
                        <button
                          onClick={() => handleDelete(entry.id)}
                          className="px-1.5 py-0.5 bg-red-600 text-white rounded text-xs font-medium hover:bg-red-700 transition-colors"
                        >
                          OK
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(null)}
                          className="p-1 text-slate-400 hover:text-slate-600 rounded"
                        >
                          <X size={12} />
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => setDeleteConfirm(entry.id)}
                        className="p-1 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                        title="Excluir"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Usuário */}
                <div className="flex items-center gap-2 bg-slate-50 rounded-lg px-2.5 py-1.5">
                  <span className="text-slate-400 text-xs">Usuário</span>
                  <span className="text-xs text-slate-700 truncate flex-1" title={entry.username}>
                    {entry.username || '—'}
                  </span>
                  {entry.username && (
                    <button
                      onClick={() => copyToClipboard(entry.username, `user-${entry.id}`)}
                      className="text-slate-400 hover:text-blue-600 transition-colors flex-shrink-0"
                      title="Copiar usuário"
                    >
                      {copiedField === `user-${entry.id}`
                        ? <Check size={13} className="text-emerald-500" />
                        : <Copy size={13} />}
                    </button>
                  )}
                </div>

                {/* Senha */}
                <div className="flex items-center gap-2 bg-slate-50 rounded-lg px-2.5 py-1.5">
                  <span className="text-slate-400 text-xs">Senha</span>
                  <span className="font-mono text-xs text-slate-700 truncate flex-1">
                    {isVisible ? plain : '••••••••'}
                  </span>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => toggleVisibility(entry.id)}
                      className="text-slate-400 hover:text-slate-600 transition-colors"
                      title={isVisible ? 'Ocultar' : 'Mostrar'}
                    >
                      {isVisible ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                    <button
                      onClick={() => copyToClipboard(plain, `pass-${entry.id}`)}
                      className="text-slate-400 hover:text-blue-600 transition-colors"
                      title="Copiar senha"
                    >
                      {copiedField === `pass-${entry.id}`
                        ? <Check size={13} className="text-emerald-500" />
                        : <Copy size={13} />}
                    </button>
                  </div>
                </div>

                {/* Descrição */}
                {entry.description && (
                  <p className="text-xs text-slate-400 truncate" title={entry.description}>
                    {entry.description}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h4 className="font-semibold text-slate-900">
                {editingId ? 'Editar Senha' : 'Nova Senha'}
              </h4>
              <button onClick={closeModal} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Site <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.site}
                  onChange={e => setForm({ ...form, site: e.target.value })}
                  placeholder="ex: github.com"
                  required
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Usuário / E-mail</label>
                <input
                  type="text"
                  value={form.username}
                  onChange={e => setForm({ ...form, username: e.target.value })}
                  placeholder="usuario@exemplo.com"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Senha <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showFormPassword ? 'text' : 'password'}
                    value={form.password}
                    onChange={e => setForm({ ...form, password: e.target.value })}
                    required
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 pr-10 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowFormPassword(v => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showFormPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Descrição</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                  placeholder="Opcional"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={form.is_favorite}
                  onChange={e => setForm({ ...form, is_favorite: e.target.checked })}
                  className="rounded border-slate-300 text-amber-400 focus:ring-amber-400"
                />
                <span className="text-sm text-slate-700">Marcar como favorito</span>
                <Star size={14} className={form.is_favorite ? 'text-amber-400' : 'text-slate-300'} fill={form.is_favorite ? 'currentColor' : 'none'} />
              </label>

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                >
                  <Save size={15} />
                  {saving ? 'Salvando...' : 'Salvar'}
                </button>
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
