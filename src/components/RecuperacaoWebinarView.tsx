import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Phone, CheckCircle2, XCircle, Hand, Eye, EyeOff, AlertCircle, Video, MessageSquare, Loader2, Calendar, X, Search, ShoppingCart, QrCode, RotateCcw, ListChecks } from 'lucide-react';
import { buildTemplatePreview, parseTemplate } from './waba/wabaUtils';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

// ── Kanban de recuperação de webinar ─────────────────────────────────────────
// As colunas são o progresso do lead DENTRO do webinar (evento_max), calculado
// pelo backend a partir dos webhooks da HotWebinar. Por isso os cards não são
// arrastáveis: o comercial não decide em que coluna o lead está, ele só trabalha
// o card (Assumir / Ganho / Perdido). A RLS já limita cada comercial aos seus
// próprios cards — não há nenhum filtro por responsável aqui.

type Desfecho = 'aberto' | 'trabalhando' | 'ganho' | 'ganho_webinar' | 'perdido';

interface WebinarCard {
  id: string;
  nome: string | null;
  telefone_normalized: string;
  telefone_original: string | null;
  email: string | null;
  evento_max: number;
  evento_nome: string | null;
  evento_chave: string | null;
  desfecho: Desfecho;
  responsavel_user_id: string | null;
  responsavel_email: string | null;
  foi_trabalhado: boolean;
  trabalhado_em: string | null;
  cliente_id: string | null;
  fechado_em: string | null;
  fechado_automatico: boolean | null;
  created_at: string;
  updated_at: string | null;
  /** Quando o lead entrou na etapa atual (`evento_max`). Carimbado pelo banco a cada avanço. */
  etapa_em: string;
  /** Última movimentação de qualquer natureza: GREATEST(etapa_em, fechado_em, trabalhado_em). */
  atividade_em: string;
}

/** As 6 colunas do funil, na ordem. Espelha o mapa de eventos do backend. */
const COLUNAS: { evento: number; nome: string }[] = [
  { evento: 1, nome: 'Acessou' },
  { evento: 2, nome: 'Assistiu 15 minutos' },
  { evento: 3, nome: 'Assistiu 25 minutos' },
  { evento: 4, nome: 'Estava no pitch' },
  { evento: 5, nome: 'Estava na oferta' },
  { evento: 6, nome: 'Clicou no botão' },
];

const ATIVOS: Desfecho[] = ['aberto', 'trabalhando'];
const FECHADOS: Desfecho[] = ['ganho', 'ganho_webinar', 'perdido'];

/** Mensagens amigáveis para os códigos de erro devolvidos pelas RPCs. */
const ERRO_MSG: Record<string, string> = {
  sem_permissao: 'Você não tem permissão para agir neste card.',
  ja_fechado: 'Este card já foi fechado por outra pessoa.',
  card_nao_encontrado: 'Card não encontrado — a lista foi atualizada.',
  nao_autenticado: 'Sessão expirada. Faça login novamente.',
  desfecho_invalido: 'Desfecho inválido.',
  card_ja_fechado: 'Este card já foi fechado por outra pessoa.',
  card_nao_disponivel: 'Este card já foi assumido por outra pessoa.',
};

interface WabaTemplate {
  id: string;
  name: string;
  category: string | null;
  language: string | null;
  /** `components` da Meta — só o preview usa, via `parseTemplate`. */
  components: unknown;
}

// A RPC `waba_disparar_template_lead` sinaliza falha por RAISE EXCEPTION, então o
// código chega em `error.message` — às vezes com um detalhe depois de ": ".
const ERRO_TEMPLATE: Record<string, string> = {
  WABA_NOT_AUTHENTICATED: 'Sessão expirada. Faça login novamente.',
  LEAD_NAO_ENCONTRADO: 'Lead não encontrado — a lista foi atualizada.',
  LEAD_NAO_ASSUMIDO: 'Assuma o lead antes de enviar o template.',
  LEAD_DE_OUTRO_RESPONSAVEL: 'Este lead é de outro responsável.',
  LEAD_SEM_TELEFONE: 'Este lead não tem telefone cadastrado.',
  LEAD_TELEFONE_INVALIDO: 'O telefone deste lead é inválido.',
  LEAD_OPT_OUT: 'Este contato pediu para não receber mensagens.',
  WABA_TEMPLATE_NAO_ENCONTRADO: 'Template não encontrado — recarregue a página.',
  WABA_TEMPLATE_NAO_APROVADO: 'Este template não está aprovado pela Meta.',
  WABA_SEM_NUMERO_ATIVO: 'Nenhum número do WhatsApp oficial está ativo.',
  // Exclusivos do disparo em lote (`waba_disparar_template_leads`).
  NENHUM_LEAD_INFORMADO: 'Nenhum lead foi selecionado.',
  NENHUM_LEAD_VALIDO: 'Nenhum dos leads selecionados pode receber o template.',
  LOTE_MUITO_GRANDE: 'Selecione menos leads e tente de novo — o lote passou do limite.',
};

/**
 * Motivos devolvidos por lead em `ignorados[]` no disparo em lote. Mesmo estilo
 * do ERRO_TEMPLATE, mas aqui o texto aparece numa lista, ao lado do nome.
 */
const MOTIVO_IGNORADO: Record<string, string> = {
  LEAD_OPT_OUT: 'Pediu para não receber mensagens',
  LEAD_JA_FECHADO: 'Card já fechado',
  LEAD_TELEFONE_INVALIDO: 'Telefone inválido',
  LEAD_SEM_TELEFONE: 'Sem telefone cadastrado',
  LEAD_NAO_ASSUMIDO: 'Lead ainda não assumido',
  LEAD_DE_OUTRO_RESPONSAVEL: 'Lead de outro responsável',
  LEAD_NAO_ENCONTRADO: 'Lead não encontrado',
};

/** Motivo em português; código desconhecido volta cru, para não sumir da lista. */
function textoMotivo(motivo: string | null | undefined): string {
  const codigo = (motivo ?? '').trim();
  return MOTIVO_IGNORADO[codigo] ?? (codigo || 'Motivo não informado');
}

/** Um lead que a RPC recusou dentro do lote. */
interface LeadIgnorado {
  lead_id: string;
  nome: string | null;
  motivo: string;
}

/** Extrai o código nomeado da mensagem de erro do Postgres. */
function mensagemErroTemplate(raw: string | undefined): string {
  const texto = raw ?? '';
  for (const [codigo, msg] of Object.entries(ERRO_TEMPLATE)) {
    if (texto.includes(codigo)) return msg;
  }
  return 'Não foi possível enfileirar o envio. Tente novamente.';
}

const DESFECHO_LABEL: Record<string, { texto: string; classe: string }> = {
  ganho: { texto: 'Ganho', classe: 'bg-emerald-100 text-emerald-700' },
  ganho_webinar: { texto: 'Ganho (webinar)', classe: 'bg-sky-100 text-sky-700' },
  perdido: { texto: 'Perdido', classe: 'bg-slate-200 text-slate-600' },
};

function formatTelefone(num: string): string {
  const d = (num || '').replace(/\D/g, '');
  const sem55 = d.startsWith('55') && d.length > 11 ? d.slice(2) : d;
  if (sem55.length === 11) return `(${sem55.slice(0, 2)}) ${sem55.slice(2, 7)}-${sem55.slice(7)}`;
  if (sem55.length === 10) return `(${sem55.slice(0, 2)}) ${sem55.slice(2, 6)}-${sem55.slice(6)}`;
  return num;
}

/** `tel:` sempre com DDI — o discador do celular precisa do +55. */
function telHref(num: string): string {
  const d = (num || '').replace(/\D/g, '');
  return `tel:+${d.startsWith('55') ? d : `55${d}`}`;
}

