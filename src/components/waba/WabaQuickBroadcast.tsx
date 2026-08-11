import React, { useEffect, useState } from 'react';
import { X, BadgeCheck, Loader2, CheckCircle2, MessageSquareText } from 'lucide-react';
import { supabase } from '../../lib/supabase';

/** Acima disto o envio exige um segundo clique deliberado. */
const CONFIRM_THRESHOLD = 20;
/** Mesmo teto da RPC — barra o envio antes da ida ao servidor. */
const MAX_LENGTH = 4096;

type QuickReply = { id: string; title: string; message: string };

type WabaQuickBroadcastProps = {
  /** Só ids com janela de 24h aberta — o pai já fez a divisão. */
  clienteIds: string[];
  /** Primeiro destinatário, para a prévia mostrar como a mensagem vai chegar. */
  exemplo?: { nome: string; assessor?: string | null } | null;
  onClose: () => void;
  /** Chamado no sucesso, antes do passo final — o pai limpa a seleção. */
  onSent: () => void;
};

const RPC_ERRORS: Record<string, string> = {
  WABA_TEXTO_VAZIO: 'Escreva a mensagem antes de enviar.',
  WABA_TEXTO_LONGO: `A mensagem passou de ${MAX_LENGTH} caracteres.`,
  WABA_SEM_NUMERO_ATIVO: 'Nenhum número oficial configurado.',
  WABA_SEM_JANELA_ABERTA:
    'Nenhum dos selecionados está na janela de 24h. A janela pode ter fechado enquanto a folha estava aberta.',
  WABA_NOT_AUTHENTICATED: 'Sessão expirada. Entre novamente.',
};

function rpcErrorMessage(error: { message?: string } | null, fallback: string): string {
  const code = Object.keys(RPC_ERRORS).find(key => error?.message?.includes(key));
  return code ? RPC_ERRORS[code] : fallback;
}

/**
 * Só para a prévia. No envio real quem resolve as variáveis é o servidor, uma
 * vez por destinatário — o texto vai cru para a RPC.
 */
function previewVars(texto: string, exemplo: { nome: string; assessor?: string | null }): string {
  return texto
    .replace(/\{nome_contato\}/g, exemplo.nome)
    .replace(/\{primeiro_nome\}/g, exemplo.nome.split(' ')[0])
    .replace(/\{nome\}/g, exemplo.nome)
    .replace(/\{assessor\}/g, exemplo.assessor || '');
}

/**
 * Disparo de texto livre para os selecionados que estão na janela de 24h.
 *
 * Não há custo nem atribuição de assessor: a RPC de texto só enfileira quem
 * respondeu nas últimas 24h e nunca muda o dono de ninguém. O envio é
 * assíncrono (a engine processa ~25 por minuto) — a folha não espera terminar.
 */
