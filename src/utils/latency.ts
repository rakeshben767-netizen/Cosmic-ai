export type LatencyTier = 'idle' | 'good' | 'moderate' | 'high';

export interface LatencyStatus {
  tier: LatencyTier;
  label: string;
  meaning: 'Standby' | 'Best Net' | 'Medium' | 'Low';
  dotClass: string;
  textClass: string;
}

export function classifyLatency(latencyMs: number | null | undefined, isLive = true): LatencyStatus {
  if (!isLive || typeof latencyMs !== 'number' || !Number.isFinite(latencyMs) || latencyMs < 0) {
    return {
      tier: 'idle',
      label: '-- ms',
      meaning: 'Standby',
      dotClass: 'bg-slate-600',
      textClass: 'text-slate-500',
    };
  }

  const rounded = Math.max(1, Math.round(latencyMs));
  if (rounded < 150) {
    return {
      tier: 'good',
      label: `${rounded}ms`,
      meaning: 'Best Net',
      dotClass: 'bg-emerald-400',
      textClass: 'text-emerald-300',
    };
  }
  if (rounded <= 350) {
    return {
      tier: 'moderate',
      label: `${rounded}ms`,
      meaning: 'Medium',
      dotClass: 'bg-yellow-400',
      textClass: 'text-yellow-300',
    };
  }
  return {
    tier: 'high',
    label: `${rounded}ms`,
    meaning: 'Low',
    dotClass: 'bg-red-500',
    textClass: 'text-red-300',
  };
}
