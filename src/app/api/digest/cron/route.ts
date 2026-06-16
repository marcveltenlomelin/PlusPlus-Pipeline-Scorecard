import { NextRequest, NextResponse } from "next/server";
import { isDigestDay, shouldSendNow } from "@/lib/digest";
import { sendDigest } from "@/lib/sendDigest";
import { patchStore, readStore } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * Vercel cron entry. Fires DAILY (`0 15 * * *`) and self-gates to Tuesday
 * ~8am PT here — the Hobby plan doesn't reliably honor day-of-week cron
 * expressions, so a daily trigger + an in-route day check is the robust way
 * to land exactly on Tuesday before the pipeline call. Public path in the
 * middleware but self-protected: requires the CRON_SECRET bearer Vercel
 * attaches to cron invocations. Cadence (weekly/biweekly/monthly) is enforced
 * against the store's lastSentAt, so one cron serves all three settings.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    if (!isDigestDay(Date.now())) {
      return NextResponse.json({ skipped: "not Tuesday" });
    }
    const store = await readStore();
    if (store.digest.recipients.length === 0) {
      return NextResponse.json({ skipped: "no recipients" });
    }
    if (!shouldSendNow(store.digest.cadence, store.digest.lastSentAt, Date.now())) {
      return NextResponse.json({ skipped: `cadence ${store.digest.cadence}` });
    }
    const { subject, results } = await sendDigest();
    await patchStore({ digest: { lastSentAt: Date.now() } });
    return NextResponse.json({ subject, sent: results.length, results });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Cron send failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
