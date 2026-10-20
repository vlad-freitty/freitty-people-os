import { randomBytes } from "node:crypto";
import type { Notification, NotificationType } from "@prisma/client";
import { createTranslator } from "next-intl";
import en from "../../../messages/en.json";
import uk from "../../../messages/uk.json";
import { prisma } from "@/server/db";
import type { NotificationPayload } from "./notify";

/**
 * Telegram bot (PRD 8, phase 5): linking a chat to a user, sending notifications, reading updates.
 * The transport is injectable so the whole path can be tested without a real bot token.
 */

export const MAX_ATTEMPTS = 5;
/** How often the worker sends pending Telegram notifications — keeps delivery well under 1 minute (PRD 8). */
export const DELIVERY_INTERVAL_MS = 10_000;
const LINK_TTL_MS = 15 * 60_000;

export interface TelegramTransport {
  sendMessage(chatId: string, text: string): Promise<void>;
  getUpdates(offset: number, timeoutSeconds: number): Promise<TelegramUpdate[]>;
}

export type TelegramUpdate = { update_id: number; message?: { chat: { id: number | string }; text?: string } };

class BotApi implements TelegramTransport {
  constructor(private readonly token: string) {}

  private async call<T>(method: string, body: unknown, timeoutMs = 15_000): Promise<T> {
    const res = await fetch(`https://api.telegram.org/bot${this.token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: T; description?: string };
    if (!res.ok || !json.ok) throw new Error(`telegram ${method}: ${json.description ?? res.status}`);
    return json.result as T;
  }

  async sendMessage(chatId: string, text: string) {
    await this.call("sendMessage", { chat_id: chatId, text, disable_web_page_preview: true });
  }

  getUpdates(offset: number, timeoutSeconds: number) {
    return this.call<TelegramUpdate[]>("getUpdates", { offset, timeout: timeoutSeconds, allowed_updates: ["message"] }, (timeoutSeconds + 10) * 1000);
  }
}

let transport: TelegramTransport | null = null;

export function telegramConfigured() {
  return !!process.env.TELEGRAM_BOT_TOKEN || !!transport;
}

export function getTransport(): TelegramTransport | null {
  if (transport) return transport;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  return token ? new BotApi(token) : null;
}

/** Tests replace the Bot API with a fake. */
export function setTransport(t: TelegramTransport | null) {
  transport = t;
}

export function botUsername() {
  return process.env.TELEGRAM_BOT_USERNAME ?? null;
}

// ───────────── texts ─────────────

function translator(locale: string) {
  return createTranslator({ locale, messages: locale === "en" ? en : uk, namespace: "telegram" });
}

const appUrl = () => (process.env.APP_URL ?? process.env.AUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");

export function formatNotification(type: NotificationType, p: NotificationPayload, locale: string, timeZone: string) {
  const t = translator(locale);
  const pick = (ukText?: string | null, enText?: string | null) => (locale === "en" && enText ? enText : (ukText ?? ""));
  const due = p.dueAt
    ? new Intl.DateTimeFormat(locale === "en" ? "en-US" : "uk-UA", { dateStyle: "medium", timeStyle: "short", timeZone }).format(new Date(p.dueAt))
    : null;
  const values = {
    step: pick(p.stepUk, p.stepEn) + (p.system ? ` · ${p.system}` : ""),
    number: p.number,
    type: pick(p.typeUk, p.typeEn),
    due: due ?? "—",
    comment: p.comment ?? "",
    url: `${appUrl()}/requests/${p.requestId}`,
  };
  return t(type, values).trim();
}

// ───────────── linking ─────────────

export async function createLinkCode(userId: string) {
  const code = randomBytes(6).toString("base64url").replace(/[-_]/g, "x").slice(0, 8).toUpperCase();
  await prisma.user.update({ where: { id: userId }, data: { telegramLinkCode: code, telegramLinkExpires: new Date(Date.now() + LINK_TTL_MS) } });
  const bot = botUsername();
  return { code, deepLink: bot ? `https://t.me/${bot}?start=${code}` : null, expiresInMinutes: LINK_TTL_MS / 60_000 };
}

/** Handles one bot update: /start <code> links the chat, /stop unlinks it, anything else gets a hint. */
export async function handleUpdate(update: TelegramUpdate, t: TelegramTransport | null = getTransport()) {
  const msg = update.message;
  if (!msg?.text) return;
  const chatId = String(msg.chat.id);
  const [command, arg] = msg.text.trim().split(/\s+/, 2);
  const linked = await prisma.user.findUnique({ where: { telegramChatId: chatId }, include: { employee: { select: { locale: true } } } });
  const reply = async (key: "linked" | "unlinked" | "badCode" | "help", locale = linked?.employee?.locale ?? "uk") => {
    await t?.sendMessage(chatId, translator(locale)(key));
  };

  if (command === "/start" && arg) {
    const user = await prisma.user.findFirst({
      where: { telegramLinkCode: arg.toUpperCase(), telegramLinkExpires: { gt: new Date() }, isActive: true, deletedAt: null },
      include: { employee: { select: { locale: true } } },
    });
    if (!user) return reply("badCode");
    // one chat belongs to one user: a chat linked before is moved to the new user
    await prisma.$transaction([
      prisma.user.updateMany({ where: { telegramChatId: chatId, id: { not: user.id } }, data: { telegramChatId: null } }),
      prisma.user.update({ where: { id: user.id }, data: { telegramChatId: chatId, telegramLinkCode: null, telegramLinkExpires: null } }),
      prisma.auditLog.create({ data: { actorId: user.id, action: "telegram.link", entity: "User", entityId: user.id } }),
    ]);
    return reply("linked", user.employee?.locale ?? "uk");
  }
  if (command === "/stop" && linked) {
    await prisma.$transaction([
      prisma.user.update({ where: { id: linked.id }, data: { telegramChatId: null } }),
      prisma.auditLog.create({ data: { actorId: linked.id, action: "telegram.unlink", entity: "User", entityId: linked.id } }),
    ]);
    return reply("unlinked");
  }
  return reply("help");
}

// ───────────── delivery ─────────────

async function recipientContext(userId: string) {
  const u = await prisma.user.findUnique({ where: { id: userId }, include: { employee: { select: { locale: true, location: { select: { timezone: true } } } } } });
  return { chatId: u?.telegramChatId ?? null, locale: u?.employee?.locale ?? "uk", timeZone: u?.employee?.location?.timezone ?? "Europe/Kyiv" };
}

/** Sends pending Telegram notifications; failures are retried up to MAX_ATTEMPTS times. */
export async function deliverPending(t: TelegramTransport | null = getTransport(), limit = 100) {
  if (!t) return { sent: 0, failed: 0 };
  const pending: Notification[] = await prisma.notification.findMany({
    where: { channel: "telegram", sentAt: null, failedAt: null, attempts: { lt: MAX_ATTEMPTS } },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
  let sent = 0;
  let failed = 0;
  for (const n of pending) {
    const ctx = await recipientContext(n.recipientId);
    if (!ctx.chatId) {
      // unlinked in the meantime — nothing to deliver
      await prisma.notification.update({ where: { id: n.id }, data: { failedAt: new Date(), error: "not linked" } });
      failed++;
      continue;
    }
    try {
      await t.sendMessage(ctx.chatId, formatNotification(n.type, n.payload as NotificationPayload, ctx.locale, ctx.timeZone));
      await prisma.notification.update({ where: { id: n.id }, data: { sentAt: new Date(), attempts: { increment: 1 }, error: null } });
      sent++;
    } catch (err) {
      const attempts = n.attempts + 1;
      await prisma.notification.update({
        where: { id: n.id },
        data: { attempts, error: String(err).slice(0, 500), failedAt: attempts >= MAX_ATTEMPTS ? new Date() : null },
      });
      failed++;
    }
  }
  return { sent, failed };
}

/** Long polling for bot updates (works without a public URL). Returns the next offset. */
export async function pollUpdates(offset: number, t: TelegramTransport | null = getTransport(), timeoutSeconds = 25) {
  if (!t) return offset;
  const updates = await t.getUpdates(offset, timeoutSeconds);
  let next = offset;
  for (const u of updates) {
    try {
      await handleUpdate(u, t);
    } catch (err) {
      console.error("[telegram] update failed", err);
    }
    next = Math.max(next, u.update_id + 1);
  }
  return next;
}
