import { useState } from 'react';
import { Lock, ShieldAlert, X } from 'lucide-react';

interface AdminAccessModalProps {
  open: boolean;
  onClose: () => void;
  onVerify: (passcode: string) => Promise<{ ok: boolean; error?: string }>;
}

export function AdminAccessModal({ open, onClose, onVerify }: AdminAccessModalProps) {
  const [passcode, setPasscode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passcode.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    const res = await onVerify(passcode.trim());
    setSubmitting(false);
    if (res.ok) {
      setPasscode('');
    } else {
      setError(res.error || 'Verification failed.');
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Protected Developer Access"
      data-testid="admin-unlock-modal"
    >
      <div className="w-full max-w-sm rounded-2xl border border-white/15 bg-[#0d101b] p-5 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-sky-400" />
            <h2 className="font-display text-sm font-bold tracking-wide text-white">
              Developer Console
            </h2>
          </div>
          <button
            type="button"
            onClick={() => {
              setPasscode('');
              setError(null);
              onClose();
            }}
            aria-label="Close developer verification"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mb-3 text-xs leading-relaxed text-slate-400">
          Internal engine controls and diagnostics are protected. Enter your developer passcode to
          unlock.
        </p>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
          <input
            type="password"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            placeholder="Developer passcode"
            aria-label="Developer passcode"
            autoFocus
            className="w-full rounded-lg border border-white/15 bg-[#090b12] px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:border-sky-400 focus:outline-none"
          />

          {error && (
            <div className="flex items-center gap-1.5 rounded-lg border border-red-500/35 bg-red-500/10 px-2.5 py-1.5 text-[11px] text-red-200">
              <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-red-400" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setPasscode('');
                setError(null);
                onClose();
              }}
              className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-white/10"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !passcode.trim()}
              className="rounded-lg border border-sky-400/50 bg-sky-500/25 px-3.5 py-1.5 text-xs font-semibold text-sky-100 hover:bg-sky-500/35 disabled:opacity-50"
            >
              {submitting ? 'Verifying...' : 'Unlock'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
