import { useEffect, useRef, useState } from 'react';
import {
  Check,
  Copy,
  ExternalLink,
  Globe,
  Mic,
  RotateCw,
  Share2,
  ThumbsDown,
  ThumbsUp,
  Type,
  Volume2,
  X,
} from 'lucide-react';
import type {
  CosmicMode,
  LiveKnowledgeSearchResult,
  TranscriptEntry,
} from '../types/cosmic.ts';

interface ChatThreadProps {
  messages: TranscriptEntry[];
  mode: CosmicMode;
  isResponding: boolean;
  liveKnowledge: LiveKnowledgeSearchResult | null;
  onClearLiveKnowledge: () => void;
  onQuickPrompt: (prompt: string) => void;
  onSpeakMessage: (text: string, msgMode: CosmicMode) => void;
  onRetryPrompt?: (prompt: string) => void;
}

function formatMessageTime(ts: number): string {
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fallback below
    }
  }
  if (typeof document !== 'undefined') {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', 'true');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      const copied = document.execCommand('copy');
      document.body.removeChild(textarea);
      return copied;
    } catch {
      return false;
    }
  }
  return false;
}

export function ChatThread({
  messages,
  mode,
  isResponding,
  liveKnowledge,
  onClearLiveKnowledge,
  onQuickPrompt,
  onSpeakMessage,
  onRetryPrompt,
}: ChatThreadProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [reactions, setReactions] = useState<Record<string, 'up' | 'down'>>({});
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const bottomAnchorRef = useRef<HTMLDivElement | null>(null);
  const longPressTimerRef = useRef<number | null>(null);

  const isBadmash = mode === 'badmash';
  const lastMessage = messages[messages.length - 1];

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (container) {
      container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
    }
    bottomAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, lastMessage?.text, isResponding, liveKnowledge?.fetchedAt]);

  useEffect(() => {
    return () => {
      if (longPressTimerRef.current !== null) {
        window.clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

  const handleCopy = async (id: string, text: string) => {
    const ok = await copyTextToClipboard(text);
    if (ok) {
      setCopiedId(id);
      window.setTimeout(() => {
        setCopiedId((prev) => (prev === id ? null : prev));
      }, 1600);
    }
  };

  const handleShare = async (id: string, text: string) => {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: 'COSMIC AI', text });
        return;
      } catch {
        // User cancelled or unsupported; fallback to copy
      }
    }
    await handleCopy(id, text);
  };

  const handlePressStart = (id: string, text: string) => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
    }
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTimerRef.current = null;
      void handleCopy(id, text);
    }, 520);
  };

  const handlePressEnd = () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const lastUserMessage = [...messages].reverse().find((m) => m.speaker === 'user');
  const latestCosmicId = [...messages].reverse().find((m) => m.speaker === 'cosmic')?.id;

  const followUps = isBadmash
    ? [
        'Isko aur short aur savage kar',
        'Ispe ek mast joke maar',
        'Live update check kar',
      ]
    : [
        'Isko aur detail me samjhao',
        'Short bullet points me do',
        'Ek real example batao',
      ];

  return (
    <div
      ref={scrollContainerRef}
      data-testid="cosmic-chat-thread"
      className="cosmic-scroll flex-1 min-h-0 overflow-y-auto px-3 py-3 sm:px-6"
    >
      <div
        data-testid="chat-messages-scroll"
        className="mx-auto flex min-h-full w-full max-w-3xl flex-col justify-end gap-4 pb-2"
      >
        {messages.length > 0 || isResponding ? (
          <div className="flex flex-col gap-3.5 pt-1">
            {messages.map((entry) => {
              const isUser = entry.speaker === 'user';
              const entryBadmash = entry.mode === 'badmash';
              const isVoice = entry.messageType === 'VOICE';
              const isCopied = copiedId === entry.id;
              const reaction = reactions[entry.id];
              const isLatestCosmic = entry.id === latestCosmicId;

              return (
                <div
                  key={entry.id}
                  data-testid={`chat-bubble-${entry.speaker}`}
                  data-mode={entry.mode}
                  className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
                >
                  <div
                    onTouchStart={() => handlePressStart(entry.id, entry.text)}
                    onTouchEnd={handlePressEnd}
                    onTouchCancel={handlePressEnd}
                    onTouchMove={handlePressEnd}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      void handleCopy(entry.id, entry.text);
                    }}
                    className={`group relative max-w-[90%] rounded-2xl border px-3.5 py-2.5 text-sm leading-relaxed shadow-md transition-colors sm:max-w-[82%] ${
                      isUser
                        ? 'rounded-br-sm border-cyan-400/40 bg-gradient-to-br from-sky-900/80 via-cyan-950/85 to-[#0b162a]/95 text-slate-50 shadow-[0_4px_20px_rgba(34,211,238,0.12)]'
                        : entryBadmash
                          ? 'rounded-bl-sm border-rose-500/40 bg-gradient-to-br from-[#230b19]/92 via-[#190b24]/90 to-[#11081b]/95 text-rose-50 shadow-[0_4px_22px_rgba(244,63,94,0.14)]'
                          : 'rounded-bl-sm border-sky-400/35 bg-gradient-to-br from-[#0b1830]/92 via-[#091326]/90 to-[#080f1e]/95 text-slate-50 shadow-[0_4px_22px_rgba(56,189,248,0.12)]'
                    }`}
                  >
                    {/* Header Metadata Row */}
                    <div className="mb-1 flex items-center justify-between gap-4 text-[11px]">
                      <div className="flex items-center gap-1.5 font-mono">
                        <span
                          className={`font-semibold ${
                            isUser
                              ? 'text-cyan-300'
                              : entryBadmash
                                ? 'text-rose-300'
                                : 'text-sky-300'
                          }`}
                        >
                          {isUser ? 'You' : entryBadmash ? 'Cosmic · Badmash' : 'Cosmic'}
                        </span>
                        <span className="text-slate-600">·</span>
                        <span
                          className="inline-flex items-center gap-0.5 text-[10px] text-slate-400"
                          title={isVoice ? 'Voice Turn' : 'Text Turn'}
                        >
                          {isVoice ? <Mic className="h-2.5 w-2.5" /> : <Type className="h-2.5 w-2.5" />}
                          <span>{isVoice ? 'Voice' : 'Text'}</span>
                        </span>
                      </div>

                      <span className="font-mono text-[10px] tabular-nums text-slate-400/85">
                        {formatMessageTime(entry.timestamp)}
                      </span>
                    </div>

                    {/* Selectable Message Body */}
                    <p className="select-text break-words whitespace-pre-wrap text-[13.5px] leading-relaxed sm:text-[14px]">
                      {entry.text}
                    </p>

                    {isUser && (
                      <div className="mt-1.5 flex items-center justify-end">
                        <button
                          type="button"
                          onClick={() => void handleCopy(entry.id, entry.text)}
                          aria-label="Copy message"
                          className="flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[10px] text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
                        >
                          {isCopied ? (
                            <>
                              <Check className="h-3 w-3 text-emerald-400" />
                              <span className="text-emerald-300">Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="h-3 w-3" />
                              <span>Copy</span>
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Interactive Action Strip Below Each Cosmic AI Response */}
                  {!isUser && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-1 pl-1">
                      <button
                        type="button"
                        onClick={() => void handleCopy(entry.id, entry.text)}
                        aria-label="Copy reply"
                        title="Copy"
                        className="flex h-8 items-center gap-1 rounded-lg px-2 text-[11px] text-slate-400 transition-colors hover:bg-white/8 hover:text-white"
                      >
                        {isCopied ? (
                          <Check className="h-3.5 w-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          setReactions((prev) => ({
                            ...prev,
                            [entry.id]: prev[entry.id] === 'up' ? undefined! : 'up',
                          }))
                        }
                        aria-label="Like reply"
                        title="Helpful"
                        className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
                          reaction === 'up'
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : 'text-slate-400 hover:bg-white/8 hover:text-white'
                        }`}
                      >
                        <ThumbsUp className="h-3.5 w-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          setReactions((prev) => ({
                            ...prev,
                            [entry.id]: prev[entry.id] === 'down' ? undefined! : 'down',
                          }))
                        }
                        aria-label="Dislike reply"
                        title="Not helpful"
                        className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
                          reaction === 'down'
                            ? 'bg-rose-500/20 text-rose-300'
                            : 'text-slate-400 hover:bg-white/8 hover:text-white'
                        }`}
                      >
                        <ThumbsDown className="h-3.5 w-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => onSpeakMessage(entry.text, entry.mode)}
                        aria-label="Speak reply aloud"
                        title="Listen aloud"
                        className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
                          entryBadmash
                            ? 'text-slate-400 hover:bg-rose-500/15 hover:text-rose-200'
                            : 'text-slate-400 hover:bg-sky-500/15 hover:text-sky-200'
                        }`}
                      >
                        <Volume2 className="h-3.5 w-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => void handleShare(entry.id, entry.text)}
                        aria-label="Share reply"
                        title="Share"
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white/8 hover:text-white"
                      >
                        <Share2 className="h-3.5 w-3.5" />
                      </button>

                      {isLatestCosmic && lastUserMessage && onRetryPrompt && !isResponding && (
                        <button
                          type="button"
                          onClick={() => onRetryPrompt(lastUserMessage.text)}
                          aria-label="Retry response"
                          title="Generate another response"
                          className="flex h-8 items-center gap-1 rounded-lg px-2 text-[11px] text-slate-400 transition-colors hover:bg-white/8 hover:text-white"
                        >
                          <RotateCw className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">Retry</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Live Search Sources Shown Only Inside Active Search Conversation */}
            {liveKnowledge && liveKnowledge.items.length > 0 && (
              <div
                data-testid="live-knowledge-card"
                className="w-full rounded-xl border border-sky-400/25 bg-[#0a1222]/85 px-3 py-2.5 text-xs shadow-lg"
              >
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 font-semibold text-sky-300">
                    <Globe className="h-3.5 w-3.5" />
                    Sources for &ldquo;{liveKnowledge.query}&rdquo; ({liveKnowledge.items[0].dateLabel})
                  </span>
                  <button
                    type="button"
                    onClick={onClearLiveKnowledge}
                    aria-label="Dismiss live sources"
                    className="text-slate-400 hover:text-white"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {liveKnowledge.items.slice(0, 3).map((item, idx) => (
                    <a
                      key={`${item.url}-${idx}`}
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex max-w-full items-center gap-1 truncate rounded-lg border border-white/12 bg-[#121a2d] px-2.5 py-1 text-[11px] text-slate-200 hover:border-sky-400/50 hover:text-white"
                    >
                      <span className="truncate">
                        {item.source}: {item.headline}
                      </span>
                      <ExternalLink className="h-3 w-3 shrink-0 text-sky-400" />
                    </a>
                  ))}
                </div>
              </div>
            )}

            {isResponding && (
              <div data-testid="chat-loading-indicator" className="flex items-start">
                <div
                  className={`flex items-center gap-2.5 rounded-2xl rounded-bl-sm border px-3.5 py-2.5 text-xs ${
                    isBadmash
                      ? 'border-rose-500/40 bg-[#210b1c]/90 text-rose-200'
                      : 'border-sky-400/35 bg-[#0b162c]/90 text-sky-200'
                  }`}
                >
                  <span className="flex items-center gap-1">
                    <span
                      className={`h-1.5 w-1.5 animate-bounce rounded-full ${
                        isBadmash ? 'bg-rose-400' : 'bg-sky-400'
                      }`}
                    />
                    <span
                      className={`h-1.5 w-1.5 animate-bounce rounded-full [animation-delay:120ms] ${
                        isBadmash ? 'bg-fuchsia-400' : 'bg-cyan-300'
                      }`}
                    />
                    <span
                      className={`h-1.5 w-1.5 animate-bounce rounded-full [animation-delay:240ms] ${
                        isBadmash ? 'bg-violet-400' : 'bg-sky-300'
                      }`}
                    />
                  </span>
                  <span className="font-mono text-[11px]">
                    {isBadmash ? 'Cosmic dimag laga raha hai...' : 'Cosmic is thinking...'}
                  </span>
                </div>
              </div>
            )}

            {/* Quick Interactive Follow-Up Buttons below latest AI reply */}
            {!isResponding && lastMessage?.speaker === 'cosmic' && (
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                {followUps.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => onQuickPrompt(chip)}
                    className={`rounded-xl border px-3 py-1.5 text-[11px] font-medium transition-colors ${
                      isBadmash
                        ? 'border-rose-400/25 bg-[#190b1d]/80 text-rose-200 hover:border-rose-400/55 hover:bg-rose-500/15'
                        : 'border-sky-400/25 bg-[#0b1528]/80 text-sky-200 hover:border-sky-400/55 hover:bg-sky-500/15'
                    }`}
                  >
                    {chip}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : null}

        <div ref={bottomAnchorRef} />
      </div>
    </div>
  );
}
