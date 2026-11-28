import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { detectResponseMood } from './responseMood.ts';

describe('detectResponseMood subtle gradient personality & mood classifier', () => {
  it('defaults to warm in normal mode and savage in badmash mode when idle', () => {
    assert.equal(
      detectResponseMood({ mode: 'normal', cosmicState: 'IDLE', latestCosmicText: '' }).mood,
      'warm',
    );
    assert.equal(
      detectResponseMood({ mode: 'badmash', cosmicState: 'IDLE', latestCosmicText: '' }).mood,
      'savage',
    );
  });

  it('returns alert mood during ERROR or RECONNECTING states', () => {
    assert.equal(
      detectResponseMood({ mode: 'normal', cosmicState: 'ERROR', latestCosmicText: 'Hi' }).mood,
      'alert',
    );
    assert.equal(
      detectResponseMood({ mode: 'badmash', cosmicState: 'RECONNECTING', latestCosmicText: 'Wait' }).mood,
      'alert',
    );
  });

  it('detects analytical mood for live gold prices, IPL scores, weather, and logic', () => {
    assert.equal(
      detectResponseMood({
        mode: 'normal',
        cosmicState: 'SPEAKING',
        latestCosmicText: 'Aaj 24K gold price ₹78,400 per 10g hai.',
      }).mood,
      'analytical',
    );
    assert.equal(
      detectResponseMood({
        mode: 'badmash',
        cosmicState: 'SPEAKING',
        latestCosmicText: 'IPL live score mein Mumbai Indians 182 runs pe 4 wickets hai.',
      }).mood,
      'analytical',
    );
  });

  it('detects empathetic mood when supporting sad or stressed users even in badmash mode', () => {
    assert.equal(
      detectResponseMood({
        mode: 'badmash',
        cosmicState: 'SPEAKING',
        latestCosmicText: 'Tension mat le yaar, main hamesha saath hoon, sab theek ho jayega.',
      }).mood,
      'empathetic',
    );
  });

  it('detects playful mood for shayari, rap, jokes, and witty banter, and savage for brutal roasts', () => {
    assert.equal(
      detectResponseMood({
        mode: 'badmash',
        cosmicState: 'SPEAKING',
        latestCosmicText: 'Jhakaas shayari sunaata hoon tereko Bantai!',
      }).mood,
      'playful',
    );
    assert.equal(
      detectResponseMood({
        mode: 'badmash',
        cosmicState: 'SPEAKING',
        latestCosmicText: 'Apni aukat mein raha karo bewakoof kahin ke, idea ekdum nalla hai!',
      }).mood,
      'savage',
    );
  });
});
