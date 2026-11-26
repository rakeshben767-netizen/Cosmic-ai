import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DEFAULT_COSMIC_FEATURES,
  type ActionLogEntry,
  type AudioDiagnosticsSnapshot,
  type CosmicFeaturesConfig,
  type CosmicMode,
  type CosmicState,
  type DiagnosticLogEntry,
  type LiveKnowledgeSearchResult,
  type PendingWhatsAppDraft,
  type SafeActionName,
  type ToolCallPayload,
  type ToolResponsePayload,
  type TranscriptEntry,
} from '../types/cosmic.ts';
import {
  base64ToUint8,
  clampSpeechRate,
  computePlaybackDuration,
  computeRmsLevel,
  float32ToInt16Pcm,
  int16BytesToFloat32,
  parsePcmMimeType,
  resampleFloat32,
  uint8ToBase64,
} from '../utils/pcmAudio.ts';
import { executeSafeToolCall, sanitizeActionArgsForLog } from '../utils/safeActions.ts';
import { detectBridgeEnvironment, getCosmicNativeBridge } from '../utils/androidBridge.ts';
import {
  computeReconnectDelayMs,
  formatConnectionFailureReason,
  MAX_AUTO_RECONNECT_ATTEMPTS,
  probeVoiceBackendHealth,
  shouldAutoReconnect,
} from '../utils/connectionManager.ts';

const WORKLET_PROCESSOR_CODE = `
class CosmicMicProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (input && input[0] && input[0].length > 0) {
      this.port.postMessage(new Float32Array(input[0]));
    }
    return true;
  }
}
registerProcessor('cosmic-mic-processor', CosmicMicProcessor);
`;

interface ServerWsMessage {
  type:
    | 'connected'
    | 'mode_updated'
    | 'developer_verified'
    | 'session_resumption'
    | 'go_away'
    | 'disconnected'
    | 'session_closed'
    | 'audio'
    | 'interrupted'
    | 'turn_complete'
    | 'input_transcript'
    | 'output_transcript'
    | 'tool_call'
    | 'knowledge_sources'
    | 'pong'
    | 'error';
  mode?: CosmicMode;
  model?: string;
  voice?: string;
  resumed?: boolean;
  autoResumed?: boolean;
  elapsedMs?: number;
  resumeHandle?: string | null;
  handle?: string | null;
  resumable?: boolean;
  timeLeft?: string;
  developerVerified?: boolean;
  verified?: boolean;
  data?: string;
  mimeType?: string;
  text?: string;
  closeCode?: number | null;
  reason?: string;
  code?: string;
  retryable?: boolean;
  message?: string;
  calls?: ToolCallPayload[];
  result?: LiveKnowledgeSearchResult;
}

function buildVoiceTextureCurve(roughnessMix: number): Float32Array<ArrayBuffer> {
  const samples = 1024;
  const buffer = new ArrayBuffer(samples * 4);
  const curve = new Float32Array(buffer);
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / (samples - 1) - 1;
    const warm = Math.tanh(2.2 * x) / Math.tanh(2.2);
    curve[i] = (1 - roughnessMix) * x + roughnessMix * warm;
  }
  return curve;
}

const NORMAL_CURVE = buildVoiceTextureCurve(0);
const BADMASH_HUSKY_CURVE = buildVoiceTextureCurve(0.05);

const DEFAULT_ANDROID_BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL?.trim() ||
  'https://ais-pre-ewacjsnpswr655db2sqdfo-986483805469.asia-southeast1.run.app';
const BACKEND_STORAGE_KEY = 'cosmic_backend_url';
const FEATURES_STORAGE_KEY = 'cosmic_features_config';

function isPackagedApkOrigin(): boolean {
  if (typeof window === 'undefined') return false;
  return window.location.hostname === 'appassets.androidplatform.net';
}

function getInitialBackendUrl(): string {
  if (typeof window === 'undefined') return '';
  try {
    const saved = window.localStorage.getItem(BACKEND_STORAGE_KEY)?.trim() || '';
    if (
      saved &&
      /^https?:\/\//i.test(saved) &&
      !/cosmic-ai-2\.onrender\.com/i.test(saved)
    ) {
      return saved;
    }
  } catch {
    // ignore storage errors
  }
  return isPackagedApkOrigin() ? DEFAULT_ANDROID_BACKEND_URL : '';
}

function getInitialFeatures(): CosmicFeaturesConfig {
  // Always keep internal Featured/engine systems enabled in background for normal users,
  // while preserving the user's preferred speechRate across reloads.
  let speechRate = DEFAULT_COSMIC_FEATURES.speechRate;
  if (typeof window !== 'undefined') {
    try {
      const savedRaw = window.localStorage.getItem(FEATURES_STORAGE_KEY);
      if (savedRaw) {
        const parsed = JSON.parse(savedRaw) as Partial<CosmicFeaturesConfig>;
        if (typeof parsed.speechRate === 'number' && Number.isFinite(parsed.speechRate)) {
          speechRate = clampSpeechRate(parsed.speechRate);
        }
      }
    } catch {
      // ignore storage errors
    }
  }
  return { ...DEFAULT_COSMIC_FEATURES, speechRate };
}

