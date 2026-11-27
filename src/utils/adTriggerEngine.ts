import type {
  AdResolutionOutcome,
  AdTriggerType,
  CosmicMode,
  RewardedAdRuleEvent,
} from '../types/cosmic.ts';

export const AD_INTERVAL_MS = 300_000;
export const AD_INTERVAL_SEC = 300 as const;

export interface AdTriggerState {
  appLoadTriggered: boolean;
  elapsedActiveMs: number;
  isAdActive: boolean;
  activeTrigger: AdTriggerType | null;
  pendingBadmashUnlock: boolean;
  lastEvent: RewardedAdRuleEvent | null;
}

export function createInitialAdTriggerState(): AdTriggerState {
  return {
    appLoadTriggered: false,
    elapsedActiveMs: 0,
    isAdActive: false,
    activeTrigger: null,
    pendingBadmashUnlock: false,
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
  trigger?: 'interval_5m';
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
        activeTrigger: 'interval_5m',
      },
      shouldTriggerAd: true,
      trigger: 'interval_5m',
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

export function evaluateModeSwitchRequest(
  state: AdTriggerState,
  currentMode: CosmicMode,
): {
  state: AdTriggerState;
  action: 'switch_to_normal_immediately' | 'trigger_rewarded_ad' | 'ignore_already_pending';
  trigger?: 'mode_switch_badmash';
} {
  if (currentMode === 'badmash') {
    return {
      state,
      action: 'switch_to_normal_immediately',
    };
  }

  if (state.pendingBadmashUnlock) {
    return {
      state,
      action: 'ignore_already_pending',
    };
  }

  return {
    state: {
      ...state,
      isAdActive: true,
      activeTrigger: 'mode_switch_badmash',
      pendingBadmashUnlock: true,
    },
    action: 'trigger_rewarded_ad',
    trigger: 'mode_switch_badmash',
  };
}

export function resolveRewardedAdOutcome(
  state: AdTriggerState,
  trigger: AdTriggerType,
  outcome: AdResolutionOutcome,
): {
  state: AdTriggerState;
  event: RewardedAdRuleEvent;
} {
  const grantBadmashMode =
    trigger === 'mode_switch_badmash' &&
    (outcome === 'completed' ||
      outcome === 'fallback_no_fill_or_error' ||
      outcome === 'not_ready');

  const event: RewardedAdRuleEvent = {
    ad_type: 'rewarded',
    trigger,
    grant_badmash_mode: grantBadmashMode,
    next_interval_sec: AD_INTERVAL_SEC,
  };

  return {
    state: {
      ...state,
      elapsedActiveMs: 0,
      isAdActive: false,
      activeTrigger: null,
      pendingBadmashUnlock: false,
      lastEvent: event,
    },
    event,
  };
}
