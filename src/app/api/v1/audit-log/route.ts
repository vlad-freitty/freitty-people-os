import { route, searchParams } from "@/server/http";
import { listAuditLog } from "@/server/services/audit-log";

export const GET = route(({ actor, req }) => listAuditLog(actor, searchParams(req)));
