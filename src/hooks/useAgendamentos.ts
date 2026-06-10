import { useState } from 'react';
import { api, type Agendamento } from '../lib/api';

export const useAgendamentos = () => {
  const [loading, setLoading] = useState(false);

  const fetchAgendamento = async (clienteId: string): Promise<Agendamento | null> => {
    try {
      setLoading(true);
      const data = await api.getAgendamentos(clienteId);
      const activeAgendamento = data.find(a => !a.realizado) || null;
      return activeAgendamento;
    } catch (err) {
      console.error('useAgendamentos fetchAgendamento:', err);
      return null;
    } finally {
      setLoading(false);
    }
  };

  const fetchAllAgendamentos = async (): Promise<Agendamento[]> => {
    try {
      setLoading(true);
      const data = await api.getAgendamentos();
      return data
        .filter(a => !a.realizado && a.data && a.hora)
        .sort((a, b) => {
          if (a.data === b.data) {
            return (a.hora || '').localeCompare(b.hora || '');
          }
          return (a.data || '').localeCompare(b.data || '');
        });
    } catch (err) {
      console.error('useAgendamentos fetchAllAgendamentos:', err);
      return [];
    } finally {
      setLoading(false);
    }
  };

  const createAgendamento = async (agendamentoData: Omit<Agendamento, 'id' | 'created_at' | 'updated_at'>) => {
    try {
      setLoading(true);

      const existingAgendamentos = await api.getAgendamentos(agendamentoData.cliente_id);
      const activeAgendamentos = existingAgendamentos.filter(a => !a.realizado);

      for (const agendamento of activeAgendamentos) {
        await api.updateAgendamento(agendamento.id, { realizado: true });
      }

      const data = await api.createAgendamento(agendamentoData);
      return { success: true, data, error: null };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao criar agendamento';
      console.error('useAgendamentos createAgendamento:', err);
      return { success: false, data: null, error: errorMessage };
    } finally {
      setLoading(false);
    }
  };

  const updateAgendamento = async (id: string, updates: Partial<Agendamento>) => {
    try {
      setLoading(true);
      const data = await api.updateAgendamento(id, updates);
      return { success: true, data, error: null };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao atualizar agendamento';
      console.error('useAgendamentos updateAgendamento:', err);
      return { success: false, data: null, error: errorMessage };
    } finally {
      setLoading(false);
    }
  };

  const deleteAgendamento = async (id: string) => {
    try {
      setLoading(true);
      await api.deleteAgendamento(id);
      return { success: true, error: null };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro ao deletar agendamento';
      console.error('useAgendamentos deleteAgendamento:', err);
      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  };

  return {
    loading,
    fetchAgendamento,
    fetchAllAgendamentos,
    createAgendamento,
    updateAgendamento,
    deleteAgendamento
  };
};
