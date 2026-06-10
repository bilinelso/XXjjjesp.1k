import { useState, useEffect, useCallback, useRef } from 'react';
import { QrCode, Loader2, CheckCircle, WifiOff, RefreshCw, Smartphone, ArrowLeftRight } from 'lucide-react';
import { evolutionApi } from '../../lib/evolutionApi';
import type { EvolutionConnectionState } from '../../lib/evolutionApi';

interface WhatsAppQRCodeProps {
  instanceName: string;
  onConnected: () => void;
  isAlreadyConnected?: boolean;
  phoneNumber?: string | null;
}

export function WhatsAppQRCode({ instanceName, onConnected, isAlreadyConnected, phoneNumber }: WhatsAppQRCodeProps) {
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<EvolutionConnectionState['state']>('close');
  const [loading, setLoading] = useState(!isAlreadyConnected);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [showChangeNumber, setShowChangeNumber] = useState(isAlreadyConnected === true);
  const [reconnecting, setReconnecting] = useState(false);
  const isFetchingRef = useRef(false);
  const isConnectedRef = useRef(false);

  const checkConnection = useCallback(async () => {
    if (isConnectedRef.current) return true;
    try {
      const state = await evolutionApi.getConnectionState(instanceName);
      const rawState = state as any;
      const resolvedState = rawState?.state || rawState?.instance?.state || rawState?.connectionState;
      if (resolvedState === 'open') {
        setConnectionState('open');
        isConnectedRef.current = true;
        onConnected();
        return true;
      }
      setConnectionState(resolvedState || 'close');
      return false;
    } catch {
      return false;
    }
  }, [instanceName, onConnected]);

  const fetchQRCode = useCallback(async () => {
    if (isFetchingRef.current || isConnectedRef.current || showChangeNumber) return;
    isFetchingRef.current = true;
    setLoading(true);
    setError(null);

    try {
      const isConnected = await checkConnection();
      if (isConnected) return;

      await new Promise(resolve => setTimeout(resolve, 1000));

      const qr = await evolutionApi.getQRCode(instanceName);
      if (qr.base64) {
        setQrCode(qr.base64);
      } else if (qr.pairingCode) {
        setPairingCode(qr.pairingCode);
      } else if (qr.code) {
        setQrCode(null);
      }
    } catch (err: any) {
      if (err.message?.includes('already connected') || err.message?.includes('open')) {
        setConnectionState('open');
        isConnectedRef.current = true;
        onConnected();
        return;
      }
      setError(err.message || 'Erro ao obter QR Code');
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  }, [instanceName, checkConnection, onConnected, showChangeNumber]);

  const handleChangeNumber = async () => {
    setReconnecting(true);
    setError(null);
    try {
      await evolutionApi.reconnectInstance();
      setShowChangeNumber(false);
      setRetryCount(c => c + 1);
    } catch (err: any) {
      setError(err.message || 'Erro ao reconectar instancia');
    } finally {
      setReconnecting(false);
    }
  };

  useEffect(() => {
    if (!showChangeNumber) {
      fetchQRCode();
    }
  }, [fetchQRCode, retryCount, showChangeNumber]);

  useEffect(() => {
    if (connectionState === 'open' || showChangeNumber) return;

    const interval = setInterval(async () => {
      if (isConnectedRef.current) {
        clearInterval(interval);
        return;
      }
      const connected = await checkConnection();
      if (connected) clearInterval(interval);
    }, 5000);

    return () => clearInterval(interval);
  }, [checkConnection, connectionState, showChangeNumber]);

  useEffect(() => {
    if (connectionState !== 'open' && !loading && qrCode && !showChangeNumber) {
      const timeout = setTimeout(() => {
        setRetryCount(c => c + 1);
      }, 40000);
      return () => clearTimeout(timeout);
    }
  }, [connectionState, loading, qrCode, retryCount, showChangeNumber]);

  if (connectionState === 'open') {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center">
          <CheckCircle className="text-emerald-600" size={40} />
        </div>
        <h3 className="text-xl font-semibold text-slate-900">WhatsApp Conectado</h3>
        <p className="text-slate-500">Sua instancia esta ativa e pronta para uso</p>
      </div>
    );
  }

  if (showChangeNumber) {
    return (
      <div className="flex flex-col items-center justify-center py-8 gap-6">
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2 mb-4">
            <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center">
              <ArrowLeftRight className="text-amber-600" size={24} />
            </div>
          </div>
          <h3 className="text-xl font-semibold text-slate-900">Trocar Numero do WhatsApp</h3>
          <p className="text-sm text-slate-500 max-w-sm">
            Voce ja possui uma instancia conectada{phoneNumber ? ` com o numero ${phoneNumber}` : ''}.
            Para conectar um novo numero, clique no botao abaixo.
          </p>
          {error && (
            <p className="text-sm text-red-600 mt-2">{error}</p>
          )}
        </div>

        <div className="flex flex-col items-center gap-3">
          <button
            onClick={handleChangeNumber}
            disabled={reconnecting}
            className="flex items-center gap-2 px-6 py-3 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {reconnecting ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <ArrowLeftRight size={18} />
            )}
            {reconnecting ? 'Reconectando...' : 'Trocar Numero'}
          </button>
          <p className="text-xs text-slate-400 max-w-xs text-center">
            Isso ira desconectar o numero atual e gerar um novo QR Code para escanear
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-8 gap-6">
      <div className="text-center space-y-2">
        <div className="flex items-center justify-center gap-2 mb-4">
          <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center">
            <Smartphone className="text-emerald-600" size={24} />
          </div>
        </div>
        <h3 className="text-xl font-semibold text-slate-900">Conectar WhatsApp</h3>
        <p className="text-sm text-slate-500 max-w-sm">
          Abra o WhatsApp no celular, va em Aparelhos conectados e escaneie o QR Code abaixo
        </p>
      </div>

      <div className="bg-white p-6 rounded-2xl border-2 border-slate-200 shadow-lg">
        {loading ? (
          <div className="w-64 h-64 flex items-center justify-center">
            <Loader2 className="animate-spin text-blue-600" size={40} />
          </div>
        ) : error ? (
          <div className="w-64 h-64 flex flex-col items-center justify-center gap-4 text-center">
            <WifiOff className="text-red-400" size={40} />
            <p className="text-sm text-red-600">{error}</p>
            <button
              onClick={() => setRetryCount(c => c + 1)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition-colors"
            >
              <RefreshCw size={16} />
              Tentar Novamente
            </button>
          </div>
        ) : qrCode ? (
          <img
            src={qrCode.startsWith('data:') ? qrCode : `data:image/png;base64,${qrCode}`}
            alt="QR Code WhatsApp"
            className="w-64 h-64 object-contain"
          />
        ) : pairingCode ? (
          <div className="w-64 h-64 flex flex-col items-center justify-center gap-3 text-center">
            <Smartphone className="text-blue-500" size={40} />
            <p className="text-xs text-slate-500">Codigo de pareamento</p>
            <p className="text-2xl font-semibold tracking-widest text-slate-900">{pairingCode}</p>
          </div>
        ) : (
          <div className="w-64 h-64 flex flex-col items-center justify-center gap-4">
            <QrCode className="text-slate-300" size={80} />
            <button
              onClick={() => setRetryCount(c => c + 1)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition-colors"
            >
              <RefreshCw size={16} />
              Gerar QR Code
            </button>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 text-xs text-slate-400">
        <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
        Aguardando leitura do QR Code...
      </div>
    </div>
  );
}
