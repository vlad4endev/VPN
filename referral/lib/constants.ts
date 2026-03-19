export const REFERRAL_QUERY_PARAM = "ref";

/** httpOnly-куки для Server Actions (30 дней). */
export const REFERRAL_COOKIE_NAME = "referral_code";

/** Дублирование в localStorage на клиенте (не секрет). */
export const REFERRAL_LOCAL_KEY = "referral_code_v1";

export const REFERRAL_COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 30;

export const SESSION_COOKIE_NAME = "referral_session";

export const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 7;

export const REWARD_REFERRER_CENTS = Number(
  process.env.REFERRAL_REWARD_REFERRER_CENTS ?? 500,
);

export const REWARD_REFEREE_CENTS = Number(
  process.env.REFERRAL_REWARD_REFEREE_CENTS ?? 200,
);
