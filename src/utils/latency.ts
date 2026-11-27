export type LatencyTier = 'idle' | 'good' | 'moderate' | 'high';

export interface LatencyStatus {
  tier: LatencyTier;
  label: string;
  dotClass: string;
  textClass: string;
}

export function classifyLatency(latencyMs: number | null | undefined, isLive = true): LatencyStatus {
  if (!isLive || typeof latencyMs !== 'number' || !Number.isFinite(latencyMs) || latencyMs < 0) {
    return {
      tier: 'idle',
      label: '-- ms',
      dotClass: 'bg-slate-600',
      textClass: 'text-slate-500',
    };
  }

  const rounded = Math.max(1, Math.round(latencyMs));
  if (rounded < 150) {
    return {
      tier: 'good',
      label: `${rounded}ms`,
      dotClass: 'bg-emerald-400',
      textClass: 'text-emerald-300',
    };
  }
  if (rounded <= 350) {
    return {
      tier: 'moderate',
      label: `${rounded}ms`,
      dotClass: 'bg-amber-300',
      textClass: 'text-amber-300',
    };
  }
  return {
    tier: 'high',
    label: `${rounded}ms`,
    dotClass: 'bg-red-400',
    textClass: 'text-red-300',
  };
}
