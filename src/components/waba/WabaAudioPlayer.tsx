import React, { useRef, useState } from 'react';
import { Play, Pause, Mic, Download } from 'lucide-react';
import { formatMediaDuration } from './wabaUtils';

type WabaAudioPlayerProps = {
  src: string;
  fromMe: boolean;
};

/**
 * Player de voz do módulo WABA.
 *
 * Segue o estilo do player do módulo QR, mas é código próprio: lá a mídia vem
 * em base64 pela evolution-proxy, aqui já é uma URL pública do Storage.
 *
 * A duração vem sempre do `loadedmetadata` do elemento — a coluna
 * `media_duration_seconds` não é populada.
 */
export const WabaAudioPlayer: React.FC<WabaAudioPlayerProps> = ({ src, fromMe }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [failed, setFailed] = useState(false);

  // Safari/iOS não decodifica audio/ogg com Opus. Não há como transcodificar no
  // browser, então o player cede lugar a um link de download.
  if (failed) {
    return (
      <a
        href={src}
        target="_blank"
        rel="noopener"
        className="flex items-center gap-2 min-h-[44px] text-base md:text-sm text-[#0C447C] font-medium hover:underline"
      >
        <Download size={18} className="flex-shrink-0" />
        Baixar áudio
      </a>
    );
  }

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      // O play() pode ser rejeitado (codec não suportado) sem disparar `error`.
      audio.play().then(() => setPlaying(true)).catch(() => setFailed(true));
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !audio.duration || !Number.isFinite(audio.duration)) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
    audio.currentTime = ratio * audio.duration;
    setCurrentTime(audio.currentTime);
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const buttonBg = fromMe ? 'bg-[#0C447C] hover:bg-[#0a3a68]' : 'bg-slate-600 hover:bg-slate-700';

  return (
    <div className="flex items-center gap-2 w-full min-w-[180px] sm:min-w-[220px]">
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={e => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d)) setDuration(d);
        }}
        onTimeUpdate={e => setCurrentTime(e.currentTarget.currentTime)}
        onEnded={() => { setPlaying(false); setCurrentTime(0); }}
        onError={() => setFailed(true)}
      />

      <button
        onClick={toggle}
        aria-label={playing ? 'Pausar áudio' : 'Reproduzir áudio'}
        className={`flex-shrink-0 w-11 h-11 md:w-9 md:h-9 rounded-full flex items-center justify-center text-white transition-colors ${buttonBg}`}
      >
        {playing ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
      </button>

      <div className="flex-1 min-w-0">
        {/* py-3 dá 44px de área tocável mantendo a barra fina. */}
        <div className="py-3 -my-2 cursor-pointer" onClick={handleSeek}>
          <div className="w-full h-1.5 bg-black/10 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${fromMe ? 'bg-[#0C447C]' : 'bg-slate-500'}`}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 mt-0.5">
          <span className="flex items-center gap-1 text-[11px] text-slate-500">
            <Mic size={11} />
            {formatMediaDuration(currentTime)}
          </span>
          {duration > 0 && (
            <span className="text-[11px] text-slate-400">{formatMediaDuration(duration)}</span>
          )}
        </div>
      </div>
    </div>
  );
};
