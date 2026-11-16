import 'dotenv/config';
import crypto from 'crypto';
import express, { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel, GenerateContentResponse } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const IDENTITY_HMAC_SECRET =
  process.env.GEMINI_API_KEY || crypto.randomBytes(32).toString('hex');

function getGenAIClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is missing. Please check the Settings > Secrets panel in AI Studio to ensure your API key is attached.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function isQuotaExhaustedError(err: unknown): boolean {
  const raw = err instanceof Error ? err.message : String(err);
  return (
    raw.includes('429') ||
    raw.includes('RESOURCE_EXHAUSTED') ||
    raw.toLowerCase().includes('quota') ||
    raw.toLowerCase().includes('rate limit')
  );
}

function formatApiError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (raw.includes('403') || raw.includes('PERMISSION_DENIED') || raw.includes('API_KEY_INVALID') || raw.includes('400')) {
    if (raw.includes('API_KEY') || raw.includes('PERMISSION_DENIED')) {
      return 'Authentication error with Gemini API. Please check or select your API key in the Settings > Secrets panel.';
    }
  }
  if (isQuotaExhaustedError(err)) {
    return 'Operator API quota limit reached (429 RESOURCE_EXHAUSTED). Activate an instant Free Burst Refill or upgrade your In-App Studio Pass directly inside MANBOT to continue immediately.';
  }
  return raw || 'An unexpected error occurred while communicating with MANBOT.';
}

function resolveThinkingLevel(
  level: string | undefined,
  model: string
): ThinkingLevel {
  if (level === 'LOW') {
    return ThinkingLevel.LOW;
  }
  if (level === 'XHIGH') {
    // ThinkingLevel.XHIGH is only supported on gemini-4-hydrogen
    if (model === 'gemini-4-hydrogen') {
      return ThinkingLevel.XHIGH;
    }
    return ThinkingLevel.HIGH;
  }
  return ThinkingLevel.HIGH;
}

interface IncomingAttachment {
  name: string;
  mimeType: string;
  base64Data: string;
}

interface IncomingMessage {
  role: 'user' | 'model';
  text: string;
  attachments?: IncomingAttachment[];
}

type OperatorTier =
  | 'Starter Free'
  | 'Starter Pack'
  | 'Pro Studio'
  | 'Unlimited Enterprise';

type PaymentPlanId = 'starter_pack' | 'pro_studio' | 'unlimited_enterprise';

interface PlanCatalogItem {
  id: PaymentPlanId;
  name: string;
  tier: OperatorTier;
  amountCents: number;
  amountFormatted: string;
  creditsGranted: number;
}

const PAID_PLAN_CATALOG: Record<PaymentPlanId, PlanCatalogItem> = {
  starter_pack: {
    id: 'starter_pack',
    name: 'Starter Credit Pack (+100 Calls)',
    tier: 'Starter Pack',
    amountCents: 299,
    amountFormatted: '$2.99',
    creditsGranted: 100,
  },
  pro_studio: {
    id: 'pro_studio',
    name: 'Pro Studio Pass (+1,000 Priority Calls)',
    tier: 'Pro Studio',
    amountCents: 900,
    amountFormatted: '$9.00',
    creditsGranted: 1000,
  },
  unlimited_enterprise: {
    id: 'unlimited_enterprise',
    name: 'Unlimited Enterprise Pass',
    tier: 'Unlimited Enterprise',
    amountCents: 2900,
    amountFormatted: '$29.00',
    creditsGranted: 999999,
  },
};

interface OperatorUsageRecord {
  userId: string;
  fingerprintHash: string;
  deviceLabel: string;
  tier: OperatorTier;
  quotaUsed: number;
  quotaLimit: number;
  emergencyRefillUsed: boolean;
  totalRequests: number;
  chatRequests: number;
  canvasRequests: number;
  imageRequests: number;
  totalPaidCents: number;
  lastModel: string;
  lastActiveAt: string;
  issuedAt: string;
}

interface PaymentIntentRecord {
  paymentIntentId: string;
  operatorId: string;
  planId: PaymentPlanId;
  amountCents: number;
  amountFormatted: string;
  creditsGranted: number;
  status: 'requires_payment_method' | 'requires_3ds_verification' | 'succeeded' | 'failed';
  paymentMethodSummary?: string;
  otpCode?: string;
  otpAttempts: number;
  createdAt: string;
  expiresAt: number;
}

