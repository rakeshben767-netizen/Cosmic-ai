import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeReconnectDelayMs,
  formatConnectionFailureReason,
  MAX_AUTO_RECONNECT_ATTEMPTS,
  probeVoiceBackendHealth,
  shouldAutoReconnect,
} from './connectionManager.ts';

describe('connectionManager resilience & exponential backoff', () => {
  it('computes jittered exponential backoff around 1s, 2s, 4s, 8s, 16s', () => {
    // At deterministic midpoint randomFn = 0.5 -> factor is 1.0 (exact schedule)
    assert.equal(computeReconnectDelayMs(0, () => 0.5), 1000);
    assert.equal(computeReconnectDelayMs(1, () => 0.5), 2000);
    assert.equal(computeReconnectDelayMs(2, () => 0.5), 4000);
    assert.equal(computeReconnectDelayMs(3, () => 0.5), 8000);
    assert.equal(computeReconnectDelayMs(4, () => 0.5), 16000);
    // Clamps beyond max step
    assert.equal(computeReconnectDelayMs(9, () => 0.5), 16000);
    // Jitter bounds [0.8, 1.2]
    assert.equal(computeReconnectDelayMs(0, () => 0), 800);
    assert.equal(computeReconnectDelayMs(0, () => 1), 1200);
  });

  it('allows automatic reconnection only on retryable failures while powered on', () => {
    assert.equal(
      shouldAutoReconnect({
        userWantsLive: true,
        retryCount: 0,
        errorCode: 'TRANSIENT_CONNECTION_DROP',
        retryable: true,
      }),
      true,
    );
    assert.equal(
      shouldAutoReconnect({
        userWantsLive: false,
        retryCount: 0,
        errorCode: 'TRANSIENT_CONNECTION_DROP',
      }),
      false,
    );
    assert.equal(
      shouldAutoReconnect({
        userWantsLive: true,
        retryCount: MAX_AUTO_RECONNECT_ATTEMPTS,
        errorCode: 'TRANSIENT_CONNECTION_DROP',
      }),
      false,
    );
    assert.equal(
      shouldAutoReconnect({
        userWantsLive: true,
        retryCount: 0,
        errorCode: 'MISSING_API_KEY',
        retryable: false,
      }),
      false,
    );
  });

  it('probes backend health latency cleanly and handles offline errors honestly', async () => {
    const okRes = await probeVoiceBackendHealth('http://localhost/api/health', 2000, async () =>
      new Response(JSON.stringify({ ok: true, hasApiKey: true }), { status: 200 }),
    );
    assert.equal(okRes.reachable, true);
    assert.equal(okRes.hasApiKey, true);

    const failRes = await probeVoiceBackendHealth('http://localhost/api/health', 2000, async () => {
      throw new Error('ECONNREFUSED');
    });
    assert.equal(failRes.reachable, false);
    assert.match(failRes.error ?? '', /ECONNREFUSED/);

    const offlineMsg = formatConnectionFailureReason({ isOnline: false });
    assert.match(offlineMsg, /offline/i);
  });
});
