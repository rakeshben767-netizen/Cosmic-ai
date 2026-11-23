import { ExternalLink, ShieldCheck, X } from 'lucide-react';

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
                com.cosmicai.app · Effective Nov 23, 2026
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
          <p>
            COSMIC AI is a real-time 3D voice-to-voice AI companion with Normal and Badmash comedy
            modes. This policy explains what data and permissions the app uses for Google Play Store
            transparency.
          </p>

          <section>
            <h3 className="mb-1 font-semibold text-sky-300">1. Microphone Audio (RECORD_AUDIO)</h3>
            <p>
              Microphone access is activated only while live voice mode is powered on and unmuted.
              Spoken audio is streamed over encrypted HTTPS/WSS to generate real-time AI voice
              responses and is never sold to advertisers.
            </p>
          </section>

          <section>
            <h3 className="mb-1 font-semibold text-sky-300">
              2. Contacts &amp; Phone (READ_CONTACTS, CALL_PHONE)
            </h3>
            <p>
              Optional permissions used solely on-device when you explicitly tell COSMIC AI to dial
              a contact. Your contacts are never uploaded to third-party marketing or ad servers.
            </p>
          </section>

          <section>
            <h3 className="mb-1 font-semibold text-sky-300">3. Unity Ads (Game ID 800447797)</h3>
            <p>
              We use Unity Ads for 4-minute periodic breaks and optional Rewarded Ads (unlocking
              Badmash Mode or earning a 12-hour periodic-ad-free pass). Unity Technologies may
              process advertising IDs, IP addresses, and ad engagement metrics under Unity&apos;s
              Privacy Policy (https://unity.com/legal/privacy-policy).
            </p>
          </section>

          <section>
            <h3 className="mb-1 font-semibold text-sky-300">4. Local Storage &amp; Controls</h3>
            <p>
              Your 20-ad 12-hour Ad-Free Pass progress and app preferences stay locally in device
              storage. You may revoke permissions anytime via Android Settings. Not intended for
              children under 13.
            </p>
          </section>

          <section>
            <h3 className="mb-1 font-semibold text-sky-300">5. Developer Contact</h3>
            <p>
              Email <span className="font-mono text-white">rakeshben35@gmail.com</span> for data
              safety or privacy inquiries.
            </p>
          </section>
        </div>

        <div className="flex items-center justify-between border-t border-white/10 px-5 py-3">
          <a
            href="/privacy-policy.html"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-300 hover:text-sky-200"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            <span>Open Standalone Page</span>
          </a>
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