export function resolveHttpBaseUrl(customBackendUrl: string): string {
  const trimmed = customBackendUrl.trim().replace(/\/+$/, '');
  if (trimmed && /^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  if (isPackagedApkOrigin()) {
    return DEFAULT_ANDROID_BACKEND_URL.replace(/\/+$/, '');
  }
  return '';
}

export function resolveLiveWsUrl(customBackendUrl: string): string {
  const trimmed = customBackendUrl.trim().replace(/\/+$/, '');
  if (trimmed && /^https?:\/\//i.test(trimmed)) {
    const wsBase = trimmed.replace(/^http:\/\//i, 'ws://').replace(/^https:\/\//i, 'wss://');
    return `${wsBase}/live`;
  }
  if (isPackagedApkOrigin()) {
    const wsBase = DEFAULT_ANDROID_BACKEND_URL.replace(/^https:\/\//i, 'wss://');
    return `${wsBase}/live`;
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/live`;
}

export function useCosmicLive() {
  const [mode, setMode] = useState<CosmicMode>('normal');
  const [cosmicState, setCosmicState] = useState<CosmicState>('IDLE');
  const [isMicMuted, setIsMicMuted] = useState<boolean>(false);
  const [isDeveloperVerified, setIsDeveloperVerified] = useState<boolean>(false);
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [features, setFeatures] = useState<CosmicFeaturesConfig>(() => getInitialFeatures());
  const [pendingWhatsAppDraft, setPendingWhatsAppDraft] =
    useState<PendingWhatsAppDraft | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [micNotice, setMicNotice] = useState<string | null>(null);
  const [backendUrl, setBackendUrlState] = useState<string>(() => getInitialBackendUrl());
  const [transcripts, setTranscripts] = useState<TranscriptEntry[]>([]);
  const [actionLogs, setActionLogs] = useState<ActionLogEntry[]>([]);
  const [diagnosticLogs, setDiagnosticLogs] = useState<DiagnosticLogEntry[]>([]);
  const [speakerTestResult, setSpeakerTestResult] = useState<string | null>(null);
  const [liveKnowledge, setLiveKnowledge] = useState<LiveKnowledgeSearchResult | null>(null);
  const [diagnostics, setDiagnostics] = useState<AudioDiagnosticsSnapshot>(() => ({
    contextState: 'uninitialized',
    sampleRate: 0,
    micPermission: 'unknown',
    micActive: false,
    chunksSent: 0,
    chunksPlayed: 0,
    queuedChunks: 0,
    lastMimeType: 'none',
    activeModel: 'standby',
    activeVoice: 'Zephyr',
    networkStatus:
      typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'online',
    retryCount: 0,
    sessionResumptionStatus: 'none',
    lastCloseCode: null,
    lastCloseReason: null,
    backendLatencyMs: null,
  }));

  const modeRef = useRef<CosmicMode>(mode);
  const stateRef = useRef<CosmicState>(cosmicState);
  const isMicMutedRef = useRef<boolean>(isMicMuted);
  const featuresRef = useRef<CosmicFeaturesConfig>(features);
  const backendUrlRef = useRef<string>(backendUrl);
  const audioLevelRef = useRef<number>(0);

  // Persistent single AudioContext + Badmash Husky/Bass EQ -> Compressor -> GainNode -> Analyser -> destination
  const audioCtxRef = useRef<AudioContext | null>(null);
  const badmashRoughnessShaperRef = useRef<WaveShaperNode | null>(null);
  const badmashBassFilterRef = useRef<BiquadFilterNode | null>(null);
  const badmashPresenceFilterRef = useRef<BiquadFilterNode | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const outputAnalyserRef = useRef<AnalyserNode | null>(null);

  // Mic nodes
  const micStreamRef = useRef<MediaStream | null>(null);
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const micProcessorRef = useRef<AudioWorkletNode | ScriptProcessorNode | null>(null);
  const micSilenceGainRef = useRef<GainNode | null>(null);

  // Connection lifecycle, idempotency & Gemini Live resumption refs
  const nextStartTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const wsRef = useRef<WebSocket | null>(null);
  const isSessionReadyRef = useRef<boolean>(false);
  const userWantsLiveRef = useRef<boolean>(false);
  const resumeHandleRef = useRef<string | null>(null);
  const retryCountRef = useRef<number>(0);
  const reconnectTimerRef = useRef<number | null>(null);
  const handshakeTimerRef = useRef<number | null>(null);
  const pingIntervalRef = useRef<number | null>(null);
  const connectAttemptFnRef = useRef<((isRetry: boolean) => Promise<void>) | null>(null);
  const lastHealthErrorRef = useRef<string | null>(null);
  const recentToolFingerprintsRef = useRef<Map<string, number>>(new Map());
  const seenToolCallIdsRef = useRef<Set<string>>(new Set());

  const meterTimerRef = useRef<number | null>(null);
  const bridgeEnv = useRef(detectBridgeEnvironment());

  useEffect(() => {
    modeRef.current = mode;
    const shaper = badmashRoughnessShaperRef.current;
    const bassFilter = badmashBassFilterRef.current;
    const presenceFilter = badmashPresenceFilterRef.current;
    const gainNode = masterGainRef.current;
    const ctx = audioCtxRef.current;
    if (shaper) {
      shaper.curve = mode === 'badmash' ? BADMASH_HUSKY_CURVE : NORMAL_CURVE;
    }
    if (ctx && ctx.state !== 'closed') {
      if (bassFilter) {
        bassFilter.gain.setTargetAtTime(mode === 'badmash' ? 5.2 : 0, ctx.currentTime, 0.06);
      }
      if (presenceFilter) {
        presenceFilter.gain.setTargetAtTime(mode === 'badmash' ? 2.6 : 0, ctx.currentTime, 0.06);
      }
      if (gainNode) {
        gainNode.gain.setTargetAtTime(mode === 'badmash' ? 1.06 : 1.0, ctx.currentTime, 0.06);
      }
    }
  }, [mode]);

  useEffect(() => {
    stateRef.current = cosmicState;
  }, [cosmicState]);

  useEffect(() => {
    isMicMutedRef.current = isMicMuted;
  }, [isMicMuted]);

  useEffect(() => {
    featuresRef.current = features;
  }, [features]);

  useEffect(() => {
    backendUrlRef.current = backendUrl;
  }, [backendUrl]);

  const addLog = useCallback(
    (
      level: DiagnosticLogEntry['level'],
      category: DiagnosticLogEntry['category'],
      message: string,
    ) => {
      const entry: DiagnosticLogEntry = {
        id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        level,
        category,
        message,
        timestamp: Date.now(),
      };
      if (level === 'error') {
        console.error(`[COSMIC:${category}]`, message);
      } else if (level === 'warn') {
        console.warn(`[COSMIC:${category}]`, message);
      } else {
        console.info(`[COSMIC:${category}]`, message);
      }
      setDiagnosticLogs((prev) => [entry, ...prev].slice(0, 80));
    },
    [],
  );

  const appendTranscript = useCallback(
    (speaker: TranscriptEntry['speaker'], text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      setTranscripts((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.speaker === speaker && Date.now() - last.timestamp < 3000) {
          const merged = `${last.text} ${trimmed}`.replace(/\s+/g, ' ').trim();
          return [
            ...prev.slice(0, -1),
            { ...last, text: merged, timestamp: Date.now(), mode: modeRef.current },
          ];
        }
        return [
          ...prev.slice(-24),
          {
            id: `tr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            speaker,
            text: trimmed,
            timestamp: Date.now(),
            mode: modeRef.current,
          },
        ];
      });
    },
    [],
  );

  const clearReconnectTimers = useCallback(() => {
    if (reconnectTimerRef.current !== null) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (handshakeTimerRef.current !== null) {
      clearTimeout(handshakeTimerRef.current);
      handshakeTimerRef.current = null;
    }
    if (pingIntervalRef.current !== null) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
  }, []);

  const ensureAudioContext = useCallback(async (): Promise<AudioContext> => {
    let ctx = audioCtxRef.current;
    if (!ctx || ctx.state === 'closed') {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new AudioCtx({ latencyHint: 'interactive' });
      const bassFilter = ctx.createBiquadFilter();
      bassFilter.type = 'lowshelf';
      bassFilter.frequency.value = 145;
      bassFilter.gain.value = modeRef.current === 'badmash' ? 5.2 : 0;

      const presenceFilter = ctx.createBiquadFilter();
      presenceFilter.type = 'peaking';
      presenceFilter.frequency.value = 2600;
      presenceFilter.Q.value = 1.1;
      presenceFilter.gain.value = modeRef.current === 'badmash' ? 2.6 : 0;

      const roughnessShaper = ctx.createWaveShaper();
      roughnessShaper.oversample = '2x';
      roughnessShaper.curve = modeRef.current === 'badmash' ? BADMASH_HUSKY_CURVE : NORMAL_CURVE;

      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -16;
      compressor.knee.value = 12;
      compressor.ratio.value = 3.2;
      compressor.attack.value = 0.005;
      compressor.release.value = 0.14;

      const gain = ctx.createGain();
      gain.gain.value = modeRef.current === 'badmash' ? 1.06 : 1.0;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;

      bassFilter.connect(presenceFilter);
      presenceFilter.connect(roughnessShaper);
      roughnessShaper.connect(compressor);
      compressor.connect(gain);
      gain.connect(analyser);
      analyser.connect(ctx.destination);

      audioCtxRef.current = ctx;
      badmashRoughnessShaperRef.current = roughnessShaper;
      badmashBassFilterRef.current = bassFilter;
      badmashPresenceFilterRef.current = presenceFilter;
      masterGainRef.current = gain;
      outputAnalyserRef.current = analyser;

      addLog('info', 'audio', `AudioContext initialized at ${ctx.sampleRate}Hz`);
    }

    if (ctx.state === 'suspended') {
      await ctx.resume();
      addLog('info', 'audio', `AudioContext resumed -> state=${ctx.state}`);
    }

    setDiagnostics((prev) => ({
      ...prev,
      contextState: ctx.state,
      sampleRate: ctx.sampleRate,
    }));

    return ctx;
  }, [addLog]);

  const clearAudioQueue = useCallback(
    (reason: string) => {
      const count = activeSourcesRef.current.size;
      if (count > 0) {
        for (const src of activeSourcesRef.current) {
          try {
            src.onended = null;
            src.stop();
            src.disconnect();
          } catch {
            // already stopped
          }
        }
        activeSourcesRef.current.clear();
        addLog('info', 'playback', `Cleared ${count} queued/playing audio chunks (${reason})`);
      }
      nextStartTimeRef.current = 0;
      setDiagnostics((prev) => ({ ...prev, queuedChunks: 0 }));
    },
    [addLog],
  );

  const playPcmChunk = useCallback(
    async (base64Data: string, mimeType: string) => {
      try {
        const ctx = await ensureAudioContext();
        if (ctx.state !== 'running') {
          await ctx.resume();
        }
        const gainNode = masterGainRef.current;
        if (!gainNode) return;

        const format = parsePcmMimeType(mimeType);
        const bytes = base64ToUint8(base64Data);
        const floatSamples = int16BytesToFloat32(bytes);
        if (floatSamples.length === 0) return;

        const frameCount = Math.floor(floatSamples.length / format.channels);
        if (frameCount <= 0) return;

        const audioBuffer = ctx.createBuffer(format.channels, frameCount, format.sampleRate);
        if (format.channels === 1) {
          audioBuffer.getChannelData(0).set(floatSamples.subarray(0, frameCount));
        } else {
          for (let ch = 0; ch < format.channels; ch++) {
            const channelData = audioBuffer.getChannelData(ch);
            for (let i = 0; i < frameCount; i++) {
              channelData[i] = floatSamples[i * format.channels + ch];
            }
          }
        }

        const speechRate = clampSpeechRate(featuresRef.current.speechRate);
        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.playbackRate.value = speechRate;
        source.connect(badmashBassFilterRef.current ?? gainNode);

        const now = ctx.currentTime;
        const startAt = Math.max(now + 0.015, nextStartTimeRef.current);
        nextStartTimeRef.current =
          startAt + computePlaybackDuration(audioBuffer.duration, speechRate);

        activeSourcesRef.current.add(source);
        setCosmicState('SPEAKING');
        setDiagnostics((prev) => ({
          ...prev,
          chunksPlayed: prev.chunksPlayed + 1,
          queuedChunks: activeSourcesRef.current.size,
          lastMimeType: mimeType,
          contextState: ctx.state,
        }));

        source.onended = () => {
          activeSourcesRef.current.delete(source);
          try {
            source.disconnect();
          } catch {
            // ignore
          }
          setDiagnostics((prev) => ({
            ...prev,
            queuedChunks: activeSourcesRef.current.size,
          }));
          if (activeSourcesRef.current.size === 0 && stateRef.current === 'SPEAKING') {
            setCosmicState(
              wsRef.current?.readyState === WebSocket.OPEN && isSessionReadyRef.current
                ? 'LISTENING'
                : userWantsLiveRef.current
                  ? 'RECONNECTING'
                  : 'IDLE',
            );
          }
        };

        source.start(startAt);
      } catch (err) {
        addLog(
          'error',
          'playback',
          `PCM decode/playback error: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    },
    [addLog, ensureAudioContext],
  );

  const stopMicrophone = useCallback(() => {
    if (micProcessorRef.current) {
      try {
        micProcessorRef.current.disconnect();
      } catch {
        // ignore
      }
      micProcessorRef.current = null;
    }
    if (micSilenceGainRef.current) {
      try {
        micSilenceGainRef.current.disconnect();
      } catch {
        // ignore
      }
      micSilenceGainRef.current = null;
    }
    if (micSourceRef.current) {
      try {
        micSourceRef.current.disconnect();
      } catch {
        // ignore
      }
      micSourceRef.current = null;
    }
    if (micStreamRef.current) {
      for (const track of micStreamRef.current.getTracks()) {
        track.stop();
      }
      micStreamRef.current = null;
      addLog('info', 'mic', 'Microphone tracks stopped.');
    }
    setDiagnostics((prev) => ({ ...prev, micActive: false }));
  }, [addLog]);

  const startMicrophone = useCallback(
    async (ctx: AudioContext) => {
      // Reuse existing live mic stream + nodes if already running cleanly
      if (
        micStreamRef.current &&
        micStreamRef.current.getAudioTracks().some((t) => t.readyState === 'live') &&
        micProcessorRef.current
      ) {
        setDiagnostics((prev) => ({ ...prev, micPermission: 'granted', micActive: true }));
        return;
      }

      stopMicrophone();

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setDiagnostics((prev) => ({ ...prev, micPermission: 'unavailable', micActive: false }));
        throw new Error(
          'Microphone capture is unavailable in this browser context (requires HTTPS or localhost).',
        );
      }

      let stream: MediaStream;
      try {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              channelCount: 1,
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
          });
        } catch (constraintErr) {
          const errName =
            constraintErr instanceof DOMException ? constraintErr.name : '';
          if (errName === 'OverconstrainedError' || errName === 'ConstraintNotSatisfiedError') {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          } else {
            throw constraintErr;
          }
        }
        setDiagnostics((prev) => ({ ...prev, micPermission: 'granted', micActive: true }));
        setMicNotice(null);
        addLog('info', 'mic', `Microphone permission granted (${ctx.sampleRate}Hz capture).`);
      } catch (err) {
        const errName = err instanceof DOMException ? err.name : '';
        const rawMsg = err instanceof Error ? err.message : String(err);
        const isNotFound =
          errName === 'NotFoundError' ||
          errName === 'DevicesNotFoundError' ||
          /device not found/i.test(rawMsg);
        const permissionState = isNotFound ? 'unavailable' : 'denied';
        const friendlyMsg = isNotFound
          ? 'No microphone hardware was detected on this device. You can still type below to talk with Cosmic AI.'
          : 'Microphone permission was denied. Allow mic access in your browser site settings and tap Retry Mic, or type below to talk with Cosmic AI.';

        setDiagnostics((prev) => ({ ...prev, micPermission: permissionState, micActive: false }));
        addLog('warn', 'mic', `Microphone unavailable (${rawMsg}).`);
        throw new Error(friendlyMsg);
      }

      micStreamRef.current = stream;
      const source = ctx.createMediaStreamSource(stream);
      micSourceRef.current = source;

      const silentGain = ctx.createGain();
      silentGain.gain.value = 0;
      silentGain.connect(ctx.destination);
      micSilenceGainRef.current = silentGain;

      const handlePcmSamples = (rawSamples: Float32Array) => {
        if (isMicMutedRef.current) return;
        const level = computeRmsLevel(rawSamples);
        if (stateRef.current !== 'SPEAKING') {
          audioLevelRef.current = level;
        }

        // Strict guard: never send audio to a closed or uninitialized Live session
        const ws = wsRef.current;
        if (!ws || ws.readyState !== WebSocket.OPEN || !isSessionReadyRef.current) return;

        const downsampled = resampleFloat32(rawSamples, ctx.sampleRate, 16000);
        const pcm16 = float32ToInt16Pcm(downsampled);
        const bytes = new Uint8Array(pcm16.buffer, pcm16.byteOffset, pcm16.byteLength);
        const base64 = uint8ToBase64(bytes);

        ws.send(
          JSON.stringify({
            type: 'audio',
            data: base64,
            mimeType: 'audio/pcm;rate=16000',
          }),
        );
        setDiagnostics((prev) => ({ ...prev, chunksSent: prev.chunksSent + 1 }));
      };

      const [audioTrack] = stream.getAudioTracks();
      if (audioTrack) {
        audioTrack.onended = () => {
          addLog('warn', 'mic', 'Microphone device disconnected.');
          setDiagnostics((prev) => ({ ...prev, micActive: false }));
        };
      }

      let workletAttached = false;
      if (typeof AudioWorkletNode !== 'undefined' && ctx.audioWorklet) {
        try {
          const blob = new Blob([WORKLET_PROCESSOR_CODE], { type: 'application/javascript' });
          const blobUrl = URL.createObjectURL(blob);
          await ctx.audioWorklet.addModule(blobUrl);
          URL.revokeObjectURL(blobUrl);

          const workletNode = new AudioWorkletNode(ctx, 'cosmic-mic-processor');
          workletNode.port.onmessage = (ev: MessageEvent<Float32Array>) => {
            handlePcmSamples(ev.data);
          };
          source.connect(workletNode);
          workletNode.connect(silentGain);
          micProcessorRef.current = workletNode;
          workletAttached = true;
          addLog('info', 'mic', 'AudioWorklet mic pipeline started.');
        } catch (err) {
          addLog(
            'warn',
            'mic',
            `AudioWorklet unavailable, using ScriptProcessor fallback: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        }
      }

      if (!workletAttached) {
        const scriptNode = ctx.createScriptProcessor(4096, 1, 1);
        scriptNode.onaudioprocess = (ev) => {
          handlePcmSamples(ev.inputBuffer.getChannelData(0));
        };
        source.connect(scriptNode);
        scriptNode.connect(silentGain);
        micProcessorRef.current = scriptNode;
        addLog('info', 'mic', 'ScriptProcessor mic pipeline started.');
      }
    },
    [addLog, stopMicrophone],
  );

  // Poll output AnalyserNode smoothly while speaking so 3D Cosmic Ball glow reacts to real audio
  useEffect(() => {
    const dataArray = new Uint8Array(64);
    const updateMeter = () => {
      if (stateRef.current === 'SPEAKING' && outputAnalyserRef.current) {
        outputAnalyserRef.current.getByteTimeDomainData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          const norm = (dataArray[i] - 128) / 128;
          sum += norm * norm;
        }
        audioLevelRef.current = Math.min(1, Math.sqrt(sum / dataArray.length) * 3.8);
      } else if (stateRef.current === 'IDLE' || stateRef.current === 'ERROR') {
        audioLevelRef.current = 0;
      }
      meterTimerRef.current = window.setTimeout(updateMeter, 45);
    };
    meterTimerRef.current = window.setTimeout(updateMeter, 45);
    return () => {
      if (meterTimerRef.current !== null) clearTimeout(meterTimerRef.current);
    };
  }, []);

  const scheduleAutoReconnect = useCallback(
    (context: {
      code?: string | null;
      message?: string | null;
      closeCode?: number | null;
      closeReason?: string | null;
      retryable?: boolean;
    }) => {
      const canRetry = shouldAutoReconnect({
        userWantsLive: userWantsLiveRef.current,
        retryCount: retryCountRef.current,
        maxRetries: MAX_AUTO_RECONNECT_ATTEMPTS,
        errorCode: context.code,
        retryable: context.retryable,
      });

      const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

      if (!canRetry) {
        userWantsLiveRef.current = false;
        isSessionReadyRef.current = false;
        clearReconnectTimers();
        stopMicrophone();
        const reasonText = formatConnectionFailureReason({
          isOnline,
          code: context.code,
          serverMessage: context.message,
          closeCode: context.closeCode,
          closeReason: context.closeReason,
          healthError: lastHealthErrorRef.current,
        });
        setErrorMessage(reasonText);
        setCosmicState('ERROR');
        addLog('error', 'network', `Reconnection halted: ${reasonText}`);
        return;
      }

      if (reconnectTimerRef.current !== null) return;

      const attemptIdx = retryCountRef.current;
      const delayMs = computeReconnectDelayMs(attemptIdx);
      retryCountRef.current += 1;
      isSessionReadyRef.current = false;

      setErrorMessage(null);
      setCosmicState('RECONNECTING');
      setDiagnostics((prev) => ({
        ...prev,
        retryCount: retryCountRef.current,
        sessionResumptionStatus: resumeHandleRef.current ? 'reconnecting' : prev.sessionResumptionStatus,
        lastCloseCode: context.closeCode ?? prev.lastCloseCode,
        lastCloseReason: context.closeReason ?? prev.lastCloseReason,
      }));

      addLog(
        'warn',
        'network',
        `Scheduled automatic reconnect attempt ${retryCountRef.current}/${MAX_AUTO_RECONNECT_ATTEMPTS} in ${delayMs}ms (online=${isOnline}, resumeHandle=${
          resumeHandleRef.current ? 'present' : 'none'
        })`,
      );

      reconnectTimerRef.current = window.setTimeout(() => {
        reconnectTimerRef.current = null;
        if (!userWantsLiveRef.current) return;
        void connectAttemptFnRef.current?.(true);
      }, delayMs);
    },
    [addLog, clearReconnectTimers, stopMicrophone],
  );

  const handleServerMessage = useCallback(
    async (raw: string) => {
      let msg: ServerWsMessage;
      try {
        msg = JSON.parse(raw) as ServerWsMessage;
      } catch {
        return;
      }

      if (msg.type === 'pong') {
        return;
      }

      if (msg.type === 'connected' || msg.type === 'mode_updated') {
        isSessionReadyRef.current = true;
        retryCountRef.current = 0;
        lastHealthErrorRef.current = null;
        if (handshakeTimerRef.current !== null) {
          clearTimeout(handshakeTimerRef.current);
          handshakeTimerRef.current = null;
        }
        if (msg.resumeHandle) {
          resumeHandleRef.current = msg.resumeHandle;
        }
        setErrorMessage(null);
        setCosmicState('LISTENING');
        if (typeof msg.developerVerified === 'boolean') {
          setIsDeveloperVerified(msg.developerVerified);
        }
        setDiagnostics((prev) => ({
          ...prev,
          activeModel: msg.model || prev.activeModel,
          activeVoice: msg.voice || prev.activeVoice,
          retryCount: 0,
          backendLatencyMs: msg.elapsedMs ?? prev.backendLatencyMs,
          sessionResumptionStatus: msg.resumed
            ? 'resumed'
            : msg.resumeHandle
              ? 'ready'
              : prev.sessionResumptionStatus,
        }));
        addLog(
          'info',
          'gemini',
          `${msg.type === 'mode_updated' ? 'Switched mode' : msg.resumed ? 'Resumed session' : 'Connected'} -> model=${msg.model}, voice=${msg.voice}, mode=${msg.mode}, elapsed=${msg.elapsedMs ?? 0}ms`,
        );
        return;
      }

      if (msg.type === 'session_resumption') {
        if (msg.handle) {
          resumeHandleRef.current = msg.handle;
        }
        setDiagnostics((prev) => ({
          ...prev,
          sessionResumptionStatus: msg.resumable ? 'ready' : prev.sessionResumptionStatus,
        }));
        addLog(
          'info',
          'gemini',
          `Session resumption token updated (resumable=${Boolean(msg.resumable)})`,
        );
        return;
      }

      if (msg.type === 'go_away') {
        addLog(
          'warn',
          'gemini',
          `Gemini Live GoAway received (timeLeft=${msg.timeLeft ?? 'unknown'}, resumable=${Boolean(
            msg.resumable,
          )})`,
        );
        if (!msg.resumable && userWantsLiveRef.current) {
          setCosmicState('RECONNECTING');
        }
        return;
      }

      if (msg.type === 'developer_verified') {
        setIsDeveloperVerified(Boolean(msg.verified));
        addLog('info', 'gemini', 'Developer session verified -> Respect Mode enabled.');
        return;
      }

      if (msg.type === 'knowledge_sources' && msg.result) {
        setLiveKnowledge(msg.result);
        addLog(
          msg.result.ok ? 'info' : 'warn',
          'knowledge',
          `Live search (${msg.result.category}): "${msg.result.query}" -> ${msg.result.items.length} results (offline=${msg.result.offline})`,
        );
        return;
      }

      if (msg.type === 'audio' && msg.data) {
        await playPcmChunk(msg.data, msg.mimeType || 'audio/pcm;rate=24000');
        return;
      }

      if (msg.type === 'interrupted') {
        clearAudioQueue('user-interrupted');
        setCosmicState('LISTENING');
        addLog('info', 'playback', 'Gemini Live turn interrupted by user speech.');
        return;
      }

      if (msg.type === 'turn_complete') {
        if (activeSourcesRef.current.size === 0 && stateRef.current === 'SPEAKING') {
          setCosmicState('LISTENING');
        }
        return;
      }

      if (msg.type === 'input_transcript' && msg.text) {
        appendTranscript('user', msg.text);
        return;
      }

      if (msg.type === 'output_transcript' && msg.text) {
        appendTranscript('cosmic', msg.text);
        return;
      }

      if (msg.type === 'tool_call' && Array.isArray(msg.calls)) {
        const bridge = getCosmicNativeBridge();
        const responses: ToolResponsePayload[] = [];
        const now = Date.now();

        for (const call of msg.calls) {
          const callName = call.name as SafeActionName;
          const safeArgs = call.args || {};
          const sanitizedArgsStr = JSON.stringify(sanitizeActionArgsForLog(callName, safeArgs));

          // Idempotency / duplicate-action prevention within 8 seconds
          if (seenToolCallIdsRef.current.has(call.id)) {
            addLog('warn', 'tool', `Duplicate tool call ignored id=${call.id} (${call.name})`);
            continue;
          }
          seenToolCallIdsRef.current.add(call.id);
          if (seenToolCallIdsRef.current.size > 100) {
            const firstId = seenToolCallIdsRef.current.values().next().value;
            if (firstId) seenToolCallIdsRef.current.delete(firstId);
          }

          const dedupFingerprint = `${call.name}:${JSON.stringify(safeArgs)}`;
          const prevExecAt = recentToolFingerprintsRef.current.get(dedupFingerprint);
          const dedupWindowMs =
            call.name === 'sendWhatsAppMessage' ||
            call.name === 'openApp' ||
            call.name === 'openYouTubeSearch'
              ? 6000
              : 0;
          if (dedupWindowMs > 0 && prevExecAt && now - prevExecAt < dedupWindowMs) {
            addLog('warn', 'tool', `Prevented duplicate execution for ${call.name}`);
            responses.push({
              id: call.id,
              name: call.name,
              response: {
                ok: true,
                deduplicated: true,
                message: `Action ${call.name} was already executed a moment ago.`,
              },
            });
            continue;
          }

          addLog('info', 'tool', `Tool call received: ${call.name}(${sanitizedArgsStr})`);
          const startedAt = Date.now();

          let result: Awaited<ReturnType<typeof executeSafeToolCall>>;
          try {
            result = await Promise.race([
              executeSafeToolCall(call.name, safeArgs, bridge),
              new Promise<never>((_, reject) => {
                window.setTimeout(() => reject(new Error(`Tool ${call.name} timed out.`)), 6000);
              }),
            ]);
          } catch (toolErr) {
            const errMsg = toolErr instanceof Error ? toolErr.message : String(toolErr);
            addLog('error', 'tool', `Tool execution failed (${call.name}): ${errMsg}`);
            responses.push({
              id: call.id,
              name: call.name,
              response: { ok: false, message: errMsg, error: errMsg },
            });
            continue;
          }

          const durationMs = Date.now() - startedAt;
          if (result.logEntry.ok && dedupWindowMs > 0) {
            recentToolFingerprintsRef.current.set(dedupFingerprint, Date.now());
          }
          if (result.pendingDraft) {
            setPendingWhatsAppDraft(result.pendingDraft);
          } else if (result.clearDraft) {
            setPendingWhatsAppDraft(null);
          }

          setActionLogs((prev) => [result.logEntry, ...prev].slice(0, 30));
          addLog(
            result.logEntry.ok ? 'info' : 'warn',
            'tool',
            `Tool ${call.name} ${result.logEntry.ok ? 'completed' : 'failed'} (${durationMs}ms): ${result.logEntry.message}`,
          );
          responses.push({
            id: call.id,
            name: call.name,
            response: result.response,
          });
        }

        if (responses.length > 0 && wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(
            JSON.stringify({
              type: 'tool_response',
              responses,
            }),
          );
        }
        return;
      }

      if (msg.type === 'session_closed') {
        isSessionReadyRef.current = false;
        clearAudioQueue('session-closed');
        if (msg.resumeHandle) {
          resumeHandleRef.current = msg.resumeHandle;
        }
        setDiagnostics((prev) => ({
          ...prev,
          lastCloseCode: msg.closeCode ?? prev.lastCloseCode,
          lastCloseReason: msg.reason ?? prev.lastCloseReason,
        }));
        addLog(
          'warn',
          'gemini',
          `Gemini session closed (code=${msg.closeCode ?? 'n/a'}, reason=${msg.reason ?? 'unknown'}, retryable=${msg.retryable !== false})`,
        );

        if (userWantsLiveRef.current) {
          if (msg.code === 'RESUMPTION_HANDLE_EXPIRED') {
            resumeHandleRef.current = null;
          }
          scheduleAutoReconnect({
            code: msg.code,
            message: msg.reason,
            closeCode: msg.closeCode,
            closeReason: msg.reason,
            retryable: msg.retryable,
          });
        } else if (stateRef.current !== 'IDLE') {
          setCosmicState('IDLE');
        }
        return;
      }

      if (msg.type === 'disconnected') {
        isSessionReadyRef.current = false;
        clearAudioQueue('server-disconnected');
        if (!userWantsLiveRef.current) {
          setCosmicState('IDLE');
        }
        return;
      }

      if (msg.type === 'error') {
        const errText = msg.message || 'Unknown Gemini Live error.';
        addLog('error', 'gemini', `API Error [${msg.code ?? 'UNKNOWN'}]: ${errText}`);
        if (userWantsLiveRef.current && msg.retryable !== false) {
          scheduleAutoReconnect({
            code: msg.code,
            message: errText,
            retryable: msg.retryable,
          });
        } else {
          userWantsLiveRef.current = false;
          isSessionReadyRef.current = false;
          clearReconnectTimers();
          stopMicrophone();
          setErrorMessage(
            formatConnectionFailureReason({
              isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
              code: msg.code,
              serverMessage: errText,
            }),
          );
          setCosmicState('ERROR');
        }
      }
    },
    [
      addLog,
      appendTranscript,
      clearAudioQueue,
      clearReconnectTimers,
      playPcmChunk,
      scheduleAutoReconnect,
      stopMicrophone,
    ],
  );

  const disconnect = useCallback(() => {
    userWantsLiveRef.current = false;
    isSessionReadyRef.current = false;
    retryCountRef.current = 0;
    resumeHandleRef.current = null;
    clearReconnectTimers();
    clearAudioQueue('user-disconnect');
    stopMicrophone();
    if (wsRef.current) {
      const ws = wsRef.current;
      wsRef.current = null;
      try {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'disconnect' }));
        }
        ws.close(1000, 'User powered off Cosmic AI');
      } catch {
        // ignore
      }
    }
    setCosmicState('IDLE');
    setErrorMessage(null);
    setMicNotice(null);
    setDiagnostics((prev) => ({
      ...prev,
      retryCount: 0,
      sessionResumptionStatus: 'none',
    }));
    addLog('info', 'gemini', 'Cosmic AI session powered off cleanly.');
  }, [addLog, clearAudioQueue, clearReconnectTimers, stopMicrophone]);

  const executeConnectAttempt = useCallback(
    async (isRetry: boolean) => {
      if (!userWantsLiveRef.current && isRetry) return;

      const startedIso = new Date().toISOString();
      if (!isRetry) {
        retryCountRef.current = 0;
        lastHealthErrorRef.current = null;
        setErrorMessage(null);
        setMicNotice(null);
        setCosmicState('CONNECTING');
      } else {
        setCosmicState('RECONNECTING');
      }

      const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
      setDiagnostics((prev) => ({
        ...prev,
        networkStatus: isOnline ? 'online' : 'offline',
      }));

      addLog(
        'info',
        'network',
        `Connection start=${startedIso} retry=${retryCountRef.current} online=${isOnline}`,
      );

      if (!isOnline) {
        scheduleAutoReconnect({
          code: 'OFFLINE',
          message: 'Device network is offline.',
          retryable: true,
        });
        return;
      }

      try {
        // 1. Ensure AudioContext + Microphone on initial power-on (and keep alive across retries)
        const ctx = await ensureAudioContext();
        try {
          await startMicrophone(ctx);
          if (!isRetry) setIsMicMuted(false);
        } catch (micErr) {
          const micMsg = micErr instanceof Error ? micErr.message : String(micErr);
          setIsMicMuted(true);
          setMicNotice(micMsg);
        }

        if (!userWantsLiveRef.current) return;

        // 2. Wake / probe backend health and measure latency before opening WS
        const httpBase = resolveHttpBaseUrl(backendUrlRef.current);
        const healthUrl = `${httpBase}/api/health`;
        const health = await probeVoiceBackendHealth(healthUrl, 5000);
        setDiagnostics((prev) => ({ ...prev, backendLatencyMs: health.latencyMs }));

        if (health.reachable) {
          lastHealthErrorRef.current = null;
          addLog(
            'info',
            'network',
            `Backend health OK (${health.latencyMs}ms, hasApiKey=${String(health.hasApiKey)})`,
          );
          if (health.hasApiKey === false) {
            userWantsLiveRef.current = false;
            stopMicrophone();
            setErrorMessage(
              'GEMINI_API_KEY is missing on the voice backend. Configure it in Settings > Secrets.',
            );
            setCosmicState('ERROR');
            return;
          }
        } else {
          lastHealthErrorRef.current = health.error || 'Health check timed out';
          addLog(
            'warn',
            'network',
            `Backend health probe warning (${health.latencyMs}ms): ${lastHealthErrorRef.current}`,
          );
        }

        if (!userWantsLiveRef.current) return;

        // 3. Close any previous socket strictly before creating a fresh one (zero duplicate sessions)
        if (wsRef.current) {
          const stale = wsRef.current;
          wsRef.current = null;
          isSessionReadyRef.current = false;
          try {
            stale.close();
          } catch {
            // ignore
          }
        }

        const wsUrl = resolveLiveWsUrl(backendUrlRef.current);
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        if (handshakeTimerRef.current !== null) clearTimeout(handshakeTimerRef.current);
        handshakeTimerRef.current = window.setTimeout(() => {
          if (wsRef.current === ws && !isSessionReadyRef.current && userWantsLiveRef.current) {
            addLog('warn', 'network', `WebSocket handshake timed out (10000ms) -> ${wsUrl}`);
            try {
              ws.close(4000, 'Handshake timeout');
            } catch {
              // ignore
            }
          }
        }, 10000);

        let socketErrored = false;

        ws.onopen = () => {
          if (wsRef.current !== ws) {
            ws.close();
            return;
          }
          addLog(
            'info',
            'gemini',
            `WebSocket open -> ${wsUrl} (resumeHandle=${resumeHandleRef.current ? 'present' : 'none'})`,
          );
          ws.send(
            JSON.stringify({
              type: 'connect',
              badmashMode: modeRef.current === 'badmash',
              resumeHandle: resumeHandleRef.current,
              features: featuresRef.current,
            }),
          );

          if (pingIntervalRef.current !== null) clearInterval(pingIntervalRef.current);
          pingIntervalRef.current = window.setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'ping' }));
            }
          }, 25000);
        };

        ws.onmessage = (event) => {
          if (wsRef.current !== ws) return;
          void handleServerMessage(String(event.data));
        };

        ws.onerror = () => {
          socketErrored = true;
          addLog('warn', 'network', `WebSocket transport error on ${wsUrl}.`);
        };

        ws.onclose = (ev) => {
          if (wsRef.current !== ws) return;
          wsRef.current = null;
          isSessionReadyRef.current = false;
          if (handshakeTimerRef.current !== null) {
            clearTimeout(handshakeTimerRef.current);
            handshakeTimerRef.current = null;
          }
          if (pingIntervalRef.current !== null) {
            clearInterval(pingIntervalRef.current);
            pingIntervalRef.current = null;
          }
          clearAudioQueue('ws-closed');
          setDiagnostics((prev) => ({
            ...prev,
            lastCloseCode: ev.code,
            lastCloseReason: ev.reason || (socketErrored ? 'Transport error' : 'Closed'),
          }));
          addLog(
            'warn',
            'network',
            `WebSocket closed code=${ev.code} reason="${ev.reason || 'none'}" wantedLive=${userWantsLiveRef.current}`,
          );

          if (userWantsLiveRef.current) {
            scheduleAutoReconnect({
              code: socketErrored ? 'WS_TRANSPORT_ERROR' : 'WS_CLOSED',
              closeCode: ev.code,
              closeReason: ev.reason || (socketErrored ? 'Connection interrupted' : 'Closed'),
              retryable: true,
            });
          } else {
            stopMicrophone();
            if (stateRef.current !== 'ERROR' && stateRef.current !== 'IDLE') {
              setCosmicState('IDLE');
            }
          }
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        addLog('error', 'gemini', `Connect setup exception: ${msg}`);
        if (userWantsLiveRef.current) {
          scheduleAutoReconnect({
            code: 'CLIENT_CONNECT_EXCEPTION',
            message: msg,
            retryable: true,
          });
        } else {
          setErrorMessage(msg);
          setCosmicState('ERROR');
          stopMicrophone();
        }
      }
    },
    [
      addLog,
      clearAudioQueue,
      ensureAudioContext,
      handleServerMessage,
      scheduleAutoReconnect,
      startMicrophone,
      stopMicrophone,
    ],
  );

  useEffect(() => {
    connectAttemptFnRef.current = executeConnectAttempt;
  }, [executeConnectAttempt]);

  const connect = useCallback(async () => {
    if (stateRef.current === 'CONNECTING') return;
    clearReconnectTimers();
    userWantsLiveRef.current = true;
    await executeConnectAttempt(false);
  }, [clearReconnectTimers, executeConnectAttempt]);

  const retryMicrophone = useCallback(async () => {
    try {
      const ctx = await ensureAudioContext();
      await startMicrophone(ctx);
      setIsMicMuted(false);
      setMicNotice(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setIsMicMuted(true);
      setMicNotice(msg);
    }
  }, [ensureAudioContext, startMicrophone]);

  const sendTextMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      await ensureAudioContext();
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN || !isSessionReadyRef.current) {
        setErrorMessage('Power on Cosmic AI and wait for Ready/Listening before sending.');
        return;
      }
      clearAudioQueue('user-text-interrupt');
      appendTranscript('user', trimmed);
      ws.send(JSON.stringify({ type: 'text', text: trimmed }));
    },
    [appendTranscript, clearAudioQueue, ensureAudioContext],
  );

  const togglePower = useCallback(async () => {
    if (stateRef.current === 'IDLE' || stateRef.current === 'ERROR') {
      await connect();
    } else {
      disconnect();
    }
  }, [connect, disconnect]);

  const toggleMicMute = useCallback(async () => {
    if (stateRef.current === 'IDLE' || stateRef.current === 'ERROR') {
      await connect();
      return;
    }
    if (!micStreamRef.current) {
      await retryMicrophone();
      return;
    }
    setIsMicMuted((prev) => {
      const next = !prev;
      addLog('info', 'mic', next ? 'Microphone muted.' : 'Microphone unmuted.');
      return next;
    });
  }, [addLog, connect, retryMicrophone]);

  const setModeDirect = useCallback(
    (next: CosmicMode) => {
      if (modeRef.current === next) return;
      setMode(next);
      resumeHandleRef.current = null;
      addLog(
        'info',
        'gemini',
        next === 'badmash'
          ? 'BADMASH MODE ON -> Switching Cosmic Ball to Purple + Don Voice (Charon).'
          : 'NORMAL MODE ON -> Switching Cosmic Ball to Blue + Voice (Zephyr).',
      );
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        clearAudioQueue('mode-switch');
        wsRef.current.send(
          JSON.stringify({
            type: 'set_mode',
            badmashMode: next === 'badmash',
            features: featuresRef.current,
          }),
        );
      }
    },
    [addLog, clearAudioQueue],
  );

  const toggleBadmashMode = useCallback(() => {
    const next: CosmicMode = modeRef.current === 'normal' ? 'badmash' : 'normal';
    setModeDirect(next);
  }, [setModeDirect]);

  const updateFeatures = useCallback(
    (patch: Partial<CosmicFeaturesConfig>) => {
      setFeatures((prev) => {
        const sanitizedPatch: Partial<CosmicFeaturesConfig> = { ...patch };
        if (typeof sanitizedPatch.speechRate === 'number') {
          sanitizedPatch.speechRate = clampSpeechRate(sanitizedPatch.speechRate);
        }
        const next: CosmicFeaturesConfig = { ...prev, ...sanitizedPatch };
        try {
          window.localStorage.setItem(FEATURES_STORAGE_KEY, JSON.stringify(next));
        } catch {
          // ignore storage errors
        }
        const promptAffectingChange = Object.keys(sanitizedPatch).some(
          (key) => key !== 'speechRate',
        );
        featuresRef.current = next;
        addLog(
          'info',
          'gemini',
          promptAffectingChange
            ? `Updated entertainment features: ${JSON.stringify(sanitizedPatch)}`
            : `Updated AI speech rate (Normal & Badmash): ${next.speechRate.toFixed(2)}x`,
        );
        if (promptAffectingChange && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          resumeHandleRef.current = null;
          wsRef.current.send(
            JSON.stringify({
              type: 'update_features',
              features: next,
            }),
          );
        }
        return next;
      });
    },
    [addLog],
  );

  const runLiveKnowledgeSearch = useCallback(
    async (query: string, category = 'general'): Promise<LiveKnowledgeSearchResult> => {
      const base = resolveHttpBaseUrl(backendUrlRef.current);
      try {
        const res = await fetch(`${base}/api/knowledge/search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, category }),
        });
        const data = (await res.json()) as LiveKnowledgeSearchResult;
        setLiveKnowledge(data);
        addLog(
          data.ok ? 'info' : 'warn',
          'knowledge',
          `Live search "${query}" -> ${data.items?.length ?? 0} results (ok=${data.ok})`,
        );
        return data;
      } catch (err) {
        const offlineResult: LiveKnowledgeSearchResult = {
          ok: false,
          query,
          category,
          fetchedAt: new Date().toISOString(),
          offline: true,
          summary:
            'Live information is temporarily unavailable right now. Check your internet connection and retry.',
          items: [],
          sources: [],
          error: err instanceof Error ? err.message : String(err),
        };
        setLiveKnowledge(offlineResult);
        addLog('warn', 'knowledge', `Live search offline/failed: ${offlineResult.error}`);
        return offlineResult;
      }
    },
    [addLog],
  );

  const testSpeaker = useCallback(async () => {
    try {
      const ctx = await ensureAudioContext();
      if (ctx.state !== 'running') {
        await ctx.resume();
      }
      const gain = masterGainRef.current;
      if (!gain) throw new Error('Master GainNode missing.');

      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, ctx.currentTime);

      env.gain.setValueAtTime(0.0001, ctx.currentTime);
      env.gain.exponentialRampToValueAtTime(0.22, ctx.currentTime + 0.03);
      env.gain.setValueAtTime(0.22, ctx.currentTime + 0.42);
      env.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.58);

      osc.connect(env);
      env.connect(gain);

      osc.start();
      osc.stop(ctx.currentTime + 0.6);

      const summary = `440Hz tone played via AudioContext (${ctx.state}, ${ctx.sampleRate}Hz) -> GainNode -> destination.`;
      setSpeakerTestResult(summary);
      addLog('info', 'playback', summary);
    } catch (err) {
      const msg = `Speaker test failed: ${err instanceof Error ? err.message : String(err)}`;
      setSpeakerTestResult(msg);
      addLog('error', 'playback', msg);
    }
  }, [addLog, ensureAudioContext]);

  const runManualSafeAction = useCallback(
    async (name: string, args: Record<string, unknown>) => {
      const bridge = getCosmicNativeBridge();
      const { logEntry } = await executeSafeToolCall(name, args, bridge);
      setActionLogs((prev) => [logEntry, ...prev].slice(0, 30));
      addLog(
        logEntry.ok ? 'info' : 'warn',
        'tool',
        `Manual action ${name} -> ${logEntry.message}`,
      );
      return logEntry;
    },
    [addLog],
  );

  // Monitor browser online/offline transitions and trigger automatic recovery on restore
  useEffect(() => {
    const handleOnline = () => {
      setDiagnostics((prev) => ({ ...prev, networkStatus: 'online' }));
      addLog('info', 'network', 'Network connection restored (online).');
      if (
        userWantsLiveRef.current &&
        (stateRef.current === 'RECONNECTING' || stateRef.current === 'ERROR')
      ) {
        retryCountRef.current = 0;
        clearReconnectTimers();
        void executeConnectAttempt(true);
      }
    };

    const handleOffline = () => {
      setDiagnostics((prev) => ({ ...prev, networkStatus: 'offline' }));
      addLog('warn', 'network', 'Network connection lost (offline).');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [addLog, clearReconnectTimers, executeConnectAttempt]);

  // Monitor microphone permission & device changes cleanly
  useEffect(() => {
    let cancelled = false;
    let permStatus: PermissionStatus | null = null;

    if (navigator.permissions && typeof navigator.permissions.query === 'function') {
      navigator.permissions
        .query({ name: 'microphone' as PermissionName })
        .then((status) => {
          if (cancelled) return;
          permStatus = status;
          setDiagnostics((prev) => ({ ...prev, micPermission: status.state }));
          status.onchange = () => {
            setDiagnostics((prev) => ({ ...prev, micPermission: status.state }));
            if (status.state === 'granted') {
              setMicNotice(null);
            }
          };
        })
        .catch(() => {
          // Permissions API for microphone unsupported in some browsers
        });
    }

    const onDeviceChange = () => {
      addLog('info', 'mic', 'Audio media devices changed.');
    };
    navigator.mediaDevices?.addEventListener?.('devicechange', onDeviceChange);

    return () => {
      cancelled = true;
      if (permStatus) {
        permStatus.onchange = null;
      }
      navigator.mediaDevices?.removeEventListener?.('devicechange', onDeviceChange);
    };
  }, [addLog]);

  // Pre-warm backend when packaged APK launches
  useEffect(() => {
    if (!isPackagedApkOrigin()) return;
    const base = resolveHttpBaseUrl(backendUrl);
    fetch(`${base}/api/health`).catch(() => {
      // silent background wake-up only
    });
  }, [backendUrl]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      userWantsLiveRef.current = false;
      isSessionReadyRef.current = false;
      clearReconnectTimers();
      clearAudioQueue('unmount');
      stopMicrophone();
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch {
          // ignore
        }
      }
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        void audioCtxRef.current.close();
      }
    };
  }, [clearAudioQueue, clearReconnectTimers, stopMicrophone]);

  const updateBackendUrl = useCallback(
    (nextUrl: string) => {
      const cleaned = nextUrl.trim().replace(/\/+$/, '');
      if (
        cleaned &&
        !/^https:\/\//i.test(cleaned) &&
        !/^http:\/\/(localhost|127\.0\.0\.1)/i.test(cleaned)
      ) {
        addLog('warn', 'bridge', 'Backend server URL must use HTTPS.');
        return false;
      }
      try {
        if (cleaned) {
          window.localStorage.setItem(BACKEND_STORAGE_KEY, cleaned);
        } else {
          window.localStorage.removeItem(BACKEND_STORAGE_KEY);
        }
      } catch {
        // ignore storage errors
      }
      setBackendUrlState(cleaned || (isPackagedApkOrigin() ? DEFAULT_ANDROID_BACKEND_URL : ''));
      addLog(
        'info',
        'bridge',
        cleaned ? `Updated voice backend URL -> ${cleaned}` : 'Reset voice backend URL to default.',
      );
      return true;
    },
    [addLog],
  );

  const confirmWhatsAppDraft = useCallback(async () => {
    const draft = pendingWhatsAppDraft;
    if (!draft) return;
    const bridge = getCosmicNativeBridge();
    const res = await executeSafeToolCall(
      'sendWhatsAppMessage',
      {
        contactName: draft.contactName,
        message: draft.message,
        confirmed: true,
      },
      bridge,
    );
    setActionLogs((prev) => [res.logEntry, ...prev].slice(0, 30));
    addLog(
      res.logEntry.ok ? 'info' : 'warn',
      'tool',
      `WhatsApp draft confirmed -> ${res.logEntry.message}`,
    );
    if (res.logEntry.ok) {
      setPendingWhatsAppDraft(null);
    }
    if (wsRef.current?.readyState === WebSocket.OPEN && isSessionReadyRef.current) {
      wsRef.current.send(
        JSON.stringify({
          type: 'text',
          text: res.logEntry.ok
            ? `[System Action Result: User confirmed WhatsApp draft for ${draft.contactName}. ${res.logEntry.message}]`
            : `[System Action Result: WhatsApp draft could not be opened: ${res.logEntry.message}]`,
        }),
      );
    }
  }, [addLog, pendingWhatsAppDraft]);

  const dismissWhatsAppDraft = useCallback(() => {
    setPendingWhatsAppDraft(null);
    addLog('info', 'tool', 'User cancelled pending WhatsApp draft.');
  }, [addLog]);

  const verifyAdminAccess = useCallback(
    async (passcode: string): Promise<{ ok: boolean; error?: string }> => {
      const base = resolveHttpBaseUrl(backendUrlRef.current);
      try {
        const res = await fetch(`${base}/api/admin/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ passcode }),
        });
        const data = (await res.json()) as { ok?: boolean; token?: string; error?: string };
        if (res.ok && data.ok && data.token) {
          setAdminToken(data.token);
          setIsDeveloperVerified(true);
          addLog('info', 'bridge', 'Protected developer/admin interface unlocked.');
          return { ok: true };
        }
        return { ok: false, error: data.error || 'Invalid developer passcode.' };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Unable to reach admin verification server.',
        };
      }
    },
    [addLog],
  );

  const logoutAdmin = useCallback(() => {
    setAdminToken(null);
  }, []);

  return {
    mode,
    cosmicState,
    isMicMuted,
    isDeveloperVerified,
    isAdminAuthenticated: Boolean(adminToken),
    features,
    pendingWhatsAppDraft,
    errorMessage,
    micNotice,
    backendUrl,
    transcripts,
    actionLogs,
    diagnosticLogs,
    diagnostics,
    speakerTestResult,
    liveKnowledge,
    bridgeRuntime: bridgeEnv.current,
    audioLevelRef,
    togglePower,
    toggleMicMute,
    toggleBadmashMode,
    updateFeatures,
    runLiveKnowledgeSearch,
    clearLiveKnowledge: () => setLiveKnowledge(null),
    confirmWhatsAppDraft,
    dismissWhatsAppDraft,
    verifyAdminAccess,
    logoutAdmin,
    retryMicrophone,
    sendTextMessage,
    testSpeaker,
    runManualSafeAction,
    updateBackendUrl,
    clearError: () => setErrorMessage(null),
    clearMicNotice: () => setMicNotice(null),
  };
}
