import { prisma } from "@/server/db";
import { verifyPassword } from "./password";

export type SignInResult = { ok: true; userId: string; sessionVersion: number } | { ok: false; reason: "invalid" | "locked" };

export const MAX_FAILED_ATTEMPTS = 5;
export const LOCK_MINUTES = 15;

/**
 * Email + password sign-in (phase 7). Accounts are issued only by an admin (users.manage) or the
 * `npm run admin:create` command — there is no self-registration. Five wrong passwords in a row lock the account for
 * 15 minutes. The caller never learns whether the email exists: unknown email, wrong password and an inactive account
 * look the same ("invalid").
 */
export async function passwordSignIn(rawEmail: string, password: string, now = new Date()): Promise<SignInResult> {
  const email = rawEmail.trim().toLowerCase();
  const user = email ? await prisma.user.findFirst({ where: { email, deletedAt: null } }) : null;
  if (user?.lockedUntil && user.lockedUntil > now) return { ok: false, reason: "locked" };

  const valid = await verifyPassword(password, user?.passwordHash);
  if (!user || !user.isActive || !valid) {
    if (user && user.isActive) {
      const failed = user.failedLoginCount + 1;
      const lock = failed >= MAX_FAILED_ATTEMPTS;
      await prisma.user.update({
        where: { id: user.id },
        data: { failedLoginCount: lock ? 0 : failed, lockedUntil: lock ? new Date(now.getTime() + LOCK_MINUTES * 60_000) : null },
      });
      if (lock) return { ok: false, reason: "locked" };
    }
    return { ok: false, reason: "invalid" };
  }

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: now, failedLoginCount: 0, lockedUntil: null } });
  return { ok: true, userId: user.id, sessionVersion: user.sessionVersion };
}

/** Dev login (local only): an existing active user, no password. */
export async function devSignIn(rawEmail: string): Promise<SignInResult> {
  const email = rawEmail.trim().toLowerCase();
  const user = await prisma.user.findFirst({ where: { email, deletedAt: null, isActive: true } });
  if (!user) return { ok: false, reason: "invalid" };
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  return { ok: true, userId: user.id, sessionVersion: user.sessionVersion };
}