function tempoDesde(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '';
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min}min`;
  const horas = Math.floor(min / 60);
  if (horas < 24) return `há ${horas}h`;
  const dias = Math.floor(horas / 24);
  if (dias === 1) return 'há 1 dia';
  return `há ${dias} dias`;
}

function formatData(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

// ── Filtro por data da última movimentação (atividade_em) ────────────────────
// Os boundaries de dia são sempre calculados em America/Sao_Paulo, nunca no fuso
// do navegador: um lead que se moveu às 23:59 em SP tem que ficar no dia dele.
// SP não tem horário de verão desde 2019, então o offset fixo -03:00 é seguro.
// Se algum dia voltar, derivar o offset com Intl.DateTimeFormat + timeZoneName.

type Preset = 'tudo' | 'hoje' | '7d' | '30d' | 'custom';

interface Janela {
  startUtc: string | null;
  endUtc: string | null;
}

/** Instante UTC (ISO) correspondente ao início/fim de uma data-calendário em SP. */
function spDayBoundaryToUtc(dateStr: string, edge: 'start' | 'end'): string {
  const time = edge === 'start' ? '00:00:00.000' : '23:59:59.999';
  return new Date(`${dateStr}T${time}-03:00`).toISOString();
}

/** 'YYYY-MM-DD' de hoje em São Paulo — 'en-CA' já formata nessa ordem. */
function todayInSaoPaulo(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

/** Desloca uma data-calendário em dias usando aritmética em UTC (meio-dia como âncora). */
function shiftDate(dateStr: string, dias: number): string {
  const base = new Date(`${dateStr}T12:00:00Z`);
  base.setUTCDate(base.getUTCDate() + dias);
  return base.toISOString().slice(0, 10);
}

/** Preset e intervalo custom resolvem para o mesmo par de boundaries UTC. */
function resolverJanela(preset: Preset, de: string, ate: string): Janela {
  if (preset === 'tudo') return { startUtc: null, endUtc: null };

  if (preset === 'custom') {
    return {
      startUtc: de ? spDayBoundaryToUtc(de, 'start') : null,
      endUtc: ate ? spDayBoundaryToUtc(ate, 'end') : null,
    };
  }

  const hoje = todayInSaoPaulo();
  const inicio = preset === 'hoje' ? hoje : shiftDate(hoje, preset === '7d' ? -6 : -29);
  return { startUtc: spDayBoundaryToUtc(inicio, 'start'), endUtc: spDayBoundaryToUtc(hoje, 'end') };
}

/** Compara acento-insensitivo e caixa-insensitivo. */
const normalizar = (s: string) =>
  (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

const PRESETS: { id: Preset; label: string }[] = [
  { id: 'hoje', label: 'Hoje' },
  { id: '7d', label: '7 dias' },
  { id: '30d', label: '30 dias' },
  { id: 'tudo', label: 'Tudo' },
];

// ── Infra compartilhada pelas duas abas ──────────────────────────────────────

type ToastEstado = { tipo: 'erro' | 'ok'; texto: string } | null;

/** Toast efêmero (4s), com o timer limpo no unmount. */
function useToast() {
  const [toast, setToast] = useState<ToastEstado>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((tipo: 'erro' | 'ok', texto: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ tipo, texto });
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }, []);

  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  return { toast, showToast };
}

function ToastBar({ toast }: { toast: ToastEstado }) {
  if (!toast) return null;
  return (
    <div
      className={`fixed bottom-24 right-5 z-[60] max-w-sm px-4 py-3 rounded-lg shadow-lg text-sm text-white ${
        toast.tipo === 'erro' ? 'bg-red-600' : 'bg-emerald-600'
      }`}
    >
      {toast.texto}
    </div>
  );
}

// ── Aba "Recuperação": carrinho abandonado + PIX não pago ────────────────────
// Fila única de cards empilhados (não é kanban): o lead não tem etapas, ele só
// espera alguém assumir. `aguardando_pagamento` é o estado invisível do PIX no
// timer de 40 min e nunca pode aparecer aqui — o fetch filtra explicitamente,
// além da RLS.

type DesfechoRecuperacao = 'aguardando_pagamento' | 'aberto' | 'trabalhando' | 'recuperado' | 'perdido';
type OrigemRecuperacao = 'carrinho' | 'pix';

interface RecuperacaoCard {
  id: string;
  origem: OrigemRecuperacao;
  telefone_normalized: string;
  telefone_original: string | null;
  nome: string | null;
  email: string | null;
  product_nome: string | null;
  offer_code: string | null;
  desfecho: DesfechoRecuperacao;
  responsavel_user_id: string | null;
  trabalhado_em: string | null;
  cliente_id: string | null;
  fechado_em: string | null;
  fechado_automatico: boolean | null;
  created_at: string;
  updated_at: string | null;
}

const REC_ATIVOS: DesfechoRecuperacao[] = ['aberto', 'trabalhando'];
const REC_FECHADOS: DesfechoRecuperacao[] = ['recuperado', 'perdido'];

const ORIGEM_LABEL: Record<OrigemRecuperacao, { texto: string; classe: string }> = {
  carrinho: { texto: 'Carrinho', classe: 'bg-amber-100 text-amber-700 border-amber-200' },
  pix: { texto: 'PIX', classe: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
};

const REC_DESFECHO_LABEL: Record<string, { texto: string; classe: string }> = {
  recuperado: { texto: 'Recuperado', classe: 'bg-emerald-100 text-emerald-700' },
  perdido: { texto: 'Perdido', classe: 'bg-slate-200 text-slate-600' },
};

type FiltroOrigem = 'todos' | OrigemRecuperacao;

const FILTROS_ORIGEM: { id: FiltroOrigem; label: string }[] = [
  { id: 'todos', label: 'Todos' },
  { id: 'carrinho', label: 'Carrinho' },
  { id: 'pix', label: 'PIX' },
];

function RecuperacaoFila({ onAtivosChange }: { onAtivosChange: (n: number) => void }) {
  const { user, profile } = useAuth();
  const [cards, setCards] = useState<RecuperacaoCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [erroFetch, setErroFetch] = useState<string | null>(null);
  const [mostrarFechados, setMostrarFechados] = useState(false);
  const [filtroOrigem, setFiltroOrigem] = useState<FiltroOrigem>('todos');
  const [acaoEmCurso, setAcaoEmCurso] = useState<string | null>(null);
  const { toast, showToast } = useToast();

  // Envio de template WABA — mesma mecânica do kanban de webinar: os templates
  // aprovados são carregados uma vez e compartilhados por todos os cards.
  const [templates, setTemplates] = useState<WabaTemplate[]>([]);
  const [templatesEstado, setTemplatesEstado] = useState<'idle' | 'carregando' | 'pronto' | 'erro'>('idle');
  // Card cujo seletor está aberto (só um por vez) e card com envio em curso.
  const [seletorAberto, setSeletorAberto] = useState<string | null>(null);
  const [enviando, setEnviando] = useState<string | null>(null);
  /** Template em preview e o lead de onde ele foi aberto; null = modal fechado. */
  const [preview, setPreview] = useState<{ template: WabaTemplate; leadNome: string | null } | null>(null);
  /** Nome do assessor logado — resolve `{{2}}` no preview. */
  const [assessorNome, setAssessorNome] = useState<string | null>(null);
  const carregouTemplates = useRef(false);

  const fetchRecuperacao = useCallback(async () => {
    setErroFetch(null);
    const { data, error } = await supabase
      .from('recuperacao_leads')
      .select('*')
      .neq('desfecho', 'aguardando_pagamento')
      .order('created_at', { ascending: false });

    if (error) {
      setErroFetch(error.message);
      setLoading(false);
      return;
    }
    setCards((data ?? []) as RecuperacaoCard[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    setLoading(true);
    void fetchRecuperacao();
  }, [fetchRecuperacao]);

  // Um único canal para a tabela — novo lead, assumido e fechamento chegam aqui.
  useEffect(() => {
    const canal = supabase
      .channel('recuperacao_leads_fila')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recuperacao_leads' }, () => {
        fetchRecuperacao();
      })
      .subscribe();

    return () => { supabase.removeChannel(canal); };
  }, [fetchRecuperacao]);

  // Cinto e suspensório: mesmo com o filtro no fetch e a RLS, nada de
  // `aguardando_pagamento` passa daqui para baixo.
  const visiveis = useMemo(
    () => cards.filter(c => c.desfecho !== 'aguardando_pagamento'),
    [cards]
  );

  const ativos = useMemo(() => visiveis.filter(c => REC_ATIVOS.includes(c.desfecho)), [visiveis]);

  const fechados = useMemo(
    () => visiveis
      .filter(c => REC_FECHADOS.includes(c.desfecho))
      .sort((a, b) => new Date(b.fechado_em ?? b.updated_at ?? b.created_at).getTime()
        - new Date(a.fechado_em ?? a.updated_at ?? a.created_at).getTime()),
    [visiveis]
  );

  useEffect(() => { onAtivosChange(ativos.length); }, [ativos.length, onAtivosChange]);

  // Filtro de origem é client-side sobre a lista já carregada.
  const casaOrigem = useCallback(
    (card: RecuperacaoCard) => filtroOrigem === 'todos' || card.origem === filtroOrigem,
    [filtroOrigem]
  );

  const ativosFiltrados = useMemo(() => ativos.filter(casaOrigem), [ativos, casaOrigem]);
  const fechadosFiltrados = useMemo(() => fechados.filter(casaOrigem), [fechados, casaOrigem]);

  /** Mesmo contrato do kanban: `{ ok:false, erro }` vira toast e recarrega a fila. */
  const executarRpc = useCallback(async (
    cardId: string,
    fn: string,
    params: Record<string, unknown>,
    sucesso: string
  ) => {
    setAcaoEmCurso(cardId);
    try {
      const { data, error } = await supabase.rpc(fn, params);
      if (error) {
        showToast('erro', 'Não foi possível concluir a ação. Tente novamente.');
        return;
      }
      const resultado = data as { ok?: boolean; erro?: string } | null;
      if (!resultado?.ok) {
        const codigo = resultado?.erro ?? '';
        showToast('erro', ERRO_MSG[codigo] ?? 'Não foi possível concluir a ação.');
        await fetchRecuperacao();
        return;
      }
      showToast('ok', sucesso);
      await fetchRecuperacao();
    } finally {
      setAcaoEmCurso(null);
    }
  }, [fetchRecuperacao, showToast]);

  const assumir = (card: RecuperacaoCard) =>
    executarRpc(card.id, 'recuperacao_assumir', { p_id: card.id }, 'Lead assumido.');

  const marcarRecuperado = (card: RecuperacaoCard) =>
    executarRpc(card.id, 'recuperacao_marcar_desfecho',
      { p_id: card.id, p_desfecho: 'recuperado' }, 'Marcado como recuperado.');

  const marcarPerdido = (card: RecuperacaoCard) => {
    const alvo = card.nome || formatTelefone(card.telefone_normalized);
    if (!window.confirm(`Marcar "${alvo}" como perdido?`)) return;
    executarRpc(card.id, 'recuperacao_marcar_desfecho',
      { p_id: card.id, p_desfecho: 'perdido' }, 'Marcado como perdido.');
  };

  // Mesma resolução do WabaView: `nome_exibicao` é o nome que o cliente vê,
  // `nome` só entra como fallback.
  useEffect(() => {
    if (!profile?.assessor_id) {
      setAssessorNome(null);
      return;
    }
    supabase
      .from('assessores')
      .select('nome, nome_exibicao')
      .eq('id', profile.assessor_id)
      .maybeSingle()
      .then(({ data }) => setAssessorNome(data?.nome_exibicao?.trim() || data?.nome || null));
  }, [profile?.assessor_id]);

  /** Busca os templates aprovados na primeira vez que alguém abre o seletor. */
  const carregarTemplates = useCallback(async () => {
    setTemplatesEstado('carregando');
    const { data, error } = await supabase
      .from('waba_templates')
      .select('id, name, category, language, components')
      .eq('status', 'APPROVED')
      .order('name');

    if (error) {
      setTemplatesEstado('erro');
      return;
    }
    setTemplates((data ?? []) as WabaTemplate[]);
    setTemplatesEstado('pronto');
  }, []);

  const abrirSeletor = useCallback((cardId: string) => {
    setSeletorAberto(atual => (atual === cardId ? null : cardId));
    if (!carregouTemplates.current) {
      carregouTemplates.current = true;
      void carregarTemplates();
    }
  }, [carregarTemplates]);

  const recarregarTemplates = useCallback(() => { void carregarTemplates(); }, [carregarTemplates]);

  /**
   * Mesma regra do webinar: só dispara template quem assumiu o lead (ou o
   * master). O backend também barra, com `LEAD_NAO_ASSUMIDO`.
   */
  const podeEnviarTemplate = useCallback(
    (card: RecuperacaoCard) =>
      !!card.responsavel_user_id &&
      (card.responsavel_user_id === user?.id || !!profile?.is_master),
    [user?.id, profile?.is_master]
  );

  /**
   * `recuperacao_disparar_template` sinaliza falha por RAISE EXCEPTION — o
   * código chega em `error.message`, não no `{ ok:false }` do `executarRpc`.
   */
  const dispararTemplateRecuperacao = useCallback(async (card: RecuperacaoCard, template: WabaTemplate) => {
    setEnviando(card.id);
    try {
      const { error } = await supabase.rpc('recuperacao_disparar_template', {
        p_lead_id: card.id,
        p_template_id: template.id,
      });
      if (error) {
        showToast('erro', mensagemErroTemplate(error.message));
        return;
      }
      setSeletorAberto(null);
      showToast('ok', `Envio de "${template.name}" enfileirado — sai em até 1 minuto.`);
    } finally {
      setEnviando(null);
    }
  }, [showToast]);

  return (
    <div>
      {/* Barra de controles — o título vive no cabeçalho das abas */}
      <div className="flex flex-wrap items-center justify-end gap-2 mb-5">
        <div className="flex items-center gap-1 p-1 bg-white border border-slate-200 rounded-lg">
          {FILTROS_ORIGEM.map(f => (
            <button
              key={f.id}
              onClick={() => setFiltroOrigem(f.id)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                filtroOrigem === f.id ? 'bg-violet-600 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <button
          onClick={() => setMostrarFechados(v => !v)}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
            mostrarFechados
              ? 'bg-slate-800 text-white'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          {mostrarFechados ? <EyeOff size={15} /> : <Eye size={15} />}
          Mostrar fechados
          {fechados.length > 0 && (
            <span className={`ml-0.5 px-1.5 py-0.5 rounded text-[11px] ${
              mostrarFechados ? 'bg-white/20' : 'bg-slate-100'
            }`}>
              {fechados.length}
            </span>
          )}
        </button>
      </div>

      {erroFetch && (
        <div className="mb-4 flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
          <span>Erro ao carregar os leads: {erroFetch}</span>
        </div>
      )}

      {loading ? (
        <div className="py-20 text-center text-sm text-slate-400">Carregando leads…</div>
      ) : (
        <>
          {/* Fila única, cards empilhados */}
          {ativosFiltrados.length === 0 ? (
            <div className="py-16 text-center text-sm text-slate-400 bg-slate-50 border border-slate-200 rounded-xl">
              Nenhum lead para recuperar.
            </div>
          ) : (
            <div className="space-y-2 max-w-3xl">
              {ativosFiltrados.map(card => (
                <CardRecuperacao
                  key={card.id}
                  card={card}
                  ocupado={acaoEmCurso === card.id}
                  ehMeu={!!card.responsavel_user_id && card.responsavel_user_id === user?.id}
                  ehMaster={!!profile?.is_master}
                  onAssumir={() => assumir(card)}
                  onRecuperado={() => marcarRecuperado(card)}
                  onPerdido={() => marcarPerdido(card)}
                  podeEnviarTemplate={podeEnviarTemplate(card)}
                  seletorAberto={seletorAberto === card.id}
                  onToggleSeletor={() => abrirSeletor(card.id)}
                  templates={templates}
                  templatesEstado={templatesEstado}
                  onRecarregarTemplates={recarregarTemplates}
                  enviandoTemplate={enviando === card.id}
                  onEnviarTemplate={(tpl) => { void dispararTemplateRecuperacao(card, tpl); }}
                  onPreviewTemplate={(tpl) => setPreview({ template: tpl, leadNome: card.nome })}
                />
              ))}
            </div>
          )}

          {/* Fechados — seção separada, colapsável */}
          {mostrarFechados && (
            <div className="mt-6 max-w-3xl bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200">
                <h2 className="text-sm font-semibold text-slate-700">
                  Fechados <span className="font-normal text-slate-400">({fechadosFiltrados.length})</span>
                </h2>
              </div>
              {fechadosFiltrados.length === 0 ? (
                <div className="py-8 text-center text-sm text-slate-400">Nenhum card fechado.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="text-left font-medium px-4 py-2">Nome</th>
                        <th className="text-left font-medium px-4 py-2">Telefone</th>
                        <th className="text-left font-medium px-4 py-2">Origem</th>
                        <th className="text-left font-medium px-4 py-2">Desfecho</th>
                        <th className="text-left font-medium px-4 py-2">Fechado em</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {fechadosFiltrados.map(card => {
                        const label = REC_DESFECHO_LABEL[card.desfecho];
                        const origem = ORIGEM_LABEL[card.origem];
                        return (
                          <tr key={card.id} className="hover:bg-slate-50">
                            <td className="px-4 py-2.5 text-slate-700">
                              {card.nome || <span className="text-slate-400">Sem nome</span>}
                            </td>
                            <td className="px-4 py-2.5">
                              <a
                                href={telHref(card.telefone_normalized)}
                                className="text-slate-600 hover:text-violet-600 hover:underline"
                              >
                                {formatTelefone(card.telefone_normalized)}
                              </a>
                            </td>
                            <td className="px-4 py-2.5 text-slate-500">{origem?.texto ?? card.origem}</td>
                            <td className="px-4 py-2.5">
                              <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${label?.classe ?? 'bg-slate-100 text-slate-600'}`}>
                                {label?.texto ?? card.desfecho}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-slate-500">{formatData(card.fechado_em)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {preview && (
        <PreviewTemplateModal
          template={preview.template}
          leadNome={preview.leadNome}
          assessorNome={assessorNome}
          onClose={() => setPreview(null)}
        />
      )}

      <ToastBar toast={toast} />
    </div>
  );
}

