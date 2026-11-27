import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { classifyLatency } from './latency.ts';

describe('classifyLatency color-coded network delay helper', () => {
  it('returns idle muted status when disconnected or latency is missing', () => {
    assert.equal(classifyLatency(null, true).tier, 'idle');
    assert.equal(classifyLatency(null, true).label, '-- ms');
    assert.equal(classifyLatency(80, false).tier, 'idle');
  });

  it('classifies <150ms as green good, 150-350ms as amber moderate, and >350ms as red high', () => {
    const fast = classifyLatency(95, true);
    assert.equal(fast.tier, 'good');
    assert.equal(fast.label, '95ms');
    assert.match(fast.dotClass, /emerald/);

    const mod = classifyLatency(240, true);
    assert.equal(mod.tier, 'moderate');
    assert.equal(mod.label, '240ms');
    assert.match(mod.dotClass, /amber/);

    const slow = classifyLatency(512, true);
    assert.equal(slow.tier, 'high');
    assert.equal(slow.label, '512ms');
    assert.match(slow.dotClass, /red/);
  });
});
