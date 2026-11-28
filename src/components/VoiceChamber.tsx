import type { RefObject } from 'react';
import {
  ArrowLeft,
  Check,
  ExternalLink,
  Flame,
  Globe,
  History,
  MessageSquare,
  MessageSquareText,
  Mic,
  MicOff,
  Power,
  RotateCcw,
  Sparkles,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import type {
  AudioDiagnosticsSnapshot,
  CosmicMode,
  CosmicState,
  LiveKnowledgeSearchResult,
  PendingWhatsAppDraft,
  TranscriptEntry,
} from '../types/cosmic.ts';
import type { LatencyStatus } from '../utils/latency.ts';
import type { MoodVisualProfile } from '../utils/responseMood.ts';
import { CosmicKnightCanvas } from './CosmicKnightCanvas.tsx';
import { VoiceWaveform } from './VoiceWaveform.tsx';

interface VoiceChamberProps {
  mode: CosmicMode;
  cosmicState: CosmicState;
  moodProfile: MoodVisualProfile;
  isMicMuted: boolean;
  voiceOutputEnabled: boolean;
  isDeveloperVerified: boolean;
  pendingPowerOnUnlock: boolean;
  isLive: boolean;
  diagnostics: AudioDiagnosticsSnapshot;
  latencyStatus: LatencyStatus;
  audioLevelRef: RefObject<number>;
  resetViewSignal: number;
  latestCosmicTranscript: TranscriptEntry | null;
  adSnackbarMessage: string | null;
  powerOnAdNotice: string | null;
  errorMessage: string | null;
  micNotice: string | null;
  pendingWhatsAppDraft: PendingWhatsAppDraft | null;
  liveKnowledge: LiveKnowledgeSearchResult | null;
  onBackToChat: () => void;
  onHiddenBrandTap: () => void;
  onOpenHistory: () => void;
  onResetCamera: () => void;
  onTogglePower: () => void;
  onToggleMicMute: () => void;
  onToggleVoiceOutput: () => void;
  onToggleBadmashMode: () => void;
  onRetryMicrophone: () => void;
  onConfirmWhatsAppDraft: () => void;
  onDismissWhatsAppDraft: () => void;
  onClearLiveKnowledge: () => void;
  onClearAdSnackbar: () => void;
  onClearPowerOnAdNotice: () => void;
  onClearError: () => void;
  onClearMicNotice: () => void;
}

export function VoiceChamber({
  mode,
  cosmicState,
  moodProfile,
  isMicMuted,
  voiceOutputEnabled,
  isDeveloperVerified,
  pendingPowerOnUnlock,
  isLive,
  diagnostics,
  latencyStatus,
  audioLevelRef,
  resetViewSignal,
  latestCosmicTranscript,
  adSnackbarMessage,
  powerOnAdNotice,
  errorMessage,
  micNotice,
  pendingWhatsAppDraft,
  liveKnowledge,
  onBackToChat,
  onHiddenBrandTap,
  onOpenHistory,
  onResetCamera,
  onTogglePower,
  onToggleMicMute,
  onToggleVoiceOutput,
  onToggleBadmashMode,
  onRetryMicrophone,
  onConfirmWhatsAppDraft,
  onDismissWhatsAppDraft,
  onClearLiveKnowledge,
  onClearAdSnackbar,
  onClearPowerOnAdNotice,
  onClearError,
  onClearMicNotice,
}: VoiceChamberProps) {
  const isBadmash = mode === 'badmash';

  const stateColorClass =
    cosmicState === 'ERROR'
      ? 'text-red-400'
      : cosmicState === 'RECONNECTING' || cosmicState === 'CONNECTING'
        ? 'text-amber-300'
        : cosmicState === 'SPEAKING'
          ? isBadmash
            ? 'text-rose-300'
            : 'text-sky-300'
          : cosmicState === 'LISTENING'
            ? isBadmash
              ? 'text-violet-300'
              : 'text-sky-400'
            : 'text-slate-400';

  return (
    <div data-testid="cosmic-voice-chamber" className="relative h-full w-full overflow-hidden">
      {/* Full-Viewport 3D Cosmic Ball Scene */}
      <CosmicKnightCanvas
        mode={mode}
        cosmicState={cosmicState}
        moodProfile={moodProfile}
        audioLevelRef={audioLevelRef}
        resetViewSignal={resetViewSignal}
      />

      {/* Top Voice Chamber Bar */}
      <header className="pointer-events-none fixed top-0 inset-x-0 z-20 flex flex-col gap-1.5 px-3 pt-3 pb-2 sm:px-6">
        <div className="flex items-center justify-between gap-2">
          <div className="pointer-events-auto flex items-center gap-2">
            <button
              type="button"
              onClick={onBackToChat}
              data-testid="back-to-chat-button"
              aria-label="Back to Text Chat"
              className="flex min-h-[40px] items-center gap-1.5 rounded-xl border border-white/15 bg-[#0d101b]/90 px-3 text-xs font-semibold text-slate-100 backdrop-blur-md transition-colors hover:border-sky-400/50 hover:text-white"
            >
              <ArrowLeft className="h-4 w-4 text-sky-400" />
              <span>Chat</span>
            </button>

            <button
              type="button"
              onClick={onHiddenBrandTap}
              className="font-display cursor-pointer whitespace-nowrap text-sm font-bold tracking-[0.14em] text-white uppercase sm:text-base"
            >
              COSMIC AI
            </button>
          </div>

          <div className="hidden items-center gap-2 font-mono text-xs text-slate-300 md:flex">
            <span className={`font-semibold tracking-wider ${stateColorClass}`} data-testid="cosmic-state-label">
              {cosmicState}
            </span>
            <span className="text-slate-600">·</span>
            <span className="text-slate-200">
              {isBadmash ? 'Cosmic Ball · Savage Mode' : 'Cosmic Ball · Normal Mode'}
            </span>
            <span className="text-slate-600">·</span>
            <span className="text-slate-400">
              {isBadmash ? 'Don Voice (Charon)' : 'Voice (Zephyr)'}
            </span>
            {isDeveloperVerified && (
              <>
                <span className="text-slate-600">·</span>
                <span className="text-emerald-300" data-testid="respect-mode-label">
                  Respect Mode
                </span>
              </>
            )}
          </div>

          <div className="pointer-events-auto flex items-center gap-1.5">
            <div
              data-testid="latency-indicator"
              aria-label={`Network Ping ${latencyStatus.label} (${latencyStatus.meaning})`}
              title="Network Ping: Green = Best Net (<150ms), Yellow = Medium (150-350ms), Red = Low (>350ms)"
              className="flex h-10 items-center gap-1.5 rounded-xl border border-white/10 bg-[#0d101b]/85 px-2.5 font-mono text-[10px] tabular-nums sm:text-xs"
            >
              <span className={`h-2 w-2 shrink-0 rounded-full ${latencyStatus.dotClass}`} />
              <span className={latencyStatus.textClass}>
                {latencyStatus.label} · {latencyStatus.meaning}
              </span>
            </div>

            <button
              type="button"
              onClick={onOpenHistory}
              aria-label="Conversation History"
              title="Conversation History"
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 bg-[#0d101b]/90 text-slate-200 transition-colors hover:border-sky-400/50 hover:text-white"
            >
              <History className="h-4 w-4 text-sky-400" />
            </button>

            <button
              type="button"
              onClick={onResetCamera}
              aria-label="Reset camera view"
              title="Reset Camera View"
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 bg-[#0d101b]/90 text-slate-300 transition-colors hover:border-white/30 hover:text-white"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Network Quality Notice */}
        <div className="flex justify-center">
          <div
            data-testid="network-quality-banner"
            className={`rounded-lg border px-2.5 py-0.5 text-center text-[10px] leading-snug backdrop-blur-sm sm:text-[11px] ${
              diagnostics.networkStatus === 'offline' || latencyStatus.tier === 'high'
                ? 'border-red-500/45 bg-[#1a0d12]/85 font-medium text-red-300'
                : latencyStatus.tier === 'moderate'
                  ? 'border-yellow-400/35 bg-[#19160a]/80 text-yellow-200'
                  : 'border-white/10 bg-[#0b101d]/65 text-slate-300'
            }`}
          >
            {diagnostics.networkStatus === 'offline' || latencyStatus.tier === 'high'
              ? 'Weak network detected — Cosmic AI will not work properly without a good connection.'
              : 'If your network is not good, Cosmic AI will not work properly. (Green: Best · Yellow: Medium · Red: Low)'}
          </div>
        </div>
      </header>

      {/* Bottom Voice Captions (Directly Above Power On Dock) + Voice Control Dock */}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-20 mx-auto flex w-[min(94vw,600px)] flex-col items-center gap-2">
        {cosmicState === 'RECONNECTING' && (
          <div
            role="status"
            data-testid="reconnecting-banner"
            className="pointer-events-auto w-full rounded-xl border border-amber-400/45 bg-[#1b1409]/95 px-3 py-2 text-xs text-amber-100 shadow-lg"
          >
            Reconnecting voice session automatically (attempt {diagnostics.retryCount}/5)...
          </div>
        )}

        {adSnackbarMessage && (
          <div
            role="status"
            data-testid="rewarded-ad-snackbar"
            className="pointer-events-auto flex w-full items-center justify-between gap-2 rounded-xl border border-emerald-400/45 bg-[#0c1a15]/95 px-3 py-2 text-xs text-emerald-100 shadow-lg"
          >
            <span className="min-w-0 break-words font-medium">{adSnackbarMessage}</span>
            <button
              type="button"
              onClick={onClearAdSnackbar}
              className="shrink-0 font-semibold text-emerald-300 hover:text-white"
            >
              OK
            </button>
          </div>
        )}

        {powerOnAdNotice && (
          <div
            role="alert"
            data-testid="power-on-ad-notice"
            className="pointer-events-auto flex w-auto max-w-full items-center justify-between gap-3 rounded-xl border border-amber-400/45 bg-[#1b1409]/95 px-3.5 py-2 text-xs text-amber-100 shadow-lg"
          >
            <span className="font-medium">{powerOnAdNotice}</span>
            <button
              type="button"
              onClick={onClearPowerOnAdNotice}
              className="shrink-0 font-semibold text-amber-300 hover:text-white"
            >
              OK
            </button>
          </div>
        )}

        {errorMessage && (
          <div
            role="alert"
            className="pointer-events-auto flex w-full items-center justify-between gap-2 rounded-xl border border-red-500/40 bg-[#1a0d12]/95 px-3 py-2 text-xs text-red-200 shadow-lg"
          >
            <span className="min-w-0 break-words">{errorMessage}</span>
            <button
              type="button"
              onClick={onClearError}
              className="shrink-0 font-semibold text-red-300 hover:text-white"
            >
              Dismiss
            </button>
          </div>
        )}

        {micNotice && (
          <div
            role="status"
            data-testid="mic-permission-notice"
            className="pointer-events-auto flex w-full flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-400/45 bg-[#18130c]/95 px-3 py-2 text-xs text-amber-100 shadow-lg"
          >
            <span className="min-w-[160px] flex-1">{micNotice}</span>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={onRetryMicrophone}
                className="rounded-md border border-amber-400/50 bg-amber-500/20 px-2.5 py-1 font-semibold text-amber-100 hover:bg-amber-500/30"
              >
                Retry Mic
              </button>
              <button
                type="button"
                onClick={onClearMicNotice}
                className="text-amber-300 hover:text-white"
              >
                Hide
              </button>
            </div>
          </div>
        )}

        {pendingWhatsAppDraft && (
          <div
            role="status"
            data-testid="whatsapp-draft-confirmation"
            className="pointer-events-auto w-full rounded-xl border border-emerald-400/40 bg-[#0b1813]/95 px-3 py-2 text-xs shadow-xl"
          >
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 font-semibold text-emerald-300">
                <MessageSquare className="h-3.5 w-3.5" />
                Message Prepared · {pendingWhatsAppDraft.contactName}
              </span>
              <span className="font-mono text-[10px] text-emerald-400 uppercase">
                Confirm Send
              </span>
            </div>
            <p className="mb-2 rounded-md border border-white/10 bg-black/30 px-2.5 py-1.5 text-slate-100">
              {pendingWhatsAppDraft.message}
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onDismissWhatsAppDraft}
                className="rounded-md border border-white/15 px-2.5 py-1 font-medium text-slate-300 hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onConfirmWhatsAppDraft}
                className="flex items-center gap-1 rounded-md border border-emerald-400/60 bg-emerald-500/25 px-3 py-1 font-semibold text-emerald-100 hover:bg-emerald-500/35"
              >
                <Check className="h-3.5 w-3.5" />
                Open WhatsApp
              </button>
            </div>
          </div>
        )}

        {liveKnowledge && liveKnowledge.items.length > 0 && (
          <div
            data-testid="live-knowledge-card"
            className="pointer-events-auto w-full rounded-xl border border-sky-400/30 bg-[#0d101b]/95 px-3 py-2 text-xs shadow-xl"
          >
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 font-semibold text-sky-300">
                <Globe className="h-3.5 w-3.5" />
                Verified Sources ({liveKnowledge.items[0].dateLabel})
              </span>
              <button
                type="button"
                onClick={onClearLiveKnowledge}
                aria-label="Dismiss live sources"
                className="text-slate-400 hover:text-white"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {liveKnowledge.items.slice(0, 3).map((item, idx) => (
                <a
                  key={`${item.url}-${idx}`}
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex max-w-full items-center gap-1 truncate rounded-md border border-white/12 bg-[#14192b] px-2 py-1 text-[11px] text-slate-200 hover:border-sky-400/50 hover:text-white"
                >
                  <span className="truncate">
                    {item.source}: {item.headline}
                  </span>
                  <ExternalLink className="h-3 w-3 shrink-0 text-sky-400" />
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Spoken Cosmic Subtitle Right Above Power On Button */}
        {latestCosmicTranscript && (
          <div
            data-testid="voice-cosmic-subtitle"
            className={`pointer-events-auto w-full rounded-2xl border px-3.5 py-2.5 text-center text-xs leading-relaxed backdrop-blur-md sm:text-sm ${
              isBadmash
                ? 'border-rose-500/40 bg-[#17091b]/88 text-rose-100 shadow-[0_0_24px_rgba(244,63,94,0.18)]'
                : 'border-sky-400/35 bg-[#0a1324]/88 text-sky-50 shadow-[0_0_24px_rgba(56,189,248,0.18)]'
            }`}
          >
            <p className="select-text break-words">{latestCosmicTranscript.text}</p>
          </div>
        )}

        {/* Voice Control Dock */}
        <footer data-testid="cosmic-control-dock" className="pointer-events-auto w-full sm:w-fit sm:max-w-full">
          <div
            className={`flex flex-wrap items-center justify-center gap-2 rounded-2xl border px-3 py-2 backdrop-blur-md transition-colors ${
              isBadmash
                ? 'border-rose-500/45 bg-[#160a1d]/92 shadow-[0_0_24px_rgba(244,63,94,0.2)]'
                : 'border-sky-400/30 bg-[#0b101d]/92 shadow-[0_0_24px_rgba(56,189,248,0.16)]'
            }`}
          >
            <button
              type="button"
              disabled={pendingPowerOnUnlock}
              onClick={onTogglePower}
              data-testid="power-on-toggle"
              className={`flex h-10 items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold whitespace-nowrap transition-colors disabled:opacity-75 ${
                isLive
                  ? 'border-sky-400/60 bg-sky-500/18 text-sky-100'
                  : 'border-white/15 bg-white/5 text-slate-100 hover:bg-white/12'
              }`}
            >
              <Power className={`h-3.5 w-3.5 ${pendingPowerOnUnlock ? 'animate-pulse text-rose-300' : ''}`} />
              <span>{isLive ? 'Power Off' : pendingPowerOnUnlock ? 'Loading Ad...' : 'Power On'}</span>
            </button>

            <button
              type="button"
              disabled={!isLive && pendingPowerOnUnlock}
              onClick={onToggleMicMute}
              className={`flex h-10 items-center gap-1.5 rounded-xl border px-3 text-xs font-medium whitespace-nowrap transition-colors disabled:opacity-75 ${
                isLive && isMicMuted
                  ? 'border-amber-400/60 bg-amber-500/15 text-amber-200'
                  : isLive
                    ? 'border-sky-400/50 bg-sky-500/15 text-sky-100'
                    : 'border-white/15 bg-white/5 text-slate-200 hover:bg-white/10'
              }`}
            >
              {isLive && isMicMuted ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
              <span>{isLive && isMicMuted ? 'Muted' : 'Speak'}</span>
            </button>

            <button
              type="button"
              role="switch"
              aria-checked={voiceOutputEnabled}
              onClick={onToggleVoiceOutput}
              data-testid="voice-output-toggle"
              className={`flex h-10 items-center gap-1.5 rounded-xl border px-3 text-xs font-medium whitespace-nowrap transition-colors ${
                voiceOutputEnabled
                  ? isBadmash
                    ? 'border-rose-400/55 bg-rose-500/18 text-rose-100'
                    : 'border-cyan-400/55 bg-cyan-500/18 text-cyan-100'
                  : 'border-white/15 bg-white/5 text-slate-400 hover:text-slate-200'
              }`}
            >
              {voiceOutputEnabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
              <span>{voiceOutputEnabled ? 'Voice ON' : 'Voice OFF'}</span>
            </button>

            <VoiceWaveform mode={mode} cosmicState={cosmicState} audioLevelRef={audioLevelRef} />

            <button
              type="button"
              role="switch"
              aria-checked={isBadmash}
              onClick={onToggleBadmashMode}
              data-testid="badmash-mode-toggle"
              className={`flex h-10 items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold tracking-wide whitespace-nowrap transition-all ${
                isBadmash
                  ? 'border-rose-500/80 bg-gradient-to-r from-rose-700/35 to-violet-700/35 text-rose-100 shadow-[0_0_18px_rgba(244,63,94,0.4)]'
                  : 'border-sky-400/45 bg-sky-950/60 text-sky-100 hover:border-sky-300'
              }`}
            >
              {isBadmash ? (
                <>
                  <Flame className="h-3.5 w-3.5 text-rose-400" />
                  <span>BADMASH</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5 text-sky-400" />
                  <span>NORMAL</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onBackToChat}
              className="flex h-10 items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3 text-xs font-medium text-slate-200 whitespace-nowrap transition-colors hover:border-white/30 hover:bg-white/10"
            >
              <MessageSquareText className="h-3.5 w-3.5 text-sky-400" />
              <span>Text</span>
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
