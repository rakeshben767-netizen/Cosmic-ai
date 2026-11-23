import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ActionLogEntry,
  AudioDiagnosticsSnapshot,
  CosmicMode,
  CosmicState,
  DiagnosticLogEntry,
  ToolCallPayload,
  ToolResponsePayload,
  TranscriptEntry,
} from '../types/cosmic.ts';
import {
  base64ToUint8,
  computeRmsLevel,
  float32ToInt16Pcm,
  int16BytesToFloat32,
  parsePcmMimeType,
  resampleFloat32,
  uint8ToBase64,
} from '../utils/pcmAudio.ts';
import { executeSafeToolCall } from '../utils/safeActions.ts';
import { detectBridgeEnvironment, getCosmicNativeBridge } from '../utils/androidBridge.ts';
import {
  triggerUnityAd,
  UNITY_ADS_CONFIG,
  type WebAdPromptRequest,
} from '../utils/unityAds.ts';
import {
  getAdPassStatus,
  loadAdPassState,
  normalizeAdPassState,
  PERIODIC_AD_INTERVAL_MS,
  recordWatchedPassAd,
  saveAdPassState,
  type AdPassStatus,
  type AdPassStorageState,
} from '../utils/adPass.ts';

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
    | 'disconnected'
    | 'session_closed'
    | 'audio'
    | 'interrupted'
    | 'turn_complete'
    | 'input_transcript'
    | 'output_transcript'
    | 'tool_call'
    | 'error';
  mode?: CosmicMode;
  model?: string;
  voice?: string;
  data?: string;
  mimeType?: string;
  text?: string;
  reason?: string;
  code?: string;
  message?: string;
  calls?: ToolCallPayload[];
}

const DEFAULT_ANDROID_BACKEND_URL =
  'https://ais-pre-ewacjsnpswr655db2sqdfo-986483805469.asia-southeast1.run.app';
const BACKEND_STORAGE_KEY = 'cosmic_backend_url';

function isPackagedApkOrigin(): boolean {
  if (typeof window === 'undefined') return false;
  return window.location.hostname === 'appassets.androidplatform.net';
}

