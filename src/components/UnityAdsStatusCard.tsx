import type { AdTriggerType, RewardedAdRuleEvent, UnityAdsSnapshot } from '../types/cosmic.ts';

interface UnityAdsStatusCardProps {
  unityAdsSnapshot?: UnityAdsSnapshot | null;
  lastAdRuleEvent?: RewardedAdRuleEvent | null;
  adElapsedActiveMs?: number;
  hasNativeBridge: boolean;
  onReloadRewardedAd?: () => void;
  onTestRewardedAd?: (trigger: AdTriggerType) => void;
}

export function UnityAdsStatusCard({
  unityAdsSnapshot,
  lastAdRuleEvent,
  adElapsedActiveMs = 0,
  hasNativeBridge,
  onReloadRewardedAd,
  onTestRewardedAd,
}: UnityAdsStatusCardProps) {
  return (
    <div
      className="space-y-2.5 rounded-lg border border-white/10 bg-[#131726] p-3 text-xs text-slate-200"
      data-testid="unity-ads-status-card"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold text-slate-100">Unity Ads Status Card</span>
        <div className="flex items-center gap-1.5">
          {onReloadRewardedAd && hasNativeBridge && (
            <button
              type="button"
              onClick={onReloadRewardedAd}
              className="rounded border border-sky-400/35 bg-sky-500/15 px-2 py-0.5 text-[10px] font-semibold text-sky-200 hover:bg-sky-500/25"
            >
              Load Rewarded
            </button>
          )}
          {onTestRewardedAd && hasNativeBridge && (
            <button
              type="button"
              onClick={() => onTestRewardedAd('interval_5m')}
              className="rounded border border-purple-400/35 bg-purple-500/15 px-2 py-0.5 text-[10px] font-semibold text-purple-200 hover:bg-purple-500/25"
            >
              Show Rewarded
            </button>
          )}
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-y-1 font-mono text-[11px] tabular-nums">
        <dt className="text-slate-400">Game ID / Test Mode</dt>
        <dd className="text-right text-slate-100">
          {unityAdsSnapshot?.unityGameId ?? '800447797'} ·{' '}
          {String(unityAdsSnapshot?.testMode ?? false)}
        </dd>

        <dt className="text-slate-400">SDK Status</dt>
        <dd className="text-right text-slate-100">
          {unityAdsSnapshot?.sdkStatus.phase ?? (hasNativeBridge ? 'INITIALIZING' : 'ANDROID_APK_ONLY')}
        </dd>

        <dt className="text-slate-400">Rewarded (BP_Rewarded_Android)</dt>
        <dd className="text-right text-slate-100">
          {unityAdsSnapshot?.rewardedState.phase ?? 'IDLE'}
        </dd>

        <dt className="text-slate-400">Interstitial (BP_Interstitial_Android)</dt>
        <dd className="text-right text-slate-100">
          {unityAdsSnapshot?.interstitialState.phase ?? 'IDLE'}
        </dd>

        <dt className="text-slate-400">Active 5m Timer</dt>
        <dd className="text-right text-sky-300">
          {Math.floor(adElapsedActiveMs / 1000)}s / 300s
        </dd>
      </dl>

      {unityAdsSnapshot?.sdkStatus.rawErrorMessage && (
        <div className="rounded border border-red-500/35 bg-red-500/10 p-2 font-mono text-[10px] text-red-200">
          <div>SDK Error Code: {unityAdsSnapshot.sdkStatus.rawErrorCode ?? 'NONE'}</div>
          <div className="mt-0.5 break-words">
            SDK Error: {unityAdsSnapshot.sdkStatus.rawErrorMessage}
          </div>
        </div>
      )}

      {unityAdsSnapshot?.rewardedState.rawErrorMessage && (
        <div className="rounded border border-amber-500/35 bg-amber-500/10 p-2 font-mono text-[10px] text-amber-200">
          <div>
            Rewarded Error Code: {unityAdsSnapshot.rewardedState.rawErrorCode ?? 'NONE'}
          </div>
          <div className="mt-0.5 break-words">
            Rewarded Error: {unityAdsSnapshot.rewardedState.rawErrorMessage}
          </div>
        </div>
      )}

      {unityAdsSnapshot?.interstitialState.rawErrorMessage && (
        <div className="rounded border border-amber-500/35 bg-amber-500/10 p-2 font-mono text-[10px] text-amber-200">
          <div>
            Interstitial Error Code:{' '}
            {unityAdsSnapshot.interstitialState.rawErrorCode ?? 'NONE'}
          </div>
          <div className="mt-0.5 break-words">
            Interstitial Error: {unityAdsSnapshot.interstitialState.rawErrorMessage}
          </div>
        </div>
      )}

      <div className="grid grid-cols-5 gap-1 rounded border border-white/10 bg-[#0a0d16] p-2 text-center font-mono text-[10px] tabular-nums">
        <div>
          <div className="text-slate-400">Load OK</div>
          <div className="text-emerald-300">{unityAdsSnapshot?.counters.loadSuccess ?? 0}</div>
        </div>
        <div>
          <div className="text-slate-400">Load Fail</div>
          <div className="text-red-300">{unityAdsSnapshot?.counters.loadFailed ?? 0}</div>
        </div>
        <div>
          <div className="text-slate-400">Impr.</div>
          <div className="text-sky-300">{unityAdsSnapshot?.counters.impressions ?? 0}</div>
        </div>
        <div>
          <div className="text-slate-400">Clicks</div>
          <div className="text-purple-300">{unityAdsSnapshot?.counters.clicks ?? 0}</div>
        </div>
        <div>
          <div className="text-slate-400">Skips</div>
          <div className="text-amber-300">{unityAdsSnapshot?.counters.skips ?? 0}</div>
        </div>
      </div>

      {lastAdRuleEvent && (
        <pre className="overflow-x-auto rounded border border-white/10 bg-[#090b12] p-2 font-mono text-[10px] text-slate-300">
          {JSON.stringify(lastAdRuleEvent)}
        </pre>
      )}
    </div>
  );
}
