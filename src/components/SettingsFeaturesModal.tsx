import { useState } from 'react';
import {
  Activity,
  ExternalLink,
  Gauge,
  Globe,
  Mic,
  RotateCcw,
  Search,
  Settings2,
  Sliders,
  Sparkles,
  X,
} from 'lucide-react';
import type {
  ActionLogEntry,
  AudioDiagnosticsSnapshot,
  ConversationSessionRecord,
  CosmicFeaturesConfig,
  CosmicMode,
  CosmicState,
  DiagnosticLogEntry,
  LiveKnowledgeSearchResult,
  RapBattleStyle,
  RewardedAdRuleEvent,
  TranscriptEntry,
  UnityAdsSnapshot,
} from '../types/cosmic.ts';
import {
  clampSpeechRate,
  DEFAULT_SPEECH_RATE,
  MAX_SPEECH_RATE,
  MIN_SPEECH_RATE,
} from '../utils/pcmAudio.ts';
import { DiagnosticsDrawer } from './DiagnosticsDrawer.tsx';

interface SettingsFeaturesModalProps {
  open: boolean;
  onClose: () => void;
  mode: CosmicMode;
  cosmicState: CosmicState;
  features: CosmicFeaturesConfig;
  diagnostics: AudioDiagnosticsSnapshot;
  speakerTestResult: string | null;
  liveKnowledge: LiveKnowledgeSearchResult | null;
  unityAdsSnapshot: UnityAdsSnapshot | null;
  lastAdRuleEvent: RewardedAdRuleEvent | null;
  adElapsedActiveMs: number;
  bridgeRuntime: { hasNativeBridge: boolean; runtimeLabel: string };
  backendUrl: string;
  transcripts: TranscriptEntry[];
  recentSessions: ConversationSessionRecord[];
  actionLogs: ActionLogEntry[];
  diagnosticLogs: DiagnosticLogEntry[];
  onUpdateFeatures: (patch: Partial<CosmicFeaturesConfig>) => void;
  onSearchKnowledge: (query: string, category: string) => Promise<LiveKnowledgeSearchResult>;
  onTestSpeaker: () => void;
  onRunSafeAction: (name: string, args: Record<string, unknown>) => void;
  onUpdateBackendUrl: (url: string) => boolean;
  onClearRecentSessions?: () => void;
  onReloadRewardedAd?: () => void;
}

const OPTIONAL_FEATURE_ITEMS: Array<{
  key: Exclude<keyof CosmicFeaturesConfig, 'rapBattleStyle' | 'speechRate'>;
  label: string;
  description: string;
}> = [
  {
    key: 'customShayari',
    label: 'Custom Shayari Mode',
    description: 'Original shayari by name, friend, mood, topic, language & rhyme style.',
  },
  {
    key: 'rapBattle',
    label: 'Rap Battle Mode',
    description: 'Voice-first 4–8 bar Mumbai rap battles with context-aware replies.',
  },
  {
    key: 'roastBattle',
    label: 'Roast Battle Mode',
    description: 'Intelligent context-driven Badmash comebacks & witty roasts.',
  },
  {
    key: 'darkComedy',
    label: 'Dark Comedy Mode',
    description: 'Sharp fictional dark humour twists without real harm.',
  },
  {
    key: 'doubleMeaning',
    label: 'Double Meaning Comedy Mode',
    description: 'Cheeky PG-13 Bollywood wordplay when innuendo appears.',
  },
  {
    key: 'memeCommentary',
    label: 'Meme Commentary Mode',
    description: 'Indian, Mumbai, gaming & AI meme context and punchlines.',
  },
  {
    key: 'motivationalTapori',
    label: 'Motivational Tapori Mode',
    description: 'Fearless street encouragement with actionable steps when feeling low.',
  },
  {
    key: 'newsCommentary',
    label: 'News Commentary Mode',
    description: 'Brief witty Cosmic observation added AFTER verified news facts.',
  },
  {
    key: 'customSlang',
    label: 'Custom Slang Mode',
    description: 'Contextual Mumbai Bambaiya & Marathi vocabulary (Apun, Bhidu, Jhakaas).',
  },
];

const RAP_BATTLE_STYLES: Array<{ value: RapBattleStyle; label: string }> = [
  { value: 'friendly', label: 'Friendly' },
  { value: 'comedy', label: 'Comedy' },
  { value: 'tapori', label: 'Tapori' },
  { value: 'attitude', label: 'Attitude' },
  { value: 'freestyle', label: 'Freestyle' },
];

const SEARCH_CATEGORIES = [
  { value: 'breaking', label: 'Breaking' },
  { value: 'india', label: 'India' },
  { value: 'maharashtra-mumbai', label: 'Maharashtra & Mumbai' },
  { value: 'ai', label: 'AI & Tech' },
  { value: 'gaming', label: 'Gaming' },
  { value: 'mobile', label: 'Android & Mobile' },
  { value: 'memes', label: 'Memes & Trends' },
  { value: 'sports', label: 'Sports' },
  { value: 'entertainment', label: 'Movies & Music' },
];

