const API_BASE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/crm-api`;

export type Lead = {
  url_acesso?: string;
  campanha?: string;
  click_id?: string;
  gclid?: string;
  ip?: string;
  created_at?: string;
};

export type Cliente = {
  id: string;
  nome: string;
  email?: string;
  telefone?: string;
  documento?: string;
  data_compra: string;
  valor_produto: number;
  status: 'comprou' | 'conta-criada' | 'depositou' | 'acompanhamento' | 'problema' | 'finalizado' | 'inativo';
  assessor?: string;
  valor_deposito?: number;
  performance?: number;
  categoria_investimento?: string;
  pais?: string;
  pais_iso?: string;
  moeda?: string;
  valor_pago_moeda_original?: number;
  subscriber_code?: string;
  hotmart_transaction_id?: string;
  oculto: boolean;
  oculto_campanhas?: boolean;
  postback_enviado: boolean;
  postback_enviado_em?: string;
  gclid_enviado: boolean;
  gclid_enviado_em?: string;
  lead?: Lead;
  created_at: string;
  updated_at: string;
  status_updated_at?: string;
  ultimo_contato_at?: string | null;
  profit_moneta?: number | null;
  profit_updated_at?: string | null;
  moneta_id?: string | null;
};

export type Ligacao = {
  id: string;
  cliente_id: string;
  user_id?: string;
  data: string;
  descricao: string;
  status: 'positivo' | 'atencao' | 'problema';
  tipo_origem?: 'manual' | 'agendamento';
  agendamento_id?: string;
  observacao_agendamento?: string;
  created_at: string;
};

export type Agendamento = {
  id: string;
  cliente_id: string;
  data: string;
  hora: string;
  descricao?: string;
  realizado: boolean;
  user_id?: string;
  created_at: string;
  updated_at: string;
};

export type Filtros = {
  dataInicio: string;
  dataFim: string;
  assessor: string;
  status: string;
  categoriaInvestimento: string;
};

class CRMApi {
  private async request<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const response = await fetch(`${API_BASE_URL}/${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        ...options?.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
  }

  async getClientes(): Promise<Cliente[]> {
    return this.request<Cliente[]>('clientes');
  }

  async createCliente(cliente: Omit<Cliente, 'id' | 'created_at' | 'updated_at'>): Promise<Cliente> {
    return this.request<Cliente>('clientes', {
      method: 'POST',
      body: JSON.stringify(cliente),
    });
  }

  async updateCliente(id: string, updates: Partial<Cliente>): Promise<Cliente> {
    return this.request<Cliente>(`clientes/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  async deleteCliente(id: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`clientes/${id}`, {
      method: 'DELETE',
    });
  }

  async getLigacoes(clienteId: string): Promise<Ligacao[]> {
    return this.request<Ligacao[]>(`ligacoes?cliente_id=${clienteId}`);
  }

  async createLigacao(ligacao: Omit<Ligacao, 'id' | 'created_at'>): Promise<Ligacao> {
    return this.request<Ligacao>('ligacoes', {
      method: 'POST',
      body: JSON.stringify(ligacao),
    });
  }

  async updateLigacao(id: string, updates: Partial<Ligacao>): Promise<Ligacao> {
    return this.request<Ligacao>(`ligacoes/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  async deleteLigacao(id: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`ligacoes/${id}`, {
      method: 'DELETE',
    });
  }

  async getAgendamentos(clienteId?: string): Promise<Agendamento[]> {
    const endpoint = clienteId ? `agendamentos?cliente_id=${clienteId}` : 'agendamentos';
    return this.request<Agendamento[]>(endpoint);
  }

  async createAgendamento(agendamento: Omit<Agendamento, 'id' | 'created_at' | 'updated_at'>): Promise<Agendamento> {
    return this.request<Agendamento>('agendamentos', {
      method: 'POST',
      body: JSON.stringify(agendamento),
    });
  }

  async updateAgendamento(id: string, updates: Partial<Agendamento>): Promise<Agendamento> {
    return this.request<Agendamento>(`agendamentos/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  async deleteAgendamento(id: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`agendamentos/${id}`, {
      method: 'DELETE',
    });
  }

  async syncLeads(): Promise<{ success: boolean; total_vinculados: number; vinculados_por_email: number; vinculados_por_telefone: number }> {
    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-leads`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Sync failed' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
  }
}

export const api = new CRMApi();

export interface DepositoHistorico {
  id: string;
  cliente_id: string;
  valor_anterior: number | null;
  valor_novo: number;
  diferenca: number;
  percentual_mudanca: number | null;
  fonte: 'extensao' | 'manual' | 'sistema';
  created_at: string;
}

export async function fetchDepositoHistorico(clienteId: string): Promise<DepositoHistorico[]> {
  const { supabase } = await import('./supabase');
  const { data, error } = await supabase
    .from('deposito_historico')
    .select('*')
    .eq('cliente_id', clienteId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}
