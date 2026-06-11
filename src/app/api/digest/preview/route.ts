import { NextRequest } from "next/server";
import { render } from "@react-email/render";
import DigestEmail from "@/emails/Digest";
import { buildDigest, type DigestVariant } from "@/lib/digest";
import { getDeals } from "@/lib/hubspot";
import { APP_URL, unsubscribeUrl } from "@/lib/sendDigest";
import { readStore } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Browser preview of the digest email (auth-gated by the middleware). ?variant=aggregate for the redacted view. */
export async function GET(req: NextRequest) {
  const variant: DigestVariant = req.nextUrl.searchParams.get("variant") === "aggregate" ? "aggregate" : "full";
  const [{ payload }, store] = await Promise.all([getDeals(), readStore()]);
  const data = buildDigest(payload.deals, store.goals, Date.now(), variant, payload.pilotTracked, store.sdrs);
  const html = await render(
    DigestEmail({
      data,
      appUrl: APP_URL,
      unsubscribeUrl: unsubscribeUrl("preview@example.com"),
      sections: store.digest.sections,
    })
  );
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
