import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, Trash2, Check, Play, Pause, Send, Loader2 } from 'lucide-react';
import type Recorder from 'opus-recorder';
import { fileToBase64, formatMediaDuration } from './wabaUtils';

/** Limite da Meta para nota de voz é folgado; 5min mantém o arquivo pequeno. */
const MAX_SECONDS = 300;
const MIME = 'audio/ogg; codecs=opus';

type Phase = 'idle' | 'starting' | 'recording' | 'preview' | 'sending';

type WabaVoiceRecorderProps = {
  /** Faz o envio (proxy + tratamento de erro) e devolve se deu certo. */
  onSend: (base64: string, mimeType: string, durationSeconds: number) => Promise<boolean>;
  /** Erros que o usuário precisa ver (permissão negada etc.). */
  onError: (text: string) => void;
  /** Avisa quando a gravação toma o lugar do campo de texto. */
  onActiveChange: (active: boolean) => void;
  /** Esconde o botão sem desmontar (ex.: há texto digitado). */
  showMic: boolean;
};

/**
 * Nota de voz do composer WABA: microfone → gravação → preview → envio.
 *
 * Grava com `opus-recorder` (OGG/Opus mono, exigência da Meta para nota de voz
 * nativa). O encoder WASM só é carregado no primeiro toque no microfone.
 *
 * iOS: o `getUserMedia` precisa acontecer como resposta direta ao toque. Por
 * isso ele é disparado imediatamente no handler e o stream resultante entra no
 * recorder via `sourceNode` — o import dinâmico do encoder corre em paralelo,
 * sem se meter entre o gesto e o pedido de permissão.
 */
