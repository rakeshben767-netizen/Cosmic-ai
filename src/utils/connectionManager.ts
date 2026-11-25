export const RECONNECT_BACKOFF_SCHEDULE_MS = [1000, 2000, 4000, 8000, 16000] as const;
export const MAX_AUTO_RECONNECT_ATTEMPTS = RECONNECT_BACKOFF_SCHEDULE_MS.length;

export function computeReconnectDelayMs(
  retryAttemptIndex: number,
  randomFn: () => number = Math.random,
): number {
  const clampedIdx = Math.max(
    0,
    Math.min(retryAttemptIndex, RECONNECT_BACKOFF_SCHEDULE_MS.length - 1),
  );
  const base = RECONNECT_BACKOFF_SCHEDULE_MS[clampedIdx];
  // Add +/-20% jitter so mobile reconnects never stampede
  const jitterFactor = 0.8 + randomFn() * 0.4;
  return Math.round(base * jitterFactor);
}

export interface AutoReconnectCheckInput {
  userWantsLive: boolean;
  retryCount: number;
  maxRetries?: number;
  errorCode?: string | null;
  retryable?: boolean;
}

const NON_RETRYABLE_CODES = new Set([
  'MISSING_API_KEY',
  'API_KEY_OR_CONFIG_ERROR',
  'BAD_MESSAGE',
]);

export function shouldAutoReconnect(input: AutoReconnectCheckInput): boolean {
  if (!input.userWantsLive) return false;
  const maxRetries = input.maxRetries ?? MAX_AUTO_RECONNECT_ATTEMPTS;
  if (input.retryCount >= maxRetries) return false;
  if (input.retryable === false) return false;
  if (input.errorCode && NON_RETRYABLE_CODES.has(input.errorCode)) return false;
  return true;
}

export function formatConnectionFailureReason(params: {
  isOnline: boolean;
  code?: string | null;
  serverMessage?: string | null;
  closeCode?: number | null;
  closeReason?: string | null;
  healthError?: string | null;
}): string {
  if (!params.isOnline) {
    return 'Internet connection is offline. Reconnect to Wi-Fi or mobile data and Cosmic AI will resume automatically.';
  }
  if (params.code === 'MISSING_API_KEY' || params.code === 'API_KEY_OR_CONFIG_ERROR') {
    return (
      params.serverMessage ||
      'Gemini Live API key or permission configuration error on the backend server.'
    );
  }
  if (params.code === 'API_QUOTA_OR_RATE_LIMIT') {
    return 'Gemini Live API quota or rate limit was reached. Please wait a moment and try again.';
  }
  if (params.healthError) {
    return `Voice backend check failed (${params.healthError}). Tap Power On to retry.`;
  }
  if (params.serverMessage) {
    return `Voice connection interrupted (${params.serverMessage}). Tap Power On to reconnect.`;
  }
  if (params.closeCode) {
    return `Voice WebSocket closed (code ${params.closeCode}${
      params.closeReason ? `: ${params.closeReason}` : ''
    }). Tap Power On to reconnect.`;
  }
  return 'Voice connection could not be maintained after automatic retries. Tap Power On to retry.';
}

export interface BackendHealthResult {
  reachable: boolean;
  latencyMs: number;
  hasApiKey?: boolean;
  error?: string;
}

export async function probeVoiceBackendHealth(
  healthUrl: string,
  timeoutMs = 5500,
  fetchFn: typeof fetch = fetch,
): Promise<BackendHealthResult> {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetchFn(healthUrl, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
    });
    const latencyMs = Date.now() - startedAt;
    if (!res.ok) {
      return {
        reachable: false,
        latencyMs,
        error: `HTTP ${res.status}`,
      };
    }
    const json = (await res.json()) as { ok?: boolean; hasApiKey?: boolean };
    return {
      reachable: Boolean(json?.ok !== false),
      latencyMs,
      hasApiKey: typeof json?.hasApiKey === 'boolean' ? json.hasApiKey : undefined,
    };
  } catch (err) {
    return {
      reachable: false,
      latencyMs: Date.now() - startedAt,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}
