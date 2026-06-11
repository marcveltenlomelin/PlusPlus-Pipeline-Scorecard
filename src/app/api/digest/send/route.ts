import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { deliveryStatus, sendDigest } from "@/lib/sendDigest";
import { patchStore } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * Manual/test send (auth-gated by the middleware). POST {test?: boolean, to?: string}.
 * Test mode sends one email — to `to` if given, else the signed-in user.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { test?: boolean; to?: string };
  try {
    let recipients: string[] | undefined;
    if (body.test) {
      const session = await auth().catch(() => null);
      const target = body.to ?? session?.user?.email;
      if (!target) return NextResponse.json({ error: "No test recipient" }, { status: 400 });
      recipients = [target];
    }
    const { subject, results } = await sendDigest(recipients);
    if (!body.test) await patchStore({ digest: { lastSentAt: Date.now() } });
    // best-effort delivery confirmation for the first send
    const status = results[0]?.id ? await deliveryStatus(results[0].id) : null;
    return NextResponse.json({ subject, results, status });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Send failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
