import { Tv, X } from 'lucide-react';
import type { AdTriggerType, RewardedAdRuleEvent, UnityAdsSnapshot } from '../types/cosmic.ts';
import { UnityAdsStatusCard } from './UnityAdsStatusCard.tsx';

interface UnityAdsModalProps {
  open: boolean;
  onClose: () => void;
  unityAdsSnapshot?: UnityAdsSnapshot | null;
  lastAdRuleEvent?: RewardedAdRuleEvent | null;
  adElapsedActiveMs?: number;
  hasNativeBridge: boolean;
  onReloadRewardedAd?: () => void;
  onTestRewardedAd?: (trigger: AdTriggerType) => void;
}

export function UnityAdsModal({
  open,
  onClose,
  unityAdsSnapshot,
  lastAdRuleEvent,
  adElapsedActiveMs,
  hasNativeBridge,
  onReloadRewardedAd,
  onTestRewardedAd,
}: UnityAdsModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/65 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Unity Ads Status"
      data-testid="unity-ads-modal"
    >
      <div className="w-full max-w-md rounded-2xl border border-white/15 bg-[#0d101b] p-4 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Tv className="h-4 w-4 text-sky-400" />
            <h2 className="font-display text-sm font-bold tracking-wide text-white">
              Unity Ads Status
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Unity Ads Status"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <UnityAdsStatusCard
          unityAdsSnapshot={unityAdsSnapshot}
          lastAdRuleEvent={lastAdRuleEvent}
          adElapsedActiveMs={adElapsedActiveMs}
          hasNativeBridge={hasNativeBridge}
          onReloadRewardedAd={onReloadRewardedAd}
          onTestRewardedAd={onTestRewardedAd}
        />
      </div>
    </div>
  );
}
