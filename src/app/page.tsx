import { auth } from "@/auth";
import Dashboard from "@/components/Dashboard";
import { ADMIN_EMAILS } from "@/lib/config";

export default async function Home() {
  // auth() throws MissingSecret when AUTH_SECRET is absent (tokenless local
  // dev after the env reset) — skip it there; the dev fallback supplies the author.
  const session = process.env.AUTH_SECRET ? await auth() : null;
  // same double-gate as the middleware's dev bypass (annotations need an author)
  const devFallback =
    process.env.DEV_NO_AUTH === "1" && process.env.NODE_ENV === "development" ? "dev@plusplus.co" : null;
  const userEmail = session?.user?.email ?? devFallback;
  return <Dashboard userEmail={userEmail} isAdmin={userEmail !== null && ADMIN_EMAILS.includes(userEmail)} />;
}
