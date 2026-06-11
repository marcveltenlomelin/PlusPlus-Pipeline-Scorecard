import { NextRequest } from "next/server";
import { unsubscribeToken } from "@/lib/sendDigest";
import { patchStore, readStore } from "@/lib/store";

export const dynamic = "force-dynamic";

const page = (title: string, body: string) => `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>body{font-family:'Helvetica Neue',Arial,sans-serif;background:#edece7;color:#1d2025;display:grid;place-items:center;min-height:100vh;margin:0}
main{background:#f7f6f2;border:1px solid #e4e2db;padding:32px 36px;max-width:26rem;text-align:center}
h1{font-size:18px;margin:0 0 8px}p{font-size:14px;color:#5b6068;margin:0}</style></head>
<body><main><h1>${title}</h1><p>${body}</p></main></body></html>`;

/**
 * One-click unsubscribe (public path in the middleware). The HMAC token is
 * derived from the address + AUTH_SECRET, so a link can only remove the
 * address it was minted for — no enumeration, no CSRF surface worth naming.
 */
export async function GET(req: NextRequest) {
  const email = (req.nextUrl.searchParams.get("email") ?? "").trim().toLowerCase();
  const token = req.nextUrl.searchParams.get("token") ?? "";
  if (!email || token !== unsubscribeToken(email)) {
    return new Response(page("Invalid link", "This unsubscribe link is missing or malformed."), {
      status: 400,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }
  const store = await readStore();
  await patchStore({ digest: { recipients: store.digest.recipients.filter((r) => r !== email) } });
  return new Response(
    page("Unsubscribed", `${email} will no longer receive the pipeline digest.`),
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}
