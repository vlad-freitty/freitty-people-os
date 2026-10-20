import { route } from "@/server/http";
import { startTelegramLink, unlinkTelegram } from "@/server/services/notifications";

/** One-time code + deep link to the bot (valid 15 minutes). */
export const POST = route(({ actor }) => startTelegramLink(actor));
export const DELETE = route(({ actor }) => unlinkTelegram(actor));
