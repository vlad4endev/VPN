import { z } from "zod";

import {
  REWARD_REFEREE_CENTS,
  REWARD_REFERRER_CENTS,
} from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { referralCodeParamSchema } from "@/lib/referral-validation";

const processReferralInputSchema = z.object({
  newUserId: z.string().min(1),
  rawReferralCode: z.string().nullable().optional(),
  signupIp: z.string().max(45).nullable().optional(),
  deviceFingerprintHash: z.string().max(128).nullable().optional(),
});

export type ProcessReferralInput = z.input<typeof processReferralInputSchema>;

export type ProcessReferralResult =
  | { ok: true; reason: "no_attribution" }
  | { ok: true; reason: "linked"; recordId: string }
  | { ok: false; reason: "invalid_code" }
  | { ok: false; reason: "fraud"; recordId: string }
  | { ok: false; reason: "error"; message: string };

function normalizeCode(raw: string | null | undefined): string | null {
  if (raw == null || !String(raw).trim()) {
    return null;
  }
  const parsed = referralCodeParamSchema.safeParse(String(raw));
  if (!parsed.success) {
    return null;
  }
  return parsed.data;
}

function isFraud(params: {
  referrerId: string;
  refereeId: string;
  referrerEmail: string;
  refereeEmail: string;
  signupIp: string | null;
  referrerIp: string | null;
  refereeFingerprint: string | null;
  referrerFingerprint: string | null;
}): boolean {
  if (params.referrerId === params.refereeId) {
    return true;
  }
  if (
    params.referrerEmail.toLowerCase() === params.refereeEmail.toLowerCase()
  ) {
    return true;
  }
  if (
    params.signupIp &&
    params.referrerIp &&
    params.signupIp === params.referrerIp
  ) {
    return true;
  }
  if (
    params.refereeFingerprint &&
    params.referrerFingerprint &&
    params.refereeFingerprint === params.referrerFingerprint
  ) {
    return true;
  }
  return false;
}

/**
 * Связывает нового пользователя с реферером по коду из куки,
 * создаёт записи начислений Win–Win (оба в PENDING) или помечает FRAUD.
 */
export async function processReferral(
  rawInput: ProcessReferralInput,
): Promise<ProcessReferralResult> {
  const parsed = processReferralInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      reason: "error",
      message: parsed.error.issues.map((i) => i.message).join("; "),
    };
  }

  const { newUserId, rawReferralCode, signupIp, deviceFingerprintHash } =
    parsed.data;

  const code = normalizeCode(rawReferralCode ?? null);
  if (!code) {
    return { ok: true, reason: "no_attribution" };
  }

  const referrer = await prisma.user.findUnique({
    where: { referralCode: code },
  });
  if (!referrer) {
    return { ok: false, reason: "invalid_code" };
  }

  const referee = await prisma.user.findUnique({ where: { id: newUserId } });
  if (!referee) {
    return { ok: false, reason: "error", message: "user_not_found" };
  }

  const ip = signupIp ?? referee.registrationIp ?? null;
  const fp =
    deviceFingerprintHash ?? referee.deviceFingerprintHash ?? null;

  const fraud = isFraud({
    referrerId: referrer.id,
    refereeId: referee.id,
    referrerEmail: referrer.email,
    refereeEmail: referee.email,
    signupIp: ip,
    referrerIp: referrer.registrationIp ?? null,
    refereeFingerprint: fp,
    referrerFingerprint: referrer.deviceFingerprintHash ?? null,
  });

  if (fraud) {
    const record = await prisma.referralRecord.create({
      data: {
        referrerId: referrer.id,
        refereeId: referee.id,
        status: "FRAUD",
        refereeSignupIp: ip,
        refereeFingerprintHash: fp,
      },
    });
    return { ok: false, reason: "fraud", recordId: record.id };
  }

  try {
    const record = await prisma.$transaction(async (tx) => {
      const created = await tx.referralRecord.create({
        data: {
          referrerId: referrer.id,
          refereeId: referee.id,
          status: "PENDING",
          refereeSignupIp: ip,
          refereeFingerprintHash: fp,
        },
      });

      await tx.user.update({
        where: { id: referee.id },
        data: { referredById: referrer.id },
      });

      await tx.referralReward.createMany({
        data: [
          {
            userId: referrer.id,
            referralRecordId: created.id,
            amountCents: REWARD_REFERRER_CENTS,
            kind: "REFERRER",
          },
          {
            userId: referee.id,
            referralRecordId: created.id,
            amountCents: REWARD_REFEREE_CENTS,
            kind: "REFEREE",
          },
        ],
      });

      return created;
    });

    return { ok: true, reason: "linked", recordId: record.id };
  } catch (e) {
    const message = e instanceof Error ? e.message : "transaction_failed";
    return { ok: false, reason: "error", message };
  }
}
