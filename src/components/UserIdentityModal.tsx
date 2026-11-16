import React, { useEffect, useState } from 'react';
import {
  Activity,
  Fingerprint,
  Lock,
  Receipt,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import { ApiUsageRecord, PaymentReceipt, UserIdentity } from '../types';

interface UserIdentityModalProps {
  isOpen: boolean;
  onClose: () => void;
  userIdentity: UserIdentity;
  onOpenQuotaUpgrade: () => void;
}

export const UserIdentityModal: React.FC<UserIdentityModalProps> = ({
  isOpen,
  onClose,
  userIdentity,
  onOpenQuotaUpgrade,
}) => {
  const [usageRecords, setUsageRecords] = useState<ApiUsageRecord[]>([]);
  const [receipts, setReceipts] = useState<PaymentReceipt[]>([]);
  const [totalCalls, setTotalCalls] = useState(0);
  const [loadingUsage, setLoadingUsage] = useState(false);

  const fetchUsageLedger = async () => {
    setLoadingUsage(true);
    try {
      const res = await fetch('/api/usage');
      if (res.ok) {
        const data = await res.json();
        setUsageRecords(data.operators || []);
        setReceipts(data.receipts || []);
        setTotalCalls(data.totalApiCalls || 0);
      }
    } catch {
      // ignore fetch errors
    } finally {
      setLoadingUsage(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchUsageLedger();
    }
  }, [isOpen, userIdentity.quotaUsed, userIdentity.quotaLimit, userIdentity.tier]);

  if (!isOpen) return null;

  const remainingQuota = Math.max(0, userIdentity.quotaLimit - userIdentity.quotaUsed);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-xl rounded-t-2xl sm:rounded-2xl bg-[#111827] border border-white/[0.12] overflow-hidden shadow-2xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.08] bg-[#0B0F19]">
          <div className="flex items-center gap-2.5">
            <Fingerprint className="w-4 h-4 text-indigo-400 shrink-0" />
            <h2 className="font-display text-base font-semibold text-white">
              Locked Operator Identity &amp; Billing Ledger
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

        <div className="p-5 overflow-y-auto space-y-6 text-xs">
          {/* Immutable Cryptographic Identity Card (Read-Only, Non-Editable) */}
          <div className="p-4 rounded-xl bg-[#0B0F19] border border-white/[0.08] space-y-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Lock className="w-3.5 h-3.5 text-emerald-400" />
                <span className="font-display text-sm font-semibold text-white">
                  Immutable Hardware-Bound Identifier
                </span>
              </div>
              <span className="inline-flex items-center gap-1 text-[11px] font-mono text-emerald-400">
                <ShieldCheck className="w-3.5 h-3.5" />
                HMAC-SHA256 Verified
              </span>
            </div>

            <p className="text-slate-400 leading-relaxed">
              This identifier is cryptographically derived and signed by the MANBOT server using your browser and device telemetry. It is strictly read-only and cannot be altered or spoofed.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 font-mono tabular-nums">
              <div className="p-3 rounded-lg bg-[#111827] border border-white/[0.06] space-y-1">
                <div className="text-[10px] text-slate-500 font-sans">Locked Operator ID</div>
                <div className="text-sm font-semibold text-indigo-300 select-all">
                  {userIdentity.id}
                </div>
              </div>

              <div className="p-3 rounded-lg bg-[#111827] border border-white/[0.06] space-y-1">
                <div className="text-[10px] text-slate-500 font-sans">Device Fingerprint Hash</div>
                <div className="text-xs text-slate-200 truncate select-all">
                  {userIdentity.fingerprintHash}
                </div>
              </div>

              <div className="p-3 rounded-lg bg-[#111827] border border-white/[0.06] space-y-1">
                <div className="text-[10px] text-slate-500 font-sans">Active Paid / Free Tier</div>
                <div className="text-xs font-semibold text-white">
                  {userIdentity.tier}
                </div>
              </div>

              <div className="p-3 rounded-lg bg-[#111827] border border-white/[0.06] space-y-1">
                <div className="text-[10px] text-slate-500 font-sans">Remaining API Credits</div>
                <div className="text-xs text-emerald-300">
                  {userIdentity.quotaLimit >= 999999
                    ? 'Unlimited Calls'
                    : `${remainingQuota} of ${userIdentity.quotaLimit} calls left`}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="text-[11px] font-mono text-slate-500 truncate max-w-[240px]">
                Sig: {userIdentity.signature}
              </span>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenQuotaUpgrade();
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-medium text-white transition-colors cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Purchase API Credits</span>
              </button>
            </div>
          </div>

          {/* Live API Attribution Ledger */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-sky-400" />
                <span className="font-display text-sm font-semibold text-white">
                  Verified Operator API Usage Ledger
                </span>
                <span className="text-slate-600" aria-hidden="true">·</span>
                <span className="font-mono text-slate-400 tabular-nums">
                  {totalCalls} total calls
                </span>
              </div>
              <button
                type="button"
                onClick={fetchUsageLedger}
                className="inline-flex items-center gap-1 text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingUsage ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
            </div>

            {usageRecords.length === 0 ? (
              <div className="p-4 rounded-xl bg-[#0B0F19] border border-white/[0.06] text-slate-400 text-center">
                No API calls logged yet. Any API call made from this device is permanently attributed to <strong className="text-slate-200 font-mono">{userIdentity.id}</strong>.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-white/[0.08] bg-[#0B0F19]">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-white/[0.08] text-slate-400 bg-[#111827]/60">
                      <th className="px-3.5 py-2.5 font-medium">Verified Operator ID</th>
                      <th className="px-3 py-2.5 font-medium">Tier</th>
                      <th className="px-2.5 py-2.5 font-medium text-right">Chat</th>
                      <th className="px-2.5 py-2.5 font-medium text-right">Canvas</th>
                      <th className="px-2.5 py-2.5 font-medium text-right">Studio</th>
                      <th className="px-3.5 py-2.5 font-medium text-right">Used / Limit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.06] font-mono tabular-nums">
                    {usageRecords.map((rec) => {
                      const isCurrent = rec.userId === userIdentity.id;
                      return (
                        <tr key={rec.userId} className={isCurrent ? 'bg-indigo-500/[0.07]' : ''}>
                          <td className="px-3.5 py-2.5">
                            <div className="font-semibold text-white flex items-center gap-1.5">
                              <span>{rec.userId}</span>
                              {isCurrent && (
                                <span className="text-[10px] text-indigo-400">(This Device)</span>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-500">
                              {rec.fingerprintHash} · {rec.deviceLabel}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 font-sans text-slate-300">{rec.tier}</td>
                          <td className="px-2.5 py-2.5 text-right text-slate-300">{rec.chatRequests}</td>
                          <td className="px-2.5 py-2.5 text-right text-slate-300">{rec.canvasRequests}</td>
                          <td className="px-2.5 py-2.5 text-right text-slate-300">{rec.imageRequests}</td>
                          <td className="px-3.5 py-2.5 text-right font-semibold text-indigo-300">
                            {rec.quotaLimit >= 999999
                              ? `${rec.quotaUsed} / ∞`
                              : `${rec.quotaUsed} / ${rec.quotaLimit}`}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Verified Payment Receipts Ledger */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Receipt className="w-4 h-4 text-emerald-400" />
              <span className="font-display text-sm font-semibold text-white">
                Verified Payment Receipts
              </span>
            </div>

            {receipts.length === 0 ? (
              <div className="p-3.5 rounded-xl bg-[#0B0F19] border border-white/[0.06] text-slate-400 text-center">
                No paid credit transactions recorded yet. High-credit upgrades require verified in-app payment.
              </div>
            ) : (
              <div className="space-y-2">
                {receipts.map((r) => (
                  <div
                    key={r.receiptId}
                    className="p-3 rounded-xl bg-[#0B0F19] border border-white/[0.08] flex flex-wrap items-center justify-between gap-2 font-mono text-xs"
                  >
                    <div>
                      <div className="text-white font-semibold">
                        {r.receiptId} · <span className="font-sans text-indigo-300">{r.planName}</span>
                      </div>
                      <div className="text-[10px] text-slate-500">
                        Operator: {r.operatorId} · {r.paymentMethodSummary} · Sig: {r.receiptSignature}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-emerald-400 font-bold">{r.amountFormatted}</div>
                      <div className="text-[10px] text-slate-500">
                        {new Date(r.paidAt).toLocaleTimeString()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
