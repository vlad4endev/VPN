import { z } from "zod";

export const referralCodeLengthSchema = z.number().int().min(6).max(8);

export const generateReferralCodeOptionsSchema = z.object({
  length: referralCodeLengthSchema.default(8),
});

export type GenerateReferralCodeOptions = z.output<
  typeof generateReferralCodeOptionsSchema
>;

/** Параметр ?ref= или значение куки (без node:crypto — можно импортировать в middleware Edge). */
export const referralCodeParamSchema = z
  .string()
  .transform((s) => s.trim().toUpperCase())
  .pipe(
    z
      .string()
      .min(6)
      .max(16)
      .regex(/^[A-Z0-9]+$/, "Код только из A-Z и 0-9"),
  );

export function parseReferralCodeFromQuery(raw: unknown): string {
  return referralCodeParamSchema.parse(
    typeof raw === "string" ? raw : String(raw ?? ""),
  );
}
