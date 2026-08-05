import React, { useEffect, useMemo, useState } from 'react';
import { X, Send, Loader2, FileText } from 'lucide-react';
import type { WabaMediaKind } from '../../lib/wabaApi';
import { formatFileSize } from './wabaUtils';

type WabaMediaSendPreviewProps = {
  kind: WabaMediaKind;
  file: File;
  /**
   * Faz o envio e devolve `null` em sucesso (o pai fecha o preview) ou a
   * mensagem de erro a exibir AQUI — o banner do composer ficaria escondido
   * atrás deste overlay.
   */
  onSend: (caption: string) => Promise<string | null>;
  onCancel: () => void;
};

/**
 * Tela de confirmação antes do envio de imagem/documento, no espírito da tela
 * de envio de foto do WhatsApp: mídia grande, legenda opcional, enviar.
 */
export const WabaMediaSendPreview: React.FC<WabaMediaSendPreviewProps> = ({
  kind,
  file,
  onSend,
  onCancel,
}) => {
  const [caption, setCaption] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const imageUrl = useMemo(
    () => (kind === 'image' ? URL.createObjectURL(file) : null),
    [kind, file]
  );

  useEffect(() => {
    return () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
  }, [imageUrl]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !sending) onCancel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [sending, onCancel]);

  const handleSend = async () => {
    if (sending) return;
    setSending(true);
    setError(null);
    const failure = await onSend(caption.trim());
    // Sucesso: o pai desmonta este componente; nada mais a fazer aqui.
    if (failure !== null) {
      setError(failure);
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black/80 flex flex-col">
      {/* Topo: fechar */}
      <div
        className="flex items-center px-2 py-2 flex-shrink-0"
        style={{ paddingTop: 'calc(0.5rem + env(safe-area-inset-top))' }}
      >
        <button
          onClick={onCancel}
          disabled={sending}
          aria-label="Cancelar envio"
          className="w-11 h-11 flex items-center justify-center rounded-full text-white hover:bg-white/10 disabled:opacity-50 transition-colors"
        >
          <X size={22} />
        </button>
        <p className="ml-1 text-sm text-white/80 truncate">{file.name}</p>
      </div>

      {/* Mídia */}
      <div className="flex-1 min-h-0 flex items-center justify-center px-4">
        {kind === 'image' && imageUrl ? (
          <img
            src={imageUrl}
            alt="Prévia da imagem"
            className="max-w-full max-h-full object-contain rounded-lg"
          />
        ) : (
          <div className="bg-white rounded-2xl px-6 py-8 flex flex-col items-center gap-3 max-w-xs w-full">
            <span className="w-16 h-16 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center">
              <FileText size={32} />
            </span>
            <p className="text-sm font-medium text-slate-800 text-center break-all">{file.name}</p>
            <p className="text-xs text-slate-500">{formatFileSize(file.size)}</p>
          </div>
        )}
      </div>

      {error && (
        <p className="mx-4 mb-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm flex-shrink-0">
          {error}
        </p>
      )}

      {/* Legenda + enviar */}
      <div
        className="flex items-end gap-2 px-3 pt-2 pb-2 flex-shrink-0"
        style={{ paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom))' }}
      >
        <input
          type="text"
          value={caption}
          onChange={e => setCaption(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleSend();
            }
          }}
          disabled={sending}
          placeholder="Adicionar legenda..."
          className="flex-1 min-w-0 bg-white rounded-full px-4 py-2.5 min-h-[44px] text-base md:text-sm disabled:opacity-60"
        />
        <button
          onClick={handleSend}
          disabled={sending}
          aria-label="Enviar"
          className="flex items-center justify-center w-11 h-11 rounded-full bg-[#0C447C] text-white hover:bg-[#0a3a68] disabled:opacity-60 transition-colors flex-shrink-0"
        >
          {sending ? <Loader2 size={19} className="animate-spin" /> : <Send size={19} />}
        </button>
      </div>
    </div>
  );
};
