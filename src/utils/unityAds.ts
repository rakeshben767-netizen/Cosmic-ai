export const UNITY_ADS_CONFIG = {
  gameId: '800447797',
  organizationCoreId: '13470006284888',
  interstitialPlacement: 'BP_Interstitial_Android',
  rewardedPlacement: 'BP_Rewarded_Android',
} as const;

export type UnityAdPlacement =
  | typeof UNITY_ADS_CONFIG.interstitialPlacement
  | typeof UNITY_ADS_CONFIG.rewardedPlacement;

export interface WebAdPromptRequest {
  placement: UnityAdPlacement;
  reason: string;
  resolve: (completed: boolean) => void;
}

interface AndroidAdsWindow {
  CosmicAndroidBridge?: {
    showInterstitialAd?: (callbackId: string) => string;
    showRewardedAd?: (callbackId: string) => string;
  };
  __cosmicOnUnityAdResult?: (
    callbackId: string,
    completed: boolean,
    placementId: string,
    reason?: string,
  ) => void;
}

const pendingNativeAdResolvers = new Map<string, (completed: boolean) => void>();
let lastUnityAdError = '';

export function getLastUnityAdError(): string {
  return lastUnityAdError;
}

function ensureNativeAdCallbackRegistered(): void {
  if (typeof window === 'undefined') return;
  const win = window as unknown as AndroidAdsWindow;
  if (!win.__cosmicOnUnityAdResult) {
    win.__cosmicOnUnityAdResult = (
      callbackId: string,
      completed: boolean,
      _placementId?: string,
      reason?: string,
    ) => {
      lastUnityAdError = completed ? '' : (reason || '').trim();
      const resolver = pendingNativeAdResolvers.get(callbackId);
      if (resolver) {
        pendingNativeAdResolvers.delete(callbackId);
        resolver(Boolean(completed));
      }
    };
  }
}

export function triggerUnityAd(
  placement: UnityAdPlacement,
  reason: string,
  requestWebAdOverlay: (req: WebAdPromptRequest) => void,
): Promise<boolean> {
  if (typeof window === 'undefined') {
    return Promise.resolve(true);
  }

  const win = window as unknown as AndroidAdsWindow;
  const bridge = win.CosmicAndroidBridge;
  const nativeInvoker = bridge?.showRewardedAd;

  if (bridge && typeof nativeInvoker === 'function') {
    ensureNativeAdCallbackRegistered();
    const callbackId = `ad_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    return new Promise<boolean>((resolve) => {
      let settled = false;
      const finish = (ok: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        pendingNativeAdResolvers.delete(callbackId);
        resolve(ok);
      };

      const timeout = window.setTimeout(() => {
        finish(false);
      }, 120000);

      pendingNativeAdResolvers.set(callbackId, finish);

      try {
        const raw = nativeInvoker.call(bridge, callbackId);
        const parsed = JSON.parse(raw) as { ok?: boolean };
        if (!parsed.ok) {
          finish(false);
        }
      } catch {
        finish(false);
      }
    });
  }

  return new Promise<boolean>((resolve) => {
    requestWebAdOverlay({
      placement,
      reason,
      resolve,
    });
  });
}
