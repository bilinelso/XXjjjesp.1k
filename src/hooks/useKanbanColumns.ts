import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export interface KanbanColumn {
  id: string;
  status_key: string;
  display_name: string;
  ordem: number;
}

export const useKanbanColumns = () => {
  const [columns, setColumns] = useState<KanbanColumn[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchColumns = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('kanban_columns')
        .select('*')
        .order('ordem', { ascending: true });

      if (error) throw error;
      setColumns(data || []);
    } catch (error) {
      console.error('Erro ao buscar colunas do Kanban:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateColumnName = async (id: string, newName: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const { error } = await supabase
        .from('kanban_columns')
        .update({ display_name: newName })
        .eq('id', id);

      if (error) throw error;

      setColumns(prev =>
        prev.map(col => (col.id === id ? { ...col, display_name: newName } : col))
      );

      return { success: true };
    } catch (error) {
      console.error('Erro ao atualizar nome da coluna:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido'
      };
    }
  };

  const getDisplayName = (statusKey: string): string => {
    const column = columns.find(col => col.status_key === statusKey);
    return column?.display_name || statusKey;
  };

  useEffect(() => {
    fetchColumns();
  }, []);

  return {
    columns,
    loading,
    updateColumnName,
    getDisplayName,
    fetchColumns
  };
};
