import 'dotenv/config';
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import {
  GoogleGenAI,
  Modality,
  type FunctionResponse,
  type LiveConnectConfig,
  type LiveServerMessage,
} from '@google/genai';
import {
  buildCosmicSystemInstruction,
  COSMIC_BADMASH_ENTRANCE_CUE,
  COSMIC_DEVELOPER_RESPECT_NOTICE,
  COSMIC_TOOL_DECLARATIONS,
  getVoiceNameForMode,
  resolveCosmicFeatures,
  type CosmicPromptOptions,
} from './src/utils/cosmicPrompts.ts';
import {
  issueAdminSessionToken,
  verifyAdminPasscode,
  verifyAdminSessionToken,
  verifyDeveloperCode,
} from './src/utils/developerAuth.ts';
import {
  checkKnowledgeRateLimit,
  searchLiveKnowledge,
} from './src/services/liveKnowledgeService.ts';
import {
  DEFAULT_COSMIC_FEATURES,
  type ConversationMemoryItem,
  type CosmicFeaturesConfig,
  type CosmicMode,
} from './src/types/cosmic.ts';
import {
  MAX_MEMORY_ITEMS,
  MAX_MEMORY_TEXT_CHARS,
  sanitizeConversationMemoryPayload,
} from './src/utils/conversationHistory.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number.parseInt(process.env.PORT ?? '3000', 10) || 3000;

const LIVE_MODEL_CANDIDATES = Array.from(
  new Set(
    [
      process.env.COSMIC_LIVE_MODEL?.trim(),
      'gemini-3.8-live',
      'gemini-3.1-flash-live-preview',
    ].filter((m): m is string => Boolean(m && m.length > 0)),
  ),
);

type LiveSession = Awaited<ReturnType<GoogleGenAI['live']['connect']>>;

interface ClientControlMessage {
  type:
    | 'connect'
    | 'set_mode'
    | 'update_features'
    | 'audio'
    | 'text'
    | 'tool_response'
    | 'ping'
    | 'disconnect';
  badmashMode?: boolean;
  resumeHandle?: string | null;
  features?: Partial<CosmicFeaturesConfig>;
  conversationMemory?: ConversationMemoryItem[];
  data?: string;
  mimeType?: string;
  text?: string;
  responses?: Array<{
    id: string;
    name: string;
    response: Record<string, unknown>;
  }>;
}

function createGenAIClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is not configured in the server environment. Configure it in Settings > Secrets.',
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function tryCreateOptionalGenAIClient(): GoogleGenAI | null {
  if (!process.env.GEMINI_API_KEY) return null;
  try {
    return createGenAIClient();
  } catch {
    return null;
  }
}

function sendJson(ws: WebSocket, payload: Record<string, unknown>): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function classifyLiveError(message: string, closeCode?: number): {
  code: string;
  retryable: boolean;
} {
  const lower = message.toLowerCase();
  if (/api key|api_key_invalid|permission_denied|403|1007/.test(lower) || closeCode === 1007) {
    if (/resumption|handle|session/.test(lower)) {
      return { code: 'RESUMPTION_HANDLE_EXPIRED', retryable: true };
    }
    return { code: 'API_KEY_OR_CONFIG_ERROR', retryable: false };
  }
  if (/quota|resource_exhausted|429|rate limit/.test(lower)) {
    return { code: 'API_QUOTA_OR_RATE_LIMIT', retryable: true };
  }
  if (/not_found|404|model .* not found/.test(lower)) {
    return { code: 'MODEL_UNAVAILABLE', retryable: true };
  }
  if (/timeout|timed out|etimedout|econnreset|socket|goaway|1001|1006|1011|1012|1013/.test(lower)) {
    return { code: 'TRANSIENT_CONNECTION_DROP', retryable: true };
  }
  return { code: 'LIVE_CONNECTION_ERROR', retryable: true };
}

interface ConnectAttemptOptions {
  mode: CosmicMode;
  promptOptions: CosmicPromptOptions;
  resumeHandle: string | null;
  enableResumptionAndCompression: boolean;
  onMessage: (message: LiveServerMessage) => void;
  onSessionClosed: (closeCode: number | undefined, reason: string) => void;
  onSessionError: (errMsg: string) => void;
}

