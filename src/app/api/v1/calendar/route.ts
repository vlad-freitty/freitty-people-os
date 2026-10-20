import { route, searchParams } from "@/server/http";
import { calendarView } from "@/server/services/calendar";

/** ?from=YYYY-MM-DD&to=YYYY-MM-DD — the signed-in person's calendar */
export const GET = route(({ actor, req }) => calendarView(actor, searchParams(req)));
