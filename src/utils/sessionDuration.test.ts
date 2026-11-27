import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createDefaultSessionDurationState,
  evaluateSessionElapsed,
  formatSessionDuration,
  MAX_SESSION_DURATION_MS,
  sanitizePersistedSessionDurationState,
  upsertSessionDurationProgress,
} from './sessionDuration.ts';

describe('sessionDuration helper, persistence & 40-minute limit', () => {
  it('formats milliseconds into zero-padded MM:SS display', () => {
    assert.equal(formatSessionDuration(0), '00:00');
    assert.equal(formatSessionDuration(-500), '00:00');
    assert.equal(formatSessionDuration(9_000), '00:09');
    assert.equal(formatSessionDuration(65_000), '01:05');
    assert.equal(formatSessionDuration(39 * 60 * 1000 + 59_000), '39:59');
  });

  it('tracks elapsed time up to 40 minutes and signals termination + reset at 40:00', () => {
    const start = 1_000_000;
    assert.deepEqual(evaluateSessionElapsed(null, start + 10_000), {
      elapsedMs: 0,
      shouldTerminate: false,
    });

    assert.deepEqual(evaluateSessionElapsed(start, start + 39 * 60 * 1000 + 59_000), {
      elapsedMs: 39 * 60 * 1000 + 59_000,
      shouldTerminate: false,
    });

    assert.deepEqual(evaluateSessionElapsed(start, start + MAX_SESSION_DURATION_MS), {
      elapsedMs: 0,
      shouldTerminate: true,
    });
  });

  it('persists active elapsed time & cumulative history across app cuts and resets cycle at 40m', () => {
    const t0 = 2_000_000;
    let persisted = createDefaultSessionDurationState(t0);

    // Tick at 2 minutes before user cuts the app
    persisted = upsertSessionDurationProgress(persisted, {
      sessionId: 'dur_1',
      startedAt: t0,
      nowMs: t0 + 120_000,
      cycleElapsedMs: 120_000,
      segmentDurationMs: 120_000,
      reason: 'active',
    });
    assert.equal(persisted.activeElapsedMs, 120_000);
    assert.equal(persisted.totalLifetimeMs, 120_000);
    assert.equal(persisted.history.length, 1);

    // Simulate reopening after app cut (persisted JSON loaded & sanitized)
    const restored = sanitizePersistedSessionDurationState(JSON.parse(JSON.stringify(persisted)), t0 + 500_000);
    assert.equal(restored.activeElapsedMs, 120_000);
    assert.equal(restored.totalLifetimeMs, 120_000);
    assert.equal(restored.history[0].durationMs, 120_000);

    // Second session picks up remaining 38 minutes until 40m termination
    const afterReopen = upsertSessionDurationProgress(restored, {
      sessionId: 'dur_2',
      startedAt: t0 + 500_000,
      nowMs: t0 + 500_000 + (MAX_SESSION_DURATION_MS - 120_000),
      cycleElapsedMs: MAX_SESSION_DURATION_MS,
      segmentDurationMs: MAX_SESSION_DURATION_MS - 120_000,
      reason: 'limit_40m',
    });

    assert.equal(afterReopen.activeElapsedMs, 0);
    assert.equal(afterReopen.totalLifetimeMs, MAX_SESSION_DURATION_MS);
    assert.equal(afterReopen.history.length, 2);
    assert.equal(afterReopen.history[0].reason, 'limit_40m');
  });
});
