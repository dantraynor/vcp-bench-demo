import { createHmac } from "node:crypto";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { AppError, errorResponse } from "./errors";

const rateLimitKey = "bench-adoption-demo";
const localHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function checkOrigin(request: Request) {
  const origin = request.headers.get("origin");
  let requestUrl: URL;
  let originUrl: URL | undefined;
  try {
    requestUrl = new URL(request.url);
    if (origin) originUrl = new URL(origin);
  } catch {
    throw new AppError(403, "This request must come from the application.");
  }
  const sameHost =
    originUrl !== undefined &&
    originUrl.protocol === requestUrl.protocol &&
    originUrl.port === requestUrl.port &&
    (originUrl.hostname === requestUrl.hostname ||
      (localHosts.has(originUrl.hostname) &&
        localHosts.has(requestUrl.hostname)));
  if (!sameHost)
    throw new AppError(403, "This request must come from the application.");
}
export async function readJson(request: Request) {
  if (!request.headers.get("content-type")?.includes("application/json"))
    throw new AppError(415, "Send JSON data.");
  const text = await request.text();
  if (text.length > 16_384)
    throw new AppError(413, "The request is too large.");
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new AppError(400, "The request contains invalid JSON.");
  }
}
export async function limitGuest(request: Request) {
  // Cloudflare sets `cf` and overwrites CF-Connecting-IP. A local request has neither,
  // so forwarded headers cannot choose the rate-limit key.
  const address =
    "cf" in request
      ? (request.headers.get("cf-connecting-ip")?.trim() ?? "unknown")
      : "loopback";
  const key = createHmac("sha256", rateLimitKey).update(address).digest("hex");
  const result = await getDb().execute<{ count: number }>(sql`
    INSERT INTO submission_limit (key, count, resets_at) VALUES (${key}, 1, now() + interval '10 minutes')
    ON CONFLICT (key) DO UPDATE SET count = CASE WHEN submission_limit.resets_at <= now() THEN 1 ELSE submission_limit.count + 1 END,
    resets_at = CASE WHEN submission_limit.resets_at <= now() THEN now() + interval '10 minutes' ELSE submission_limit.resets_at END
    RETURNING count`);
  if (result.rows[0].count > 20)
    throw new AppError(
      429,
      "Too many adoption attempts. Please try again in ten minutes.",
    );
}
export function route(handler: () => Promise<Response>): Promise<Response> {
  return handler().catch(errorResponse);
}
export const noStore = { "Cache-Control": "private, no-store" };
export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: noStore });
}