interface CardRecuperacaoProps {
  card: RecuperacaoCard;
  ocupado: boolean;
  /** O card já é do usuário logado. */
  ehMeu: boolean;
  ehMaster: boolean;
  onAssumir: () => void;
  onRecuperado: () => void;
  onPerdido: () => void;
  /** Só quem assumiu o lead (ou o master) vê o botão de template. */
  podeEnviarTemplate: boolean;
  seletorAberto: boolean;
  onToggleSeletor: () => void;
  templates: WabaTemplate[];
  templatesEstado: 'idle' | 'carregando' | 'pronto' | 'erro';
  onRecarregarTemplates: () => void;
  enviandoTemplate: boolean;
  onEnviarTemplate: (template: WabaTemplate) => void;
  onPreviewTemplate: (template: WabaTemplate) => void;
}

function CardRecuperacao({
  card, ocupado, ehMeu, ehMaster, onAssumir, onRecuperado, onPerdido,
  podeEnviarTemplate, seletorAberto, onToggleSeletor,
  templates, templatesEstado, onRecarregarTemplates,
  enviandoTemplate, onEnviarTemplate, onPreviewTemplate,
}: CardRecuperacaoProps) {
  const livre = !card.responsavel_user_id;
  const novo = card.desfecho === 'aberto';
  const titulo = card.nome || formatTelefone(card.telefone_normalized);
  const origem = ORIGEM_LABEL[card.origem];
  // Mesma regra do webinar: card livre é de quem pegar; card com dono só o dono
  // (ou o master) trabalha.
  const podeAgir = livre || ehMeu || ehMaster;
  const deOutro = !livre && !ehMeu;

  return (
    <div
      className={`rounded-lg border p-3 bg-white transition-colors ${
        novo ? 'border-violet-300 ring-1 ring-violet-100' : 'border-slate-200'
      } ${ocupado ? 'opacity-60 pointer-events-none' : ''}`}
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-slate-800 break-words">{titulo}</p>
            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[10px] font-medium ${
              origem?.classe ?? 'bg-slate-100 text-slate-600 border-slate-200'
            }`}>
              {card.origem === 'carrinho' ? <ShoppingCart size={10} /> : <QrCode size={10} />}
              {origem?.texto ?? card.origem}
            </span>
          </div>

          <a
            href={telHref(card.telefone_normalized)}
            className="mt-1 inline-flex items-center gap-1.5 text-[12px] text-slate-600 hover:text-violet-600 hover:underline"
          >
            <Phone size={12} />
            {formatTelefone(card.telefone_normalized)}
          </a>

          {card.product_nome && (
            <p className="mt-0.5 text-[12px] text-slate-500 break-words">{card.product_nome}</p>
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] text-slate-400">{tempoDesde(card.created_at)}</span>
          {novo ? (
            <span className="px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 text-[10px] font-medium">
              Novo
            </span>
          ) : (
            <span className="px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-medium">
              Em atendimento
            </span>
          )}
          {/* Só o master enxerga cards de outro comercial — a RLS filtra o resto. */}
          {deOutro && ehMaster && (
            <span className="px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-medium">
              De outro comercial
            </span>
          )}
        </div>
      </div>

      {podeAgir && (
        <div className="mt-3 flex items-center gap-1.5 flex-wrap">
          {novo && (
            <button
              onClick={onAssumir}
              className="flex items-center justify-center gap-1 px-3 py-1.5 rounded-md bg-violet-600 text-white text-[11px] font-medium hover:bg-violet-700 transition-colors"
            >
              <Hand size={12} />
              Assumir
            </button>
          )}
          <button
            onClick={onRecuperado}
            title="Marcar como recuperado"
            className="flex items-center justify-center gap-1 px-3 py-1.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-medium hover:bg-emerald-100 transition-colors"
          >
            <CheckCircle2 size={12} />
            Recuperado
          </button>
          <button
            onClick={onPerdido}
            title="Marcar como perdido"
            className="flex items-center justify-center gap-1 px-3 py-1.5 rounded-md bg-slate-50 text-slate-600 border border-slate-200 text-[11px] font-medium hover:bg-slate-100 transition-colors"
          >
            <XCircle size={12} />
            Perdido
          </button>
        </div>
      )}

      {/* WhatsApp oficial — só para quem assumiu o lead (ou master). */}
      {podeEnviarTemplate && (
        <div className="mt-1.5 relative">
          <button
            onClick={onToggleSeletor}
            disabled={enviandoTemplate}
            className={`w-full flex items-center justify-center gap-1 px-2 py-1.5 rounded-md border text-[11px] font-medium transition-colors disabled:opacity-60 ${
              seletorAberto
                ? 'bg-green-600 text-white border-green-600'
                : 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'
            }`}
          >
            {enviandoTemplate
              ? <Loader2 size={12} className="animate-spin" />
              : <MessageSquare size={12} />}
            {enviandoTemplate ? 'Enfileirando…' : 'Enviar template'}
          </button>

          {seletorAberto && (
            <div className="absolute left-0 right-0 z-20 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden">
              <ListaTemplates
                templates={templates}
                templatesEstado={templatesEstado}
                onRecarregar={onRecarregarTemplates}
                onEscolher={onEnviarTemplate}
                onPreview={onPreviewTemplate}
                desabilitado={enviandoTemplate}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Tela: cabeçalho + seletor de abas ────────────────────────────────────────
// Cada aba tem o seu próprio fetch e o seu próprio canal Realtime; trocar de aba
// desmonta a outra. O contador do subtítulo vem da aba ativa via callback.

type Aba = 'webinar' | 'recuperacao';

const ABAS: { id: Aba; label: string }[] = [
  { id: 'webinar', label: 'Webinar' },
  { id: 'recuperacao', label: 'Recuperação' },
];

interface RecuperacaoWebinarViewProps {
  onOpenWabaChat?: (chatId: string) => void;
}

export function RecuperacaoWebinarView({ onOpenWabaChat }: RecuperacaoWebinarViewProps) {
  const [aba, setAba] = useState<Aba>('webinar');
  const [ativosWebinar, setAtivosWebinar] = useState(0);
  const [ativosRecuperacao, setAtivosRecuperacao] = useState(0);

  const ehWebinar = aba === 'webinar';
  const total = ehWebinar ? ativosWebinar : ativosRecuperacao;

  return (
    <div className="w-full px-4 sm:px-6 py-6">
      {/* Cabeçalho */}
      <div className="flex items-center gap-2.5 mb-4">
        <div className="p-2 bg-violet-100 rounded-lg text-violet-600">
          {ehWebinar ? <Video size={20} /> : <RotateCcw size={20} />}
        </div>
        <div>
          <h1 className="text-lg font-semibold text-slate-800">
            {ehWebinar ? 'Recuperação de Webinar' : 'Recuperação'}
          </h1>
          <p className="text-xs text-slate-500">
            {ehWebinar
              ? `${total} ${total === 1 ? 'lead em jogo' : 'leads em jogo'}`
              : `${total} ${total === 1 ? 'lead para recuperar' : 'leads para recuperar'}`}
          </p>
        </div>
      </div>

      {/* Seletor de abas */}
      <div className="flex items-center gap-1 mb-5 p-1 bg-white border border-slate-200 rounded-lg w-fit">
        {ABAS.map(t => (
          <button
            key={t.id}
            onClick={() => setAba(t.id)}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-sm font-medium transition-colors ${
              aba === t.id ? 'bg-violet-600 text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {t.id === 'webinar' ? <Video size={14} /> : <RotateCcw size={14} />}
            {t.label}
          </button>
        ))}
      </div>

      {ehWebinar
        ? <WebinarKanban onAtivosChange={setAtivosWebinar} onOpenWabaChat={onOpenWabaChat} />
        : <RecuperacaoFila onAtivosChange={setAtivosRecuperacao} />}
    </div>
  );
}

function WebinarKanban({ onAtivosChange, onOpenWabaChat }: {
  onAtivosChange: (n: number) => void;
  onOpenWabaChat?: (chatId: string) => void;
}) {
  const { user, profile } = useAuth();
  const [cards, setCards] = useState<WebinarCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [erroFetch, setErroFetch] = useState<string | null>(null);
  const [mostrarFechados, setMostrarFechados] = useState(false);
  // Filtro por atividade_em (última movimentação). `preset` e o intervalo custom
  // são mutuamente
  // exclusivos na intenção: escolher um preset zera as datas e vice-versa.
  const [preset, setPreset] = useState<Preset>('tudo');
  const [busca, setBusca] = useState('');
  const [dataDe, setDataDe] = useState('');
  const [dataAte, setDataAte] = useState('');
  const [acaoEmCurso, setAcaoEmCurso] = useState<string | null>(null);
  const { toast, showToast } = useToast();

  // Abre a conversa do WABA a partir do telefone do card. A RPC e read-only e
  // devolve null quando ainda nao existe chat para aquele numero.
  const [abrindoWaba, setAbrindoWaba] = useState<string | null>(null);

  const abrirWabaDoCard = useCallback(async (card: WebinarCard) => {
    if (!onOpenWabaChat) return;
    setAbrindoWaba(card.id);
    try {
      const { data, error } = await supabase.rpc('webinar_resolver_chat_waba', {
        p_webinar_id: card.id,
      });
      if (error) {
        showToast('erro', 'Não foi possível abrir a conversa. Tente novamente.');
        return;
      }
      if (!data) {
        showToast('erro', 'Ainda não há conversa no WhatsApp oficial para este contato.');
        return;
      }
      onOpenWabaChat(data as string);
    } finally {
      setAbrindoWaba(null);
    }
  }, [onOpenWabaChat, showToast]);

  // Templates aprovados — carregados uma vez, compartilhados por todos os cards.
  const [templates, setTemplates] = useState<WabaTemplate[]>([]);
  const [templatesEstado, setTemplatesEstado] = useState<'idle' | 'carregando' | 'pronto' | 'erro'>('idle');
  // Card cujo seletor está aberto (só um por vez) e card com envio em curso.
  const [seletorAberto, setSeletorAberto] = useState<string | null>(null);
  const [enviando, setEnviando] = useState<string | null>(null);
  /** Template em preview e o lead de onde ele foi aberto; null = modal fechado. */
  const [preview, setPreview] = useState<{ template: WabaTemplate; leadNome: string | null } | null>(null);
  /** Nome do assessor logado — resolve `{{2}}` no preview. */
  const [assessorNome, setAssessorNome] = useState<string | null>(null);

  // Seleção em lote. Os ids ficam num Set próprio — o Realtime recarrega a
  // lista o tempo todo e a seleção não pode ir junto (ver `fetchCards`).
  const [modoSelecao, setModoSelecao] = useState(false);
  const [selecionados, setSelecionados] = useState<Set<string>>(() => new Set());
  const [seletorLoteAberto, setSeletorLoteAberto] = useState(false);
  const [enviandoLote, setEnviandoLote] = useState(false);
  /** Leads recusados pelo último disparo em lote; null = painel fechado. */
  const [ignorados, setIgnorados] = useState<LeadIgnorado[] | null>(null);

  const janela = useMemo(() => resolverJanela(preset, dataDe, dataAte), [preset, dataDe, dataAte]);

  // O canal Realtime usa `fetchCards` como callback. Lendo a janela por ref
  // mantemos o callback estável e o canal não é recriado a cada troca de filtro.
  const janelaRef = useRef<Janela>(janela);

  const fetchCards = useCallback(async () => {
    setErroFetch(null);
    const { startUtc, endUtc } = janelaRef.current;

    let query = supabase
      .from('webinar_kanban')
      .select('*')
      // Kanban ordena por quem esquentou mais recentemente.
      .order('etapa_em', { ascending: false });

    // O filtro usa `atividade_em` (não `etapa_em`) para não perder cards que se
    // moveram no período por outra razão — assumidos ou fechados.
    if (startUtc) query = query.gte('atividade_em', startUtc);
    if (endUtc) query = query.lte('atividade_em', endUtc);

    const { data, error } = await query;

    if (error) {
      setErroFetch(error.message);
      setLoading(false);
      return;
    }
    const lista = (data ?? []) as WebinarCard[];
    setCards(lista);

    // O canal Realtime refaz este fetch a cada mudança na tabela. A seleção
    // sobrevive: só caem os ids que sumiram da lista (fechados, fora do filtro).
    const vivos = new Set(lista.filter(c => ATIVOS.includes(c.desfecho)).map(c => c.id));
    setSelecionados(prev => {
      if (prev.size === 0) return prev;
      const mantidos = [...prev].filter(id => vivos.has(id));
      return mantidos.length === prev.size ? prev : new Set(mantidos);
    });

    setLoading(false);
  }, []);

  // Primeira carga e toda troca de filtro passam por aqui. Trocar o filtro de
  // data muda o universo de cards, então a seleção inteira é descartada.
  useEffect(() => {
    janelaRef.current = janela;
    setSelecionados(new Set());
    setLoading(true);
    void fetchCards();
  }, [janela, fetchCards]);

  // Um único canal para a tabela — novo lead, avanço de evento e fechamento
  // automático por compra chegam todos por aqui.
  useEffect(() => {
    const canal = supabase
      .channel('webinar_leads_kanban')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'webinar_leads' }, () => {
        fetchCards();
      })
      .subscribe();

    return () => { supabase.removeChannel(canal); };
  }, [fetchCards]);

  const ativos = useMemo(
    () => cards.filter(c => ATIVOS.includes(c.desfecho)),
    [cards]
  );

  const fechados = useMemo(
    () => cards
      .filter(c => FECHADOS.includes(c.desfecho))
      .sort((a, b) => new Date(b.fechado_em ?? b.updated_at ?? b.created_at).getTime()
        - new Date(a.fechado_em ?? a.updated_at ?? a.created_at).getTime()),
    [cards]
  );

  // O cabeçalho das abas vive acima deste componente — ele recebe a contagem daqui.
  useEffect(() => { onAtivosChange(ativos.length); }, [ativos.length, onAtivosChange]);

  // Busca em memória: nome (acento/caixa-insensitivo) ou telefone (só dígitos,
  // ignorando a formatação exibida). Campo vazio não filtra nada.
  const termo = normalizar(busca);
  const termoDigitos = busca.replace(/\D/g, '');

  const casaBusca = (card: WebinarCard): boolean => {
    if (!termo && !termoDigitos) return true;
    const nomeOk = termo ? normalizar(card.nome ?? '').includes(termo) : false;
    const telOk = termoDigitos
      ? (card.telefone_normalized || '').replace(/\D/g, '').includes(termoDigitos)
      : false;
    return nomeOk || telOk;
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const ativosFiltrados = useMemo(() => ativos.filter(casaBusca), [ativos, termo, termoDigitos]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fechadosFiltrados = useMemo(() => fechados.filter(casaBusca), [fechados, termo, termoDigitos]);

  const porColuna = useMemo(() => {
    const mapa = new Map<number, WebinarCard[]>(COLUNAS.map(c => [c.evento, []]));
    for (const card of ativosFiltrados) {
      // `etapa_em desc` já veio do banco; o push preserva essa ordem.
      mapa.get(card.evento_max)?.push(card);
    }
    return mapa;
  }, [ativosFiltrados]);

  /**
   * Mesma regra de autorização do backend usada no envio individual: só é
   * selecionável o lead assumido por quem está olhando (ou por qualquer um, se master).
   */
  const podeSelecionarCard = useCallback(
    (card: WebinarCard) =>
      !!card.responsavel_user_id &&
      (card.responsavel_user_id === user?.id || !!profile?.is_master),
    [user?.id, profile?.is_master]
  );

  const alternarSelecao = useCallback((cardId: string) => {
    setSelecionados(prev => {
      const proximo = new Set(prev);
      if (proximo.has(cardId)) proximo.delete(cardId); else proximo.add(cardId);
      return proximo;
    });
  }, []);

  /** Marca ou desmarca de uma vez os elegíveis renderizados numa coluna. */
  const alternarColuna = useCallback((ids: string[], marcar: boolean) => {
    setSelecionados(prev => {
      const proximo = new Set(prev);
      for (const id of ids) { if (marcar) proximo.add(id); else proximo.delete(id); }
      return proximo;
    });
  }, []);

  const limparSelecao = useCallback(() => setSelecionados(new Set()), []);

  /** Sair do modo seleção descarta o que estava marcado — nada fica pendurado. */
  const alternarModoSelecao = useCallback(() => {
    setModoSelecao(atual => {
      if (atual) {
        setSelecionados(new Set());
        setSeletorLoteAberto(false);
      }
      return !atual;
    });
  }, []);

  /** Executa uma RPC, trata o `{ ok: false, erro }` e recarrega a lista. */
  const executarRpc = useCallback(async (
    cardId: string,
    fn: string,
    params: Record<string, unknown>,
    sucesso: string
  ) => {
    setAcaoEmCurso(cardId);
    try {
      const { data, error } = await supabase.rpc(fn, params);
      if (error) {
        showToast('erro', 'Não foi possível concluir a ação. Tente novamente.');
        return;
      }
      const resultado = data as { ok?: boolean; erro?: string } | null;
      if (!resultado?.ok) {
        const codigo = resultado?.erro ?? '';
        showToast('erro', ERRO_MSG[codigo] ?? 'Não foi possível concluir a ação.');
        await fetchCards();
        return;
      }
      showToast('ok', sucesso);
      await fetchCards();
    } finally {
      setAcaoEmCurso(null);
    }
  }, [fetchCards, showToast]);

  // Mesma resolução do WabaView: `nome_exibicao` é o nome que o cliente vê,
  // `nome` só entra como fallback.
  useEffect(() => {
    if (!profile?.assessor_id) {
      setAssessorNome(null);
      return;
    }
    supabase
      .from('assessores')
      .select('nome, nome_exibicao')
      .eq('id', profile.assessor_id)
      .maybeSingle()
      .then(({ data }) => setAssessorNome(data?.nome_exibicao?.trim() || data?.nome || null));
  }, [profile?.assessor_id]);

  /** Busca os templates aprovados na primeira vez que alguém abre o seletor. */
  const carregarTemplates = useCallback(async () => {
    setTemplatesEstado('carregando');
    const { data, error } = await supabase
      .from('waba_templates')
      .select('id, name, category, language, components')
      .eq('status', 'APPROVED')
      .order('name');

    if (error) {
      setTemplatesEstado('erro');
      return;
    }
    setTemplates((data ?? []) as WabaTemplate[]);
    setTemplatesEstado('pronto');
  }, []);

  const carregouTemplates = useRef(false);

  const abrirSeletor = useCallback((cardId: string) => {
    setSeletorAberto(atual => (atual === cardId ? null : cardId));
    if (!carregouTemplates.current) {
      carregouTemplates.current = true;
      void carregarTemplates();
    }
  }, [carregarTemplates]);

  const recarregarTemplates = useCallback(() => { void carregarTemplates(); }, [carregarTemplates]);

  const abrirSeletorLote = useCallback(() => {
    setSeletorLoteAberto(true);
    if (!carregouTemplates.current) {
      carregouTemplates.current = true;
      void carregarTemplates();
    }
  }, [carregarTemplates]);

  /**
   * Disparo em lote. A RPC não é idempotente — dois cliques viram dois
   * broadcasts —, então `enviandoLote` trava o botão do primeiro clique até o fim.
   */
  const dispararLote = useCallback(async (template: WabaTemplate) => {
    if (enviandoLote) return;

    const ids = [...selecionados];
    if (ids.length === 0) return;

    const quantos = `${ids.length} ${ids.length === 1 ? 'lead' : 'leads'}`;
    if (!window.confirm(`Enviar o template "${template.name}" para ${quantos}?`)) return;

    setEnviandoLote(true);
    try {
      const { data, error } = await supabase.rpc('waba_disparar_template_leads', {
        p_lead_ids: ids,
        p_template_id: template.id,
      });
      if (error) {
        showToast('erro', mensagemErroTemplate(error.message));
        return;
      }

      const resultado = data as { enfileirados?: number; ignorados?: LeadIgnorado[] } | null;
      const enfileirados = resultado?.enfileirados ?? 0;
      const recusados = resultado?.ignorados ?? [];

      setSeletorLoteAberto(false);
      setSelecionados(new Set());
      setModoSelecao(false);

      const plural = enfileirados === 1 ? 'envio enfileirado' : 'envios enfileirados';
      if (recusados.length === 0) {
        setIgnorados(null);
        showToast('ok', `${enfileirados} ${plural} — ${enfileirados === 1 ? 'sai' : 'saem'} em alguns minutos.`);
      } else {
        // Os ignorados nunca somem num toast genérico: o painel lista nome e motivo.
        setIgnorados(recusados);
        showToast(
          enfileirados === 0 ? 'erro' : 'ok',
          `${enfileirados} ${plural}, ${recusados.length} ${recusados.length === 1 ? 'lead ignorado' : 'leads ignorados'}.`
        );
      }
    } finally {
      setEnviandoLote(false);
    }
  }, [enviandoLote, selecionados, showToast]);

  /**
   * Enfileira o disparo. Toda a lógica de envio vive na RPC + engine; aqui só
   * fechamos o seletor e mantemos o usuário na lista para o próximo lead.
   */
  const dispararTemplate = useCallback(async (card: WebinarCard, template: WabaTemplate) => {
    setEnviando(card.id);
    try {
      const { error } = await supabase.rpc('waba_disparar_template_lead', {
        p_lead_id: card.id,
        p_template_id: template.id,
      });
      if (error) {
        showToast('erro', mensagemErroTemplate(error.message));
        return;
      }
      setSeletorAberto(null);
      showToast('ok', `Envio de "${template.name}" enfileirado — sai em até 1 minuto.`);
    } finally {
      setEnviando(null);
    }
  }, [showToast]);

  const assumir = (card: WebinarCard) =>
    executarRpc(card.id, 'webinar_assumir_lead', { p_webinar_id: card.id }, 'Lead assumido.');

  const marcarGanho = (card: WebinarCard) =>
    executarRpc(card.id, 'webinar_marcar_desfecho',
      { p_webinar_id: card.id, p_desfecho: 'ganho' }, 'Marcado como ganho.');

  const marcarPerdido = (card: WebinarCard) => {
    const alvo = card.nome || formatTelefone(card.telefone_normalized);
    if (!window.confirm(`Marcar "${alvo}" como perdido?`)) return;
    executarRpc(card.id, 'webinar_marcar_desfecho',
      { p_webinar_id: card.id, p_desfecho: 'perdido' }, 'Marcado como perdido.');
  };

  /** Preset limpa o intervalo custom — os dois modos não convivem. */
  const escolherPreset = (novo: Preset) => {
    setPreset(novo);
    setDataDe('');
    setDataAte('');
  };

  /** Mexer em qualquer input de data joga o filtro para o modo custom. */
  const mudarData = (edge: 'de' | 'ate', valor: string) => {
    if (edge === 'de') setDataDe(valor); else setDataAte(valor);
    setPreset('custom');
  };

  return (
    <div>
      {/* Barra de controles do webinar — o título vive no cabeçalho das abas */}
      <div className="flex flex-wrap items-center justify-end gap-3 mb-5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input
              type="text"
              placeholder="Buscar nome ou telefone..."
              value={busca}
              onChange={e => setBusca(e.target.value)}
              className="w-full sm:w-56 pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-violet-400 focus:border-violet-400"
            />
          </div>
          {/* Filtro pela última movimentação do lead (atividade_em), em horário de Brasília. */}
          <div className="flex items-center gap-1 p-1 bg-white border border-slate-200 rounded-lg">
            <Calendar size={14} className="ml-1.5 text-slate-400" />
            {PRESETS.map(p => (
              <button
                key={p.id}
                onClick={() => escolherPreset(p.id)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  preset === p.id ? 'bg-violet-600 text-white' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className={`flex items-center gap-1.5 px-2 py-1 bg-white border rounded-lg ${
            preset === 'custom' ? 'border-violet-400' : 'border-slate-200'
          }`}>
            <input
              type="date"
              value={dataDe}
              max={dataAte || undefined}
              onChange={e => mudarData('de', e.target.value)}
              className="px-1 py-1 text-xs text-slate-700 bg-transparent outline-none"
            />
            <span className="text-xs text-slate-400">até</span>
            <input
              type="date"
              value={dataAte}
              min={dataDe || undefined}
              onChange={e => mudarData('ate', e.target.value)}
              className="px-1 py-1 text-xs text-slate-700 bg-transparent outline-none"
            />
          </div>

          <button
            onClick={alternarModoSelecao}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              modoSelecao
                ? 'bg-violet-600 text-white'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            <ListChecks size={15} />
            {modoSelecao ? 'Cancelar seleção' : 'Selecionar'}
          </button>

          <button
            onClick={() => setMostrarFechados(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              mostrarFechados
                ? 'bg-slate-800 text-white'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            {mostrarFechados ? <EyeOff size={15} /> : <Eye size={15} />}
            Mostrar fechados
            {fechados.length > 0 && (
              <span className={`ml-0.5 px-1.5 py-0.5 rounded text-[11px] ${
                mostrarFechados ? 'bg-white/20' : 'bg-slate-100'
              }`}>
                {fechados.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {erroFetch && (
        <div className="mb-4 flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
          <span>Erro ao carregar os leads: {erroFetch}</span>
        </div>
      )}

      {loading ? (
        <div className="py-20 text-center text-sm text-slate-400">Carregando leads…</div>
      ) : (
        <>
          {/* Kanban — 6 colunas fixas, sem drag-and-drop */}
          <div className="flex gap-3 overflow-x-auto pb-3">
            {COLUNAS.map(coluna => {
              const daColuna = porColuna.get(coluna.evento) ?? [];
              // Só os cards realmente renderizados nesta coluna — o filtro de
              // data e a busca já foram aplicados antes de `porColuna`.
              const elegiveisColuna = daColuna.filter(podeSelecionarCard);
              const marcadosColuna = elegiveisColuna.filter(c => selecionados.has(c.id)).length;
              const todosMarcados = elegiveisColuna.length > 0 && marcadosColuna === elegiveisColuna.length;
              return (
                <div
                  key={coluna.evento}
                  className="flex-1 min-w-[230px] bg-slate-50 border border-slate-200 rounded-xl flex flex-col"
                >
                  <div className="px-3 py-2.5 border-b border-slate-200 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {modoSelecao && (
                        <input
                          type="checkbox"
                          checked={todosMarcados}
                          disabled={elegiveisColuna.length === 0}
                          // Tri-estado: parcialmente marcada só existe via DOM.
                          ref={el => {
                            if (el) el.indeterminate = marcadosColuna > 0 && !todosMarcados;
                          }}
                          onChange={() =>
                            alternarColuna(elegiveisColuna.map(c => c.id), !todosMarcados)
                          }
                          title={
                            elegiveisColuna.length === 0
                              ? 'Nenhum lead selecionável nesta coluna'
                              : 'Selecionar todos os elegíveis da coluna'
                          }
                          className="flex-shrink-0 w-3.5 h-3.5 accent-violet-600 disabled:cursor-not-allowed"
                        />
                      )}
                      <span className="text-[13px] font-semibold text-slate-700 leading-tight">
                        {coluna.nome}
                      </span>
                    </div>
                    <span className="px-1.5 py-0.5 rounded-md bg-white border border-slate-200 text-[11px] font-medium text-slate-500">
                      {daColuna.length}
                    </span>
                  </div>

                  <div className="p-2 space-y-2 min-h-[120px] max-h-[calc(100vh-260px)] overflow-y-auto">
                    {daColuna.length === 0 ? (
                      <div className="py-6 text-center text-[12px] text-slate-300">Vazio</div>
                    ) : (
                      daColuna.map(card => (
                        <CardWebinar
                          key={card.id}
                          card={card}
                          ocupado={acaoEmCurso === card.id}
                          onAssumir={() => assumir(card)}
                          onGanho={() => marcarGanho(card)}
                          onPerdido={() => marcarPerdido(card)}
                          podeEnviarTemplate={
                            !!card.responsavel_user_id &&
                            (card.responsavel_user_id === user?.id || !!profile?.is_master)
                          }
                          seletorAberto={seletorAberto === card.id}
                          onToggleSeletor={() => abrirSeletor(card.id)}
                          templates={templates}
                          templatesEstado={templatesEstado}
                          onRecarregarTemplates={recarregarTemplates}
                          enviandoTemplate={enviando === card.id}
                          onEnviarTemplate={(tpl) => dispararTemplate(card, tpl)}
                          onPreviewTemplate={(tpl) => setPreview({ template: tpl, leadNome: card.nome })}
                          modoSelecao={modoSelecao}
                          selecionado={selecionados.has(card.id)}
                          selecionavel={podeSelecionarCard(card)}
                          onToggleSelecao={() => alternarSelecao(card.id)}
                          onAbrirWaba={() => { void abrirWabaDoCard(card); }}
                          abrindoWaba={abrindoWaba === card.id}
                        />
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Fechados — lista separada, fora do kanban ativo */}
          {mostrarFechados && (
            <div className="mt-6 bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200">
                <h2 className="text-sm font-semibold text-slate-700">
                  Fechados <span className="font-normal text-slate-400">({fechadosFiltrados.length})</span>
                </h2>
              </div>
              {fechadosFiltrados.length === 0 ? (
                <div className="py-8 text-center text-sm text-slate-400">Nenhum card fechado.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="text-left font-medium px-4 py-2">Nome</th>
                        <th className="text-left font-medium px-4 py-2">Telefone</th>
                        <th className="text-left font-medium px-4 py-2">Etapa</th>
                        <th className="text-left font-medium px-4 py-2">Desfecho</th>
                        <th className="text-left font-medium px-4 py-2">Fechado em</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {fechadosFiltrados.map(card => {
                        const label = DESFECHO_LABEL[card.desfecho];
                        return (
                          <tr key={card.id} className="hover:bg-slate-50">
                            <td className="px-4 py-2.5 text-slate-700">
                              {card.nome || <span className="text-slate-400">Sem nome</span>}
                            </td>
                            <td className="px-4 py-2.5">
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => { void abrirWabaDoCard(card); }}
                                  disabled={abrindoWaba === card.id}
                                  title="Abrir conversa no WhatsApp oficial"
                                  className="inline-flex items-center gap-1.5 text-slate-600 hover:text-violet-600 hover:underline disabled:opacity-60"
                                >
                                  {abrindoWaba === card.id
                                    ? <Loader2 size={12} className="animate-spin" />
                                    : <MessageSquare size={12} />}
                                  {formatTelefone(card.telefone_normalized)}
                                </button>
                                <a
                                  href={telHref(card.telefone_normalized)}
                                  title="Ligar"
                                  className="text-slate-400 hover:text-violet-600"
                                >
                                  <Phone size={12} />
                                </a>
                              </div>
                            </td>
                            <td className="px-4 py-2.5 text-slate-500">
                              {card.evento_nome ?? `Evento ${card.evento_max}`}
                            </td>
                            <td className="px-4 py-2.5">
                              <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${label?.classe ?? 'bg-slate-100 text-slate-600'}`}>
                                {label?.texto ?? card.desfecho}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-slate-500">{formatData(card.fechado_em)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Barra de ação do lote. z-40: acima do kanban (o seletor do card é z-20)
          e abaixo do balão do chat interno (z-50) e do toast (z-[60]). Fica
          centralizada para não disputar o canto direito com esses dois. */}
      {modoSelecao && selecionados.size > 0 && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 px-4 py-2.5 rounded-full bg-slate-900 text-white shadow-xl">
          <span className="text-[13px] font-medium whitespace-nowrap">
            {selecionados.size} {selecionados.size === 1 ? 'lead selecionado' : 'leads selecionados'}
          </span>
          <button
            onClick={limparSelecao}
            disabled={enviandoLote}
            className="px-2.5 py-1 rounded-md text-[12px] text-slate-300 hover:text-white hover:bg-white/10 disabled:opacity-50"
          >
            Limpar seleção
          </button>
          <button
            onClick={abrirSeletorLote}
            disabled={enviandoLote}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-green-600 text-white text-[12px] font-medium hover:bg-green-700 disabled:opacity-60"
          >
            {enviandoLote
              ? <Loader2 size={13} className="animate-spin" />
              : <MessageSquare size={13} />}
            {enviandoLote ? 'Enfileirando…' : 'Enviar template'}
          </button>
        </div>
      )}

      {/* Seletor do lote — mesma lista do envio individual, em modal. */}
      {seletorLoteAberto && (
        <div
          className="fixed inset-0 z-[45] bg-black/50 flex items-center justify-center p-4"
          onClick={() => { if (!enviandoLote) setSeletorLoteAberto(false); }}
        >
          <div
            className="w-full max-w-sm bg-white rounded-xl shadow-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-200">
              <div>
                <h3 className="text-sm font-semibold text-slate-800">Enviar template em lote</h3>
                <p className="text-[11px] text-slate-500">
                  {selecionados.size} {selecionados.size === 1 ? 'lead selecionado' : 'leads selecionados'}
                </p>
              </div>
              <button
                onClick={() => setSeletorLoteAberto(false)}
                disabled={enviandoLote}
                className="p-1 rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
              >
                <X size={16} />
              </button>
            </div>

            <ListaTemplates
              templates={templates}
              templatesEstado={templatesEstado}
              onRecarregar={recarregarTemplates}
              onEscolher={(tpl) => { void dispararLote(tpl); }}
              onPreview={(tpl) => setPreview({ template: tpl, leadNome: null })}
              desabilitado={enviandoLote}
              alturaMax="max-h-72"
            />

            {enviandoLote && (
              <div className="flex items-center gap-2 px-4 py-2.5 border-t border-slate-100 text-[11px] text-slate-500">
                <Loader2 size={12} className="animate-spin" />
                Enfileirando os envios…
              </div>
            )}
          </div>
        </div>
      )}

      {/* Quem ficou de fora do lote, com o motivo — não cabe num toast. */}
      {ignorados && ignorados.length > 0 && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <AlertCircle size={16} className="text-amber-500" />
                <h3 className="text-sm font-semibold text-slate-800">
                  {ignorados.length} {ignorados.length === 1 ? 'lead ficou de fora' : 'leads ficaram de fora'}
                </h3>
              </div>
              <button
                onClick={() => setIgnorados(null)}
                className="p-1 rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X size={16} />
              </button>
            </div>

            <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
              {ignorados.map(item => (
                <div key={item.lead_id} className="px-4 py-2.5">
                  <p className="text-[13px] font-medium text-slate-700 break-words">
                    {item.nome || <span className="text-slate-400">Sem nome</span>}
                  </p>
                  <p className="text-[11px] text-slate-500">{textoMotivo(item.motivo)}</p>
                </div>
              ))}
            </div>

            <div className="px-4 py-3 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setIgnorados(null)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 text-white text-[12px] font-medium hover:bg-slate-900"
              >
                Entendi
              </button>
            </div>
          </div>
        </div>
      )}

      {preview && (
        <PreviewTemplateModal
          template={preview.template}
          leadNome={preview.leadNome}
          assessorNome={assessorNome}
          onClose={() => setPreview(null)}
        />
      )}

      <ToastBar toast={toast} />
    </div>
  );
}

