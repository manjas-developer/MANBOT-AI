import React, { useState } from 'react';
import { ArrowUpRight, Globe, Sparkles } from 'lucide-react';
import { PromptTemplate } from '../types';
import { STARTER_PROMPTS } from '../data/starterPrompts';

interface PromptLibraryViewProps {
  onSelectTemplate: (template: PromptTemplate) => void;
}

const CATEGORIES = [
  'All',
  'Coding & Architecture',
  'Research & Grounding',
  'Writing & Strategy',
] as const;

export const PromptLibraryView: React.FC<PromptLibraryViewProps> = ({
  onSelectTemplate,
}) => {
  const [activeCategory, setActiveCategory] = useState<string>('All');

  const filtered =
    activeCategory === 'All'
      ? STARTER_PROMPTS
      : STARTER_PROMPTS.filter((p) => p.category === activeCategory);

  return (
    <div className="flex-1 overflow-y-auto bg-[#0B0F19] p-6 lg:p-8">
      <div className="max-w-[1160px] mx-auto space-y-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-white/[0.08] pb-6">
          <div>
            <h1 className="font-display text-2xl md:text-3xl font-semibold text-white tracking-tight">
              MANBOT Prompt & Workflow Library
            </h1>
            <p className="text-sm text-slate-400 mt-1.5 max-w-2xl">
              Curated multi-step prompts pre-configured with optimal reasoning depth, live Google Search grounding, and side-by-side Canvas output.
            </p>
          </div>

          {/* Interactive Filter Controls */}
          <div className="flex items-center gap-1 p-1 bg-[#111827] border border-white/[0.08] rounded-lg overflow-x-auto">
            {CATEGORIES.map((category) => (
              <button
                key={category}
                type="button"
                onClick={() => setActiveCategory(category)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeCategory === category
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {category}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {filtered.map((item) => (
            <div
              key={item.id}
              className="flex flex-col justify-between p-5 rounded-xl bg-[#111827] border border-white/[0.08] hover:border-white/[0.18] transition-colors space-y-4"
            >
              <div className="space-y-2.5">
                <h2 className="font-display text-lg font-semibold text-white">
                  {item.title}
                </h2>
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <span>{item.category}</span>
                  <span aria-hidden="true">·</span>
                  <span>Reasoning: {item.thinkingLevel || 'HIGH'}</span>
                  {item.useGoogleSearch && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="inline-flex items-center gap-1 text-sky-400">
                        <Globe className="w-3 h-3" />
                        Google Search Grounded
                      </span>
                    </>
                  )}
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {item.description}
                </p>
                <div className="p-3 rounded-lg bg-[#0B0F19] border border-white/[0.06] text-xs text-slate-400 italic leading-relaxed">
                  &ldquo;{item.prompt}&rdquo;
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end">
                <button
                  type="button"
                  onClick={() => onSelectTemplate(item)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-medium text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Run in MANBOT</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