export const WabaVoiceRecorder: React.FC<WabaVoiceRecorderProps> = ({
  onSend,
  onError,
  onActiveChange,
  showMic,
}) => {
  const [phase, setPhase] = useState<Phase>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [previewTime, setPreviewTime] = useState(0);
  const [previewBroken, setPreviewBroken] = useState(false);
  // Browser sem o necessário → o botão simplesmente não existe.
  const [supported, setSupported] = useState(
    () =>
      typeof navigator !== 'undefined' &&
      typeof navigator.mediaDevices?.getUserMedia === 'function' &&
      typeof WebAssembly !== 'undefined'
  );

  const recorderRef = useRef<Recorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const blobRef = useRef<Blob | null>(null);
  const discardRef = useRef(false);
  const startedAtRef = useRef(0);
  const durationRef = useRef(0);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    onActiveChange(phase !== 'idle');
  }, [phase, onActiveChange]);

  /** Solta microfone e AudioContext. Idempotente — chamada de vários pontos. */
  const releaseMic = useCallback(() => {
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
  }, []);

  // Desmonte (troca de chat, janela fechou, saiu da tela) derruba tudo:
  // worker do encoder, microfone e blob do preview.
  useEffect(() => {
    return () => {
      try { recorderRef.current?.close(); } catch { /* parcialmente iniciado */ }
      recorderRef.current = null;
      releaseMic();
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Timer da gravação + auto-stop no limite.
  useEffect(() => {
    if (phase !== 'recording') return;
    const interval = setInterval(() => {
      const secs = Math.floor((Date.now() - startedAtRef.current) / 1000);
      setElapsed(secs);
      if (secs >= MAX_SECONDS) stopRecording(false);
    }, 250);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const handleMicTap = () => {
    if (phase !== 'idle') return;
    setPhase('starting');

    // Direto no handler do toque — qualquer await antes disto quebra no iOS.
    const streamPromise = navigator.mediaDevices.getUserMedia({ audio: true });
    // Primeiro toque paga o download do encoder; depois fica em cache.
    const modulePromise = import('opus-recorder');

    (async () => {
      let stream: MediaStream;
      try {
        stream = await streamPromise;
      } catch (err) {
        const name = err instanceof DOMException ? err.name : '';
        onError(
          name === 'NotAllowedError' || name === 'PermissionDeniedError'
            ? 'Permissão do microfone negada. Habilite o microfone nas configurações do navegador.'
            : 'Não foi possível acessar o microfone.'
        );
        setPhase('idle');
        return;
      }

      try {
        const { default: RecorderCtor } = await modulePromise;
        if (!RecorderCtor.isRecordingSupported()) throw new Error('unsupported');

        const ctx = new AudioContext();
        await ctx.resume().catch(() => {});
        const sourceNode = ctx.createMediaStreamSource(stream);

        const recorder = new RecorderCtor({
          encoderPath: `${import.meta.env.BASE_URL}opus/encoderWorker.min.js`,
          encoderApplication: 2048, // voip
          encoderSampleRate: 48000,
          encoderBitRate: 24000,
          numberOfChannels: 1,
          streamPages: false, // arquivo completo de uma vez no ondataavailable
          sourceNode,
        });

        recorder.ondataavailable = (data: Uint8Array) => {
          releaseMic();
          if (discardRef.current) {
            discardRef.current = false;
            return;
          }
          const blob = new Blob([data.slice().buffer], { type: MIME });
          blobRef.current = blob;
          setPreviewTime(0);
          setPreviewBroken(false);
          setBlobUrl(URL.createObjectURL(blob));
          setPhase('preview');
        };

        streamRef.current = stream;
        audioCtxRef.current = ctx;
        recorderRef.current = recorder;

        await recorder.start();
        startedAtRef.current = Date.now();
        setElapsed(0);
        setPhase('recording');
      } catch {
        // Falha de init (não de permissão): browser sem suporte real ao
        // encoder. Some com o botão em silêncio, como especificado.
        stream.getTracks().forEach(track => track.stop());
        releaseMic();
        setSupported(false);
        setPhase('idle');
      }
    })();
  };

  const stopRecording = (discard: boolean) => {
    const recorder = recorderRef.current;
    if (!recorder) return;

    discardRef.current = discard;
    durationRef.current = Math.min(
      MAX_SECONDS,
      Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000))
    );

    if (discard) setPhase('idle');
    // ondataavailable dispara na sequência e decide entre preview e descarte.
    recorder.stop().catch(() => {
      releaseMic();
      setPhase('idle');
    });
  };

  const discardPreview = () => {
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    setBlobUrl(null);
    blobRef.current = null;
    setPlaying(false);
    setPhase('idle');
  };

  const togglePreview = () => {
    const audio = previewAudioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      // iOS antigo não decodifica ogg/opus nem no playback local — a prévia
      // fica indisponível, mas o arquivo é válido e o envio continua liberado.
      audio.play().then(() => setPlaying(true)).catch(() => setPreviewBroken(true));
    }
  };

  const handleSend = async () => {
    const blob = blobRef.current;
    if (!blob || phase === 'sending') return;

    previewAudioRef.current?.pause();
    setPlaying(false);
    setPhase('sending');

    let base64: string;
    try {
      base64 = await fileToBase64(blob);
    } catch {
      onError('Não foi possível preparar o áudio para envio.');
      setPhase('preview');
      return;
    }

    const ok = await onSend(base64, MIME, durationRef.current);
    if (ok) discardPreview();
    else setPhase('preview'); // preservado para tentar de novo
  };

  // ── Render por fase ────────────────────────────────────────────────────────

  if (!supported) return null;

  if (phase === 'idle') {
    if (!showMic) return null;
    return (
      <button
        onClick={handleMicTap}
        aria-label="Gravar mensagem de voz"
        title="Gravar mensagem de voz"
        className="flex items-center justify-center w-11 h-11 rounded-full bg-[#0C447C] text-white hover:bg-[#0a3a68] transition-colors flex-shrink-0"
      >
        <Mic size={20} />
      </button>
    );
  }

  if (phase === 'starting' || phase === 'recording') {
    return (
      <div className="flex-1 flex items-center gap-2 min-h-[44px] bg-white border border-slate-200 rounded-3xl shadow-sm px-3 py-0.5">
        {phase === 'starting' ? (
          <Loader2 size={16} className="animate-spin text-slate-400 flex-shrink-0" />
        ) : (
          <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
        )}
        <span className="flex-1 text-base md:text-sm text-slate-700 tabular-nums">
          {phase === 'starting' ? 'Preparando...' : formatMediaDuration(elapsed)}
        </span>

        <button
          onClick={() => stopRecording(true)}
          aria-label="Cancelar gravação"
          className="flex items-center justify-center w-11 h-11 rounded-lg text-red-600 hover:bg-red-50 transition-colors flex-shrink-0"
        >
          <Trash2 size={19} />
        </button>
        <button
          onClick={() => stopRecording(false)}
          disabled={phase === 'starting'}
          aria-label="Parar gravação"
          className="flex items-center justify-center w-11 h-11 rounded-lg bg-[#0C447C] text-white hover:bg-[#0a3a68] disabled:opacity-50 transition-colors flex-shrink-0"
        >
          <Check size={19} />
        </button>
      </div>
    );
  }

  // preview | sending
  return (
    <div className="flex-1 flex items-center gap-2 min-h-[44px] bg-white border border-slate-200 rounded-3xl shadow-sm px-2 py-0.5">
      {blobUrl && (
        <audio
          ref={previewAudioRef}
          src={blobUrl}
          preload="metadata"
          onTimeUpdate={e => setPreviewTime(e.currentTarget.currentTime)}
          onEnded={() => { setPlaying(false); setPreviewTime(0); }}
          onError={() => setPreviewBroken(true)}
        />
      )}

      <button
        onClick={togglePreview}
        disabled={previewBroken || phase === 'sending'}
        aria-label={playing ? 'Pausar prévia' : 'Ouvir prévia'}
        className="flex items-center justify-center w-11 h-11 rounded-full bg-slate-600 text-white hover:bg-slate-700 disabled:opacity-50 transition-colors flex-shrink-0"
      >
        {playing ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
      </button>

      <span className="flex-1 min-w-0 text-base md:text-sm text-slate-700 tabular-nums truncate">
        {previewBroken
          ? 'Prévia indisponível neste aparelho'
          : `${formatMediaDuration(playing || previewTime > 0 ? previewTime : durationRef.current)} / ${formatMediaDuration(durationRef.current)}`}
      </span>

      <button
        onClick={discardPreview}
        disabled={phase === 'sending'}
        aria-label="Descartar áudio"
        className="flex items-center justify-center w-11 h-11 rounded-lg text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors flex-shrink-0"
      >
        <Trash2 size={19} />
      </button>
      <button
        onClick={handleSend}
        disabled={phase === 'sending'}
        aria-label="Enviar áudio"
        className="flex items-center justify-center w-11 h-11 rounded-lg bg-[#0C447C] text-white hover:bg-[#0a3a68] disabled:opacity-60 transition-colors flex-shrink-0"
      >
        {phase === 'sending' ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
      </button>
    </div>
  );
};
