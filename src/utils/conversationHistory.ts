import type {
  ConversationMemoryItem,
  ConversationSessionRecord,
  CosmicMode,
  TranscriptEntry,
} from '../types/cosmic.ts';

export const RECENT_CONVERSATIONS_STORAGE_KEY = 'cosmic_recent_conversations_v1';
export const MAX_RECENT_SESSIONS = 5;
export const MAX_ENTRIES_PER_SESSION = 120;
export const MAX_MEMORY_ITEMS = 24;
export const MAX_MEMORY_TEXT_CHARS = 280;

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function resolveStorage(explicit?: StorageLike | null): StorageLike | null {
  if (explicit) return explicit;
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function isValidMode(value: unknown): value is CosmicMode {
  return value === 'normal' || value === 'badmash';
}

function sanitizeTranscriptEntry(raw: unknown): TranscriptEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as Partial<TranscriptEntry>;
  const speaker = candidate.speaker === 'user' || candidate.speaker === 'cosmic' ? candidate.speaker : null;
  const text = typeof candidate.text === 'string' ? candidate.text.replace(/\s+/g, ' ').trim() : '';
  if (!speaker || !text) return null;
  const timestamp =
    typeof candidate.timestamp === 'number' && Number.isFinite(candidate.timestamp)
      ? candidate.timestamp
      : Date.now();
  const mode: CosmicMode = isValidMode(candidate.mode) ? candidate.mode : 'normal';
  const id =
    typeof candidate.id === 'string' && candidate.id.trim().length > 0
      ? candidate.id
      : `tr_${timestamp}_${Math.random().toString(36).slice(2, 6)}`;
  return { id, speaker, text, timestamp, mode };
}

function sanitizeSessionRecord(raw: unknown): ConversationSessionRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as Partial<ConversationSessionRecord>;
  if (typeof candidate.id !== 'string' || !candidate.id.trim()) return null;
  const rawEntries = Array.isArray(candidate.entries) ? candidate.entries : [];
  const entries = rawEntries
    .map(sanitizeTranscriptEntry)
    .filter((entry): entry is TranscriptEntry => Boolean(entry))
    .slice(-MAX_ENTRIES_PER_SESSION);
  if (entries.length === 0) return null;
  const startedAt =
    typeof candidate.startedAt === 'number' && Number.isFinite(candidate.startedAt)
      ? candidate.startedAt
      : entries[0].timestamp;
  const updatedAt =
    typeof candidate.updatedAt === 'number' && Number.isFinite(candidate.updatedAt)
      ? candidate.updatedAt
      : entries[entries.length - 1].timestamp;
  const mode: CosmicMode = isValidMode(candidate.mode)
    ? candidate.mode
    : entries[entries.length - 1].mode;
  return {
    id: candidate.id.trim(),
    startedAt,
    updatedAt,
    mode,
    entries,
  };
}

export function sortAndCapSessions(
  sessions: ConversationSessionRecord[],
): ConversationSessionRecord[] {
  return [...sessions]
    .filter((s) => s.entries.length > 0)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_RECENT_SESSIONS);
}

