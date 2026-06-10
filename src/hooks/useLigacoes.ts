import { useState } from 'react';
import { api, type Ligacao } from '../lib/api';

export const useLigacoes = () => {
  const [loading, setLoading] = useState(false);

  const fetchLigacoes = async (clienteId: string): Promise<Ligacao[]> => {
    try {
      setLoading(true);
      const data = await api.getLigacoes(clienteId);
      return data || [];
    } catch (err) {
      console.error('useLigacoes fetchLigacoes:', err);
      return [];
    } finally {
      setLoading(false);
    }
  };

  const createLigacao = async (ligacaoData: Omit<Ligacao, 'id' | 'created_at'>) => {
    try {
      setLoading(true);
      const data = await api.createLigacao(ligacaoData);
      return { success: true, data, error: null };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao criar ligação';
      console.error('useLigacoes createLigacao:', err);
      return { success: false, data: null, error: errorMessage };
    } finally {
      setLoading(false);
    }
  };

  return {
    loading,
    fetchLigacoes,
    createLigacao
  };
};
