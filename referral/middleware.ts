import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  REFERRAL_COOKIE_MAX_AGE_SEC,
  REFERRAL_COOKIE_NAME,
  REFERRAL_QUERY_PARAM,
} from "@/lib/constants";
import { referralCodeParamSchema } from "@/lib/referral-validation";

export function middleware(request: NextRequest) {
  const ref = request.nextUrl.searchParams.get(REFERRAL_QUERY_PARAM);
  if (!ref) {
    return NextResponse.next();
  }

  const parsed = referralCodeParamSchema.safeParse(ref);
  if (!parsed.success) {
    return NextResponse.next();
  }

  const res = NextResponse.next();
  res.cookies.set(REFERRAL_COOKIE_NAME, parsed.data, {
    maxAge: REFERRAL_COOKIE_MAX_AGE_SEC,
    path: "/",
    sameSite: "lax",
    httpOnly: true,
  });
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