export const WabaQuickBroadcast: React.FC<WabaQuickBroadcastProps> = ({
  clienteIds,
  exemplo,
  onClose,
  onSent,
}) => {
  const [replies, setReplies] = useState<QuickReply[]>([]);
  const [texto, setTexto] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Primeiro clique acima do teto só "arma"; o segundo dispara. */
  const [armed, setArmed] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) return;

      const { data } = await supabase
        .from('quick_replies')
        .select('id, title, message')
        .eq('user_id', userId)
        .order('title');

      if (!cancelled) setReplies((data || []) as QuickReply[]);
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !sending) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [sending, onClose]);

  const trimmed = texto.trim();
  const tooLong = texto.length > MAX_LENGTH;
  const needsConfirm = clienteIds.length > CONFIRM_THRESHOLD;
  const sendDisabled = sending || !trimmed || tooLong || clienteIds.length === 0;

  const handleSend = async () => {
    if (sendDisabled) return;

    if (needsConfirm && !armed) {
      setArmed(true);
      return;
    }

    setSending(true);
    setError(null);

    // Texto cru: as variáveis são resolvidas no servidor, por destinatário.
    const { data: createdId, error: createError } = await supabase.rpc(
      'waba_broadcast_criar_texto',
      {
        p_texto: trimmed,
        p_filtro: { cliente_ids: clienteIds },
        p_nome: `Mensagem rápida — ${clienteIds.length} clientes`,
        p_delay_ms: 1200,
      }
    );

    if (createError || !createdId) {
      setError(rpcErrorMessage(createError, 'Não foi possível criar o disparo.'));
      setSending(false);
      setArmed(false);
      return;
    }

    // Nasce como rascunho; só envia ao virar 'executando'.
    const { error: startError } = await supabase
      .from('waba_broadcasts')
      .update({ status: 'executando' })
      .eq('id', createdId);

    if (startError) {
      setError('O disparo foi criado mas não pôde ser iniciado. Verifique em Disparos.');
      setSending(false);
      return;
    }

    onSent();
    setSending(false);
    setDone(true);
  };

  return (
    <div
      className="fixed inset-0 z-[70] bg-black/50 flex items-end md:items-center justify-center"
      onClick={e => { if (e.target === e.currentTarget && !sending) onClose(); }}
    >
      <div
        className="bg-white w-full md:max-w-md rounded-t-2xl md:rounded-2xl shadow-2xl flex flex-col max-h-[85dvh]"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {/* Cabeçalho */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 flex-shrink-0">
          <p className="flex-1 text-sm font-semibold text-slate-800 flex items-center gap-2">
            <BadgeCheck size={16} className="text-emerald-600" />
            {done ? 'Disparo criado' : `Mensagem rápida · ${clienteIds.length} selecionados`}
          </p>
          <button
            onClick={onClose}
            disabled={sending}
            aria-label="Fechar"
            className="w-11 h-11 -mr-2 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 disabled:opacity-50"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-4">
          {done ? (
            <div className="py-4 space-y-3">
              <div className="text-center space-y-2">
                <CheckCircle2 size={40} className="mx-auto text-emerald-600" />
                <p className="text-sm text-slate-700">
                  Disparo criado — o envio é feito aos poucos pela engine (cerca de 25 por minuto).
                </p>
                <p className="text-xs text-slate-500">Acompanhe o andamento em Disparos.</p>
              </div>
              <button
                onClick={onClose}
                className="w-full min-h-[44px] rounded-xl bg-slate-100 text-slate-700 text-sm font-medium hover:bg-slate-200 transition-colors"
              >
                Fechar
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Respostas prontas — atalho, não obrigação: dá para escrever do zero. */}
              {replies.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                    Respostas rápidas
                  </p>
                  <div className="space-y-1">
                    {replies.map(reply => (
                      <button
                        key={reply.id}
                        onClick={() => { setTexto(reply.message); setArmed(false); }}
                        className="w-full min-h-[44px] text-left border border-slate-200 rounded-xl px-3 py-2 hover:border-[#0C447C] hover:bg-slate-50 transition-colors"
                      >
                        <span className="flex items-center gap-2">
                          <MessageSquareText size={14} className="text-slate-400 flex-shrink-0" />
                          <span className="flex-1 text-sm font-medium text-slate-800 truncate">
                            {reply.title}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label
                  htmlFor="waba-quick-texto"
                  className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5"
                >
                  Mensagem
                </label>
                <textarea
                  id="waba-quick-texto"
                  value={texto}
                  onChange={e => { setTexto(e.target.value); setArmed(false); }}
                  rows={5}
                  placeholder="Escreva a mensagem que vai para os selecionados..."
                  // text-base no mobile: abaixo de 16px o iOS dá zoom ao focar.
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-base md:text-sm resize-none focus:ring-2 focus:ring-[#0C447C] focus:border-[#0C447C]"
                />
                <div className="flex items-start gap-2 mt-1">
                  <p className="flex-1 text-[11px] text-slate-400">
                    Variáveis: {'{primeiro_nome}'} · {'{nome_contato}'} · {'{nome}'} · {'{assessor}'}
                  </p>
                  <span className={`text-[11px] flex-shrink-0 ${tooLong ? 'text-red-600 font-medium' : 'text-slate-400'}`}>
                    {texto.length}/{MAX_LENGTH}
                  </span>
                </div>
              </div>

              {trimmed && exemplo && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">
                    Como chega para {exemplo.nome}
                  </p>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">
                    {previewVars(trimmed, exemplo)}
                  </p>
                </div>
              )}

              <p className="text-sm text-slate-700">
                Vai para <strong>{clienteIds.length}</strong> cliente
                {clienteIds.length === 1 ? '' : 's'}, {clienteIds.length === 1 ? 'que está' : 'todos'}{' '}
                dentro da janela de 24h — <span className="text-emerald-700 font-medium">sem custo</span>.
              </p>

              {error && (
                <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              <button
                onClick={handleSend}
                disabled={sendDisabled}
                className={`w-full min-h-[48px] px-3 flex items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  armed
                    ? 'bg-amber-500 text-white hover:bg-amber-600'
                    : 'bg-[#0C447C] text-white hover:bg-[#0a3a68]'
                }`}
              >
                {sending ? (
                  <>
                    <Loader2 size={17} className="animate-spin" /> Criando disparo...
                  </>
                ) : armed ? (
                  `Confirmar — enviar para ${clienteIds.length} clientes`
                ) : (
                  'Criar e iniciar disparo'
                )}
              </button>
              {armed && !sending && (
                <p className="text-xs text-slate-500 text-center -mt-2">
                  Toque de novo para confirmar.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
