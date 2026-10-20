import { readJson, route, searchParams } from "@/server/http";
import { createEmployee, listEmployees } from "@/server/services/employees";

export const GET = route(({ actor, req }) => listEmployees(actor, searchParams(req)));
export const POST = route(async ({ actor, req }) => createEmployee(actor, await readJson(req)));
