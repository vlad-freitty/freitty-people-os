import type { NotificationChannel, NotificationType } from "@prisma/client";
import { z } from "zod";
import { audit } from "@/server/audit";
import type { Actor } from "@/server/authz/actor";
import { prisma } from "@/server/db";
import { CHANNELS, channelEnabled, NOTIFICATION_TYPES, notifyEmployee, requestPayload, type NotificationPayload } from "@/server/notifications/notify";
import { botUsername, createLinkCode, telegramConfigured } from "@/server/notifications/telegram";

// Every signed-in user manages only their own notifications — no extra permission needed.

export async function listNotifications(actor: Actor, raw: unknown = {}) {
  const { unread } = z.object({ unread: z.coerce.boolean().optional() }).parse(raw);
  const rows = await prisma.notification.findMany({
    where: { recipientId: actor.userId, channel: "in_app", ...(unread ? { readAt: null } : {}) },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return rows.map((n) => ({ id: n.id, type: n.type, payload: n.payload as NotificationPayload, readAt: n.readAt?.toISOString() ?? null, createdAt: n.createdAt.toISOString() }));
}

export async function unreadCount(actor: Actor) {
  return prisma.notification.count({ where: { recipientId: actor.userId, channel: "in_app", readAt: null } });
}

export async function markRead(actor: Actor, raw: unknown) {
  const { ids } = z.object({ ids: z.array(z.string().uuid()).optional() }).parse(raw ?? {});
  const r = await prisma.notification.updateMany({
    where: { recipientId: actor.userId, channel: "in_app", readAt: null, ...(ids ? { id: { in: ids } } : {}) },
    data: { readAt: new Date() },
  });
  return { marked: r.count };
}

export async function getNotificationSettings(actor: Actor) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: actor.userId } });
  return {
    telegram: { configured: telegramConfigured(), linked: !!user.telegramChatId, bot: botUsername() },
    prefs: Object.fromEntries(
      NOTIFICATION_TYPES.map((t) => [t, Object.fromEntries(CHANNELS.map((c) => [c, channelEnabled(user.notificationPrefs, t, c)])) as Record<NotificationChannel, boolean>]),
    ) as Record<NotificationType, Record<NotificationChannel, boolean>>,
  };
}

const prefsInput = z.record(z.enum(["step_assigned", "step_overdue", "request_done", "request_rejected"]), z.object({ in_app: z.boolean(), telegram: z.boolean() }).partial());

export async function setNotificationPrefs(actor: Actor, raw: unknown) {
  const prefs = prefsInput.parse(raw);
  await prisma.user.update({ where: { id: actor.userId }, data: { notificationPrefs: prefs } });
  return getNotificationSettings(actor);
}

export async function startTelegramLink(actor: Actor) {
  return createLinkCode(actor.userId);
}

export async function unlinkTelegram(actor: Actor) {
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: actor.userId }, data: { telegramChatId: null, telegramLinkCode: null, telegramLinkExpires: null } });
    await audit(tx, actor, { action: "telegram.unlink", entity: "User", entityId: actor.userId });
  });
}

/**
 * Overdue steps (decision 6): one notice per step to the assignee and to the head(s) of the request's department.
 * Run by the worker every few minutes; idempotent through StepInstance.overdueNotifiedAt.
 */
export async function notifyOverdue(now = new Date()) {
  const steps = await prisma.stepInstance.findMany({
    where: { status: "active", dueAt: { lt: now }, overdueNotifiedAt: null, request: { status: "in_progress" } },
    select: { id: true, requestId: true, assigneeId: true, request: { select: { department: { select: { heads: { select: { employeeId: true } } } } } } },
    take: 500,
  });
  let notified = 0;
  for (const s of steps) {
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.stepInstance.updateMany({ where: { id: s.id, overdueNotifiedAt: null }, data: { overdueNotifiedAt: now } });
      if (claimed.count === 0) return; // another worker got it
      const payload = await requestPayload(tx, s.requestId, s.id);
      const recipients = new Set([s.assigneeId, ...s.request.department.heads.map((h) => h.employeeId)].filter((x): x is string => !!x));
      for (const employeeId of recipients) notified += await notifyEmployee(tx, employeeId, "step_overdue", payload);
    });
  }
  return { steps: steps.length, notified };
}

export type { NotificationType };
