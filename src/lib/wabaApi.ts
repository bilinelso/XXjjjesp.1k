import { supabase } from './supabase';

// ── WhatsApp Business API (Cloud API / Meta) ─────────────────────────────────
// Todo envio passa pela Edge Function `waba-proxy`, autenticada com a sessão do
// usuário logado. A função é quem grava em `waba_messages` — o frontend nunca
// insere mensagem direto (RLS não permite e geraria duplicata).
//
// Este módulo não tem relação alguma com o WhatsApp não oficial (QR Code).

const PROXY_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/waba-proxy`;

export type WabaErrorCode =
  | 'WINDOW_CLOSED'
  | 'TEMPLATE_NOT_APPROVED'
  | 'RATE_LIMITED'
  | 'SEND_FAILED';

export interface WabaSendSuccess {
  success: true;
  wamid: string;
}

export interface WabaSendError {
  success: false;
  error_code: WabaErrorCode;
  message: string;
}

export type WabaSendResult = WabaSendSuccess | WabaSendError;

type SendTextPayload = {
  action: 'send_text';
  chat_id: string;
  text: string;
};

type SendTemplatePayload = {
  action: 'send_template';
  chat_id: string;
  template_name: string;
  language: string;
  variables: string[];
};

async function wabaProxy(payload: SendTextPayload | SendTemplatePayload): Promise<WabaSendResult> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY;

  let response: Response;
  try {
    response = await fetch(PROXY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
  } catch {
    return { success: false, error_code: 'SEND_FAILED', message: 'Falha de conexão com o servidor.' };
  }

  const body = await response.json().catch(() => null) as Partial<WabaSendResult> | null;

  if (body && typeof body === 'object' && 'success' in body) {
    return body as WabaSendResult;
  }

  return {
    success: false,
    error_code: 'SEND_FAILED',
    message: `Erro inesperado do servidor (HTTP ${response.status}).`,
  };
}

export const wabaApi = {
  sendText(chat_id: string, text: string): Promise<WabaSendResult> {
    return wabaProxy({ action: 'send_text', chat_id, text });
  },

  sendTemplate(
    chat_id: string,
    template_name: string,
    language: string,
    variables: string[]
  ): Promise<WabaSendResult> {
    return wabaProxy({ action: 'send_template', chat_id, template_name, language, variables });
  },
};

// ── Tipos das tabelas waba_* ─────────────────────────────────────────────────

export interface WabaContact {
  id: string;
  waba_number_id: string;
  contact_phone: string;
  contact_name: string | null;
  cliente_id: string | null;
  last_inbound_at: string | null;
}

export interface WabaChat {
  id: string;
  waba_contact_id: string;
  assessor_user_id: string;
  is_active: boolean;
  last_message_text: string | null;
  last_message_timestamp: string | null;
  last_message_from_me: boolean | null;
  unread_count: number | null;
}

export type WabaMessageStatus = 'received' | 'sent' | 'delivered' | 'read' | 'failed';

export interface WabaMessage {
  id: string;
  chat_id: string;
  wamid: string | null;
  from_me: boolean;
  sent_by_user_id: string | null;
  message_text: string | null;
  message_type: string;
  media_url: string | null;
  status: WabaMessageStatus | string | null;
  timestamp: string;
  template_name: string | null;
  template_variables: unknown;
  pricing_category: string | null;
}

export interface WabaTemplate {
  id: string;
  name: string;
  category: string;
  language: string;
  status: string;
  components: unknown;
}

/** Chat com o contato (e cliente vinculado) embutidos pelo PostgREST. */
export interface WabaChatWithContact extends WabaChat {
  waba_contacts: (WabaContact & { clientes: { id: string; nome: string } | null }) | null;
}
