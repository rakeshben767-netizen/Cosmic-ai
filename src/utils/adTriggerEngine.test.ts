import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  AD_INTERVAL_MS,
  AD_INTERVAL_SEC,
  advanceActiveTime,
  createInitialAdTriggerState,
  evaluateAppLoadTrigger,
  evaluatePowerOnRequest,
  resolveRewardedAdOutcome,
} from './adTriggerEngine.ts';

describe('adTriggerEngine Rewarded-only state rules', () => {
  it('triggers a rewarded ad once on app load and resets 4m timer on resolution', () => {
    const initial = createInitialAdTriggerState();
    const first = evaluateAppLoadTrigger(initial);
    assert.equal(first.shouldTriggerAd, true);
    assert.equal(first.trigger, 'app_load');
    assert.equal(first.state.isAdActive, true);

    const second = evaluateAppLoadTrigger(first.state);
    assert.equal(second.shouldTriggerAd, false);

    const resolved = resolveRewardedAdOutcome(first.state, 'app_load', 'completed', true);
    assert.deepEqual(resolved.event, {
      ad_type: 'rewarded',
      trigger: 'app_load',
      grant_power_on: false,
      grant_badmash_mode: false,
      next_interval_sec: AD_INTERVAL_SEC,
    });
    assert.equal(resolved.state.elapsedActiveMs, 0);
    assert.equal(resolved.state.isAdActive, false);
  });

  it('tracks active elapsed time across modes and fires interval_4m every 240,000 ms', () => {
    let state = createInitialAdTriggerState();

    // Hidden/background time does not advance the active timer
    const bgStep = advanceActiveTime(state, 120_000, false);
    assert.equal(bgStep.shouldTriggerAd, false);
    assert.equal(bgStep.state.elapsedActiveMs, 0);

    // 3 minutes visible
    const step1 = advanceActiveTime(bgStep.state, 180_000, true);
    state = step1.state;
    assert.equal(step1.shouldTriggerAd, false);
    assert.equal(state.elapsedActiveMs, 180_000);

    // Crosses 4-minute (240,000 ms) threshold
    const step2 = advanceActiveTime(state, 60_000, true);
    assert.equal(step2.shouldTriggerAd, true);
    assert.equal(step2.trigger, 'interval_4m');
    assert.equal(step2.state.elapsedActiveMs, AD_INTERVAL_MS);

    // Timer resets after ad finishes or is dismissed/failed
    const reset = resolveRewardedAdOutcome(step2.state, 'interval_4m', 'skipped', true);
    assert.deepEqual(reset.event, {
      ad_type: 'rewarded',
      trigger: 'interval_4m',
      grant_power_on: false,
      grant_badmash_mode: false,
      next_interval_sec: 240,
    });
    assert.equal(reset.state.elapsedActiveMs, 0);
  });

  it('strictly gates Power On on Android APK behind completed rewarded ad (never unlocks on not_loaded/skip/error)', () => {
    const initial = createInitialAdTriggerState();

    const powerReq = evaluatePowerOnRequest(initial);
    assert.equal(powerReq.action, 'trigger_rewarded_ad');
    assert.equal(powerReq.trigger, 'power_on');
    assert.equal(powerReq.state.pendingPowerOn, true);

    // Duplicate tap while pending is ignored
    const duplicate = evaluatePowerOnRequest(powerReq.state);
    assert.equal(duplicate.action, 'ignore_already_pending');

    // Ad not loaded -> MUST NOT power on
    const notLoaded = resolveRewardedAdOutcome(powerReq.state, 'power_on', 'ad_not_loaded', true);
    assert.equal(notLoaded.event.grant_power_on, false);
    assert.equal(notLoaded.state.pendingPowerOn, false);

    // Skipped ad -> MUST NOT power on
    const req2 = evaluatePowerOnRequest(notLoaded.state);
    const skipped = resolveRewardedAdOutcome(req2.state, 'power_on', 'skipped', true);
    assert.equal(skipped.event.grant_power_on, false);

    // Show failure -> MUST NOT power on
    const req3 = evaluatePowerOnRequest(skipped.state);
    const showFailed = resolveRewardedAdOutcome(req3.state, 'power_on', 'show_failed', true);
    assert.equal(showFailed.event.grant_power_on, false);

    // Fallback no fill on native Android -> MUST NOT power on
    const req4 = evaluatePowerOnRequest(showFailed.state);
    const nativeFallback = resolveRewardedAdOutcome(
      req4.state,
      'power_on',
      'fallback_no_fill_or_error',
      true,
    );
    assert.equal(nativeFallback.event.grant_power_on, false);

    // Completed rewarded ad -> grants Power On and resets 4m timer
    const req5 = evaluatePowerOnRequest(nativeFallback.state);
    const completed = resolveRewardedAdOutcome(req5.state, 'power_on', 'completed', true);
    assert.deepEqual(completed.event, {
      ad_type: 'rewarded',
      trigger: 'power_on',
      grant_power_on: true,
      grant_badmash_mode: false,
      next_interval_sec: 240,
    });
  });

  it('allows web browser testing fallback when no native Android SDK bridge is present', () => {
    const initial = createInitialAdTriggerState();
    const req = evaluatePowerOnRequest(initial);
    const webFallback = resolveRewardedAdOutcome(
      req.state,
      'power_on',
      'fallback_no_fill_or_error',
      false,
    );
    assert.equal(webFallback.event.grant_power_on, true);
  });
});