export function SettingsFeaturesModal({
  open,
  onClose,
  mode,
  cosmicState,
  features,
  diagnostics,
  speakerTestResult,
  liveKnowledge,
  unityAdsSnapshot,
  lastAdRuleEvent,
  adElapsedActiveMs,
  bridgeRuntime,
  backendUrl,
  transcripts,
  recentSessions,
  actionLogs,
  diagnosticLogs,
  onUpdateFeatures,
  onSearchKnowledge,
  onTestSpeaker,
  onRunSafeAction,
  onUpdateBackendUrl,
  onClearRecentSessions,
  onReloadRewardedAd,
}: SettingsFeaturesModalProps) {
  const [section, setSection] = useState<'features' | 'knowledge' | 'diagnostics'>('features');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchCategory, setSearchCategory] = useState('india');
  const [searching, setSearching] = useState(false);

  if (!open) return null;

  if (section === 'diagnostics') {
    return (
      <div className="fixed inset-0 z-30 flex items-center justify-end bg-black/45 p-3">
        <div className="fixed top-4 right-4 left-4 z-40 flex items-center justify-between md:left-auto md:w-[420px]">
          <button
            type="button"
            onClick={() => setSection('features')}
            className="rounded-lg border border-white/15 bg-[#0d101b] px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-white/10"
          >
            &larr; Back to Settings &amp; Features
          </button>
        </div>
        <DiagnosticsDrawer
          open={true}
          onClose={onClose}
          mode={mode}
          diagnostics={diagnostics}
          speakerTestResult={speakerTestResult}
          unityAdsSnapshot={unityAdsSnapshot}
          lastAdRuleEvent={lastAdRuleEvent}
          adElapsedActiveMs={adElapsedActiveMs}
          bridgeRuntime={bridgeRuntime}
          backendUrl={backendUrl}
          transcripts={transcripts}
          recentSessions={recentSessions}
          actionLogs={actionLogs}
          diagnosticLogs={diagnosticLogs}
          onTestSpeaker={onTestSpeaker}
          onRunSafeAction={onRunSafeAction}
          onUpdateBackendUrl={onUpdateBackendUrl}
          onClearRecentSessions={onClearRecentSessions}
          onReloadRewardedAd={onReloadRewardedAd}
        />
      </div>
    );
  }

  const accentBorder =
    mode === 'badmash' ? 'border-purple-500/40' : 'border-sky-400/30';

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/55 p-3 sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-label="Cosmic AI Settings and Optional Features"
      data-testid="settings-features-modal"
    >
      <div
        className={`flex max-h-[86vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border ${accentBorder} bg-[#0d101b] shadow-2xl`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div className="flex items-center gap-2">
            <Settings2
              className={`h-4 w-4 ${mode === 'badmash' ? 'text-purple-400' : 'text-sky-400'}`}
            />
            <h2 className="font-display text-sm font-bold tracking-wide text-white">
              COSMIC SETTINGS &amp; LIVE ENGINE
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="grid grid-cols-3 gap-1 border-b border-white/10 bg-[#090b12] p-1.5 text-xs">
          <button
            type="button"
            onClick={() => setSection('features')}
            data-testid="tab-optional-features"
            className={`flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 font-semibold transition-colors ${
              section === 'features'
                ? 'bg-white/12 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sliders className="h-3.5 w-3.5" />
            <span>Features</span>
          </button>
          <button
            type="button"
            onClick={() => setSection('knowledge')}
            data-testid="tab-live-knowledge"
            className={`flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 font-semibold transition-colors ${
              section === 'knowledge'
                ? 'bg-white/12 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Globe className="h-3.5 w-3.5" />
            <span>Live News</span>
          </button>
          <button
            type="button"
            onClick={() => setSection('diagnostics')}
            data-testid="tab-voice-diagnostics"
            className="flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 font-semibold text-slate-400 transition-colors hover:text-slate-200"
          >
            <Activity className="h-3.5 w-3.5" />
            <span>Voice &amp; Logs</span>
          </button>
        </div>

        <div className="cosmic-scroll flex-1 overflow-y-auto p-4 text-xs text-slate-200">
          {section === 'features' && (
            <div className="space-y-3">
              {/* Connection Quick Telemetry Bar */}
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-[#131726] px-3 py-2 font-mono text-[11px]">
                <span className="flex items-center gap-1.5 text-slate-300">
                  <Mic className="h-3.5 w-3.5 text-sky-400" />
                  State: <strong className="text-white">{cosmicState}</strong>
                </span>
                <span className="text-slate-400">
                  Resumption:{' '}
                  <strong className="text-emerald-300">{diagnostics.sessionResumptionStatus}</strong>
                </span>
                <span className="text-slate-400">
                  Retries: <strong className="text-slate-100">{diagnostics.retryCount}</strong>
                </span>
              </div>

              {/* AI Voice Speech Rate Slider (Normal & Badmash Modes) */}
              {(() => {
                const currentSpeechRate = clampSpeechRate(features.speechRate);
                const isModified = Math.abs(currentSpeechRate - DEFAULT_SPEECH_RATE) > 0.001;
                const speedPresets = [0.85, 1.0, 1.25, 1.5];
                return (
                  <div className="rounded-xl border border-white/10 bg-[#131726]/70 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <label
                        htmlFor="cosmic-speech-rate-slider"
                        className="flex items-center gap-1.5 font-semibold text-white"
                      >
                        <Gauge
                          className={`h-3.5 w-3.5 ${
                            mode === 'badmash' ? 'text-purple-300' : 'text-sky-400'
                          }`}
                        />
                        <span>AI Speech Rate</span>
                      </label>
                      <div className="flex items-center gap-2">
                        <span
                          data-testid="speech-rate-value"
                          className={`font-mono text-xs font-bold tabular-nums ${
                            mode === 'badmash' ? 'text-purple-200' : 'text-sky-300'
                          }`}
                        >
                          {currentSpeechRate.toFixed(2)}x
                        </span>
                        {isModified && (
                          <button
                            type="button"
                            onClick={() => onUpdateFeatures({ speechRate: DEFAULT_SPEECH_RATE })}
                            data-testid="speech-rate-reset"
                            className="inline-flex items-center gap-1 rounded-md border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] font-medium text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
                          >
                            <RotateCcw className="h-2.5 w-2.5" />
                            <span>Reset</span>
                          </button>
                        )}
                      </div>
                    </div>
                    <p className="mt-1 text-[11px] text-slate-400">
                      Adjusts AI response voice speed for both Normal and Badmash modes.
                    </p>

                    <div className="mt-3">
                      <input
                        id="cosmic-speech-rate-slider"
                        data-testid="speech-rate-slider"
                        type="range"
                        min={MIN_SPEECH_RATE}
                        max={MAX_SPEECH_RATE}
                        step={0.05}
                        value={currentSpeechRate}
                        aria-label="AI Speech Rate"
                        onChange={(e) =>
                          onUpdateFeatures({ speechRate: Number.parseFloat(e.target.value) })
                        }
                        className={`h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-[#090b12] ${
                          mode === 'badmash' ? 'accent-purple-400' : 'accent-sky-400'
                        }`}
                      />
                      <div className="mt-1.5 flex items-center justify-between font-mono text-[10px] text-slate-400 tabular-nums">
                        <span>0.75x Slower</span>
                        <span>1.00x Normal</span>
                        <span>1.50x Faster</span>
                      </div>
                    </div>

                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                      {speedPresets.map((preset) => {
                        const active = Math.abs(currentSpeechRate - preset) < 0.01;
                        return (
                          <button
                            key={preset}
                            type="button"
                            data-testid={`speech-rate-preset-${preset}`}
                            onClick={() => onUpdateFeatures({ speechRate: preset })}
                            className={`rounded-md border px-2.5 py-1 font-mono text-[11px] font-medium tabular-nums transition-colors ${
                              active
                                ? mode === 'badmash'
                                  ? 'border-purple-400 bg-purple-500/30 text-white'
                                  : 'border-sky-400 bg-sky-500/30 text-white'
                                : 'border-white/12 bg-white/5 text-slate-300 hover:bg-white/10'
                            }`}
                          >
                            {preset.toFixed(preset === 1 ? 1 : 2).replace(/\.00$/, '.0')}x
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              <div className="rounded-xl border border-white/10 bg-[#131726]/70 p-3">
                <div className="mb-2.5 flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-purple-300" />
                  <h3 className="font-semibold text-white">Optional Entertainment Features</h3>
                </div>
                <p className="mb-3 text-[11px] text-slate-400">
                  Disabled features are strictly withheld from Cosmic&apos;s live behaviour.
                </p>

                <div className="space-y-2">
                  {OPTIONAL_FEATURE_ITEMS.map((item) => {
                    const enabled = Boolean(features[item.key]);
                    return (
                      <div
                        key={item.key}
                        className="rounded-lg border border-white/8 bg-[#0b0e17] p-2.5"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-100">{item.label}</div>
                            <p className="mt-0.5 text-[11px] text-slate-400">{item.description}</p>
                          </div>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={enabled}
                            aria-label={`Toggle ${item.label}`}
                            data-testid={`feature-toggle-${item.key}`}
                            onClick={() => onUpdateFeatures({ [item.key]: !enabled })}
                            className={`shrink-0 rounded-lg border px-3 py-1.5 text-[11px] font-bold transition-colors ${
                              enabled
                                ? mode === 'badmash'
                                  ? 'border-purple-400/70 bg-purple-600/35 text-purple-100'
                                  : 'border-sky-400/70 bg-sky-500/30 text-sky-100'
                                : 'border-white/15 bg-white/5 text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            {enabled ? 'ON' : 'OFF'}
                          </button>
                        </div>

                        {item.key === 'rapBattle' && enabled && (
                          <div className="mt-2.5 border-t border-white/10 pt-2">
                            <div className="mb-1.5 text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
                              Rap Battle Style
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {RAP_BATTLE_STYLES.map((styleOpt) => {
                                const selected = features.rapBattleStyle === styleOpt.value;
                                return (
                                  <button
                                    key={styleOpt.value}
                                    type="button"
                                    data-testid={`rap-style-${styleOpt.value}`}
                                    onClick={() =>
                                      onUpdateFeatures({ rapBattleStyle: styleOpt.value })
                                    }
                                    className={`rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                                      selected
                                        ? 'border-purple-400 bg-purple-500/30 text-white'
                                        : 'border-white/12 bg-white/5 text-slate-300 hover:bg-white/10'
                                    }`}
                                  >
                                    {styleOpt.label}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {section === 'knowledge' && (
            <div className="space-y-3">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!searchQuery.trim() || searching) return;
                  setSearching(true);
                  void onSearchKnowledge(searchQuery.trim(), searchCategory).finally(() =>
                    setSearching(false),
                  );
                }}
                className="space-y-2 rounded-xl border border-white/10 bg-[#131726] p-3"
              >
                <label
                  htmlFor="cosmic-live-search-input"
                  className="block font-semibold text-white"
                >
                  Search Live News, AI, Memes &amp; Trends
                </label>
                <div className="flex flex-wrap gap-1.5">
                  <select
                    aria-label="Knowledge category"
                    value={searchCategory}
                    onChange={(e) => setSearchCategory(e.target.value)}
                    className="rounded-lg border border-white/15 bg-[#090b12] px-2.5 py-1.5 text-xs text-slate-100"
                  >
                    {SEARCH_CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                  <input
                    id="cosmic-live-search-input"
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="e.g. India trending news, latest AI models..."
                    className="min-w-[160px] flex-1 rounded-lg border border-white/15 bg-[#090b12] px-2.5 py-1.5 text-xs text-white placeholder:text-slate-500"
                  />
                  <button
                    type="submit"
                    disabled={searching || !searchQuery.trim()}
                    className="flex items-center gap-1 rounded-lg border border-sky-400/50 bg-sky-500/25 px-3 py-1.5 font-semibold text-sky-100 hover:bg-sky-500/35 disabled:opacity-50"
                  >
                    <Search className="h-3.5 w-3.5" />
                    <span>{searching ? 'Searching...' : 'Search'}</span>
                  </button>
                </div>
              </form>

              {liveKnowledge ? (
                <div className="space-y-2 rounded-xl border border-white/10 bg-[#131726] p-3">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-semibold text-white">
                      {liveKnowledge.ok ? 'Grounded Live Results' : 'Live Search Unavailable'}
                    </span>
                    <span className="font-mono text-slate-400">
                      {liveKnowledge.category} · {liveKnowledge.fetchedAt.slice(0, 10)}
                    </span>
                  </div>
                  <p className="leading-relaxed text-slate-300">{liveKnowledge.summary}</p>
                  {liveKnowledge.items.length > 0 && (
                    <ul className="space-y-2 pt-1">
                      {liveKnowledge.items.map((item, idx) => (
                        <li
                          key={`${item.url}-${idx}`}
                          className="rounded-lg border border-white/10 bg-[#090b12] p-2.5"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="font-semibold text-slate-100">{item.headline}</span>
                            <span className="shrink-0 font-mono text-[10px] text-sky-300">
                              {item.dateLabel}
                            </span>
                          </div>
                          <div className="mt-1 flex items-center justify-between text-[10px] text-slate-400">
                            <span>
                              Source: {item.source}
                              {item.corroboratedBy > 1 ? ` (+${item.corroboratedBy - 1} sources)` : ''}
                            </span>
                            <a
                              href={item.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-sky-400 hover:underline"
                            >
                              Read <ExternalLink className="h-2.5 w-2.5" />
                            </a>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : (
                <div className="rounded-xl border border-white/10 bg-[#131726]/60 p-4 text-center text-slate-400">
                  Ask Cosmic by voice (&ldquo;Cosmic, aaj kya trend kar raha hai?&rdquo;) or search
                  above to inspect live date-verified news &amp; sources.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
