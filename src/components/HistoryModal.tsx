import { useMemo, useState } from 'react';
import {
  Clock,
  Download,
  Flame,
  History,
  MessageSquarePlus,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import type { ConversationEntity } from '../types/cosmic.ts';
import {
  conversationToSessionRecord,
  filterAndSearchConversations,
  formatConversationTypeBadge,
  type HistoryFilterOption,
} from '../utils/chatHistoryDb.ts';
import {
  downloadSessionTranscriptTxt,
  formatSessionTimestamp,
} from '../utils/conversationHistory.ts';

interface HistoryModalProps {
  open: boolean;
  conversations: ConversationEntity[];
  activeConversationId: string | null;
  onClose: () => void;
  onSelectConversation: (conversationId: string) => void;
  onStartNewConversation: () => void;
  onDeleteConversation: (conversationId: string) => void;
  onClearAllHistory: () => void;
}

const FILTER_OPTIONS: Array<{ value: HistoryFilterOption; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'text', label: 'Text' },
  { value: 'voice', label: 'Voice' },
  { value: 'normal', label: 'Normal Mode' },
  { value: 'badmash', label: 'Badmash Mode' },
];

export function HistoryModal({
  open,
  conversations,
  activeConversationId,
  onClose,
  onSelectConversation,
  onStartNewConversation,
  onDeleteConversation,
  onClearAllHistory,
}: HistoryModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<HistoryFilterOption>('all');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmClearAll, setConfirmClearAll] = useState(false);

  const filteredConversations = useMemo(
    () =>
      filterAndSearchConversations(conversations, {
        query: searchQuery,
        filter: activeFilter,
      }),
    [conversations, searchQuery, activeFilter],
  );

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Cosmic AI Conversation History"
      data-testid="history-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 backdrop-blur-md sm:p-6"
    >
      <div className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-sky-400/30 bg-[#080d1a]/96 shadow-[0_0_40px_rgba(14,165,233,0.22)]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3.5 sm:px-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-sky-400/35 bg-sky-500/15 text-sky-300">
              <History className="h-4 w-4" />
            </div>
            <div>
              <h2 className="font-display text-sm font-bold tracking-wider text-white uppercase sm:text-base">
                Conversation History
              </h2>
              <p className="font-mono text-[10px] text-slate-400 tabular-nums">
                {conversations.length} saved {conversations.length === 1 ? 'conversation' : 'conversations'} · Text &amp; Voice
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                onStartNewConversation();
                onClose();
              }}
              data-testid="history-new-chat-btn"
              className="flex items-center gap-1 rounded-lg border border-sky-400/40 bg-sky-500/15 px-2.5 py-1.5 text-xs font-semibold text-sky-100 transition-colors hover:bg-sky-500/25"
            >
              <MessageSquarePlus className="h-3.5 w-3.5" />
              <span>New Chat</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close History"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/15 bg-white/5 text-slate-300 transition-colors hover:border-white/30 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Search & Filters */}
        <div className="flex flex-col gap-2.5 border-b border-white/10 bg-[#0b1120]/70 px-4 py-3 sm:px-5">
          <div className="relative flex items-center">
            <Search className="pointer-events-none absolute left-3 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search titles, messages, or AI replies..."
              aria-label="Search conversation history"
              data-testid="history-search-input"
              className="w-full rounded-xl border border-white/15 bg-[#0e1526] py-2 pr-8 pl-9 text-xs text-white placeholder:text-slate-400 focus:border-sky-400/60 focus:outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Clear search"
                className="absolute right-2.5 text-slate-400 hover:text-white"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {FILTER_OPTIONS.map((opt) => {
                const selected = activeFilter === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setActiveFilter(opt.value)}
                    data-testid={`history-filter-${opt.value}`}
                    className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                      selected
                        ? opt.value === 'badmash'
                          ? 'border-rose-400/60 bg-rose-500/20 text-rose-100'
                          : 'border-sky-400/60 bg-sky-500/20 text-sky-100'
                        : 'border-white/10 bg-white/5 text-slate-300 hover:border-white/25 hover:text-white'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>

            {conversations.length > 0 && !confirmClearAll && (
              <button
                type="button"
                onClick={() => setConfirmClearAll(true)}
                data-testid="history-clear-all-btn"
                className="flex items-center gap-1 rounded-lg border border-red-500/35 bg-red-500/10 px-2.5 py-1 text-[11px] font-medium text-red-200 transition-colors hover:bg-red-500/20"
              >
                <Trash2 className="h-3 w-3" />
                <span>Clear All</span>
              </button>
            )}
          </div>

          {/* Clear All Confirmation Banner */}
          {confirmClearAll && (
            <div
              data-testid="confirm-clear-all-banner"
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-red-500/50 bg-red-950/50 px-3 py-2 text-xs text-red-100"
            >
              <span className="font-medium">Delete all saved Text &amp; Voice conversations permanently?</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmClearAll(false)}
                  className="rounded-md border border-white/20 px-2.5 py-1 text-[11px] text-slate-200 hover:bg-white/10"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onClearAllHistory();
                    setConfirmClearAll(false);
                  }}
                  data-testid="confirm-clear-all-yes"
                  className="rounded-md border border-red-400/70 bg-red-600/80 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-red-500"
                >
                  Delete All
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          {filteredConversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/12 bg-white/[0.02] px-4 py-12 text-center">
              <History className="mb-2.5 h-8 w-8 text-slate-500" />
              <p className="text-sm font-medium text-slate-200">
                {conversations.length === 0
                  ? 'No saved conversations yet'
                  : 'No conversations match this filter'}
              </p>
              <p className="mt-1 max-w-sm text-xs text-slate-400">
                {conversations.length === 0
                  ? 'Start chatting by typing a message or turning on Power On for voice—all turns are saved here automatically.'
                  : 'Try clearing the search query or switching the filter above.'}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {filteredConversations.map((conv) => {
                const isBadmashConv = conv.activeMode === 'badmash';
                const isActive = conv.conversationId === activeConversationId;
                const firstMsg = conv.messages[0];
                const lastMsg = conv.messages[conv.messages.length - 1];
                const isConfirmingDelete = confirmDeleteId === conv.conversationId;

                return (
                  <div
                    key={conv.conversationId}
                    data-testid={`history-card-${conv.conversationId}`}
                    className={`rounded-xl border transition-all ${
                      isActive
                        ? isBadmashConv
                          ? 'border-rose-400/65 bg-[#1b0b1f]/90 shadow-[0_0_20px_rgba(244,63,94,0.16)]'
                          : 'border-sky-400/65 bg-[#0c1a33]/90 shadow-[0_0_20px_rgba(56,189,248,0.16)]'
                        : isBadmashConv
                          ? 'border-rose-500/25 bg-[#130a18]/80 hover:border-rose-400/50'
                          : 'border-white/12 bg-[#0d1424]/85 hover:border-sky-400/45'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3 p-3.5">
                      <button
                        type="button"
                        onClick={() => {
                          onSelectConversation(conv.conversationId);
                          onClose();
                        }}
                        className="min-w-0 flex-1 text-left"
                      >
                        <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                          <span
                            className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase ${
                              isBadmashConv
                                ? 'bg-rose-500/20 text-rose-300'
                                : 'bg-sky-500/20 text-sky-300'
                            }`}
                          >
                            {isBadmashConv ? (
                              <Flame className="h-2.5 w-2.5" />
                            ) : (
                              <Sparkles className="h-2.5 w-2.5" />
                            )}
                            {isBadmashConv ? 'Badmash' : 'Normal'}
                          </span>

                          <span className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[10px] text-slate-300">
                            {formatConversationTypeBadge(conv.conversationType)}
                          </span>

                          <span className="flex items-center gap-1 font-mono text-[10px] tabular-nums text-slate-400">
                            <Clock className="h-2.5 w-2.5" />
                            {formatSessionTimestamp(conv.updatedAt)}
                          </span>

                          {isActive && (
                            <span className="font-mono text-[10px] font-semibold text-emerald-300 uppercase">
                              · Active
                            </span>
                          )}
                        </div>

                        <h3 className="truncate text-sm font-semibold text-white">
                          {conv.title}
                        </h3>

                        {lastMsg && (
                          <p className="mt-1 line-clamp-2 text-xs text-slate-300/90">
                            <span className="font-medium text-slate-200">
                              {lastMsg.sender === 'user' ? 'You: ' : 'Cosmic: '}
                            </span>
                            {lastMsg.messageText}
                          </p>
                        )}

                        {firstMsg && conv.messages.length > 1 && firstMsg.messageId !== lastMsg?.messageId && (
                          <p className="mt-0.5 truncate text-[11px] text-slate-400">
                            Started: {firstMsg.messageText} · {conv.messages.length} turns
                          </p>
                        )}
                      </button>

                      {/* Card Actions */}
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            downloadSessionTranscriptTxt(conversationToSessionRecord(conv))
                          }
                          title="Export .txt transcript"
                          aria-label="Export transcript"
                          className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-300 transition-colors hover:border-sky-400/50 hover:text-white"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            setConfirmDeleteId(
                              isConfirmingDelete ? null : conv.conversationId,
                            )
                          }
                          title="Delete conversation"
                          aria-label="Delete conversation"
                          data-testid={`delete-conv-${conv.conversationId}`}
                          className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-300 transition-colors hover:border-red-400/50 hover:text-red-300"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    {isConfirmingDelete && (
                      <div className="flex items-center justify-between gap-2 border-t border-red-500/30 bg-red-950/35 px-3.5 py-2 text-xs text-red-100">
                        <span>Delete this conversation?</span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="rounded border border-white/20 px-2 py-0.5 text-[11px] text-slate-200 hover:bg-white/10"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              onDeleteConversation(conv.conversationId);
                              setConfirmDeleteId(null);
                            }}
                            data-testid={`confirm-delete-${conv.conversationId}`}
                            className="rounded border border-red-400/60 bg-red-600/80 px-2.5 py-0.5 text-[11px] font-semibold text-white hover:bg-red-500"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
