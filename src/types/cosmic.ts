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

export type MessageType = 'TEXT' | 'VOICE' | 'AI_RESPONSE';

export type ConversationType = 'TEXT' | 'VOICE' | 'MIXED';

export interface MessageEntity {
  messageId: string;
  conversationId: string;
  messageText: string;
  sender: 'user' | 'cosmic';
  messageType: MessageType;
  activeMode: CosmicMode;
  timestamp: number;
  messageOrder: number;
}

export interface ConversationEntity {
  conversationId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  activeMode: CosmicMode;
  conversationType: ConversationType;
  messages: MessageEntity[];
}

export interface TranscriptEntry {
  id: string;
  speaker: 'user' | 'cosmic';
  text: string;
  timestamp: number;
  mode: CosmicMode;
  messageType?: MessageType;
  messageOrder?: number;
}

export interface ConversationSessionRecord {
  id: string;
  startedAt: number;
  updatedAt: number;
  mode: CosmicMode;
  entries: TranscriptEntry[];
}

export interface ConversationMemoryItem {
  speaker: 'user' | 'cosmic';
  text: string;
  mode?: CosmicMode;
  timestamp?: number;
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

export type AdTriggerType = 'app_load' | 'power_on' | 'interval_4m';

export type AdResolutionOutcome =
  | 'completed'
  | 'skipped'
  | 'ad_not_loaded'
  | 'show_failed'
  | 'fallback_no_fill_or_error'
  | 'not_ready';

export interface RewardedAdRuleEvent {
  ad_type: 'rewarded';
  trigger: AdTriggerType;
  grant_power_on: boolean;
  grant_badmash_mode: boolean;
  next_interval_sec: 240;
}

export interface UnityPlacementSnapshot {
  placementId: string;
  phase: 'IDLE' | 'LOADING' | 'LOADED' | 'SHOWING' | 'FAILED';
  rawErrorCode: string | null;
  rawErrorMessage: string | null;
}

export interface UnityAdsSnapshot {
  appName: string;
  unityGameId: string;
  testMode: boolean;
  sdkStatus: {
    phase: 'UNINITIALIZED' | 'INITIALIZING' | 'INITIALIZED' | 'FAILED';
    rawErrorCode: string | null;
    rawErrorMessage: string | null;
  };
  rewardedState: UnityPlacementSnapshot;
  interstitialState: UnityPlacementSnapshot;
  counters: {
    loadSuccess: number;
    loadFailed: number;
    impressions: number;
    clicks: number;
    skips: number;
  };
  lastRuleEvent: (RewardedAdRuleEvent & { outcome?: string }) | null;
}
