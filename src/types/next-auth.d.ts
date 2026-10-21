import "next-auth";

declare module "next-auth" {
  interface Session {
    /** sv: the user's sessionVersion when the token was issued — a reset password or deactivation ends the session */
    user: { id: string; sv: number; email?: string | null; name?: string | null; image?: string | null };
  }
}
