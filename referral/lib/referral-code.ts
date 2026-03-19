import { randomInt } from "node:crypto";

import type { PrismaClient } from "@prisma/client";
import { z } from "zod";

import { generateReferralCodeOptionsSchema } from "@/lib/referral-validation";

export {
  generateReferralCodeOptionsSchema,
  parseReferralCodeFromQuery,
  referralCodeParamSchema,
  referralCodeLengthSchema,
} from "@/lib/referral-validation";

export type { GenerateReferralCodeOptions } from "@/lib/referral-validation";

/** Символы: верхний регистр латиницы + цифры. */
export const REFERRAL_CODE_CHARSET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789" as const;

/**
 * Генерирует один код заданной длины (криптостойкий RNG).
 */
export function generateReferralCode(
  options?: Partial<z.input<typeof generateReferralCodeOptionsSchema>>,
): string {
  const { length } = generateReferralCodeOptionsSchema.parse({
    length: options?.length ?? 8,
  });
  const charset = REFERRAL_CODE_CHARSET;
  let out = "";
  for (let i = 0; i < length; i++) {
    out += charset[randomInt(0, charset.length)];
  }
  return out;
}

const defaultMaxAttempts = 16;

export async function generateUniqueReferralCode(
  prisma: PrismaClient,
  options?: Partial<z.input<typeof generateReferralCodeOptionsSchema>>,
  maxAttempts: number = defaultMaxAttempts,
): Promise<string> {
  if (maxAttempts < 1 || !Number.isFinite(maxAttempts)) {
    throw new Error("maxAttempts must be a positive finite number");
  }
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const code = generateReferralCode(options);
    const clash = await prisma.user.findUnique({
      where: { referralCode: code },
      select: { id: true },
    });
    if (!clash) {
      return code;
    }
  }
  throw new ReferralCodeAllocationError(maxAttempts);
}

export class ReferralCodeAllocationError extends Error {
  readonly maxAttempts: number;

  constructor(maxAttempts: number) {
    super(
      `Не удалось выделить уникальный referral-код за ${maxAttempts} попыток`,
    );
    this.name = "ReferralCodeAllocationError";
    this.maxAttempts = maxAttempts;
  }
}
