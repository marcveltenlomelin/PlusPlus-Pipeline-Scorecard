import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

const ALLOWED_DOMAIN = "plusplus.co";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      // `hd` only hints Google's account picker — enforcement is the
      // signIn callback below, which checks the verified token claims.
      authorization: { params: { hd: ALLOWED_DOMAIN, prompt: "select_account" } },
    }),
  ],
  pages: { signIn: "/signin", error: "/signin" },
  callbacks: {
    signIn({ profile }) {
      return (
        profile?.email_verified === true &&
        // hd is only present on Google Workspace accounts of that domain,
        // so a personal Gmail spoofing the address can never pass.
        profile.hd === ALLOWED_DOMAIN &&
        typeof profile.email === "string" &&
        profile.email.toLowerCase().endsWith(`@${ALLOWED_DOMAIN}`)
      );
    },
  },
});
