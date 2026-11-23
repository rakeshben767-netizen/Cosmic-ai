export const AD_FREE_TARGET_ADS = 20;
export const AD_FREE_DURATION_MS = 12 * 60 * 60 * 1000;
export const PERIODIC_AD_INTERVAL_MS = 4 * 60 * 1000;
export const AD_PASS_STORAGE_KEY = 'cosmic_ad_pass_v1';

export interface AdPassStorageState {
  watchedCount: number;
  adFreeUntil: number;
}

export interface AdPassStatus {
  watchedCount: number;
  targetCount: number;
  isAdFreeActive: boolean;
  adFreeUntil: number;
  remainingMs: number;
  remainingLabel: string;
}

export function normalizeAdPassState(
  raw: Partial<AdPassStorageState> | null | undefined,
  now: number = Date.now(),
): AdPassStorageState {
  const adFreeUntil =
    typeof raw?.adFreeUntil === 'number' && Number.isFinite(raw.adFreeUntil)
      ? Math.max(0, raw.adFreeUntil)
      : 0;

  // After 12 hours expire, reset progress so 4-minute ads & 20-ad challenge restart cleanly
  if (adFreeUntil > 0 && now >= adFreeUntil) {
    return { watchedCount: 0, adFreeUntil: 0 };
  }

  const watchedCount =
    typeof raw?.watchedCount === 'number' && Number.isFinite(raw.watchedCount)
      ? Math.min(AD_FREE_TARGET_ADS, Math.max(0, Math.floor(raw.watchedCount)))
      : 0;

  return { watchedCount, adFreeUntil };
}

export function loadAdPassState(now: number = Date.now()): AdPassStorageState {
  if (typeof window === 'undefined') {
    return { watchedCount: 0, adFreeUntil: 0 };
  }
  try {
    const raw = window.localStorage.getItem(AD_PASS_STORAGE_KEY);
    if (!raw) return { watchedCount: 0, adFreeUntil: 0 };
    const parsed = JSON.parse(raw) as Partial<AdPassStorageState>;
    const normalized = normalizeAdPassState(parsed, now);
    saveAdPassState(normalized);
    return normalized;
  } catch {
    return { watchedCount: 0, adFreeUntil: 0 };
  }
}

export function saveAdPassState(state: AdPassStorageState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(AD_PASS_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore storage quota errors
  }
}

export function recordWatchedPassAd(
  current: AdPassStorageState,
  now: number = Date.now(),
): AdPassStorageState {
  const base = normalizeAdPassState(current, now);
  if (base.adFreeUntil > now) {
    return base;
  }
  const nextCount = Math.min(AD_FREE_TARGET_ADS, base.watchedCount + 1);
  if (nextCount >= AD_FREE_TARGET_ADS) {
    return {
      watchedCount: AD_FREE_TARGET_ADS,
      adFreeUntil: now + AD_FREE_DURATION_MS,
    };
  }
  return {
    watchedCount: nextCount,
    adFreeUntil: 0,
  };
}

export function formatRemainingAdFree(ms: number): string {
  if (ms <= 0) return '0m';
  const totalSeconds = Math.ceil(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
  }
  return `${seconds}s`;
}

export function getAdPassStatus(
  raw: AdPassStorageState,
  now: number = Date.now(),
): AdPassStatus {
  const state = normalizeAdPassState(raw, now);
  const isAdFreeActive = state.adFreeUntil > now;
  const remainingMs = isAdFreeActive ? state.adFreeUntil - now : 0;
  return {
    watchedCount: state.watchedCount,
    targetCount: AD_FREE_TARGET_ADS,
    isAdFreeActive,
    adFreeUntil: state.adFreeUntil,
    remainingMs,
    remainingLabel: formatRemainingAdFree(remainingMs),
  };
}
