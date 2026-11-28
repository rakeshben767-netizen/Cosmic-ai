import type { CosmicMode, CosmicState } from '../types/cosmic.ts';

export type ResponseMood =
  | 'warm'
  | 'savage'
  | 'playful'
  | 'empathetic'
  | 'analytical'
  | 'alert';

export interface MoodVisualProfile {
  mood: ResponseMood;
  label: string;
  baseGradientClass: string;
  radialGlowClass: string;
  keyLightHex: string;
  rimLightHex: string;
}

export const MOOD_VISUAL_PROFILES: Record<ResponseMood, MoodVisualProfile> = {
  warm: {
    mood: 'warm',
    label: 'Warm & Friendly',
    baseGradientClass: 'bg-gradient-to-br from-[#081020] via-[#0d1830] to-[#080d1a]',
    radialGlowClass:
      'bg-[radial-gradient(circle_at_50%_42%,rgba(56,189,248,0.20),rgba(99,102,241,0.10)_46%,transparent_74%)]',
    keyLightHex: '#93c5fd',
    rimLightHex: '#38bdf8',
  },
  savage: {
    mood: 'savage',
    label: 'Fierce & Savage',
    baseGradientClass: 'bg-gradient-to-br from-[#14081c] via-[#1f0b24] to-[#0b0714]',
    radialGlowClass:
      'bg-[radial-gradient(circle_at_50%_42%,rgba(168,85,247,0.24),rgba(225,29,72,0.12)_48%,transparent_74%)]',
    keyLightHex: '#e9d5ff',
    rimLightHex: '#e879f9',
  },
  playful: {
    mood: 'playful',
    label: 'Playful & Witty',
    baseGradientClass: 'bg-gradient-to-br from-[#0e0f24] via-[#1a122e] to-[#0a0c19]',
    radialGlowClass:
      'bg-[radial-gradient(circle_at_50%_42%,rgba(245,158,11,0.18),rgba(192,132,252,0.16)_46%,transparent_74%)]',
    keyLightHex: '#fde68a',
    rimLightHex: '#c084fc',
  },
  empathetic: {
    mood: 'empathetic',
    label: 'Calm & Supportive',
    baseGradientClass: 'bg-gradient-to-br from-[#07151c] via-[#0c1e2a] to-[#080f18]',
    radialGlowClass:
      'bg-[radial-gradient(circle_at_50%_42%,rgba(45,212,191,0.20),rgba(56,189,248,0.10)_46%,transparent_74%)]',
    keyLightHex: '#99f6e4',
    rimLightHex: '#2dd4bf',
  },
  analytical: {
    mood: 'analytical',
    label: 'Focused & Analytical',
    baseGradientClass: 'bg-gradient-to-br from-[#071220] via-[#0a1d2d] to-[#070e19]',
    radialGlowClass:
      'bg-[radial-gradient(circle_at_50%_42%,rgba(14,165,233,0.22),rgba(16,185,129,0.11)_46%,transparent_74%)]',
    keyLightHex: '#bae6fd',
    rimLightHex: '#34d399',
  },
  alert: {
    mood: 'alert',
    label: 'Reconnecting / Alert',
    baseGradientClass: 'bg-gradient-to-br from-[#160b10] via-[#1c1014] to-[#0b0b12]',
    radialGlowClass:
      'bg-[radial-gradient(circle_at_50%_42%,rgba(245,158,11,0.18),rgba(239,68,68,0.11)_46%,transparent_74%)]',
    keyLightHex: '#fed7aa',
    rimLightHex: '#f87171',
  },
};

const EMPATHETIC_PATTERN =
  /\b(sorry|maaf|chinta|fikar|tension\s*mat|himmat|saath\s*hoon|sath\s*hoon|udaas|dukhi|sad|calm|breathe|relax|care|understand|theek\s*ho\s*jayega|everything\s*will\s*be\s*okay|don'?t\s*worry|support|hug|pyaar|dil\s*se|hausla)\b/i;

const SAVAGE_PATTERN =
  /\b(aukat|bewakoof|gando|gyan\s*pel|nalla|fattu|shaana|shaanapanti|waat\s*lag|kopch[ae]|dho\s*daala|satak\s*le|kat\s*le|bakwas|churan|bol\s*bachchan|kaccha\s*limbu|jholer|topi|sultana|roast|savage|hawa\s*aane\s*de|patli\s*gali|abe\s*saale)\b/i;

const PLAYFUL_PATTERN =
  /\b(haha|hehe|lol|lmao|joke|shayari|rap\b|cypher|verse|jhakaas|rapchik|kadak|dhasu|mast|mazaa|maza|funny|comedy|meme|bhidu|bantai|lala|chela|swag|party)\b/i;

const ANALYTICAL_PATTERN =
  /(₹|\$|°c|\bdegrees?\b|\b24k\b|\b22k\b|\bgold\b|\bsilver\b|\bipl\b|\bscore(?:card)?\b|\bruns?\b|\bwickets?\b|\bovers?\b|\bweather\b|\btemperature\b|\bforecast\b|\bhumidity\b|\brain\b|\bpercent\b|%|\bnews\b|\bsource\b|\bverified\b|\bprice\b|\brate\b|\bmarket\b|\bnifty\b|\bsensex\b|\bbitcoin\b|\blogic\b|\breason\b|\bkyunki\b|\bbecause\b|\bcalculate\b|\balgorithm\b|\bcode\b)/i;

export function detectResponseMood(params: {
  mode: CosmicMode;
  cosmicState: CosmicState;
  latestCosmicText?: string | null;
  latestUserText?: string | null;
}): MoodVisualProfile {
  const { mode, cosmicState, latestCosmicText, latestUserText } = params;

  if (cosmicState === 'ERROR' || cosmicState === 'RECONNECTING') {
    return MOOD_VISUAL_PROFILES.alert;
  }

  const cosmicLower = (latestCosmicText || '').trim();
  const userLower = (latestUserText || '').trim();
  const combined = `${cosmicLower} ${userLower}`.trim();

  // Empathetic/supportive mood takes precedence when user or Cosmic is expressing care/distress
  if (EMPATHETIC_PATTERN.test(cosmicLower) || EMPATHETIC_PATTERN.test(userLower)) {
    return MOOD_VISUAL_PROFILES.empathetic;
  }

  // Live data, facts, prices, sports scores, weather, or technical logic
  if (ANALYTICAL_PATTERN.test(cosmicLower) || ANALYTICAL_PATTERN.test(userLower)) {
    return MOOD_VISUAL_PROFILES.analytical;
  }

  // Fierce roast / attitude cues
  if (SAVAGE_PATTERN.test(cosmicLower)) {
    return MOOD_VISUAL_PROFILES.savage;
  }

  // Playful, witty, shayari, rap, or comedy cues
  if (PLAYFUL_PATTERN.test(combined)) {
    return MOOD_VISUAL_PROFILES.playful;
  }

  // Personality baseline fallback
  if (mode === 'badmash') {
    return MOOD_VISUAL_PROFILES.savage;
  }
  return MOOD_VISUAL_PROFILES.warm;
}
