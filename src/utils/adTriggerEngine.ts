import type {
  AdResolutionOutcome,
  AdTriggerType,
  RewardedAdRuleEvent,
} from '../types/cosmic.ts';

export const AD_INTERVAL_MS = 240_000;
export const AD_INTERVAL_SEC = 240 as const;

export interface AdTriggerState {
  appLoadTriggered: boolean;
  elapsedActiveMs: number;
  isAdActive: boolean;
  activeTrigger: AdTriggerType | null;
  pendingPowerOn: boolean;
  lastEvent: RewardedAdRuleEvent | null;
}

export function createInitialAdTriggerState(): AdTriggerState {
  return {
    appLoadTriggered: false,
    elapsedActiveMs: 0,
    isAdActive: false,
    activeTrigger: null,
    pendingPowerOn: false,
    lastEvent: null,
  };
}

export function evaluateAppLoadTrigger(state: AdTriggerState): {
  state: AdTriggerState;
  shouldTriggerAd: boolean;
  trigger?: 'app_load';
} {
  if (state.appLoadTriggered || state.isAdActive) {
    return { state, shouldTriggerAd: false };
  }
  return {
    state: {
      ...state,
      appLoadTriggered: true,
      isAdActive: true,
      activeTrigger: 'app_load',
    },
    shouldTriggerAd: true,
    trigger: 'app_load',
  };
}

export function advanceActiveTime(
  state: AdTriggerState,
  deltaMs: number,
  isVisible: boolean,
): {
  state: AdTriggerState;
  shouldTriggerAd: boolean;
  trigger?: 'interval_4m';
} {
  if (!isVisible || state.isAdActive || deltaMs <= 0) {
    return { state, shouldTriggerAd: false };
  }

  const nextElapsed = state.elapsedActiveMs + deltaMs;
  if (nextElapsed >= AD_INTERVAL_MS) {
    return {
      state: {
        ...state,
        elapsedActiveMs: AD_INTERVAL_MS,
        isAdActive: true,
        activeTrigger: 'interval_4m',
      },
      shouldTriggerAd: true,
      trigger: 'interval_4m',
    };
  }

  return {
    state: {
      ...state,
      elapsedActiveMs: nextElapsed,
    },
    shouldTriggerAd: false,
  };
}

export function evaluatePowerOnRequest(state: AdTriggerState): {
  state: AdTriggerState;
  action: 'trigger_rewarded_ad' | 'ignore_already_pending';
  trigger?: 'power_on';
} {
  if (state.pendingPowerOn) {
    return {
      state,
      action: 'ignore_already_pending',
    };
  }

  return {
    state: {
      ...state,
      isAdActive: true,
      activeTrigger: 'power_on',
      pendingPowerOn: true,
    },
    action: 'trigger_rewarded_ad',
    trigger: 'power_on',
  };
}

export function resolveRewardedAdOutcome(
  state: AdTriggerState,
  trigger: AdTriggerType,
  outcome: AdResolutionOutcome,
  hasNativeBridge = true,
): {
  state: AdTriggerState;
  event: RewardedAdRuleEvent;
} {
  // Strict rule on Android APK (hasNativeBridge=true):
  // Power On is granted ONLY when the Rewarded Ad finishes with 'completed'.
  // Never power on when ad is not loaded, fails to load, fails to show, or is skipped.
  const grantPowerOn =
    trigger === 'power_on' &&
    (hasNativeBridge
      ? outcome === 'completed'
      : outcome === 'completed' || outcome === 'fallback_no_fill_or_error');

  const event: RewardedAdRuleEvent = {
    ad_type: 'rewarded',
    trigger,
    grant_power_on: grantPowerOn,
    grant_badmash_mode: false,
    next_interval_sec: AD_INTERVAL_SEC,
  };

  return {
    state: {
      ...state,
      elapsedActiveMs: 0,
      isAdActive: false,
      activeTrigger: null,
      pendingPowerOn: false,
      lastEvent: event,
    },
    event,
  };
}
