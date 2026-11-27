export const MAX_SESSION_DURATION_MS = 40 * 60 * 1000;

export function formatSessionDuration(durationMs: number): string {
  const safeMs = Number.isFinite(durationMs) && durationMs > 0 ? durationMs : 0;
  const totalSeconds = Math.floor(safeMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  return `${mm}:${ss}`;
}

export function evaluateSessionElapsed(
  startedAtMs: number | null,
  nowMs: number,
): {
  elapsedMs: number;
  shouldTerminate: boolean;
} {
  if (startedAtMs === null || !Number.isFinite(startedAtMs) || nowMs <= startedAtMs) {
    return { elapsedMs: 0, shouldTerminate: false };
  }
  const elapsedMs = nowMs - startedAtMs;
  if (elapsedMs >= MAX_SESSION_DURATION_MS) {
    return { elapsedMs: 0, shouldTerminate: true };
  }
  return { elapsedMs, shouldTerminate: false };
}
