import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMemoryContextEntries,
  buildTranscriptFilename,
  formatSessionTranscriptTxt,
  loadRecentSessions,
  MAX_RECENT_SESSIONS,
  saveRecentSessions,
  upsertSessionTranscriptEntry,
  type StorageLike,
} from './conversationHistory.ts';
import type { ConversationSessionRecord } from '../types/cosmic.ts';

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

describe('conversationHistory persistence, AI memory, and TXT export', () => {
  it('persists at most the last 5 sessions sorted newest-first in storage', () => {
    const storage = createMemoryStorage();
    let sessions: ConversationSessionRecord[] = [];

    for (let i = 1; i <= 7; i++) {
      const ts = 1_700_000_000_000 + i * 60_000;
      sessions = upsertSessionTranscriptEntry(
        sessions,
        `sess_${i}`,
        {
          id: `tr_${i}`,
          speaker: 'user',
          text: `User message in session ${i}`,
          timestamp: ts,
          mode: i % 2 === 0 ? 'badmash' : 'normal',
        },
        ts,
      );
    }

    assert.equal(sessions.length, MAX_RECENT_SESSIONS);
    assert.deepEqual(
      sessions.map((s) => s.id),
      ['sess_7', 'sess_6', 'sess_5', 'sess_4', 'sess_3'],
    );

    saveRecentSessions(sessions, storage);
    const reloaded = loadRecentSessions(storage);
    assert.equal(reloaded.length, 5);
    assert.equal(reloaded[0].id, 'sess_7');
    assert.equal(reloaded[4].id, 'sess_3');
  });

  it('merges consecutive chunks from same speaker within 3s and preserves distinct turns', () => {
    let sessions: ConversationSessionRecord[] = [];
    const base = 1_700_000_000_000;

    sessions = upsertSessionTranscriptEntry(sessions, 'sess_a', {
      id: 'u1',
      speaker: 'user',
      text: 'Mera naam',
      timestamp: base,
      mode: 'badmash',
    });
    sessions = upsertSessionTranscriptEntry(sessions, 'sess_a', {
      id: 'u2',
      speaker: 'user',
      text: 'Aarav hai',
      timestamp: base + 1200,
      mode: 'badmash',
    });
    sessions = upsertSessionTranscriptEntry(sessions, 'sess_a', {
      id: 'c1',
      speaker: 'cosmic',
      text: 'Kadak naam hai Bhidu!',
      timestamp: base + 2000,
      mode: 'badmash',
    });

    assert.equal(sessions[0].entries.length, 2);
    assert.equal(sessions[0].entries[0].text, 'Mera naam Aarav hai');
    assert.equal(sessions[0].entries[1].text, 'Kadak naam hai Bhidu!');
  });

  it('builds chronological persistent memory context across past and active sessions', () => {
    const s1: ConversationSessionRecord = {
      id: 's1',
      startedAt: 1000,
      updatedAt: 2000,
      mode: 'normal',
      entries: [
        { id: '1', speaker: 'user', text: 'My birthday is 14 August', timestamp: 1000, mode: 'normal' },
        { id: '2', speaker: 'cosmic', text: 'Got it, I will remember!', timestamp: 1500, mode: 'normal' },
      ],
    };
    const s2: ConversationSessionRecord = {
      id: 's2',
      startedAt: 3000,
      updatedAt: 4000,
      mode: 'badmash',
      entries: [
        { id: '3', speaker: 'user', text: 'Bol kuch', timestamp: 3000, mode: 'badmash' },
      ],
    };

    const memory = buildMemoryContextEntries([s2, s1], [
      { id: '4', speaker: 'cosmic', text: 'Apun kya bolega Bhidu?', timestamp: 4500, mode: 'badmash' },
    ]);

    assert.equal(memory.length, 4);
    assert.deepEqual(
      memory.map((m) => m.text),
      [
        'My birthday is 14 August',
        'Got it, I will remember!',
        'Bol kuch',
        'Apun kya bolega Bhidu?',
      ],
    );
  });

  it('formats session transcripts into a clean .txt export with metadata and speaker turns', () => {
    const session: ConversationSessionRecord = {
      id: 'sess_export',
      startedAt: Date.UTC(2026, 4, 10, 14, 30, 0),
      updatedAt: Date.UTC(2026, 4, 10, 14, 35, 0),
      mode: 'badmash',
      entries: [
        {
          id: 'e1',
          speaker: 'user',
          text: 'Tu mera naukar hai',
          timestamp: Date.UTC(2026, 4, 10, 14, 31, 0),
          mode: 'badmash',
        },
        {
          id: 'e2',
          speaker: 'cosmic',
          text: 'Abe Saale, apun digital don hai, naukar nahi!',
          timestamp: Date.UTC(2026, 4, 10, 14, 31, 5),
          mode: 'badmash',
        },
      ],
    };

    const txt = formatSessionTranscriptTxt(session);
    assert.match(txt, /COSMIC AI — CONVERSATION TRANSCRIPT/);
    assert.match(txt, /Mode: Badmash Mode \(Mumbai Don\)/);
    assert.match(txt, /You: Tu mera naukar hai/);
    assert.match(txt, /Cosmic AI: Abe Saale, apun digital don hai, naukar nahi!/);

    const filename = buildTranscriptFilename(session);
    assert.match(filename, /^cosmic-ai-transcript-.*\.txt$/);
  });
});