function getInitialBackendUrl(): string {
  if (typeof window === 'undefined') return '';
  try {
    const saved = window.localStorage.getItem(BACKEND_STORAGE_KEY)?.trim() || '';
    if (saved && /^https?:\/\//i.test(saved)) return saved;
  } catch {
    // ignore storage errors
  }
  return isPackagedApkOrigin() ? DEFAULT_ANDROID_BACKEND_URL : '';
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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [micNotice, setMicNotice] = useState<string | null>(null);
  const [backendUrl, setBackendUrlState] = useState<string>(() => getInitialBackendUrl());
  const [transcripts, setTranscripts] = useState<TranscriptEntry[]>([]);
  const [actionLogs, setActionLogs] = useState<ActionLogEntry[]>([]);
  const [diagnosticLogs, setDiagnosticLogs] = useState<DiagnosticLogEntry[]>([]);
  const [speakerTestResult, setSpeakerTestResult] = useState<string | null>(null);
  const [activeAd, setActiveAd] = useState<WebAdPromptRequest | null>(null);
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
  }));

  const modeRef = useRef<CosmicMode>(mode);
  const stateRef = useRef<CosmicState>(cosmicState);
  const isMicMutedRef = useRef<boolean>(isMicMuted);
  const audioLevelRef = useRef<number>(0);

  // Persistent single AudioContext + Badmash EQ -> GainNode -> Analyser -> destination
  const audioCtxRef = useRef<AudioContext | null>(null);
  const badmashBassFilterRef = useRef<BiquadFilterNode | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const outputAnalyserRef = useRef<AnalyserNode | null>(null);

  // Mic nodes
  const micStreamRef = useRef<MediaStream | null>(null);
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const micProcessorRef = useRef<AudioWorkletNode | ScriptProcessorNode | null>(null);
  const micSilenceGainRef = useRef<GainNode | null>(null);

  // Playback queue & Ad scheduling
  const nextStartTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const wsRef = useRef<WebSocket | null>(null);
  const meterTimerRef = useRef<number | null>(null);
  const bridgeEnv = useRef(detectBridgeEnvironment());
  const isAdShowingRef = useRef<boolean>(false);
  const aiTurnInFlightRef = useRef<boolean>(false);
  const pendingPeriodicAdRef = useRef<boolean>(false);
  const lastPeriodicAdAtRef = useRef<number>(Date.now());
  const adPassStorageRef = useRef<AdPassStorageState>(loadAdPassState());
  const [adPassStatus, setAdPassStatus] = useState<AdPassStatus>(() =>
    getAdPassStatus(adPassStorageRef.current),
  );

  useEffect(() => {
    modeRef.current = mode;
    const bassFilter = badmashBassFilterRef.current;
    const ctx = audioCtxRef.current;
    if (bassFilter && ctx && ctx.state !== 'closed') {
      bassFilter.gain.setTargetAtTime(mode === 'badmash' ? 4.5 : 0, ctx.currentTime, 0.06);
    }
  }, [mode]);

  useEffect(() => {
    stateRef.current = cosmicState;
  }, [cosmicState]);

  useEffect(() => {
    isMicMutedRef.current = isMicMuted;
  }, [isMicMuted]);

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
      setDiagnosticLogs((prev) => [entry, ...prev].slice(0, 60));
    },
    [],
  );

  const appendTranscript = useCallback(
    (speaker: TranscriptEntry['speaker'], text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      setTranscripts((prev) => {
        const last = prev[prev.length - 1];
        // Merge streaming incremental fragments from the same speaker within 3 seconds
        if (last && last.speaker === speaker && Date.now() - last.timestamp < 3000) {
          const merged = `${last.text} ${trimmed}`.replace(/\s+/g, ' ').trim();
          return [
            ...prev.slice(0, -1),
            { ...last, text: merged, timestamp: Date.now(), mode: modeRef.current },
          ];
        }
        return [
          ...prev.slice(-19),
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
      bassFilter.gain.value = modeRef.current === 'badmash' ? 4.5 : 0;

      const gain = ctx.createGain();
      gain.gain.value = 1.0;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;

      bassFilter.connect(gain);
      gain.connect(analyser);
      analyser.connect(ctx.destination);

      audioCtxRef.current = ctx;
      badmashBassFilterRef.current = bassFilter;
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

        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(badmashBassFilterRef.current ?? gainNode);

        const now = ctx.currentTime;
        const startAt = Math.max(now + 0.015, nextStartTimeRef.current);
        nextStartTimeRef.current = startAt + audioBuffer.duration;

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
            setCosmicState(wsRef.current?.readyState === WebSocket.OPEN ? 'LISTENING' : 'IDLE');
            if (pendingPeriodicAdRef.current && !aiTurnInFlightRef.current && !isAdShowingRef.current) {
              const nowMs = Date.now();
              const normalized = normalizeAdPassState(adPassStorageRef.current, nowMs);
              adPassStorageRef.current = normalized;
              saveAdPassState(normalized);
              setAdPassStatus(getAdPassStatus(normalized, nowMs));
              if (normalized.adFreeUntil > nowMs) {
                pendingPeriodicAdRef.current = false;
              } else {
                pendingPeriodicAdRef.current = false;
                isAdShowingRef.current = true;
                void triggerUnityAd(
                  UNITY_ADS_CONFIG.interstitialPlacement,
                  'Sponsored Break (Every 4 Minutes)',
                  (req) => setActiveAd(req),
                ).finally(() => {
                  lastPeriodicAdAtRef.current = Date.now();
                  isAdShowingRef.current = false;
                });
              }
            }
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

      // Silent sink keeps AudioWorklet / ScriptProcessor active without mic loopback echo
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

        const ws = wsRef.current;
        if (!ws || ws.readyState !== WebSocket.OPEN) return;

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

      // Handle unexpected track disconnect
      const [audioTrack] = stream.getAudioTracks();
      if (audioTrack) {
        audioTrack.onended = () => {
          addLog('warn', 'mic', 'Microphone device disconnected.');
          setDiagnostics((prev) => ({ ...prev, micActive: false }));
        };
      }

      // Prefer modern AudioWorkletNode, fallback cleanly to ScriptProcessorNode
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

  // Poll output AnalyserNode smoothly while speaking so 3D Knight glow reacts to real audio
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

  const handleServerMessage = useCallback(
    async (raw: string) => {
      let msg: ServerWsMessage;
      try {
        msg = JSON.parse(raw) as ServerWsMessage;
      } catch {
        return;
      }

      if (msg.type === 'connected' || msg.type === 'mode_updated') {
        setErrorMessage(null);
        setCosmicState('LISTENING');
        setDiagnostics((prev) => ({
          ...prev,
          activeModel: msg.model || prev.activeModel,
          activeVoice: msg.voice || prev.activeVoice,
        }));
        addLog(
          'info',
          'gemini',
          `${msg.type === 'mode_updated' ? 'Switched mode' : 'Connected'} -> model=${msg.model}, voice=${msg.voice}, mode=${msg.mode}`,
        );
        return;
      }

      if (msg.type === 'audio' && msg.data) {
        aiTurnInFlightRef.current = true;
        await playPcmChunk(msg.data, msg.mimeType || 'audio/pcm;rate=24000');
        return;
      }

      if (msg.type === 'interrupted') {
        aiTurnInFlightRef.current = false;
        clearAudioQueue('user-interrupted');
        setCosmicState('LISTENING');
        addLog('info', 'playback', 'Gemini Live turn interrupted by user speech.');
        return;
      }

      if (msg.type === 'turn_complete') {
        aiTurnInFlightRef.current = false;
        if (activeSourcesRef.current.size === 0 && stateRef.current === 'SPEAKING') {
          setCosmicState('LISTENING');
        }
        if (
          pendingPeriodicAdRef.current &&
          activeSourcesRef.current.size === 0 &&
          !isAdShowingRef.current
        ) {
          const nowMs = Date.now();
          const normalized = normalizeAdPassState(adPassStorageRef.current, nowMs);
          adPassStorageRef.current = normalized;
          saveAdPassState(normalized);
          setAdPassStatus(getAdPassStatus(normalized, nowMs));
          if (normalized.adFreeUntil > nowMs) {
            pendingPeriodicAdRef.current = false;
          } else {
            pendingPeriodicAdRef.current = false;
            isAdShowingRef.current = true;
            void triggerUnityAd(
              UNITY_ADS_CONFIG.interstitialPlacement,
              'Sponsored Break (Every 4 Minutes)',
              (req) => setActiveAd(req),
            ).finally(() => {
              lastPeriodicAdAtRef.current = Date.now();
              isAdShowingRef.current = false;
            });
          }
        }
        return;
      }

      if (msg.type === 'input_transcript' && msg.text) {
        aiTurnInFlightRef.current = true;
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

        for (const call of msg.calls) {
          addLog('info', 'tool', `Executing tool ${call.name}(${JSON.stringify(call.args)})`);
          const { response, logEntry } = await executeSafeToolCall(
            call.name,
            call.args || {},
            bridge,
          );
          setActionLogs((prev) => [logEntry, ...prev].slice(0, 30));
          addLog(
            logEntry.ok ? 'info' : 'warn',
            'tool',
            `Tool ${call.name} -> ${logEntry.ok ? 'OK' : 'FAILED'}: ${logEntry.message}`,
          );
          responses.push({
            id: call.id,
            name: call.name,
            response,
          });
        }

        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(
            JSON.stringify({
              type: 'tool_response',
              responses,
            }),
          );
        }
        return;
      }

      if (msg.type === 'session_closed' || msg.type === 'disconnected') {
        clearAudioQueue('session-closed');
        if (stateRef.current !== 'IDLE') {
          setCosmicState('IDLE');
        }
        addLog('warn', 'gemini', msg.reason || 'Gemini Live session closed.');
        return;
      }

      if (msg.type === 'error') {
        const errText = msg.message || 'Unknown Gemini Live error.';
        setErrorMessage(errText);
        setCosmicState('ERROR');
        addLog('error', 'gemini', errText);
      }
    },
    [addLog, appendTranscript, clearAudioQueue, playPcmChunk],
  );

  const disconnect = useCallback(() => {
    clearAudioQueue('user-disconnect');
    stopMicrophone();
    if (wsRef.current) {
      const ws = wsRef.current;
      wsRef.current = null;
      try {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'disconnect' }));
        }
        ws.close();
      } catch {
        // ignore
      }
    }
    setCosmicState('IDLE');
    setErrorMessage(null);
    setMicNotice(null);
    addLog('info', 'gemini', 'Cosmic AI session disconnected.');
  }, [addLog, clearAudioQueue, stopMicrophone]);

  const connect = useCallback(async () => {
    if (stateRef.current === 'CONNECTING') return;
    setErrorMessage(null);
    setMicNotice(null);
    setCosmicState('CONNECTING');

    try {
      const ctx = await ensureAudioContext();
      try {
        await startMicrophone(ctx);
        setIsMicMuted(false);
      } catch (micErr) {
        const micMsg = micErr instanceof Error ? micErr.message : String(micErr);
        setIsMicMuted(true);
        setMicNotice(micMsg);
      }

      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch {
          // ignore
        }
        wsRef.current = null;
      }

      const wsUrl = resolveLiveWsUrl(backendUrl);
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        addLog('info', 'gemini', `WebSocket connected to ${wsUrl}. Initializing Gemini Live...`);
        ws.send(
          JSON.stringify({
            type: 'connect',
            badmashMode: modeRef.current === 'badmash',
          }),
        );
      };

      ws.onmessage = (event) => {
        void handleServerMessage(String(event.data));
      };

      ws.onerror = () => {
        addLog('warn', 'gemini', `WebSocket transport error connecting to ${wsUrl}.`);
        setErrorMessage(
          isPackagedApkOrigin()
            ? 'Live voice server is offline (404). Please publish/deploy the COSMIC AI app in AI Studio (Share App) and retry.'
            : 'Voice transport error. Check server status and retry.',
        );
        setCosmicState('ERROR');
      };

      ws.onclose = (ev) => {
        if (wsRef.current === ws) {
          wsRef.current = null;
          stopMicrophone();
          clearAudioQueue('ws-closed');
          if (stateRef.current !== 'ERROR' && stateRef.current !== 'IDLE') {
            setCosmicState('IDLE');
          }
          addLog('info', 'gemini', `WebSocket closed (code ${ev.code}).`);
        }
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(msg);
      setCosmicState('ERROR');
      stopMicrophone();
    }
  }, [
    addLog,
    backendUrl,
    clearAudioQueue,
    ensureAudioContext,
    handleServerMessage,
    startMicrophone,
    stopMicrophone,
  ]);

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
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        setErrorMessage('Power on Cosmic AI first to send a live message.');
        return;
      }
      clearAudioQueue('user-text-interrupt');
      appendTranscript('user', trimmed);
      aiTurnInFlightRef.current = true;
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

  const toggleBadmashMode = useCallback(async () => {
    if (isAdShowingRef.current) return;
    const next: CosmicMode = modeRef.current === 'normal' ? 'badmash' : 'normal';

    if (next === 'badmash') {
      isAdShowingRef.current = true;
      let rewarded = false;
      try {
        rewarded = await triggerUnityAd(
          UNITY_ADS_CONFIG.rewardedPlacement,
          'Watch Rewarded Ad to Unlock Badmash Mode',
          (req) => setActiveAd(req),
        );
      } finally {
        isAdShowingRef.current = false;
      }

      if (!rewarded) {
        setErrorMessage(
          'Rewarded ad must be watched completely (or is still loading) to unlock Badmash Mode.',
        );
        return;
      }
    }

    setMode(next);
    addLog(
      'info',
      'gemini',
      next === 'badmash'
        ? 'BADMASH MODE ON -> Switching to Purple Knight + Deep Don voice (Charon).'
        : 'NORMAL MODE ON -> Switching to Blue Knight + Friendly voice (Zephyr).',
    );
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      clearAudioQueue('mode-switch');
      wsRef.current.send(
        JSON.stringify({
          type: 'set_mode',
          badmashMode: next === 'badmash',
        }),
      );
    }
  }, [addLog, clearAudioQueue]);

  const watchPassRewardAd = useCallback(async (): Promise<boolean> => {
    if (isAdShowingRef.current) return false;
    isAdShowingRef.current = true;
    let rewarded = false;
    try {
      rewarded = await triggerUnityAd(
        UNITY_ADS_CONFIG.rewardedPlacement,
        `12-Hour Ad-Free Pass (${adPassStorageRef.current.watchedCount + 1}/20)`,
        (req) => setActiveAd(req),
      );
    } finally {
      isAdShowingRef.current = false;
    }

    if (!rewarded) {
      setErrorMessage('Rewarded ad was not completed or is still loading. Try again shortly.');
      return false;
    }

    const now = Date.now();
    const updated = recordWatchedPassAd(adPassStorageRef.current, now);
    adPassStorageRef.current = updated;
    saveAdPassState(updated);
    setAdPassStatus(getAdPassStatus(updated, now));
    pendingPeriodicAdRef.current = false;
    return true;
  }, []);

  // Periodic 4-minute ad scheduler (suppressed during 12h pass, never interrupts active AI answer)
  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = Date.now();
      const normalized = normalizeAdPassState(adPassStorageRef.current, now);
      if (
        normalized.watchedCount !== adPassStorageRef.current.watchedCount ||
        normalized.adFreeUntil !== adPassStorageRef.current.adFreeUntil
      ) {
        adPassStorageRef.current = normalized;
        saveAdPassState(normalized);
        lastPeriodicAdAtRef.current = now;
      }
      setAdPassStatus(getAdPassStatus(normalized, now));

      if (normalized.adFreeUntil > now) {
        pendingPeriodicAdRef.current = false;
        return;
      }

      if (now - lastPeriodicAdAtRef.current < PERIODIC_AD_INTERVAL_MS) {
        return;
      }

      const isAiBusy =
        aiTurnInFlightRef.current ||
        stateRef.current === 'SPEAKING' ||
        activeSourcesRef.current.size > 0;

      if (isAiBusy) {
        pendingPeriodicAdRef.current = true;
        return;
      }

      if (isAdShowingRef.current) {
        return;
      }

      pendingPeriodicAdRef.current = false;
      isAdShowingRef.current = true;
      void triggerUnityAd(
        UNITY_ADS_CONFIG.interstitialPlacement,
        'Sponsored Break (Every 4 Minutes)',
        (req) => setActiveAd(req),
      ).finally(() => {
        lastPeriodicAdAtRef.current = Date.now();
        isAdShowingRef.current = false;
      });
    }, 5000);

    return () => window.clearInterval(timer);
  }, []);

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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
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
  }, [clearAudioQueue, stopMicrophone]);

  const updateBackendUrl = useCallback(
    (nextUrl: string) => {
      const cleaned = nextUrl.trim().replace(/\/+$/, '');
      if (cleaned && !/^https:\/\//i.test(cleaned) && !/^http:\/\/(localhost|127\.0\.0\.1)/i.test(cleaned)) {
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
      addLog('info', 'bridge', cleaned ? `Updated voice backend URL -> ${cleaned}` : 'Reset voice backend URL to default.');
      return true;
    },
    [addLog],
  );

  const completeWebAd = useCallback((completed: boolean) => {
    setActiveAd((current) => {
      if (current) {
        current.resolve(completed);
      }
      return null;
    });
  }, []);

  return {
    mode,
    cosmicState,
    isMicMuted,
    errorMessage,
    micNotice,
    backendUrl,
    transcripts,
    actionLogs,
    diagnosticLogs,
    diagnostics,
    speakerTestResult,
    activeAd,
    completeWebAd,
    adPassStatus,
    watchPassRewardAd,
    bridgeRuntime: bridgeEnv.current,
    audioLevelRef,
    togglePower,
    toggleMicMute,
    toggleBadmashMode,
    retryMicrophone,
    sendTextMessage,
    testSpeaker,
    runManualSafeAction,
    updateBackendUrl,
    clearError: () => setErrorMessage(null),
    clearMicNotice: () => setMicNotice(null),
  };
}
