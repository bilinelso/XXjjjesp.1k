import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

const MAX_LEN = 40;

/**
 * Mensagens da RPC `assessor_definir_nome_exibicao`, que sinaliza erro pelo
 * texto do `error.message`. Qualquer código fora desta lista cai no genérico.
 */
const ERROS: Record<string, string> = {
  NOME_LONGO: `Máximo de ${MAX_LEN} caracteres.`,
  NOME_INVALIDO: 'Não use asteriscos nem quebras de linha.',
  NOME_EM_USO: 'Esse nome já é usado por outro assessor.',
  SEM_ASSESSOR_VINCULADO:
    'Sua conta não está vinculada a um assessor. Fale com o administrador.',
  NAO_AUTENTICADO: 'Sessão expirada. Entre novamente.',
};

function traduzirErro(message: string): string {
  const codigo = Object.keys(ERROS).find(c => message.includes(c));
  return codigo ? ERROS[codigo] : 'Não foi possível salvar. Tente novamente.';
}

/** Mesma validação do backend, só para evitar o round-trip. */
function validar(valor: string): string | null {
  if (valor.length > MAX_LEN) return ERROS.NOME_LONGO;
  if (/[*\r\n]/.test(valor)) return ERROS.NOME_INVALIDO;
  return null;
}

/**
 * Nome que o cliente vê no WhatsApp oficial — o `*Nome:*` no início de cada
 * mensagem enviada. Não mexe no campo `nome` do assessor: aquele é chave de
 * junção com `clientes.assessor` e alterá-lo quebraria roteamento de inbound,
 * distribuição de leads e filtros do Kanban.
 */
export function NomeExibicaoConfig() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  /** null = usuário logado não tem assessor vinculado; o card não aparece. */
  const [nome, setNome] = useState<string | null>(null);
  const [valor, setValor] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    let cancelado = false;

    (async () => {
      const { data } = await supabase
        .from('assessores')
        .select('nome, nome_exibicao')
        .eq('user_id', user.id)
        .maybeSingle();

      if (cancelado) return;
      if (data) {
        setNome(data.nome);
        setValor(data.nome_exibicao ?? '');
      }
      setLoading(false);
    })();

    return () => {
      cancelado = true;
    };
  }, [user]);

  const salvar = async (novoValor: string) => {
    const invalido = validar(novoValor);
    if (invalido) {
      setErro(invalido);
      return;
    }

    setSaving(true);
    setErro(null);
    setSaved(false);

    // A RPC devolve o nome efetivo (com fallback para o cadastrado), mas o input
    // guarda só o override: ao limpar, ele volta a ficar vazio, não vira o nome.
    const { error } = await supabase.rpc('assessor_definir_nome_exibicao', {
      p_nome: novoValor,
    });

    setSaving(false);

    if (error) {
      setErro(traduzirErro(error.message));
      return;
    }

    setValor(novoValor);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (loading || !nome) return null;

  const exibido = valor.trim() || nome;
  const erroLocal = validar(valor);

  return (
    <div className="bg-white p-6 rounded-lg shadow space-y-4">
      <div>
        <h3 className="text-lg font-bold text-slate-800">Nome de exibição no WhatsApp</h3>
        <p className="text-sm text-slate-500 mt-1">
          É o nome que aparece para o cliente no início das suas mensagens do WhatsApp oficial.
          Não altera seu nome cadastrado (<strong>{nome}</strong>) nem nada dentro do CRM.
        </p>
      </div>

      <div>
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={valor}
            maxLength={MAX_LEN}
            placeholder={nome}
            onChange={e => {
              setValor(e.target.value.replace(/[\r\n]/g, ''));
              setErro(null);
              setSaved(false);
            }}
            disabled={saving}
            className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
          />
          <span className="text-xs text-slate-400 shrink-0 tabular-nums">
            {valor.length}/{MAX_LEN}
          </span>
        </div>
        <p className="text-xs text-slate-400 mt-1">
          Se deixar em branco, o cliente vê seu nome cadastrado: <strong>{nome}</strong>.
        </p>
      </div>

      <div className="rounded-lg bg-slate-50 border border-slate-200 p-4">
        <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">
          Prévia
        </p>
        <p className="text-sm text-slate-800 whitespace-pre-line">
          <strong>{exibido}:</strong>
          {'\n\n'}
          Olá! Vi que você se cadastrou, posso te ajudar?
        </p>
      </div>

      {(erro || erroLocal) && (
        <p className="text-sm text-red-600">{erro || erroLocal}</p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => salvar(valor.trim())}
          disabled={saving || !!erroLocal}
          className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-60"
        >
          Salvar
        </button>
        <button
          type="button"
          onClick={() => salvar('')}
          disabled={saving || !valor}
          className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 disabled:opacity-40"
        >
          Usar meu nome cadastrado
        </button>

        {saving && <Loader2 size={18} className="animate-spin text-slate-400" />}
        {saved && !saving && (
          <span className="text-sm font-medium text-emerald-600">Salvo!</span>
        )}
      </div>
    </div>
  );
}
