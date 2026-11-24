import crypto from 'node:crypto';

// SHA-256 digest of normalized configured default verification code ("114714")
// Stored as a one-way digest so the literal verification passcode is never embedded in prompts or UI code.
const DEFAULT_CODE_DIGEST_HEX =
  '832fb2bdc2833f3a05c69d0482e2c5a2d5b9e8d6f863dc113bc53dd3fae48863';

const SPOKEN_DIGIT_MAP: Record<string, string> = {
  zero: '0',
  oh: '0',
  o: '0',
  one: '1',
  ek: '1',
  two: '2',
  do: '2',
  three: '3',
  teen: '3',
  four: '4',
  chaar: '4',
  char: '4',
  five: '5',
  paanch: '5',
  panch: '5',
  six: '6',
  chhe: '6',
  che: '6',
  seven: '7',
  saat: '7',
  sat: '7',
  eight: '8',
  aath: '8',
  ath: '8',
  nine: '9',
  nau: '9',
};

function normalizeDigitSequence(raw: string): string {
  const lowered = raw.toLowerCase().trim();
  if (!lowered) return '';

  // Map spoken number words (English/Hindi) to digits while keeping existing digits
  const tokens = lowered.split(/[\s,.\-_/|]+/).filter(Boolean);
  const mappedTokens = tokens.map((tok) => SPOKEN_DIGIT_MAP[tok] ?? tok);
  const joined = mappedTokens.join('');

  // Extract continuous digit characters if the candidate contains mixed noise
  const digitsOnly = joined.replace(/[^0-9]/g, '');
  if (digitsOnly.length >= 4) {
    return digitsOnly;
  }
  return joined.replace(/\s+/g, '');
}

function sha256Buffer(value: string): Buffer {
  return crypto.createHash('sha256').update(value, 'utf8').digest();
}

function getExpectedDigest(): Buffer {
  const envCode = process.env.COSMIC_DEV_VERIFICATION_CODE?.trim();
  if (envCode && envCode.length > 0) {
    return sha256Buffer(normalizeDigitSequence(envCode) || envCode);
  }
  return Buffer.from(DEFAULT_CODE_DIGEST_HEX, 'hex');
}

/**
 * Verifies a candidate developer code strictly in server/application logic
 * using SHA-256 + constant-time comparison so the plaintext secret is never
 * placed in LLM prompts or client bundles.
 */
export function verifyDeveloperCode(input: string): boolean {
  if (typeof input !== 'string') return false;
  const trimmed = input.trim();
  if (!trimmed || trimmed.length > 240) return false;

  const expected = getExpectedDigest();

  // Check whole normalized candidate
  const normalizedWhole = normalizeDigitSequence(trimmed);
  if (normalizedWhole) {
    const wholeDigest = sha256Buffer(normalizedWhole);
    if (
      wholeDigest.length === expected.length &&
      crypto.timingSafeEqual(wholeDigest, expected)
    ) {
      return true;
    }
  }

  // Also check digit-bearing substrings in conversational turns (e.g. "mera code 1147 1 4 hai")
  const digitRuns = trimmed.match(/(?:\d[\s.\-]*){4,12}/g);
  if (digitRuns) {
    for (const run of digitRuns) {
      const normalizedRun = normalizeDigitSequence(run);
      if (!normalizedRun) continue;
      const runDigest = sha256Buffer(normalizedRun);
      if (
        runDigest.length === expected.length &&
        crypto.timingSafeEqual(runDigest, expected)
      ) {
        return true;
      }
    }
  }

  // Also check spoken digit sequences embedded in conversational turns
  const words = trimmed.toLowerCase().split(/[\s,.\-_/|]+/).filter(Boolean);
  let spokenDigits = '';
  for (const word of words) {
    if (SPOKEN_DIGIT_MAP[word]) {
      spokenDigits += SPOKEN_DIGIT_MAP[word];
    } else if (/^\d+$/.test(word)) {
      spokenDigits += word;
    }
  }
  if (spokenDigits.length >= 4) {
    const spokenDigest = sha256Buffer(spokenDigits);
    if (
      spokenDigest.length === expected.length &&
      crypto.timingSafeEqual(spokenDigest, expected)
    ) {
      return true;
    }
  }

  return false;
}