interface PreviewModalProps {
  template: WabaTemplate;
  /** Nome do lead do card — resolve `{{1}}`. */
  leadNome: string | null;
  /** `nome_exibicao` do assessor logado — resolve `{{2}}`. */
  assessorNome: string | null;
  onClose: () => void;
}

/**
 * Preview somente-leitura do template. Reaproveita a montagem do módulo WABA
 * (`parseTemplate` + `buildTemplatePreview`) — aqui não há envio nem edição.
 */
function PreviewTemplateModal({ template, leadNome, assessorNome, onClose }: PreviewModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const texto = useMemo(() => {
    const shape = parseTemplate(template);
    const valores: Record<number, string> = {};
    const primeiroNome = leadNome?.trim().split(/\s+/)[0];
    if (primeiroNome) valores[1] = primeiroNome;
    if (assessorNome?.trim()) valores[2] = assessorNome.trim();
    return buildTemplatePreview(shape, valores);
  }, [template, leadNome, assessorNome]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white rounded-lg shadow-xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-slate-100">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wide text-slate-400">Preview</p>
            <p className="text-[13px] font-semibold text-slate-800 break-words">{template.name}</p>
          </div>
          <button
            onClick={onClose}
            title="Fechar"
            className="flex-shrink-0 p-1 rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-4 py-3 max-h-[60vh] overflow-y-auto">
          <p className="text-[13px] text-slate-700 whitespace-pre-wrap break-words">
            {texto || 'Este template não tem texto para exibir.'}
          </p>
        </div>
      </div>
    </div>
  );
}

