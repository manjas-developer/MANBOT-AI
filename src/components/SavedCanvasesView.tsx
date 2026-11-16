import React, { useState } from 'react';
import { Columns, FileCode2, Plus, Search, Trash2 } from 'lucide-react';
import { CanvasArtifact, CanvasLanguage } from '../types';

interface SavedCanvasesViewProps {
  canvases: CanvasArtifact[];
  onOpenCanvas: (artifact: CanvasArtifact) => void;
  onCreateBlankCanvas: (title: string, language: CanvasLanguage) => void;
  onDeleteCanvas: (id: string) => void;
}

export const SavedCanvasesView: React.FC<SavedCanvasesViewProps> = ({
  canvases,
  onOpenCanvas,
  onCreateBlankCanvas,
  onDeleteCanvas,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newLang, setNewLang] = useState<CanvasLanguage>('markdown');

  const filtered = canvases.filter(
    (c) =>
      c.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.language.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const title = newTitle.trim() || `Untitled ${newLang} Artifact`;
    onCreateBlankCanvas(title, newLang);
    setNewTitle('');
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[#0B0F19] p-6 lg:p-8">
      <div className="max-w-[1160px] mx-auto space-y-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-white/[0.08] pb-6">
          <div>
            <h1 className="font-display text-2xl md:text-3xl font-semibold text-white tracking-tight">
              Saved Canvas Artifacts
            </h1>
            <p className="text-sm text-slate-400 mt-1.5 max-w-2xl">
              Manage, search, and reopen code modules and Markdown documents co-authored with MANBOT.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter artifacts..."
                className="bg-[#111827] border border-white/[0.08] rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>
        </div>

        {/* New Blank Canvas Bar */}
        <form
          onSubmit={handleCreate}
          className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 p-4 rounded-xl bg-[#111827] border border-white/[0.08]"
        >
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="New Canvas title (e.g., API Schema Specification or Landing Page Preview)..."
            className="flex-1 bg-[#0B0F19] border border-white/[0.08] rounded-lg px-3.5 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
          />
          <select
            value={newLang}
            onChange={(e) => setNewLang(e.target.value as CanvasLanguage)}
            aria-label="New Canvas language"
            className="bg-[#0B0F19] border border-white/[0.08] rounded-lg px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer"
          >
            <option value="markdown">markdown</option>
            <option value="typescript">typescript</option>
            <option value="javascript">javascript</option>
            <option value="html">html</option>
            <option value="python">python</option>
            <option value="json">json</option>
            <option value="css">css</option>
          </select>
          <button
            type="submit"
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-medium text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Create Canvas</span>
          </button>
        </form>

        {/* Artifact Grid */}
        {filtered.length === 0 ? (
          <div className="p-12 rounded-xl bg-[#111827] border border-white/[0.08] text-center space-y-3">
            <FileCode2 className="w-8 h-8 text-slate-500 mx-auto" />
            <h2 className="font-display text-base font-semibold text-white">
              No Canvas Artifacts Found
            </h2>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              Click &ldquo;Open in Canvas&rdquo; on any code block or document inside a MANBOT chat thread, or create a new blank Canvas above.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((artifact) => {
              const lines = artifact.content.split('\n').length;
              return (
                <div
                  key={artifact.id}
                  className="flex flex-col justify-between p-5 rounded-xl bg-[#111827] border border-white/[0.08] hover:border-white/[0.16] transition-colors space-y-4"
                >
                  <div className="space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-display text-base font-semibold text-white truncate">
                        {artifact.title}
                      </h3>
                      <button
                        type="button"
                        onClick={() => onDeleteCanvas(artifact.id)}
                        className="text-slate-500 hover:text-rose-400 p-1 transition-colors cursor-pointer"
                        title="Delete artifact"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-slate-400 font-mono tabular-nums">
                      <span>{artifact.language}</span>
                      <span aria-hidden="true">·</span>
                      <span>{lines} lines</span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {new Date(artifact.updatedAt).toLocaleDateString()}
                      </span>
                    </div>

                    <pre className="p-3 rounded-lg bg-[#070A12] border border-white/[0.06] text-[11px] font-mono text-slate-400 line-clamp-4 overflow-hidden">
                      <code>{artifact.content}</code>
                    </pre>
                  </div>

                  <button
                    type="button"
                    onClick={() => onOpenCanvas(artifact)}
                    className="w-full inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-white/[0.05] hover:bg-indigo-600 text-xs font-medium text-slate-200 hover:text-white transition-colors cursor-pointer"
                  >
                    <Columns className="w-3.5 h-3.5" />
                    <span>Open in Split Workspace</span>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