async function attemptSingleLiveConnect(
  ai: GoogleGenAI,
  model: string,
  opts: ConnectAttemptOptions,
): Promise<{ session: LiveSession; model: string; voice: string; resumed: boolean }> {
  const voice = getVoiceNameForMode(opts.mode);
  const systemInstruction = buildCosmicSystemInstruction(opts.mode, opts.promptOptions);
  const attemptStart = Date.now();

  const liveConfig: LiveConnectConfig = {
    responseModalities: [Modality.AUDIO],
    speechConfig: {
      voiceConfig: {
        prebuiltVoiceConfig: { voiceName: voice },
      },
    },
    systemInstruction,
    tools: [{ functionDeclarations: COSMIC_TOOL_DECLARATIONS }],
    inputAudioTranscription: {},
    outputAudioTranscription: {},
  };

  if (opts.enableResumptionAndCompression) {
    liveConfig.sessionResumption = opts.resumeHandle
      ? { handle: opts.resumeHandle }
      : {};
    liveConfig.contextWindowCompression = { slidingWindow: {} };
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    let setupDone = false;
    let sessionRef: LiveSession | null = null;

    const finishResolve = (sess: LiveSession) => {
      if (settled) return;
      settled = true;
      clearTimeout(setupTimeout);
      console.info(
        `[Cosmic Live] Connected model=${model}, voice=${voice}, resumed=${Boolean(
          opts.resumeHandle && opts.enableResumptionAndCompression,
        )}, elapsed=${Date.now() - attemptStart}ms`,
      );
      resolve({
        session: sess,
        model,
        voice,
        resumed: Boolean(opts.resumeHandle && opts.enableResumptionAndCompression),
      });
    };

    const finishReject = (err: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(setupTimeout);
      try {
        sessionRef?.close();
      } catch {
        // ignore close failure
      }
      reject(err);
    };

    const setupTimeout = setTimeout(() => {
      finishReject(new Error(`Timed out waiting for setupComplete on ${model} after 9000ms`));
    }, 9000);

    ai.live
      .connect({
        model,
        config: liveConfig,
        callbacks: {
          onopen: () => {
            console.log(`[Cosmic Live] Upstream socket opened model=${model}, voice=${voice}`);
          },
          onmessage: (msg: LiveServerMessage) => {
            if (msg.setupComplete && !setupDone) {
              setupDone = true;
              if (sessionRef) {
                finishResolve(sessionRef);
              }
            }
            opts.onMessage(msg);
          },
          onerror: (ev: ErrorEvent) => {
            const errMsg = ev?.message || `Live session error on ${model}`;
            if (!settled) {
              finishReject(new Error(errMsg));
            } else {
              opts.onSessionError(errMsg);
            }
          },
          onclose: (ev: CloseEvent) => {
            const closeCode = typeof ev?.code === 'number' ? ev.code : undefined;
            const reason = ev?.reason || `Closed (code ${closeCode ?? 'unknown'})`;
            if (!settled) {
              finishReject(
                new Error(`Model ${model} closed during setup (code=${closeCode ?? 'n/a'}): ${reason}`),
              );
            } else {
              opts.onSessionClosed(closeCode, reason);
            }
          },
        },
      })
      .then((sess) => {
        sessionRef = sess;
        if (settled) {
          try {
            sess.close();
          } catch {
            // ignore
          }
          return;
        }
        if (setupDone) {
          finishResolve(sess);
        }
      })
      .catch((err) => {
        finishReject(err instanceof Error ? err : new Error(String(err)));
      });
  });
}

