export type CosmicState = 'IDLE' | 'CONNECTING' | 'LISTENING' | 'SPEAKING' | 'ERROR';

export type CosmicMode = 'normal' | 'badmash';

export type SafeActionName =
  | 'openWhatsApp'
  | 'openApp'
  | 'openUrl'
  | 'makeCall'
  | 'callContact';

export interface TranscriptEntry {
  id: string;
  speaker: 'user' | 'cosmic' | 'system';
  text: string;
  timestamp: number;
  mode: CosmicMode;
}

export interface ActionLogEntry {
  id: string;
  action: SafeActionName;
  args: Record<string, unknown>;
  ok: boolean;
  message: string;
  fallbackUrl?: string;
  timestamp: number;
  via: 'android-bridge' | 'browser' | 'validation';
}

export interface DiagnosticLogEntry {
  id: string;
  level: 'info' | 'warn' | 'error';
  category:
    | 'gemini'
    | 'mic'
    | 'audio'
    | 'playback'
    | 'tool'
    | 'bridge';
  message: string;
  timestamp: number;
}

export interface ToolCallPayload {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface ToolResponsePayload {
  id: string;
  name: string;
  response: Record<string, unknown>;
}

export interface AudioDiagnosticsSnapshot {
  contextState: AudioContextState | 'uninitialized';
  sampleRate: number;
  micPermission: 'unknown' | 'prompt' | 'granted' | 'denied' | 'unavailable';
  micActive: boolean;
  chunksSent: number;
  chunksPlayed: number;
  queuedChunks: number;
  lastMimeType: string;
  activeModel: string;
  activeVoice: string;
}
