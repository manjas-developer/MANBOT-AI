import 'dotenv/config';
import express, { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel, GenerateContentResponse } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;

function getGenAIClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is missing. Please check the Settings > Secrets panel in AI Studio to ensure your API key is attached.'
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

function isQuotaExhaustedError(err: unknown): boolean {
  const raw = err instanceof Error ? err.message : String(err);
  return (
    raw.includes('429') ||
    raw.includes('RESOURCE_EXHAUSTED') ||
    raw.toLowerCase().includes('quota') ||
    raw.toLowerCase().includes('rate limit')
  );
}

function formatApiError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (raw.includes('403') || raw.includes('PERMISSION_DENIED') || raw.includes('API_KEY_INVALID') || raw.includes('400')) {
    if (raw.includes('API_KEY') || raw.includes('PERMISSION_DENIED')) {
      return 'Authentication error with Gemini API. Please check or select your API key in the Settings > Secrets panel.';
    }
  }
  if (isQuotaExhaustedError(err)) {
    return 'Free-tier API rate limit or quota reached (429 RESOURCE_EXHAUSTED). You can switch to high-throughput Flash-Lite or attach a fresh free or billing-enabled API key in the Settings > Secrets panel to continue immediately.';
  }
  return raw || 'An unexpected error occurred while communicating with MANBOT.';
}

function resolveThinkingLevel(
  level: string | undefined,
  model: string
): ThinkingLevel {
  if (level === 'LOW') {
    return ThinkingLevel.LOW;
  }
  if (level === 'XHIGH') {
    // ThinkingLevel.XHIGH is only supported on gemini-4-hydrogen
    if (model === 'gemini-4-hydrogen') {
      return ThinkingLevel.XHIGH;
    }
    return ThinkingLevel.HIGH;
  }
  return ThinkingLevel.HIGH;
}

interface IncomingAttachment {
  name: string;
  mimeType: string;
  base64Data: string;
}

interface IncomingMessage {
  role: 'user' | 'model';
  text: string;
  attachments?: IncomingAttachment[];
}

interface OperatorUsageRecord {
  userId: string;
  userName: string;
  deviceLabel: string;
  totalRequests: number;
  chatRequests: number;
  canvasRequests: number;
  imageRequests: number;
  lastModel: string;
  lastActiveAt: string;
}

const operatorUsageLedger = new Map<string, OperatorUsageRecord>();

