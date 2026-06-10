import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Cliente = {
  id: string;
  nome: string;
  email: string;
  telefone: string;
  documento?: string;
  data_compra: string;
  valor_produto: number;
  status: 'comprou' | 'conta-criada' | 'depositou' | 'acompanhamento' | 'problema';
  assessor?: string;
  valor_deposito?: number;
  performance?: number;
  pais?: string;
  pais_iso?: string;
  moeda?: string;
  valor_pago_moeda_original?: number;
  subscriber_code?: string;
  hotmart_transaction_id?: string;
  created_at: string;
  updated_at: string;
};

export type Ligacao = {
  id: string;
  cliente_id: string;
  user_id?: string;
  data: string;
  descricao: string;
  status: 'positivo' | 'atencao' | 'problema';
  created_at: string;
};

export type Agendamento = {
  id: string;
  cliente_id: string;
  data: string;
  hora: string;
  realizado: boolean;
  user_id?: string;
  created_at: string;
  updated_at: string;
};

export type Compra = {
  id: string;
  cliente_id: string;
  produto_nome: string;
  produto_id: number;
  valor: number;
  moeda: string;
  hotmart_transaction_id: string;
  data_compra: string;
  created_at: string;
};

export type Problema = {
  id: string;
  cliente_id: string;
  descricao: string;
  resolvido: boolean;
  created_at: string;
  resolved_at?: string;
};

export type Filtros = {
  dataInicio: string;
  dataFim: string;
  assessor: string;
  status: string;
};
