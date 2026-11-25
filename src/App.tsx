import { useEffect, useState } from 'react';
import {
  Flame,
  Mic,
  MicOff,
  Power,
  RotateCcw,
  Send,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { CosmicKnightCanvas } from './components/CosmicKnightCanvas.tsx';
import { PrivacyPolicyModal } from './components/PrivacyPolicyModal.tsx';
import { VoiceWaveform } from './components/VoiceWaveform.tsx';
import { useCosmicLive } from './hooks/useCosmicLive.ts';

export default function App() {
  const {
    mode,
    cosmicState,
    isMicMuted,
    isDeveloperVerified,
    errorMessage,
    micNotice,
    transcripts,
    diagnostics,
    audioLevelRef,
    togglePower,
    toggleMicMute,
    toggleBadmashMode,
    retryMicrophone,
    sendTextMessage,
    clearError,
    clearMicNotice,
  } = useCosmicLive();

  const [cameraResetTick, setCameraResetTick] = useState(0);
  const [fallbackDraft, setFallbackDraft] = useState('');
  const [privacyModalOpen, setPrivacyModalOpen] = useState(false);

  const isBadmash = mode === 'badmash';
  const isLive =
    cosmicState === 'CONNECTING' || cosmicState === 'LISTENING' || cosmicState === 'SPEAKING';

  useEffect(() => {
    document.body.dataset.cosmicState = cosmicState;
    document.body.dataset.cosmicMode = mode;
  }, [cosmicState, mode]);

  const latestTranscript = transcripts[transcripts.length - 1];

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#10131d] text-slate-100 select-none">
      {/* Full-Viewport 3D Character Stage */}
      <main className="absolute inset-0">
        <CosmicKnightCanvas
          mode={mode}
          cosmicState={cosmicState}
          audioLevelRef={audioLevelRef}
          cameraResetTick={cameraResetTick}
        />
      </main>

      {/* Top 3-Zone Header Bar (Respects Android WindowInsets cleanly) */}
      <header className="pointer-events-none fixed inset-x-0 top-0 z-20 flex items-center justify-between gap-2 px-3.5 py-3 sm:px-6">
        <div className="pointer-events-auto flex items-center gap-2">
          <span className="font-display text-base font-bold tracking-wider text-white whitespace-nowrap shrink-0 sm:text-xl">
            COSMIC AI
          </span>
        </div>

        {/* Clean Unboxed Status & Character Metadata */}
        <div
          className="hidden items-center gap-2.5 text-xs font-medium text-slate-300 md:flex"
          data-testid="cosmic-status-strip"
        >
          <span
            className={`font-mono font-semibold tracking-wider ${
              cosmicState === 'ERROR'
                ? 'text-red-400'
                : cosmicState === 'SPEAKING'
                  ? isBadmash
                    ? 'text-fuchsia-300'
                    : 'text-sky-300'
                  : cosmicState === 'LISTENING'
                    ? isBadmash
                      ? 'text-purple-300'
                      : 'text-sky-400'
                    : 'text-slate-300'
            }`}
          >
            {cosmicState}
          </span>
          <span aria-hidden="true" className="text-slate-600">
            ·
          </span>
          <span className="text-slate-200">
            {isBadmash ? 'Purple Knight · Badmash Mode' : 'Blue Knight · Normal Mode'}
          </span>
          <span aria-hidden="true" className="text-slate-600">
            ·
          </span>
          <span className="font-mono text-slate-400">
            {isBadmash ? 'Charon (Kadak)' : 'Voice (Zephyr)'}
          </span>
          {isDeveloperVerified && (
            <>
              <span aria-hidden="true" className="text-slate-600">
                ·
              </span>
              <span className="font-mono text-emerald-300" data-testid="respect-mode-label">
                Respect Mode
              </span>
            </>
          )}
        </div>

        <div className="pointer-events-auto flex items-center gap-1.5 shrink-0 sm:gap-2">
          {/* Privacy Policy */}
          <button
            type="button"
            onClick={() => setPrivacyModalOpen(true)}
            data-testid="privacy-policy-button"
            aria-label="Privacy Policy"
            title="Privacy Policy"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/12 bg-[#0d101b]/90 text-slate-300 transition-colors hover:border-white/25 hover:text-white sm:h-10 sm:w-10"
          >
            <ShieldCheck className="h-4 w-4 text-sky-400" />
          </button>

          {/* Reset 3D Camera */}
          <button
            type="button"
            onClick={() => setCameraResetTick((t) => t + 1)}
            aria-label="Reset 3D camera view"
            title="Reset 3D view"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/12 bg-[#0d101b]/90 text-slate-300 transition-colors hover:border-white/25 hover:text-white sm:h-10 sm:w-10"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
        </div>
      </header>

      <PrivacyPolicyModal open={privacyModalOpen} onClose={() => setPrivacyModalOpen(false)} />

      {/* Unified Bottom Stack: Alerts, Mic Fallback & Caption sit cleanly ABOVE Dock with zero overlap */}
      <div className="pointer-events-none fixed inset-x-0 bottom-3 z-20 flex flex-col items-center gap-2.5 px-3">
        {errorMessage && (
          <div
            role="alert"
            className="pointer-events-auto flex w-full max-w-lg items-center justify-between gap-3 rounded-lg border border-red-500/40 bg-[#1a0d12]/95 px-3.5 py-2 text-xs text-red-200 shadow-lg"
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
            className="pointer-events-auto flex w-full max-w-xl flex-wrap items-center justify-between gap-2.5 rounded-lg border border-amber-400/40 bg-[#18130c]/95 px-3.5 py-2 text-xs text-amber-100 shadow-lg"
          >
            <span className="min-w-[180px] flex-1">{micNotice}</span>
            <div className="flex items-center gap-2 shrink-0">
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
                className="font-medium text-amber-300 hover:text-white"
              >
                Hide
              </button>
            </div>
          </div>
        )}

        {isLive && !diagnostics.micActive && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!fallbackDraft.trim()) return;
              void sendTextMessage(fallbackDraft);
              setFallbackDraft('');
            }}
            className="pointer-events-auto flex w-full max-w-md items-center gap-2 rounded-xl border border-white/15 bg-[#0d101b]/95 px-2.5 py-1.5 shadow-lg"
            data-testid="mic-fallback-form"
          >
            <input
              type="text"
              value={fallbackDraft}
              onChange={(e) => setFallbackDraft(e.target.value)}
              placeholder="Mic blocked — type here to hear Cosmic speak..."
              aria-label="Send message to Cosmic AI voice"
              className="min-w-0 flex-1 bg-transparent px-1.5 text-xs text-slate-100 placeholder:text-slate-400 focus:outline-none"
            />
            <button
              type="submit"
              aria-label="Send prompt to Cosmic AI"
              className="flex h-8 items-center gap-1 rounded-lg border border-sky-400/40 bg-sky-500/20 px-2.5 text-xs font-semibold text-sky-100 hover:bg-sky-500/30"
            >
              <Send className="h-3.5 w-3.5" />
              <span>Send</span>
            </button>
          </form>
        )}

        {latestTranscript && (
          <div
            className="max-w-xl rounded-lg border border-white/10 bg-[#0d101b]/90 px-3.5 py-2 text-center text-xs text-slate-200 shadow-lg"
            data-testid="live-caption"
          >
            <span className="mr-2 font-semibold text-slate-400">
              {latestTranscript.speaker === 'user' ? 'You:' : 'Cosmic:'}
            </span>
            <span>{latestTranscript.text}</span>
          </div>
        )}

        {/* Bottom Voice-First Control Dock */}
        <div
          className={`pointer-events-auto flex flex-wrap items-center justify-center gap-2 rounded-2xl border px-3 py-2.5 shadow-2xl transition-colors duration-200 sm:flex-nowrap sm:gap-3 sm:px-4 ${
            isBadmash
              ? 'border-purple-400/45 bg-[#150d22]/95 shadow-[0_0_28px_rgba(168,85,247,0.3)]'
              : 'border-sky-400/30 bg-[#0d111d]/95 shadow-[0_0_24px_rgba(14,165,233,0.18)]'
          }`}
          data-testid="cosmic-control-dock"
        >
          {/* Power Button (Connect / Disconnect Gemini Live) */}
          <button
            type="button"
            onClick={() => void togglePower()}
            aria-label={isLive ? 'Power off Cosmic AI' : 'Power on Cosmic AI'}
            className={`flex min-h-11 items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-semibold whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-sky-400 ${
              isLive
                ? isBadmash
                  ? 'border-purple-400/60 bg-purple-600/25 text-purple-100 hover:bg-purple-600/35'
                  : 'border-sky-400/60 bg-sky-500/20 text-sky-100 hover:bg-sky-500/30'
                : 'border-white/15 bg-white/8 text-slate-100 hover:bg-white/15'
            }`}
          >
            <Power className="h-4 w-4" />
            <span>
              {cosmicState === 'CONNECTING'
                ? 'Connecting...'
                : isLive
                  ? 'Power Off'
                  : 'Power On'}
            </span>
          </button>

          {/* Primary Microphone Button */}
          <button
            type="button"
            onClick={() => void toggleMicMute()}
            aria-label={
              !isLive
                ? 'Start voice conversation'
                : isMicMuted
                  ? 'Unmute microphone'
                  : 'Mute microphone'
            }
            className={`flex min-h-11 items-center gap-2 rounded-xl border px-4 py-2 text-xs font-semibold whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-sky-400 ${
              isLive && !isMicMuted
                ? isBadmash
                  ? 'border-purple-400/70 bg-purple-600/30 text-white shadow-[0_0_16px_rgba(168,85,247,0.45)]'
                  : 'border-sky-400/70 bg-sky-500/30 text-white shadow-[0_0_16px_rgba(56,189,248,0.45)]'
                : isMicMuted
                  ? 'border-amber-400/50 bg-amber-500/15 text-amber-200 hover:bg-amber-500/25'
                  : 'border-white/15 bg-white/8 text-slate-200 hover:bg-white/15'
            }`}
          >
            {isMicMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            <span>{!isLive ? 'Speak' : isMicMuted ? 'Muted' : 'Listening'}</span>
          </button>

          {/* Live Voice Waveform */}
          <VoiceWaveform mode={mode} cosmicState={cosmicState} audioLevelRef={audioLevelRef} />

          {/* NORMAL MODE / BADMASH MODE Toggle */}
          <button
            type="button"
            role="switch"
            aria-checked={isBadmash}
            aria-label={isBadmash ? 'Switch to Normal Mode' : 'Switch to Badmash Mode'}
            onClick={() => toggleBadmashMode()}
            data-testid="badmash-mode-toggle"
            className={`flex min-h-11 items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-bold tracking-wide whitespace-nowrap transition-all duration-200 focus-visible:outline-2 focus-visible:outline-purple-400 ${
              isBadmash
                ? 'border-purple-400/80 bg-gradient-to-r from-purple-700/45 to-fuchsia-600/35 text-purple-100 shadow-[0_0_20px_rgba(168,85,247,0.45)]'
                : 'border-sky-400/30 bg-[#13192a] text-sky-200 hover:border-sky-400/50 hover:bg-[#192238]'
            }`}
          >
            {isBadmash ? (
              <>
                <Flame className="h-4 w-4 text-purple-300" />
                <span>BADMASH MODE</span>
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 text-sky-400" />
                <span>NORMAL MODE</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
