import React, { useEffect, useState } from 'react';
import { Activity, Check, Fingerprint, RefreshCw, UserCheck, X } from 'lucide-react';
import { ApiUsageRecord, UserIdentity } from '../types';

interface UserIdentityModalProps {
  isOpen: boolean;
  onClose: () => void;
  userIdentity: UserIdentity;
  onUpdateIdentity: (updated: UserIdentity) => void;
}

export const UserIdentityModal: React.FC<UserIdentityModalProps> = ({
  isOpen,
  onClose,
  userIdentity,
  onUpdateIdentity,
}) => {
  const [nameInput, setNameInput] = useState(userIdentity.name);
  const [idInput, setIdInput] = useState(userIdentity.id);
  const [usageRecords, setUsageRecords] = useState<ApiUsageRecord[]>([]);
  const [totalCalls, setTotalCalls] = useState(0);
  const [loadingUsage, setLoadingUsage] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);

  const fetchUsageLedger = async () => {
    setLoadingUsage(true);
    try {
      const res = await fetch('/api/usage');
      if (res.ok) {
        const data = await res.json();
        setUsageRecords(data.operators || []);
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
      setNameInput(userIdentity.name);
      setIdInput(userIdentity.id);
      fetchUsageLedger();
    }
  }, [isOpen, userIdentity.id, userIdentity.name]);

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanedName = nameInput.trim() || 'Operator';
    const cleanedId =
      idInput.trim().toUpperCase().replace(/[^A-Z0-9-_]/g, '') ||
      userIdentity.id;

    onUpdateIdentity({
      ...userIdentity,
      name: cleanedName,
      id: cleanedId,
    });
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 1800);
  };

  const handleGenerateNewId = () => {
    const randomCode = Math.random().toString(36).substring(2, 6).toUpperCase();
    setIdInput(`USR-${randomCode}`);
  };

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
              User Identifier &amp; API Attribution Ledger
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
          {/* Active Operator Identity Form */}
          <form onSubmit={handleSave} className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="font-display text-sm font-semibold text-white">
                Active Operator Identity
              </span>
              <span className="font-mono text-[11px] text-slate-400">
                Device: {userIdentity.deviceLabel}
              </span>
            </div>

            <p className="text-slate-400 leading-relaxed">
              Every chat stream, Canvas refinement, and Image Studio synthesis is tagged with your User Identifier so you can track who is consuming API quota across sessions and devices.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label htmlFor="operator-name" className="block text-slate-300 font-medium">
                  Display Name / Handle
                </label>
                <input
                  id="operator-name"
                  type="text"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  placeholder="e.g., Manjas Anand"
                  className="w-full rounded-lg bg-[#0B0F19] border border-white/[0.1] focus:border-indigo-500 px-3 py-2 text-xs text-white focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="operator-id" className="block text-slate-300 font-medium">
                    Unique User ID Tag
                  </label>
                  <button
                    type="button"
                    onClick={handleGenerateNewId}
                    className="text-[11px] text-indigo-400 hover:text-indigo-300 cursor-pointer"
                  >
                    Cycle ID
                  </button>
                </div>
                <input
                  id="operator-id"
                  type="text"
                  value={idInput}
                  onChange={(e) => setIdInput(e.target.value)}
                  placeholder="USR-XXXX"
                  className="w-full rounded-lg bg-[#0B0F19] border border-white/[0.1] focus:border-indigo-500 px-3 py-2 text-xs font-mono text-indigo-200 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-1">
              {savedNotice && (
                <span className="inline-flex items-center gap-1 text-emerald-400">
                  <Check className="w-3.5 h-3.5" />
                  Identifier saved
                </span>
              )}
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-medium text-white transition-colors cursor-pointer"
              >
                <UserCheck className="w-3.5 h-3.5" />
                <span>Update Active Identifier</span>
              </button>
            </div>
          </form>

          {/* Live API Attribution Ledger */}
          <div className="pt-4 border-t border-white/[0.08] space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-sky-400" />
                <span className="font-display text-sm font-semibold text-white">
                  Live API Usage Attribution
                </span>
                <span className="text-slate-600" aria-hidden="true">·</span>
                <span className="font-mono text-slate-400 tabular-nums">
                  {totalCalls} total API calls
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
                No API calls recorded in this server session yet. Send a message or generate an image to log attribution under <strong className="text-slate-200 font-mono">{userIdentity.id}</strong>.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-white/[0.08] bg-[#0B0F19]">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-white/[0.08] text-slate-400 bg-[#111827]/60">
                      <th className="px-3.5 py-2.5 font-medium">Operator / ID</th>
                      <th className="px-3 py-2.5 font-medium text-right">Chat</th>
                      <th className="px-3 py-2.5 font-medium text-right">Canvas</th>
                      <th className="px-3 py-2.5 font-medium text-right">Studio</th>
                      <th className="px-3.5 py-2.5 font-medium text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.06] font-mono tabular-nums">
                    {usageRecords.map((rec) => {
                      const isCurrent = rec.userId === userIdentity.id;
                      return (
                        <tr key={rec.userId} className={isCurrent ? 'bg-indigo-500/[0.07]' : ''}>
                          <td className="px-3.5 py-2.5 font-sans">
                            <div className="font-medium text-white flex items-center gap-1.5">
                              <span>{rec.userName}</span>
                              {isCurrent && (
                                <span className="text-[10px] font-mono text-indigo-400">(You)</span>
                              )}
                            </div>
                            <div className="text-[11px] font-mono text-slate-400">
                              {rec.userId} · {rec.deviceLabel}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-right text-slate-300">{rec.chatRequests}</td>
                          <td className="px-3 py-2.5 text-right text-slate-300">{rec.canvasRequests}</td>
                          <td className="px-3 py-2.5 text-right text-slate-300">{rec.imageRequests}</td>
                          <td className="px-3.5 py-2.5 text-right font-semibold text-indigo-300">
                            {rec.totalRequests}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
