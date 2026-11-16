/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowUp,
  BookOpen,
  BrainCircuit,
  Columns,
  Download,
  ExternalLink,
  FileText,
  Globe,
  Image as ImageIcon,
  Loader2,
  MessageSquare,
  PanelLeft,
  Paperclip,
  Pin,
  Plus,
  Search,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  X,
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
  WorkspaceTab,
} from './types';
import { STARTER_PROMPTS } from './data/starterPrompts';
import { MarkdownRenderer } from './components/MarkdownRenderer';
import { CanvasPane } from './components/CanvasPane';
import { ImageStudio } from './components/ImageStudio';
import { SavedCanvasesView } from './components/SavedCanvasesView';
import { PromptLibraryView } from './components/PromptLibraryView';

const STORAGE_KEYS = {
  SESSIONS: 'manbot_sessions_v1',
  CANVASES: 'manbot_canvases_v1',
  IMAGES: 'manbot_images_v1',
};

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
      padding: 28px;
    }
    .panel {
      background: #111827;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 12px;
      padding: 24px;
      max-width: 560px;
      margin: 0 auto;
    }
    .kicker {
      font-size: 12px;
      color: #94A3B8;
      margin-bottom: 6px;
    }
    h2 {
      font-size: 20px;
      font-weight: 600;
      color: #FFFFFF;
      margin-bottom: 16px;
    }
    .metrics {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
      margin-bottom: 20px;
      font-variant-numeric: tabular-nums;
    }
    .metric-box {
      background: #0B0F19;
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 8px;
      padding: 12px;
    }
    .metric-label { font-size: 11px; color: #94A3B8; }
    .metric-val { font-size: 18px; font-weight: 600; color: #F8FAFC; margin-top: 4px; }
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
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);

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
  const [showPersonaDrawer, setShowPersonaDrawer] = useState<boolean>(false);
  const [sidebarSearch, setSidebarSearch] = useState<string>('');
  const [isStreaming, setIsStreaming] = useState<boolean>(false);

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
    setInputPrompt('');
    setAttachments([]);
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

  const handleOpenInCanvas = (
    code: string,
    language: CanvasLanguage,
    suggestedTitle: string
  ) => {
    // Check if an identical canvas already exists
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
      setOpenCanvasId(existing.id);
      setActiveTab('workspace');
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
    setOpenCanvasId(created.id);
    setActiveTab('workspace');
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
    setOpenCanvasId(created.id);
    setActiveTab('workspace');
  };

  const sendMessage = async (
    overridePrompt?: string,
    options?: {
      forceSearch?: boolean;
      forceThinking?: ReasoningLevel;
      autoOpenCanvas?: boolean;
    }
  ) => {
    const textToSend = (overridePrompt ?? inputPrompt).trim();
    if ((!textToSend && attachments.length === 0) || isStreaming) return;

    const effectiveSearch = options?.forceSearch ?? useGoogleSearch;
    const effectiveThinking = options?.forceThinking ?? thinkingLevel;

    if (options?.forceSearch !== undefined) {
      setUseGoogleSearch(options.forceSearch);
    }
    if (options?.forceThinking !== undefined) {
      setThinkingLevel(options.forceThinking);
    }

    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}-user`,
      role: 'user',
      text: textToSend,
      attachments: attachments.length > 0 ? [...attachments] : undefined,
      thinkingLevel: effectiveThinking,
      modelId: selectedModel,
      timestamp: new Date().toISOString(),
    };

    const modelMessageId = `msg-${Date.now()}-model`;
    const placeholderModelMessage: ChatMessage = {
      id: modelMessageId,
      role: 'model',
      text: '',
      thinkingLevel: effectiveThinking,
      modelId: selectedModel,
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
          model: selectedModel,
          thinkingLevel: effectiveThinking,
          useGoogleSearch: effectiveSearch,
          systemInstruction: customInstruction,
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
            if (payload.type === 'chunk' && typeof payload.text === 'string') {
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
            } else if (payload.type === 'error') {
              throw new Error(payload.message || 'Streaming error');
            }
          } catch (innerErr) {
            if (innerErr instanceof Error && innerErr.message !== 'Unexpected end of JSON input') {
              throw innerErr;
            }
          }
        }
      }

      // If user clicked a Canvas starter prompt or asked to open in Canvas, auto-promote the first code block
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
      `Exported from MANBOT · ${new Date().toLocaleString()}`,
      '',
    ];
    currentSession.messages.forEach((m) => {
      mdLines.push(`### ${m.role === 'user' ? 'You' : 'MANBOT'} (${new Date(m.timestamp).toLocaleTimeString()})`);
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
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#0B0F19] text-slate-100">
      {/* Strict 3-Zone Top Navigation Bar Contract */}
      <header className="flex items-center justify-between gap-8 px-6 py-3.5 border-b border-white/[0.08] bg-[#0B0F19] shrink-0">
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

        {/* Zone 2: 4 concise single-line text navigation links */}
        <nav className="flex items-center gap-6 text-sm font-medium text-slate-400 overflow-x-auto">
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
            className="px-4 py-2 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            New Session
          </button>
        </div>
      </header>

      {/* Main Content Area by Active Navigation View */}
      {activeTab === 'image-studio' ? (
        <ImageStudio
          images={studioImages}
          onAddImage={(item) => setStudioImages((prev) => [item, ...prev])}
          onDeleteImage={(id) =>
            setStudioImages((prev) => prev.filter((i) => i.id !== id))
          }
        />
      ) : activeTab === 'canvases' ? (
        <SavedCanvasesView
          canvases={canvases}
          onOpenCanvas={(artifact) => {
            setOpenCanvasId(artifact.id);
            setActiveTab('workspace');
          }}
          onCreateBlankCanvas={handleCreateBlankCanvas}
          onDeleteCanvas={(id) => {
            setCanvases((prev) => prev.filter((c) => c.id !== id));
            if (openCanvasId === id) setOpenCanvasId(null);
          }}
        />
      ) : activeTab === 'prompts' ? (
        <PromptLibraryView onSelectTemplate={handleRunTemplate} />
      ) : (
        /* Primary Split-Screen Conversational + Canvas Workspace */
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Left Session & Artifact Sidebar (260px width) */}
          {sidebarOpen && (
            <aside className="w-[260px] shrink-0 bg-[#111827] border-r border-white/[0.08] flex flex-col h-full select-none">
              {/* Sidebar Search & Filter */}
              <div className="p-3.5 border-b border-white/[0.08] space-y-2.5">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={sidebarSearch}
                    onChange={(e) => setSidebarSearch(e.target.value)}
                    placeholder="Search sessions..."
                    className="w-full bg-[#0B0F19] border border-white/[0.08] focus:border-indigo-500/70 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none"
                  />
                </div>
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
                        onClick={() => setActiveSessionId(session.id)}
                        className={`group flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-xs transition-colors cursor-pointer ${
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
                        onClick={() =>
                          setOpenCanvasId(isOpen ? null : art.id)
                        }
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

              {/* Sidebar Footer Controls */}
              <div className="p-3 border-t border-white/[0.08] space-y-2 bg-[#0B0F19]/40">
                <button
                  type="button"
                  onClick={() => setShowPersonaDrawer((v) => !v)}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs text-slate-300 hover:text-white hover:bg-white/[0.05] transition-colors cursor-pointer"
                >
                  <span className="inline-flex items-center gap-2">
                    <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-400" />
                    <span>MANBOT System Persona</span>
                  </span>
                  <span className="text-[11px] text-slate-500">
                    {customInstruction ? 'Custom' : 'Default'}
                  </span>
                </button>

                {showPersonaDrawer && (
                  <div className="p-2.5 rounded-lg bg-[#0B0F19] border border-white/[0.08] space-y-2">
                    <label
                      htmlFor="custom-persona-input"
                      className="block text-[11px] text-slate-400"
                    >
                      Custom Instructions for MANBOT:
                    </label>
                    <textarea
                      id="custom-persona-input"
                      rows={3}
                      value={customInstruction}
                      onChange={(e) => setCustomInstruction(e.target.value)}
                      placeholder="e.g., Respond as a Principal Systems Architect. Prefer TypeScript and concise mathematical explanations."
                      className="w-full bg-[#111827] border border-white/[0.08] rounded p-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 resize-none"
                    />
                  </div>
                )}

                <div className="flex items-center justify-between px-1 pt-1 text-[11px] text-slate-400">
                  <button
                    type="button"
                    onClick={handleExportSession}
                    disabled={currentSession.messages.length === 0}
                    className="inline-flex items-center gap-1 hover:text-slate-200 disabled:opacity-40 transition-colors cursor-pointer"
                  >
                    <Download className="w-3 h-3" />
                    <span>Export Markdown</span>
                  </button>
                  <span className="font-mono tabular-nums">
                    {currentSession.messages.length} msgs
                  </span>
                </div>
              </div>
            </aside>
          )}

          {/* Central Conversational Viewport */}
          <main
            className={`flex flex-col h-full min-w-0 transition-all ${
              activeCanvas ? 'w-full lg:w-1/2' : 'flex-1'
            }`}
          >
            {/* Workspace Contextual Sub-Toolbar */}
            <div className="flex items-center justify-between gap-4 px-4 py-2.5 border-b border-white/[0.06] bg-[#0B0F19]/80 text-xs">
              <div className="flex items-center gap-2.5 min-w-0">
                <button
                  type="button"
                  onClick={() => setSidebarOpen((v) => !v)}
                  title="Toggle Session Sidebar"
                  className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
                >
                  <PanelLeft className="w-4 h-4" />
                </button>
                <span className="font-medium text-slate-200 truncate">
                  {currentSession?.title || 'Workspace'}
                </span>
                <span className="text-slate-600" aria-hidden="true">·</span>
                <span className="text-slate-400 font-mono hidden sm:inline">
                  {selectedModel === 'gemini-3.1-flash-lite' ? 'Gemini 3.1 Flash Lite' : 'Gemini 4 Flash'}
                </span>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    if (activeCanvas) {
                      setOpenCanvasId(null);
                    } else {
                      setOpenCanvasId(canvases[0]?.id || DEFAULT_CANVAS.id);
                    }
                  }}
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    activeCanvas
                      ? 'bg-indigo-600/20 border-indigo-500/50 text-indigo-200'
                      : 'bg-[#111827] border-white/[0.08] text-slate-300 hover:text-white'
                  }`}
                >
                  <Columns className="w-3.5 h-3.5" />
                  <span>{activeCanvas ? 'Hide Canvas' : 'Open Canvas'}</span>
                </button>
              </div>
            </div>

            {/* Scrollable Messages or Zero-State Welcome Screen */}
            <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6">
              {currentSession.messages.length === 0 ? (
                <div className="max-w-[760px] mx-auto py-6 lg:py-10 space-y-8">
                  {/* Single Dominant Visual Anchor */}
                  <div className="space-y-3">
                    <p className="text-xs font-mono text-indigo-400">
                      MANBOT MULTIMODAL WORKSPACE · GEMINI 4 ENGINE
                    </p>
                    <h1 className="font-display text-3xl sm:text-4xl font-semibold text-white tracking-tight">
                      What are we building, researching, or designing today?
                    </h1>
                    <p className="text-sm text-slate-400 max-w-2xl leading-relaxed">
                      Stream code and technical documents directly into the side-by-side Canvas, ground answers with live Google Search citations, analyze uploaded files, or synthesize artwork in the Image Studio.
                    </p>
                  </div>

                  {/* Starter Capability Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    {STARTER_PROMPTS.slice(0, 4).map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleRunTemplate(item)}
                        className="group text-left p-4 rounded-xl bg-[#111827] border border-white/[0.08] hover:border-indigo-500/50 transition-colors flex flex-col justify-between space-y-3 cursor-pointer"
                      >
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-display text-sm font-semibold text-white group-hover:text-indigo-300 transition-colors">
                              {item.title}
                            </span>
                            <ArrowUp className="w-3.5 h-3.5 text-slate-500 group-hover:text-indigo-400 rotate-45 transition-colors shrink-0" />
                          </div>
                          <p className="text-xs text-slate-400 leading-relaxed">
                            {item.description}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-slate-500 font-mono">
                          <span>{item.category}</span>
                          <span aria-hidden="true">·</span>
                          <span>
                            {item.opensCanvas
                              ? 'Opens Split Canvas'
                              : item.useGoogleSearch
                              ? 'Live Google Search'
                              : `Reasoning: ${item.thinkingLevel}`}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>

                  {/* Quick Secondary Links */}
                  <div className="flex flex-wrap items-center gap-4 pt-2 text-xs text-slate-400">
                    <button
                      type="button"
                      onClick={() => setActiveTab('image-studio')}
                      className="inline-flex items-center gap-1.5 hover:text-indigo-300 transition-colors cursor-pointer"
                    >
                      <ImageIcon className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Launch AI Image Synthesis Studio</span>
                    </button>
                    <span aria-hidden="true">·</span>
                    <button
                      type="button"
                      onClick={() => setOpenCanvasId(DEFAULT_CANVAS.id)}
                      className="inline-flex items-center gap-1.5 hover:text-indigo-300 transition-colors cursor-pointer"
                    >
                      <Columns className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Preview Interactive HTML Telemetry Canvas</span>
                    </button>
                    <span aria-hidden="true">·</span>
                    <button
                      type="button"
                      onClick={() => setActiveTab('prompts')}
                      className="inline-flex items-center gap-1.5 hover:text-indigo-300 transition-colors cursor-pointer"
                    >
                      <BookOpen className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Browse All Workflow Prompts</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="max-w-[68ch] mx-auto space-y-6">
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
                        <div className="flex items-center justify-between text-xs text-slate-400">
                          <div className="flex items-center gap-2">
                            <span className="font-display font-semibold text-white">
                              {isUser ? 'You' : 'MANBOT'}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono tabular-nums">
                              {new Date(message.timestamp).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                            {!isUser && message.thinkingLevel && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="font-mono">
                                  Reasoning: {message.thinkingLevel}
                                </span>
                              </>
                            )}
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

                        {/* Message Body */}
                        {message.isError ? (
                          <div className="p-3.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300 leading-relaxed">
                            {message.text}
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
                            <span>MANBOT is thinking and synthesizing response...</span>
                          </div>
                        )}

                        {/* Verified Google Search Grounding Citations */}
                        {message.groundingSources &&
                          message.groundingSources.length > 0 && (
                            <div className="pt-3 mt-3 border-t border-white/[0.07] space-y-2">
                              <div className="flex items-center gap-2 text-xs text-slate-400">
                                <Globe className="w-3.5 h-3.5 text-sky-400" />
                                <span className="font-medium text-slate-300">
                                  Verified Google Search Grounding Sources
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
                                      <span className="truncate max-w-[240px]">
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

            {/* Multimodal Prompt Composer Tray */}
            <div className="px-4 sm:px-6 pb-4 pt-2 bg-[#0B0F19]">
              <div className="max-w-[760px] mx-auto rounded-xl bg-[#111827] border border-white/[0.1] focus-within:border-indigo-500/80 focus-within:shadow-[0_0_25px_-5px_rgba(99,102,241,0.25)] transition-all p-3 space-y-2.5">
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
                            className="w-8 h-8 rounded object-cover"
                          />
                        ) : (
                          <FileText className="w-4 h-4 text-indigo-400 ml-1" />
                        )}
                        <span className="text-slate-200 truncate max-w-[150px]">
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
                  placeholder="Ask MANBOT anything, attach images/files, or ask to draft code & docs in the Canvas..."
                  className="w-full bg-transparent text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none resize-none leading-relaxed"
                />

                {/* Bottom Controls Bar */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-white/[0.06]">
                  <div className="flex flex-wrap items-center gap-1.5">
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
                      <span>Attach</span>
                    </button>

                    {/* Live Google Search Grounding Toggle */}
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
                      <span>Google Search</span>
                    </button>

                    {/* Reasoning Depth Selector */}
                    <div className="inline-flex items-center gap-1 bg-[#0B0F19] border border-white/[0.07] rounded-lg px-2 py-1 text-xs">
                      <BrainCircuit className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                      <select
                        value={thinkingLevel}
                        onChange={(e) =>
                          setThinkingLevel(e.target.value as ReasoningLevel)
                        }
                        aria-label="Reasoning level"
                        className="bg-transparent text-slate-300 font-medium focus:outline-none cursor-pointer"
                      >
                        <option value="LOW" className="bg-[#111827]">
                          Reasoning: Low (Fast)
                        </option>
                        <option value="HIGH" className="bg-[#111827]">
                          Reasoning: High
                        </option>
                        <option value="XHIGH" className="bg-[#111827]">
                          Reasoning: Max (XHIGH)
                        </option>
                      </select>
                    </div>

                    {/* Model Selector */}
                    <select
                      value={selectedModel}
                      onChange={(e) =>
                        setSelectedModel(e.target.value as ModelOptionId)
                      }
                      aria-label="Select Gemini model"
                      className="bg-[#0B0F19] border border-white/[0.07] rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-300 focus:outline-none cursor-pointer"
                    >
                      <option value="gemini-4-hydrogen" className="bg-[#111827]">
                        gemini-4-hydrogen (Flash)
                      </option>
                      <option value="gemini-3.1-flash-lite" className="bg-[#111827]">
                        gemini-3.1-flash-lite (Lite)
                      </option>
                    </select>
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
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Send</span>
                        <ArrowUp className="w-3.5 h-3.5" />
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </main>

          {/* Right Split-Screen Interactive Canvas Pane (50% width when open) */}
          {activeCanvas && (
            <div className="w-full lg:w-1/2 h-full shrink-0">
              <CanvasPane
                artifact={activeCanvas}
                onUpdateArtifact={handleUpdateCanvas}
                onClose={() => setOpenCanvasId(null)}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
