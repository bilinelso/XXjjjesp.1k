import React, { useState, useEffect } from 'react';
import { UserPlus, Trash2, CreditCard as Edit2, Save, X, Shield, Users } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { UserProfile } from '../contexts/AuthContext';

const formatarDataSomente = (dataString: string): string => {
  const date = new Date(dataString);
  const dia = String(date.getDate()).padStart(2, '0');
  const mes = String(date.getMonth() + 1).padStart(2, '0');
  const ano = date.getFullYear();
  return `${dia}/${mes}/${ano}`;
};

export function UserManagement() {
  const { profile } = useAuth();
  const isMasterOriginal = profile?.email === 'contato@stratefinance.com.br';
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [newUser, setNewUser] = useState({
    email: '',
    password: '',
    can_access_leads: false,
    can_access_dashboard: false,
    can_access_kanban: false,
    can_access_agendamentos: false,
    can_access_config: false,
    can_access_formularios: false,
    can_access_whatsapp: false,
    can_access_campanhas: false,
    can_access_passwords: false,
  });

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setUsers(data || []);
    } catch (error) {
      console.error('Error loading users:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-user`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
          },
          body: JSON.stringify({
            email: newUser.email,
            password: newUser.password,
            permissions: {
              can_access_leads: newUser.can_access_leads,
              can_access_dashboard: newUser.can_access_dashboard,
              can_access_kanban: newUser.can_access_kanban,
              can_access_agendamentos: newUser.can_access_agendamentos,
              can_access_config: newUser.can_access_config,
              can_access_formularios: newUser.can_access_formularios,
              can_access_whatsapp: newUser.can_access_whatsapp,
              can_access_campanhas: newUser.can_access_campanhas,
              can_access_passwords: newUser.can_access_passwords,
            }
          })
        }
      );

      const responseData = await response.json();
      if (!response.ok) {
        throw new Error(responseData.error || 'Erro ao criar usuário');
      }

      // Cria assessor vinculado ao novo usuário
      const novoUserId = responseData.user?.id ?? responseData.id;
      if (novoUserId) {
        let assessorId: string | null = null;
        const nomeBase = newUser.email.split('@')[0];
        const nomeFormatado = nomeBase.charAt(0).toUpperCase() + nomeBase.slice(1).toLowerCase();

        const { data: existing, error: existingError } = await supabase
          .from('assessores')
          .select('id')
          .eq('user_id', novoUserId)
          .maybeSingle();

        if (existingError) throw existingError;

        if (!existing) {
          const { data: existingByName, error: existingByNameError } = await supabase
            .from('assessores')
            .select('id, user_id')
            .ilike('nome', nomeFormatado)
            .limit(1)
            .maybeSingle();

          if (existingByNameError) throw existingByNameError;

          if (existingByName && !existingByName.user_id) {
            const { data: linkedAssessor, error: linkAssessorError } = await supabase
              .from('assessores')
              .update({ user_id: novoUserId })
              .eq('id', existingByName.id)
              .select('id')
              .single();

            if (linkAssessorError) throw linkAssessorError;
            assessorId = linkedAssessor.id;
          } else {
            const assessorName = existingByName ? `${nomeFormatado} (${newUser.email})` : nomeFormatado;
            const { data: novoAssessor, error: createAssessorError } = await supabase
              .from('assessores')
              .insert({ nome: assessorName, ativo: true, user_id: novoUserId })
              .select('id')
              .single();

            if (createAssessorError) throw createAssessorError;
            assessorId = novoAssessor.id;
          }
        } else {
          assessorId = existing.id;
        }

        if (assessorId) {
          const { error: profileAssessorError } = await supabase
            .from('user_profiles')
            .update({ assessor_id: assessorId })
            .eq('id', novoUserId);

          if (profileAssessorError) throw profileAssessorError;

          const { error: availabilityError } = await supabase
            .from('assessor_availability')
            .upsert({ assessor_id: assessorId, is_available: true }, { onConflict: 'assessor_id' });

          if (availabilityError) throw availabilityError;
        }
      }

      setShowAddForm(false);
      setNewUser({
        email: '',
        password: '',
        can_access_leads: false,
        can_access_dashboard: false,
        can_access_kanban: false,
        can_access_agendamentos: false,
        can_access_config: false,
        can_access_formularios: false,
        can_access_whatsapp: false,
        can_access_campanhas: false,
        can_access_passwords: false,
      });
      await loadUsers();
    } catch (error: any) {
      console.error('Error creating user:', error);
      alert(error?.message || 'Erro ao criar usuario');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePermissions = async (userId: string, permissions: Partial<UserProfile>) => {
    try {
      const { error } = await supabase
        .from('user_profiles')
        .update(permissions)
        .eq('id', userId);

      if (error) throw error;

      setEditingUser(null);
      await loadUsers();
    } catch (error) {
      console.error('Error updating permissions:', error);
    }
  };

  const handleToggleMaster = async (userId: string, isMaster: boolean) => {
    if (!isMasterOriginal) return;

    if (isMaster) {
      const { count } = await supabase
        .from('user_profiles')
        .select('*', { count: 'exact', head: true })
        .eq('is_master', true);
      if ((count ?? 0) <= 1) {
        alert('Não é possível remover o último master.');
        return;
      }
    }

    if (!confirm(isMaster
      ? 'Remover privilégio master deste usuário?'
      : 'Tornar este usuário master?'
    )) return;

    await supabase
      .from('user_profiles')
      .update({ is_master: !isMaster })
      .eq('id', userId);

    loadUsers();
  };

  const handleDeleteUser = async (userId: string, email: string) => {
    if (!confirm(`Remover o usuário ${email}?`)) return;

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/delete-user`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
          },
          body: JSON.stringify({ userId })
        }
      );

      if (!response.ok) {
        throw new Error('Erro ao remover usuário');
      }

      await loadUsers();
    } catch (error: any) {
      console.error('Error deleting user:', error);
    }
  };

  if (loading && users.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold text-slate-900">Gerenciamento de Usuários</h3>
          <p className="text-sm text-slate-500 mt-1">Adicione e gerencie usuários e suas permissões</p>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
        >
          <UserPlus size={18} />
          Novo Usuário
        </button>
      </div>

      {showAddForm && (
        <form onSubmit={handleCreateUser} className="bg-slate-50 p-6 rounded-lg border border-slate-200">
          <h4 className="font-semibold text-slate-900 mb-4">Adicionar Novo Usuário</h4>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">E-mail</label>
              <input
                type="email"
                value={newUser.email}
                onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Senha</label>
              <input
                type="password"
                value={newUser.password}
                onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
                required
                minLength={6}
              />
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-2">Permissões de Acesso</label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {[
                { key: 'can_access_leads', label: 'Clientes' },
                { key: 'can_access_dashboard', label: 'Dashboard' },
                { key: 'can_access_kanban', label: 'Kanban' },
                { key: 'can_access_agendamentos', label: 'Agendamentos' },
                { key: 'can_access_config', label: 'Configurações' },
                { key: 'can_access_formularios', label: 'Formulários' },
                { key: 'can_access_whatsapp', label: 'WhatsApp' },
                ...(isMasterOriginal ? [{ key: 'can_access_campanhas', label: 'Campanhas' }] : []),
                { key: 'can_access_passwords', label: 'Senhas' },
              ].map(({ key, label }) => (
                <label key={key} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newUser[key as keyof typeof newUser] as boolean}
                    onChange={(e) => setNewUser({ ...newUser, [key]: e.target.checked })}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-slate-700">{label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50"
            >
              <Save size={16} />
              Criar Usuário
            </button>
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
            >
              <X size={16} />
              Cancelar
            </button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-6 py-4 text-sm font-semibold text-slate-700">Usuário</th>
              <th className="text-left px-6 py-4 text-sm font-semibold text-slate-700">Tipo</th>
              <th className="text-left px-6 py-4 text-sm font-semibold text-slate-700">Permissões</th>
              <th className="text-right px-6 py-4 text-sm font-semibold text-slate-700">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="bg-blue-100 p-2 rounded-lg">
                      <Users className="text-blue-600" size={20} />
                    </div>
                    <div>
                      <div className="font-medium text-slate-900">{user.email}</div>
                      <div className="text-xs text-slate-500">
                        Criado em {formatarDataSomente(user.created_at)}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  {user.is_master ? (
                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-gradient-to-r from-amber-100 to-orange-100 text-orange-700">
                      <Shield size={14} />
                      Master
                    </span>
                  ) : (
                    <span className="inline-flex px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
                      Usuário
                    </span>
                  )}
                </td>
                <td className="px-6 py-4">
                  {editingUser === user.id ? (
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { key: 'can_access_leads', label: 'Clientes' },
                        { key: 'can_access_dashboard', label: 'Dashboard' },
                        { key: 'can_access_kanban', label: 'Kanban' },
                        { key: 'can_access_agendamentos', label: 'Agendamentos' },
                        { key: 'can_access_config', label: 'Config' },
                        { key: 'can_access_formularios', label: 'Formulários' },
                        { key: 'can_access_whatsapp', label: 'WhatsApp' },
                        ...(isMasterOriginal ? [{ key: 'can_access_campanhas', label: 'Campanhas' }] : []),
                        { key: 'can_access_passwords', label: 'Senhas' },
                      ].map(({ key, label }) => (
                        <label key={key} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={user[key as keyof UserProfile] as boolean}
                            onChange={(e) => {
                              const updatedUsers = users.map(u =>
                                u.id === user.id ? { ...u, [key]: e.target.checked } : u
                              );
                              setUsers(updatedUsers);
                            }}
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-xs text-slate-700">{label}</span>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {user.can_access_leads && (
                        <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs">Clientes</span>
                      )}
                      {user.can_access_dashboard && (
                        <span className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded text-xs">Dashboard</span>
                      )}
                      {user.can_access_kanban && (
                        <span className="px-2 py-1 bg-violet-100 text-violet-700 rounded text-xs">Kanban</span>
                      )}
                      {user.can_access_agendamentos && (
                        <span className="px-2 py-1 bg-cyan-100 text-cyan-700 rounded text-xs">Agendamentos</span>
                      )}
                      {user.can_access_config && (
                        <span className="px-2 py-1 bg-orange-100 text-orange-700 rounded text-xs">Config</span>
                      )}
                      {user.can_access_formularios && (
                        <span className="px-2 py-1 bg-pink-100 text-pink-700 rounded text-xs">Formulários</span>
                      )}
                      {user.can_access_whatsapp && (
                        <span className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded text-xs">WhatsApp</span>
                      )}
                      {user.can_access_campanhas && (
                        <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs">Campanhas</span>
                      )}
                      {user.can_access_passwords && (
                        <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs">Senhas</span>
                      )}
                      {!user.can_access_leads && !user.can_access_dashboard && !user.can_access_kanban &&
                       !user.can_access_agendamentos && !user.can_access_config && !user.can_access_formularios && !user.can_access_whatsapp && !user.can_access_campanhas && !user.can_access_passwords && !user.is_master && (
                        <span className="text-xs text-slate-500">Sem permissões</span>
                      )}
                    </div>
                  )}
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    {isMasterOriginal && user.id !== profile?.id && (
                      <button
                        onClick={() => handleToggleMaster(user.id, user.is_master)}
                        className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${
                          user.is_master
                            ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {user.is_master ? '★ Master' : 'Tornar Master'}
                      </button>
                    )}
                    {!user.is_master && (
                      editingUser === user.id ? (
                        <>
                          <button
                            onClick={() => handleUpdatePermissions(user.id, user)}
                            className="text-emerald-600 hover:text-emerald-800 p-2 hover:bg-emerald-50 rounded transition-colors"
                          >
                            <Save size={18} />
                          </button>
                          <button
                            onClick={() => {
                              setEditingUser(null);
                              loadUsers();
                            }}
                            className="text-slate-600 hover:text-slate-800 p-2 hover:bg-slate-100 rounded transition-colors"
                          >
                            <X size={18} />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => setEditingUser(user.id)}
                            className="text-blue-600 hover:text-blue-800 p-2 hover:bg-blue-50 rounded transition-colors"
                          >
                            <Edit2 size={18} />
                          </button>
                          <button
                            onClick={() => handleDeleteUser(user.id, user.email)}
                            className="text-red-600 hover:text-red-800 p-2 hover:bg-red-50 rounded transition-colors"
                          >
                            <Trash2 size={18} />
                          </button>
                        </>
                      )
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