async function connectGeminiLiveWithFallback(
  ai: GoogleGenAI,
  mode: CosmicMode,
  promptOptions: CosmicPromptOptions,
  resumeHandle: string | null,
  onMessage: (message: LiveServerMessage) => void,
  onSessionClosed: (closeCode: number | undefined, reason: string) => void,
  onSessionError: (errMsg: string) => void,
): Promise<{ session: LiveSession; model: string; voice: string; resumed: boolean }> {
  const errors: string[] = [];

  for (const model of LIVE_MODEL_CANDIDATES) {
    // 1. First try with requested resumeHandle (if any) + sessionResumption & compression
    try {
      return await attemptSingleLiveConnect(ai, model, {
        mode,
        promptOptions,
        resumeHandle,
        enableResumptionAndCompression: true,
        onMessage,
        onSessionClosed,
        onSessionError,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[Cosmic Live] Candidate ${model} (resumption attempt) failed: ${msg}`);
      errors.push(`${model}: ${msg}`);

      // 2. If resuming with an expired/rejected handle failed, immediately retry fresh on the same model
      if (resumeHandle) {
        try {
          console.info(`[Cosmic Live] Retrying ${model} with fresh session (discarding stale handle)`);
          return await attemptSingleLiveConnect(ai, model, {
            mode,
            promptOptions,
            resumeHandle: null,
            enableResumptionAndCompression: true,
            onMessage,
            onSessionClosed,
            onSessionError,
          });
        } catch (freshErr) {
          const freshMsg = freshErr instanceof Error ? freshErr.message : String(freshErr);
          errors.push(`${model}(fresh): ${freshMsg}`);
        }
      }

      // 3. Fallback without resumption/compression flags if a preview endpoint rejects those fields
      if (/sessionresumption|contextwindowcompression|unknown name|unsupported/i.test(msg)) {
        try {
          return await attemptSingleLiveConnect(ai, model, {
            mode,
            promptOptions,
            resumeHandle: null,
            enableResumptionAndCompression: false,
            onMessage,
            onSessionClosed,
            onSessionError,
          });
        } catch (basicErr) {
          const basicMsg = basicErr instanceof Error ? basicErr.message : String(basicErr);
          errors.push(`${model}(basic): ${basicMsg}`);
        }
      }
    }
  }

  throw new Error(`Unable to connect to Gemini Live. Details: ${errors.join(' | ')}`);
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      ok: true,
      app: 'COSMIC AI',
      serverTime: new Date().toISOString(),
      hasApiKey: Boolean(process.env.GEMINI_API_KEY),
      preferredModels: LIVE_MODEL_CANDIDATES,
      features: {
        liveKnowledge: true,
        sessionResumption: true,
        contextCompression: true,
      },
    });
  });

  app.options('/api/knowledge/search', (_req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.status(204).end();
  });

  const handleKnowledgeSearch = async (
    req: express.Request,
    res: express.Response,
  ): Promise<void> => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-store');

    const clientIp =
      (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ||
      req.socket.remoteAddress ||
      'unknown';

    if (!checkKnowledgeRateLimit(clientIp)) {
      res.status(429).json({
        ok: false,
        offline: false,
        error: 'Rate limit exceeded for live knowledge search. Wait a moment and try again.',
        items: [],
        sources: [],
      });
      return;
    }

    const rawQuery =
      req.method === 'POST'
        ? (req.body?.query as string | undefined)
        : (req.query.q as string | undefined);
    const rawCategory =
      req.method === 'POST'
        ? (req.body?.category as string | undefined)
        : (req.query.category as string | undefined);

    if (typeof rawQuery !== 'string' || rawQuery.trim().length === 0) {
      res.status(400).json({
        ok: false,
        offline: false,
        error: 'A non-empty search query is required.',
        items: [],
        sources: [],
      });
      return;
    }

    const ai = tryCreateOptionalGenAIClient();
    const result = await searchLiveKnowledge(rawQuery.slice(0, 200), rawCategory, { ai });
    res.status(result.ok ? 200 : 503).json(result);
  };

  app.get('/api/knowledge/search', (req, res) => {
    void handleKnowledgeSearch(req, res);
  });
  app.post('/api/knowledge/search', (req, res) => {
    void handleKnowledgeSearch(req, res);
  });

  // Protected Admin/Developer Authentication (never uses wildcard CORS)
  const adminAttemptBuckets = new Map<string, number[]>();
  const resolveAdminCorsOrigin = (req: express.Request): string | null => {
    const origin = req.headers.origin;
    if (!origin) return null;
    if (origin === 'https://appassets.androidplatform.net') return origin;
    const host = req.headers.host;
    if (host && (origin === `https://${host}` || origin === `http://${host}`)) {
      return origin;
    }
    return null;
  };

  app.options(['/api/admin/verify', '/api/admin/status'], (req, res) => {
    const allowedOrigin = resolveAdminCorsOrigin(req);
    if (allowedOrigin) {
      res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
      res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.status(204).end();
  });

  app.post('/api/admin/verify', (req, res) => {
    const allowedOrigin = resolveAdminCorsOrigin(req);
    if (allowedOrigin) {
      res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
      res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Cache-Control', 'no-store');

    const clientIp =
      (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ||
      req.socket.remoteAddress ||
      'unknown';
    const now = Date.now();
    const attempts = (adminAttemptBuckets.get(clientIp) ?? []).filter(
      (ts) => now - ts < 5 * 60 * 1000,
    );
    if (attempts.length >= 10) {
      adminAttemptBuckets.set(clientIp, attempts);
      res.status(429).json({ ok: false, error: 'Too many verification attempts. Wait 5 minutes.' });
      return;
    }

    const passcode = typeof req.body?.passcode === 'string' ? req.body.passcode : '';
    if (!verifyAdminPasscode(passcode)) {
      attempts.push(now);
      adminAttemptBuckets.set(clientIp, attempts);
      res.status(401).json({ ok: false, error: 'Invalid developer passcode.' });
      return;
    }

    const sessionToken = issueAdminSessionToken();
    res.json({ ok: true, token: sessionToken.token, expiresAt: sessionToken.expiresAt });
  });

  app.get('/api/admin/status', (req, res) => {
    const allowedOrigin = resolveAdminCorsOrigin(req);
    if (allowedOrigin) {
      res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
      res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Cache-Control', 'no-store');

    const authHeader = req.headers.authorization || '';
    const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!verifyAdminSessionToken(bearer)) {
      res.status(401).json({ ok: false, authorized: false });
      return;
    }
    res.json({
      ok: true,
      authorized: true,
      featuresEnabledInBackground: true,
    });
  });

  app.get(['/privacy-policy', '/privacy-policy.html'], (_req, res) => {
    const prodFile = path.resolve(__dirname, 'dist', 'privacy-policy.html');
    const publicFile = path.resolve(__dirname, 'public', 'privacy-policy.html');
    res.sendFile(process.env.NODE_ENV === 'production' ? prodFile : publicFile);
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distDir, 'index.html'));
    });
  }

  const httpServer = http.createServer(app);
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: 2 * 1024 * 1024,
  });

  httpServer.on('upgrade', (request, socket, head) => {
    try {
      const reqUrl = new URL(request.url ?? '/', `http://${request.headers.host || 'localhost'}`);
      if (reqUrl.pathname === '/live') {
        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit('connection', ws, request);
        });
      }
    } catch {
      socket.destroy();
    }
  });

  wss.on('connection', (clientWs, req) => {
    const clientIp =
      (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ||
      req.socket.remoteAddress ||
      'ws-client';

    let activeSession: LiveSession | null = null;
    let activeMode: CosmicMode = 'normal';
    let activeFeatures: CosmicFeaturesConfig = { ...DEFAULT_COSMIC_FEATURES };
    let isDeveloperVerified = false;
    let latestResumeHandle: string | null = null;
    const recentAssistantOpeners: string[] = [];
    let activeConversationMemory: ConversationMemoryItem[] = [];
    let currentInputTranscriptBuffer = '';
    let currentOutputTranscriptBuffer = '';
    let isEstablishing = false;
    let clientClosed = false;
    let connectNonce = 0;
    let isAlive = true;

    const recordMemoryTurn = (
      speaker: 'user' | 'cosmic',
      rawText: string,
      mode: CosmicMode,
    ) => {
      const cleaned = rawText.replace(/\s+/g, ' ').trim().slice(0, MAX_MEMORY_TEXT_CHARS);
      if (!cleaned) return;
      const last = activeConversationMemory[activeConversationMemory.length - 1];
      if (last && last.speaker === speaker && last.text === cleaned) return;
      activeConversationMemory = [
        ...activeConversationMemory,
        { speaker, text: cleaned, mode, timestamp: Date.now() },
      ].slice(-MAX_MEMORY_ITEMS);
    };

    const heartbeatTimer = setInterval(() => {
      if (clientWs.readyState !== WebSocket.OPEN) return;
      if (!isAlive) {
        console.warn('[Cosmic Live] Terminating unresponsive client WebSocket (missed pong).');
        clientWs.terminate();
        return;
      }
      isAlive = false;
      try {
        clientWs.ping();
      } catch {
        // ignore
      }
    }, 20000);

    clientWs.on('pong', () => {
      isAlive = true;
    });

    const recordAssistantOpener = (fullText: string) => {
      const cleaned = fullText.replace(/\s+/g, ' ').trim();
      if (!cleaned) return;
      const firstSentence =
        cleaned.split(/(?<=[.!?])\s+/)[0]?.slice(0, 120) || cleaned.slice(0, 120);
      if (firstSentence.length < 8) return;
      if (recentAssistantOpeners[recentAssistantOpeners.length - 1] !== firstSentence) {
        recentAssistantOpeners.push(firstSentence);
        if (recentAssistantOpeners.length > 6) {
          recentAssistantOpeners.shift();
        }
      }
    };

    const promoteDeveloperRespectMode = (triggerSession: LiveSession | null) => {
      if (isDeveloperVerified) return;
      isDeveloperVerified = true;
      sendJson(clientWs, { type: 'developer_verified', verified: true });
      if (triggerSession) {
        try {
          triggerSession.sendRealtimeInput({ text: COSMIC_DEVELOPER_RESPECT_NOTICE });
        } catch (err) {
          console.warn('[Cosmic Live] Failed injecting Respect Mode notice:', err);
        }
      }
    };

    const closeActiveSession = () => {
      if (activeSession) {
        const s = activeSession;
        activeSession = null;
        try {
          s.close();
        } catch (err) {
          console.warn('[Cosmic Live] Error closing Gemini session:', err);
        }
      }
    };

    const establishLiveSession = async (
      targetMode: CosmicMode,
      opts: {
        isModeSwitch: boolean;
        isAutoResume?: boolean;
        resumeHandleOverride?: string | null;
      },
    ) => {
      const myNonce = ++connectNonce;
      isEstablishing = true;
      closeActiveSession();

      let ai: GoogleGenAI;
      try {
        ai = createGenAIClient();
      } catch (err) {
        isEstablishing = false;
        sendJson(clientWs, {
          type: 'error',
          code: 'MISSING_API_KEY',
          retryable: false,
          message: err instanceof Error ? err.message : 'GEMINI_API_KEY missing.',
        });
        return;
      }

      const handleToUse =
        opts.isModeSwitch
          ? null
          : opts.resumeHandleOverride !== undefined
            ? opts.resumeHandleOverride
            : latestResumeHandle;

      const connectStartedAt = Date.now();

      try {
        const { session, model, voice, resumed } = await connectGeminiLiveWithFallback(
          ai,
          targetMode,
          {
            developerVerified: isDeveloperVerified,
            recentResponses: recentAssistantOpeners,
            conversationMemory: activeConversationMemory,
            features: activeFeatures,
          },
          handleToUse,
          (message: LiveServerMessage) => {
            if (clientClosed || myNonce !== connectNonce) return;

            if (message.sessionResumptionUpdate) {
              const update = message.sessionResumptionUpdate;
              if (update.resumable && update.newHandle) {
                latestResumeHandle = update.newHandle;
                sendJson(clientWs, {
                  type: 'session_resumption',
                  handle: update.newHandle,
                  resumable: true,
                });
              } else if (update.resumable === false && !update.newHandle) {
                sendJson(clientWs, {
                  type: 'session_resumption',
                  handle: latestResumeHandle,
                  resumable: false,
                });
              }
            }

            if (message.goAway) {
              const timeLeft = message.goAway.timeLeft || 'unknown';
              console.warn(`[Cosmic Live] Received GoAway from Gemini (timeLeft=${timeLeft}).`);
              sendJson(clientWs, {
                type: 'go_away',
                timeLeft,
                resumable: Boolean(latestResumeHandle),
              });
              // Proactively hand off before server terminates socket when we hold a valid resumption handle
              if (latestResumeHandle && !isEstablishing) {
                void establishLiveSession(activeMode, {
                  isModeSwitch: false,
                  isAutoResume: true,
                  resumeHandleOverride: latestResumeHandle,
                });
              }
              return;
            }

            const serverContent = message.serverContent;
            if (serverContent?.modelTurn?.parts) {
              for (const part of serverContent.modelTurn.parts) {
                if (part.inlineData?.data) {
                  sendJson(clientWs, {
                    type: 'audio',
                    data: part.inlineData.data,
                    mimeType: part.inlineData.mimeType || 'audio/pcm;rate=24000',
                  });
                }
              }
            }

            if (serverContent?.interrupted) {
              currentOutputTranscriptBuffer = '';
              sendJson(clientWs, { type: 'interrupted' });
            }

            if (serverContent?.turnComplete) {
              if (currentInputTranscriptBuffer.trim()) {
                recordMemoryTurn('user', currentInputTranscriptBuffer, activeMode);
              }
              if (currentOutputTranscriptBuffer.trim()) {
                recordAssistantOpener(currentOutputTranscriptBuffer);
                recordMemoryTurn('cosmic', currentOutputTranscriptBuffer, activeMode);
              }
              currentInputTranscriptBuffer = '';
              currentOutputTranscriptBuffer = '';
              sendJson(clientWs, { type: 'turn_complete' });
            }

            if (serverContent?.inputTranscription?.text) {
              const incomingChunk = serverContent.inputTranscription.text;
              currentInputTranscriptBuffer =
                `${currentInputTranscriptBuffer} ${incomingChunk}`.trim();
              if (!isDeveloperVerified && verifyDeveloperCode(currentInputTranscriptBuffer)) {
                promoteDeveloperRespectMode(activeSession);
              }
              sendJson(clientWs, {
                type: 'input_transcript',
                text: incomingChunk,
              });
            }

            if (serverContent?.outputTranscription?.text) {
              const outChunk = serverContent.outputTranscription.text;
              currentOutputTranscriptBuffer =
                `${currentOutputTranscriptBuffer} ${outChunk}`.trim();
              sendJson(clientWs, {
                type: 'output_transcript',
                text: outChunk,
              });
            }

            if (message.toolCall?.functionCalls && message.toolCall.functionCalls.length > 0) {
              const serverToolCalls = message.toolCall.functionCalls.filter(
                (fc) => fc.name === 'searchLiveKnowledge',
              );
              const clientToolCalls = message.toolCall.functionCalls.filter(
                (fc) => fc.name !== 'searchLiveKnowledge',
              );

              for (const fc of serverToolCalls) {
                const args = (fc.args as Record<string, unknown>) || {};
                const query = typeof args.query === 'string' ? args.query : '';
                const category = typeof args.category === 'string' ? args.category : 'general';
                const callId = fc.id || `lk_${Date.now()}`;

                void (async () => {
                  const startedAt = Date.now();
                  console.info(`[Cosmic Live Tool] searchLiveKnowledge started category=${category}`);
                  const allowed = checkKnowledgeRateLimit(`ws:${clientIp}`);
                  const searchResult = allowed
                    ? await searchLiveKnowledge(query, category, { ai })
                    : {
                        ok: false,
                        query,
                        category,
                        fetchedAt: new Date().toISOString(),
                        offline: false,
                        summary: 'Rate limit exceeded for live search. Try again in a few seconds.',
                        items: [],
                        sources: [],
                        error: 'Rate limit exceeded',
                      };

                  if (clientClosed || myNonce !== connectNonce || !activeSession) return;

                  console.info(
                    `[Cosmic Live Tool] searchLiveKnowledge completed ok=${searchResult.ok} items=${searchResult.items.length} elapsed=${Date.now() - startedAt}ms`,
                  );

                  sendJson(clientWs, {
                    type: 'knowledge_sources',
                    result: searchResult,
                  });

                  try {
                    activeSession.sendToolResponse({
                      functionResponses: [
                        {
                          id: callId,
                          name: 'searchLiveKnowledge',
                          response: {
                            ok: searchResult.ok,
                            offline: searchResult.offline,
                            fetchedAt: searchResult.fetchedAt,
                            category: searchResult.category,
                            summary: searchResult.summary,
                            items: searchResult.items.map((it) => ({
                              headline: it.headline,
                              source: it.source,
                              date: it.dateLabel,
                              snippet: it.snippet,
                              corroboratedBy: it.corroboratedBy,
                            })),
                            error: searchResult.error ?? null,
                          },
                        },
                      ],
                    });
                  } catch (toolErr) {
                    console.error('[Cosmic Live Tool] Failed sending searchLiveKnowledge response:', toolErr);
                  }
                })();
              }

              if (clientToolCalls.length > 0) {
                console.info(
                  `[Cosmic Live Tool] Forwarding client tool calls: ${clientToolCalls
                    .map((fc) => fc.name || 'unknown')
                    .join(', ')}`,
                );
                sendJson(clientWs, {
                  type: 'tool_call',
                  calls: clientToolCalls.map((fc) => ({
                    id: fc.id || `fc_${Date.now()}`,
                    name: fc.name || '',
                    args: (fc.args as Record<string, unknown>) || {},
                  })),
                });
              }
            }
          },
          (closeCode: number | undefined, reason: string) => {
            if (clientClosed || myNonce !== connectNonce || isEstablishing) return;
            activeSession = null;
            const classification = classifyLiveError(reason, closeCode);
            console.warn(
              `[Cosmic Live] Upstream session closed code=${closeCode ?? 'unknown'} reason="${reason}" resumable=${Boolean(latestResumeHandle)}`,
            );
            sendJson(clientWs, {
              type: 'session_closed',
              closeCode: closeCode ?? null,
              reason,
              code: classification.code,
              retryable: classification.retryable,
              resumeHandle: latestResumeHandle,
            });
          },
          (errMsg: string) => {
            if (clientClosed || myNonce !== connectNonce) return;
            const classification = classifyLiveError(errMsg);
            console.error(`[Cosmic Live] Upstream session error: ${errMsg}`);
            sendJson(clientWs, {
              type: 'error',
              code: classification.code,
              retryable: classification.retryable,
              message: errMsg,
            });
          },
        );

        if (clientClosed || myNonce !== connectNonce) {
          try {
            session.close();
          } catch {
            // ignore
          }
          return;
        }

        activeSession = session;
        activeMode = targetMode;
        isEstablishing = false;

        sendJson(clientWs, {
          type: opts.isModeSwitch ? 'mode_updated' : 'connected',
          mode: activeMode,
          model,
          voice,
          resumed,
          autoResumed: Boolean(opts.isAutoResume),
          elapsedMs: Date.now() - connectStartedAt,
          developerVerified: isDeveloperVerified,
          resumeHandle: latestResumeHandle,
        });

        if (opts.isModeSwitch && activeMode === 'badmash') {
          try {
            session.sendRealtimeInput({ text: COSMIC_BADMASH_ENTRANCE_CUE });
          } catch (cueErr) {
            console.warn('[Cosmic Live] Failed sending Badmash entrance cue:', cueErr);
          }
        }
      } catch (err) {
        if (clientClosed || myNonce !== connectNonce) return;
        isEstablishing = false;
        const message = err instanceof Error ? err.message : 'Failed to connect to Gemini Live.';
        const classification = classifyLiveError(message);
        console.error(`[Cosmic Live] Connect attempt failed (${classification.code}): ${message}`);
        sendJson(clientWs, {
          type: 'error',
          code: classification.code,
          retryable: classification.retryable,
          message,
          elapsedMs: Date.now() - connectStartedAt,
        });
      }
    };

    clientWs.on('message', (rawData) => {
      let msg: ClientControlMessage;
      try {
        msg = JSON.parse(rawData.toString()) as ClientControlMessage;
      } catch {
        sendJson(clientWs, {
          type: 'error',
          code: 'BAD_MESSAGE',
          retryable: false,
          message: 'Invalid JSON payload received by /live WebSocket.',
        });
        return;
      }

      if (msg.type === 'ping') {
        isAlive = true;
        sendJson(clientWs, { type: 'pong', serverTime: Date.now() });
        return;
      }

      if (msg.features) {
        activeFeatures = resolveCosmicFeatures(msg.features);
      }

      if (Array.isArray(msg.conversationMemory)) {
        const sanitized = sanitizeConversationMemoryPayload(msg.conversationMemory);
        if (sanitized.length > 0) {
          activeConversationMemory = sanitized;
        }
      }

      if (msg.type === 'connect') {
        const mode: CosmicMode = msg.badmashMode ? 'badmash' : 'normal';
        const handleOverride =
          typeof msg.resumeHandle === 'string' && msg.resumeHandle.trim().length > 0
            ? msg.resumeHandle.trim()
            : null;
        void establishLiveSession(mode, {
          isModeSwitch: false,
          resumeHandleOverride: handleOverride,
        });
        return;
      }

      if (msg.type === 'set_mode') {
        const nextMode: CosmicMode = msg.badmashMode ? 'badmash' : 'normal';
        if (nextMode !== activeMode || !activeSession) {
          latestResumeHandle = null;
          void establishLiveSession(nextMode, { isModeSwitch: true });
        }
        return;
      }

      if (msg.type === 'update_features') {
        if (activeSession && !isEstablishing) {
          latestResumeHandle = null;
          void establishLiveSession(activeMode, {
            isModeSwitch: false,
            isAutoResume: false,
            resumeHandleOverride: null,
          });
        }
        return;
      }

      if (msg.type === 'disconnect') {
        connectNonce++;
        isEstablishing = false;
        latestResumeHandle = null;
        closeActiveSession();
        sendJson(clientWs, { type: 'disconnected' });
        return;
      }

      if (!activeSession || isEstablishing) {
        return;
      }

      if (msg.type === 'audio' && typeof msg.data === 'string' && msg.data.length > 0) {
        try {
          activeSession.sendRealtimeInput({
            audio: {
              data: msg.data,
              mimeType: msg.mimeType || 'audio/pcm;rate=16000',
            },
          });
        } catch (err) {
          console.error('[Cosmic Live] Failed forwarding audio chunk:', err);
        }
        return;
      }

      if (msg.type === 'text' && typeof msg.text === 'string' && msg.text.trim().length > 0) {
        const cleanedText = msg.text.trim();
        recordMemoryTurn('user', cleanedText, activeMode);
        try {
          if (!isDeveloperVerified && verifyDeveloperCode(cleanedText)) {
            promoteDeveloperRespectMode(activeSession);
            activeSession.sendRealtimeInput({
              text: `${COSMIC_DEVELOPER_RESPECT_NOTICE}\nDeveloper message: ${cleanedText}`,
            });
          } else {
            activeSession.sendRealtimeInput({ text: cleanedText });
          }
        } catch (err) {
          console.error('[Cosmic Live] Failed forwarding text input:', err);
        }
        return;
      }

      if (msg.type === 'tool_response' && Array.isArray(msg.responses)) {
        try {
          const functionResponses: FunctionResponse[] = msg.responses.map((r) => ({
            id: r.id,
            name: r.name,
            response: r.response,
          }));
          activeSession.sendToolResponse({ functionResponses });
        } catch (err) {
          console.error('[Cosmic Live] Failed sending tool response:', err);
        }
      }
    });

    clientWs.on('close', () => {
      clearInterval(heartbeatTimer);
      clientClosed = true;
      connectNonce++;
      closeActiveSession();
    });

    clientWs.on('error', (err) => {
      clearInterval(heartbeatTimer);
      console.warn('[Cosmic Live] Client WebSocket error:', err.message);
      clientClosed = true;
      connectNonce++;
      closeActiveSession();
    });
  });

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`[COSMIC AI] Server listening on http://0.0.0.0:${PORT}`);
  });
}

void startServer();
