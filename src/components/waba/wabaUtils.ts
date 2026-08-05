import type { WabaChatWithContact, WabaTemplate } from '../../lib/wabaApi';

export const WINDOW_MS = 24 * 60 * 60 * 1000;
/** Abaixo disso a janela é sinalizada em âmbar. */
export const WINDOW_WARNING_MS = 2 * 60 * 60 * 1000;

export interface WindowState {
  open: boolean;
  /** Milissegundos até o fechamento; 0 quando já fechada. */
  remainingMs: number;
}

/**
 * A janela de 24h pertence ao CONTATO, não à conversa: dois assessores falando
 * com o mesmo contato compartilham a mesma janela. Ela é derivada de
 * `waba_contacts.last_inbound_at`, nunca armazenada.
 */
export function computeWindow(lastInboundAt: string | null | undefined, now: number): WindowState {
  if (!lastInboundAt) return { open: false, remainingMs: 0 };
  const elapsed = now - new Date(lastInboundAt).getTime();
  const remainingMs = WINDOW_MS - elapsed;
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) return { open: false, remainingMs: 0 };
  return { open: true, remainingMs };
}

export function formatRemaining(remainingMs: number): string {
  const totalMinutes = Math.floor(remainingMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours >= 1) return `${hours}h restantes`;
  return `${Math.max(minutes, 1)}min restantes`;
}

/** `556696223637` → `+55 66 9622-3637` */
export function formatWabaPhone(phone: string | null | undefined): string {
  if (!phone) return '';
  const num = phone.replace(/\D/g, '');
  if (num.startsWith('55') && num.length >= 12) {
    const ddd = num.slice(2, 4);
    const rest = num.slice(4);
    if (rest.length === 9) return `+55 ${ddd} ${rest.slice(0, 5)}-${rest.slice(5)}`;
    if (rest.length === 8) return `+55 ${ddd} ${rest.slice(0, 4)}-${rest.slice(4)}`;
  }
  return num ? `+${num}` : '';
}

/** Prioridade: nome do cliente > nome do perfil WhatsApp > telefone formatado. */
export function resolveChatName(chat: WabaChatWithContact): string {
  const contact = chat.waba_contacts;
  return (
    contact?.clientes?.nome ||
    contact?.contact_name ||
    formatWabaPhone(contact?.contact_phone) ||
    'Sem identificação'
  );
}

