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

  it('includes intelligent roasting, Bambaiya/Marathi dictionary, double-meaning/joke/shayari engines, and never leaks verification code in prompt', () => {
    const badmashPrompt = buildCosmicSystemInstruction('badmash');
    assert.match(badmashPrompt, /INTELLIGENT ROASTING ENGINE/i);
    assert.match(badmashPrompt, /DOUBLE-MEANING COMEDY ENGINE/i);
    assert.match(badmashPrompt, /ADVANCED JOKE GENERATION ENGINE/i);
    assert.match(badmashPrompt, /ULTRA SHAYARI ENGINE/i);
    assert.match(badmashPrompt, /NON-REPETITION & CONVERSATION INTELLIGENCE/i);
    assert.match(badmashPrompt, /Kalti Maar/i);
    assert.match(badmashPrompt, /Tereko/i);
    assert.match(badmashPrompt, /Kaccha Limbu/i);
    assert.match(badmashPrompt, /Hari Patti/i);
    assert.match(badmashPrompt, /Lai Bhaari/i);
    assert.match(badmashPrompt, /Dokyala Taap/i);
    assert.doesNotMatch(badmashPrompt, /1147/);
    assert.match(badmashPrompt, /Cosmic/);
  });

  it('supports verified developer Respect Mode and rolling anti-repetition context', () => {
    const verifiedPrompt = buildCosmicSystemInstruction('badmash', {
      developerVerified: true,
      recentResponses: ['First crisp opener', 'Second smart comeback'],
    });
    assert.match(verifiedPrompt, /DEVELOPER_VERIFIED/);
    assert.match(verifiedPrompt, /RESPECT MODE/);
    assert.match(verifiedPrompt, /First crisp opener/);
    assert.match(verifiedPrompt, /Second smart comeback/);
  });

  it('keeps normal mode free of extreme badmash roast engine rules and provides a punchy entrance cue', () => {
    const normalPrompt = buildCosmicSystemInstruction('normal');
    assert.doesNotMatch(normalPrompt, /INTELLIGENT ROASTING ENGINE/i);
    assert.match(COSMIC_BADMASH_ENTRANCE_CUE, /Badmash/i);
  });
});
