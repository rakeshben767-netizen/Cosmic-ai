import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { classifyLatency } from './latency.ts';

describe('classifyLatency color-coded network delay helper', () => {
  it('returns idle standby status when disconnected or latency is missing', () => {
    const idleMissing = classifyLatency(null, true);
    assert.equal(idleMissing.tier, 'idle');
    assert.equal(idleMissing.label, '-- ms');
    assert.equal(idleMissing.meaning, 'Standby');
    assert.equal(classifyLatency(80, false).tier, 'idle');
  });

  it('classifies <150ms as green Best Net, 150-350ms as yellow Medium, and >350ms as red Low', () => {
    const fast = classifyLatency(95, true);
    assert.equal(fast.tier, 'good');
    assert.equal(fast.label, '95ms');
    assert.equal(fast.meaning, 'Best Net');
    assert.match(fast.dotClass, /emerald/);

    const mod = classifyLatency(240, true);
    assert.equal(mod.tier, 'moderate');
    assert.equal(mod.label, '240ms');
    assert.equal(mod.meaning, 'Medium');
    assert.match(mod.dotClass, /yellow/);

    const slow = classifyLatency(512, true);
    assert.equal(slow.tier, 'high');
    assert.equal(slow.label, '512ms');
    assert.equal(slow.meaning, 'Low');
    assert.match(slow.dotClass, /red/);
  });
});