interface PaymentReceiptRecord {
  receiptId: string;
  paymentIntentId: string;
  operatorId: string;
  planId: PaymentPlanId;
  planName: string;
  amountFormatted: string;
  amountCents: number;
  paymentMethodSummary: string;
  creditsGranted: number;
  paidAt: string;
  receiptSignature: string;
}

const operatorUsageLedger = new Map<string, OperatorUsageRecord>();
const paymentIntentsStore = new Map<string, PaymentIntentRecord>();
const paymentReceiptsLedger: PaymentReceiptRecord[] = [];

function computeOperatorSignature(userId: string, fingerprintHash: string): string {
  return crypto
    .createHmac('sha256', IDENTITY_HMAC_SECRET)
    .update(`${userId}:${fingerprintHash}`)
    .digest('hex')
    .slice(0, 24);
}

function validateLuhnCardNumber(rawDigits: string): boolean {
  const digits = rawDigits.replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 19) return false;
  if (/^(\d)\1+$/.test(digits)) return false;

  let sum = 0;
  let shouldDouble = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = parseInt(digits.charAt(i), 10);
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}

function validateCardExpiry(expiry: string): boolean {
  const match = expiry.trim().match(/^(0[1-9]|1[0-2])\s*\/\s*(\d{2}|\d{4})$/);
  if (!match) return false;
  const month = parseInt(match[1], 10);
  let year = parseInt(match[2], 10);
  if (year < 100) year += 2000;

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  if (year < currentYear || year > currentYear + 20) return false;
  if (year === currentYear && month < currentMonth) return false;
  return true;
}

function deriveImmutableIdentity(req: Request, clientSeed?: string, deviceLabel?: string) {
  const ua = req.headers['user-agent'] || 'manbot-runtime';
  const lang = req.headers['accept-language'] || 'en';
  const rawMaterial = `${ua}|${lang}|${clientSeed || 'default-seed'}`;

  const fullHash = crypto.createHash('sha256').update(rawMaterial).digest('hex').toUpperCase();
  const userId = `OP-${fullHash.slice(0, 8)}`;
  const fingerprintHash = `SHA256:${fullHash.slice(8, 24)}`;
  const signature = computeOperatorSignature(userId, fingerprintHash);
  const cleanDevice = (deviceLabel || 'Desktop Studio').trim();

  let record = operatorUsageLedger.get(userId);
  if (!record) {
    record = {
      userId,
      fingerprintHash,
      deviceLabel: cleanDevice,
      tier: 'Starter Free',
      quotaUsed: 0,
      quotaLimit: 10,
      emergencyRefillUsed: false,
      totalRequests: 0,
      chatRequests: 0,
      canvasRequests: 0,
      imageRequests: 0,
      totalPaidCents: 0,
      lastModel: 'gemini-4-hydrogen',
      lastActiveAt: new Date().toISOString(),
      issuedAt: new Date().toISOString(),
    };
    operatorUsageLedger.set(userId, record);
  } else {
    record.deviceLabel = cleanDevice;
  }

  return {
    id: record.userId,
    fingerprintHash: record.fingerprintHash,
    signature,
    deviceLabel: record.deviceLabel,
    tier: record.tier,
    quotaUsed: record.quotaUsed,
    quotaLimit: record.quotaLimit,
    emergencyRefillUsed: record.emergencyRefillUsed,
    issuedAt: record.issuedAt,
  };
}

function resolveVerifiedOperatorRecord(
  req: Request,
  userIdentity?: {
    id?: string;
    fingerprintHash?: string;
    signature?: string;
    deviceLabel?: string;
  } | null
): OperatorUsageRecord {
  if (
    userIdentity?.id &&
    userIdentity?.fingerprintHash &&
    userIdentity?.signature &&
    computeOperatorSignature(userIdentity.id, userIdentity.fingerprintHash) ===
      userIdentity.signature
  ) {
    const existing = operatorUsageLedger.get(userIdentity.id);
    if (existing) {
      return existing;
    }
  }
  const derived = deriveImmutableIdentity(req, undefined, userIdentity?.deviceLabel);
  return operatorUsageLedger.get(derived.id)!;
}

