import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  AD_INTERVAL_MS,
  AD_INTERVAL_SEC,
  advanceActiveTime,
  createInitialAdTriggerState,
  evaluateAppLoadTrigger,
  evaluateModeSwitchRequest,
  resolveRewardedAdOutcome,
} from './adTriggerEngine.ts';

describe('adTriggerEngine Rewarded-only state rules', () => {
  it('triggers a rewarded ad once on app load and resets 5m timer on resolution', () => {
    const initial = createInitialAdTriggerState();
    const first = evaluateAppLoadTrigger(initial);
    assert.equal(first.shouldTriggerAd, true);
    assert.equal(first.trigger, 'app_load');
    assert.equal(first.state.isAdActive, true);

    // Duplicate app_load evaluation does not re-trigger
    const second = evaluateAppLoadTrigger(first.state);
    assert.equal(second.shouldTriggerAd, false);

    const resolved = resolveRewardedAdOutcome(first.state, 'app_load', 'completed');
    assert.deepEqual(resolved.event, {
      ad_type: 'rewarded',
      trigger: 'app_load',
      grant_badmash_mode: false,
      next_interval_sec: AD_INTERVAL_SEC,
    });
    assert.equal(resolved.state.elapsedActiveMs, 0);
    assert.equal(resolved.state.isAdActive, false);
  });

  it('tracks active elapsed time across modes and fires interval_5m every 300,000 ms', () => {
    let state = createInitialAdTriggerState();

    // Hidden/background time does not advance the active timer
    const bgStep = advanceActiveTime(state, 120_000, false);
    assert.equal(bgStep.shouldTriggerAd, false);
    assert.equal(bgStep.state.elapsedActiveMs, 0);

    // 4 minutes visible
    const step1 = advanceActiveTime(bgStep.state, 240_000, true);
    state = step1.state;
    assert.equal(step1.shouldTriggerAd, false);
    assert.equal(state.elapsedActiveMs, 240_000);

    // Crosses 5-minute (300,000 ms) threshold
    const step2 = advanceActiveTime(state, 60_000, true);
    assert.equal(step2.shouldTriggerAd, true);
    assert.equal(step2.trigger, 'interval_5m');
    assert.equal(step2.state.elapsedActiveMs, AD_INTERVAL_MS);

    // Timer resets after ad finishes or is dismissed/failed
    const reset = resolveRewardedAdOutcome(step2.state, 'interval_5m', 'skipped');
    assert.deepEqual(reset.event, {
      ad_type: 'rewarded',
      trigger: 'interval_5m',
      grant_badmash_mode: false,
      next_interval_sec: 300,
    });
    assert.equal(reset.state.elapsedActiveMs, 0);
  });

  it('gates Normal -> Badmash behind rewarded ad completion, denies on skip, and falls back on error', () => {
    const initial = createInitialAdTriggerState();

    // Badmash -> Normal switches immediately without an ad
    const toNormal = evaluateModeSwitchRequest(initial, 'badmash');
    assert.equal(toNormal.action, 'switch_to_normal_immediately');

    // Normal -> Badmash triggers rewarded ad instead of switching immediately
    const toBadmash = evaluateModeSwitchRequest(initial, 'normal');
    assert.equal(toBadmash.action, 'trigger_rewarded_ad');
    assert.equal(toBadmash.trigger, 'mode_switch_badmash');
    assert.equal(toBadmash.state.pendingBadmashUnlock, true);

    // Skipped ad does NOT unlock Badmash Mode
    const skipped = resolveRewardedAdOutcome(toBadmash.state, 'mode_switch_badmash', 'skipped');
    assert.deepEqual(skipped.event, {
      ad_type: 'rewarded',
      trigger: 'mode_switch_badmash',
      grant_badmash_mode: false,
      next_interval_sec: 300,
    });

    // Completed ad unlocks Badmash Mode and resets 5m timer
    const retrySwitch = evaluateModeSwitchRequest(skipped.state, 'normal');
    const completed = resolveRewardedAdOutcome(
      retrySwitch.state,
      'mode_switch_badmash',
      'completed',
    );
    assert.deepEqual(completed.event, {
      ad_type: 'rewarded',
      trigger: 'mode_switch_badmash',
      grant_badmash_mode: true,
      next_interval_sec: 300,
    });

    // No-fill/error fallback unlocks Badmash Mode so the app never gets stuck
    const fallbackSwitch = evaluateModeSwitchRequest(completed.state, 'normal');
    const fallback = resolveRewardedAdOutcome(
      fallbackSwitch.state,
      'mode_switch_badmash',
      'fallback_no_fill_or_error',
    );
    assert.equal(fallback.event.grant_badmash_mode, true);
    assert.equal(fallback.event.next_interval_sec, 300);
  });
});
