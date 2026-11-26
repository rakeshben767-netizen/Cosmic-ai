import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCosmicSystemInstruction,
  COSMIC_BADMASH_ENTRANCE_CUE,
  COSMIC_TOOL_DECLARATIONS,
  getVoiceNameForMode,
} from './cosmicPrompts.ts';

describe('cosmicPrompts Badmash & Normal mode configuration', () => {
  it('assigns Charon voice to badmash mode and Zephyr to normal mode', () => {
    assert.equal(getVoiceNameForMode('badmash'), 'Charon');
    assert.equal(getVoiceNameForMode('normal'), 'Zephyr');
  });

  it('includes live knowledge, Bambaiya/Marathi knowledge base, shayari, rap battle, and never leaks verification code in prompt', () => {
    const badmashPrompt = buildCosmicSystemInstruction('badmash');
    assert.match(badmashPrompt, /LIVE KNOWLEDGE ENGINE/i);
    assert.match(badmashPrompt, /MUMBAI TAPORI & MARATHI SEMANTIC KNOWLEDGE BASE/i);
    assert.match(badmashPrompt, /ROAST BATTLE ENGINE/i);
    assert.match(badmashPrompt, /DOUBLE-MEANING COMEDY ENGINE/i);
    assert.match(badmashPrompt, /CUSTOM SHAYARI ENGINE/i);
    assert.match(badmashPrompt, /VOICE-FIRST RAP BATTLE ENGINE/i);
    assert.match(badmashPrompt, /NON-REPETITION & CONVERSATION INTELLIGENCE/i);
    assert.match(badmashPrompt, /Tereko/i);
    assert.match(badmashPrompt, /Kaccha Limbu/i);
    assert.match(badmashPrompt, /Hari Patti/i);
    assert.match(badmashPrompt, /Lai bhaari!/i);
    assert.match(badmashPrompt, /Dokyala taap/i);
    assert.doesNotMatch(badmashPrompt, /1147/);
    assert.match(badmashPrompt, /Cosmic/);
  });

  it('respects feature toggles so disabled entertainment modes are withheld', () => {
    const constrainedPrompt = buildCosmicSystemInstruction('badmash', {
      features: {
        darkComedy: false,
        doubleMeaning: false,
        rapBattle: false,
        customShayari: true,
        rapBattleStyle: 'attitude',
      },
    });
    assert.match(constrainedPrompt, /CUSTOM SHAYARI ENGINE \(ENABLED\)/i);
    assert.doesNotMatch(constrainedPrompt, /DARK COMEDY ENGINE \(ENABLED\)/i);
    assert.doesNotMatch(constrainedPrompt, /DOUBLE-MEANING COMEDY ENGINE \(ENABLED\)/i);
    assert.doesNotMatch(constrainedPrompt, /VOICE-FIRST RAP BATTLE ENGINE \(ENABLED/i);
    assert.match(constrainedPrompt, /DISABLED FEATURES.*Dark Comedy Mode/i);
    assert.match(constrainedPrompt, /Rap Battle Mode/i);
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

  it('keeps normal mode free of extreme badmash roast engine rules and declares all fast voice tools', () => {
    const normalPrompt = buildCosmicSystemInstruction('normal');
    assert.doesNotMatch(normalPrompt, /ROAST BATTLE ENGINE \(ENABLED\)/i);
    assert.match(normalPrompt, /openYouTubeSearch/);
    assert.match(COSMIC_BADMASH_ENTRANCE_CUE, /Purple Knight/i);
    assert.doesNotMatch(COSMIC_BADMASH_ENTRANCE_CUE, /\bboss\b/i);
    const expectedTools = [
      'searchLiveKnowledge',
      'openApp',
      'openWhatsApp',
      'openYouTubeSearch',
      'openUrl',
      'findContact',
      'draftWhatsAppMessage',
      'sendWhatsAppMessage',
      'makeCall',
      'callContact',
    ];
    for (const toolName of expectedTools) {
      assert.ok(
        COSMIC_TOOL_DECLARATIONS.find((t) => t.name === toolName),
        `Missing tool declaration: ${toolName}`,
      );
    }
  });
});
