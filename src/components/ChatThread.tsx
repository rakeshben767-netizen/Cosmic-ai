import { useEffect, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  MessageSquarePlus,
  Mic,
  Type,
} from 'lucide-react';
import type { CosmicMode, TranscriptEntry } from '../types/cosmic.ts';

interface ChatThreadProps {
  messages: TranscriptEntry[];
  mode: CosmicMode;
  isResponding: boolean;
  onStartNewChat: () => void;
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
  onStartNewChat,
}: ChatThreadProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const bottomAnchorRef = useRef<HTMLDivElement | null>(null);
  const longPressTimerRef = useRef<number | null>(null);

  const isBadmash = mode === 'badmash';
  const lastMessage = messages[messages.length - 1];

  useEffect(() => {
    if (isCollapsed) return;
    const container = scrollContainerRef.current;
    if (container) {
      container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
    }
    bottomAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, lastMessage?.text, isResponding, isCollapsed]);

  useEffect(() => {
    return () => {
      if (longPressTimerRef.current !== null) {
        window.clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

  if (messages.length === 0 && !isResponding) {
    return null;
  }

  const handleCopy = async (id: string, text: string) => {
    const ok = await copyTextToClipboard(text);
    if (ok) {
      setCopiedId(id);
      window.setTimeout(() => {
        setCopiedId((prev) => (prev === id ? null : prev));
      }, 1600);
    }
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

  return (
    <div
      data-testid="cosmic-chat-thread"
      className={`pointer-events-auto flex w-full flex-col overflow-hidden rounded-2xl border backdrop-blur-md transition-colors ${
        isBadmash
          ? 'border-rose-500/35 bg-[#120918]/80 shadow-[0_0_24px_rgba(244,63,94,0.14)]'
          : 'border-sky-400/30 bg-[#091122]/80 shadow-[0_0_24px_rgba(56,189,248,0.14)]'
      }`}
    >
      {/* Compact Header Strip */}
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-1.5">
        <div className="flex items-center gap-2 font-mono text-[10px] tracking-wider uppercase">
          <span className={isBadmash ? 'font-semibold text-rose-300' : 'font-semibold text-sky-300'}>
            {isBadmash ? 'Badmash Chat' : 'Cosmic Chat'}
          </span>
          <span className="text-slate-600">·</span>
          <span className="tabular-nums text-slate-400">{messages.length} msgs</span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onStartNewChat}
            data-testid="new-chat-button"
            title="Start New Conversation"
            aria-label="Start New Conversation"
            className="flex items-center gap-1 rounded-md border border-white/12 bg-white/5 px-2 py-0.5 text-[10px] font-medium text-slate-200 transition-colors hover:border-white/25 hover:bg-white/10"
          >
            <MessageSquarePlus className="h-3 w-3" />
            <span>New</span>
          </button>

          <button
            type="button"
            onClick={() => setIsCollapsed((prev) => !prev)}
            data-testid="toggle-chat-collapse"
            title={isCollapsed ? 'Expand Chat' : 'Minimize Chat'}
            aria-label={isCollapsed ? 'Expand Chat' : 'Minimize Chat'}
            className="flex h-6 w-6 items-center justify-center rounded-md border border-white/12 bg-white/5 text-slate-300 transition-colors hover:border-white/25 hover:text-white"
          >
            {isCollapsed ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {/* Scrollable Conversation Messages */}
      {!isCollapsed && (
        <div
          ref={scrollContainerRef}
          data-testid="chat-messages-scroll"
          className="flex max-h-[34vh] flex-col gap-2.5 overflow-y-auto px-3 py-2.5 sm:max-h-[40vh]"
        >
          {messages.map((entry) => {
            const isUser = entry.speaker === 'user';
            const entryBadmash = entry.mode === 'badmash';
            const isVoice = entry.messageType === 'VOICE';
            const isCopied = copiedId === entry.id;

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
                  className={`group relative max-w-[88%] rounded-2xl border px-3 py-2 text-xs leading-relaxed shadow-md transition-colors ${
                    isUser
                      ? 'rounded-br-sm border-cyan-400/45 bg-gradient-to-br from-sky-950/90 via-cyan-950/85 to-[#0b1526]/95 text-slate-50 shadow-[0_0_16px_rgba(34,211,238,0.12)]'
                      : entryBadmash
                        ? 'rounded-bl-sm border-rose-500/45 bg-gradient-to-br from-[#270b18]/95 via-[#1e0b29]/92 to-[#13091f]/95 text-rose-50 shadow-[0_0_18px_rgba(244,63,94,0.14)]'
                        : 'rounded-bl-sm border-sky-400/40 bg-gradient-to-br from-[#0b1933]/95 via-[#0a1428]/92 to-[#091020]/95 text-sky-50 shadow-[0_0_16px_rgba(56,189,248,0.12)]'
                  }`}
                >
                  {/* Bubble Header Row */}
                  <div className="mb-1 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-1.5 font-mono text-[10px]">
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
                      {isUser && (
                        <span
                          className="inline-flex items-center gap-0.5 text-[9px] text-cyan-200/75"
                          title={isVoice ? 'Voice Message' : 'Text Message'}
                        >
                          {isVoice ? <Mic className="h-2.5 w-2.5" /> : <Type className="h-2.5 w-2.5" />}
                          <span>{isVoice ? 'VOICE' : 'TEXT'}</span>
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => void handleCopy(entry.id, entry.text)}
                      aria-label="Copy message"
                      title="Copy message"
                      className="flex items-center gap-1 rounded px-1 py-0.5 font-mono text-[10px] text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
                    >
                      {isCopied ? (
                        <>
                          <Check className="h-3 w-3 text-emerald-400" />
                          <span className="text-emerald-300">Copied</span>
                        </>
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </button>
                  </div>

                  {/* Selectable Message Text */}
                  <p className="select-text break-words whitespace-pre-wrap text-[12.5px] leading-relaxed">
                    {entry.text}
                  </p>

                  {/* Timestamp */}
                  <div className="mt-1 flex items-center justify-end font-mono text-[9px] tabular-nums text-slate-400/90">
                    {formatMessageTime(entry.timestamp)}
                  </div>
                </div>
              </div>
            );
          })}

          {isResponding && (
            <div data-testid="chat-loading-indicator" className="flex items-start">
              <div
                className={`flex items-center gap-2 rounded-2xl rounded-bl-sm border px-3 py-2 text-xs ${
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

          <div ref={bottomAnchorRef} />
        </div>
      )}
    </div>
  );
}
