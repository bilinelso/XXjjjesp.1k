// ── Roteamento por query string (?view=) ─────────────────────────────────────
// A tela atual vive na URL para que o app possa abrir direto numa tela — é o
// que torna possível o atalho na tela inicial do celular apontando para
// `/?view=waba`. Ganho colateral: F5 mantém a tela e existe link direto.

export type ViewType =
  | 'leads'
  | 'dashboard'
  | 'kanban'
  | 'agendamentos'
  | 'atendimentos'
  | 'campanhas'
  | 'financeiro'
  | 'configuracoes'
  | 'formularios'
  | 'whatsapp'
  | 'waba'
  | 'senhas'
  | 'lead-audit'
  | 'cliente-oculto';

/**
 * Todas as telas, na ordem em que aparecem na sidebar. A ordem importa: é ela
 * que define qual é a "primeira tela permitida" quando o usuário não tem acesso
 * ao padrão.
 */
export const ALL_VIEWS: ViewType[] = [
  'dashboard',
  'leads',
  'kanban',
  'formularios',
  'agendamentos',
  'atendimentos',
  'cliente-oculto',
  'campanhas',
  'whatsapp',
  'waba',
  'financeiro',
  'configuracoes',
  'senhas',
  'lead-audit',
];

/**
 * Telas que funcionam em tela pequena.
 *
 * ESTE É O ÚNICO LUGAR a editar quando outra tela ficar responsiva — a gaveta
 * do mobile e a guarda de rota derivam daqui. As demais telas continuam
 * existindo e acessíveis no desktop; só não aparecem no menu do celular.
 */
export const MOBILE_VIEWS: ViewType[] = ['waba', 'leads'];

/** Tailwind `lg`. Abaixo disso a sidebar vira gaveta. */
export const LG_QUERY = '(min-width: 1024px)';
/** Tailwind `md`. Abaixo disso o WabaView vira coluna única. */
export const MD_QUERY = '(min-width: 768px)';
/** Tailwind `xl`. A partir disso o WabaView pode exibir painel lateral. */
export const XL_QUERY = '(min-width: 1280px)';

export function isViewType(value: string | null | undefined): value is ViewType {
  return !!value && (ALL_VIEWS as string[]).includes(value);
}

/** Lê `?view=` da URL atual, ignorando valor ausente ou inválido. */
export function readViewFromLocation(): ViewType | null {
  if (typeof window === 'undefined') return null;
  const raw = new URLSearchParams(window.location.search).get('view');
  return isViewType(raw) ? raw : null;
}

/** URL da tela preservando o resto da query string e o hash. */
export function urlForView(view: ViewType): string {
  const url = new URL(window.location.href);
  url.searchParams.set('view', view);
  return `${url.pathname}${url.search}${url.hash}`;
}

export interface ResolveViewParams {
  /** O que a URL pediu, ou null quando não há `?view=` válido. */
  requested: ViewType | null;
  isMobile: boolean;
  /** Falso depois que o usuário escolhe "Ver versão completa". */
  restrictToMobileViews: boolean;
  canView: (view: ViewType) => boolean;
}

/**
 * Decide qual tela renderizar. Nunca devolve uma tela sem permissão nem uma
 * tela quebrada no celular — o resultado é sempre renderizável.
 *
 * O padrão é `waba` no celular e `leads` (a Lista) no desktop; o padrão global
 * continua sendo a Lista.
 */
export function resolveView({
  requested,
  isMobile,
  restrictToMobileViews,
  canView,
}: ResolveViewParams): ViewType {
  const pool = (isMobile && restrictToMobileViews ? MOBILE_VIEWS : ALL_VIEWS).filter(canView);

  if (requested && pool.includes(requested)) return requested;

  const preferred: ViewType = isMobile ? 'waba' : 'leads';
  if (pool.includes(preferred)) return preferred;

  // Primeira tela permitida, na ordem da sidebar. O fallback final nunca deve
  // acontecer (todo usuário autenticado enxerga o WABA), mas evita tela branca.
  return pool[0] ?? 'waba';
}
