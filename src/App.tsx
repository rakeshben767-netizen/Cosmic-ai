import { useEffect, useRef, useState } from 'react';
import {
  Check,
  ExternalLink,
  Flame,
  Globe,
  MessageSquare,
  Mic,
  MicOff,
  Power,
  RotateCcw,
  Send,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import { AdminAccessModal } from './components/AdminAccessModal.tsx';
import { CosmicKnightCanvas } from './components/CosmicKnightCanvas.tsx';
import { PrivacyPolicyModal } from './components/PrivacyPolicyModal.tsx';
import { SettingsFeaturesModal } from './components/SettingsFeaturesModal.tsx';
import { VoiceWaveform } from './components/VoiceWaveform.tsx';
import { useCosmicLive } from './hooks/useCosmicLive.ts';

export default function App() {
  const {
    mode,
    cosmicState,
    isMicMuted,
    isDeveloperVerified,
    isAdminAuthenticated,
    features,
    pendingWhatsAppDraft,
    errorMessage,
    micNotice,
    backendUrl,
    transcripts,
    recentSessions,
    actionLogs,
    diagnosticLogs,
    diagnostics,
    speakerTestResult,
    liveKnowledge,
    bridgeRuntime,
    audioLevelRef,
    togglePower,
    toggleMicMute,
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
    clearError,
    clearMicNotice,
  } = useCosmicLive();

  const [resetViewSignal, setResetViewSignal] = useState(0);
  const [privacyModalOpen, setPrivacyModalOpen] = useState(false);
  const [adminDrawerRequested, setAdminDrawerRequested] = useState(false);
  const [textDraft, setTextDraft] = useState('');

  const brandTapTimesRef = useRef<number[]>([]);

  const isBadmash = mode === 'badmash';
  const isLive =
    cosmicState === 'CONNECTING' ||
    cosmicState === 'RECONNECTING' ||
    cosmicState === 'LISTENING' ||
    cosmicState === 'SPEAKING';

  useEffect(() => {
    document.body.dataset.cosmicState = cosmicState;
    document.body.dataset.cosmicMode = mode;
  }, [cosmicState, mode]);

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

  const handleSendText = (e: React.FormEvent) => {
    e.preventDefault();
    if (!textDraft.trim()) return;
    const msg = textDraft;
    setTextDraft('');
    void sendTextMessage(msg);
  };

  const latestTranscript = transcripts[transcripts.length - 1] || null;
  const showTextFallback = isLive && (isMicMuted || !diagnostics.micActive || Boolean(micNotice));

  const stateColorClass =
    cosmicState === 'ERROR'
      ? 'text-red-400'
      : cosmicState === 'RECONNECTING' || cosmicState === 'CONNECTING'
        ? 'text-amber-300'
        : cosmicState === 'SPEAKING'
          ? isBadmash
            ? 'text-fuchsia-300'
            : 'text-sky-300'
          : cosmicState === 'LISTENING'
            ? isBadmash
              ? 'text-purple-300'
              : 'text-sky-400'
            : 'text-slate-400';

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#0c1220] text-slate-100 select-none">
      {/* Full-Viewport 3D Knight Scene */}
      <CosmicKnightCanvas
        mode={mode}
        cosmicState={cosmicState}
        audioLevelRef={audioLevelRef}
        resetViewSignal={resetViewSignal}
      />

      {/* Minimalist Top Bar */}
      <header className="pointer-events-none fixed top-0 inset-x-0 z-20 flex items-center justify-between px-4 py-3 sm:px-6">
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

        <div className="pointer-events-auto flex items-center gap-2">
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
      </header>

      {/* Compact Floating Overlays Just Above Bottom Dock */}
      <div className="pointer-events-none fixed inset-x-0 bottom-24 z-20 mx-auto flex w-[min(92vw,540px)] flex-col items-center gap-2 sm:bottom-24">
        {cosmicState === 'RECONNECTING' && (
          <div
            role="status"
            data-testid="reconnecting-banner"
            className="pointer-events-auto w-full rounded-xl border border-amber-400/45 bg-[#1b1409]/95 px-3 py-2 text-xs text-amber-100 shadow-lg"
          >
            Reconnecting voice session automatically (attempt {diagnostics.retryCount}/5)...
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

        {showTextFallback && (
          <form
            onSubmit={handleSendText}
            className="pointer-events-auto flex w-full max-w-md items-center gap-2 rounded-xl border border-white/15 bg-[#0e1422]/95 px-3 py-1.5 shadow-xl"
          >
            <input
              type="text"
              value={textDraft}
              onChange={(e) => setTextDraft(e.target.value)}
              placeholder={
                micNotice
                  ? 'Mic blocked — type here to hear Cosmic speak...'
                  : 'Type here to talk with Cosmic AI...'
              }
              aria-label="Type message to Cosmic AI"
              className="min-w-0 flex-1 bg-transparent py-1 text-xs text-white placeholder:text-slate-400 focus:outline-none"
            />
            <button
              type="submit"
              className="flex items-center gap-1 rounded-lg border border-sky-400/45 bg-sky-500/20 px-2.5 py-1 text-xs font-semibold text-sky-100 hover:bg-sky-500/35"
            >
              <Send className="h-3 w-3" />
              <span>Send</span>
            </button>
          </form>
        )}

        {latestTranscript && (
          <div
            data-testid="latest-transcript-pill"
            className="pointer-events-auto max-w-md truncate rounded-xl border border-white/10 bg-[#0d111d]/92 px-3.5 py-1.5 text-xs text-slate-200 shadow-lg"
          >
            <span className={latestTranscript.speaker === 'user' ? 'text-sky-300' : 'text-slate-400'}>
              {latestTranscript.speaker === 'user' ? 'You:' : 'Cosmic:'}
            </span>{' '}
            <span>{latestTranscript.text}</span>
          </div>
        )}
      </div>

      {/* Bottom Floating Control Dock */}
      <footer
        data-testid="cosmic-control-dock"
        className="fixed bottom-4 left-1/2 z-20 w-[min(92vw,345px)] -translate-x-1/2 sm:w-fit sm:max-w-[94vw]"
      >
        <div
          className={`flex flex-wrap items-center justify-center gap-2.5 rounded-2xl border px-3.5 py-2.5 transition-colors sm:px-3 sm:py-2 ${
            isBadmash
              ? 'border-purple-500/45 bg-[#140c22]/92 shadow-[0_0_24px_rgba(168,85,247,0.22)]'
              : 'border-sky-400/30 bg-[#0b101d]/92 shadow-[0_0_24px_rgba(56,189,248,0.16)]'
          }`}
        >
          {/* Power On / Off */}
          <button
            type="button"
            onClick={() => void togglePower()}
            className={`flex h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-medium whitespace-nowrap transition-colors ${
              isLive
                ? 'border-sky-400/60 bg-sky-500/18 text-sky-100'
                : 'border-white/15 bg-white/5 text-slate-200 hover:bg-white/10'
            }`}
          >
            <Power className="h-3.5 w-3.5" />
            <span>{isLive ? 'Power Off' : 'Power On'}</span>
          </button>

          {/* Speak / Muted */}
          <button
            type="button"
            onClick={() => void toggleMicMute()}
            className={`flex h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-medium whitespace-nowrap transition-colors ${
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
            className={`flex h-9 items-center gap-1.5 rounded-xl border px-3.5 text-xs font-semibold tracking-wide whitespace-nowrap transition-all ${
              isBadmash
                ? 'border-purple-500/80 bg-purple-700/30 text-purple-100 shadow-[0_0_18px_rgba(168,85,247,0.45)]'
                : 'border-sky-400/45 bg-sky-950/60 text-sky-100 hover:border-sky-300'
            }`}
          >
            {isBadmash ? (
              <>
                <Flame className="h-3.5 w-3.5 text-purple-300" />
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
        />
      )}
    </div>
  );
}
