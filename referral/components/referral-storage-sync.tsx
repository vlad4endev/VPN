"use client";

import { useEffect } from "react";

import {
  REFERRAL_LOCAL_KEY,
  REFERRAL_QUERY_PARAM,
} from "@/lib/constants";
import { referralCodeParamSchema } from "@/lib/referral-validation";

/**
 * Дублирует ?ref= в localStorage (куки httpOnly с сервера клиент не читает).
 */
export function ReferralStorageSync() {
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const raw = params.get(REFERRAL_QUERY_PARAM);
      if (!raw) {
        return;
      }
      const parsed = referralCodeParamSchema.safeParse(raw);
      if (parsed.success) {
        window.localStorage.setItem(REFERRAL_LOCAL_KEY, parsed.data);
      }
    } catch {
      /* ignore */
    }
  }, []);

  return null;
}
