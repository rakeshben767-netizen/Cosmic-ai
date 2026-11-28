import { useEffect, useRef, useState } from 'react';
import {
  Check,
  ExternalLink,
  Flame,
  Globe,
  History,
  Loader2,
  MessageSquare,
  Mic,
  MicOff,
  Power,
  RotateCcw,
  Send,
  ShieldCheck,
  Sparkles,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { AdminAccessModal } from './components/AdminAccessModal.tsx';
import { ChatThread } from './components/ChatThread.tsx';
import { CosmicKnightCanvas } from './components/CosmicKnightCanvas.tsx';
import { HistoryModal } from './components/HistoryModal.tsx';
import { PrivacyPolicyModal } from './components/PrivacyPolicyModal.tsx';
import { SettingsFeaturesModal } from './components/SettingsFeaturesModal.tsx';
import { VoiceWaveform } from './components/VoiceWaveform.tsx';
import { useCosmicLive } from './hooks/useCosmicLive.ts';
import { classifyLatency } from './utils/latency.ts';
import { detectResponseMood, MOOD_VISUAL_PROFILES } from './utils/responseMood.ts';

export default function App() {
  const {
    mode,
    cosmicState,
    isMicMuted,
    voiceOutputEnabled,
    isChatResponding,
    isDeveloperVerified,
    isAdminAuthenticated,
    features,
    pendingWhatsAppDraft,
    errorMessage,
    micNotice,
    backendUrl,
    transcripts,
    unifiedConversations,
    activeConversationId,
    recentSessions,
    actionLogs,
    diagnosticLogs,
    diagnostics,
    speakerTestResult,
    liveKnowledge,
    unityAdsSnapshot,
    adSnackbarMessage,
    pendingPowerOnUnlock,
    powerOnAdNotice,
    lastAdRuleEvent,
    adElapsedActiveMs,
    sessionDurationMs,
    sessionDurationState,
    bridgeRuntime,
    audioLevelRef,
    togglePower,
    toggleMicMute,
    toggleVoiceOutput,
    toggleBadmashMode,
    updateFeatures,
    runLiveKnowledgeSearch,
    clearLiveKnowledge,
    confirmWhatsAppDraft,
    dismissWhatsAppDraft,
    verifyAdminAccess,
    logoutAdmin,
    retryMicrophone,
    sendTextMessage,
    testSpeaker,
    runManualSafeAction,
    updateBackendUrl,
    clearRecentSessions,
    openHistoryConversation,
    startNewConversation,
    deleteHistoryConversation,
    reloadRewardedAd,
    clearAdSnackbar,
    clearPowerOnAdNotice,
    clearError,
    clearMicNotice,
  } = useCosmicLive();

  const [resetViewSignal, setResetViewSignal] = useState(0);
  const [privacyModalOpen, setPrivacyModalOpen] = useState(false);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [adminDrawerRequested, setAdminDrawerRequested] = useState(false);
  const [textDraft, setTextDraft] = useState('');

  const brandTapTimesRef = useRef<number[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const isBadmash = mode === 'badmash';
  const isLive =
    cosmicState === 'CONNECTING' ||
    cosmicState === 'RECONNECTING' ||
    cosmicState === 'LISTENING' ||
    cosmicState === 'SPEAKING';

  const latestCosmicTranscript =
    [...transcripts].reverse().find((entry) => entry.speaker === 'cosmic') || null;
  const latestUserTranscript =
    [...transcripts].reverse().find((entry) => entry.speaker === 'user') || null;
  const moodProfile = detectResponseMood({
    mode,
    cosmicState,
    latestCosmicText: latestCosmicTranscript?.text,
    latestUserText: latestUserTranscript?.text,
  });

  useEffect(() => {
    document.body.dataset.cosmicState = cosmicState;
    document.body.dataset.cosmicMode = mode;
    document.body.dataset.cosmicMood = moodProfile.mood;
  }, [cosmicState, mode, moodProfile.mood]);

  // Auto-resize multiline textarea up to 4 lines
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 96)}px`;
  }, [textDraft]);

  // Hidden keyboard shortcut (Ctrl+Shift+D or Alt+Shift+A) for protected developer/admin console
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'd') ||
        (e.altKey && e.shiftKey && e.key.toLowerCase() === 'a')
      ) {
        e.preventDefault();
        setAdminDrawerRequested((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Hidden 7-tap gesture on COSMIC AI brand for mobile/APK developer/admin access
  const handleHiddenBrandTap = () => {
    const now = Date.now();
    const recent = brandTapTimesRef.current.filter((t) => now - t < 2500);
    recent.push(now);
    brandTapTimesRef.current = recent;
    if (recent.length >= 7) {
      brandTapTimesRef.current = [];
      setAdminDrawerRequested(true);
    }
  };

  const submitTextDraft = () => {
    const msg = textDraft.trim();
    if (!msg || isChatResponding) return;
    setTextDraft('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    void sendTextMessage(msg);
  };

  const handleSendText = (e: React.FormEvent) => {
    e.preventDefault();
    submitTextDraft();
  };

  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submitTextDraft();
    }
  };

  const latencyStatus = classifyLatency(diagnostics.backendLatencyMs, isLive);

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
    <div className="relative h-screen w-screen overflow-hidden bg-[#080d1a] text-slate-100 select-none">
      {/* Dynamic Mood & Personality Background Gradient (Compositor-Only Opacity Crossfade) */}
      <div
        aria-hidden="true"
        data-testid="dynamic-mood-backdrop"
        data-mood={moodProfile.mood}
        className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
      >
        {Object.values(MOOD_VISUAL_PROFILES).map((profile) => {
          const isActive = profile.mood === moodProfile.mood;
          return (
            <div
              key={profile.mood}
              className={`absolute inset-0 transition-opacity duration-1000 ease-out motion-reduce:transition-none ${
                profile.baseGradientClass
              } ${isActive ? 'opacity-100' : 'opacity-0'}`}
            >
              <div className={`absolute inset-0 ${profile.radialGlowClass}`} />
            </div>
          );
        })}
      </div>

      {/* Full-Viewport 3D Knight Scene */}
      <CosmicKnightCanvas
        mode={mode}
        cosmicState={cosmicState}
        moodProfile={moodProfile}
        audioLevelRef={audioLevelRef}
        resetViewSignal={resetViewSignal}
      />

      {/* Minimalist Top Bar */}
      <header className="pointer-events-none fixed top-0 inset-x-0 z-20 flex flex-col gap-1.5 px-4 pt-3 pb-2 sm:px-6">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={handleHiddenBrandTap}
            className="font-display pointer-events-auto cursor-pointer text-sm font-bold tracking-[0.14em] text-white uppercase sm:text-base"
          >
            COSMIC AI
          </button>

          <div className="hidden items-center gap-2 font-mono text-xs text-slate-300 sm:flex">
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

          <div className="pointer-events-auto flex items-center gap-1.5 sm:gap-2.5">
            <div
              data-testid="latency-indicator"
              aria-label={`Network Ping ${latencyStatus.label} (${latencyStatus.meaning})`}
              title="Network Ping: Green = Best Net (<150ms), Yellow = Medium (150-350ms), Red = Low (>350ms)"
              className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-[#0d101b]/80 px-2 py-1 font-mono text-[10px] tabular-nums sm:text-xs"
            >
              <span className={`h-2 w-2 shrink-0 rounded-full ${latencyStatus.dotClass}`} />
              <span className={latencyStatus.textClass}>
                {latencyStatus.label} · {latencyStatus.meaning}
              </span>
            </div>

            <button
              type="button"
              onClick={() => setHistoryModalOpen(true)}
              data-testid="history-button"
              aria-label="Conversation History"
              title="Conversation History (Text & Voice)"
              className={`flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors ${
                isBadmash
                  ? 'border-rose-400/35 bg-[#190c1a]/90 text-rose-100 hover:border-rose-300/60'
                  : 'border-sky-400/30 bg-[#0d101b]/90 text-slate-200 hover:border-sky-300/60 hover:text-white'
              }`}
            >
              <History className={`h-4 w-4 ${isBadmash ? 'text-rose-400' : 'text-sky-400'}`} />
              <span className="hidden sm:inline">History</span>
            </button>

            <button
              type="button"
              onClick={() => setPrivacyModalOpen(true)}
              data-testid="privacy-policy-button"
              aria-label="Privacy Policy"
              title="Privacy Policy"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 bg-[#0d101b]/90 text-slate-300 transition-colors hover:border-white/30 hover:text-white"
            >
              <ShieldCheck className="h-4 w-4 text-sky-400" />
            </button>

            <button
              type="button"
              onClick={() => setResetViewSignal((n) => n + 1)}
              aria-label="Reset camera view"
              title="Reset Camera View"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 bg-[#0d101b]/90 text-slate-300 transition-colors hover:border-white/30 hover:text-white"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Top Network Quality & Legend Notice (English) */}
        <div className="flex justify-center">
          <div
            data-testid="network-quality-banner"
            className={`rounded-lg border px-2.5 py-0.5 text-center text-[10px] leading-snug backdrop-blur-sm sm:text-[11px] ${
              diagnostics.networkStatus === 'offline' || latencyStatus.tier === 'high'
                ? 'border-red-500/45 bg-[#1a0d12]/85 font-medium text-red-300'
                : latencyStatus.tier === 'moderate'
                  ? 'border-yellow-400/35 bg-[#19160a]/80 text-yellow-200'
                  : 'border-white/8 bg-[#0b101d]/65 text-slate-400'
            }`}
          >
            {diagnostics.networkStatus === 'offline' || latencyStatus.tier === 'high'
              ? 'Weak network detected — Cosmic AI will not work properly without a good connection.'
              : 'If your network is not good, Cosmic AI will not work properly. (Green: Best · Yellow: Medium · Red: Low)'}
          </div>
        </div>
      </header>

      {/* Unified Bottom HUD Stack: Status Overlays + Scrollable Chat + Text Input + Control Dock */}
      <div className="pointer-events-none fixed inset-x-0 bottom-3 z-20 mx-auto flex w-[min(94vw,600px)] flex-col items-center gap-2">
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
              onClick={clearAdSnackbar}
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
              onClick={clearPowerOnAdNotice}
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
              onClick={clearError}
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
                onClick={() => void retryMicrophone()}
                className="rounded-md border border-amber-400/50 bg-amber-500/20 px-2.5 py-1 font-semibold text-amber-100 hover:bg-amber-500/30"
              >
                Retry Mic
              </button>
              <button
                type="button"
                onClick={clearMicNotice}
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
                onClick={dismissWhatsAppDraft}
                className="rounded-md border border-white/15 px-2.5 py-1 font-medium text-slate-300 hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmWhatsAppDraft()}
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
                onClick={clearLiveKnowledge}
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

        {/* Scrollable Unified Text + Voice Chat Thread */}
        <ChatThread
          messages={transcripts}
          mode={mode}
          isResponding={isChatResponding}
          onStartNewChat={startNewConversation}
        />

        {/* Permanent Multiline Text Chat Input Bar */}
        <form
          onSubmit={handleSendText}
          data-testid="text-chat-form"
          className={`pointer-events-auto flex w-full items-end gap-2 rounded-2xl border px-3 py-2 backdrop-blur-md transition-colors ${
            isBadmash
              ? 'border-rose-500/45 bg-[#160a1c]/92 shadow-[0_0_22px_rgba(244,63,94,0.18)]'
              : 'border-sky-400/35 bg-[#0b1222]/92 shadow-[0_0_22px_rgba(56,189,248,0.16)]'
          }`}
        >
          <textarea
            ref={textareaRef}
            rows={1}
            value={textDraft}
            onChange={(e) => setTextDraft(e.target.value)}
            onKeyDown={handleTextareaKeyDown}
            placeholder={isBadmash ? 'Abe, bol kya chahiye...' : 'Message Cosmic...'}
            aria-label="Message Cosmic"
            data-testid="text-chat-input"
            className="max-h-24 min-h-[24px] min-w-0 flex-1 resize-none bg-transparent py-1 text-xs leading-snug text-white placeholder:text-slate-400 focus:outline-none sm:text-[13px]"
          />
          <button
            type="submit"
            disabled={!textDraft.trim() || isChatResponding}
            data-testid="text-chat-send"
            aria-label="Send message"
            className={`flex h-8 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-45 ${
              isBadmash
                ? 'border-rose-400/60 bg-gradient-to-r from-rose-600/45 to-violet-600/45 text-rose-100 hover:from-rose-500/55 hover:to-violet-500/55'
                : 'border-sky-400/55 bg-sky-500/25 text-sky-100 hover:bg-sky-500/35'
            }`}
          >
            {isChatResponding ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            <span>Send</span>
          </button>
        </form>

        {/* Bottom Floating Control Dock */}
        <footer
          data-testid="cosmic-control-dock"
          className="pointer-events-auto w-full sm:w-fit sm:max-w-full"
        >
          <div
            className={`flex flex-wrap items-center justify-center gap-2 rounded-2xl border px-3 py-2 transition-colors ${
              isBadmash
                ? 'border-rose-500/45 bg-[#160a1d]/92 shadow-[0_0_24px_rgba(244,63,94,0.2)]'
                : 'border-sky-400/30 bg-[#0b101d]/92 shadow-[0_0_24px_rgba(56,189,248,0.16)]'
            }`}
          >
            {/* Power On / Off */}
            <button
              type="button"
              disabled={pendingPowerOnUnlock}
              onClick={() => void togglePower()}
              data-testid="power-on-toggle"
              className={`flex h-9 items-center gap-1.5 rounded-xl border px-2.5 text-xs font-medium whitespace-nowrap transition-colors disabled:opacity-75 ${
                isLive
                  ? 'border-sky-400/60 bg-sky-500/18 text-sky-100'
                  : 'border-white/15 bg-white/5 text-slate-200 hover:bg-white/10'
              }`}
            >
              <Power className={`h-3.5 w-3.5 ${pendingPowerOnUnlock ? 'animate-pulse text-rose-300' : ''}`} />
              <span>{isLive ? 'Power Off' : pendingPowerOnUnlock ? 'Loading Ad...' : 'Power On'}</span>
            </button>

            {/* Speak / Muted */}
            <button
              type="button"
              disabled={!isLive && pendingPowerOnUnlock}
              onClick={() => void toggleMicMute()}
              className={`flex h-9 items-center gap-1.5 rounded-xl border px-2.5 text-xs font-medium whitespace-nowrap transition-colors disabled:opacity-75 ${
                isLive && isMicMuted
                  ? 'border-amber-400/60 bg-amber-500/15 text-amber-200'
                  : isLive
                    ? 'border-sky-400/50 bg-sky-500/15 text-sky-100'
                    : 'border-white/15 bg-white/5 text-slate-200 hover:bg-white/10'
              }`}
            >
              {isLive && isMicMuted ? (
                <MicOff className="h-3.5 w-3.5" />
              ) : (
                <Mic className="h-3.5 w-3.5" />
              )}
              <span>{isLive && isMicMuted ? 'Muted' : 'Speak'}</span>
            </button>

            {/* Voice Output Toggle (Voice ON / Voice OFF) */}
            <button
              type="button"
              role="switch"
              aria-checked={voiceOutputEnabled}
              onClick={toggleVoiceOutput}
              data-testid="voice-output-toggle"
              title={
                voiceOutputEnabled
                  ? 'Voice ON — Cosmic speaks replies aloud'
                  : 'Voice OFF — Text-only replies'
              }
              className={`flex h-9 items-center gap-1.5 rounded-xl border px-2.5 text-xs font-medium whitespace-nowrap transition-colors ${
                voiceOutputEnabled
                  ? isBadmash
                    ? 'border-rose-400/55 bg-rose-500/18 text-rose-100'
                    : 'border-cyan-400/55 bg-cyan-500/18 text-cyan-100'
                  : 'border-white/15 bg-white/5 text-slate-400 hover:text-slate-200'
              }`}
            >
              {voiceOutputEnabled ? (
                <Volume2 className="h-3.5 w-3.5" />
              ) : (
                <VolumeX className="h-3.5 w-3.5" />
              )}
              <span>{voiceOutputEnabled ? 'Voice ON' : 'Voice OFF'}</span>
            </button>

            {/* 12-Bar Audio Waveform */}
            <VoiceWaveform mode={mode} cosmicState={cosmicState} audioLevelRef={audioLevelRef} />

            {/* Normal Mode / Badmash Mode Switch */}
            <button
              type="button"
              role="switch"
              aria-checked={isBadmash}
              aria-label={isBadmash ? 'Switch to Normal Mode' : 'Switch to Badmash Mode'}
              onClick={toggleBadmashMode}
              data-testid="badmash-mode-toggle"
              className={`flex h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold tracking-wide whitespace-nowrap transition-all ${
                isBadmash
                  ? 'border-rose-500/80 bg-gradient-to-r from-rose-700/35 to-violet-700/35 text-rose-100 shadow-[0_0_18px_rgba(244,63,94,0.4)]'
                  : 'border-sky-400/45 bg-sky-950/60 text-sky-100 hover:border-sky-300'
              }`}
            >
              {isBadmash ? (
                <>
                  <Flame className="h-3.5 w-3.5 text-rose-400" />
                  <span>BADMASH MODE</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5 text-sky-400" />
                  <span>NORMAL MODE</span>
                </>
              )}
            </button>
          </div>
        </footer>
      </div>

      {/* Unified Text & Voice Conversation History Modal */}
      <HistoryModal
        open={historyModalOpen}
        conversations={unifiedConversations}
        activeConversationId={activeConversationId}
        onClose={() => setHistoryModalOpen(false)}
        onSelectConversation={openHistoryConversation}
        onStartNewConversation={startNewConversation}
        onDeleteConversation={deleteHistoryConversation}
        onClearAllHistory={clearRecentSessions}
      />

      {/* Privacy Policy Modal */}
      <PrivacyPolicyModal open={privacyModalOpen} onClose={() => setPrivacyModalOpen(false)} />

      {/* Protected Developer / Admin Interface (7-tap COSMIC AI or Ctrl+Shift+D) */}
      <AdminAccessModal
        open={adminDrawerRequested && !isAdminAuthenticated}
        onClose={() => setAdminDrawerRequested(false)}
        onVerify={verifyAdminAccess}
      />

      {isAdminAuthenticated && (
        <SettingsFeaturesModal
          open={adminDrawerRequested}
          onClose={() => {
            setAdminDrawerRequested(false);
            logoutAdmin();
          }}
          mode={mode}
          cosmicState={cosmicState}
          features={features}
          diagnostics={diagnostics}
          speakerTestResult={speakerTestResult}
          liveKnowledge={liveKnowledge}
          unityAdsSnapshot={unityAdsSnapshot}
          lastAdRuleEvent={lastAdRuleEvent}
          adElapsedActiveMs={adElapsedActiveMs}
          sessionDurationMs={sessionDurationMs}
          sessionDurationState={sessionDurationState}
          bridgeRuntime={bridgeRuntime}
          backendUrl={backendUrl}
          transcripts={transcripts}
          recentSessions={recentSessions}
          actionLogs={actionLogs}
          diagnosticLogs={diagnosticLogs}
          onUpdateFeatures={updateFeatures}
          onSearchKnowledge={runLiveKnowledgeSearch}
          onTestSpeaker={testSpeaker}
          onRunSafeAction={runManualSafeAction}
          onUpdateBackendUrl={updateBackendUrl}
          onClearRecentSessions={clearRecentSessions}
          onReloadRewardedAd={reloadRewardedAd}
        />
      )}
    </div>
  );
}
