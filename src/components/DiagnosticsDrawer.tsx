import { useState } from 'react';
import {
  Activity,
  ExternalLink,
  Phone,
  ShieldCheck,
  Smartphone,
  Terminal,
  Volume2,
  X,
} from 'lucide-react';
import type {
  ActionLogEntry,
  AudioDiagnosticsSnapshot,
  CosmicMode,
  DiagnosticLogEntry,
  TranscriptEntry,
} from '../types/cosmic.ts';

interface DiagnosticsDrawerProps {
  open: boolean;
  onClose: () => void;
  mode: CosmicMode;
  diagnostics: AudioDiagnosticsSnapshot;
  speakerTestResult: string | null;
  bridgeRuntime: { hasNativeBridge: boolean; runtimeLabel: string };
  backendUrl: string;
  transcripts: TranscriptEntry[];
  actionLogs: ActionLogEntry[];
  diagnosticLogs: DiagnosticLogEntry[];
  onTestSpeaker: () => void;
  onRunSafeAction: (name: string, args: Record<string, unknown>) => void;
  onUpdateBackendUrl: (url: string) => boolean;
}

export function DiagnosticsDrawer({
  open,
  onClose,
  mode,
  diagnostics,
  speakerTestResult,
  bridgeRuntime,
  backendUrl,
  transcripts,
  actionLogs,
  diagnosticLogs,
  onTestSpeaker,
  onRunSafeAction,
  onUpdateBackendUrl,
}: DiagnosticsDrawerProps) {
  const [activeTab, setActiveTab] = useState<'audio' | 'actions' | 'logs'>('audio');
  const [customUrl, setCustomUrl] = useState('https://www.wikipedia.org');
  const [customPhone, setCustomPhone] = useState('+919876543210');
  const [customApp, setCustomApp] = useState('YouTube');
  const [customContact, setCustomContact] = useState('Mom');
  const [serverDraft, setServerDraft] = useState(backendUrl);
  const [serverSavedMsg, setServerSavedMsg] = useState<string | null>(null);

  if (!open) return null;

  const borderAccent =
    mode === 'badmash' ? 'border-purple-500/40' : 'border-sky-400/30';

  return (
    <aside
      aria-label="Diagnostics and Device Actions"
      className={`fixed top-16 right-4 bottom-28 z-30 flex w-[min(420px,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border ${borderAccent} bg-[#0d101b]/95 shadow-2xl`}
    >
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-sky-400" />
          <h2 className="font-display text-sm font-semibold tracking-wide text-slate-100">
            Audio, Actions &amp; Bridge
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close diagnostics drawer"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-sky-400"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Segmented Tabs */}
      <div className="grid grid-cols-3 gap-1 border-b border-white/10 bg-[#090b12] p-1.5">
        <button
          type="button"
          onClick={() => setActiveTab('audio')}
          className={`rounded-md px-2 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
            activeTab === 'audio'
              ? 'bg-white/12 text-white'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Audio &amp; Speaker
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('actions')}
          className={`rounded-md px-2 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
            activeTab === 'actions'
              ? 'bg-white/12 text-white'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Safe Actions
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('logs')}
          className={`rounded-md px-2 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
            activeTab === 'logs'
              ? 'bg-white/12 text-white'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Transcripts &amp; Logs
        </button>
      </div>

      <div className="cosmic-scroll flex-1 overflow-y-auto p-4 text-xs text-slate-300">
        {activeTab === 'audio' && (
          <div className="space-y-4">
            <div className="rounded-lg border border-white/10 bg-[#131726] p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-semibold text-slate-100">Speaker Diagnostic (440Hz)</span>
                <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                  {diagnostics.contextState}
                </span>
              </div>
              <p className="mb-3 text-[11px] leading-relaxed text-slate-400">
                Plays a 440Hz reference tone through the persistent AudioContext and GainNode
                pipeline to verify device audio output.
              </p>
              <button
                type="button"
                onClick={onTestSpeaker}
                className="flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-sky-400/40 bg-sky-500/15 px-3 py-2 text-xs font-semibold text-sky-200 transition-colors hover:bg-sky-500/25"
              >
                <Volume2 className="h-4 w-4" />
                Test Speaker (440Hz)
              </button>
              {speakerTestResult && (
                <p
                  className="mt-2 rounded bg-black/30 p-2 font-mono text-[11px] text-sky-300"
                  data-testid="speaker-test-result"
                >
                  {speakerTestResult}
                </p>
              )}
            </div>

            <div className="space-y-2 rounded-lg border border-white/10 bg-[#131726] p-3">
              <h3 className="font-semibold text-slate-100">Gemini Live Audio Pipeline</h3>
              <dl className="grid grid-cols-2 gap-y-1.5 font-mono text-[11px] tabular-nums">
                <dt className="text-slate-400">Active Model</dt>
                <dd className="text-right text-slate-100">{diagnostics.activeModel}</dd>

                <dt className="text-slate-400">Voice Profile</dt>
                <dd className="text-right text-slate-100">{diagnostics.activeVoice}</dd>

                <dt className="text-slate-400">AudioContext</dt>
                <dd className="text-right text-slate-100">
                  {diagnostics.contextState} · {diagnostics.sampleRate || '—'}Hz
                </dd>

                <dt className="text-slate-400">Mic Permission</dt>
                <dd className="text-right text-slate-100">{diagnostics.micPermission}</dd>

                <dt className="text-slate-400">Chunks Sent (16kHz)</dt>
                <dd className="text-right text-slate-100">{diagnostics.chunksSent}</dd>

                <dt className="text-slate-400">Chunks Played</dt>
                <dd className="text-right text-slate-100">{diagnostics.chunksPlayed}</dd>

                <dt className="text-slate-400">Network</dt>
                <dd className="text-right text-slate-100">{diagnostics.networkStatus}</dd>

                <dt className="text-slate-400">Session Resumption</dt>
                <dd className="text-right text-emerald-300">
                  {diagnostics.sessionResumptionStatus}
                </dd>

                <dt className="text-slate-400">Reconnect Retries</dt>
                <dd className="text-right text-slate-100">{diagnostics.retryCount}</dd>

                <dt className="text-slate-400">Backend Latency</dt>
                <dd className="text-right text-slate-100">
                  {diagnostics.backendLatencyMs !== null
                    ? `${diagnostics.backendLatencyMs}ms`
                    : '—'}
                </dd>

                <dt className="text-slate-400">Last Close Code</dt>
                <dd className="truncate text-right text-slate-100">
                  {diagnostics.lastCloseCode !== null
                    ? `${diagnostics.lastCloseCode}${
                        diagnostics.lastCloseReason ? ` (${diagnostics.lastCloseReason})` : ''
                      }`
                    : '—'}
                </dd>

                <dt className="text-slate-400">Last MIME Type</dt>
                <dd className="truncate text-right text-slate-100">{diagnostics.lastMimeType}</dd>
              </dl>
            </div>
          </div>
        )}

        {activeTab === 'actions' && (
          <div className="space-y-4">
            <div className="rounded-lg border border-white/10 bg-[#131726] p-3">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 font-semibold text-slate-100">
                  <Smartphone className="h-3.5 w-3.5 text-sky-400" />
                  Runtime Bridge
                </span>
                <span className="font-mono text-[11px] text-slate-300">
                  {bridgeRuntime.runtimeLabel}
                </span>
              </div>
              <p className="mt-1.5 text-[11px] text-slate-400">
                {bridgeRuntime.hasNativeBridge
                  ? 'Android APK native bridge detected for Contacts, Dialer, and Intents.'
                  : 'Standard browser runtime: safe HTTPS & tel: links enabled; native contacts require Android APK.'}
              </p>

              <div className="mt-3 space-y-1.5 border-t border-white/10 pt-2.5">
                <label
                  htmlFor="cosmic-backend-url"
                  className="block text-[11px] font-medium text-slate-300"
                >
                  Live Voice Backend URL (optional override)
                </label>
                <div className="flex gap-1.5">
                  <input
                    id="cosmic-backend-url"
                    type="url"
                    value={serverDraft}
                    onChange={(e) => setServerDraft(e.target.value)}
                    placeholder="Same origin (leave blank on web)"
                    className="min-w-0 flex-1 rounded-md border border-white/15 bg-[#0a0d16] px-2 py-1 text-[11px] text-slate-100"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const ok = onUpdateBackendUrl(serverDraft);
                      setServerSavedMsg(
                        ok ? 'Saved.' : 'Enter a valid https:// URL (or blank for default).',
                      );
                    }}
                    className="rounded-md border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-white/15"
                  >
                    Save
                  </button>
                </div>
                {serverSavedMsg && (
                  <p className="text-[10px] text-sky-300">{serverSavedMsg}</p>
                )}
              </div>
            </div>

            <div className="space-y-2.5 rounded-lg border border-white/10 bg-[#131726] p-3">
              <h3 className="flex items-center gap-1.5 font-semibold text-slate-100">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                Safe Tool Verification
              </h3>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => onRunSafeAction('openWhatsApp', {})}
                  className="flex-1 rounded-md border border-white/15 bg-white/5 px-2.5 py-2 font-medium text-slate-200 hover:bg-white/10"
                >
                  Open WhatsApp
                </button>
              </div>

              <div className="flex gap-1.5">
                <input
                  type="text"
                  aria-label="Allowlisted app name"
                  value={customApp}
                  onChange={(e) => setCustomApp(e.target.value)}
                  className="min-w-0 flex-1 rounded-md border border-white/15 bg-[#0a0d16] px-2.5 py-1.5 text-xs text-slate-100"
                  placeholder="YouTube, Instagram..."
                />
                <button
                  type="button"
                  onClick={() => onRunSafeAction('openApp', { appName: customApp })}
                  className="rounded-md border border-white/15 bg-white/10 px-3 py-1.5 font-medium text-white hover:bg-white/15"
                >
                  openApp
                </button>
              </div>

              <div className="flex gap-1.5">
                <input
                  type="url"
                  aria-label="HTTPS URL to validate and open"
                  value={customUrl}
                  onChange={(e) => setCustomUrl(e.target.value)}
                  className="min-w-0 flex-1 rounded-md border border-white/15 bg-[#0a0d16] px-2.5 py-1.5 text-xs text-slate-100"
                  placeholder="https://example.com"
                />
                <button
                  type="button"
                  onClick={() => onRunSafeAction('openUrl', { url: customUrl })}
                  className="rounded-md border border-white/15 bg-white/10 px-3 py-1.5 font-medium text-white hover:bg-white/15"
                >
                  openUrl
                </button>
              </div>

              <div className="flex gap-1.5">
                <input
                  type="tel"
                  aria-label="Phone number to dial"
                  value={customPhone}
                  onChange={(e) => setCustomPhone(e.target.value)}
                  className="min-w-0 flex-1 rounded-md border border-white/15 bg-[#0a0d16] px-2.5 py-1.5 text-xs text-slate-100"
                  placeholder="+919876543210"
                />
                <button
                  type="button"
                  onClick={() => onRunSafeAction('makeCall', { phoneNumber: customPhone })}
                  className="flex items-center gap-1 rounded-md border border-white/15 bg-white/10 px-3 py-1.5 font-medium text-white hover:bg-white/15"
                >
                  <Phone className="h-3 w-3" />
                  Call
                </button>
              </div>

              <div className="flex gap-1.5">
                <input
                  type="text"
                  aria-label="Contact name to look up"
                  value={customContact}
                  onChange={(e) => setCustomContact(e.target.value)}
                  className="min-w-0 flex-1 rounded-md border border-white/15 bg-[#0a0d16] px-2.5 py-1.5 text-xs text-slate-100"
                  placeholder="Mom, Rahul..."
                />
                <button
                  type="button"
                  onClick={() => onRunSafeAction('callContact', { contactName: customContact })}
                  className="rounded-md border border-white/15 bg-white/10 px-3 py-1.5 font-medium text-white hover:bg-white/15"
                >
                  callContact
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="font-semibold text-slate-200">Action Execution History</h3>
              {actionLogs.length === 0 ? (
                <p className="text-slate-500">No device actions executed yet.</p>
              ) : (
                <ul className="space-y-2" data-testid="action-log-list">
                  {actionLogs.map((entry) => (
                    <li
                      key={entry.id}
                      className="rounded-lg border border-white/10 bg-[#131726] p-2.5"
                    >
                      <div className="flex items-center justify-between font-mono text-[11px]">
                        <span className="font-semibold text-slate-100">{entry.action}</span>
                        <span className={entry.ok ? 'text-emerald-400' : 'text-amber-400'}>
                          {entry.ok ? 'EXECUTED' : 'BLOCKED / UNAVAILABLE'}
                        </span>
                      </div>
                      <p className="mt-1 text-slate-300">{entry.message}</p>
                      {entry.fallbackUrl && (
                        <a
                          href={entry.fallbackUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1.5 inline-flex items-center gap-1 text-sky-400 hover:underline"
                        >
                          Open Link <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {activeTab === 'logs' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <h3 className="font-semibold text-slate-200">Recent Conversation Transcript</h3>
              {transcripts.length === 0 ? (
                <p className="text-slate-500">
                  Start Cosmic AI and speak in Hindi, English, Hinglish, Marathi, or any supported
                  language.
                </p>
              ) : (
                <ul className="space-y-2">
                  {transcripts.map((t) => (
                    <li
                      key={t.id}
                      className="rounded-lg border border-white/10 bg-[#131726] p-2.5"
                    >
                      <div className="mb-0.5 flex items-center justify-between text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
                        <span>{t.speaker === 'user' ? 'You' : 'Cosmic AI'}</span>
                        <span>{t.mode === 'badmash' ? 'Badmash' : 'Normal'}</span>
                      </div>
                      <p className="text-slate-100">{t.text}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="space-y-2">
              <h3 className="flex items-center gap-1.5 font-semibold text-slate-200">
                <Terminal className="h-3.5 w-3.5 text-slate-400" />
                Pipeline Debug Logs
              </h3>
              {diagnosticLogs.length === 0 ? (
                <p className="text-slate-500">No events recorded yet.</p>
              ) : (
                <ul className="space-y-1 font-mono text-[10px]">
                  {diagnosticLogs.map((log) => (
                    <li
                      key={log.id}
                      className={`rounded border border-white/5 bg-[#090b12] px-2 py-1 ${
                        log.level === 'error'
                          ? 'text-red-300'
                          : log.level === 'warn'
                            ? 'text-amber-300'
                            : 'text-slate-300'
                      }`}
                    >
                      <span className="text-slate-500">[{log.category}]</span> {log.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
