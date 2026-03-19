"use server";

import { cookies, headers } from "next/headers";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";

import { REFERRAL_COOKIE_NAME } from "@/lib/constants";
import { getClientIpFromHeaders } from "@/lib/get-client-ip";
import { prisma } from "@/lib/prisma";
import { generateUniqueReferralCode } from "@/lib/referral-code";
import { createSession } from "@/lib/session";
import { registerSchema } from "@/schemas/auth";
import { processReferral } from "@/services/referral/processReferral";

export type RegisterState =
  | { ok: true }
  | { ok: false; message: string };

export async function registerAction(
  _prev: RegisterState | undefined,
  formData: FormData,
): Promise<RegisterState> {
  const raw = {
    email: formData.get("email"),
    name: formData.get("name"),
    password: formData.get("password"),
    deviceFingerprint: formData.get("deviceFingerprint"),
  };

  const parsed = registerSchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((e) => e.message).join("; ");
    return { ok: false, message: msg };
  }

  const { email, name, password, deviceFingerprint } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return {
      ok: false,
      message: "Пользователь с таким email уже зарегистрирован",
    };
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const referralCode = await generateUniqueReferralCode(prisma);
  const h = await headers();
  const registrationIp = getClientIpFromHeaders(h);
  const fingerprintHash = deviceFingerprint ?? null;

  const user = await prisma.user.create({
    data: {
      email,
      name: name?.trim() || null,
      passwordHash,
      referralCode,
      registrationIp,
      deviceFingerprintHash: fingerprintHash,
    },
  });

  const cookieStore = await cookies();
  const refFromCookie = cookieStore.get(REFERRAL_COOKIE_NAME)?.value ?? null;

  await processReferral({
    newUserId: user.id,
    rawReferralCode: refFromCookie,
    signupIp: registrationIp,
    deviceFingerprintHash: fingerprintHash,
  });

  cookieStore.delete(REFERRAL_COOKIE_NAME);

  await createSession(user.id);
  redirect("/dashboard");
}
