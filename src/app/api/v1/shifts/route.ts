import { readJson, route, searchParams } from "@/server/http";
import { createShift, listShifts } from "@/server/services/shifts";

/** ?from&to (YYYY-MM-DD) [&departmentId&employeeId&status] */
export const GET = route(({ actor, req }) => listShifts(actor, searchParams(req)));
/** Body {employeeId, start, end ("YYYY-MM-DD HH:mm" local), shiftType?, departmentId?, companyId?, timezone?} */
export const POST = route(async ({ actor, req }) => createShift(actor, await readJson(req)));
