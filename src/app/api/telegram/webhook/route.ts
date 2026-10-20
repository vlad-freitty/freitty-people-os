import { timingSafeEqual } from "node:crypto";
import { handleUpdate, type TelegramUpdate } from "@/server/notifications/telegram";

/**
 * Optional webhook for the bot (instead of the worker's long polling). Telegram sends the secret configured with
 * setWebhook in the X-Telegram-Bot-Api-Secret-Token header; requests without it are rejected.
 */
export async function POST(req: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const given = req.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (!secret || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) {
    return new Response("forbidden", { status: 403 });
  }
  const update = (await req.json().catch(() => null)) as TelegramUpdate | null;
  if (update) await handleUpdate(update);
  return new Response("ok");
}
