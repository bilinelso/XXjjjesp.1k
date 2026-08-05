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

export function formatMessageTime(timestamp: string | null | undefined): string {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
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
