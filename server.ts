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
  type LiveServerMessage,
} from '@google/genai';
import {
  buildCosmicSystemInstruction,
  COSMIC_BADMASH_ENTRANCE_CUE,
  COSMIC_TOOL_DECLARATIONS,
  getVoiceNameForMode,
} from './src/utils/cosmicPrompts.ts';
import type { CosmicMode } from './src/types/cosmic.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number.parseInt(process.env.PORT ?? '3000', 10) || 3000;

const LIVE_MODEL_CANDIDATES = Array.from(
  new Set(
    [
      process.env.COSMIC_LIVE_MODEL?.trim(),
      'gemini-3.1-flash-live-preview',
      'gemini-3.8-live',
    ].filter((m): m is string => Boolean(m && m.length > 0)),
  ),
);

type LiveSession = Awaited<ReturnType<GoogleGenAI['live']['connect']>>;

interface ClientControlMessage {
  type: 'connect' | 'set_mode' | 'audio' | 'text' | 'tool_response' | 'disconnect';
  badmashMode?: boolean;
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

function sendJson(ws: WebSocket, payload: Record<string, unknown>): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

async function connectGeminiLiveWithFallback(
  ai: GoogleGenAI,
  mode: CosmicMode,
  onMessage: (message: LiveServerMessage) => void,
  onSessionClosed: (reason: string) => void,
  onSessionError: (errMsg: string) => void,
): Promise<{ session: LiveSession; model: string; voice: string }> {
  const voice = getVoiceNameForMode(mode);
  const systemInstruction = buildCosmicSystemInstruction(mode);
  const errors: string[] = [];

  for (const model of LIVE_MODEL_CANDIDATES) {
    let settled = false;
    let sessionRef: LiveSession | null = null;

    try {
      const result = await new Promise<{ session: LiveSession; model: string; voice: string }>(
        (resolve, reject) => {
          let setupDone = false;
          let fallbackTimer: ReturnType<typeof setTimeout> | null = null;

          const finishResolve = (sess: LiveSession) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            if (fallbackTimer) clearTimeout(fallbackTimer);
            resolve({ session: sess, model, voice });
          };

          const finishReject = (err: Error) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            if (fallbackTimer) clearTimeout(fallbackTimer);
            try {
              sessionRef?.close();
            } catch {
              // ignore
            }
            reject(err);
          };

          const timeout = setTimeout(() => {
            finishReject(new Error(`Timed out waiting for setupComplete on ${model}`));
          }, 6500);

          ai.live
            .connect({
              model,
              config: {
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
              },
              callbacks: {
                onopen: () => {
                  console.log(`[Cosmic Live] WebSocket opened for model=${model}, voice=${voice}`);
                },
                onmessage: (msg: LiveServerMessage) => {
                  if (msg.setupComplete) {
                    setupDone = true;
                    if (sessionRef) {
                      finishResolve(sessionRef);
                    }
                  }
                  onMessage(msg);
                },
                onerror: (ev: ErrorEvent) => {
                  const errMsg = ev?.message || `Live session error on ${model}`;
                  if (!settled) {
                    finishReject(new Error(errMsg));
                  } else {
                    onSessionError(errMsg);
                  }
                },
                onclose: (ev: CloseEvent) => {
                  const reason = ev?.reason || `Closed (code ${ev?.code ?? 'unknown'})`;
                  if (!settled) {
                    finishReject(new Error(`Model ${model} closed during setup: ${reason}`));
                  } else {
                    onSessionClosed(reason);
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
                return;
              }
              // Fallback if transport skips emitting setupComplete packet
              fallbackTimer = setTimeout(() => {
                finishResolve(sess);
              }, 450);
            })
            .catch((err) => {
              finishReject(err instanceof Error ? err : new Error(String(err)));
            });
        },
      );

      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[Cosmic Live] Candidate ${model} failed: ${msg}`);
      errors.push(`${model}: ${msg}`);
    }
  }

  throw new Error(`Unable to connect to any Gemini Live model. Details: ${errors.join(' | ')}`);
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      app: 'COSMIC AI',
      hasApiKey: Boolean(process.env.GEMINI_API_KEY),
      preferredModels: LIVE_MODEL_CANDIDATES,
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

  wss.on('connection', (clientWs) => {
    let activeSession: LiveSession | null = null;
    let activeMode: CosmicMode = 'normal';
    let isSwitching = false;
    let clientClosed = false;
    let connectNonce = 0;

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

    const establishLiveSession = async (targetMode: CosmicMode, isModeSwitch: boolean) => {
      const myNonce = ++connectNonce;
      isSwitching = true;
      closeActiveSession();

      let ai: GoogleGenAI;
      try {
        ai = createGenAIClient();
      } catch (err) {
        isSwitching = false;
        sendJson(clientWs, {
          type: 'error',
          code: 'MISSING_API_KEY',
          message: err instanceof Error ? err.message : 'GEMINI_API_KEY missing.',
        });
        return;
      }

      try {
        const { session, model, voice } = await connectGeminiLiveWithFallback(
          ai,
          targetMode,
          (message: LiveServerMessage) => {
            if (clientClosed || myNonce !== connectNonce) return;

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
              sendJson(clientWs, { type: 'interrupted' });
            }

            if (serverContent?.turnComplete || serverContent?.generationComplete) {
              sendJson(clientWs, { type: 'turn_complete' });
            }

            if (serverContent?.inputTranscription?.text) {
              sendJson(clientWs, {
                type: 'input_transcript',
                text: serverContent.inputTranscription.text,
              });
            }

            if (serverContent?.outputTranscription?.text) {
              sendJson(clientWs, {
                type: 'output_transcript',
                text: serverContent.outputTranscription.text,
              });
            }

            if (message.toolCall?.functionCalls && message.toolCall.functionCalls.length > 0) {
              sendJson(clientWs, {
                type: 'tool_call',
                calls: message.toolCall.functionCalls.map((fc) => ({
                  id: fc.id || `fc_${Date.now()}`,
                  name: fc.name || '',
                  args: (fc.args as Record<string, unknown>) || {},
                })),
              });
            }
          },
          (reason: string) => {
            if (clientClosed || myNonce !== connectNonce || isSwitching) return;
            activeSession = null;
            sendJson(clientWs, {
              type: 'session_closed',
              reason,
            });
          },
          (errMsg: string) => {
            if (clientClosed || myNonce !== connectNonce) return;
            sendJson(clientWs, {
              type: 'error',
              code: 'LIVE_SESSION_ERROR',
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
        isSwitching = false;

        sendJson(clientWs, {
          type: isModeSwitch ? 'mode_updated' : 'connected',
          mode: activeMode,
          model,
          voice,
        });

        if (isModeSwitch && activeMode === 'badmash') {
          try {
            session.sendRealtimeInput({ text: COSMIC_BADMASH_ENTRANCE_CUE });
          } catch (cueErr) {
            console.warn('[Cosmic Live] Failed sending Badmash entrance cue:', cueErr);
          }
        }
      } catch (err) {
        if (clientClosed || myNonce !== connectNonce) return;
        isSwitching = false;
        sendJson(clientWs, {
          type: 'error',
          code: 'CONNECT_FAILED',
          message: err instanceof Error ? err.message : 'Failed to connect to Gemini Live.',
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
          message: 'Invalid JSON payload received by /live WebSocket.',
        });
        return;
      }

      if (msg.type === 'connect') {
        const mode: CosmicMode = msg.badmashMode ? 'badmash' : 'normal';
        void establishLiveSession(mode, false);
        return;
      }

      if (msg.type === 'set_mode') {
        const nextMode: CosmicMode = msg.badmashMode ? 'badmash' : 'normal';
        if (nextMode !== activeMode || !activeSession) {
          void establishLiveSession(nextMode, true);
        }
        return;
      }

      if (msg.type === 'disconnect') {
        connectNonce++;
        isSwitching = false;
        closeActiveSession();
        sendJson(clientWs, { type: 'disconnected' });
        return;
      }

      if (!activeSession || isSwitching) {
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
        try {
          activeSession.sendRealtimeInput({ text: msg.text.trim() });
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
      clientClosed = true;
      connectNonce++;
      closeActiveSession();
    });

    clientWs.on('error', (err) => {
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
