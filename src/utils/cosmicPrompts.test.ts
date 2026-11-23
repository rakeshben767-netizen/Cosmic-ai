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

  it('includes the 3-beat super ultra extreme roast engine and store-safe counter-roast bounds in badmash mode', () => {
    const badmashPrompt = buildCosmicSystemInstruction('badmash');
    assert.match(badmashPrompt, /SUPER ULTRA EXTREME ROAST ENGINE/i);
    assert.match(badmashPrompt, /PAKAD/);
    assert.match(badmashPrompt, /MASALA PUNCH/);
    assert.match(badmashPrompt, /DON MIC-DROP CLOSER/);
    assert.match(badmashPrompt, /TIT-FOR-TAT/);
    assert.match(badmashPrompt, /never explicit pornography/i);
    assert.match(badmashPrompt, /Cosmic/);
  });

  it('keeps normal mode free of extreme badmash roast engine rules and provides a punchy entrance cue', () => {
    const normalPrompt = buildCosmicSystemInstruction('normal');
    assert.doesNotMatch(normalPrompt, /SUPER ULTRA EXTREME ROAST ENGINE/i);
    assert.match(COSMIC_BADMASH_ENTRANCE_CUE, /Mumbai Tapori Don/i);
  });
});
