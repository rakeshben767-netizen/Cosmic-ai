export type CosmicState =
  | 'IDLE'
  | 'CONNECTING'
  | 'RECONNECTING'
  | 'LISTENING'
  | 'SPEAKING'
  | 'ERROR';

export type CosmicMode = 'normal' | 'badmash';

export type RapBattleStyle =
  | 'friendly'
  | 'comedy'
  | 'tapori'
  | 'attitude'
  | 'freestyle';

export interface CosmicFeaturesConfig {
  customShayari: boolean;
  rapBattle: boolean;
  rapBattleStyle: RapBattleStyle;
  roastBattle: boolean;
  darkComedy: boolean;
  doubleMeaning: boolean;
  memeCommentary: boolean;
  motivationalTapori: boolean;
  newsCommentary: boolean;
  customSlang: boolean;
  speechRate: number;
}

export const DEFAULT_COSMIC_FEATURES: CosmicFeaturesConfig = {
  customShayari: true,
  rapBattle: true,
  rapBattleStyle: 'tapori',
  roastBattle: true,
  darkComedy: true,
  doubleMeaning: true,
  memeCommentary: true,
  motivationalTapori: true,
  newsCommentary: true,
  customSlang: true,
  speechRate: 1.0,
};

export type SafeActionName =
  | 'openWhatsApp'
  | 'openApp'
  | 'openYouTubeSearch'
  | 'openUrl'
  | 'makeCall'
  | 'callContact'
  | 'findContact'
  | 'draftWhatsAppMessage'
  | 'sendWhatsAppMessage';

export type WhatsAppMessageState =
  | 'message_prepared'
  | 'whatsapp_opened'
  | 'message_sent'
  | 'message_delivered';

export interface ContactLookupMatch {
  name: string;
  phoneNumber: string;
}

export interface PendingWhatsAppDraft {
  id: string;
  contactName: string;
  phoneNumber: string;
  message: string;
  state: 'message_prepared';
  createdAt: number;
}

export interface TranscriptEntry {
  id: string;
  speaker: 'user' | 'cosmic';
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
    | 'bridge'
    | 'knowledge'
    | 'network';
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

export interface LiveKnowledgeItem {
  headline: string;
  source: string;
  url: string;
  publishedAt: string | null;
  dateLabel: string;
  snippet: string;
  relevanceScore: number;
  corroboratedBy: number;
}

export interface LiveKnowledgeSearchResult {
  ok: boolean;
  query: string;
  category: string;
  fetchedAt: string;
  offline: boolean;
  cached?: boolean;
  summary: string;
  items: LiveKnowledgeItem[];
  sources: Array<{ title: string; url: string; source: string; dateLabel: string }>;
  error?: string;
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
  networkStatus: 'online' | 'offline';
  retryCount: number;
  sessionResumptionStatus: 'none' | 'ready' | 'resumed' | 'reconnecting' | 'expired';
  lastCloseCode: number | null;
  lastCloseReason: string | null;
  backendLatencyMs: number | null;
}
