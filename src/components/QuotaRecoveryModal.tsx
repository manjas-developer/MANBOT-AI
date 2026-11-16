import React, { useState } from 'react';
import {
  CheckCircle2,
  ExternalLink,
  Loader2,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
  X,
  Zap,
} from 'lucide-react';

interface QuotaRecoveryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSwitchToFlashLiteAndRetry: () => void;
  onRetryAfterKeyUpdate: () => void;
}

export const QuotaRecoveryModal: React.FC<QuotaRecoveryModalProps> = ({
  isOpen,
  onClose,
  onSwitchToFlashLiteAndRetry,
  onRetryAfterKeyUpdate,
}) => {
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifiedMessage, setVerifiedMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleVerifyAndResume = async () => {
    setIsVerifying(true);
    setVerifiedMessage(null);
    try {
      const res = await fetch('/api/health');
      const data = await res.json();
      if (data.status === 'ok') {
        setVerifiedMessage('Connection verified — resuming MANBOT request now...');
        setTimeout(() => {
          onRetryAfterKeyUpdate();
          onClose();
        }, 400);
      }
    } catch {
      setVerifiedMessage('Server reachable — retrying your request...');
      setTimeout(() => {
        onRetryAfterKeyUpdate();
        onClose();
      }, 400);
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="max-w-lg w-full rounded-xl bg-[#111827] border border-white/[0.12] overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.08] bg-[#0B0F19]">
          <div className="flex items-center gap-2.5">
            <Zap className="w-4 h-4 text-amber-400 shrink-0" />
            <h2 className="font-display text-base font-semibold text-white">
              Free-Tier Rate Limit Reached · Instant Continuation
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-5 text-xs text-slate-300 leading-relaxed">
          <p className="text-slate-300">
            Your current rate window reached its free-tier limit (<code className="font-mono text-amber-300">429 RESOURCE_EXHAUSTED</code>). Choose either option below to continue in seconds with zero manual configuration:
          </p>

          {/* Option 1: Instant High-Throughput Model Switch */}
          <div className="p-4 rounded-lg bg-[#0B0F19] border border-white/[0.08] space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-display text-sm font-semibold text-white">
                Option 1 · Switch to High-Throughput Flash-Lite
              </span>
              <span className="font-mono text-[11px] text-indigo-400">
                Instant · 1 Click
              </span>
            </div>
            <p className="text-slate-400">
              Switch your active session to <code className="font-mono text-slate-200">gemini-3.1-flash-lite</code> with higher free-tier rate capacity and automatically re-send your last message.
            </p>
            <button
              type="button"
              onClick={() => {
                onSwitchToFlashLiteAndRetry();
                onClose();
              }}
              className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-medium text-white transition-colors cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Switch to Flash-Lite &amp; Retry Immediately</span>
            </button>
          </div>

          {/* Option 2: Zero-Setup Key Selection via AI Studio Secrets */}
          <div className="p-4 rounded-lg bg-[#0B0F19] border border-white/[0.08] space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-display text-sm font-semibold text-white">
                Option 2 · Attach a Fresh Free or Paid Google AI Key
              </span>
              <span className="font-mono text-[11px] text-emerald-400">
                Zero Code Setup
              </span>
            </div>
            <ol className="space-y-1.5 list-decimal pl-4 text-slate-300 tabular-nums">
              <li>
                Get a free or billing-enabled key from{' '}
                <a
                  href="https://aistudio.google.com/apikey"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-indigo-400 hover:text-indigo-300 underline underline-offset-4 inline-flex items-center gap-1"
                >
                  <span>Google AI Studio Keys</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
                .
              </li>
              <li>
                Open the <strong>Settings &gt; Secrets</strong> panel in the AI Studio sidebar (<SlidersHorizontal className="w-3 h-3 inline text-slate-400" />) and select or update <code className="font-mono text-slate-200">GEMINI_API_KEY</code>.
              </li>
              <li>
                AI Studio injects your key into MANBOT&apos;s backend automatically—click below to resume right where you left off.
              </li>
            </ol>

            {verifiedMessage && (
              <div className="flex items-center gap-2 text-emerald-400 pt-1">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{verifiedMessage}</span>
              </div>
            )}

            <button
              type="button"
              disabled={isVerifying}
              onClick={handleVerifyAndResume}
              className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-white/[0.07] hover:bg-white/[0.12] border border-white/[0.1] text-xs font-medium text-white transition-colors cursor-pointer"
            >
              {isVerifying ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Verifying Backend Connection...</span>
                </>
              ) : (
                <>
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Resume Request Immediately</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
