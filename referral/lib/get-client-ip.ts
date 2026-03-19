import { headers } from "next/headers";

export function getClientIpFromHeaders(h: Headers): string | null {
  const xff = h.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) {
      return first.slice(0, 45);
    }
  }
  const realIp = h.get("x-real-ip");
  if (realIp) {
    return realIp.trim().slice(0, 45);
  }
  return null;
}

export async function getRequestIp(): Promise<string | null> {
  const h = await headers();
  return getClientIpFromHeaders(h);
}
