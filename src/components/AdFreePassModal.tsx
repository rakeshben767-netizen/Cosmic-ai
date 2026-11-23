import { CheckCircle2, Clock, Gift, Play, Shield, X } from 'lucide-react';
import type { AdPassStatus } from '../utils/adPass.ts';

interface AdFreePassModalProps {
  open: boolean;
  adPass: AdPassStatus;
  onClose: () => void;
  onWatchAd: () => Promise<boolean>;
  onOpenPrivacy: () => void;
}

export function AdFreePassModal({
  open,
  adPass,
  onClose,
  onWatchAd,
  onOpenPrivacy,
}: AdFreePassModalProps) {
  if (!open) return null;

  const progressPct = Math.min(
    100,
    Math.round((adPass.watchedCount / adPass.targetCount) * 100),
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="12-Hour Ad-Free Pass"
      data-testid="ad-free-pass-modal"
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/80 px-4"
    >
      <div className="w-full max-w-md rounded-2xl border border-white/15 bg-[#121625] p-5 text-slate-100 shadow-2xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/20 text-amber-300">
              <Gift className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-display text-base font-bold text-white">
                12-Hour Ad-Free Pass
              </h2>
              <p className="text-xs text-slate-400">
                Watch {adPass.targetCount} ads for 12h periodic-ad relief
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close pass dialog"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {adPass.isAdFreeActive ? (
          <div className="mb-4 rounded-xl border border-emerald-400/35 bg-emerald-500/12 p-4 text-center">
            <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-emerald-400" />
            <p className="text-sm font-bold text-emerald-200">12-Hour Ad-Free Pass Active</p>
            <p className="mt-1 flex items-center justify-center gap-1.5 font-mono text-xs text-emerald-300">
              <Clock className="h-3.5 w-3.5" />
              <span>Time left: {adPass.remainingLabel}</span>
            </p>
            <p className="mt-2 text-xs text-slate-300">
              4-minute periodic ads are paused for 12 hours. After the timer ends, periodic ads
              automatically resume.
            </p>
          </div>
        ) : (
          <div className="mb-4 rounded-xl border border-white/10 bg-[#0b0e18] p-4">
            <div className="mb-2 flex items-center justify-between text-xs font-semibold">
              <span className="text-slate-300">Rewarded Ads Progress</span>
              <span className="font-mono text-amber-300" data-testid="ad-pass-counter">
                {adPass.watchedCount} / {adPass.targetCount}
              </span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full rounded-full bg-gradient-to-r from-amber-500 to-orange-400 transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <p className="mt-3 text-xs text-slate-300">
              Complete {adPass.targetCount - adPass.watchedCount} more rewarded ads to remove
              4-minute periodic ads for <strong className="text-white">12 hours</strong>.
            </p>
          </div>
        )}

        <ul className="mb-4 space-y-1.5 rounded-xl border border-white/10 bg-[#0e1220] px-3.5 py-3 text-xs text-slate-300">
          <li>• Every 4 minutes: periodic ad plays only after AI finishes speaking.</li>
          <li>• 20 ads watched: disables 4-minute periodic ads for 12 hours.</li>
          <li>• After 12 hours: periodic ads resume until unlocked again.</li>
          <li>• Badmash Mode: always requires a rewarded ad to unlock.</li>
        </ul>

        <div className="flex flex-col gap-2">
          {!adPass.isAdFreeActive && (
            <button
              type="button"
              onClick={() => void onWatchAd()}
              data-testid="watch-pass-ad-button"
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-amber-400 px-4 py-2 text-sm font-bold text-slate-950 transition-colors hover:bg-amber-300"
            >
              <Play className="h-4 w-4" />
              <span>
                Watch Rewarded Ad ({adPass.watchedCount}/{adPass.targetCount})
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenPrivacy();
            }}
            className="flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-xs font-semibold text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
          >
            <Shield className="h-3.5 w-3.5 text-sky-400" />
            <span>View Play Store Privacy Policy</span>
          </button>
        </div>
      </div>
    </div>
  );
}
