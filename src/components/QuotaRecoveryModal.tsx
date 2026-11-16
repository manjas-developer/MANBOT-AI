import React, { useState } from 'react';
import {
  CheckCircle2,
  Loader2,
  ShieldCheck,
  Sparkles,
  X,
  Zap,
} from 'lucide-react';
import { UserIdentity } from '../types';

interface QuotaRecoveryModalProps {
  isOpen: boolean;
  onClose: () => void;
  userIdentity: UserIdentity;
  onIdentityUpgraded: (updatedIdentity: UserIdentity) => void;
  onSwitchToFlashLiteAndRetry: () => void;
  onRetryAfterKeyUpdate: () => void;
}

const IN_APP_PLANS = [
  {
    id: 'burst_refill' as const,
    name: 'For instant continuation · Free Burst Refill',
    price: '$0 · Instant In-App Boost',
    allowance: '+25 Immediate API Requests',
    description:
      'Instantly adds 25 free API credits to your locked Operator ID and switches to high-throughput Flash-Lite so your request finishes in seconds.',
    badge: 'Instant Free Boost',
    primary: false,
  },
  {
    id: 'pro_studio' as const,
    name: 'For power creators & engineers · Pro Studio Pass',
    price: '$9 / month · Activated In-App',
    allowance: '1,000 Priority API Requests / mo',
    description:
      'Provisions 1,000 priority Gemini 4 requests, XHIGH deep reasoning, Google Search grounding, and Studio synthesis directly inside MANBOT.',
    badge: 'Recommended',
    primary: true,
  },
  {
    id: 'unlimited_enterprise' as const,
    name: 'For teams & heavy workloads · Unlimited Enterprise Pass',
    price: '$29 / month · Activated In-App',
    allowance: 'Unlimited API Requests & Priority Throughput',
    description:
      'Removes all per-operator rate caps and unlocks unlimited multimodal chat, Canvas refinements, and Studio renders for your device ID.',
    badge: 'Unlimited Access',
    primary: false,
  },
];

export const QuotaRecoveryModal: React.FC<QuotaRecoveryModalProps> = ({
  isOpen,
  onClose,
  userIdentity,
  onIdentityUpgraded,
  onSwitchToFlashLiteAndRetry,
  onRetryAfterKeyUpdate,
}) => {
  const [activatingPlanId, setActivatingPlanId] = useState<string | null>(null);
  const [activationSuccess, setActivationSuccess] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleActivateInAppPlan = async (
    planId: 'burst_refill' | 'pro_studio' | 'unlimited_enterprise'
  ) => {
    setActivatingPlanId(planId);
    setErrorMsg(null);
    setActivationSuccess(null);

    try {
      const res = await fetch('/api/quota/upgrade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userIdentity,
          targetPlan: planId,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.identity) {
        throw new Error(data.error || 'Could not provision in-app quota pass.');
      }

      onIdentityUpgraded(data.identity);
      setActivationSuccess(
        `Activated ${data.identity.tier} for ${data.identity.id} — resuming your request now...`
      );

      setTimeout(() => {
        if (planId === 'burst_refill') {
          onSwitchToFlashLiteAndRetry();
        } else {
          onRetryAfterKeyUpdate();
        }
        setActivationSuccess(null);
        onClose();
      }, 500);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'In-app activation failed.'
      );
    } finally {
      setActivatingPlanId(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-2xl rounded-t-2xl sm:rounded-2xl bg-[#111827] border border-white/[0.12] overflow-hidden shadow-2xl max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.08] bg-[#0B0F19]">
          <div className="flex items-center gap-2.5">
            <Zap className="w-4 h-4 text-amber-400 shrink-0" />
            <h2 className="font-display text-base font-semibold text-white">
              In-App API Quota &amp; Instant Pass Provisioning
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-5 text-xs text-slate-300 leading-relaxed">
          {/* Operator Attribution Banner */}
          <div className="flex flex-wrap items-center justify-between gap-2 p-3.5 rounded-xl bg-[#0B0F19] border border-white/[0.08]">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-indigo-400 shrink-0" />
              <span>
                Locked Operator ID:{' '}
                <strong className="font-mono text-white">{userIdentity.id}</strong>
              </span>
              <span className="text-slate-600" aria-hidden="true">·</span>
              <span>
                Current Tier:{' '}
                <strong className="text-indigo-300">{userIdentity.tier}</strong>
              </span>
            </div>
            <span className="font-mono tabular-nums text-slate-400">
              Used:{' '}
              {userIdentity.quotaLimit >= 999999
                ? `${userIdentity.quotaUsed} / ∞`
                : `${userIdentity.quotaUsed} / ${userIdentity.quotaLimit} calls`}
            </span>
          </div>

          <p className="text-slate-300">
            Activate a free burst refill or upgrade your compute pass directly inside MANBOT—no external websites, redirects, or manual setup required. Your request resumes automatically in seconds.
          </p>

          {/* In-App Tier Cards */}
          <div className="grid grid-cols-1 gap-3.5">
            {IN_APP_PLANS.map((plan) => {
              const isBusy = activatingPlanId === plan.id;
              return (
                <div
                  key={plan.id}
                  className={`p-4 rounded-xl border transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                    plan.primary
                      ? 'bg-indigo-950/25 border-indigo-500/50'
                      : 'bg-[#0B0F19] border-white/[0.08]'
                  }`}
                >
                  <div className="space-y-1.5 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-display text-sm font-semibold text-white">
                        {plan.name}
                      </h3>
                      <span className="text-slate-600" aria-hidden="true">·</span>
                      <span className="font-mono text-indigo-300 font-medium">
                        {plan.price}
                      </span>
                    </div>
                    <div className="font-mono text-[11px] text-emerald-400">
                      Allowance: {plan.allowance}
                    </div>
                    <p className="text-slate-400 text-xs leading-relaxed">
                      {plan.description}
                    </p>
                  </div>

                  <button
                    type="button"
                    disabled={Boolean(activatingPlanId)}
                    onClick={() => handleActivateInAppPlan(plan.id)}
                    className={`inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      plan.primary
                        ? 'bg-indigo-600 hover:bg-indigo-500 text-white'
                        : 'bg-white/[0.08] hover:bg-white/[0.14] text-white border border-white/[0.1]'
                    }`}
                  >
                    {isBusy ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Activating...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Activate In-App Now</span>
                      </>
                    )}
                  </button>
                </div>
              );
            })}
          </div>

          {activationSuccess && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{activationSuccess}</span>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300">
              {errorMsg}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
