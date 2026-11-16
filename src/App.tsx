/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowUp,
  BookOpen,
  Columns,
  Download,
  ExternalLink,
  FileCode2,
  FileText,
  Fingerprint,
  Globe,
  Image as ImageIcon,
  Loader2,
  MessageSquare,
  PanelLeft,
  Paperclip,
  Pin,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import {
  Attachment,
  CanvasArtifact,
  CanvasLanguage,
  ChatMessage,
  ChatSession,
  GeneratedImageItem,
  GroundingSource,
  ModelOptionId,
  PromptTemplate,
  ReasoningLevel,
  UserIdentity,
  WorkspaceTab,
} from './types';
import { STARTER_PROMPTS } from './data/starterPrompts';
import { MarkdownRenderer } from './components/MarkdownRenderer';
import { CanvasPane } from './components/CanvasPane';
import { ImageStudio } from './components/ImageStudio';
import { SavedCanvasesView } from './components/SavedCanvasesView';
import { PromptLibraryView } from './components/PromptLibraryView';
import { QuotaRecoveryModal } from './components/QuotaRecoveryModal';
import { UserIdentityModal } from './components/UserIdentityModal';

const STORAGE_KEYS = {
  SESSIONS: 'manbot_sessions_v1',
  CANVASES: 'manbot_canvases_v1',
  IMAGES: 'manbot_images_v1',
  IDENTITY: 'manbot_user_identity_v1',
};

function detectDeviceLabel(): string {
  if (typeof window === 'undefined') return 'Desktop Studio';
  const w = window.innerWidth;
  if (w < 640) return 'Mobile Handheld';
  if (w < 1024) return 'Tablet Touch';
  return 'Desktop Studio';
}

function getBrowserHardwareSeed(): string {
  if (typeof window === 'undefined') return 'server-seed';
  const nav = window.navigator;
  const scr = window.screen;
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  return [
    nav.userAgent,
    nav.language,
    nav.hardwareConcurrency || 4,
    scr?.width || 1440,
    scr?.height || 900,
    scr?.colorDepth || 24,
    tz,
  ].join('|');
}

function getOrCreateInitialIdentity(): UserIdentity {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.IDENTITY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed?.id && parsed?.fingerprintHash && parsed?.signature) {
        return {
          ...parsed,
          deviceLabel: detectDeviceLabel(),
        };
      }
    }
  } catch {
    // ignore storage errors
  }
  return {
    id: 'OP-VERIFYING',
    fingerprintHash: 'SHA256:PENDING',
    signature: 'verifying',
    deviceLabel: detectDeviceLabel(),
    tier: 'Starter Free',
    quotaUsed: 0,
    quotaLimit: 25,
    issuedAt: new Date().toISOString(),
  };
}

