import { useState, useEffect } from 'react';
import { api, type Cliente, type Filtros } from '../lib/api';
import { normalizeAssessor } from '../utils/formatters';

export const useClientes = () => {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchClientes = async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      if (isRefresh) {
        try {
          await api.syncLeads();
        } catch (syncError) {
          console.warn('Sync leads warning:', syncError);
        }
      }

      const data = await api.getClientes();
      setClientes(data || []);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao carregar clientes';
      console.error('useClientes fetchClientes:', err);
      setError(errorMessage);
    } finally {
      if (isRefresh) {
        setRefreshing(false);
      } else {
        setLoading(false);
      }
    }
  };

  const createCliente = async (clienteData: Omit<Cliente, 'id' | 'created_at' | 'updated_at'>) => {
    try {
      const data = await api.createCliente(clienteData);

      if (data) {
        setClientes(prev => [...prev, data]);
      }

      return { success: true, data, error: null };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao criar cliente';
      console.error('useClientes createCliente:', err);
      return { success: false, data: null, error: errorMessage };
    }
  };

  const updateCliente = async (id: string, updates: Partial<Cliente>) => {
    const previousClientes = [...clientes];

    try {
      setClientes(prev =>
        prev.map(c => c.id === id ? { ...c, ...updates } : c)
      );

      const data = await api.updateCliente(id, updates);
      return { success: true, data, error: null };
    } catch (err) {
      setClientes(previousClientes);

      const errorMessage = err instanceof Error ? err.message : 'Erro ao atualizar cliente';
      console.error('useClientes updateCliente:', err);
      return { success: false, data: null, error: errorMessage };
    }
  };

  const deleteCliente = async (id: string) => {
    const previousClientes = [...clientes];

    try {
      setClientes(prev => prev.filter(c => c.id !== id));

      await api.deleteCliente(id);
      return { success: true, error: null };
    } catch (err) {
      setClientes(previousClientes);

      const errorMessage = err instanceof Error ? err.message : 'Erro ao deletar cliente';
      console.error('useClientes deleteCliente:', err);
      return { success: false, error: errorMessage };
    }
  };

  const filtrarClientes = (filtros: Filtros): Cliente[] => {
    let resultado = [...clientes];

    // O recorte de data é pela atribuição ao assessor, não pela compra.
    if (filtros.dataInicio) {
      resultado = resultado.filter(c => {
        const da = c.data_atribuicao;
        return !!da && da.slice(0, 10) >= filtros.dataInicio;
      });
    }

    if (filtros.dataFim) {
      resultado = resultado.filter(c => {
        const da = c.data_atribuicao;
        return !!da && da.slice(0, 10) <= filtros.dataFim;
      });
    }

    if (filtros.assessor && filtros.assessor !== 'todas') {
      // Um cliente tem no máximo um assessor: comparação direta do nome
      // normalizado, sem lista separada por barra.
      const assessorNormalized = normalizeAssessor(filtros.assessor);
      resultado = resultado.filter(
        c => !!c.assessor && normalizeAssessor(c.assessor) === assessorNormalized
      );
    }

    if (filtros.status && filtros.status !== 'todos') {
      resultado = resultado.filter(c => c.status === filtros.status);
    }

    return resultado;
  };

  useEffect(() => {
    fetchClientes();
  }, []);

  return {
    clientes,
    loading,
    refreshing,
    error,
    createCliente,
    updateCliente,
    deleteCliente,
    filtrarClientes,
    fetchClientes
  };
};