function recordOperatorApiCall(params: {
  userId?: string;
  userName?: string;
  deviceLabel?: string;
  kind: 'chat' | 'canvas' | 'image';
  model: string;
}) {
  const id = (params.userId || 'USR-DEFAULT').trim();
  const name = (params.userName || 'Primary Operator').trim();
  const device = (params.deviceLabel || 'Web Studio').trim();

  const existing = operatorUsageLedger.get(id) || {
    userId: id,
    userName: name,
    deviceLabel: device,
    totalRequests: 0,
    chatRequests: 0,
    canvasRequests: 0,
    imageRequests: 0,
    lastModel: params.model,
    lastActiveAt: new Date().toISOString(),
  };

  existing.userName = name;
  existing.deviceLabel = device;
  existing.totalRequests += 1;
  if (params.kind === 'chat') existing.chatRequests += 1;
  if (params.kind === 'canvas') existing.canvasRequests += 1;
  if (params.kind === 'image') existing.imageRequests += 1;
  existing.lastModel = params.model;
  existing.lastActiveAt = new Date().toISOString();

  operatorUsageLedger.set(id, existing);
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '35mb' }));

  // Health & Connection Verification endpoint
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      assistant: 'MANBOT',
      hasApiKey: Boolean(process.env.GEMINI_API_KEY),
      timestamp: new Date().toISOString(),
    });
  });

  // Operator API Usage Attribution Ledger endpoint
  app.get('/api/usage', (_req: Request, res: Response) => {
    const operators = Array.from(operatorUsageLedger.values()).sort(
      (a, b) => new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime()
    );
    const totalApiCalls = operators.reduce((sum, item) => sum + item.totalRequests, 0);
    res.json({
      operators,
      totalApiCalls,
    });
  });

  // 1. Streaming Chat + Multimodal Analysis + Google Search Grounding (with Seamless Quota Fallback)
  app.post('/api/chat/stream', async (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');

    const sendEvent = (payload: Record<string, unknown>) => {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    try {
      const ai = getGenAIClient();
      const {
        messages = [],
        model = 'gemini-4-hydrogen',
        thinkingLevel = 'HIGH',
        useGoogleSearch = false,
        systemInstruction = '',
        activeCanvasContext = null,
        userIdentity = null,
      } = req.body as {
        messages: IncomingMessage[];
        model?: string;
        thinkingLevel?: string;
        useGoogleSearch?: boolean;
        systemInstruction?: string;
        activeCanvasContext?: { title: string; language: string; content: string } | null;
        userIdentity?: { id?: string; name?: string; deviceLabel?: string } | null;
      };

      const validModel =
        model === 'gemini-3.1-flash-lite' ? 'gemini-3.1-flash-lite' : 'gemini-4-hydrogen';

      recordOperatorApiCall({
        userId: userIdentity?.id,
        userName: userIdentity?.name,
        deviceLabel: userIdentity?.deviceLabel,
        kind: 'chat',
        model: validModel,
      });

      const contents = messages.map((msg) => {
        const parts: Array<
          | { text: string }
          | { inlineData: { mimeType: string; data: string } }
        > = [];

        if (Array.isArray(msg.attachments)) {
          for (const att of msg.attachments) {
            if (att.base64Data && att.mimeType) {
              parts.push({
                inlineData: {
                  mimeType: att.mimeType,
                  data: att.base64Data,
                },
              });
            }
          }
        }

        if (msg.text && msg.text.trim().length > 0) {
          parts.push({ text: msg.text });
        } else if (parts.length === 0) {
          parts.push({ text: 'Please analyze the attached file.' });
        }

        return {
          role: msg.role === 'model' ? 'model' : 'user',
          parts,
        };
      });

      const basePersona =
        'You are MANBOT, a sharp, deeply capable multimodal AI assistant and engineering studio powered by Google Gemini. ' +
        'Provide clear, well-structured answers using clean Markdown. When writing code or full documents, wrap them in fenced code blocks with an explicit language tag (e.g. ```typescript, ```html, ```python, ```markdown) so the user can open and edit them directly in the side-by-side Canvas.';

      const canvasAddendum = activeCanvasContext
        ? `\n\nThe user currently has a side-by-side Canvas open titled "${activeCanvasContext.title}" (${activeCanvasContext.language}):\n\`\`\`${activeCanvasContext.language}\n${activeCanvasContext.content}\n\`\`\`\nIf the user asks to revise or update the Canvas content, provide the updated version inside a fenced code block.`
        : '';

      const fullSystemInstruction = [
        basePersona,
        systemInstruction ? `User Custom Instructions: ${systemInstruction}` : '',
        canvasAddendum,
      ]
        .filter(Boolean)
        .join('\n\n');

      const buildConfig = (targetModel: string) => {
        const cfg: Record<string, unknown> = {
          systemInstruction: fullSystemInstruction,
        };
        if (targetModel === 'gemini-4-hydrogen') {
          cfg.thinkingConfig = {
            thinkingLevel: resolveThinkingLevel(thinkingLevel, targetModel),
          };
        }
        if (useGoogleSearch) {
          cfg.tools = [{ googleSearch: {} }];
        }
        return cfg;
      };

      let streamResponse;
      try {
        streamResponse = await ai.models.generateContentStream({
          model: validModel,
          contents,
          config: buildConfig(validModel),
        });
      } catch (primaryErr) {
        if (isQuotaExhaustedError(primaryErr) && validModel !== 'gemini-3.1-flash-lite') {
          sendEvent({
            type: 'fallback_notice',
            text: 'Primary model quota reached — seamlessly switched to high-throughput gemini-3.1-flash-lite.',
          });
          streamResponse = await ai.models.generateContentStream({
            model: 'gemini-3.1-flash-lite',
            contents,
            config: buildConfig('gemini-3.1-flash-lite'),
          });
        } else {
          throw primaryErr;
        }
      }

      const collectedSources = new Map<string, { title: string; uri: string }>();
      const collectedQueries = new Set<string>();

      for await (const chunk of streamResponse) {
        const c = chunk as GenerateContentResponse;
        const chunkText = c.text;
        if (chunkText) {
          sendEvent({ type: 'chunk', text: chunkText });
        }

        const groundingMeta = c.candidates?.[0]?.groundingMetadata;
        if (groundingMeta?.groundingChunks) {
          for (const gChunk of groundingMeta.groundingChunks) {
            if (gChunk.web?.uri) {
              collectedSources.set(gChunk.web.uri, {
                uri: gChunk.web.uri,
                title: gChunk.web.title || new URL(gChunk.web.uri).hostname,
              });
            }
          }
        }
        if (groundingMeta?.webSearchQueries) {
          for (const q of groundingMeta.webSearchQueries) {
            if (q) collectedQueries.add(q);
          }
        }
      }

      if (collectedSources.size > 0 || collectedQueries.size > 0) {
        sendEvent({
          type: 'grounding',
          sources: Array.from(collectedSources.values()),
          queries: Array.from(collectedQueries),
        });
      }

      sendEvent({ type: 'done' });
      res.end();
    } catch (error) {
      sendEvent({
        type: 'error',
        isQuotaError: isQuotaExhaustedError(error),
        message: formatApiError(error),
      });
      res.end();
    }
  });

  // 2. Side-by-Side Canvas AI Refinement Endpoint
  app.post('/api/canvas/refine', async (req: Request, res: Response) => {
    try {
      const ai = getGenAIClient();
      const {
        title = 'Untitled Canvas',
        language = 'markdown',
        content = '',
        instruction = 'Improve clarity and structure',
        userIdentity = null,
      } = req.body as {
        title?: string;
        language?: string;
        content: string;
        instruction: string;
        userIdentity?: { id?: string; name?: string; deviceLabel?: string } | null;
      };

      recordOperatorApiCall({
        userId: userIdentity?.id,
        userName: userIdentity?.name,
        deviceLabel: userIdentity?.deviceLabel,
        kind: 'canvas',
        model: 'gemini-4-hydrogen',
      });

      const prompt = `You are MANBOT's side-by-side Canvas editor engine.
Artifact Title: ${title}
Language / Format: ${language}
User Transformation Request: "${instruction}"

Current Content:
\`\`\`${language}
${content}
\`\`\`

Return ONLY the transformed ${language} content without surrounding conversational commentary or outer markdown fences (unless the language itself is markdown and uses internal code blocks).`;

      let response;
      try {
        response = await ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: prompt,
          config: {
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          },
        });
      } catch (primaryErr) {
        if (isQuotaExhaustedError(primaryErr)) {
          response = await ai.models.generateContent({
            model: 'gemini-3.1-flash-lite',
            contents: prompt,
          });
        } else {
          throw primaryErr;
        }
      }

      let updatedContent = (response.text ?? '').trim();
      // Strip outer code fence if model wrapped it
      const fenceRegex = new RegExp(`^\`\`\`(?:${language}|[a-zA-Z0-9_-]*)?\\n([\\s\\S]*?)\\n\`\`\`$`);
      const match = updatedContent.match(fenceRegex);
      if (match && match[1]) {
        updatedContent = match[1];
      }

      res.json({
        updatedContent: updatedContent || content,
      });
    } catch (error) {
      res.status(500).json({
        isQuotaError: isQuotaExhaustedError(error),
        error: formatApiError(error),
      });
    }
  });

  // 3. AI Image Generation & Editing Studio Endpoint (with Free-Tier Vector Artwork Fallback)
  app.post('/api/image/generate', async (req: Request, res: Response) => {
    try {
      const ai = getGenAIClient();
      const {
        prompt,
        aspectRatio = '1:1',
        referenceImage = null,
        userIdentity = null,
      } = req.body as {
        prompt: string;
        aspectRatio?: '1:1' | '16:9' | '4:3' | '3:4' | '9:16';
        referenceImage?: { mimeType: string; base64Data: string } | null;
        userIdentity?: { id?: string; name?: string; deviceLabel?: string } | null;
      };

      recordOperatorApiCall({
        userId: userIdentity?.id,
        userName: userIdentity?.name,
        deviceLabel: userIdentity?.deviceLabel,
        kind: 'image',
        model: 'gemini-3.1-flash-lite-image',
      });

      if (!prompt || !prompt.trim()) {
        res.status(400).json({ error: 'Please provide an image description prompt.' });
        return;
      }

      const parts: Array<
        | { text: string }
        | { inlineData: { mimeType: string; data: string } }
      > = [];

      if (referenceImage?.base64Data && referenceImage?.mimeType) {
        parts.push({
          inlineData: {
            mimeType: referenceImage.mimeType,
            data: referenceImage.base64Data,
          },
        });
      }

      parts.push({ text: prompt.trim() });

      try {
        const response = await ai.models.generateContent({
          model: 'gemini-3.1-flash-lite-image',
          contents: { parts },
          config: {
            imageConfig: {
              aspectRatio,
            },
          },
        });

        let imageUrl = '';
        let caption = '';

        for (const part of response.candidates?.[0]?.content?.parts ?? []) {
          if (part.inlineData?.data) {
            const mime = part.inlineData.mimeType ?? 'image/png';
            imageUrl = `data:${mime};base64,${part.inlineData.data}`;
          } else if (part.text) {
            caption += part.text;
          }
        }

        if (imageUrl) {
          res.json({
            imageUrl,
            caption: caption.trim(),
          });
          return;
        }
      } catch {
        // Fallback to free-tier SVG Studio Render when paid key is not enabled
      }

      const dimensionsMap: Record<string, { w: number; h: number }> = {
        '1:1': { w: 800, h: 800 },
        '16:9': { w: 960, h: 540 },
        '4:3': { w: 800, h: 600 },
        '3:4': { w: 600, h: 800 },
        '9:16': { w: 540, h: 960 },
      };
      const dims = dimensionsMap[aspectRatio] || { w: 800, h: 800 };
      const svgPrompt = `Create a richly detailed, artistic, studio-grade SVG artwork (width="${dims.w}" height="${dims.h}" viewBox="0 0 ${dims.w} ${dims.h}") depicting: "${prompt.trim()}".
Use sophisticated gradients (<linearGradient>, <radialGradient>), layered geometric and organic shapes, atmospheric lighting effects, and rich colors. Return ONLY raw valid <svg xmlns="http://www.w3.org/2000/svg" ...>...</svg> code without markdown fences or explanations.`;

      let svgResponse;
      try {
        svgResponse = await ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: svgPrompt,
          config: {
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          },
        });
      } catch (svgPrimaryErr) {
        if (isQuotaExhaustedError(svgPrimaryErr)) {
          svgResponse = await ai.models.generateContent({
            model: 'gemini-3.1-flash-lite',
            contents: svgPrompt,
          });
        } else {
          throw svgPrimaryErr;
        }
      }

      const rawSvg = (svgResponse.text ?? '').trim();
      const svgMatch = rawSvg.match(/<svg[\s\S]*?<\/svg>/i);
      if (svgMatch) {
        const base64Svg = Buffer.from(svgMatch[0], 'utf-8').toString('base64');
        res.json({
          imageUrl: `data:image/svg+xml;base64,${base64Svg}`,
          caption: 'Rendered via MANBOT Free-Tier Vector Studio',
        });
        return;
      }

      res.status(500).json({
        error: 'Unable to synthesize artwork. Please try refining your prompt.',
      });
    } catch (error) {
      res.status(500).json({
        isQuotaError: isQuotaExhaustedError(error),
        error: formatApiError(error),
      });
    }
  });

  if (process.env.NODE_ENV === 'production') {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`MANBOT server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start MANBOT server:', err);
  process.exit(1);
});
