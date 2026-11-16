import React, { useState } from 'react';
import {
  Check,
  Code2,
  Copy,
  Download,
  Eye,
  Loader2,
  Maximize2,
  Minimize2,
  RotateCcw,
  Sparkles,
  Wand2,
  X,
} from 'lucide-react';
import { CanvasArtifact, CanvasLanguage, UserIdentity } from '../types';
import { MarkdownRenderer } from './MarkdownRenderer';

interface CanvasPaneProps {
  artifact: CanvasArtifact;
  userIdentity: UserIdentity;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  onUpdateArtifact: (updated: CanvasArtifact) => void;
  onClose: () => void;
}

const QUICK_TRANSFORMS = [
  { label: 'Polish', instruction: 'Improve clarity, structure, and production quality while preserving core intent.' },
  { label: 'Comment', instruction: 'Add clear, concise technical comments and docstrings explaining key logic.' },
  { label: 'Fix Bugs', instruction: 'Inspect for edge cases, bugs, or vulnerabilities and return the hardened version.' },
  { label: 'Concise', instruction: 'Tighten prose or code to be more concise and remove redundancy.' },
];

export const CanvasPane: React.FC<CanvasPaneProps> = ({
  artifact,
  userIdentity,
  isExpanded = false,
  onToggleExpand,
  onUpdateArtifact,
  onClose,
}) => {
  const [viewMode, setViewMode] = useState<'editor' | 'preview'>(
    artifact.language === 'html' ? 'preview' : 'editor'
  );
  const [showAiBar, setShowAiBar] = useState(false);
  const [customInstruction, setCustomInstruction] = useState('');
  const [isRefining, setIsRefining] = useState(false);
  const [refineError, setRefineError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const lineCount = artifact.content.split('\n').length;
  const charCount = artifact.content.length;

  const handleContentChange = (newContent: string) => {
    onUpdateArtifact({
      ...artifact,
      content: newContent,
      updatedAt: new Date().toISOString(),
    });
  };

  const handleLanguageChange = (language: CanvasLanguage) => {
    onUpdateArtifact({
      ...artifact,
      language,
      updatedAt: new Date().toISOString(),
    });
  };

  const handleTitleChange = (title: string) => {
    onUpdateArtifact({
      ...artifact,
      title,
      updatedAt: new Date().toISOString(),
    });
  };

  const handleUndo = () => {
    if (artifact.history.length === 0) return;
    const previous = artifact.history[artifact.history.length - 1];
    onUpdateArtifact({
      ...artifact,
      content: previous,
      history: artifact.history.slice(0, -1),
      updatedAt: new Date().toISOString(),
    });
  };

  const runAiTransform = async (instructionText: string) => {
    if (!instructionText.trim() || isRefining) return;
    setIsRefining(true);
    setRefineError(null);

    try {
      const response = await fetch('/api/canvas/refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: artifact.title,
          language: artifact.language,
          content: artifact.content,
          instruction: instructionText.trim(),
          userIdentity,
        }),
      });

      const data = await response.json();
      if (!response.ok || data.error) {
        throw new Error(data.error || 'Failed to refine Canvas content.');
      }

      onUpdateArtifact({
        ...artifact,
        history: [...artifact.history.slice(-9), artifact.content],
        content: data.updatedContent,
        updatedAt: new Date().toISOString(),
      });
      setCustomInstruction('');
    } catch (err) {
      setRefineError(err instanceof Error ? err.message : 'Canvas transform failed.');
    } finally {
      setIsRefining(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(artifact.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleDownload = () => {
    const extMap: Record<CanvasLanguage, string> = {
      markdown: 'md',
      typescript: 'ts',
      javascript: 'js',
      html: 'html',
      python: 'py',
      json: 'json',
      css: 'css',
    };
    const ext = extMap[artifact.language] || 'txt';
    const safeName =
      artifact.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'manbot-artifact';

    const blob = new Blob([artifact.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeName}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const canPreview = artifact.language === 'html' || artifact.language === 'markdown';

  return (
    <aside className="flex flex-col h-full bg-[#111827] lg:border-l border-white/[0.08] overflow-hidden">
      {/* Compact Adaptive Canvas Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 border-b border-white/[0.08] bg-[#0B0F19]/70">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <input
            type="text"
            value={artifact.title}
            onChange={(e) => handleTitleChange(e.target.value)}
            aria-label="Canvas title"
            className="bg-transparent font-display text-sm font-semibold text-white focus:outline-none focus:ring-1 focus:ring-indigo-500/60 rounded px-1.5 py-0.5 truncate w-full max-w-[200px]"
          />
          <select
            value={artifact.language}
            onChange={(e) => handleLanguageChange(e.target.value as CanvasLanguage)}
            aria-label="Artifact language"
            className="bg-[#111827] text-[11px] font-mono text-slate-300 border border-white/[0.08] rounded px-2 py-1 focus:outline-none focus:border-indigo-500 cursor-pointer shrink-0"
          >
            <option value="markdown">markdown</option>
            <option value="typescript">typescript</option>
            <option value="javascript">javascript</option>
            <option value="html">html</option>
            <option value="python">python</option>
            <option value="json">json</option>
            <option value="css">css</option>
          </select>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {canPreview && (
            <div className="flex items-center bg-[#0B0F19] p-0.5 rounded-lg border border-white/[0.08]">
              <button
                type="button"
                onClick={() => setViewMode('editor')}
                className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  viewMode === 'editor'
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Code2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Source</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('preview')}
                className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  viewMode === 'preview'
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Preview</span>
              </button>
            </div>
          )}

          {/* Toggle Collapsible AI Refine Bar */}
          <button
            type="button"
            onClick={() => setShowAiBar((v) => !v)}
            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              showAiBar || isRefining
                ? 'bg-indigo-600/20 border-indigo-500/50 text-indigo-200'
                : 'bg-[#0B0F19] border-white/[0.08] text-slate-300 hover:text-white'
            }`}
            title="AI Canvas Actions"
          >
            {isRefining ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
            ) : (
              <Wand2 className="w-3.5 h-3.5 text-indigo-400" />
            )}
            <span>AI Edit</span>
          </button>

          <button
            type="button"
            onClick={handleUndo}
            disabled={artifact.history.length === 0}
            title="Revert to previous version"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06] disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={handleCopy}
            title="Copy content"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </button>

          <button
            type="button"
            onClick={handleDownload}
            title="Download file"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
          </button>

          {onToggleExpand && (
            <button
              type="button"
              onClick={onToggleExpand}
              title={isExpanded ? 'Restore Split View' : 'Expand Canvas Full Width'}
              className="hidden lg:inline-flex p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
            >
              {isExpanded ? (
                <Minimize2 className="w-3.5 h-3.5" />
              ) : (
                <Maximize2 className="w-3.5 h-3.5" />
              )}
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            title="Close Canvas"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Collapsible AI Refine Drawer (keeps default Canvas view clean and uncluttered) */}
      {showAiBar && (
        <div className="px-3.5 py-2.5 border-b border-white/[0.08] bg-[#0B0F19]/60 space-y-2">
          <div className="flex items-center gap-1.5 overflow-x-auto">
            {QUICK_TRANSFORMS.map((action) => (
              <button
                key={action.label}
                type="button"
                disabled={isRefining}
                onClick={() => runAiTransform(action.instruction)}
                className="px-2.5 py-1 rounded-md text-xs font-medium bg-white/[0.04] hover:bg-indigo-500/20 text-slate-300 hover:text-indigo-200 border border-white/[0.07] transition-colors whitespace-nowrap shrink-0 disabled:opacity-50 cursor-pointer"
              >
                {action.label}
              </button>
            ))}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              runAiTransform(customInstruction);
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              value={customInstruction}
              onChange={(e) => setCustomInstruction(e.target.value)}
              disabled={isRefining}
              placeholder="Describe how MANBOT should transform this artifact..."
              className="flex-1 bg-[#0B0F19] border border-white/[0.08] focus:border-indigo-500/70 rounded-lg px-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={isRefining || !customInstruction.trim()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-40 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {isRefining ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              <span>Apply</span>
            </button>
          </form>

          {refineError && (
            <p className="text-xs text-rose-400">{refineError}</p>
          )}
        </div>
      )}

      {/* Main Editor or Live Preview Body */}
      <div className="flex-1 relative overflow-hidden">
        {viewMode === 'preview' && artifact.language === 'html' ? (
          <iframe
            title={artifact.title}
            srcDoc={artifact.content}
            sandbox="allow-scripts"
            className="w-full h-full border-0 bg-[#0B0F19]"
          />
        ) : viewMode === 'preview' && artifact.language === 'markdown' ? (
          <div className="h-full overflow-y-auto p-5 sm:p-6 bg-[#0B0F19]">
            <div className="max-w-[68ch] mx-auto">
              <MarkdownRenderer
                content={artifact.content}
                onOpenInCanvas={() => setViewMode('editor')}
              />
            </div>
          </div>
        ) : (
          <textarea
            value={artifact.content}
            onChange={(e) => handleContentChange(e.target.value)}
            spellCheck={false}
            aria-label="Canvas source editor"
            className="w-full h-full p-4 sm:p-5 bg-[#070A12] text-slate-100 font-mono text-[13px] leading-relaxed resize-none focus:outline-none"
          />
        )}
      </div>

      {/* Clean Unboxed Metadata Footer */}
      <div className="flex items-center justify-between px-3.5 py-2 border-t border-white/[0.08] bg-[#0B0F19] text-[11px] text-slate-400 font-mono tabular-nums">
        <div className="flex items-center gap-2">
          <span>{artifact.language}</span>
          <span aria-hidden="true">·</span>
          <span>{lineCount} lines</span>
          <span aria-hidden="true">·</span>
          <span>{charCount.toLocaleString()} chars</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span>ID: {userIdentity.id}</span>
          <span aria-hidden="true">·</span>
          <span>{artifact.history.length} rev</span>
        </div>
      </div>
    </aside>
  );
};
