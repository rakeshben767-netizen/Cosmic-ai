import { ShieldCheck, X } from 'lucide-react';

interface PrivacyPolicyModalProps {
  open: boolean;
  onClose: () => void;
}

export function PrivacyPolicyModal({ open, onClose }: PrivacyPolicyModalProps) {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="COSMIC AI Privacy Policy"
      data-testid="privacy-policy-modal"
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/80 px-4"
    >
      <div className="flex max-h-[84vh] w-full max-w-lg flex-col rounded-2xl border border-white/15 bg-[#121625] text-slate-100 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="h-5 w-5 text-sky-400" />
            <div>
              <h2 className="font-display text-base font-bold text-white">Privacy Policy</h2>
              <p className="font-mono text-[11px] text-slate-400">
                com.cosmicai.app · Effective Nov 24, 2026
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close privacy policy"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="cosmic-scroll space-y-4 overflow-y-auto px-5 py-4 text-xs leading-relaxed text-slate-300">
          <section>
            <h3 className="mb-1 font-semibold text-sky-300">1. Entertainment Purpose Only</h3>
            <p>
              COSMIC AI is created solely for entertainment purposes as a fun, interactive 3D AI
              voice companion. All voice replies, jokes, and Badmash comedy banter are generated for
              lighthearted amusement only and should not be taken seriously or treated as real-life,
              professional, medical, or legal advice. The app runs completely ad-free.
            </p>
          </section>

          <section>
            <h3 className="mb-1 font-semibold text-sky-300">2. Age Requirement</h3>
            <p>
              COSMIC AI is intended for users aged 13 years and older. It is not directed toward
              children under 13, and Badmash Comedy Mode is best suited for mature teens and adults
              (18+ recommended for roast humor).
            </p>
          </section>

          <section>
            <h3 className="mb-1 font-semibold text-sky-300">3. Contact (Gmail)</h3>
            <p>
              For any questions, feedback, or support, contact us at{' '}
              <span className="font-mono text-white">watchrewards99@gmail.com</span>.
            </p>
          </section>
        </div>

        <div className="flex items-center justify-end border-t border-white/10 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-sky-500 px-4 py-1.5 text-xs font-bold text-slate-950 hover:bg-sky-400"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
