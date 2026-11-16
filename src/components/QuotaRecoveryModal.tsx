import React, { useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  CreditCard,
  KeyRound,
  Loader2,
  Lock,
  Receipt,
  ShieldCheck,
  Smartphone,
  Sparkles,
  X,
  Zap,
} from 'lucide-react';
import { PaymentPlanId, PaymentReceipt, UserIdentity } from '../types';

interface QuotaRecoveryModalProps {
  isOpen: boolean;
  onClose: () => void;
  userIdentity: UserIdentity;
  onIdentityUpgraded: (updatedIdentity: UserIdentity) => void;
  onSwitchToFlashLiteAndRetry: () => void;
  onRetryAfterKeyUpdate: () => void;
}

interface PaidPlanOption {
  id: PaymentPlanId;
  name: string;
  price: string;
  billingCycle: string;
  allowance: string;
  description: string;
  primary: boolean;
}

const PAID_PLANS: PaidPlanOption[] = [
  {
    id: 'starter_pack',
    name: 'Starter Credit Pack',
    price: '$2.99',
    billingCycle: 'One-Time Top-Up',
    allowance: '+100 Verified API Credits',
    description:
      'Adds 100 permanent API calls to your locked hardware Operator ID for chat, multimodal analysis, and Canvas editing.',
    primary: false,
  },
  {
    id: 'pro_studio',
    name: 'Pro Studio Pass',
    price: '$9.00',
    billingCycle: 'per month',
    allowance: '+1,000 Priority API Credits',
    description:
      'Unlocks 1,000 high-priority Gemini 4 calls with XHIGH deep reasoning, live Google Search grounding, and Studio synthesis.',
    primary: true,
  },
  {
    id: 'unlimited_enterprise',
    name: 'Unlimited Enterprise Pass',
    price: '$29.00',
    billingCycle: 'per month',
    allowance: 'Unlimited API Credits & Throughput',
    description:
      'Removes all per-operator rate caps and unlocks unrestricted multimodal chat, Canvas refinements, and Studio renders.',
    primary: false,
  },
];

type CheckoutStep = 'select_plan' | 'payment_details' | 'verify_3ds' | 'receipt';

