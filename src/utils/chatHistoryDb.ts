import type {
  ConversationEntity,
  ConversationMemoryItem,
  ConversationSessionRecord,
  ConversationType,
  CosmicMode,
  MessageEntity,
  MessageType,
  TranscriptEntry,
} from '../types/cosmic.ts';
import {
  MAX_MEMORY_ITEMS,
  MAX_MEMORY_TEXT_CHARS,
  RECENT_CONVERSATIONS_STORAGE_KEY,
  type StorageLike,
} from './conversationHistory.ts';

export const UNIFIED_HISTORY_DB_NAME = 'cosmic_ai_history_db';
export const UNIFIED_HISTORY_STORE_NAME = 'conversations';
export const UNIFIED_HISTORY_STORAGE_KEY = 'cosmic_unified_history_v1';
export const VOICE_OUTPUT_PREF_STORAGE_KEY = 'cosmic_voice_output_enabled_v1';

export type HistoryFilterOption = 'all' | 'text' | 'voice' | 'normal' | 'badmash';

function resolveLocalStorage(explicit?: StorageLike | null): StorageLike | null {
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

function isValidMessageType(value: unknown): value is MessageType {
  return value === 'TEXT' || value === 'VOICE' || value === 'AI_RESPONSE';
}

export function deriveConversationType(messages: MessageEntity[]): ConversationType {
  let hasText = false;
  let hasVoice = false;
  for (const msg of messages) {
    if (msg.sender === 'user') {
      if (msg.messageType === 'TEXT') hasText = true;
      if (msg.messageType === 'VOICE') hasVoice = true;
    }
  }
  if (hasText && hasVoice) return 'MIXED';
  if (hasVoice) return 'VOICE';
  return 'TEXT';
}

export function deriveConversationTitle(messages: MessageEntity[]): string {
  const firstUser = messages.find((m) => m.sender === 'user' && m.messageText.trim().length > 0);
  const candidate = (firstUser?.messageText || messages[0]?.messageText || 'Cosmic Conversation')
    .replace(/\s+/g, ' ')
    .trim();
  if (!candidate) return 'Cosmic Conversation';
  if (candidate.length <= 52) return candidate;
  return `${candidate.slice(0, 49).trimEnd()}...`;
}

export function formatConversationTypeBadge(type: ConversationType): string {
  if (type === 'MIXED') return 'TEXT + VOICE';
  return type;
}

export function sanitizeMessageEntity(
  raw: unknown,
  fallbackConversationId: string,
  fallbackOrder: number,
): MessageEntity | null {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as Partial<MessageEntity>;
  const sender = candidate.sender === 'user' || candidate.sender === 'cosmic' ? candidate.sender : null;
  const messageText =
    typeof candidate.messageText === 'string'
      ? candidate.messageText.replace(/\r\n/g, '\n').trim()
      : '';
  if (!sender || !messageText) return null;

  const timestamp =
    typeof candidate.timestamp === 'number' && Number.isFinite(candidate.timestamp)
      ? candidate.timestamp
      : Date.now();
  const activeMode: CosmicMode = isValidMode(candidate.activeMode) ? candidate.activeMode : 'normal';
  const messageType: MessageType = isValidMessageType(candidate.messageType)
    ? candidate.messageType
    : sender === 'cosmic'
      ? 'AI_RESPONSE'
      : 'VOICE';
  const messageOrder =
    typeof candidate.messageOrder === 'number' && Number.isFinite(candidate.messageOrder)
      ? candidate.messageOrder
      : fallbackOrder;
  const conversationId =
    typeof candidate.conversationId === 'string' && candidate.conversationId.trim()
      ? candidate.conversationId.trim()
      : fallbackConversationId;
  const messageId =
    typeof candidate.messageId === 'string' && candidate.messageId.trim()
      ? candidate.messageId.trim()
      : `msg_${timestamp}_${fallbackOrder}_${Math.random().toString(36).slice(2, 6)}`;

  return {
    messageId,
    conversationId,
    messageText,
    sender,
    messageType,
    activeMode,
    timestamp,
    messageOrder,
  };
}

export function sanitizeConversationEntity(raw: unknown): ConversationEntity | null {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as Partial<ConversationEntity>;
  const conversationId =
    typeof candidate.conversationId === 'string' && candidate.conversationId.trim()
      ? candidate.conversationId.trim()
      : '';
  if (!conversationId) return null;

  const rawMessages = Array.isArray(candidate.messages) ? candidate.messages : [];
  const messages = rawMessages
    .map((m, idx) => sanitizeMessageEntity(m, conversationId, idx))
    .filter((m): m is MessageEntity => Boolean(m))
    .sort((a, b) => a.messageOrder - b.messageOrder || a.timestamp - b.timestamp)
    .map((m, idx) => ({ ...m, messageOrder: idx }));

  if (messages.length === 0) return null;

  const createdAt =
    typeof candidate.createdAt === 'number' && Number.isFinite(candidate.createdAt)
      ? candidate.createdAt
      : messages[0].timestamp;
  const updatedAt =
    typeof candidate.updatedAt === 'number' && Number.isFinite(candidate.updatedAt)
      ? candidate.updatedAt
      : messages[messages.length - 1].timestamp;
  const activeMode: CosmicMode = isValidMode(candidate.activeMode)
    ? candidate.activeMode
    : messages[messages.length - 1].activeMode;
  const title =
    typeof candidate.title === 'string' && candidate.title.trim()
      ? candidate.title.trim()
      : deriveConversationTitle(messages);

  return {
    conversationId,
    title,
    createdAt,
    updatedAt,
    activeMode,
    conversationType: deriveConversationType(messages),
    messages,
  };
}

export function sortConversationsNewestFirst(
  conversations: ConversationEntity[],
): ConversationEntity[] {
  return [...conversations]
    .filter((c) => c.messages.length > 0)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export interface AppendUnifiedMessageInput {
  conversationId: string;
  sender: 'user' | 'cosmic';
  messageText: string;
  messageType: MessageType;
  activeMode: CosmicMode;
  timestamp?: number;
  messageId?: string;
  mergeVoiceStreamWindowMs?: number;
}

export function appendUnifiedMessage(
  conversations: ConversationEntity[],
  input: AppendUnifiedMessageInput,
): {
  conversations: ConversationEntity[];
  updatedConversation: ConversationEntity;
  appendedMessage: MessageEntity;
} {
  const cleanedText = input.messageText.replace(/\r\n/g, '\n').trim();
  const ts =
    typeof input.timestamp === 'number' && Number.isFinite(input.timestamp)
      ? input.timestamp
      : Date.now();
  const cid = input.conversationId.trim();
  const mergeWindow = input.mergeVoiceStreamWindowMs ?? 3000;

  const existingIdx = conversations.findIndex((c) => c.conversationId === cid);
  const existing = existingIdx >= 0 ? conversations[existingIdx] : null;
  const prevMessages = existing ? [...existing.messages] : [];
  const lastMsg = prevMessages[prevMessages.length - 1];

  const canMergeVoiceChunk =
    Boolean(lastMsg) &&
    input.messageType !== 'TEXT' &&
    lastMsg.messageType === input.messageType &&
    lastMsg.sender === input.sender &&
    lastMsg.activeMode === input.activeMode &&
    ts - lastMsg.timestamp < mergeWindow;

  let nextMessages: MessageEntity[];
  let resultingMsg: MessageEntity;

  if (canMergeVoiceChunk && lastMsg) {
    const mergedText = `${lastMsg.messageText} ${cleanedText}`.replace(/\s+/g, ' ').trim();
    resultingMsg = {
      ...lastMsg,
      messageText: mergedText,
      timestamp: ts,
    };
    nextMessages = [...prevMessages.slice(0, -1), resultingMsg];
  } else {
    const nextOrder = prevMessages.length > 0 ? prevMessages[prevMessages.length - 1].messageOrder + 1 : 0;
    resultingMsg = {
      messageId:
        input.messageId?.trim() ||
        `msg_${ts}_${nextOrder}_${Math.random().toString(36).slice(2, 6)}`,
      conversationId: cid,
      messageText: cleanedText,
      sender: input.sender,
      messageType: input.messageType,
      activeMode: input.activeMode,
      timestamp: ts,
      messageOrder: nextOrder,
    };
    nextMessages = [...prevMessages, resultingMsg];
  }

  const updatedConversation: ConversationEntity = {
    conversationId: cid,
    title: deriveConversationTitle(nextMessages),
    createdAt: existing ? existing.createdAt : ts,
    updatedAt: Math.max(existing?.updatedAt ?? 0, ts),
    activeMode: input.activeMode,
    conversationType: deriveConversationType(nextMessages),
    messages: nextMessages,
  };

  const nextList = existing
    ? conversations.map((c, idx) => (idx === existingIdx ? updatedConversation : c))
    : [updatedConversation, ...conversations];

  return {
    conversations: sortConversationsNewestFirst(nextList),
    updatedConversation,
    appendedMessage: resultingMsg,
  };
}

export function filterAndSearchConversations(
  conversations: ConversationEntity[],
  options: { query?: string; filter?: HistoryFilterOption } = {},
): ConversationEntity[] {
  const query = (options.query || '').trim().toLowerCase();
  const filter = options.filter || 'all';

  return sortConversationsNewestFirst(conversations).filter((conv) => {
    if (filter === 'text') {
      const hasText = conv.messages.some(
        (m) => m.sender === 'user' && m.messageType === 'TEXT',
      );
      if (!hasText && conv.conversationType !== 'TEXT') return false;
    } else if (filter === 'voice') {
      const hasVoice = conv.messages.some(
        (m) => m.sender === 'user' && m.messageType === 'VOICE',
      );
      if (!hasVoice && conv.conversationType !== 'VOICE') return false;
    } else if (filter === 'normal') {
      const hasNormal =
        conv.activeMode === 'normal' || conv.messages.some((m) => m.activeMode === 'normal');
      if (!hasNormal) return false;
    } else if (filter === 'badmash') {
      const hasBadmash =
        conv.activeMode === 'badmash' || conv.messages.some((m) => m.activeMode === 'badmash');
      if (!hasBadmash) return false;
    }

    if (!query) return true;
    if (conv.title.toLowerCase().includes(query)) return true;
    return conv.messages.some((m) => m.messageText.toLowerCase().includes(query));
  });
}

export function conversationToTranscripts(conversation: ConversationEntity): TranscriptEntry[] {
  return [...conversation.messages]
    .sort((a, b) => a.messageOrder - b.messageOrder || a.timestamp - b.timestamp)
    .map((m) => ({
      id: m.messageId,
      speaker: m.sender,
      text: m.messageText,
      timestamp: m.timestamp,
      mode: m.activeMode,
      messageType: m.messageType,
      messageOrder: m.messageOrder,
    }));
}

export function conversationToSessionRecord(
  conversation: ConversationEntity,
): ConversationSessionRecord {
  return {
    id: conversation.conversationId,
    startedAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    mode: conversation.activeMode,
    entries: conversationToTranscripts(conversation),
  };
}

export function migrateLegacySessionsToUnified(
  legacySessions: ConversationSessionRecord[],
): ConversationEntity[] {
  const result: ConversationEntity[] = [];
  for (const sess of legacySessions) {
    if (!sess.id || !Array.isArray(sess.entries) || sess.entries.length === 0) continue;
    const messages: MessageEntity[] = sess.entries.map((entry, idx) => ({
      messageId: entry.id || `legacy_${sess.id}_${idx}`,
      conversationId: sess.id,
      messageText: entry.text,
      sender: entry.speaker,
      messageType: entry.messageType ?? (entry.speaker === 'cosmic' ? 'AI_RESPONSE' : 'VOICE'),
      activeMode: entry.mode,
      timestamp: entry.timestamp,
      messageOrder: typeof entry.messageOrder === 'number' ? entry.messageOrder : idx,
    }));
    result.push({
      conversationId: sess.id,
      title: deriveConversationTitle(messages),
      createdAt: sess.startedAt,
      updatedAt: sess.updatedAt,
      activeMode: sess.mode,
      conversationType: deriveConversationType(messages),
      messages,
    });
  }
  return sortConversationsNewestFirst(result);
}

export function buildUnifiedMemoryContextEntries(
  conversations: ConversationEntity[],
  activeConversationId: string | null,
  activeEntries: TranscriptEntry[] = [],
  maxItems = MAX_MEMORY_ITEMS,
): ConversationMemoryItem[] {
  // Put past context first chronologically, then prioritize the currently active conversation
  const pastOrdered = [...conversations]
    .filter((c) => c.conversationId !== activeConversationId)
    .sort((a, b) => a.updatedAt - b.updatedAt)
    .slice(-5);

  const combined: Array<{
    id: string;
    speaker: 'user' | 'cosmic';
    text: string;
    mode: CosmicMode;
    timestamp: number;
  }> = [];
  const seen = new Set<string>();

  for (const conv of pastOrdered) {
    for (const msg of conv.messages.slice(-6)) {
      if (!seen.has(msg.messageId)) {
        seen.add(msg.messageId);
        combined.push({
          id: msg.messageId,
          speaker: msg.sender,
          text: msg.messageText,
          mode: msg.activeMode,
          timestamp: msg.timestamp,
        });
      }
    }
  }

  for (const entry of activeEntries) {
    if (!seen.has(entry.id)) {
      seen.add(entry.id);
      combined.push({
        id: entry.id,
        speaker: entry.speaker,
        text: entry.text,
        mode: entry.mode,
        timestamp: entry.timestamp,
      });
    }
  }

  return combined
    .slice(-maxItems)
    .map((item) => ({
      speaker: item.speaker,
      text: item.text.replace(/\s+/g, ' ').trim().slice(0, MAX_MEMORY_TEXT_CHARS),
      mode: item.mode,
      timestamp: item.timestamp,
    }))
    .filter((item) => item.text.length > 0);
}

export function loadUnifiedConversationsSync(
  storage?: StorageLike | null,
): ConversationEntity[] {
  const store = resolveLocalStorage(storage);
  if (!store) return [];
  try {
    const rawUnified = store.getItem(UNIFIED_HISTORY_STORAGE_KEY);
    if (rawUnified) {
      const parsed = JSON.parse(rawUnified) as unknown;
      if (Array.isArray(parsed)) {
        const sanitized = parsed
          .map(sanitizeConversationEntity)
          .filter((c): c is ConversationEntity => Boolean(c));
        return sortConversationsNewestFirst(sanitized);
      }
    }

    // One-time migration from legacy 5-session store if unified key doesn't exist yet
    const rawLegacy = store.getItem(RECENT_CONVERSATIONS_STORAGE_KEY);
    if (rawLegacy) {
      const parsedLegacy = JSON.parse(rawLegacy) as ConversationSessionRecord[];
      if (Array.isArray(parsedLegacy)) {
        const migrated = migrateLegacySessionsToUnified(parsedLegacy);
        saveUnifiedConversationsSync(migrated, store);
        return migrated;
      }
    }
  } catch {
    return [];
  }
  return [];
}

export function saveUnifiedConversationsSync(
  conversations: ConversationEntity[],
  storage?: StorageLike | null,
): ConversationEntity[] {
  const sorted = sortConversationsNewestFirst(conversations);
  const store = resolveLocalStorage(storage);
  if (store) {
    try {
      store.setItem(UNIFIED_HISTORY_STORAGE_KEY, JSON.stringify(sorted));
    } catch {
      // Ignore quota errors (IndexedDB holds full unbounded history)
    }
  }
  return sorted;
}

function openHistoryIndexedDb(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const req = window.indexedDB.open(UNIFIED_HISTORY_DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(UNIFIED_HISTORY_STORE_NAME)) {
          const store = db.createObjectStore(UNIFIED_HISTORY_STORE_NAME, {
            keyPath: 'conversationId',
          });
          store.createIndex('updatedAt', 'updatedAt', { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function loadUnifiedConversations(
  storage?: StorageLike | null,
): Promise<ConversationEntity[]> {
  const syncList = loadUnifiedConversationsSync(storage);
  const db = await openHistoryIndexedDb();
  if (!db) return syncList;

  try {
    const idbItems = await new Promise<ConversationEntity[]>((resolve) => {
      const tx = db.transaction(UNIFIED_HISTORY_STORE_NAME, 'readonly');
      const store = tx.objectStore(UNIFIED_HISTORY_STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const rows = Array.isArray(req.result) ? req.result : [];
        const valid = rows
          .map(sanitizeConversationEntity)
          .filter((c): c is ConversationEntity => Boolean(c));
        resolve(sortConversationsNewestFirst(valid));
      };
      req.onerror = () => resolve([]);
    });

    // Merge IndexedDB + localStorage (preferring record with higher updatedAt / more messages)
    const mergedMap = new Map<string, ConversationEntity>();
    for (const c of syncList) {
      mergedMap.set(c.conversationId, c);
    }
    for (const c of idbItems) {
      const prev = mergedMap.get(c.conversationId);
      if (
        !prev ||
        c.updatedAt > prev.updatedAt ||
        (c.updatedAt === prev.updatedAt && c.messages.length > prev.messages.length)
      ) {
        mergedMap.set(c.conversationId, c);
      }
    }
    const merged = sortConversationsNewestFirst(Array.from(mergedMap.values()));

    // Backfill IndexedDB if localStorage had migrated entries missing from IDB
    if (merged.length > idbItems.length) {
      const writeTx = db.transaction(UNIFIED_HISTORY_STORE_NAME, 'readwrite');
      const writeStore = writeTx.objectStore(UNIFIED_HISTORY_STORE_NAME);
      for (const c of merged) {
        writeStore.put(c);
      }
    }
    saveUnifiedConversationsSync(merged, storage);
    return merged;
  } catch {
    return syncList;
  } finally {
    db.close();
  }
}

export async function persistUnifiedConversation(
  conversation: ConversationEntity,
  allConversations?: ConversationEntity[],
  storage?: StorageLike | null,
): Promise<void> {
  if (allConversations) {
    saveUnifiedConversationsSync(allConversations, storage);
  }
  const db = await openHistoryIndexedDb();
  if (!db) return;
  try {
    await new Promise<void>((resolve) => {
      const tx = db.transaction(UNIFIED_HISTORY_STORE_NAME, 'readwrite');
      const store = tx.objectStore(UNIFIED_HISTORY_STORE_NAME);
      store.put(conversation);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // ignore IDB error
  } finally {
    db.close();
  }
}

export async function deleteUnifiedConversation(
  conversationId: string,
  remainingConversations: ConversationEntity[],
  storage?: StorageLike | null,
): Promise<void> {
  saveUnifiedConversationsSync(remainingConversations, storage);
  const db = await openHistoryIndexedDb();
  if (!db) return;
  try {
    await new Promise<void>((resolve) => {
      const tx = db.transaction(UNIFIED_HISTORY_STORE_NAME, 'readwrite');
      const store = tx.objectStore(UNIFIED_HISTORY_STORE_NAME);
      store.delete(conversationId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // ignore IDB error
  } finally {
    db.close();
  }
}

export async function clearAllUnifiedConversations(
  storage?: StorageLike | null,
): Promise<void> {
  const store = resolveLocalStorage(storage);
  if (store) {
    try {
      store.removeItem(UNIFIED_HISTORY_STORAGE_KEY);
      store.removeItem(RECENT_CONVERSATIONS_STORAGE_KEY);
    } catch {
      // ignore storage errors
    }
  }
  const db = await openHistoryIndexedDb();
  if (!db) return;
  try {
    await new Promise<void>((resolve) => {
      const tx = db.transaction(UNIFIED_HISTORY_STORE_NAME, 'readwrite');
      tx.objectStore(UNIFIED_HISTORY_STORE_NAME).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // ignore IDB error
  } finally {
    db.close();
  }
}

export function loadVoiceOutputPreference(storage?: StorageLike | null): boolean {
  const store = resolveLocalStorage(storage);
  if (!store) return true;
  try {
    const raw = store.getItem(VOICE_OUTPUT_PREF_STORAGE_KEY);
    if (raw === 'false') return false;
    return true;
  } catch {
    return true;
  }
}

export function saveVoiceOutputPreference(
  enabled: boolean,
  storage?: StorageLike | null,
): void {
  const store = resolveLocalStorage(storage);
  if (!store) return;
  try {
    store.setItem(VOICE_OUTPUT_PREF_STORAGE_KEY, enabled ? 'true' : 'false');
  } catch {
    // ignore storage errors
  }
}
