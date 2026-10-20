import { calendarFeed } from "@/server/services/calendar";

/** Public ICS subscription (Google Calendar etc.). The secret token in the URL is the only credential. */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const token = (await params).token.replace(/\.ics$/, "");
  const ics = await calendarFeed(token);
  if (!ics) return new Response("Not found", { status: 404 });
  return new Response(ics, { headers: { "content-type": "text/calendar; charset=utf-8", "cache-control": "private, max-age=900" } });
}