export const QuotaRecoveryModal: React.FC<QuotaRecoveryModalProps> = ({
  isOpen,
  onClose,
  userIdentity,
  onIdentityUpgraded,
  onSwitchToFlashLiteAndRetry,
  onRetryAfterKeyUpdate,
}) => {
  const [step, setStep] = useState<CheckoutStep>('select_plan');
  const [selectedPlan, setSelectedPlan] = useState<PaidPlanOption>(PAID_PLANS[1]);
  const [paymentIntentId, setPaymentIntentId] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'upi'>('card');

  // Payment Instrument Inputs
  const [cardholderName, setCardholderName] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvc, setCardCvc] = useState('');
  const [upiId, setUpiId] = useState('');

  // 3DS OTP Challenge State
  const [paymentMethodSummary, setPaymentMethodSummary] = useState('');
  const [simulatedBankOtp, setSimulatedBankOtp] = useState('');
  const [enteredOtp, setEnteredOtp] = useState('');

  // Receipt & Status State
  const [verifiedReceipt, setVerifiedReceipt] = useState<PaymentReceipt | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const resetModalState = () => {
    setStep('select_plan');
    setPaymentIntentId('');
    setEnteredOtp('');
    setSimulatedBankOtp('');
    setErrorMsg(null);
    setIsLoading(false);
  };

  const handleClose = () => {
    resetModalState();
    onClose();
  };

  const formatCardNumberInput = (val: string) => {
    const digits = val.replace(/\D/g, '').slice(0, 16);
    return digits.replace(/(\d{4})(?=\d)/g, '$1 ');
  };

  const formatExpiryInput = (val: string) => {
    const digits = val.replace(/\D/g, '').slice(0, 4);
    if (digits.length >= 3) {
      return `${digits.slice(0, 2)}/${digits.slice(2)}`;
    }
    return digits;
  };

  // One-Time Emergency Micro-Refill (+3 calls only once per hardware Operator ID)
  const handleClaimEmergencyRefill = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/quota/emergency-refill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIdentity }),
      });
      const data = await res.json();
      if (!res.ok || !data.identity) {
        throw new Error(
          data.error || 'Emergency refill already used. Please complete payment checkout.'
        );
      }
      onIdentityUpgraded(data.identity);
      onSwitchToFlashLiteAndRetry();
      handleClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Emergency refill unavailable.');
    } finally {
      setIsLoading(false);
    }
  };

  // Step 1 -> Step 2: Create Signed Payment Intent on Server
  const handleStartCheckout = async (plan: PaidPlanOption) => {
    setIsLoading(true);
    setErrorMsg(null);
    setSelectedPlan(plan);
    try {
      const res = await fetch('/api/payment/create-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userIdentity,
          planId: plan.id,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.paymentIntentId) {
        throw new Error(data.error || 'Failed to initialize in-app payment session.');
      }
      setPaymentIntentId(data.paymentIntentId);
      setStep('payment_details');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not start checkout.');
    } finally {
      setIsLoading(false);
    }
  };

  // Step 2 -> Step 3: Validate Card/UPI & Request 3D-Secure Bank OTP
  const handleAuthorizePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/payment/authorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentIntentId,
          userIdentity,
          paymentMethod,
          cardholderName,
          cardNumber,
          cardExpiry,
          cardCvc,
          upiId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Payment authorization declined.');
      }
      setPaymentMethodSummary(data.paymentMethodSummary);
      setSimulatedBankOtp(data.simulatedBankOtp);
      setEnteredOtp('');
      setStep('verify_3ds');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Payment validation failed.');
    } finally {
      setIsLoading(false);
    }
  };

  // Step 3 -> Step 4: Verify 3D-Secure OTP & Provision Credits
  const handleVerify3dsOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/payment/verify-3ds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentIntentId,
          otpCode: enteredOtp,
          userIdentity,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.identity || !data.receipt) {
        throw new Error(data.error || '3D-Secure OTP verification failed.');
      }
      onIdentityUpgraded(data.identity);
      setVerifiedReceipt(data.receipt);
      setStep('receipt');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'OTP verification failed.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={handleClose}
    >
      <div
        className="w-full sm:max-w-2xl rounded-t-2xl sm:rounded-2xl bg-[#111827] border border-white/[0.12] overflow-hidden shadow-2xl max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.08] bg-[#0B0F19]">
          <div className="flex items-center gap-2.5">
            <Lock className="w-4 h-4 text-indigo-400 shrink-0" />
            <h2 className="font-display text-base font-semibold text-white">
              {step === 'select_plan' && 'In-App API Credit Store & Billing'}
              {step === 'payment_details' && `Secure In-App Checkout · ${selectedPlan.price}`}
              {step === 'verify_3ds' && '3D-Secure Bank OTP Authorization'}
              {step === 'receipt' && 'Verified Payment Receipt & Credit Provisioning'}
            </h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-5 text-xs text-slate-300 leading-relaxed">
          {/* Locked Operator Attribution Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 p-3.5 rounded-xl bg-[#0B0F19] border border-white/[0.08]">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-indigo-400 shrink-0" />
              <span>
                Locked Operator ID:{' '}
                <strong className="font-mono text-white">{userIdentity.id}</strong>
              </span>
              <span className="text-slate-600" aria-hidden="true">·</span>
              <span>
                Tier: <strong className="text-indigo-300">{userIdentity.tier}</strong>
              </span>
            </div>
            <span className="font-mono tabular-nums text-slate-400">
              Balance:{' '}
              {userIdentity.quotaLimit >= 999999
                ? `${userIdentity.quotaUsed} / ∞`
                : `${userIdentity.quotaUsed} / ${userIdentity.quotaLimit} calls`}
            </span>
          </div>

          {/* STEP 1: SELECT PAID PLAN */}
          {step === 'select_plan' && (
            <>
              <p className="text-slate-300">
                High-credit tiers require a verified in-app payment transaction. Select a credit pack or monthly studio pass below to complete checkout directly inside MANBOT.
              </p>

              <div className="grid grid-cols-1 gap-3.5">
                {PAID_PLANS.map((plan) => (
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
                        <span className="font-mono text-sm text-indigo-300 font-semibold">
                          {plan.price}
                        </span>
                        <span className="text-[11px] text-slate-400">
                          {plan.billingCycle}
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
                      disabled={isLoading}
                      onClick={() => handleStartCheckout(plan)}
                      className={`inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        plan.primary
                          ? 'bg-indigo-600 hover:bg-indigo-500 text-white'
                          : 'bg-white/[0.08] hover:bg-white/[0.14] text-white border border-white/[0.1]'
                      }`}
                    >
                      <CreditCard className="w-3.5 h-3.5" />
                      <span>Buy Now · {plan.price}</span>
                    </button>
                  </div>
                ))}
              </div>

              {/* Strictly One-Time Emergency Micro-Buffer (3 Calls Max, Once Per Operator ID) */}
              <div className="p-3.5 rounded-xl bg-[#0B0F19]/80 border border-white/[0.06] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5 text-slate-200 font-medium">
                    <Zap className="w-3.5 h-3.5 text-amber-400" />
                    <span>One-Time Emergency Micro-Buffer (+3 Calls)</span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    {userIdentity.emergencyRefillUsed
                      ? `Already claimed (1/1 limit reached for ${userIdentity.id}). Purchase a credit pack above to add more calls.`
                      : 'Strictly limited to 1 use per hardware Operator ID to finish an interrupted message.'}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={userIdentity.emergencyRefillUsed || isLoading}
                  onClick={handleClaimEmergencyRefill}
                  className={`px-3.5 py-2 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                    userIdentity.emergencyRefillUsed
                      ? 'bg-white/[0.03] text-slate-500 border border-white/[0.05] cursor-not-allowed'
                      : 'bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 cursor-pointer'
                  }`}
                >
                  {userIdentity.emergencyRefillUsed
                    ? 'Claimed (1/1 Used)'
                    : 'Claim +3 Emergency Calls'}
                </button>
              </div>
            </>
          )}

          {/* STEP 2: IN-APP PAYMENT INSTRUMENT FORM */}
          {step === 'payment_details' && (
            <form onSubmit={handleAuthorizePayment} className="space-y-4">
              <div className="flex items-center justify-between p-3.5 rounded-xl bg-indigo-950/20 border border-indigo-500/30">
                <div>
                  <div className="text-[11px] text-indigo-300 font-mono">
                    Intent: {paymentIntentId}
                  </div>
                  <div className="font-display text-sm font-semibold text-white">
                    {selectedPlan.name} ({selectedPlan.allowance})
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-base font-bold text-white">
                    {selectedPlan.price}
                  </div>
                  <div className="text-[10px] text-slate-400">{selectedPlan.billingCycle}</div>
                </div>
              </div>

              {/* Payment Method Selector */}
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setPaymentMethod('card');
                    setErrorMsg(null);
                  }}
                  className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border text-xs font-medium transition-colors cursor-pointer ${
                    paymentMethod === 'card'
                      ? 'bg-indigo-600/20 border-indigo-500 text-white'
                      : 'bg-[#0B0F19] border-white/[0.08] text-slate-400 hover:text-white'
                  }`}
                >
                  <CreditCard className="w-4 h-4" />
                  <span>Credit / Debit Card</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPaymentMethod('upi');
                    setErrorMsg(null);
                  }}
                  className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border text-xs font-medium transition-colors cursor-pointer ${
                    paymentMethod === 'upi'
                      ? 'bg-indigo-600/20 border-indigo-500 text-white'
                      : 'bg-[#0B0F19] border-white/[0.08] text-slate-400 hover:text-white'
                  }`}
                >
                  <Smartphone className="w-4 h-4" />
                  <span>Instant UPI VPA</span>
                </button>
              </div>

              {paymentMethod === 'card' ? (
                <div className="space-y-3 p-4 rounded-xl bg-[#0B0F19] border border-white/[0.08]">
                  <div className="space-y-1">
                    <label className="block text-[11px] font-medium text-slate-300">
                      Cardholder Name
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Manjas Anand"
                      value={cardholderName}
                      onChange={(e) => setCardholderName(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-[#111827] border border-white/[0.1] text-white text-xs focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[11px] font-medium text-slate-300">
                      Card Number (16-digit Luhn-verified)
                    </label>
                    <input
                      type="text"
                      required
                      inputMode="numeric"
                      placeholder="4532 •••• •••• ••••"
                      value={cardNumber}
                      onChange={(e) => setCardNumber(formatCardNumberInput(e.target.value))}
                      className="w-full px-3 py-2 rounded-lg bg-[#111827] border border-white/[0.1] text-white font-mono text-xs focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="block text-[11px] font-medium text-slate-300">
                        Expiry Date (MM/YY)
                      </label>
                      <input
                        type="text"
                        required
                        inputMode="numeric"
                        placeholder="08/29"
                        value={cardExpiry}
                        onChange={(e) => setCardExpiry(formatExpiryInput(e.target.value))}
                        className="w-full px-3 py-2 rounded-lg bg-[#111827] border border-white/[0.1] text-white font-mono text-xs focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-[11px] font-medium text-slate-300">
                        Security Code (CVC)
                      </label>
                      <input
                        type="password"
                        required
                        inputMode="numeric"
                        maxLength={4}
                        placeholder="•••"
                        value={cardCvc}
                        onChange={(e) =>
                          setCardCvc(e.target.value.replace(/\D/g, '').slice(0, 4))
                        }
                        className="w-full px-3 py-2 rounded-lg bg-[#111827] border border-white/[0.1] text-white font-mono text-xs focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3 p-4 rounded-xl bg-[#0B0F19] border border-white/[0.08]">
                  <div className="space-y-1">
                    <label className="block text-[11px] font-medium text-slate-300">
                      Account Holder Name
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Manjas Anand"
                      value={cardholderName}
                      onChange={(e) => setCardholderName(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-[#111827] border border-white/[0.1] text-white text-xs focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[11px] font-medium text-slate-300">
                      UPI ID / Virtual Payment Address (VPA)
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="username@okaxis"
                      value={upiId}
                      onChange={(e) => setUpiId(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-[#111827] border border-white/[0.1] text-white font-mono text-xs focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setStep('select_plan');
                    setErrorMsg(null);
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back to Plans</span>
                </button>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors cursor-pointer"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Verifying Instrument...</span>
                    </>
                  ) : (
                    <>
                      <Lock className="w-3.5 h-3.5" />
                      <span>Authorize {selectedPlan.price} Payment</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

          {/* STEP 3: 3D-SECURE BANK OTP VERIFICATION */}
          {step === 'verify_3ds' && (
            <form onSubmit={handleVerify3dsOtp} className="space-y-4">
              {/* Simulated In-App Bank SMS / 3DS Notification Banner */}
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-display text-xs font-semibold text-amber-300 flex items-center gap-1.5">
                    <KeyRound className="w-3.5 h-3.5" />
                    In-App 3D-Secure Bank Dispatch
                  </span>
                  <span className="font-mono text-[11px] text-amber-200/80">
                    {paymentMethodSummary}
                  </span>
                </div>
                <p className="text-slate-300 text-xs">
                  Enter the 6-digit one-time verification code below to confirm your{' '}
                  <strong className="text-white">{selectedPlan.price}</strong> charge for{' '}
                  <strong className="text-white">{selectedPlan.name}</strong>:
                </p>
                <div className="pt-1 flex items-center gap-2">
                  <span className="text-[11px] text-slate-400">Your 3DS Code:</span>
                  <span className="font-mono text-sm font-bold tracking-widest px-2.5 py-1 rounded bg-[#0B0F19] text-emerald-400 border border-emerald-500/30 select-all">
                    {simulatedBankOtp}
                  </span>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-[#0B0F19] border border-white/[0.08] space-y-3">
                <label className="block text-xs font-medium text-slate-200">
                  Enter 6-Digit 3D-Secure OTP Code
                </label>
                <input
                  type="text"
                  required
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="6-digit OTP code"
                  value={enteredOtp}
                  onChange={(e) =>
                    setEnteredOtp(e.target.value.replace(/\D/g, '').slice(0, 6))
                  }
                  className="w-full px-3.5 py-2.5 rounded-lg bg-[#111827] border border-white/[0.12] text-white font-mono text-base tracking-widest text-center focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setStep('payment_details');
                    setErrorMsg(null);
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Change Payment Method</span>
                </button>

                <button
                  type="submit"
                  disabled={isLoading || enteredOtp.length !== 6}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold transition-colors cursor-pointer"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Confirming Charge...</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>Confirm &amp; Pay {selectedPlan.price}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

          {/* STEP 4: VERIFIED PAYMENT RECEIPT */}
          {step === 'receipt' && verifiedReceipt && (
            <div className="space-y-4">
              <div className="flex items-center gap-2.5 p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300">
                <CheckCircle2 className="w-5 h-5 shrink-0" />
                <div>
                  <div className="font-display text-sm font-semibold text-white">
                    Payment Verified &amp; Credits Provisioned
                  </div>
                  <div className="text-[11px] text-emerald-300/90">
                    Receipt {verifiedReceipt.receiptId} signed and bound to {verifiedReceipt.operatorId}
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-[#0B0F19] border border-white/[0.08] space-y-2.5 font-mono text-xs">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="font-sans">Receipt Number</span>
                  <span className="text-white font-semibold">{verifiedReceipt.receiptId}</span>
                </div>
                <div className="flex items-center justify-between text-slate-400">
                  <span className="font-sans">Payment Intent</span>
                  <span className="text-slate-200">{verifiedReceipt.paymentIntentId}</span>
                </div>
                <div className="flex items-center justify-between text-slate-400">
                  <span className="font-sans">Plan Purchased</span>
                  <span className="text-indigo-300 font-sans font-medium">
                    {verifiedReceipt.planName}
                  </span>
                </div>
                <div className="flex items-center justify-between text-slate-400">
                  <span className="font-sans">Amount Paid</span>
                  <span className="text-emerald-400 font-bold">
                    {verifiedReceipt.amountFormatted}
                  </span>
                </div>
                <div className="flex items-center justify-between text-slate-400">
                  <span className="font-sans">Payment Method</span>
                  <span className="text-slate-200">{verifiedReceipt.paymentMethodSummary}</span>
                </div>
                <div className="flex items-center justify-between text-slate-400">
                  <span className="font-sans">Cryptographic Receipt Sig</span>
                  <span className="text-slate-400">{verifiedReceipt.receiptSignature}</span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  onRetryAfterKeyUpdate();
                  handleClose();
                }}
                className="w-full inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors cursor-pointer"
              >
                <Sparkles className="w-4 h-4" />
                <span>Resume Workspace with New Credits</span>
              </button>
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