export function loadRecentSessions(storage?: StorageLike | null): ConversationSessionRecord[] {
  const store = resolveStorage(storage);
  if (!store) return [];
  try {
    const raw = store.getItem(RECENT_CONVERSATIONS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const valid = parsed
      .map(sanitizeSessionRecord)
      .filter((s): s is ConversationSessionRecord => Boolean(s));
    return sortAndCapSessions(valid);
  } catch {
    return [];
  }
}

export function saveRecentSessions(
  sessions: ConversationSessionRecord[],
  storage?: StorageLike | null,
): ConversationSessionRecord[] {
  const capped = sortAndCapSessions(sessions);
  const store = resolveStorage(storage);
  if (store) {
    try {
      store.setItem(RECENT_CONVERSATIONS_STORAGE_KEY, JSON.stringify(capped));
    } catch {
      // ignore storage quota errors
    }
  }
  return capped;
}

export function clearRecentSessionsStorage(storage?: StorageLike | null): void {
  const store = resolveStorage(storage);
  if (!store) return;
  try {
    store.removeItem(RECENT_CONVERSATIONS_STORAGE_KEY);
  } catch {
    // ignore storage errors
  }
}

export function mergeTranscriptEntryList(
  existing: TranscriptEntry[],
  entry: TranscriptEntry,
  maxEntries = MAX_ENTRIES_PER_SESSION,
): TranscriptEntry[] {
  const cleaned = entry.text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return existing;
  const normalizedEntry: TranscriptEntry = { ...entry, text: cleaned };
  const last = existing[existing.length - 1];
  if (
    last &&
    last.speaker === normalizedEntry.speaker &&
    normalizedEntry.timestamp - last.timestamp < 3000
  ) {
    const mergedText = `${last.text} ${cleaned}`.replace(/\s+/g, ' ').trim();
    return [
      ...existing.slice(0, -1),
      {
        ...last,
        text: mergedText,
        timestamp: normalizedEntry.timestamp,
        mode: normalizedEntry.mode,
      },
    ];
  }
  return [...existing, normalizedEntry].slice(-maxEntries);
}

export function upsertSessionTranscriptEntry(
  sessions: ConversationSessionRecord[],
  sessionId: string,
  entry: TranscriptEntry,
  startedAt?: number,
): ConversationSessionRecord[] {
  const cleanedText = entry.text.replace(/\s+/g, ' ').trim();
  if (!cleanedText || !sessionId.trim()) return sessions;

  const existingIdx = sessions.findIndex((s) => s.id === sessionId);
  if (existingIdx >= 0) {
    const target = sessions[existingIdx];
    const nextEntries = mergeTranscriptEntryList(target.entries, {
      ...entry,
      text: cleanedText,
    });
    const updated: ConversationSessionRecord = {
      ...target,
      updatedAt: Math.max(target.updatedAt, entry.timestamp),
      mode: entry.mode,
      entries: nextEntries,
    };
    const nextList = [...sessions];
    nextList[existingIdx] = updated;
    return sortAndCapSessions(nextList);
  }

  const created: ConversationSessionRecord = {
    id: sessionId,
    startedAt: startedAt ?? entry.timestamp,
    updatedAt: entry.timestamp,
    mode: entry.mode,
    entries: [{ ...entry, text: cleanedText }],
  };
  return sortAndCapSessions([created, ...sessions]);
}

export function buildMemoryContextEntries(
  sessions: ConversationSessionRecord[],
  activeTranscripts: TranscriptEntry[] = [],
  maxItems = MAX_MEMORY_ITEMS,
): ConversationMemoryItem[] {
  // Order sessions oldest -> newest so chronological timeline flows cleanly into prompt memory
  const orderedSessions = [...sessions].sort((a, b) => a.startedAt - b.startedAt);
  const combined: TranscriptEntry[] = [];
  const seenIds = new Set<string>();

  for (const session of orderedSessions) {
    for (const entry of session.entries) {
      if (!seenIds.has(entry.id)) {
        seenIds.add(entry.id);
        combined.push(entry);
      }
    }
  }

  for (const entry of activeTranscripts) {
    if (!seenIds.has(entry.id)) {
      seenIds.add(entry.id);
      combined.push(entry);
    }
  }

  return combined
    .slice(-maxItems)
    .map((entry) => ({
      speaker: entry.speaker,
      text: entry.text.replace(/\s+/g, ' ').trim().slice(0, MAX_MEMORY_TEXT_CHARS),
      mode: entry.mode,
      timestamp: entry.timestamp,
    }))
    .filter((item) => item.text.length > 0);
}

export function sanitizeConversationMemoryPayload(
  raw: unknown,
  maxItems = MAX_MEMORY_ITEMS,
): ConversationMemoryItem[] {
  if (!Array.isArray(raw)) return [];
  const items: ConversationMemoryItem[] = [];
  for (const candidate of raw.slice(-maxItems)) {
    if (!candidate || typeof candidate !== 'object') continue;
    const obj = candidate as Partial<ConversationMemoryItem>;
    const speaker = obj.speaker === 'user' || obj.speaker === 'cosmic' ? obj.speaker : null;
    const text =
      typeof obj.text === 'string'
        ? obj.text.replace(/\s+/g, ' ').trim().slice(0, MAX_MEMORY_TEXT_CHARS)
        : '';
    if (!speaker || !text) continue;
    items.push({
      speaker,
      text,
      mode: isValidMode(obj.mode) ? obj.mode : undefined,
      timestamp:
        typeof obj.timestamp === 'number' && Number.isFinite(obj.timestamp)
          ? obj.timestamp
          : undefined,
    });
  }
  return items;
}

export function formatSessionTimestamp(ts: number): string {
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return 'Unknown time';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function buildTranscriptFilename(session: ConversationSessionRecord): string {
  const date = new Date(session.startedAt);
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = Number.isNaN(date.getTime())
    ? 'session'
    : `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}`;
  return `cosmic-ai-transcript-${stamp}.txt`;
}

export function formatSessionTranscriptTxt(session: ConversationSessionRecord): string {
  const startedIso = new Date(session.startedAt).toISOString();
  const updatedIso = new Date(session.updatedAt).toISOString();
  const headerLines = [
    'COSMIC AI — CONVERSATION TRANSCRIPT',
    `Session ID: ${session.id}`,
    `Mode: ${session.mode === 'badmash' ? 'Badmash Mode (Mumbai Don)' : 'Normal Mode'}`,
    `Started: ${startedIso}`,
    `Updated: ${updatedIso}`,
    `Messages: ${session.entries.length}`,
    '============================================================',
    '',
  ];

  const bodyLines = session.entries.map((entry) => {
    const timeStr = new Date(entry.timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    const who = entry.speaker === 'user' ? 'You' : 'Cosmic AI';
    const modeTag = entry.mode === 'badmash' ? 'Badmash' : 'Normal';
    return `[${timeStr}] [${modeTag}] ${who}: ${entry.text}`;
  });

  return [...headerLines, ...bodyLines, ''].join('\n');
}

export function downloadSessionTranscriptTxt(session: ConversationSessionRecord): boolean {
  if (typeof document === 'undefined' || typeof URL === 'undefined') return false;
  try {
    const content = formatSessionTranscriptTxt(session);
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = buildTranscriptFilename(session);
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    return true;
  } catch {
    return false;
  }
}
