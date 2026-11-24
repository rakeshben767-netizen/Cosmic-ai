import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCosmicSystemInstruction,
  COSMIC_BADMASH_ENTRANCE_CUE,
  getVoiceNameForMode,
} from './cosmicPrompts.ts';

describe('cosmicPrompts Badmash & Normal mode configuration', () => {
  it('assigns Charon voice to badmash mode and Zephyr to normal mode', () => {
    assert.equal(getVoiceNameForMode('badmash'), 'Charon');
    assert.equal(getVoiceNameForMode('normal'), 'Zephyr');
  });

  it('includes the baap-level roast engine, Bambaiya slang, developer code 1147, and safety bounds in badmash mode', () => {
    const badmashPrompt = buildCosmicSystemInstruction('badmash');
    assert.match(badmashPrompt, /BAAP-LEVEL ROAST ENGINE/i);
    assert.match(badmashPrompt, /PAKAD/);
    assert.match(badmashPrompt, /MASALA PUNCH/);
    assert.match(badmashPrompt, /MIC-DROP CLOSER/);
    assert.match(badmashPrompt, /1147/);
    assert.match(badmashPrompt, /Kalti maar/i);
    assert.match(badmashPrompt, /never explicit pornography/i);
    assert.match(badmashPrompt, /Cosmic/);
  });

  it('keeps normal mode free of extreme badmash roast engine rules and provides a punchy entrance cue', () => {
    const normalPrompt = buildCosmicSystemInstruction('normal');
    assert.doesNotMatch(normalPrompt, /BAAP-LEVEL ROAST ENGINE/i);
    assert.match(COSMIC_BADMASH_ENTRANCE_CUE, /Badmash/i);
  });
});
