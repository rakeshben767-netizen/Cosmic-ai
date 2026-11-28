import { useEffect, useRef, useState } from 'react';
import {
  AudioLines,
  Check,
  Flame,
  Loader2,
  MessageSquare,
  Mic,
  MicOff,
  MoreVertical,
  Send,
  ShieldCheck,
  Sparkles,
  SquarePen,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { AdminAccessModal } from './components/AdminAccessModal.tsx';
import { ChatThread } from './components/ChatThread.tsx';
import { HistoryModal } from './components/HistoryModal.tsx';
import { PrivacyPolicyModal } from './components/PrivacyPolicyModal.tsx';
import { SettingsFeaturesModal } from './components/SettingsFeaturesModal.tsx';
import { VoiceChamber } from './components/VoiceChamber.tsx';
import { useCosmicLive } from './hooks/useCosmicLive.ts';
import { classifyLatency } from './utils/latency.ts';
import { detectResponseMood, MOOD_VISUAL_PROFILES } from './utils/responseMood.ts';

interface SpeechRecognitionAlternativeLike {
  transcript?: string;
}

interface SpeechRecognitionResultLike {
  0?: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike {
  results?: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionInstanceLike {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionInstanceLike;

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
    speakMessageAloud,
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

  const [surfaceView, setSurfaceView] = useState<'chat' | 'voice'>('chat');
  const [resetViewSignal, setResetViewSignal] = useState(0);
  const [privacyModalOpen, setPrivacyModalOpen] = useState(false);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [adminDrawerRequested, setAdminDrawerRequested] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [isDictating, setIsDictating] = useState(false);
  const [dictationNotice, setDictationNotice] = useState<string | null>(null);
  const [textDraft, setTextDraft] = useState('');

  const brandTapTimesRef = useRef<number[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstanceLike | null>(null);

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
    document.body.dataset.cosmicSurface = surfaceView;
  }, [cosmicState, mode, moodProfile.mood, surfaceView]);

  // Auto-resize multiline textarea up to 4 lines
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 96)}px`;
  }, [textDraft]);

  // Cleanup active dictation on unmount
  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.stop();
      } catch {
        // ignore
      }
    };
  }, []);

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
    setDictationNotice(null);
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

  const handleToggleDictation = () => {
    setDictationNotice(null);
    if (isDictating) {
      try {
        recognitionRef.current?.stop();
      } catch {
        // ignore
      }
      setIsDictating(false);
      return;
    }

    const win = window as unknown as {
      SpeechRecognition?: SpeechRecognitionCtor;
      webkitSpeechRecognition?: SpeechRecognitionCtor;
    };
    const Recognition = win.SpeechRecognition || win.webkitSpeechRecognition;

    if (!Recognition) {
      setDictationNotice('Voice typing not supported here — tap the Voice Wave button for live Cosmic voice!');
      return;
    }

    try {
      const rec = new Recognition();
      rec.lang = 'hi-IN';
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      rec.onresult = (ev) => {
        const spoken = ev.results?.[0]?.[0]?.transcript?.trim();
        if (spoken) {
          setTextDraft((prev) => (prev ? `${prev.trim()} ${spoken}` : spoken));
          textareaRef.current?.focus();
        }
      };
      rec.onerror = () => {
        setIsDictating(false);
        setDictationNotice('Could not hear speech clearly. Try again or use Cosmic Ball Voice.');
      };
      rec.onend = () => {
        setIsDictating(false);
      };
      recognitionRef.current = rec;
      setIsDictating(true);
      rec.start();
    } catch {
      setIsDictating(false);
      setDictationNotice('Could not start voice typing. Tap the Voice Wave button instead.');
    }
  };

  const handleOpenVoiceMode = () => {
    setMoreMenuOpen(false);
    setSurfaceView('voice');
  };

  const latencyStatus = classifyLatency(diagnostics.backendLatencyMs, isLive);

  return (
    <div className="relative h-[100dvh] w-screen overflow-hidden bg-[#060913] text-slate-100 select-none">
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
        {/* Subtle Cosmic Grid Horizon on Text Chat View */}
        {surfaceView === 'chat' && (
          <div
            className={`absolute inset-0 opacity-30 ${
              isBadmash
                ? 'bg-[radial-gradient(circle_at_50%_15%,rgba(244,63,94,0.16),transparent_55%)]'
                : 'bg-[radial-gradient(circle_at_50%_15%,rgba(56,189,248,0.16),transparent_55%)]'
            }`}
          />
        )}
      </div>

      {/* Main View Switcher: Default Text Chat Page OR 3D Cosmic Ball Voice Chamber */}
      {surfaceView === 'voice' ? (
        <VoiceChamber
          mode={mode}
          cosmicState={cosmicState}
          moodProfile={moodProfile}
          isMicMuted={isMicMuted}
          voiceOutputEnabled={voiceOutputEnabled}
          isDeveloperVerified={isDeveloperVerified}
          pendingPowerOnUnlock={pendingPowerOnUnlock}
          isLive={isLive}
          diagnostics={diagnostics}
          latencyStatus={latencyStatus}
          audioLevelRef={audioLevelRef}
          resetViewSignal={resetViewSignal}
          latestCosmicTranscript={latestCosmicTranscript}
          adSnackbarMessage={adSnackbarMessage}
          powerOnAdNotice={powerOnAdNotice}
          errorMessage={errorMessage}
          micNotice={micNotice}
          pendingWhatsAppDraft={pendingWhatsAppDraft}
          liveKnowledge={liveKnowledge}
          onBackToChat={() => setSurfaceView('chat')}
          onHiddenBrandTap={handleHiddenBrandTap}
          onOpenHistory={() => setHistoryModalOpen(true)}
          onResetCamera={() => setResetViewSignal((n) => n + 1)}
          onTogglePower={() => void togglePower()}
          onToggleMicMute={() => void toggleMicMute()}
          onToggleVoiceOutput={toggleVoiceOutput}
          onToggleBadmashMode={toggleBadmashMode}
          onRetryMicrophone={() => void retryMicrophone()}
          onConfirmWhatsAppDraft={() => void confirmWhatsAppDraft()}
          onDismissWhatsAppDraft={dismissWhatsAppDraft}
          onClearLiveKnowledge={clearLiveKnowledge}
          onClearAdSnackbar={clearAdSnackbar}
          onClearPowerOnAdNotice={clearPowerOnAdNotice}
          onClearError={clearError}
          onClearMicNotice={clearMicNotice}
        />
      ) : (
        <div
          data-testid="cosmic-text-chat-view"
          className="relative z-10 flex h-full w-full flex-col overflow-hidden"
        >
          {/* Futuristic Top Bar (Matches Screenshot Layout: Top-Left History, Center Brand/Mode, Top-Right New Chat + Options) */}
          <header className="shrink-0 border-b border-white/8 bg-[#070b15]/75 px-3 py-2.5 backdrop-blur-md sm:px-5">
            <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-2">
              {/* Top-Left: Chat History Drawer Trigger + Brand */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setHistoryModalOpen(true)}
                  data-testid="history-button"
                  aria-label="Open Chat History"
                  title="Chat History"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/12 bg-white/[0.06] text-slate-100 transition-colors hover:border-sky-400/50 hover:bg-white/10"
                >
                  {/* Clean two-line futuristic drawer icon matching reference screenshot */}
                  <svg
                    viewBox="0 0 24 24"
                    className="h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.1"
                    strokeLinecap="round"
                  >
                    <line x1="5" y1="9" x2="19" y2="9" />
                    <line x1="5" y1="15" x2="14" y2="15" />
                  </svg>
                </button>

                <button
                  type="button"
                  onClick={handleHiddenBrandTap}
                  className="font-display cursor-pointer whitespace-nowrap text-left text-sm font-bold tracking-[0.12em] text-white uppercase sm:text-base"
                >
                  COSMIC AI
                </button>
              </div>

              {/* Center: Interactive Normal / Badmash Segmented Mode Switch */}
              <div
                role="group"
                aria-label="Personality Mode"
                className="flex items-center rounded-xl border border-white/10 bg-[#0c111f]/90 p-0.5"
              >
                <button
                  type="button"
                  onClick={() => {
                    if (isBadmash) toggleBadmashMode();
                  }}
                  data-testid={!isBadmash ? 'badmash-mode-toggle' : 'normal-mode-btn'}
                  className={`flex min-h-[34px] items-center gap-1 rounded-lg px-2.5 text-[11px] font-semibold whitespace-nowrap transition-all sm:px-3 sm:text-xs ${
                    !isBadmash
                      ? 'bg-sky-500/25 text-sky-100 shadow-[0_0_12px_rgba(56,189,248,0.28)]'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Sparkles className="h-3.5 w-3.5 text-sky-400" />
                  <span>Normal</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (!isBadmash) toggleBadmashMode();
                  }}
                  data-testid={isBadmash ? 'badmash-mode-toggle' : 'badmash-mode-btn'}
                  className={`flex min-h-[34px] items-center gap-1 rounded-lg px-2.5 text-[11px] font-semibold whitespace-nowrap transition-all sm:px-3 sm:text-xs ${
                    isBadmash
                      ? 'bg-gradient-to-r from-rose-600/40 to-violet-600/40 text-rose-100 shadow-[0_0_14px_rgba(244,63,94,0.3)]'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Flame className="h-3.5 w-3.5 text-rose-400" />
                  <span>Badmash</span>
                </button>
              </div>

              {/* Top-Right: Ping Dot + New Chat + Options */}
              <div className="relative flex items-center gap-1.5">
                <div
                  data-testid="latency-indicator"
                  aria-label={`Network Ping ${latencyStatus.label} (${latencyStatus.meaning})`}
                  title="Network Ping: Green = Best Net (<150ms), Yellow = Medium (150-350ms), Red = Low (>350ms)"
                  className="hidden items-center gap-1.5 rounded-lg border border-white/10 bg-[#0d1220]/80 px-2 py-1.5 font-mono text-[11px] tabular-nums sm:flex"
                >
                  <span className={`h-2 w-2 shrink-0 rounded-full ${latencyStatus.dotClass}`} />
                  <span className={latencyStatus.textClass}>{latencyStatus.label}</span>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    startNewConversation();
                    setMoreMenuOpen(false);
                  }}
                  data-testid="new-chat-button"
                  aria-label="New Chat"
                  title="Start New Chat"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/12 bg-white/[0.06] text-slate-100 transition-colors hover:border-sky-400/50 hover:bg-white/10"
                >
                  <SquarePen className="h-4 w-4" />
                </button>

                <button
                  type="button"
                  onClick={() => setMoreMenuOpen((prev) => !prev)}
                  data-testid="chat-more-options-button"
                  aria-label="More options"
                  title="More Options"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/12 bg-white/[0.06] text-slate-200 transition-colors hover:border-white/25 hover:text-white"
                >
                  <MoreVertical className="h-4 w-4" />
                </button>

                {moreMenuOpen && (
                  <div
                    role="menu"
                    className="absolute top-12 right-0 z-40 w-56 rounded-2xl border border-white/15 bg-[#0b101e]/98 p-1.5 shadow-2xl backdrop-blur-lg"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        toggleVoiceOutput();
                        setMoreMenuOpen(false);
                      }}
                      data-testid="voice-output-toggle"
                      className="flex min-h-[40px] w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-medium text-slate-200 hover:bg-white/10"
                    >
                      <span className="flex items-center gap-2">
                        {voiceOutputEnabled ? (
                          <Volume2 className="h-4 w-4 text-cyan-400" />
                        ) : (
                          <VolumeX className="h-4 w-4 text-slate-400" />
                        )}
                        <span>{voiceOutputEnabled ? 'Auto Voice: ON' : 'Auto Voice: OFF'}</span>
                      </span>
                      <span className="font-mono text-[10px] text-slate-400">
                        {voiceOutputEnabled ? 'Speak' : 'Muted'}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={handleOpenVoiceMode}
                      className="flex min-h-[40px] w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-slate-200 hover:bg-white/10"
                    >
                      <AudioLines className="h-4 w-4 text-sky-400" />
                      <span>Cosmic Ball Voice Mode</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setPrivacyModalOpen(true);
                        setMoreMenuOpen(false);
                      }}
                      data-testid="privacy-policy-button"
                      className="flex min-h-[40px] w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-slate-200 hover:bg-white/10"
                    >
                      <ShieldCheck className="h-4 w-4 text-sky-400" />
                      <span>Privacy Policy</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Subtle Network Notice Banner (only highlighted strongly if network is weak/offline) */}
            {(diagnostics.networkStatus === 'offline' || latencyStatus.tier === 'high' || latencyStatus.tier === 'moderate') && (
              <div className="mx-auto mt-1.5 flex w-full max-w-4xl justify-center">
                <div
                  data-testid="network-quality-banner"
                  className={`rounded-lg border px-2.5 py-0.5 text-center text-[10px] leading-snug ${
                    diagnostics.networkStatus === 'offline' || latencyStatus.tier === 'high'
                      ? 'border-red-500/45 bg-[#1a0d12]/85 font-medium text-red-300'
                      : 'border-yellow-400/35 bg-[#19160a]/80 text-yellow-200'
                  }`}
                >
                  {diagnostics.networkStatus === 'offline' || latencyStatus.tier === 'high'
                    ? 'Weak network detected — Cosmic AI will not work properly without a good connection.'
                    : 'If your network is not good, Cosmic AI will not work properly. (Green: Best · Yellow: Medium · Red: Low)'}
                </div>
              </div>
            )}

            {/* Active Live Voice Mini-Bar when user navigates to Text Chat during active voice session */}
            {isLive && (
              <div className="mx-auto mt-2 flex w-full max-w-3xl items-center justify-between gap-2 rounded-xl border border-sky-400/35 bg-sky-500/12 px-3 py-1.5 text-xs">
                <span className="flex items-center gap-2 font-medium text-sky-100">
                  <AudioLines className="h-3.5 w-3.5 animate-pulse text-cyan-300" />
                  <span>Voice session live ({cosmicState})</span>
                </span>
                <button
                  type="button"
                  onClick={handleOpenVoiceMode}
                  className="rounded-lg border border-sky-400/45 bg-sky-500/20 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-sky-500/30"
                >
                  Open Cosmic Ball
                </button>
              </div>
            )}
          </header>

          {/* Full-Height Scrollable Futuristic Chat Canvas */}
          <ChatThread
            messages={transcripts}
            mode={mode}
            isResponding={isChatResponding}
            liveKnowledge={liveKnowledge}
            onClearLiveKnowledge={clearLiveKnowledge}
            onQuickPrompt={(prompt) => void sendTextMessage(prompt)}
            onSpeakMessage={(text, msgMode) => void speakMessageAloud(text, msgMode)}
            onRetryPrompt={(prompt) => void sendTextMessage(prompt)}
          />

          {/* Bottom Notices + Futuristic Composer Dock */}
          <div className="shrink-0 bg-gradient-to-t from-[#050811] via-[#060a15]/95 to-transparent px-3 pt-1 pb-3 sm:px-6 sm:pb-4">
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-2">
              {errorMessage && (
                <div
                  role="alert"
                  className="flex items-center justify-between gap-2 rounded-xl border border-red-500/40 bg-[#1a0d12]/95 px-3 py-2 text-xs text-red-200 shadow-lg"
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

              {dictationNotice && (
                <div
                  role="status"
                  className="flex items-center justify-between gap-2 rounded-xl border border-sky-400/35 bg-[#0b1426]/95 px-3 py-2 text-xs text-sky-100"
                >
                  <span>{dictationNotice}</span>
                  <button
                    type="button"
                    onClick={() => setDictationNotice(null)}
                    className="shrink-0 font-semibold text-sky-300 hover:text-white"
                  >
                    OK
                  </button>
                </div>
              )}

              {pendingWhatsAppDraft && (
                <div
                  role="status"
                  data-testid="whatsapp-draft-confirmation"
                  className="w-full rounded-xl border border-emerald-400/40 bg-[#0b1813]/95 px-3 py-2 text-xs shadow-xl"
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

              {/* Clean Futuristic Composer Bar: [Input] [Mic] [Voice Wave / Send when typing] */}
              <form
                onSubmit={handleSendText}
                data-testid="text-chat-form"
                className={`flex w-full items-end gap-1.5 rounded-3xl border px-3.5 py-1.5 backdrop-blur-xl transition-colors sm:gap-2 sm:px-4 sm:py-2 ${
                  isBadmash
                    ? 'border-rose-500/40 bg-[#140919]/92 shadow-[0_0_28px_rgba(244,63,94,0.18)]'
                    : 'border-sky-400/35 bg-[#0b1222]/92 shadow-[0_0_28px_rgba(56,189,248,0.16)]'
                }`}
              >
                {/* Multiline Text Input */}
                <textarea
                  ref={textareaRef}
                  rows={1}
                  enterKeyHint="send"
                  value={textDraft}
                  onChange={(e) => setTextDraft(e.target.value)}
                  onKeyDown={handleTextareaKeyDown}
                  placeholder={isBadmash ? 'Abe, bol kya chahiye...' : 'Message Cosmic...'}
                  aria-label="Message Cosmic"
                  data-testid="text-chat-input"
                  className="max-h-24 min-h-[26px] min-w-0 flex-1 resize-none bg-transparent py-2 text-[13.5px] leading-snug text-white placeholder:text-slate-400 focus:outline-none sm:text-sm"
                />

                {/* Inline Voice Dictation Mic Button */}
                <button
                  type="button"
                  onClick={handleToggleDictation}
                  aria-label={isDictating ? 'Stop voice typing' : 'Voice dictate message'}
                  title={isDictating ? 'Listening...' : 'Voice dictation'}
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors ${
                    isDictating
                      ? 'animate-pulse bg-rose-500/25 text-rose-300 ring-1 ring-rose-400/60'
                      : 'text-slate-300 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  {isDictating ? <MicOff className="h-4.5 w-4.5" /> : <Mic className="h-4.5 w-4.5" />}
                </button>

                {/* Send Button when user has typed or AI is responding; otherwise Cosmic Ball Voice Wave Button */}
                {textDraft.trim().length > 0 || isChatResponding ? (
                  <button
                    type="submit"
                    disabled={!textDraft.trim() || isChatResponding}
                    data-testid="text-chat-send"
                    aria-label="Send message"
                    title="Send message"
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border text-white shadow-lg transition-transform hover:scale-105 active:scale-95 disabled:opacity-60 ${
                      isBadmash
                        ? 'border-rose-300/70 bg-gradient-to-br from-rose-500 via-fuchsia-600 to-violet-700 shadow-[0_0_20px_rgba(244,63,94,0.45)]'
                        : 'border-cyan-200/70 bg-gradient-to-br from-sky-500 via-blue-600 to-indigo-700 shadow-[0_0_20px_rgba(37,99,235,0.48)]'
                    }`}
                  >
                    {isChatResponding ? (
                      <Loader2 className="h-4.5 w-4.5 animate-spin" />
                    ) : (
                      <Send className="h-4.5 w-4.5" />
                    )}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleOpenVoiceMode}
                    data-testid="open-voice-mode-button"
                    aria-label="Open Cosmic Ball Live Voice"
                    title="Open Cosmic Ball Live Voice"
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border text-white shadow-lg transition-transform hover:scale-105 active:scale-95 ${
                      isBadmash
                        ? 'border-rose-300/70 bg-gradient-to-br from-rose-500 via-fuchsia-600 to-violet-700 shadow-[0_0_20px_rgba(244,63,94,0.45)]'
                        : 'border-cyan-200/70 bg-gradient-to-br from-sky-500 via-blue-600 to-indigo-700 shadow-[0_0_20px_rgba(37,99,235,0.48)]'
                    }`}
                  >
                    <AudioLines className="h-5 w-5" />
                  </button>
                )}
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Unified Text & Voice Conversation History Slide-Out Drawer */}
      <HistoryModal
        open={historyModalOpen}
        conversations={unifiedConversations}
        activeConversationId={activeConversationId}
        onClose={() => setHistoryModalOpen(false)}
        onSelectConversation={(convId) => {
          openHistoryConversation(convId);
          setSurfaceView('chat');
        }}
        onStartNewConversation={() => {
          startNewConversation();
          setSurfaceView('chat');
        }}
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
