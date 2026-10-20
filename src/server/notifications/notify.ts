import type { NotificationChannel, NotificationType, Prisma } from "@prisma/client";
import type { Tx } from "@/server/db";

/**
 * Notifications (PRD 3, phase 5). Rows are written in the same transaction as the change that caused them;
 * external channels (Telegram) are delivered later by the worker, in-app ones are read in the UI.
 */

export type NotificationPayload = {
  requestId: string;
  number: string;
  typeUk: string;
  typeEn: string | null;
  stepUk?: string;
  stepEn?: string | null;
  system?: string | null;
  dueAt?: string | null;
  comment?: string | null;
};

export const NOTIFICATION_TYPES: NotificationType[] = ["step_assigned", "step_overdue", "request_done", "request_rejected"];
export const CHANNELS: NotificationChannel[] = ["in_app", "telegram"];

export type Prefs = Partial<Record<NotificationType, Partial<Record<NotificationChannel, boolean>>>>;

export function channelEnabled(prefs: unknown, type: NotificationType, channel: NotificationChannel) {
  const p = (prefs ?? {}) as Prefs;
  return p[type]?.[channel] !== false; // missing = enabled (decision 2)
}

/** Notifies the user behind an employee; people without an active user account are skipped. */
export async function notifyEmployee(tx: Tx, employeeId: string | null | undefined, type: NotificationType, payload: NotificationPayload) {
  if (!employeeId) return 0;
  const e = await tx.employee.findUnique({ where: { id: employeeId }, select: { user: true } });
  const user = e?.user;
  if (!user || !user.isActive || user.deletedAt) return 0;
  const rows: Prisma.NotificationCreateManyInput[] = [];
  if (channelEnabled(user.notificationPrefs, type, "in_app")) rows.push({ recipientId: user.id, type, payload, channel: "in_app" });
  if (user.telegramChatId && channelEnabled(user.notificationPrefs, type, "telegram")) rows.push({ recipientId: user.id, type, payload, channel: "telegram" });
  if (rows.length) await tx.notification.createMany({ data: rows });
  return rows.length;
}

/** Payload of a request (and optionally one of its steps) for the message texts. */
export async function requestPayload(tx: Tx, requestId: string, stepId?: string): Promise<NotificationPayload> {
  const r = await tx.request.findUniqueOrThrow({ where: { id: requestId }, include: { version: { include: { requestType: true } } } });
  const step = stepId ? await tx.stepInstance.findUnique({ where: { id: stepId }, include: { stepTemplate: true, system: true } }) : null;
  return {
    requestId,
    number: `REQ-${String(r.number).padStart(4, "0")}`,
    typeUk: r.version.requestType.nameUk,
    typeEn: r.version.requestType.nameEn,
    stepUk: step?.stepTemplate.nameUk,
    stepEn: step?.stepTemplate.nameEn,
    system: step?.system?.name ?? null,
    dueAt: step?.dueAt?.toISOString() ?? null,
  };
}
