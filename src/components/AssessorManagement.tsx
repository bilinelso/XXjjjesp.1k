import { useState, useEffect } from 'react';
import { Plus, Trash2, UserCheck, UserX, X } from 'lucide-react';
import { supabase } from '../lib/supabase';

export type Assessor = {
  id: string;
  nome: string;
  ativo: boolean;
  created_at: string;
  updated_at: string;
};

export const AssessorManagement = () => {
  const [assessores, setAssessores] = useState<Assessor[]>([]);
  const [loading, setLoading] = useState(true);
  const [newAssessorName, setNewAssessorName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAssessores();
  }, []);

  const fetchAssessores = async () => {
    try {
      const { data, error } = await supabase
        .from('assessores')
        .select('*')
        .order('nome');

      if (error) throw error;
      setAssessores(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar assessores');
    } finally {
      setLoading(false);
    }
  };

  const addAssessor = async () => {
    if (!newAssessorName.trim()) return;

    setSaving(true);
    setError(null);

    try {
      const capitalizedName = newAssessorName.trim()
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');

      const { data, error } = await supabase
        .from('assessores')
        .insert({ nome: capitalizedName, ativo: true })
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          throw new Error('Assessor com este nome ja existe');
        }
        throw error;
      }

      setAssessores(prev => [...prev, data].sort((a, b) => a.nome.localeCompare(b.nome)));
      setNewAssessorName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao adicionar assessor');
    } finally {
      setSaving(false);
    }
  };

  const toggleAssessorStatus = async (assessor: Assessor) => {
    try {
      const { error } = await supabase
        .from('assessores')
        .update({ ativo: !assessor.ativo })
        .eq('id', assessor.id);

      if (error) throw error;

      setAssessores(prev => prev.map(a =>
        a.id === assessor.id ? { ...a, ativo: !a.ativo } : a
      ));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar assessor');
    }
  };

  const deleteAssessor = async (assessor: Assessor) => {
    if (!confirm(`Tem certeza que deseja remover "${assessor.nome}"? Os clientes vinculados a este assessor perderao este vinculo.`)) {
      return;
    }

    try {
      setError(null);

      const { error: availabilityError } = await supabase
        .from('assessor_availability')
        .delete()
        .eq('assessor_id', assessor.id);

      if (availabilityError) throw availabilityError;

      const { error: profileError } = await supabase
        .from('user_profiles')
        .update({ assessor_id: null })
        .eq('assessor_id', assessor.id);

      if (profileError) throw profileError;

      const { error: relationError } = await supabase
        .from('cliente_assessores')
        .delete()
        .eq('assessor_id', assessor.id);

      if (relationError) throw relationError;

      const { data: clientesVinculados, error: clientesError } = await supabase
        .from('clientes')
        .select('id, assessor')
        .ilike('assessor', `%${assessor.nome}%`);

      if (clientesError) throw clientesError;

      for (const cliente of clientesVinculados || []) {
        const assessoresAtualizados = (cliente.assessor || '')
          .split('/')
          .map((nome: string) => nome.trim())
          .filter(Boolean)
          .filter((nome: string) => nome.toLowerCase() !== assessor.nome.toLowerCase())
          .join('/');

        if (assessoresAtualizados !== cliente.assessor) {
          const { error: clienteUpdateError } = await supabase
            .from('clientes')
            .update({ assessor: assessoresAtualizados || null })
            .eq('id', cliente.id);

          if (clienteUpdateError) throw clienteUpdateError;
        }
      }

      const { error } = await supabase
        .from('assessores')
        .delete()
        .eq('id', assessor.id);

      if (error) throw error;

      setAssessores(prev => prev.filter(a => a.id !== assessor.id));
    } catch (err) {
      console.error('Erro ao remover assessor:', err);
      setError(err instanceof Error ? err.message : 'Erro ao remover assessor');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="p-4 border-b border-gray-200">
        <h3 className="text-lg font-semibold text-gray-800">Gerenciar Assessores</h3>
        <p className="text-sm text-gray-500 mt-1">
          Configure quais assessores estarao disponiveis para selecao nos clientes
        </p>
      </div>

      {error && (
        <div className="mx-4 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between">
          <span className="text-sm text-red-700">{error}</span>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="p-4">
        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={newAssessorName}
            onChange={(e) => setNewAssessorName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addAssessor()}
            placeholder="Nome do novo assessor"
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          <button
            onClick={addAssessor}
            disabled={saving || !newAssessorName.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {saving ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
            Adicionar
          </button>
        </div>

        <div className="space-y-2">
          {assessores.length === 0 ? (
            <p className="text-center text-gray-500 py-4">
              Nenhum assessor cadastrado
            </p>
          ) : (
            assessores.map(assessor => (
              <div
                key={assessor.id}
                className={`flex items-center justify-between p-3 rounded-lg border ${
                  assessor.ativo
                    ? 'bg-green-50 border-green-200'
                    : 'bg-gray-50 border-gray-200'
                }`}
              >
                <div className="flex items-center gap-3">
                  {assessor.ativo ? (
                    <UserCheck className="w-5 h-5 text-green-600" />
                  ) : (
                    <UserX className="w-5 h-5 text-gray-400" />
                  )}
                  <span className={assessor.ativo ? 'text-gray-800' : 'text-gray-500'}>
                    {assessor.nome}
                  </span>
                  {!assessor.ativo && (
                    <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded">
                      Inativo
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleAssessorStatus(assessor)}
                    className={`p-2 rounded-lg transition-colors ${
                      assessor.ativo
                        ? 'text-amber-600 hover:bg-amber-100'
                        : 'text-green-600 hover:bg-green-100'
                    }`}
                    title={assessor.ativo ? 'Desativar' : 'Ativar'}
                  >
                    {assessor.ativo ? (
                      <UserX className="w-4 h-4" />
                    ) : (
                      <UserCheck className="w-4 h-4" />
                    )}
                  </button>
                  <button
                    onClick={() => deleteAssessor(assessor)}
                    className="p-2 text-red-600 hover:bg-red-100 rounded-lg transition-colors"
                    title="Remover"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
