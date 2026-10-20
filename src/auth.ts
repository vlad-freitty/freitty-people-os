import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import { resolveSignIn } from "@/server/auth/sign-in";

/** Dev login: pick a seeded user without a password. Never available in production builds. */
export const devLoginEnabled = process.env.NODE_ENV !== "production" && process.env.DEV_LOGIN === "true";
export const entraEnabled = !!process.env.AUTH_MICROSOFT_ENTRA_ID_ID;

const providers: NextAuthConfig["providers"] = [];

if (entraEnabled) {
  providers.push(
    MicrosoftEntraID({
      clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID,
      clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
      // single-tenant issuer: https://login.microsoftonline.com/<tenant-id>/v2.0 — only corporate accounts
      issuer: process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER,
    }),
  );
}

if (devLoginEnabled) {
  providers.push(
    Credentials({
      id: "dev",
      name: "Dev login",
      credentials: { email: { label: "Email", type: "email" } },
      async authorize(credentials) {
        const email = String(credentials?.email ?? "");
        const result = await resolveSignIn({ email, provider: "dev" });
        return result.ok ? { id: result.userId, email } : null;
      },
    }),
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers,
  session: { strategy: "jwt", maxAge: 60 * 60 * 12 },
  pages: { signIn: "/login", error: "/login" },
  callbacks: {
    async signIn({ account, profile, user }) {
      if (account?.provider !== "microsoft-entra-id") return true; // credentials already checked in authorize()
      const p = profile as { email?: string; preferred_username?: string; oid?: string; sub?: string } | undefined;
      const email = p?.email ?? p?.preferred_username ?? user.email ?? "";
      const result = await resolveSignIn({ email, provider: "entra", entraOid: p?.oid ?? p?.sub });
      if (!result.ok) return `/login?error=${result.reason}`;
      return true;
    },
    async jwt({ token, user, account, profile }) {
      if (account?.provider === "microsoft-entra-id") {
        // the provider's user.id is the Entra subject; map it to our User (created/linked in signIn above)
        const p = profile as { email?: string; preferred_username?: string; oid?: string; sub?: string } | undefined;
        const result = await resolveSignIn({
          email: p?.email ?? p?.preferred_username ?? user?.email ?? "",
          provider: "entra",
          entraOid: p?.oid ?? p?.sub,
        });
        if (result.ok) token.userId = result.userId;
      } else if (user?.id) {
        token.userId = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.userId) session.user.id = token.userId as string;
      return session;
    },
  },
});
