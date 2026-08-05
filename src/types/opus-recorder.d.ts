/**
 * Tipos mínimos para o `opus-recorder` (o pacote não publica os seus).
 * Cobre apenas a superfície usada pelo módulo WABA.
 */
declare module 'opus-recorder' {
  export interface OpusRecorderConfig {
    /** Caminho público do encoderWorker.min.js (WASM embutido no próprio JS). */
    encoderPath?: string;
    /** 2048 = voip — otimizado para voz. */
    encoderApplication?: number;
    encoderSampleRate?: number;
    encoderBitRate?: number;
    numberOfChannels?: number;
    /** Com um MediaStreamAudioSourceNode aqui, o recorder não chama getUserMedia. */
    sourceNode?: AudioNode;
    streamPages?: boolean;
    maxFramesPerPage?: number;
    monitorGain?: number;
    recordingGain?: number;
  }

  export default class Recorder {
    constructor(config?: OpusRecorderConfig);
    static isRecordingSupported(): boolean;
    start(): Promise<void>;
    stop(): Promise<void>;
    pause(): void;
    resume(): void;
    close(): void;
    /** Dispara ao parar (com streamPages: false), com o arquivo OGG completo. */
    ondataavailable: (data: Uint8Array) => void;
    onstart: () => void;
    onstop: () => void;
  }
}
