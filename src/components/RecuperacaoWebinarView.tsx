import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Phone, CheckCircle2, XCircle, Hand, Eye, EyeOff, AlertCircle, Video } from 'lucide-react';
import { supabase } from '../lib/supabase';

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
  responsavel_email: string | null;
  foi_trabalhado: boolean;
  trabalhado_em: string | null;
  cliente_id: string | null;
  fechado_em: string | null;
  fechado_automatico: boolean | null;
  created_at: string;
  updated_at: string | null;
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
};

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

export function RecuperacaoWebinarView() {
  const [cards, setCards] = useState<WebinarCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [erroFetch, setErroFetch] = useState<string | null>(null);
  const [mostrarFechados, setMostrarFechados] = useState(false);
  const [acaoEmCurso, setAcaoEmCurso] = useState<string | null>(null);
  const [toast, setToast] = useState<{ tipo: 'erro' | 'ok'; texto: string } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((tipo: 'erro' | 'ok', texto: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ tipo, texto });
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }, []);

  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  const fetchCards = useCallback(async () => {
    setErroFetch(null);
    const { data, error } = await supabase
      .from('webinar_kanban')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      setErroFetch(error.message);
      setLoading(false);
      return;
    }
    setCards((data ?? []) as WebinarCard[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchCards(); }, [fetchCards]);

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

  const porColuna = useMemo(() => {
    const mapa = new Map<number, WebinarCard[]>(COLUNAS.map(c => [c.evento, []]));
    for (const card of ativos) {
      // `created_at desc` já veio do banco; o push preserva essa ordem.
      mapa.get(card.evento_max)?.push(card);
    }
    return mapa;
  }, [ativos]);

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

  return (
    <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-6">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-violet-100 rounded-lg text-violet-600">
            <Video size={20} />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-slate-800">Recuperação de Webinar</h1>
            <p className="text-xs text-slate-500">
              {ativos.length} {ativos.length === 1 ? 'lead em jogo' : 'leads em jogo'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
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
          <div className="flex gap-3 pb-3">
            {COLUNAS.map(coluna => {
              const daColuna = porColuna.get(coluna.evento) ?? [];
              return (
                <div
                  key={coluna.evento}
                  className="flex-1 min-w-[150px] bg-slate-50 border border-slate-200 rounded-xl flex flex-col"
                >
                  <div className="px-3 py-2.5 border-b border-slate-200 flex items-center justify-between gap-2">
                    <span className="text-[13px] font-semibold text-slate-700 leading-tight">
                      {coluna.nome}
                    </span>
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
                  Fechados <span className="font-normal text-slate-400">({fechados.length})</span>
                </h2>
              </div>
              {fechados.length === 0 ? (
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
                      {fechados.map(card => {
                        const label = DESFECHO_LABEL[card.desfecho];
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

      {toast && (
        <div
          className={`fixed bottom-5 right-5 z-50 max-w-sm px-4 py-3 rounded-lg shadow-lg text-sm text-white ${
            toast.tipo === 'erro' ? 'bg-red-600' : 'bg-emerald-600'
          }`}
        >
          {toast.texto}
        </div>
      )}
    </div>
  );
}

interface CardProps {
  card: WebinarCard;
  ocupado: boolean;
  onAssumir: () => void;
  onGanho: () => void;
  onPerdido: () => void;
}

function CardWebinar({ card, ocupado, onAssumir, onGanho, onPerdido }: CardProps) {
  const novo = card.desfecho === 'aberto';
  const titulo = card.nome || formatTelefone(card.telefone_normalized);

  return (
    <div
      className={`rounded-lg border p-2.5 transition-colors ${
        novo
          ? 'bg-white border-violet-300 ring-1 ring-violet-100'
          : 'bg-white border-slate-200'
      } ${ocupado ? 'opacity-60 pointer-events-none' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[13px] font-semibold text-slate-800 leading-snug break-words">
          {titulo}
        </p>
        {novo && (
          <span className="flex-shrink-0 mt-0.5 w-1.5 h-1.5 rounded-full bg-violet-500" title="Novo — ainda não assumido" />
        )}
      </div>

      <a
        href={telHref(card.telefone_normalized)}
        className="mt-1.5 inline-flex items-center gap-1.5 text-[12px] text-slate-600 hover:text-violet-600 hover:underline"
      >
        <Phone size={12} />
        {formatTelefone(card.telefone_normalized)}
      </a>

      <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
        <span className="text-[11px] text-slate-400">{tempoDesde(card.created_at)}</span>
        {card.foi_trabalhado && (
          <span className="px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-medium">
            Em atendimento
          </span>
        )}
      </div>

      <div className="mt-2.5 flex items-center gap-1.5">
        {card.desfecho === 'aberto' && (
          <button
            onClick={onAssumir}
            className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-md bg-violet-600 text-white text-[11px] font-medium hover:bg-violet-700 transition-colors"
          >
            <Hand size={12} />
            Assumir
          </button>
        )}
        <button
          onClick={onGanho}
          title="Marcar como ganho"
          className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-medium hover:bg-emerald-100 transition-colors"
        >
          <CheckCircle2 size={12} />
          Ganho
        </button>
        <button
          onClick={onPerdido}
          title="Marcar como perdido"
          className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-md bg-slate-50 text-slate-600 border border-slate-200 text-[11px] font-medium hover:bg-slate-100 transition-colors"
        >
          <XCircle size={12} />
          Perdido
        </button>
      </div>
    </div>
  );
}
