import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export type Assessor = {
  id: string;
  nome: string;
  ativo: boolean;
};

export type ClienteAssessor = {
  assessor_id: string;
  assessor: Assessor;
};

export const useAssessores = () => {
  const [assessores, setAssessores] = useState<Assessor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAssessores = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('assessores')
        .select('id, nome, ativo')
        .eq('ativo', true)
        .order('nome');

      if (error) throw error;
      setAssessores(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar assessores');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAssessores();
  }, [fetchAssessores]);

  const getClienteAssessores = async (clienteId: string): Promise<Assessor[]> => {
    const { data, error } = await supabase
      .from('cliente_assessores')
      .select('assessor_id, assessores(id, nome, ativo)')
      .eq('cliente_id', clienteId);

    if (error) throw error;
    return (data || []).map((ca: any) => ca.assessores);
  };

  /**
   * Define o assessor do cliente. Seleção única: `null` remove o vínculo.
   *
   * `clientes.assessor` guarda o nome puro — nada de nomes concatenados, que é
   * o que exigia o split na leitura.
   */
  const updateClienteAssessor = async (
    clienteId: string,
    assessorId: string | null
  ): Promise<void> => {
    const { error: deleteError } = await supabase
      .from('cliente_assessores')
      .delete()
      .eq('cliente_id', clienteId);

    if (deleteError) throw deleteError;

    if (assessorId) {
      const { error: insertError } = await supabase
        .from('cliente_assessores')
        .insert({ cliente_id: clienteId, assessor_id: assessorId });

      if (insertError) throw insertError;
    }

    const nome = assessores.find(a => a.id === assessorId)?.nome ?? null;

    await supabase
      .from('clientes')
      .update({ assessor: nome })
      .eq('id', clienteId);
  };

  return {
    assessores,
    loading,
    error,
    refetch: fetchAssessores,
    getClienteAssessores,
    updateClienteAssessor,
  };
};
