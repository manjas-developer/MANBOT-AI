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

function formatApiError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (raw.includes('403') || raw.includes('PERMISSION_DENIED') || raw.includes('API_KEY_INVALID') || raw.includes('400')) {
    if (raw.includes('API_KEY') || raw.includes('PERMISSION_DENIED')) {
      return 'Authentication error with Gemini API. Please check or select your API key in the Settings > Secrets panel.';
    }
  }
  if (raw.includes('429') || raw.includes('RESOURCE_EXHAUSTED')) {
    return 'Rate limit or quota reached (429). Upgrading to a paid tier increases quota—you can select a billing-enabled API key in the Settings > Secrets panel.';
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

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '35mb' }));

  // Health endpoint
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      assistant: 'MANBOT',
      hasApiKey: Boolean(process.env.GEMINI_API_KEY),
    });
  });

  // 1. Streaming Chat + Multimodal Analysis + Google Search Grounding
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
      } = req.body as {
        messages: IncomingMessage[];
        model?: string;
        thinkingLevel?: string;
        useGoogleSearch?: boolean;
        systemInstruction?: string;
        activeCanvasContext?: { title: string; language: string; content: string } | null;
      };

      const validModel =
        model === 'gemini-3.1-flash-lite' ? 'gemini-3.1-flash-lite' : 'gemini-4-hydrogen';

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

      const config: Record<string, unknown> = {
        systemInstruction: fullSystemInstruction,
      };

      if (validModel === 'gemini-4-hydrogen') {
        config.thinkingConfig = {
          thinkingLevel: resolveThinkingLevel(thinkingLevel, validModel),
        };
      }

      if (useGoogleSearch) {
        config.tools = [{ googleSearch: {} }];
      }

      const streamResponse = await ai.models.generateContentStream({
        model: validModel,
        contents,
        config,
      });

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
      } = req.body as {
        title?: string;
        language?: string;
        content: string;
        instruction: string;
      };

      const prompt = `You are MANBOT's side-by-side Canvas editor engine.
Artifact Title: ${title}
Language / Format: ${language}
User Transformation Request: "${instruction}"

Current Content:
\`\`\`${language}
${content}
\`\`\`

Return ONLY the transformed ${language} content without surrounding conversational commentary or outer markdown fences (unless the language itself is markdown and uses internal code blocks).`;

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      });

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
      } = req.body as {
        prompt: string;
        aspectRatio?: '1:1' | '16:9' | '4:3' | '3:4' | '9:16';
        referenceImage?: { mimeType: string; base64Data: string } | null;
      };

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
        // Fallback to free-tier Gemini 4 Hydrogen SVG Studio Render when paid key is not enabled
      }

      const dimensionsMap: Record<string, { w: number; h: number }> = {
        '1:1': { w: 800, h: 800 },
        '16:9': { w: 960, h: 540 },
        '4:3': { w: 800, h: 600 },
        '3:4': { w: 600, h: 800 },
        '9:16': { w: 540, h: 960 },
      };
      const dims = dimensionsMap[aspectRatio] || { w: 800, h: 800 };

      const svgResponse = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Create a richly detailed, artistic, studio-grade SVG artwork (width="${dims.w}" height="${dims.h}" viewBox="0 0 ${dims.w} ${dims.h}") depicting: "${prompt.trim()}".
Use sophisticated gradients (<linearGradient>, <radialGradient>), layered geometric and organic shapes, atmospheric lighting effects, and rich colors. Return ONLY raw valid <svg xmlns="http://www.w3.org/2000/svg" ...>...</svg> code without markdown fences or explanations.`,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      });

      const rawSvg = (svgResponse.text ?? '').trim();
      const svgMatch = rawSvg.match(/<svg[\s\S]*?<\/svg>/i);
      if (svgMatch) {
        const base64Svg = Buffer.from(svgMatch[0], 'utf-8').toString('base64');
        res.json({
          imageUrl: `data:image/svg+xml;base64,${base64Svg}`,
          caption: 'Rendered via MANBOT Free-Tier Vector Studio (gemini-4-hydrogen)',
        });
        return;
      }

      res.status(500).json({
        error: 'Unable to synthesize artwork. Please try refining your prompt.',
      });
    } catch (error) {
      res.status(500).json({
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
