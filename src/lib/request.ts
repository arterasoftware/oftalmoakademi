import "server-only";
import { headers } from "next/headers";

/** İstemci IP'si: ters vekil arkasında x-forwarded-for'un ilk değeri. */
export async function getClientIp(): Promise<string | null> {
  const h = await headers();
  const xff = h.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim().slice(0, 64);
  return h.get("x-real-ip")?.slice(0, 64) ?? null;
}

export async function getUserAgent(): Promise<string | null> {
  const h = await headers();
  return h.get("user-agent");
}
