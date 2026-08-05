import React from 'react';
import { FileText, Download, ImageOff, Loader2 } from 'lucide-react';
import type { WabaMessage } from '../../lib/wabaApi';
import { WabaAudioPlayer } from './WabaAudioPlayer';
import { documentFileName, mediaCaption, MEDIA_TIMEOUT_MS } from './wabaUtils';

type WabaMessageMediaProps = {
  /** `localMediaUrl` é o blob URL da otimista, presente até a `media_url` real chegar. */
  message: WabaMessage & { localMediaUrl?: string };
  /** Relógio do WabaView — decide quando a mídia deixou de estar "chegando". */
  now: number;
};

const MEDIA_BOX = 'max-w-full w-auto rounded-lg';

/** Legenda real da mídia (placeholders entre colchetes não são exibidos). */
const Caption: React.FC<{ text: string | null | undefined }> = ({ text }) => {
  const caption = mediaCaption(text);
  if (!caption) return null;
  return <p className="text-sm whitespace-pre-wrap break-words mt-1.5">{caption}</p>;
};

/**
 * Renderiza o conteúdo de uma mensagem de mídia.
 *
 * A `media_url` chega depois da linha: o webhook insere a mensagem e só então
 * baixa o arquivo da Meta e faz UPDATE. Enquanto isso o componente mostra um
 * esqueleto no formato do tipo; o UPDATE chega pelo canal realtime existente e
 * troca sozinho pela mídia.
 */
export const WabaMessageMedia: React.FC<WabaMessageMediaProps> = ({ message, now }) => {
  const { message_type: type, message_text: text } = message;
  // A URL do Storage vence; o blob local segura o preview enquanto ela não vem.
  const url = message.media_url || message.localMediaUrl || null;

  if (!url) {
    const elapsed = now - new Date(message.timestamp).getTime();

    // Passado o prazo, o download falhou de vez. A decisão é feita na
    // renderização comparando com o relógio — sem polling.
    if (elapsed > MEDIA_TIMEOUT_MS) {
      return (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <ImageOff size={16} className="flex-shrink-0" />
          <span>Mídia indisponível{text ? ` · ${text}` : ''}</span>
        </div>
      );
    }

    return <MediaSkeleton type={type} />;
  }

  switch (type) {
    case 'audio':
      return <WabaAudioPlayer src={url} fromMe={message.from_me} />;

    case 'sticker':
      return <img src={url} alt="Sticker" loading="lazy" className="w-32 h-32 object-contain" />;

    case 'image':
      return (
        <>
          {/* Nova aba em vez de lightbox: no celular o visualizador nativo já
              dá zoom e compartilhar, sem prender scroll nem foco. */}
          <a href={url} target="_blank" rel="noopener" className="block">
            <img
              src={url}
              alt={mediaCaption(text) || 'Imagem recebida'}
              loading="lazy"
              className={`${MEDIA_BOX} max-h-[320px] object-cover`}
            />
          </a>
          <Caption text={text} />
        </>
      );

    case 'video':
      return (
        <>
          <video
            src={url}
            controls
            preload="metadata"
            className={`${MEDIA_BOX} max-h-[320px]`}
          />
          <Caption text={text} />
        </>
      );

    case 'document':
      return (
        <a
          href={url}
          target="_blank"
          rel="noopener"
          className="flex items-center gap-2.5 min-h-[44px] px-2 py-1.5 -mx-1 rounded-lg bg-white/70 border border-slate-200 hover:bg-white transition-colors"
        >
          <FileText size={20} className="text-[#0C447C] flex-shrink-0" />
          <span className="flex-1 min-w-0 text-base md:text-sm text-slate-700 truncate">
            {documentFileName(text)}
          </span>
          <Download size={16} className="text-slate-400 flex-shrink-0" />
        </a>
      );

    default:
      return <p className="text-sm whitespace-pre-wrap break-words">{text}</p>;
  }
};

/** Esqueleto no formato do tipo, para o balão não pular quando a mídia chega. */
const MediaSkeleton: React.FC<{ type: string }> = ({ type }) => {
  if (type === 'audio') {
    return (
      <div className="flex items-center gap-2 w-full min-w-[180px] sm:min-w-[220px] opacity-60">
        <div className="flex-shrink-0 w-11 h-11 md:w-9 md:h-9 rounded-full bg-slate-300 flex items-center justify-center">
          <Loader2 size={16} className="animate-spin text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="w-full h-1.5 bg-black/10 rounded-full" />
          <p className="text-[11px] text-slate-400 mt-1">Baixando áudio...</p>
        </div>
      </div>
    );
  }

  if (type === 'document') {
    return (
      <div className="flex items-center gap-2.5 min-h-[44px] px-2 py-1.5 rounded-lg bg-slate-100 opacity-70">
        <Loader2 size={18} className="animate-spin text-slate-400 flex-shrink-0" />
        <span className="text-sm text-slate-500">Baixando documento...</span>
      </div>
    );
  }

  const size = type === 'sticker' ? 'w-32 h-32' : 'w-48 h-32';
  return (
    <div className={`${size} rounded-lg bg-slate-200 animate-pulse flex items-center justify-center`}>
      <Loader2 size={20} className="animate-spin text-slate-400" />
    </div>
  );
};
