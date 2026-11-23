import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  AD_FREE_DURATION_MS,
  AD_FREE_TARGET_ADS,
  formatRemainingAdFree,
  getAdPassStatus,
  PERIODIC_AD_INTERVAL_MS,
  recordWatchedPassAd,
} from './adPass.ts';

describe('adPass 20-ads for 12h ad-free logic', () => {
  it('uses exact 20 ads, 12 hours, and 4 minute constants', () => {
    assert.equal(AD_FREE_TARGET_ADS, 20);
    assert.equal(AD_FREE_DURATION_MS, 12 * 60 * 60 * 1000);
    assert.equal(PERIODIC_AD_INTERVAL_MS, 4 * 60 * 1000);
  });

  it('unlocks 12-hour ad-free pass on the 20th watched ad and expires cleanly after 12 hours', () => {
    const start = 1_700_000_000_000;
    let state = { watchedCount: 0, adFreeUntil: 0 };

    for (let i = 1; i <= 19; i++) {
      state = recordWatchedPassAd(state, start + i * 1000);
      const st = getAdPassStatus(state, start + i * 1000);
      assert.equal(st.watchedCount, i);
      assert.equal(st.isAdFreeActive, false);
    }

    const t20 = start + 20_000;
    state = recordWatchedPassAd(state, t20);
    const activeStatus = getAdPassStatus(state, t20 + 60_000);
    assert.equal(activeStatus.isAdFreeActive, true);
    assert.equal(activeStatus.watchedCount, 20);
    assert.equal(activeStatus.adFreeUntil, t20 + AD_FREE_DURATION_MS);
    assert.equal(formatRemainingAdFree(65 * 60 * 1000), '1h 05m');

    // Immediately after 12 hours expire, periodic ads resume and progress resets to 0
    const after12h = t20 + AD_FREE_DURATION_MS + 1;
    const expiredStatus = getAdPassStatus(state, after12h);
    assert.equal(expiredStatus.isAdFreeActive, false);
    assert.equal(expiredStatus.watchedCount, 0);
    assert.equal(expiredStatus.adFreeUntil, 0);
  });
});
