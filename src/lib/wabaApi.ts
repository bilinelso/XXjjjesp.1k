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
  /** Presente no `send_audio`: URL da mídia já cacheada no Storage. */
  media_url?: string;
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

type SendAudioPayload = {
  action: 'send_audio';
  chat_id: string;
  audio_base64: string;
  mime_type: string;
  duration_seconds: number;
};

export type WabaMediaKind = 'image' | 'document';

type SendMediaPayload = {
  action: 'send_media';
  chat_id: string;
  media_kind: WabaMediaKind;
  file_base64: string;
  mime_type: string;
  caption?: string;
  /** Obrigatório para document — nome original do arquivo. */
  filename?: string;
};

async function wabaProxy(
  payload: SendTextPayload | SendTemplatePayload | SendAudioPayload | SendMediaPayload
): Promise<WabaSendResult> {
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

// ── Abertura de conversa ─────────────────────────────────────────────────────
// A RPC `waba_open_chat` devolve a thread do par (contato, assessor) — a
// existente ou uma recém-criada — e aplica sozinha a regra de permissão usando
// o usuário da sessão. A regra NÃO é replicada aqui de propósito: duplicada,
// as duas versões divergiriam com o tempo.

export type WabaOpenChatResult =
  | { success: true; chat_id: string }
  | { success: false; message: string };

/** A RPC levanta exceção; o código vem dentro de `error.message`. */
const OPEN_CHAT_MESSAGES: Record<string, string> = {
  WABA_SEM_PERMISSAO: 'Este cliente está atribuído a outro assessor.',
  WABA_CLIENTE_SEM_TELEFONE: 'Este cliente não tem telefone cadastrado.',
  WABA_SEM_NUMERO_ATIVO: 'Nenhum número oficial configurado. Fale com o administrador.',
  WABA_NOT_AUTHENTICATED: 'Sessão expirada. Entre novamente.',
};

const OPEN_CHAT_FALLBACK = 'Não foi possível abrir a conversa.';

// ── Sincronização de templates ───────────────────────────────────────────────
// A `waba-sync-templates` espelha os templates da Meta em `waba_templates`. Não
// há agendamento: template aprovado na Meta só aparece no CRM depois disto.

export interface WabaSyncTemplatesSuccess {
  success: true;
  sincronizados: number;
  por_status: Record<string, number>;
  marcados_removidos: number;
  synced_at: string;
}

export type WabaSyncTemplatesResult = WabaSyncTemplatesSuccess | { success: false; error: string };

const SYNC_FALLBACK = 'Não foi possível sincronizar os templates.';

export const wabaApi = {
  async syncTemplates(): Promise<WabaSyncTemplatesResult> {
    const { data, error } = await supabase.functions.invoke('waba-sync-templates', {
      method: 'POST',
    });

    if (error) {
      // Em resposta não-2xx o supabase-js não popula `data`: o corpo com a
      // mensagem real da Graph API fica no Response dentro de `error.context`.
      const context = (error as { context?: unknown }).context;
      if (context instanceof Response) {
        const body = (await context.json().catch(() => null)) as { error?: string } | null;
        if (body?.error) return { success: false, error: body.error };
      }
      return { success: false, error: error.message || SYNC_FALLBACK };
    }

    // 200 com `success: false` também é falha.
    if (data && typeof data === 'object' && 'success' in data) {
      const body = data as WabaSyncTemplatesResult;
      return body.success ? body : { success: false, error: body.error || SYNC_FALLBACK };
    }

    return { success: false, error: SYNC_FALLBACK };
  },

  /**
   * Finaliza o atendimento aberto do chat. Devolve `false` quando não havia
   * atendimento aberto ou o usuário não tem permissão — a UI reflete o
   * retorno, nunca assume sucesso.
   */
  async finalizarAtendimento(chat_id: string): Promise<boolean> {
    const { data, error } = await supabase.rpc('waba_finalizar_atendimento', {
      p_chat_id: chat_id,
    });
    if (error) {
      console.error('[WABA] Falha ao finalizar atendimento:', { chat_id, message: error.message });
      return false;
    }
    return data === true;
  },

  /** Fecha os atendimentos cuja janela de 24h expirou. Devolve quantos fechou. */
  async fecharAtendimentosExpirados(): Promise<number> {
    const { data, error } = await supabase.rpc('waba_fechar_atendimentos_expirados');
    if (error) {
      console.error('[WABA] Falha ao fechar atendimentos expirados:', error.message);
      return 0;
    }
    return typeof data === 'number' ? data : 0;
  },

  async openChat(cliente_id: string): Promise<WabaOpenChatResult> {
    const { data, error } = await supabase.rpc('waba_open_chat', { p_cliente_id: cliente_id });

    if (error) {
      const code = Object.keys(OPEN_CHAT_MESSAGES).find(key => error.message?.includes(key));
      return { success: false, message: code ? OPEN_CHAT_MESSAGES[code] : OPEN_CHAT_FALLBACK };
    }

    if (typeof data !== 'string' || data.length === 0) {
      return { success: false, message: OPEN_CHAT_FALLBACK };
    }

    return { success: true, chat_id: data };
  },

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

  /** Imagem ou documento. O proxy grava a mensagem; ela chega pelo realtime. */
  sendMedia(
    chat_id: string,
    media_kind: WabaMediaKind,
    file_base64: string,
    mime_type: string,
    caption?: string,
    filename?: string
  ): Promise<WabaSendResult> {
    return wabaProxy({
      action: 'send_media',
      chat_id,
      media_kind,
      file_base64,
      mime_type,
      caption,
      filename,
    });
  },

  /** Nota de voz OGG/Opus. O proxy grava a mensagem; ela chega pelo realtime. */
  sendAudio(
    chat_id: string,
    audio_base64: string,
    mime_type: string,
    duration_seconds: number
  ): Promise<WabaSendResult> {
    return wabaProxy({ action: 'send_audio', chat_id, audio_base64, mime_type, duration_seconds });
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
  /** Null até o webhook terminar de baixar da Meta — ver `WabaMessageMedia`. */
  media_url: string | null;
  media_mime_type?: string | null;
  /** Não é populado hoje; a duração vem do próprio elemento de áudio. */
  media_duration_seconds?: number | null;
  status: WabaMessageStatus | string | null;
  timestamp: string;
  template_name: string | null;
  template_variables: unknown;
  pricing_category: string | null;
}

// ── Atendimentos ─────────────────────────────────────────────────────────────
// Um ciclo de atendimento por conversa. Abertura e fechamento por troca de
// assessor são automáticos no banco — o frontend só lê, finaliza e limpa
// expirados.

export type WabaAtendimentoMotivo = 'manual' | 'troca_assessor' | 'janela_24h';

export interface WabaAtendimento {
  id: string;
  chat_id: string;
  cliente_id: string | null;
  assessor_user_id: string;
  aberto_em: string;
  ultimo_inbound_em: string | null;
  /** Null enquanto o atendimento está aberto. */
  fechado_em: string | null;
  fechado_por: string | null;
  fechado_motivo: WabaAtendimentoMotivo | null;
  /**
   * Quantas vezes o ciclo foi finalizado e o cliente voltou dentro de 1h. O
   * banco reabre o registro (limpa os campos de fechamento) em vez de criar um
   * novo, então uma reabertura não vira linha nova no histórico.
   */
  reaberturas: number;
}

export const ATENDIMENTO_MOTIVO_LABEL: Record<WabaAtendimentoMotivo, string> = {
  manual: 'Finalizado pelo assessor',
  troca_assessor: 'Encerrado por troca de assessor',
  janela_24h: 'Encerrado pela janela de 24h',
};

export function atendimentoMotivoLabel(motivo: string | null | undefined): string {
  if (motivo && motivo in ATENDIMENTO_MOTIVO_LABEL) {
    return ATENDIMENTO_MOTIVO_LABEL[motivo as WabaAtendimentoMotivo];
  }
  return 'Atendimento encerrado';
}

export interface WabaTemplate {
  id: string;
  name: string;
  category: string;
  language: string;
  status: string;
  components: unknown;
  synced_at?: string | null;
}

/** Chat com o contato (e cliente vinculado) embutidos pelo PostgREST. */
export interface WabaChatWithContact extends WabaChat {
  waba_contacts: (WabaContact & { clientes: { id: string; nome: string } | null }) | null;
}
