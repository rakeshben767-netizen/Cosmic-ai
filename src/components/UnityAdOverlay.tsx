import { useEffect, useState } from 'react';
import { Play, X } from 'lucide-react';
import { UNITY_ADS_CONFIG, type UnityAdPlacement } from '../utils/unityAds.ts';

interface UnityAdOverlayProps {
  placement: UnityAdPlacement | null;
  reason: string;
  onComplete: (completed: boolean) => void;
}

export function UnityAdOverlay({ placement, reason, onComplete }: UnityAdOverlayProps) {
  const [secondsLeft, setSecondsLeft] = useState(3);

  useEffect(() => {
    if (!placement) return;
    setSecondsLeft(3);
    const timer = window.setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          window.clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [placement]);

  if (!placement) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Sponsored Ad"
      data-testid="unity-ad-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4"
    >
      <div className="w-full max-w-sm rounded-2xl border border-white/15 bg-[#121625] p-5 text-slate-100 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <span className="font-mono text-xs font-semibold tracking-wide text-slate-400">
            Unity Ads · {placement}
          </span>
          <button
            type="button"
            disabled={secondsLeft > 0}
            onClick={() => onComplete(true)}
            aria-label="Close ad"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/15 text-slate-300 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-4 flex flex-col items-center justify-center rounded-xl border border-white/10 bg-[#0b0e18] px-4 py-8 text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-purple-600/25 text-purple-300">
            <Play className="h-6 w-6" />
          </div>
          <p className="text-sm font-semibold text-white">{reason}</p>
          <p className="mt-1 font-mono text-xs text-slate-400">
            Game ID {UNITY_ADS_CONFIG.gameId}
          </p>
        </div>

        <button
          type="button"
          disabled={secondsLeft > 0}
          onClick={() => onComplete(true)}
          data-testid="unity-ad-continue"
          className="flex min-h-11 w-full items-center justify-center rounded-xl bg-sky-500 px-4 py-2 text-sm font-semibold text-slate-950 transition-colors hover:bg-sky-400 disabled:bg-slate-700 disabled:text-slate-300"
        >
          {secondsLeft > 0 ? `Continue in ${secondsLeft}s` : 'Continue'}
        </button>
      </div>
    </div>
  );
}