const DEFAULT_CANVAS: CanvasArtifact = {
  id: 'canvas-welcome-demo',
  title: 'MANBOT Telemetry Card Preview',
  language: 'html',
  updatedAt: new Date().toISOString(),
  history: [],
  content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
      background: #0B0F19;
      color: #F1F5F9;
      padding: 24px;
    }
    .panel {
      background: #111827;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 12px;
      padding: 22px;
      max-width: 540px;
      margin: 0 auto;
    }
    .kicker {
      font-size: 12px;
      color: #94A3B8;
      margin-bottom: 6px;
    }
    h2 {
      font-size: 19px;
      font-weight: 600;
      color: #FFFFFF;
      margin-bottom: 16px;
    }
    .metrics {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
      gap: 10px;
      margin-bottom: 18px;
      font-variant-numeric: tabular-nums;
    }
    .metric-box {
      background: #0B0F19;
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 8px;
      padding: 12px;
    }
    .metric-label { font-size: 11px; color: #94A3B8; }
    .metric-val { font-size: 17px; font-weight: 600; color: #F8FAFC; margin-top: 4px; }
    button {
      background: #4F46E5;
      color: white;
      border: none;
      border-radius: 6px;
      padding: 8px 14px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
    }
    button:hover { background: #6366F1; }
  </style>
</head>
<body>
  <div class="panel">
    <div class="kicker">MANBOT Live HTML Canvas · Editable Artifact</div>
    <h2>Inference Cluster Throughput</h2>
    <div class="metrics">
      <div class="metric-box">
        <div class="metric-label">Tokens / sec</div>
        <div class="metric-val" id="tps">1,420</div>
      </div>
      <div class="metric-box">
        <div class="metric-label">P95 Latency</div>
        <div class="metric-val" id="lat">184 ms</div>
      </div>
      <div class="metric-box">
        <div class="metric-label">Search Grounding</div>
        <div class="metric-val">Active</div>
      </div>
    </div>
    <button onclick="simulateLoad()">Simulate Traffic Spike</button>
  </div>
  <script>
    function simulateLoad() {
      document.getElementById('tps').textContent = (1200 + Math.floor(Math.random() * 900)).toLocaleString();
      document.getElementById('lat').textContent = (140 + Math.floor(Math.random() * 80)) + ' ms';
    }
  </script>
</body>
</html>`,
};

function createFreshSession(): ChatSession {
  return {
    id: `session-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    title: 'New Conversation',
    updatedAt: new Date().toISOString(),
    messages: [],
  };
}

function extractFirstCodeBlock(text: string): {
  code: string;
  language: CanvasLanguage;
} | null {
  const match = text.match(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/);
  if (!match) return null;
  const raw = (match[1] || 'markdown').toLowerCase();
  let language: CanvasLanguage = 'markdown';
  if (raw === 'ts' || raw === 'tsx' || raw === 'typescript') language = 'typescript';
  else if (raw === 'js' || raw === 'jsx' || raw === 'javascript') language = 'javascript';
  else if (raw === 'html' || raw === 'svg' || raw === 'xml') language = 'html';
  else if (raw === 'py' || raw === 'python') language = 'python';
  else if (raw === 'json') language = 'json';
  else if (raw === 'css') language = 'css';

  return {
    code: match[2].replace(/\n$/, ''),
    language,
  };
}

export default function App() {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('workspace');
  // Sidebar defaults open on wide desktop, closed on mobile/tablet so it never crowds
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1200 : true
  );

  // User Identity State for API Attribution
  const [userIdentity, setUserIdentity] = useState<UserIdentity>(
    getOrCreateInitialIdentity
  );
  const [isIdentityModalOpen, setIsIdentityModalOpen] = useState<boolean>(false);

  // Persistent Sessions State
  const [sessions, setSessions] = useState<ChatSession[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.SESSIONS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // ignore storage errors
    }
    return [createFreshSession()];
  });

  const [activeSessionId, setActiveSessionId] = useState<string>(() => {
    return sessions[0]?.id || '';
  });

  // Persistent Canvases State
  const [canvases, setCanvases] = useState<CanvasArtifact[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.CANVASES);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // ignore
    }
    return [DEFAULT_CANVAS];
  });

  const [openCanvasId, setOpenCanvasId] = useState<string | null>(null);
  const [isCanvasExpanded, setIsCanvasExpanded] = useState<boolean>(false);
  // On mobile/tablet (< 1024px), switches smoothly between Chat and Canvas when a Canvas is open
  const [mobileWorkspacePane, setMobileWorkspacePane] = useState<'chat' | 'canvas'>('chat');

  // Persistent Studio Images State
  const [studioImages, setStudioImages] = useState<GeneratedImageItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.IMAGES);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // ignore
    }
    return [];
  });

  // Composer & Controls State
  const [inputPrompt, setInputPrompt] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [useGoogleSearch, setUseGoogleSearch] = useState<boolean>(false);
  const [thinkingLevel, setThinkingLevel] = useState<ReasoningLevel>('HIGH');
  const [selectedModel, setSelectedModel] = useState<ModelOptionId>('gemini-4-hydrogen');
  const [customInstruction, setCustomInstruction] = useState<string>('');
  const [showEnginePopover, setShowEnginePopover] = useState<boolean>(false);
  const [sidebarSearch, setSidebarSearch] = useState<string>('');
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [isQuotaModalOpen, setIsQuotaModalOpen] = useState<boolean>(false);
  const [lastFailedPrompt, setLastFailedPrompt] = useState<string>('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Sync to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.SESSIONS, JSON.stringify(sessions));
    } catch {
      // ignore quota errors
    }
  }, [sessions]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.CANVASES, JSON.stringify(canvases));
    } catch {
      // ignore
    }
  }, [canvases]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.IMAGES, JSON.stringify(studioImages));
    } catch {
      // ignore
    }
  }, [studioImages]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.IDENTITY, JSON.stringify(userIdentity));
    } catch {
      // ignore
    }
  }, [userIdentity]);

  // Fetch & verify immutable server-signed Operator Identity on mount
  useEffect(() => {
    let active = true;
    fetch('/api/identity/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientSeed: getBrowserHardwareSeed(),
        deviceLabel: detectDeviceLabel(),
      }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (active && data?.identity) {
          setUserIdentity(data.identity);
        }
      })
      .catch(() => {
        // ignore network error on boot
      });

    const handleResize = () => {
      const nextLabel = detectDeviceLabel();
      setUserIdentity((prev) =>
        prev.deviceLabel === nextLabel ? prev : { ...prev, deviceLabel: nextLabel }
      );
    };
    window.addEventListener('resize', handleResize);
    return () => {
      active = false;
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  const currentSession =
    sessions.find((s) => s.id === activeSessionId) || sessions[0];

  const activeCanvas =
    canvases.find((c) => c.id === openCanvasId) || null;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentSession?.messages.length, isStreaming]);

  const handleNewSession = () => {
    const fresh = createFreshSession();
    setSessions((prev) => [fresh, ...prev]);
    setActiveSessionId(fresh.id);
    setActiveTab('workspace');
    setMobileWorkspacePane('chat');
    setInputPrompt('');
    setAttachments([]);
    if (window.innerWidth < 1024) {
      setSidebarOpen(false);
    }
  };

  const handleDeleteSession = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSessions((prev) => {
      const remaining = prev.filter((s) => s.id !== id);
      if (remaining.length === 0) {
        const fresh = createFreshSession();
        setActiveSessionId(fresh.id);
        return [fresh];
      }
      if (activeSessionId === id) {
        setActiveSessionId(remaining[0].id);
      }
      return remaining;
    });
  };

  const handleTogglePinSession = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSessions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, pinned: !s.pinned } : s))
    );
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64Data = result.split(',')[1] || '';
        const newAtt: Attachment = {
          id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: file.name,
          mimeType: file.type || 'text/plain',
          base64Data,
          previewUrl: result,
          sizeBytes: file.size,
        };
        setAttachments((prev) => [...prev, newAtt]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const activateCanvas = (canvasId: string) => {
    setOpenCanvasId(canvasId);
    setActiveTab('workspace');
    setMobileWorkspacePane('canvas');
    // Shape-shift: automatically collapse left sidebar when opening split-screen Canvas so layout never crowds
    if (window.innerWidth < 1440) {
      setSidebarOpen(false);
    }
  };

  const handleOpenInCanvas = (
    code: string,
    language: CanvasLanguage,
    suggestedTitle: string
  ) => {
    const existing = canvases.find(
      (c) => c.title === suggestedTitle && c.language === language
    );
    if (existing) {
      const updated: CanvasArtifact = {
        ...existing,
        history: [...existing.history.slice(-9), existing.content],
        content: code,
        updatedAt: new Date().toISOString(),
      };
      setCanvases((prev) =>
        prev.map((c) => (c.id === existing.id ? updated : c))
      );
      activateCanvas(existing.id);
      return;
    }

    const created: CanvasArtifact = {
      id: `canvas-${Date.now()}`,
      title: suggestedTitle,
      language,
      content: code,
      updatedAt: new Date().toISOString(),
      history: [],
    };
    setCanvases((prev) => [created, ...prev]);
    activateCanvas(created.id);
  };

  const handleUpdateCanvas = (updated: CanvasArtifact) => {
    setCanvases((prev) =>
      prev.map((c) => (c.id === updated.id ? updated : c))
    );
  };

  const handleCreateBlankCanvas = (title: string, language: CanvasLanguage) => {
    const starterByLang: Record<CanvasLanguage, string> = {
      markdown: `# ${title}\n\nWrite or ask MANBOT to draft structured documentation here.\n`,
      typescript: `// ${title}\nexport interface Config {\n  name: string;\n  enabled: boolean;\n}\n`,
      javascript: `// ${title}\nexport function initialize() {\n  console.log('MANBOT module initialized');\n}\n`,
      html: `<!DOCTYPE html>\n<html>\n<body style="background:#0B0F19;color:#F8FAFC;font-family:sans-serif;padding:24px;">\n  <h1>${title}</h1>\n</body>\n</html>`,
      python: `# ${title}\ndef main() -> None:\n    print("Hello from MANBOT")\n\nif __name__ == "__main__":\n    main()\n`,
      json: `{\n  "name": "${title}",\n  "assistant": "MANBOT"\n}`,
      css: `/* ${title} */\n.container {\n  display: grid;\n  gap: 16px;\n}\n`,
    };

    const created: CanvasArtifact = {
      id: `canvas-${Date.now()}`,
      title,
      language,
      content: starterByLang[language],
      updatedAt: new Date().toISOString(),
      history: [],
    };
    setCanvases((prev) => [created, ...prev]);
    activateCanvas(created.id);
  };

  const sendMessage = async (
    overridePrompt?: string,
    options?: {
      forceSearch?: boolean;
      forceThinking?: ReasoningLevel;
      forceModel?: ModelOptionId;
      autoOpenCanvas?: boolean;
    }
  ) => {
    const textToSend = (overridePrompt ?? inputPrompt).trim();
    if ((!textToSend && attachments.length === 0) || isStreaming) return;

    const effectiveSearch = options?.forceSearch ?? useGoogleSearch;
    const effectiveThinking = options?.forceThinking ?? thinkingLevel;
    const effectiveModel = options?.forceModel ?? selectedModel;

    if (options?.forceModel !== undefined) {
      setSelectedModel(options.forceModel);
    }
    if (options?.forceSearch !== undefined) {
      setUseGoogleSearch(options.forceSearch);
    }
    if (options?.forceThinking !== undefined) {
      setThinkingLevel(options.forceThinking);
    }

    setShowEnginePopover(false);
    setMobileWorkspacePane('chat');

    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}-user`,
      role: 'user',
      text: textToSend,
      attachments: attachments.length > 0 ? [...attachments] : undefined,
      thinkingLevel: effectiveThinking,
      modelId: effectiveModel,
      timestamp: new Date().toISOString(),
    };

    const modelMessageId = `msg-${Date.now()}-model`;
    const placeholderModelMessage: ChatMessage = {
      id: modelMessageId,
      role: 'model',
      text: '',
      thinkingLevel: effectiveThinking,
      modelId: effectiveModel,
      timestamp: new Date().toISOString(),
    };

    const updatedHistory = [...currentSession.messages, userMessage];

    const derivedTitle =
      currentSession.messages.length === 0 && textToSend
        ? textToSend.slice(0, 46) + (textToSend.length > 46 ? '...' : '')
        : currentSession.title;

    setSessions((prev) =>
      prev.map((s) =>
        s.id === currentSession.id
          ? {
              ...s,
              title: derivedTitle,
              updatedAt: new Date().toISOString(),
              messages: [...updatedHistory, placeholderModelMessage],
            }
          : s
      )
    );

    setInputPrompt('');
    setAttachments([]);
    setIsStreaming(true);

    try {
      const response = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: updatedHistory.map((m) => ({
            role: m.role,
            text: m.text,
            attachments: m.attachments?.map((a) => ({
              name: a.name,
              mimeType: a.mimeType,
              base64Data: a.base64Data,
            })),
          })),
          model: effectiveModel,
          thinkingLevel: effectiveThinking,
          useGoogleSearch: effectiveSearch,
          systemInstruction: customInstruction,
          userIdentity,
          activeCanvasContext: activeCanvas
            ? {
                title: activeCanvas.title,
                language: activeCanvas.language,
                content: activeCanvas.content,
              }
            : null,
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error(`Server returned status ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let accumulatedText = '';
      let groundingSources: GroundingSource[] = [];
      let searchQueries: string[] = [];

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const block of lines) {
          const dataLine = block
            .split('\n')
            .find((l) => l.startsWith('data: '));
          if (!dataLine) continue;

          try {
            const payload = JSON.parse(dataLine.slice(6));
            if (payload.type === 'quota_sync') {
              setUserIdentity((prev) => ({
                ...prev,
                quotaUsed:
                  typeof payload.quotaUsed === 'number'
                    ? payload.quotaUsed
                    : prev.quotaUsed,
                quotaLimit:
                  typeof payload.quotaLimit === 'number'
                    ? payload.quotaLimit
                    : prev.quotaLimit,
                tier: payload.tier || prev.tier,
              }));
            } else if (payload.type === 'chunk' && typeof payload.text === 'string') {
              accumulatedText += payload.text;
              setSessions((prev) =>
                prev.map((s) =>
                  s.id === currentSession.id
                    ? {
                        ...s,
                        messages: s.messages.map((m) =>
                          m.id === modelMessageId
                            ? { ...m, text: accumulatedText }
                            : m
                        ),
                      }
                    : s
                )
              );
            } else if (payload.type === 'grounding') {
              groundingSources = payload.sources || [];
              searchQueries = payload.queries || [];
              setSessions((prev) =>
                prev.map((s) =>
                  s.id === currentSession.id
                    ? {
                        ...s,
                        messages: s.messages.map((m) =>
                          m.id === modelMessageId
                            ? {
                                ...m,
                                groundingSources,
                                searchQueries,
                              }
                            : m
                        ),
                      }
                    : s
                )
              );
            } else if (payload.type === 'fallback_notice' && typeof payload.text === 'string') {
              setSessions((prev) =>
                prev.map((s) =>
                  s.id === currentSession.id
                    ? {
                        ...s,
                        messages: s.messages.map((m) =>
                          m.id === modelMessageId
                            ? {
                                ...m,
                                fallbackNotice: payload.text,
                                modelId: 'gemini-3.1-flash-lite',
                              }
                            : m
                        ),
                      }
                    : s
                )
              );
            } else if (payload.type === 'error') {
              const errObj = new Error(payload.message || 'Streaming error') as Error & {
                isQuotaError?: boolean;
              };
              errObj.isQuotaError = Boolean(payload.isQuotaError);
              throw errObj;
            }
          } catch (innerErr) {
            if (innerErr instanceof Error && innerErr.message !== 'Unexpected end of JSON input') {
              throw innerErr;
            }
          }
        }
      }

      if (options?.autoOpenCanvas && accumulatedText) {
        const extracted = extractFirstCodeBlock(accumulatedText);
        if (extracted) {
          handleOpenInCanvas(
            extracted.code,
            extracted.language,
            derivedTitle
          );
        }
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : 'Failed to connect to MANBOT backend.';
      const quotaFlag =
        Boolean((err as { isQuotaError?: boolean })?.isQuotaError) ||
        errorMessage.includes('429') ||
        errorMessage.includes('RESOURCE_EXHAUSTED') ||
        errorMessage.toLowerCase().includes('quota');

      if (quotaFlag) {
        setLastFailedPrompt(textToSend);
        setIsQuotaModalOpen(true);
      }

      setSessions((prev) =>
        prev.map((s) =>
          s.id === currentSession.id
            ? {
                ...s,
                messages: s.messages.map((m) =>
                  m.id === modelMessageId
                    ? {
                        ...m,
                        text: errorMessage,
                        isError: true,
                        isQuotaError: quotaFlag,
                      }
                    : m
                ),
              }
            : s
        )
      );
    } finally {
      setIsStreaming(false);
    }
  };

  const handleExportSession = () => {
    if (!currentSession) return;
    const mdLines = [
      `# ${currentSession.title}`,
      `Exported from MANBOT · Locked Operator ID: ${userIdentity.id} (${userIdentity.tier}) · ${new Date().toLocaleString()}`,
      '',
    ];
    currentSession.messages.forEach((m) => {
      mdLines.push(
        `### ${m.role === 'user' ? `Operator ${userIdentity.id}` : 'MANBOT'} (${new Date(
          m.timestamp
        ).toLocaleTimeString()})`
      );
      mdLines.push(m.text);
      if (m.groundingSources && m.groundingSources.length > 0) {
        mdLines.push('\n**Verified Web Sources:**');
        m.groundingSources.forEach((src) => {
          mdLines.push(`- [${src.title}](${src.uri})`);
        });
      }
      mdLines.push('');
    });

    const blob = new Blob([mdLines.join('\n')], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `manbot-session-${currentSession.id}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleRunTemplate = (template: PromptTemplate) => {
    setActiveTab('workspace');
    sendMessage(template.prompt, {
      forceSearch: Boolean(template.useGoogleSearch),
      forceThinking: template.thinkingLevel || 'HIGH',
      autoOpenCanvas: Boolean(template.opensCanvas),
    });
  };

  const filteredSessions = sessions
    .filter((s) =>
      s.title.toLowerCase().includes(sidebarSearch.toLowerCase())
    )
    .sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });

  return (
    <div className="flex flex-col h-dvh w-screen overflow-hidden bg-[#0B0F19] text-slate-100">
      {/* Strict 3-Zone Top Navigation Bar Contract */}
      <header className="flex items-center justify-between gap-4 sm:gap-8 px-4 sm:px-6 py-3 border-b border-white/[0.08] bg-[#0B0F19] shrink-0">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#workspace"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab('workspace');
          }}
          className="font-display text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0"
        >
          MANBOT
        </a>

        {/* Zone 2: 4 concise single-line text navigation links (Desktop & Tablet) */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-400">
          <a
            href="#workspace"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('workspace');
            }}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'workspace'
                ? 'text-white underline underline-offset-8 decoration-indigo-500 decoration-2'
                : 'hover:text-slate-200'
            }`}
          >
            Workspace
          </a>
          <a
            href="#image-studio"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('image-studio');
            }}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'image-studio'
                ? 'text-white underline underline-offset-8 decoration-indigo-500 decoration-2'
                : 'hover:text-slate-200'
            }`}
          >
            Image Studio
          </a>
          <a
            href="#canvases"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('canvases');
            }}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'canvases'
                ? 'text-white underline underline-offset-8 decoration-indigo-500 decoration-2'
                : 'hover:text-slate-200'
            }`}
          >
            Saved Canvases
          </a>
          <a
            href="#prompts"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('prompts');
            }}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'prompts'
                ? 'text-white underline underline-offset-8 decoration-indigo-500 decoration-2'
                : 'hover:text-slate-200'
            }`}
          >
            Prompt Library
          </a>
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={handleNewSession}
            className="px-3.5 py-2 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            New Session
          </button>
        </div>
      </header>

      {/* Main Content Area by Active Navigation View */}
      {activeTab === 'image-studio' ? (
        <ImageStudio
          images={studioImages}
          userIdentity={userIdentity}
          onAddImage={(item) => setStudioImages((prev) => [item, ...prev])}
          onDeleteImage={(id) =>
            setStudioImages((prev) => prev.filter((i) => i.id !== id))
          }
        />
      ) : activeTab === 'canvases' ? (
        <SavedCanvasesView
          canvases={canvases}
          onOpenCanvas={(artifact) => activateCanvas(artifact.id)}
          onCreateBlankCanvas={handleCreateBlankCanvas}
          onDeleteCanvas={(id) => {
            setCanvases((prev) => prev.filter((c) => c.id !== id));
            if (openCanvasId === id) setOpenCanvasId(null);
          }}
        />
      ) : activeTab === 'prompts' ? (
        <PromptLibraryView onSelectTemplate={handleRunTemplate} />
      ) : (
        /* Dynamic, Shape-Shifting Conversational + Canvas Workspace */
        <div className="relative flex flex-1 min-h-0 overflow-hidden">
          {/* Mobile/Tablet Backdrop Overlay when Sidebar Drawer is Open */}
          {sidebarOpen && (
            <div
              onClick={() => setSidebarOpen(false)}
              className="fixed inset-0 z-30 bg-black/60 backdrop-blur-xs lg:hidden"
            />
          )}

          {/* Adaptive Session & Artifact Sidebar (Slide-over Drawer on Mobile/Tablet, Collapsible Panel on Desktop) */}
          {sidebarOpen && (
            <aside className="fixed lg:static inset-y-0 left-0 z-40 w-[272px] shrink-0 bg-[#111827] border-r border-white/[0.08] flex flex-col h-full select-none shadow-2xl lg:shadow-none">
              <div className="p-3.5 border-b border-white/[0.08] flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={sidebarSearch}
                    onChange={(e) => setSidebarSearch(e.target.value)}
                    placeholder="Filter threads..."
                    className="w-full bg-[#0B0F19] border border-white/[0.08] focus:border-indigo-500/70 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setSidebarOpen(false)}
                  className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-white"
                  title="Close drawer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Conversation Thread List */}
              <div className="flex-1 overflow-y-auto px-2.5 py-3 space-y-4">
                <div className="space-y-1">
                  <div className="px-2 pb-1 flex items-center justify-between text-[11px] font-medium text-slate-400">
                    <span>Conversations</span>
                    <span className="font-mono tabular-nums">{filteredSessions.length}</span>
                  </div>
                  {filteredSessions.map((session) => {
                    const isActive = session.id === currentSession?.id;
                    return (
                      <div
                        key={session.id}
                        onClick={() => {
                          setActiveSessionId(session.id);
                          setMobileWorkspacePane('chat');
                          if (window.innerWidth < 1024) setSidebarOpen(false);
                        }}
                        className={`group flex items-center justify-between gap-2 px-2.5 py-2.5 rounded-lg text-xs transition-colors cursor-pointer ${
                          isActive
                            ? 'bg-indigo-600/15 text-white font-medium border border-indigo-500/30'
                            : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04] border border-transparent'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <MessageSquare className="w-3.5 h-3.5 shrink-0 text-slate-500" />
                          <span className="truncate">{session.title}</span>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                          <button
                            type="button"
                            onClick={(e) => handleTogglePinSession(session.id, e)}
                            title={session.pinned ? 'Unpin' : 'Pin session'}
                            className={`p-1 rounded hover:bg-white/[0.08] cursor-pointer ${
                              session.pinned ? 'text-indigo-400 opacity-100' : 'text-slate-400'
                            }`}
                          >
                            <Pin className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleDeleteSession(session.id, e)}
                            title="Delete session"
                            className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-white/[0.08] cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Recent Canvas Artifacts Quick Access */}
                <div className="space-y-1 pt-2 border-t border-white/[0.06]">
                  <div className="px-2 pb-1 flex items-center justify-between text-[11px] font-medium text-slate-400">
                    <span>Canvas Artifacts</span>
                    <button
                      type="button"
                      onClick={() =>
                        handleCreateBlankCanvas('Scratchpad Document', 'markdown')
                      }
                      className="text-indigo-400 hover:text-indigo-300 inline-flex items-center gap-0.5 cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                      <span>New</span>
                    </button>
                  </div>
                  {canvases.slice(0, 5).map((art) => {
                    const isOpen = openCanvasId === art.id;
                    return (
                      <button
                        key={art.id}
                        type="button"
                        onClick={() => {
                          if (isOpen && window.innerWidth >= 1024) {
                            setOpenCanvasId(null);
                          } else {
                            activateCanvas(art.id);
                          }
                        }}
                        className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-xs text-left transition-colors cursor-pointer ${
                          isOpen
                            ? 'bg-indigo-600/15 text-indigo-200 border border-indigo-500/30'
                            : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Columns className="w-3.5 h-3.5 shrink-0 text-indigo-400" />
                          <span className="truncate">{art.title}</span>
                        </div>
                        <span className="text-[10px] font-mono text-slate-500 shrink-0">
                          {art.language}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Sidebar Footer: Operator Attribution & Export */}
              <div className="p-3 border-t border-white/[0.08] space-y-2 bg-[#0B0F19]/40">
                <button
                  type="button"
                  onClick={() => setIsIdentityModalOpen(true)}
                  className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg bg-[#0B0F19] border border-white/[0.07] hover:border-indigo-500/40 text-xs transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Fingerprint className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                    <span className="truncate font-mono font-medium text-slate-200">
                      {userIdentity.id}
                    </span>
                  </div>
                  <span className="text-[10px] text-indigo-300 shrink-0">
                    {userIdentity.tier}
                  </span>
                </button>

                <div className="flex items-center justify-between px-1 text-[11px] text-slate-400">
                  <button
                    type="button"
                    onClick={handleExportSession}
                    disabled={currentSession.messages.length === 0}
                    className="inline-flex items-center gap-1 hover:text-slate-200 disabled:opacity-40 transition-colors cursor-pointer"
                  >
                    <Download className="w-3 h-3" />
                    <span>Export Thread</span>
                  </button>
                  <span className="font-mono tabular-nums">
                    {currentSession.messages.length} msgs
                  </span>
                </div>
              </div>
            </aside>
          )}

          {/* Central Conversational Viewport (hides on mobile when viewing Canvas, or when Canvas is expanded full-screen on desktop) */}
          <main
            className={`flex flex-col h-full min-w-0 transition-all ${
              activeCanvas && isCanvasExpanded
                ? 'hidden'
                : activeCanvas
                ? `${
                    mobileWorkspacePane === 'canvas' ? 'hidden lg:flex' : 'flex'
                  } w-full lg:w-1/2`
                : 'flex flex-1'
            }`}
          >
            {/* Dynamic Contextual Sub-Toolbar */}
            <div className="flex items-center justify-between gap-2 px-3 sm:px-5 py-2 border-b border-white/[0.06] bg-[#0B0F19]/90 text-xs shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <button
                  type="button"
                  onClick={() => setSidebarOpen((v) => !v)}
                  title="Toggle Threads Drawer"
                  className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
                >
                  <PanelLeft className="w-4 h-4" />
                </button>
                <span className="font-medium text-slate-200 truncate max-w-[160px] sm:max-w-[260px]">
                  {currentSession?.title || 'Workspace'}
                </span>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {/* Mobile/Tablet Segmented Switcher when Canvas is Open */}
                {activeCanvas && (
                  <div className="flex lg:hidden items-center bg-[#111827] p-0.5 rounded-lg border border-white/[0.08]">
                    <button
                      type="button"
                      onClick={() => setMobileWorkspacePane('chat')}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                        mobileWorkspacePane === 'chat'
                          ? 'bg-indigo-600 text-white'
                          : 'text-slate-400'
                      }`}
                    >
                      Chat
                    </button>
                    <button
                      type="button"
                      onClick={() => setMobileWorkspacePane('canvas')}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                        mobileWorkspacePane === 'canvas'
                          ? 'bg-indigo-600 text-white'
                          : 'text-slate-400'
                      }`}
                    >
                      Canvas
                    </button>
                  </div>
                )}

                {/* Locked Operator Identifier & API Attribution Button */}
                <button
                  type="button"
                  onClick={() => setIsIdentityModalOpen(true)}
                  title="Locked Operator Identifier & API Attribution Ledger"
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#111827] border border-white/[0.08] hover:border-indigo-500/40 text-xs text-slate-300 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Fingerprint className="w-3.5 h-3.5 text-indigo-400" />
                  <span className="font-mono text-[11px] text-indigo-300">
                    {userIdentity.id}
                  </span>
                  <span className="hidden sm:inline text-[11px] text-slate-400">
                    · {userIdentity.tier}
                  </span>
                </button>

                {/* In-App Quota & Instant Pass Upgrade Trigger */}
                <button
                  type="button"
                  onClick={() => setIsQuotaModalOpen(true)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#111827] border border-white/[0.08] text-slate-300 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  title="In-App API Quota & Instant Pass Upgrade"
                >
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                  <span className="font-mono text-[11px] tabular-nums">
                    {userIdentity.quotaLimit >= 999999
                      ? '∞'
                      : `${Math.max(0, userIdentity.quotaLimit - userIdentity.quotaUsed)} left`}
                  </span>
                </button>

                {/* Desktop Canvas Toggle */}
                <button
                  type="button"
                  onClick={() => {
                    if (activeCanvas) {
                      setOpenCanvasId(null);
                      setIsCanvasExpanded(false);
                    } else {
                      activateCanvas(canvases[0]?.id || DEFAULT_CANVAS.id);
                    }
                  }}
                  className={`hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    activeCanvas
                      ? 'bg-indigo-600/20 border-indigo-500/50 text-indigo-200'
                      : 'bg-[#111827] border-white/[0.08] text-slate-300 hover:text-white'
                  }`}
                >
                  <Columns className="w-3.5 h-3.5" />
                  <span>{activeCanvas ? 'Close Canvas' : 'Canvas'}</span>
                </button>
              </div>
            </div>

            {/* Scrollable Messages or Clean Adaptive Zero-State Welcome */}
            <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6">
              {currentSession.messages.length === 0 ? (
                <div className="max-w-[740px] mx-auto py-4 sm:py-10 space-y-7">
                  {/* Single Dominant Visual Anchor */}
                  <div className="space-y-2.5">
                    <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-indigo-400">
                      <span>MANBOT MULTIMODAL STUDIO</span>
                      <span aria-hidden="true">·</span>
                      <button
                        type="button"
                        onClick={() => setIsIdentityModalOpen(true)}
                        className="hover:text-indigo-300 underline underline-offset-4 cursor-pointer"
                      >
                        Locked ID: {userIdentity.id} · {userIdentity.tier}
                      </button>
                    </div>
                    <h1 className="font-display text-2xl sm:text-4xl font-semibold text-white tracking-tight">
                      What are we building, researching, or designing today?
                    </h1>
                    <p className="text-sm text-slate-400 max-w-xl leading-relaxed">
                      Co-edit code and documents inside the shape-shifting Canvas, ground answers with live Google Search, or synthesize visual concepts.
                    </p>
                  </div>

                  {/* Adaptive 3-Card Starter Grid (Uncluttered across mobile, tablet, and desktop) */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {STARTER_PROMPTS.slice(0, 3).map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleRunTemplate(item)}
                        className="group text-left p-4 rounded-xl bg-[#111827] border border-white/[0.08] hover:border-indigo-500/50 transition-colors flex flex-col justify-between space-y-3 cursor-pointer"
                      >
                        <div className="space-y-1.5">
                          <div className="flex items-start justify-between gap-2">
                            <span className="font-display text-sm font-semibold text-white group-hover:text-indigo-300 transition-colors">
                              {item.title}
                            </span>
                            <ArrowUp className="w-3.5 h-3.5 text-slate-500 group-hover:text-indigo-400 rotate-45 transition-colors shrink-0 mt-0.5" />
                          </div>
                          <p className="text-xs text-slate-400 leading-relaxed line-clamp-3">
                            {item.description}
                          </p>
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono pt-1">
                          {item.opensCanvas
                            ? 'Split Canvas'
                            : item.useGoogleSearch
                            ? 'Google Search'
                            : `Reasoning: ${item.thinkingLevel}`}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="max-w-[68ch] mx-auto space-y-5">
                  {currentSession.messages.map((message) => {
                    const isUser = message.role === 'user';
                    return (
                      <article
                        key={message.id}
                        className={`space-y-2 ${
                          isUser
                            ? 'bg-[#111827] border border-white/[0.08] rounded-xl p-4'
                            : 'py-2'
                        }`}
                      >
                        {/* Clean Unboxed Message Metadata Header */}
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-display font-semibold text-white">
                              {isUser ? 'Operator' : 'MANBOT'}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono text-[11px] text-slate-500">
                              {isUser ? userIdentity.id : message.modelId || 'gemini-4-hydrogen'}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono tabular-nums">
                              {new Date(message.timestamp).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </div>
                        </div>

                        {/* User Attachments */}
                        {message.attachments && message.attachments.length > 0 && (
                          <div className="flex flex-wrap gap-2.5 pt-1">
                            {message.attachments.map((att) =>
                              att.mimeType.startsWith('image/') ? (
                                <img
                                  key={att.id}
                                  src={att.previewUrl}
                                  alt={att.name}
                                  referrerPolicy="no-referrer"
                                  className="h-24 w-auto rounded-lg border border-white/[0.1] object-cover"
                                />
                              ) : (
                                <div
                                  key={att.id}
                                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#0B0F19] border border-white/[0.08] text-xs text-slate-300"
                                >
                                  <FileText className="w-3.5 h-3.5 text-indigo-400" />
                                  <span className="truncate max-w-[180px]">{att.name}</span>
                                </div>
                              )
                            )}
                          </div>
                        )}

                        {/* Automatic High-Throughput Fallback Notice */}
                        {message.fallbackNotice && (
                          <div className="flex items-center gap-2 text-xs text-amber-300/90 py-1">
                            <Zap className="w-3.5 h-3.5 shrink-0" />
                            <span>{message.fallbackNotice}</span>
                          </div>
                        )}

                        {/* Message Body */}
                        {message.isError ? (
                          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-200 space-y-3 leading-relaxed">
                            <p>{message.text}</p>
                            {message.isQuotaError && (
                              <div className="flex flex-wrap items-center gap-2 pt-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const promptToRetry =
                                      lastFailedPrompt ||
                                      currentSession.messages
                                        .slice()
                                        .reverse()
                                        .find((m) => m.role === 'user')?.text ||
                                      '';
                                    if (promptToRetry) {
                                      sendMessage(promptToRetry, {
                                        forceModel: 'gemini-3.1-flash-lite',
                                        forceThinking: 'LOW',
                                      });
                                    }
                                  }}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-colors cursor-pointer"
                                >
                                  <Sparkles className="w-3.5 h-3.5" />
                                  <span>Switch to Flash-Lite &amp; Retry Instantly</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setIsQuotaModalOpen(true)}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.08] hover:bg-white/[0.14] text-slate-100 font-medium transition-colors cursor-pointer"
                                >
                                  <RefreshCw className="w-3.5 h-3.5" />
                                  <span>Activate In-App Quota Pass Instantly</span>
                                </button>
                              </div>
                            )}
                          </div>
                        ) : isUser ? (
                          <p className="text-[15px] leading-relaxed text-slate-100 whitespace-pre-wrap">
                            {message.text}
                          </p>
                        ) : message.text ? (
                          <MarkdownRenderer
                            content={message.text}
                            onOpenInCanvas={handleOpenInCanvas}
                          />
                        ) : (
                          <div className="flex items-center gap-2 py-3 text-xs text-slate-400">
                            <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />
                            <span>MANBOT is synthesizing response...</span>
                          </div>
                        )}

                        {/* Verified Google Search Grounding Citations */}
                        {message.groundingSources &&
                          message.groundingSources.length > 0 && (
                            <div className="pt-3 mt-3 border-t border-white/[0.07] space-y-2">
                              <div className="flex items-center gap-2 text-xs text-slate-400">
                                <Globe className="w-3.5 h-3.5 text-sky-400" />
                                <span className="font-medium text-slate-300">
                                  Verified Google Search Sources
                                </span>
                                <span aria-hidden="true">·</span>
                                <span className="font-mono tabular-nums">
                                  {message.groundingSources.length} citations
                                </span>
                              </div>
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
                                {message.groundingSources.map((src, sIdx) => (
                                  <React.Fragment key={src.uri}>
                                    {sIdx > 0 && (
                                      <span className="text-slate-600" aria-hidden="true">
                                        ·
                                      </span>
                                    )}
                                    <a
                                      href={src.uri}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 text-sky-400 hover:text-sky-300 underline underline-offset-4 transition-colors"
                                    >
                                      <span className="truncate max-w-[220px]">
                                        {src.title}
                                      </span>
                                      <ExternalLink className="w-3 h-3 shrink-0" />
                                    </a>
                                  </React.Fragment>
                                ))}
                              </div>
                            </div>
                          )}
                      </article>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            {/* Streamlined Shape-Shifting Multimodal Composer Tray */}
            <div className="px-3 sm:px-6 pb-3 sm:pb-4 pt-1.5 bg-[#0B0F19] shrink-0">
              <div className="relative max-w-[740px] mx-auto rounded-2xl bg-[#111827] border border-white/[0.1] focus-within:border-indigo-500/80 focus-within:shadow-[0_0_25px_-5px_rgba(99,102,241,0.25)] transition-all p-3 space-y-2">
                {/* Floating Engine & Persona Popover (keeps default composer bar clean and uncluttered) */}
                {showEnginePopover && (
                  <div className="absolute bottom-full left-0 mb-2 w-full sm:w-80 rounded-xl bg-[#111827] border border-white/[0.14] shadow-2xl p-4 space-y-3.5 z-30 text-xs">
                    <div className="flex items-center justify-between border-b border-white/[0.08] pb-2">
                      <span className="font-display font-semibold text-white">
                        MANBOT Engine &amp; Persona
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowEnginePopover(false)}
                        className="text-slate-400 hover:text-white cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-slate-400">Active Gemini Model</label>
                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          type="button"
                          onClick={() => setSelectedModel('gemini-4-hydrogen')}
                          className={`px-2.5 py-1.5 rounded-lg font-mono text-[11px] border transition-colors cursor-pointer ${
                            selectedModel === 'gemini-4-hydrogen'
                              ? 'bg-indigo-600/20 border-indigo-500 text-white'
                              : 'bg-[#0B0F19] border-white/[0.08] text-slate-400'
                          }`}
                        >
                          4-hydrogen (Flash)
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedModel('gemini-3.1-flash-lite')}
                          className={`px-2.5 py-1.5 rounded-lg font-mono text-[11px] border transition-colors cursor-pointer ${
                            selectedModel === 'gemini-3.1-flash-lite'
                              ? 'bg-indigo-600/20 border-indigo-500 text-white'
                              : 'bg-[#0B0F19] border-white/[0.08] text-slate-400'
                          }`}
                        >
                          3.1-flash-lite
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-slate-400">Reasoning Depth</label>
                      <div className="grid grid-cols-3 gap-1.5">
                        {(['LOW', 'HIGH', 'XHIGH'] as ReasoningLevel[]).map((lvl) => (
                          <button
                            key={lvl}
                            type="button"
                            onClick={() => setThinkingLevel(lvl)}
                            className={`px-2.5 py-1.5 rounded-lg font-mono text-[11px] border transition-colors cursor-pointer ${
                              thinkingLevel === lvl
                                ? 'bg-indigo-600/20 border-indigo-500 text-white'
                                : 'bg-[#0B0F19] border-white/[0.08] text-slate-400'
                            }`}
                          >
                            {lvl}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label htmlFor="persona-popover-input" className="block text-slate-400">
                        Custom System Instructions
                      </label>
                      <textarea
                        id="persona-popover-input"
                        rows={2}
                        value={customInstruction}
                        onChange={(e) => setCustomInstruction(e.target.value)}
                        placeholder="e.g., Respond as a Principal Systems Architect..."
                        className="w-full bg-[#0B0F19] border border-white/[0.08] rounded-lg p-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 resize-none"
                      />
                    </div>
                  </div>
                )}

                {/* Pending Attachments Preview Strip */}
                {attachments.length > 0 && (
                  <div className="flex flex-wrap gap-2 pb-2 border-b border-white/[0.07]">
                    {attachments.map((att) => (
                      <div
                        key={att.id}
                        className="flex items-center gap-2 bg-[#0B0F19] border border-white/[0.08] rounded-lg p-1.5 pr-2.5 text-xs"
                      >
                        {att.mimeType.startsWith('image/') ? (
                          <img
                            src={att.previewUrl}
                            alt={att.name}
                            referrerPolicy="no-referrer"
                            className="w-7 h-7 rounded object-cover"
                          />
                        ) : (
                          <FileText className="w-4 h-4 text-indigo-400 ml-1" />
                        )}
                        <span className="text-slate-200 truncate max-w-[140px]">
                          {att.name}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setAttachments((prev) =>
                              prev.filter((item) => item.id !== att.id)
                            )
                          }
                          className="text-slate-500 hover:text-rose-400 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Textarea Input */}
                <textarea
                  rows={2}
                  value={inputPrompt}
                  onChange={(e) => setInputPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      sendMessage();
                    }
                  }}
                  placeholder="Ask MANBOT anything, attach files, or draft in Canvas..."
                  className="w-full bg-transparent text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none resize-none leading-relaxed"
                />

                {/* Minimalist 3-Control Bottom Action Row */}
                <div className="flex items-center justify-between gap-2 pt-1 border-t border-white/[0.06]">
                  <div className="flex items-center gap-1.5 overflow-x-auto">
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      accept="image/png,image/jpeg,image/webp,application/pdf,text/plain,text/markdown,text/csv,application/json"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      title="Attach images, PDFs, or text files"
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:text-white bg-[#0B0F19] hover:bg-white/[0.06] border border-white/[0.07] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Paperclip className="w-3.5 h-3.5 text-slate-400" />
                      <span className="hidden sm:inline">Attach</span>
                    </button>

                    {/* Live Google Search Toggle */}
                    <button
                      type="button"
                      onClick={() => setUseGoogleSearch((v) => !v)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        useGoogleSearch
                          ? 'bg-sky-500/15 border-sky-500/50 text-sky-300'
                          : 'bg-[#0B0F19] border-white/[0.07] text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <Globe className="w-3.5 h-3.5" />
                      <span>Search</span>
                    </button>

                    {/* Consolidated Engine & Reasoning Popover Trigger */}
                    <button
                      type="button"
                      onClick={() => setShowEnginePopover((v) => !v)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-mono border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        showEnginePopover
                          ? 'bg-indigo-600/20 border-indigo-500/50 text-indigo-200'
                          : 'bg-[#0B0F19] border-white/[0.07] text-slate-300 hover:text-white'
                      }`}
                    >
                      <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-400" />
                      <span>
                        {selectedModel === 'gemini-3.1-flash-lite'
                          ? 'Lite'
                          : `Flash · ${thinkingLevel}`}
                      </span>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => sendMessage()}
                    disabled={
                      isStreaming ||
                      (!inputPrompt.trim() && attachments.length === 0)
                    }
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-xs font-medium text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {isStreaming ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Streaming</span>
                      </>
                    ) : (
                      <>
                        <span>Send</span>
                        <ArrowUp className="w-3.5 h-3.5" />
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </main>

          {/* Right Split-Screen or Full-Width Interactive Canvas Pane */}
          {activeCanvas && (
            <div
              className={`h-full shrink-0 transition-all ${
                isCanvasExpanded
                  ? 'w-full flex flex-col'
                  : `${
                      mobileWorkspacePane === 'canvas' ? 'flex flex-col w-full' : 'hidden lg:flex lg:flex-col'
                    } lg:w-1/2`
              }`}
            >
              {/* Mobile Back-to-Chat Bar inside Canvas view */}
              <div className="flex lg:hidden items-center justify-between px-3.5 py-2 border-b border-white/[0.08] bg-[#0B0F19] text-xs">
                <button
                  type="button"
                  onClick={() => setMobileWorkspacePane('chat')}
                  className="inline-flex items-center gap-1.5 text-indigo-400 font-medium cursor-pointer"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>Back to Chat Thread</span>
                </button>
                <span className="font-mono text-[11px] text-slate-400">
                  Split Canvas Mode
                </span>
              </div>

              <div className="flex-1 min-h-0">
                <CanvasPane
                  artifact={activeCanvas}
                  userIdentity={userIdentity}
                  isExpanded={isCanvasExpanded}
                  onToggleExpand={() => setIsCanvasExpanded((v) => !v)}
                  onUpdateArtifact={handleUpdateCanvas}
                  onClose={() => {
                    setOpenCanvasId(null);
                    setIsCanvasExpanded(false);
                    setMobileWorkspacePane('chat');
                  }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Ergonomic Mobile Bottom Navigation Dock (< 768px) */}
      <nav className="md:hidden grid grid-cols-4 items-center h-14 border-t border-white/[0.08] bg-[#0B0F19]/95 backdrop-blur-md shrink-0 z-30">
        <button
          type="button"
          onClick={() => setActiveTab('workspace')}
          className={`flex flex-col items-center justify-center h-full gap-0.5 text-[10px] font-medium transition-colors cursor-pointer ${
            activeTab === 'workspace' ? 'text-indigo-400' : 'text-slate-400'
          }`}
        >
          <MessageSquare className="w-4 h-4" />
          <span>Workspace</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('image-studio')}
          className={`flex flex-col items-center justify-center h-full gap-0.5 text-[10px] font-medium transition-colors cursor-pointer ${
            activeTab === 'image-studio' ? 'text-indigo-400' : 'text-slate-400'
          }`}
        >
          <ImageIcon className="w-4 h-4" />
          <span>Studio</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('canvases')}
          className={`flex flex-col items-center justify-center h-full gap-0.5 text-[10px] font-medium transition-colors cursor-pointer ${
            activeTab === 'canvases' ? 'text-indigo-400' : 'text-slate-400'
          }`}
        >
          <FileCode2 className="w-4 h-4" />
          <span>Canvases</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('prompts')}
          className={`flex flex-col items-center justify-center h-full gap-0.5 text-[10px] font-medium transition-colors cursor-pointer ${
            activeTab === 'prompts' ? 'text-indigo-400' : 'text-slate-400'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          <span>Prompts</span>
        </button>
      </nav>

      {/* Locked Operator Identifier & API Attribution Ledger Modal */}
      <UserIdentityModal
        isOpen={isIdentityModalOpen}
        onClose={() => setIsIdentityModalOpen(false)}
        userIdentity={userIdentity}
        onOpenQuotaUpgrade={() => setIsQuotaModalOpen(true)}
      />

      {/* In-App Instant Quota & Pass Provisioning Modal */}
      <QuotaRecoveryModal
        isOpen={isQuotaModalOpen}
        onClose={() => setIsQuotaModalOpen(false)}
        userIdentity={userIdentity}
        onIdentityUpgraded={(updated) => setUserIdentity(updated)}
        onSwitchToFlashLiteAndRetry={() => {
          const promptToRetry =
            lastFailedPrompt ||
            currentSession.messages
              .slice()
              .reverse()
              .find((m) => m.role === 'user')?.text ||
            '';
          setSelectedModel('gemini-3.1-flash-lite');
          setThinkingLevel('LOW');
          if (promptToRetry) {
            sendMessage(promptToRetry, {
              forceModel: 'gemini-3.1-flash-lite',
              forceThinking: 'LOW',
            });
          }
        }}
        onRetryAfterKeyUpdate={() => {
          const promptToRetry =
            lastFailedPrompt ||
            currentSession.messages
              .slice()
              .reverse()
              .find((m) => m.role === 'user')?.text ||
            '';
          if (promptToRetry) {
            sendMessage(promptToRetry);
          }
        }}
      />
    </div>
  );
}
