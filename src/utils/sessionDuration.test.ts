import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  evaluateSessionElapsed,
  formatSessionDuration,
  MAX_SESSION_DURATION_MS,
} from './sessionDuration.ts';

describe('sessionDuration helper & 40-minute limit', () => {
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
});
