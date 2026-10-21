import NextAuth, { CredentialsSignin, type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { devSignIn, passwordSignIn } from "@/server/auth/sign-in";

/** Dev login: pick a seeded user without a password. Never available in production builds. */
export const devLoginEnabled = process.env.NODE_ENV !== "production" && process.env.DEV_LOGIN === "true";

class LockedSignin extends CredentialsSignin {
  code = "locked";
}

/** Sign-in is email + password only (phase 7, Vlad): accounts are issued by an admin, Microsoft sign-in is removed. */
const providers: NextAuthConfig["providers"] = [
  Credentials({
    id: "password",
    name: "Email",
    credentials: { email: { label: "Email", type: "email" }, password: { label: "Password", type: "password" } },
    async authorize(credentials) {
      const result = await passwordSignIn(String(credentials?.email ?? ""), String(credentials?.password ?? ""));
      if (!result.ok) throw result.reason === "locked" ? new LockedSignin() : new CredentialsSignin();
      return { id: result.userId, sessionVersion: result.sessionVersion };
    },
  }),
];

if (devLoginEnabled) {
  providers.push(
    Credentials({
      id: "dev",
      name: "Dev login",
      credentials: { email: { label: "Email", type: "email" } },
      async authorize(credentials) {
        const result = await devSignIn(String(credentials?.email ?? ""));
        return result.ok ? { id: result.userId, sessionVersion: result.sessionVersion } : null;
      },
    }),
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers,
  session: { strategy: "jwt", maxAge: 60 * 60 * 12 },
  pages: { signIn: "/login", error: "/login" },
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) {
        token.userId = user.id;
        token.sv = (user as { sessionVersion?: number }).sessionVersion ?? 0;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.userId) session.user.id = token.userId as string;
      session.user.sv = typeof token.sv === "number" ? token.sv : 0;
      return session;
    },
  },
});