interface ListaTemplatesProps {
  templates: WabaTemplate[];
  templatesEstado: 'idle' | 'carregando' | 'pronto' | 'erro';
  onRecarregar: () => void;
  onEscolher: (template: WabaTemplate) => void;
  onPreview: (template: WabaTemplate) => void;
  /** Trava os botões enquanto um envio está em curso. */
  desabilitado: boolean;
  /** Altura máxima da lista rolável — o lote tem mais espaço que o card. */
  alturaMax?: string;
}

/**
 * Lista de templates aprovados com preview. Usada pelo seletor de um card só e
 * pelo seletor do disparo em lote — o markup é o mesmo nos dois lugares.
 */
function ListaTemplates({
  templates, templatesEstado, onRecarregar, onEscolher, onPreview,
  desabilitado, alturaMax = 'max-h-48',
}: ListaTemplatesProps) {
  return (
    <>
      <div className="px-2.5 py-1.5 border-b border-slate-100 text-[10px] uppercase tracking-wide text-slate-400">
        Templates aprovados
      </div>

      {templatesEstado === 'carregando' && (
        <div className="px-2.5 py-3 text-[11px] text-slate-400">Carregando…</div>
      )}

      {templatesEstado === 'erro' && (
        <button
          onClick={onRecarregar}
          className="w-full px-2.5 py-3 text-left text-[11px] text-red-600 hover:bg-red-50"
        >
          Erro ao carregar. Tentar novamente.
        </button>
      )}

      {templatesEstado === 'pronto' && templates.length === 0 && (
        <div className="px-2.5 py-3 text-[11px] text-slate-400">
          Nenhum template aprovado disponível.
        </div>
      )}

      {templatesEstado === 'pronto' && templates.length > 0 && (
        <div className={`${alturaMax} overflow-y-auto`}>
          {templates.map(tpl => (
            <div
              key={tpl.id}
              className="flex items-center border-b border-slate-50 last:border-b-0"
            >
              <button
                onClick={() => onEscolher(tpl)}
                disabled={desabilitado}
                className="flex-1 min-w-0 px-2.5 py-2 text-left hover:bg-slate-50 disabled:opacity-60"
              >
                <span className="block text-[11px] font-medium text-slate-700 break-words">
                  {tpl.name}
                </span>
                {tpl.category && (
                  <span className="block text-[10px] text-slate-400">{tpl.category}</span>
                )}
              </button>
              <button
                onClick={() => onPreview(tpl)}
                title="Ver preview da mensagem"
                className="flex-shrink-0 flex items-center gap-1 px-2 py-2 mr-1 rounded-md text-[10px] text-slate-500 hover:bg-slate-100 hover:text-slate-700"
              >
                <Eye size={12} />
                Preview
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

interface CardProps {
  card: WebinarCard;
  ocupado: boolean;
  onAssumir: () => void;
  onGanho: () => void;
  onPerdido: () => void;
  podeEnviarTemplate: boolean;
  seletorAberto: boolean;
  onToggleSeletor: () => void;
  templates: WabaTemplate[];
  templatesEstado: 'idle' | 'carregando' | 'pronto' | 'erro';
  onRecarregarTemplates: () => void;
  enviandoTemplate: boolean;
  onEnviarTemplate: (template: WabaTemplate) => void;
  onPreviewTemplate: (template: WabaTemplate) => void;
  /** Modo seleção ligado — mostra o checkbox e esconde o envio individual. */
  modoSelecao: boolean;
  selecionado: boolean;
  /** Mesmo critério de `podeEnviarTemplate`: quem não passa fica desabilitado. */
  selecionavel: boolean;
  onToggleSelecao: () => void;
  /** Abre a conversa do WABA para o telefone do card (pode nao existir). */
  onAbrirWaba: () => void;
  abrindoWaba: boolean;
}

function CardWebinar({
  card, ocupado, onAssumir, onGanho, onPerdido,
  podeEnviarTemplate, seletorAberto, onToggleSeletor,
  templates, templatesEstado, onRecarregarTemplates,
  enviandoTemplate, onEnviarTemplate, onPreviewTemplate,
  modoSelecao, selecionado, selecionavel, onToggleSelecao,
  onAbrirWaba, abrindoWaba,
}: CardProps) {
  const novo = card.desfecho === 'aberto';
  const titulo = card.nome || formatTelefone(card.telefone_normalized);
  // Inelegível não some da coluna: fica visível, só apagado e sem checkbox ativo.
  const apagado = modoSelecao && !selecionavel;

  return (
    <div
      className={`rounded-lg border p-2.5 transition-colors ${
        novo
          ? 'bg-white border-violet-300 ring-1 ring-violet-100'
          : 'bg-white border-slate-200'
      } ${ocupado ? 'opacity-60 pointer-events-none' : ''} ${apagado ? 'opacity-50' : ''} ${
        selecionado ? 'ring-2 ring-violet-400 border-violet-400' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        {modoSelecao && (
          <input
            type="checkbox"
            checked={selecionado}
            disabled={!selecionavel}
            onChange={onToggleSelecao}
            title={selecionavel ? 'Selecionar este lead' : 'Este lead não pode receber template'}
            className="mt-0.5 flex-shrink-0 w-3.5 h-3.5 accent-violet-600 disabled:cursor-not-allowed"
          />
        )}
        <p className="flex-1 min-w-0 text-[13px] font-semibold text-slate-800 leading-snug break-words">
          {titulo}
        </p>
        {novo && (
          <span className="flex-shrink-0 mt-0.5 w-1.5 h-1.5 rounded-full bg-violet-500" title="Novo — ainda não assumido" />
        )}
      </div>

      <div className="mt-1.5 flex items-center gap-2">
        <button
          type="button"
          onClick={onAbrirWaba}
          disabled={abrindoWaba}
          title="Abrir conversa no WhatsApp oficial"
          className="inline-flex items-center gap-1.5 text-[12px] text-slate-600 hover:text-violet-600 hover:underline disabled:opacity-60"
        >
          {abrindoWaba ? <Loader2 size={12} className="animate-spin" /> : <MessageSquare size={12} />}
          {formatTelefone(card.telefone_normalized)}
        </button>
        <a
          href={telHref(card.telefone_normalized)}
          title="Ligar"
          className="text-slate-400 hover:text-violet-600"
        >
          <Phone size={12} />
        </a>
      </div>

      <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
        <span className="text-[11px] text-slate-400">{tempoDesde(card.etapa_em)}</span>
        {card.foi_trabalhado && (
          <span className="px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-medium">
            Em atendimento
          </span>
        )}
      </div>

      <div className="mt-2.5 flex items-center gap-1.5 flex-wrap">
        {card.desfecho === 'aberto' && (
          <button
            onClick={onAssumir}
            className="flex-1 min-w-0 flex items-center justify-center gap-1 px-2 py-1.5 rounded-md bg-violet-600 text-white text-[11px] font-medium hover:bg-violet-700 transition-colors"
          >
            <Hand size={12} />
            Assumir
          </button>
        )}
        <button
          onClick={onGanho}
          title="Marcar como ganho"
          className="flex-1 min-w-0 flex items-center justify-center gap-1 px-2 py-1.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-medium hover:bg-emerald-100 transition-colors"
        >
          <CheckCircle2 size={12} />
          Ganho
        </button>
        <button
          onClick={onPerdido}
          title="Marcar como perdido"
          className="flex-1 min-w-0 flex items-center justify-center gap-1 px-2 py-1.5 rounded-md bg-slate-50 text-slate-600 border border-slate-200 text-[11px] font-medium hover:bg-slate-100 transition-colors"
        >
          <XCircle size={12} />
          Perdido
        </button>
      </div>

      {/* WhatsApp oficial — só para quem assumiu o lead (ou master).
          No modo seleção o disparo em lote assume o lugar deste botão. */}
      {podeEnviarTemplate && !modoSelecao && (
        <div className="mt-1.5 relative">
          <button
            onClick={onToggleSeletor}
            disabled={enviandoTemplate}
            className={`w-full flex items-center justify-center gap-1 px-2 py-1.5 rounded-md border text-[11px] font-medium transition-colors disabled:opacity-60 ${
              seletorAberto
                ? 'bg-green-600 text-white border-green-600'
                : 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'
            }`}
          >
            {enviandoTemplate
              ? <Loader2 size={12} className="animate-spin" />
              : <MessageSquare size={12} />}
            {enviandoTemplate ? 'Enfileirando…' : 'Enviar template'}
          </button>

          {seletorAberto && (
            <div className="absolute left-0 right-0 z-20 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden">
              <ListaTemplates
                templates={templates}
                templatesEstado={templatesEstado}
                onRecarregar={onRecarregarTemplates}
                onEscolher={onEnviarTemplate}
                onPreview={onPreviewTemplate}
                desabilitado={enviandoTemplate}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