export function formatRelativeTime(timestamp: string | null | undefined): string {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';

  const now = new Date();
  const sameDay =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  if (sameDay) {
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear();

  if (isYesterday) return 'Ontem';

  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** "há 2 horas" — usado no rótulo da última sincronização de templates. */
export function formatTimeAgo(timestamp: string | null | undefined): string {
  if (!timestamp) return '';
  const then = new Date(timestamp).getTime();
  if (Number.isNaN(then)) return '';

  const minutes = Math.floor((Date.now() - then) / 60000);
  if (minutes < 1) return 'agora mesmo';
  if (minutes < 60) return `há ${minutes} minuto${minutes > 1 ? 's' : ''}`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours} hora${hours > 1 ? 's' : ''}`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `há ${days} dia${days > 1 ? 's' : ''}`;

  const months = Math.floor(days / 30);
  return months > 1 ? `há ${months} meses` : 'há 1 mês';
}

export function formatMessageTime(timestamp: string | null | undefined): string {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

// ── Mídia ────────────────────────────────────────────────────────────────────

export const MEDIA_TYPES = ['audio', 'image', 'video', 'document', 'sticker'] as const;
export type MediaType = (typeof MEDIA_TYPES)[number];

/**
 * Depois disto, uma mensagem de mídia ainda sem `media_url` é considerada
 * perdida. O webhook insere a linha primeiro e preenche a URL segundos depois;
 * passado esse prazo o download falhou e não vem mais.
 */
export const MEDIA_TIMEOUT_MS = 60_000;

export function isMediaType(messageType: string | null | undefined): messageType is MediaType {
  return !!messageType && (MEDIA_TYPES as readonly string[]).includes(messageType);
}

/**
 * `message_text` traz a caption quando existe e, quando não existe, um
 * placeholder entre colchetes (`[Imagem]`, `[Documento: nota.pdf]`). Uma caption
 * de verdade nunca é só um par de colchetes, então isso os separa sem precisar
 * listar cada placeholder.
 */
export function isPlaceholderText(text: string | null | undefined): boolean {
  if (!text) return true;
  return /^\[[^\]]*\]$/.test(text.trim());
}

/** Caption real da mídia, ou null quando `message_text` é só placeholder. */
export function mediaCaption(text: string | null | undefined): string | null {
  return isPlaceholderText(text) ? null : (text as string);
}

/** `[Documento: contrato.pdf]` → `contrato.pdf` */
export function documentFileName(text: string | null | undefined): string {
  const match = (text || '').trim().match(/^\[Documento:\s*(.+)\]$/i);
  return match ? match[1].trim() : 'Documento';
}

/** Blob/File → base64 puro (sem o prefixo `data:...;base64,`). */
export function fileToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

const JPEG_MAX_DIMENSION = 2048;
const JPEG_QUALITY = 0.85;

/**
 * Reencoda qualquer imagem aceita para JPEG antes do envio.
 *
 * PNGs (screenshots, sobretudo) passam no upload da Meta mas falham na
 * entrega — a mensagem fica `failed`. JPEG entrega sempre, então o envio é
 * normalizado aqui. De quebra limita a maior dimensão a 2048px.
 */
export async function imageFileToJpeg(
  file: File
): Promise<{ base64: string; mimeType: 'image/jpeg' }> {
  const bitmap = await createImageBitmap(file);

  try {
    const scale = Math.min(1, JPEG_MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas 2d indisponível');

    // JPEG não tem alfa: sem isto, PNG transparente viraria fundo preto.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        result => (result ? resolve(result) : reject(new Error('toBlob falhou'))),
        'image/jpeg',
        JPEG_QUALITY
      );
    });

    return { base64: await fileToBase64(blob), mimeType: 'image/jpeg' };
  } finally {
    bitmap.close();
  }
}

/** `1536000` → `1,5 MB` */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

export function formatMediaDuration(seconds: number): string {
  if (!seconds || Number.isNaN(seconds) || !Number.isFinite(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ── Templates ────────────────────────────────────────────────────────────────

export interface TemplateComponent {
  type: string;
  format?: string;
  text?: string;
}

/** `components` vem da Meta como array; toleramos o formato aninhado por segurança. */
export function parseComponents(components: unknown): TemplateComponent[] {
  const raw = Array.isArray(components)
    ? components
    : components && typeof components === 'object' && Array.isArray((components as { components?: unknown }).components)
      ? (components as { components: unknown[] }).components
      : [];

  return raw.filter(
    (c): c is TemplateComponent => !!c && typeof c === 'object' && typeof (c as TemplateComponent).type === 'string'
  );
}

function componentText(components: TemplateComponent[], type: string): string {
  const found = components.find(c => c.type?.toUpperCase() === type);
  return typeof found?.text === 'string' ? found.text : '';
}

export interface TemplateShape {
  header: string;
  body: string;
  footer: string;
  /** Índices das variáveis ({{1}}, {{2}}…) em ordem crescente. */
  variableIndexes: number[];
}

/**
 * Extrai as variáveis do template. O contrato do `waba-proxy` recebe uma lista
 * plana (`variables: ["Gabriel", "Felipe"]`), então tratamos a numeração como
 * única para o template inteiro: {{1}} no header e {{1}} no body são a mesma
 * variável.
 */
export function parseTemplate(template: WabaTemplate): TemplateShape {
  const components = parseComponents(template.components);
  const header = componentText(components, 'HEADER');
  const body = componentText(components, 'BODY');
  const footer = componentText(components, 'FOOTER');

  const indexes = new Set<number>();
  for (const text of [header, body, footer]) {
    for (const match of text.matchAll(/\{\{\s*(\d+)\s*\}\}/g)) {
      const n = parseInt(match[1], 10);
      if (Number.isFinite(n)) indexes.add(n);
    }
  }

  return { header, body, footer, variableIndexes: [...indexes].sort((a, b) => a - b) };
}

export function fillVariables(text: string, values: Record<number, string>): string {
  return text.replace(/\{\{\s*(\d+)\s*\}\}/g, (whole, digits: string) => {
    const value = values[parseInt(digits, 10)];
    return value && value.trim() ? value : whole;
  });
}

/** Texto final montado do template, para o preview. */
export function buildTemplatePreview(shape: TemplateShape, values: Record<number, string>): string {
  return [shape.header, shape.body, shape.footer]
    .filter(Boolean)
    .map(text => fillVariables(text, values))
    .join('\n\n');
}

export function templateCategoryStyle(category: string): string {
  switch (category?.toUpperCase()) {
    case 'MARKETING':
      return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'UTILITY':
      return 'bg-blue-50 text-blue-700 border-blue-200';
    case 'AUTHENTICATION':
      return 'bg-violet-50 text-violet-700 border-violet-200';
    default:
      return 'bg-slate-100 text-slate-600 border-slate-200';
  }
}

export function messageStatusLabel(status: string | null | undefined): string {
  switch (status) {
    case 'sent':
      return 'Enviado';
    case 'delivered':
      return 'Entregue';
    case 'read':
      return 'Lido';
    case 'failed':
      return 'Falhou';
    default:
      return '';
  }
}
