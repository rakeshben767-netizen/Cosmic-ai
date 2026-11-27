export const MAX_SESSION_DURATION_MS = 40 * 60 * 1000;
export const SESSION_DURATION_STORAGE_KEY = 'cosmic_session_duration_state_v1';
export const MAX_DURATION_HISTORY_ITEMS = 30;

export type SessionEndReason = 'active' | 'user_disconnect' | 'limit_40m';

export interface SessionDurationHistoryEntry {
  id: string;
  startedAt: number;
  endedAt: number;
  durationMs: number;
  reason: SessionEndReason;
}

export interface PersistedSessionDurationState {
  activeSessionId: string | null;
  activeStartedAt: number | null;
  activeElapsedMs: number;
  totalLifetimeMs: number;
  history: SessionDurationHistoryEntry[];
  updatedAt: number;
}

export function createDefaultSessionDurationState(nowMs = Date.now()): PersistedSessionDurationState {
  return {
    activeSessionId: null,
    activeStartedAt: null,
    activeElapsedMs: 0,
    totalLifetimeMs: 0,
    history: [],
    updatedAt: nowMs,
  };
}

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

export function sanitizePersistedSessionDurationState(
  raw: unknown,
  nowMs = Date.now(),
): PersistedSessionDurationState {
  if (!raw || typeof raw !== 'object') {
    return createDefaultSessionDurationState(nowMs);
  }
  const candidate = raw as Partial<PersistedSessionDurationState>;
  const activeElapsedMs =
    typeof candidate.activeElapsedMs === 'number' &&
    Number.isFinite(candidate.activeElapsedMs) &&
    candidate.activeElapsedMs > 0 &&
    candidate.activeElapsedMs < MAX_SESSION_DURATION_MS
      ? Math.floor(candidate.activeElapsedMs)
      : 0;

  const history = Array.isArray(candidate.history)
    ? candidate.history
        .filter(
          (item): item is SessionDurationHistoryEntry =>
            Boolean(item) &&
            typeof item.id === 'string' &&
            typeof item.startedAt === 'number' &&
            typeof item.endedAt === 'number' &&
            typeof item.durationMs === 'number' &&
            Number.isFinite(item.durationMs) &&
            item.durationMs >= 0,
        )
        .slice(0, MAX_DURATION_HISTORY_ITEMS)
    : [];

  const computedTotal = history.reduce((sum, item) => sum + item.durationMs, 0);
  const totalLifetimeMs =
    typeof candidate.totalLifetimeMs === 'number' &&
    Number.isFinite(candidate.totalLifetimeMs) &&
    candidate.totalLifetimeMs >= computedTotal
      ? Math.floor(candidate.totalLifetimeMs)
      : computedTotal;

  return {
    activeSessionId: typeof candidate.activeSessionId === 'string' ? candidate.activeSessionId : null,
    activeStartedAt:
      typeof candidate.activeStartedAt === 'number' && Number.isFinite(candidate.activeStartedAt)
        ? candidate.activeStartedAt
        : null,
    activeElapsedMs,
    totalLifetimeMs,
    history,
    updatedAt:
      typeof candidate.updatedAt === 'number' && Number.isFinite(candidate.updatedAt)
        ? candidate.updatedAt
        : nowMs,
  };
}

export function loadPersistedSessionDurationState(): PersistedSessionDurationState {
  if (typeof window === 'undefined') {
    return createDefaultSessionDurationState();
  }
  try {
    const raw = window.localStorage.getItem(SESSION_DURATION_STORAGE_KEY);
    if (!raw) return createDefaultSessionDurationState();
    return sanitizePersistedSessionDurationState(JSON.parse(raw));
  } catch {
    return createDefaultSessionDurationState();
  }
}

export function savePersistedSessionDurationState(
  state: PersistedSessionDurationState,
): PersistedSessionDurationState {
  const sanitized = sanitizePersistedSessionDurationState(state, state.updatedAt);
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(SESSION_DURATION_STORAGE_KEY, JSON.stringify(sanitized));
    } catch {
      // ignore storage quota/privacy errors
    }
  }
  return sanitized;
}

/**
 * Upserts the ongoing/ended session duration entry into persistent history and updates
 * cumulative lifetime duration without double-counting when called repeatedly on ticks.
 */
export function upsertSessionDurationProgress(
  prev: PersistedSessionDurationState,
  params: {
    sessionId: string;
    startedAt: number;
    nowMs: number;
    cycleElapsedMs: number;
    segmentDurationMs: number;
    reason: SessionEndReason;
  },
): PersistedSessionDurationState {
  const safeSegmentMs = Math.max(0, Math.floor(params.segmentDurationMs));
  const safeCycleMs =
    params.reason === 'limit_40m'
      ? 0
      : Math.max(0, Math.min(MAX_SESSION_DURATION_MS - 1, Math.floor(params.cycleElapsedMs)));

  const existingIndex = prev.history.findIndex((item) => item.id === params.sessionId);
  const previousRecordedMs = existingIndex >= 0 ? prev.history[existingIndex].durationMs : 0;
  const deltaMs = Math.max(0, safeSegmentMs - previousRecordedMs);

  const updatedEntry: SessionDurationHistoryEntry = {
    id: params.sessionId,
    startedAt: params.startedAt,
    endedAt: params.nowMs,
    durationMs: safeSegmentMs,
    reason: params.reason,
  };

  const nextHistory =
    existingIndex >= 0
      ? prev.history.map((item, idx) => (idx === existingIndex ? updatedEntry : item))
      : [updatedEntry, ...prev.history].slice(0, MAX_DURATION_HISTORY_ITEMS);

  return {
    activeSessionId: params.reason === 'limit_40m' ? null : params.sessionId,
    activeStartedAt: params.reason === 'limit_40m' ? null : params.startedAt,
    activeElapsedMs: safeCycleMs,
    totalLifetimeMs: prev.totalLifetimeMs + deltaMs,
    history: nextHistory,
    updatedAt: params.nowMs,
  };
}
