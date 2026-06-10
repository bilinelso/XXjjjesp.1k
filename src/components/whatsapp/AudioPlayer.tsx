import { useState, useRef, useEffect } from 'react';
import { Play, Pause, Loader2, AlertCircle, Mic } from 'lucide-react';
import { supabase } from '../../lib/supabase';

const PROXY_BASE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/evolution-proxy`;

async function fetchMediaBase64(instanceName: string, messageId: string): Promise<{ base64: string; mimetype: string }> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY;

  const response = await fetch(PROXY_BASE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      endpoint: `/chat/getBase64FromMediaMessage/${instanceName}`,
      method: 'POST',
      body: { message: { key: { id: messageId } } },
    }),
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return await response.json();
}

interface AudioPlayerProps {
  messageId?: string;
  instanceName?: string;
  existingBase64?: string | null;
  fromMe?: boolean;
}

type State = 'idle' | 'loading' | 'playing' | 'paused' | 'error';

export function AudioPlayer({ messageId, instanceName, existingBase64, fromMe }: AudioPlayerProps) {
  const [state, setState] = useState<State>('idle');
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // If existingBase64 provided, create blob URL immediately
  useEffect(() => {
    if (existingBase64 && !blobUrl) {
      try {
        const binary = atob(existingBase64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const blob = new Blob([bytes], { type: 'audio/ogg' });
        setBlobUrl(URL.createObjectURL(blob));
        setState('idle');
      } catch {
        setState('error');
      }
    }
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [existingBase64]);

  const loadAndPlay = async () => {
    if (!messageId || !instanceName) return;

    setState('loading');
    try {
      const { base64, mimetype } = await fetchMediaBase64(instanceName, messageId);

      // Save to DB
      await supabase
        .from('persistent_messages')
        .update({ media_base64: base64 })
        .eq('message_id', messageId);

      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: mimetype || 'audio/ogg' });
      const url = URL.createObjectURL(blob);
      setBlobUrl(url);

      // Play after setting blob
      setTimeout(() => {
        audioRef.current?.play();
        setState('playing');
      }, 50);
    } catch {
      setState('error');
    }
  };

  const handleToggle = async () => {
    if (state === 'loading') return;

    if (!blobUrl) {
      await loadAndPlay();
      return;
    }

    const audio = audioRef.current;
    if (!audio) return;

    if (state === 'playing') {
      audio.pause();
      setState('paused');
    } else {
      audio.play();
      setState('playing');
    }
  };

  const handleTimeUpdate = () => {
    const audio = audioRef.current;
    if (!audio || !audio.duration) return;
    setProgress((audio.currentTime / audio.duration) * 100);
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) setDuration(audioRef.current.duration);
  };

  const handleEnded = () => {
    setState('idle');
    setProgress(0);
    if (audioRef.current) audioRef.current.currentTime = 0;
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !audio.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    audio.currentTime = ratio * audio.duration;
  };

  const formatDuration = (s: number) => {
    if (!s || isNaN(s)) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const currentTime = audioRef.current?.currentTime ?? 0;

  const btnBg = fromMe ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-slate-600 hover:bg-slate-700';

  return (
    <div className="flex items-center gap-2 min-w-[200px] max-w-[260px]">
      {blobUrl && (
        <audio
          ref={audioRef}
          src={blobUrl}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onEnded={handleEnded}
          preload="metadata"
        />
      )}

      {/* Play/Pause button */}
      <button
        onClick={handleToggle}
        disabled={state === 'loading'}
        className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-white transition-colors ${btnBg} disabled:opacity-60`}
      >
        {state === 'loading' ? (
          <Loader2 size={16} className="animate-spin" />
        ) : state === 'error' ? (
          <AlertCircle size={16} />
        ) : state === 'playing' ? (
          <Pause size={16} />
        ) : (
          <Play size={16} className="ml-0.5" />
        )}
      </button>

      <div className="flex-1 min-w-0">
        {/* Progress bar */}
        <div
          className="w-full h-1.5 bg-black/10 rounded-full cursor-pointer overflow-hidden"
          onClick={handleSeek}
        >
          <div
            className={`h-full rounded-full transition-all ${fromMe ? 'bg-emerald-700' : 'bg-slate-500'}`}
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Time */}
        <div className="flex items-center justify-between mt-0.5">
          <div className="flex items-center gap-1">
            <Mic size={10} className={fromMe ? 'text-emerald-700' : 'text-slate-500'} />
            <span className="text-[10px] text-slate-500">
              {state === 'playing' || state === 'paused'
                ? formatDuration(currentTime)
                : formatDuration(duration)}
            </span>
          </div>
          {duration > 0 && state !== 'playing' && state !== 'paused' && (
            <span className="text-[10px] text-slate-400">{formatDuration(duration)}</span>
          )}
        </div>
      </div>
    </div>
  );
}
