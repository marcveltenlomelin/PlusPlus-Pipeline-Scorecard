import { createHmac } from "crypto";
import { render } from "@react-email/render";
import { Resend } from "resend";
import DigestEmail from "@/emails/Digest";
import { buildDigest, type DigestVariant } from "./digest";
import { getDeals } from "./hubspot";
import { readStore } from "./store";

/**
 * Server-only digest delivery. Builds per-recipient variants (full for
 * @plusplus.co, aggregate elsewhere), renders the React Email template, and
 * sends via Resend. The unsubscribe link is HMAC-signed with AUTH_SECRET so a
 * link can only unsubscribe its own address.
 */

export const APP_URL = "https://plus-plus-pipeline-scorecard.vercel.app";
const FROM = process.env.DIGEST_FROM ?? "PlusPlus Pipeline <onboarding@resend.dev>";

export function unsubscribeToken(email: string): string {
  const secret = process.env.AUTH_SECRET ?? "";
  return createHmac("sha256", secret).update(email.trim().toLowerCase()).digest("hex").slice(0, 32);
}

export function unsubscribeUrl(email: string): string {
  const e = encodeURIComponent(email.trim().toLowerCase());
  return `${APP_URL}/api/digest/unsubscribe?email=${e}&token=${unsubscribeToken(email)}`;
}

export function variantFor(email: string): DigestVariant {
  return email.trim().toLowerCase().endsWith("@plusplus.co") ? "full" : "aggregate";
}

export interface SendResult {
  to: string;
  id: string | null;
  error: string | null;
}

/** Send the digest to `recipients` (or all configured ones). Returns Resend ids per recipient. */
export async function sendDigest(recipients?: string[]): Promise<{ subject: string; results: SendResult[] }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is not set — create a Resend account and add the key");
  const resend = new Resend(apiKey);

  const [{ payload }, store] = await Promise.all([getDeals(), readStore()]);
  const to = recipients ?? store.digest.recipients;
  if (to.length === 0) throw new Error("No digest recipients configured");
  const now = Date.now();

  let subject = "";
  const results: SendResult[] = [];
  for (const email of to) {
    const data = buildDigest(payload.deals, store.goals, now, variantFor(email), payload.pilotTracked, store.sdrs);
    subject = data.subject;
    const html = await render(
      DigestEmail({ data, appUrl: APP_URL, unsubscribeUrl: unsubscribeUrl(email), sections: store.digest.sections })
    );
    const res = await resend.emails.send({ from: FROM, to: email, subject: data.subject, html });
    results.push({ to: email, id: res.data?.id ?? null, error: res.error?.message ?? null });
  }
  return { subject, results };
}

/** Poll Resend for a sent email's latest delivery event (test-send confirmation). */
export async function deliveryStatus(id: string): Promise<string> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return "unknown";
  const res = await fetch(`https://api.resend.com/emails/${id}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    cache: "no-store",
  });
  if (!res.ok) return `lookup failed (${res.status})`;
  const json = (await res.json()) as { last_event?: string };
  return json.last_event ?? "unknown";
}
