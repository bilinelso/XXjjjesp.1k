import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export interface Lead {
  id: string;
  nome: string;
  telefone: string;
  click_id: string | null;
  gclid: string | null;
  ip: string | null;
  url_acesso: string | null;
  campanha: string | null;
  created_at: string;
}

export function useLeads() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLeads = async () => {
    try {
      setLoading(true);

      let allLeads: Lead[] = [];
      let start = 0;
      const batchSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from('leads')
          .select('*')
          .order('created_at', { ascending: false })
          .range(start, start + batchSize - 1);

        if (error) throw error;

        if (data && data.length > 0) {
          allLeads = [...allLeads, ...data];
          start += batchSize;
          hasMore = data.length === batchSize;
        } else {
          hasMore = false;
        }
      }

      setLeads(allLeads);
    } catch (error) {
      console.error('Error fetching leads:', error);
      setLeads([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeads();
  }, []);

  return {
    leads,
    loading,
    fetchLeads
  };
}
