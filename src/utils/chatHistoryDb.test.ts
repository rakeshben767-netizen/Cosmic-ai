import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  appendUnifiedMessage,
  buildUnifiedMemoryContextEntries,
  clearAllUnifiedConversations,
  conversationToTranscripts,
  filterAndSearchConversations,
  formatConversationTypeBadge,
  loadUnifiedConversationsSync,
  loadVoiceOutputPreference,
  saveUnifiedConversationsSync,
  saveVoiceOutputPreference,
} from './chatHistoryDb.ts';
import {
  RECENT_CONVERSATIONS_STORAGE_KEY,
  type StorageLike,
} from './conversationHistory.ts';
import type { ConversationEntity } from '../types/cosmic.ts';

function createMemoryStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

describe('chatHistoryDb unified text & voice conversation storage', () => {
  it('stores unlimited conversations sorted newest-first without capping at 5', () => {
    const storage = createMemoryStorage();
    let list: ConversationEntity[] = [];

    for (let i = 1; i <= 12; i++) {
      const ts = 1_700_000_000_000 + i * 60_000;
      const res = appendUnifiedMessage(list, {
        conversationId: `conv_${i}`,
        sender: 'user',
        messageText: `Typed question ${i}`,
        messageType: 'TEXT',
        activeMode: i % 2 === 0 ? 'badmash' : 'normal',
        timestamp: ts,
      });
      list = res.conversations;
    }

    assert.equal(list.length, 12);
    assert.equal(list[0].conversationId, 'conv_12');
    assert.equal(list[11].conversationId, 'conv_1');

    saveUnifiedConversationsSync(list, storage);
    const reloaded = loadUnifiedConversationsSync(storage);
    assert.equal(reloaded.length, 12);
    assert.equal(reloaded[0].title, 'Typed question 12');
  });

  it('unifies TEXT and VOICE turns in the same conversationId while preserving per-message mode & order', () => {
    let list: ConversationEntity[] = [];
    const base = 1_700_000_000_000;

    list = appendUnifiedMessage(list, {
      conversationId: 'conv_mix',
      sender: 'user',
      messageText: 'Hello Cosmic',
      messageType: 'TEXT',
      activeMode: 'normal',
      timestamp: base,
    }).conversations;

    list = appendUnifiedMessage(list, {
      conversationId: 'conv_mix',
      sender: 'cosmic',
      messageText: 'Hello! Kaise ho? Batao, main tumhari kya help kar sakti hoon?',
      messageType: 'AI_RESPONSE',
      activeMode: 'normal',
      timestamp: base + 500,
    }).conversations;

    // Two rapid typed messages should NOT merge
    list = appendUnifiedMessage(list, {
      conversationId: 'conv_mix',
      sender: 'user',
      messageText: 'India ki capital kya hai?',
      messageType: 'TEXT',
      activeMode: 'badmash',
      timestamp: base + 1000,
    }).conversations;

    // Voice chunks within 3s from user should merge cleanly
    list = appendUnifiedMessage(list, {
      conversationId: 'conv_mix',
      sender: 'user',
      messageText: 'Aur Mumbai ka',
      messageType: 'VOICE',
      activeMode: 'badmash',
      timestamp: base + 5000,
    }).conversations;

    list = appendUnifiedMessage(list, {
      conversationId: 'conv_mix',
      sender: 'user',
      messageText: 'mausam bata',
      messageType: 'VOICE',
      activeMode: 'badmash',
      timestamp: base + 6100,
    }).conversations;

    assert.equal(list.length, 1);
    const conv = list[0];
    assert.equal(conv.conversationType, 'MIXED');
    assert.equal(formatConversationTypeBadge(conv.conversationType), 'TEXT + VOICE');
    assert.equal(conv.messages.length, 4);
    assert.deepEqual(
      conv.messages.map((m) => m.messageOrder),
      [0, 1, 2, 3],
    );
    assert.equal(conv.messages[0].activeMode, 'normal');
    assert.equal(conv.messages[1].activeMode, 'normal');
    assert.equal(conv.messages[2].activeMode, 'badmash');
    assert.equal(conv.messages[3].messageText, 'Aur Mumbai ka mausam bata');

    const restoredTranscripts = conversationToTranscripts(conv);
    assert.equal(restoredTranscripts.length, 4);
    assert.equal(restoredTranscripts[2].messageType, 'TEXT');
    assert.equal(restoredTranscripts[3].messageType, 'VOICE');
  });

  it('filters by type & mode and searches titles and message bodies', () => {
    let list: ConversationEntity[] = [];
    const base = 1_700_000_000_000;

    list = appendUnifiedMessage(list, {
      conversationId: 'c_text_normal',
      sender: 'user',
      messageText: 'Gold price today in Mumbai',
      messageType: 'TEXT',
      activeMode: 'normal',
      timestamp: base,
    }).conversations;

    list = appendUnifiedMessage(list, {
      conversationId: 'c_voice_badmash',
      sender: 'user',
      messageText: 'Abe roast kar mere dost Rahul ko',
      messageType: 'VOICE',
      activeMode: 'badmash',
      timestamp: base + 1000,
    }).conversations;

    list = appendUnifiedMessage(list, {
      conversationId: 'c_voice_badmash',
      sender: 'cosmic',
      messageText: 'Rahul toh Kaccha Limbu hai Bhidu!',
      messageType: 'AI_RESPONSE',
      activeMode: 'badmash',
      timestamp: base + 2000,
    }).conversations;

    assert.equal(filterAndSearchConversations(list, { filter: 'text' }).length, 1);
    assert.equal(filterAndSearchConversations(list, { filter: 'voice' }).length, 1);
    assert.equal(filterAndSearchConversations(list, { filter: 'normal' }).length, 1);
    assert.equal(filterAndSearchConversations(list, { filter: 'badmash' }).length, 1);

    const searchRes = filterAndSearchConversations(list, { query: 'kaccha limbu' });
    assert.equal(searchRes.length, 1);
    assert.equal(searchRes[0].conversationId, 'c_voice_badmash');
  });

  it('migrates legacy recent sessions cleanly and clears all history on request', async () => {
    const storage = createMemoryStorage();
    storage.setItem(
      RECENT_CONVERSATIONS_STORAGE_KEY,
      JSON.stringify([
        {
          id: 'legacy_1',
          startedAt: 1000,
          updatedAt: 2000,
          mode: 'badmash',
          entries: [
            { id: 'e1', speaker: 'user', text: 'Bol Bhidu', timestamp: 1000, mode: 'badmash' },
          ],
        },
      ]),
    );

    const migrated = loadUnifiedConversationsSync(storage);
    assert.equal(migrated.length, 1);
    assert.equal(migrated[0].conversationId, 'legacy_1');
    assert.equal(migrated[0].messages[0].messageType, 'VOICE');

    const mem = buildUnifiedMemoryContextEntries(migrated, 'other', []);
    assert.equal(mem.length, 1);
    assert.equal(mem[0].text, 'Bol Bhidu');

    await clearAllUnifiedConversations(storage);
    assert.equal(loadUnifiedConversationsSync(storage).length, 0);
  });

  it('persists voice output toggle preference', () => {
    const storage = createMemoryStorage();
    assert.equal(loadVoiceOutputPreference(storage), true);
    saveVoiceOutputPreference(false, storage);
    assert.equal(loadVoiceOutputPreference(storage), false);
    saveVoiceOutputPreference(true, storage);
    assert.equal(loadVoiceOutputPreference(storage), true);
  });
});
