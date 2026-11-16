import React, { useState } from 'react';
import { Check, Copy, Columns, Terminal, FileCode } from 'lucide-react';
import { CanvasLanguage } from '../types';

interface MarkdownRendererProps {
  content: string;
  onOpenInCanvas: (code: string, language: CanvasLanguage, suggestedTitle: string) => void;
}

function normalizeCanvasLanguage(raw: string): CanvasLanguage {
  const lower = raw.toLowerCase().trim();
  if (lower === 'ts' || lower === 'tsx' || lower === 'typescript') return 'typescript';
  if (lower === 'js' || lower === 'jsx' || lower === 'javascript') return 'javascript';
  if (lower === 'html' || lower === 'xml' || lower === 'svg') return 'html';
  if (lower === 'py' || lower === 'python') return 'python';
  if (lower === 'json') return 'json';
  if (lower === 'css' || lower === 'scss') return 'css';
  return 'markdown';
}

function inferTitleFromCode(code: string, lang: string): string {
  const firstLine = code
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 0 && !l.startsWith('<!DOCTYPE'));

  if (!firstLine) return `MANBOT ${lang.toUpperCase()} Artifact`;

  const cleaned = firstLine
    .replace(/^(?:\/\/|#|\/\*+|\*+|<!--)\s*/, '')
    .replace(/(?:\*+\/|-->)$/, '')
    .replace(/^#+\s*/, '')
    .trim();

  if (cleaned.length >= 3 && cleaned.length <= 52 && !cleaned.includes('{') && !cleaned.includes('<')) {
    return cleaned;
  }

  if (lang === 'html') return 'Interactive HTML Preview';
  if (lang === 'typescript' || lang === 'javascript') return 'TypeScript Module';
  if (lang === 'python') return 'Python Script';
  if (lang === 'markdown') return 'Markdown Document';
  return `MANBOT ${lang.toUpperCase()} Snippet`;
}

function formatInlineMarkdown(text: string): React.ReactNode[] {
  // Split by inline code `...`, bold **...**, or links [label](url)
  const tokenRegex = /(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g;
  const parts = text.split(tokenRegex);

  return parts.map((part, idx) => {
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return (
        <code
          key={idx}
          className="font-mono text-[13px] px-1.5 py-0.5 rounded bg-slate-800/90 text-indigo-200 border border-white/[0.07]"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong key={idx} className="font-semibold text-white">
          {part.slice(2, -2)}
        </strong>
      );
    }
    const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) {
      return (
        <a
          key={idx}
          href={linkMatch[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-indigo-400 hover:text-indigo-300 underline underline-offset-4 transition-colors"
        >
          {linkMatch[1]}
        </a>
      );
    }
    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });
}

function renderTextSegment(segment: string, segIdx: number): React.ReactNode {
  const lines = segment.split('\n');
  const elements: React.ReactNode[] = [];
  let listItems: string[] = [];
  let orderedItems: string[] = [];
  let tableLines: string[] = [];

  const flushList = (keyPrefix: string) => {
    if (listItems.length > 0) {
      elements.push(
        <ul key={`${keyPrefix}-ul`} className="my-2.5 space-y-1.5 pl-5 list-disc text-slate-200 marker:text-slate-500">
          {listItems.map((item, i) => (
            <li key={i} className="leading-relaxed">
              {formatInlineMarkdown(item)}
            </li>
          ))}
        </ul>
      );
      listItems = [];
    }
    if (orderedItems.length > 0) {
      elements.push(
        <ol key={`${keyPrefix}-ol`} className="my-2.5 space-y-1.5 pl-5 list-decimal text-slate-200 marker:text-slate-400 tabular-nums">
          {orderedItems.map((item, i) => (
            <li key={i} className="leading-relaxed">
              {formatInlineMarkdown(item)}
            </li>
          ))}
        </ol>
      );
      orderedItems = [];
    }
  };

  const flushTable = (keyPrefix: string) => {
    if (tableLines.length >= 2) {
      const parsedRows = tableLines
        .filter((l) => !/^\|\s*[-:]+/.test(l.trim()))
        .map((row) =>
          row
            .trim()
            .replace(/^\||\|$/g, '')
            .split('|')
            .map((cell) => cell.trim())
        );

      if (parsedRows.length > 0) {
        const [header, ...body] = parsedRows;
        elements.push(
          <div key={`${keyPrefix}-tbl`} className="my-4 overflow-x-auto border border-white/[0.08] rounded-lg bg-[#0B0F19]">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-white/[0.08] bg-slate-900/70">
                  {header.map((col, cIdx) => (
                    <th key={cIdx} className="px-3.5 py-2.5 font-semibold text-slate-200 whitespace-nowrap">
                      {formatInlineMarkdown(col)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06] tabular-nums">
                {body.map((r, rIdx) => (
                  <tr key={rIdx} className="hover:bg-white/[0.02] transition-colors">
                    {r.map((cell, cIdx) => (
                      <td key={cIdx} className="px-3.5 py-2 text-slate-300">
                        {formatInlineMarkdown(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
      tableLines = [];
    } else if (tableLines.length === 1) {
      elements.push(
        <p key={`${keyPrefix}-tbl-p`} className="my-2 leading-relaxed text-slate-200">
          {formatInlineMarkdown(tableLines[0])}
        </p>
      );
      tableLines = [];
    }
  };

  lines.forEach((line, lineIdx) => {
    const trimmed = line.trim();

    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      flushList(`${segIdx}-${lineIdx}`);
      tableLines.push(trimmed);
      return;
    } else if (tableLines.length > 0) {
      flushTable(`${segIdx}-${lineIdx}`);
    }

    const ulMatch = line.match(/^\s*[-*]\s+(.+)$/);
    if (ulMatch) {
      if (orderedItems.length > 0) flushList(`${segIdx}-${lineIdx}`);
      listItems.push(ulMatch[1]);
      return;
    }

    const olMatch = line.match(/^\s*\d+\.\s+(.+)$/);
    if (olMatch) {
      if (listItems.length > 0) flushList(`${segIdx}-${lineIdx}`);
      orderedItems.push(olMatch[1]);
      return;
    }

    flushList(`${segIdx}-${lineIdx}`);

    if (!trimmed) {
      return;
    }

    if (trimmed.startsWith('### ')) {
      elements.push(
        <h3 key={`${segIdx}-${lineIdx}`} className="font-display text-base font-semibold text-white mt-5 mb-2">
          {formatInlineMarkdown(trimmed.slice(4))}
        </h3>
      );
    } else if (trimmed.startsWith('## ')) {
      elements.push(
        <h2 key={`${segIdx}-${lineIdx}`} className="font-display text-lg font-semibold text-white mt-6 mb-2.5">
          {formatInlineMarkdown(trimmed.slice(3))}
        </h2>
      );
    } else if (trimmed.startsWith('# ')) {
      elements.push(
        <h1 key={`${segIdx}-${lineIdx}`} className="font-display text-xl font-semibold text-white mt-6 mb-3">
          {formatInlineMarkdown(trimmed.slice(2))}
        </h1>
      );
    } else if (trimmed === '---' || trimmed === '***') {
      elements.push(<hr key={`${segIdx}-${lineIdx}`} className="my-4 border-white/[0.08]" />);
    } else {
      elements.push(
        <p key={`${segIdx}-${lineIdx}`} className="my-2.5 leading-[1.68] text-slate-200">
          {formatInlineMarkdown(line)}
        </p>
      );
    }
  });

  flushList(`${segIdx}-end`);
  flushTable(`${segIdx}-end`);

  return <React.Fragment key={segIdx}>{elements}</React.Fragment>;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  content,
  onOpenInCanvas,
}) => {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  // Parse fenced code blocks ```lang ... ```
  const blocks: Array<{ type: 'text' | 'code'; content: string; language?: string }> = [];
  const codeBlockRegex = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      blocks.push({
        type: 'text',
        content: content.slice(lastIndex, match.index),
      });
    }
    blocks.push({
      type: 'code',
      language: match[1] || 'markdown',
      content: match[2].replace(/\n$/, ''),
    });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    const remaining = content.slice(lastIndex);
    // Check if there is an unclosed streaming code block at the end
    const unclosedMatch = remaining.match(/```([a-zA-Z0-9_-]*)\n([\s\S]*)$/);
    if (unclosedMatch && unclosedMatch.index !== undefined) {
      if (unclosedMatch.index > 0) {
        blocks.push({
          type: 'text',
          content: remaining.slice(0, unclosedMatch.index),
        });
      }
      blocks.push({
        type: 'code',
        language: unclosedMatch[1] || 'markdown',
        content: unclosedMatch[2],
      });
    } else {
      blocks.push({
        type: 'text',
        content: remaining,
      });
    }
  }

  const handleCopy = (code: string, idx: number) => {
    navigator.clipboard.writeText(code);
    setCopiedIndex(idx);
    setTimeout(() => setCopiedIndex(null), 1800);
  };

  return (
    <div className="space-y-3 text-[15px]">
      {blocks.map((block, idx) => {
        if (block.type === 'code') {
          const rawLang = block.language || 'code';
          const canvasLang = normalizeCanvasLanguage(rawLang);
          const lineCount = block.content.split('\n').length;
          const suggestedTitle = inferTitleFromCode(block.content, rawLang);

          return (
            <div
              key={idx}
              className="my-3.5 rounded-lg border border-white/[0.09] bg-[#070A12] overflow-hidden"
            >
              <div className="flex items-center justify-between px-3.5 py-2 bg-[#111827] border-b border-white/[0.07] text-xs text-slate-400">
                <div className="flex items-center gap-2 font-mono">
                  <Terminal className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                  <span className="text-slate-200 font-medium">{rawLang}</span>
                  <span aria-hidden="true">·</span>
                  <span className="tabular-nums">{lineCount} {lineCount === 1 ? 'line' : 'lines'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onOpenInCanvas(block.content, canvasLang, suggestedTitle)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium text-indigo-300 hover:text-white hover:bg-indigo-500/20 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Columns className="w-3.5 h-3.5" />
                    Open in Canvas
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCopy(block.content, idx)}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-slate-300 hover:text-white hover:bg-white/[0.06] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {copiedIndex === idx ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-300">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
              <pre className="p-4 overflow-x-auto text-[13px] leading-relaxed font-mono text-slate-200">
                <code>{block.content}</code>
              </pre>
            </div>
          );
        }

        return renderTextSegment(block.content, idx);
      })}

      {/* If the message has substantial prose and no code block, offer a subtle button to open the prose in Canvas */}
      {blocks.length > 0 &&
        !blocks.some((b) => b.type === 'code') &&
        content.length > 260 && (
          <div className="pt-1">
            <button
              type="button"
              onClick={() =>
                onOpenInCanvas(
                  content,
                  'markdown',
                  inferTitleFromCode(content, 'markdown')
                )
              }
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-indigo-300 transition-colors cursor-pointer"
            >
              <FileCode className="w-3.5 h-3.5" />
              <span>Edit response in side-by-side Canvas</span>
            </button>
          </div>
        )}
    </div>
  );
};