function formatIdentityResponse(record: OperatorUsageRecord) {
  return {
    id: record.userId,
    fingerprintHash: record.fingerprintHash,
    signature: computeOperatorSignature(record.userId, record.fingerprintHash),
    deviceLabel: record.deviceLabel,
    tier: record.tier,
    quotaUsed: record.quotaUsed,
    quotaLimit: record.quotaLimit,
    emergencyRefillUsed: record.emergencyRefillUsed,
    issuedAt: record.issuedAt,
  };
}

function verifyAndRecordOperatorApiCall(
  req: Request,
  params: {
    userIdentity?: {
      id?: string;
      fingerprintHash?: string;
      signature?: string;
      deviceLabel?: string;
    } | null;
    kind: 'chat' | 'canvas' | 'image';
    model: string;
  }
): OperatorUsageRecord {
  const existing = resolveVerifiedOperatorRecord(req, params.userIdentity);
  const device = (params.userIdentity?.deviceLabel || existing.deviceLabel || 'Desktop Studio').trim();

  if (existing.quotaUsed >= existing.quotaLimit) {
    throw new Error(
      `Operator ${existing.userId} has reached the ${existing.tier} credit limit (${existing.quotaUsed}/${existing.quotaLimit} calls). Complete an in-app credit purchase to continue (429 RESOURCE_EXHAUSTED).`
    );
  }

  existing.deviceLabel = device;
  existing.quotaUsed += 1;
  existing.totalRequests += 1;
  if (params.kind === 'chat') existing.chatRequests += 1;
  if (params.kind === 'canvas') existing.canvasRequests += 1;
  if (params.kind === 'image') existing.imageRequests += 1;
  existing.lastModel = params.model;
  existing.lastActiveAt = new Date().toISOString();

  operatorUsageLedger.set(existing.userId, existing);
  return existing;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '35mb' }));

  // Health & Connection Verification endpoint
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      assistant: 'MANBOT',
      hasApiKey: Boolean(process.env.GEMINI_API_KEY),
      timestamp: new Date().toISOString(),
    });
  });

  // Issue or Verify Immutable Cryptographic Operator Identity
  app.post('/api/identity/session', (req: Request, res: Response) => {
    const { clientSeed, deviceLabel } = req.body as {
      clientSeed?: string;
      deviceLabel?: string;
    };
    const identity = deriveImmutableIdentity(req, clientSeed, deviceLabel);
    res.json({ identity });
  });

  // Strictly One-Time Emergency Micro-Refill (+3 calls max, once per hardware Operator ID)
  app.post('/api/quota/emergency-refill', (req: Request, res: Response) => {
    const { userIdentity } = req.body as {
      userIdentity?: {
        id?: string;
        fingerprintHash?: string;
        signature?: string;
        deviceLabel?: string;
      };
    };

    const record = resolveVerifiedOperatorRecord(req, userIdentity);
    if (record.emergencyRefillUsed) {
      res.status(402).json({
        error: `One-time emergency refill (1/1) has already been claimed for Operator ${record.userId}. Please complete an in-app payment to unlock additional API credits.`,
      });
      return;
    }

    record.emergencyRefillUsed = true;
    record.quotaLimit += 3;
    record.lastActiveAt = new Date().toISOString();
    operatorUsageLedger.set(record.userId, record);

    res.json({
      status: 'emergency_refill_granted',
      identity: formatIdentityResponse(record),
    });
  });

  // Block any unverified direct upgrade attempts without payment
  app.post('/api/quota/upgrade', (_req: Request, res: Response) => {
    res.status(402).json({
      error:
        'Payment Required: High-credit tiers cannot be activated without completing an in-app payment and 3D-Secure verification.',
    });
  });

  // Step 1 of In-App Payment: Create Signed Payment Intent
  app.post('/api/payment/create-intent', (req: Request, res: Response) => {
    const { userIdentity, planId } = req.body as {
      userIdentity?: {
        id?: string;
        fingerprintHash?: string;
        signature?: string;
        deviceLabel?: string;
      };
      planId: PaymentPlanId;
    };

    const plan = PAID_PLAN_CATALOG[planId];
    if (!plan) {
      res.status(400).json({ error: 'Invalid credit plan selected.' });
      return;
    }

    const operator = resolveVerifiedOperatorRecord(req, userIdentity);
    const paymentIntentId = `PI-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;

    const intent: PaymentIntentRecord = {
      paymentIntentId,
      operatorId: operator.userId,
      planId: plan.id,
      amountCents: plan.amountCents,
      amountFormatted: plan.amountFormatted,
      creditsGranted: plan.creditsGranted,
      status: 'requires_payment_method',
      otpAttempts: 0,
      createdAt: new Date().toISOString(),
      expiresAt: Date.now() + 10 * 60 * 1000,
    };

    paymentIntentsStore.set(paymentIntentId, intent);

    res.json({
      paymentIntentId: intent.paymentIntentId,
      operatorId: intent.operatorId,
      planId: intent.planId,
      planName: plan.name,
      amountFormatted: intent.amountFormatted,
      amountCents: intent.amountCents,
      creditsGranted: intent.creditsGranted,
      status: intent.status,
    });
  });

  // Step 2 of In-App Payment: Validate Payment Instrument & Issue 3D-Secure OTP Challenge
  app.post('/api/payment/authorize', (req: Request, res: Response) => {
    const {
      paymentIntentId,
      userIdentity,
      paymentMethod,
      cardholderName,
      cardNumber,
      cardExpiry,
      cardCvc,
      upiId,
    } = req.body as {
      paymentIntentId: string;
      userIdentity?: {
        id?: string;
        fingerprintHash?: string;
        signature?: string;
        deviceLabel?: string;
      };
      paymentMethod: 'card' | 'upi';
      cardholderName?: string;
      cardNumber?: string;
      cardExpiry?: string;
      cardCvc?: string;
      upiId?: string;
    };

    const operator = resolveVerifiedOperatorRecord(req, userIdentity);
    const intent = paymentIntentsStore.get(paymentIntentId);

    if (!intent || intent.operatorId !== operator.userId) {
      res.status(404).json({ error: 'Payment session not found or operator mismatch.' });
      return;
    }
    if (Date.now() > intent.expiresAt) {
      res.status(400).json({ error: 'Payment session expired. Please start checkout again.' });
      return;
    }
    if (intent.status === 'succeeded') {
      res.status(400).json({ error: 'This payment intent has already been processed.' });
      return;
    }

    let methodSummary = '';

    if (paymentMethod === 'card') {
      const cleanName = (cardholderName || '').trim();
      const digits = (cardNumber || '').replace(/\D/g, '');
      const cleanExpiry = (cardExpiry || '').trim();
      const cleanCvc = (cardCvc || '').replace(/\D/g, '');

      if (cleanName.length < 3) {
        res.status(400).json({ error: 'Please enter the full cardholder name.' });
        return;
      }
      if (!validateLuhnCardNumber(digits)) {
        res.status(400).json({
          error: 'Invalid card number (failed Luhn bank checksum verification). Please enter a valid 16-digit card.',
        });
        return;
      }
      if (!validateCardExpiry(cleanExpiry)) {
        res.status(400).json({
          error: 'Card expiry date must be in MM/YY format and not in the past.',
        });
        return;
      }
      if (cleanCvc.length < 3 || cleanCvc.length > 4) {
        res.status(400).json({ error: 'Invalid security code (CVC must be 3 or 4 digits).' });
        return;
      }

      const brand = digits.startsWith('4')
        ? 'Visa'
        : digits.startsWith('5')
        ? 'Mastercard'
        : 'Card';
      methodSummary = `${brand} •••• ${digits.slice(-4)}`;
    } else if (paymentMethod === 'upi') {
      const cleanUpi = (upiId || '').trim();
      const cleanHolder = (cardholderName || '').trim();
      if (cleanHolder.length < 3) {
        res.status(400).json({ error: 'Please enter the account holder name.' });
        return;
      }
      if (!/^[a-zA-Z0-9._-]{2,}@[a-zA-Z0-9]{2,}$/.test(cleanUpi)) {
        res.status(400).json({
          error: 'Please enter a valid UPI Virtual Payment Address (e.g., name@okaxis or user@icici).',
        });
        return;
      }
      methodSummary = `UPI (${cleanUpi})`;
    } else {
      res.status(400).json({ error: 'Unsupported payment method.' });
      return;
    }

    // Generate cryptographic 6-digit 3D-Secure OTP
    const otpNumeric = crypto.randomInt(100000, 999999).toString();
    intent.paymentMethodSummary = methodSummary;
    intent.otpCode = otpNumeric;
    intent.otpAttempts = 0;
    intent.status = 'requires_3ds_verification';
    paymentIntentsStore.set(intent.paymentIntentId, intent);

    res.json({
      paymentIntentId: intent.paymentIntentId,
      status: intent.status,
      paymentMethodSummary: methodSummary,
      amountFormatted: intent.amountFormatted,
      bankDispatchNotice: `3D-Secure Bank OTP for ${intent.amountFormatted} on ${methodSummary}`,
      simulatedBankOtp: otpNumeric,
    });
  });

  // Step 3 of In-App Payment: Verify 3D-Secure OTP, Issue Receipt & Provision Credits
  app.post('/api/payment/verify-3ds', (req: Request, res: Response) => {
    const { paymentIntentId, otpCode, userIdentity } = req.body as {
      paymentIntentId: string;
      otpCode: string;
      userIdentity?: {
        id?: string;
        fingerprintHash?: string;
        signature?: string;
        deviceLabel?: string;
      };
    };

    const operator = resolveVerifiedOperatorRecord(req, userIdentity);
    const intent = paymentIntentsStore.get(paymentIntentId);

    if (!intent || intent.operatorId !== operator.userId) {
      res.status(404).json({ error: 'Payment intent not found for this Operator ID.' });
      return;
    }
    if (intent.status !== 'requires_3ds_verification' || !intent.otpCode) {
      res.status(400).json({
        error: 'Payment intent is not awaiting 3D-Secure verification.',
      });
      return;
    }
    if (Date.now() > intent.expiresAt) {
      intent.status = 'failed';
      res.status(400).json({ error: '3D-Secure OTP has expired. Please restart checkout.' });
      return;
    }

    intent.otpAttempts += 1;
    if (intent.otpAttempts > 3) {
      intent.status = 'failed';
      res.status(403).json({
        error: 'Maximum 3D-Secure verification attempts exceeded. Transaction declined.',
      });
      return;
    }

    if ((otpCode || '').trim() !== intent.otpCode) {
      res.status(401).json({
        error: `Invalid 3D-Secure OTP code (${3 - intent.otpAttempts} attempt(s) remaining).`,
      });
      return;
    }

    // Payment Verified! Mark succeeded, issue receipt, and credit operator account
    intent.status = 'succeeded';
    paymentIntentsStore.set(intent.paymentIntentId, intent);

    const plan = PAID_PLAN_CATALOG[intent.planId];
    operator.tier = plan.tier;
    if (plan.id === 'unlimited_enterprise') {
      operator.quotaLimit = 999999;
    } else {
      operator.quotaLimit += plan.creditsGranted;
    }
    operator.totalPaidCents += plan.amountCents;
    operator.lastActiveAt = new Date().toISOString();
    operatorUsageLedger.set(operator.userId, operator);

    const receiptId = `RCPT-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    const paidAt = new Date().toISOString();
    const receiptSignature = crypto
      .createHmac('sha256', IDENTITY_HMAC_SECRET)
      .update(`${receiptId}:${intent.paymentIntentId}:${operator.userId}:${plan.amountCents}`)
      .digest('hex')
      .slice(0, 20);

    const receipt: PaymentReceiptRecord = {
      receiptId,
      paymentIntentId: intent.paymentIntentId,
      operatorId: operator.userId,
      planId: plan.id,
      planName: plan.name,
      amountFormatted: plan.amountFormatted,
      amountCents: plan.amountCents,
      paymentMethodSummary: intent.paymentMethodSummary || 'Verified Card',
      creditsGranted: plan.creditsGranted,
      paidAt,
      receiptSignature,
    };
    paymentReceiptsLedger.unshift(receipt);

    res.json({
      status: 'payment_succeeded',
      identity: formatIdentityResponse(operator),
      receipt,
    });
  });

  // Operator API Usage & Payment Attribution Ledger endpoint
  app.get('/api/usage', (_req: Request, res: Response) => {
    const operators = Array.from(operatorUsageLedger.values()).sort(
      (a, b) => new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime()
    );
    const totalApiCalls = operators.reduce((sum, item) => sum + item.totalRequests, 0);
    res.json({
      operators,
      totalApiCalls,
      receipts: paymentReceiptsLedger.slice(0, 25),
    });
  });

  // 1. Streaming Chat + Multimodal Analysis + Google Search Grounding (with Seamless Quota Fallback)
  app.post('/api/chat/stream', async (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');

    const sendEvent = (payload: Record<string, unknown>) => {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    try {
      const ai = getGenAIClient();
      const {
        messages = [],
        model = 'gemini-4-hydrogen',
        thinkingLevel = 'HIGH',
        useGoogleSearch = false,
        systemInstruction = '',
        activeCanvasContext = null,
        userIdentity = null,
      } = req.body as {
        messages: IncomingMessage[];
        model?: string;
        thinkingLevel?: string;
        useGoogleSearch?: boolean;
        systemInstruction?: string;
        activeCanvasContext?: { title: string; language: string; content: string } | null;
        userIdentity?: {
          id?: string;
          fingerprintHash?: string;
          signature?: string;
          deviceLabel?: string;
        } | null;
      };

      const validModel =
        model === 'gemini-3.1-flash-lite' ? 'gemini-3.1-flash-lite' : 'gemini-4-hydrogen';

      const updatedOperator = verifyAndRecordOperatorApiCall(req, {
        userIdentity,
        kind: 'chat',
        model: validModel,
      });

      sendEvent({
        type: 'quota_sync',
        quotaUsed: updatedOperator.quotaUsed,
        quotaLimit: updatedOperator.quotaLimit,
        tier: updatedOperator.tier,
      });

      const contents = messages.map((msg) => {
        const parts: Array<
          | { text: string }
          | { inlineData: { mimeType: string; data: string } }
        > = [];

        if (Array.isArray(msg.attachments)) {
          for (const att of msg.attachments) {
            if (att.base64Data && att.mimeType) {
              parts.push({
                inlineData: {
                  mimeType: att.mimeType,
                  data: att.base64Data,
                },
              });
            }
          }
        }

        if (msg.text && msg.text.trim().length > 0) {
          parts.push({ text: msg.text });
        } else if (parts.length === 0) {
          parts.push({ text: 'Please analyze the attached file.' });
        }

        return {
          role: msg.role === 'model' ? 'model' : 'user',
          parts,
        };
      });

      const basePersona =
        'You are MANBOT, a sharp, deeply capable multimodal AI assistant and engineering studio powered by Google Gemini. ' +
        'Provide clear, well-structured answers using clean Markdown. When writing code or full documents, wrap them in fenced code blocks with an explicit language tag (e.g. ```typescript, ```html, ```python, ```markdown) so the user can open and edit them directly in the side-by-side Canvas.';

      const canvasAddendum = activeCanvasContext
        ? `\n\nThe user currently has a side-by-side Canvas open titled "${activeCanvasContext.title}" (${activeCanvasContext.language}):\n\`\`\`${activeCanvasContext.language}\n${activeCanvasContext.content}\n\`\`\`\nIf the user asks to revise or update the Canvas content, provide the updated version inside a fenced code block.`
        : '';

      const fullSystemInstruction = [
        basePersona,
        systemInstruction ? `User Custom Instructions: ${systemInstruction}` : '',
        canvasAddendum,
      ]
        .filter(Boolean)
        .join('\n\n');

      const buildConfig = (targetModel: string) => {
        const cfg: Record<string, unknown> = {
          systemInstruction: fullSystemInstruction,
        };
        if (targetModel === 'gemini-4-hydrogen') {
          cfg.thinkingConfig = {
            thinkingLevel: resolveThinkingLevel(thinkingLevel, targetModel),
          };
        }
        if (useGoogleSearch) {
          cfg.tools = [{ googleSearch: {} }];
        }
        return cfg;
      };

      let streamResponse;
      try {
        streamResponse = await ai.models.generateContentStream({
          model: validModel,
          contents,
          config: buildConfig(validModel),
        });
      } catch (primaryErr) {
        if (isQuotaExhaustedError(primaryErr) && validModel !== 'gemini-3.1-flash-lite') {
          sendEvent({
            type: 'fallback_notice',
            text: 'Primary model quota reached — seamlessly switched to high-throughput gemini-3.1-flash-lite.',
          });
          streamResponse = await ai.models.generateContentStream({
            model: 'gemini-3.1-flash-lite',
            contents,
            config: buildConfig('gemini-3.1-flash-lite'),
          });
        } else {
          throw primaryErr;
        }
      }

      const collectedSources = new Map<string, { title: string; uri: string }>();
      const collectedQueries = new Set<string>();

      for await (const chunk of streamResponse) {
        const c = chunk as GenerateContentResponse;
        const chunkText = c.text;
        if (chunkText) {
          sendEvent({ type: 'chunk', text: chunkText });
        }

        const groundingMeta = c.candidates?.[0]?.groundingMetadata;
        if (groundingMeta?.groundingChunks) {
          for (const gChunk of groundingMeta.groundingChunks) {
            if (gChunk.web?.uri) {
              collectedSources.set(gChunk.web.uri, {
                uri: gChunk.web.uri,
                title: gChunk.web.title || new URL(gChunk.web.uri).hostname,
              });
            }
          }
        }
        if (groundingMeta?.webSearchQueries) {
          for (const q of groundingMeta.webSearchQueries) {
            if (q) collectedQueries.add(q);
          }
        }
      }

      if (collectedSources.size > 0 || collectedQueries.size > 0) {
        sendEvent({
          type: 'grounding',
          sources: Array.from(collectedSources.values()),
          queries: Array.from(collectedQueries),
        });
      }

      sendEvent({ type: 'done' });
      res.end();
    } catch (error) {
      sendEvent({
        type: 'error',
        isQuotaError: isQuotaExhaustedError(error),
        message: formatApiError(error),
      });
      res.end();
    }
  });

  // 2. Side-by-Side Canvas AI Refinement Endpoint
  app.post('/api/canvas/refine', async (req: Request, res: Response) => {
    try {
      const ai = getGenAIClient();
      const {
        title = 'Untitled Canvas',
        language = 'markdown',
        content = '',
        instruction = 'Improve clarity and structure',
        userIdentity = null,
      } = req.body as {
        title?: string;
        language?: string;
        content: string;
        instruction: string;
        userIdentity?: {
          id?: string;
          fingerprintHash?: string;
          signature?: string;
          deviceLabel?: string;
        } | null;
      };

      verifyAndRecordOperatorApiCall(req, {
        userIdentity,
        kind: 'canvas',
        model: 'gemini-4-hydrogen',
      });

      const prompt = `You are MANBOT's side-by-side Canvas editor engine.
Artifact Title: ${title}
Language / Format: ${language}
User Transformation Request: "${instruction}"

Current Content:
\`\`\`${language}
${content}
\`\`\`

Return ONLY the transformed ${language} content without surrounding conversational commentary or outer markdown fences (unless the language itself is markdown and uses internal code blocks).`;

      let response;
      try {
        response = await ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: prompt,
          config: {
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          },
        });
      } catch (primaryErr) {
        if (isQuotaExhaustedError(primaryErr)) {
          response = await ai.models.generateContent({
            model: 'gemini-3.1-flash-lite',
            contents: prompt,
          });
        } else {
          throw primaryErr;
        }
      }

      let updatedContent = (response.text ?? '').trim();
      // Strip outer code fence if model wrapped it
      const fenceRegex = new RegExp(`^\`\`\`(?:${language}|[a-zA-Z0-9_-]*)?\\n([\\s\\S]*?)\\n\`\`\`$`);
      const match = updatedContent.match(fenceRegex);
      if (match && match[1]) {
        updatedContent = match[1];
      }

      res.json({
        updatedContent: updatedContent || content,
      });
    } catch (error) {
      res.status(500).json({
        isQuotaError: isQuotaExhaustedError(error),
        error: formatApiError(error),
      });
    }
  });

  // 3. AI Image Generation & Editing Studio Endpoint (with Free-Tier Vector Artwork Fallback)
  app.post('/api/image/generate', async (req: Request, res: Response) => {
    try {
      const ai = getGenAIClient();
      const {
        prompt,
        aspectRatio = '1:1',
        referenceImage = null,
        userIdentity = null,
      } = req.body as {
        prompt: string;
        aspectRatio?: '1:1' | '16:9' | '4:3' | '3:4' | '9:16';
        referenceImage?: { mimeType: string; base64Data: string } | null;
        userIdentity?: {
          id?: string;
          fingerprintHash?: string;
          signature?: string;
          deviceLabel?: string;
        } | null;
      };

      verifyAndRecordOperatorApiCall(req, {
        userIdentity,
        kind: 'image',
        model: 'gemini-3.1-flash-lite-image',
      });

      if (!prompt || !prompt.trim()) {
        res.status(400).json({ error: 'Please provide an image description prompt.' });
        return;
      }

      const parts: Array<
        | { text: string }
        | { inlineData: { mimeType: string; data: string } }
      > = [];

      if (referenceImage?.base64Data && referenceImage?.mimeType) {
        parts.push({
          inlineData: {
            mimeType: referenceImage.mimeType,
            data: referenceImage.base64Data,
          },
        });
      }

      parts.push({ text: prompt.trim() });

      try {
        const response = await ai.models.generateContent({
          model: 'gemini-3.1-flash-lite-image',
          contents: { parts },
          config: {
            imageConfig: {
              aspectRatio,
            },
          },
        });

        let imageUrl = '';
        let caption = '';

        for (const part of response.candidates?.[0]?.content?.parts ?? []) {
          if (part.inlineData?.data) {
            const mime = part.inlineData.mimeType ?? 'image/png';
            imageUrl = `data:${mime};base64,${part.inlineData.data}`;
          } else if (part.text) {
            caption += part.text;
          }
        }

        if (imageUrl) {
          res.json({
            imageUrl,
            caption: caption.trim(),
          });
          return;
        }
      } catch {
        // Fallback to free-tier SVG Studio Render when paid key is not enabled
      }

      const dimensionsMap: Record<string, { w: number; h: number }> = {
        '1:1': { w: 800, h: 800 },
        '16:9': { w: 960, h: 540 },
        '4:3': { w: 800, h: 600 },
        '3:4': { w: 600, h: 800 },
        '9:16': { w: 540, h: 960 },
      };
      const dims = dimensionsMap[aspectRatio] || { w: 800, h: 800 };
      const svgPrompt = `Create a richly detailed, artistic, studio-grade SVG artwork (width="${dims.w}" height="${dims.h}" viewBox="0 0 ${dims.w} ${dims.h}") depicting: "${prompt.trim()}".
Use sophisticated gradients (<linearGradient>, <radialGradient>), layered geometric and organic shapes, atmospheric lighting effects, and rich colors. Return ONLY raw valid <svg xmlns="http://www.w3.org/2000/svg" ...>...</svg> code without markdown fences or explanations.`;

      let svgResponse;
      try {
        svgResponse = await ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: svgPrompt,
          config: {
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          },
        });
      } catch (svgPrimaryErr) {
        if (isQuotaExhaustedError(svgPrimaryErr)) {
          svgResponse = await ai.models.generateContent({
            model: 'gemini-3.1-flash-lite',
            contents: svgPrompt,
          });
        } else {
          throw svgPrimaryErr;
        }
      }

      const rawSvg = (svgResponse.text ?? '').trim();
      const svgMatch = rawSvg.match(/<svg[\s\S]*?<\/svg>/i);
      if (svgMatch) {
        const base64Svg = Buffer.from(svgMatch[0], 'utf-8').toString('base64');
        res.json({
          imageUrl: `data:image/svg+xml;base64,${base64Svg}`,
          caption: 'Rendered via MANBOT Free-Tier Vector Studio',
        });
        return;
      }

      res.status(500).json({
        error: 'Unable to synthesize artwork. Please try refining your prompt.',
      });
    } catch (error) {
      res.status(500).json({
        isQuotaError: isQuotaExhaustedError(error),
        error: formatApiError(error),
      });
    }
  });

  if (process.env.NODE_ENV === 'production') {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`MANBOT server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start MANBOT server:', err);
  process.exit(1);
});
