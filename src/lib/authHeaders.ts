import { supabase } from './supabase';

/**
 * Headers para chamar Edge Functions como o USUÁRIO LOGADO.
 * Nunca usar a anon key no Authorization: ela é pública e não identifica ninguém.
 */
export async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('Sessão expirada. Faça login novamente.');
  }
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${session.access_token}`,
  };
}
